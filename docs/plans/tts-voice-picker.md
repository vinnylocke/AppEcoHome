# Feature: choose the TTS voice (Account → Voice)

## Goal (user request)

Let the user pick which voice reads chat replies, from an Account setting. The `voice_settings`
jsonb already reserves `preferred_voice` for exactly this — the Voice section comment says the
picker was "deferred to a follow-up". This is that follow-up.

## How it works today

- `voice_settings = { auto_read_assistant_replies: boolean, preferred_voice?: text }` on
  `user_profiles`. Only the toggle is wired; `preferred_voice` is never written or read.
- `tts-speak` already accepts `{ text, voice }` and caches per `(text_hash, voice)`, defaulting to
  `en-GB-Chirp3-HD-Achernar`. **No backend change needed.**
- `useTextToSpeech.speak(text, { voice })` already forwards a voice. But the chat passes **none**:
  `ReadAloudButton` (PlantDoctorChat ~L1242) has no `voice` prop set, and the auto-read effect
  (~L610) calls `speak(...)` without a voice. So both always use the default.

## App-reference consulted

- `docs/app-reference/06-account/02-notifications-tab.md` — the Voice section lives on the Alerts tab.
- `docs/app-reference/05-tools/03-plant-doctor-chat.md` — read-aloud wiring (`useTextToSpeech`,
  `ReadAloudButton`, auto-read effect).

## Files that will change

| File | Change |
|------|--------|
| `src/constants/voices.ts` | **New** — curated list of valid en-GB Google voices `{ id, label }` (a few Chirp3-HD options + a couple of Neural2/Standard as lighter/cheaper alternatives), with the default first. |
| `src/components/GardenerProfile.tsx` (`VoiceSection`) | Add a voice `<select>` (`data-testid="voice-picker"`). **Load both** `auto_read_assistant_replies` + `preferred_voice`; on any change write the **merged** object. (Fixes a latent bug: today's toggle write `{ auto_read_assistant_replies }` replaces the whole jsonb and would wipe `preferred_voice` — both controls must read-merge-write.) Keyed on `uid`. |
| `src/components/PlantDoctorChat.tsx` | Load `preferred_voice` alongside `autoReadReplies` (same `voice_settings` read), store in state, and pass it to `ReadAloudButton voice={…}` and the auto-read `speak(content, { voice })`. |
| `src/lib/voiceSettings.ts` | **New (optional)** — tiny pure `mergeVoiceSettings(prev, patch)` so the merge is unit-testable. |
| `docs/app-reference/06-account/02-notifications-tab.md` | Document the voice picker in the Voice section. |
| `docs/app-reference/05-tools/03-plant-doctor-chat.md` | Note read-aloud now honours `preferred_voice`. |

## Exact approach

1. **Voices constant** — curated, known-valid en-GB voices (I'll verify each against the Google TTS
   API before locking the list, the same way we verified Achernar/Standard-A). Friendly labels, e.g.
   "British — Achernar (default)", "British — Neural2 A", "British — Standard A (lightweight)".
2. **VoiceSection** — manage `{ autoRead, preferredVoice }` in state; loader reads both; both the
   toggle and the `<select>` call one `save(next)` that writes the **whole merged** `voice_settings`
   with `.eq("uid", …)` and inspects `{ error }` (same pattern we fixed earlier). Picker disabled
   while loading/saving.
3. **Chat** — thread `preferredVoice` from the `voice_settings` read into both playback paths.
4. No `tts-speak` change; caching already keys on voice, so each voice caches independently.

## Risks / edge cases

- **jsonb clobber** — addressed by the read-merge-write (the core reason the picker + toggle must
  share one writer).
- **Cost** — premium Chirp3-HD voices are $30/1M chars (1M free/month, cached). Offering Neural2/
  Standard alternatives lets cost-conscious users pick a cheaper voice. (See the TTS cost note.)
- **Invalid voice** — only curated, pre-verified voice IDs are selectable; `tts-speak` falls back
  to the device voice if Google ever rejects one.
- **Voice changes mid-playback** — next play uses the new voice; no need to interrupt current audio.

## Tests / docs

- Vitest unit test for `mergeVoiceSettings` (keeps both fields, applies patch).
- Optional E2E: pick a voice on `/gardener?tab=notifications`, reload, assert it persists
  (extends the GP-011 pattern).
- Update the two app-reference files.

## Ships via

`npm run deploy` (frontend only). No migration (column exists), no backend, no APK.
