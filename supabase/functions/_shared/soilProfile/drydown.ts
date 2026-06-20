/**
 * Soil-moisture behaviour model — pure, deterministic math (no AI, no I/O).
 *
 * Given a device's moisture time-series (+ optional daily weather), we split it
 * into "dry-down segments" (a run of declining moisture between waterings/rain),
 * regress each segment's slope, and summarise:
 *   - drydownRatePerDay : median %/day decline across segments
 *   - retentionClass    : fast_draining | balanced | moisture_retentive
 *   - byWeather         : per-condition drydown (hot_dry / mild / cool_wet)
 *   - watering response  : how big a rewet is + how long a segment lasts
 *   - confidence        : 0..1 from sample size × regression fit
 *
 * Rewet events (waterings or rain) are detected from the series itself — a sharp
 * rise in moisture — so this needs no valve_events and also captures rainfall.
 *
 * Tested in supabase/tests/soil_drydown_test.ts.
 */

export interface MoisturePoint {
  t: number; // epoch ms
  moisture: number; // percent
}

export interface WeatherDay {
  date: string; // YYYY-MM-DD
  maxTempC: number | null;
  rainMm: number | null;
}

export type RetentionClass = "fast_draining" | "balanced" | "moisture_retentive" | "unknown";
export type WeatherKey = "hot_dry" | "mild" | "cool_wet";

export interface DrydownSegment {
  startT: number;
  endT: number;
  startMoisture: number;
  endMoisture: number;
  ratePerDay: number; // %/day, positive = drying
  durationDays: number;
  points: number;
  r2: number;
}

export interface WeatherBucket {
  key: WeatherKey;
  ratePerDay: number;
  segments: number;
}

export interface MoistureProfile {
  drydownRatePerDay: number | null;
  retentionClass: RetentionClass;
  byWeather: WeatherBucket[];
  rewetCount: number;
  avgRewetJump: number | null;
  avgSegmentDurationDays: number | null;
  sampleSegments: number;
  confidence: number; // 0..1
}

// ── Tunables ────────────────────────────────────────────────────────────────
const DAY_MS = 86_400_000;
const REWET_JUMP_PCT = 4; // a rise ≥ this between consecutive points = rewet
const MAX_GAP_HOURS = 12; // a data gap longer than this ends a segment
const MIN_SEG_POINTS = 3; // need at least this many points to regress
const MIN_SEG_HOURS = 4; // and at least this much elapsed time
const MIN_SEG_DECLINE_PCT = 2; // and a net decline of at least this much

// Retention thresholds (%/day). Tunable.
const RETENTIVE_MAX = 3; // < 3 %/day = holds water well
const BALANCED_MAX = 7; // 3–7 = balanced; > 7 = fast-draining

const round = (n: number, dp = 2) => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

const median = (xs: number[]): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** OLS regression of moisture (y) vs time-in-days (x). */
function regress(points: MoisturePoint[]): { ratePerDay: number; r2: number } {
  const n = points.length;
  const t0 = points[0].t;
  const xs = points.map((p) => (p.t - t0) / DAY_MS);
  const ys = points.map((p) => p.moisture);
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  const slope = sxx === 0 ? 0 : sxy / sxx; // %/day (negative while drying)
  const r2 = syy === 0 || sxx === 0 ? 0 : clamp((sxy * sxy) / (sxx * syy), 0, 1);
  return { ratePerDay: -slope, r2 }; // flip so drying is positive
}

/**
 * Split a moisture series into dry-down segments + record the rewet jumps that
 * separate them. Returns segments that pass the noise/length filters.
 */
