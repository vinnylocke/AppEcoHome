-- AI Insights overhaul — give pattern insights a deep link + a priority so the
-- unified AI Insights page can make them actionable and rank them.
-- See docs/plans/ai-insights-overhaul.md.

ALTER TABLE public.user_insights
  ADD COLUMN IF NOT EXISTS action_path  text,         -- e.g. /shed?plant=123
  ADD COLUMN IF NOT EXISTS action_label text,         -- e.g. "View plant"
  ADD COLUMN IF NOT EXISTS severity     int NOT NULL DEFAULT 1;  -- ranking 1..3
