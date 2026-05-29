# Senescence

> The history of every plant instance whose life cycle has ended — natural harvest closes, frost kills, pests, mistakes. Reversible by design: restore brings an instance back to "Planted" and re-runs the task generator.

**Route:** `/shed?tab=senescence` (third tab on the Garden Hub tab strip; reached via the Senescence button on the Plant Instances tab or the cross-surface banner)
**Source files:**
- `src/components/garden/SenescenceTab.tsx` — the tab itself
- `src/components/GardenHub.tsx` — tab strip wiring
- `src/components/plant/PlantInstancesTab.tsx` — banner + per-row "End of Life" entry point
- `src/components/HarvestEndOfLifePrompt.tsx` — task-driven multi-select prompt fired after Harvesting completion

---

## Quick Summary

The Senescence tab shows every `inventory_items` row where `ended_at IS NOT NULL`. Each row carries the closing context: when it ended, whether it was a natural end (`was_natural_end`), the optional closing note (`end_summary`), and the closing photo lazily pulled from the most recent matching `plant_journals` entry. Three filter pills — All / Natural / Other — let the user split closures by reason. Each row has an Eye icon (opens `InstanceEditModal` so the user can still inspect notes / photos) and an ArchiveRestore icon which, on confirmation, clears the EoL fields, flips `status` back to `Planted`, writes a "Restored from Senescence" journal entry, and re-fires the `generate-tasks` edge function so any blueprint-driven routines that should resume actually do.

The term **Senescence** is the botanical term for the natural ageing-and-shutdown phase of a plant; an `InfoTooltip` next to the heading explains this in plain English. New gardeners reach the tab through the banner on Plant Instances ("X ended → Senescence"), so they're not expected to find it by name.

---

## Role 1 — Technical Reference

### Component graph

```
SenescenceTab
├── Header
│   ├── Heading "Senescence"
│   ├── InfoTooltip (persona-aware copy)
│   └── Filter pills (All / Natural / Other)
├── Loading state (Loader2)
├── EmptyState (no ended instances)
├── Senescence list
│   └── SenescenceRow ×N
│       ├── Closing photo thumbnail (lazy-loaded from plant_journals)
│       ├── Plant name + identifier / nickname
│       ├── Area + location chips
│       ├── End reason badge (Natural / Other)
│       ├── ended_at date + planted_at duration
│       ├── end_summary excerpt (if present)
│       ├── Eye button → InstanceEditModal
│       └── ArchiveRestore button → ConfirmModal → Restore handler
├── InstanceEditModal (when Eye clicked)
└── ConfirmModal (when ArchiveRestore clicked)
```

### Props received

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `homeId` | `string` | `GardenHub` | Scopes the inventory_items query and journal lookups to the active home |
| `aiEnabled` | `boolean` | `GardenHub` | Currently unused on the tab itself; passed for parity with sibling tabs (forwarded to InstanceEditModal if future features need it) |
| `isPremium` | `boolean` | `GardenHub` | Reserved for future tier-gated features (e.g. AI senescence analysis); currently no effect |

### State (local)

- `rows: SenescenceRow[]` — ended instances after filter applied (in render this is filtered from the full set; the raw fetch returns all ended rows for this home)
- `loading: boolean` — first-load spinner
- `filter: "all" | "natural" | "not-natural"` — drives the visible subset
- `restoreTarget: SenescenceRow | null` — opens the ConfirmModal when set
- `isRestoring: boolean` — disables Restore CTAs during the multi-step restore flow
- `viewing: SenescenceRow | null` — opens InstanceEditModal when set
- URL-driven: `?plant=<instanceId>` query param highlights / scrolls to a specific row when the user lands here from the Plant Instances banner

### Data flow — read paths

1. **Ended-instance fetch** (mount)
   - Calls `supabase.from('inventory_items').select('...').eq('home_id', homeId).not('ended_at', 'is', null).order('ended_at', { ascending: false })`
   - RLS: `home_members` membership policy on `inventory_items` enforces home scoping
   - No cache — this list changes infrequently and we want fresh state after Restore writes
