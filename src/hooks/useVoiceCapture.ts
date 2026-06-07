import { useCallback, useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";

// ─── useVoiceCapture ───────────────────────────────────────────────────
//
// Records short audio clips via the MediaRecorder API and returns the
// captured blob as base64 + mimeType. The chat send path attaches this
// to the agent-chat edge function call, where Gemini transcribes +
// reasons in one round-trip — no separate STT step needed.
//
// Wave 22.0001-A. Browser MediaRecorder is available in every major
// browser; iOS Safari requires PWA install + an explicit user gesture
// to record. On Capacitor (iOS/Android wrapper) the same WebView path
// works fine.
//
// State machine:
//   idle → recording → stopping → idle  (success)
//          recording → idle              (cancel)
//          idle → denied                 (no mic permission)

export type VoiceCaptureState = "idle" | "recording" | "stopping" | "denied" | "unsupported";

export interface VoiceCaptureResult {
  base64: string;
  mimeType: string;
  durationMs: number;
}

export interface UseVoiceCaptureOpts {
  /** Stop automatically after N ms. Default 30000. */
  maxDurationMs?: number;
}

const MIME_PREFERENCE = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/aac",
];

function pickMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const m of MIME_PREFERENCE) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch { /* ignore */ }
  }
  return null;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("FileReader did not return a string"));
        return;
      }
      const idx = result.indexOf(",");
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
    reader.readAsDataURL(blob);
  });
}

export function useVoiceCapture(opts: UseVoiceCaptureOpts = {}) {
  const { maxDurationMs = 30_000 } = opts;
  const [state, setState] = useState<VoiceCaptureState>("idle");
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startedAtRef = useRef<number>(0);
  const autoStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resolverRef = useRef<((r: VoiceCaptureResult | null) => void) | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setState("unsupported");
    } else if (!pickMimeType()) {
      setState("unsupported");
    }
    return () => {
      // Cleanup any lingering recorder on unmount.
      try { recorderRef.current?.stop(); } catch { /* ignore */ }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (autoStopTimerRef.current) clearTimeout(autoStopTimerRef.current);
    };
  }, []);

  const start = useCallback(async (): Promise<boolean> => {
    if (state === "recording" || state === "stopping") return false;
    setError(null);
    const mime = pickMimeType();
    if (!mime) {
      setState("unsupported");
      setError("Voice capture isn't supported on this device.");
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        const tracks = streamRef.current?.getTracks() ?? [];
        tracks.forEach((t) => t.stop());
        streamRef.current = null;
        const blob = new Blob(chunksRef.current, { type: mime });
        chunksRef.current = [];
        try {
          const base64 = await blobToBase64(blob);
          const durationMs = Date.now() - startedAtRef.current;
          const resolver = resolverRef.current;
          resolverRef.current = null;
          setState("idle");
          resolver?.({ base64, mimeType: mime, durationMs });
        } catch (err: any) {
          setError(err?.message ?? "Failed to read recording");
          setState("idle");
          resolverRef.current?.(null);
          resolverRef.current = null;
        }
      };
      recorder.onerror = () => {
        setError("Recording error");
        setState("idle");
        resolverRef.current?.(null);
        resolverRef.current = null;
      };
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      recorder.start();
      setState("recording");
      autoStopTimerRef.current = setTimeout(() => {
        if (recorderRef.current?.state === "recording") {
          recorderRef.current.stop();
          setState("stopping");
        }
      }, maxDurationMs);
      return true;
    } catch (err: any) {
      const denied = err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError";
      setState(denied ? "denied" : "idle");
      setError(denied
        ? Capacitor.isNativePlatform()
          ? "Microphone permission denied. Enable it in your device settings."
          : "Microphone permission denied. Allow access in your browser to talk to Garden AI."
        : err?.message ?? "Couldn't start recording");
      return false;
    }
  }, [maxDurationMs, state]);

  const stop = useCallback((): Promise<VoiceCaptureResult | null> => {
    return new Promise((resolve) => {
      if (autoStopTimerRef.current) {
        clearTimeout(autoStopTimerRef.current);
        autoStopTimerRef.current = null;
      }
      if (!recorderRef.current || recorderRef.current.state !== "recording") {
        resolve(null);
        return;
      }
      resolverRef.current = resolve;
      setState("stopping");
      recorderRef.current.stop();
    });
  }, []);

  const cancel = useCallback(() => {
    if (autoStopTimerRef.current) {
      clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
    try { recorderRef.current?.stop(); } catch { /* ignore */ }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    chunksRef.current = [];
    resolverRef.current?.(null);
    resolverRef.current = null;
    setState("idle");
  }, []);

  return { state, error, start, stop, cancel };
}
