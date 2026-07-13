# Sun Analysis — Shapes, Sunlight Bands, Microclimate

> Pure-client computation of how many hours of direct sun each `garden_shapes` row gets per day. Uses SunCalc for solar position, ray-tracing against neighbouring shapes to detect shadow occlusion, and aggregates into sun-class bands (full sun / part shade / shade).

---

## Quick Summary

```
useSunPosition(lat, lng, date) → { altitude, azimuth }
                                  │
                                  └── computeAllShapesSunHours(shapes, lat, lng, date, northOffset)
                                       └── [{ shapeId, sunHours, sunClass }, ...]
```

`sunClass`:
- **Full sun** ≥ 6h direct
- **Part shade** 3-6h
- **Shade** < 3h
- **Unknown** if no lat/lng

---

## Role 1 — Technical Reference

### `src/lib/sunAnalysis.ts`

Heavy-lift module. Iterates each shape, samples the sun's position across the day at 15-minute intervals, projects rays from the shape's centre upward to the sun, checks intersection with any other shape with `extrude_m > 0` (treats it as a vertical obstacle).

```ts
function computeAllShapesSunHours(
  shapes: ShapeData[],
  lat: number,
  lng: number,
  date: Date,
  northOffsetRad: number,
): ShapeSunResult[];

type ShapeSunResult = {
  shapeId: string;
  sunHours: number;
  sunClass: "Full sun" | "Part shade" | "Shade";
};
```

### `useSunPosition` hook

Wraps SunCalc:

```ts
const { altitude, azimuth } = useSunPosition(lat, lng, date);
```

### Scene azimuth conversion

SunCalc uses azimuth 0 = South. Scene coordinates use +X = East, +Z = South. Conversion:

```ts
sceneAzimuth = -sunAzimuth - northOffsetRad
```

### Plant sun-fit (`src/lib/garden/sunFit.ts`)

Given a plant's `sunlight` preference (e.g. `["full sun", "part sun"]`) and an area's sun-class, computes fit:

```ts
parsePlantSunPreference(sunlight: string[]) → SunBand
getPlantSunFit(plantBand, areaSunClass) → "ok" | "marginal" | "wrong"
getShapeFitSummary(shape, plants) → fitTally
```

### Sunlight ⇄ lux mapping — single source of truth (`src/lib/plantLightUtils.ts`)

`SUNLIGHT_BANDS` in `plantLightUtils.ts` is the **one** place the sunlight↔lux mapping lives. Everything derives from it:
- `getOptimalLuxRange(sunlight: string[])` — sunlight → lux range (per-plant **Light** tab, reached from the Shed tile's light icon, the Library preview, and the plant detail modal). A plant can carry several requirements; the range spans the **lowest band's min → highest band's max** (e.g. `["full sun", "part shade"]` → **2,500–100,000 lux**, "Part Shade – Full Sun"). Values are normalised (`_` / `-` → space) so Verdantly's underscore format and Perenual/AI/manual's space format match the same bands.
- `getLightFitness(lux, range)` — rates a live reading Best / Great / Good / Bad / Worse against that range.
- `luxToBand(lux)` — labels a live sensor reading (used by the Light Sensor + `PlantLightReader`).
- `targetLuxForSunlight(sunlight)` — a single representative lux (range midpoint) for a new area's `target_lux` (used by Plan Staging).

The **Light Sensor** area readings (`LightSensor.tsx`) and the live-reading category label (`PlantLightReader.tsx`) both read from this table — previously they had their own divergent copies.

**Bands:** Full Sun 20,000–100,000 · Part Sun 10,000–20,000 · Part Shade 2,500–10,000 · Shade 500–2,500 · Deep Shade 0–500. (Edit ranges in `SUNLIGHT_BANDS` only.)

### Sun overlay (Garden Layout Editor)

Two modes, switchable via the Day/Live control next to the Sun toggle (2026-07-13):

- **Day** — tints each shape based on its `sunClass` (daily aggregate, unchanged).
- **Live** — tints each shape lit (yellow) or shaded (slate) at the sun-time-slider position, using `isShapeInShadowAt(shape, allShapes, lat, lng, date, northOffsetDeg)` — the same single-point-in-time shadow test the Sun Tracker garden panel uses. The editor recomputes the map per slider tick (memoised on `[shapes, homeLatLng, sunDateObj, northOffset]`).

Both modes render in 2D (Konva tint rect) and 3D (flat tinted plane per shape). Live tint colours live in `src/lib/garden/overlayTints.ts` (`SUN_LIT_COLOR` / `SUN_SHADE_COLOR`).

### AR Sun Tracker

`SunTrajectoryAR` uses the same SunCalc data + projection helpers (`src/lib/sunProjection.ts`) to render the sun's arc onto a camera feed.

### Performance

- Memoised on `[shapes, latLng, date, northOffset]`.
- Sample interval 15 min (96 samples/day).
- Ray intersection is rect/polygon-aware.

### Hemisphere

Sun analysis is lat-aware — works in both hemispheres without seasonal flipping. Seasonality logic ([29-seasonality.md](./29-seasonality.md)) handles that separately.

---

## Role 2 — Expert Gardener's Guide

### Why sun analysis matters

The single biggest determinant of plant success is sun exposure. Get it right and many problems disappear. Get it wrong and no amount of watering or fertilising will help.

This computation gives you per-bed sun hours grounded in your actual location + the shapes you've drawn (fences, walls, trees casting shadows).

### Implications

- More accurate when you've drawn walls / fences / trees with realistic `extrude_m` heights.
- Less accurate if north isn't calibrated — set via Garden Layout settings or the Compass.
- Trees / shrubs that grow over time will shift the answers — refresh seasonally.

---

## Related reference files

- [Garden Layout Editor](../03-garden-hub/06-garden-layout-editor.md)
- [Microclimate Report](../03-garden-hub/07-microclimate-report.md)
- [Sun Tracker AR](../03-garden-hub/08-sun-tracker-ar.md)
- [Light Sensor](../03-garden-hub/09-light-sensor.md)

## Code references for ongoing maintenance

- `src/lib/sunAnalysis.ts`
- `src/lib/sunProjection.ts`
- `src/lib/garden/sunFit.ts`
- `src/hooks/useSunPosition.ts`
- `src/hooks/useSunArc.ts`
