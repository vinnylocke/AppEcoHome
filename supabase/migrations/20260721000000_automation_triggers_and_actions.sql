-- ============================================================
-- SENSOR-DRIVEN AUTOMATIONS — Phase 3 (2026-06-16)
--
-- Extends the existing automations stack so a sensor reading can fire
-- an automation. Up to now `automations` was a time-scheduled valve
-- runner. We add:
--
--   1. trigger_kind on `automations` — 'time_scheduled' (existing) or
--      'sensor_threshold' (new).
--   2. Threshold rule fields on `automations` — one rule per automation
--      (metric / comparator / threshold / hysteresis / cooldown).
--      Multiple sensors can be linked via the existing
--      `automation_sensors` join; agg_mode controls whether ANY / ALL /
--      AVERAGE of those sensors needs to satisfy the rule.
--   3. area_id on `automations` — when set, the builder UI filters the
--      sensor + valve pickers to devices in that area.
--   4. New `automation_actions` table — typed action list (notification,
--      valve_open, valve_close). Replaces the old implicit "all linked
--      devices fire on schedule" assumption with an explicit per-action
--      record.
--
-- The existing time-scheduled automations are untouched. Their
-- trigger_kind stays 'time_scheduled' (the column's default) and the
-- run-automations cron continues to find them via the same query.
--
-- Hysteresis interpretation: an effective margin past the nominal
-- threshold. For `>=` and `>`, we fire only when latest >= threshold +
-- hysteresis. For `<=` and `<`, latest <= threshold - hysteresis.
-- Default 0 — relies on cooldown alone to prevent spam. Cooldown
-- default 60 min covers the typical "alert when too hot" pattern.
-- ============================================================

-- ── 1. AUTOMATIONS: trigger_kind + threshold rule + area_id ───────────────────

ALTER TABLE public.automations
  ADD COLUMN IF NOT EXISTS trigger_kind text NOT NULL DEFAULT 'time_scheduled'
    CHECK (trigger_kind IN ('time_scheduled', 'sensor_threshold')),
  ADD COLUMN IF NOT EXISTS area_id uuid REFERENCES public.areas(id) ON DELETE SET NULL,
  -- Threshold rule columns — NULL for time-scheduled automations.
  ADD COLUMN IF NOT EXISTS sensor_metric text
    CHECK (sensor_metric IS NULL OR sensor_metric IN ('soil_moisture', 'soil_temp_c', 'soil_ec')),
  ADD COLUMN IF NOT EXISTS sensor_comparator text
    CHECK (sensor_comparator IS NULL OR sensor_comparator IN ('>', '>=', '<', '<=')),
  ADD COLUMN IF NOT EXISTS sensor_threshold_value numeric,
  ADD COLUMN IF NOT EXISTS sensor_hysteresis numeric NOT NULL DEFAULT 0
    CHECK (sensor_hysteresis >= 0),
  ADD COLUMN IF NOT EXISTS sensor_cooldown_minutes int NOT NULL DEFAULT 60
    CHECK (sensor_cooldown_minutes >= 0),
  ADD COLUMN IF NOT EXISTS sensor_agg_mode text NOT NULL DEFAULT 'any'
    CHECK (sensor_agg_mode IN ('any', 'all', 'average')),
  ADD COLUMN IF NOT EXISTS sensor_last_fired_at timestamptz;

COMMENT ON COLUMN public.automations.trigger_kind IS
  'Drives which engine evaluates this automation. time_scheduled → run-automations cron (hourly). sensor_threshold → evaluate-sensor-automations cron (every 5 min). Default time_scheduled for back-compat.';
COMMENT ON COLUMN public.automations.sensor_agg_mode IS
  'For sensor_threshold automations with multiple linked sensors: any (default — fire when any sensor satisfies the rule), all (fire only when every sensor satisfies), or average (fire when the average across sensors satisfies).';
COMMENT ON COLUMN public.automations.sensor_hysteresis IS
  'Margin past the nominal threshold before firing. For >= / > comparators we fire only when latest >= threshold + hysteresis. For <= / < comparators we fire when latest <= threshold - hysteresis. Use 0 (default) to fire on the exact threshold; cooldown then prevents re-firing.';
COMMENT ON COLUMN public.automations.sensor_last_fired_at IS
  'Set by the evaluate-sensor-automations cron after each successful fire. Used to enforce sensor_cooldown_minutes.';

-- ── 2. AUTOMATION_ACTIONS — typed action list ─────────────────────────────────

CREATE TABLE IF NOT EXISTS public.automation_actions (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id          uuid        NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
  -- 'notification' (push every home_member), 'valve_open' (open target valve
  -- for valve_duration_seconds), 'valve_close' (force a valve closed).
  action_kind            text        NOT NULL
                                     CHECK (action_kind IN ('notification', 'valve_open', 'valve_close')),
  -- For notification actions.
  notification_title     text,
  notification_body      text,
  -- For valve actions.
  target_device_id       uuid        REFERENCES public.devices(id) ON DELETE CASCADE,
  -- Duration the valve stays open (valve_open only). NULL on valve_close.
  valve_duration_seconds int         CHECK (valve_duration_seconds IS NULL OR valve_duration_seconds > 0),
  -- Order in which actions fire when an automation triggers. Notifications
  -- typically come first so the user can react before valves cycle.
  ord                    int         NOT NULL DEFAULT 0,
  created_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.automation_actions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_automation_actions_automation
  ON public.automation_actions (automation_id, ord);

DROP POLICY IF EXISTS "home_members_select_automation_actions" ON public.automation_actions;
CREATE POLICY "home_members_select_automation_actions"
  ON public.automation_actions FOR SELECT TO authenticated
  USING (automation_id IN (
    SELECT id FROM public.automations
    WHERE home_id IN (SELECT home_id FROM public.home_members WHERE user_id = (SELECT auth.uid()))
  ));

DROP POLICY IF EXISTS "home_members_write_automation_actions" ON public.automation_actions;
CREATE POLICY "home_members_write_automation_actions"
  ON public.automation_actions FOR ALL TO authenticated
  USING (automation_id IN (
    SELECT id FROM public.automations
    WHERE home_id IN (SELECT home_id FROM public.home_members WHERE user_id = (SELECT auth.uid()))
  ))
  WITH CHECK (automation_id IN (
    SELECT id FROM public.automations
    WHERE home_id IN (SELECT home_id FROM public.home_members WHERE user_id = (SELECT auth.uid()))
  ));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_actions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_actions TO service_role;

COMMENT ON TABLE public.automation_actions IS
  'Typed action list per automation. Replaces the "all linked devices fire on schedule" assumption with explicit per-action records so the same automation can mix notifications + valve commands. Order via ord — notifications first by convention.';

-- ── 3. AUTOMATION_SENSORS: relax PK + add nullable threshold per sensor ──────

-- The existing automation_sensors table had `moisture_threshold_pct` baked in
-- and used (automation_id, sensor_device_id) as a composite PK. We keep the
-- table shape but no longer treat moisture_threshold_pct as the source of
-- truth — the rule now lives on automations. Old rows whose automation has
-- trigger_kind = 'time_scheduled' are simply ignored by the new engine.
--
-- Nothing to alter for Phase 3 — automation_sensors stays as the
-- automation ↔ sensor join. The deprecated `moisture_threshold_pct`
-- stays in place for the next few weeks before we drop it.

COMMENT ON COLUMN public.automation_sensors.moisture_threshold_pct IS
  'DEPRECATED (2026-06-16). The threshold rule now lives on automations (sensor_metric / sensor_comparator / sensor_threshold_value). This column will be dropped in a follow-up migration once we are sure no code references it.';
