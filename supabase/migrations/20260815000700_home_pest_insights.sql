-- AI pest-risk insights (gap-fill, AI-based since ailments has no season/temp data).
-- One small set per home, replaced by generate-pest-risk (weekly cron + on
-- ailment-link). Read by insights-feed onto the /insights page. Evergreen-gated.
-- See docs/plans/ai-insights-overhaul.md.

CREATE TABLE IF NOT EXISTS public.home_pest_insights (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id           uuid NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  ailment_name      text,
  inventory_item_id uuid,         -- the susceptible plant, when identified
  body              text NOT NULL,
  severity          int NOT NULL DEFAULT 2,   -- 1..3
  generated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_home_pest_insights_home ON public.home_pest_insights (home_id);

ALTER TABLE public.home_pest_insights ENABLE ROW LEVEL SECURITY;

-- Home members read; writes are service-role (the edge fn).
DROP POLICY IF EXISTS "home_pest_insights_select_members" ON public.home_pest_insights;
CREATE POLICY "home_pest_insights_select_members" ON public.home_pest_insights
  FOR SELECT TO authenticated
  USING (home_id IN (SELECT home_id FROM public.home_members WHERE user_id = auth.uid()));

GRANT SELECT ON TABLE public.home_pest_insights TO authenticated;
