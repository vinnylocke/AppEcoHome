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
  type SensorMetric,
  type Comparator,
  type AggMode,
  type SensorObservation,
} from "../_shared/automationEvaluator.ts";

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
}

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
): Promise<SensorObservation[]> {
  const { data: linked } = await db
    .from("automation_sensors")
    .select("sensor_device_id")
    .eq("automation_id", automationId);
  if (!linked?.length) return [];

  const observations: SensorObservation[] = [];
  for (const row of linked as Array<{ sensor_device_id: string }>) {
    const { data: latest } = await db
      .from("device_readings")
      .select("data")
      .eq("device_id", row.sensor_device_id)
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
): Promise<{ decision: string; aggregated_value?: number }> {
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

  const observations = await loadSensorObservations(db, automation.id, automation.sensor_metric);
  const outcome = evaluateAutomation(
    {
      metric: automation.sensor_metric,
      comparator: automation.sensor_comparator,
      threshold: Number(automation.sensor_threshold_value),
      hysteresis: Number(automation.sensor_hysteresis),
      cooldown_minutes: Number(automation.sensor_cooldown_minutes),
      agg_mode: automation.sensor_agg_mode,
    },
    observations,
    automation.sensor_last_fired_at ? new Date(automation.sensor_last_fired_at) : null,
    new Date(),
  );

  if (outcome.decision === "skip") {
    return { decision: outcome.reason };
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

  await db
    .from("automations")
    .update({ sensor_last_fired_at: new Date().toISOString() })
    .eq("id", automation.id);

  await db
    .from("automation_runs")
    .update({
      completed_at: new Date().toISOString(),
      devices_triggered: { notifications: fanout.notifications_queued, valves_queued: fanout.valves_queued },
    })
    .eq("id", runId);

  return { decision: "fire", aggregated_value: outcome.aggregated_value };
}

serve(async (_req: Request) => {
  try {
    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: automations, error: listErr } = await db
      .from("automations")
      .select(
        "id, home_id, name, area_id, sensor_metric, sensor_comparator, sensor_threshold_value, sensor_hysteresis, sensor_cooldown_minutes, sensor_agg_mode, sensor_last_fired_at",
      )
      .eq("is_active", true)
      .eq("trigger_kind", "sensor_threshold");

    if (listErr) throw listErr;

    let fired = 0;
    let skipped = 0;
    let errored = 0;

    for (const a of (automations ?? []) as AutomationRow[]) {
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
