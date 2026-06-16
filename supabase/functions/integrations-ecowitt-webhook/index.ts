/**
 * integrations-ecowitt-webhook
 *
 * Public endpoint that Ecowitt gateways POST readings to every ~16 minutes.
 * The gateway sends multipart/form-data with all sensor channels.
 *
 * Security: Ecowitt includes a token (passphrase) in the POST body that must
 * match ECOWITT_WEBHOOK_SECRET.
 *
 * Reading shape stored per WH51 channel:
 *   { soil_temp: number, soil_moisture: number, soil_ec: number }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { insertReading } from "../_shared/integrations/readings.ts";
import type { SoilReading } from "../_shared/integrations/providerTypes.ts";
import { parseSoilChannels } from "../_shared/integrations/ecowittFields.ts";
import { captureException } from "../_shared/sentry.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── Parse form body ─────────────────────────────────────────────────────
    const contentType = req.headers.get("content-type") ?? "";
    let fields: Record<string, string> = {};

    if (contentType.includes("application/x-www-form-urlencoded")) {
      const text = await req.text();
      fields = Object.fromEntries(new URLSearchParams(text));
    } else if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      for (const [k, v] of formData.entries()) {
        fields[k] = v.toString();
      }
    } else {
      // Some firmware versions send JSON
      try { fields = await req.json(); } catch { /* ignore */ }
    }

    // ── Verify passphrase ───────────────────────────────────────────────────
    const expectedToken = Deno.env.get("ECOWITT_WEBHOOK_SECRET") ?? "";
    const receivedToken = fields["PASSKEY"] ?? fields["passkey"] ?? fields["token"] ?? "";

    if (expectedToken && receivedToken !== expectedToken) {
      console.warn("Ecowitt webhook: invalid passphrase");
      return new Response("Forbidden", { status: 403 });
    }

    // ── Identify gateway ────────────────────────────────────────────────────
    const gatewayMac = (fields["PASSKEY"] ? fields["stationtype"] : null)
      ?? fields["mac"]
      ?? fields["MAC"]
      ?? "";

    // Ecowitt sends PASSKEY as a per-device token, MAC as the actual hardware address.
    // Fall back to looking up by PASSKEY as the integration lookup key.
    const macAddr = fields["STATIONTYPE"] ?? fields["mac"] ?? fields["MAC"] ?? fields["PASSKEY"] ?? "";

    // ── Parse soil sensor channels via shared field parser ─────────────────
    // 2026-06-16 — WH52 support. The parser handles both WH51 (raw ADC
    // EC) and WH52 (calibrated µS/cm EC) field shapes + multiple
    // candidate field-name spellings. See ecowittFields.test.ts.
    const channels = parseSoilChannels(fields);

    if (channels.length === 0) {
      // 2026-06-16 — Log unknown payloads at info level so when the
      // user's WH52 first calls in, we can grab the raw field names
      // from Supabase function logs and confirm / extend the parser's
      // CALIBRATED_EC_FIELDS list if needed.
      const knownPasskeys = new Set(["PASSKEY", "passkey", "token", "stationtype", "STATIONTYPE", "mac", "MAC"]);
      const unknownKeys = Object.keys(fields).filter((k) => !knownPasskeys.has(k));
      if (unknownKeys.length > 0) {
        console.info("Ecowitt webhook: no soil channels parsed — unknown payload shape", {
          field_count: unknownKeys.length,
          sample_keys: unknownKeys.slice(0, 30),
        });
      }
      return new Response("ok", { status: 200 });
    }

    // ── For each channel, find the device and insert a reading ──────────────
    const recordedAt = new Date();

    for (const ch of channels) {
      // Look up the device by channel in metadata. Single query per
      // payload — could be cached, but webhooks fire every ~16 min so
      // optimisation isn't worth the complexity yet.
      const { data: deviceRows } = await db
        .from("devices")
        .select("id, home_id, metadata")
        .eq("device_type", "soil_sensor")
        .eq("provider", "ecowitt");

      const device = (deviceRows ?? []).find(
        (d) => d.metadata?.channel === ch.channel,
      );

      if (!device) {
        console.warn(`Ecowitt webhook: no device found for soil channel ${ch.channel}`);
        continue;
      }

      const reading: SoilReading = {
        soil_temp: ch.soil_temp,
        soil_moisture: ch.soil_moisture,
        soil_ec: ch.soil_ec,
        ec_source: ch.ec_source,
        ...(ch.battery_percent !== null ? { battery_percent: ch.battery_percent } : {}),
      };

      await insertReading({
        db,
        deviceId: device.id,
        homeId: device.home_id,
        data: reading,
        recordedAt,
      });
    }

    return new Response("ok", { status: 200 });
  } catch (err) {
    console.error("integrations-ecowitt-webhook error:", err);
    await captureException("integrations-ecowitt-webhook", err);
    return new Response("Internal server error", { status: 500 });
  }
});
