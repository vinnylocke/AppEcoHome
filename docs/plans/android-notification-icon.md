# Android push-notification status-bar icon → Rhozly mark

## Goal

Replace the plain solid-circle icon shown in the phone's status bar / notification shade when a Rhozly push arrives with a personalised **Rhozly** mark.

## What's actually happening (root cause)

Push notifications in Rhozly are **native-only**:

- `src/hooks/usePushNotifications.ts:10` returns immediately when `!Capacitor.isNativePlatform()`, and uses `@capacitor/push-notifications`. There is **no web-push / service-worker path** (no `firebase-messaging-sw.js` anywhere). So a push only ever reaches the **native Android/iOS app**, via FCM through `push-webhook`.
- `supabase/functions/push-webhook/index.ts:82-98` sends an FCM `notification` message with a title/body/sound but **no icon** on `android.notification`.
- The native Android project has **no notification icon configured**: `android/app/src/main/AndroidManifest.xml` has **no** `com.google.firebase.messaging.default_notification_icon` meta-data, and there is **no `ic_stat_*` drawable** (only `res/drawable/splash.png` + `ic_launcher_background.xml`; the launcher lives in `res/mipmap-*/ic_launcher`).

With no small-icon set anywhere, Android falls back to the app's launcher icon **and renders only its alpha silhouette** in the status bar — a full-colour launcher becomes a solid white blob (the "solid circle" the reporter sees). This is the classic Android notification-icon pitfall: the status-bar small icon **must be a flat white-on-transparent silhouette**; colour is ignored (Android tints the shape).

**iOS is unaffected** — iOS notifications show the full-colour app icon, no silhouette rule. So this is **Android-only**.

## App-reference consulted

- `docs/app-reference/99-cross-cutting/12-notifications.md` — the native FCM delivery path (`push-webhook` webhook off `notifications` inserts), `user_devices`, categories.
- `docs/app-reference/99-cross-cutting/23-capacitor.md` — the native wrapper + which native config lives in `android/`.

Source read: `usePushNotifications.ts`, `push-webhook/index.ts`, `android/app/src/main/AndroidManifest.xml`, `android/app/src/main/res/` (drawable / mipmap / values), `capacitor.config.ts`.

## The fix (Android native)

1. **Add a notification icon drawable** `ic_stat_rhozly` — a **white, transparent-background silhouette** of the Rhozly mark. Preferred: a single **vector drawable** `android/app/src/main/res/drawable/ic_stat_rhozly.xml` (one file, all densities, crisp). Fallback: density PNGs `res/drawable-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/ic_stat_rhozly.png` at 24/36/48/72/96 px. Must be pure white + alpha (Android uses only the alpha channel).
2. **Wire it as the default** in the `<application>` block of `AndroidManifest.xml`:
   ```xml
   <meta-data android:name="com.google.firebase.messaging.default_notification_icon"
              android:resource="@drawable/ic_stat_rhozly" />
   <meta-data android:name="com.google.firebase.messaging.default_notification_color"
              android:resource="@color/rhozly_notification" />
   ```
3. **Add the accent colour** `rhozly_notification` (the Rhozly green) in a new `res/values/colors.xml`. Android tints the white silhouette with this colour in the expanded notification, so the mark reads as green rather than plain grey — extra personalisation, and matches the brand.
4. **(Optional, web-deployable) belt-and-braces in `push-webhook`:** also set `android.notification.icon = "ic_stat_rhozly"` and `android.notification.color = "#<green>"` on the FCM payload. The manifest default already covers it; the payload override just guarantees it per-message and lets us tweak colour without a native rebuild. **Note:** the `icon` value references a drawable that must already exist in the installed app — so the drawable + manifest (native build) is the real fix; the payload alone can't add an icon that isn't shipped.

### Asset creation

The mark needs to become a flat silhouette. Approach: derive `ic_stat_rhozly` from the existing brand art (`public/icon-maskable-512.png` / `public/logo_small_rhozly.png` / the mipmap foreground) — threshold to white-on-transparent and export either as a vector path or the five density PNGs (I'll script this). **Design caveat:** a detailed rose can read as a blob at 24 dp; the silhouette may need simplifying so it stays recognisable at status-bar size. Expect one round of visual iteration on a real device.

## ⚠️ Important: this ships in the native app, not a web deploy

The drawable + manifest changes live in the `android/` project — they're compiled into the **APK/AAB** and only reach a phone via a **new native app build + store/internal release**. `npm run deploy` (Vercel web + Supabase edge functions) will **not** put this on the user's device. The only web-deployable part is the optional `push-webhook` payload tweak (Part 4). So the plan needs a native Android build/release step — I need to know the release path (see open questions).

## Files that will change

- `android/app/src/main/res/drawable/ic_stat_rhozly.xml` (or `res/drawable-*dpi/ic_stat_rhozly.png` ×5) — new.
- `android/app/src/main/res/values/colors.xml` — new (accent colour).
- `android/app/src/main/AndroidManifest.xml` — two `<meta-data>` entries in `<application>`.
- `supabase/functions/push-webhook/index.ts` — optional `icon` + `color` on `android.notification` (Part 4).

## Tests

- Native drawable/manifest can't be exercised by the Vitest/Deno/Playwright tiers (they don't build the APK). Verification is **manual on an Android device**: trigger a push (`POST /functions/v1/push-webhook` with a test record per `12-notifications.md`) and confirm the status-bar icon is the Rhozly silhouette, correctly tinted.
- If Part 4 lands, add/adjust nothing at the test tiers (payload shape only); keep the existing `push-webhook` behaviour otherwise unchanged.

## Docs to update

- `docs/app-reference/99-cross-cutting/12-notifications.md` — note the Android notification small-icon (`ic_stat_rhozly` + accent colour) and that it requires a native build.
- `docs/app-reference/99-cross-cutting/23-capacitor.md` — the new native notification-icon assets.

## Decisions (approved 2026-07-04) + build outcome

- **O2/O3 — Mark:** ✅ the **Rhozly rose silhouette**, derived faithfully from `public/logo_small_rhozly.png` — the red rose + green stem/leaves become the solid white shape, and the white power symbol + petal-separator lines become transparent negative space, so the mark stays recognisable (previewed at 96 / 48 / 24 px). Generated at all five density buckets (`drawable-{mdpi…xxxhdpi}/ic_stat_rhozly.png`, 24–96 px) via a one-off Pillow script.
- **O4 — Accent colour:** ✅ Rhozly green `#075737` (`@color/rhozly_notification`).
- **Part 4 (push-webhook payload):** **skipped** — the manifest `default_notification_icon` + `default_notification_color` fully cover it, so there's no need to redeploy the critical push function (and no need to touch its `deno.land/std` import). Can be added later if we ever want to tweak the tint without a native rebuild.
- **O1 — Native release path (still needs you):** the icon lands on a phone only via a **new Android build + install/release**. All repo changes are done; you drive the build/release with your normal process (`npx cap sync android` if needed, then Android Studio / your CI → the store or an internal track). Verify on-device once installed (trigger a push per `12-notifications.md`).

## Aside (out of scope — flagged for a follow-up)

`usePushNotifications.ts:57-75` still has **debug toasts** that surface the raw payload (`Payload received: {…}`) and DB-status messages (`Successfully marked as read!` / `No ID found in payload.`) to end users on every notification tap. Unrelated to the icon, but it leaks developer output into the UI — worth cleaning up separately.
