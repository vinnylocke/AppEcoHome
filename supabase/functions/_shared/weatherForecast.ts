/**
 * Shared forecast reader for weather-aware automations.
 *
 * Pulls the home's `weather_snapshots.data` (Open-Meteo shape) and resolves
 * the rain look-ahead + heatwave flag the automation evaluators need. Keeps
 * the snapshot-parsing in one place so `run-automations` (scheduled) and
 * `evaluate-sensor-automations` (sensor + deferral recheck) agree.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { computeRainWindow, type HourlyPoint, type RainForecast } from "./automationEvaluator.ts";

interface DailyBlock {
  time?: string[];
  precipitation_sum?: number[];
  precipitation_probability_max?: number[];
  temperature_2m_max?: number[];
}
interface HourlyBlock {
  time?: string[];
  precipitation_probability?: number[];
  precipitation?: number[];
}

export interface ForecastReading {
  rain: RainForecast;
  isHeatwave: boolean;
  maxTempC: number;
}

/**
 * Read the home's forecast and resolve rain window + heat. Returns a benign
 * "no rain / not hot" reading when the snapshot is missing so callers fail
 * safe toward watering rather than toward drought.
 */
export async function readForecast(
  db: ReturnType<typeof createClient>,
  homeId: string,
  now: Date,
  windowHours: number,
  minProbability: number,
  heatThresholdC: number,
): Promise<ForecastReading> {
  const benign: ForecastReading = {
    rain: { rainMm: 0, probabilityMax: 0, windowEnd: new Date(now.getTime() + windowHours * 3_600_000) },
    isHeatwave: false,
    maxTempC: 0,
  };

  const { data: snapshot } = await db
    .from("weather_snapshots")
    .select("data")
    .eq("home_id", homeId)
    .maybeSingle();
  if (!snapshot?.data) return benign;

  const data = snapshot.data as Record<string, unknown>;
  const daily = (data.daily ?? {}) as DailyBlock;
  const hourly = (data.hourly ?? {}) as HourlyBlock;
  const todayStr = now.toISOString().split("T")[0];

  const dayIdx = daily.time?.indexOf(todayStr) ?? -1;
  const todayRainMm = dayIdx >= 0 ? (daily.precipitation_sum?.[dayIdx] ?? 0) : 0;
  const dailyProbMax = dayIdx >= 0 ? (daily.precipitation_probability_max?.[dayIdx] ?? 0) : 0;
  const maxTempC = dayIdx >= 0 ? (daily.temperature_2m_max?.[dayIdx] ?? 0) : 0;

  const points: HourlyPoint[] = [];
  if (hourly.time && hourly.precipitation_probability) {
    for (let i = 0; i < hourly.time.length; i++) {
      const t = new Date(hourly.time[i]);
      if (Number.isNaN(t.getTime())) continue;
      points.push({
        time: t,
        probability: hourly.precipitation_probability[i] ?? 0,
        precipitation: hourly.precipitation?.[i],
      });
    }
  }

  const rain = computeRainWindow(todayRainMm, dailyProbMax, points, now, windowHours, minProbability);
  return { rain, isHeatwave: maxTempC >= heatThresholdC, maxTempC };
}
