// Garden Brain Phase 1 — adaptive care, the pure core.
//
// Joins measured soil reality with plant needs and the home's watering
// coverage, and proposes verified schedule adjustments. Deterministic — no
// AI, no network, no Date.now(); fully unit-testable in Deno. The runner
// (`garden-brain-reconcile`) fetches inputs, calls these, persists proposals.
//
// Trust rules baked in:
//   • Hard confidence gates — silent beats wrong.
//   • One open proposal per (area, kind); 14-day cooldown after a dismissal.
//   • Tighten (×1.25) and stretch (×0.6) thresholds are deliberately
//     non-adjacent so proposals can't oscillate week to week.

export interface SoilProfileRow {
  device_id: string;
  area_id: string | null;
  drydown_rate_pct_per_day: number | null;
  retention_class: string;
  /** [{ key: 'hot_dry'|'mild'|'cool_wet', ratePerDay: number, segments: number }] */
  drydown_by_weather: Array<{ key: string; ratePerDay: number; segments: number }>;
  /** { rewetCount, avgRewetJump, avgSegmentDurationDays } */
  watering_response: { rewetCount?: number; avgRewetJump?: number; avgSegmentDurationDays?: number };
  sample_segments: number;
  confidence: number;
}

export interface MoistureReading {
  recorded_at: string; // ISO
  soil_moisture: number; // %
}

export interface PlantRangeRow {
  soil_moisture_min: number | null;
  soil_moisture_max: number | null;
}

export interface WateringCoverage {
  /** Active watering blueprint for the area (null = none). */
  blueprint: { id: string; frequency_days: number } | null;
  /** True when an active automation opens a valve in this area. */
  hasWateringAutomation: boolean;
}

export interface RecentAdjustment {
  kind: string;
  status: string;
  created_at: string; // ISO
}

export interface AreaInput {
  areaId: string;
  areaName: string;
  profile: SoilProfileRow;
  readings: MoistureReading[]; // last 14 days, ascending
  plantRanges: PlantRangeRow[]; // ranges of the area's Planted instances
  coverage: WateringCoverage;
  /** Recent adjustments for this area (any status) — cooldown/supersede input. */
  recent: RecentAdjustment[];
  /** Max daily temp forecast for the next 7 days (°C). */
  forecastMaxC: number[];
}

export interface CareProposal {
  kind: "tighten_watering" | "stretch_watering" | "stress_risk" | "in_range" | "create_watering_routine";
  areaId: string;
  blueprintId: string | null;
  currentFrequencyDays: number | null;
  suggestedFrequencyDays: number | null;
  evidence: Record<string, unknown>;
  /** Deterministic gardener-facing copy (v1 — no AI in the loop). */
  headline: string;
  detail: string;
}

// ── Gates & constants ─────────────────────────────────────────────────────────
export const MIN_CONFIDENCE = 0.5;
export const MIN_SEGMENTS = 3;
export const MIN_READING_DAYS = 10;
export const COOLDOWN_DAYS = 14;
const DEFAULT_FLOOR = 30;
const DEFAULT_CEILING = 60;
const HOT_DAY_C = 27;

/** Median of a non-empty numeric list. */
function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Aggregate the bed's plant ranges into one target band (median of knowns;
 *  defaults when nothing is known). */
export function targetBand(ranges: PlantRangeRow[]): { floor: number; ceiling: number; knownCount: number } {
  const mins = ranges.map((r) => r.soil_moisture_min).filter((v): v is number => typeof v === "number");
  const maxs = ranges.map((r) => r.soil_moisture_max).filter((v): v is number => typeof v === "number");
  return {
    floor: mins.length ? median(mins) : DEFAULT_FLOOR,
    ceiling: maxs.length ? median(maxs) : DEFAULT_CEILING,
    knownCount: Math.min(mins.length, maxs.length),
  };
}

/** Pick the drydown rate matching the coming week: hot forecast → hot_dry
 *  segment rate when available, else the overall median rate. */
export function forecastMatchedRate(profile: SoilProfileRow, forecastMaxC: number[]): { rate: number | null; segmentUsed: string } {
  const hotDays = forecastMaxC.filter((t) => t >= HOT_DAY_C).length;
  if (hotDays >= 3) {
    const hot = profile.drydown_by_weather.find((s) => s.key === "hot_dry" && s.segments >= 2);
    if (hot && hot.ratePerDay > 0) return { rate: hot.ratePerDay, segmentUsed: "hot_dry" };
  }
  const rate = profile.drydown_rate_pct_per_day;
  return { rate: rate && rate > 0 ? rate : null, segmentUsed: "overall" };
}

