# Fix: Garden AI voice (mic + read-aloud) broken in the Android APK

## Problem (reported on the APK, not the PWA)

1. **Read-aloud doesn't play.** A chat reply arrives but isn't spoken automatically; tapping the
   per-message 🔊 speaker also produces no audio.
2. **Mic permission can't be granted.** Tapping the mic says permission isn't enabled, and there's
   **no option to allow it in Android app settings** either.

User notes it "worked before, maybe on the PWA, not the apk" — correct: these are native-WebView
problems, not web-code problems.

## Why the web deploy didn't (and can't) fix this

`capacitor.config.ts` sets `server.url = "https://rhozly.com"`, so the APK's WebView loads the
**live site**. The web `uid` fix I deployed is therefore already running inside the APK — the same
code as the PWA. The remaining failures are purely the **native Android WebView environment**, and
the relevant config is **baked into the APK** (Android manifest + WebView settings). A Vercel deploy
cannot change either — this is a **native app rebuild + redistribution**, not `npm run deploy`.

## Root cause

### Mic — missing `RECORD_AUDIO` permission (confirmed)

`useVoiceCapture` uses `navigator.mediaDevices.getUserMedia({ audio: true })`. In a Capacitor
Android WebView, the bridge can only grant the WebView's audio-capture request if the app declares
`android.permission.RECORD_AUDIO` and then obtains the runtime grant.

`android/app/src/main/AndroidManifest.xml` declares INTERNET, CAMERA, ACCESS_FINE_LOCATION,
POST_NOTIFICATIONS — **but not RECORD_AUDIO** (verified in both the source manifest and the merged
build manifest; no plugin injects it). So:
- `getUserMedia` throws `NotAllowedError` → `useVoiceCapture` → state `denied` → "Microphone
  permission denied. Enable it in your device settings."
- Android shows **no microphone toggle** for the app, because the permission isn't declared — so
  there's nothing to enable. This is exactly the reported symptom. (Camera works because `CAMERA`
  *is* declared.)

### Read-aloud — WebView blocks programmatic audio + `speechSynthesis` unsupported (high confidence)

`useTextToSpeech.speak()` does `await supabase.functions.invoke("tts-speak")` **then**
`new Audio(url).play()`. Android WebView defaults to `mediaPlaybackRequiresUserGesture = true`:
- **Auto-read** fires when a message arrives — *no* user gesture at all → blocked outright.
- **Speaker tap** is a gesture, but `play()` runs *after* the `await`, so the gesture is no longer
  active → blocked.

On block, the hook falls back to `browserSpeak()` → `window.speechSynthesis`. Android **System
WebView ships no TTS voices**, so `speechSynthesis` is silent (often `getVoices()` returns `[]`).
Net: no audio either way. In mobile Chrome (PWA) the same code works because Chrome's autoplay
policy allows media after the user has engaged with the site, so the deferred `play()` succeeds.

`tts-speak` itself is fine (deployed in the last release; worked in the PWA) — the only difference
is the WebView's gesture/autoplay policy.

## App-reference files consulted

- `docs/app-reference/99-cross-cutting/23-capacitor.md` — native wrapper, plugins, build pipeline.
  No "Permissions" section and no mention of voice capture / WebView media — **gap to fill**.
- `docs/app-reference/05-tools/03-plant-doctor-chat.md` — documents the read-aloud + mic surface
  (updated last task). Needs a "native APK requirements" note.

## Files that will change

