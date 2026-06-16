# Integration Contract — `ProviderAdapter`

> The contract every new device integration implements. Lets the Connect wizard, the shared poll cron, and the webhook router treat all providers uniformly so adding a new device family becomes "ship an adapter" instead of "wire seven edge functions by hand."

**Source files:**
- [`supabase/functions/_shared/integrations/contract.ts`](../../../supabase/functions/_shared/integrations/contract.ts) — the interface
- [`supabase/functions/_shared/integrations/registry.ts`](../../../supabase/functions/_shared/integrations/registry.ts) — `getAdapter()` / `listAdapters()`
- [`supabase/functions/_shared/integrations/adapters/customHttp.ts`](../../../supabase/functions/_shared/integrations/adapters/customHttp.ts) — first formal adapter; canonical reference implementation

---

## Quick summary

Three call sites use the adapter interface:

| Surface | Function | What the adapter provides |
|---|---|---|
| Connect wizard (Step 2 brand picker) | `listAdapters()` | A row per registered adapter with display name + description |
| Connect wizard (Step 3 credentials) | `adapter.describeConnectForm()` | Per-field descriptors so the form renders without provider-specific UI code |
| Connect dispatcher edge fn | `adapter.connect()` | Validates credentials, generates secrets (if needed), returns discovered devices + optional post-connect instructions |
| Shared cron poller (not yet built) | `adapter.poll()` | Optional — push-only providers omit it |
| Valve control | `adapter.control()` | Optional — only actuator families implement |
| Webhook router | `adapter.parseWebhook()` | Optional — only webhook-capable providers implement; the router authenticates by `integrations.metadata.webhook_secret` exact match and dispatches |

---

## Role 1 — Technical Reference

### The interface

```ts
export interface ProviderAdapter {
  readonly provider: string;                         // "custom_http"
  readonly families: ReadonlyArray<DeviceFamily>;    // ["soil_sensor", "water_valve"]
  readonly displayName: string;                       // Connect wizard label
  readonly description: string;                       // Connect wizard subtitle

  describeConnectForm(): ConnectFormField[];
  connect(input: ConnectInput): Promise<ConnectResult>;
  poll?(creds: Creds, devices: DeviceRow[]): Promise<NormalisedReading[]>;
  control?(device: DeviceRow, command: ControlCommand, creds: Creds): Promise<void>;
  parseWebhook?(req: Request, integrationMetadata: Record<string, unknown>): Promise<NormalisedReading[]>;
}
```

### Registry

[`registry.ts`](../../../supabase/functions/_shared/integrations/registry.ts) holds the canonical map of adapters keyed by `provider` string. New adapters register here:

```ts
const ADAPTERS: Record<string, ProviderAdapter> = {
  [customHttpAdapter.provider]: customHttpAdapter,
  // [futureAdapter.provider]: futureAdapter,
};
```

That's the only registration step. The Connect wizard's brand picker, the dispatcher, and the webhook router all look up adapters via `getAdapter(provider)` so no other code needs to change.

### Webhook authentication

Three accepted styles — the router tries them in this order, header wins when present:

1. `X-Rhozly-Token: <secret>` header — most secure, recommended for production firmware.
2. Path segment — `…/integrations-webhook-router/<provider>/<secret>`. Easiest for hobbyist firmware that may not support custom headers.
3. Query string — `…/integrations-webhook-router/<provider>?token=<secret>`. Fallback.

The secret is stored on `integrations.metadata.webhook_secret`, indexed by the partial expression index `idx_integrations_webhook_secret` for O(log N) lookup on every inbound webhook.

Secret rotation — `integrations-rotate-webhook-secret` (added 2026-06-16) generates a new 256-bit secret and writes it back to the metadata in one round-trip. Invoked from the Webhook details panel in `DeviceSettingsModal`. The old secret stops working immediately; firmware that hasn't been updated will start getting 401s until the operator rebakes the URL.

### Payload — `battery_percent` (added 2026-06-16)

Both `soil_sensor` and `water_valve` payloads accept an optional `battery_percent: 0–100` integer. The router writes battery into two places at once:

1. **`device_readings.data.battery_percent`** — joins the existing family-typed jsonb shape. Powers the sparkline + days-remaining regression in `DeviceBatteryPanel`. No schema change needed.
2. **`devices.battery_percent` + `devices.battery_reported_at`** — fast "latest known" columns updated on every webhook. Powers the colour-graded pip on `DeviceCard` without per-card history queries.

The adapter parsers (`parseSoilPayload`, `parseValvePayload`) snap fractional values to the nearest integer so the SMALLINT column stays honest. Out-of-range / non-numeric / negative values are rejected with `battery_percent_out_of_range` or `invalid_battery_percent`. `0` is a real reading (red pip), not a sentinel for "unknown" — firmware that doesn't have a battery signal should omit the field entirely.

When the user manually swaps a battery, they record it via the **"Battery changed?"** button in `DeviceBatteryPanel` → writes a row to `device_battery_resets (device_id, occurred_at)`. The days-remaining regression bounds its sliding window at the most recent reset, so a battery swap doesn't look like a recharge in the trendline.

### Legacy providers

Ecowitt and eWeLink predate this contract. They ship as direct per-provider edge functions (`integrations-ecowitt-*`, `integrations-ewelink-*`) and are NOT registered with `getAdapter()` today. They will be migrated to the contract in a follow-up — the existing code conceptually already does what the contract describes (connect / poll / webhook / control), so the migration is a lift-and-shift.

