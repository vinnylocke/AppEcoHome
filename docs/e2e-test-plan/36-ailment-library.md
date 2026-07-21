# 36. Ailment Library (the field guide)

**Spec file:** `tests/e2e/specs/ailment-library.spec.ts`
**Page Object:** — (drives raw `data-testid`s via `authenticatedPage`)
**Seed dependencies:** `00_bootstrap.sql` (user, home), `06_ailments_watchlist.sql` (home watchlist rows), **`16_ailment_library.sql`** (3 global catalogue rows — Tomato Hornworm `900001` / Late Blight `900002` / Japanese Knotweed `900003`; global table → per-worker idempotent via explicit ids + `ON CONFLICT (id)`, names chosen to avoid `15_favourites`' tombstone names)
**App-reference:** [03-garden-hub/16-ailment-library.md](../app-reference/03-garden-hub/16-ailment-library.md) · [03-garden-hub/02-watchlist.md](../app-reference/03-garden-hub/02-watchlist.md) · [99-cross-cutting/06-data-model-ailments.md](../app-reference/99-cross-cutting/06-data-model-ailments.md)

**Ailment-library overhaul Stage 1 (2026-07-21).** The library became the "field guide": thumbnailed cards with severity/kind status-token chips + a Binoculars quick-watch, severity + Watching filters, and a full-page detail takeover (`?ailment=<id>`, push-on-open) with the 🔭 Watch / ♥ Favourite / ✦ Ask-AI action bar and a could-affect-your-garden strip. Previously shell-only tests (the table was unseeded).

## Browse (`ailment-library.spec.ts`)

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| AILIB-001 | ✅ | `/ailment-library` renders with seeded cards (`ailment-card-900001`) | — | ✅ Passing |
| AILIB-002 | ✅ | Kind + severity + Watching filter chips present; kind filter narrows (pest keeps Hornworm, drops Blight) | — | ✅ Passing |
| AILIB-003 | ✅ | Watchlist's "Browse the ailment library" navigates here | — | ✅ Passing |

## Detail takeover + actions

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| AILIB-010 | ✅ | Card tap opens the full-page detail (`ailment-detail`, URL gains `?ailment=`); editorial sections render; back returns to browse and strips the param | — | ✅ Passing |
| AILIB-011 | ✅ | `?ailment=900001` deep link opens the detail directly | — | ✅ Passing |
| AILIB-012 | ✅ | 🔭 Watch adds to the home watchlist, button flips to disabled "Watching in this garden", and the row shows on `/shed?tab=watchlist` (idempotent — a re-run finds the Watching state and asserts the same end state) | — | ✅ Passing |
| AILIB-013 | ✅ | ♥ favourite toggles `aria-pressed` and back (self-cleaning round trip) | — | ✅ Passing |
