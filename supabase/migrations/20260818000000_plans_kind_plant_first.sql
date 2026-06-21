-- Allow the new plant-first planner flow to tag its plans.
--
-- The plant-first flow lets the user pick plants (Shed / library / API / AI),
-- then AI arranges them into areas with companion pairings + maintenance tasks.
-- Its plans are stored as kind='plant-first' so the dashboard + Plan Staging can
-- render the multi-area layout. Joins the existing 'designed' (NewPlanForm) and
-- 'overhaul' (photo) kinds.

ALTER TABLE public.plans DROP CONSTRAINT IF EXISTS plans_kind_check;

ALTER TABLE public.plans
  ADD CONSTRAINT plans_kind_check CHECK (kind IN ('designed', 'overhaul', 'plant-first'));

COMMENT ON COLUMN public.plans.kind IS
  '"designed" = 3-step NewPlanForm; "overhaul" = photo-based Overhaul; "plant-first" = user picks plants, AI arranges them into areas with companions + maintenance.';
