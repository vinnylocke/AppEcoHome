/**
 * compute-soil-profiles — Pillar A of the automation-intelligence feature.
 *
 * Deterministic (no AI). For each soil sensor it reads the last 30 days of
 * device_readings + the home's weather snapshot, computes the moisture
 * behaviour profile (drydown rate, retention class, weather-segmented drydown,
 * watering response, confidence) via _shared/soilProfile/drydown.ts, and upserts
 * one row per device into soil_moisture_profiles.
 *
 * Invoked by the daily `compute-soil-profiles-daily` cron (no body → all soil
 * sensors) and on-demand with { homeId } / { deviceId } to recompute a subset.
 * verify_jwt is off (cron uses the publishable key, no user JWT).
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { serviceClient } from "../_shared/supabaseClient.ts";
import { log, warn } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import { pLimit } from "../_shared/concurrency.ts";
import {
  computeMoistureProfile,
  type MoisturePoint,
  type WeatherDay,
} from "../_shared/soilProfile/drydown.ts";
import {
  computeTempBehaviour,
  computeEcBehaviour,
  type BehaviourPoint,
} from "../_shared/soilProfile/behaviour.ts";

const FN = "compute-soil-profiles";
const DEVICE_CONCURRENCY = 8;
const WINDOW_DAYS = 30;
const BEHAVIOUR_WINDOW_DAYS = 7;

interface DailyBlock {
  time?: string[];
  temperature_2m_max?: number[];
  precipitation_sum?: number[];
}

function parseWeather(data: unknown): WeatherDay[] {
  const daily = ((data as Record<string, unknown> | null)?.daily ?? {}) as DailyBlock;
  const times = daily.time ?? [];
  const temps = daily.temperature_2m_max ?? [];
  const rain = daily.precipitation_sum ?? [];
  return times.map((date, i) => ({
    date,
    maxTempC: typeof temps[i] === "number" ? temps[i] : null,
    rainMm: typeof rain[i] === "number" ? rain[i] : null,
  }));
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  try {
    const db = serviceClient();
    let body: { homeId?: string; deviceId?: string } = {};
    try {
      body = await req.json();
    } catch {
      // cron sends '{}' or nothing — fall through to "all soil sensors".
    }

    let q = db.from("devices").select("id, home_id, area_id").eq("device_type", "soil_sensor");
    if (body.deviceId) q = q.eq("id", body.deviceId);
    if (body.homeId) q = q.eq("home_id", body.homeId);
    const { data: devices, error: devErr } = await q;
    if (devErr) throw devErr;

    const deviceRows = (devices ?? []) as Array<{ id: string; home_id: string; area_id: string | null }>;
    if (deviceRows.length === 0) return json({ devices: 0, profiles: 0 });

    // Load each home's weather snapshot once (daily temp + rain for bucketing).
    const homeIds = [...new Set(deviceRows.map((d) => d.home_id))];
    const weatherByHome = new Map<string, WeatherDay[]>();
    const { data: snaps } = await db
      .from("weather_snapshots")
      .select("home_id, data")
      .in("home_id", homeIds);
    for (const s of snaps ?? []) {
      weatherByHome.set(s.home_id as string, parseWeather(s.data));
    }

    const sinceIso = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();
    const limit = pLimit(DEVICE_CONCURRENCY);
    let profiles = 0;
    let errors = 0;

    await Promise.all(deviceRows.map((dev) =>
      limit(async () => {
        try {
          const { data: readings } = await db
            .from("device_readings")
            .select("recorded_at, data")
            .eq("device_id", dev.id)
            .gte("recorded_at", sinceIso)
            .order("recorded_at", { ascending: true })
            .limit(5000);

          const behaviourSince = Date.now() - BEHAVIOUR_WINDOW_DAYS * 86_400_000;
          const points: MoisturePoint[] = [];
          const behaviourPoints: BehaviourPoint[] = [];
          let latestReadingAt: string | null = null;
          let ecSource: string | null = null;
          for (const r of readings ?? []) {
            const data = r.data as Record<string, unknown> | null;
            const t = new Date(r.recorded_at as string).getTime();
            const m = data?.soil_moisture;
            if (typeof m === "number" && Number.isFinite(m)) {
              points.push({ t, moisture: m });
            }
            if (t >= behaviourSince) {
              const temp = data?.soil_temp;
              const ec = data?.soil_ec;
              behaviourPoints.push({
                t,
                temp: typeof temp === "number" && Number.isFinite(temp) ? temp : null,
                ec: typeof ec === "number" && Number.isFinite(ec) ? ec : null,
              });
              if (typeof data?.ec_source === "string") ecSource = data.ec_source;
            }
            latestReadingAt = r.recorded_at as string;
          }

          const profile = computeMoistureProfile(points, weatherByHome.get(dev.home_id) ?? []);
          const tempBehaviour = computeTempBehaviour(behaviourPoints);
          const ecBehaviour = computeEcBehaviour(behaviourPoints);

          const { error } = await db.from("soil_moisture_profiles").upsert({
            device_id: dev.id,
            home_id: dev.home_id,
            area_id: dev.area_id,
            drydown_rate_pct_per_day: profile.drydownRatePerDay,
            retention_class: profile.retentionClass,
            drydown_by_weather: profile.byWeather,
            watering_response: {
              rewetCount: profile.rewetCount,
              avgRewetJump: profile.avgRewetJump,
              avgSegmentDurationDays: profile.avgSegmentDurationDays,
            },
            sample_segments: profile.sampleSegments,
            confidence: profile.confidence,
            temp_behaviour: tempBehaviour,
            ec_behaviour: { ...ecBehaviour, ecSource },
            based_on_reading_at: latestReadingAt,
            computed_at: new Date().toISOString(),
          }, { onConflict: "device_id" });
          if (error) throw error;
          profiles += 1;
        } catch (err) {
          errors += 1;
          warn(FN, "device_profile_failed", { deviceId: dev.id, error: String(err) });
        }
      })
    ));

    log(FN, "compute_complete", { devices: deviceRows.length, profiles, errors });
    return json({ devices: deviceRows.length, profiles, errors });
  } catch (err) {
    await captureException(FN, err);
    return json({ error: (err as Error).message }, 500);
  }
});
