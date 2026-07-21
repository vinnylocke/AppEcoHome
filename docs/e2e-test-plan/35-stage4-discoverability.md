# 35. Stage 4 — Discoverability & Error States

**Spec file:** `tests/e2e/specs/stage4-discoverability.spec.ts`
**Page Object:** — (raw `data-testid`s via `authenticatedPage`)
**Seed dependencies:** `00_bootstrap.sql` (user, home), `03_tasks_blueprints.sql` (seeded blueprints for the Routines tab)
**App-reference:** [05-tools/01-tools-hub.md](../app-reference/05-tools/01-tools-hub.md) · [04-planner/07-blueprint-manager.md](../app-reference/04-planner/07-blueprint-manager.md) · [06-account/09-user-profile-dropdown.md](../app-reference/06-account/09-user-profile-dropdown.md) · [02-dashboard/03-calendar-tab.md](../app-reference/02-dashboard/03-calendar-tab.md) · [09-persistent-ui/11-bottom-tab-bar.md](../app-reference/09-persistent-ui/11-bottom-tab-bar.md)

**dashboard-nav-tasks-tray redesign Stage 4 (2026-07-21).** A bundle of discoverability + error-state fixes surfaced by the deep-dive audit: surface the buried Ailment Library, give Routines a Planner tab, drop the no-op "Getting Started" menu item, stop the mobile Shelf re-listing the 3 Deck tabs, turn the hollow "Operational Hub" calendar subtitle into a live summary, and give the Automations list a real error+retry state. (B13's Automations error branch is a small typechecked render path, covered by manual/visual review rather than a mocked-failure spec.)

## Discoverability + error states (`stage4-discoverability.spec.ts`)

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| DISC-B5 | ✅ | The Ailment Library is a Tools-hub tile (`tools-hub-ailment-library`) that opens `/ailment-library` | — | ✅ Passing |
| DISC-B12 | ✅ | The Planner has a "Routines" tab (`planner-hub-tab-routines`); opening it sets `?tab=routines` and renders BlueprintManager (seeded "Weekly Garden Watering" shows) | — | ✅ Passing |
| DISC-B8 | ✅ | The no-op "Getting Started" account-menu item is gone (`user-profile-getting-started` count 0) while `user-profile-help` remains | — | ✅ Passing |
| DISC-B15 | ✅ | The Schedule header no longer reads "Operational Hub" (a live task summary replaced it) | — | ✅ Passing |
| DISC-B7 | ✅ | Mobile: the Shelf (`mobile-nav-drawer`) shows true overflow ("Tools") but no longer re-lists the Deck's "Plants" tab (full list kept in focus mode, where the Shelf is the only nav) | — | ✅ Passing |
| DISC-B16 | ✅ | Stage 5: Garden Reports is routed — the Tools tile (`tools-hub-garden-reports`) opens `/reports` and `reports-view-toggle` renders | — | ✅ Passing |
