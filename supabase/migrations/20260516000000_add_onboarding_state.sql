ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS onboarding_state JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_user_profiles_onboarding_state
  ON public.user_profiles USING GIN (onboarding_state);
