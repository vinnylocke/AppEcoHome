-- Add blueprint_id to user_pattern_hits for blueprint-level patterns
ALTER TABLE public.user_pattern_hits
  ADD COLUMN IF NOT EXISTS blueprint_id uuid REFERENCES public.task_blueprints(id) ON DELETE CASCADE;

-- Partial unique index for blueprint-level hits
-- (item-level hits use the existing UNIQUE constraint on inventory_item_id)
CREATE UNIQUE INDEX IF NOT EXISTS user_pattern_hits_blueprint_unique
  ON public.user_pattern_hits (user_id, pattern_id, blueprint_id)
  WHERE blueprint_id IS NOT NULL AND inventory_item_id IS NULL;

-- Add blueprint_id to user_insights so evaluate can deduplicate blueprint-level hits
ALTER TABLE public.user_insights
  ADD COLUMN IF NOT EXISTS blueprint_id uuid REFERENCES public.task_blueprints(id) ON DELETE CASCADE;

-- Efficient undismissed-insight check for blueprint-level hits
CREATE INDEX IF NOT EXISTS idx_user_insights_active_blueprint
  ON public.user_insights (user_id, pattern_id, blueprint_id)
  WHERE dismissed_at IS NULL AND blueprint_id IS NOT NULL;
