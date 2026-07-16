/**
 * run-automations
 *
 * Hourly cron: fires water valves for automations scheduled in the current hour
 * whose controlling blueprints have a task due today.
 *
 * Manual trigger: POST { action: "manual", automationId: string }
 * with an Authorization header — bypasses time/date/weather checks.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptCredentials } from "../_shared/integrations/encrypt.ts";
import { fanoutActions } from "../_shared/fanoutActions.ts";
import { sendReceipt } from "../_shared/automationReceipt.ts";
import { drainValveQueue, finaliseRunSuccess } from "../_shared/valveQueue.ts";
import { buildControlPayload, resolveEffectiveDuration } from "../_shared/integrations/ewelinkDevice.ts";
import { regionToApiBase } from "../_shared/integrations/ewelinkAuth.ts";
import { controlValve } from "../_shared/integrations/valveControl.ts";
import type { DeviceRow } from "../_shared/integrations/contract.ts";
import { log, warn, error as logError } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import { readForecast } from "../_shared/weatherForecast.ts";

const FN = "run-automations";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const EWELINK_APP_ID = Deno.env.get("EWELINK_APP_ID") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface DeviceResult {
  device_id: string;
  name: string;
  success: boolean;
  queued?: boolean;
  error?: string;
}

interface TaskResult {
  blueprint_id: string;
  title: string;
  already_done: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function checkRain(
  db: ReturnType<typeof createClient>,
  homeId: string,
  thresholdMm: number,
): Promise<{ rained: boolean; mm: number }> {
  const today = new Date().toISOString().split("T")[0];
  const { data: snapshot } = await db
    .from("weather_snapshots")
    .select("data")
    .eq("home_id", homeId)
    .single();

  if (!snapshot?.data) return { rained: false, mm: 0 };

  const daily = (snapshot.data as Record<string, unknown>).daily as {
    time: string[];
    precipitation_sum: number[];
  } | undefined;

  if (!daily?.time || !daily?.precipitation_sum) return { rained: false, mm: 0 };

  const todayIdx = daily.time.indexOf(today);
  if (todayIdx === -1) return { rained: false, mm: 0 };

  const mm = daily.precipitation_sum[todayIdx] ?? 0;
  return { rained: mm >= thresholdMm, mm };
}

/**
 * Read today's forecast max temperature from the weather snapshot and
 * return whether it's at or above the supplied threshold. Used by
 * automations with `trigger_if_hot = true` to fire on hot days even
 * when no controlling task is due.
 */
async function checkHeat(
  db: ReturnType<typeof createClient>,
  homeId: string,
  thresholdC: number,
): Promise<{ hot: boolean; maxTempC: number }> {
  const today = new Date().toISOString().split("T")[0];
  const { data: snapshot } = await db
    .from("weather_snapshots")
    .select("data")
    .eq("home_id", homeId)
    .single();

  if (!snapshot?.data) return { hot: false, maxTempC: 0 };

  const daily = (snapshot.data as Record<string, unknown>).daily as {
    time: string[];
    temperature_2m_max: number[];
  } | undefined;

  if (!daily?.time || !daily?.temperature_2m_max) return { hot: false, maxTempC: 0 };

  const todayIdx = daily.time.indexOf(today);
  if (todayIdx === -1) return { hot: false, maxTempC: 0 };

  const maxTempC = daily.temperature_2m_max[todayIdx] ?? 0;
  return { hot: maxTempC >= thresholdC, maxTempC };
}

async function checkControllingTaskDue(
  db: ReturnType<typeof createClient>,
  automationId: string,
  today: string,
): Promise<boolean> {
  // Look at ALL linked blueprints regardless of role. If the user has any
  // blueprint attached to the automation (controlling or driven) and that
  // blueprint has a Pending or Postponed task for today, we fire. If the only
  // matching task has already been completed (e.g. by the rain auto-complete
  // rule) or skipped, we skip the run. If the automation has no linked
  // blueprints at all, we treat it as a pure time-based trigger and allow.
  const { data: abps } = await db
    .from("automation_blueprints")
    .select("blueprint_id")
    .eq("automation_id", automationId);

  if (!abps || abps.length === 0) return true;

  const bpIds = (abps as Array<Record<string, unknown>>).map(
    (r) => r.blueprint_id as string,
  );

  // Pending (or Postponed) task for today on any linked blueprint → fire.
  // Overdue tasks (due_date < today) deliberately don't count as triggers.
  const { data: actionable } = await db
    .from("tasks")
    .select("id")
    .in("blueprint_id", bpIds)
    .eq("due_date", today)
    .in("status", ["Pending", "Postponed"])
    .limit(1);

  if (actionable && (actionable as unknown[]).length > 0) return true;

  return false;
}

