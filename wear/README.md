# Rhozly Wear OS companion (`wear/`)

A **standalone native Wear OS app** (Kotlin + Jetpack Compose for Wear OS) for task
management on a Pixel Watch. It's a **separate Gradle project** from the web app —
open the `wear/` folder in Android Studio, not the repo root.

- Build plan: [`../docs/wear-os-companion-plan.md`](../docs/wear-os-companion-plan.md)
- Environment setup + sideload steps: [`../docs/wear-os-companion-setup.md`](../docs/wear-os-companion-setup.md)

## Current state: **Phase 0 — scaffold (boots to a placeholder)**

Nothing but a "Rhozly · Task companion" screen yet. Its only job is to confirm the
toolchain + Compose for Wear render on your emulator **before** the feature phases
land (auth, task list, actions, offline). Deliberately minimal — **no Supabase
dependency yet** (that arrives in Phase 1) so this smoke test isolates the Android/
Wear/Compose setup.

## Run it (Phase 0 smoke test)

1. **Android Studio → Open** → select this `wear/` folder (not the repo root).
2. Let **Gradle sync** finish. It downloads Gradle 8.14.3 + the dependencies on first
   run. *(If sync flags a version — AGP/Kotlin/Compose — accept its suggested bump;
   all versions live in `gradle/libs.versions.toml` for a one-line change.)*
3. Start a **Wear OS emulator** (Device Manager ▶) — see the setup doc, Part A3.
4. Select the emulator in the target dropdown → **Run ▶**.
5. Expected: the watch shows **"Rhozly / Task companion"** centred, with the time at
   the top. That's a pass. ✅

If it builds + boots, the toolchain is good and I'll layer in Phase 1 (auth) next.
If sync/build fails, paste me the error (and the versions Android Studio suggests).

## Layout

```
wear/
  settings.gradle.kts · build.gradle.kts · gradle.properties
  gradle/libs.versions.toml          ← all dependency versions (bump here)
  app/
    build.gradle.kts                  ← applicationId com.rhozly.app, Wear + Compose deps
    src/main/AndroidManifest.xml       ← watch feature flag + standalone meta-data
    src/main/java/com/rhozly/wear/
      MainActivity.kt                  ← single-activity entry point
      presentation/WearApp.kt          ← Compose root (placeholder for now)
      presentation/theme/Theme.kt      ← Rhozly greens on black
    src/main/res/…                     ← strings, adaptive launcher icon, theme
```

## Notes

- **`applicationId = com.rhozly.app`** matches the phone app on purpose → one Play
  listing later (Play serves this watch build to watches via the watch feature flag).
- **Versions** (`gradle/libs.versions.toml`) were chosen to match your Capacitor
  project (AGP 8.13.0 / Gradle 8.14.3) for SDK compatibility; Compose/Wear versions are
  recent-stable and may want a nudge on first sync.
- **Config** (`local.properties`) is gitignored; a template is in `local.properties.example`.
  Android Studio writes `sdk.dir` for you on open. Supabase config comes in Phase 1.
