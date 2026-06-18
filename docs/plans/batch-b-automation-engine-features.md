# Plan — Batch B: automation engine features (#1, #5, #7, #10)

Four automation features. They share schema changes to `automations`,
`automation_runs`, `automation_actions`, so one migration pass. I'll implement and
ship in **two deployable sub-batches** for safety:

- **B1 (additive, low risk):** #1 location/area link · #5 why-it-ran · #7 max-runs.
- **B2 (behaviour change):** #10 task-completion-as-an-explicit-action.

## App-reference consulted

- [`07-management/06-integrations-automations.md`](../app-reference/07-management/06-integrations-automations.md)
- [`07-management/05-integrations-devices.md`](../app-reference/07-management/05-integrations-devices.md)
- [`99-cross-cutting/09-data-model-integrations.md`](../app-reference/99-cross-cutting/09-data-model-integrations.md)
- [`99-cross-cutting/11-cron-jobs.md`](../app-reference/99-cross-cutting/11-cron-jobs.md)
- [`99-cross-cutting/19-rls-patterns.md`](../app-reference/99-cross-cutting/19-rls-patterns.md) (new columns/grants)

## Current-state facts (from code)

- Unified builder (`AutomationBuilderModal`) writes `automations` (`trigger_logic`) +
  `automation_actions` only. **No `area_id`, no `automation_blueprints`.**
- `evaluate-automations` (5-min engine) fires the tree + `fanoutActions`; it does **not**
  touch tasks. Task auto-complete is `run-automations.completeTasks` via
  `automation_blueprints` (driven role) — only reachable on manual / legacy runs.
- `automation_actions.action_kind ∈ {notification, valve_open, valve_close}`.
- `automations` already has `area_id`, `sensor_cooldown_minutes`, `last_fired_at`,
  `condition_was_true`.

---

## Migration — `20260729000000_batch_b_automation_features.sql`

```sql
-- #1 location link (area_id already exists)
ALTER TABLE public.automations
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL;

-- #7 run-limit (per configurable window)
ALTER TABLE public.automations
  ADD COLUMN IF NOT EXISTS run_limit_count int CHECK (run_limit_count IS NULL OR run_limit_count > 0),
  ADD COLUMN IF NOT EXISTS run_limit_window_hours int NOT NULL DEFAULT 24
    CHECK (run_limit_window_hours > 0);

-- #5 why-it-ran
ALTER TABLE public.automation_runs
  ADD COLUMN IF NOT EXISTS trigger_reason jsonb;  -- { summary: string, matched: string[] }

-- #10 complete_task action
ALTER TABLE public.automation_actions
  DROP CONSTRAINT IF EXISTS automation_actions_action_kind_check;
ALTER TABLE public.automation_actions
  ADD CONSTRAINT automation_actions_action_kind_check
    CHECK (action_kind IN ('notification','valve_open','valve_close','complete_task')),
  ADD COLUMN IF NOT EXISTS target_blueprint_id uuid REFERENCES public.task_blueprints(id) ON DELETE CASCADE;

-- #10 migrate existing "driven" blueprint links → explicit complete_task actions
INSERT INTO public.automation_actions (automation_id, action_kind, target_blueprint_id, ord)
SELECT ab.automation_id, 'complete_task', ab.blueprint_id,
       COALESCE((SELECT max(ord)+1 FROM public.automation_actions a2 WHERE a2.automation_id = ab.automation_id), 0)
FROM public.automation_blueprints ab
WHERE ab.role = 'driven';
```

Existing tables already have `authenticated` grants; no new table, so no new grant needed
(columns inherit). RLS unchanged (scoped via `automation_id`/`home_id`). **Apply locally
with `supabase migration up` first; `db push` only on your explicit go-ahead.**

---

## B1 implementation

