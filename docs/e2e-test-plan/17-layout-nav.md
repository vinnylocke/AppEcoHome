# 17. Global Layout & Navigation

**Spec file:** `tests/e2e/specs/layout.spec.ts`
**Seed dependencies:** `00_bootstrap.sql`
**App-reference:** [09-persistent-ui/](../app-reference/09-persistent-ui/)

## Tests

> Table rewritten 2026-07-19 to match the actual spec contents — the previous rows described tests that no longer exist under those IDs (doc drift). Note the spec currently contains two tests labelled "NAV-004" (back-navigation and HomeDropdown) — distinguished below.

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| NAV-001 | ✅ | All primary nav links present on dashboard (Dashboard, Plants, Planner, Journal, Tools) | — | ✅ Passing |
| NAV-002 | ✅ | Sidebar menu toggle (Lucide Menu icon) present | — | ✅ Passing |
| NAV-003 | ✅ | Desktop nav click updates URL — "Tools" → `/tools` (repointed 2026-07-19: no desktop button is named "Plant Doctor"; mobile Doctor nav is NAV-009) | — | ✅ Passing |
| NAV-004 (a) | ✅ | Back to `/dashboard` from `/doctor` via Dashboard nav button | — | ✅ Passing |
| NAV-004 (b) | ✅ | HomeDropdown — "Create New Home" button appears in dropdown | — | ✅ Passing |
| NAV-005 | ✅ | App renders at 1280×800 desktop viewport | — | ✅ Passing |
| NAV-006 | ✅ | App renders at 375×812 mobile viewport | — | ✅ Passing |
| NAV-007 | ✅ | Sign Out reachable — profile trigger (now a real "Account menu" button) opens dropdown with Sign Out (test rewritten 2026-07-19 alongside the a11y fix) | — | ✅ Passing |
| NAV-008 | ✅ | HomeDropdown shows seeded home name "Test Garden Home" | — | ✅ Passing |
| NAV-009 | ✅ | Bottom tab bar (375×812): visible, Doctor tab → `/doctor` with `aria-current`, Home tab returns to `/dashboard` | — | ✅ Passing |
| NAV-010 | ✅ | Bottom tab bar hidden at 1280×800 desktop viewport (`md:hidden`) | — | ✅ Passing |

> The mobile bottom tab bar (`data-testid="bottom-tab-bar"`, tabs `bottom-tab-{dashboard\|shed\|doctor\|planner\|tools}`) shipped with the design overhaul Phase 4.1 — see [09-persistent-ui/11-bottom-tab-bar.md](../app-reference/09-persistent-ui/11-bottom-tab-bar.md).
