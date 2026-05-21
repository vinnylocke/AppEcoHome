# Instance Edit Modal

> The deepest plant-level view in Rhozly — opens for a single `inventory_items` row. The row may be area-assigned ("Roma in the back bed") OR unassigned ("in the garden, area unknown"). 11 tabs covering details, routine, journal, photos, care guide, **grow guide** (Wave 1 AI 9-section comprehensive guide; see [Grow Guide Tab](./36-grow-guide-tab.md)), community (was "guides"; renamed for clarity), yield, light, stats, companions. The Details tab's location + area pickers are both optional — leaving them blank keeps the instance unassigned; filling both moves it into that area and fires `AutomationEngine.applyPlantedAutomations` so any area-anchored blueprints pick up the now-placed instance.

**Source file:** `src/components/InstanceEditModal.tsx` (~700 lines)

---

## Quick Summary

A focus-trapped portal with a tabbed layout:

| Tab | Purpose |
|-----|---------|
| Details | Growth state, propagation, planted date, **optional** location/area picker (leave blank to keep the instance unassigned), cover image |
| Routine | Per-instance care schedule (InstanceCareRoutine) |
| Journal | Free-text notes timeline (PlantJournalTab) |
| Photos | Photo timeline (PhotoTimelineTab) |
| Care Guide | AI-generated care guide for this species |
| Guides | Linked community guides (PlantGuidesTab) |
| Yield | Harvests + yield log (YieldTab) |
| Light | Lux history for this instance's area (LightTab) |
| Stats | Days-since-planted, total tasks completed, etc. (InstanceStatsTab) |
| Companions | Companion plants (CompanionPlantsTab) |

Cover image is pinned from the Photos tab and refetched on every tab switch.

---

## Role 1 — Technical Reference

### Component graph

```
InstanceEditModal (Portal, focus-trapped)
├── Header (close, cover image, plant name)
├── Tab bar (10 tabs, scrollable on mobile)
├── Active tab body
│   ├── Details (form)
│   ├── Routine → InstanceCareRoutine
│   ├── Journal → PlantJournalTab
│   ├── Photos → PhotoTimelineTab
│   ├── Care Guide → AI care guide renderer
│   ├── Guides → PlantGuidesTab
│   ├── Yield → YieldTab
│   ├── Light → LightTab
│   ├── Stats → InstanceStatsTab
│   └── Companions → CompanionPlantsTab
└── Save / Cancel (Details tab only)
```

### Props

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `homeId` | `string` | parent | Scope |
| `instance` | `any` | parent | The `inventory_items` row |
| `currentAreaId` | `string` | parent | Used for some lookups |
| `onClose` | `() => void` | parent | Hide |
| `onUpdate` | `(payload) => void` | parent | Save callback |
| `onTasksUpdated` | `() => void?` | parent | Refresh after routine changes |
| `aiEnabled` | `boolean?` | parent | Care Guide gate |
| `isPremium` | `boolean?` | parent | Some provider features |

### Data flow — read paths

- Cover image (refetches per tab switch).
- Locations + areas for the Details tab dropdown.
- AI care guide on demand (Care Guide tab).
- Companion plant record (`companion_plants` table) on Companions tab.

### Data flow — write paths

Per-tab; the modal itself just hosts. Details tab calls `onUpdate(payload)` → parent does `inventory_items.update(...)`.

### Edge functions invoked

| Function | When |
|----------|------|
| `plant-care-guide` | Care Guide tab on Sage/Evergreen |

### Cron / scheduled jobs

None directly.

### Realtime channels

None.

### Tier gating

- Care Guide tab content gates on AI flag.

### Beta gating

None.

### Permissions

- `inventory.edit` for Details / Routine changes.

### Error states

| State | Result |
|-------|--------|
| Tab fetch fails | Per-tab error state |
| Save fails | Toast |

### Performance

- Tabs lazy-load — only active tab body renders.
- Cover image refetch debounced per tab switch.

### Linked storage buckets

- `instance-photos` — photo timeline.
- `plant-doctor-images` — care-guide images.

---

## Role 2 — Expert Gardener's Guide

### Why open this modal

This is the per-plant deep-dive. Once you've assigned a plant to an area, every other plant-specific surface (the journal entry you scribbled last week, the harvest you logged, the photo timeline) lives in this modal.

Most users open it weekly per plant during peak season.

### Every flow on this modal

Each tab is a separate flow with its own reference file ([Photo Timeline](./09-photo-timeline-tab.md), [Journal](./10-plant-journal-tab.md), [Companions](./11-companion-plants-tab.md), [Yield](./12-yield-tab.md), [Plant Guides](./13-plant-guides-tab.md)).

#### Details

- Growth state, propagation, planted date, location/area picker.
- Cover image inherits from pinned photo.

#### Care Guide

- Shows the master care guide for the species (read-only here — edit it from Plant Edit Modal).
- **AI freshness callout (Wave 5)** — when this instance's parent plant is an AI catalogue row whose `freshness_version` is ahead of the user's ack, a yellow banner appears at the top of the tab listing the changed fields. "Mark as reviewed" clears the chip for every instance of this plant (since the ack is per-plant, not per-instance). Shallow forks resolve via `forked_from_plant_id` to the global parent.

> **Design decision (Wave 7 D10 — wontfix).** The Care Guide tab here is intentionally read-only. Editing care fields affects the *species* record (`plants` table), not the inventory item. Having two edit entry points (this tab AND Plant Edit Modal) would confuse users about which scope they're modifying. To edit the underlying species record, open the parent plant from The Shed — that's the single, clear entry point for plant-level edits. The Refresh + Revert flows live there exclusively (see [Plant Edit Modal](./06-plant-edit-modal.md#ai-editing-flow)).

### Tier-by-tier experience

| Tier | Differences |
|------|-------------|
| Sprout | No Care Guide AI; other tabs full. |
| Sage/Evergreen | + AI Care Guide. |

### Common mistakes / pitfalls

- **Editing instance fields expecting plant-wide changes.** Use Plant Edit Modal for the species record.
- **Pinning cover image from old photo.** Refresh tab to see the latest cover.

### Recommended workflows

- **Weekly:** open per-plant → journal note → photo if grew noticeably → harvest if any.

### What to do if something looks wrong

- **Tab body empty:** sub-tab data may not exist yet. See sub-tab refs.
- **Cover image not updating:** switch tab and back; refetch happens on each switch.

---

## Related reference files

- [Photo Timeline Tab](./09-photo-timeline-tab.md)
- [Plant Journal Tab](./10-plant-journal-tab.md)
- [Companion Plants Tab](./11-companion-plants-tab.md)
- [Yield Tab](./12-yield-tab.md)
- [Plant Guides Tab](./13-plant-guides-tab.md)
- [Plant Edit Modal](./06-plant-edit-modal.md)
- [The Shed](../03-garden-hub/01-the-shed.md)

## Code references for ongoing maintenance

- `src/components/InstanceEditModal.tsx`
- Sub-tab components per reference above
- `src/lib/plantProvider.ts`
- `src/lib/automationEngine.ts`
