-- Clear v1 Verdantly cache — raw_data schema changed in v2 and the new mapper cannot read v1 objects.
--
-- Wrapped in IF EXISTS so this migration is safe on a fresh DB where
-- verdantly_cache may not exist yet. This is a one-time data cleanup — if
-- the table doesn't exist there's nothing to clean, so no catch-up needed.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'verdantly_cache'
  ) THEN
    TRUNCATE public.verdantly_cache;
  ELSE
    RAISE NOTICE 'verdantly_cache not yet created — truncate skipped (no data to clean)';
  END IF;
END $$;
