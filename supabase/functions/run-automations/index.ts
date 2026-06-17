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

      const { accessToken } = await decryptCredentials(
        (integration as Record<string, unknown>).credentials_encrypted as string,
      );
      const apiBase = regionToApiBase((integration as Record<string, unknown>).region as string);
      cred = { accessToken, apiBase };
      credCache.set(integrationId, cred);
    }

    const ok = await fireValve(cred.apiBase, device, "turn_on", durationSeconds, retry, cred.accessToken);
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

/** Format a duration in seconds as a human-readable phrase that doesn't
 *  round sub-minute runs up to "1 min" (a 30s run used to display as
 *  "1 min" because Math.round(0.5) === 1). Singular/plural is also
 *  handled so the body never reads "1 minutes". */
function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} ${s === 1 ? "second" : "seconds"}`;
  const mins = Math.floor(s / 60);
  const rem = s - mins * 60;
  if (rem === 0) return `${mins} ${mins === 1 ? "minute" : "minutes"}`;
  return `${mins} ${mins === 1 ? "minute" : "minutes"} ${rem} ${rem === 1 ? "second" : "seconds"}`;
}

async function sendNotification(
  db: ReturnType<typeof createClient>,
  homeId: string,
  automationName: string,
  status: string,
  durationSeconds: number,
  automationId: string,
  rainMm = 0,
  heatMaxTempC?: number,
): Promise<void> {
  const durationText = formatDuration(durationSeconds);

  let title: string;
  let body: string;
  if (status === "skipped_weather") {
    const mmText = rainMm > 0 ? ` (${rainMm}mm forecast)` : "";
    title = `${automationName} skipped — rain detected`;
    body = `Your garden didn't need extra water today${mmText}.`;
  } else if (status === "success" || status === "partial") {
    if (heatMaxTempC !== undefined) {
      title = `${automationName} watered (hot weather)`;
      body = `Hot day forecast — ${Math.round(heatMaxTempC)}°C. Valves ran for ${durationText}${status === "partial" ? " (some devices failed)" : "."}`;
    } else {
      title = `${automationName} watered your garden`;
      body = `Valves ran for ${durationText}${status === "partial" ? " (some devices failed)" : " successfully"}.`;
    }
  } else {
    title = `${automationName} failed to water`;
    body = "Check your device connections and try again.";
  }

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
    .select("id, device_id, automation_run_id, command")
    .eq("status", "pending")
    .lte("fire_at", now);

  if (!pending || (pending as unknown[]).length === 0) return;

  for (const entry of pending as Array<Record<string, unknown>>) {
    const deviceId = entry.device_id as string;

    // Load device + automation settings via the run
    const { data: runRow } = await db
      .from("automation_runs")
      .select("automation_id, home_id, triggered_by")
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

    const command = ((entry.command as string) ?? "turn_on") as "turn_on" | "turn_off";
    const ok = await fireValve(
      apiBase,
      dev,
      command,
      auto.duration_seconds as number,
      auto.retry_on_failure as boolean,
      accessToken,
    );

    await db.from("automation_valve_queue").update({
      status: ok ? "fired" : "failed",
      fired_at: ok ? now : null,
      error_message: ok ? null : "eWeLink control failed",
    }).eq("id", entry.id as string);

    if (ok) {
      const run = runRow as Record<string, unknown>;
      await db.from("valve_events").insert({
        device_id: deviceId,
        home_id: run.home_id as string,
        automation_id: run.automation_id as string,
        event_type: command,
        triggered_by: (run.triggered_by as string) === "manual" ? "manual" : "scheduled",
        duration_seconds: command === "turn_on" ? (auto.duration_seconds as number) : null,
        fired_at: now,
      });
    }

    log(FN, "queue_drain", { entryId: entry.id, deviceId, command, success: ok });
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

  // ── Weather handling (scheduled runs only) ───────────────────────────────
  // `weather_mode` supersedes the legacy `skip_if_rained` boolean:
  //   off   → ignore the forecast
  //   skip  → hard-skip today's run when meaningful rain is forecast (below)
  //   defer → don't skip; set a recheck and let evaluate-sensor-automations
  //           re-read the area's moisture sensor and water if rain under-delivers
  const weatherMode = (automation.weather_mode as string)
    ?? (automation.skip_if_rained ? "skip" : "off");

  if (triggeredBy === "schedule" && weatherMode === "defer") {
    const now = new Date();
    const windowHours = (automation.weather_defer_window_hours as number) ?? 12;
    const minProb = (automation.weather_min_probability as number) ?? 60;
    const heatC = (automation.heat_threshold_c as number) ?? 30;
    const forecast = await readForecast(db, homeId, now, windowHours, minProb, heatC).catch(() => null);
    const rainThreshold = (automation.rain_threshold_mm as number) ?? 5;
    const meaningful = !!forecast
      && forecast.rain.rainMm >= rainThreshold
      && forecast.rain.probabilityMax >= minProb;
    const skipDeferForHeat = !!forecast?.isHeatwave && ((automation.defer_skip_in_heat as boolean) ?? true);

    if (meaningful && !skipDeferForHeat) {
      log(FN, "weather_defer", { automationId, until: forecast!.rain.windowEnd.toISOString() });
      await db.from("automations").update({
        defer_until: forecast!.rain.windowEnd.toISOString(),
        defer_count: ((automation.defer_count as number) ?? 0) + 1,
        defer_started_at: (automation.defer_started_at as string) ?? now.toISOString(),
        last_run_date: today,
      }).eq("id", automationId);
      await db.from("automation_runs").insert({
        automation_id: automationId, home_id: homeId,
        triggered_by: triggeredBy, status: "deferred_weather",
        completed_at: now.toISOString(),
      });
      // Postpone (not skip) the linked tasks — we're waiting on rain, not done.
      try {
        const { data: abps } = await db.from("automation_blueprints")
          .select("blueprint_id").eq("automation_id", automationId);
        const bpIds = (abps ?? []).map((r: any) => r.blueprint_id as string);
        if (bpIds.length > 0) {
          await db.from("tasks").update({ status: "Postponed" })
            .in("blueprint_id", bpIds).eq("home_id", homeId)
            .eq("due_date", today).in("status", ["Pending"]);
        }
      } catch (e: any) {
        warn(FN, "defer_task_update_failed", { error: e.message });
      }
      return { status: "deferred_weather" };
    }
    // Not deferring (no meaningful rain, or heat override) → water normally.
  }

  if (triggeredBy === "schedule" && weatherMode === "skip") {
    const { rained, mm: rainMm } = await checkRain(db, homeId, automation.rain_threshold_mm as number)
      .catch(() => ({ rained: false, mm: 0 }));
    if (rained) {
      log(FN, "weather_skip", { automationId, rainMm });
      await db.from("automation_runs").insert({
        automation_id: automationId, home_id: homeId,
        triggered_by: triggeredBy, status: "skipped_weather",
        completed_at: new Date().toISOString(),
      });
      await db.from("automations").update({ last_run_date: today }).eq("id", automationId);

      // BUG FIX: previously we only fired the "skipped — rain detected"
      // notification but left the linked watering tasks untouched. The
      // user saw the notification, expected the tasks to be skipped,
      // and was surprised when they showed up as overdue overnight.
      // Now we also mark every linked Pending/Postponed task for today
      // as Skipped with a rain reason so the agenda matches the push.
      try {
        const { data: abps } = await db
          .from("automation_blueprints")
          .select("blueprint_id")
          .eq("automation_id", automationId);
        const bpIds = (abps ?? []).map((r: any) => r.blueprint_id as string);
        if (bpIds.length > 0) {
          await db
            .from("tasks")
            .update({
              status: "Skipped",
              auto_completed_reason: `Skipped — ${rainMm.toFixed(1)}mm rain detected`,
              completed_at: new Date().toISOString(),
            })
            .in("blueprint_id", bpIds)
            .eq("home_id", homeId)
            .eq("due_date", today)
            .in("status", ["Pending", "Postponed"]);
        }
      } catch (e: any) {
        warn(FN, "rain_skip_task_update_failed", { error: e.message });
      }

      await sendNotification(db, homeId, automationName, "skipped_weather", automation.duration_seconds as number, automationId, rainMm)
        .catch((e) => warn(FN, "notify_error", { error: e.message }));
      return { status: "skipped_weather" };
    }
  }

  // ── Task due check (scheduled runs only) ─────────────────────────────────
  // Heat trigger bypasses this check — when `trigger_if_hot` is set and
  // today's forecast max temp meets the threshold, we fire even when no
  // controlling task is due. Rain skip (above) still wins.
  let triggeredByHeat = false;
  let heatMaxTempC = 0;
  if (triggeredBy === "schedule") {
    const hasDue = await checkControllingTaskDue(db, automationId, today);
    if (!hasDue && automation.trigger_if_hot) {
      const { hot, maxTempC } = await checkHeat(db, homeId, automation.heat_threshold_c as number)
        .catch(() => ({ hot: false, maxTempC: 0 }));
      if (hot) {
        triggeredByHeat = true;
        heatMaxTempC = maxTempC;
        log(FN, "heat_trigger", { automationId, maxTempC });
      }
    }
    if (!hasDue && !triggeredByHeat) {
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

  // ── Atomic claim guard (scheduled runs only) ─────────────────────────────
  // Set last_run_date = today ONLY if it isn't already today. Two cron ticks
  // racing here will see exactly one row updated; the loser bails silently.
  // Match rows where last_run_date IS NULL OR != today — Postgres `!=` is
  // NULL-unsafe so we need the explicit IS NULL branch.
  if (triggeredBy === "schedule") {
    const { data: claimed } = await db
      .from("automations")
      .update({ last_run_date: today })
      .eq("id", automationId)
      .or(`last_run_date.is.null,last_run_date.neq.${today}`)
      .select("id");
    if (!claimed || (claimed as unknown[]).length === 0) {
      log(FN, "duplicate_run_blocked", { automationId, today });
      return { status: "duplicate_blocked" };
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
  const devicesTriggered = await fireValves(db, automationId, automation, runId, triggeredBy);

  // ── Mark tasks done ───────────────────────────────────────────────────────
  const tasksCompleted = await completeTasks(db, automationId, homeId, today, triggeredBy === "manual");

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
  await sendNotification(
    db, homeId, automationName, runStatus,
    automation.duration_seconds as number, automationId,
    0,
    triggeredByHeat ? heatMaxTempC : undefined,
  )
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
