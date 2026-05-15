# Plan — eWeLink OAuth: Android App Links for Capacitor APK

## Problem

In the Capacitor native APK, `window.open(oauthUrl, "_blank")` opens the **system Chrome browser**. When eWeLink redirects back to `https://rhozly.com/integrations?code=...`, Android has no App Links configured for `com.rhozly.app`, so it stays in Chrome (loading the web version of Rhozly). The native APK never sees the OAuth callback code.

---

## Why App Links Are Required

| Context | `window.open` behaviour | Callback landing |
|---|---|---|
| Desktop / Android PWA | Opens a new browser tab (same-origin) — localStorage handshake works | Web app tab |
| Capacitor APK | Opens the system browser (Chrome) as a separate process | Chrome browser — NOT the APK |

The `localStorage` storage event only fires between tabs in the same browser context. The Capacitor WebView and Chrome are completely separate processes, so the storage event never fires in the APK.

**App Links** tell Android: "When any app (including Chrome) tries to open `https://rhozly.com/integrations`, route it to `com.rhozly.app` instead."

---

## Solution Overview

1. Host `https://rhozly.com/.well-known/assetlinks.json` — tells Android to trust `com.rhozly.app` for `rhozly.com` URLs
2. Add `android:autoVerify="true"` intent filter to `AndroidManifest.xml` — registers the App Link
3. In `Step3Credentials.tsx`, detect Capacitor and use `@capacitor/browser` (Custom Chrome Tab) + `App.addListener('appUrlOpen', ...)` to receive the code — both packages are already installed

When eWeLink redirects to `https://rhozly.com/integrations?code=...`, Android intercepts it via App Links, brings the Rhozly APK to the foreground, fires `appUrlOpen` with the full URL, and the handler extracts the code and calls `exchangeCode()`. IntegrationsPage is unchanged — the `?code=` useEffect only runs for web (the WebView URL never changes in the Capacitor flow).

---

## Keystore SHA-256 Fingerprints

Debug keystore (for `app-debug.apk`):
```
5E:59:47:69:A2:A0:51:A4:14:43:F1:0D:D5:B6:84:23:3F:DB:CA:F9:17:0E:66:DF:76:A4:66:7C:6F:92:30:5D
```

For a release APK the release keystore fingerprint must also be added to `assetlinks.json` (to be done when a signed release build is created).

---

## Files Changed

### 1. `public/.well-known/assetlinks.json` — NEW

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.rhozly.app",
    "sha256_cert_fingerprints": [
      "5E:59:47:69:A2:A0:51:A4:14:43:F1:0D:D5:B6:84:23:3F:DB:CA:F9:17:0E:66:DF:76:A4:66:7C:6F:92:30:5D"
    ]
  }
}]
```

Placed in `public/` so Vite copies it to `dist/` verbatim. Vercel serves static files before rewrites, so the catch-all rewrite won't intercept it.

### 2. `android/app/src/main/AndroidManifest.xml`

Add a new intent filter inside `<activity>` after the existing launcher filter:

```xml
<intent-filter android:autoVerify="true">
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="https" android:host="rhozly.com" />
</intent-filter>
```

This registers `https://rhozly.com/*` as an App Link. `android:autoVerify="true"` makes Android automatically verify `assetlinks.json` at install time and remove the disambiguation dialog.

### 3. `src/components/integrations/wizard/Step3Credentials.tsx`

Add imports at top:
```typescript
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { App as CapApp } from "@capacitor/app";
import type { PluginListenerHandle } from "@capacitor/core";
```

In `startOAuth()`, add a Capacitor branch before the existing iOS/web logic:

```typescript
if (Capacitor.isNativePlatform()) {
  let resolved = false;
  let urlListenerHandle: PluginListenerHandle | null = null;
  let timerId: ReturnType<typeof setTimeout>;

  const cleanup = () => {
    resolved = true;
    urlListenerHandle?.remove();
    urlListenerHandle = null;
    clearTimeout(timerId);
    listenerCleanupRef.current = null;
  };

  urlListenerHandle = await CapApp.addListener("appUrlOpen", async (event) => {
    if (resolved) return;
    const url = new URL(event.url);
    const code = url.searchParams.get("code");
    const region = url.searchParams.get("region") ?? undefined;
    cleanup();
    await Browser.close().catch(() => {});
    if (!code) {
      setError("No authorisation code received — please try again.");
      setLoading(false);
      return;
    }
    await exchangeCode(code, region);
  });

  timerId = setTimeout(() => {
    if (resolved) return;
    cleanup();
    Browser.close().catch(() => {});
    setLoading(false);
    setError("Connection timed out — please try again.");
  }, 10 * 60 * 1000);

  listenerCleanupRef.current = cleanup;

  await Browser.open({ url: oauthUrl });
  return; // stay in loading state until appUrlOpen fires
}
```

---

## What Does NOT Change

- `IntegrationsPage.tsx` — the `?code=` useEffect runs only on web; WebView URL never changes in the Capacitor App Links flow
- `supabase/functions/integrations-ewelink-connect/` — no changes
- `vercel.json` — static files in `public/` are served before the catch-all rewrite

---

## Deployment + Testing Steps

1. Deploy web changes (builds `assetlinks.json` into `dist/`) — run `npm run deploy`
2. Verify: `curl https://rhozly.com/.well-known/assetlinks.json` should return the JSON
3. Run `npm run build && npx cap sync android` → rebuild APK in Android Studio
4. Install the new APK and tap "Connect with eWeLink" — eWeLink should open in a Custom Chrome Tab, then redirect back into the Rhozly APK automatically

---

## Risk / Edge Cases

| Case | Handling |
|---|---|
| App Links not yet verified (first install) | Android verifies on install; if slow, user sees disambiguation dialog once, then it's cached |
| User closes the Custom Chrome Tab (cancel) | 10-min timeout clears the listener and shows "try again" |
| `appUrlOpen` fires but no `?code=` in URL | Shown as error; `Browser.close()` called |
| Release APK added later | Add release keystore SHA-256 to `assetlinks.json` — deploy web-only, no APK rebuild needed |
| iOS (future) | `@capacitor/browser` + `App.addListener('appUrlOpen', ...)` works the same way on iOS with Universal Links |
