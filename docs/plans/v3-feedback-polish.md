# Hub v3 Feedback Polish — visibility model, watchlist rebrand, lifecycle fixes

**Status: APPROVED ("go for it") and BUILT 2026-07-22.** Implementation notes: auto-affinity choke points are `TheShed.savePlantToDB` (all plant add paths) and the page-level `autoWatch` in AilmentWatchlist (onSaved + bulk onCreated + ?detail= watch); the one-verb watch lives in `AilmentDetailModal` (home row + 🔭 in one tap); the owner's prod account was bulk-set (19 plants ♥, Aphids + Slugs 🔭 — script `scratchpad/bulk-heart-owner.mjs`, idempotent). `AilmentDetailBody`'s fav props became optional no-ops (the ♥ toggle died). Legacy flag branch untouched throughout. **Review catches applied (fresh reviewer, FIX FIRST x2 + judgment call):** (1) the one-verb watch wrapper double-fired the cross-home write (autoWatch already covers both hosts) — wrapper reverted to plain onWatch; (2) AilmentCard kept overflow-hidden on the root, clipping the kebab menu on short cards — moved to the image block (rounded-t-3xl), the exact plants-card lesson; (3) best-effort auto-affinity could make a just-added row VANISH (offline/tier-locked) — session-added id refs (plants + ailments) keep fresh adds visible under All regardless, which also cures the pre-refresh flash. Dead shell fav props removed. Owner feedback (post OS 41.0040), five items. Investigated via a 3-agent recon (prod data audit + code recon + heart/layout audit) and a live Playwright audit of both hub tabs.

