/**
 * integrations-ewelink-control
 *
 * Sends a turn_on or turn_off command to an eWeLink Zigbee valve.
 * Supports both direct device (use_sub_device: false) and sub-device
 * (use_sub_device: true) control patterns — determined by device.metadata.
 *
 * For turn_on: passes a countdown so the device self-enforces the timer.
 * Also records the command in device_commands with auto_off_at.
 *
 * Request body:
 *   { deviceId: string; command: "turn_on" | "turn_off"; durationSeconds?: number }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptCredentials, encryptCredentials } from "../_shared/integrations/encrypt.ts";
import { insertReading } from "../_shared/integrations/readings.ts";
import type { ValveReading } from "../_shared/integrations/providerTypes.ts";
import { buildControlPayload, resolveEffectiveDuration } from "../_shared/integrations/ewelinkDevice.ts";
import { regionToApiBase, withTokenRefresh } from "../_shared/integrations/ewelinkAuth.ts";
import { captureException } from "../_shared/sentry.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const userDb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: authError } = await userDb.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { deviceId, command, durationSeconds } = await req.json() as {
      deviceId: string;
      command: "turn_on" | "turn_off";
      durationSeconds?: number;
    };

    if (!deviceId || !command) {
      return new Response(JSON.stringify({ error: "deviceId and command are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Load device + integration ───────────────────────────────────────────
    const { data: device } = await db
      .from("devices")
      .select("id, home_id, metadata, integration_id, external_device_id")
      .eq("id", deviceId)
      .eq("device_type", "water_valve")
      .single();

    if (!device) {
      return new Response(JSON.stringify({ error: "Device not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify membership
    const { data: membership } = await db
      .from("home_members")
      .select("user_id")
      .eq("home_id", device.home_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: integration } = await db
      .from("integrations")
      .select("id, credentials_encrypted, region")
      .eq("id", device.integration_id)
      .single();

    if (!integration) throw new Error("Integration not found");

    const appId = Deno.env.get("EWELINK_APP_ID") ?? "";
    const appSecret = Deno.env.get("EWELINK_APP_SECRET") ?? "";
    const apiBase = regionToApiBase(integration.region as string | undefined);

    const meta = device.metadata as Record<string, unknown>;
    const duration = resolveEffectiveDuration(durationSeconds, meta);

    // ── Build eWeLink API call ──────────────────────────────────────────────
    const { apiPath, payload } = buildControlPayload(meta, command, duration, device.external_device_id ?? undefined);

    let controlJson: { error?: number; msg?: string };
    try {
      controlJson = await withTokenRefresh(
        {
          db,
          integrationId: integration.id as string,
          appId,
          appSecret,
          apiBase,
          decryptCredentials,
          encryptCredentials,
          currentEncrypted: integration.credentials_encrypted,
        },
        async (accessToken) => {
          const res = await fetch(`${apiBase}${apiPath}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
              "X-CK-Appid": appId,
            },
            body: JSON.stringify(payload),
          });
          return await res.json();
        },
      );
    } catch (refreshErr) {
      const errMsg = refreshErr instanceof Error ? refreshErr.message : "eWeLink session expired.";
      return new Response(JSON.stringify({ error: errMsg, reconnectRequired: true }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const success = controlJson.error === 0;

    // ── Persist command + reading ───────────────────────────────────────────
    const now = new Date();
    const autoOffAt = command === "turn_on" ? new Date(now.getTime() + duration * 1000) : null;

    await db.from("device_commands").insert({
      device_id: deviceId,
      home_id: device.home_id,
      issued_by: user.id,
      command,
      parameters: command === "turn_on" ? { duration_seconds: duration } : {},
      auto_off_at: autoOffAt?.toISOString() ?? null,
      status: success ? "success" : "failed",
      error_message: success ? null : JSON.stringify(controlJson),
      acknowledged_at: success ? now.toISOString() : null,
    });

    if (success) {
      const reading: ValveReading = { state: command === "turn_on" ? "on" : "off" };
      await insertReading({ db, deviceId, homeId: device.home_id, data: reading, recordedAt: now });
    }

    if (!success) {
      return new Response(JSON.stringify({ error: `eWeLink error: ${controlJson.msg}` }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, autoOffAt: autoOffAt?.toISOString() ?? null }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("integrations-ewelink-control error:", err);
    await captureException("integrations-ewelink-control", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
