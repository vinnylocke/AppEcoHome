/**
 * Battery decay regression — given a series of `battery_percent`
 * readings over time, returns the slope (% per day) and an estimate
 * of how many days remain until the battery hits 0%.
 *
 * Returns `null` when:
 *   - there are fewer than 10 data points (avoids garbage estimates
 *     on freshly-connected devices)
 *   - the slope is non-negative (battery is flat or recharging — the
 *     UI hides the estimate in that case rather than show
 *     "9999 days remaining")
 *
 * The result is clamped: daysRemaining never goes below 0 or above
 * 999 — anything beyond that is too uncertain to be useful.
 */

export interface BatteryReading {
  /** ISO timestamp. */
  recordedAt: string;
  /** 0–100 integer. */
  percent: number;
}

export interface BatteryEstimate {
  /** Slope in %-per-day. Always negative when returned. */
  slope: number;
  /** Estimated whole days until the battery reaches 0%. */
  daysRemaining: number;
}

const MIN_POINTS = 10;
const MAX_DAYS = 999;

export function estimateBatteryRemaining(readings: BatteryReading[]): BatteryEstimate | null {
  if (readings.length < MIN_POINTS) return null;

  // Normalise into (x = days since first reading, y = percent) pairs.
  // Sorting by time so callers don't have to.
  const sorted = [...readings].sort((a, b) =>
    new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime(),
  );
  const t0 = new Date(sorted[0].recordedAt).getTime();
  const points = sorted.map((r) => ({
    x: (new Date(r.recordedAt).getTime() - t0) / (1000 * 60 * 60 * 24),
    y: r.percent,
  }));

  // Standard ordinary least squares.
  const n = points.length;
  const sumX = points.reduce((acc, p) => acc + p.x, 0);
  const sumY = points.reduce((acc, p) => acc + p.y, 0);
  const sumXY = points.reduce((acc, p) => acc + p.x * p.y, 0);
  const sumXX = points.reduce((acc, p) => acc + p.x * p.x, 0);

  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return null;

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  if (slope >= 0) return null;

  // Extrapolate the current battery position to where it hits 0.
  // Use the latest point's x as "now" to avoid the model thinking
  // the device has gone through more decay than it has.
  const latestX = points[points.length - 1].x;
  const latestProjected = slope * latestX + intercept;
  const daysRemainingRaw = -latestProjected / slope;
  if (!Number.isFinite(daysRemainingRaw)) return null;

  const daysRemaining = Math.max(0, Math.min(MAX_DAYS, Math.round(daysRemainingRaw)));
  return { slope, daysRemaining };
}