**Owner decisions (locked via AskUserQuestion):**
1. **Merged chip** — ailments: "Watching" + "🔭 Mine" collapse into ONE **🔭 Watchlist** chip ("change watchlist/mine to just watchlist with binoculars").
2. **Page title → "Ailments"** (matches the tab).
3. **"N past" history chip** on Shed cards — approved.
4. **THE MODEL (owner-stated):** *"as they're not hearted they shouldn't be visible … I want them hearted for now but that's how this feature should work."* → **Default visibility = presence OR affinity.** A home row with no live/ended data AND no ♥/🔭 disappears from the default list (stays findable in search's "In your garden"). Bulk-♥ the owner's 19 zero-presence plants now (explicit consent) so nothing vanishes for them during the transition.

**App-reference consulted:** `03-garden-hub/01-the-shed.md`, `02-watchlist.md`, `12-senescence.md`, `16-ailment-library.md` (archived), `99-cross-cutting/21-routing.md`, `36-plant-search.md`, `17-tier-gating.md`; plan of record `garden-hub-v3-presence-curation.md` (§2a/§2b model rules).

---

## Item 1 — "Everything shows Active" — NO FIX NEEDED (verified on your prod data)

A read-only audit of your production home (22 plants, 12 instances, 2 ailments) proves the derivation already does exactly what you asked for:

| Your data | Derived state | Why |
|---|---|---|
| Strawberry | **Active** | 11 live Planted instances in Wooden Square Planter #1 |
| Tomato (ai) | **Inactive** | its one instance was ended |
| 19 others (lavenders, roses, marigolds, …) | **Saved** | no instances, no sowings — curated only |
| 1 archived English Lavender | hidden (search-only) | curated out |
| Aphids, Slugs | **Watching** | no links, no scan sightings |

There are **zero** Unplanted instances and zero legacy rows on your home — the "Unplanted counts as Active" ruling has no effect on your data. "A lot in Active" describes the OLD Active|Archived axis (pre-41.0037) — a stale tab or the `rhozly_legacy_shed_filters` flag would still show it. **Remedy: hard-refresh the app; the Active chip will show exactly 1 plant.** Optional (owner choice): bulk-♥ the 19 Saved plants onto your personal favourites list so they also appear under ♥ Mine.

## Item 2 — Watchlist rebrand + tab-parity sweep (the big one)

The ailments side is half-rebranded: the scope chip says "🔭 Mine" but renders a **lucide Heart next to it** (`AilmentWatchlist.tsx:2434`), and **7 heart render-sites + ~25 "favourite" strings** survive (card ♥ top-right on the photo `1935–1974`, detail ♥ toggle `AilmentDetailBody.tsx:192–209`, takeover result glyph `1259–1266`, FavouriteAilmentsGrid banner/empty/remove, BulkAdd "Mark all as favourites", 7 toasts). None are shared with plants — all local icon/copy edits.

**Changes (decisions locked):**

**2a. The visibility model (both tabs — owner decision #4):**
- Chip rows become **All / Active / Inactive / ♥ Favourites** (plants) and **All / Active / Inactive / 🔭 Watchlist** (ailments). The "Saved" and "Watching" chips DIE; the "♥ Mine"/"🔭 Mine" scope chips merge into the new 4th chip.
- **Default (All) list = rows with presence (active|inactive) OR affinity (♥/🔭)** — zero-presence un-hearted rows are hidden from the grid but stay findable via the search takeover's "In your garden" (pill stays "Saved"). A quiet footer line ("N more in your collection — search to find them") prevents where-did-it-go panic for other users.
- The ♥ Favourites / 🔭 Watchlist chip shows the existing cross-home grids (FavouritePlantsGrid / FavouriteAilmentsGrid) — the affinity view, in-home and tombstones alike.
- Data model unchanged (no migration): this is presentation-layer filtering; §2a curation semantics (home row, is_archived) stay as-is underneath.
- **Owner one-off:** bulk-♥ the 19 zero-presence plants on the owner's prod account (idempotent script, explicit consent given).
- Ailment detail action bar simplifies to ONE watch verb: "Add to watchlist" creates the home row AND sets the 🔭 affinity in one tap (the separate cross-home ♥ toggle dies with the merged concept). Unwatch flows stay on the card/grid.

**2b. The rebrand sweep:**
1. Every ailment Heart → `Binoculars`; every "favourite(s)" string → watchlist voice. Testid renames (`favourite-ailment-*` → `watch-ailment-*`, `ailment-detail-favourite` → `ailment-detail-watchlist-toggle`, `ailment-library-fav-glyph-*` → `-watch-glyph-*`, `watchlist-favourites-*` grid ids) + PO/spec sweep. CSV template keeps parsing the `favourite` header (back-compat) but relabels to "Add to watchlist". Events/service/DB names unchanged (analytics continuity).
2. Header title "Watchlist" → **"Ailments"** (decision #2).
3. **Card parity** (the visible "layouts are different"): ailment cards move photo-overlay ♥/archive/delete into the body row + kebab (the Wave 22.0009 pattern plants use), gain `data-testid="ailment-card-{id}"` + stagger entrance, source badge to bottom-left, grid gains `xl:grid-cols-4 gap-6`. Type row stays (domain-specific); ailments gain HubHeader `bleed` parity.
4. Optional (flagged, not default): re-ink the rose `status-watch` token family (reads "heart-pink" everywhere the watch layer renders).

## Item 3 — "1 planted" survives End of Life — BUG + new chip

`useCachedShed.ts:69–89` counts **every instance ever created** (`inventory_items(id)` embed, no filter) while the presence view correctly filters `ended_at IS NULL AND status <> 'Archived'` — so a dead plant shows the Inactive pill *next to* "1 planted". Fix: select `inventory_items(id, ended_at, status)` and count only live rows. Plus (per your suggestion, pending Q3): a muted **"N past"** chip on the Shed card + takeover meta when ended instances exist.

## Item 4 — Lost senescence detail — one-wire restoration

The old Senescence page's Eye button opened `InstanceEditModal` on the ended row — which still fully handles ended instances: "Lifecycle complete" card → **Amend** (`LifecycleCompleteModal` amend mode: correct `was_natural_end`, edit `end_summary`) → **AI re-run** on a natural→not-natural flip (`analyse-plant-end-of-life`, persists a "Lifecycle analysis" journal entry) → journal/photos/stats tabs. `PlantInstancesTab` **already mounts all three modals** — the History rows just never got a tap target (`PlantInstancesTab.tsx:488–517`, Restore only). Fix: make the History row body tappable (+ eye affordance) → `setEditing(row)`; port the closing-photo thumbnail lazy-load from `SenescenceTab.tsx:103–126`. Amend, AI feedback, and detail editing all return with no new components.

## Item 5 — Desktop modal tabs unreachable

`PlantEditModal.tsx:642`: 8 tabs needing ~1,200px inside a 768px modal, `scrollbar-none` everywhere, right-fade only — mouse users cannot reach Companions / In your garden. Fix (minimal): show a thin scrollbar on pointer-fine devices only + map vertical wheel to horizontal scroll on the strip + add the missing left fade; correct the stale comments.

---

## Files to change
- **Item 2:** `AilmentWatchlist.tsx`, `ailments/AilmentDetailBody.tsx`, `ailments/AilmentDetailModal.tsx`, `favourites/FavouriteAilmentsGrid.tsx`, `BulkAddAilmentsModal.tsx`, `uploadTemplates/registry.ts` (label only), possibly `index.css` (token); PO `WatchlistPage.ts` + watchlist/favourites specs.
- **Item 3:** `hooks/useCachedShed.ts`, `TheShed.tsx` (card chip), `shed/PlantSearchTakeover.tsx` (meta line).
- **Item 4:** `plant/PlantInstancesTab.tsx` (+ closing-photo fetch).
- **Item 5:** `PlantEditModal.tsx`, `index.css` (scrollbar utility if needed).
- **Item 1:** no code; optional one-off bulk-♥ script on the owner's account (explicit consent required).

## App-reference to update
`01-the-shed.md` (card chips), `02-watchlist.md` (rebrand + card parity), `12-senescence.md` (History detail restored), `05-plant-modals/*instances*` file if present, `36-plant-search.md` (meta line), `40-design-system.md` (scrollbar utility if added), e2e-plan rows (06-shed, 11-watchlist), TESTING.md counts.

## Risks
- Testid renames touch many specs — sweep + full watchlist/shed suites before deploy.
- The two-Binoculars collision (home Watch button vs cross-home toggle in the detail action bar) needs the Q1 naming to disambiguate verbs ("in this garden" vs "follows you across homes").
- Item 4 reopens `InstanceEditModal` on ended rows inside the plant modal — z-stack verified fine (it already mounts there for live rows).

## Sequencing (single deploy, one stage)
Item 3+4+5 (mechanical fixes) → Item 2 (rebrand + parity) → tests + docs → review → deploy.
