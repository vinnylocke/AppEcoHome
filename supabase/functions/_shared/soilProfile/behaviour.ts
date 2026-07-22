/**
 * Soil temperature + EC behaviour — pure, deterministic math (no AI, no I/O).
 *
 * Companion to drydown.ts: where that models moisture decline, this summarises
 * the other two soil-sensor series over a trailing window (default 7 days):
 *   - temp : mean daily peak, mean overnight low, mean diurnal swing
 *   - EC   : mean level, coefficient of variation → stability class, and a
 *            first-half vs second-half trend direction
 *
 * Days are bucketed on the UTC date of `recorded_at` — good enough for a
 * behavioural indicator (a reading near local midnight lands in the adjacent
 * bucket, which washes out over the multi-day means).
 *
 * Tested in supabase/tests/soil_behaviour_test.ts.
 */

export interface BehaviourPoint {
  t: number; // epoch ms
  temp: number | null; // °C
  ec: number | null; // µS/cm or raw ADC, per the sensor's ec_source
}

export interface TempBehaviour {
  dayMaxC: number | null; // mean of daily maxima
  nightMinC: number | null; // mean of daily minima
  diurnalSwingC: number | null; // mean daily (max − min)
  sampleDays: number;
}

export type EcStability = "stable" | "drifting" | "volatile" | "unknown";
export type EcTrend = "rising" | "falling" | "flat" | "unknown";

export interface EcBehaviour {
  mean: number | null;
  cv: number | null; // coefficient of variation, 0..1
  stability: EcStability;
  trend: EcTrend;
  sampleDays: number;
}

// ── Tunables ────────────────────────────────────────────────────────────────
const MIN_READINGS_PER_DAY = 4; // fewer than this and a day's max/min is noise
const MIN_SAMPLE_DAYS = 3; // need this many qualifying days for any output
const CV_STABLE_MAX = 0.05; // ≤ 5% variation = stable
const CV_DRIFTING_MAX = 0.15; // 5–15% = drifting; above = volatile
const TREND_REL_THRESHOLD = 0.05; // halves differing ≥ 5% = a real trend

const round = (n: number, dp = 1) => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Group finite values of `pick` by UTC day; drop days with too few readings. */
function byDay(points: BehaviourPoint[], pick: (p: BehaviourPoint) => number | null): number[][] {
  const days = new Map<string, number[]>();
  for (const p of points) {
    const v = pick(p);
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    const key = new Date(p.t).toISOString().slice(0, 10);
    const arr = days.get(key) ?? [];
    arr.push(v);
    days.set(key, arr);
  }
  return [...days.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([, vs]) => vs)
    .filter((vs) => vs.length >= MIN_READINGS_PER_DAY);
}

export function computeTempBehaviour(points: BehaviourPoint[]): TempBehaviour {
  const days = byDay(points, (p) => p.temp);
  if (days.length < MIN_SAMPLE_DAYS) {
    return { dayMaxC: null, nightMinC: null, diurnalSwingC: null, sampleDays: days.length };
  }
  const maxima = days.map((vs) => Math.max(...vs));
  const minima = days.map((vs) => Math.min(...vs));
  const swings = days.map((vs) => Math.max(...vs) - Math.min(...vs));
  return {
    dayMaxC: round(mean(maxima)),
    nightMinC: round(mean(minima)),
    diurnalSwingC: round(mean(swings)),
    sampleDays: days.length,
  };
}

export function computeEcBehaviour(points: BehaviourPoint[]): EcBehaviour {
  const days = byDay(points, (p) => p.ec);
  if (days.length < MIN_SAMPLE_DAYS) {
    return { mean: null, cv: null, stability: "unknown", trend: "unknown", sampleDays: days.length };
  }
  const dailyMeans = days.map(mean);
  const overall = mean(dailyMeans);
  if (overall <= 0) {
    // Raw-ADC sensors can idle at 0; a zero mean makes CV meaningless.
    return { mean: round(overall), cv: null, stability: "unknown", trend: "unknown", sampleDays: days.length };
  }
  const variance = mean(dailyMeans.map((v) => (v - overall) ** 2));
  const cv = Math.sqrt(variance) / overall;

  const stability: EcStability = cv <= CV_STABLE_MAX ? "stable" : cv <= CV_DRIFTING_MAX ? "drifting" : "volatile";

  const half = Math.floor(dailyMeans.length / 2);
  const firstHalf = mean(dailyMeans.slice(0, half));
  const secondHalf = mean(dailyMeans.slice(dailyMeans.length - half));
  const rel = firstHalf > 0 ? (secondHalf - firstHalf) / firstHalf : 0;
  const trend: EcTrend = rel >= TREND_REL_THRESHOLD ? "rising" : rel <= -TREND_REL_THRESHOLD ? "falling" : "flat";

  return { mean: round(overall), cv: round(cv, 3), stability, trend, sampleDays: days.length };
}