2. **Closing photo lazy-load** (per row, post-render)
   - For each row, `supabase.from('plant_journals').select('image_url').eq('inventory_item_id', row.id).ilike('subject', 'Lifecycle complete%').order('created_at', { ascending: false }).limit(1)`
   - Stored on the row's `closing_photo_url` field once resolved
   - Falls back to placeholder image if no journal photo exists
3. **InstanceEditModal opening**
   - Defers to that modal's own read paths (plant details, journal entries, schedule history). See [PlantEditModal](../03-garden-hub/01-the-shed.md) for the shared modal's data flow notes.
   - From here the user can **Amend** the End-of-Life — the modal's "Lifecycle complete" card has an "Amend" button that opens [LifecycleCompleteModal](../08-modals-and-overlays/37-lifecycle-complete.md) in amend mode to correct `was_natural_end` (natural ↔ other) and `end_summary` without restoring + re-ending. Flipping natural → other re-runs the AI analysis (Sage+). The `natural` / `not-natural` filter pills reflect the amended value after refresh.

### Data flow — write paths

1. **Restore an ended instance**
   - Triggered by ArchiveRestore button → ConfirmModal confirm
   - Steps in order:
     1. `supabase.from('inventory_items').update({ ended_at: null, was_natural_end: null, end_summary: null, status: 'Planted' }).eq('id', restoreTarget.id)`
     2. `supabase.from('plant_journals').insert({ home_id, inventory_item_id, subject: 'Restored from Senescence', description: 'Instance restored to Planted from the Senescence tab.', image_url: null })`
     3. `supabase.functions.invoke('generate-tasks', { body: { homeId } })` — re-runs the materialiser so blueprint-driven routines for this instance resume
   - Side effects: row disappears from Senescence tab; reappears on Plant Instances tab; any blueprint with `auto_generate_for_new_plantings = true` may schedule fresh tasks
   - Optimistic UI: row is immediately removed from local state before the network round-trips finish
   - Offline behaviour: none — restore is online-only (the generate-tasks edge function requires connectivity)
   - Error path: failed update reverts local state, toast surfaces the error

### Edge functions invoked

| Function | When | Input | Output | Downstream |
|----------|------|-------|--------|------------|
| `generate-tasks` | After a successful Restore | `{ homeId }` | `{ generated: number }` | Materialises any ghost tasks owed by blueprints; re-binds restored instance to active routines |

### Cron / scheduled jobs that affect this surface

None. Senescence is a manual lifecycle endpoint; nothing automatic ages a plant into this list. The only cron that touches `inventory_items` is the task generator (see [Cron Jobs](../99-cross-cutting/11-cron-jobs.md)), which reads but does not write `ended_at`.

### Realtime channels

None on this tab. It refreshes by re-mounting (tab switch or page navigation) and by local state mutations after Restore. If multi-user lifecycle events become common, a `home_id`-scoped channel on `inventory_items` would be the place to subscribe.

### Tier gating

- **Sprout / Botanist / Sage / Evergreen** — identical tab UX. Restore is unrestricted. AI-driven post-restore suggestions (e.g. "this plant tends to bolt — try a heat-tolerant variety next time") are reserved for future Sage+ work and are not yet shipped.

### Beta gating

None.

### Permissions / role-based UI

- Restore requires `inventory.write` permission. Members with read-only access see the tab but the ArchiveRestore button is hidden and the Eye-only path remains available.
- Per [Members & Permissions](../07-management/02-members-permissions.md), the `inventory.write` key is owned by Owners and Editors by default.

### Error states

- **No ended instances yet** → `EmptyState` with copy explaining what Senescence is and pointing back to The Shed
- **Network failure on fetch** → Loader2 stays visible; toast surfaces the error; retry happens on tab re-mount
- **Restore failure** → toast surfaces the error, local state is reverted (the row reappears in the list)
- **InstanceEditModal failure** → handled by the modal itself; falls through to its own error states

### Performance notes

- Photo lazy-load is per-row to avoid a single `IN (...)` over potentially hundreds of journal rows; in practice most users have <20 ended instances, so the network cost is negligible
- No virtualization yet — if the list grows beyond a few hundred rows we'd switch to a windowed list (rare in normal use)

