// Shared valve-queue drainer.
//
// `automation_valve_queue` holds pending `turn_on` / `turn_off` entries with a
// `fire_at`. Draining = for every entry whose `fire_at <= now`, hit the device
// (eWeLink) and stamp the row `fired` / `failed`. Used by BOTH:
//   • run-automations  — the 5-min `drain-valve-queue` cron + manual "Run now".
//   • evaluate-automations — inline, right after queueing, so an auto-fired
//     valve actuates immediately instead of at the next drain tick (which is
//     what made the "ran" receipt arrive up to 5 min early).
//
// `db: any` so callers pinned to different supabase-js versions pass cleanly
// (same reasoning as `fanoutActions`).

import { decryptCredentials } from "./integrations/encrypt.ts";
import { buildControlPayload } from "./integrations/ewelinkDevice.ts";
import { regionToApiBase } from "./integrations/ewelinkAuth.ts";
import { sendReceipt } from "./automationReceipt.ts";
import { log } from "./logger.ts";

const FN = "valve-queue";
const EWELINK_APP_ID = Deno.env.get("EWELINK_APP_ID") ?? "";

/** Fire a single valve command at the device, with one optional retry. */
export async function fireValve(
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
    // Timeout + catch: a hung coolkit.cc request must not stall the whole
    // drain, and a non-JSON error page from a gateway must count as a failed
    // attempt, not throw past the caller and strand the queue entry in 'firing'.
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

/**
 * Drain due valve-queue entries. Pass `{ runId }` to drain only one run's
 * entries (used by the inline auto-fire path so it touches just its own
 * just-queued `turn_on`); omit it to drain everything due (the cron sweep).
 */
export async function drainValveQueue(
  // deno-lint-ignore no-explicit-any
  db: any,
  opts: { runId?: string } = {},
): Promise<void> {
  const now = new Date().toISOString();

  // Recover entries stuck in 'firing': a drain that died mid-fire (function
  // wall-clock kill, deploy restart) holds the claim forever and the drain
  // query below only sees 'pending'. A stale turn_off goes back to pending —
  // re-sending "off" to the device is idempotent and losing it means the valve
  // relies solely on the device countdown. A stale turn_on is marked failed:
  // re-firing an open minutes late would water outside the scheduled window.
  const staleCutoff = new Date(Date.now() - 5 * 60_000).toISOString();
  await db.from("automation_valve_queue")
    .update({ status: "pending" })
    .eq("status", "firing")
    .eq("command", "turn_off")
    .lte("fire_at", staleCutoff);
  await db.from("automation_valve_queue")
    .update({
      status: "failed",
      error_message: "Stale firing claim — drain died mid-fire",
    })
    .eq("status", "firing")
    .eq("command", "turn_on")
    .lte("fire_at", staleCutoff);

  let query = db
    .from("automation_valve_queue")
    .select("id, device_id, automation_run_id, command")
    .eq("status", "pending")
    .lte("fire_at", now);
  if (opts.runId) query = query.eq("automation_run_id", opts.runId);

  const { data: pending } = await query;
  if (!pending || (pending as unknown[]).length === 0) return;

  for (const entry of pending as Array<Record<string, unknown>>) {
    const deviceId = entry.device_id as string;

    // Atomically claim the entry so the inline drain (evaluate-automations) and
    // the cron drain can't both fire it — the double-turn_on race seen in the
    // valve_events. The conditional update on status=pending lets one drain win;
    // the loser gets 0 rows and skips.
    const { data: claimed } = await db
      .from("automation_valve_queue")
      .update({ status: "firing" })
      .eq("id", entry.id as string)
      .eq("status", "pending")
      .select("id");
    if (!claimed || (claimed as unknown[]).length === 0) continue;

    // From here the entry is claimed: any throw (decrypt failure, DB error)
    // must stamp the row 'failed' rather than leave it in 'firing' forever.
    try {
      const { data: runRow } = await db
        .from("automation_runs")
        .select("automation_id, home_id, triggered_by")
        .eq("id", entry.automation_run_id as string)
        .single();
      if (!runRow) {
        await db.from("automation_valve_queue")
          .update({
            status: "failed",
            error_message: "Automation run not found",
          })
          .eq("id", entry.id as string);
        continue;
      }

      const { data: automation } = await db
        .from("automations")
        .select("duration_seconds, retry_on_failure, name")
        .eq("id", (runRow as Record<string, unknown>).automation_id as string)
        .single();

      const { data: device } = await db
        .from("devices")
        .select("id, name, external_device_id, metadata, integration_id")
        .eq("id", deviceId)
        .single();

      if (!automation || !device) {
        await db.from("automation_valve_queue")
          .update({
            status: "failed",
            error_message: "Device or automation not found",
          })
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
      const { accessToken } = await decryptCredentials(
        integ.credentials_encrypted as string,
      );
      const apiBase = regionToApiBase(integ.region as string);

      const command = ((entry.command as string) ?? "turn_on") as
        | "turn_on"
        | "turn_off";

      // Auto-off countdown = the automation's per-action valve duration (what the
      // user set), not the legacy automations.duration_seconds default. Looked up
      // by (automation, device); falls back to automations.duration_seconds.
      let runSeconds = auto.duration_seconds as number;
      if (command === "turn_on") {
        // .limit(1) + order: two valve_open actions targeting the same device
        // would make a bare .maybeSingle() error out and silently fall back to
        // the legacy automations.duration_seconds default.
        const { data: act } = await db
          .from("automation_actions")
          .select("valve_duration_seconds")
          .eq(
            "automation_id",
            (runRow as Record<string, unknown>).automation_id as string,
          )
          .eq("action_kind", "valve_open")
          .eq("target_device_id", deviceId)
          .order("id")
          .limit(1)
          .maybeSingle();
        const v = (act as { valve_duration_seconds?: unknown } | null)
          ?.valve_duration_seconds;
        if (typeof v === "number" && v > 0) runSeconds = v;
      }

      const ok = await fireValve(
        apiBase,
        dev,
        command,
        runSeconds,
        auto.retry_on_failure as boolean,
        accessToken,
      );

      await db.from("automation_valve_queue").update({
        status: ok ? "fired" : "failed",
        fired_at: ok ? now : null,
        error_message: ok ? null : "eWeLink control failed",
      }).eq("id", entry.id as string);

      const run = runRow as Record<string, unknown>;
      if (ok) {
        await db.from("valve_events").insert({
          device_id: deviceId,
          home_id: run.home_id as string,
          automation_id: run.automation_id as string,
          event_type: command,
          triggered_by: (run.triggered_by as string) === "manual"
            ? "manual"
            : "scheduled",
          duration_seconds: command === "turn_on" ? runSeconds : null,
          fired_at: now,
        });
      } else if (command === "turn_on") {
        // The optimistic "ran" receipt already went out when the automation fired;
        // a turn-on failure here corrects it (only if a receipt action is configured).
        await sendReceipt(
          db,
          {
            id: run.automation_id as string,
            home_id: run.home_id as string,
            name: (auto.name as string) ?? "Your automation",
          },
          "failed",
        ).catch(() => {});
      }

      log(FN, "queue_drain", {
        entryId: entry.id,
        deviceId,
        command,
        success: ok,
      });
    } catch (err) {
      await db.from("automation_valve_queue")
        .update({
          status: "failed",
          error_message: `Drain error: ${
            err instanceof Error ? err.message : String(err)
          }`,
        })
        .eq("id", entry.id as string);
      log(FN, "queue_drain_error", {
        entryId: entry.id,
        deviceId,
        error: String(err),
      });
    }
  }
}
