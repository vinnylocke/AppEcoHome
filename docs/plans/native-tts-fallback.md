# Native TTS fallback for the APK (when cloud TTS is off/unavailable)

## Goal (user request)

Add a fallback voice for read-aloud so that if the cloud (AI) TTS is disabled or failing, the app
**still speaks** — using a device library. It may sound less polished than the Chirp3-HD cloud
voice, but it should always work, including inside the Android APK.

## Why the current fallback fails on native

`useTextToSpeech.speak()` today:
1. calls the `tts-speak` edge fn (Google Chirp3-HD) → plays the MP3; on any failure →
2. falls back to `window.speechSynthesis` (`browserSpeak`).

`speechSynthesis` works in Chrome/PWA but is **silent in the Android System WebView** (no voices).
So when the cloud path fails (e.g. the Cloud TTS API 403 we just hit, or offline/quota), native
APK users get **nothing** — which is exactly what was reported. We need a fallback that runs
through a **native** TTS engine, not the Web Speech API.

## Approach — Capacitor community TTS plugin

Use **`@capacitor-community/text-to-speech`** (v8.0.2, peer `@capacitor/core >=8.0.0` → matches our
Capacitor 8). It bridges to the OS TTS engine on Android/iOS and has a Web implementation (which
wraps `speechSynthesis`). So one API covers both platforms and, crucially, **works inside the
WebView**. It's also **free** (no per-character cost — uses the device's built-in voices).

New fallback chain in `useTextToSpeech`:
1. **Cloud TTS** (`tts-speak`, Chirp3-HD) — best quality. *(unchanged primary)*
2. On any cloud failure → **`TextToSpeech.speak({ lang: "en-GB", … })`** (native engine in the APK;
   `speechSynthesis` on web). Replaces the bespoke `browserSpeak`.

This also naturally covers "AI disabled": if the cloud path can't run, the device voice speaks.

## App-reference files consulted

- `docs/app-reference/99-cross-cutting/23-capacitor.md` — plugin list + native build pipeline.
- `docs/app-reference/05-tools/03-plant-doctor-chat.md` — read-aloud / `useTextToSpeech` wiring.

## Files that will change

| File | Change | Ships via |
|------|--------|-----------|
| `package.json` | Add `@capacitor-community/text-to-speech@^8.0.0`. | web build + APK |
| `src/hooks/useTextToSpeech.ts` | Replace the `browserSpeak` fallback with the plugin: on cloud failure call `TextToSpeech.speak({ text, lang, rate, pitch })`; guard with `Capacitor.isPluginAvailable("TextToSpeech")` so an old APK without the native side degrades gracefully. Wire `stopAll()` → `TextToSpeech.stop()`. Map plugin promise → `playing`/`idle`/`error`. | web (runs in WebView) |
| `android/` (via `npx cap sync android`) | Registers the native plugin in the Android project. | **APK rebuild** |
| `docs/app-reference/99-cross-cutting/23-capacitor.md` | Add the plugin to the plugins table + a "voice fallback" note. | doc |
| `docs/app-reference/05-tools/03-plant-doctor-chat.md` | Update the read-aloud fallback description (cloud → native plugin → silent-only-if-unavailable). | doc |
| `tests/unit/...` | Small unit test for a pure `pickTtsFallback(isNative, pluginAvailable)` helper if extracted. | — |

## Exact approach

1. `npm install @capacitor-community/text-to-speech@^8.0.0`.
2. `useTextToSpeech.ts`:
   - Keep the cloud path (primary) exactly as-is.
   - New `nativeSpeak(text)`: `if (Capacitor.isPluginAvailable("TextToSpeech")) await TextToSpeech.speak({ text, lang: "en-GB", rate: 1.0, pitch: 1.0, category: "playback" })`. Resolve → `idle`; reject → `error`.
   - Fallback order on cloud failure: `nativeSpeak` (covers native APK **and** web, since the plugin's web impl uses `speechSynthesis`). Drop the bespoke `browserSpeak`.
   - `stopAll()` also calls `TextToSpeech.stop()` (guarded).
3. `npx cap sync android`.
4. **Rebuild the APK** (native plugin = new native code) — same flow as the mic fix.

## Important: shipping

- The **web JS** (the `TextToSpeech.speak` calls + guards) deploys via `npm run deploy` and runs in
  the APK's WebView immediately — but on a *current* APK the native side isn't present, so
  `isPluginAvailable` is false and it degrades to silence-on-native (no worse than today).
- The **native fallback only activates after an APK rebuild** that includes the plugin. So this
  needs another signed APK build (your side), like the mic fix.
- Now that you've enabled the Cloud TTS API, the **primary** Chirp3-HD path should already work in
  the current APK — this fallback is resilience (offline / quota / future outage / AI off) and a
  free voice option, not the fix for today's issue.

## Risks / edge cases

- **Old APK without the plugin:** guarded by `isPluginAvailable` → no crash, just no native voice
  until rebuilt.
- **iOS:** no `ios/` project today; the plugin's web impl covers PWA, native iOS would "just work"
  if/when an iOS project is added (plus an `NSSpeechRecognition`-style usage string is *not* needed
  for TTS).
- **Quality:** device voices are decent but below Chirp3-HD — expected and acceptable as a fallback.
- **Double audio:** ensure the cloud `Audio` element is fully stopped before the native engine
  starts (reuse the existing single-playback `stopAll()` guard + plugin `stop()`).

## Tests / test docs

- Optional pure helper `pickTtsFallback(isNative, pluginAvailable)` with a Vitest unit test.
- The plugin bridge itself isn't unit-testable in JSDOM; verified **on-device** after the APK
  rebuild (disable/break cloud TTS → confirm the device voice speaks).

## Relationship to the other plans

- Independent of the **automation rate-limit "mute until"** plan (different subsystem).
- Complements the shipped **native voice fix** (RECORD_AUDIO + WebView audio) and the **Cloud TTS
  API enablement** you just did.
