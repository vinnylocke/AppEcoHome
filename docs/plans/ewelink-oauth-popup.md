# Plan — eWeLink OAuth: window.open + localStorage Handshake

## Problem

On Android PWA and desktop, `window.location.href = oauthUrl` navigates the whole app away to eWeLink.
When eWeLink redirects back to `rhozly.com/integrations`, the OS opens a new browser tab rather than returning to the app context.

On iOS PWA this cannot be fully fixed (isolated storage), but we can make the experience smoother.

---

## Platform behaviour matrix

| Context | localStorage shared between tabs? | `window.open` returns to app? |
|---|---|---|
| Desktop browser | ✅ Yes | ✅ Yes (`window.close()` works) |
| Android PWA (Chrome) | ✅ Yes (same origin) | ✅ Yes |
| iOS PWA (Safari) | ❌ No (isolated per PWA) | ❌ No (always stays in Safari) |
| Native Capacitor APK | N/A | N/A (future: App Links) |

---

## New flow (window.open path — desktop + Android PWA)

1. User clicks "Connect with eWeLink"
2. We store `ewelink_oauth_mode = "popup"`, `ewelink_oauth_state`, `ewelink_oauth_home_id`, `ewelink_oauth_device_type` in **localStorage**
3. `window.open(oauthUrl, "_blank")` — original tab stays open, wizard stays at Step 3
4. Step 3 shows a "Waiting for eWeLink…" spinner and sets up a `storage` event listener watching for `ewelink_oauth_result`
5. eWeLink redirects back to `rhozly.com/integrations?code=...` — opens in a new browser tab
6. That new tab detects `?code=` AND `ewelink_oauth_mode === "popup"` in localStorage
7. New tab exchanges the code (calls `integrations-ewelink-connect` with homeId from localStorage)
8. New tab writes `ewelink_oauth_result = { integrationId, devices, deviceType }` to localStorage
9. New tab shows "Connection complete! You can close this tab." and calls `window.close()`
10. Original tab's storage event fires → picks up result → `update({ integrationId, discoveredDevices })` → `onNext()` to Step 4

---

## iOS PWA fallback (redirect path — unchanged logic, improved UX)

iOS PWAs have isolated storage so localStorage cannot bridge contexts. Instead:

1. Detect iOS standalone PWA: `window.matchMedia('(display-mode: standalone)').matches && /iPhone|iPad|iPod/.test(navigator.userAgent)`
2. If iOS PWA: store state in **sessionStorage** and use `window.location.href` redirect (existing behaviour)
3. The redirect opens in Safari (separate context from the PWA)
4. After OAuth, eWeLink redirects to `rhozly.com/integrations?code=...` in Safari
5. Safari loads the React app → detects `ewelink_oauth_mode === null` (not in localStorage) → falls into redirect path
6. The callback page in Safari still attempts to exchange the code and save the device using the session (if the user is already authenticated in Safari) or prompts a sign-in
7. After exchange, show: **"All done! Your device has been saved. Switch back to the Rhozly app."** (no auto-close — `window.close()` is blocked on externally-opened Safari tabs)
8. User switches back to PWA, taps Refresh on Integrations → sees device

---

## Popup blocked fallback

If `window.open()` returns null or a closed popup (blocked by browser):
- Fall back silently to the redirect path (store in sessionStorage, `window.location.href`)

---

## Files changed

### `src/components/integrations/wizard/Step3Credentials.tsx`

`startOAuth()` changes:
- Detect iOS PWA → redirect path (existing)
- Otherwise: store `mode/homeId/state/deviceType` in localStorage, `window.open`, set up storage listener
- If popup blocked → redirect path
- New UI state: "Waiting for eWeLink…" while listening (replaces the redirect spinner)
- Timeout after 10 min → clear listener, show "Timed out, please try again"

### `src/components/integrations/IntegrationsPage.tsx`

`?code=` detection useEffect changes:
- Read `ewelink_oauth_mode` from localStorage
- If `"popup"`: this is the callback tab
  - Clean up localStorage keys
  - CSRF check (localStorage state vs URL state, best-effort — skip if missing)
  - Show full-page callback UI (spinner → "Connecting…")
  - Call `integrations-ewelink-connect exchange_code` with homeId from localStorage
  - Write result to localStorage
  - Try `window.close()`, fall back to showing success message ("All done! Switch back to Rhozly.")
  - Never show the main Integrations page UI (this tab is ephemeral)
- If `"redirect"` or missing: existing behaviour (open wizard with `__oauthCode`)

New state: `callbackTabState: null | "loading" | "success" | "error"` — when non-null, renders a minimal centred card instead of the full IntegrationsPage.

---

## What does NOT change

- `integrations-ewelink-connect` edge function — no changes
- `ConnectDeviceWizard` / Steps 1, 2, 4, 5 — no changes
- The auto-exchange in Step3 `useEffect` (handles redirect fallback)
- Android native Capacitor — this is a separate future improvement (App Links)

---

## Risk / edge cases

| Case | Handled by |
|---|---|
| Popup blocked | Silent fallback to redirect |
| iOS PWA | Redirect path with improved "switch back" message |
| User closes callback tab before exchange completes | Original tab times out after 10 min, shows retry |
| User already has integration (re-connecting) | `exchange_code` upserts — no issue |
| Session expired in callback tab | `getSession()` returns null → error written to localStorage → original tab shows error |
