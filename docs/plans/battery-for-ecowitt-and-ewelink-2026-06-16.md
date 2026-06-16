# Battery level for Ecowitt + eWeLink devices

**Date:** 2026-06-16
**Status:** Plan — awaiting approval

## Problem / Goal

The 25.0001 release wired `battery_percent` through the Custom HTTP adapter + the webhook router, plus added the pip + decay sparkline UI. But Ecowitt + eWeLink integrations ship as standalone edge functions that pre-date the adapter contract — they don't currently extract battery from the provider payloads, so existing soil sensors + valves show no pip at all.

Goal: extract battery from both providers' actual API shapes, write it into the same two places (`device_readings.data.battery_percent` + `devices.battery_percent` / `battery_reported_at`), and have the existing UI light up retroactively for every new reading without any changes to the components.

## App-reference files consulted

- [docs/app-reference/99-cross-cutting/37-integration-contract.md](../app-reference/99-cross-cutting/37-integration-contract.md) — battery payload contract added in the last release
- [docs/app-reference/07-management/05-integrations-devices.md](../app-reference/07-management/05-integrations-devices.md) — Devices Tab, where Battery health is documented (custom_http only today)
- [docs/app-reference/99-cross-cutting/10-edge-functions-catalogue.md](../app-reference/99-cross-cutting/10-edge-functions-catalogue.md) — current integrations fns

## Source files consulted

- [`supabase/functions/_shared/integrations/ecowittFields.ts`](../../supabase/functions/_shared/integrations/ecowittFields.ts) — `parseSoilChannels`, comment block already names `soilbatt{N}` as the battery field
- [`supabase/functions/integrations-ecowitt-webhook/index.ts`](../../supabase/functions/integrations-ecowitt-webhook/index.ts) and [`-poll/index.ts`](../../supabase/functions/integrations-ecowitt-poll/index.ts) and [`-cron-poll/index.ts`](../../supabase/functions/integrations-ecowitt-cron-poll/index.ts) — all call `insertReading` after building a `SoilReading`
- [`supabase/functions/_shared/integrations/ewelinkDevice.ts`](../../supabase/functions/_shared/integrations/ewelinkDevice.ts) — `parseDeviceState` returns just `"on" | "off"`
- [`supabase/functions/integrations-ewelink-state/index.ts`](../../supabase/functions/integrations-ewelink-state/index.ts) and [`-control/index.ts`](../../supabase/functions/integrations-ewelink-control/index.ts) — both call `insertReading` with a `ValveReading`
- [`supabase/functions/_shared/integrations/readings.ts`](../../supabase/functions/_shared/integrations/readings.ts) — central `insertReading`

## Approach

### A. Centralise the battery dual-write in `insertReading`

Today the custom_http path does its battery dual-write inline in the webhook router. Move it into `insertReading` itself so every caller (Ecowitt, eWeLink, custom_http) gets the same behaviour for free:

```ts
interface InsertReadingParams {
  db: SupabaseClient;
  deviceId: string;
  homeId: string;
  data: DeviceReadingData;       // already carries battery_percent? when present
  recordedAt?: Date;
  batteryPercent?: number | null; // explicit override; if absent, read from data
}
```

If `batteryPercent` is a finite 0-100 number OR `data.battery_percent` is a finite 0-100 number, update `devices.battery_percent` + `devices.battery_reported_at` after the reading row insert (single extra round-trip, best-effort like the existing `last_seen_at` update). Then strip the inline `devices` update from the webhook router.

This means the Ecowitt + eWeLink callers just need to put `battery_percent` into the `data` object they're already building, and the dual-write happens for them.

### B. Ecowitt battery extraction

Extend `ParsedSoilChannel`:

```ts
export interface ParsedSoilChannel {
  channel: number;
  soil_moisture: number;
  soil_temp: number;
  soil_ec: number;
  ec_source: EcSource;
  inferredModel: EcowittSoilModel;
  battery_percent: number | null;   // NEW
}
```

Inside `parseSoilChannels`, after the existing moisture / temp / EC blocks, parse `soilbatt{N}` with auto-detect:

```ts
const battRaw = fields[`soilbatt${ch}`];
let battery_percent: number | null = null;
if (battRaw !== undefined) {
  const v = parseFloat(String(battRaw));
  if (Number.isFinite(v) && v >= 0) {
    if (v <= 5) {
      // Ecowitt sends a 0-5 "level" for some firmwares (5 = full).
      battery_percent = Math.round((v / 5) * 100);
    } else if (v <= 100) {
      // Some report a percentage directly.
      battery_percent = Math.round(v);
    } else {
      // Voltage in millivolts (rare) → ignore for now; safer to leave null
      // than guess a wrong threshold.
    }
  }
}
```

