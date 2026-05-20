-- Allow home members to insert and update devices directly from the client.
-- The exchange_code and connect flows save devices from the browser using the
-- user's auth token, so RLS must permit these operations for home members.
--
-- Wrapped in IF EXISTS so this migration is safe on a fresh DB where the
-- devices table (created later in 20260521000000_integrations.sql) doesn't
-- exist yet. The catch-up migration 20260606000000_ordering_bug_fixups.sql
-- re-applies these policies after devices is created.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'devices'
  ) THEN
    DROP POLICY IF EXISTS "home members insert devices" ON devices;
    CREATE POLICY "home members insert devices"
      ON devices FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM home_members
          WHERE home_members.home_id = devices.home_id
            AND home_members.user_id = auth.uid()
        )
      );

    DROP POLICY IF EXISTS "home members update devices" ON devices;
    CREATE POLICY "home members update devices"
      ON devices FOR UPDATE TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM home_members
          WHERE home_members.home_id = devices.home_id
            AND home_members.user_id = auth.uid()
        )
      );
  ELSE
    RAISE NOTICE 'devices not yet created — policies deferred to 20260606000000_ordering_bug_fixups.sql';
  END IF;
END $$;
