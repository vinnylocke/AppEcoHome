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

### Sun overlay (Garden Layout Editor)

Tints each shape based on its `sunClass`. Drives the "Sun" overlay toggle.

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
