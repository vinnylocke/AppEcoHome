import React, { useState } from "react";
import { Mic, MicOff, Loader2 } from "lucide-react";
import { useVoiceCapture, type VoiceCaptureResult } from "../../hooks/useVoiceCapture";
import toast from "react-hot-toast";

interface Props {
  disabled?: boolean;
  /** Called when the recording stops with a successful blob. */
  onRecorded: (result: VoiceCaptureResult) => void;
  /** Compact / icon-only — used inside the chat input bar. */
  size?: "sm" | "md";
}

// ─── MicButton ─────────────────────────────────────────────────────────
//
// Tap to start recording, tap to stop. Auto-stops at 30s. Shows a soft
// pulse while recording. Designed for the Garden AI chat input bar but
// reusable elsewhere.

export default function MicButton({ disabled, onRecorded, size = "md" }: Props) {
  const { state, error, start, stop, cancel } = useVoiceCapture({ maxDurationMs: 30_000 });
  const [busy, setBusy] = useState(false);

  React.useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  const isUnsupported = state === "unsupported";
  const isRecording = state === "recording";
  const isStopping = state === "stopping" || busy;

  const handleClick = async () => {
    if (disabled || busy) return;
    if (isUnsupported) {
      toast.error("Voice capture isn't supported on this device.");
      return;
    }
    if (isRecording) {
      setBusy(true);
      try {
        const result = await stop();
        if (result) onRecorded(result);
      } finally {
        setBusy(false);
      }
      return;
    }
    await start();
  };

  const sizeClasses = size === "sm"
    ? "w-9 h-9 min-h-[36px] min-w-[36px]"
    : "w-10 h-10 min-h-[40px] min-w-[40px]";
  const iconSize = size === "sm" ? 16 : 18;

  return (
    <button
      type="button"
      data-testid="chat-mic-button"
      onClick={handleClick}
      disabled={disabled || isUnsupported}
      aria-label={isRecording ? "Stop recording" : "Hold to talk to Garden AI"}
      aria-pressed={isRecording}
      className={`${sizeClasses} shrink-0 inline-flex items-center justify-center rounded-full transition-all ${
        isRecording
          ? "bg-rose-500 text-white ring-4 ring-rose-500/30 animate-pulse"
          : isUnsupported
            ? "bg-rhozly-surface-low text-rhozly-on-surface/30 cursor-not-allowed"
            : "bg-rhozly-surface-low text-rhozly-on-surface/70 hover:bg-rhozly-primary/10 hover:text-rhozly-primary"
      } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
    >
      {isStopping
        ? <Loader2 size={iconSize} className="animate-spin" />
        : isUnsupported
          ? <MicOff size={iconSize} />
          : <Mic size={iconSize} />}
    </button>
  );
}

export { type VoiceCaptureResult };
