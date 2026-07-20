# Location Page (Drill-In)

> Inline drill-in view on the Dashboard route — opens when you tap a location card in the home garden grid (`home-location-card-{id}`). Shows everything happening at one specific location: areas inside it, plants in each area, tasks due, weather/microclimate context.

**Route:** `/dashboard?locationId=<uuid>` (rendered inline within the Dashboard route, not a separate URL)
**Source file:** `src/components/LocationPage.tsx`

---

## Quick Summary

When `searchParams.get("locationId")` is set, App.tsx renders LocationPage in place of the home view content (it's entered by tapping a location card in the home garden grid — the standalone Locations tab that used to open it was retired in Stage 4a, 2026-07-20; the `?locationId=` drill-in itself is **unchanged**). The page presents the location's areas as cards, with a per-area plant grid and task summary. Back navigation removes the `locationId` query param and restores the previous view.

---

## Role 1 — Technical Reference

### Component graph

```
LocationPage
├── Back button (clears ?locationId)
├── Location header
│   ├── Location name + is_outside flag
│   ├── Area count + plant count
│   └── Edit button (if can("locations.edit"))
├── Microclimate strip (frost / wind / lux)
├── Today's tasks for this location (TaskList filtered)
└── Areas grid
    └── Per-area cards
        ├── Area name + size
        ├── Plant thumbnails (up to 6)
        ├── Soil / lux metrics (from area record)
        └── Tap to open AreaDetails modal
```

### Props

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `location` | `Location` | App.tsx state.locations[].find(...) | Full location record |
| `aiEnabled` | `boolean` | profile.ai_enabled | Toggle AI-only buttons in child modals |
| `perenualEnabled` | `boolean` | profile.enable_perenual | Toggle Perenual provider buttons |

### Data flow — read paths

#### Areas inside this location

```ts
supabase.from("areas")
  .select("id, name, area_size_sqm, growing_medium, light_intensity_lux, ph, ...")
  .eq("location_id", location.id);
```

#### Inventory items in this location

```ts
supabase.from("inventory_items")
  .select("id, plant_name, identifier, area_id, status, plants(thumbnail_url)")
  .eq("home_id", homeId)
  .eq("location_id", location.id);
```

#### Tasks scoped to this location

Filtered client-side from the parent's `tasks` state, or via TaskList with `locationId={location.id}` prop.

### Data flow — write paths

- Opening AreaDetails modal can trigger area edits (delegated to that modal).
- Opening InstanceEditModal can trigger plant edits.
- The Location Page itself is read-only for its main content.

### Edge functions invoked

None directly. Children may invoke `home-location-details` (for AI-summarised location insights).

### Cron / scheduled jobs that affect this surface

| Cron | Effect |
|------|--------|
| `generate-tasks` | Daily — today's tasks for this location |
| `sync-weather` + `analyse-weather` | Indirect — microclimate strip pulls from weather snapshots |
| `update-plant-states` | Indirect — plant cards show updated growth states |

### Realtime channels

Inherits parent `useHomeRealtime` — any inventory or task change for this home triggers a re-render.

### Tier gating

| Tier | Differences |
|------|-------------|
| Sprout | All view-level functionality. AI Insight card on areas may be hidden in AreaDetails. |
| Botanist | Same. |
| Sage | AreaDetails "Analyse this area" button works. |
| Evergreen | Same as Sage. |

### Beta gating

None.

### Permissions / role-based UI

- `can("locations.edit")` gates the Edit Location button.
- `can("areas.create")` gates an Add Area button (inside this location).
- `can("inventory.assign")` gates inline "Assign plant to this area" CTAs.

### Error states

| State | Result |
|-------|--------|
| Location not found in state | Loading spinner with "Loading location details..." (waits for parent state to populate) |
| No areas yet | Empty state with "Add your first area" CTA |
| No plants in any area | Each area card shows "No plants yet" placeholder |

### Performance notes

- All data is already in parent state — render-only surface.
- Per-area plant thumbnail count capped at 6 with "+N more" overflow.

### Linked storage buckets

None directly.

---

## Role 2 — Expert Gardener's Guide

### Why open this view

The Location Page is the "this corner of the garden" zoom. When you tap "Back Garden" from the home garden grid, you're saying "tell me about this place — what's growing here, what needs doing here, what's the soil like, what's the light like, is it sheltered?" For a beginner with one location and one area, this is essentially the same as the garden grid card — just deeper. For a more involved gardener with five separate areas inside one location (raised veg bed, perennial border, herb circle, fruit cage, lawn edge), this is where you live when you're planning that section's work.

### Every flow on this view

#### 1. Read the location header

- Name, indoor/outdoor flag, area count, plant count, optional edit button.

#### 2. Glance the microclimate strip

- Frost risk for tonight, wind exposure, recent lux. Compact summary of what's affecting this corner of your garden.

#### 3. See today's tasks for this location

- Same TaskList component as the Dashboard, but filtered to this location only. Tick / postpone / open detail from here.

#### 4. Tap an area card

- Opens AreaDetails modal. The modal shows full area metrics (soil pH, growing medium, watering, etc.), plants assigned, and option to assign more.

#### 5. Edit the location

- Permission-gated. Updates name, is_outside flag, postcode if differs from home.

### Information on display — what every field means

| Element | Meaning |
|---------|---------|
| Location name | Free text |
| Is_outside chip | Drives whether weather rules apply |
| Area count | `areas.count` for this location |
| Plant count | `inventory_items.count` filtered by `location_id` |
| Microclimate frost | Tonight's min temp risk |
| Microclimate wind | Daily max wind for today |
| Microclimate lux | Most recent saved reading for any area in this location |
| Area cards | Each card represents one `areas` row |
| Plant thumbnails | First 6 inventory items in that area |
| "+N more" | Overflow indicator |

### Tier-by-tier experience

Same view for everyone. AI-only buttons inside child modals are gated.

### New user vs returning user vs power user

- **Brand new user**: location with one default area, no plants → walks them through "add plants to this area."
- **Returning user**: a few plants per area, occasional task to handle.
- **Power user**: many areas with rich metric data — AreaDetails becomes the daily driver.

### Beta user experience

No difference.

### Common mistakes / pitfalls

- **Treating Location and Area as interchangeable.** Location = a place (Back Garden). Area = a subdivision (Raised Bed 1, Herb Circle). Plants live in Areas, not Locations.
- **Adding too many areas.** Areas should be meaningfully distinct — different soil, different light, different microclimate. A 10×10m lawn is one area, not nine.

### Recommended workflows

- **Daily check on one corner:** tap a location card in the home garden grid → glance microclimate + today's tasks → handle.
- **Planning a new bed:** tap location → "Add Area" → set metrics → assign plants from The Shed.

### What to do if something looks wrong

- **Plants you assigned to this location don't show:** check the `inventory_items.location_id` — assignments sometimes set area_id without location_id by mistake.
- **Microclimate strip is empty:** no recent weather snapshot or no lux readings yet. Open Light Sensor + take a reading.

---

## Related reference files

- [Home (Main Dashboard)](./17-home-main.md) — the garden grid whose location cards open this drill-in
- [Locations Tab — RETIRED](./02-locations-tab.md) — the standalone `?view=locations` grid that used to open this page (retired Stage 4a, 2026-07-20)
- [Area Details](../03-garden-hub/04-area-details.md)
- [Location Manager](../03-garden-hub/03-location-manager.md)
- [The Shed](../03-garden-hub/01-the-shed.md)
- [Instance Edit Modal](../08-modals-and-overlays/08-instance-edit-modal.md)
- [Data Model — Locations, Areas, Layouts, Shapes](../99-cross-cutting/02-data-model-spatial.md)

## Code references for ongoing maintenance

- `src/components/LocationPage.tsx` — entire component
- `src/components/AreaDetails.tsx` — area drill-in modal
- `supabase/functions/home-location-details/index.ts` — optional AI-summarised insights
