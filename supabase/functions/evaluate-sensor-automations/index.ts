/**
 * evaluate-sensor-automations
 *
 * Phase 3 (2026-06-16) — fires sensor-driven automations.
 *
 * Runs every 5 min via pg_cron. For each `is_active = true AND
 * trigger_kind = 'sensor_threshold'` automation:
 *
 *   1. Load the linked sensors (automation_sensors) + their latest
 *      reading from device_readings.
 *   2. Build the rule from the automation row + call
 *      `evaluateAutomation` to decide whether to fire.
 *   3. On fire: write an automation_runs row, fan-out actions —
 *      notifications go straight to the `notifications` table, valve
 *      commands enqueue on automation_valve_queue (the existing drain
 *      step in run-automations actually talks to eWeLink), and stamp
 *      `sensor_last_fired_at` so cooldown is enforced next tick.
 *
 * Per-automation try/catch so one bad rule doesn't block the rest of
 * the batch. Service role internally.
 *
 * `verify_jwt = false` (config.toml) so pg_cron's net.http_post can
 * reach it without minting a JWT.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { log, error as logError } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import {
  evaluateAutomation,
  evaluateHybrid,
  ruleSatisfiedAcrossSensors,
  type SensorMetric,
  type Comparator,
  type AggMode,
  type SensorObservation,
  type SensorRule,
  type WeatherMode,
} from "../_shared/automationEvaluator.ts";
import { readForecast } from "../_shared/weatherForecast.ts";

const FN = "evaluate-sensor-automations";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface AutomationRow {
  id: string;
  home_id: string;
  name: string;
  area_id: string | null;
  sensor_metric: SensorMetric;
  sensor_comparator: Comparator;
  sensor_threshold_value: number;
  sensor_hysteresis: number;
  sensor_cooldown_minutes: number;
  sensor_agg_mode: AggMode;
  sensor_last_fired_at: string | null;
  // Hybrid weather layer.
  weather_mode: WeatherMode | null;
  weather_min_probability: number | null;
  weather_defer_window_hours: number | null;
  critical_threshold_value: number | null;
  max_defers: number | null;
  defer_skip_in_heat: boolean | null;
  heat_threshold_c: number | null;
  rain_threshold_mm: number | null;
  defer_until: string | null;
  defer_count: number | null;
  defer_started_at: string | null;
}

const AUTOMATION_COLUMNS =
  "id, home_id, name, area_id, sensor_metric, sensor_comparator, sensor_threshold_value, " +
  "sensor_hysteresis, sensor_cooldown_minutes, sensor_agg_mode, sensor_last_fired_at, " +
  "weather_mode, weather_min_probability, weather_defer_window_hours, critical_threshold_value, " +
  "max_defers, defer_skip_in_heat, heat_threshold_c, rain_threshold_mm, " +
  "defer_until, defer_count, defer_started_at";

interface ActionRow {
  id: string;
  action_kind: "notification" | "valve_open" | "valve_close";
  notification_title: string | null;
  notification_body: string | null;
  target_device_id: string | null;
  valve_duration_seconds: number | null;
  ord: number;
}

const VALID_METRICS = new Set<SensorMetric>(["soil_moisture", "soil_temp_c", "soil_ec"]);
const VALID_COMPARATORS = new Set<Comparator>([">", ">=", "<", "<="]);
const VALID_AGG_MODES = new Set<AggMode>(["any", "all", "average"]);

function readMetric(metric: SensorMetric, data: Record<string, unknown> | null): number | null {
  if (!data || typeof data !== "object") return null;
  switch (metric) {
    case "soil_moisture": {
      const v = data.soil_moisture;
      return typeof v === "number" ? v : null;
    }
    case "soil_temp_c": {
      const v = data.soil_temp;
      return typeof v === "number" ? v : null;
    }
    case "soil_ec": {
      const v = data.soil_ec;
      return typeof v === "number" ? v : null;
    }
  }
}

async function loadSensorObservations(
  db: ReturnType<typeof createClient>,
  automationId: string,
  metric: SensorMetric,
  areaId: string | null,
): Promise<SensorObservation[]> {
  // Prefer explicitly linked sensors; fall back to the area's soil sensors so a
  // time-scheduled valve automation in 'defer' mode can still recheck moisture.
  let deviceIds: string[] = [];
  const { data: linked } = await db
    .from("automation_sensors")
    .select("sensor_device_id")
    .eq("automation_id", automationId);
  if (linked?.length) {
    deviceIds = (linked as Array<{ sensor_device_id: string }>).map((r) => r.sensor_device_id);
  } else if (areaId) {
    const { data: areaSensors } = await db
      .from("devices")
      .select("id")
      .eq("area_id", areaId)
      .eq("device_type", "soil_sensor");
    deviceIds = (areaSensors ?? []).map((d: { id: string }) => d.id);
  }
  if (!deviceIds.length) return [];

  const observations: SensorObservation[] = [];
  for (const id of deviceIds) {
    const { data: latest } = await db
      .from("device_readings")
      .select("data")
      .eq("device_id", id)
      .order("recorded_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!latest) continue;
    const value = readMetric(metric, latest.data as Record<string, unknown>);
    if (value === null) continue;
    observations.push({ value });
  }
  return observations;
}

/** Persist the single-pending deferral state on the automation row. */
async function setDeferState(
  db: ReturnType<typeof createClient>,
  automation: AutomationRow,
  until: Date,
): Promise<void> {
  await db.from("automations").update({
    defer_until: until.toISOString(),
    defer_count: (automation.defer_count ?? 0) + 1,
    defer_started_at: automation.defer_started_at ?? new Date().toISOString(),
  }).eq("id", automation.id);
}

