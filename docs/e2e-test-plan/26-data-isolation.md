# 26. Cross-home Data Isolation (isolation project)

**Spec file:** `tests/e2e/specs/data-isolation.spec.ts`
**Playwright project:** `isolation` (single-worker, runs separately from the main suite via `npm run test:e2e:isolation`)
**Seed dependencies:** worker-2's home contains cross-home markers (see `09_cross_home_markers.sql`)
**App-reference:** [99-cross-cutting/19-rls-patterns.md](../app-reference/99-cross-cutting/19-rls-patterns.md)

13 tests verifying that each authenticated user only sees their own home's data across the UI — plants, ailments, plans, blueprints, locations, tasks, inventory items. Complements the DB-level RLS sweep in [13-management.md § DB-level RLS isolation sweep](13-management.md#db-level-rls-isolation-sweep).

Run separately because it pins to `test1@rhozly.com` and would conflict with the main suite's worker pool if run in parallel.
