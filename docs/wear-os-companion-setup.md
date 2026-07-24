# Rhozly Wear OS Companion — Setup & Testing Guide

Do **Part A once** before development starts. Use **Part B** to run/test each build.
Companion to the [build plan](./wear-os-companion-plan.md).

Your machine already has **JDK 21** and the Android SDK (from the Capacitor project), but the
Wear-specific pieces below still need installing.

---

## Part A — One-time environment setup (before developing)

### A1. Install Android Studio
- [ ] Install the **latest stable Android Studio** (https://developer.android.com/studio).
      Its bundled JDK is fine; you don't need to configure JDK 21 yourself.

### A2. Install the SDK components (Android Studio → **Settings → Languages & Frameworks → Android SDK**, or the **SDK Manager** icon)
On the **SDK Platforms** tab:
- [ ] **Android 14 (API 34)** platform (Wear OS 5 targets this). Tick "Show Package Details" and
      also grab the **Wear OS system image** ("Wear OS 5 – API 34", Google APIs, x86_64 or
      arm64 to match your machine). *(A Wear OS 4 / API 33 image also works if you prefer.)*

On the **SDK Tools** tab:
- [ ] **Android SDK Platform-Tools** (this is where `adb` lives)
- [ ] **Android SDK Build-Tools**
- [ ] **Android Emulator**

### A3. Create a Wear OS emulator
- [ ] **Device Manager** (the phone icon, top-right) → **Create Device** → category **Wear OS** →
      pick a **round** profile (e.g. "Wear OS Large Round", closest to a Pixel Watch) → choose the
      **Wear OS system image** from A2 → Finish.
- [ ] Launch it once to confirm it boots to a watch face. *(This is enough to develop + test
      without the physical watch at all.)*

### A4. Supabase config values the app needs
The Wear app authenticates against your existing Supabase. Have these two values ready (they live
in your web app's `.env`) — I'll wire them into the Wear project's `local.properties` (never committed):
- [ ] `VITE_SUPABASE_URL` → the project URL
- [ ] `VITE_SUPABASE_PUBLISHABLE_KEY` → the publishable/anon key (safe to embed in a client app;
      RLS protects the data)

### A5. (Only for testing on the *physical* Pixel Watch — optional; the emulator covers most work)
- [ ] On the watch: **Settings → System → About → tap "Build number" 7×** to unlock Developer options.
- [ ] **Settings → Developer options** → enable **ADB debugging** and **Wireless debugging / Debug over Wi-Fi**.
- [ ] Note that the Pixel Watch has **no USB data port** — testing on the real device is **Wi-Fi only**
      (the emulator has no such limitation).

> After A1–A4 you can develop + test entirely on the emulator. A5 is only needed when you want it
> running on your actual wrist.

---

## Part B — Build, emulate & sideload to the watch

Once I've scaffolded the `wear/` project (Phase 0), here's the loop.

### B1. Open + sync
- [ ] Android Studio → **Open** → select the `wear/` folder → let **Gradle sync** finish.

### B2. Run on the emulator (the everyday loop)
- [ ] Start your Wear emulator (Device Manager ▶).
- [ ] Pick it in the target dropdown (top toolbar) → hit **Run ▶**. The app builds, installs, and
      launches on the emulator. Breakpoints + Logcat work as normal.

### B3. Run on the physical Pixel Watch (Wi-Fi)
Prereq: A5 done, and the **watch + computer on the same Wi-Fi**.
1. In **Developer options → Wireless debugging** on the watch, note the **IP address : port**.
2. From a terminal (adb is at `…\Android\Sdk\platform-tools\adb.exe`, or use Android Studio's
   embedded terminal):
   - **Newer Wear OS (pairing code):** `adb pair <ip>:<pair-port>` → enter the 6-digit code shown
     on the watch → then `adb connect <ip>:<connect-port>`.
   - **Older flow:** `adb connect <ip>:5555`, then **accept the "Allow debugging" prompt** on the watch.
3. `adb devices` → confirm the watch is listed.
4. Now either **Run ▶** in Android Studio with the watch selected as target, **or** install a built
   APK directly: `adb install -r wear\app\build\outputs\apk\debug\app-debug.apk`.
5. The app appears in the watch's app list. (Re-run/`-r` reinstalls to update.)

### B4. Build an APK without running (for manual sideload)
- [ ] `cd wear` then `.\gradlew assembleDebug` → APK at
      `wear\app\build\outputs\apk\debug\app-debug.apk`. Install with `adb install -r <that path>`.

---

## The iteration loop with me

Because I can't run a Wear build or flash your watch from my environment, each cycle is:
1. I write/edit the Kotlin here on this branch.
2. You **Run ▶** (emulator or watch) in Android Studio.
3. You paste back any **Gradle/build errors, Logcat crashes, or "this screen looks wrong"** notes
   (a screenshot from the emulator helps).
4. I fix; repeat.

The emulator is enough for ~90% of this — keep the physical watch for the occasional "does it feel
right on the wrist" check.

## Related
- Build plan: [`wear-os-companion-plan.md`](./wear-os-companion-plan.md)
