# Plan — eWeLink Integration Unit Tests

## Goal

Verify the eWeLink OAuth signing, header construction, device control payload building,
and state parsing logic are all correct before any live testing. Tests run locally via
`npm run test:functions` — no network calls, no eWeLink account, no real device needed.

---

## The extraction problem

The testable business logic in all three eWeLink functions is embedded directly in their
`Deno.serve` handlers — it can't be imported by a test file. The first step is extracting
the pure logic into two shared modules. This is pure reorganisation with no behaviour change.

---

## Files changing

### New: `supabase/functions/_shared/integrations/ewelinkAuth.ts`
Extracted, exported functions from `integrations-ewelink-connect/index.ts`:
- `hmacSign(secret, message)` — HMAC-SHA256 then Base64
- `ewelinkHeaders(appId, appSecret, body)` — builds the five required eWeLink v2 request headers
- `buildOAuthUrl(appId, appSecret, redirectUrl)` — extracted from the `get_oauth_url` action;
  returns `{ oauthUrl, state }` — testable without a running server

### New: `supabase/functions/_shared/integrations/ewelinkDevice.ts`
Extracted, exported functions from `integrations-ewelink-control` and `integrations-ewelink-state`:
- `buildControlPayload(meta, command, durationSeconds?)` — returns `{ apiPath, payload }`:
  the full URL path and request body for a turn_on/turn_off command, handling both
  direct-device and sub-device (Zigbee Bridge Pro) variants
- `resolveEffectiveDuration(durationSeconds?, meta?)` — duration fallback chain:
  arg → `meta.default_duration_seconds` → 1800
- `parseDeviceState(stateJsonData)` — extracts `"on" | "off"` from a device status response,
  handling both `params.switch` (direct) and `params.switches[0].switch` (sub-device) shapes

### Modified: `supabase/functions/integrations-ewelink-connect/index.ts`
- Remove local `hmacSign` and `ewelinkHeaders` definitions
- Import from `../_shared/integrations/ewelinkAuth.ts`
- Call `buildOAuthUrl` from the same module for the `get_oauth_url` action

### Modified: `supabase/functions/integrations-ewelink-control/index.ts`
- Import `buildControlPayload` and `resolveEffectiveDuration` from `ewelinkDevice.ts`
- Replace the inline `if (meta.use_sub_device)` block with a `buildControlPayload` call

### Modified: `supabase/functions/integrations-ewelink-state/index.ts`
- Import `parseDeviceState` from `ewelinkDevice.ts`
- Replace inline state extraction with a `parseDeviceState` call

### New: `supabase/tests/integrations/ewelink.test.ts`

---

## Tests

### OAuth signing (`ewelinkAuth.ts`)

**`hmacSign` — determinism and correctness**
- Known input `(secret="test_secret", message="test_body")` produces a stable Base64 string
- Different messages produce different signatures
- The signature for `get_oauth_url` input (`${appId}_${seq}`) matches a precomputed value

**`ewelinkHeaders` — structure**
- Returns exactly the five required keys: `Content-Type`, `X-CK-Appid`, `X-CK-Nonce`, `X-CK-Ts`, `Authorization`
- `X-CK-Appid` equals the `appId` argument
- `Authorization` starts with `"Sign "`
- `X-CK-Nonce` is exactly 8 characters
- `X-CK-Ts` is a numeric string (parseable integer, close to `Date.now() / 1000`)
- Signing is body-dependent — same appId/appSecret, different body → different `Authorization`

**`buildOAuthUrl` — URL parameter correctness**
- Returned URL contains all six required params: `clientId`, `seq`, `authorization`, `redirectUrl`, `state`, `nonce`
- `redirectUrl` param is URL-encoded (contains `%3A` not `:`)
- `state` is a non-empty UUID-shaped string
- Two calls produce different `state` values

---

### Device control (`ewelinkDevice.ts`)

**`buildControlPayload` — direct device, turn on**
- `apiPath` is `/v2/device/thing/status`
- `payload.id` is `meta.direct_device_id`
- `payload.params.switch` is `"on"`
- `payload.params.countdown` equals `durationSeconds`

**`buildControlPayload` — direct device, turn off**
- `apiPath` is `/v2/device/thing/status`
- `payload.params.switch` is `"off"`
- `payload.params.countdown` is **absent** (no countdown on off)

**`buildControlPayload` — sub-device, turn on**
- `apiPath` is `/v2/device/thing/sub/status`
- `payload.id` is `meta.parent_device_id`
- `payload.params.switches[0].switch` is `"on"`
- `payload.params.switches[0].outlet` is `0`
- `payload.params.switches[0].countdown` equals `durationSeconds`
- `payload.params.subDevId` equals `meta.sub_device_id`

**`buildControlPayload` — sub-device, turn off**
- `apiPath` is `/v2/device/thing/sub/status`
- `payload.params.switches[0].switch` is `"off"`
- `payload.params.switches[0].countdown` is **absent**

**`resolveEffectiveDuration` — fallback chain**
- Explicit arg takes priority
- Falls back to `meta.default_duration_seconds` when arg is undefined
- Falls back to `1800` when both are absent

**`parseDeviceState` — response shape variants**
- `{ params: { switch: "on" } }` → `"on"`
- `{ params: { switch: "off" } }` → `"off"`
- `{ params: { switches: [{ switch: "on" }] } }` → `"on"` (sub-device shape)
- `{ params: { switches: [{ switch: "off" }] } }` → `"off"`
- `{ params: {} }` → `"off"` (missing field defaults to off)

---

## What is NOT tested here

- The actual HTTP calls to eWeLink (requires live token + device — out of scope for unit tests)
- DB reads/writes (auth, membership checks, device_commands insert — DB mock would add noise without value)
- Token encryption/decryption (`encrypt.ts` has its own test surface if needed separately)
- Frontend component wiring (covered by E2E tests)

---

## How to run

```bash
npm run test:functions
```

All tests run in Deno with no network access and no secrets needed.

---

## Risks

None — extraction is pure refactoring. All three `index.ts` files call the same logic
via the shared module, so runtime behaviour is identical.
