# Plant Edit Modal

> The full plant detail / edit modal opened from the Shed grid. Multi-tab: Care details, Schedule, Guides, Light, Companions. Manual edit of plant-level metadata; per-instance edits live in InstanceEditModal.

**Source file:** `src/components/PlantEditModal.tsx`

---

## Quick Summary

Opens when you tap a plant card in the Shed. Edits go to the `plants` row (plant-level — shared across all instances of the species in this home). Per-instance tweaks (state, area, notes) happen in InstanceEditModal.

Tabs:
- **Care** — common name, scientific names, sun/water/soil, cycle, hardiness
- **Schedule** — `PlantScheduleTab` shows blueprints + ghost tasks for this species
- **Guides** — `PlantGuidesTab` shows AI care guides + linked guides
- **Light** — `LightTab` shows lux history for areas hosting this plant
- **Companions** — `CompanionPlantsTab` shows companion / antagonist data

---

## Role 1 — Technical Reference

### Component graph

```
PlantEditModal (Portal, focus-trapped)
├── Header (close, title, "View instances" button)
├── At-a-glance row (instance count, areas, latest lux, open tasks)
├── Tab bar
│   ├── Care
│   ├── Schedule → PlantScheduleTab
│   ├── Guides → PlantGuidesTab
│   ├── Light → LightTab
│   └── Companions → CompanionPlantsTab
├── Active tab body
├── Provider info chip (Perenual / Verdantly / AI / Manual)
├── Refresh from provider (re-fetch care details)
└── Save / Cancel
```

### Props

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `homeId` | `string` | parent | Scope |
| `plant` | `any` | parent | The `plants` row |
| `onSave` | `(updated) => void` | parent | Save callback |
| `onClose` | `() => void` | parent | Hide |
| `isSaving` | `boolean?` | parent | Save in flight |
| `aiEnabled` | `boolean?` | parent | Gate AI re-fetch |
| `isPremium` | `boolean?` | parent | Perenual gate |

### Data flow — read paths

- On mount, if `plant.source !== "manual"`, optionally re-fetches latest provider details via `getProviderPlantDetails`.
- At-a-glance data via queries against `inventory_items`, `area_lux_readings`, `tasks`.

### Data flow — write paths

- `onSave` is the canonical write — parent does the actual `plants.update(...)`.

### Edge functions invoked

- `manual-refresh-ai-plant` — Wave 5 "Refresh now" button on the Care tab (Sage+ only). Re-asks Gemini for the global AI plant's care guide, diffs vs current, bumps `freshness_version` if anything changed. Rate-limited at the edge (1 per (user, plant) per 7 days) + client-side fast-path cache in `localStorage[`rhozly_ai_refresh_${plant_id}`]`.

Sub-tabs may invoke their own (e.g. AI care guide fetch from Guides tab).

### Realtime channels

None.

### Tier gating

- Refresh from provider gated by Premium / AI flag.

### Beta gating

None.

### Permissions

- `shed.edit` to save.

### Error states

| State | Result |
|-------|--------|
| Provider re-fetch fails | Toast; existing data preserved |
| Save fails | Toast |

### Performance

- Focus-trapped portal.
- Sub-tabs lazy on switch.

### Linked storage buckets

- Plant photos referenced by URL; not edited here.

---

## Role 2 — Expert Gardener's Guide

### Why open this modal

When you want to edit the plant *species* — care notes, sun/water defaults, hardiness — this is the place. Edits apply to every instance of this plant in your home (the species record is shared).

For per-bed tweaks ("this tomato is in a shadier spot"), use Instance Edit Modal instead.

### Every flow on this modal

#### 1. Care tab

- Edit common name, scientific names, sun/water/soil, cycle, hardiness range.
- **AI freshness callout (Wave 5)** — appears at the top of this tab when the plant is an AI catalogue entry whose version is ahead of your ack. Yellow banner with chips for each changed field, "Mark as reviewed" + "View changes" actions. Resolves via `forked_from_plant_id` for shallow forks added through bulk-add — the chip's source of truth is always the global catalogue row.
- **"Refresh now" button (Sage+)** — Wave 5 button to the right of the "catalogue updated N days ago" pill. Triggers `manual-refresh-ai-plant` to re-ask Gemini against this plant; on success a toast reports how many fields changed and the chip clears. Disabled and tooltipped for 7 days after a successful refresh (or after a `rate_limited` edge response). Hidden for deep forks since they've opted out of catalogue updates.

#### 2. Schedule tab

- See what blueprints affect this plant; add new ones.

#### 3. Guides tab

- AI care guide (if Sage/Evergreen) + linked community guides.

#### 4. Light tab

- Lux history per area hosting this plant. Spot mismatches.

#### 5. Companions tab

- Beneficial + antagonistic plants. Drives garden layout decisions.

#### 6. Refresh from provider

- Re-fetches latest care data from Perenual / Verdantly / AI. Useful if the original entry was incomplete.

### Tier-by-tier experience

| Tier | Differences |
|------|-------------|
| Sprout | Care + Light + Companions. |
| Botanist+ | + Perenual refresh. |
| Sage/Evergreen | + Guides AI care guide. |

### Common mistakes / pitfalls

- **Editing plant-level when you wanted per-instance.** Per-instance tweaks (this specific tomato's growth state) belong in Instance Edit Modal.
- **Refresh overwriting your edits.** Refresh from provider replaces care fields — back up first.

### Recommended workflows

- **After AI identify:** open the new plant → Refresh → confirm care fields look right.
- **Mid-season:** check Light + Companions to validate placement.

### What to do if something looks wrong

- **Empty care fields:** original add may have been "manual" with no provider data. Use Refresh.
- **Companion data missing:** that species isn't in the companion DB. Companion tab will show empty.

---

## Related reference files

- [Plant Assignment Modal](./07-plant-assignment-modal.md)
- [Instance Edit Modal](./08-instance-edit-modal.md)
- [The Shed](../03-garden-hub/01-the-shed.md)
- [Plant Providers (cross-cutting)](../99-cross-cutting/25-plant-providers.md)

## Code references for ongoing maintenance

- `src/components/PlantEditModal.tsx`
- `src/components/PlantScheduleTab.tsx`
- `src/components/PlantGuidesTab.tsx`
- `src/components/LightTab.tsx`
- `src/components/CompanionPlantsTab.tsx`
- `src/lib/plantProvider.ts`
