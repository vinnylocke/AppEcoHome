# Custom Integrations — Test Webhook Simulator + Device Battery Level

**Date:** 2026-06-16
**Status:** Plan — awaiting approval
**Supersedes:** none (extends [custom-integrations-framework-2026-06-16.md](./custom-integrations-framework-2026-06-16.md))

---

## Problem / Goal

Two related gaps in the just-shipped Custom HTTP integration:

1. **No way to validate the integration end-to-end without real firmware.** After running the Connect wizard you get a webhook URL + secret, but there's no in-app way to fire a test POST at it. Today you have to drop into curl/Postman, paste the URL, hand-craft the JSON, and watch the DB. This blocks (a) us testing the stack with `test1@rhozly.com`, and (b) any user trying to debug their own DIY firmware ("did I format the JSON right?").
2. **No device health visibility.** The contract has no field for battery level. A battery-powered soil probe that's about to die looks identical to a healthy one — until the readings stop. Users (and the AI assistant) need a way to see "this sensor is at 18% — replace soon."

Both are best solved at the contract level once, before more adapters land and lock the shape in.

---

## App-reference files consulted

- [docs/app-reference/99-cross-cutting/37-integration-contract.md](../app-reference/99-cross-cutting/37-integration-contract.md) — current adapter contract, three webhook auth styles, payload shape for soil + valve, `device_external_id` matching
- [docs/app-reference/07-management/05-integrations-devices.md](../app-reference/07-management/05-integrations-devices.md) — Devices Tab component graph (`DeviceCard`, `DeviceDetailModal`, `DeviceSettingsModal`, `ConnectDeviceWizard`), `Device` shape, `integrations.view` / `manage` / `control` permissions, `soil_readings` + `valve_events` write paths
- [docs/app-reference/99-cross-cutting/09-data-model-integrations.md](../app-reference/99-cross-cutting/09-data-model-integrations.md) — `integrations` + `devices` table schema, RLS shape
- [docs/app-reference/99-cross-cutting/10-edge-functions-catalogue.md](../app-reference/99-cross-cutting/10-edge-functions-catalogue.md) — `integrations-webhook-router`, `integrations-adapter-connect`
- [docs/app-reference/99-cross-cutting/19-rls-patterns.md](../app-reference/99-cross-cutting/19-rls-patterns.md) — home-scoped `integrations.manage` permission gate

## Source files consulted

- [supabase/functions/_shared/integrations/adapters/customHttp.ts](../../supabase/functions/_shared/integrations/adapters/customHttp.ts) — `parseSoilPayload`, `parseValvePayload`, `generateWebhookSecret`
- [supabase/functions/_shared/integrations/contract.ts](../../supabase/functions/_shared/integrations/contract.ts) — `ProviderAdapter`, `NormalisedReading`, `ConnectFormField`
- [supabase/functions/_shared/integrations/readings.ts](../../supabase/functions/_shared/integrations/readings.ts) — `insertReading`
- [supabase/functions/integrations-webhook-router/index.ts](../../supabase/functions/integrations-webhook-router/index.ts) — the public endpoint
- [src/components/integrations/DeviceDetailModal.tsx](../../src/components/integrations/DeviceDetailModal.tsx), [DeviceSettingsModal.tsx](../../src/components/integrations/DeviceSettingsModal.tsx), [DeviceCard.tsx](../../src/components/integrations/DeviceCard.tsx)

---

## Approach

### Part A — Battery level on the contract

**Payload contract** (backwards-compatible — `battery_percent` is optional, so `schema_version` stays at `1`):

```jsonc
// soil_sensor — added field
{
  "schema_version": 1,
  "device_external_id": "probe-1",
  "soil_moisture": 42,
  "soil_temp": 18,
  "soil_ec": 1200,
  "ec_source": "calibrated_us_cm",
  "battery_percent": 87,      // NEW — 0–100 integer, optional
  "recorded_at": "2026-06-16T09:00:00Z"
}

// water_valve — added field
{
  "schema_version": 1,
  "device_external_id": "valve-1",
  "state": "on",
  "battery_percent": 87,      // NEW — optional
  "recorded_at": "2026-06-16T09:00:00Z"
}
```