### #1 — Link automations to location & area
- **Builder** (`AutomationBuilderModal`): load `locations` + `areas`; add a Location → Area
  picker pair. When an area is set, **filter the sensor + valve pickers** (and the
  condition-tree sensor leaves' device options) to devices with that `area_id`. Save
  `location_id` + `area_id` on the automation. Selecting a Location narrows Areas; Area is
  optional ("whole location"/"any").
- **`AutomationCard`**: show the area/location binding chip.
- Files: `AutomationBuilderModal.tsx`, `AutomationCard.tsx`, maybe `ConditionNodeEditor.tsx`
  (device option filtering), `AutomationsSection.tsx` (pass areas). Pure filter helper
  `src/lib/automationDeviceScope.ts` (+ unit test).

### #5 — History: why it ran / which conditions matched
- **`_shared/conditionTree.ts`**: add `collectSatisfied(tree, leafEval)` → the satisfied
  leaves + a plain-English `summariseSatisfied` line.
- **`evaluate-automations`**: on fire, build `{ summary, matched }` and write it to
  `automation_runs.trigger_reason` (in the insert/update already there).
- **`AutomationRunHistory`**: render the reason under each run ("Fired because: soil
  moisture < 30% · 6:30 AM").
- Files: `_shared/conditionTree.ts` (+ Deno test), `evaluate-automations`,
  `AutomationRunHistory.tsx`, `src/lib/conditionTree.ts` mirror if needed.

### #7 — Max runs per window
- **`evaluate-automations`**: before firing, if `run_limit_count` is set, count
  `automation_runs` for this automation with a "fired" status since
  `now - run_limit_window_hours`; if `>= run_limit_count`, skip and write a run row with
  status `skipped_rate_limited` (no actions). Pure helper
  `src/`→ actually `_shared/runLimit.ts` `isRateLimited(count, limit)` + the window query.
- **Builder**: "Run at most **N** times per **H** hours" control (blank = unlimited).
- Files: migration, `evaluate-automations` (+ `_shared/runLimit.ts` + Deno test),
  `AutomationBuilderModal.tsx`, `AutomationRunHistory.tsx` (chip for the new status).

## B2 implementation

### #10 — Task completion becomes an explicit action
- **Builder**: add a **"Complete task"** action kind (`complete_task`) → pick a recurring
  blueprint (`target_blueprint_id`). Task stays usable as a **trigger** via the existing
  `task_due` condition leaf — unchanged.
- **`evaluate-automations` `fanoutActions`**: handle `complete_task` → complete today's
  Pending/Postponed task(s) for that blueprint (`status='Completed'`,
  `auto_completed_reason='automation'`), count into the run summary; surface in history.
- **Remove implicit auto-completion**: the migration converts existing `driven` links to
  `complete_task` actions; then stop the implicit path so completion only ever happens via
  an action — i.e. `run-automations.completeTasks` no longer auto-completes from
  `automation_blueprints` driven role (it becomes a no-op / removed). `controlling` links
  (task completion → triggers automation) are untouched.
- Files: migration (above), `AutomationBuilderModal.tsx`, `ConditionNodeEditor`/action UI,
  `evaluate-automations/index.ts`, `run-automations/index.ts` (drop implicit driven
  completion), `_shared/` task-complete helper if shared, data-model + automations docs.

## Tests
- Vitest: `automationDeviceScope` (area filter), `runLimit`, builder action/area rendering.
- Deno: `conditionTree` satisfied-collection, run-limit gate, `complete_task` fanout
  (completes only when the action is present).
- Update `docs/e2e-test-plan/` automations rows + app-reference (automations + data-model).

## Deploy
- Per sub-batch: `supabase migration up` (local) → **confirm** → `db push` →
  deploy `evaluate-automations` (+ `run-automations` for B2) → `deploy-app-only` →
  commit + push. Two version bumps (B1, B2).

## Risks
- #10 is a behaviour change. Mitigated by migrating existing `driven` links to explicit
  `complete_task` actions so nobody silently loses auto-completion; documented in release
  notes.
- Run-limit must count only true fires (not skips) within the window — covered by status
  filter + Deno test.
- Area filtering must not strand a device already chosen in an existing automation when its
  area changes — keep already-selected device ids even if outside the area filter (show with
  an "other area" hint) to avoid silent removal on edit.