Wire `battery_percent` through to all three Ecowitt callers — they each build a `SoilReading` and call `insertReading`. With the new central dual-write, just spreading `...(ch.battery_percent !== null ? { battery_percent: ch.battery_percent } : {})` into the SoilReading is enough.

### C. eWeLink battery extraction

Extend `parseDeviceState` to return battery too:

```ts
export function parseDeviceState(stateJsonData: Record<string, unknown>):
  { state: "on" | "off"; battery_percent: number | null } {
  const params = (stateJsonData?.params ?? {}) as Record<string, unknown>;
  const switches = params.switches as Array<Record<string, unknown>> | undefined;
  const switchRaw = (params.switch as string) ?? (switches?.[0]?.switch as string) ?? "off";
  const state: "on" | "off" = switchRaw === "on" ? "on" : "off";

  let battery_percent: number | null = null;
  const candidates = [params.battery, params.battPercentage, params.batteryPercentage];
  for (const c of candidates) {
    if (typeof c === "number" && Number.isFinite(c) && c >= 0 && c <= 100) {
      battery_percent = Math.round(c);
      break;
    }
  }
  return { state, battery_percent };
}
```

Update `integrations-ewelink-state` and `integrations-ewelink-control` to spread the battery into the `ValveReading` they pass to `insertReading`. Same dual-write magic applies.

### D. Tests

- **Deno** — `supabase/tests/ecowittFields.test.ts` (if it exists; otherwise new): add cases for `soilbatt{N}` as 0-5 level, as 0-100 percent, missing field → null, garbage value → null.
- **Deno** — `supabase/tests/ewelinkDevice.test.ts` (if it exists; otherwise new): cases for `params.battery`, `params.battPercentage`, missing → null, non-numeric → null.
- **Vitest** — no UI changes, so no Vitest changes (BatteryPip + DeviceBatteryPanel already exist and read from the same column).

### E. Docs

- [`05-integrations-devices.md`](../app-reference/07-management/05-integrations-devices.md) — update the supported-providers table to note that both Ecowitt and eWeLink now report battery via their normal sync path; remove the "custom_http only" caveat in the Battery health section.
- [`37-integration-contract.md`](../app-reference/99-cross-cutting/37-integration-contract.md) — flip the "Legacy providers" note to mention battery is now wired through the shared `insertReading` dual-write rather than per-provider.
- [`10-edge-functions-catalogue.md`](../app-reference/99-cross-cutting/10-edge-functions-catalogue.md) — note in the three Ecowitt rows + two eWeLink rows that they now update battery columns.

### F. Release notes + deploy

Single release-notes item: "Battery health now works on Ecowitt + eWeLink devices — the pip + decay sparkline + days-remaining estimate light up from the next sync." Incremental bump (`--bump 1`) since this is a follow-up wiring change, not a major new surface.

## Risks / edge cases

- **Ecowitt `soilbatt{N}` ambiguity** — the 0-5 level vs 0-100 percent vs voltage question. The auto-detect uses ranges that don't overlap (≤5 → level; 5-100 → percent; >100 → ignore). If a firmware turns up reporting voltage as 1.5V (would be classified as level "full" by the ≤5 branch), we'll show 30%. Risk is small — `soilbatt` documented as level for WH51, percent for some newer firmwares. If we see a regression we add a per-device metadata override.
- **eWeLink param-name variants** — the candidate list covers the three I've seen across community docs; if there's a fourth name we'll log "battery field missing" via the existing info-level logger and add it in a one-line fix.
- **No backfill of historical readings.** The sparkline starts populating from the next sync. Historical readings will not retroactively gain a battery field — out of scope; would need a separate backfill cron.
- **Best-effort failure mode.** The `devices.battery_*` update follows the same pattern as `last_seen_at` — if it errors, the reading still lands and we don't fail the webhook / sync. Documented in `insertReading`.

## Alternatives considered

- **Per-provider dual-write (mirror what the webhook router does today).** Rejected — three callers on the Ecowitt side and two on the eWeLink side. Centralising in `insertReading` is cleaner and removes the inline block already in the router.
- **Treat Ecowitt voltage values.** Rejected — without a calibration curve we can't reliably map mV to %. Better to ignore (null pip) than guess wrong.
- **Wait for the planned Ecowitt + eWeLink migration to the adapter contract.** Rejected — that migration is weeks out, the user has hardware in use today.

## Plan size

Small-medium. ~2 hours:
- `insertReading` centralisation: 20 min
- Ecowitt parser + three callers: 30 min
- eWeLink parser + two callers: 20 min
- Tests: 30 min
- Docs + release notes + deploy: 20 min
