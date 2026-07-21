# Location Page (Drill-In)

> Inline drill-in view on the Dashboard route — opens when you tap a location card in the home garden grid (`home-location-card-{id}`). Shows everything happening at one specific location: areas inside it, plants in each area, tasks due, weather/microclimate context.

**Route:** `/dashboard?locationId=<uuid>` (rendered inline within the Dashboard route, not a separate URL)
**Source file:** `src/components/LocationPage.tsx`

---

## Quick Summary

When `searchParams.get("locationId")` is set, App.tsx renders LocationPage in place of the home view content (it's entered by tapping a location card in the home garden grid — the standalone Locations tab that used to open it was retired in Stage 4a, 2026-07-20). The page presents the location's areas as cards, with a per-area plant grid and task summary. Back navigation removes the `locationId` query param and restores the previous view.

**Stage 5 (2026-07-20) turned this drill-in into the area EDIT HOST and closed a verified permission leak.** Three writes now live here — the indoor/outdoor environment toggle (`handleToggleEnvironment` → `locations.is_outside`), per-area delete (`handleConfirmDeleteArea`), and an inline **Add-Area Wizard** (`AddAreaWizard`, opened in place). The first two were **previously ungated** — RLS gates only home membership, not the spatial keys, so the client `can()` is the sole guard — and are now gated at BOTH the handler (defense in depth) AND the rendered control: a viewer/member-without-edit sees a **read-only environment badge** instead of the toggle, and the trash button doesn't render without `areas.delete`. The Add-Area button (`areas.create`-gated) **killed the old empty-state "Go to Settings › Location Management" dead-end**. Tapping an area card opens `AreaDetails` inline as the drill-in's area-metrics + plant editor.

---

## Role 1 — Technical Reference

### Component graph

```
LocationPage
├── Back button (clears ?locationId — aria-label "Back to dashboard")
├── Location header
│   ├── Location name + placement + area count + plant count
│   └── Environment control (right side)
│       ├── Indoor/outdoor toggle — if can("locations.edit") (handleToggleEnvironment)
│       └── Read-only environment badge ("Inside" / "Outside") — otherwise
├── "Add area" button (location-add-area-btn) — header, if can("areas.create") && areas.length > 0
├── Microclimate strip (frost / wind / lux)
├── Today's tasks for this location (TaskList filtered)
├── Areas grid (when no area focused)
│   ├── Empty state (areas.length === 0):
│   │   ├── "Add your first area" (location-add-area-empty-btn) — if can("areas.create")
│   │   └── "Ask a home admin to add areas here." — otherwise (dead-end killed)
│   └── Per-area cards
│       ├── Area name + plant count
│       ├── Delete trash button — if can("areas.delete") (handleConfirmDeleteArea)
│       └── Tap card → focuses the area → renders AreaDetails inline
├── AreaDetails (inline, when an area is focused) — area metrics + plant editor
│   └── Back button — area-detail-back / aria-label "Back to areas" (onClose → area list)
└── AddAreaWizard (mounted in place, opened by either Add-area button)
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

Stage 5 (2026-07-20) made the drill-in a writer for the first time. Every spatial write is gated at BOTH the handler and the rendered control:

- **Indoor/outdoor toggle** (`handleToggleEnvironment`, LocationPage.tsx:140) → `locations.update({ is_outside }).eq("id", location.id)`. Gated `can("locations.edit")` in the handler (`toast.error` + early return) AND at render — a non-editor sees a read-only environment badge, not the toggle.
- **Per-area delete** (`handleConfirmDeleteArea`, LocationPage.tsx:169) → `areas.delete().eq("id", areaToDelete.id)` (cascades to the area's inventory). Gated `can("areas.delete")` in the handler AND at render — the trash button doesn't render otherwise.
- **Add area** → `setWizardOpen(true)` opens `AddAreaWizard` in place (gated `can("areas.create")` on both the header and empty-state buttons); the wizard performs the `areas` insert and calls back to `fetchAreas()`.
- Opening AreaDetails (inline) can trigger area metric + plant edits (delegated to that component).
- Opening InstanceEditModal can trigger plant edits.

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

### Permissions / role-based UI — the closed leak (Stage 5, 2026-07-20)

RLS on `locations` / `areas` gates only home *membership*, not the spatial permission keys (see [RLS Patterns § client `can()` is the only spatial-key guard](../99-cross-cutting/19-rls-patterns.md)), so the client `can()` is the **sole** guard on every spatial write here. Before Stage 5 the indoor/outdoor toggle (`handleToggleEnvironment`) and per-area delete (`handleConfirmDeleteArea`) were **ungated** — a viewer could flip the environment or delete a bed. Both are now gated at **BOTH the handler (defense in depth) AND the rendered control**:

| Affordance | Key | Stage 5 change | Non-permitted UI |
|------------|-----|----------------|------------------|
| Indoor/outdoor toggle (`handleToggleEnvironment`) | `locations.edit` | Leak closed (was ungated) | Read-only environment badge |
| Per-area delete (`handleConfirmDeleteArea`) | `areas.delete` | Leak closed (was ungated) | Trash button not rendered |
| "Add area" wizard (`location-add-area-btn` / `location-add-area-empty-btn`) | `areas.create` | New affordance (killed the Location-Management dead-end) | Button hidden; empty state shows "Ask a home admin to add areas here." |
| Inline "Assign plant to this area" CTAs | `inventory.assign` | — | CTA hidden |

**Role matrix on the drill-in:**

| Role | Env-toggle (`locations.edit`) | Add area (`areas.create`) | Delete area (`areas.delete`) |
|------|:---:|:---:|:---:|
| owner / admin | ✅ | ✅ | ✅ |
| member | ✅ | ✅ | ❌ (read-only, no trash) |
| viewer | ❌ (read-only badge) | ❌ (ask-admin line) | ❌ |

This drill-in is now the **third** client-`can()` consumer of the spatial keys, alongside the home garden grid and LocationManager (`/management`). A promotion of any of these keys to RLS enforcement must cover all three surfaces at once — see [Members & Permissions](../07-management/02-members-permissions.md) + [RLS Patterns](../99-cross-cutting/19-rls-patterns.md).

### Error states

| State | Result |
|-------|--------|
| Location not found in state | Loading spinner with "Loading location details..." (waits for parent state to populate) |
| No areas yet | Empty state: an "Add your first area" button (`location-add-area-empty-btn`) for `areas.create` holders — opens `AddAreaWizard` in place — or an "Ask a home admin to add areas here." line for non-creators. **Stage 5 killed the old "Go to Settings › Location Management" dead-end here.** |
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

- Focuses the area and opens AreaDetails inline — the drill-in's area-metrics + plant editor. Shows full area metrics (soil pH, growing medium, watering, etc.), plants assigned, and option to assign more. A labelled **"Back to areas"** button (top-left) returns to the area list.

#### 5. Switch this location indoor / outdoor

- Permission-gated (`locations.edit`). Tap the environment toggle in the header to flip `is_outside` — this drives whether weather / frost rules apply here. Viewers and members without edit see a **read-only environment badge** instead of the toggle.

#### 6. Add an area

- Permission-gated (`areas.create`). Tap "Add area" (in the header or the empty state) → the **Add-Area Wizard** opens in place: name + bed conditions → plants → create; AI tiers get a suitability review. Non-creators see an "ask a home admin" line where the button would be. (LocationManager at `/management` keeps its own add-area entry — both surfaces can add areas.)

#### 7. Delete an area

- Permission-gated (`areas.delete`). The trash button on each area card opens a confirm modal, then removes the area (and cascades its plants). The button only renders for roles that hold the key.

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
- **Planning a new bed:** tap location → "Add area" → the Add-Area Wizard opens in place → set conditions + assign plants from The Shed → create.

### What to do if something looks wrong

- **Plants you assigned to this location don't show:** check the `inventory_items.location_id` — assignments sometimes set area_id without location_id by mistake.
- **Microclimate strip is empty:** no recent weather snapshot or no lux readings yet. Open Light Sensor + take a reading.

---

## Related reference files

- [Home (Main Dashboard)](./17-home-main.md) — the garden grid whose location cards open this drill-in
- [Locations Tab — RETIRED](./02-locations-tab.md) — the standalone `?view=locations` grid that used to open this page (retired Stage 4a, 2026-07-20)
- [Area Details](../03-garden-hub/04-area-details.md) — the inline area-metrics + plant editor hosted by this drill-in
- [Location Manager](../03-garden-hub/03-location-manager.md) — the `/management` power-user CRUD view; keeps its own add-area entry
- [Add-Area Wizard](../03-garden-hub/15-add-area-wizard.md) — opens in place from the drill-in's "Add area" button (`areas.create`)
- [Members & Permissions](../07-management/02-members-permissions.md) — the spatial permission keys this drill-in gates on
- [RLS Patterns](../99-cross-cutting/19-rls-patterns.md) — why client `can()` is the only spatial-key guard across all three surfaces
- [The Shed](../03-garden-hub/01-the-shed.md)
- [Instance Edit Modal](../08-modals-and-overlays/08-instance-edit-modal.md)
- [Data Model — Locations, Areas, Layouts, Shapes](../99-cross-cutting/02-data-model-spatial.md)

## Code references for ongoing maintenance

- `src/components/LocationPage.tsx` — entire component; `handleToggleEnvironment` (env-toggle, `locations.edit`-gated) + `handleConfirmDeleteArea` (per-area delete, `areas.delete`-gated) + the `location-add-area-btn` / `location-add-area-empty-btn` wizard triggers (`areas.create`-gated)
- `src/components/AreaDetails.tsx` — inline area-metrics + plant editor; back button `area-detail-back` / aria-label "Back to areas"
- `src/components/area/AddAreaWizard.tsx` — the Add-Area Wizard opened in place
- `supabase/functions/home-location-details/index.ts` — optional AI-summarised insights
