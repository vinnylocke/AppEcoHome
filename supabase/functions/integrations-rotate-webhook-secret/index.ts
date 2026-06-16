/**
 * integrations-rotate-webhook-secret
 *
 * Generates a new 256-bit webhook secret for a custom_http integration
 * and writes it to `integrations.metadata.webhook_secret`. Returns the
 * new full webhook URL so the caller can immediately show it to the
 * user.
 *
 * Used by the "Regenerate" button in DeviceSettings → Webhook details
 * panel. The old secret stops working the moment this returns —
 * documented in the UI confirmation modal.
 *
 * Authentication: JWT-verified (default for edge fns). The caller must
 * be a member of the home that owns the integration.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { log, error as logError } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import { requireAuth } from "../_shared/requireAuth.ts";

const FN = "integrations-rotate-webhook-secret";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function generateWebhookSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

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
    const integrationId = typeof body?.integrationId === "string" ? body.integrationId : null;
    const appOriginIn = typeof body?.appOrigin === "string" ? body.appOrigin : null;
    if (!integrationId) {
      return new Response(
        JSON.stringify({ error: "missing_integration_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Fetch integration + verify membership in one round-trip.
    const { data: integration } = await db
      .from("integrations")
      .select("id, home_id, provider, metadata")
      .eq("id", integrationId)
      .maybeSingle();
    if (!integration) {
      return new Response(
        JSON.stringify({ error: "integration_not_found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if ((integration as { provider: string }).provider !== "custom_http") {
      return new Response(
        JSON.stringify({ error: "rotation_unsupported_for_provider" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: membership } = await db
      .from("home_members")
      .select("role")
      .eq("home_id", (integration as { home_id: string }).home_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!membership) {
      return new Response(
        JSON.stringify({ error: "forbidden" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const newSecret = generateWebhookSecret();
    const existingMetadata = (integration as { metadata: Record<string, unknown> | null }).metadata ?? {};
    const nextMetadata = { ...existingMetadata, webhook_secret: newSecret };

    const { error: updateErr } = await db
      .from("integrations")
      .update({ metadata: nextMetadata })
      .eq("id", integrationId);
    if (updateErr) {
      throw new Error(`failed_to_update_secret: ${updateErr.message}`);
    }

    const appOrigin = (appOriginIn && /^https?:\/\//.test(appOriginIn))
      ? appOriginIn.replace(/\/$/, "")
      : supabaseUrl.replace(/\/$/, "");
    const webhookUrl = `${appOrigin}/functions/v1/integrations-webhook-router/custom_http/${newSecret}`;

    log(FN, "secret_rotated", {
      integration_id: integrationId,
      home_id: (integration as { home_id: string }).home_id,
    });

    return new Response(
      JSON.stringify({ webhookUrl, secret: newSecret }),
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
