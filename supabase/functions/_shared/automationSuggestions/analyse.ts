/**
 * Automation suggestion analyser — pure, deterministic (no AI, no I/O).
 *
 * Given an automation's config, a summary of its recent runs, the area's
 * soil-moisture profile (Pillar A) and recent moisture evidence, it returns
 * suggestion drafts. For under-watering it weighs the two levers — more runs
 * vs. longer runs — picks the better one with a reason, lists the alternative,
 * and produces a plain-language diagnosis of WHY watering is struggling. The
 * trigger + proposed values are deterministic; the Sage+ AI layer only rewords.
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
  sensorCooldownMinutes: number | null;
}

export interface ProfileLite {
  retentionClass: RetentionClass;
  drydownRatePerDay: number | null;
  byWeather: Array<{ key: "hot_dry" | "mild" | "cool_wet"; ratePerDay: number; segments: number }>;
  /** Avg moisture % a single watering adds (from watering_response). */
  avgRewetJump?: number | null;
}

/** Recent soil-moisture evidence used to justify a suggestion concretely. */
export interface MoistureEvidence {
  thresholdPct: number | null; // the automation's watering trigger, if any
  totalReadings: number;
  lowReadings: number; // readings below the threshold
  minMoisture: number | null;
  avgMoisture: number | null;
}

export type SuggestionKind = "increase_watering" | "reduce_watering";

/** The not-chosen lever, shown in Details so the user can compare. */
export interface SuggestionAlternative {
  field: string;
  currentValue: unknown;
  proposedValue: unknown;
  label: string;
}

