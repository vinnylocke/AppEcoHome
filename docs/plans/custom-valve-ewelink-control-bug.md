# Custom valve control (turn on/off + status + battery)

## Goal

Make **custom (`custom_http`) water valves controllable** — the user can turn them on/off from Rhozly,
see live on/off status, and read battery — instead of the current behaviour where the valve detail
errors out trying to talk to eWeLink.

Two parts:
1. **Bug foundation:** the valve UI is provider-aware so a custom valve never calls the eWeLink edge
   functions.
2. **Feature:** implement the planned outbound-control path for `custom_http` valves (the adapter's own
   "*future PR … outbound POST-back pattern*").

## Root cause (the bug)

[`DeviceDetailModal.tsx:113`](../../src/components/integrations/DeviceDetailModal.tsx) renders the
eWeLink-hardcoded [`ValveControlPanel`](../../src/components/integrations/ValveControlPanel.tsx) for
**every** `water_valve`, no provider check. `ValveControlPanel` calls `integrations-ewelink-state` /
`integrations-ewelink-control`. A custom valve isn't on eWeLink → "expecting data from eWeLink".

## App-reference consulted

- [37-integration-contract.md](../app-reference/99-cross-cutting/37-integration-contract.md) — `control()` +
  `ControlCommand` (`valve_open`/`valve_close`) already in the contract; `connect()` can persist encrypted
  creds + integration metadata.
- [05-integrations-devices.md](../app-reference/07-management/05-integrations-devices.md) — Devices tab.
- [09-data-model-integrations.md](../app-reference/99-cross-cutting/09-data-model-integrations.md),
  [10-edge-functions-catalogue.md](../app-reference/99-cross-cutting/10-edge-functions-catalogue.md).

## ⚠️ Key constraint — cloud → device reachability

Rhozly's control runs in **Supabase's cloud edge runtime**, so it can only POST to a **publicly-routable
HTTPS URL**. The inbound webhook works from anywhere because the *device* initiates it; outbound control
is the reverse — Rhozly must reach the device. A valve on the home LAN (`192.168.x`) is **not reachable**
unless exposed via a relay / port-forward / MQTT bridge / Home Assistant Cloud / similar. This is inherent
and must be documented in the connect UX so users with local-only valves aren't surprised.

### Decisions (confirmed with user)

- **Both "public HTTPS device URL" and "cloud/vendor API" are supported by the same `control_url` field** —
  it's a public HTTPS endpoint either way (the device itself, or a vendor/relay cloud API). No separate
  modes.
- **Configurable request template (industry-standard pattern — like Home Assistant `rest_command`,
  Grafana, Zapier/n8n):** the user can override the **method**, **headers**, and **body** so any device /
  vendor shape works. Templating is **logic-less `{{variable}}` substitution** (Mustache-style; no helpers,
  no `eval` — pure replacement from a fixed variable map, so no injection/RCE).
  - **Variables:** `{{command}}` (`turn_on`/`turn_off`), `{{state}}` (`on`/`off`), `{{duration_seconds}}`,
    `{{duration_minutes}}`, `{{device_external_id}}`, `{{device_name}}`.
  - **Defaults (casual users never touch these):** method `POST`, header
    `Content-Type: application/json`, body
    `{"schema_version":1,"command":"{{command}}","duration_seconds":{{duration_seconds}}}`.
  - **Configurable headers also cover non-Bearer vendor auth** (e.g. `X-API-Key: …`) — so the earlier
    "Bearer-only" limitation is gone.
  - The connect/settings UI shows a **live preview** of the substituted request.

## Design

### 1. Capture the control request at connect — `_shared/integrations/adapters/customHttp.ts`

- Add a `kind: "textarea"` option to `ConnectFormField` (`contract.ts`) + render it in `Step3Credentials`
  — needed for the multi-line headers/body template.
- `describeConnectForm()` (custom_http): add **optional** fields, only meaningful for `water_valve`:
  - `control_url` (`text`) — public **HTTPS** endpoint Rhozly POSTs commands to (device or vendor/relay API).
  - `control_method` (`text`, default `POST`).
  - `control_headers` (`textarea`, default `Content-Type: application/json`) — `Key: Value` per line,
    `{{…}}` allowed (covers `Authorization: Bearer …`, `X-API-Key: …`, etc.).
  - `control_body` (`textarea`, default
    `{"schema_version":1,"command":"{{command}}","duration_seconds":{{duration_seconds}}}`) — `{{…}}` allowed.
- `connect()`: when `family === water_valve` and `control_url` is set → validate **https + non-private host**
  (reject `http://`, loopback, RFC-1918, link-local `169.254.*`, `::1`, `fc00::/7`); validate the body
  template renders to valid JSON when the headers declare a JSON content-type; reject CRLF in header lines.
  Store `{ control_url, control_method, control_headers, control_body }` in `credsToStore` (encrypted) and
  set `device.metadata.controllable = true`. No URL ⇒ `controllable` falsy (read-only valve).

### 2. Implement `customHttpAdapter.control(device, command, creds)`

- Require `creds.control_url`; else throw `valve_not_controllable`. Re-validate https + non-private.
- Build the variable map: `{ command, state, duration_seconds, duration_minutes, device_external_id,
  device_name }`.
- `renderTemplate()` (new `_shared/integrations/template.ts`, pure) — logic-less `{{var}}` replacement from
  the map; **unknown placeholders error** (typo protection); no expression eval. Apply to method / each
  header value / body.