async function fireValve(
  apiBase: string,
  device: Record<string, unknown>,
  command: "turn_on" | "turn_off",
  durationSeconds: number,
  retryOnFailure: boolean,
  accessToken: string,
): Promise<boolean> {
  const meta = device.metadata as Record<string, unknown>;
  const { apiPath, payload } = buildControlPayload(
    meta,
    command,
    command === "turn_off" ? 0 : durationSeconds,
    device.external_device_id as string,
  );

  const attempt = async () => {
    // Timeout + catch: one hung coolkit.cc request must not stall the whole
    // automation run, and a non-JSON gateway error page counts as a failed
    // attempt instead of throwing past the caller.
    try {
      const res = await fetch(`${apiBase}${apiPath}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          "X-CK-Appid": EWELINK_APP_ID,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15_000),
      });
      const body = await res.json() as Record<string, unknown>;
      return body.error === 0;
    } catch {
      return false;
    }
  };

  const ok = await attempt();
  if (!ok && retryOnFailure) {
    await new Promise((r) => setTimeout(r, 10_000));
    return await attempt();
  }
  return ok;
}

async function fireValves(
  db: ReturnType<typeof createClient>,
  automationId: string,
  automation: Record<string, unknown>,
  runId: string,
  triggeredBy: "schedule" | "manual",
): Promise<DeviceResult[]> {
  const { data: adRows } = await db
    .from("automation_devices")
    .select("device_id")
    .eq("automation_id", automationId);

  if (!adRows || adRows.length === 0) return [];

  const deviceIds = (adRows as Array<Record<string, unknown>>).map((r) => r.device_id as string);

  const { data: devices } = await db
    .from("devices")
    .select("id, name, external_device_id, metadata, integration_id, provider, area_id")
    .in("id", deviceIds);

  if (!devices || devices.length === 0) return [];

  const durationSeconds = automation.duration_seconds as number;
  const sequential = automation.fire_valves_sequentially as boolean;
  const retry = automation.retry_on_failure as boolean;

  // Cache credentials per integration to avoid redundant decryption. Store the
  // full creds map (a control adapter reads its own keys) + region (eWeLink
  // fallback only).
  const credCache = new Map<string, { creds: Record<string, string>; region: string }>();

  const results: DeviceResult[] = [];

  for (let i = 0; i < (devices as Array<Record<string, unknown>>).length; i++) {
    const device = (devices as Array<Record<string, unknown>>)[i];
    const integrationId = device.integration_id as string;

    // Sequential: queue all but the first valve + their paired turn-offs
    if (sequential && i > 0) {
      const fireAt = new Date(Date.now() + i * durationSeconds * 1_000).toISOString();
      const turnOffAt = new Date(Date.now() + (i + 1) * durationSeconds * 1_000).toISOString();
      await db.from("automation_valve_queue").insert([
        { automation_run_id: runId, device_id: device.id as string, fire_at: fireAt, command: "turn_on", status: "pending" },
        { automation_run_id: runId, device_id: device.id as string, fire_at: turnOffAt, command: "turn_off", status: "pending" },
      ]);
      results.push({ device_id: device.id as string, name: device.name as string, success: true, queued: true });
      continue;
    }

    // Load + cache credentials
    let cred = credCache.get(integrationId);
    if (!cred) {
      const { data: integration } = await db
        .from("integrations")
        .select("credentials_encrypted, region")
        .eq("id", integrationId)
        .single();

      if (!integration) {
        results.push({ device_id: device.id as string, name: device.name as string, success: false, error: "Integration not found" });
        continue;
      }

      const creds = await decryptCredentials(
        (integration as Record<string, unknown>).credentials_encrypted as string,
      );
      cred = { creds, region: (integration as Record<string, unknown>).region as string };
      credCache.set(integrationId, cred);
    }

    // Provider dispatch: custom_http (+ future adapters) actuate through the
    // adapter contract; eWeLink falls back to the direct API call. Same shared
    // dispatcher the queue drain + dead-man's switch use (bug-audit-2026-07-10 #2).
    const deviceRow: DeviceRow = {
      id: device.id as string,
      external_device_id: (device.external_device_id as string) ?? "",
      name: (device.name as string) ?? "",
      device_type: "water_valve",
      metadata: (device.metadata as Record<string, unknown>) ?? {},
      area_id: (device.area_id as string | null) ?? null,
    };
    const result = await controlValve(
      (device.provider as string) ?? "",
      deviceRow,
      { kind: "valve_open", duration_seconds: durationSeconds },
      cred.creds,
      () => fireValve(regionToApiBase(cred!.region), device, "turn_on", durationSeconds, retry, (cred!.creds.accessToken as string) ?? ""),
    );
    const ok = result.ok;
    if (ok) {
      const turnOffAt = new Date(Date.now() + durationSeconds * 1_000).toISOString();
      await Promise.all([
        db.from("automation_valve_queue").insert({
          automation_run_id: runId,
          device_id: device.id as string,
          fire_at: turnOffAt,
          command: "turn_off",
          status: "pending",
        }),
        db.from("valve_events").insert({
          device_id: device.id as string,
          home_id: automation.home_id as string,
          automation_id: automationId,
          event_type: "turn_on",
          triggered_by: triggeredBy === "manual" ? "manual" : "scheduled",
          duration_seconds: durationSeconds,
          fired_at: new Date().toISOString(),
        }),
      ]);
    }
    results.push({
      device_id: device.id as string,
      name: device.name as string,
      success: ok,
      error: ok ? undefined : (result.error ?? "valve control failed"),
    });
  }

  return results;
}

async function completeTasks(
  db: ReturnType<typeof createClient>,
  automationId: string,
  homeId: string,
  today: string,
  isManual = false,
): Promise<TaskResult[]> {
  const { data: abps } = await db
    .from("automation_blueprints")
    .select("blueprint_id, role")
    .eq("automation_id", automationId);

  if (!abps || abps.length === 0) return [];

  const results: TaskResult[] = [];

  // ── Manual run: only complete tasks that already exist for today ─────────
  // If none exist, insert one generic record instead of materialising phantoms.
  if (isManual) {
    const bpIds = (abps as Array<Record<string, unknown>>).map((r) => r.blueprint_id as string);

    const { data: existingTasks } = await db
      .from("tasks")
      .select("id, status, blueprint_id, title")
      .in("blueprint_id", bpIds)
      .lte("due_date", today)
      .not("status", "in", "(\"Completed\",\"Skipped\")");

    if (!existingTasks || (existingTasks as unknown[]).length === 0) {
      // No scheduled tasks due today — insert a single generic marker task
      const { data: autoRow } = await db
        .from("automations")
        .select("name")
        .eq("id", automationId)
        .single();
      const autoName = (autoRow as Record<string, unknown>)?.name as string ?? "Automation";

      await db.from("tasks").insert({
        home_id: homeId,
        blueprint_id: null,
        title: `${autoName} ran`,
        description: "Your automation ran manually. No scheduled watering tasks were due today.",
        type: "Watering",
        due_date: today,
        status: "Completed",
        completed_at: new Date().toISOString(),
        auto_completed_reason: "automation",
      });
      return [{ blueprint_id: "generic", title: `${autoName} ran`, already_done: false }];
    }

    // Complete only the tasks that exist for today
    for (const task of existingTasks as Array<Record<string, unknown>>) {
      const blueprintId = task.blueprint_id as string;
      const title = task.title as string ?? "";
      if (["Completed", "Skipped"].includes(task.status as string)) {
        results.push({ blueprint_id: blueprintId, title, already_done: true });
        continue;
      }
      await db.from("tasks")
        .update({
          status: "Completed",
          completed_at: new Date().toISOString(),
          auto_completed_reason: "automation",
        })
        .eq("id", task.id as string);
      results.push({ blueprint_id: blueprintId, title, already_done: false });
    }
    return results;
  }

  // ── Scheduled run: complete every Pending/Postponed task (today OR overdue)
  //                  for any linked blueprint. NEVER insert a new row — that's
  //                  generate-tasks' job, not ours. If no rows match we simply
  //                  return an empty list and the run status will reflect that.
  const bpIds = (abps as Array<Record<string, unknown>>).map((r) => r.blueprint_id as string);

  const { data: existingTasks } = await db
    .from("tasks")
    .select("id, status, blueprint_id, title")
    .in("blueprint_id", bpIds)
    .lte("due_date", today)
    .not("status", "in", "(\"Completed\",\"Skipped\")");

  for (const t of (existingTasks ?? []) as Array<Record<string, unknown>>) {
    await db.from("tasks")
      .update({
        status: "Completed",
        completed_at: new Date().toISOString(),
        auto_completed_reason: "automation",
      })
      .eq("id", t.id as string);
    results.push({
      blueprint_id: t.blueprint_id as string,
      title: (t.title as string) ?? "",
      already_done: false,
    });
  }

  return results;
}


// ── Main automation runner ────────────────────────────────────────────────────

async function runAutomation(
  db: ReturnType<typeof createClient>,
  automation: Record<string, unknown>,
  triggeredBy: "schedule" | "manual",
): Promise<{ status: string; runId?: string }> {
  const now = new Date();
  const automationId = automation.id as string;
  const homeId = automation.home_id as string;
  const automationName = automation.name as string;

  log(FN, "automation_start", { automationId, homeId, triggeredBy });

  // Manual "Run now" deliberately bypasses the trigger conditions, active
  // window, cooldown and run-limit — it's an explicit user override. It runs
  // the SAME action fan-out as an automatic fire (shared `fanoutActions`):
  // notification / valve_open / complete_task from `automation_actions`. The
  // legacy `automation_devices` path is retired — it was empty for unified-
  // builder automations, so manual runs reported success while doing nothing.

  const { data: runRow, error: runErr } = await db
    .from("automation_runs")
    .insert({ automation_id: automationId, home_id: homeId, triggered_by: triggeredBy, status: "pending" })
    .select("id")
    .single();

  if (runErr || !runRow) throw new Error(`Failed to create run: ${runErr?.message}`);
  const runId = (runRow as Record<string, unknown>).id as string;

  // Execute the configured actions, then drain the valve queue right away so a
  // valve fires on the click instead of waiting for the next cron tick.
  const fanout = await fanoutActions(db, { id: automationId, home_id: homeId, name: automationName }, runId, now);
  await drainValveQueue(db).catch((e) => warn(FN, "manual_drain_error", { error: e.message }));

  // Status-guarded flip (pending → success): the inline drain above may have
  // already downgraded the run via markRunValveFailure — an unconditional
  // success write here was clobbering that downgrade, so a failed manual
  // valve run still read "Success" in history (review 2026-07-16).
  const succeeded = await finaliseRunSuccess(db, runId);
  let finalStatus = "success";
  if (!succeeded) {
    const { data: cur } = await db.from("automation_runs").select("status").eq("id", runId).single();
    finalStatus = ((cur as { status?: string } | null)?.status) ?? "failed";
  }

  // The drain already sends the corrective "failed" receipt for a failed
  // turn_on — only send "ran" when the run actually succeeded, otherwise the
  // user gets a "failed" push followed by a contradictory "ran".
  const membersAlerted = succeeded
    ? await sendReceipt(
        db, { id: automationId, home_id: homeId, name: automationName }, "ran",
        { valvesFired: fanout.valves_queued, tasksCompleted: fanout.tasks_completed.length },
      )
    : 0;

  await db.from("automation_runs").update({
    devices_triggered: { members_alerted: Math.max(membersAlerted, fanout.notifications_sent), valves_queued: fanout.valves_queued },
    tasks_completed: fanout.tasks_completed,
    completed_at: now.toISOString(),
  }).eq("id", runId);

  log(FN, "automation_complete", { automationId, runId, status: finalStatus, valves: fanout.valves_queued, membersAlerted, tasks: fanout.tasks_completed.length });
  return { status: finalStatus, runId };
}

// ── Entrypoint ────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const db = createClient(SUPABASE_URL, SERVICE_KEY);

    let body: { action?: string; automationId?: string } = {};
    try { body = await req.json(); } catch { /* cron sends no body */ }
    const action = body.action ?? "cron";

    // ── Manual trigger ──────────────────────────────────────────────────────
    if (action === "manual") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return json({ error: "Missing authorization" }, 401);

      const userDb = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: authErr } = await userDb.auth.getUser();
      if (authErr || !user) return json({ error: "Unauthorized" }, 401);

      if (!body.automationId) return json({ error: "automationId required" }, 400);

      const { data: automation } = await db
        .from("automations")
        .select("*")
        .eq("id", body.automationId)
        .single();

      if (!automation) return json({ error: "Automation not found" }, 404);

      const { data: membership } = await db
        .from("home_members")
        .select("user_id")
        .eq("home_id", (automation as Record<string, unknown>).home_id as string)
        .eq("user_id", user.id)
        .single();

      if (!membership) return json({ error: "Forbidden" }, 403);

      const result = await runAutomation(db, automation as Record<string, unknown>, "manual");
      return json({ success: true, ...result });
    }

    // ── Cron sweep ──────────────────────────────────────────────────────────
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const currentHour = now.getUTCHours();

    log(FN, "cron_start", { today, currentHour });

    // Drain any queued sequential valves first.
    await drainValveQueue(db).catch((e) =>
      warn(FN, "queue_drain_error", { error: e.message })
    );

    // NOTE (2026-06-17, Phase 1 unified automations): scheduled firing is
    // retired. The unified condition engine (`evaluate-sensor-automations`,
    // every 5 min) now owns ALL triggers — including time-scheduled — via each
    // automation's `trigger_logic` tree. This cron keeps only the valve-queue
    // drain (above) and the manual "run now" path (handled earlier).
    return json({ success: true, drained: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logError(FN, "fatal_error", { error: msg });
    await captureException(FN, err);
    return json({ error: "Internal server error" }, 500);
  }
});
