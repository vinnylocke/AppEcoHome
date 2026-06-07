-- ─── Wave 22.0001-A — voice settings on user_profiles ───────────────────
--
-- Stores per-user voice prefs for the Garden AI chat:
--   { auto_read_assistant_replies: boolean, preferred_voice: text }
--
-- Default is a no-op object so existing clients that read this field
-- with optional chaining (?.auto_read_assistant_replies) still behave
-- as "off" without any backfill work.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS voice_settings jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.user_profiles.voice_settings IS
  'Per-user voice prefs for the Garden AI chat. Shape: { auto_read_assistant_replies: boolean, preferred_voice: text }';