**Schema** — battery state lives on `devices`, not on each reading. Reading-level battery would just bloat the time-series; the "latest known battery" is what the UI needs.

```sql
ALTER TABLE public.devices
  ADD COLUMN battery_percent SMALLINT NULL
    CHECK (battery_percent IS NULL OR (battery_percent BETWEEN 0 AND 100)),
  ADD COLUMN battery_reported_at TIMESTAMPTZ NULL;
```

Migration file: `supabase/migrations/20260723000000_devices_battery_level.sql`.

**Parsers** — `parseSoilPayload` + `parseValvePayload` each return `battery_percent` alongside the reading data when present. Range-check 0–100; reject `battery_percent_out_of_range` if invalid.

**Webhook router** — when a reading is written, also `UPDATE devices SET battery_percent = $1, battery_reported_at = now() WHERE id = $2` if the parsed payload included one. Keep this as a single statement after `insertReading`; one extra round-trip per webhook is fine.

**UI** — battery pip on `DeviceCard` (a small icon + percentage when `battery_percent IS NOT NULL`, colour-graded: green ≥50, amber 20–49, red <20). Same pip in `DeviceDetailModal` header. No new modal — keep it small.

### Part B — Webhook details panel in Device Settings

Today the webhook URL is only shown in the postConnect block of Step 4 of the Connect wizard — and only once. If the user closes the wizard before copying, they're locked out. The simulator needs the URL too, so this is on the critical path.

Add a **"Webhook details"** section to `DeviceSettingsModal`, visible only when the integration's adapter is webhook-capable (probe via `adapter.parseWebhook` existence — but client-side we'll just check `integration.provider === "custom_http"` for now since that's the only one):

- Read-only URL field with copy button (reconstructs the URL from `window.location.origin` + the supabase functions URL pattern + the stored secret).
- "Reveal secret" toggle (eye icon) → masked by default.
- "Regenerate secret" button → POSTs to a new `integrations-rotate-webhook-secret` edge function that generates a new 256-bit secret, writes it to `integrations.metadata.webhook_secret`, and returns the new URL. Confirms first ("Existing firmware will stop posting until you update its URL").
- "Show sample payload" expander — re-uses the same content the wizard's postConnect step showed.

This is a real product feature, not just a testing crutch — users WILL lose their webhook URL and ask "how do I get it back."

### Part C — Test Webhook simulator

New component `src/components/integrations/TestWebhookModal.tsx`, opened from a **"Send test reading"** button in `DeviceDetailModal`. Permission-gated by `integrations.manage`.

Layout:

```
┌─ Send a test reading ───────────────────────────┐
│  This sends a fake reading to your webhook,     │
│  just like a real device would. Useful for      │
│  validating your firmware's JSON shape or       │
│  checking the integration works end-to-end.     │
│                                                  │
│  Webhook URL:  https://…/custom_http/****  [📋] │
│                                                  │
│  Sample payload (edit before sending):          │
│  ┌────────────────────────────────────────────┐ │
│  │ {                                          │ │
│  │   "schema_version": 1,                     │ │
│  │   "device_external_id": "probe-greenhouse",│ │
│  │   "soil_moisture": 45,                     │ │
│  │   "soil_temp": 18,                         │ │
│  │   "soil_ec": 1200,                         │ │
│  │   "battery_percent": 87                    │ │
│  │ }                                          │ │
│  └────────────────────────────────────────────┘ │
│                                                  │
│  [Reset to sample]                  [Send →]    │
│                                                  │
│  ─── Response ──────────────────────────────────│
│  ✅ 200 OK — 1 reading written                   │
│                                                  │
│  Latest reading:                                 │
│  • Moisture: 45%                                 │
│  • Temp: 18°C                                    │
│  • EC: 1200 µS/cm                                │
│  • Battery: 87%                                  │
│  • Recorded: 2 seconds ago                       │
└─────────────────────────────────────────────────┘
```

