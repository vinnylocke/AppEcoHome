// ─── fetch-pollen ──────────────────────────────────────────────────────────
//
// Runs daily at 02:00 UTC. For every home with lat/lng, pulls the next-7-
// days pollen forecast from Open-Meteo's Air Quality API and writes a
// `pollen_snapshots` row. The generate-weekly-overviews cron picks up
// the latest snapshot per home when it builds the weekly payload.
//
// Open-Meteo's pollen coverage is best in Europe + North America. Outside
// those regions the API returns null arrays — we treat that as "pollen
// data unavailable" rather than an error.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { log, warn, error as logError } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";

const FN = "fetch-pollen";
const POLLEN_API = "https://air-quality-api.open-meteo.com/v1/air-quality";

// Open-Meteo returns hourly values; we want one peak per day.
type Hourly = {
  time: string[];
  grass_pollen?: (number | null)[];
  birch_pollen?: (number | null)[];
  ragweed_pollen?: (number | null)[];
};

// Threshold guidance from the API docs: 0–3 low, 3–30 moderate, 30–80 high,
// 80+ very high. We collapse "very high" into "high" for the headline.
function levelFromCount(n: number): "low" | "moderate" | "high" {
  if (n < 3) return "low";
  if (n < 30) return "moderate";
  return "high";
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Per-pollen breakdown: one entry per day with the peak hourly reading.
interface PollenDay { day: string; date: string; peak: number; level: "low" | "moderate" | "high" }

function rollupDaily(hourly: Hourly, kind: "grass_pollen" | "birch_pollen" | "ragweed_pollen"): PollenDay[] {
  const values = hourly[kind];
  if (!values || values.length === 0) return [];
  const days = new Map<string, { peak: number }>();
  for (let i = 0; i < hourly.time.length; i++) {
    const ts = hourly.time[i];
    const date = ts.split("T")[0];
    const n = values[i];
    if (n == null) continue;
    const cur = days.get(date) ?? { peak: 0 };
    if (n > cur.peak) cur.peak = n;
    days.set(date, cur);
  }
  return Array.from(days.entries()).map(([date, { peak }]) => ({
    date,
    day: DAY_NAMES[new Date(date + "T12:00:00Z").getUTCDay()],
    peak: Math.round(peak * 10) / 10,
    level: levelFromCount(peak),
  }));
}

serve(async (_req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    log(FN, "start", {});

    const { data: homes } = await supabase
      .from("homes")
      .select("id, lat, lng")
      .not("lat", "is", null)
      .not("lng", "is", null);

    if (!homes || homes.length === 0) {
      return new Response(JSON.stringify({ message: "No geo-located homes." }), { status: 200 });
    }

    const today = new Date().toISOString().split("T")[0];
    let written = 0;

    for (const home of homes) {
      const lat = Number((home as any).lat);
      const lng = Number((home as any).lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

      const url = `${POLLEN_API}?latitude=${lat}&longitude=${lng}&hourly=grass_pollen,birch_pollen,ragweed_pollen&forecast_days=7`;
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
        if (!res.ok) {
          warn(FN, "fetch_failed", { home_id: home.id, status: res.status });
          continue;
        }
        const data = await res.json();
        const hourly = (data?.hourly ?? {}) as Hourly;

        const grass = rollupDaily(hourly, "grass_pollen");
        const birch = rollupDaily(hourly, "birch_pollen");
        const ragweed = rollupDaily(hourly, "ragweed_pollen");

        // Skip writing when every kind is empty (region without coverage).
        if (grass.length === 0 && birch.length === 0 && ragweed.length === 0) continue;

        const payload = { grass, birch, ragweed };

        const { error: upErr } = await supabase
          .from("pollen_snapshots")
          .upsert(
            { home_id: home.id, snapshot_date: today, payload, generated_at: new Date().toISOString() },
            { onConflict: "home_id,snapshot_date" },
          );
        if (upErr) {
          warn(FN, "upsert_failed", { home_id: home.id, error: upErr.message });
          continue;
        }
        written += 1;
      } catch (err: any) {
        warn(FN, "home_failed", { home_id: home.id, error: err.message });
      }
    }

    log(FN, "complete", { written });
    return new Response(JSON.stringify({ success: true, written }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    logError(FN, "unhandled", { error: err.message });
    await captureException(FN, err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
