# Location Manager

> CRUD interface for Locations and the Areas inside them. The structural editor where you set the spatial / metric data that drives recommendations elsewhere.

**Route:** `/management`
**Source file:** `src/components/LocationManager.tsx`

---

## Quick Summary

Shows every Location for the active home as expandable rows. Each row contains the location's areas as cards with metric chips (plant count, recent lux, "on layout" flag). The owner can create / rename / delete locations and areas. Per-area metric editing is via an "Advanced Settings" accordion containing pH, lux, water movement, growing medium, nutrient source, etc. — each with an InfoTooltip explaining the field for beginners.

**Area ↔ Sensor linkage Phase 1 (2026-06-16):** the area-edit modal now mounts an [`AreaSensorsPanel`](../../../src/components/area/AreaSensorsPanel.tsx) at the top showing every soil sensor linked to the area via `devices.area_id`. The panel shows: latest moisture / temp / EC per sensor, an averaged tile across all sensors (or just the single-sensor reading), a per-sensor list with last-seen timestamps, and a 24h / 7d / 30d history chart drawing one line per sensor plus a dashed average line. When no sensors are linked, a "Link a soil sensor" CTA deep-links to `/integrations` where the user can assign a sensor via Device Settings. The aggregation math lives in [`computeAreaMetricSummary`](../../../src/services/areaSensorsService.ts) and is unit-tested separately.

---

## Role 1 — Technical Reference

### Component graph

```
LocationManager
├── Header
│   ├── Title "Location Management"
│   ├── New Location button (perm-gated)
├── Location rows ×N
│   ├── Location name + edit/delete buttons
│   ├── Is_outside toggle
│   ├── Area cards grid
│   │   ├── Area name + lux + plants + "On layout" chips (areaMeta)
│   │   ├── Edit + delete buttons
│   │   └── Tap to open metric panel
│   └── Add Area button
├── AreaMetricPanel (collapsed by default)
│   ├── Basic fields (name, size, growing medium)
│   ├── InfoTooltip per metric
│   └── Advanced accordion
│       ├── pH (with InfoTooltip)
│       ├── Lux (InfoTooltip)
│       ├── Water movement
│       ├── Nutrient source
│       └── Coverage / orientation
└── Delete-confirm modals (location + area variants)
```

### Data flow — read paths

- Locations + nested areas from a single query:
  ```ts
  supabase.from("locations")
    .select("*, areas(*)")
    .eq("home_id", homeId);
  ```
- `areaMeta` map computed from a side query of `inventory_items.area_id` counts + the most recent `area_lux_readings` per area.

### Data flow — write paths

| Action | Operation |
|--------|-----------|
| Create location | `supabase.from("locations").insert({ home_id, name, is_outside })` |
| Rename location | `update({ name }).eq("id", ...)` |
| Delete location | `delete().eq("id", ...)` — cascades to areas + inventory items |
| Create area | `supabase.from("areas").insert({ location_id, name, ... })` |
| Edit area metrics | `update({ light_intensity_lux, ph, water_movement, growing_medium, ... }).eq("id", areaId)` |

### Edge functions invoked

None directly.

### Cron / scheduled jobs that affect this surface

None.

### Realtime channels

`locations` + `areas` + `inventory_items` filtered by home → live updates.

### Tier gating

None.

### Beta gating

None.

### Permissions / role-based UI

| Permission | Effect |
|------------|--------|
| `locations.create` | New Location button |
| `locations.edit` | Edit / rename / metric update |
| `locations.delete` | Delete button |
| `areas.create` | Add Area button |
| `areas.edit` | Edit metrics |
| `areas.delete` | Delete area button |

### Error states

| State | Result |
|-------|--------|
| Delete blocked by FK | Confirmation modal warns about cascading plants |
| Network failure on save | Toast error; field reverts |

### Performance notes

- Single fetch on mount; rest is in-memory edits.
- AreaMetricPanel is lazy-rendered when expanded.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why open this view

