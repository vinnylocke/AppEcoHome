import { useEffect, useState } from "react";
import { Droplets, Thermometer, Zap } from "lucide-react";
import { supabase } from "../../lib/supabase";
import FeatureGate from "../shared/FeatureGate";

type RetentionClass = "fast_draining" | "balanced" | "moisture_retentive" | "unknown";

interface TempBehaviour {
  dayMaxC: number | null;
  nightMinC: number | null;
  diurnalSwingC: number | null;
  sampleDays: number;
}

interface EcBehaviour {
  mean: number | null;
  cv: number | null;
  stability: "stable" | "drifting" | "volatile" | "unknown";
  trend: "rising" | "falling" | "flat" | "unknown";
  sampleDays: number;
  ecSource?: string | null;
}

interface ProfileRow {
  drydown_rate_pct_per_day: number | null;
  retention_class: RetentionClass;
  confidence: number;
  temp_behaviour: TempBehaviour | null;
  ec_behaviour: EcBehaviour | null;
  computed_at: string | null;
}

const RETENTION: Record<RetentionClass, { label: string; blurb: string }> = {
  moisture_retentive: { label: "Holds water well", blurb: "Moisture lingers here — easy to over-water." },
  balanced: { label: "Balanced drainage", blurb: "Dries at a steady, middle-of-the-road pace." },
  fast_draining: { label: "Dries out fast", blurb: "Loses moisture quickly — thirsty plants will need frequent water." },
  unknown: { label: "Still learning", blurb: "Collecting readings to learn how this soil drains." },
};

function tempBlurb(swing: number): string {
  if (swing >= 12) return "Big day–night swing — mulch would buffer the roots.";
  if (swing >= 6) return "A moderate day–night swing; most plants take this in stride.";
  return "Temperature stays steady around the clock.";
}

function ecBlurb(ec: EcBehaviour): string {
  if (ec.stability === "volatile") {
    return "Big swings usually track watering and feeding — spikes after a feed, dips after heavy rain.";
  }
  if (ec.trend === "rising") {
    return "Salts are concentrating as the soil dries — normal after feeding; a deep water rebalances it.";
  }
  if (ec.trend === "falling") {
    return "Rain or irrigation is diluting nutrients — if it keeps falling, the bed may want a feed.";
  }
  return "Nutrient levels are holding steady.";
}

const STABILITY_LABEL: Record<EcBehaviour["stability"], string> = {
  stable: "Stable",
  drifting: "Drifting",
  volatile: "Volatile",
  unknown: "Still learning",
};

const TREND_ARROW: Record<EcBehaviour["trend"], string> = {
  rising: "↗ rising",
  falling: "↘ falling",
  flat: "→ steady",
  unknown: "",
};

interface Props {
  deviceId: string;
  tempDisplayUnit?: "celsius" | "fahrenheit";
}

/**
 * "Soil behaviour" — the derived indicators over the raw history charts: how
 * fast this soil drains, how hot the days / cool the nights run, and how EC is
 * behaving (and the likely why). All read from soil_moisture_profiles, which
 * the daily compute-soil-profiles cron keeps fresh — so the indicators update
 * over time as the sensor learns the bed. Deterministic, but gated with the
 * same ai_insights feature as the area MoistureBehaviourCard so the profile
 * data surfaces consistently across tiers.
 */
export default function SoilBehaviourPanel(props: Props) {
  return (
    <FeatureGate feature="ai_insights" fallback={null}>
      <SoilBehaviourPanelInner {...props} />
    </FeatureGate>
  );
}

