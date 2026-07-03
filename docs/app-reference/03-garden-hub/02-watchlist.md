# Ailment Watchlist

> The tracker for pests, plant diseases, and invasive plants you're keeping an eye on. Linked to specific plant instances so you can see "which of my plants are affected by what."

**Route:** `/watchlist` (inside the Garden Hub tab strip)
**Source file:** `src/components/AilmentWatchlist.tsx`

---

## Quick Summary

A grid of ailment cards. Each card represents one `ailments` row — a pest, disease, or invasive plant defined for this home. Cards show the ailment image, severity badge, prevention/remedy step counts, an "N plants affected" rose chip when at least one plant instance is linked, and an "Ask Rhozly AI about this" button (Sage/Evergreen). Add new ailments via a tiered search: library → more databases → Rhozly AI (which saves its result to the shared library), plus a manual fallback.

A **Home | Favourites** scope pill (above the Active/Archived pills) switches between the shared home-scoped watchlist and the user's personal, **cross-home favourites** list (Cross-Home Favourites Phase 2, 2026-07-03). "Home" is today's data unchanged; "Favourites" starts empty and follows the *user* (keyed on `user_id`, not `home_id`) so it survives home switches and leaving/joining homes. Deep link: **`/shed?tab=watchlist&scope=favourites`** — a new param; the existing GardenHub `?tab=` / `?open=` params are untouched. See [Cross-Home Favourite Ailments (data model)](../99-cross-cutting/06-data-model-ailments.md#cross-home-favourite-ailments--user_favourite_ailments) and [Tier Gating § source × tier action matrix](../99-cross-cutting/17-tier-gating.md#source--tier-action-matrix--cross-home-favourites).

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
│   ├── Source badge (Manual / Library / Perenual / AI — `SOURCE_META`)
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
| **1 · Library** (free, all tiers) | Filters the seeded `ailment_library` client-side (`filterAilmentLibrary`) → results carry a **Library** chip → tap **Add** → `addLibraryAilmentToWatchlist` (**`source='library'`** since `20260824000000`; was `'ai'`). |
| **2 · Databases** | "Search more databases" button → escalates with the query → `perenual-proxy` (`searchPestDisease`) → cart-select → insert (`source='perenual'`). |
| **3 · Rhozly AI ✦** (AI tier) | "Search with Rhozly AI" → `generate-ailment-suggestions` → on add, also **persists the result to the shared `ailment_library`** via `add-ailment-to-library` (so future users find it in Tier 1) + inserts to the watchlist (`source='ai'`). |
| **Manual** | "or add manually" → the free-form `StepBuilder` form (name, type, description, symptoms, prevention/remedy steps). |

**Default search source (`ailment_source`).** Entitled users can set, in the account tab, which tab the
Add-modal opens in by default — `user_profiles.search_settings.ailment_source` ∈ {library, perenual, ai}
(no Verdantly for ailments). `AddAilmentModal` reads it via `useSearchPreference` and sets the initial
`mode` once on load (`perenual` → Databases tab, `ai` → Rhozly AI tab); the user can still switch tabs.
Entitlement-clamped (`clampAilmentSource`): Perenual needs `enable_perenual`, AI needs `ai_enabled`,
otherwise it falls back to library. See [Plant Search](../99-cross-cutting/36-plant-search.md).

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

### Cross-home favourites (Phase 2 — ailments)

Scope pills **Home | Favourites** (`data-testid="watchlist-scope-toggle"`, buttons `watchlist-scope-home` / `watchlist-scope-favourites`). State derives from `?scope=favourites`; `switchScope` does a targeted `setSearchParams` get/set so it never clobbers `?tab=` etc. In Favourites scope the Add button, Active/Archived + type-filter pills, the search box and the library-browse button are hidden.

- **Favourite affordance (Home tab):** a heart button on each `AilmentCard` (`data-testid="favourite-ailment-<ailmentId>"`, `aria-pressed` reflects saved state). Fill is driven by `favouriteKeys` — a Set of `ailmentIdentityKey(name)` (lowercased trimmed name, mirroring `ailment_library.name_key`) because the home `ailments` row carries no stable cross-home id. `handleToggleFavourite` optimistically inserts/removes via `favouritesService`. The heart is always visible (favouriting is personal — never permission-gated), unlike the Archive/Delete buttons which stay `ailments.delete`-gated.
- **Reference resolution.** Unlike plants (which reference an immutable `plants` id), the favourite references `ailment_library.id`, resolved **best-effort by `name_key`** at favourite time (`resolveAilmentLibraryId`) — the home `ailments` row has no library FK. Matched → the favourite renders **live** library data ("always live"); unmatched (manual / one-off ailments) → `ailment_library_id` NULL and the card renders from the jsonb `snapshot` **tombstone** with a "Saved copy" chip. E2E workers don't seed the library, so all their favourite ailments are tombstones.
- **Favourites tab:** `<FavouriteAilmentsGrid>` ([`src/components/favourites/FavouriteAilmentsGrid.tsx`](../../../src/components/favourites/FavouriteAilmentsGrid.tsx)) lists the user's favourites with the live joined `ailment_library` row when resolvable. Actions: **Add to this home** (`favourite-ailment-add-to-home-<id>`) and **Remove** (`favourite-ailment-remove-<id>`); a first-visit **hint banner** (`watchlist-favourites-hint-banner`) and an empty state.
- **Add to this home:** `addFavouriteAilmentToHome` copies the favourite into the active home as a plain **`ailments` insert** (the same path the watchlist add flow uses) — **NO fork.** Ailments have no shared-catalogue edit path like plants had (no copy-on-write requirement), so add-to-home is a straight copy; `source` is preserved (`library` rows stay `library`). Zero AI/API calls, **allowed for any home member regardless of permission keys**. The button reads **"In this home"** (`favourite-ailment-in-home-<id>`, disabled) when `isFavouriteAilmentInHome` finds a home ailment with the same identity key (case-insensitive name).
- **Dedupe.** Two partial unique indexes — `(user_id, ailment_library_id)` where the ref is present, `(user_id, identity_key)` where it's NULL. PostgREST cannot disambiguate two partial uniques via `on_conflict`, so `favouriteAilment` does an explicit **find-then-update-or-insert** (not a supabase-js upsert). Re-favouriting the same identity refreshes the tombstone.
- **Strict source × tier gating:** sources above the viewer's entitlements are **view-only** — the heart AND add-to-home are disabled with an upsell tooltip, enforced **client-side** (`isAilmentSourceLockedForTier`: `ai`→`ai_enabled`, `perenual`→`enable_perenual`, `manual`/`library` open to all) AND **server-side** (a `BEFORE INSERT/UPDATE` trigger `enforce_favourite_ailment_tier` on `user_favourite_ailments` gates on the claimed `source`). See [Tier Gating § source × tier action matrix](../99-cross-cutting/17-tier-gating.md#source--tier-action-matrix--cross-home-favourites).
- **Service:** [`src/services/favouritesService.ts`](../../../src/services/favouritesService.ts) — all reads are `user_id`-only (never `home_id`, which would silently return nothing under the user-scoped RLS). Events: `AILMENT_FAVOURITED` / `AILMENT_UNFAVOURITED` / `FAVOURITE_AILMENT_ADDED_TO_HOME`.

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
| Sprout | Manual mode only. AI suggest + Ask AI hidden. Perenual gated if not on perenualEnabled. **Favourites: can favourite/add-to-home only manual + library ailments — the ♡ and "Add to this home" are disabled (view-only) on Perenual/AI ailments a housemate added.** |
| Botanist | Manual + Perenual. No AI. **Favourites: can act on manual + library + Perenual ailments; AI ailments view-only.** |
| Sage | All three add modes + Ask AI button. **Favourites: can act on manual + library + AI ailments; Perenual ailments view-only** (Sage has AI, not the species database). |
| Evergreen | Same as Sage, plus the species database. **Favourites: can act on every source.** |

### Beta gating

None.

### Permissions / role-based UI

| Permission | Effect |
|------------|--------|
| `ailments.add` | Add Ailment button |
| `ailments.delete` | Archive + Delete buttons |
| `ailments.link` | LinkAilmentModal usage |

**Favourites are ungated by permission keys:** favouriting/unfavouriting is personal (no `PermissionKey`), and **Add to this home** is allowed for any home member regardless of `ailments.add` (a member write, not an admin action — 2026-07-03 decision). Only the source × tier gate can block a favourite action. Favourites are **not** on a realtime channel (per-user data, mutated only by the same client) — the list refetches on mount and after each mutation.

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

#### 7. Favourites — carry an ailment's playbook to every garden you tend

Tap the **Favourites** pill (next to **Home**) to see your personal saved list of ailments. Unlike the Home watchlist, which belongs to whichever home you're currently in, favourites follow **you** — switch home, leave a home, join a new one, and the prevention/remedy steps you saved are still there.

- **Save one:** tap the ♡ on any ailment card in the Home tab. It fills in, and the ailment lands in Favourites. Tap again to remove it.
- **Bring one into this garden:** on the Favourites tab, **Add to this home** creates a fresh copy of that ailment in the home you're currently in (no AI or database lookup — instant, and free on every tier). Once it's here the button reads **In this home**. Any household member can do this — you don't need special permissions.
- **Old favourites still work:** if an ailment you favourited was never in the shared library (a one-off you typed yourself), the card still shows exactly what you saved (a "saved copy") so the steps travel with you.

### Information on display — what every field means

| Element | Meaning |
|---------|---------|
| Type badge | Pest / Disease / Invasive |
| Source badge | Manual / Library / Perenual / AI |
| N plants affected | Count of `plant_instance_ailments` rows with status='active' |
| Steps count | Prevention + remedy total |
| Photos overlay | Tap to add evidence photo |

### Tier-by-tier experience

| Tier | Differences |
|------|-------------|
| Sprout | Manual only. No AI suggest. No Ask AI. Favourites: can save/copy manual + library ailments; Perenual/AI ailments are view-only. |
| Botanist | Manual + Perenual. Favourites: manual + library + Perenual; AI view-only. |
| Sage | Full feature set. Favourites: manual + library + AI; Perenual view-only. |
| Evergreen | Full feature set + species database. Favourites: every source. |

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

- [The Shed](./01-the-shed.md) — cross-home favourites Phase 1 (plants); mirrors this surface's scope pill + heart + add-to-home
- [Link Ailment Modal](../08-modals-and-overlays/14-link-ailment-modal.md)
- [Plant Doctor](../05-tools/02-plant-doctor.md)
- [Plant Doctor Chat](../05-tools/03-plant-doctor-chat.md)
- [Data Model — Ailments (cross-cutting)](../99-cross-cutting/06-data-model-ailments.md) — `user_favourite_ailments` table
- [Tier Gating](../99-cross-cutting/17-tier-gating.md) — source × tier action matrix for favourites

## Code references for ongoing maintenance

- `src/components/AilmentWatchlist.tsx` — entire component (scope pill, heart, favourites wiring)
- `src/components/favourites/FavouriteAilmentsGrid.tsx` — Favourites scope body
- `src/services/favouritesService.ts` — favourite/unfavourite, add-to-home (ailment fns)
- `src/lib/favouriteIdentity.ts` — pure ailment identity / gating helpers (unit-tested)
- `src/components/LinkAilmentModal.tsx` — link UI
- `supabase/functions/generate-ailment-suggestions/index.ts` — AI suggest mode
- `supabase/migrations/20260429000000_ailments_watchlist.sql` — base schema
- `supabase/migrations/20260901000000_user_favourite_ailments.sql` — favourites table + RLS + grants + tier-gate trigger
- `supabase/migrations/20260601000000_photo_surfaces.sql` — photo_url + notes columns