Behaviour:

- Pre-fills `device_external_id` from the row, and a sensible default payload for the device's family (soil vs valve).
- POST goes directly from the browser to the public webhook router, with the secret in the `X-Rhozly-Token` header (NOT in the URL — so the user can keep DevTools open without leaking the secret in the path).
- Response panel shows the HTTP status, the router's JSON (`{ok: true, written: N}` or the error shape), and on success it re-queries `soil_readings` / `valve_events` for the newest row and displays it formatted — closes the loop ("did my POST become a real DB row?").
- No backend code needed — it's just a browser → public webhook fetch.

### Part D — Streaming mode for the simulator

The one-shot Send button validates the JSON shape and proves the pipeline works, but it can't exercise time-series UI (history charts, AI evaluation that looks for trends, the battery decay sparkline from Part E). A streaming mode does.

UI sits inside `TestWebhookModal` as a second tab — **"Single"** (the one-shot from Part C) and **"Stream"**:

```
┌─ Stream test readings ─────────────────────────┐
│  Interval:  [ 30s ▾ ]  (min 30s)               │
│  Duration:  [ 5 min ▾ ]  (max 1 hour)          │
│                                                 │
│  Vary values:  ☑ random-walk between bounds    │
│    soil_moisture:  min [ 30 ]  max [ 60 ]      │
│    soil_temp:      min [ 14 ]  max [ 22 ]      │
│    battery decay:  ☑ drop ~1% / 100 readings   │
│                                                 │
│  [ Start streaming ]                            │
│                                                 │
│  ─── Live log ─────────────────────────────────│
│  Sent: 12  ·  Failed: 0  ·  Last: 200 OK       │
│  09:00:00 ✓ moisture=45 battery=87             │
│  09:00:30 ✓ moisture=47 battery=87             │
│  09:01:00 ✓ moisture=44 battery=87             │
│  …                                              │
│                                                 │
│  [ Stop ]                                       │
└────────────────────────────────────────────────┘
```

Behaviour:

- Pure client-side `setInterval`. Closing the tab stops the stream — no infrastructure to provision, no risk of runaway jobs. Documented in the modal.
- Hard limits: **minimum interval 30s, maximum duration 1h, max 120 requests per session.** Belt-and-braces against accidental self-DOS.
- Random-walk drift: each tick perturbs each numeric field by ±5% of its range, clamped to bounds. This produces wiggly history charts that actually look like real sensor data.
- Battery decay: optional checkbox that decrements `battery_percent` by 1 every N readings (configurable, defaults to 100). Lets you watch the pip transition green → amber → red in seconds.
- Live log auto-trims to last 20 entries to keep the modal manageable.
- "Stop" cleanly cancels the interval; if the modal is closed mid-stream we cancel in the cleanup effect.

### Part E — Battery history (sparkline + days-remaining)

Battery on the device row (Part A) gives "what's the current state." Battery history gives "is it decaying faster than expected, and when do I need to swap it." That's the question users actually want to ask once they have more than one or two devices.

**Schema** — add `battery_percent SMALLINT NULL` to both reading tables (not a separate table — keeps writes single-statement and queries cheap):

```sql
ALTER TABLE public.soil_readings
  ADD COLUMN battery_percent SMALLINT NULL
    CHECK (battery_percent IS NULL OR (battery_percent BETWEEN 0 AND 100));

ALTER TABLE public.valve_events
  ADD COLUMN battery_percent SMALLINT NULL
    CHECK (battery_percent IS NULL OR (battery_percent BETWEEN 0 AND 100));
```

