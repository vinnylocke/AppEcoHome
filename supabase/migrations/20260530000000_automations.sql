-- ─── DEVICE AUTOMATIONS ──────────────────────────────────────────────────────
-- Tier 1: task-linked valve automations.
-- Tier 2: sensor-driven automations (schema scaffold only — no logic yet).
--
-- Execution model:
--   An hourly pg_cron job calls run-automations, which fires valves when any
--   controlling blueprint has a task due today, marks linked tasks done, and
--   sends a push notification with the result.

-- ── automations ───────────────────────────────────────────────────────────────
CREATE TABLE automations (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id                  uuid        NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
  name                     text        NOT NULL,
  is_active                boolean     NOT NULL DEFAULT true,
  tier                     int         NOT NULL DEFAULT 1,

  -- Scheduling (stored as UTC time; displayed to user in their local tz)
  scheduled_time           time        NOT NULL DEFAULT '07:00',

  -- Valve behaviour
  duration_seconds         int         NOT NULL DEFAULT 1800,
  fire_valves_sequentially boolean     NOT NULL DEFAULT false,

  -- Weather awareness
  skip_if_rained           boolean     NOT NULL DEFAULT false,
  rain_threshold_mm        numeric     NOT NULL DEFAULT 5.0,

  -- Failure handling
  retry_on_failure         boolean     NOT NULL DEFAULT true,

  -- Prevents double-fire on the same day
  last_run_date            date,

  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

-- ── automation_devices ────────────────────────────────────────────────────────
-- Each valve belongs to at most one automation (UNIQUE on device_id).
CREATE TABLE automation_devices (
  automation_id uuid NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  device_id     uuid NOT NULL REFERENCES devices(id)     ON DELETE CASCADE,
  PRIMARY KEY (automation_id, device_id),
  UNIQUE (device_id)
);

-- ── automation_blueprints ─────────────────────────────────────────────────────
-- 'controlling' role: blueprint triggers the automation AND gets auto-completed.
-- 'driven'      role: blueprint gets auto-completed but does not trigger.
CREATE TABLE automation_blueprints (
  automation_id uuid NOT NULL REFERENCES automations(id)       ON DELETE CASCADE,
  blueprint_id  uuid NOT NULL REFERENCES task_blueprints(id)   ON DELETE CASCADE,
  role          text NOT NULL DEFAULT 'controlling',
  PRIMARY KEY (automation_id, blueprint_id),
  CONSTRAINT automation_blueprints_role_check CHECK (role IN ('controlling', 'driven'))
);

-- ── automation_runs ───────────────────────────────────────────────────────────
CREATE TABLE automation_runs (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id      uuid        NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  home_id            uuid        NOT NULL REFERENCES homes(id),
  triggered_at       timestamptz NOT NULL DEFAULT now(),
  triggered_by       text        NOT NULL DEFAULT 'schedule',
  status             text        NOT NULL DEFAULT 'pending',
  devices_triggered  jsonb       NOT NULL DEFAULT '[]',
  tasks_completed    jsonb       NOT NULL DEFAULT '[]',
  error_message      text,
  completed_at       timestamptz,
  notified_at        timestamptz,
  CONSTRAINT automation_runs_triggered_by_check CHECK (triggered_by IN ('schedule', 'manual')),
  CONSTRAINT automation_runs_status_check CHECK (
    status IN ('pending', 'success', 'partial', 'failed', 'skipped_weather', 'skipped_no_tasks')
  )
);

CREATE INDEX idx_automation_runs_automation ON automation_runs (automation_id, triggered_at DESC);

-- ── automation_valve_queue ────────────────────────────────────────────────────
-- Supports sequential valve firing across multiple cron windows.
-- First valve fires immediately; subsequent ones are queued with a staggered fire_at.
CREATE TABLE automation_valve_queue (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_run_id uuid        NOT NULL REFERENCES automation_runs(id) ON DELETE CASCADE,
  device_id         uuid        NOT NULL REFERENCES devices(id),
  fire_at           timestamptz NOT NULL,
  status            text        NOT NULL DEFAULT 'pending',
  error_message     text,
  fired_at          timestamptz,
  CONSTRAINT automation_valve_queue_status_check CHECK (status IN ('pending', 'fired', 'failed'))
);

CREATE INDEX idx_automation_valve_queue_pending ON automation_valve_queue (fire_at)
  WHERE status = 'pending';

-- ── automation_sensors (Tier 2 scaffold — no logic) ───────────────────────────
CREATE TABLE automation_sensors (
  automation_id        uuid NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  sensor_device_id     uuid NOT NULL REFERENCES devices(id)     ON DELETE CASCADE,
  plant_id             int  REFERENCES plants(id) ON DELETE SET NULL,
  moisture_threshold_pct int NOT NULL DEFAULT 30,
  PRIMARY KEY (automation_id, sensor_device_id)
);

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE automations          ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_devices   ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_blueprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_runs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_valve_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_sensors   ENABLE ROW LEVEL SECURITY;

-- Helper: home member check (consistent with existing policies)
CREATE POLICY "home members manage automations"
  ON automations FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM home_members
      WHERE home_members.home_id = automations.home_id
        AND home_members.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM home_members
      WHERE home_members.home_id = automations.home_id
        AND home_members.user_id = auth.uid()
    )
  );

CREATE POLICY "home members manage automation_devices"
  ON automation_devices FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM automations a
      JOIN home_members hm ON hm.home_id = a.home_id
      WHERE a.id = automation_devices.automation_id
        AND hm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM automations a
      JOIN home_members hm ON hm.home_id = a.home_id
      WHERE a.id = automation_devices.automation_id
        AND hm.user_id = auth.uid()
    )
  );

CREATE POLICY "home members manage automation_blueprints"
  ON automation_blueprints FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM automations a
      JOIN home_members hm ON hm.home_id = a.home_id
      WHERE a.id = automation_blueprints.automation_id
        AND hm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM automations a
      JOIN home_members hm ON hm.home_id = a.home_id
      WHERE a.id = automation_blueprints.automation_id
        AND hm.user_id = auth.uid()
    )
  );

-- Runs and queue are read-only for home members (written by service role)
CREATE POLICY "home members read automation_runs"
  ON automation_runs FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM home_members
      WHERE home_members.home_id = automation_runs.home_id
        AND home_members.user_id = auth.uid()
    )
  );

CREATE POLICY "home members read automation_valve_queue"
  ON automation_valve_queue FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM automation_runs ar
      JOIN home_members hm ON hm.home_id = ar.home_id
      WHERE ar.id = automation_valve_queue.automation_run_id
        AND hm.user_id = auth.uid()
    )
  );

CREATE POLICY "home members manage automation_sensors"
  ON automation_sensors FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM automations a
      JOIN home_members hm ON hm.home_id = a.home_id
      WHERE a.id = automation_sensors.automation_id
        AND hm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM automations a
      JOIN home_members hm ON hm.home_id = a.home_id
      WHERE a.id = automation_sensors.automation_id
        AND hm.user_id = auth.uid()
    )
  );

-- ── pg_cron: run automations every hour ──────────────────────────────────────
SELECT cron.unschedule(jobname)
FROM cron.job
WHERE jobname = 'run-automations-hourly';

SELECT cron.schedule(
  'run-automations-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url:='https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/run-automations',
    headers:='{"Content-Type": "application/json"}'::jsonb,
    body:='{}'::jsonb
  ) AS request_id;
  $$
);
