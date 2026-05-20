-- Ordering-bug catch-up migration.
--
-- Five earlier migrations (20260513030000, 20260515160000, 20260518200000,
-- 20260519000000, 20260519100000) reference tables that are created in LATER
-- migrations (alphabetically / chronologically). On a fresh `supabase db reset`
-- they fail because the dependency tables don't exist yet.
--
-- The fix is two-part:
--   1. Each broken migration is wrapped in an IF EXISTS guard so it no-ops
--      cleanly on a fresh DB instead of crashing the reset.
--   2. This catch-up migration runs AFTER all the dependency tables exist
--      and idempotently applies the work the broken migrations skipped.
--
-- On an existing remote DB where the originals ran successfully at deploy
-- time, every operation below is a no-op (everything already exists, and
-- the SQL is written to be idempotent).
--
-- Files this catch-up covers:
--   • 20260513030000_verdantly_support.sql       — INSERT into app_config (needs 20260527100000)
--   • 20260515160000_device_rls_writes.sql       — policies on devices    (needs 20260521000000)
--   • 20260518200000_clear_verdantly_cache.sql   — TRUNCATE (one-time, skipped here)
--   • 20260519000000_valve_queue_command_and_drain_cron.sql — column on automation_valve_queue (needs 20260530000000)
--   • 20260519100000_valve_events.sql            — CREATE TABLE valve_events (needs 20260521000000 + 20260530000000)

-- ──────────────────────────────────────────────────────────────────────────
-- 1. plant_providers seed (from 20260513030000)
-- ──────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'app_config'
  ) THEN
    INSERT INTO public.app_config (key, value)
    VALUES ('plant_providers', '{"enabled": ["perenual", "verdantly"]}'::jsonb)
    ON CONFLICT (key) DO NOTHING;
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────────────
-- 2. devices write policies (from 20260515160000)
-- ──────────────────────────────────────────────────────────────────────────

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
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────────────
-- 3. automation_valve_queue.command column (from 20260519000000)
-- ──────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'automation_valve_queue'
  ) THEN
    ALTER TABLE automation_valve_queue
      ADD COLUMN IF NOT EXISTS command TEXT NOT NULL DEFAULT 'turn_on'
        CHECK (command IN ('turn_on', 'turn_off'));
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────────────
-- 4. valve_events table + indexes + policy (from 20260519100000)
-- ──────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'devices'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'automations'
  ) THEN
    CREATE TABLE IF NOT EXISTS valve_events (
      id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
      device_id        uuid        NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      home_id          uuid        NOT NULL REFERENCES homes(id)   ON DELETE CASCADE,
      automation_id    uuid        REFERENCES automations(id)      ON DELETE SET NULL,
      event_type       text        NOT NULL CHECK (event_type IN ('turn_on', 'turn_off')),
      triggered_by     text        NOT NULL CHECK (triggered_by IN ('scheduled', 'manual')),
      duration_seconds integer,
      fired_at         timestamptz NOT NULL DEFAULT now(),
      created_at       timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_valve_events_device ON valve_events (device_id, fired_at DESC);
    CREATE INDEX IF NOT EXISTS idx_valve_events_home   ON valve_events (home_id,   fired_at DESC);
    CREATE INDEX IF NOT EXISTS idx_valve_events_auto   ON valve_events (automation_id) WHERE automation_id IS NOT NULL;

    ALTER TABLE valve_events ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "home members read valve_events" ON valve_events;
    CREATE POLICY "home members read valve_events"
      ON valve_events FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM home_members
          WHERE home_members.home_id = valve_events.home_id
            AND home_members.user_id = auth.uid()
        )
      );
  END IF;
END $$;
