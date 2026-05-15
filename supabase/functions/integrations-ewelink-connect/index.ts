/**
 * integrations-ewelink-connect
 *
 * Implements the eWeLink OAuth Authorization Code flow.
 * EWELINK_APP_ID and EWELINK_APP_SECRET must be set as Supabase secrets.
 *
 * Actions:
 *   get_oauth_url — returns a signed eWeLink authorization URL + state token
 *   exchange_code — exchanges the OAuth code for tokens, stores them, returns devices
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encryptCredentials } from "../_shared/integrations/encrypt.ts";
import { ewelinkHeaders, buildOAuthUrl, regionToApiBase } from "../_shared/integrations/ewelinkAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const REDIRECT_URL = Deno.env.get("EWELINK_REDIRECT_URL") ?? "https://rhozly.com/integrations";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);

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
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const appId     = Deno.env.get("EWELINK_APP_ID");
    const appSecret = Deno.env.get("EWELINK_APP_SECRET");
    if (!appId || !appSecret) {
      return json({ error: "eWeLink credentials not configured — contact support" }, 503);
    }

    const body   = await req.json();
    const action = body.action as string;

    // ── get_oauth_url ────────────────────────────────────────────────────────
    if (action === "get_oauth_url") {
      const { oauthUrl, state } = await buildOAuthUrl(appId, appSecret, REDIRECT_URL);
      return json({ oauthUrl, state });
    }

    // ── exchange_code ────────────────────────────────────────────────────────
    if (action === "exchange_code") {
      const { homeId, code, region } = body as { homeId: string; code: string; region?: string };
      if (!homeId || !code) return json({ error: "homeId and code are required" }, 400);

      const { data: membership } = await db
        .from("home_members")
        .select("role")
        .eq("home_id", homeId)
        .eq("user_id", user.id)
        .single();
      if (!membership) return json({ error: "Forbidden" }, 403);

      const apiBase = regionToApiBase(region);

      // Exchange OAuth code for tokens
      const tokenBody = JSON.stringify({ code, redirectUrl: REDIRECT_URL, grantType: "authorization_code" });
      const tokenRes  = await fetch(`${apiBase}/v2/user/oauth/token`, {
        method:  "POST",
        headers: await ewelinkHeaders(appId, appSecret, tokenBody),
        body:    tokenBody,
        signal:  AbortSignal.timeout(12_000),
      });

      const tokenJson = await tokenRes.json();
      if (tokenJson.error !== 0) {
        return json({ error: `eWeLink authorisation failed: ${tokenJson.msg}` }, 400);
      }

      const accessToken:  string = tokenJson.data?.accessToken  ?? "";
      const refreshToken: string = tokenJson.data?.refreshToken ?? "";

      // Fetch device list
      const devicesRes  = await fetch(`${apiBase}/v2/device/thing?lang=en`, {
        headers: { Authorization: `Bearer ${accessToken}`, "X-CK-Appid": appId },
        signal:  AbortSignal.timeout(12_000),
      });
      const devicesJson = devicesRes.ok ? await devicesRes.json() : { data: { thingList: [] } };
      const thingList: any[] = devicesJson.data?.thingList ?? [];

      const discovered = thingList
        .filter((t) => t.itemType === 1)
        .filter((t) => {
          const subDevices = t.itemData?.params?.subDevices;
          return !Array.isArray(subDevices) || subDevices.length === 0;
        })
        .map((v) => {
          const d    = v.itemData ?? {};
          const params = d.params ?? {};
          const isSubDevice   = !!params.parentid;
          return {
            externalDeviceId: d.deviceid         ?? "",
            name:             d.name             ?? "eWeLink Device",
            model:            d.productModel     ?? "Unknown",
            isSubDevice,
            parentDeviceId:   params.parentid    ?? null,
            subDeviceId:      params.subDevId    ?? null,
          };
        })
        .filter((d) => d.externalDeviceId);

      // Encrypt and persist
      const encrypted = await encryptCredentials({ accessToken, refreshToken });
      const { data: integration, error: upsertError } = await db
        .from("integrations")
        .upsert(
          { home_id: homeId, provider: "ewelink", credentials_encrypted: encrypted, region: region ?? "eu", status: "active" },
          { onConflict: "home_id,provider" },
        )
        .select("id")
        .single();

      if (upsertError || !integration) {
        throw new Error(`Failed to save integration: ${upsertError?.message}`);
      }

      return json({ integrationId: integration.id, devices: discovered });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    console.error("integrations-ewelink-connect error:", err);
    return json({ error: "Internal server error" }, 500);
  }
});
