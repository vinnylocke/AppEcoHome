# 13. Location Management + Members + RLS

**Spec files:** `tests/e2e/specs/area-setup.spec.ts` · `tests/e2e/specs/members-permissions.spec.ts` · `tests/e2e/specs/rls-isolation-db.spec.ts`
**Page Objects:** `tests/e2e/pages/LocationManagementPage.ts` · `tests/e2e/pages/HomeManagementPage.ts`
**Utility (RLS):** `tests/e2e/utils/rlsAssertions.ts` (`signInAs(workerIndex)` returns a PUBLISHABLE-key supabase-js client signed in as the worker's account)
**Seed dependencies:** `01_locations_areas.sql`
**App-reference:** [07-management/](../app-reference/07-management/), [99-cross-cutting/19-rls-patterns.md](../app-reference/99-cross-cutting/19-rls-patterns.md)

## Location Management (`/management`)

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| MGMT-001 | ✅ | `/management` heading | — | ✅ Passing |
| MGMT-002 | ✅ | "New Location" button | — | ✅ Passing |
| MGMT-003 | ✅ | Nav link → `/management` | — | ✅ Passing |
| MGMT-004 | ✅ | Existing locations ("Outside Garden", "Indoor Space") | — | ✅ Passing |
| MGMT-005 | ✅ | New Location form opens | — | ✅ Passing |
| MGMT-006 | ✅ | Form has name input | — | ✅ Passing |
| MGMT-007 | ✅ | Form cancel hides it | — | ✅ Passing |
| MGMT-008 | ✅ | Create location happy path | — | ✅ Passing |
| MGMT-009 | ❌ | Empty name → error toast, form stays open | — | ✅ Passing |
| MGMT-010 | ✅ | Indoor/Outdoor toggle in form | — | ✅ Passing |
| MGMT-011 | ✅ | Create indoor location | — | ✅ Passing |
| MGMT-012 | ✅ | Add area happy path | — | ✅ Passing |
| MGMT-013 | ❌ | Add area — blank name validation | — | ✅ Passing |
| MGMT-014 | ✅ | Delete area confirm | — | ✅ Passing |
| MGMT-015 | ✅ | Delete area cancel | — | ✅ Passing |
| MGMT-016 | ✅ | Delete location confirm (no plants) | — | ✅ Passing |
| MGMT-017 | ✅ | Delete location cancel | — | ✅ Passing |
| MGMT-018 | ❌ | Delete location with planted items — warning / cascade | — | ✅ Passing |
| MGMT-019 | ✅ | Advanced area settings opens (pH, growing medium, lux fields) | — | ✅ Passing |
| MGMT-020 | ✅ | Save advanced settings — pH=6.5 → toast | — | ✅ Passing |
| MGMT-021 | ❌ | pH=15 → out-of-range validation | — | ✅ Passing |
| MGMT-022 | ✅ | Area Metrics modal shows Readings / AI Area Coach tab strip (`area-tab-readings`, `area-tab-ai`) | — | ⬜ Planned |
| MGMT-023 | ✅ | AI Area Coach tab on non-AI tier → upgrade card (`area-ai-analysis-upgrade`), no fn call | — | ⬜ Planned |
| MGMT-024 | ✅ | AI tier → auto-run renders panel (`area-ai-analysis-panel`) with metric cards; mock `area-sensor-analysis` | `area-sensor-analysis` | ⬜ Planned |

## Members & Permissions (owner-only home)

**Spec file:** `tests/e2e/specs/members-permissions.spec.ts`
**Page Object:** `tests/e2e/pages/HomeManagementPage.ts`

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| MEM-001 | ✅ | Members tab shows owner row with "(you)" suffix | — | ✅ Passing |
| MEM-002 | ✅ | `home-mgmt-copy-{id}` writes home UUID to clipboard | — | ✅ Passing |
| MEM-005 | ✅ | Owner cannot demote self — role select absent on own row | — | ✅ Passing |
| MEM-006 | ✅ | Owner's own row has no Remove + no Configure buttons | — | ✅ Passing |

## DB-level RLS isolation sweep

**Spec file:** `tests/e2e/specs/rls-isolation-db.spec.ts`

These tests run without a browser — they import `@supabase/supabase-js` directly and verify the RLS net at the policy level. Complements `data-isolation.spec.ts` (the "isolation" Playwright project).

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| RLS-001 | ❌ | SELECT tasks for another home → 0 rows | — | ✅ Passing |
| RLS-002 | ❌ | SELECT plants for another home → 0 rows. **Caught a critical RLS bypass** — fixed in `20260614000000_drop_plants_public_access_bypass.sql` | — | ✅ Passing |
| RLS-003 | ❌ | SELECT chat_messages where `user_id != self` → 0 rows | — | ✅ Passing |
| RLS-004 | ❌ | INSERT a task for another home → rejected (`42501`) | — | ✅ Passing |
| RLS-005 | ❌ | UPDATE another home's plant → affects 0 rows | — | ✅ Passing |
| RLS-006 | ❌ | DELETE another home's blueprint → affects 0 rows | — | ✅ Passing |
