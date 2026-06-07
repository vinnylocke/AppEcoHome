import React from "react";
import { Volume2, VolumeX, Loader2 } from "lucide-react";
import { useTextToSpeech } from "../../hooks/useTextToSpeech";

interface Props {
  text: string;
  /** Stable key so toggling on one message stops only that one. */
  messageKey: string;
  voice?: string;
  size?: "sm" | "md";
}

// ─── ReadAloudButton ───────────────────────────────────────────────────
//
// Per-assistant-message speaker icon. Tap to play; tap again to stop.
// Calls the `tts-speak` edge fn (cached) and falls back to browser
// SpeechSynthesis on any failure.

export default function ReadAloudButton({
  text,
  messageKey,
  voice,
  size = "sm",
}: Props) {
  const { state, activeKey, speak, stopAll } = useTextToSpeech();
  const iconSize = size === "sm" ? 13 : 16;
  const isActive = activeKey === messageKey;
  const isLoading = isActive && state === "loading";
  const isPlaying = isActive && state === "playing";

  return (
    <button
      type="button"
      data-testid="chat-read-aloud"
      onClick={() => {
        if (isPlaying) stopAll();
        else speak(text, { key: messageKey, voice });
      }}
      aria-label={isPlaying ? "Stop reading" : "Read aloud"}
      aria-pressed={isPlaying}
      className={`inline-flex items-center justify-center rounded-md p-1.5 transition-colors min-h-[28px] min-w-[28px] ${
        isPlaying
          ? "bg-rhozly-primary/15 text-rhozly-primary"
          : "text-rhozly-on-surface/40 hover:text-rhozly-primary hover:bg-rhozly-primary/5"
      }`}
    >
      {isLoading
        ? <Loader2 size={iconSize} className="animate-spin" />
        : isPlaying
          ? <VolumeX size={iconSize} />
          : <Volume2 size={iconSize} />}
    </button>
  );
}
