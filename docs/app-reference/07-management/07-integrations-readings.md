# Integrations — Soil Readings

> Live soil sensor data — temperature, moisture, conductivity — with delta-from-last-reading trend chips and a 100-point history chart. Lives inside the Device Detail modal for soil sensors.

**Trigger:** Open a soil sensor's Device Detail modal.
**Source files:**
- `src/components/integrations/SoilReadingsPanel.tsx` — 3-tile grid
- `src/components/integrations/HistoryChart.tsx` — line chart
- `supabase/functions/integrations-ecowitt-webhook/index.ts` — public POST that the Ecowitt gateway hits every ~16 min
- `supabase/functions/integrations-ecowitt-poll/index.ts` — on-demand "Sync now" fallback (also usable as a cron)

---

## Quick Summary

Three tiles per reading:

- **Soil Temp** — °C, with delta trend chip
- **Moisture** — %, with delta trend chip
- **Conductivity** — unit depends on the sensor model (see EC calibration note below), with delta trend chip + an InfoTooltip explaining the unit.

Below the tiles, a line chart shows the last 100 readings over time. The Ecowitt gateway pushes readings via webhook every ~16 minutes; the "Sync now" button calls the poll endpoint for an immediate refresh.

**EC calibration (2026-06-16):** The Conductivity tile renders differently depending on which sensor produced the reading:

- **WH52** (multi-parameter sensor): label = `Conductivity`, value = `1250 µS/cm`. Tooltip: "Soil electrical conductivity in microsiemens per centimetre. Reported by your WH52 multi-parameter sensor."
- **WH51** (moisture-only sensor): label = `Conductivity (raw)`, value = `850` (no unit). Tooltip explains that this is a raw ADC integer Ecowitt doesn't publish a conversion for, so it should be read as a relative indicator only (higher = more dissolved salts).

The discriminator lives in the `ec_source` field on each `soil_readings` row (`"calibrated_us_cm"` vs `"raw_adc"`). Rows written before this discriminator landed default to `raw_adc` for back-compat. See [Data Model — Integrations](../99-cross-cutting/09-data-model-integrations.md).

---

## Role 1 — Technical Reference

### Component graph

```
SoilReadingsPanel
└── 3-tile grid
    ├── Tile: Soil Temp
    ├── Tile: Moisture
    └── Tile: Conductivity
        └── Trend chip (up / down / stable)

HistoryChart
└── Line chart of last N readings
    ├── Temp axis
    ├── Moisture axis
    └── Conductivity axis (toggleable)
```

### Props (SoilReadingsPanel)

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `current` | `SoilReading \| null` | Detail modal | Latest reading |
| `previous` | `SoilReading \| null` | Detail modal | For delta trend |

### `SoilReading` shape

```ts
{
  soil_temp: number,        // °C
  soil_moisture: number,    // %
  soil_ec: number,          // µS (electrical conductivity)
}
```

Underlying DB row also includes:

```ts
{
  id, device_id, recorded_at,
  raw_payload: jsonb,       // full provider payload
}
```

### Trend logic

```ts
if (Math.abs(delta) < 0.1) → "Stable" (grey)
else if delta > 0          → "+X.X" (green, up arrow)
else                       → "X.X"  (red, down arrow)
```

### Data flow — read paths

```ts
supabase.from("soil_readings")
  .select("*")
  .eq("device_id", id)
  .order("recorded_at", { ascending: false })
  .limit(100);
```

### Data flow — write paths

Read-only at this surface — readings are inserted by the sync cron.

### Edge functions invoked

None directly. `integrations-ewelink-sync` cron populates the table.

### Cron / scheduled jobs

| Cron | Effect |
|------|--------|
| `integrations-ewelink-sync` | Periodic refresh of readings from provider |

### Realtime channels

- Could subscribe to `soil_readings` for live updates; not currently wired.

### Tier gating

None — once a device is connected, readings are available.

### Beta gating

None.

### Permissions

- `integrations.view` — required.

### Error states

| State | Result |
|-------|--------|
| No readings yet | "No readings yet — awaiting first sync." |
| Sync stale | History chart shows old data; users can trigger manual sync from device modal |

### Performance

- Lightweight — 3 tiles + chart.
- Limit 100 readings prevents large queries.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why look at soil readings

Plants don't lie about how they feel — but you can't ask them. Soil sensors give the data:

- **Moisture** — should I water today? (If above plant's wilting point, no.)
- **Temperature** — is the soil warm enough for germination? (Tomatoes: 15°C+; lettuce: 10°C+.)
- **Conductivity (EC)** — proxy for nutrient load. Low EC = needs feeding; high EC = salt build-up.

### Every flow on this panel

#### 1. Read tiles

- Current value + trend (up/down vs last reading).

#### 2. Read history chart

- Last 100 readings as a line chart.
- Spot patterns: morning vs evening temperature swing, moisture drop between rains.

#### 3. Trigger manual sync

- From the Device Detail modal — calls the provider directly.

### Information on display — what every field means

| Field | Meaning |
|-------|---------|
| Soil Temp | Reading in °C |
| Moisture | Volumetric water content, % |
| Conductivity | Electrical conductivity in µS (microsiemens) |
| Trend chip | Direction + magnitude vs previous reading |

### Tier-by-tier experience

Same for every tier.

### Common mistakes / pitfalls

- **Treating EC as pH.** They're different — EC = nutrients/salts; pH = acidity. The current sensors don't measure pH directly.
- **Worrying about a single low reading.** Soil sensors are point-readings — moisture varies massively across a bed. One sensor gives you one location's data.
- **Sensor stuck at high moisture.** May be sitting in a puddle. Re-position.

### Recommended workflows

- **Initial placement:** centre of the bed, root depth.
- **Read daily:** check moisture before deciding to water.
- **Seasonal compare:** look at history chart across months to spot trends.

### What to do if something looks wrong

- **Stale data:** sync cron may have failed. Trigger manual refresh.
- **Readings wildly inconsistent:** sensor may need calibration (provider's app).
- **Conductivity zero:** sensor not in contact with soil. Re-insert.

---

## Related reference files

- [Integrations — Devices Tab](./05-integrations-devices.md)
- [Integrations — Automations Tab](./06-integrations-automations.md)
- [Area Details](../03-garden-hub/04-area-details.md) — readings surface in area metrics
- [Data Model — Integrations (cross-cutting)](../99-cross-cutting/09-data-model-integrations.md)

## Code references for ongoing maintenance

- `src/components/integrations/SoilReadingsPanel.tsx`
- `src/components/integrations/HistoryChart.tsx`
- `supabase/functions/integrations-ewelink-sync/index.ts` — sync cron
- `supabase/migrations/*_soil_readings.sql` — schema
