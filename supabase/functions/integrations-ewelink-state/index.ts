/**
 * integrations-ewelink-state
 *
 * Returns the current state of an eWeLink valve by querying the eWeLink cloud API.
 *
 * Request body:
 *   { deviceId: string }
 *
 * Response:
 *   { state: "on" | "off"; updatedAt: string }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptCredentials } from "../_shared/integrations/encrypt.ts";
import { insertReading } from "../_shared/integrations/readings.ts";
import type { ValveReading } from "../_shared/integrations/providerTypes.ts";
import { parseDeviceState } from "../_shared/integrations/ewelinkDevice.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EWELINK_BASE = "https://eu-apia.coolkit.cc";

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

    const { deviceId } = await req.json();
    if (!deviceId) {
      return new Response(JSON.stringify({ error: "deviceId is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: device } = await db
      .from("devices")
      .select("id, home_id, metadata, integration_id")
      .eq("id", deviceId)
      .eq("device_type", "water_valve")
      .single();

    if (!device) {
      return new Response(JSON.stringify({ error: "Device not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
      .select("credentials_encrypted")
      .eq("id", device.integration_id)
      .single();

    if (!integration) throw new Error("Integration not found");

    const { accessToken } = await decryptCredentials(integration.credentials_encrypted);
    const appId = Deno.env.get("EWELINK_APP_ID") ?? "";
    const meta = device.metadata as Record<string, unknown>;

    const targetId = meta.use_sub_device ? meta.parent_device_id : meta.direct_device_id;

    const stateRes = await fetch(`${EWELINK_BASE}/v2/device/thing/status?id=${targetId}&type=1`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "X-CK-Appid": appId,
      },
    });

    if (!stateRes.ok) {
      return new Response(JSON.stringify({ error: "Failed to reach eWeLink API" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stateJson = await stateRes.json();
    if (stateJson.error !== 0) {
      return new Response(JSON.stringify({ error: `eWeLink error: ${stateJson.msg}` }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const state = parseDeviceState(stateJson.data ?? {});
    const now = new Date();

    // Store as a reading so it appears in history
    const reading: ValveReading = { state };
    await insertReading({ db, deviceId, homeId: device.home_id, data: reading, recordedAt: now });

    return new Response(JSON.stringify({ state, updatedAt: now.toISOString() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("integrations-ewelink-state error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
