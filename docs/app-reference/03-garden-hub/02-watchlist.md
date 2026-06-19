# Ailment Watchlist

> The tracker for pests, plant diseases, and invasive plants you're keeping an eye on. Linked to specific plant instances so you can see "which of my plants are affected by what."

**Route:** `/watchlist` (inside the Garden Hub tab strip)
**Source file:** `src/components/AilmentWatchlist.tsx`

---

## Quick Summary

A grid of ailment cards. Each card represents one `ailments` row — a pest, disease, or invasive plant defined for this home. Cards show the ailment image, severity badge, prevention/remedy step counts, an "N plants affected" rose chip when at least one plant instance is linked, and an "Ask Rhozly AI about this" button (Sage/Evergreen). Add new ailments via a tiered search: library → more databases → Rhozly AI (which saves its result to the shared library), plus a manual fallback.

---

## Role 1 — Technical Reference

### Component graph

```
AilmentWatchlist
├── Header
│   ├── "Watchlist" title + count badge
│   ├── View tabs: Active / Archived
│   ├── Type filter (All / Pest / Disease / Invasive)
│   ├── Search bar
│   └── Add Ailment button → AilmentAddModal
├── AilmentCard ×N
│   ├── Cover image (from ailment.thumbnail_url)
│   ├── Source badge (Manual / Perenual / AI)
│   ├── Photos quick-add overlay
│   ├── Archive/Restore + Delete buttons (perm-gated)
│   ├── Type badge (Pest / Disease / Invasive)
│   ├── N plants affected chip (rose)
│   ├── Prevention + remedy step counts
│   └── "Ask Rhozly AI" button (Sage/Evergreen only)
├── AilmentDetail modal (when card tapped)
└── LinkAilmentModal (when linking ailment ↔ plant from elsewhere)
```

### Major state

| State | Purpose |
|-------|---------|
| `ailments` | All ailments for this home |
| `affectedCounts` | Map of ailment_id → count of linked plant instances |
| `viewTab` | "active" vs "archived" |
| `filter` | All / pest / disease / invasive |
| `search` | Free text |
| `showAdd` | Add modal open |
| `selectedAilment` | Currently open detail |

### Data flow — read paths

```ts
supabase.from("ailments")
  .select("*")
  .eq("home_id", homeId);

supabase.from("plant_instance_ailments")
  .select("ailment_id")
  .eq("status", "active");
```

Roll up `plant_instance_ailments` into `affectedCounts: Record<ailmentId, number>`.

### Data flow — write paths

#### Add Ailment — tiered search (2026-06-19)

`AddAilmentModal` now mirrors the plant search: **one** search box with progressive tiers
(the old AI / Perenual tabs were removed). Source files: `AilmentWatchlist.tsx` (modal) +
`src/services/ailmentLibraryService.ts` (`filterAilmentLibrary`, `persistAiAilmentToLibrary`).

| Tier | Behaviour |
|------|-----------|
| **1 · Library** (free) | Filters the seeded `ailment_library` client-side (`filterAilmentLibrary`) → results carry a **Library** chip → tap **Add** → `addLibraryAilmentToWatchlist` (`source='ai'`). |
| **2 · Databases** | "Search more databases" button → escalates with the query → `perenual-proxy` (`searchPestDisease`) → cart-select → insert (`source='perenual'`). |
| **3 · Rhozly AI ✦** (AI tier) | "Search with Rhozly AI" → `generate-ailment-suggestions` → on add, also **persists the result to the shared `ailment_library`** via `add-ailment-to-library` (so future users find it in Tier 1) + inserts to the watchlist (`source='ai'`). |
| **Manual** | "or add manually" → the free-form `StepBuilder` form (name, type, description, symptoms, prevention/remedy steps). |

#### Link ailment to plant

Done via LinkAilmentModal (typically opened from a plant card, not from this view).

```ts
supabase.from("plant_instance_ailments").insert({
  plant_instance_id, ailment_id, home_id, linked_by, status: 'active',
  photo_url, notes,
});
```

#### Archive / Delete

Standard pattern. Delete cascades to `plant_instance_ailments` via FK ON DELETE CASCADE.

#### Ask Rhozly AI

```ts
setPageContext({ action: "Asking about a Watchlist ailment", ailment: {...} });
setIsOpen(true);
```

Opens Plant Doctor chat with the ailment loaded as context.

### Edge functions invoked

| Function | When |
|----------|------|
| `generate-ailment-suggestions` | AI search tier |
| `add-ailment-to-library` | Persists an AI result into the shared `ailment_library` (service role; dedups on `name_key`) |
| `perenual-proxy` | Databases tier (pest/disease search) |

### Cron / scheduled jobs that affect this surface

| Cron | Effect |
|------|--------|
| `run-automations` | May complete remedy tasks via integrations |
| `pattern-scan` | Could surface "you've been adding ailments to roses repeatedly" pattern insights |

### Realtime channels

`ailments` and `plant_instance_ailments` filtered by `home_id`. Realtime updates affected counts.

### Tier gating

| Tier | Differences |
|------|-------------|
| Sprout | Manual mode only. AI suggest + Ask AI hidden. Perenual gated if not on perenualEnabled. |
| Botanist | Manual + Perenual. No AI. |
| Sage | All three add modes + Ask AI button. |
| Evergreen | Same as Sage. |

