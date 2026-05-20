# Light Sensor

> A live light-measurement tool. Uses the device's native ambient light sensor (Capacitor) or a camera-based pixel-analysis fallback to estimate lux, lets the user save the reading to a specific area, and compares the result to each plant's preferred sunlight range.

**Route:** `/lightsensor`
**Source file:** `src/components/LightSensor.tsx` (~850 lines)

---

## Quick Summary

Two measurement methods:

- **Native Sensor** — `@capgo/capacitor-light-sensor` on Android/iOS where supported. Returns lux directly.
- **Pixel Analysis** — fallback for web/iOS-without-sensor. Streams the rear camera at full FOV, averages the pixel luminance, converts to lux via a user-tunable calibration factor.

The reading streams live to a big dial. User picks Location → Area → Save → row inserted into `area_lux_readings` and the area's `light_intensity_lux` overwritten with the latest value. After saving, a comparison panel shows which plants in the area are happy, under-lit, or over-lit based on their `sunlight` preference mapped to a lux range.

---

## Role 1 — Technical Reference

### Component graph

```
LightSensor
├── Header (Sun icon, title, Help)
├── Live dial — animated lux readout (smooth interpolation)
├── Method chip — "Native Sensor" / "Pixel Analysis" / "Paused"
├── Calibration drawer (collapsible)
│   ├── Calibration factor slider (default 0.2)
│   └── Exposure offset slider (camera mode only)
├── Pause / Resume button
├── Manual method switch
├── Location → Area picker
├── Save button → writes reading
├── Last saved banner
└── Plant comparison panel (per area)
    └── Per plant: name, range, status badge (under-lit / OK / over-lit)
```

### Props

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `homeId` | `string` | App.tsx | Scope of locations + areas + writes |

### Local state

| State | Purpose |
|-------|---------|
| `lux` | Smoothed displayed value (interpolated from `targetLuxRef`) |
| `method` | Current measurement method |
| `isScanning` / `isManualMode` / `manualMethod` | Sensor selection |
| `calibrationFactor` (LS-backed) | Pixel→lux multiplier (`rhozly_lux_calibration`) |
| `exposureLevel` (LS-backed) | Camera exposure offset (`rhozly_exposure_offset`) |
| `locations` | Nested locations → areas from DB |
| `selectedLocationId`, `selectedAreaId` | Save target |
| `lastSaved` | Toast banner state |
| `nativeSensorUnavailable` | Fallback flag |
| `areaPlants` | Inventory items in selected area + their lux ranges |

### Refs (not in state)

- `videoRef`, `canvasRef`, `streamRef`, `animationFrameRef` — camera pipeline
- `sensorListenerRef` — native sensor subscription
- `targetLuxRef`, `currentLuxRef` — smoothing interpolation
- `calibrationRef`, `exposureRef` — read inside RAF without re-creating callbacks

### Data flow — read paths

```ts
supabase.from("locations")
  .select(`id, name, areas ( id, name, light_intensity_lux )`)
  .eq("home_id", homeId);

supabase.from("inventory_items")
  .select("id, identifier, plant_name, plants(sunlight)")
  .eq("home_id", homeId)
  .eq("area_id", selectedAreaId);
```

### Data flow — write paths

#### Save reading
```ts
supabase.from("area_lux_readings").insert({
  home_id, area_id, lux_value: lux, recorded_at: now, source: "sensor"
});
supabase.from("areas").update({ light_intensity_lux: lux }).eq("id", selectedAreaId);
```

Updates local `locations` state to reflect the new value without refetching.

### Native sensor

`NativeLightSensor.start()` returns a listener that fires with `{ value }` (lux). Failure → falls back to camera with toast.

### Camera fallback

- `getUserMedia({ video: { facingMode: "environment" } })`.
- `requestAnimationFrame` reads frames into a hidden canvas, averages pixel luminance, multiplies by `calibrationFactor`, applies exposure offset, smooths via `currentLuxRef` interpolation.
- `track.applyConstraints({ advanced: [{ exposureCompensation }] })` when supported.

### Sunlight → lux mapping

A constant table in this file maps `plants.sunlight` strings to lux ranges:

| Label | Range (lux) |
|-------|-------------|
| deep shade / full shade | 0 – 500 |
| shade | 500 – 2,500 |
| part shade / partial shade / filtered shade / bright indirect | 2,500 – 10,000 |
| part sun / partial sun | 10,000 – 20,000 |
| full sun | 20,000 – 100,000 |

If a plant has multiple labels, the union of ranges is used.

### Plant Doctor integration

Calls `setPageContext(...)` on mount with `{ page: "lightsensor", luxReading, area }` so the AI assistant button — if used while on this page — pulls the lux into its prompt.