export function detectSegments(
  rawPoints: MoisturePoint[],
): { segments: DrydownSegment[]; rewets: number[] } {
  const points = [...rawPoints]
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.moisture))
    .sort((a, b) => a.t - b.t);

  const rewets: number[] = [];
  const rawSegments: MoisturePoint[][] = [];
  let current: MoisturePoint[] = [];

  const flush = () => {
    if (current.length) rawSegments.push(current);
    current = [];
  };

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (current.length === 0) {
      current.push(p);
      continue;
    }
    const prev = current[current.length - 1];
    const gapHours = (p.t - prev.t) / 3_600_000;
    const rise = p.moisture - prev.moisture;

    if (rise >= REWET_JUMP_PCT) {
      // Watering / rain — close the segment and record the jump.
      rewets.push(round(rise, 1));
      flush();
      current.push(p);
    } else if (gapHours > MAX_GAP_HOURS) {
      // Sensor gap — don't regress across it.
      flush();
      current.push(p);
    } else {
      current.push(p);
    }
  }
  flush();

  const segments: DrydownSegment[] = [];
  for (const seg of rawSegments) {
    if (seg.length < MIN_SEG_POINTS) continue;
    const startT = seg[0].t;
    const endT = seg[seg.length - 1].t;
    const durationDays = (endT - startT) / DAY_MS;
    if (durationDays * 24 < MIN_SEG_HOURS) continue;
    const startMoisture = seg[0].moisture;
    const endMoisture = seg[seg.length - 1].moisture;
    if (startMoisture - endMoisture < MIN_SEG_DECLINE_PCT) continue; // flat / noise

    const { ratePerDay, r2 } = regress(seg);
    if (ratePerDay <= 0) continue; // not actually drying

    segments.push({
      startT,
      endT,
      startMoisture: round(startMoisture, 1),
      endMoisture: round(endMoisture, 1),
      ratePerDay: round(ratePerDay, 2),
      durationDays: round(durationDays, 2),
      points: seg.length,
      r2: round(r2, 3),
    });
  }

  return { segments, rewets };
}

export function classifyRetention(ratePerDay: number | null): RetentionClass {
  if (ratePerDay === null) return "unknown";
  if (ratePerDay < RETENTIVE_MAX) return "moisture_retentive";
  if (ratePerDay <= BALANCED_MAX) return "balanced";
  return "fast_draining";
}

/** Classify the weather a segment dried under, from daily temp + rain. */
export function weatherKeyForSegment(
  seg: DrydownSegment,
  weatherByDate: Map<string, WeatherDay>,
): WeatherKey {
  const temps: number[] = [];
  let rain = 0;
  let haveRain = false;
  // Walk each day the segment spans.
  for (let t = seg.startT; t <= seg.endT + DAY_MS; t += DAY_MS) {
    const date = new Date(t).toISOString().split("T")[0];
    const w = weatherByDate.get(date);
    if (!w) continue;
    if (w.maxTempC !== null) temps.push(w.maxTempC);
    if (w.rainMm !== null) {
      rain += w.rainMm;
      haveRain = true;
    }
  }
  if (temps.length === 0 && !haveRain) return "mild"; // no data → neutral
  const avgTemp = temps.length ? mean(temps) : null;
  if (rain >= 2 || (avgTemp !== null && avgTemp <= 12)) return "cool_wet";
  if (avgTemp !== null && avgTemp >= 24 && rain < 1) return "hot_dry";
  return "mild";
}

/** Build the full profile from a moisture series + optional daily weather. */
export function computeMoistureProfile(
  points: MoisturePoint[],
  weather: WeatherDay[] = [],
): MoistureProfile {
  const { segments, rewets } = detectSegments(points);
  const weatherByDate = new Map<string, WeatherDay>();
  for (const w of weather) weatherByDate.set(w.date, w);

  const rewetCount = rewets.length;
  const avgRewetJump = rewetCount ? round(mean(rewets), 1) : null;

  if (segments.length === 0) {
    return {
      drydownRatePerDay: null,
      retentionClass: "unknown",
      byWeather: [],
      rewetCount,
      avgRewetJump,
      avgSegmentDurationDays: null,
      sampleSegments: 0,
      confidence: 0,
    };
  }

  const rates = segments.map((s) => s.ratePerDay);
  const drydownRatePerDay = round(median(rates), 2);

  // Weather buckets.
  const byKey = new Map<WeatherKey, number[]>();
  for (const seg of segments) {
    const key = weatherKeyForSegment(seg, weatherByDate);
    const arr = byKey.get(key) ?? [];
    arr.push(seg.ratePerDay);
    byKey.set(key, arr);
  }
  const byWeather: WeatherBucket[] = [...byKey.entries()].map(([key, arr]) => ({
    key,
    ratePerDay: round(median(arr), 2),
    segments: arr.length,
  }));

  // Confidence: more clean segments + better fit → higher.
  const segFactor = clamp(segments.length / 5, 0, 1);
  const r2Factor = clamp(mean(segments.map((s) => s.r2)), 0, 1);
  const confidence = round(segFactor * (0.5 + 0.5 * r2Factor), 2);

  return {
    drydownRatePerDay,
    retentionClass: classifyRetention(drydownRatePerDay),
    byWeather,
    rewetCount,
    avgRewetJump,
    avgSegmentDurationDays: round(mean(segments.map((s) => s.durationDays)), 2),
    sampleSegments: segments.length,
    confidence,
  };
}