This is the structural editor for your garden. When you set up Rhozly during onboarding, you created a single Location. Once you start adding more plants, you'll outgrow that — the herb circle has different sun than the back border, which has different soil than the greenhouse. Location Manager is where you split your garden into Locations (physical places — outdoor, indoor, greenhouse) and Areas (subdivisions inside a location — raised bed 1, herb circle, perennial border).

The Area metrics — pH, lux, water movement, growing medium — drive recommendations across the app. Plants suggested in The Shed get scored against these. The Light Sensor compares its reading against the plants assigned to the area. The Microclimate Report uses area data to compute sun + wind exposure.

### Every flow on this view

#### 1. Create a Location

- Tap "New Location" → name it ("Back Garden", "Front Garden", "Greenhouse") → save.
- Set the outdoor / indoor flag — drives whether weather rules apply.

#### 2. Add Areas inside a Location

- Tap "Add Area" within a Location row → name it + add metrics if you know them.
- Areas are where plants actually live.

#### 3. Edit Area metrics

- Tap the area card → metric panel opens.
- Set:
  - **Growing medium** (Soil / Pot / Hydroponic / etc.)
  - **pH** (informational + drives plant suitability)
  - **Lux** (most-recent reading; auto-updates when you save from Light Sensor)
  - **Water movement** (well-drained, low-drained, etc.)
  - **Nutrient source** (general fertiliser, slow release, none)
  - **Coverage** (full sun, partial shade — narrative)

- Tap the (i) icon next to any field for a plain-English explanation.

#### 4. Delete / restructure

- Delete confirms; cascades to plants in that location/area.

### Information on display — what every field means

| Field | Meaning |
|-------|---------|
| Location name | Free text |
| Is_outside flag | Drives weather rules + frost alerts |
| Area name | Free text |
| Area size (sqm) | Used by some calculations + visual rendering on layout |
| Growing medium | Drives watering schedule defaults |
| pH | Soil acidity; ~6-7 is neutral. Most plants like 6-7. |
| Light intensity (lux) | Recent reading or manual estimate. Drives plant suitability scoring. |
| Water movement | Drainage classification |
| Nutrient source | Feeding regime |

### Tier-by-tier experience

Same view for every tier.

### New user vs returning user vs power user

- **Brand new user**: one default Location ("My Garden") and one default Area ("Main"). Encouraged to refine.
- **Returning user**: occasional area additions as garden evolves.
- **Power user**: 5-10 areas with rich metrics, integrated with Garden Layout shapes.

### Beta user experience

No difference.

### Common mistakes / pitfalls

- **Confusing Location and Area.** Location is a place. Area is a subdivision. Plants live in Areas.
- **Setting metrics by gut feel.** Better to leave blank than guess wildly — leaving blank means defaults apply; guessing wrong skews recommendations.
- **Deleting Locations with plants in them.** Cascades — confirm what you're doing.

### Recommended workflows

- **First setup:** Create your real Locations (Back / Front / Indoor / Greenhouse). One Area per Location is fine to start.
- **As you learn your garden:** subdivide Areas based on observed differences (lux, drainage).

### What to do if something looks wrong

- **Lux chip wrong on an area:** open Light Sensor, take a fresh reading, save to that area.
- **Plants don't show under an area:** check `inventory_items.area_id` — assignment may be missing.

---

## Related reference files

- [The Shed](./01-the-shed.md)
- [Area Details](./04-area-details.md)
- [Light Sensor](./09-light-sensor.md)
- [Garden Layout Editor](./06-garden-layout-editor.md)
- [Data Model — Locations, Areas, Layouts, Shapes (cross-cutting)](../99-cross-cutting/02-data-model-spatial.md)

## Code references for ongoing maintenance

- `src/components/LocationManager.tsx` — entire component
- `src/components/InfoTooltip.tsx` — reusable plain-English help
- `supabase/migrations/*areas*` — areas schema