export interface RealityStats {
  pctTimeBelowFloor: number;  // 0..100
  pctTimeAboveCeiling: number;
  minReading: number | null;
  typicalPeak: number | null; // median of local maxima (post-water peaks)
  readingDays: number;
}

/** Reality stats over the reading window. Peaks = readings higher than both
 *  neighbours (post-water rewets); typicalPeak falls back to the window max. */
export function realityStats(readings: MoistureReading[], floor: number, ceiling: number): RealityStats {
  if (readings.length === 0) {
    return { pctTimeBelowFloor: 0, pctTimeAboveCeiling: 0, minReading: null, typicalPeak: null, readingDays: 0 };
  }
  const vals = readings.map((r) => r.soil_moisture);
  const below = vals.filter((v) => v < floor).length;
  const above = vals.filter((v) => v > ceiling).length;
  const peaks: number[] = [];
  for (let i = 1; i < vals.length - 1; i++) {
    if (vals[i] >= vals[i - 1] && vals[i] > vals[i + 1] && vals[i] > vals[i - 1]) peaks.push(vals[i]);
  }
  const first = Date.parse(readings[0].recorded_at);
  const last = Date.parse(readings[readings.length - 1].recorded_at);
  return {
    pctTimeBelowFloor: (below / vals.length) * 100,
    pctTimeAboveCeiling: (above / vals.length) * 100,
    minReading: Math.min(...vals),
    typicalPeak: peaks.length ? median(peaks) : Math.max(...vals),
    readingDays: Math.max(0, (last - first) / 86_400_000),
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Is this (area, kind) inside the cooldown window after a dismissal? */
export function inCooldown(recent: RecentAdjustment[], kind: string, todayIso: string): boolean {
  const cutoff = Date.parse(todayIso) - COOLDOWN_DAYS * 86_400_000;
  return recent.some((r) => r.kind === kind && r.status === "dismissed" && Date.parse(r.created_at) >= cutoff);
}

/**
 * Evaluate one area → zero or more proposals (at most one actionable + the
 * in_range record). The runner enforces the open-proposal uniqueness.
 */
export function evaluateArea(input: AreaInput, todayIso: string): CareProposal[] {
  const { profile, readings, plantRanges, coverage, areaName, areaId, recent, forecastMaxC } = input;

  // ── Confidence gates — say nothing rather than guess. ──────────────────────
  if (profile.confidence < MIN_CONFIDENCE) return [];
  if (profile.sample_segments < MIN_SEGMENTS) return [];
  const band = targetBand(plantRanges);
  const stats = realityStats(readings, band.floor, band.ceiling);
  if (stats.readingDays < MIN_READING_DAYS) return [];

  const { rate, segmentUsed } = forecastMatchedRate(profile, forecastMaxC);
  if (rate === null || stats.typicalPeak === null) return [];

  const daysToFloor = (stats.typicalPeak - band.floor) / rate;
  if (!Number.isFinite(daysToFloor) || daysToFloor <= 0) return [];

  const evidence = {
    band, stats: { ...stats, pctTimeBelowFloor: Math.round(stats.pctTimeBelowFloor * 10) / 10 },
    drydown: { ratePctPerDay: rate, segmentUsed },
    daysToFloor: Math.round(daysToFloor * 10) / 10,
    retentionClass: profile.retention_class,
    confidence: profile.confidence,
    plantRangeCount: band.knownCount,
  };

  const proposals: CareProposal[] = [];
  const bp = coverage.blueprint;

  if (bp) {
    // ── Tighten: schedule slower than the bed dries AND the bed suffers. ─────
    if (bp.frequency_days > daysToFloor * 1.25 && stats.pctTimeBelowFloor > 15 && !inCooldown(recent, "tighten_watering", todayIso)) {
      const suggested = clamp(Math.round(daysToFloor), 1, bp.frequency_days - 1);
      proposals.push({
        kind: "tighten_watering", areaId, blueprintId: bp.id,
        currentFrequencyDays: bp.frequency_days, suggestedFrequencyDays: suggested, evidence,
        headline: `${areaName} dries faster than its watering schedule`,
        detail: `Soil dropped below the plants' comfort floor (${Math.round(band.floor)}%) for ${Math.round(stats.pctTimeBelowFloor)}% of the last 2 weeks. At the measured drying speed it reaches the floor in ~${Math.round(daysToFloor)} days, but watering is every ${bp.frequency_days}. Suggest every ${suggested} day${suggested === 1 ? "" : "s"}.`,
      });
    // ── Stretch: bed never gets close to the floor — save the water. ─────────
    } else if (bp.frequency_days < daysToFloor * 0.6 && stats.pctTimeBelowFloor < 2
        && stats.minReading !== null && stats.minReading > band.floor + 10
        && !inCooldown(recent, "stretch_watering", todayIso)) {
      const suggested = clamp(Math.round(daysToFloor * 0.8), bp.frequency_days + 1, bp.frequency_days + 3);
      proposals.push({
        kind: "stretch_watering", areaId, blueprintId: bp.id,
        currentFrequencyDays: bp.frequency_days, suggestedFrequencyDays: suggested, evidence,
        headline: `${areaName} is watered more often than it needs`,
        detail: `Moisture never dropped within 10 points of the comfort floor in 2 weeks (lowest: ${Math.round(stats.minReading)}%). The bed takes ~${Math.round(daysToFloor)} days to reach the floor. You could stretch from every ${bp.frequency_days} to every ${suggested} days.`,
      });
    }

    // ── Stress risk: a hot week outruns the schedule (independent of above). ─
    const hotAhead = forecastMaxC.filter((t) => t >= HOT_DAY_C).length >= 3;
    if (hotAhead && segmentUsed === "hot_dry" && daysToFloor < bp.frequency_days
        && !inCooldown(recent, "stress_risk", todayIso)
        && !proposals.some((p) => p.kind === "tighten_watering")) {
      proposals.push({
        kind: "stress_risk", areaId, blueprintId: bp.id,
        currentFrequencyDays: bp.frequency_days, suggestedFrequencyDays: null, evidence,
        headline: `Hot week ahead may outrun ${areaName}'s watering`,
        detail: `In hot spells this bed dries at ${rate.toFixed(1)}%/day — reaching the comfort floor in ~${Math.round(daysToFloor)} days, sooner than the every-${bp.frequency_days}-days schedule. Keep an eye on it or water between rounds.`,
      });
    }
  } else if (!coverage.hasWateringAutomation) {
    // ── Create routine: real need, nothing covers the bed. ───────────────────
    const showsNeed = stats.pctTimeBelowFloor > 15 || (stats.minReading !== null && stats.minReading < band.floor);
    if (showsNeed && !inCooldown(recent, "create_watering_routine", todayIso)) {
      const suggested = clamp(Math.round(daysToFloor * 0.9), 1, 14);
      proposals.push({
        kind: "create_watering_routine", areaId, blueprintId: null,
        currentFrequencyDays: null, suggestedFrequencyDays: suggested, evidence,
        headline: `${areaName} has no watering routine — and it shows`,
        detail: `The soil sensor recorded moisture below the plants' comfort floor (${Math.round(band.floor)}%) ${stats.pctTimeBelowFloor > 15 ? `${Math.round(stats.pctTimeBelowFloor)}% of the time` : "recently"}, and nothing waters this bed. Based on its measured drying speed, a routine every ${suggested} day${suggested === 1 ? "" : "s"} would keep it in range.`,
      });
    }
  }

  // ── In-range record (quiet good news; never when something actionable). ────
  if (proposals.length === 0 && stats.pctTimeBelowFloor < 5 && stats.pctTimeAboveCeiling < 20) {
    proposals.push({
      kind: "in_range", areaId, blueprintId: bp?.id ?? null,
      currentFrequencyDays: bp?.frequency_days ?? null, suggestedFrequencyDays: null, evidence,
      headline: `${areaName} is on track`,
      detail: `Soil moisture stayed inside the plants' comfort range for the last 2 weeks. Nothing to change.`,
    });
  }

  return proposals;
}

// ── Verification (≥7 days after apply) ───────────────────────────────────────

export interface VerificationResult {
  verdict: "verified_good" | "verified_mixed";
  verification: Record<string, unknown>;
}

/** Re-measure an applied adjustment on its post-change reading window. */
export function verifyAdjustment(
  postChangeReadings: MoistureReading[],
  band: { floor: number; ceiling: number },
  preChangePctBelowFloor: number,
): VerificationResult | null {
  const stats = realityStats(postChangeReadings, band.floor, band.ceiling);
  if (stats.readingDays < 7) return null; // not enough post-change data yet
  const improved = stats.pctTimeBelowFloor <= Math.max(5, preChangePctBelowFloor * 0.5);
  const inRangePct = 100 - stats.pctTimeBelowFloor - stats.pctTimeAboveCeiling;
  return {
    verdict: improved ? "verified_good" : "verified_mixed",
    verification: {
      windowDays: Math.round(stats.readingDays),
      pctTimeBelowFloor: Math.round(stats.pctTimeBelowFloor * 10) / 10,
      inRangePct: Math.round(inRangePct * 10) / 10,
      preChangePctBelowFloor: Math.round(preChangePctBelowFloor * 10) / 10,
    },
  };
}
