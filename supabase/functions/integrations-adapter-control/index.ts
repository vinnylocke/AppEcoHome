/**
 * integrations-adapter-control
 *
 * Provider-generic valve control dispatcher (Phase 3 follow-up). Mirrors
 * `integrations-ewelink-control` but routes through the ProviderAdapter
 * contract so any adapter implementing `control()` (today: custom_http)
 * is actuated without a per-provider edge function.
 *
 * Request body:
 *   { deviceId: string; command: "turn_on" | "turn_off"; durationSeconds?: number }
 *
 * Auth: caller JWT + home membership (parity with eWeLink control — the
 * finer-grained `integrations.control` permission is enforced client-side
 * by the panel; server membership is the backstop). On success it records
 * a `device_commands` row + an optimistic valve `device_readings` row and
 * returns `{ success, autoOffAt }`.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptCredentials } from "../_shared/integrations/encrypt.ts";
import { insertReading } from "../_shared/integrations/readings.ts";
import { getAdapter } from "../_shared/integrations/registry.ts";
import type { ControlCommand, DeviceRow } from "../_shared/integrations/contract.ts";
import type { ValveReading } from "../_shared/integrations/providerTypes.ts";
import { captureException } from "../_shared/sentry.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

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

    const { deviceId, command, durationSeconds } = await req.json() as {
      deviceId: string;
      command: "turn_on" | "turn_off";
      durationSeconds?: number;
    };
    if (!deviceId || (command !== "turn_on" && command !== "turn_off")) {
      return json({ error: "deviceId and a valid command are required" }, 400);
    }

    // ── Load device (must be a valve) ───────────────────────────────────────
    const { data: device } = await db
      .from("devices")
      .select("id, home_id, integration_id, external_device_id, name, device_type, metadata, area_id, provider")
      .eq("id", deviceId)
      .eq("device_type", "water_valve")
      .single();
    if (!device) return json({ error: "Device not found" }, 404);

    // ── Membership ──────────────────────────────────────────────────────────
    const { data: membership } = await db
      .from("home_members")
      .select("user_id")
      .eq("home_id", device.home_id)
      .eq("user_id", user.id)
      .single();
    if (!membership) return json({ error: "Forbidden" }, 403);

    // ── Adapter must support control ────────────────────────────────────────
    const adapter = getAdapter(device.provider as string);
    if (!adapter || typeof adapter.control !== "function") {
      return json({ error: "Control not supported for this device" }, 400);
    }

    // ── Decrypt the integration's control creds ─────────────────────────────
    const { data: integration } = await db
      .from("integrations")
      .select("id, credentials_encrypted")
      .eq("id", device.integration_id)
      .single();
    if (!integration) throw new Error("Integration not found");

    let creds: Record<string, string> = {};
    try {
      if (integration.credentials_encrypted) {
        creds = await decryptCredentials(integration.credentials_encrypted as string);
      }
    } catch {
      return json({ error: "Failed to read device credentials" }, 500);
    }

    // ── Resolve duration + build the contract command ───────────────────────
    const meta = (device.metadata ?? {}) as Record<string, unknown>;
    const metaDefault = typeof meta.default_duration_seconds === "number"
      ? meta.default_duration_seconds
      : 1800;
    const duration = command === "turn_on"
      ? (typeof durationSeconds === "number" && durationSeconds > 0 ? durationSeconds : metaDefault)
      : 0;

    const controlCommand: ControlCommand = command === "turn_on"
      ? { kind: "valve_open", duration_seconds: duration }
      : { kind: "valve_close" };

    const deviceRow: DeviceRow = {
      id: device.id as string,
      external_device_id: device.external_device_id as string,
      name: (device.name as string) ?? "",
      device_type: "water_valve",
      metadata: meta,
      area_id: (device.area_id as string | null) ?? null,
    };

    // ── Actuate ─────────────────────────────────────────────────────────────
    try {
      await adapter.control(deviceRow, controlCommand, creds);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Record the failed attempt for the timeline, then surface the reason.
      await db.from("device_commands").insert({
        device_id: deviceId,
        home_id: device.home_id,
        issued_by: user.id,
        command,
        parameters: command === "turn_on" ? { duration_seconds: duration } : {},
        auto_off_at: null,
        status: "failed",
        error_message: msg,
        acknowledged_at: null,
      });
      return json({ error: msg }, 502);
    }

    // ── Persist success: command row + optimistic state reading ─────────────
    const now = new Date();
    const autoOffAt = command === "turn_on" ? new Date(now.getTime() + duration * 1000) : null;

    await db.from("device_commands").insert({
      device_id: deviceId,
      home_id: device.home_id,
      issued_by: user.id,
      command,
      parameters: command === "turn_on" ? { duration_seconds: duration } : {},
      auto_off_at: autoOffAt?.toISOString() ?? null,
      status: "success",
      error_message: null,
      acknowledged_at: now.toISOString(),
    });

    const reading: ValveReading = { state: command === "turn_on" ? "on" : "off" };
    await insertReading({ db, deviceId, homeId: device.home_id as string, data: reading, recordedAt: now });

    return json({ success: true, autoOffAt: autoOffAt?.toISOString() ?? null });
  } catch (err) {
    console.error("integrations-adapter-control error:", err);
    await captureException("integrations-adapter-control", err);
    return json({ error: "Internal server error" }, 500);
  }
});
