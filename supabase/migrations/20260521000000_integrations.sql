-- ─── INTEGRATIONS SCHEMA ─────────────────────────────────────────────────────
-- Provider integrations: one row per home per connected provider.
-- Credentials are stored AES-256-GCM encrypted — plaintext never touches the DB.

CREATE TABLE integrations (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id               uuid        NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
  provider              text        NOT NULL CHECK (provider IN ('ecowitt', 'ewelink')),
  credentials_encrypted text        NOT NULL,
  region                text        NOT NULL DEFAULT 'eu',
  sync_interval_minutes int         NOT NULL DEFAULT 16 CHECK (sync_interval_minutes >= 1),
  status                text        NOT NULL DEFAULT 'active'
                                    CHECK (status IN ('active', 'error', 'disconnected')),
  last_synced_at        timestamptz,
  error_message         text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (home_id, provider)
);

-- Physical devices linked to an integration.
-- metadata carries provider-specific fields (see providerTypes.ts for shape).
-- location_id / area_id are nullable so devices can be assigned to garden spaces later.
CREATE TABLE devices (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id     uuid        NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  home_id            uuid        NOT NULL REFERENCES homes(id)         ON DELETE CASCADE,
  location_id        uuid        REFERENCES locations(id) ON DELETE SET NULL,
  area_id            uuid        REFERENCES areas(id)     ON DELETE SET NULL,
  external_device_id text        NOT NULL,
  name               text        NOT NULL,
  device_type        text        NOT NULL CHECK (device_type IN ('water_valve', 'soil_sensor')),
  provider           text        NOT NULL,
  metadata           jsonb       NOT NULL DEFAULT '{}',
  is_active          boolean     NOT NULL DEFAULT true,
  last_seen_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (integration_id, external_device_id)
);

-- Time-series readings for all device types.
-- soil_sensor data shape: { "soil_temp": 18.5, "soil_moisture": 65.2, "soil_ec": 1.2 }
-- water_valve data shape: { "state": "on" | "off" }
CREATE TABLE device_readings (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id   uuid        NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  home_id     uuid        NOT NULL REFERENCES homes(id)   ON DELETE CASCADE,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  data        jsonb       NOT NULL
);

CREATE INDEX idx_device_readings_device_time
  ON device_readings (device_id, recorded_at DESC);

CREATE INDEX idx_device_readings_home_time
  ON device_readings (home_id, recorded_at DESC);

-- Audit log of all control commands issued to devices.
-- auto_off_at tracks when the dead-man's switch should fire.
CREATE TABLE device_commands (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id       uuid        NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  home_id         uuid        NOT NULL REFERENCES homes(id)   ON DELETE CASCADE,
  issued_by       uuid        REFERENCES auth.users(id),
  command         text        NOT NULL CHECK (command IN ('turn_on', 'turn_off')),
  parameters      jsonb       NOT NULL DEFAULT '{}',
  auto_off_at     timestamptz,
  status          text        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'success', 'failed')),
  error_message   text,
  issued_at       timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz
);

CREATE INDEX idx_device_commands_device
  ON device_commands (device_id, issued_at DESC);

-- Index for dead-man's switch cron: find overdue timers quickly
CREATE INDEX idx_device_commands_auto_off
  ON device_commands (auto_off_at)
  WHERE auto_off_at IS NOT NULL AND status = 'success' AND command = 'turn_on';

-- ─── ROW LEVEL SECURITY ───────────────────────────────────────────────────────

ALTER TABLE integrations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices         ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_commands ENABLE ROW LEVEL SECURITY;

-- All home members can read integration config (not credentials — those stay encrypted)
CREATE POLICY "home members read integrations"
  ON integrations FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM home_members
      WHERE home_members.home_id = integrations.home_id
        AND home_members.user_id = auth.uid()
    )
  );

CREATE POLICY "home members read devices"
  ON devices FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM home_members
      WHERE home_members.home_id = devices.home_id
        AND home_members.user_id = auth.uid()
    )
  );

CREATE POLICY "home members read readings"
  ON device_readings FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM home_members
      WHERE home_members.home_id = device_readings.home_id
        AND home_members.user_id = auth.uid()
    )
  );

CREATE POLICY "home members read commands"
  ON device_commands FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM home_members
      WHERE home_members.home_id = device_commands.home_id
        AND home_members.user_id = auth.uid()
    )
  );

-- All writes go through edge functions using the service role key.
-- No client-side INSERT/UPDATE/DELETE policies are needed.

-- ─── AGGREGATE READINGS RPC ───────────────────────────────────────────────────
-- Called by integrations-readings-query for hourly/daily aggregation.
-- Returns one bucket per trunc period with averaged soil readings or last valve state.

CREATE OR REPLACE FUNCTION aggregate_device_readings(
  p_device_id   uuid,
  p_since       timestamptz,
  p_trunc       text,   -- 'hour' | 'day'
  p_device_type text
)
RETURNS TABLE (
  bucket        text,
  soil_temp     numeric,
  soil_moisture numeric,
  soil_ec       numeric,
  state         text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_device_type = 'soil_sensor' THEN
    RETURN QUERY
      SELECT
        date_trunc(p_trunc, recorded_at)::text                    AS bucket,
        ROUND(AVG((data->>'soil_temp')::numeric)::numeric, 2)     AS soil_temp,
        ROUND(AVG((data->>'soil_moisture')::numeric)::numeric, 2) AS soil_moisture,
        ROUND(AVG((data->>'soil_ec')::numeric)::numeric, 3)       AS soil_ec,
        NULL::text                                                 AS state
      FROM device_readings
      WHERE device_id = p_device_id
        AND recorded_at >= p_since
      GROUP BY date_trunc(p_trunc, recorded_at)
      ORDER BY 1;
  ELSE
    -- water_valve: return the most recent state in each bucket
    RETURN QUERY
      SELECT DISTINCT ON (date_trunc(p_trunc, recorded_at))
        date_trunc(p_trunc, recorded_at)::text AS bucket,
        NULL::numeric AS soil_temp,
        NULL::numeric AS soil_moisture,
        NULL::numeric AS soil_ec,
        (data->>'state')::text                 AS state
      FROM device_readings
      WHERE device_id = p_device_id
        AND recorded_at >= p_since
      ORDER BY date_trunc(p_trunc, recorded_at), recorded_at DESC;
  END IF;
END;
$$;
