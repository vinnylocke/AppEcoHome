-- First-Run experience state.
--
-- Three columns on user_profiles drive the new welcome carousel +
-- Getting Started checklist + persona-aware copy:
--
--   • welcomed_at      — when the user finished (or skipped) the
--                        welcome carousel. NULL = brand-new account
--                        that hasn't seen the welcome flow yet.
--
--   • persona          — self-declared gardening experience captured
--                        in the welcome flow. Used by future waves
--                        to bias copy (more tooltips for "new",
--                        terser for "experienced"). NULL = we never
--                        asked (existing users + skippers).
--
--   • onboarding_steps — tracks per-user progress through the
--                        Getting Started checklist. Auto-detected
--                        for most steps via DB queries; persisted
--                        here so the UI can render without re-fetching.
--                        Shape: { quiz_completed, first_location,
--                        first_plant, first_assignment, first_schedule,
--                        dismissed_at }.
--
-- Existing users get their welcomed_at backfilled to now() so the
-- carousel only ever shows for brand-new sign-ups going forward.

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS welcomed_at      timestamptz,
  ADD COLUMN IF NOT EXISTS persona          text,
  ADD COLUMN IF NOT EXISTS onboarding_steps jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Persona constraint added separately + idempotently so a re-run is safe.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_profiles_persona_check'
  ) THEN
    ALTER TABLE user_profiles
      ADD CONSTRAINT user_profiles_persona_check
      CHECK (persona IS NULL OR persona IN ('new', 'experienced'));
  END IF;
END$$;

-- Backfill: existing users have already figured the app out; they
-- shouldn't see the welcome carousel on their next login.
UPDATE user_profiles
SET welcomed_at = now()
WHERE welcomed_at IS NULL;

COMMENT ON COLUMN user_profiles.welcomed_at IS
  'Timestamp the user first completed (or skipped) the welcome carousel. NULL = brand-new account that has not yet seen the welcome flow.';

COMMENT ON COLUMN user_profiles.persona IS
  'Self-declared gardening experience captured in the welcome flow. Used to bias copy (more tooltips for "new", terser for "experienced"). NULL = we never asked.';

COMMENT ON COLUMN user_profiles.onboarding_steps IS
  'Tracks per-user completion of the Getting Started checklist. Shape: { quiz_completed: bool, first_location: bool, first_plant: bool, first_assignment: bool, first_schedule: bool, dismissed_at: timestamptz | null }.';
