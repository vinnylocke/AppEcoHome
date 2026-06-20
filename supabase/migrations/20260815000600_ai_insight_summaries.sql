-- Cache for the AI Insights page's top-of-page summary (Part 5). Re-summarised
-- only when the underlying insight set changes (based_on hash). One row per user.
-- See docs/plans/ai-insights-overhaul.md.

CREATE TABLE IF NOT EXISTS public.ai_insight_summaries (
  user_id      uuid PRIMARY KEY,
  home_id      uuid REFERENCES public.homes(id) ON DELETE CASCADE,
  summary      text NOT NULL,
  based_on     text,        -- hash of the insight set this summary reflects
  persona      text,
  generated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_insight_summaries ENABLE ROW LEVEL SECURITY;

-- A user reads only their own summary; writes are service-role (the edge fn).
DROP POLICY IF EXISTS "ai_insight_summaries_select_own" ON public.ai_insight_summaries;
CREATE POLICY "ai_insight_summaries_select_own" ON public.ai_insight_summaries
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

GRANT SELECT ON TABLE public.ai_insight_summaries TO authenticated;