async function clearDeferState(
  db: ReturnType<typeof createClient>,
  automationId: string,
): Promise<void> {
  await db.from("automations").update({
    defer_until: null,
    defer_count: 0,
    defer_started_at: null,
  }).eq("id", automationId);
}

async function writeRunRow(
  db: ReturnType<typeof createClient>,
  automation: AutomationRow,
  status: string,
): Promise<void> {
  await db.from("automation_runs").insert({
    automation_id: automation.id,
    home_id: automation.home_id,
    triggered_by: "schedule",
    status,
    completed_at: new Date().toISOString(),
  });
}

/** Critical-low floor in the metric's units (defaults a margin past threshold). */
function deriveCritical(rule: SensorRule, configured: number | null): number {
  if (configured != null) return Number(configured);
  return rule.comparator === "<" || rule.comparator === "<="
    ? rule.threshold - 10
    : rule.threshold + 10;
}

async function fanoutActions(
  db: ReturnType<typeof createClient>,
  automation: AutomationRow,
  runId: string,
): Promise<{ notifications_queued: number; valves_queued: number }> {
  const { data: actions } = await db
    .from("automation_actions")
    .select("id, action_kind, notification_title, notification_body, target_device_id, valve_duration_seconds, ord")
    .eq("automation_id", automation.id)
    .order("ord", { ascending: true });

  if (!actions?.length) return { notifications_queued: 0, valves_queued: 0 };

  let notificationsQueued = 0;
  let valvesQueued = 0;

  // Pre-load members once for all notification actions on this automation.
  let memberIds: string[] = [];
  const needsMembers = (actions as ActionRow[]).some((a) => a.action_kind === "notification");
  if (needsMembers) {
    const { data: members } = await db
      .from("home_members")
      .select("user_id")
      .eq("home_id", automation.home_id);
    memberIds = (members ?? []).map((m: { user_id: string }) => m.user_id);
  }

  // 5-second stagger between valves so they don't all hit the eWeLink
  // API in the same tick. The existing drainValveQueue cron handles
  // the actual fire / refire.
  let valveStaggerSeconds = 0;

  for (const action of actions as ActionRow[]) {
    if (action.action_kind === "notification") {
      if (memberIds.length === 0) continue;
      const title = action.notification_title?.trim() || automation.name;
      const body = action.notification_body?.trim()
        || `Sensor reading triggered "${automation.name}".`;
      const rows = memberIds.map((uid) => ({
        user_id: uid,
        home_id: automation.home_id,
        title,
        body,
        type: "automation_sensor",
        data: { route: "/integrations", automationId: automation.id },
        is_read: false,
      }));
      const { error: notifErr } = await db.from("notifications").insert(rows);
      if (notifErr) {
        logError(FN, "notification_insert_failed", {
          automation_id: automation.id,
          message: notifErr.message,
        });
      } else {
        notificationsQueued += rows.length;
      }
      continue;
    }

    if (action.action_kind === "valve_open" || action.action_kind === "valve_close") {
      if (!action.target_device_id) continue;
      const fireAt = new Date(Date.now() + valveStaggerSeconds * 1000).toISOString();
      const command = action.action_kind === "valve_open" ? "turn_on" : "turn_off";
      const { error: queueErr } = await db.from("automation_valve_queue").insert({
        automation_run_id: runId,
        device_id: action.target_device_id,
        fire_at: fireAt,
        command,
      });
      if (queueErr) {
        logError(FN, "valve_queue_insert_failed", {
          automation_id: automation.id,
          target_device_id: action.target_device_id,
          message: queueErr.message,
        });
      } else {
        valvesQueued += 1;
        valveStaggerSeconds += 5;
      }
    }
  }

  return { notifications_queued: notificationsQueued, valves_queued: valvesQueued };
}

