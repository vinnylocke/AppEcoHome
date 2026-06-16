/**
 * integrations-inspect-device
 *
 * Returns the RAW, untransformed JSON the provider's real-time API
 * returned for a given device. Diagnostic surface used by the
 * "Inspect raw provider response" affordance in DeviceSettingsModal.
 *
 * Why this exists: when battery / readings don't show up, knowing the
 * exact field names + shapes the gateway is sending lets us target the
 * parser precisely instead of guessing from partial docs. Same idea as
 * the Test Webhook simulator but in the opposite direction — pulls
 * provider state into Rhozly for inspection rather than POSTing fake
 * data out.
 *
 * Authentication: JWT-verified. Caller must be a member of the home
 * that owns the device.
 *
 * Supports the legacy provider edge fns (Ecowitt + eWeLink) only. For
 * custom_http there is no upstream API to inspect — the readings flow
 * inbound only.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { decryptCredentials, encryptCredentials } from "../_shared/integrations/encrypt.ts";
import { regionToApiBase, withTokenRefresh } from "../_shared/integrations/ewelinkAuth.ts";
import { requireAuth } from "../_shared/requireAuth.ts";
import { log, error as logError } from "../_shared/logger.ts";

const FN = "integrations-inspect-device";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ECOWITT_API_BASE = "https://api.ecowitt.net/api/v3";

interface InspectResult {
  provider: string;
  endpoint: string;
  raw: unknown;
  hint: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authResult = await requireAuth(req, db);
    if (authResult instanceof Response) return authResult;
    const userId = authResult.user.id;

    const body = await req.json();
    const deviceId = typeof body?.deviceId === "string" ? body.deviceId : null;
    if (!deviceId) {
      return new Response(JSON.stringify({ error: "missing_device_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve device + integration + verify membership in one round-trip.
    const { data: device } = await db
      .from("devices")
      .select("id, home_id, integration_id, provider, metadata, external_device_id, device_type")
      .eq("id", deviceId)
      .maybeSingle();
    if (!device) {
      return new Response(JSON.stringify({ error: "device_not_found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: membership } = await db
      .from("home_members")
      .select("role")
      .eq("home_id", (device as { home_id: string }).home_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!membership) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: integration } = await db
      .from("integrations")
      .select("id, credentials_encrypted, region")
      .eq("id", (device as { integration_id: string }).integration_id)
      .maybeSingle();
    if (!integration) {
      return new Response(JSON.stringify({ error: "integration_not_found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const provider = (device as { provider: string }).provider;
    let result: InspectResult;

    if (provider === "ecowitt") {
      const creds = await decryptCredentials(
        (integration as { credentials_encrypted: string }).credentials_encrypted,
      ) as { applicationKey: string; apiKey: string };
      const mac = ((device as { metadata: Record<string, unknown> }).metadata?.gateway_mac as string | undefined) ?? "";
      if (!mac) throw new Error("device_missing_gateway_mac");

      const url = new URL(`${ECOWITT_API_BASE}/device/real_time`);
      url.searchParams.set("application_key", creds.applicationKey);
      url.searchParams.set("api_key", creds.apiKey);
      url.searchParams.set("mac", mac.toUpperCase());
      url.searchParams.set("call_back", "all");

      const res = await fetch(url.toString());
      const json = await res.json();
      result = {
        provider: "ecowitt",
        endpoint: `GET ${ECOWITT_API_BASE}/device/real_time (mac ${mac.toUpperCase()})`,
        raw: json,
        hint: "Look for soil_chN (or ch_soilN) wrappers AND a top-level 'battery' object under data. Channel N's battery may live at data.soil_chN.battery, data.soil_chN.voltage, OR data.battery.soilmoisture_sensor_chN. Whatever you find, the parser collapses it to soilbatt{N}.",
      };
    } else if (provider === "ewelink") {
      const meta = (device as { metadata: Record<string, unknown> }).metadata;
      const targetId = meta.use_sub_device ? meta.parent_device_id : meta.direct_device_id;
      if (!targetId) throw new Error("device_missing_target_id");

      const appId = Deno.env.get("EWELINK_APP_ID") ?? "";
      const appSecret = Deno.env.get("EWELINK_APP_SECRET") ?? "";
      const apiBase = regionToApiBase((integration as { region?: string }).region);

      const stateJson = await withTokenRefresh(
        {
          db,
          integrationId: (integration as { id: string }).id,
          appId,
          appSecret,
          apiBase,
          decryptCredentials,
          encryptCredentials,
          currentEncrypted: (integration as { credentials_encrypted: string }).credentials_encrypted,
        },
        async (accessToken) => {
          const res = await fetch(`${apiBase}/v2/device/thing/status?id=${targetId}&type=1`, {
            headers: { Authorization: `Bearer ${accessToken}`, "X-CK-Appid": appId },
          });
          if (!res.ok) return { error: -1, msg: `eWeLink HTTP ${res.status}` };
          return await res.json();
        },
      );
      result = {
        provider: "ewelink",
        endpoint: `GET ${apiBase}/v2/device/thing/status (id ${String(targetId).slice(0, 6)}…)`,
        raw: stateJson,
        hint: "Battery for SWV-class Zigbee valves lives inside data.params. The parser scans for keys named battery / battPercentage / batteryPercentage / batteryLevel / batt / voltage, plus any other key whose name contains 'batt' as a fallback. Paste back if none match.",
      };
    } else {
      return new Response(
        JSON.stringify({
          error: "unsupported_provider",
          message: `Inspect is not available for provider '${provider}'. Custom HTTP devices receive inbound webhooks rather than being polled — use the Test Webhook simulator instead.`,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    log(FN, "inspect_ok", {
      device_id: deviceId,
      provider,
      payload_bytes: JSON.stringify(result.raw).length,
    });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    logError(FN, "error", { message: err instanceof Error ? err.message : String(err) });
    return new Response(
      JSON.stringify({ error: "internal", message: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
