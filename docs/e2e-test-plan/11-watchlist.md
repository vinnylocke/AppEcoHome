# 11. Ailment Watchlist

**Spec file:** `tests/e2e/specs/watchlist.spec.ts`
**Page Object:** `tests/e2e/pages/WatchlistPage.ts`
**Seed dependencies:** `06_ailments_watchlist.sql`, `09_stats.sql` (Basil→Aphid, Tomato→Early Blight, Rose→Japanese Knotweed `plant_instance_ailments` links — added 2026-07-22 so all 3 keep derived presence under the v3 visibility law)
**App-reference:** [03-garden-hub/](../app-reference/03-garden-hub/) (watchlist tab)

## Tests

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| WL-001 | ✅ | `/watchlist` → heading (renamed "Watchlist" → "Ailments", v3 feedback polish 2026-07-22) | — | ✅ Passing |
| WL-002 | ✅ | Aphid, Early Blight, Japanese Knotweed cards visible | — | ✅ Passing |
| WL-MOBILE-001 | ✅ | Phone-portrait: launcher + ⋯ overflow (holding bulk add) reachable (Stage 3) | — | ✅ Passing |
| WL-MOBILE-002 | ✅ | "Find an ailment" opens `AddAilmentModal` with the Search / Manual tab bar (BulkSearchModal parity) | — | ✅ Passing |
| WL-MODAL-003 | ✅ | Empty modal shows the calm prompt with NO databases/AI buttons; typing a query surfaces them (Find-a-plant parity) | — | ✅ Passing |
| WL-003 | ✅ | Empty state — clean account → prompt (period restored to the title — the Stage-3 fix for a long-standing text drift) | Supabase mock | ✅ Passing |
| WL-004 | ✅ | "Pest" badge on Aphid | — | ✅ Passing |
| WL-005 | ✅ | "Disease" badge on Early Blight | — | ✅ Passing |
| WL-006 | ✅ | "Invasive Plant" badge on Japanese Knotweed | — | ✅ Passing |
| WL-007 | ✅ | Powdery Mildew (archived) absent from default view | — | ✅ Passing |
| WL-008 | ✅ | Add button opens "Add to Watchlist" modal | — | ✅ Passing |
| WL-009 | ✅ | Manual mode — name, description, type, affected-plants fields | — | ✅ Passing |
| WL-010 | ❌ | Blank name → "Name is required" | — | ✅ Passing |
| WL-011 | ✅ | Manual happy path | — | ✅ Passing |
| WL-012 | ✅ | AI mode — mocked search result | `watchlist-search` mock | ✅ Passing |
| WL-013 | 🔲 | Owned-ailment back-routing (#7) — on `/shed?tab=watchlist`, tapping an owned ailment (e.g. Aphid) adds `?owned=<id>` to the URL and opens `detail-modal`; browser Back removes `?owned=` and closes the modal **while staying on the Ailments tab** (regression: it used to also pop back to the Plants tab) | — | 🔲 Planned |
| WL-013 | ❌ | AI search 500 → error message | `watchlist-search` 500 | ✅ Passing |
| WL-014 | ✅ | Card click opens AilmentDetailModal | — | ✅ Passing |
| WL-015 | ✅ | Info tab shows description + affected plants | — | ✅ Passing |
| WL-016 | ✅ | Prevention tab | — | ✅ Passing |
| WL-017 | ✅ | Remedy tab | — | ✅ Passing |
| WL-018 | ✅ | Detail modal close | — | ✅ Passing |
| WL-019 | ✅ | Delete from detail confirm | — | ✅ Passing |
| WL-020 | ✅ | Delete from detail cancel | — | ✅ Passing |
| WL-021 | ✅ | Archive ailment | — | ✅ Passing |
| WL-022 | ✅ | One search: typed watched name surfaces the takeover's "In your garden" section (Stage E heading rename) | — | ✅ Passing |
| WL-A1 | ✅ | Hub v3: owned rows carry ONE derived presence pill (active/inactive/watching) from `ailment_presence` | — | ✅ Passing |
| WL-023 | ✅ | No-match query: no owned section; library-miss copy renders | — | ✅ Passing |
| WL-024 | ✅ | Filter by Pest | — | ✅ Passing |
| WL-025 | ✅ | Filter by Disease | — | ✅ Passing |

## Bulk add — CSV upload + AI paste (RHO-4 Phase 2)

**Spec file:** `tests/e2e/specs/watchlist.spec.ts` (Section WL-BULK) · **Page object:** `WatchlistPage.ts` (bulk-add locators + `openBulkAdd`/`uploadCsv` helpers)
**Seed dependencies:** none beyond the standard seeded watchlist; the import test creates + cleans up its own uniquely-named ailments.

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| WL-BULK-001 | ✅ | Bulk add opens with a mode toggle (Paste a list / Upload CSV); the AI-paste textarea is visible | — | ✅ Passing |
| WL-BULK-002 | ✅ | CSV mode → Download template emits `rhozly-watchlist-template.csv` | — | ✅ Passing |
| WL-BULK-003 | ✅ | Upload CSV → review rows; bad-`type` row flagged + excluded; save button counts only valid rows | — | ✅ Passing |
| WL-BULK-004 | ✅ | (rewritten, v3 feedback polish) Import valid CSV rows creates `source='manual'` ailments; **both** rows land on the Favourites scope — the visibility law's "adding is watching" auto-watch sweep favourites every created row regardless of the per-row checkbox; cleanup deletes both | — | ✅ Passing |
| WL-BULK-005 | ✅ | Free-text paste (regex fallback) reaches the shared review step; "Mark all as favourites" visible; knotweed classified `invasive_plant` | — | ✅ Passing |

## Cross-home favourites (Phase 2 — ailments)

**Spec file:** `tests/e2e/specs/favourites.spec.ts` (Section FAV-WL)
**Seed dependencies:** `15_favourites.sql` (0018 segment — see [01-seeded-fixtures.md](./01-seeded-fixtures.md#cross-home-favourite-ailments--uuids-at-0018-15_favouritessql))

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| FAV-WL-001 | ✅ | `/shed?tab=watchlist&scope=favourites` deep link → Favourites scope with seeded fixtures (Aphid + Rose Rust tombstone); hint banner shows + dismisses | — | ✅ Passing |
| FAV-WL-002 | ✅ | Hearting a Home-tab ailment (Early Blight) adds it to Favourites; removing cleans up + un-fills the heart | — | ✅ Passing |
| FAV-WL-003 | ✅ | Seeded Aphid favourite — heart pre-filled on Home tab, "In this home" on Favourites (dedupe) | — | ✅ Passing |
| FAV-WL-004 | ✅ | "Add to this home" copies the Rose Rust favourite into the active home; button flips to "In this home"; copy on Home tab | — | ✅ Passing |
| FAV-WL-005 | ✅ | Tier lock — Sprout sees a disabled heart on the seeded perenual-source ailment; manual ailments stay heartable | route-intercepted Sprout profile | ✅ Passing |
| FAV-WL-006 | ✅ | W1 only — favourite ailments persist across a home switch while the add-state recomputes (Slugs) | — | ✅ Passing |

## Ailment-add takeover (overhaul Stage 5, 2026-07-21)

The "Find an ailment" flow is a **full-page takeover** (`ailment-add-takeover`), not a portal modal — mirroring the Shed's `PlantSearchTakeover`. All internal testids + the `?open=add-ailment` deep link unchanged; the pre-existing WL-MOBILE-002 / WL-MODAL-003 rows keep passing against the new shell (28/28 suite green on conversion day).

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| WL-TKO-001 | ✅ | "Find an ailment" opens the full-page takeover (no `aria-modal` dialog); the `ailment-add-back` "Watchlist" control returns to the grid | — | ✅ Passing |
| WL-TKO-002 | ✅ | `?open=add-ailment` deep-links straight into the takeover with the search input ready | — | ✅ Passing |
| WL-TKO-003 | ✅ | Overlay pins `ailment-search-input` in the top band (y<130); result-row body tap opens the shared field-guide detail (`ailment-detail-modal` with Watch + ♥); Escape ladder (detail → clear query → close) | Seed 16 (Tomato Hornworm 900001) | ✅ Passing |

### Stage E -- search unification (2026-07-22)

| ID | Automated | What it verifies | Seeds | Status |
|---|---|---|---|---|
| WL-E1 | YES | `/shed?tab=watchlist&detail=900001` opens the shared field-guide modal; close REPLACE-deletes the param; unknown id fail-softs | ailment_library seed (900001-900003) | Passing |
| WL-E2 | YES | `ailment-detail-link-plant` (via detail=900003 Japanese Knotweed -- already watched, no auto-watch side effect) opens `link-ailment-to-plant-modal` with live-instance rows; close only | 06_ailments_watchlist.sql + library seed | Passing |
| WL-A1 | YES | (updated) presence pill closed set now includes **previously** | -- | Passing |

### Stage F — unified detail shell (2026-07-22)

| ID | Automated | What it verifies | Seeds | Status |
|---|---|---|---|---|
| WL-014..017 | YES | (rewritten) card tap opens the UNIFIED shell — no tabs; description, prevention + remedy step cards all render in one scroll | 06_ailments_watchlist.sql | Passing |
| WL-017b | YES | home-authored detail carries `ailment-detail-link-plant`; opens + closes the live-instance picker | 06 + 02 seeds | Passing |
| WL-018/019 | YES | close returns to list; delete from the shell confirms + removes | 06 | Passing |

### v3 feedback polish (2026-07-22) — watchlist rebrand, card parity, visibility law

Every ailment ♥ became a 🔭 Binoculars (never a heart on ailments): the card toggle testid renamed `favourite-ailment-{id}` → `watch-ailment-{id}` (`WatchlistPage.heartFor`, aria "Add/Remove {name} from your watchlist"). The chip row is now All / Active / Inactive / **🔭 Watchlist** — the "Watching" chip (`watchlist-chip-watching`) died; the merged chip IS `watchlist-scope-favourites`. Card Archive/Delete moved off the photo into a kebab popover (`ailment-card-{id}`, `ailment-card-kebab-{id}`) — `WatchlistPage.openCardMenu(name)` opens it before `archiveButtonFor`/`restoreButtonFor`/`deleteButtonFor` resolve (aria-labels unchanged). The detail body's separate cross-home ♥ toggle (`ailment-detail-favourite`) was deleted — `ailment-add-watchlist` ("Add to watchlist" / "On your watchlist") now sets the home row AND the 🔭 affinity in one tap. Default visibility = presence OR 🔭; a zero-presence, un-watched ailment is hidden from the grid but counted by `watchlist-hidden-collection-hint`.

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| WL-P1 | ✅ | Visibility law: an ailment with no `plant_instance_ailments` link and no 🔭 (inserted directly, bypassing every auto-watch add flow) is hidden from the grid; the test switches to the **All** chip (the hint is an All-view net after the smart default) then asserts `watchlist-hidden-collection-hint` counts it and opens the takeover where it's still findable via search | — | ✅ Passing |
| WL-tab-smart-default | ✅ | Smart default (2026-07-23): lands on the **Active** chip when live-linked ailments exist (seeded Aphid / Early Blight / Japanese Knotweed are active); archived Powdery Mildew stays hidden. Falls back to All when nothing is active | 06 + 09 seeds | ✅ Passing |
