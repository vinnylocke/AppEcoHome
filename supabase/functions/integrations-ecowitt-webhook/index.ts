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

    // ── Parse soil sensor channels ──────────────────────────────────────────
    // WH51 fields pattern: soilbatt{N}, soilmoisture{N}, soiltemp{N}F|C, soilad{N}
    // EC is derived from soilad (raw ADC) — or may come as soilad{N} directly.
    // Channel numbers are 1-based.

    const channelPattern = /^soilmoisture(\d+)$/i;
    const channelNums: number[] = [];
    for (const key of Object.keys(fields)) {
      const m = key.match(channelPattern);
      if (m) channelNums.push(parseInt(m[1], 10));
    }

    if (channelNums.length === 0) {
      // Not a soil sensor payload — ignore silently
      return new Response("ok", { status: 200 });
    }

    // ── For each channel, find the device and insert a reading ──────────────
    const recordedAt = new Date();

    for (const ch of channelNums) {
      const moisture = parseFloat(fields[`soilmoisture${ch}`] ?? "");
      const tempF = parseFloat(fields[`soiltemp${ch}f`] ?? fields[`soiltemp${ch}F`] ?? "");
      // EC from soilad is raw ADC; Ecowitt doesn't publish conversion.
      // Store raw value — firmware v3+ gateways may send soilad directly.
      const rawAd = parseFloat(fields[`soilad${ch}`] ?? "0");

      if (isNaN(moisture)) continue;

      // Convert Fahrenheit → Celsius if needed
      const tempC = isNaN(tempF) ? 0 : Math.round(((tempF - 32) * 5) / 9 * 10) / 10;

      // Look up the device by external ID pattern: {MAC}-soil-{channel}
      // We don't know the exact MAC format from the body, so search by integration provider.
      // Find devices with channel matching in metadata.
      const { data: deviceRows } = await db
        .from("devices")
        .select("id, home_id, metadata")
        .eq("device_type", "soil_sensor")
        .eq("provider", "ecowitt");

      const device = (deviceRows ?? []).find(
        (d) => d.metadata?.channel === ch,
      );

      if (!device) {
        console.warn(`Ecowitt webhook: no device found for soil channel ${ch}`);
        continue;
      }

      const reading: SoilReading = {
        soil_temp: tempC,
        soil_moisture: moisture,
        soil_ec: rawAd,
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
    return new Response("Internal server error", { status: 500 });
  }
});