### Edge functions invoked

None.

### Cron / scheduled jobs that affect this surface

None.

### Realtime channels

None.

### Tier gating

None — sensor available to every tier. The Plant Doctor context integration is downstream-gated by tier.

### Beta gating

None.

### Permissions

- Camera permission (pixel fallback).
- Native sensor permission on Android (automatic; Capacitor handles).

### Error states

| State | Result |
|-------|--------|
| Native sensor unavailable | Toast + fallback to camera |
| Camera permission denied | Black dial; toast prompts user to grant camera |
| Save fails | Toast with error message |
| No area picked | "Select an area!" |

### Performance

- Native sensor: event-driven, near-zero CPU.
- Camera: RAF loop reads small canvas tile (not full frame) for performance.
- Reading smoothing avoids jitter from frame-to-frame variation.

### Linked storage buckets

None — only DB rows.

---

## Role 2 — Expert Gardener's Guide

### Why open this screen

Gardening guides constantly say "full sun" or "part shade" — but what does that actually mean in your specific garden? This tool quantifies it. Stand at a bed, point the phone, get a lux number, save it to that area. Over a season, the readings build a history: `area_lux_readings` is what powers the Lux Overlay in Garden Layout, the sparkline in Area Details, and the Compare panel on this screen.

### Every flow on this screen

#### 1. Live reading

- Open the screen → it tries native sensor first.
- If unavailable, falls back to camera.
- The dial smoothly catches up to the live value — no jittering.

#### 2. Calibration (camera mode only)

- Pixel-to-lux is approximate. The slider lets you tune it.
- Quick calibration: place phone in known full sun, set slider so dial reads ~30,000 lx; place in deep shade, ensure it reads <500.

#### 3. Save to area

- Pick Location → Area → Save.
- Row inserted into history; area's "latest" lux updated.
- After save, Pause is released and scanning resumes — saves multiple readings without re-tapping.

#### 4. Compare to plants

- Once an area is selected, the panel lists every plant assigned to that area.
- Each row shows: plant name, preferred lux range, current status.
- Status badge: green (in range), amber (close), red (way off).

#### 5. Pause / Resume

- Pause stops the camera or sensor — useful when stepping outside, conserves battery.

### Information on display — what every field means

| Field | Meaning |
|-------|---------|
| Big lux number | Live reading, smoothed. Units: lux (lumens per square metre). |
| Method chip | Which sensor backend is active. |
| Calibration factor | Multiplier applied to raw pixel luminance. |
| Exposure offset | Camera exposure compensation in EV stops. |
| Last saved | Confirms the most recent save target. |
| Plant range | Min–max lux that plant is happy in, mapped from `plants.sunlight`. |
| Status badge | Whether current reading falls in that range. |

### Tier-by-tier experience

Same for every tier.

### Common mistakes / pitfalls

- **Pixel-mode wildly inaccurate without calibration.** Cameras vary; one phone's "1.0 calibration" is another phone's "0.3". Calibrate once with a known reference.
- **Pointing at the sky.** This reads sky lux, not surface lux. Point down at the bed for the value plants experience.
- **Not pausing before walking around.** Camera keeps streaming until you pause.
- **Saving a reading taken indoors at a window.** Window glass scatters light — saved value will overstate full sun.
- **Native sensor low-cap.** Some Android sensors cap at ~10,000 lx; readings above that read as a flat ceiling. Pixel mode is better for full-sun spots.

### Recommended workflows

- **Initial garden survey:** mid-morning + midday + mid-afternoon, three readings per area, saved separately. Builds a daily curve for each area.
- **Pre-planting:** check the area's most recent reading against the plant's range before assigning.
- **Re-survey seasonally:** sun angles change — re-measure each area at the start of each season.

### What to do if something looks wrong

- **Dial stuck at 0:** sensor or camera not started. Pause → Resume.
- **Native sensor seems wrong:** switch to Pixel Analysis manually via the method drawer.
- **Saved reading didn't appear in Area Details sparkline:** check the area_id — picker may have defaulted to wrong area.
- **Compare panel empty:** no plants assigned to that area. Add via The Shed.

---

## Related reference files

- [Area Details](./04-area-details.md)
- [Sun Tracker AR](./08-sun-tracker-ar.md)
- [The Shed](./01-the-shed.md)
- [Lux Overlay (cross-cutting)](../99-cross-cutting/15-sun-analysis.md)

## Code references for ongoing maintenance

- `src/components/LightSensor.tsx` — entire screen
- `@capgo/capacitor-light-sensor` — native plugin
- `src/context/PlantDoctorContext.tsx` — page context for AI integration
- `supabase/migrations/*_area_lux_readings.sql` — history table
