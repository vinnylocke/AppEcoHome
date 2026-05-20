# Sun Tracker AR

> A four-mode sun tracker: AR (camera + overlaid sun arc), Dome (3D dome view), Garden (top-down map view), and Year (year-at-a-glance). Shows the sun's trajectory, golden hours, day length, sunrise / sunset and lets the user step through any time of day.

**Route:** `/lightsensor` (entry into the Sun Tracker family — sometimes referred to as just "Sun Tracker"). The AR view also opens from inside the Garden Layout Editor.
**Source file:** `src/components/SunTrajectoryAR.tsx` (~1,170 lines)

---

## Quick Summary

A WebGL-free, canvas-rendered sun tracker. It uses SunCalc to compute the sun's azimuth + altitude trajectory for the day, the user's device orientation (gyroscope) for the AR mode, and lat/lng from `homes` (or browser geolocation fallback) as the observer location. Four switchable modes:

- **AR** — phone camera + overlaid sun position and arc
- **Dome** — abstracted 3D dome showing the sky
- **Garden** — top-down map of the home's layout with sun direction
- **Year** — a year-long heatmap of day length / golden hour timing

A time slider lets the user step through any minute of the day; events (sunrise, golden hours, noon, sunset) are highlighted.

---

## Role 1 — Technical Reference

### Component graph

```
SunTrajectoryAR
├── SunTrackerHeader — mode selector, back, lat/lng, date picker, golden-hour summary
├── Mode-specific view
│   ├── AR view (canvas + camera feed)
│   ├── Dome view (canvas-projected dome)
│   ├── SunGardenMap (top-down with arrow)
│   └── SunYearView (heatmap)
├── Time slider (bottom)
└── Help / refresh / orientation overlays
```

### Props

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `homeId` | `string` | App.tsx | Lat/lng + saved layout lookup |

### Local state

| State | Purpose |
|-------|---------|
| `mode` | `"ar" \| "dome" \| "garden" \| "year"` |
| `selectedMs` | Time of day being viewed (epoch ms) |
| `selectedDate` | Date being viewed (drives SunCalc) |
| `latLng` | Observer position (DB or geolocation) |
| `cameraAvailable` | Whether `getUserMedia` succeeded |
| `cameraTilt`, `compassHeading` | Device orientation from `useDeviceOrientation` |
| `sunArc` | Full day's arc from `computeSunArc` |
| `mode` URL state | Persists across reloads via `useSearchParams` |

### Custom hooks used

- `useDeviceOrientation` — gyroscope, compass, tilt
- `useSunArc` — full day's azimuth/altitude array + solar events
- `OrientationFilter` — smooths noisy compass readings

### Data flow — read paths

- `homes.lat, homes.lng` for the observer position.
- Browser `navigator.geolocation` fallback if home lat/lng is null (and updates `homes` on success).
- `homes.layout_id` (if set) is read by SunGardenMap to render the home's outline.

### Data flow — write paths

- `homes.lat, homes.lng` — updated if browser geolocation fills in missing values.

### Projection helpers

`src/lib/sunProjection.ts` exposes:

- `projectSunToScreen(azimuth, altitude, alphaRad, cameraTilt)` → `{ x, y }` normalised (0–1)
- `projectSunToDome(...)` → 3D dome projection
- `sunCalcAzimuthToCompassDeg(az)` — converts SunCalc's south-zero to compass north-zero
- `shadowBearingDeg / shadowLengthMultiplier` — for shadow rendering
- `DEFAULT_HFOV_RAD / DEFAULT_VFOV_RAD` — camera FoV constants

### Canvas rendering

- `drawSunOrb(ctx, sx, sy)` — radial gradient with subtle 4 s pulse
- `drawEdgeArrow(ctx, W, H, edgeAngle)` — pointer if sun is off-screen
- `drawArcOnCanvas(ctx, W, H, arc, alphaRad, cameraTilt, selectedMs)` — golden-segments coloured by time
- Solar event dots: sunrise, golden hour AM/PM, solar noon, sunset

### Edge functions invoked

None — pure client-side trigonometry.

### Cron / scheduled jobs that affect this surface

None — astronomical data is computed on-device by SunCalc.

### Realtime channels

None.

### Tier gating

None — every tier sees all four modes.

### Beta gating

None.

### Permissions

- Camera permission (browser) required for AR mode.
- Gyroscope / orientation permission (iOS Safari requires explicit request).
- Geolocation permission for lat/lng fallback.

