-- ============================================================
-- Batch B — automation engine features (2026-06-18)
--
--   #1  Link automations to a location (area_id already exists).
--   #5  Record WHY an automation ran (which conditions were satisfied).
--   #7  Per-window run limit (avoid firing too many times per day/period).
--   #10 Task completion becomes an explicit `complete_task` action instead of
--       an implicit side-effect of a linked blueprint. Existing "driven"
--       links are converted to explicit actions (behaviour preserved, now
--       visible/removable); the implicit auto-completion is retired.
-- ============================================================

-- ── #1: location link ─────────────────────────────────────────────────────────
ALTER TABLE public.automations
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL;

-- ── #7: per-window run limit ──────────────────────────────────────────────────
ALTER TABLE public.automations
  ADD COLUMN IF NOT EXISTS run_limit_count int
    CHECK (run_limit_count IS NULL OR run_limit_count > 0),
  ADD COLUMN IF NOT EXISTS run_limit_window_hours int NOT NULL DEFAULT 24
    CHECK (run_limit_window_hours > 0);

COMMENT ON COLUMN public.automations.run_limit_count IS
  'Max fires allowed within run_limit_window_hours. NULL = unlimited. Enforced by evaluate-automations before firing; over-limit ticks record a skipped_rate_limited run.';

-- ── #5: structured "why it ran" on each run ──────────────────────────────────
ALTER TABLE public.automation_runs
  ADD COLUMN IF NOT EXISTS trigger_reason jsonb;

COMMENT ON COLUMN public.automation_runs.trigger_reason IS
  'Why the automation fired: { summary: text, matched: text[] } — the satisfied condition leaves. Written by evaluate-automations.';

-- ── #10: complete_task action kind + target blueprint ────────────────────────
ALTER TABLE public.automation_actions
  DROP CONSTRAINT IF EXISTS automation_actions_action_kind_check;
ALTER TABLE public.automation_actions
  ADD CONSTRAINT automation_actions_action_kind_check
    CHECK (action_kind IN ('notification', 'valve_open', 'valve_close', 'complete_task'));

ALTER TABLE public.automation_actions
  ADD COLUMN IF NOT EXISTS target_blueprint_id uuid
    REFERENCES public.task_blueprints(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.automation_actions.target_blueprint_id IS
  'For complete_task actions: the recurring blueprint whose due task is marked Completed (auto_completed_reason=automation) when the automation fires.';

-- ── #10: convert existing "driven" links → explicit complete_task actions ─────
-- Preserves current auto-completion for users who relied on it, now as a
-- visible, removable action. Skips any that already have the equivalent action.
INSERT INTO public.automation_actions (automation_id, action_kind, target_blueprint_id, ord)
SELECT ab.automation_id, 'complete_task', ab.blueprint_id,
       COALESCE((SELECT max(a2.ord) + 1 FROM public.automation_actions a2
                 WHERE a2.automation_id = ab.automation_id), 0)
FROM public.automation_blueprints ab
WHERE ab.role = 'driven'
  AND NOT EXISTS (
    SELECT 1 FROM public.automation_actions a3
    WHERE a3.automation_id = ab.automation_id
      AND a3.action_kind = 'complete_task'
      AND a3.target_blueprint_id = ab.blueprint_id
  );

-- Retire the implicit auto-completion: remove the driven links (their behaviour
-- now lives in the explicit complete_task actions inserted above). 'controlling'
-- links keep their trigger role and are left untouched.
DELETE FROM public.automation_blueprints WHERE role = 'driven';

-- (No new GRANTs needed: automations / automation_runs / automation_actions are
--  pre-existing tables already granted to authenticated + service_role; new
--  columns inherit. RLS unchanged — scoped via automation_id / home_id.)
