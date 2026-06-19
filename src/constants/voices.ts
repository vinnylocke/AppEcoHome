// Curated en-GB Google Cloud TTS voices for the read-aloud picker.
// All confirmed working via the `tts-speak` edge function. Default first.
//
// Tiers (all share Google's 1M-char/month free tier; replays are cached):
//   premium    = Chirp3-HD  (~$30 / 1M chars) — most natural
//   natural    = Neural2     (~$16 / 1M chars)
//   lightweight = Standard   (~$4  / 1M chars)

export interface VoiceOption {
  id: string;
  label: string;
}

export const DEFAULT_VOICE_ID = "en-GB-Chirp3-HD-Achernar";

export const TTS_VOICES: VoiceOption[] = [
  { id: "en-GB-Chirp3-HD-Achernar", label: "British · Achernar (default · premium)" },
  { id: "en-GB-Chirp3-HD-Aoede",    label: "British · Aoede (premium)" },
  { id: "en-GB-Chirp3-HD-Charon",   label: "British · Charon (premium)" },
  { id: "en-GB-Chirp3-HD-Puck",     label: "British · Puck (premium)" },
  { id: "en-GB-Chirp3-HD-Kore",     label: "British · Kore (premium)" },
  { id: "en-GB-Neural2-A",          label: "British · Neural2 A (natural)" },
  { id: "en-GB-Neural2-C",          label: "British · Neural2 C (natural)" },
  { id: "en-GB-Standard-A",         label: "British · Standard A (lightweight)" },
];
