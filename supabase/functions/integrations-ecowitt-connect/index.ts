/**
 * integrations-ecowitt-connect
 *
 * Saves Ecowitt credentials, registers the webhook URL with the Ecowitt gateway,
 * and discovers all paired soil sensors on the account.
 *
 * Request body:
 *   {
 *     homeId:         string;
 *     applicationKey: string;  // Ecowitt developer app key
 *     apiKey:         string;  // Ecowitt device-level API key
 *     gatewayMac:     string;  // MAC address of the Ecowitt gateway (e.g. "AA:BB:CC:DD:EE:FF")
 *   }
 *
 * Response:
 *   { integrationId: string; devices: DiscoveredDevice[] }
 *
 * where DiscoveredDevice = { externalDeviceId, name, channel, model }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encryptCredentials } from "../_shared/integrations/encrypt.ts";
import {
  flattenRealTimeSoilwetness,
  parseSoilChannels,
} from "../_shared/integrations/ecowittFields.ts";
import type { EcowittSoilModel } from "../_shared/integrations/providerTypes.ts";
import { captureException } from "../_shared/sentry.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ECOWITT_API_BASE = "https://api.ecowitt.net/api/v3";

interface DiscoveredDevice {
  externalDeviceId: string;
  name: string;
  channel: number;
  model: EcowittSoilModel;
}

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

    // ── Parse & validate body ───────────────────────────────────────────────
    const { homeId, applicationKey, apiKey, gatewayMac } = await req.json();
    if (!homeId || !applicationKey || !apiKey || !gatewayMac) {
      return new Response(JSON.stringify({ error: "homeId, applicationKey, apiKey and gatewayMac are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify home membership
    const { data: membership } = await db
      .from("home_members")
      .select("role")
      .eq("home_id", homeId)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Verify credentials by fetching device list from Ecowitt ────────────
    const deviceListUrl = new URL(`${ECOWITT_API_BASE}/device/list`);
    deviceListUrl.searchParams.set("application_key", applicationKey);
    deviceListUrl.searchParams.set("api_key", apiKey);
    deviceListUrl.searchParams.set("mac", gatewayMac.toUpperCase());

    const deviceListRes = await fetch(deviceListUrl.toString());
    if (!deviceListRes.ok) {
      return new Response(JSON.stringify({ error: "Failed to reach Ecowitt API" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const deviceListJson = await deviceListRes.json();
    if (deviceListJson.code !== 0) {
      return new Response(JSON.stringify({ error: `Ecowitt error: ${deviceListJson.msg}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Register webhook with Ecowitt ───────────────────────────────────────
    const webhookUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/integrations-ecowitt-webhook`;
    const webhookPassphrase = Deno.env.get("ECOWITT_WEBHOOK_SECRET") ?? "";

    const callbackRes = await fetch(`${ECOWITT_API_BASE}/device/intetime`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        application_key: applicationKey,
        api_key: apiKey,
        mac: gatewayMac.toUpperCase(),
        call_back: webhookUrl,
        token: webhookPassphrase,
        unit: 1,   // Metric
        time_zone: 0,
      }),
    });

    if (!callbackRes.ok) {
      console.warn("Webhook registration failed — continuing without it");
    } else {
      const callbackJson = await callbackRes.json();
      if (callbackJson.code !== 0) {
        console.warn("Ecowitt webhook registration non-zero code:", callbackJson.msg);
      }
    }

    // ── Persist encrypted credentials ───────────────────────────────────────
    const encrypted = await encryptCredentials({ applicationKey, apiKey });

    const { data: integration, error: upsertError } = await db
      .from("integrations")
      .upsert(
        {
          home_id: homeId,
          provider: "ecowitt",
          credentials_encrypted: encrypted,
          region: "eu",
          sync_interval_minutes: 16,
          status: "active",
        },
        { onConflict: "home_id,provider" },
      )
      .select("id")
      .single();

    if (upsertError || !integration) {
      throw new Error(`Failed to save integration: ${upsertError?.message}`);
    }

    // ── Discover WH51 soil sensors ──────────────────────────────────────────
    // Ecowitt exposes soil sensors as channel-based sub-sensors on the gateway.
    // We query real-time data to see which channels have readings.
    const realTimeUrl = new URL(`${ECOWITT_API_BASE}/device/real_time`);
    realTimeUrl.searchParams.set("application_key", applicationKey);
    realTimeUrl.searchParams.set("api_key", apiKey);
    realTimeUrl.searchParams.set("mac", gatewayMac.toUpperCase());
    realTimeUrl.searchParams.set("call_back", "soilwetness");

    const rtRes = await fetch(realTimeUrl.toString());
    const rtJson = rtRes.ok ? await rtRes.json() : null;

    const discovered: DiscoveredDevice[] = [];

    if (rtJson?.code === 0 && rtJson.data?.soilwetness) {
      // 2026-06-16 — WH52 support. Instead of guessing the model from
      // the response shape directly, we flatten the real_time payload
      // and let the shared parser infer the model from the fields
      // present on each channel (calibrated EC or non-zero temperature
      // → WH52; otherwise WH51). Single source of truth, exercised by
      // ecowittFields.test.ts.
      const flat = flattenRealTimeSoilwetness(rtJson.data.soilwetness);
      const parsed = parseSoilChannels(flat);

      for (const ch of parsed) {
        const externalId = `${gatewayMac.toUpperCase()}-soil-${ch.channel}`;
        discovered.push({
          externalDeviceId: externalId,
          name: `Soil Sensor CH${ch.channel}`,
          channel: ch.channel,
          model: ch.inferredModel,
        });
      }
    }

    return new Response(JSON.stringify({ integrationId: integration.id, devices: discovered }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("integrations-ecowitt-connect error:", err);
    await captureException("integrations-ecowitt-connect", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
