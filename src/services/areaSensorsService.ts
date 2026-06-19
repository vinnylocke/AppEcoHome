// 2026-06-16 — Area ↔ Sensor linkage Phase 1.
//
// Reads soil sensors linked to an area (via devices.area_id) and pulls
// their latest reading + a small history window for the metric tiles
// inside the area editor.
//
// Storage shape recap:
//   - devices: one row per linked sensor; metadata is provider-specific.
//   - device_readings: time-series rows keyed by device_id. `data` is
//     a jsonb with soil_temp / soil_moisture / soil_ec /
//     (optional) ec_source.
//
// The aggregation math (average across multiple linked sensors) lives
// in computeAreaMetricSummary so it can be unit-tested cleanly without
// touching Supabase.

import { supabase } from "../lib/supabase";

export type EcSource = "calibrated_us_cm" | "raw_adc";
export type TempDisplayUnit = "celsius" | "fahrenheit";

export interface LinkedSensor {
  device_id: string;
  name: string;
  provider: string;
  /** Optional display-unit preference stored in device.metadata. */
  display_temp_unit: TempDisplayUnit;
  /** Latest known reading. Null when the sensor has reported nothing yet. */
  latest: LinkedSensorReading | null;
}

export interface LinkedSensorReading {
  recorded_at: string;
  soil_temp: number;
  soil_moisture: number;
  soil_ec: number;
  ec_source: EcSource;
}

export interface AreaMetricSummary {
  /** Number of sensors with at least one reading. */
  sensors_with_data: number;
  /** Total linked sensors (including ones that haven't reported). */
  total_sensors: number;
  /** Averaged across `sensors_with_data`. NaN when zero sensors. */
  avg_soil_temp: number;
  avg_soil_moisture: number;
  avg_soil_ec: number;
  /** Discriminator for `avg_soil_ec`. If any sensor reports calibrated
   *  µS/cm we use that label; otherwise raw_adc. Mixed integrations
   *  (rare — WH51 + WH52 in the same area) fall back to raw_adc. */
  ec_source: EcSource;
}

/**
 * Compute the averaged area metric summary from a list of linked
 * sensors. Pure function — testable without Supabase. Skips sensors
 * with no reading.
 */
export function computeAreaMetricSummary(sensors: LinkedSensor[]): AreaMetricSummary {
  const withData = sensors.filter((s): s is LinkedSensor & { latest: LinkedSensorReading } => s.latest !== null);
  const n = withData.length;
  if (n === 0) {
    return {
      sensors_with_data: 0,
      total_sensors: sensors.length,
      avg_soil_temp: NaN,
      avg_soil_moisture: NaN,
      avg_soil_ec: NaN,
      ec_source: "raw_adc",
    };
  }

  let sumTemp = 0, sumMoist = 0, sumEc = 0;
  let allCalibrated = true;
  for (const s of withData) {
    sumTemp += s.latest.soil_temp;
    sumMoist += s.latest.soil_moisture;
    sumEc += s.latest.soil_ec;
    if (s.latest.ec_source !== "calibrated_us_cm") allCalibrated = false;
  }
  return {
    sensors_with_data: n,
    total_sensors: sensors.length,
    avg_soil_temp: sumTemp / n,
    avg_soil_moisture: sumMoist / n,
    avg_soil_ec: sumEc / n,
    ec_source: allCalibrated ? "calibrated_us_cm" : "raw_adc",
  };
}

/**
 * Fetch every soil sensor linked to `area_id` along with its latest
 * reading (one round-trip per device — for typical home setups this is
 * 1-4 devices so the cost is negligible; will be optimised with a
 * lateral join if N ever exceeds 10).
 */
export async function fetchAreaSensors(areaId: string): Promise<LinkedSensor[]> {
  const { data: devices, error: devErr } = await supabase
    .from("devices")
    .select("id, name, provider, metadata")
    .eq("area_id", areaId)
    .eq("device_type", "soil_sensor")
    .eq("is_active", true);
  if (devErr) throw devErr;
  if (!devices?.length) return [];

  const out: LinkedSensor[] = [];
  for (const dev of devices) {
    const { data: readings } = await supabase
      .from("device_readings")
      .select("recorded_at, data")
      .eq("device_id", dev.id)
      .order("recorded_at", { ascending: false })
      .limit(1);

    const r = readings?.[0];
    let latest: LinkedSensorReading | null = null;
    if (r && r.data && typeof r.data === "object") {
      const d = r.data as Record<string, unknown>;
      latest = {
        recorded_at: r.recorded_at,
        soil_temp: typeof d.soil_temp === "number" ? d.soil_temp : 0,
        soil_moisture: typeof d.soil_moisture === "number" ? d.soil_moisture : 0,
        soil_ec: typeof d.soil_ec === "number" ? d.soil_ec : 0,
        ec_source: (d.ec_source as EcSource | undefined) ?? "raw_adc",
      };
    }
    out.push({
      device_id: dev.id,
      name: dev.name,
      provider: dev.provider,
      display_temp_unit:
        (dev.metadata as { display_temp_unit?: TempDisplayUnit } | null)?.display_temp_unit ?? "celsius",
      latest,
    });
  }
  return out;
}

// ── AI Area Coach ──────────────────────────────────────────────────────────

