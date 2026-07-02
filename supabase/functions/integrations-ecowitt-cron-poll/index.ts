/**
 * integrations-ecowitt-cron-poll
 *
 * 2026-06-16 — Scheduled background poll for every active Ecowitt
 * integration. Runs every 15 minutes via pg_cron so users don't have to
 * tap Refresh; matches the Ecowitt gateway's default ~16 min upload
 * cadence to its own cloud.
 *
 * Cron only (verify_jwt = false). Internal logic uses the service role
 * to walk integrations across all homes — no per-user auth needed.
 *
 * Per-integration error handling: a single bad gateway logs to Sentry,
 * the rest of the batch still runs. Idempotent: insertReading writes a
 * fresh device_readings row each call + updates devices.last_seen_at,
 * which makes the device card flip back to "Online" within the same
 * 15-min window.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { log, error as logError } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import { decryptCredentials } from "../_shared/integrations/encrypt.ts";
import { insertReading } from "../_shared/integrations/readings.ts";
import {
  flattenRealTimeSoilwetness,
  parseSoilChannels,
} from "../_shared/integrations/ecowittFields.ts";
import type { SoilReading } from "../_shared/integrations/providerTypes.ts";

const FN = "integrations-ecowitt-cron-poll";
const ECOWITT_API_BASE = "https://api.ecowitt.net/api/v3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface IntegrationRow {
  id: string;
  home_id: string;
  credentials_encrypted: string;
}

interface DeviceRow {
  id: string;
  home_id: string;
  metadata: { channel?: number; gateway_mac?: string } | null;
}

async function pollIntegration(
  db: ReturnType<typeof createClient>,
  integration: IntegrationRow,
  recordedAt: Date,
): Promise<{ synced: number; macs: number }> {
  const { applicationKey, apiKey } = await decryptCredentials(
    integration.credentials_encrypted,
  );

  const { data: devices } = await db
    .from("devices")
    .select("id, home_id, metadata")
    .eq("integration_id", integration.id)
    .eq("device_type", "soil_sensor")
    .eq("is_active", true);

  if (!devices?.length) return { synced: 0, macs: 0 };

  // Group devices by gateway MAC so we hit the Ecowitt API once per
  // gateway, not once per channel.
  const byMac: Record<string, DeviceRow[]> = {};
  for (const d of devices as DeviceRow[]) {
    const mac = d.metadata?.gateway_mac ?? "";
    if (!mac) continue;
    (byMac[mac] ??= []).push(d);
  }

  let synced = 0;
  let macs = 0;

  for (const [mac, macDevices] of Object.entries(byMac)) {
    const url = new URL(`${ECOWITT_API_BASE}/device/real_time`);
    url.searchParams.set("application_key", applicationKey);
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("mac", mac.toUpperCase());
    url.searchParams.set("call_back", "all");

    // Timeout: one hung Ecowitt request must not stall the whole fleet poll.
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) continue;

    const json = await res.json();
    if (json.code !== 0 || !json.data || typeof json.data !== "object") continue;

    macs += 1;
    const flat = flattenRealTimeSoilwetness(json.data as Record<string, unknown>);
    const channels = parseSoilChannels(flat);
    const byChannel = new Map(channels.map((c) => [c.channel, c]));

    for (const device of macDevices) {
      const channelNum = Number(device.metadata?.channel ?? 0);
      const ch = byChannel.get(channelNum);
      if (!ch) continue;

      const reading: SoilReading = {
        soil_temp: ch.soil_temp,
        soil_moisture: ch.soil_moisture,
        soil_ec: ch.soil_ec,
        ec_source: ch.ec_source,
        ...(ch.battery_percent !== null ? { battery_percent: ch.battery_percent } : {}),
      };

      // Diagnostic so we can spot gateways that send unusual soilbattN
      // values (e.g. a centivolt scale we haven't seen yet). Info level
      // so it doesn't drown the logs.
      log("integrations-ecowitt-cron-poll", "battery_diagnostic", {
        device_id: device.id,
        channel: ch.channel,
        battery_percent: ch.battery_percent,
        raw_value: ch.batteryDiagnostic.soilbattRawValue,
        out_of_range_value: ch.batteryDiagnostic.outOfRangeValue,
      });

      await insertReading({
        db,
        deviceId: device.id,
        homeId: device.home_id,
        data: reading,
        recordedAt,
      });
      synced += 1;
    }
  }

  // Stamp the integration's last_synced_at so the UI knows when the
  // background poll last ran (different from any individual device's
  // last_seen_at).
  await db
    .from("integrations")
    .update({
      last_synced_at: recordedAt.toISOString(),
      status: "active",
      error_message: null,
    })
    .eq("id", integration.id);

  return { synced, macs };
}

serve(async (_req: Request) => {
  try {
    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Poll "error" integrations too: the failure handler below demotes to
    // status='error', and nothing else automated ever restores 'active' —
    // one transient Ecowitt blip at 03:00 silently stopped a user's soil
    // readings until they noticed and tapped "Sync now". A successful poll
    // re-stamps status='active' (see pollIntegration), so errored setups
    // self-heal on the next tick once the API recovers.
    const { data: integrations, error: intErr } = await db
      .from("integrations")
      .select("id, home_id, credentials_encrypted")
      .eq("provider", "ecowitt")
      .in("status", ["active", "error"]);

    if (intErr) throw intErr;

    const recordedAt = new Date();
    let totalSynced = 0;
    let totalGateways = 0;
    let failedIntegrations = 0;

    for (const integration of (integrations ?? []) as IntegrationRow[]) {
      try {
        const { synced, macs } = await pollIntegration(db, integration, recordedAt);
        totalSynced += synced;
        totalGateways += macs;
      } catch (err) {
        failedIntegrations += 1;
        await captureException(FN, err, { integration_id: integration.id });
        // Best-effort — mark the integration as errored but don't take
        // it inactive. A transient API hiccup shouldn't deactivate a
        // user's setup.
        await db
          .from("integrations")
          .update({
            status: "error",
            error_message:
              err instanceof Error ? err.message : String(err),
          })
          .eq("id", integration.id);
      }
    }

    log(FN, "complete", {
      integrations_processed: integrations?.length ?? 0,
      gateways_polled: totalGateways,
      readings_inserted: totalSynced,
      failed_integrations: failedIntegrations,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        integrations: integrations?.length ?? 0,
        gateways: totalGateways,
        readings: totalSynced,
        failed: failedIntegrations,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    logError(FN, "fatal", {
      message: err instanceof Error ? err.message : String(err),
    });
    await captureException(FN, err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : String(err),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
