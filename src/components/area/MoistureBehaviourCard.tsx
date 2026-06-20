import React, { useEffect, useState } from "react";
import { Droplets, Sun, Waves, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "../../lib/supabase";

type RetentionClass = "fast_draining" | "balanced" | "moisture_retentive" | "unknown";
type WeatherKey = "hot_dry" | "mild" | "cool_wet";

interface Profile {
  device_id: string;
  drydown_rate_pct_per_day: number | null;
  retention_class: RetentionClass;
  drydown_by_weather: Array<{ key: WeatherKey; ratePerDay: number; segments: number }>;
  watering_response: { rewetCount?: number; avgRewetJump?: number | null; avgSegmentDurationDays?: number | null };
  sample_segments: number;
  confidence: number;
  based_on_reading_at: string | null;
}

const RETENTION: Record<RetentionClass, { label: string; blurb: string }> = {
  moisture_retentive: { label: "Holds water well", blurb: "Moisture lingers here — easy to over-water." },
  balanced: { label: "Balanced drainage", blurb: "Dries at a steady, middle-of-the-road pace." },
  fast_draining: { label: "Dries out fast", blurb: "Loses moisture quickly — thirsty plants will need frequent water." },
  unknown: { label: "Still learning", blurb: "Collecting sensor readings to learn how this area behaves." },
};

const WEATHER_LABEL: Record<WeatherKey, string> = { hot_dry: "Hot & dry", mild: "Mild", cool_wet: "Cool / wet" };

function classify(rate: number): RetentionClass {
  if (rate < 3) return "moisture_retentive";
  if (rate <= 7) return "balanced";
  return "fast_draining";
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/**
 * Read-only "Moisture behaviour" card for an area — surfaces the deterministic
 * soil_moisture_profiles computed by compute-soil-profiles. Renders nothing when
 * the area has no soil sensor. Simple line by default; "Details" reveals the
 * numbers (weather-segmented drydown, watering response, confidence) for experts.
 */
export default function MoistureBehaviourCard({ areaId }: { areaId: string }) {
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("soil_moisture_profiles")
        .select("device_id, drydown_rate_pct_per_day, retention_class, drydown_by_weather, watering_response, sample_segments, confidence, based_on_reading_at")
        .eq("area_id", areaId);
      if (cancelled) return;
      setProfiles((data ?? []) as Profile[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [areaId]);

  if (loading || profiles.length === 0) return null; // no sensor in this area

  const rated = profiles.filter((p) => p.drydown_rate_pct_per_day !== null && p.sample_segments > 0);

  // Not enough clean data yet → gentle "still learning" state.
  if (rated.length === 0) {
    return (
      <section className="bg-white rounded-2xl border border-rhozly-outline/10 p-4" data-testid="moisture-behaviour-card">
        <h3 className="text-xs font-black uppercase tracking-widest text-rhozly-on-surface/40 flex items-center gap-1.5">
          <Droplets size={12} /> Moisture behaviour
        </h3>
        <p className="text-[13px] font-medium text-rhozly-on-surface/55 mt-1.5">
          {RETENTION.unknown.blurb}
        </p>
      </section>
    );
  }

  const avgRate = Math.round(mean(rated.map((p) => p.drydown_rate_pct_per_day as number)) * 10) / 10;
  const retention = classify(avgRate);
  const primary = rated[0];
  const conf = mean(rated.map((p) => p.confidence));
  const confLabel = conf < 0.34 ? "Low confidence" : conf < 0.67 ? "Building confidence" : "High confidence";
  const totalSegments = rated.reduce((n, p) => n + p.sample_segments, 0);
  const wr = primary.watering_response ?? {};
  const Icon = retention === "moisture_retentive" ? Waves : retention === "fast_draining" ? Sun : Droplets;

  return (
    <section className="bg-white rounded-2xl border border-rhozly-outline/10 p-4 space-y-2" data-testid="moisture-behaviour-card">
      <h3 className="text-xs font-black uppercase tracking-widest text-rhozly-on-surface/40 flex items-center gap-1.5">
        <Droplets size={12} /> Moisture behaviour
      </h3>

      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-2xl bg-rhozly-surface flex items-center justify-center shrink-0">
          <Icon size={18} className="text-rhozly-primary" />
        </div>
        <div>
          <p className="text-[15px] font-black text-rhozly-on-surface leading-tight">
            {RETENTION[retention].label} · ~{avgRate}%/day
          </p>
          <p className="text-[12px] font-medium text-rhozly-on-surface/55 mt-0.5">
            {RETENTION[retention].blurb}
          </p>
        </div>
      </div>

      <button
        type="button"
        data-testid="moisture-behaviour-details-toggle"
        onClick={() => setShowDetails((v) => !v)}
        className="flex items-center gap-1 text-[11px] font-black uppercase tracking-widest text-rhozly-on-surface/40 hover:text-rhozly-on-surface/70 transition-colors"
      >
        {showDetails ? <ChevronUp size={12} /> : <ChevronDown size={12} />} {showDetails ? "Hide" : "Details"}
      </button>

      {showDetails && (
        <div className="space-y-2 pt-1 text-[12px] font-medium text-rhozly-on-surface/70">
          {primary.drydown_by_weather.length > 0 && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/35 mb-1">By weather</p>
              <ul className="space-y-0.5">
                {primary.drydown_by_weather.map((b) => (
                  <li key={b.key} className="flex justify-between">
                    <span>{WEATHER_LABEL[b.key]}</span>
                    <span className="font-bold tabular-nums">~{b.ratePerDay}%/day</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(wr.avgRewetJump != null || wr.avgSegmentDurationDays != null) && (
            <p>
              A watering raises moisture
              {wr.avgRewetJump != null ? <> ~<span className="font-bold">{wr.avgRewetJump}%</span></> : null}
              {wr.avgSegmentDurationDays != null ? <>, lasting ~<span className="font-bold">{wr.avgSegmentDurationDays} days</span></> : null} before it dries back down.
            </p>
          )}
          <p className="text-[11px] text-rhozly-on-surface/45">
            {confLabel} · based on {totalSegments} dry-down{totalSegments === 1 ? "" : "s"}
            {rated.length > 1 ? ` across ${rated.length} sensors` : ""}.
          </p>
        </div>
      )}
    </section>
  );
}
