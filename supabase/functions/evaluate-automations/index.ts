/**
 * evaluate-automations — the unified automation engine (2026-06-18).
 *
 * Runs every 5 min via pg_cron. For each `is_active` automation:
 *   1. Read its `trigger_logic` condition tree.
 *   2. Build a context (sensor readings, local time, due blueprints, forecast)
 *      and evaluate the tree (`evaluateTree` from `_shared/conditionTree.ts`).
 *   3. Fire actions on the RISING edge (false→true) gated by a cooldown:
 *      notifications → `notifications`, valves → `automation_valve_queue`
 *      (drained by `run-automations`). Stamp `last_fired_at` + `condition_was_true`.
 *
 * Per-automation try/catch. Service role. `verify_jwt = false`.
 * (Formerly `evaluate-sensor-automations`; renamed in the Phase 3 cleanup once
 * it became the single engine for all trigger kinds.)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { log, error as logError } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import type { SensorMetric, SensorObservation } from "../_shared/automationEvaluator.ts";
import { readForecast, type ForecastReading } from "../_shared/weatherForecast.ts";
import {
  evaluateTree, isWithinSchedule, isWithinDateRange, evalSensorLeaf, evalWeatherLeaf, shouldFire,
  summariseSatisfied,
  type ConditionNode, type LeafNode,
} from "../_shared/conditionTree.ts";
import { isRateLimited, windowStartIso, FIRED_STATUSES, shouldCollapseRateLimitSkip, nextEligibleAt } from "../_shared/runLimit.ts";
import { defaultWindowOpen, type DefaultWindow } from "../_shared/automationWindow.ts";
import { treeHasTimeTrigger, treeAffectedByDevice } from "../_shared/automationCandidates.ts";
import { fanoutActions } from "../_shared/fanoutActions.ts";
import { applyEdgeClaimFilter } from "../_shared/automationClaim.ts";

const FN = "evaluate-automations";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

async function processOne(
  db: ReturnType<typeof createClient>,
  automation: Record<string, unknown>,
  homeTz: string,
  now: Date,
  defaultWindow: DefaultWindow | null,
): Promise<{ decision: string }> {
  const id = automation.id as string;
  const homeId = automation.home_id as string;
  const areaId = (automation.area_id as string | null) ?? null;

  const tree = automation.trigger_logic as ConditionNode | null;
  if (!tree) { log(FN, "skip_no_logic", { id }); return { decision: "no_logic" }; }

  // Rate-limit mute: once over the run-limit we store the exact next-eligible
  // time and skip evaluation entirely until then — no condition eval, no count
  // query, no skip-row writes. This is what stops the event-driven flood. A DB
  // trigger clears `rate_limited_until` whenever the automation is amended, so
  // edits re-check immediately.
  const rlUntil = automation.rate_limited_until ? new Date(automation.rate_limited_until as string) : null;
  if (rlUntil && now < rlUntil) { return { decision: "rate_limited_muted" }; }

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
      case "date_range": return isWithinDateRange(now, leaf.from, leaf.to, homeTz);
      case "task_due": return leaf.blueprintIds.some((b) => dueSet.has(b));
      case "weather": return forecast ? evalWeatherLeaf(leaf, forecast) : false;
    }
  };
  const nowTrue = evaluateTree(tree, leafEval);
  const wasTrue = !!automation.condition_was_true;
  const lastFired = automation.last_fired_at ? new Date(automation.last_fired_at as string) : null;
  const cooldown = Number(automation.sensor_cooldown_minutes ?? 60);

  const fire = shouldFire(nowTrue, wasTrue, lastFired, cooldown, now);
  // Home default active-hours window — only gates automations with no time/date
  // condition of their own. Gates FIRING, not the condition_was_true bookkeeping
  // (so the rising edge isn't lost across the window boundary).
  const windowOpen = defaultWindowOpen(tree, defaultWindow, now, homeTz);
  if (!fire || !windowOpen) {
    if (wasTrue !== nowTrue) await db.from("automations").update({ condition_was_true: nowTrue }).eq("id", id);
    return { decision: !nowTrue ? "idle" : !windowOpen ? "outside_window" : "holding" };
  }

  // 4. Run-limit gate (#7) — fetch the in-window fires (newest-first, capped at
  // the limit) so we can both gate AND compute the exact next-eligible time.
  const runLimitCount = (automation.run_limit_count as number | null) ?? null;
  if (runLimitCount != null && runLimitCount > 0) {
    const windowHours = Number(automation.run_limit_window_hours ?? 24);
    const { data: firedRows } = await db.from("automation_runs")
      .select("triggered_at")
      .eq("automation_id", id)
      .gte("triggered_at", windowStartIso(now, windowHours))
      .in("status", FIRED_STATUSES as unknown as string[])
      .order("triggered_at", { ascending: false })
      .limit(runLimitCount);
    const firedDesc = (firedRows ?? []).map((r) => r.triggered_at as string);
    if (isRateLimited(firedDesc.length, runLimitCount)) {
      // Over the limit: store the exact next-eligible time so the mute gate
      // above short-circuits every tick until then (no flood, no counter), and
      // write ONE run-history row recording when it'll next try. We only reach
      // here when not muted — i.e. first time over the limit, or a boundary
      // recheck — so this writes/updates the single skip row at most rarely.
      const nextIso = nextEligibleAt(firedDesc, runLimitCount, windowHours);
      await db.from("automations").update({ rate_limited_until: nextIso }).eq("id", id);

      const reason = { summary: "Run limit reached", next_eligible_at: nextIso };
      const { data: lastRun } = await db.from("automation_runs")
        .select("id, status")
        .eq("automation_id", id)
        .order("triggered_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (shouldCollapseRateLimitSkip(lastRun?.status as string | undefined)) {
        const { error: updErr } = await db.from("automation_runs").update({
          triggered_at: now.toISOString(), completed_at: now.toISOString(), trigger_reason: reason,
        }).eq("id", (lastRun as { id: string }).id);
        if (updErr) logError(FN, "skip_run_update_failed", { id, message: updErr.message });
      } else {
        const { error: skipErr } = await db.from("automation_runs").insert({
          automation_id: id, home_id: homeId, triggered_by: "schedule",
          status: "skipped_rate_limited",
          devices_triggered: { notifications: 0, valves_queued: 0 },
          trigger_reason: reason,
          completed_at: now.toISOString(),
        });
        // Don't let a logging-row failure hide a rate-limited skip ever again.
        if (skipErr) logError(FN, "skip_run_insert_failed", { id, status: "skipped_rate_limited", message: skipErr.message });
      }
      log(FN, "rate_limited", { id, fired: firedDesc.length, limit: runLimitCount, next: nextIso });
      return { decision: "rate_limited" };
    }
  }

  // 5. CLAIM the firing edge atomically, BEFORE any side effect. The 5-min
  //    (time) and 15-min (all) crons coincide every :15, and the sensor event
  //    path can overlap a sweep — so two invocations can both reach here on the
  //    same rising edge. A conditional update on `last_fired_at` lets only one
  //    win: the loser's WHERE no longer matches (Postgres re-checks the
  //    predicate after the winner commits) → 0 rows → it bails WITHOUT firing,
  //    so we never insert a second run / send a duplicate notification.
  const claim = applyEdgeClaimFilter(
    db.from("automations")
      .update({ last_fired_at: now.toISOString(), condition_was_true: true, rate_limited_until: null })
      .eq("id", id),
    (automation.last_fired_at as string | null) ?? null,
  );
  const { data: claimed, error: claimErr } = await claim.select("id");
  if (claimErr) throw new Error(`Failed to claim firing edge: ${claimErr.message}`);
  if (!claimed || (claimed as unknown[]).length === 0) {
    log(FN, "raced", { id });
    return { decision: "raced" };
  }

  // 6. FIRE (we won the claim).
  const reason = summariseSatisfied(tree, leafEval); // { summary, matched } — why it ran (#5)
  const { data: runIns, error: runErr } = await db.from("automation_runs")
    .insert({
      automation_id: id, home_id: homeId, triggered_by: "schedule", status: "success",
      devices_triggered: [], trigger_reason: reason,
    })
    .select("id").single();
  if (runErr || !runIns) throw new Error(`Failed to create automation_run: ${runErr?.message ?? "no row"}`);
  const runId = (runIns as { id: string }).id;

  const fanout = await fanoutActions(db, { id, home_id: homeId, name: automation.name as string }, runId, now);

  await db.from("automation_runs").update({
    completed_at: now.toISOString(),
    devices_triggered: { notifications: fanout.notifications_queued, valves_queued: fanout.valves_queued },
    tasks_completed: fanout.tasks_completed,
  }).eq("id", runId);

  return { decision: "fire" };
}

serve(async (req: Request) => {
  try {
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const now = new Date();

    // Scope (hybrid engine):
    //   { deviceId }      → event path: only automations watching that device.
    //   { scope: "time" } → 5-min cron: only clock-driven (time/date/weather).
    //   { scope: "all" }  → 15-min safety sweep + back-compat: everything.
    const body = await req.json().catch(() => ({})) as { scope?: string; deviceId?: string };
    const deviceId = typeof body.deviceId === "string" ? body.deviceId : null;
    const scope: "event" | "time" | "all" = deviceId ? "event" : body.scope === "time" ? "time" : "all";

    const { data: allActive, error: listErr } = await db
      .from("automations").select("*").eq("is_active", true);
    if (listErr) throw listErr;

    // ── Select the candidate set for this scope ──────────────────────────────
    let automations = (allActive ?? []) as Array<Record<string, unknown>>;
    if (scope === "time") {
      automations = automations.filter((a) => {
        const t = a.trigger_logic as ConditionNode | null;
        return t ? treeHasTimeTrigger(t) : false;
      });
    } else if (scope === "event" && deviceId) {
      // Resolve the device's area, then keep automations whose sensor leaves
      // watch this device (explicit id) or its area.
      const { data: dev } = await db.from("devices").select("area_id").eq("id", deviceId).maybeSingle();
      const deviceAreaId = (dev?.area_id as string | null) ?? null;
      automations = automations.filter((a) => {
        const t = a.trigger_logic as ConditionNode | null;
        return t ? treeAffectedByDevice(t, deviceId, deviceAreaId, (a.area_id as string | null) ?? null) : false;
      });
    }

    // Home timezones + default automation window for time/window conditions.
    const homeIds = [...new Set(automations.map((a: Record<string, unknown>) => a.home_id as string))];
    const tzByHome = new Map<string, string>();
    const windowByHome = new Map<string, DefaultWindow>();
    if (homeIds.length > 0) {
      const { data: homes } = await db.from("homes")
        .select("id, timezone, automation_window_start, automation_window_end, automation_window_enabled")
        .in("id", homeIds);
      for (const h of homes ?? []) {
        tzByHome.set(h.id as string, (h.timezone as string | null) ?? "UTC");
        windowByHome.set(h.id as string, {
          start: (h.automation_window_start as string | null) ?? "08:00",
          end: (h.automation_window_end as string | null) ?? "20:00",
          enabled: h.automation_window_enabled !== false,
        });
      }
    }

    let fired = 0, skipped = 0, errored = 0;
    for (const a of automations) {
      try {
        const homeId = a.home_id as string;
        const r = await processOne(db, a, tzByHome.get(homeId) ?? "UTC", now, windowByHome.get(homeId) ?? null);
        if (r.decision === "fire") fired += 1; else skipped += 1;
      } catch (err) {
        errored += 1;
        await captureException(FN, err, { automation_id: a.id });
      }
    }

    log(FN, "complete", { scope, deviceId, considered: automations.length, fired, skipped, errored });
    return new Response(JSON.stringify({ ok: true, scope, considered: automations.length, fired, skipped, errored }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    logError(FN, "fatal", { message: err instanceof Error ? err.message : String(err) });
    await captureException(FN, err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
