import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { callGeminiCascade, toMessages } from "../_shared/gemini.ts";
import { log, error as logError } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import { guardAiByHome } from "../_shared/aiGuard.ts";
import { logAiUsage } from "../_shared/aiUsage.ts";
import { requireAuth } from "../_shared/requireAuth.ts";
import { enforceRateLimit } from "../_shared/rateLimit.ts";
import { requireHomeMembership } from "../_shared/requireHomeMembership.ts";
import {
  buildAreaAnalysisPrompt,
  parseAreaInsight,
  shouldRegenerate,
  AREA_ANALYSIS_SCHEMA,
  AREA_ANALYSIS_SYSTEM_PROMPT,
  type AreaAnalysisInput,
  type SensorLatest,
} from "../_shared/areaAnalysisPrompt.ts";

const FN = "area-sensor-analysis";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

interface SoilData {
  soil_moisture?: number;
  soil_temp?: number;
  soil_ec?: number;
  ec_source?: "calibrated_us_cm" | "raw_adc";
}

function stat(values: number[]): { min: number; max: number; avg: number } | null {
  if (values.length === 0) return null;
  let min = values[0], max = values[0], sum = 0;
  for (const v of values) { if (v < min) min = v; if (v > max) max = v; sum += v; }
  return { min, max, avg: sum / values.length };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY")!;
    const db = createClient(supabaseUrl, serviceKey);

    const authResult = await requireAuth(req, db);
    if (authResult instanceof Response) return authResult;
    const userId = authResult.user.id;

    const { homeId, areaId, force } = await req.json() as {
      homeId: string; areaId: string; force?: boolean;
    };
    if (!homeId || !areaId) return json({ error: "homeId and areaId are required" }, 400);

    const membershipRes = await requireHomeMembership(db, homeId, userId);
    if (membershipRes) return membershipRes;

    const aiGuardRes = await guardAiByHome(db, homeId);
    if (aiGuardRes) return aiGuardRes;

    // ── Gather context ──────────────────────────────────────────────────────
    const [
      { data: areaRow },
      { data: homeRow },
      { data: inventory },
      { data: devices },
      { data: profile },
    ] = await Promise.all([
      db.from("areas")
        .select("id, name, growing_medium, medium_ph, locations(is_outside)")
        .eq("id", areaId).maybeSingle(),
      db.from("homes").select("id, hardiness_zone, climate_zone").eq("id", homeId).maybeSingle(),
      db.from("inventory_items")
        .select("id, plant_name, plant_id")
        .eq("home_id", homeId).eq("area_id", areaId),
      db.from("devices")
        .select("id, name, provider")
        .eq("home_id", homeId).eq("area_id", areaId).eq("device_type", "soil_sensor"),
      db.from("user_profiles").select("persona").eq("uid", userId).maybeSingle(),
    ]);

    if (!areaRow) return json({ error: "Area not found" }, 404);

    const deviceIds = (devices ?? []).map((d: { id: string }) => d.id);

    // Readings over the last 30 days for the area's sensors.
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
    let readings: Array<{ device_id: string; recorded_at: string; data: SoilData }> = [];
    if (deviceIds.length > 0) {
      const { data } = await db.from("device_readings")
        .select("device_id, recorded_at, data")
        .in("device_id", deviceIds)
        .gte("recorded_at", thirtyDaysAgo)
        .order("recorded_at", { ascending: false })
        .limit(2000);
      readings = (data ?? []) as typeof readings;
    }
    const latestReadingAt = readings.length > 0 ? readings[0].recorded_at : null;

    // ── Cache check ─────────────────────────────────────────────────────────
    const { data: cached } = await db
      .from("area_ai_insights")
      .select("insight, based_on_reading_at, generated_at, persona")
      .eq("area_id", areaId)
      .maybeSingle();

    if (cached && !shouldRegenerate(cached.based_on_reading_at as string | null, latestReadingAt, !!force)) {
      return json({
        insight: cached.insight,
        cached: true,
        basedOnReadingAt: cached.based_on_reading_at,
        generatedAt: cached.generated_at,
        persona: cached.persona,
      });
    }

    // Nothing to analyse — no sensors and no plants.
    if (deviceIds.length === 0 && (inventory ?? []).length === 0) {
      return json({ insight: null, empty: true });
    }

    // Only regenerating from here → rate-limit (serving cache above is free).
    const rateLimitRes = await enforceRateLimit(db, userId, FN);
    if (rateLimitRes) return rateLimitRes;

    // ── Derive current summary + history stats ──────────────────────────────
    const latestPerDevice = new Map<string, { data: SoilData; recorded_at: string }>();
    for (const r of readings) {
      if (!latestPerDevice.has(r.device_id)) latestPerDevice.set(r.device_id, { data: r.data, recorded_at: r.recorded_at });
    }
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    const latestMoist: number[] = [], latestTemp: number[] = [], latestEc: number[] = [];
    let ecSource: "calibrated_us_cm" | "raw_adc" = "raw_adc";
    for (const { data } of latestPerDevice.values()) {
      const m = num(data.soil_moisture); if (m !== null) latestMoist.push(m);
      const t = num(data.soil_temp); if (t !== null) latestTemp.push(t);
      const e = num(data.soil_ec); if (e !== null) latestEc.push(e);
      if (data.ec_source === "calibrated_us_cm") ecSource = "calibrated_us_cm";
    }
    const avg = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);

    const histMoist: number[] = [], histTemp: number[] = [], histEc: number[] = [];
    for (const r of readings) {
      const m = num(r.data.soil_moisture); if (m !== null) histMoist.push(m);
      const t = num(r.data.soil_temp); if (t !== null) histTemp.push(t);
      const e = num(r.data.soil_ec); if (e !== null) histEc.push(e);
    }

    // ── Plant care (soil pH ranges) ─────────────────────────────────────────
    const plantIds = [...new Set((inventory ?? []).map((i: { plant_id: number | null }) => i.plant_id).filter((x): x is number => typeof x === "number"))];
    const careById = new Map<number, { soil_ph_min: number | null; soil_ph_max: number | null }>();
    if (plantIds.length > 0) {
      const { data: care } = await db.from("plants").select("id, soil_ph_min, soil_ph_max").in("id", plantIds);
      for (const c of care ?? []) careById.set(c.id as number, { soil_ph_min: c.soil_ph_min, soil_ph_max: c.soil_ph_max });
    }

    // ── Automations for this area ───────────────────────────────────────────
    // An automation is "in" this area if EITHER it's scoped directly by area_id
    // (sensor-threshold automations) OR it controls a device (valve/sensor) that
    // lives in this area (time-scheduled valve automations link via
    // automation_devices, leaving automations.area_id NULL).
    const automations: AreaAnalysisInput["automations"] = [];
    {
      // All devices physically in this area (valves + sensors).
      const { data: areaDevices } = await db.from("devices")
        .select("id").eq("home_id", homeId).eq("area_id", areaId);
      const areaDeviceIds = (areaDevices ?? []).map((d: { id: string }) => d.id);

      let deviceLinkedIds: string[] = [];
      if (areaDeviceIds.length > 0) {
        const { data: ad } = await db.from("automation_devices")
          .select("automation_id").in("device_id", areaDeviceIds);
        deviceLinkedIds = (ad ?? []).map((r: { automation_id: string }) => r.automation_id);
      }

      const [{ data: byArea }, byDeviceRes] = await Promise.all([
        db.from("automations")
          .select("id, name, is_active, trigger_kind, sensor_metric, sensor_threshold_value, duration_seconds")
          .eq("home_id", homeId).eq("area_id", areaId),
        deviceLinkedIds.length > 0
          ? db.from("automations")
              .select("id, name, is_active, trigger_kind, sensor_metric, sensor_threshold_value, duration_seconds")
              .in("id", deviceLinkedIds)
          : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      ]);

      const merged = [...(byArea ?? []), ...((byDeviceRes.data ?? []))] as Array<{
        id: string; name: string; is_active: boolean; trigger_kind: string | null;
        sensor_metric: string | null; sensor_threshold_value: number | null; duration_seconds: number | null;
      }>;
      const dedup = new Map<string, typeof merged[number]>();
      for (const r of merged) if (!dedup.has(r.id)) dedup.set(r.id, r);

      // Count the recurring care tasks (blueprints) each automation drives.
      const autoIds = [...dedup.keys()];
      const taskCountById = new Map<string, number>();
      if (autoIds.length > 0) {
        const { data: ab } = await db.from("automation_blueprints")
          .select("automation_id").in("automation_id", autoIds);
        for (const r of ab ?? []) {
          const id = r.automation_id as string;
          taskCountById.set(id, (taskCountById.get(id) ?? 0) + 1);
        }
      }

      for (const r of dedup.values()) {
        const isMoisture = r.sensor_metric === "soil_moisture";
        automations.push({
          name: r.name,
          isActive: !!r.is_active,
          triggerKind: r.trigger_kind ?? null,
          moistureThresholdPct: isMoisture ? r.sensor_threshold_value : null,
          valveDurationSeconds: r.duration_seconds ?? null,
          linkedTaskCount: taskCountById.get(r.id) ?? 0,
        });
      }
    }

    // ── Build input + prompt ────────────────────────────────────────────────
    const input: AreaAnalysisInput = {
      persona: (profile?.persona as "new" | "experienced" | null) ?? null,
      area: {
        name: (areaRow as { name: string }).name,
        isOutside: !!(areaRow as { locations?: { is_outside?: boolean } }).locations?.is_outside,
        growingMedium: (areaRow as { growing_medium?: string | null }).growing_medium ?? null,
        mediumPh: (areaRow as { medium_ph?: number | null }).medium_ph ?? null,
        climateZone: (homeRow as { climate_zone?: string | null })?.climate_zone ?? null,
      },
      home: { hardinessZone: (homeRow as { hardiness_zone?: number | null })?.hardiness_zone ?? null },
      summary: {
        avgMoisture: avg(latestMoist),
        avgTemp: avg(latestTemp),
        avgEc: avg(latestEc),
        ecSource,
        sensorsWithData: latestPerDevice.size,
      },
      sensors: (devices ?? []).map((d: { id: string; name: string; provider: string }) => {
        const l = latestPerDevice.get(d.id);
        const latest: SensorLatest | null = l && l.data.soil_moisture != null
          ? {
              soil_moisture: l.data.soil_moisture ?? 0,
              soil_temp: l.data.soil_temp ?? 0,
              soil_ec: l.data.soil_ec ?? 0,
              ec_source: l.data.ec_source ?? "raw_adc",
              recorded_at: l.recorded_at,
            }
          : null;
        return { name: d.name, provider: d.provider, latest };
      }),
      history: readings.length > 0
        ? {
            windowDays: 30,
            readings: readings.length,
            moisture: stat(histMoist),
            temp: stat(histTemp),
            ec: stat(histEc),
          }
        : null,
      plants: (inventory ?? []).map((i: { plant_name: string; plant_id: number | null }) => {
        const care = i.plant_id != null ? careById.get(i.plant_id) : undefined;
        return {
          name: i.plant_name,
          health: null,
          soilPhMin: care?.soil_ph_min ?? null,
          soilPhMax: care?.soil_ph_max ?? null,
        };
      }),
      automations,
    };

    const prompt = buildAreaAnalysisPrompt(input);

    // ── Gemini ──────────────────────────────────────────────────────────────
    const { text, usage } = await callGeminiCascade(
      geminiApiKey,
      FN,
      toMessages([prompt]),
      {
        systemPrompt: AREA_ANALYSIS_SYSTEM_PROMPT,
        responseSchema: AREA_ANALYSIS_SCHEMA,
        responseMimeType: "application/json",
        temperature: 0.4,
        maxOutputTokens: 2048,
        logContext: { homeId, areaId },
      },
    );
    await logAiUsage(db, { userId, homeId, functionName: FN, action: "area_analysis", usage });

    const insight = parseAreaInsight(text);
    if (!insight) {
      logError(FN, "parse_failed", { text: text.slice(0, 200) });
      return json({ error: "analysis_failed" }, 502);
    }

    const generatedAt = new Date().toISOString();
    await db.from("area_ai_insights").upsert({
      area_id: areaId,
      home_id: homeId,
      insight,
      based_on_reading_at: latestReadingAt,
      persona: input.persona,
      model: "gemini",
      generated_at: generatedAt,
    }, { onConflict: "area_id" });

    log(FN, "generated", { home_id: homeId, area_id: areaId, sensors: deviceIds.length, plants: (inventory ?? []).length });

    return json({
      insight,
      cached: false,
      basedOnReadingAt: latestReadingAt,
      generatedAt,
      persona: input.persona,
    });
  } catch (err) {
    logError(FN, "error", { message: err instanceof Error ? err.message : String(err) });
    await captureException(FN, err);
    return json({ error: "internal" }, 500);
  }
});
