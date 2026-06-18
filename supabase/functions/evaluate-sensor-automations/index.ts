/**
 * evaluate-sensor-automations — unified automation engine (Phase 1, 2026-06-17)
 *
 * Runs every 5 min via pg_cron. For each `is_active` automation:
 *   1. Lazily convert legacy (time_scheduled / sensor_threshold + weather/heat)
 *      rows into a `trigger_logic` condition tree on first sight.
 *   2. Build a context (sensor readings, local time, due blueprints, forecast)
 *      and evaluate the tree (`evaluateTree` from `_shared/conditionTree.ts`).
 *   3. Fire actions on the RISING edge (false→true) gated by a cooldown:
 *      notifications → `notifications`, valves → `automation_valve_queue`
 *      (drained by `run-automations`). Stamp `last_fired_at` + `condition_was_true`.
 *
 * Per-automation try/catch. Service role. `verify_jwt = false`.
 * (Kept the function name in Phase 1 to avoid re-pointing the cron; renamed in
 * the Phase 3 cleanup.)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { log, error as logError } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import type { SensorMetric, SensorObservation } from "../_shared/automationEvaluator.ts";
import { readForecast, type ForecastReading } from "../_shared/weatherForecast.ts";
import {
  evaluateTree, isWithinSchedule, evalSensorLeaf, evalWeatherLeaf, shouldFire,
  type ConditionNode, type LeafNode,
} from "../_shared/conditionTree.ts";
import { convertLegacyToTree, type LegacyAutomation } from "../_shared/conditionConvert.ts";

const FN = "evaluate-sensor-automations";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ActionRow {
  id: string;
  action_kind: "notification" | "valve_open" | "valve_close";
  notification_title: string | null;
  notification_body: string | null;
  target_device_id: string | null;
  valve_duration_seconds: number | null;
  ord: number;
}

function readMetric(metric: SensorMetric, data: Record<string, unknown> | null): number | null {
  if (!data || typeof data !== "object") return null;
  const key = metric === "soil_temp_c" ? "soil_temp" : metric; // soil_moisture / soil_ec map 1:1
  const v = (data as Record<string, unknown>)[key];
  return typeof v === "number" ? v : null;
}

function collectLeaves(node: ConditionNode, acc: LeafNode[] = []): LeafNode[] {
  if (node.kind === "group") for (const c of node.children) collectLeaves(c, acc);
  else acc.push(node);
  return acc;
}

function legacyFrom(a: Record<string, unknown>): LegacyAutomation {
  return {
    trigger_kind: (a.trigger_kind as LegacyAutomation["trigger_kind"]) ?? null,
    area_id: (a.area_id as string | null) ?? null,
    sensor_metric: (a.sensor_metric as SensorMetric | null) ?? null,
    sensor_comparator: (a.sensor_comparator as LegacyAutomation["sensor_comparator"]) ?? null,
    sensor_threshold_value: (a.sensor_threshold_value as number | null) ?? null,
    sensor_agg_mode: (a.sensor_agg_mode as LegacyAutomation["sensor_agg_mode"]) ?? null,
    scheduled_time: (a.scheduled_time as string | null) ?? null,
    weather_mode: (a.weather_mode as LegacyAutomation["weather_mode"]) ?? null,
    skip_if_rained: (a.skip_if_rained as boolean | null) ?? null,
    rain_threshold_mm: (a.rain_threshold_mm as number | null) ?? null,
    weather_min_probability: (a.weather_min_probability as number | null) ?? null,
    critical_threshold_value: (a.critical_threshold_value as number | null) ?? null,
    trigger_if_hot: (a.trigger_if_hot as boolean | null) ?? null,
    heat_threshold_c: (a.heat_threshold_c as number | null) ?? null,
  };
}

async function loadObsForSensorLeaf(
  db: ReturnType<typeof createClient>,
  leaf: Extract<LeafNode, { kind: "sensor" }>,
  automationAreaId: string | null,
): Promise<SensorObservation[]> {
  let deviceIds: string[] = [];
  if (leaf.sensorIds?.length) {
    deviceIds = leaf.sensorIds;
  } else {
    const areaId = leaf.areaId ?? automationAreaId;
    if (areaId) {
      const { data } = await db.from("devices").select("id")
        .eq("area_id", areaId).eq("device_type", "soil_sensor");
      deviceIds = (data ?? []).map((d: { id: string }) => d.id);
    }
  }
  const obs: SensorObservation[] = [];
  for (const id of deviceIds) {
    const { data: latest } = await db.from("device_readings").select("data")
      .eq("device_id", id).order("recorded_at", { ascending: false }).limit(1).maybeSingle();
    if (!latest) continue;
    const v = readMetric(leaf.metric, latest.data as Record<string, unknown>);
    if (v !== null) obs.push({ value: v });
  }
  return obs;
}

async function fanoutActions(
  db: ReturnType<typeof createClient>,
  automation: { id: string; home_id: string; name: string },
  runId: string,
): Promise<{ notifications_queued: number; valves_queued: number }> {
  const { data: actions } = await db.from("automation_actions")
    .select("id, action_kind, notification_title, notification_body, target_device_id, valve_duration_seconds, ord")
    .eq("automation_id", automation.id).order("ord", { ascending: true });
  if (!actions?.length) return { notifications_queued: 0, valves_queued: 0 };

  let notificationsQueued = 0, valvesQueued = 0;
  let memberIds: string[] = [];
  if ((actions as ActionRow[]).some((a) => a.action_kind === "notification")) {
    const { data: members } = await db.from("home_members").select("user_id").eq("home_id", automation.home_id);
    memberIds = (members ?? []).map((m: { user_id: string }) => m.user_id);
  }

  let valveStaggerSeconds = 0;
  for (const action of actions as ActionRow[]) {
    if (action.action_kind === "notification") {
      if (memberIds.length === 0) continue;
      const title = action.notification_title?.trim() || automation.name;
      const body = action.notification_body?.trim() || `Automation "${automation.name}" triggered.`;
      const rows = memberIds.map((uid) => ({
        user_id: uid, home_id: automation.home_id, title, body,
        type: "automation_sensor", data: { route: "/integrations", automationId: automation.id }, is_read: false,
      }));
      const { error } = await db.from("notifications").insert(rows);
      if (error) logError(FN, "notification_insert_failed", { automation_id: automation.id, message: error.message });
      else notificationsQueued += rows.length;
      continue;
    }
    if (action.action_kind === "valve_open" || action.action_kind === "valve_close") {
      if (!action.target_device_id) continue;
      const fireAt = new Date(Date.now() + valveStaggerSeconds * 1000).toISOString();
      const command = action.action_kind === "valve_open" ? "turn_on" : "turn_off";
      const { error } = await db.from("automation_valve_queue").insert({
        automation_run_id: runId, device_id: action.target_device_id, fire_at: fireAt, command,
      });
      if (error) logError(FN, "valve_queue_insert_failed", { automation_id: automation.id, message: error.message });
      else { valvesQueued += 1; valveStaggerSeconds += 5; }
    }
  }
  return { notifications_queued: notificationsQueued, valves_queued: valvesQueued };
}

async function processOne(
  db: ReturnType<typeof createClient>,
  automation: Record<string, unknown>,
  homeTz: string,
  now: Date,
): Promise<{ decision: string }> {
  const id = automation.id as string;
  const homeId = automation.home_id as string;
  const areaId = (automation.area_id as string | null) ?? null;

  // 1. Lazy convert legacy rows to a tree.
  let tree = automation.trigger_logic as ConditionNode | null;
  if (!tree) {
    const { data: abps } = await db.from("automation_blueprints").select("blueprint_id").eq("automation_id", id);
    const blueprintIds = (abps ?? []).map((b: { blueprint_id: string }) => b.blueprint_id);
    tree = convertLegacyToTree(legacyFrom(automation), blueprintIds);
    await db.from("automations").update({ trigger_logic: tree }).eq("id", id);
  }

  // Inactive automations are converted (above) but never fire.
  if (!automation.is_active) return { decision: "inactive" };

  const leaves = collectLeaves(tree);

  // 2. Build context.
  let forecast: ForecastReading | null = null;
  const weatherLeaves = leaves.filter((l): l is Extract<LeafNode, { kind: "weather" }> => l.kind === "weather");
  if (weatherLeaves.length > 0) {
    const windowHours = Math.max(12, ...weatherLeaves.map((l) => l.windowHours ?? 12));
    const heatC = Math.min(...weatherLeaves.map((l) => l.thresholdC ?? 30));
    forecast = await readForecast(db, homeId, now, windowHours, 60, heatC).catch(() => null);
  }

  const taskBpIds = [...new Set(leaves.filter((l) => l.kind === "task_due").flatMap((l) => (l as Extract<LeafNode, { kind: "task_due" }>).blueprintIds))];
  let dueSet = new Set<string>();
  if (taskBpIds.length > 0) {
    const today = now.toISOString().split("T")[0];
    const { data } = await db.from("tasks").select("blueprint_id")
      .in("blueprint_id", taskBpIds).eq("home_id", homeId).eq("due_date", today).in("status", ["Pending", "Postponed"]);
    dueSet = new Set((data ?? []).map((t: { blueprint_id: string }) => t.blueprint_id));
  }

  const obsByLeaf = new Map<LeafNode, SensorObservation[]>();
  for (const l of leaves) {
    if (l.kind === "sensor") obsByLeaf.set(l, await loadObsForSensorLeaf(db, l, areaId));
  }

  // 3. Evaluate.
  const leafEval = (leaf: LeafNode): boolean => {
    switch (leaf.kind) {
      case "sensor": return evalSensorLeaf(leaf, obsByLeaf.get(leaf) ?? []);
      case "time": return isWithinSchedule(now, leaf.schedule, leaf.tz ?? homeTz);
      case "task_due": return leaf.blueprintIds.some((b) => dueSet.has(b));
      case "weather": return forecast ? evalWeatherLeaf(leaf, forecast) : false;
    }
  };
  const nowTrue = evaluateTree(tree, leafEval);
  const wasTrue = !!automation.condition_was_true;
  const lastFired = automation.last_fired_at ? new Date(automation.last_fired_at as string) : null;
  const cooldown = Number(automation.sensor_cooldown_minutes ?? 60);

  if (!shouldFire(nowTrue, wasTrue, lastFired, cooldown, now)) {
    if (wasTrue !== nowTrue) await db.from("automations").update({ condition_was_true: nowTrue }).eq("id", id);
    return { decision: nowTrue ? "holding" : "idle" };
  }

  // 4. FIRE.
  const { data: runIns, error: runErr } = await db.from("automation_runs")
    .insert({ automation_id: id, home_id: homeId, triggered_by: "schedule", status: "success", devices_triggered: [] })
    .select("id").single();
  if (runErr || !runIns) throw new Error(`Failed to create automation_run: ${runErr?.message ?? "no row"}`);
  const runId = (runIns as { id: string }).id;

  const fanout = await fanoutActions(db, { id, home_id: homeId, name: automation.name as string }, runId);

  await db.from("automations").update({
    last_fired_at: now.toISOString(), sensor_last_fired_at: now.toISOString(), condition_was_true: true,
  }).eq("id", id);
  await db.from("automation_runs").update({
    completed_at: now.toISOString(),
    devices_triggered: { notifications: fanout.notifications_queued, valves_queued: fanout.valves_queued },
  }).eq("id", runId);

  return { decision: "fire" };
}

serve(async (_req: Request) => {
  try {
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const now = new Date();

    // Active automations (to evaluate + fire) plus any not-yet-converted legacy
    // row (active or inactive) so trigger_logic is backfilled universally.
    const { data: automations, error: listErr } = await db
      .from("automations").select("*").or("is_active.eq.true,trigger_logic.is.null");
    if (listErr) throw listErr;

    // Home timezones for time conditions.
    const homeIds = [...new Set((automations ?? []).map((a: Record<string, unknown>) => a.home_id as string))];
    const tzByHome = new Map<string, string>();
    if (homeIds.length > 0) {
      const { data: homes } = await db.from("homes").select("id, timezone").in("id", homeIds);
      for (const h of homes ?? []) tzByHome.set(h.id as string, (h.timezone as string | null) ?? "UTC");
    }

    let fired = 0, skipped = 0, errored = 0;
    for (const a of (automations ?? []) as Array<Record<string, unknown>>) {
      try {
        const r = await processOne(db, a, tzByHome.get(a.home_id as string) ?? "UTC", now);
        if (r.decision === "fire") fired += 1; else skipped += 1;
      } catch (err) {
        errored += 1;
        await captureException(FN, err, { automation_id: a.id });
      }
    }

    log(FN, "complete", { considered: automations?.length ?? 0, fired, skipped, errored });
    return new Response(JSON.stringify({ ok: true, considered: automations?.length ?? 0, fired, skipped, errored }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    logError(FN, "fatal", { message: err instanceof Error ? err.message : String(err) });
    await captureException(FN, err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
