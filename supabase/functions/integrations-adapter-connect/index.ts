/**
 * integrations-adapter-connect
 *
 * 2026-06-16 Phase 2/3 — adapter-aware connect dispatcher. The
 * existing per-provider edge functions (integrations-ecowitt-connect,
 * integrations-ewelink-connect) stay in place for back-compat; this
 * dispatcher is the canonical entry point for any provider registered
 * via the new ProviderAdapter contract.
 *
 * The Connect wizard's brand picker uses listAdapters() to render
 * "Custom (HTTP)" (today) and any future contract-based adapters. When
 * the user submits the credentials step, the wizard POSTs here with
 * `{ provider, homeId, fields }`. The dispatcher looks up the adapter,
 * calls its `connect()`, persists the integration + discovered devices,
 * and returns the (optionally adapter-supplied) post-connect block so
 * the wizard can show the user setup instructions (e.g. the webhook
 * URL for custom_http).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { log, error as logError } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import { requireAuth } from "../_shared/requireAuth.ts";
import { encryptCredentials } from "../_shared/integrations/encrypt.ts";
import { getAdapter } from "../_shared/integrations/registry.ts";

const FN = "integrations-adapter-connect";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(supabaseUrl, supabaseServiceKey);

    const authResult = await requireAuth(req, db);
    if (authResult instanceof Response) return authResult;
    const userId = authResult.user.id;

    const body = await req.json();
    const provider = typeof body?.provider === "string" ? body.provider : null;
    const homeId = typeof body?.homeId === "string" ? body.homeId : null;
    const fields = (body?.fields && typeof body.fields === "object") ? body.fields : {};
    const appOriginIn = typeof body?.appOrigin === "string" ? body.appOrigin : null;
    if (!provider || !homeId) {
      return new Response(
        JSON.stringify({ error: "missing_provider_or_home_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const adapter = getAdapter(provider);
    if (!adapter) {
      return new Response(
        JSON.stringify({ error: "unknown_provider", provider }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Verify the caller owns / belongs to the home.
    const { data: membership } = await db
      .from("home_members")
      .select("role")
      .eq("home_id", homeId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!membership) {
      return new Response(
        JSON.stringify({ error: "forbidden" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Adapter validates creds + decides what to persist + what devices to surface.
    let connectResult;
    try {
      connectResult = await adapter.connect({ homeId, fields });
    } catch (err) {
      return new Response(
        JSON.stringify({
          error: "adapter_connect_failed",
          message: err instanceof Error ? err.message : String(err),
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Persist integration row. Credentials are encrypted if the adapter
    // returned any; otherwise stored as an empty encrypted blob so the
    // existing schema constraint stays happy.
    const credsBlob = await encryptCredentials(connectResult.credsToStore ?? {});
    const integrationMetadata = connectResult.integrationMetadata ?? {};

    const { data: integration, error: upsertErr } = await db
      .from("integrations")
      .upsert(
        {
          home_id: homeId,
          provider,
          credentials_encrypted: credsBlob,
          metadata: integrationMetadata,
          region: "eu",
          sync_interval_minutes: 16,
          status: "active",
        },
        { onConflict: "home_id,provider" },
      )
      .select("id")
      .single();
    if (upsertErr || !integration) {
      throw new Error(`failed_to_save_integration: ${upsertErr?.message ?? "no row"}`);
    }
    const integrationId = (integration as { id: string }).id;

    // Persist devices discovered by the adapter. The original Phase 3
    // dispatcher returned them in the response but never INSERTed —
    // the webhook router's (integration_id, external_device_id) lookup
    // would then always fail with device_not_found. Upsert by
    // (integration_id, external_device_id) so re-running connect
    // doesn't duplicate rows.
    if (connectResult.devices.length > 0) {
      const deviceRows = connectResult.devices.map((d) => ({
        integration_id: integrationId,
        home_id: homeId,
        external_device_id: d.externalDeviceId,
        name: d.name,
        device_type: d.family,
        provider,
        metadata: d.metadata,
        is_active: true,
      }));
      const { error: devicesErr } = await db
        .from("devices")
        .upsert(deviceRows, { onConflict: "integration_id,external_device_id" });
      if (devicesErr) {
        throw new Error(`failed_to_save_devices: ${devicesErr.message}`);
      }
    }

    // Stamp the webhook URL with the actual host (the adapter returns a
    // placeholder host because it can't read environment vars cleanly).
    const appOrigin = (appOriginIn && /^https?:\/\//.test(appOriginIn))
      ? appOriginIn.replace(/\/$/, "")
      : supabaseUrl.replace(/\/$/, "");
    let postConnect = connectResult.postConnect ?? null;
    if (postConnect?.webhookUrl) {
      postConnect = {
        ...postConnect,
        webhookUrl: postConnect.webhookUrl.replace("__BASE__", appOrigin),
      };
    }

    log(FN, "integration_created", {
      provider,
      home_id: homeId,
      devices_discovered: connectResult.devices.length,
    });

    return new Response(
      JSON.stringify({
        integrationId,
        devices: connectResult.devices.map((d) => ({
          externalDeviceId: d.externalDeviceId,
          name: d.name,
          family: d.family,
          metadata: d.metadata,
        })),
        postConnect,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    logError(FN, "error", { message: err instanceof Error ? err.message : String(err) });
    await captureException(FN, err);
    return new Response(
      JSON.stringify({ error: "internal" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
