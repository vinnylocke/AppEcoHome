-- ── valve_events ──────────────────────────────────────────────────────────────
-- Records every turn_on / turn_off command sent to a water valve so the device
-- history chart can show a timeline rather than "coming soon".

CREATE TABLE valve_events (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id        uuid        NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  home_id          uuid        NOT NULL REFERENCES homes(id)   ON DELETE CASCADE,
  automation_id    uuid        REFERENCES automations(id)      ON DELETE SET NULL,
  event_type       text        NOT NULL CHECK (event_type IN ('turn_on', 'turn_off')),
  triggered_by     text        NOT NULL CHECK (triggered_by IN ('scheduled', 'manual')),
  duration_seconds integer,    -- populated on turn_on events only
  fired_at         timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_valve_events_device   ON valve_events (device_id,  fired_at DESC);
CREATE INDEX idx_valve_events_home     ON valve_events (home_id,    fired_at DESC);
CREATE INDEX idx_valve_events_auto     ON valve_events (automation_id) WHERE automation_id IS NOT NULL;

ALTER TABLE valve_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "home members read valve_events"
  ON valve_events FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM home_members
      WHERE home_members.home_id = valve_events.home_id
        AND home_members.user_id = auth.uid()
    )
  );