Webhook router writes battery into the reading row (via `insertReading`'s `data` payload) AND updates `devices.battery_percent` as a single "latest known" cache. The duplication is intentional: the reading-table column powers history; the device-row column powers fast list rendering without a per-card history query.

**UI — `DeviceBatteryPanel`** new component in DeviceDetailModal:

- Sparkline of `battery_percent` over the last 30 days from the reading table (recharts; existing dep).
- "Estimated days remaining" computed by linear regression on the last 14 days of non-null battery readings. Only shown when there are ≥10 data points and the slope is negative; otherwise hidden (avoids "Estimated: 9,999 days" when the line is flat).
- "Battery was changed?" affordance — manual button that records a battery_reset event so the regression resets its window. Stored as a row in a new tiny table `device_battery_resets (device_id, occurred_at, recorded_by)` — keeps the regression honest.

**AI integration** is out of scope here but the schema is shaped so a future Pattern Detector can read `soil_readings.battery_percent` directly to surface "your greenhouse probe will need a new battery in ~8 days" insights.

### Provider scope

Still custom_http only. Ecowitt + eWeLink will get their own approach when they're migrated to the adapter contract — both providers report battery in their existing payloads, so the columns are ready for them when that happens.

---

## Files to change

### Migrations
- **NEW** `supabase/migrations/20260723000000_devices_battery_level.sql` — adds `battery_percent`, `battery_reported_at` columns on `devices`.
- **NEW** `supabase/migrations/20260723000001_readings_battery_history.sql` — adds `battery_percent` column on `soil_readings` and `valve_events`; creates `device_battery_resets` table (with grants per the 2026-10-30 PostgREST exposure rule) + RLS.

### Edge functions
- **EDIT** `supabase/functions/_shared/integrations/adapters/customHttp.ts` — `parseSoilPayload` + `parseValvePayload` extract `battery_percent`, range-check 0–100.
- **EDIT** `supabase/functions/integrations-webhook-router/index.ts` — pass `battery_percent` into `insertReading`'s `data` payload (so it lands in the reading row); separately, after the insert, update `devices.battery_percent` + `devices.battery_reported_at` if the reading carried one.
- **EDIT** `supabase/functions/_shared/integrations/readings.ts` — `insertReading` accepts and writes `battery_percent` to the appropriate column on whichever table it's inserting into.
- **NEW** `supabase/functions/integrations-rotate-webhook-secret/index.ts` — generates new 256-bit secret, writes to `integrations.metadata.webhook_secret`, returns new URL. JWT-verified; gated by `integrations.manage`.

### UI
- **EDIT** `src/components/integrations/DeviceCard.tsx` — battery pip when `device.battery_percent IS NOT NULL`.
- **EDIT** `src/components/integrations/DeviceDetailModal.tsx` — battery pip in header; mount `DeviceBatteryPanel` when device has any battery readings; "Send test reading" button (visible only for custom_http devices) opens `TestWebhookModal`.
- **EDIT** `src/components/integrations/DeviceSettingsModal.tsx` — "Webhook details" section (URL + reveal-secret toggle + regenerate button + sample-payload expander), shown only when `integration.provider === "custom_http"`.
- **NEW** `src/components/integrations/TestWebhookModal.tsx` — two tabs (Single / Stream): payload editor + Send + response panel for one-shot; interval/duration/drift controls + live log for streaming.
- **NEW** `src/components/integrations/DeviceBatteryPanel.tsx` — sparkline + days-remaining + "Battery changed" reset button.
- **NEW** `src/lib/batteryEstimate.ts` — pure linear-regression helper used by `DeviceBatteryPanel`. Returns `{ slope, daysRemaining } | null` when there's enough data.
- **EDIT** `src/components/integrations/wizard/Step4Discovery.tsx` — pre-existing postConnect block now also shows `battery_percent` in the sample payload.

### Types
- **EDIT** `src/types.ts` — `Device` interface gets `battery_percent: number | null` and `battery_reported_at: string | null`.

### Tests
- **EDIT** `supabase/tests/customHttpAdapter.test.ts` — new cases:
  - `parseSoilPayload — battery_percent accepted`
  - `parseSoilPayload — battery_percent out of range rejected`
  - `parseValvePayload — battery_percent accepted`
- **NEW** `tests/unit/lib/batteryEstimate.test.ts` — Vitest cases for the regression helper:
  - Returns `null` with fewer than 10 points
  - Returns `null` when slope is non-negative (flat or rising)
  - Returns sensible `daysRemaining` for a clean linear decay
  - Handles noisy/jagged data without exploding
- **NEW** `tests/unit/components/integrations/TestWebhookModal.test.tsx` — Vitest tests for both tabs:
  - Single tab: pre-fills payload, sends, parses response, displays formatted reading. Mocks the fetch.
  - Stream tab: starts interval, fires N requests over fake timers, drift stays within bounds, Stop cancels cleanly, modal close cleans up.
- **EDIT** `tests/e2e/specs/integrations.spec.ts` (if it exists; otherwise note as TODO) — add a smoke test: open device → open Test Webhook → Single mode send → verify reading appears in the panel; stream mode 30s × 3 → verify history chart populates.

### Docs
- **EDIT** [docs/app-reference/99-cross-cutting/37-integration-contract.md](../app-reference/99-cross-cutting/37-integration-contract.md) — add `battery_percent` to both payload contracts; document range + behaviour; note `device_battery_resets` semantics.
- **EDIT** [docs/app-reference/07-management/05-integrations-devices.md](../app-reference/07-management/05-integrations-devices.md) — new "Battery health pip + decay sparkline" + "Test Webhook flow (Single + Stream)" + "Webhook details panel" + "Regenerate webhook secret" sections; data flow gets `integrations-rotate-webhook-secret` row; component graph adds `TestWebhookModal` + `DeviceBatteryPanel`.
- **EDIT** [docs/app-reference/99-cross-cutting/10-edge-functions-catalogue.md](../app-reference/99-cross-cutting/10-edge-functions-catalogue.md) — `integrations-rotate-webhook-secret` row.
- **EDIT** [docs/app-reference/99-cross-cutting/09-data-model-integrations.md](../app-reference/99-cross-cutting/09-data-model-integrations.md) — document new `devices.battery_*` columns, new battery columns on reading tables, new `device_battery_resets` table + its RLS.
- **EDIT** [docs/e2e-test-plan/](../e2e-test-plan/) — add Test Webhook simulator (Single + Stream) + battery history test rows to the Integrations surface file.

### Release notes
- **EDIT** `release-notes.json` — 4 items: (1) battery level + health pip, (2) battery decay sparkline + days-remaining, (3) Test Webhook simulator with Single + Stream modes, (4) Webhook details panel with reveal/regenerate.

---

## Risks / edge cases

- **Secret rotation breaks live firmware.** Mitigated by an explicit confirmation modal. Considered keeping the old secret active for a grace period — rejected as complexity that doesn't match the audience (DIY users can update their firmware in 30 seconds).
- **Battery `0%` ambiguity.** Some firmware uses `0` to mean "unknown" rather than "dead." We treat `0` as a real reading (red pip). Documented in the contract. If this turns out to be wrong, we can later treat `null` vs `0` distinctly without a migration.
- **Browser POSTing directly to the webhook router exposes the secret in DevTools.** Acceptable — the secret IS the auth, the user already has it, and the simulator is gated by `integrations.manage` (the same permission needed to read the secret in the first place).
- **CORS.** The webhook router already responds with `Access-Control-Allow-Origin: *` and lists `X-Rhozly-Token` in `Access-Control-Allow-Headers`, so a browser POST will work without code changes.
- **TestWebhookModal showing a stale "latest reading"** if a real device posts simultaneously. Mitigated by querying after the POST returns and labelling the reading with its timestamp.
- **Streaming mode keeps firing if the tab is hidden but not closed.** Acceptable — fixed-duration cap stops it in ≤1h regardless. Documented in the modal.
- **Streaming mode interaction with `device_readings` write-rate limits** (if any exist downstream). With min interval 30s and cap of 120 requests, peak load is ~4 req/min for ≤1 user at a time — far below any realistic rate ceiling.
- **Battery sparkline polluted by battery-change events.** Solved by `device_battery_resets` — the regression window starts after the most recent reset. Without this, a single battery swap would make the trendline look like a sudden recharge.
- **Write amplification from battery in reading rows.** Adds 2 bytes (SMALLINT) per row across `soil_readings` + `valve_events`. At seed-level test data sizes this is negligible; at production scale it's still ≤1% of row size. No new index required — battery queries are always device-scoped + time-windowed, riding the existing `(device_id, recorded_at)` index.
- **Days-remaining estimate misleading early on.** Hidden until ≥10 data points + negative slope, so it never shows for fresh devices. Bounded display: clamp at `0` and `999` so we never render `-12` or `Infinity`.

---

## Alternatives considered

- **Server-rendered simulator.** Rejected — adds an edge function for no value over a direct browser POST.
- **Battery only on `devices` row, no history.** Was the original Part A scope; expanded into Part E once we decided to fold history in. The two work together: device row for "right now", reading rows for the sparkline.
- **Dedicated `device_battery_log` table for history.** Rejected — adds a third table to write per webhook, no obvious sampling-rate win over inline-on-reading. If we later want different sampling we can migrate the column out.
- **Admin-only simulator (matching the user's original framing).** Rejected in favour of making it a real user-facing feature — same code, more product value.
- **Server-side cron for the streaming simulator.** Rejected — runaway jobs are a real risk if something traps the cancel signal. Browser interval is naturally bounded by the tab lifecycle.

---

## Mid-implementation corrections (2026-06-16)

While reading the surrounding code, two things turned out different from the plan as drafted:

1. **No separate `soil_readings` / `valve_events` time-series tables exist.** All sensor readings (soil + valve state) land in a single `device_readings (device_id, home_id, recorded_at, data jsonb)` table. `valve_events` exists but it records *control commands* issued from Rhozly, not inbound webhook state. The fix is cleaner: `battery_percent` rides inside the existing `data` jsonb (joined by family), so Part E needs **zero schema change** on the reading table. The aggregate RPC `aggregate_device_readings` is left as-is — battery is read directly from `device_readings.data->>'battery_percent'` for the sparkline.

2. **Two pre-existing Phase 3 bugs blocked the end-to-end stack from ever working:**
   - The `integrations.provider` CHECK constraint was still `('ecowitt', 'ewelink')` — so a `custom_http` integration row would have been rejected. Added an `ALTER TABLE … DROP CONSTRAINT … ADD CONSTRAINT …` to the new migration to widen it.
   - `integrations-adapter-connect` returned the discovered devices in the response but never INSERTed them into the `devices` table. The wizard's post-connect step rendered, but no device row existed, so the webhook router's `(integration_id, external_device_id)` lookup would always fail with `device_not_found`. Fixed in the dispatcher: it now upserts a `devices` row per discovered device before returning.

Both fixes ship in the same commit as the Test Simulator + Battery work because the test simulator can't validate the stack until they're applied. Release notes call this out explicitly.

## Plan size

Medium-large. ~7 hours of focused work:

- Migrations (devices battery + reading-row battery + `device_battery_resets` table): 30 min
- Adapter parsers + webhook router + `insertReading` battery wiring: 30 min
- Battery pip on DeviceCard + Detail header: 30 min
- `DeviceBatteryPanel` (sparkline + days-remaining + reset button) + `batteryEstimate.ts`: 90 min
- Webhook details panel + `integrations-rotate-webhook-secret` edge fn: 60 min
- `TestWebhookModal` — Single tab: 60 min
- `TestWebhookModal` — Stream tab (interval, drift, live log, cleanup): 90 min
- Tests (Deno + Vitest + Playwright smoke) + docs + release notes: 90 min

Order of build matches the above — each step deploys-and-tests cleanly on top of the previous, so we can bail at any midpoint without leaving partial features in the UI.
