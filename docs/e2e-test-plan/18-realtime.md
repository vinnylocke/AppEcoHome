# 18. Realtime

**Spec file:** `tests/e2e/specs/realtime.spec.ts`
**Seed dependencies:** `01_locations_areas.sql` (Outside Garden, 3 areas), `03_tasks_blueprints.sql` (`TASK_PENDING`)
**Env requirement:** `SUPABASE_SERVICE_ROLE_KEY` (`supabase status` provides it locally). Tests self-skip when absent.
**App-reference:** [99-cross-cutting/15-realtime.md](../app-reference/99-cross-cutting/15-realtime.md)

Tests that Supabase Realtime subscriptions keep the UI in sync when rows are mutated via the REST API (simulating changes from another device or a server-side edge function).

## Tests

| ID | Type | Description | Mechanism | Status |
|---|---|---|---|---|
| RT-001 | ✅ | Delete area via API → dashboard location tile area count decrements 3→2 | REST DELETE on `areas` → Realtime `areas` event → `fetchDashboardData()` | ✅ Passing |
| RT-002 | ✅ | Complete task via API → task disappears from today's pending list | REST PATCH on `tasks` → Realtime `tasks` event → `fetchTasksAndGhostsSilent()` | ✅ Passing |
| RT-003 | ✅ | New blueprint inserted via API → BlueprintManager shows it | REST POST on `task_blueprints` → Realtime `task_blueprints` event → `fetchBlueprints()` | ✅ Passing |
| RT-004 | ✅ | Weather snapshot upserted via API → weather tile shows new temperature (99°C) | REST POST on `weather_snapshots` → Realtime event → weather state update | ✅ Passing |

## Notes

- RT-001 uses `data-testid="location-{id}-areas-count"` on the area count span in `LocationTile.tsx`.
- RT-002 checks that "Water the Garden (standalone)" (`TASK_PENDING`, `…0006-000000000001`) disappears from the pending view.
- RT-003 inserts a blueprint with a unique title `RT-003 Realtime Test Blueprint` and cleans up after.
- RT-004 upserts a snapshot with `temperature_2m: 99` — the value is unmistakable in the weather tile.
- All tests restore the original data after assertion so seed state is preserved for subsequent runs.
