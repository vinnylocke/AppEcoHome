/**
 * integrations-ewelink-connect
 *
 * Authenticates with the eWeLink cloud API using email + password (Option A),
 * fetches all paired devices, and returns them for the wizard discovery step.
 *
 * Scaffolded — activate when hardware and eWeLink developer approval arrive.
 * EWELINK_APP_ID and EWELINK_APP_SECRET must be set as Supabase secrets.
 *
 * eWeLink EU endpoint: https://eu-apia.coolkit.cc
 *
 * Request body:
 *   { homeId: string; email: string; password: string }
 *
 * Response:
 *   { integrationId: string; devices: DiscoveredDevice[] }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encryptCredentials } from "../_shared/integrations/encrypt.ts";

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

    const { homeId, email, password } = await req.json();
    if (!homeId || !email || !password) {
      return new Response(JSON.stringify({ error: "homeId, email and password are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    const appId = Deno.env.get("EWELINK_APP_ID");
    const appSecret = Deno.env.get("EWELINK_APP_SECRET");

    if (!appId || !appSecret) {
      return new Response(JSON.stringify({ error: "eWeLink credentials not configured — contact support" }), {
        status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Authenticate with eWeLink ───────────────────────────────────────────
    const loginRes = await fetch(`${EWELINK_BASE}/v2/user/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CK-Appid": appId,
        "X-CK-Nonce": crypto.randomUUID().replace(/-/g, "").slice(0, 8),
      },
      body: JSON.stringify({ email, password, countryCode: "+44" }),
    });

    if (!loginRes.ok) {
      return new Response(JSON.stringify({ error: "Failed to reach eWeLink API" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const loginJson = await loginRes.json();
    if (loginJson.error !== 0) {
      return new Response(JSON.stringify({ error: `eWeLink login failed: ${loginJson.msg}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessToken: string = loginJson.data?.at ?? "";
    const userId: string = loginJson.data?.user?.apikey ?? "";

    // ── Fetch device list ───────────────────────────────────────────────────
    const devicesRes = await fetch(`${EWELINK_BASE}/v2/device/thing?lang=en`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "X-CK-Appid": appId,
      },
    });

    const devicesJson = devicesRes.ok ? await devicesRes.json() : { error: 1, thingList: [] };

    const thingList: Record<string, unknown>[] = devicesJson.data?.thingList ?? [];

    // Filter for Zigbee valves — uiid 2256 is the ZBMINI range; adjust when hardware confirmed
    const valves = thingList.filter(
      (t) => (t as Record<string, unknown>).type === 1
    );

    const discovered = valves.map((v) => {
      const d = v as Record<string, unknown>;
      const item = d.itemData as Record<string, unknown>;
      return {
        externalDeviceId: item?.deviceid as string ?? "",
        name: item?.name as string ?? "Zigbee Valve",
        model: (item?.productModel as string) ?? "Unknown",
      };
    }).filter((d) => d.externalDeviceId);

    // ── Persist encrypted credentials ───────────────────────────────────────
    const encrypted = await encryptCredentials({ accessToken, userId, email });

    const { data: integration, error: upsertError } = await db
      .from("integrations")
      .upsert(
        {
          home_id: homeId,
          provider: "ewelink",
          credentials_encrypted: encrypted,
          region: "eu",
          status: "active",
        },
        { onConflict: "home_id,provider" },
      )
      .select("id")
      .single();

    if (upsertError || !integration) {
      throw new Error(`Failed to save integration: ${upsertError?.message}`);
    }

    return new Response(JSON.stringify({ integrationId: integration.id, devices: discovered }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("integrations-ewelink-connect error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