function SoilBehaviourPanelInner({ deviceId, tempDisplayUnit = "celsius" }: Props) {
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("soil_moisture_profiles")
        .select("drydown_rate_pct_per_day, retention_class, confidence, temp_behaviour, ec_behaviour, computed_at")
        .eq("device_id", deviceId)
        .maybeSingle();
      if (cancelled) return;
      setProfile((data ?? null) as ProfileRow | null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [deviceId]);

  if (loading || !profile) return null; // no profile yet — the cron hasn't seen this sensor

  const isF = tempDisplayUnit === "fahrenheit";
  const showTemp = (c: number) => (isF ? `${Math.round((c * 9) / 5 + 32)}°F` : `${Math.round(c)}°C`);
  const showSwing = (c: number) => (isF ? `${Math.round((c * 9) / 5)}°F` : `${Math.round(c)}°C`);

  const retention = RETENTION[profile.retention_class] ?? RETENTION.unknown;
  const temp = profile.temp_behaviour;
  const ec = profile.ec_behaviour;
  const ecUnit = ec?.ecSource === "calibrated_us_cm" ? " µS/cm" : "";

  return (
    <section data-testid="soil-behaviour-panel">
      <h3 className="text-sm font-bold text-rhozly-on-surface mb-3">Soil behaviour</h3>
      <div className="space-y-2">
        {/* Drainage — the existing drydown profile, now on the device too */}
        <div
          data-testid="soil-behaviour-drainage"
          className="rounded-2xl bg-rhozly-surface-low/60 border border-rhozly-outline/10 px-3.5 py-3 flex items-start gap-3"
        >
          <span className="shrink-0 mt-0.5 p-1.5 rounded-lg bg-sky-100 text-sky-600"><Droplets size={14} /></span>
          <div className="min-w-0">
            <p className="text-xs font-black text-rhozly-on-surface">
              {retention.label}
              {profile.drydown_rate_pct_per_day != null && (
                <span className="text-rhozly-on-surface/50 font-bold"> · ~{profile.drydown_rate_pct_per_day}%/day</span>
              )}
            </p>
            <p className="text-xs font-bold text-rhozly-on-surface/55 mt-0.5 leading-snug">{retention.blurb}</p>
          </div>
        </div>

        {/* Day / night temperature */}
        <div
          data-testid="soil-behaviour-temp"
          className="rounded-2xl bg-rhozly-surface-low/60 border border-rhozly-outline/10 px-3.5 py-3 flex items-start gap-3"
        >
          <span className="shrink-0 mt-0.5 p-1.5 rounded-lg bg-orange-100 text-orange-600"><Thermometer size={14} /></span>
          <div className="min-w-0">
            {temp && temp.dayMaxC != null && temp.nightMinC != null && temp.diurnalSwingC != null ? (
              <>
                <p className="text-xs font-black text-rhozly-on-surface">
                  Days peak ~{showTemp(temp.dayMaxC)} · nights ~{showTemp(temp.nightMinC)}
                  <span className="text-rhozly-on-surface/50 font-bold"> · {showSwing(temp.diurnalSwingC)} swing</span>
                </p>
                <p className="text-xs font-bold text-rhozly-on-surface/55 mt-0.5 leading-snug">
                  {tempBlurb(temp.diurnalSwingC)}
                </p>
              </>
            ) : (
              <p className="text-xs font-bold text-rhozly-on-surface/55">
                Still learning the day–night temperature pattern — needs a few days of readings.
              </p>
            )}
          </div>
        </div>

        {/* EC behaviour — only for sensors that report it */}
        {ec && ec.sampleDays > 0 && (
          <div
            data-testid="soil-behaviour-ec"
            className="rounded-2xl bg-rhozly-surface-low/60 border border-rhozly-outline/10 px-3.5 py-3 flex items-start gap-3"
          >
            <span className="shrink-0 mt-0.5 p-1.5 rounded-lg bg-violet-100 text-violet-600"><Zap size={14} /></span>
            <div className="min-w-0">
              {ec.stability !== "unknown" && ec.mean != null ? (
                <>
                  <p className="text-xs font-black text-rhozly-on-surface">
                    EC {STABILITY_LABEL[ec.stability].toLowerCase()} around {Math.round(ec.mean)}{ecUnit}
                    {ec.trend !== "unknown" && (
                      <span className="text-rhozly-on-surface/50 font-bold"> · {TREND_ARROW[ec.trend]}</span>
                    )}
                  </p>
                  <p className="text-xs font-bold text-rhozly-on-surface/55 mt-0.5 leading-snug">{ecBlurb(ec)}</p>
                </>
              ) : (
                <p className="text-xs font-bold text-rhozly-on-surface/55">
                  Still learning this sensor's EC pattern — needs a few days of readings.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
