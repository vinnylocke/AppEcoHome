import { useCallback, useEffect, useRef, useState } from "react";
import { TextToSpeech } from "@capacitor-community/text-to-speech";
import { Capacitor } from "@capacitor/core";
import { supabase } from "../lib/supabase";
import { Logger } from "../lib/errorHandler";

// ─── useTextToSpeech ───────────────────────────────────────────────────
//
// Plays assistant chat text as speech. Calls the `tts-speak` edge fn
// (Google Cloud Text-to-Speech via service-role) which returns a cached
// MP3 URL. On any failure (no API key, network, quota) it falls back to
// the browser's free SpeechSynthesis so the user still gets audio.
//
// One playback at a time, app-wide. Calling `speak()` while something
// is playing stops the previous clip first.

export type TtsState = "idle" | "loading" | "playing" | "error";

const audioRefSymbol = Symbol("rhozly_tts_audio_singleton");

interface GlobalSingleton {
  audio: HTMLAudioElement | null;
  currentKey: string | null;
}

function getSingleton(): GlobalSingleton {
  // Re-use one audio element across components so a Speak click on one
  // bubble interrupts another. SSR-safe (returns object even in node).
  const w = typeof window !== "undefined" ? (window as any) : ({} as any);
  if (!w[audioRefSymbol]) {
    w[audioRefSymbol] = { audio: null, currentKey: null };
  }
  return w[audioRefSymbol] as GlobalSingleton;
}

function browserSpeak(text: string, onEnd: () => void, onError: (e: unknown) => void) {
  try {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      onError(new Error("Speech synthesis unavailable"));
      return;
    }
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1.0;
    utter.pitch = 1.0;
    // Prefer an en-GB voice when available so it matches the cloud
    // default. Browsers expose voices async; just pick on the spot.
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find((v) => v.lang === "en-GB" || v.lang.startsWith("en-GB"))
      ?? voices.find((v) => v.lang.startsWith("en"))
      ?? null;
    if (preferred) utter.voice = preferred;
    utter.onend = onEnd;
    utter.onerror = onError;
    window.speechSynthesis.speak(utter);
  } catch (err) {
    onError(err);
  }
}

// Device-native TTS — the fallback when cloud TTS is off/unavailable. Uses the
// Capacitor community plugin, which speaks through the OS engine on Android/iOS
// (so it works INSIDE the WebView, unlike the Web Speech API, which is silent in
// the Android System WebView) and wraps speechSynthesis on web. Free — no
// per-character cost. Falls back to raw speechSynthesis only when the plugin
// isn't present (e.g. an APK built before it was added).
async function deviceSpeak(text: string, onEnd: () => void, onError: (e: unknown) => void) {
  if (!Capacitor.isPluginAvailable("TextToSpeech")) {
    browserSpeak(text, onEnd, onError);
    return;
  }
  try {
    try { await TextToSpeech.stop(); } catch { /* ignore */ }
    await TextToSpeech.speak({ text, lang: "en-GB", rate: 1.0, pitch: 1.0, volume: 1.0, category: "playback" });
    onEnd();
  } catch (err) {
    onError(err);
  }
}

export function useTextToSpeech() {
  const [state, setState] = useState<TtsState>("idle");
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const stopAll = useCallback(() => {
    cancelledRef.current = true;
    const single = getSingleton();
    if (single.audio) {
      try { single.audio.pause(); } catch { /* ignore */ }
      single.audio = null;
      single.currentKey = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
    }
    if (Capacitor.isPluginAvailable("TextToSpeech")) {
      try { void TextToSpeech.stop(); } catch { /* ignore */ }
    }
    setState("idle");
    setActiveKey(null);
  }, []);

  useEffect(() => {
    return () => {
      // Don't tear down the singleton — other components may be using
      // it. Just clear our local error state.
      cancelledRef.current = true;
    };
  }, []);

  const speak = useCallback(async (
    text: string,
    opts: { key?: string; voice?: string } = {},
  ): Promise<void> => {
    const key = opts.key ?? text.slice(0, 32);
    const trimmed = text.replace(/\s+/g, " ").trim();
    if (!trimmed) return;
    // Toggle: if the same key is playing, stop instead.
    const single = getSingleton();
    if (single.currentKey === key && state === "playing") {
      stopAll();
      return;
    }
    stopAll();
    cancelledRef.current = false;
    setActiveKey(key);
    setState("loading");

    // ── 1. Try the cloud TTS edge fn ──
    try {
      const { data, error } = await supabase.functions.invoke("tts-speak", {
        body: { text: trimmed, voice: opts.voice },
      });
      if (cancelledRef.current) return;
      if (!error && data?.audio_url) {
        const audio = new Audio(data.audio_url);
        single.audio = audio;
        single.currentKey = key;
        audio.onplay = () => {
          if (!cancelledRef.current) setState("playing");
        };
        audio.onended = () => {
          if (single.audio === audio) {
            single.audio = null;
            single.currentKey = null;
          }
          setState("idle");
          setActiveKey(null);
        };
        audio.onerror = (e) => {
          Logger.warn("TTS audio playback failed; falling back to browser", { e });
          if (single.audio === audio) {
            single.audio = null;
            single.currentKey = null;
          }
          deviceSpeak(trimmed,
            () => { setState("idle"); setActiveKey(null); },
            () => { setState("error"); setActiveKey(null); });
        };
        await audio.play().catch((e) => {
          // Autoplay policy may have blocked playback — fall back.
          Logger.warn("TTS audio.play rejected", { e });
          deviceSpeak(trimmed,
            () => { setState("idle"); setActiveKey(null); },
            () => { setState("error"); setActiveKey(null); });
        });
        return;
      }
      Logger.warn("TTS edge fn returned no audio_url; falling back", { error });
    } catch (err) {
      Logger.warn("TTS edge fn failed; falling back to browser", err);
    }

    // ── 2. Browser fallback ──
    if (cancelledRef.current) return;
    browserSpeak(trimmed,
      () => { setState("idle"); setActiveKey(null); },
      () => { setState("error"); setActiveKey(null); });
    setState("playing");
  }, [state, stopAll]);

  return { state, activeKey, speak, stopAll };
}
