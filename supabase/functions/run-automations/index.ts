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
import { buildControlPayload, resolveEffectiveDuration } from "../_shared/integrations/ewelinkDevice.ts";
import { regionToApiBase } from "../_shared/integrations/ewelinkAuth.ts";
import { log, warn, error as logError } from "../_shared/logger.ts";

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
): Promise<boolean> {
  const today = new Date().toISOString().split("T")[0];
  const { data: snapshot } = await db
    .from("weather_snapshots")
    .select("data")
    .eq("home_id", homeId)
    .single();

  if (!snapshot?.data) return false;

  const daily = (snapshot.data as Record<string, unknown>).daily as {
    time: string[];
    precipitation_sum: number[];
  } | undefined;

  if (!daily?.time || !daily?.precipitation_sum) return false;

  const todayIdx = daily.time.indexOf(today);
  if (todayIdx === -1) return false;

  const mm = daily.precipitation_sum[todayIdx] ?? 0;
  return mm >= thresholdMm;
}

async function checkControllingTaskDue(
  db: ReturnType<typeof createClient>,
  automationId: string,
  today: string,
): Promise<boolean> {
  const { data: abps } = await db
    .from("automation_blueprints")
    .select("blueprint_id")
    .eq("automation_id", automationId)
    .eq("role", "controlling");

  if (!abps || abps.length === 0) return false;

  const bpIds = abps.map((r: Record<string, unknown>) => r.blueprint_id as string);

  const { data: blueprints } = await db
    .from("task_blueprints")
    .select("id, start_date, end_date, frequency_days, is_recurring")
    .in("id", bpIds);

  if (!blueprints || blueprints.length === 0) return false;

  const todayDate = new Date(today);

  for (const bp of blueprints as Array<Record<string, unknown>>) {
    if (!bp.is_recurring || !bp.start_date) continue;

    const startDate = new Date(bp.start_date as string);
    if (todayDate < startDate) continue;
    if (bp.end_date && todayDate > new Date(bp.end_date as string)) continue;

    const daysDiff = Math.round(
      (todayDate.getTime() - startDate.getTime()) / 86_400_000,
    );
    if (daysDiff % (bp.frequency_days as number) !== 0) continue;

    // Check if already completed/skipped today
    const { data: existing } = await db
      .from("tasks")
      .select("id, status")
      .eq("blueprint_id", bp.id as string)
      .eq("due_date", today)
      .maybeSingle();

    if (existing && (existing as Record<string, unknown>).status !== "Pending") continue;

    return true;
  }

  return false;
}

