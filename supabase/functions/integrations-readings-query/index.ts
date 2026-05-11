/**
 * integrations-readings-query
 *
 * Returns aggregated historical device readings for a chart period.
 * Aggregation level is chosen automatically based on the requested period:
 *   24h  → raw (every stored reading)
 *   7d   → hourly averages
 *   30d  → daily averages
 *   12m  → daily averages
 *   all  → daily averages
 *
 * Request body:
 *   { deviceId: string; period: AggregatePeriod }
 *
 * The caller's JWT is validated and home membership is verified before
 * returning any data — the device must belong to the caller's home.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { AggregatePeriod, AggregateLevel, ReadingsBucket, ReadingsQueryResponse } from "../_shared/integrations/providerTypes.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── Auth ────────────────────────────────────────────────────────────────
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

    // ── Parse body ──────────────────────────────────────────────────────────
    const { deviceId, period } = await req.json() as { deviceId: string; period: AggregatePeriod };
    if (!deviceId || !period) {
      return new Response(JSON.stringify({ error: "deviceId and period are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const validPeriods: AggregatePeriod[] = ["24h", "7d", "30d", "12m", "all"];
    if (!validPeriods.includes(period)) {
      return new Response(JSON.stringify({ error: "Invalid period" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Verify device belongs to caller's home ──────────────────────────────
    const { data: device, error: deviceError } = await db
      .from("devices")
      .select("id, home_id, device_type")
      .eq("id", deviceId)
      .single();

    if (deviceError || !device) {
      return new Response(JSON.stringify({ error: "Device not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: membership } = await db
      .from("home_members")
      .select("user_id")
      .eq("home_id", device.home_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Build query ─────────────────────────────────────────────────────────
    const now = new Date();
    let since: Date;
    let aggregate: AggregateLevel;
    let bucketTrunc: string;

    switch (period) {
      case "24h":
        since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        aggregate = "raw";
        bucketTrunc = "minute";
        break;
      case "7d":
        since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        aggregate = "hourly";
        bucketTrunc = "hour";
        break;
      case "30d":
        since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        aggregate = "daily";
        bucketTrunc = "day";
        break;
      case "12m":
        since = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        aggregate = "daily";
        bucketTrunc = "day";
        break;
      case "all":
      default:
        since = new Date(0);
        aggregate = "daily";
        bucketTrunc = "day";
        break;
    }

    // ── Fetch and aggregate ─────────────────────────────────────────────────
    let rows: ReadingsBucket[];

    if (aggregate === "raw") {
      const { data: rawRows, error: rawError } = await db
        .from("device_readings")
        .select("recorded_at, data")
        .eq("device_id", deviceId)
        .gte("recorded_at", since.toISOString())
        .order("recorded_at", { ascending: true });

      if (rawError) throw new Error(rawError.message);

      rows = (rawRows ?? []).map((r) => ({
        bucket: r.recorded_at,
        ...r.data,
      }));
    } else {
      // Use Postgres date_trunc aggregation via RPC
      const { data: aggRows, error: aggError } = await db.rpc("aggregate_device_readings", {
        p_device_id: deviceId,
        p_since: since.toISOString(),
        p_trunc: bucketTrunc,
        p_device_type: device.device_type,
      });

      if (aggError) throw new Error(aggError.message);

      rows = (aggRows ?? []) as ReadingsBucket[];
    }

    const result: ReadingsQueryResponse = {
      device_id: deviceId,
      device_type: device.device_type,
      period,
      aggregate,
      rows,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("integrations-readings-query error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
