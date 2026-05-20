# Microclimate Report

> A modal report listing every shape in the current layout with its computed microclimate — sun class, recent lux, wind exposure, frost risk tonight and 7-day. Printable / exportable to PDF.

**Trigger:** Toolbar button inside Garden Layout Editor.
**Source file:** `src/components/garden/MicroclimateReportModal.tsx`
**Compute file:** `src/lib/garden/microclimate.ts`

---

## Quick Summary

The modal reads the current layout's shapes, joins them with the most recent `weather_snapshots` row and the in-memory `sunAnalysisResults` + `recentLuxByArea` already computed by the editor, and runs `computeMicroclimate()` per shape. Output is a list of cards — one per non-boundary shape — with a 2×2 / 1×4 grid of Sun / Recent lux / Wind / Frost. Printable via `window.print()` so users can save the report as PDF.

---

## Role 1 — Technical Reference

### Component graph

```
MicroclimateReportModal
├── Header
│   ├── Title "Microclimate Report"
│   ├── Generated-on timestamp (print-only)
│   ├── Printer button → window.print()
│   └── Close button
└── Body
    ├── Loading spinner (forecast fetch in flight)
    ├── Empty state if no shapes
    └── Report cards (one per shape)
        ├── Shape label
        └── 4-cell grid: Sun · Recent lux · Wind · Frost
```

### Props

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `shapes` | `ShapeData[]` | Editor in-memory state | The geometry being assessed |
| `homeId` | `string` | Editor | For `weather_snapshots` lookup |
| `sunAnalysisResults` | `ShapeSunResult[]` \| null | Editor (memoised) | Sun hours per shape |
| `recentLuxByArea` | `Record<area_id, lux \| null>` | Editor | Lux per linked area |
| `onClose` | `() => void` | Editor | Hide modal |

### Local state

| State | Purpose |
|-------|---------|
| `forecast` | 7-day `ForecastDay[]` from weather snapshot |
| `loading` | Forecast fetch in flight |

### Data flow — read paths

```ts
supabase.from("weather_snapshots")
  .select("data")
  .eq("home_id", homeId)
  .order("updated_at", { ascending: false })
  .limit(1)
  .maybeSingle();
```

Forecast shape is normalised — supports Open-Meteo wide layout (`daily.time[]`, `daily.temperature_2m_min[]`, etc.) and a flat array layout (`[{ date, temp_min_c, temp_max_c, ... }]`).

### Data flow — write paths

None — this is read-only.

### `computeMicroclimate()` per shape

```ts
{
  shapeId, label,
  sunClass:           "Full sun" | "Part shade" | "Shade" | "Unknown",
  sunHours:           number | null,
  recentLux:          number | null,
  windExposure:       "Sheltered" | "Partly Sheltered" | "Exposed",
  frostRiskTonight:   "None" | "Mild" | "Moderate" | "Severe",
  frostRiskNext7:     "None" | "Mild" | "Moderate" | "Severe",
}
```

Boundary shapes (`preset_id === "garden-boundary"`) are skipped — boundary is the canvas, not a microclimate location.

### Edge functions invoked

None — pure client-side compute against weather snapshot.

### Cron / scheduled jobs that affect this surface

| Cron | Effect |
|------|--------|
| `sync-weather` | Pulls latest 7-day forecast into `weather_snapshots` |
| `analyse-weather` | Re-runs derived stats |

### Realtime channels

None.

### Tier gating

- The Microclimate Report button is shown for every tier in the editor toolbar, but the full natural-language summary is Sage/Evergreen — currently the report shows the grid only; deeper AI narration is a future Wave.

### Beta gating

None.

### Permissions

- Read-only — no permission checks beyond having access to the layout.

### Error states

| State | Result |
|-------|--------|
| Forecast fetch fails | Loading spinner ends; frost row degrades to "Unknown"/"None" defaults |
| No shapes | "Draw some shapes first to see microclimate data." |

### Performance

- One forecast fetch per modal open.
- Reports memoised on `[shapes, sunAnalysisResults, recentLuxByArea, forecast]`.
- Print stylesheet hides chrome and prints just the report root.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why open this report

Microclimate is the difference between why your tomatoes thrived at the back of the garden and your strawberries failed at the front — even though they're 6 metres apart. Sun is one variable; wind exposure, frost pockets, and humidity all stack to create micro-zones. This report tries to surface those zones in one view so you can plant accordingly.

### Every flow in this modal

#### 1. Open the report

- Editor toolbar → "Microclimate" button.
- The report computes against the current shapes + current weather snapshot.

#### 2. Read each shape's row

Per shape, you get:

- **Sun class** + hours of direct sun.
- **Recent lux** if you've taken a light-sensor reading for the linked area.
- **Wind exposure** based on surrounding shapes (walls / hedges nearby = sheltered).
- **Frost risk tonight** + worst case over next 7 days.

#### 3. Print or save as PDF

- Printer button → browser's print dialog.
- "Save as PDF" → a shareable garden report (great for plant nursery visits).

### Information on display — what every field means

| Field | Meaning |
|-------|---------|
| Sun class | Full sun (6+h direct), Part shade (3–6h), Shade (<3h) |
| Sun hours | Estimated direct hours per day at the shape's centre |
| Recent lux | Last lux reading for the linked area — `area_lux_readings.lux_value` |
| Wind exposure | Sheltered (surrounded by structure), Partly Sheltered, Exposed |
| Frost risk tonight | Severity from tonight's min temp |
| 7-day frost | Worst frost severity in the next 7 days |

### Tier-by-tier experience

| Tier | Differences |
|------|-------------|
| Every tier | Full grid + print. |
| Sage / Evergreen (planned) | AI narrative summary of the report. |

### Common mistakes / pitfalls

- **Empty rows.** A shape with no linked area = no lux reading. Wind / frost still compute.
- **Wind looks wrong.** Exposure infers from nearby shapes — if you haven't drawn your fence / hedge / walls, the algorithm thinks you're exposed.
- **Frost = "None" in summer.** Working as expected — frost only matters at the shoulder seasons.

### Recommended workflows

- **Pre-planting:** open report → pick the lowest-frost-risk + highest-sun shape for tender plants.
- **Post-incident:** if a frost killed something, open the report and check whether the spot was actually high frost-risk — informs where to relocate.
- **Annually:** print the report at the start of spring as a planning artefact.

### What to do if something looks wrong

- **Forecast doesn't load:** check Account → Home has lat/lng set. Without coordinates, weather can't sync.
- **Sun class "Unknown":** sun analysis hasn't run yet — open the editor, ensure north calibrated, and Sun overlay was enabled at least once.
- **Print shows the whole page chrome:** browser-specific; use Ctrl+P from inside the report itself, not the page.

---

## Related reference files

- [Garden Layout Editor](./06-garden-layout-editor.md)
- [Sun Tracker AR](./08-sun-tracker-ar.md)
- [Light Sensor](./09-light-sensor.md)
- [Microclimate Compute (cross-cutting)](../99-cross-cutting/16-microclimate.md)
- [Weather (cross-cutting)](../99-cross-cutting/10-weather.md)

## Code references for ongoing maintenance

- `src/components/garden/MicroclimateReportModal.tsx` — UI
- `src/lib/garden/microclimate.ts` — `computeMicroclimate`, frost / wind classifiers
- `src/lib/sunAnalysis.ts` — sun hours
- `supabase/functions/sync-weather/index.ts` — populates `weather_snapshots`
