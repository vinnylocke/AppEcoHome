-- AI "what to grow + tasks you might be missing" suggestions (gap-fill).
-- Generated weekly from the full gardener context (areas + conditions, current
-- plants, quiz/swipe/chat preferences, top task types, season, weather, draft
-- plans). One small set per home, replaced each run. Read by insights-feed.
-- Evergreen-gated. See docs/plans/ai-insights-overhaul.md.

CREATE TABLE IF NOT EXISTS public.home_grow_suggestions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id      uuid NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  kind         text NOT NULL,            -- 'plant' | 'task'
  title        text NOT NULL,
  body         text NOT NULL,
  area_name    text,                     -- optional: a suitable area for a plant
  severity     int NOT NULL DEFAULT 1,   -- 1..3
  generated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_home_grow_suggestions_home ON public.home_grow_suggestions (home_id);

ALTER TABLE public.home_grow_suggestions ENABLE ROW LEVEL SECURITY;

-- Home members read; writes are service-role (the edge fn).
DROP POLICY IF EXISTS "home_grow_suggestions_select_members" ON public.home_grow_suggestions;
CREATE POLICY "home_grow_suggestions_select_members" ON public.home_grow_suggestions
  FOR SELECT TO authenticated
  USING (home_id IN (SELECT home_id FROM public.home_members WHERE user_id = auth.uid()));

GRANT SELECT ON TABLE public.home_grow_suggestions TO authenticated;