### Linked storage buckets

- `plant-images` — read access for the closing photo thumbnail (the photo itself was written by the surface that ended the instance, not by this tab). See [Data Model — Media](../99-cross-cutting/07-data-model-media.md).

---

## Role 2 — Expert Gardener's Guide

### Why open this screen

Plants end. Tomatoes finish their run, basil bolts, raspberries get pruned to the ground for winter, a frost takes a seedling, a slug wins. Up to now Rhozly hid those ended plants behind an "Archived" status that mixed harvest-complete with "I-changed-my-mind-and-removed-this", and neither of those is the same thing. Senescence separates them.

The tab is your living archive — *what was here, when it ended, and why*. For a beginner this is reassurance: nothing is lost, mistakes can be undone, history is preserved with photos and notes. For an expert it's a learning loop: scroll back through last season's tomatoes, see which varieties produced longest, read your own closing notes ("aphids in week 8, switched to companion planting next year") and use the data to plan better. Restore is the safety net — accidentally marked something? One tap to bring it back, including its task routine.

The botanical word *senescence* is deliberate. It points at the natural process — leaves yellow, fruit sets, the plant winds down — rather than the punitive feeling of "deleted" or "archived". A small InfoTooltip explains it for anyone who hasn't met the term before.

### Every flow on this page

1. **Browsing ended instances**
   - You see: a chronological list, most recently ended at the top, with thumbnails, names, areas, dates, and reason chips.
   - You take: scroll, tap a row's Eye icon to inspect the original plant card (notes, journal, photos).
   - What happens: opens `InstanceEditModal` in read-friendly mode — you can still add notes after the fact.
   - Why a gardener cares: this is your seasonal autopsy. What worked, what didn't, when did each plant tap out.
   - Beginner framing: "your history of plants — nothing is ever truly deleted". Expert framing: "season-over-season comparison data".

2. **Filtering by end reason**
   - You see: three pills — *All*, *Natural*, *Other*.
   - You take: tap a pill.
   - What happens: list filters by `was_natural_end` (true → Natural, false → Other, null → both excluded from the two specifics but included in All).
   - Why a gardener cares: separates "the plant ran its course" from "I ended it deliberately" — useful when reviewing seasonal performance vs reviewing your own mistakes.

3. **Restoring an instance**
   - You see: an ArchiveRestore icon on each row.
   - You take: tap it; a ConfirmModal opens explaining what restore does.
   - What happens: confirmation closes the modal, the row disappears from Senescence and reappears on the Plant Instances tab as "Planted", a "Restored from Senescence" journal entry is written, and the task generator is re-fired so any blueprint-driven routines (watering / pruning / feeding) that should resume will start producing tasks again. Existing routine customisations are preserved — restore does NOT recreate or reset blueprints.
   - Why a gardener cares: the safety net. The wrong plant ended, or end-of-season turned out to be premature (re-flush of basil, autumn harvest of overwintered chard), or you want to revive a record for any reason. Restore puts it back without ceremony.

4. **Landing here from the banner**
   - You see: a banner on the Plant Instances tab — "X ended → Senescence" — appears when the species you're viewing has at least one ended instance.
   - You take: tap the banner.
   - What happens: navigates to `/shed?tab=senescence&plant=<instanceId>` (or species-scoped). The matching row is scrolled into view.
   - Why a gardener cares: connects the "live" view of a species to its history without making you remember which tab to check.

### Information on display — what every field means

- **Plant name / identifier / nickname** — the same display name the instance had on Plant Instances.
- **Area / location chips** — where the plant lived when it ended. Useful for "what was in this raised bed last summer?" questions.
- **End reason badge** — *Natural* (was_natural_end=true; covers harvest closes and natural senescence) or *Other* (deliberate ending: pest, mistake, redesign, etc).
- **Ended-at date** — when the EoL was recorded, not necessarily when the plant actually stopped growing.
- **Planted-at duration** — "lived 87 days" type insight when both timestamps are present.
- **Closing note** — `end_summary` text the user wrote during the EoL flow (optional).
- **Closing photo** — the most recent `plant_journals` entry whose subject begins with "Lifecycle complete" — your final image of the plant.