### Beta gating

None.

### Permissions / role-based UI

| Permission | Effect |
|------------|--------|
| `ailments.add` | Add Ailment button |
| `ailments.delete` | Archive + Delete buttons |
| `ailments.link` | LinkAilmentModal usage |

### Error states

| State | Result |
|-------|--------|
| Fetch fails | "Could not load ailments" banner with Retry |
| AI suggest fails | Falls back to manual mode |
| Delete cascades to linked plants — non-recoverable | Confirmation modal warns |

### Performance notes

- Affected counts computed once per fetch.
- Card images use the standard `SmartImage` fallback chain.

### Linked storage buckets

- `plant-images/ailment-evidence` — photos attached to plant_instance_ailments

---

## Role 2 — Expert Gardener's Guide

### Why open the Watchlist

The Watchlist is your encyclopedia of "what could go wrong in this garden" plus a tally of "what IS going wrong right now." For beginners, it's where you learn the symptoms of common problems — slugs, powdery mildew, aphids — before they wreck your work. For experienced gardeners, it's the running log of what's affecting which plants this season, with photos you've taken as evidence.

Three things make the Watchlist powerful:
1. The **N plants affected** chip — gives you instant impact awareness.
2. The **prevention + remedy step counts** — actionable, not just informational.
3. The **AI suggest** mode (Sage/Evergreen) — describe what you see in plain English, get a curated ailment with steps.

### Every flow on this view

#### 1. Add a new ailment

Three modes:
- **Manual**: type everything yourself. Useful for region-specific issues you know.
- **Perenual**: searches a curated database; pick a result and the steps come pre-filled.
- **AI (recommended for new users)**: describe the symptoms in plain English → AI proposes an ailment with structured steps → review and save.

#### 2. View tabs

- **Active**: ailments you're tracking now.
- **Archived**: kept for reference, not surfaced elsewhere.

#### 3. Filter by type

- Pest / Disease / Invasive. Default is All.

#### 4. Tap a card

- Opens the detail view with full description, symptoms, prevention steps (recurring "preventative actions" you should do), remedy steps (acute "this is happening, do this"), photos, and the list of affected plants.

#### 5. Affect counts (rose chip)

- The "N plants affected" chip is the most useful single signal. If you have 5 ailments tracked but only 1 has the rose chip, only 1 is actually live in your garden right now.

#### 6. Ask Rhozly AI (Sage/Evergreen)

- Opens the chat with this ailment loaded. Ask questions like "is it safe to plant tomatoes near a rose with this disease?" or "what's the gentlest remedy for someone with kids in the garden?"

### Information on display — what every field means

| Element | Meaning |
|---------|---------|
| Type badge | Pest / Disease / Invasive |
| Source badge | Manual / Perenual / AI |
| N plants affected | Count of `plant_instance_ailments` rows with status='active' |
| Steps count | Prevention + remedy total |
| Photos overlay | Tap to add evidence photo |

### Tier-by-tier experience

| Tier | Differences |
|------|-------------|
| Sprout | Manual only. No AI suggest. No Ask AI. |
| Botanist | Manual + Perenual. |
| Sage / Evergreen | Full feature set. |

### New user vs returning user vs power user

- **Brand new user**: empty grid; AI suggest mode is the easiest entry point.
- **Returning user**: tracks recurring seasonal issues year to year.
- **Power user**: links every active issue to specific plants, photographs symptoms, runs preventative tasks via blueprints.

### Beta user experience

No difference.

### Common mistakes / pitfalls

- **Adding the same ailment twice (e.g. "Aphid" and "Aphids").** Use the search to check first. The DB allows duplicates.
- **Confusing Manual / Perenual / AI as separate ailments.** They produce the same kind of `ailments` row — the badge just shows the data source.
- **Not linking to plants.** An unlinked ailment never shows on plant cards or in the dashboard count. Link them via the plant card's "Add ailment" flow.

### Recommended workflows

- **Spring health audit:** walk the garden → photograph anything off → use AI suggest mode for each → link to affected plants.
- **Treatment plan:** open the ailment → view remedy steps → tap "Create Treatment Plan" (from Plant Doctor flow) → blueprints get created for each step.

### What to do if something looks wrong

- **Affected count says 0 but you know you've linked plants:** the link may have been to an archived plant instance. Check `plant_instance_ailments` filter.
- **Steps missing on a Perenual import:** Perenual data quality varies — manually add steps via the edit flow.

---

## Related reference files

- [The Shed](./01-the-shed.md)
- [Link Ailment Modal](../08-modals-and-overlays/14-link-ailment-modal.md)
- [Plant Doctor](../05-tools/02-plant-doctor.md)
- [Plant Doctor Chat](../05-tools/03-plant-doctor-chat.md)
- [Data Model — Ailments (cross-cutting)](../99-cross-cutting/06-data-model-ailments.md)

## Code references for ongoing maintenance

- `src/components/AilmentWatchlist.tsx` — entire component
- `src/components/LinkAilmentModal.tsx` — link UI
- `supabase/functions/generate-ailment-suggestions/index.ts` — AI suggest mode
- `supabase/migrations/20260429000000_ailments_watchlist.sql` — base schema
- `supabase/migrations/20260601000000_photo_surfaces.sql` — photo_url + notes columns
