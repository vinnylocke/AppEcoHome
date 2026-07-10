/**
 * integrations-dead-mans-switch
 *
 * Belt-and-braces safety: fired by pg_cron every 60 seconds.
 * Finds any valve that has a successful turn_on command with auto_off_at
 * in the past, and sends a turn_off command.
 *
 * The device's built-in countdown parameter is the primary mechanism.
 * This function is the backup in case that fails.
 *
 * Trigger: pg_cron schedule (set up in migration or Supabase dashboard)
 *   SELECT cron.schedule('dead-mans-switch', '* * * * *',
 *     $$SELECT net.http_post(url := '<fn-url>', ...)$$);
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptCredentials } from "../_shared/integrations/encrypt.ts";
import { insertReading } from "../_shared/integrations/readings.ts";
import { controlValve } from "../_shared/integrations/valveControl.ts";
import type { DeviceRow } from "../_shared/integrations/contract.ts";
import type { ValveReading } from "../_shared/integrations/providerTypes.ts";
import { captureException } from "../_shared/sentry.ts";

const EWELINK_BASE = "https://eu-apia.coolkit.cc";

Deno.serve(async () => {
  try {
    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Find overdue turn_on commands (auto_off_at in the past, still status=success with no subsequent turn_off)
    const { data: overdue } = await db
      .from("device_commands")
      .select("id, device_id, home_id, auto_off_at")
      .lte("auto_off_at", new Date().toISOString())
      .eq("status", "success")
      .eq("command", "turn_on");

    if (!overdue?.length) {
      return new Response("ok — nothing overdue", { status: 200 });
    }

    const appId = Deno.env.get("EWELINK_APP_ID") ?? "";
    const results: string[] = [];

    for (const cmd of overdue) {
      try {
        // Load device + integration
        const { data: device } = await db
          .from("devices")
          .select("id, home_id, name, external_device_id, device_type, metadata, integration_id, provider, area_id")
          .eq("id", cmd.device_id)
          .single();

        if (!device) continue;

        const { data: integration } = await db
          .from("integrations")
          .select("credentials_encrypted")
          .eq("id", device.integration_id)
          .single();

        if (!integration) continue;

        // Full creds map: the eWeLink fallback reads `.accessToken`; a control
        // adapter (custom_http) reads its own control_url/method/… keys.
        const creds = await decryptCredentials(integration.credentials_encrypted);
        const meta = (device.metadata ?? {}) as Record<string, unknown>;

        // The eWeLink off-command as a fallback thunk. Used only when the
        // device's provider has no control adapter (i.e. eWeLink) — a custom_http
        // valve dispatches through its adapter instead, so a DIY valve actually
        // closes rather than this backstop silently no-op'ing forever
        // (bug-audit-2026-07-10 #1).
        const fireEwelinkOff = async (): Promise<boolean> => {
          const apiPath = meta.use_sub_device
            ? `/v2/device/thing/sub/status`
            : `/v2/device/thing/status`;
          const payload = meta.use_sub_device
            ? {
              id: meta.parent_device_id,
              params: { switches: [{ switch: "off", outlet: 0 }], subDevId: meta.sub_device_id },
            }
            : { id: meta.direct_device_id, params: { switch: "off" } };
          try {
            const controlRes = await fetch(`${EWELINK_BASE}${apiPath}`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${(creds.accessToken as string) ?? ""}`,
                "X-CK-Appid": appId,
              },
              body: JSON.stringify(payload),
              signal: AbortSignal.timeout(15_000),
            });
            const controlJson = await controlRes.json() as Record<string, unknown>;
            return controlJson.error === 0;
          } catch {
            // Timeout / network / non-JSON body — a failed turn-off so the
            // command stays armed and is retried.
            return false;
          }
        };

        const deviceRow: DeviceRow = {
          id: device.id as string,
          external_device_id: (device.external_device_id as string) ?? "",
          name: (device.name as string) ?? "",
          device_type: (device.device_type as DeviceRow["device_type"]) ?? "water_valve",
          metadata: meta,
          area_id: (device.area_id as string | null) ?? null,
        };

        const result = await controlValve(
          (device.provider as string) ?? "",
          deviceRow,
          { kind: "valve_close" },
          creds,
          fireEwelinkOff,
        );
        const success = result.ok;
        const now = new Date();

        // Insert off reading
        if (success) {
          const reading: ValveReading = { state: "off" };
          await insertReading({
            db,
            deviceId: cmd.device_id,
            homeId: cmd.home_id,
            data: reading,
            recordedAt: now,
          });
        }

        // Log the dead-man's trip
        await db.from("device_commands").insert({
          device_id: cmd.device_id,
          home_id: cmd.home_id,
          issued_by: null,
          command: "turn_off",
          parameters: {
            source: "dead_mans_switch",
            original_command_id: cmd.id,
          },
          status: success ? "success" : "failed",
          error_message: success ? null : (result.error ?? "valve turn-off failed"),
          acknowledged_at: success ? now.toISOString() : null,
        });

        // Disarm ONLY on success. Clearing auto_off_at after a failed turn-off
        // would silently drop the safety retry and leave the valve running.
        // On failure, push auto_off_at 5 minutes forward instead: the switch
        // stays armed and keeps retrying, without a failed-command row every
        // 60-second cron tick.
        if (success) {
          await db
            .from("device_commands")
            .update({ auto_off_at: null })
            .eq("id", cmd.id);
        } else {
          await db
            .from("device_commands")
            .update({
              auto_off_at: new Date(Date.now() + 5 * 60_000).toISOString(),
            })
            .eq("id", cmd.id);
        }

        results.push(`${cmd.device_id}: ${success ? "turned off" : "failed"}`);
      } catch (err) {
        console.error(
          `Dead-man's switch: error processing command ${cmd.id}:`,
          err,
        );
        results.push(`${cmd.device_id}: error`);
      }
    }

    return new Response(
      `Processed ${results.length} overdue commands:\n${results.join("\n")}`,
      { status: 200 },
    );
  } catch (err) {
    console.error("integrations-dead-mans-switch error:", err);
    await captureException("integrations-dead-mans-switch", err);
    return new Response("Internal server error", { status: 500 });
  }
});
