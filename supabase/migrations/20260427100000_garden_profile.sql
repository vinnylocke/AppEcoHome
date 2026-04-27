-- ============================================================
-- GARDEN PROFILE: preference source tracking + quiz completions
-- ============================================================

-- 1. Tag every preference with its origin so we can weight/filter by source.
--    Existing rows (all from the chat AI) default to 'chat'.
ALTER TABLE public.planner_preferences
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'chat'
    CHECK (source IN ('chat', 'quiz', 'swipe'));

-- 2. Track which (home, user) pairs have completed the habit quiz.
--    Drives the dashboard prompt — card disappears once completed.
CREATE TABLE IF NOT EXISTS public.home_quiz_completions (
  id           uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  home_id      uuid        NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  user_id      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (home_id, user_id)
);

ALTER TABLE public.home_quiz_completions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_can_insert_own_quiz_completions" ON public.home_quiz_completions;
DROP POLICY IF EXISTS "users_can_read_own_quiz_completions"   ON public.home_quiz_completions;

CREATE POLICY "users_can_insert_own_quiz_completions"
  ON public.home_quiz_completions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "users_can_read_own_quiz_completions"
  ON public.home_quiz_completions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_home_quiz_completions_lookup
  ON public.home_quiz_completions (home_id, user_id);
