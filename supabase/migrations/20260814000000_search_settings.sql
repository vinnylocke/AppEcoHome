-- Per-user default search-source preference (search-source-preference plan).
--
-- Lets entitled users choose which source the plant / ailment search runs FIRST
-- by default, instead of always library-first. Entitlement is clamped at read
-- time in the client, so a downgrade silently falls back to "library".

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS search_settings jsonb;

COMMENT ON COLUMN public.user_profiles.search_settings IS
  'Default search source per domain: { plant_source: library|verdantly|perenual|ai, '
  '  ailment_source: library|perenual|ai }. Entitlement-clamped at read time; '
  '  null/absent = library-first (the default for everyone).';
