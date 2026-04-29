CREATE TABLE IF NOT EXISTS public.user_insights (
  id                 uuid        NOT NULL DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
  user_id            uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pattern_id         text        NOT NULL,
  inventory_item_id  uuid        REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  is_significant     boolean     NOT NULL DEFAULT true,
  insight_text       text        NOT NULL,
  ai_meta            jsonb       NOT NULL DEFAULT '{}',
  surfaced_at        timestamptz,
  dismissed_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_insights"
  ON public.user_insights
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Fast lookup: unsurfaced insights for the home screen card
CREATE INDEX IF NOT EXISTS idx_user_insights_unsurfaced
  ON public.user_insights (user_id, created_at DESC)
  WHERE surfaced_at IS NULL AND dismissed_at IS NULL;

-- Allows efficient "any undismissed insight for this pattern+item?" check
CREATE INDEX IF NOT EXISTS idx_user_insights_active
  ON public.user_insights (user_id, pattern_id, inventory_item_id)
  WHERE dismissed_at IS NULL;