async function fireValve(
  apiBase: string,
  device: Record<string, unknown>,
  durationSeconds: number,
  retryOnFailure: boolean,
  accessToken: string,
): Promise<boolean> {
  const meta = device.metadata as Record<string, unknown>;
  const { apiPath, payload } = buildControlPayload(
    meta,
    "turn_on",
    durationSeconds,
    device.external_device_id as string,
  );

  const attempt = async () => {
    const res = await fetch(`${apiBase}${apiPath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        "X-CK-Appid": EWELINK_APP_ID,
      },
      body: JSON.stringify(payload),
    });
    const body = await res.json() as Record<string, unknown>;
    return body.error === 0;
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
): Promise<DeviceResult[]> {
  const { data: adRows } = await db
    .from("automation_devices")
    .select("device_id")
    .eq("automation_id", automationId);

  if (!adRows || adRows.length === 0) return [];

  const deviceIds = (adRows as Array<Record<string, unknown>>).map((r) => r.device_id as string);

  const { data: devices } = await db
    .from("devices")
    .select("id, name, external_device_id, metadata, integration_id, provider")
    .in("id", deviceIds);

  if (!devices || devices.length === 0) return [];

  const durationSeconds = automation.duration_seconds as number;
  const sequential = automation.fire_valves_sequentially as boolean;
  const retry = automation.retry_on_failure as boolean;

  // Cache credentials per integration to avoid redundant decryption
  const credCache = new Map<string, { accessToken: string; apiBase: string }>();

  const results: DeviceResult[] = [];

  for (let i = 0; i < (devices as Array<Record<string, unknown>>).length; i++) {
    const device = (devices as Array<Record<string, unknown>>)[i];
    const integrationId = device.integration_id as string;

    // Sequential: queue all but the first valve
    if (sequential && i > 0) {
      const fireAt = new Date(Date.now() + i * durationSeconds * 1_000).toISOString();
      await db.from("automation_valve_queue").insert({
        automation_run_id: runId,
        device_id: device.id as string,
        fire_at: fireAt,
        status: "pending",
      });
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

      const { accessToken } = await decryptCredentials(
        (integration as Record<string, unknown>).credentials_encrypted as string,
      );
      const apiBase = regionToApiBase((integration as Record<string, unknown>).region as string);
      cred = { accessToken, apiBase };
      credCache.set(integrationId, cred);
    }

    const ok = await fireValve(cred.apiBase, device, durationSeconds, retry, cred.accessToken);
    results.push({
      device_id: device.id as string,
      name: device.name as string,
      success: ok,
      error: ok ? undefined : "eWeLink control failed",
    });
  }

  return results;
}

async function completeTasks(
  db: ReturnType<typeof createClient>,
  automationId: string,
  homeId: string,
  today: string,
): Promise<TaskResult[]> {
  const { data: abps } = await db
    .from("automation_blueprints")
    .select("blueprint_id, role")
    .eq("automation_id", automationId);

  if (!abps || abps.length === 0) return [];

  const results: TaskResult[] = [];

  for (const abp of abps as Array<Record<string, unknown>>) {
    const blueprintId = abp.blueprint_id as string;

    const { data: bp } = await db
      .from("task_blueprints")
      .select("id, home_id, title, description, task_type, location_id, area_id, inventory_item_ids")
      .eq("id", blueprintId)
      .single();

    if (!bp) continue;

    const blueprint = bp as Record<string, unknown>;

    // Check if task is already done/skipped today
    const { data: existing } = await db
      .from("tasks")
      .select("id, status")
      .eq("blueprint_id", blueprintId)
      .eq("due_date", today)
      .maybeSingle();

    if (existing) {
      const existingTask = existing as Record<string, unknown>;
      if (existingTask.status !== "Pending") {
        results.push({ blueprint_id: blueprintId, title: blueprint.title as string, already_done: true });
        continue;
      }
      // Update existing Pending task
      await db.from("tasks")
        .update({
          status: "Completed",
          completed_at: new Date().toISOString(),
          auto_completed_reason: "automation",
        })
        .eq("id", existingTask.id as string);
    } else {
      // Materialise ghost task as completed
      const { error: insertErr } = await db.from("tasks").insert({
        home_id: blueprint.home_id ?? homeId,
        blueprint_id: blueprintId,
        title: blueprint.title,
        description: blueprint.description ?? null,
        type: blueprint.task_type,
        due_date: today,
        status: "Completed",
        location_id: blueprint.location_id ?? null,
        area_id: blueprint.area_id ?? null,
        inventory_item_ids: blueprint.inventory_item_ids ?? [],
        completed_at: new Date().toISOString(),
        auto_completed_reason: "automation",
      });

      if (insertErr) {
        // Race with generate_daily_tasks — update instead
        if (insertErr.code === "23505") {
          await db.from("tasks")
            .update({
              status: "Completed",
              completed_at: new Date().toISOString(),
              auto_completed_reason: "automation",
            })
            .eq("blueprint_id", blueprintId)
            .eq("due_date", today)
            .eq("status", "Pending");
        } else {
          warn(FN, "task_complete_error", { blueprintId, error: insertErr.message });
          continue;
        }
      }
    }

    results.push({ blueprint_id: blueprintId, title: blueprint.title as string, already_done: false });
  }

  return results;
}

async function sendNotification(
  db: ReturnType<typeof createClient>,
  homeId: string,
  automationName: string,
  status: string,
  durationSeconds: number,
  automationId: string,
): Promise<void> {
  const isSuccess = status === "success" || status === "partial";
  const durationMins = Math.round(durationSeconds / 60);

  const title = isSuccess
    ? `${automationName} watered your garden`
    : `${automationName} failed to water`;
  const body = isSuccess
    ? `Valves ran for ${durationMins} min${status === "partial" ? " (some devices failed)" : " successfully"}.`
    : "Check your device connections and try again.";

  const { data: members } = await db
    .from("home_members")
    .select("user_id")
    .eq("home_id", homeId);

  if (!members || members.length === 0) return;

  await db.from("notifications").insert(
    (members as Array<Record<string, unknown>>).map((m) => ({
      user_id: m.user_id,
      home_id: homeId,
      title,
      body,
      type: "automation_run",
      data: { route: "/integrations", automationId },
      is_read: false,
    })),
  );
}

async function drainValveQueue(db: ReturnType<typeof createClient>): Promise<void> {
  const now = new Date().toISOString();

  const { data: pending } = await db
    .from("automation_valve_queue")
    .select("id, device_id, automation_run_id")
    .eq("status", "pending")
    .lte("fire_at", now);

  if (!pending || (pending as unknown[]).length === 0) return;

  for (const entry of pending as Array<Record<string, unknown>>) {
    const deviceId = entry.device_id as string;

    // Load device + automation settings via the run
    const { data: runRow } = await db
      .from("automation_runs")
      .select("automation_id")
      .eq("id", entry.automation_run_id as string)
      .single();

    if (!runRow) continue;

    const { data: automation } = await db
      .from("automations")
      .select("duration_seconds, retry_on_failure")
      .eq("id", (runRow as Record<string, unknown>).automation_id as string)
      .single();

    const { data: device } = await db
      .from("devices")
      .select("id, name, external_device_id, metadata, integration_id")
      .eq("id", deviceId)
      .single();

    if (!automation || !device) {
      await db.from("automation_valve_queue")
        .update({ status: "failed", error_message: "Device or automation not found" })
        .eq("id", entry.id as string);
      continue;
    }

    const auto = automation as Record<string, unknown>;
    const dev = device as Record<string, unknown>;

    const { data: integration } = await db
      .from("integrations")
      .select("credentials_encrypted, region")
      .eq("id", dev.integration_id as string)
      .single();

    if (!integration) {
      await db.from("automation_valve_queue")
        .update({ status: "failed", error_message: "Integration not found" })
        .eq("id", entry.id as string);
      continue;
    }

    const integ = integration as Record<string, unknown>;
    const { accessToken } = await decryptCredentials(integ.credentials_encrypted as string);
    const apiBase = regionToApiBase(integ.region as string);

    const ok = await fireValve(
      apiBase,
      dev,
      auto.duration_seconds as number,
      auto.retry_on_failure as boolean,
      accessToken,
    );

    await db.from("automation_valve_queue").update({
      status: ok ? "fired" : "failed",
      fired_at: ok ? now : null,
      error_message: ok ? null : "eWeLink control failed",
    }).eq("id", entry.id as string);

    log(FN, "queue_drain", { entryId: entry.id, deviceId, success: ok });
  }
}

// ── Main automation runner ────────────────────────────────────────────────────

async function runAutomation(
  db: ReturnType<typeof createClient>,
  automation: Record<string, unknown>,
  triggeredBy: "schedule" | "manual",
): Promise<{ status: string; runId?: string }> {
  const today = new Date().toISOString().split("T")[0];
  const automationId = automation.id as string;
  const homeId = automation.home_id as string;
  const automationName = automation.name as string;

  log(FN, "automation_start", { automationId, homeId, triggeredBy });

  // ── Weather check (scheduled runs only) ──────────────────────────────────
  if (triggeredBy === "schedule" && automation.skip_if_rained) {
    const rained = await checkRain(db, homeId, automation.rain_threshold_mm as number).catch(() => false);
    if (rained) {
      log(FN, "weather_skip", { automationId });
      await db.from("automation_runs").insert({
        automation_id: automationId, home_id: homeId,
        triggered_by: triggeredBy, status: "skipped_weather",
        completed_at: new Date().toISOString(),
      });
      await db.from("automations").update({ last_run_date: today }).eq("id", automationId);
      return { status: "skipped_weather" };
    }
  }

  // ── Task due check (scheduled runs only) ─────────────────────────────────
  if (triggeredBy === "schedule") {
    const hasDue = await checkControllingTaskDue(db, automationId, today);
    if (!hasDue) {
      log(FN, "no_due_tasks", { automationId });
      await db.from("automation_runs").insert({
        automation_id: automationId, home_id: homeId,
        triggered_by: triggeredBy, status: "skipped_no_tasks",
        completed_at: new Date().toISOString(),
      });
      await db.from("automations").update({ last_run_date: today }).eq("id", automationId);
      return { status: "skipped_no_tasks" };
    }
  }

  // ── Create run record ─────────────────────────────────────────────────────
  const { data: runRow, error: runErr } = await db
    .from("automation_runs")
    .insert({ automation_id: automationId, home_id: homeId, triggered_by: triggeredBy, status: "pending" })
    .select("id")
    .single();

  if (runErr || !runRow) throw new Error(`Failed to create run: ${runErr?.message}`);
  const runId = (runRow as Record<string, unknown>).id as string;

  // ── Fire valves ───────────────────────────────────────────────────────────
  const devicesTriggered = await fireValves(db, automationId, automation, runId);

  // ── Mark tasks done ───────────────────────────────────────────────────────
  const tasksCompleted = await completeTasks(db, automationId, homeId, today);

  // ── Determine run status ──────────────────────────────────────────────────
  const realFires = devicesTriggered.filter((d) => !d.queued);
  const allOk = realFires.length === 0 || realFires.every((d) => d.success);
  const anyOk = realFires.some((d) => d.success);
  const runStatus = allOk ? "success" : anyOk ? "partial" : "failed";

  await db.from("automation_runs").update({
    status: runStatus,
    devices_triggered: devicesTriggered,
    tasks_completed: tasksCompleted,
    completed_at: new Date().toISOString(),
  }).eq("id", runId);

  await db.from("automations").update({ last_run_date: today }).eq("id", automationId);

  // ── Notify ────────────────────────────────────────────────────────────────
  await sendNotification(db, homeId, automationName, runStatus, automation.duration_seconds as number, automationId)
    .then(() => db.from("automation_runs").update({ notified_at: new Date().toISOString() }).eq("id", runId))
    .catch((e) => warn(FN, "notify_error", { error: e.message }));

  log(FN, "automation_complete", { automationId, runId, status: runStatus });
  return { status: runStatus, runId };
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

    // Drain any queued sequential valves first
    await drainValveQueue(db).catch((e) =>
      warn(FN, "queue_drain_error", { error: e.message })
    );

    // Load all active tier-1 automations not yet run today
    const { data: allAutomations, error: autoErr } = await db
      .from("automations")
      .select("*")
      .eq("is_active", true)
      .eq("tier", 1);

    if (autoErr) {
      logError(FN, "load_automations_failed", { error: autoErr.message });
      return json({ error: autoErr.message }, 500);
    }

    // Filter: scheduled in current UTC hour, not yet run today
    const due = ((allAutomations ?? []) as Array<Record<string, unknown>>).filter((a) => {
      if (a.last_run_date === today) return false;
      const [h] = (a.scheduled_time as string).split(":").map(Number);
      return h === currentHour;
    });

    log(FN, "automations_due", { count: due.length });

    const results = [];
    for (const automation of due) {
      try {
        const result = await runAutomation(db, automation, "schedule");
        results.push({ automationId: automation.id, ...result });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logError(FN, "run_error", { automationId: automation.id, error: msg });
        results.push({ automationId: automation.id, status: "failed", error: msg });
      }
    }

    return json({ success: true, ran: results.length, results });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logError(FN, "fatal_error", { error: msg });
    return json({ error: "Internal server error" }, 500);
  }
});
