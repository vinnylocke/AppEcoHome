# 11. Ailment Watchlist

**Spec file:** `tests/e2e/specs/watchlist.spec.ts`
**Page Object:** `tests/e2e/pages/WatchlistPage.ts`
**Seed dependencies:** `06_ailments_watchlist.sql`
**App-reference:** [03-garden-hub/](../app-reference/03-garden-hub/) (watchlist tab)

## Tests

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| WL-001 | ✅ | `/watchlist` → heading | — | ✅ Passing |
| WL-002 | ✅ | Aphid, Early Blight, Japanese Knotweed cards visible | — | ✅ Passing |
| WL-003 | ✅ | Empty state — clean account → prompt | Supabase mock | ✅ Passing |
| WL-004 | ✅ | "Pest" badge on Aphid | — | ✅ Passing |
| WL-005 | ✅ | "Disease" badge on Early Blight | — | ✅ Passing |
| WL-006 | ✅ | "Invasive Plant" badge on Japanese Knotweed | — | ✅ Passing |
| WL-007 | ✅ | Powdery Mildew (archived) absent from default view | — | ✅ Passing |
| WL-008 | ✅ | Add button opens "Add to Watchlist" modal | — | ✅ Passing |
| WL-009 | ✅ | Manual mode — name, description, type, affected-plants fields | — | ✅ Passing |
| WL-010 | ❌ | Blank name → "Name is required" | — | ✅ Passing |
| WL-011 | ✅ | Manual happy path | — | ✅ Passing |
| WL-012 | ✅ | AI mode — mocked search result | `watchlist-search` mock | ✅ Passing |
| WL-013 | ❌ | AI search 500 → error message | `watchlist-search` 500 | ✅ Passing |
| WL-014 | ✅ | Card click opens AilmentDetailModal | — | ✅ Passing |
| WL-015 | ✅ | Info tab shows description + affected plants | — | ✅ Passing |
| WL-016 | ✅ | Prevention tab | — | ✅ Passing |
| WL-017 | ✅ | Remedy tab | — | ✅ Passing |
| WL-018 | ✅ | Detail modal close | — | ✅ Passing |
| WL-019 | ✅ | Delete from detail confirm | — | ✅ Passing |
| WL-020 | ✅ | Delete from detail cancel | — | ✅ Passing |
| WL-021 | ✅ | Archive ailment | — | ✅ Passing |
| WL-022 | ✅ | Search filters by name ("Aphid") | — | ✅ Passing |
| WL-023 | ❌ | Search no-match | — | ✅ Passing |
| WL-024 | ✅ | Filter by Pest | — | ✅ Passing |
| WL-025 | ✅ | Filter by Disease | — | ✅ Passing |

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
