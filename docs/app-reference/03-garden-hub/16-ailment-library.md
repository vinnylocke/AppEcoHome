# Ailment Library

> **Stage E note (2026-07-22):** the shareable detail contract moved to `/shed?tab=watchlist&detail=<id>` (same numeric `ailment_library.id`). This page still works but no longer receives in-app links (the AI "In library" chip retargeted); Stage F will replace it with a redirect.

> The field guide — a full-page browse of the global catalogue of pests, diseases, invasives and disorders, with a full-page detail per entry and two save actions: **🔭 Watch** (adds it to this home's watchlist) and **♥ Favourite** (saves it to your personal cross-home list). Rebuilt as the "field guide" in the ailment-library-shed-search overhaul Stage 1 (2026-07-21); previously an icon-only card wall with a small detail modal.

**Route:** `/ailment-library` (lights the **Tools** nav item; also reached from the Watchlist's "Browse the ailment library" button and the Tools hub tile).
**Deep link:** `?ailment=<id>` opens that entry's detail (used by the Watchlist AI results' "In library" chip). Opening **pushes** (back closes the detail); the X replaces back to browse.
**Source file:** `src/components/AilmentLibrary.tsx`

---

## Quick Summary

Browse: a `max-w-5xl` page with a large always-visible search (client-side over ~1000 catalogue rows: name / scientific / aliases / affected plants), kind chips (pest/disease/invasive/disorder), severity chips (low→critical), and a **Watching** smart chip. Cards carry thumbnails (kind-tinted icon tile fallback), severity + kind chips in the HC-aware `status-*` families, and a Binoculars quick-watch (or a "Watching ✓" chip). Detail: a full-page takeover — hero (image/tile, name, aliases, kind/severity/season/organic chips), the Watch / Favourite / Ask-AI action bar, a "could affect your garden" strip matched against the home's shed plants, then un-boxed editorial sections (About · Symptoms · Causes · Treatment · Prevention · Affected plants/families).

---

## Role 1 — Technical Reference

### Component graph

```
AilmentLibrary ({ homeId, aiEnabled })
├── Browse (when no ?ailment= param)
│   ├── Back → /shed?tab=watchlist
│   ├── Search input (ailment-library-search)
│   ├── Kind chips (ailment-filter-all / ailment-filter-{kind})
│   ├── Severity chips (ailment-severity-{low|moderate|high|critical}) + Watching chip (ailment-filter-watching)
│   └── Card grid 1/2/3-col
│       └── Card (ailment-card-{id}) — SmartImage thumb / kind tile, severity chip,
│           kind chip, affected-plants line, Binoculars quick-watch (ailment-watch-{id})
│           or "Watching ✓" chip
└── Detail takeover (when ?ailment=<id> resolves — REACTIVE derivation from params)
    ├── Back (ailment-detail-back) — replaces the param away
    ├── Hero (image/tile + name + scientific + aliases + kind/severity/season/organic chips)
    ├── Action bar
    │   ├── 🔭 Watch (ailment-add-watchlist) — gated can("ailments.add"); "Watching ✓" state
    │   ├── ♥ Favourite (ailment-detail-favourite, aria-pressed) — never permission-gated
    │   └── ✦ Ask Rhozly AI (ailment-detail-ask-ai) — aiEnabled only
    ├── Could-affect strip (ailment-could-affect) — persona-voiced
    └── Editorial sections (divide-y, un-boxed)
```

### Props received

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `homeId` | `string` | `profile.home_id` (App route) | Watchlist writes + watching-state + shed-plant match |
| `aiEnabled` | `boolean` | `profile.ai_enabled` | Shows the Ask-AI action |

### Data flow — read paths

- `fetchAilmentLibrary()` — the whole catalogue (≤1000 rows), filtered client-side.
- `ailments` (name, is_archived) for the home → **watching-state**: normalized-name keys (`ailmentIdentityKey`) of non-archived rows. Stable because `mapLibraryToWatchlistPayload` writes `name` verbatim and no UI path renames watchlist ailments. A same-named manual/Perenual/AI row also reads as Watching (it *is* being watched).
- `listFavouriteAilments()` → `ailment_library_id → favourite row id` map for the ♥ fill.
- `plants` (common_name, is_archived) for the home → the could-affect match (`matchAffectedPlants`, pure + unit-tested; naive plural bridging, ≥3-char tokens, cap 3).

### Data flow — write paths

- **Watch** → `addLibraryAilmentToWatchlist` (the existing library→watchlist mapping; home `ailments` insert, `source='library'`). Optimistic key-set update.
- **Favourite** → `favouriteLibraryAilment(row, homeId)` → `favouriteAilment(input, homeId, row.id)` with the **pre-resolved library id** (Stage 1 refactor — skips the name-ilike resolution; the favourite is always "live"). Unfavourite → `unfavouriteAilment(rowId)`.
- **Never writes `ailment_library`** — the catalogue is service-role-only.

### Edge functions invoked

None directly (Ask-AI opens the Plant Doctor chat with page context; the chat owns its calls).

### Cron / scheduled jobs that affect this surface

| Cron | Effect |
|------|--------|
| `seed-ailment-library` (weekly) | Grows the catalogue |
| `verify-ailment-library` (weekly) | AI self-critique amends unverified rows |

### Realtime channels

None — watching/favourite state is optimistic + refetched on mount.

### Tier gating

- Browse + detail + **Watch** + **Favourite**: every tier (library source is tier-open, matching the watchlist's library adds and the favourites source×tier matrix).
- **Ask Rhozly AI**: `aiEnabled` (Sage/Evergreen).

### Beta gating

None.

### Permissions

| Affordance | Gate |
|------------|------|
| 🔭 Watch (card quick-action + detail button) | `can("ailments.add")` — writes a home row. Non-permitted users still see the "Watching" state chips. |
| ♥ Favourite | None — personal, never permission-gated (matches the watchlist heart). |

### Error states

| State | What happens |
|-------|--------------|
| Catalogue fetch fails | Toast "Couldn't load the ailment library." |
| Favourites fetch fails | Silent — favourites are an enhancement; browse still works |
| Watch/favourite write fails | Toast with the error; state not updated |
| `?ailment=` id not found | Browse renders (the param simply doesn't resolve) |

### Performance

- One catalogue fetch per mount; all filtering client-side.
- Detail is a conditional render (browse state survives behind it — no refetch on close).

### Linked storage buckets

None (images are catalogue URLs via `SmartImage`).

---

## Role 2 — Expert Gardener's Guide

### Why open this

It's the field guide you'd keep in the potting shed: every pest, disease, invasive and disorder Rhozly knows, with symptoms, causes, treatment and prevention. Come here to put a name to something you spotted — or before the season starts, to line up the usual suspects for your crops and put them under watch.

### Every flow

1. **Browse & search** — type a name, a symptom or a plant ("tomato" finds everything that loves tomatoes). Narrow by kind or severity.
2. **Open an entry** — tap a card for the full page: what it is, what it looks like, what causes it, how to treat it, how to prevent it.
3. **🔭 Watch it** — the binoculars add it to *this garden's* watchlist, prevention/remedy steps included. The button flips to "Watching in this garden" — and the card shows a Watching chip from then on.
4. **♥ Favourite it** — the heart saves it to *your* list, which follows you across every garden you tend (it appears under Watchlist → Favourites).
5. **✦ Ask Rhozly AI** (Sage/Evergreen) — opens the chat with this ailment loaded: "is this treatable organically near a pond?"
6. **Check your exposure** — the amber strip tells you when you grow plants this problem loves.
7. **See what you're watching** — the **Watching** filter chip shows only entries already on this home's watchlist.

### Information on display — what every field means

| Element | Meaning |
|---------|---------|
| Kind chip | Pest / Disease / Invasive / Disorder (colour-coded, HC-aware) |
| Severity chip | Low → Critical — how bad an unchecked case gets |
| Season chip | When it's most active |
| "Organic remedies" leaf | The treatment can be handled organically |
| "Watching ✓" | Already on this home's watchlist |
| Filled ♥ | In your personal cross-home favourites |
| Amber strip | You grow plants this ailment affects — named |

### Tier-by-tier experience

| Tier | Differences |
|------|-------------|
| Sprout / Botanist | Everything except Ask-AI. Watch + Favourite fully available (library source is open to all). |
| Sage / Evergreen | Plus the ✦ Ask Rhozly AI action. |

### Common mistakes / pitfalls

- **Watching ≠ favourited.** Binoculars = this garden's watchlist (shared with your household). Heart = your own list, across gardens. They're independent — use both when it matters.
- **The library is read-only.** To edit steps or add photos, do it on the *watchlist copy* after watching it.
- **"Watching" won't turn off here.** Un-watch by archiving/deleting the row on the Watchlist (that's a household action with permissions; the library just reflects it).

### Recommended workflows

- **Pre-season sweep:** filter by your main crop ("tomato" in search) → watch the 2–3 usual suspects → their prevention steps are now one tap from becoming routines.
- **Mystery symptom:** search what you see ("white coating") → compare candidates' symptom lists → watch the best match → link it to the affected plant from the plant's card.

### What to do if something looks wrong

- **A card shows Watching but the watchlist doesn't list it:** the watchlist may be filtered (type/search/Archived) — clear the filters.
- **The heart won't fill:** a network hiccup — the toast will say; try again.
- **An entry's facts look off:** the catalogue self-audits weekly (AI verification) — flag it via Contact Support if it persists.

---

## Related reference files

- [Ailment Watchlist](./02-watchlist.md) — where watched ailments live; the Favourites scope; the tiered Find-an-ailment search
- [Data Model — Ailments](../99-cross-cutting/06-data-model-ailments.md) — `ailment_library`, `ailments`, `user_favourite_ailments`
- [Link Ailment Modal](../08-modals-and-overlays/14-link-ailment-modal.md) — linking a watched ailment to a plant
- [Tools Hub](../05-tools/01-tools-hub.md) — the Diagnose & Learn tile that opens this
- [Tier Gating](../99-cross-cutting/17-tier-gating.md) — the favourites source × tier matrix

## Code references for ongoing maintenance

- `src/components/AilmentLibrary.tsx` — the whole surface (browse + detail takeover)
- `src/services/ailmentLibraryService.ts` — catalogue fetch, watchlist mapping, `libraryRowToFavouriteInput` + `favouriteLibraryAilment` (unit tests `tests/unit/lib/ailmentMapping.test.ts`)
- `src/lib/ailmentPresentation.ts` — kind/severity status-token maps + `matchAffectedPlants` (unit tests `tests/unit/lib/ailmentPresentation.test.ts`)
- `src/services/favouritesService.ts` — `favouriteAilment` (now takes an optional pre-resolved library id), `listFavouriteAilments`, `unfavouriteAilment`
- `supabase/seeds/16_ailment_library.sql` — e2e catalogue rows (global table — per-worker idempotent rules documented in-file)
- `src/components/ailments/AilmentDetailBody.tsx` — the extracted detail BODY (hero + action bar + could-affect + editorial sections; Stage 2 of the hub search-first overhaul). Rendered by BOTH this page's `?ailment=` detail AND `src/components/ailments/AilmentDetailModal.tsx` (the z-[100] modal the watchlist's search overlay opens on result-row tap — plants parity)
- `tests/e2e/specs/ailment-library.spec.ts` — AILIB-001..003, 010..013
