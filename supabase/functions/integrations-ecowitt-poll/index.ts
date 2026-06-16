/**
 * integrations-ecowitt-poll
 *
 * On-demand / fallback: fetches the current real-time readings from Ecowitt's
 * API for a specific home's soil sensors and stores them.
 *
 * Trigger: user action ("Sync now" button in DeviceSettingsModal).
 *
 * Request body:
 *   { homeId: string }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptCredentials } from "../_shared/integrations/encrypt.ts";
import { insertReading } from "../_shared/integrations/readings.ts";
import type { SoilReading } from "../_shared/integrations/providerTypes.ts";
import {
  flattenRealTimeSoilwetness,
  parseSoilChannels,
} from "../_shared/integrations/ecowittFields.ts";
import { captureException } from "../_shared/sentry.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ECOWITT_API_BASE = "https://api.ecowitt.net/api/v3";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── Auth ────────────────────────────────────────────────────────────────
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

    const { homeId } = await req.json();
    if (!homeId) {
      return new Response(JSON.stringify({ error: "homeId is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify membership
    const { data: membership } = await db
      .from("home_members")
      .select("user_id")
      .eq("home_id", homeId)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Load integration credentials ────────────────────────────────────────
    const { data: integration, error: intError } = await db
      .from("integrations")
      .select("id, credentials_encrypted, status")
      .eq("home_id", homeId)
      .eq("provider", "ecowitt")
      .single();

    if (intError || !integration) {
      return new Response(JSON.stringify({ error: "No Ecowitt integration found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { applicationKey, apiKey } = await decryptCredentials(integration.credentials_encrypted);

    // ── Load devices for this integration ───────────────────────────────────
    const { data: devices } = await db
      .from("devices")
      .select("id, home_id, metadata")
      .eq("integration_id", integration.id)
      .eq("device_type", "soil_sensor")
      .eq("is_active", true);

    if (!devices?.length) {
      return new Response(JSON.stringify({ synced: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Group devices by gateway MAC
    const byMac: Record<string, typeof devices> = {};
    for (const d of devices) {
      const mac: string = d.metadata?.gateway_mac ?? "unknown";
      (byMac[mac] ??= []).push(d);
    }

    let synced = 0;
    const recordedAt = new Date();

    for (const [mac, macDevices] of Object.entries(byMac)) {
      const url = new URL(`${ECOWITT_API_BASE}/device/real_time`);
      url.searchParams.set("application_key", applicationKey);
      url.searchParams.set("api_key", apiKey);
      url.searchParams.set("mac", mac.toUpperCase());
      url.searchParams.set("call_back", "soilwetness");

      const res = await fetch(url.toString());
      if (!res.ok) continue;

      const json = await res.json();
      if (json.code !== 0 || !json.data?.soilwetness) continue;

      // 2026-06-16 — WH52 support. Flatten the nested real_time shape
      // into the same flat dict the webhook handler sees, then run it
      // through the shared parser. Single source of truth for field
      // priority + EC calibration detection.
      const flat = flattenRealTimeSoilwetness(json.data.soilwetness);
      const channels = parseSoilChannels(flat);
      const byChannel = new Map(channels.map((c) => [c.channel, c]));

      for (const device of macDevices) {
        const channelNum: number = device.metadata?.channel ?? 0;
        const ch = byChannel.get(channelNum);
        if (!ch) continue;

        const reading: SoilReading = {
          soil_temp: ch.soil_temp,
          soil_moisture: ch.soil_moisture,
          soil_ec: ch.soil_ec,
          ec_source: ch.ec_source,
        };

        await insertReading({ db, deviceId: device.id, homeId: device.home_id, data: reading, recordedAt });
        synced++;
      }
    }

    // Update integration last_synced_at
    await db
      .from("integrations")
      .update({ last_synced_at: recordedAt.toISOString(), status: "active", error_message: null })
      .eq("id", integration.id);

    return new Response(JSON.stringify({ synced }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("integrations-ecowitt-poll error:", err);
    await captureException("integrations-ecowitt-poll", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
