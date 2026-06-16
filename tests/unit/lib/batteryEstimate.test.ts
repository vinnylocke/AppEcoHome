import { describe, it, expect } from "vitest";
import { estimateBatteryRemaining, type BatteryReading } from "../../../src/lib/batteryEstimate";

/**
 * Build a battery decay series: starts at `start%`, drops `dropPerDay`
 * each day over `days` days, sampled `samplesPerDay` times daily.
 */
function buildDecay(start: number, dropPerDay: number, days: number, samplesPerDay = 4): BatteryReading[] {
  const out: BatteryReading[] = [];
  const startMs = Date.UTC(2026, 5, 1, 0, 0, 0);
  for (let d = 0; d < days; d++) {
    for (let s = 0; s < samplesPerDay; s++) {
      const t = startMs + d * 86400_000 + s * (86400_000 / samplesPerDay);
      const percent = Math.max(0, start - dropPerDay * (d + s / samplesPerDay));
      out.push({ recordedAt: new Date(t).toISOString(), percent: Math.round(percent) });
    }
  }
  return out;
}

describe("estimateBatteryRemaining", () => {
  it("returns null when there are fewer than 10 points", () => {
    const series = buildDecay(100, 1, 2, 1);
    expect(series.length).toBeLessThan(10);
    expect(estimateBatteryRemaining(series)).toBeNull();
  });

  it("returns null for a flat (non-decaying) battery", () => {
    const series = Array.from({ length: 20 }, (_, i) => ({
      recordedAt: new Date(2026, 5, 1, i, 0, 0).toISOString(),
      percent: 80,
    }));
    expect(estimateBatteryRemaining(series)).toBeNull();
  });

  it("returns null for a rising trend (recharging)", () => {
    const series = Array.from({ length: 20 }, (_, i) => ({
      recordedAt: new Date(2026, 5, 1, i, 0, 0).toISOString(),
      percent: 50 + i,
    }));
    expect(estimateBatteryRemaining(series)).toBeNull();
  });

  it("estimates a reasonable days-remaining for clean linear decay", () => {
    // 80% → 30% over 10 days = 5% per day. From 30%, ~6 days left.
    const series = buildDecay(80, 5, 10, 4);
    const est = estimateBatteryRemaining(series);
    expect(est).not.toBeNull();
    if (!est) return;
    expect(est.slope).toBeLessThan(0);
    expect(est.daysRemaining).toBeGreaterThanOrEqual(5);
    expect(est.daysRemaining).toBeLessThanOrEqual(8);
  });

  it("clamps daysRemaining at most 999 when the slope is very gentle", () => {
    // tiny decay: 1% over 30 days → near-flat slope → may estimate hundreds of days
    const series = buildDecay(100, 0.03, 30, 4);
    const est = estimateBatteryRemaining(series);
    if (est) {
      expect(est.daysRemaining).toBeLessThanOrEqual(999);
    }
  });

  it("handles noisy data without exploding", () => {
    const clean = buildDecay(90, 2, 15, 4);
    const noisy = clean.map((r, i) => ({
      ...r,
      percent: Math.max(0, Math.min(100, r.percent + ((i * 7) % 5) - 2)),
    }));
    const est = estimateBatteryRemaining(noisy);
    expect(est).not.toBeNull();
    if (!est) return;
    expect(Number.isFinite(est.slope)).toBe(true);
    expect(Number.isFinite(est.daysRemaining)).toBe(true);
    expect(est.daysRemaining).toBeGreaterThanOrEqual(0);
  });

  it("does not crash on points sharing the same timestamp", () => {
    const sameTime: BatteryReading[] = Array.from({ length: 12 }, (_, i) => ({
      recordedAt: new Date(2026, 5, 1, 12, 0, 0).toISOString(),
      percent: 80 - i,
    }));
    // All x values are 0 → denominator collapses → expect null, not a throw.
    expect(() => estimateBatteryRemaining(sameTime)).not.toThrow();
    expect(estimateBatteryRemaining(sameTime)).toBeNull();
  });
});