export type MetricKey = "moisture" | "ec" | "temperature";
export type MetricStatus = "good" | "low" | "high" | "unknown";

export interface InsightMetric {
  metric: MetricKey;
  current?: number;
  unit: string;
  ideal_min: number;
  ideal_max: number;
  status: MetricStatus;
  meaning: string;
  why_for_these_plants: string;
  recommendation: string;
}

export type MetricFit = "good" | "low" | "high" | "unknown";

export interface PlantFit {
  name: string;
  moisture_fit: MetricFit;
  temp_fit: MetricFit;
  ec_fit: MetricFit;
  notes: string;
}

export interface AreaCompatibility {
  verdict: "well_matched" | "minor_variance" | "poorly_matched";
  moisture_only: boolean;
  note: string;
}

export interface AreaInsight {
  headline: string;
  summary: string;
  metrics: InsightMetric[];
  /** Per-plant fit of the current readings vs each plant's ideal ranges. */
  plant_analysis?: PlantFit[];
  /** Whether the plants suit sharing this area; flags moisture-only divergence. */
  compatibility?: AreaCompatibility | null;
  automation_review?: { ok: boolean; notes: string } | null;
  automation_suggestions?: Array<{
    title: string;
    description: string;
    suggested_moisture_threshold_pct?: number;
  }>;
  confidence_note?: string;
}

/** Result envelope returned by the `area-sensor-analysis` edge function. */
export interface AreaInsightResult {
  insight: AreaInsight | null;
  cached?: boolean;
  empty?: boolean;
  basedOnReadingAt?: string | null;
  generatedAt?: string | null;
  persona?: "new" | "experienced" | null;
  /** Set when the call was rejected (rate limit, no AI tier, failure). */
  error?: "rate_limit" | "analysis_failed" | "ai_disabled" | "unknown";
  retryAfterSeconds?: number;
}

/**
 * Read the cached insight row directly (instant first paint). Returns null when
 * none exists yet. RLS scopes this to the user's homes.
 */
export async function fetchAreaInsight(areaId: string): Promise<AreaInsightResult | null> {
  const { data } = await supabase
    .from("area_ai_insights")
    .select("insight, based_on_reading_at, generated_at, persona")
    .eq("area_id", areaId)
    .maybeSingle();
  if (!data) return null;
  return {
    insight: data.insight as AreaInsight,
    cached: true,
    basedOnReadingAt: data.based_on_reading_at as string | null,
    generatedAt: data.generated_at as string | null,
    persona: data.persona as "new" | "experienced" | null,
  };
}

/**
 * Invoke the cache-aware edge function. Returns the cached insight instantly
 * when fresh; regenerates (Gemini) when readings are newer or `force` is set.
 */
export async function generateAreaInsight(
  homeId: string,
  areaId: string,
  force = false,
): Promise<AreaInsightResult> {
  const { data, error } = await supabase.functions.invoke("area-sensor-analysis", {
    body: { homeId, areaId, force },
  });

  if (error) {
    // FunctionsHttpError carries the non-2xx body in error.context.
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      try {
        const body = await ctx.json();
        if (ctx.status === 429) {
          return { insight: null, error: "rate_limit", retryAfterSeconds: body?.retryAfterSeconds };
        }
        if (ctx.status === 403) return { insight: null, error: "ai_disabled" };
        if (body?.error === "analysis_failed") return { insight: null, error: "analysis_failed" };
      } catch {
        /* fall through */
      }
    }
    return { insight: null, error: "unknown" };
  }

  return data as AreaInsightResult;
}

export type HistoryWindow = "24h" | "7d" | "30d";

export interface HistoryPoint {
  recorded_at: string;
  soil_temp: number | null;
  soil_moisture: number | null;
  soil_ec: number | null;
}

/**
 * Pull all readings for every linked sensor inside the window. Returns
 * one entry per { device_id, points[] } so the chart can draw a line
 * per sensor + an average line on top.
 */
export async function fetchAreaSensorHistory(
  areaId: string,
  window: HistoryWindow,
): Promise<Record<string, HistoryPoint[]>> {
  const hoursAgo = window === "24h" ? 24 : window === "7d" ? 24 * 7 : 24 * 30;
  const sinceIso = new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();

  const { data: devices } = await supabase
    .from("devices")
    .select("id")
    .eq("area_id", areaId)
    .eq("device_type", "soil_sensor")
    .eq("is_active", true);
  if (!devices?.length) return {};

  const deviceIds = devices.map((d) => d.id);
  const { data: readings } = await supabase
    .from("device_readings")
    .select("device_id, recorded_at, data")
    .in("device_id", deviceIds)
    .gte("recorded_at", sinceIso)
    .order("recorded_at", { ascending: true });

  const out: Record<string, HistoryPoint[]> = {};
  for (const id of deviceIds) out[id] = [];
  for (const r of readings ?? []) {
    if (!r.data || typeof r.data !== "object") continue;
    const d = r.data as Record<string, unknown>;
    out[r.device_id] ??= [];
    out[r.device_id].push({
      recorded_at: r.recorded_at,
      soil_temp: typeof d.soil_temp === "number" ? d.soil_temp : null,
      soil_moisture: typeof d.soil_moisture === "number" ? d.soil_moisture : null,
      soil_ec: typeof d.soil_ec === "number" ? d.soil_ec : null,
    });
  }
  return out;
}