### Tier-by-tier experience

Identical across tiers today. Future Sage+ enhancements (AI-suggested next-season picks based on what ended naturally vs poorly) are reserved.

### New user vs returning user vs power user

- **Brand new user** — empty state; the copy explains the concept. They reach this tab almost never until something ends.
- **Returning user** — a handful of ended rows from one season's worth of harvests; useful as a quick "what did I grow last spring" glance.
- **Power user** — dozens of rows across seasons; filter pills become important; their closing notes have detail that compounds over years.

### Beta user experience

No beta-only features.

### Common mistakes / pitfalls

- "I clicked End of Life by accident and now my plant is gone" — Restore reverses it cleanly. Tell users this in onboarding copy.
- "Will my routines still work after restore?" — yes. Restore re-fires generate-tasks so blueprint-bound routines resume. Customised blueprints stay customised.
- "Why isn't my harvest plant here?" — Harvesting tasks only mark End of Life when the user explicitly ticks the plant in the HarvestEndOfLifePrompt that appears after the task completes. Most harvests are non-terminal (cut-and-come-again) so the prompt defaults to nothing selected.

### Recommended workflows

- **End-of-season review**: open Senescence, filter to *Natural*, scroll through with your notebook. Note which varieties produced longest, which had clean closes, which crashed early.
- **Mistake recovery**: open Senescence, find the instance, hit ArchiveRestore. Done.
- **Photo-based memory**: tap Eye on a row to see the closing photo + journal — useful for posting "this is how my tomatoes ended" content or for sharing variety reviews with garden friends.

### What to do if something looks wrong

- **A plant you ended is missing** — did you Delete instead of End of Life? Delete is permanent. Check the journal entries for any backups.
- **Restore didn't bring tasks back** — verify the blueprint is still active in the Schedule Manager. Restore re-fires the generator but it can't materialise from a deleted blueprint.
- **Closing photo missing** — the photo lives in `plant_journals` and is rendered lazily; if the entry was deleted manually, the photo won't appear here.

---

## Related reference files

- [The Shed](./01-the-shed.md) — the canonical Shed view; Senescence sits behind the same `/shed` route as a third tab
- [Plant Instances Tab](../03-garden-hub/01-the-shed.md) — the live-instance counterpart; Senescence banner originates there
- [Lifecycle Complete Modal](../09-persistent-ui/37-lifecycle-complete.md) — the "End of Life" modal that writes ended_at / was_natural_end / end_summary
- [Data Model — Plants](../99-cross-cutting/03-data-model-plants.md) — `inventory_items.ended_at` / `was_natural_end` / `end_summary` columns; restore-flow contract
- [Edge Functions Catalogue](../99-cross-cutting/10-edge-functions-catalogue.md) — `generate-tasks` documentation
- [Tier Gating](../99-cross-cutting/17-tier-gating.md) — current parity across tiers
- [RLS Patterns](../99-cross-cutting/19-rls-patterns.md) — `home_members` membership policy applied to `inventory_items`

## Code references for ongoing maintenance

- `src/components/garden/SenescenceTab.tsx` — tab implementation, restore handler, photo lazy-loader
- `src/components/GardenHub.tsx:7-19` — tab strip wiring (TABS array)
- `src/components/plant/PlantInstancesTab.tsx` — cross-surface "X ended → Senescence" banner + per-row End of Life entry
- `src/components/HarvestEndOfLifePrompt.tsx` — Harvesting-task-driven multi-select prompt
- `src/components/InstanceEditModal.tsx` — opened on Eye-icon click
- `src/components/ConfirmModal.tsx` — opened on ArchiveRestore-icon click
- `supabase/functions/generate-tasks/index.ts` — re-fired after Restore
- `inventory_items` table — `ended_at`, `was_natural_end`, `end_summary`, `status` columns
- `plant_journals` table — "Lifecycle complete%" and "Restored from Senescence" entries
