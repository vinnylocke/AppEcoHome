# Plan — One canonical sunlight ↔ lux mapping

## Problem
The mapping between a plant's `sunlight` requirement and lux is duplicated in **four** places with **different values**, so the Light tab, the Light Sensor, new-area targets, and the live-reading label disagree (e.g. "full sun" = 20,000–40,000 on the Light tab but 20,000–100,000 in the Light Sensor). The user wants **one place** to edit, and the values sanity-checked (the 40,000 full-sun cap is too low for real midday sun).

## App-reference files consulted
- `docs/app-reference/99-cross-cutting/28-sun-analysis.md` — lux bands + per-plant Light reader

## The four current mappings
1. `src/lib/plantLightUtils.ts` `SUNLIGHT_LUX_MAP` → ranges (Light tab / `getOptimalLuxRange`). Full sun **20k–40k**; 4 bands.
2. `src/components/LightSensor.tsx` `SUN_LUX` → ranges (area readings). Full sun **20k–100k**; 5 finer bands.
3. `src/components/PlanStaging.tsx` inline `targetLux` → single value for a new area's `target_lux`. Full sun **50k**.
4. `src/components/PlantLightReader.tsx` `getLightCategory(lux)` → label for the live reading. Cutoffs 500 / 2,500 / 10,000 / 20,000.

## Proposed single source of truth (`src/lib/plantLightUtils.ts`)

One exported band table — **the only place to edit** — plus helpers derived from it:

```ts
SUNLIGHT_BANDS = [
  { label: "Full Sun",      min: 20000, max: 100000, keywords: ["full sun", "sun"] },
  { label: "Part Sun",      min: 10000, max: 20000,  keywords: ["part sun", "partial sun"] },
  { label: "Part Shade",    min: 2500,  max: 10000,  keywords: ["part shade", "partial shade", "filtered", "dappled", "indirect"] },
  { label: "Shade",         min: 500,   max: 2500,   keywords: ["shade"] },
  { label: "Deep Shade",    min: 0,     max: 500,    keywords: ["deep shade", "full shade"] },
]
```
(ordered most-specific first; `getOptimalLuxRange` keeps normalising `_`/`-` → space and matching most-specific first.)

Helpers, all from the same table:
- `getOptimalLuxRange(sunlight[])` — sunlight → lux range (union of bands; existing behaviour, new bands).
- `luxToCategory(lux)` — lux → `{ label, … }` for the live-reading label (replaces `PlantLightReader.getLightCategory`).
- `targetLuxForSunlight(sunlight)` — a single representative lux for a new area's `target_lux` (band midpoint, or a defined `target`), replaces `PlanStaging`'s inline values.

## Why these values
Real outdoor lux: deep shade <500; light shade ~500–2,500; dappled/part shade ~2,500–10,000; part sun ~10,000–20,000; full sun ~20,000 up to ~100,000+ at midday. These match the Light Sensor + live-reading cutoffs already in the app — the Light tab's 20k–40k was the outlier. Raising the full-sun ceiling to 100k means a tomato in genuine full sun (60k–80k) rates **Best** instead of Good/Great.

## Refactor (consumers → shared)
- `plantLightUtils.ts` — replace `SUNLIGHT_LUX_MAP` with `SUNLIGHT_BANDS` + add `luxToCategory` + `targetLuxForSunlight`. `getOptimalLuxRange` + `getLightFitness` keep their signatures.
- `LightSensor.tsx` — delete local `SUN_LUX`; use `getOptimalLuxRange(sun)` for each plant's min/max.
- `PlantLightReader.tsx` — delete local `getLightCategory`; use `luxToCategory`.
- `PlanStaging.tsx` — replace inline `targetLux` ifs with `targetLuxForSunlight(aiSun)`.

## Tests
- Update `tests/unit/lib/plantLightUtils.test.ts` to the new bands (full sun 20k–100k, etc.) + add `luxToCategory` + `targetLuxForSunlight` cases.

## App-reference docs
- `28-sun-analysis.md` — update the band list to the canonical values and note the single source of truth in `plantLightUtils.ts`.

## Risks
- Changes fitness ratings everywhere (intended). Pure-function + well-tested. Untestable visually here → verify a reading on device.

## Decision for sign-off
The band ranges above (esp. **Full Sun 20,000–100,000** and the 5-band split). Adopt as proposed, or adjust any numbers — they live in one table afterwards so they're trivial to tweak later.

## Deploy
Frontend-only. One deploy, then push to `main`.
