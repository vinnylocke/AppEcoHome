CREATE TABLE IF NOT EXISTS public.user_achievements (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_key text        NOT NULL,
  unlocked_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, achievement_key)
);

ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_achievements"
  ON public.user_achievements
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_achievements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_achievements TO service_role;