**Battery is wired through these legacy providers as of 2026-06-16** even though they haven't migrated to the contract yet. Both their parsers now extract battery and put it inside the `data` jsonb on the reading row; the centralised `insertReading` helper does the dual-write to `devices.battery_*` once. See [Battery dual-write](#battery-dual-write) below.

### Battery dual-write

`_shared/integrations/readings.ts` → `insertReading` is the single place battery information leaves the function and lands in the DB. Behaviour:

1. The full reading (including `battery_percent` when the adapter / sync function added one to the `data` object) is INSERTed into `device_readings`. This is what `DeviceBatteryPanel` reads to draw the sparkline + run the days-remaining regression.
2. If `data.battery_percent` is a finite 0-100 number (or the caller passed an explicit `batteryPercent` override), the helper UPDATEs `devices.battery_percent` + `devices.battery_reported_at` in a single round-trip — same batch as the existing `last_seen_at` refresh. Best-effort: a failure on this UPDATE does not fail the webhook / sync.

Adapters and provider sync code never write directly to `devices.battery_*`. They just put `battery_percent` in the reading and the dual-write happens for them. This keeps the contract one-sided: providers report; the shared layer persists.

### Edge functions

| Function | Role |
|---|---|
| `integrations-adapter-connect` | Dispatcher. Looks up adapter, validates home membership, calls `adapter.connect()`, persists the integration row AND upserts a `devices` row per discovered device (the original Phase 3 dispatcher forgot the device upsert — fixed 2026-06-16), then returns the discovered devices + optional post-connect block. Used by `Step3Credentials` when `brand === "custom_http"`. |
| `integrations-webhook-router` | Public endpoint. Authenticates via three secret-discovery paths, looks up the integration, dispatches to the adapter's `parseWebhook()`, writes one `device_readings` row per normalised reading, and refreshes `devices.battery_percent` + `devices.battery_reported_at` when the payload carries one. `verify_jwt = false` — secret IS the auth. |
| `integrations-rotate-webhook-secret` | Generates a new 256-bit secret for a custom_http integration. JWT-verified. Membership-gated against `home_members`. Returns the new full webhook URL so the caller can show it to the user immediately. |
| `integrations-ecowitt-*` (existing) | Legacy direct edge fns — to be migrated. |
| `integrations-ewelink-*` (existing) | Legacy direct edge fns — to be migrated. |

---

## Role 2 — Expert Gardener's Guide

### What this means for you in practice

If you've got a sensor or valve that Rhozly doesn't natively support — a DIY Arduino, a Home Assistant bridge, a custom-built ESP32 with a capacitive moisture probe — you can now connect it without anyone writing a single line of Rhozly code. Open Integrations → "Connect Device" → pick **Custom (HTTP webhook)** as the brand, give the device a friendly name, and Rhozly hands you back a webhook URL with a secret token baked in.

Point your device at that URL (its firmware needs to POST JSON in a documented shape — Rhozly shows you the shape with a sample payload + copy-to-clipboard) and the readings start flowing. They land in `device_readings` just like the readings from a WH52 do, which means:

- The area you've linked the device to starts showing your readings on its sensor panel + history charts.
- Sensor-driven automations can trigger off your readings — Greenhouse temp ≥ 30°C → notification, soil moisture ≤ 20% → open a valve, all built from the same UI.
- The AI care guides read your data via `areas.latest_soil_*`.

You get all of that for free because the area linkage and the automations engine read from `device_readings` directly, without caring which provider wrote the row.

### Common pitfalls

- **The webhook URL contains the secret.** Anyone who has the URL can write readings to your device. Treat it like a password — don't commit it to a public Git repo. Rotate via Device Settings if it leaks.
- **`device_external_id` is the matching key.** Rhozly looks up the device row by `(integration_id, device_external_id)`. If your firmware sends a different id than the one Rhozly assigned at connect, the readings get dropped (we log this at info level for diagnostics). Stick with the slug Rhozly generated.
- **Schema version.** Always send `"schema_version": 1`. We'll bump this if the payload shape ever needs to change; old versions will keep working for at least a year.

---

## Related reference files

- [Integrations — Devices Tab](../07-management/05-integrations-devices.md)
- [Integrations — Automations Tab](../07-management/06-integrations-automations.md)
- [Data Model — Integrations](./09-data-model-integrations.md)

## Code references for ongoing maintenance

- `supabase/functions/_shared/integrations/contract.ts`
- `supabase/functions/_shared/integrations/registry.ts`
- `supabase/functions/_shared/integrations/adapters/customHttp.ts`
- `supabase/functions/_shared/integrations/webhookAuth.ts`
- `supabase/functions/integrations-adapter-connect/index.ts`
- `supabase/functions/integrations-webhook-router/index.ts`
- `supabase/functions/integrations-rotate-webhook-secret/index.ts`
- `src/components/integrations/TestWebhookModal.tsx`
- `src/components/integrations/WebhookDetailsPanel.tsx`
- `src/components/integrations/DeviceBatteryPanel.tsx`
- `src/components/integrations/BatteryPip.tsx`
- `src/lib/batteryEstimate.ts`
- `supabase/migrations/20260722000000_custom_http_webhook_index.sql`
- `supabase/migrations/20260723000000_devices_battery_level.sql`
- `supabase/migrations/20260723000001_device_battery_resets.sql`
- `supabase/tests/customHttpAdapter.test.ts`
- `tests/unit/lib/batteryEstimate.test.ts`