### Error states

| State | Result |
|-------|--------|
| Camera denied | AR mode disabled; "Camera not available" message; user steered to Dome. |
| Geolocation denied + no lat/lng in homes | Time slider works but garden / AR can't compute correct sun. Asks user to set home location. |
| Orientation permission missing (iOS) | Tap-to-request flow shown. |
| Off-screen sun | Edge arrow points where to turn. |

### Performance

- Canvas redraws on `requestAnimationFrame`.
- Sun arc memoised per `[selectedDate, latLng]`.
- Mode kept in URL search param for back/forward.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why open this screen

Sun trajectory is the single most important thing for plant placement. This tracker lets you stand in your garden, point your phone at the sky, and *see* where the sun will be at 3 PM in July. Where will the shadow of that fence fall in February? Will the south-east corner ever get morning light in winter? The AR mode answers those questions live.

For more casual checks, the Garden and Year views give a non-AR equivalent.

### Every flow on this screen

#### 1. AR mode

- Phone camera shows the real view.
- The yellow orb overlays where the sun is right now.
- The dashed arc shows the sun's path for the whole day.
- Step through the day with the bottom time slider — the orb moves.
- Off-screen sun → an arrow on the edge points where to turn.
- Golden hour segments are coloured warm orange; midday yellow.

#### 2. Dome mode

- A 3D dome representing the sky.
- Same arc and events.
- Good for understanding the geometry without the camera.

#### 3. Garden mode

- Top-down map of the home's layout (if one exists) with a directional sun arrow.
- Shadow direction shown.
- Useful for planning bed placement without going outside.

#### 4. Year mode

- Heatmap of every day in the year × day length / golden hour timing.
- See how long days will be in mid-July vs late January.
- Plan annual schedules around solar windows.

#### 5. Date picker

- Pick any date in the header.
- All modes update.
- Plan ahead — "what does the sun look like at our garden party on 14 August at 6 PM?"

### Information on display — what every field means

| Field | Meaning |
|-------|---------|
| Sunrise / Sunset | Local times for the selected date |
| Solar Noon | When the sun is highest |
| Golden Hour AM / PM | Soft light windows for photography or sensitive plants |
| Day length | Total daylight hours |
| Δ vs last week | How day length is changing (gaining / losing minutes) |
| Compass heading | Where the phone is pointing |

### Tier-by-tier experience

Same for every tier.

### Common mistakes / pitfalls

- **AR sun in the wrong place.** Compass needs calibration — wave the phone in a figure-8 to recalibrate the magnetometer.
- **iOS Safari shows no orientation.** iOS requires an explicit user gesture to grant orientation permission — tap the prompt.
- **Garden Map missing layout.** Set a layout in the editor first (`/garden-layout`) and link it to the home.
- **Time slider stuck at "now".** Drag the slider — the orb moves to that time of day.

### Recommended workflows

- **Initial garden audit:** stand at each bed → AR mode → swipe through the day. Note which beds get morning sun, midday sun, afternoon sun.
- **Annual planning:** Year mode → identify your shortest day and longest day → plan tender planting after the last frost + first sun window.
- **Photography:** golden hour label tells you when light's best — open this an hour before sunset.

### What to do if something looks wrong

- **Camera permission revoked:** open phone settings → grant camera, reload Rhozly.
- **Lat/lng wrong:** Account → Home → re-set coordinates manually.
- **Sun arc doesn't cross at noon overhead:** sanity check by checking SunCalc with your latitude — at high latitudes the sun never reaches zenith.

---

## Related reference files

- [Light Sensor](./09-light-sensor.md)
- [Garden Layout Editor](./06-garden-layout-editor.md)
- [Microclimate Report](./07-microclimate-report.md)
- [Sun Analysis (cross-cutting)](../99-cross-cutting/15-sun-analysis.md)

## Code references for ongoing maintenance

- `src/components/SunTrajectoryAR.tsx` — main component
- `src/components/sun/SunTrackerHeader.tsx` — mode + golden-hour summary
- `src/components/sun/SunGardenMap.tsx` — top-down view
- `src/components/sun/SunYearView.tsx` — year heatmap
- `src/hooks/useDeviceOrientation.ts` — gyroscope wrapper
- `src/hooks/useSunArc.ts` — SunCalc → arc + events
- `src/lib/sunProjection.ts` — coordinate projections
- `src/lib/sun/orientationFilter.ts` — compass smoothing