- Re-validate the rendered body is JSON (when JSON content-type) and rendered header values have no CRLF.
- `fetch(url, { method, headers, body })` with an `AbortController` ~8 s timeout; non-2xx → throw with the
  status + a short body snippet.

### 3. New dispatcher edge fn `supabase/functions/integrations-adapter-control/`

Provider-generic (mirrors `integrations-ewelink-control` + `integrations-adapter-connect`):
auth → load `water_valve` device → **membership + `integrations.control` permission** (`can()`) →
load integration, `decryptCredentials` → `getAdapter(integration.provider).control(deviceRow, cmd, creds)`
→ on success write `device_commands` (with `auto_off_at`) + `insertReading` optimistic `{state}` →
return `{ success, autoOffAt }`. Real reason surfaced in the JSON body (panel reads `error.context`).

### 4. Provider-aware `ValveControlPanel.tsx`

Add `provider` + `controllable` props. Branch:
- **eWeLink** → existing `integrations-ewelink-state` / `integrations-ewelink-control` (unchanged).
- **custom_http + controllable** → state from latest `device_readings` row; commands via
  `integrations-adapter-control`. Auto-off: pass `duration_seconds`, record `auto_off_at`, show the same
  optimistic countdown (firmware self-enforces, like eWeLink's countdown).
- **custom_http, not controllable** → read-only state display (no buttons) + "control isn't configured for
  this valve" note. **No eWeLink calls in any branch.**

`DeviceDetailModal.tsx`: pass `device.provider` + `device.metadata.controllable` to the panel.

### 5. Status + battery (already wired — just surfaced)

Battery shows via `BatteryPip` (`device.battery_percent`, dual-written from the valve payload's
`battery_percent`). Status comes from the latest `device_readings` `{state}` for custom valves. No new
plumbing.

## Files changed

| File | Change |
|------|--------|
| `_shared/integrations/contract.ts` | add `kind: "textarea"` to `ConnectFormField` |
| `_shared/integrations/template.ts` (new) | pure logic-less `{{var}}` renderer (Deno) |
| `_shared/integrations/urlSafety.ts` (new) | pure https + non-private-host validator |
| `_shared/integrations/adapters/customHttp.ts` | control connect fields + validation; implement `control()` |
| `supabase/functions/integrations-adapter-control/index.ts` (new) | generic control dispatcher |
| `src/lib/payloadTemplate.ts` (new) | frontend mirror of the `{{var}}` renderer for the **live preview** (runtime boundary ⇒ can't import the Deno copy; both tiny + each tested) |
| `src/lib/valveControl.ts` (new) | `valveControlMode(provider, controllable)` → `"ewelink" \| "custom" \| "readonly"` |
| `src/components/integrations/ValveControlPanel.tsx` | provider-aware state + control |
| `src/components/integrations/DeviceDetailModal.tsx` | pass provider + controllable |
| `src/components/integrations/wizard/Step3Credentials.tsx` | render `textarea` fields + reachability hint + live request preview |

No DB migration — `device_commands` exists, creds on `integrations.credentials_encrypted`,
`controllable` on `device.metadata`, `integrations.control` permission exists.

## Tests (mandatory)

- **Deno** `template.test.ts` — `{{var}}` substitution, **unknown placeholder errors**, no expression eval,
  number vs string rendering.
- **Deno** `urlSafety.test.ts` — https + private-range matrix.
- **Deno** `customHttpControl.test.ts` — `control()` rejects no-url / http / private host; renders the
  templated body + headers correctly; surfaces non-2xx (stub `fetch`).
- **Deno** — `connect()` stores templated control creds + `controllable`; rejects invalid url / non-JSON body
  under a JSON content-type / CRLF in headers.
- **Vitest** `tests/unit/lib/payloadTemplate.test.ts` — frontend renderer matches the Deno one (preview parity).
- **Vitest** `tests/unit/lib/valveControl.test.ts` — `valveControlMode` truth table.
- E2E (seeded controllable custom valve + stubbed outbound) noted as a follow-up.

## Docs

- `37-integration-contract.md`: `custom_http` now implements `control()`; document outbound POST shape +
  reachability + SSRF guard. `05-integrations-devices.md`: provider-aware control + custom-valve setup.
  `10-edge-functions-catalogue.md`: add `integrations-adapter-control`. e2e-test-plan + TESTING.md counts.

## Security

- **No template logic** — pure `{{var}}` substitution from a fixed map; unknown placeholders error; no
  Handlebars helpers / no `eval` ⇒ a malicious template can't execute code.
- **URL:** https-only + private-range block at both connect-validation and control-time. Full DNS-rebinding
  protection is a deeper follow-up (noted).
- **Headers:** reject CRLF in rendered header values (header-injection); whole control config (incl. any
  API key in a header) is encrypted at rest in `integrations.credentials_encrypted`.
- **Body:** validated as JSON when the content-type is JSON.
- **Outbound `fetch` timeout** (~8 s); `integrations.control` permission enforced by the dispatcher.

## Out of scope (follow-ups)

- Editing the control URL post-connect (today: reconnect). 
- Wiring custom valves into `integrations-dead-mans-switch` (cloud-side auto-off if firmware doesn't honour
  the duration) and the existing valve command queue.
- Migrating eWeLink itself onto this generic dispatcher.