export interface SuggestionDraft {
  kind: SuggestionKind;
  field: string | null;
  currentValue: unknown;
  proposedValue: unknown;
  rationale: string;
  confidence: number;
  /** Plain-language contributing factors ("why it's struggling"). */
  diagnosis: string[];
  /** The other lever the user could pull instead. */
  alternative: SuggestionAlternative | null;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const round1 = (n: number) => Math.round(n * 10) / 10;
const fmtMins = (sec: number) => (sec >= 60 ? `${Math.round(sec / 60)} min` : `${sec}s`);
/** Bump a duration by ~50%, rounded to whole minutes, at least +1 min. */
const longerDuration = (sec: number) => Math.max(sec + 60, Math.round((sec * 1.5) / 60) * 60);

export function analyseAutomation(
  cfg: AutomationConfig,
  runs: RunsSummary,
  profile: ProfileLite | null,
  evidence: MoistureEvidence | null = null,
): SuggestionDraft[] {
  const out: SuggestionDraft[] = [];
  const fastDraining = profile?.retentionClass === "fast_draining";
  const retentive = profile?.retentionClass === "moisture_retentive";
  const rate = profile?.drydownRatePerDay ?? null;
  const jump = profile?.avgRewetJump ?? null;
  const haveRunLimit = cfg.runLimitCount != null;
  const haveDuration = cfg.durationSeconds != null && cfg.durationSeconds > 0;

  // ── Under-watering: throttled by its run limit while the soil stays dry ──
  if ((haveRunLimit || haveDuration) && runs.rateLimited >= 2) {
    // Diagnosis — the contributing factors, in priority order.
    const diagnosis: string[] = [];
    diagnosis.push(`it hit its run-limit cap ${runs.rateLimited}× in ${runs.windowDays} days, so it couldn't water as often as it wanted`);
    const hot = profile?.byWeather.find((b) => b.key === "hot_dry");
    const baseline = profile?.byWeather.find((b) => b.key === "mild")
      ?? profile?.byWeather.find((b) => b.key === "cool_wet");
    if (hot && baseline && hot.ratePerDay >= 1.3 * baseline.ratePerDay) {
      diagnosis.push(`it's been drying much faster in hot, dry weather (~${round1(hot.ratePerDay)}%/day vs ~${round1(baseline.ratePerDay)}%/day)`);
    }
    if (fastDraining && rate != null) {
      diagnosis.push(`the soil here drains quickly (~${round1(rate)}%/day)`);
    }
    const shallow = jump != null && jump < 12;
    if (shallow) {
      diagnosis.push(`each watering only lifts moisture ~${Math.round(jump as number)}%, so it isn't soaking in deeply`);
    }
    if (evidence?.thresholdPct != null && (evidence.lowReadings ?? 0) > 0) {
      diagnosis.push(`soil sat below the ${Math.round(evidence.thresholdPct)}% target on ${evidence.lowReadings} of the last ${evidence.totalReadings} readings${evidence.minMoisture != null ? ` (low ${Math.round(evidence.minMoisture)}%)` : ""}`);
    }

    // Choose the better lever: shallow waterings → longer runs; otherwise → more runs.
    const useDuration = (shallow && haveDuration) || (!haveRunLimit && haveDuration);

    let field: string;
    let currentValue: unknown;
    let proposedValue: unknown;
    let actionText: string;
    let why: string;
    let alternative: SuggestionAlternative | null = null;

    if (useDuration) {
      const cur = cfg.durationSeconds as number;
      const next = longerDuration(cur);
      field = "duration_seconds";
      currentValue = cur;
      proposedValue = next;
      actionText = `run it longer (${fmtMins(cur)} → ${fmtMins(next)})`;
      why = shallow
        ? "each run is too short to wet the soil deeply, so longer soaks help more than just watering more often"
        : "longer runs put down more water each time";
      if (haveRunLimit) {
        alternative = {
          field: "run_limit_count",
          currentValue: cfg.runLimitCount,
          proposedValue: (cfg.runLimitCount as number) + 1,
          label: `allow ${(cfg.runLimitCount as number) + 1} runs per ${cfg.runLimitWindowHours}h instead`,
        };
      }
    } else {
      const extra = runs.rateLimited >= Math.max(3, runs.fired) ? 2 : 1;
      const next = (cfg.runLimitCount as number) + extra;
      field = "run_limit_count";
      currentValue = cfg.runLimitCount;
      proposedValue = next;
      actionText = `allow more runs (${cfg.runLimitCount} → ${next} per ${cfg.runLimitWindowHours}h)`;
      why = fastDraining
        ? "the soil drains fast, so frequent top-ups hold it in range better than fewer long soaks"
        : "it's being capped before the soil is wet enough, so more runs let it keep up";
      if (haveDuration) {
        const cur = cfg.durationSeconds as number;
        const next2 = longerDuration(cur);
        alternative = {
          field: "duration_seconds",
          currentValue: cur,
          proposedValue: next2,
          label: `run for ${fmtMins(next2)} instead of ${fmtMins(cur)}`,
        };
      }
    }

    let confidence = clamp(0.55 + (0.1 * Math.min(runs.rateLimited, 4)) / 4, 0, 0.9);
    if (fastDraining) confidence = clamp(confidence + 0.15, 0, 0.95);

    out.push({
      kind: "increase_watering",
      field,
      currentValue,
      proposedValue,
      rationale:
        `This watering isn't keeping up — ${diagnosis[0]}. I'd ${actionText}, because ${why}.` +
        (alternative ? ` Alternatively you could ${alternative.label}.` : ""),
      confidence: round1(confidence),
      diagnosis,
      alternative,
    });
  }

  // ── Over-watering: fires often in a slow-drying area, never throttled ──
  if (
    cfg.runLimitCount != null && cfg.runLimitCount > 1 &&
    runs.rateLimited === 0 && runs.fired >= 6 && retentive
  ) {
    const proposed = cfg.runLimitCount - 1;
    const diagnosis: string[] = [];
    diagnosis.push(`this area holds water well${rate != null ? ` (dries only ~${round1(rate)}%/day)` : ""}`);
    diagnosis.push(`it watered ${runs.fired}× in ${runs.windowDays} days but rarely ran dry`);
    if (evidence?.avgMoisture != null) {
      diagnosis.push(`soil averaged ${Math.round(evidence.avgMoisture)}% over recent readings`);
    }
    out.push({
      kind: "reduce_watering",
      field: "run_limit_count",
      currentValue: cfg.runLimitCount,
      proposedValue: proposed,
      rationale:
        `This may be over-watering — ${diagnosis[0]}, yet ${diagnosis[1]}. ` +
        `Easing the cap from ${cfg.runLimitCount} to ${proposed} per ${cfg.runLimitWindowHours}h helps avoid soggy soil.`,
      confidence: 0.6,
      diagnosis,
      alternative: null,
    });
  }

  return out;
}