| File | Change | Ships via |
|------|--------|-----------|
| `android/app/src/main/AndroidManifest.xml` | Add `<uses-permission android:name="android.permission.RECORD_AUDIO" />` and `<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />` | **APK rebuild** |
| `android/app/src/main/java/com/rhozly/app/MainActivity.java` | Override `onCreate` to call `this.getBridge().getWebView().getSettings().setMediaPlaybackRequiresUserGesture(false)` after `super.onCreate` — lets auto-read and the deferred `audio.play()` work | **APK rebuild** |
| `docs/app-reference/99-cross-cutting/23-capacitor.md` | Add a Permissions section (manifest list incl. RECORD_AUDIO), a WebView-media note, and voice-capture as a native consideration | doc only |
| `docs/app-reference/05-tools/03-plant-doctor-chat.md` | Note that native read-aloud/mic require RECORD_AUDIO + `mediaPlaybackRequiresUserGesture(false)` | doc only |

**No web/`src` changes proposed.** Once the WebView allows programmatic playback, the existing
cloud-TTS path plays the MP3 and the `speechSynthesis` fallback is never reached. (See open
question 2 about optional web hardening.)

## Exact approach

1. **Manifest:** add the two `<uses-permission>` lines alongside the existing ones. RECORD_AUDIO is
   the essential one (enables the runtime grant); MODIFY_AUDIO_SETTINGS is the conventional companion
   for WebRTC/`getUserMedia` audio routing.
2. **MainActivity:** the current class is the bare default. Override `onCreate`:
   ```java
   @Override
   public void onCreate(Bundle savedInstanceState) {
     super.onCreate(savedInstanceState);
     this.getBridge().getWebView().getSettings().setMediaPlaybackRequiresUserGesture(false);
   }
   ```
   This makes both auto-read (gesture-less) and the post-`await` speaker playback work.
3. `npx cap sync android` to copy config, then build the APK in Android Studio / the existing
   release pipeline, install on a device, and verify.

## How this ships (different from last time)

This is **not** a Vercel web deploy. After the code change:
1. `npx cap sync android`
2. Build a signed APK/AAB (Android Studio or CI) — I can't build/sign/distribute from here.
3. Install on device → grant the mic prompt on first use → verify mic + read-aloud.
4. Distribute via Play Console (internal testing track) or sideload.

## Risks / edge cases

- **First-use prompt:** after adding RECORD_AUDIO, the first `getUserMedia` triggers a runtime
  permission dialog (handled by the Capacitor bridge). If the user previously hit "deny", they may
  need to clear it — but until the permission exists at all, there's nothing to deny, so a fresh
  install will prompt cleanly.
- **`setMediaPlaybackRequiresUserGesture(false)`** allows the WebView to autoplay media. For our own
  trusted content this is intended (it's what enables auto-read); negligible downside.
- **iOS:** no `ios/` project exists, so no parallel change is needed today. If iOS is added later it
  needs `NSMicrophoneUsageDescription` + `allowsInlineMediaPlayback` / `mediaTypesRequiringUserActionForPlayback`.

## Tests / verification

- Native WebView permission + autoplay behaviour **can't be exercised by Vitest/Deno/Playwright**
  (they run in a browser, not the packaged WebView), so there's no automated test to add for this
  change. Verification is **on-device**: (a) mic prompts and transcribes; (b) a reply auto-reads
  when the Voice toggle is on; (c) the 🔊 button plays on demand.
- The browser E2E for the Voice *toggle* persistence (GP-011) already exists from the last task and
  is unaffected.

## App-reference files to update

- `docs/app-reference/99-cross-cutting/23-capacitor.md` (permissions + WebView media + voice).
- `docs/app-reference/05-tools/03-plant-doctor-chat.md` (native requirements note).

## Open questions

1. **Build pipeline:** how do you build/distribute the APK (Android Studio locally, or CI/Play
   Console)? I'll make the code changes + `npx cap sync`; you'll do the signed build.
2. **Web hardening (optional):** want me to *also* restructure `useTextToSpeech` to unlock audio
   within the user gesture (pre-create the `Audio` element and set `src` after the fetch)? Not
   needed for Android once the native flag is set, but it future-proofs other WebViews/iOS. My
   recommendation: skip for now (no iOS target; keep the change minimal), revisit if iOS ships.
