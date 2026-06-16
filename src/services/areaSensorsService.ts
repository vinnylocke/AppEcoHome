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
