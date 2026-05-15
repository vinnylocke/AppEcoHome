# Plan — eWeLink OAuth Authorization Code Flow

## Problem
The app previously asked users to type their eWeLink email + password directly,
and called `/v2/user/login` which this developer app tier doesn't have access to.
The available API is `/v2/user/oauth/token` — the proper OAuth Authorization Code
flow where eWeLink's own page handles the login.

## How the new flow works
1. User clicks "Connect with eWeLink" in the wizard.
2. Frontend calls edge function to get a signed OAuth URL (signing needs the appSecret
   which must stay server-side).
3. Frontend opens the URL in a new tab — user logs in on eWeLink's own page and grants
   permission.
4. eWeLink redirects to `https://rhozly.com/integrations?ewelink_code=<code>&state=<state>`.
5. On load, IntegrationsPage detects the `ewelink_code` query param, re-opens the wizard,
   and Step 3 auto-exchanges the code for tokens.
6. Edge function calls `POST /v2/user/oauth/token`, gets access + refresh tokens, stores
   them encrypted, fetches devices, and returns `{ integrationId, devices }`.
7. Wizard advances to Step 4 (Discovery) as normal.

## Files changing

### `supabase/functions/integrations-ewelink-connect/index.ts`
Replace the single email/password login logic with two actions dispatched by a body `action` field:

**`action: "get_oauth_url"`**
- Generates `seq` (timestamp ms), `nonce`, `state` (random UUID).
- Computes `authorization = Base64(HMAC-SHA256(appSecret, appId + "_" + seq))`.
- Returns the signed URL:
  `https://c2ccdn.coolkit.cc/oauth/index.html?clientId=<appId>&seq=<seq>&authorization=<sign>&redirectUrl=<encodedRedirectUrl>&state=<state>&nonce=<nonce>`
- Also returns `state` so the frontend can store it for CSRF validation.

**`action: "exchange_code"`**
- Receives `{ homeId, code, state }`.
- Calls `POST /v2/user/oauth/token` with proper eWeLink v2 headers + body-signed Authorization.
- Gets `{ accessToken, refreshToken }`, encrypts and upserts to `integrations` table.
- Fetches device list via `GET /v2/device/thing`.
- Returns `{ integrationId, devices }` — same shape as before so Step 4 is unchanged.

### `src/components/integrations/wizard/Step3Credentials.tsx`
For eWeLink brand:
- Remove email + password fields entirely.
- Show a "Connect with eWeLink" button.
- On click: call edge function `get_oauth_url`, store `state` in sessionStorage, open URL in new tab.
- Show a "Waiting for eWeLink…" state while waiting.
- Listen for a `storage` event (or `focus` event on window) — when `ewelink_code` appears in
  sessionStorage (written by IntegrationsPage on redirect callback), auto-call `exchange_code`
  and advance.

### `src/components/integrations/IntegrationsPage.tsx`
On mount, check `window.location.search` for `?ewelink_code=<code>&state=<state>`.
If found:
- Write `ewelink_code` and `ewelink_state` to sessionStorage.
- Strip the query params from the URL (`history.replaceState`).
- Open the wizard at step 2 (Credentials step) so Step3 can pick up the code.

## Pre-requisite (one-time, manual)
The redirect URL `https://rhozly.com/integrations` must be registered in the eWeLink
developer console under the app's allowed redirect URLs. This must be done before testing.

## What stays the same
- Steps 1, 2, 4, 5 of the wizard — untouched.
- Ecowitt flow — untouched.
- Token encryption, `integrations` table upsert, device discovery — same logic, just moved
  into the `exchange_code` action.
- `WizardState` shape — `credentials` field becomes `{}` for eWeLink (no user creds stored
  in frontend state).

## Risks / notes
- eWeLink opens in a new tab (not a popup) for reliability on mobile PWA.
- The `state` CSRF check: Step3 validates that the `ewelink_state` from sessionStorage matches
  what came back in the URL before exchanging the code.
- No migration needed — `integrations` table schema is unchanged.
