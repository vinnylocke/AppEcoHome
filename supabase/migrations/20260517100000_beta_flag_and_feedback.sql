-- Add is_beta flag to user_profiles
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS is_beta boolean NOT NULL DEFAULT false;

-- Beta feedback table
CREATE TABLE IF NOT EXISTS public.beta_feedback (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_context text       NOT NULL,
  ratings       jsonb       NOT NULL DEFAULT '{}',
  description   text,
  metadata      jsonb       NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.beta_feedback ENABLE ROW LEVEL SECURITY;

-- Users can only insert their own feedback
CREATE POLICY "beta_feedback_insert" ON public.beta_feedback
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Only service_role can select (admins view via Supabase dashboard)
CREATE POLICY "beta_feedback_select_service" ON public.beta_feedback
  FOR SELECT TO service_role
  USING (true);
