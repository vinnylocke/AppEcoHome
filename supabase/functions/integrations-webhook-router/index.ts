/**
 * integrations-webhook-router
 *
 * 2026-06-16 Phase 3 — single public endpoint that dispatches inbound
 * webhooks to the right adapter. Today only the `custom_http` adapter
 * registers, but the router is provider-agnostic — adding a new
 * webhook-capable provider only requires registering it in the
 * adapter registry.
 *
 * URL shapes accepted:
 *   POST /integrations-webhook-router/<provider>?token=<secret>
 *   POST /integrations-webhook-router/<provider>/<secret>
 *
 * The secret can also be passed via the `X-Rhozly-Token` header for
 * firmware that struggles with custom path segments. Header wins when
 * both are present (the path token is then ignored).
 *
 * Auth model: each integration stores a 256-bit webhook secret on
 * `integrations.metadata.webhook_secret`. The router looks up the
 * integration by exact secret match. Tokens are revocable from Device
 * Settings (regenerates the secret).
 *
 * verify_jwt = false (config.toml) — public endpoint, secret is the auth.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { log, error as logError } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import { insertReading } from "../_shared/integrations/readings.ts";
import { getAdapter } from "../_shared/integrations/registry.ts";
import { extractAuth } from "../_shared/integrations/webhookAuth.ts";

const FN = "integrations-webhook-router";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-rhozly-token",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const auth = extractAuth(req);
    if (!auth) {
      return new Response(
        JSON.stringify({ error: "missing_auth", message: "Pass the webhook secret as a path segment, ?token=…, or the X-Rhozly-Token header." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const adapter = getAdapter(auth.provider);
    if (!adapter) {
      return new Response(
        JSON.stringify({ error: "unknown_provider", provider: auth.provider }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!adapter.parseWebhook) {
      return new Response(
        JSON.stringify({ error: "provider_does_not_accept_webhooks", provider: auth.provider }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Look up the integration by webhook secret stored in metadata.
    // 256-bit secret → exact-match comparison via jsonb.
    const { data: integration } = await db
      .from("integrations")
      .select("id, home_id, metadata, status")
      .eq("provider", auth.provider)
      .eq("metadata->>webhook_secret", auth.token)
      .maybeSingle();

    if (!integration) {
      // Don't leak whether the provider exists or the token is wrong —
      // both return 401.
      return new Response(
        JSON.stringify({ error: "invalid_token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if ((integration as { status: string }).status !== "active") {
      return new Response(
        JSON.stringify({ error: "integration_inactive" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Adapter parses + validates the body, returning normalised readings.
    let readings;
    try {
      readings = await adapter.parseWebhook(
        req.clone(),
        (integration as { metadata: Record<string, unknown> }).metadata ?? {},
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return new Response(
        JSON.stringify({ error: "payload_error", message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Resolve devices + write readings. We look up by
    // (integration_id, external_device_id) so a single integration can
    // host multiple devices (the user creates them through the wizard).
    const homeId = (integration as { home_id: string }).home_id;
    const integrationId = (integration as { id: string }).id;

    let written = 0;
    for (const r of readings) {
      const { data: device } = await db
        .from("devices")
        .select("id")
        .eq("integration_id", integrationId)
        .eq("external_device_id", r.externalDeviceId)
        .maybeSingle();
      if (!device) {
        // Unknown device id — skip silently. The user may have renamed
        // the device since wiring the webhook; logging this at info
        // level so we can spot it without spamming Sentry.
        log(FN, "device_not_found", {
          integration_id: integrationId,
          external_device_id: r.externalDeviceId,
        });
        continue;
      }
      await insertReading({
        db,
        deviceId: (device as { id: string }).id,
        homeId,
        data: r.data,
        recordedAt: new Date(r.recordedAt),
      });

      // Refresh devices.battery_percent + battery_reported_at if the
      // reading carried a battery_percent. Read history lives inside
      // device_readings.data (no separate table); these columns are
      // just a fast "latest known" cache for DeviceCard rendering.
      const battery = (r.data as { battery_percent?: unknown }).battery_percent;
      if (typeof battery === "number" && Number.isFinite(battery) && battery >= 0 && battery <= 100) {
        await db
          .from("devices")
          .update({
            battery_percent: Math.round(battery),
            battery_reported_at: r.recordedAt,
          })
          .eq("id", (device as { id: string }).id);
      }

      written += 1;
    }

    log(FN, "webhook_processed", {
      provider: auth.provider,
      integration_id: integrationId,
      readings_received: readings.length,
      readings_written: written,
    });

    return new Response(
      JSON.stringify({ ok: true, written }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    logError(FN, "fatal", {
      message: err instanceof Error ? err.message : String(err),
    });
    await captureException(FN, err);
    return new Response(
      JSON.stringify({ error: "internal" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