async function processOne(
  db: ReturnType<typeof createClient>,
  automation: AutomationRow,
): Promise<{ decision: string; reason?: string; aggregated_value?: number }> {
  // Validate the rule fields early. A NULL metric / comparator /
  // threshold means the user saved the automation in sensor_threshold
  // mode without finishing the rule — skip safely.
  if (
    !automation.sensor_metric || !VALID_METRICS.has(automation.sensor_metric) ||
    !automation.sensor_comparator || !VALID_COMPARATORS.has(automation.sensor_comparator) ||
    automation.sensor_threshold_value === null || automation.sensor_threshold_value === undefined ||
    !VALID_AGG_MODES.has(automation.sensor_agg_mode)
  ) {
    return { decision: "skip_incomplete_rule" };
  }

  const now = new Date();
  const rule: SensorRule = {
    metric: automation.sensor_metric,
    comparator: automation.sensor_comparator,
    threshold: Number(automation.sensor_threshold_value),
    hysteresis: Number(automation.sensor_hysteresis),
    cooldown_minutes: Number(automation.sensor_cooldown_minutes),
    agg_mode: automation.sensor_agg_mode,
  };
  const observations = await loadSensorObservations(db, automation.id, automation.sensor_metric, automation.area_id);
  const outcome = evaluateAutomation(
    rule,
    observations,
    automation.sensor_last_fired_at ? new Date(automation.sensor_last_fired_at) : null,
    now,
  );

  if (outcome.decision === "skip") {
    // Moisture recovered (rain delivered / hand-watered) → drop any pending defer.
    if (outcome.reason === "rule_not_satisfied" && automation.defer_until) {
      await clearDeferState(db, automation.id);
    }
    return { decision: outcome.reason };
  }

  // Base rule wants to water. Apply the weather layer.
  const weatherMode = (automation.weather_mode ?? "off") as WeatherMode;
  let fireReason = "rule_satisfied";
  if (weatherMode !== "off") {
    const windowHours = automation.weather_defer_window_hours ?? 12;
    const minProbability = automation.weather_min_probability ?? 60;
    const heatThresholdC = automation.heat_threshold_c ?? 30;
    const forecast = await readForecast(db, automation.home_id, now, windowHours, minProbability, heatThresholdC);

    const criticalRule: SensorRule = { ...rule, threshold: deriveCritical(rule, automation.critical_threshold_value), hysteresis: 0 };
    const criticalSatisfied = ruleSatisfiedAcrossSensors(observations, criticalRule);

    const hybrid = evaluateHybrid({
      weatherMode,
      criticalSatisfied,
      rain: forecast.rain,
      rainThresholdMm: Number(automation.rain_threshold_mm ?? 5),
      minProbability,
      maxDefers: automation.max_defers ?? 2,
      deferSkipInHeat: automation.defer_skip_in_heat ?? true,
      isHeatwave: forecast.isHeatwave,
      defer: {
        deferUntil: automation.defer_until ? new Date(automation.defer_until) : null,
        deferCount: automation.defer_count ?? 0,
      },
      now,
    });

    if (hybrid.decision === "skip") {
      if (hybrid.clearDefer) await clearDeferState(db, automation.id);
      if (hybrid.reason === "weather_skip") await writeRunRow(db, automation, "skipped_weather");
      return { decision: hybrid.reason };
    }
    if (hybrid.decision === "defer") {
      await setDeferState(db, automation, hybrid.until);
      await writeRunRow(db, automation, "deferred_weather");
      return { decision: "deferred_weather" };
    }
    fireReason = hybrid.reason;
  }

  // FIRE. Create the run row, fan-out actions, stamp last_fired_at.
  const { data: runIns, error: runErr } = await db
    .from("automation_runs")
    .insert({
      automation_id: automation.id,
      home_id: automation.home_id,
      triggered_by: "schedule",
      status: "success",
      devices_triggered: [],
    })
    .select("id")
    .single();
  if (runErr || !runIns) {
    throw new Error(`Failed to create automation_run: ${runErr?.message ?? "no row"}`);
  }
  const runId = (runIns as { id: string }).id;

  const fanout = await fanoutActions(db, automation, runId);

  // Stamp cooldown and reset the deferral episode (a fire ends the dry spell).
  await db
    .from("automations")
    .update({ sensor_last_fired_at: new Date().toISOString(), defer_until: null, defer_count: 0, defer_started_at: null })
    .eq("id", automation.id);

  await db
    .from("automation_runs")
    .update({
      completed_at: new Date().toISOString(),
      devices_triggered: { notifications: fanout.notifications_queued, valves_queued: fanout.valves_queued },
    })
    .eq("id", runId);

  return { decision: "fire", reason: fireReason, aggregated_value: outcome.aggregated_value };
}

serve(async (_req: Request) => {
  try {
    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Sensor-threshold rules (continuous) PLUS any automation with a pending
    // deferral recheck (covers time-scheduled 'defer' automations too).
    const { data: automations, error: listErr } = await db
      .from("automations")
      .select(AUTOMATION_COLUMNS)
      .eq("is_active", true)
      .or("trigger_kind.eq.sensor_threshold,defer_until.not.is.null");

    if (listErr) throw listErr;

    let fired = 0;
    let skipped = 0;
    let errored = 0;

    for (const a of (automations ?? []) as unknown as AutomationRow[]) {
      try {
        const result = await processOne(db, a);
        if (result.decision === "fire") fired += 1;
        else skipped += 1;
      } catch (err) {
        errored += 1;
        await captureException(FN, err, { automation_id: a.id });
      }
    }

    log(FN, "complete", {
      considered: automations?.length ?? 0,
      fired,
      skipped,
      errored,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        considered: automations?.length ?? 0,
        fired,
        skipped,
        errored,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    logError(FN, "fatal", {
      message: err instanceof Error ? err.message : String(err),
    });
    await captureException(FN, err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
