/**
 * Automation suggestion analyser — pure, deterministic (no AI, no I/O).
 *
 * Given an automation's config, a summary of its recent runs, and the area's
 * soil-moisture profile (Pillar A), it returns suggestion drafts. The trigger
 * AND the proposed value are deterministic so suggestions are trustworthy; an
 * optional AI layer (Sage+) only rewords the rationale downstream.
 *
 * Tested in supabase/tests/automationSuggestions.test.ts.
 */
import type { RetentionClass } from "../soilProfile/drydown.ts";

export interface RunsSummary {
  windowDays: number;
  total: number;
  fired: number; // success / ran / partial
  rateLimited: number; // skipped_rate_limited
}

export interface AutomationConfig {
  runLimitCount: number | null;
  runLimitWindowHours: number;
  durationSeconds: number | null;
  weatherMode: string | null; // 'off' | 'skip' | 'defer'
  sensorCooldownMinutes: number | null;
}

export interface ProfileLite {
  retentionClass: RetentionClass;
  drydownRatePerDay: number | null;
  byWeather: Array<{ key: "hot_dry" | "mild" | "cool_wet"; ratePerDay: number; segments: number }>;
}

export type SuggestionKind = "raise_run_limit" | "reduce_watering" | "enable_weather_skip";

export interface SuggestionDraft {
  kind: SuggestionKind;
  field: string | null;
  currentValue: unknown;
  proposedValue: unknown;
  rationale: string;
  confidence: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const round1 = (n: number) => Math.round(n * 10) / 10;

export function analyseAutomation(
  cfg: AutomationConfig,
  runs: RunsSummary,
  profile: ProfileLite | null,
): SuggestionDraft[] {
  const out: SuggestionDraft[] = [];
  const fastDraining = profile?.retentionClass === "fast_draining";
  const retentive = profile?.retentionClass === "moisture_retentive";
  const rate = profile?.drydownRatePerDay ?? null;

  // 1) Under-watering — repeatedly throttled by its own run limit.
  if (cfg.runLimitCount != null && runs.rateLimited >= 2) {
    const extra = runs.rateLimited >= Math.max(3, runs.fired) ? 2 : 1;
    const proposed = cfg.runLimitCount + extra;
    let confidence = clamp(0.55 + (0.1 * Math.min(runs.rateLimited, 4)) / 4, 0, 0.9);
    if (fastDraining) confidence = clamp(confidence + 0.15, 0, 0.95);
    out.push({
      kind: "raise_run_limit",
      field: "run_limit_count",
      currentValue: cfg.runLimitCount,
      proposedValue: proposed,
      rationale:
        `Hit its run limit ${runs.rateLimited} time${runs.rateLimited === 1 ? "" : "s"} in the last ${runs.windowDays} days` +
        (rate != null ? ` while the soil kept drying (~${round1(rate)}%/day)` : "") +
        ` — raising the cap from ${cfg.runLimitCount} to ${proposed} per ${cfg.runLimitWindowHours}h lets it keep up.`,
      confidence: round1(confidence),
    });
  }

  // 2) Likely over-watering — fires often in a slow-drying area, never throttled.
  if (
    cfg.runLimitCount != null && cfg.runLimitCount > 1 &&
    runs.rateLimited === 0 && runs.fired >= 6 && retentive
  ) {
    const proposed = cfg.runLimitCount - 1;
    out.push({
      kind: "reduce_watering",
      field: "run_limit_count",
      currentValue: cfg.runLimitCount,
      proposedValue: proposed,
      rationale:
        `This area holds water well` + (rate != null ? ` (dries only ~${round1(rate)}%/day)` : "") +
        ` yet this watered ${runs.fired} times recently — easing the cap from ${cfg.runLimitCount} to ${proposed} per ${cfg.runLimitWindowHours}h helps avoid over-watering.`,
      confidence: 0.6,
    });
  }

  // 3) Weather-sensitive but rain-skip is off.
  const hot = profile?.byWeather.find((b) => b.key === "hot_dry");
  const cool = profile?.byWeather.find((b) => b.key === "cool_wet");
  const weatherOff = cfg.weatherMode == null || cfg.weatherMode === "off";
  if (weatherOff && hot && cool && cool.ratePerDay > 0 && hot.ratePerDay >= 1.5 * cool.ratePerDay) {
    out.push({
      kind: "enable_weather_skip",
      field: "weather_mode",
      currentValue: cfg.weatherMode ?? "off",
      proposedValue: "skip",
      rationale:
        `Watering here is very weather-dependent (dries ~${round1(hot.ratePerDay)}%/day in hot spells vs ~${round1(cool.ratePerDay)}%/day when it's cool or wet). ` +
        `Turning on rain-skip avoids watering right before rain.`,
      confidence: 0.5,
    });
  }

  return out;
}
