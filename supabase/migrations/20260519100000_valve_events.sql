-- ── valve_events ──────────────────────────────────────────────────────────────
-- Records every turn_on / turn_off command sent to a water valve so the device
-- history chart can show a timeline rather than "coming soon".
--
-- Wrapped in IF EXISTS so this migration is safe on a fresh DB where the
-- devices + automations tables (created later in 20260521000000_integrations.sql
-- and 20260530000000_automations.sql respectively) don't exist yet. The
-- catch-up migration 20260606000000_ordering_bug_fixups.sql re-applies the
-- table creation + policies after both dependencies exist.

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
  ELSE
    RAISE NOTICE 'devices and/or automations not yet created — valve_events deferred to 20260606000000_ordering_bug_fixups.sql';
  END IF;
END $$;
