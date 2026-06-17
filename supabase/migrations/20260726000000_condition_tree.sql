-- Unified condition-based automations — Phase 1 (2026-06-17)
--
-- Adds the condition tree + rising-edge state. The 5-min evaluate loop converts
-- legacy automations to a `trigger_logic` tree on first sight (lazy backfill in
-- the edge function, using the unit-tested convertLegacyToTree), evaluates the
-- tree, and fires actions on the rising edge. Legacy trigger columns are kept
-- read-only through the transition and dropped in the Phase 3 cleanup.
-- See docs/plans/unified-condition-automations.md.
--
-- `automations` is grandfathered — no new Data-API grants needed for columns.

ALTER TABLE public.automations
  ADD COLUMN IF NOT EXISTS trigger_logic      jsonb,
  -- Rising-edge bookkeeping: was the tree true on the previous tick?
  ADD COLUMN IF NOT EXISTS condition_was_true boolean NOT NULL DEFAULT false,
  -- Generic "last time actions fired" (generalises sensor_last_fired_at).
  ADD COLUMN IF NOT EXISTS last_fired_at      timestamptz;

-- Seed the generic timestamp from the existing sensor column so cooldowns carry
-- over for sensor automations already running.
UPDATE public.automations
SET last_fired_at = sensor_last_fired_at
WHERE last_fired_at IS NULL AND sensor_last_fired_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_automations_active_logic
  ON public.automations (is_active)
  WHERE trigger_logic IS NOT NULL;
