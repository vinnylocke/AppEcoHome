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
          .select("id, home_id, metadata, integration_id")
          .eq("id", cmd.device_id)
          .single();

        if (!device) continue;

        const { data: integration } = await db
          .from("integrations")
          .select("credentials_encrypted")
          .eq("id", device.integration_id)
          .single();

        if (!integration) continue;

        const { accessToken } = await decryptCredentials(integration.credentials_encrypted);
        const meta = device.metadata as Record<string, unknown>;

        let apiPath: string;
        let payload: Record<string, unknown>;

        if (meta.use_sub_device) {
          apiPath = `/v2/device/thing/sub/status`;
          payload = {
            id: meta.parent_device_id,
            params: { switches: [{ switch: "off", outlet: 0 }], subDevId: meta.sub_device_id },
          };
        } else {
          apiPath = `/v2/device/thing/status`;
          payload = { id: meta.direct_device_id, params: { switch: "off" } };
        }

        const controlRes = await fetch(`${EWELINK_BASE}${apiPath}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
            "X-CK-Appid": appId,
          },
          body: JSON.stringify(payload),
        });

        const controlJson = await controlRes.json();
        const success = controlJson.error === 0;
        const now = new Date();

        // Insert off reading
        if (success) {
          const reading: ValveReading = { state: "off" };
          await insertReading({ db, deviceId: cmd.device_id, homeId: cmd.home_id, data: reading, recordedAt: now });
        }

        // Log the dead-man's trip
        await db.from("device_commands").insert({
          device_id: cmd.device_id,
          home_id: cmd.home_id,
          issued_by: null,
          command: "turn_off",
          parameters: { source: "dead_mans_switch", original_command_id: cmd.id },
          status: success ? "success" : "failed",
          error_message: success ? null : JSON.stringify(controlJson),
          acknowledged_at: success ? now.toISOString() : null,
        });

        // Clear the original command's auto_off_at so it won't trigger again
        await db
          .from("device_commands")
          .update({ auto_off_at: null })
          .eq("id", cmd.id);

        results.push(`${cmd.device_id}: ${success ? "turned off" : "failed"}`);
      } catch (err) {
        console.error(`Dead-man's switch: error processing command ${cmd.id}:`, err);
        results.push(`${cmd.device_id}: error`);
      }
    }

    return new Response(`Processed ${results.length} overdue commands:\n${results.join("\n")}`, { status: 200 });
  } catch (err) {
    console.error("integrations-dead-mans-switch error:", err);
    await captureException("integrations-dead-mans-switch", err);
    return new Response("Internal server error", { status: 500 });
  }
});
