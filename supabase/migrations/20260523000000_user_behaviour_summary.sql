-- user_behaviour_summary: nightly pre-computed rollup of user_events.
-- Replaces the live 200-row user_events scan in buildUserContext (~100ms saved per AI call).

CREATE TABLE IF NOT EXISTS public.user_behaviour_summary (
  user_id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  window_days     int          NOT NULL DEFAULT 30,
  tasks_completed int          NOT NULL DEFAULT 0,
  tasks_postponed int          NOT NULL DEFAULT 0,
  tasks_skipped   int          NOT NULL DEFAULT 0,
  postpone_rate   numeric(5,4) NOT NULL DEFAULT 0,
  top_task_types  text[]       NOT NULL DEFAULT '{}',
  plants_added    int          NOT NULL DEFAULT 0,
  ai_chat_count   int          NOT NULL DEFAULT 0,
  last_active_at  timestamptz,
  computed_at     timestamptz  NOT NULL DEFAULT now()
);

ALTER TABLE public.user_behaviour_summary ENABLE ROW LEVEL SECURITY;

-- Users can only read their own summary; writes are service-role only.
CREATE POLICY "users_read_own_behaviour_summary"
  ON public.user_behaviour_summary
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

GRANT SELECT ON public.user_behaviour_summary TO authenticated;

-- Nightly refresh: runs at 02:00 UTC every day.
SELECT cron.schedule(
  'refresh-behaviour-summary-nightly',
  '0 2 * * *',
  $$
  SELECT net.http_post(
    url:='https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/refresh-behaviour-summary',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_HDBdrlKd8HMPHto0E6i5QA_nbIPe-3K"}'::jsonb,
    body:='{}'::jsonb
  );
  $$
);
