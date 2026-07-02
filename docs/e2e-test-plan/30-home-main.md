# 30. Home (Main Dashboard)

**Spec file:** `tests/e2e/specs/home-main.spec.ts`
**Page Object:** `tests/e2e/pages/HomeMainPage.ts`
**Seed dependencies:** `00_bootstrap.sql` (user, home), `01_locations_areas.sql` (Outside Garden + Indoor Space, 5 areas — HOME-002 asserts "Raised Bed A" / "South Border" rows and the per-worker location UUIDs `0000000N-0000-0000-0001-00000000000{1,2}`), `02_plants_shed.sql` (6 plants/inventory items for the growth-state dots), `03_tasks_blueprints.sql` (today's + overdue tasks for the status-strip chips and compact task list), `13_integrations.sql` (ecowitt integration + soil sensor on Raised Bed A with a fresh reading + water valve on South Border — real-data backing for the Phase 2 telemetry chips; HOME-008 itself mocks `home-overview`, so the seed keeps the unmocked page realistic rather than being asserted directly)
**App-reference:** [02-dashboard/17-home-main.md](../app-reference/02-dashboard/17-home-main.md)

Covers the new default `/dashboard` view (`?view=home`, labelled "Dashboard") shipped in Phases 1–2 of `docs/plans/new-home-dashboard.md`: the 5-tab switcher (Dashboard / Overview / Locations / Calendar / Weather), the legacy `?view=dashboard` → home mapping, the garden overview grid, persona-default quick actions, the density toggle (localStorage `rhozly:home:density`), the compact today's-tasks section, and (Phase 2) the `home-overview` telemetry — sensor/valve chips on area rows plus the ranked attention row.

**Note:** `DashboardPage.goto()` was repointed to `/dashboard?view=overview` so the existing classic-dashboard specs (Section 5) keep testing the unchanged Overview content.

Key selectors: `home-main`, `dashboard-view-switcher`, `home-status-strip`, `home-overview-grid`, `home-location-card-<uuid>`, `home-area-row-<kebab-name>`, `home-quick-actions`, `home-quick-tile-<id>`, `home-density-simple`/`home-density-detailed`, `home-todays-tasks`, `home-tasks-see-all`, `home-empty-garden`, `home-sensor-chip`, `home-valve-chip`, `home-area-tasks-chip`, `home-attention-row`, `home-attention-<kind>`, `home-week-pulse`.

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| HOME-001 | ✅ | Plain `/dashboard` lands on the new Home view with the 5-tab switcher (Dashboard / Overview / Locations / Calendar / Weather) | — | ✅ Passing (retried once on first-run cold start) |
| HOME-002 | ✅ | Garden overview grid renders both seeded locations with their area rows (Raised Bed A, South Border) | — | ✅ Passing |
| HOME-003 | ✅ | Legacy `?view=dashboard` deep link lands on the new Home view | — | ✅ Passing |
| HOME-004 | ✅ | `?view=overview` shows the classic dashboard content ("This Week at a Glance") and no `home-main` root | — | ✅ Passing |
| HOME-005 | ✅ | Quick actions render the default (non-experienced) launcher tiles: doctor / today / capture / shed | — | ✅ Passing |
| HOME-006 | ✅ | Density toggle persists the choice to localStorage `rhozly:home:density` (`"detailed"`) | — | ✅ Passing |
| HOME-007 | ✅ | Today's tasks section is visible and "See all →" navigates to `?view=calendar` | — | ✅ Passing |
| HOME-008 | ✅ | Phase 2 telemetry: sensor chip, valve chip ("Watering" running state) and `soil_dry` attention card render from a mocked `home-overview` payload | Mock: `home-overview` (via `mockEdgeFunction`) | ✅ Passing |
