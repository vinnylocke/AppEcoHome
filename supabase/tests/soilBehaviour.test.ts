import { assert, assertEquals } from "@std/assert";
import {
  computeTempBehaviour,
  computeEcBehaviour,
  type BehaviourPoint,
} from "../functions/_shared/soilProfile/behaviour.ts";

const HOUR = 3_600_000;
const BASE = Date.UTC(2026, 6, 1); // 2026-07-01

/** One reading every 3h for `days` days. temp swings 12→28°C daily; ec via fn. */
function buildSeries(days: number, ecFor: (day: number, hour: number) => number | null): BehaviourPoint[] {
  const pts: BehaviourPoint[] = [];
  for (let day = 0; day < days; day++) {
    for (let hour = 0; hour < 24; hour += 3) {
      // Sinusoidal-ish day: coolest at 03:00 (12°C), hottest at 15:00 (28°C).
      const temp = 20 + 8 * Math.sin(((hour - 9) / 24) * 2 * Math.PI);
      pts.push({ t: BASE + day * 24 * HOUR + hour * HOUR, temp, ec: ecFor(day, hour) });
    }
  }
  return pts;
}

Deno.test("computeTempBehaviour — steady diurnal cycle yields matching max/min/swing", () => {
  const b = computeTempBehaviour(buildSeries(7, () => 400));
  assertEquals(b.sampleDays, 7);
  assert(b.dayMaxC !== null && Math.abs(b.dayMaxC - 28) < 0.5, `dayMax ${b.dayMaxC} ~28`);
  assert(b.nightMinC !== null && Math.abs(b.nightMinC - 12) < 0.5, `nightMin ${b.nightMinC} ~12`);
  assert(b.diurnalSwingC !== null && Math.abs(b.diurnalSwingC - 16) < 1, `swing ${b.diurnalSwingC} ~16`);
});

Deno.test("computeTempBehaviour — under 3 qualifying days returns nulls", () => {
  const b = computeTempBehaviour(buildSeries(2, () => null));
  assertEquals(b.dayMaxC, null);
  assertEquals(b.nightMinC, null);
  assertEquals(b.sampleDays, 2);
});

Deno.test("computeTempBehaviour — days with too few readings are dropped", () => {
  // 7 days but only 2 readings/day — below MIN_READINGS_PER_DAY, so no days qualify.
  const pts: BehaviourPoint[] = [];
  for (let day = 0; day < 7; day++) {
    pts.push({ t: BASE + day * 24 * HOUR, temp: 15, ec: null });
    pts.push({ t: BASE + day * 24 * HOUR + 12 * HOUR, temp: 25, ec: null });
  }
  const b = computeTempBehaviour(pts);
  assertEquals(b.sampleDays, 0);
  assertEquals(b.diurnalSwingC, null);
});

Deno.test("computeEcBehaviour — flat series is stable with a flat trend", () => {
  const b = computeEcBehaviour(buildSeries(7, () => 500));
  assertEquals(b.sampleDays, 7);
  assertEquals(b.mean, 500);
  assertEquals(b.stability, "stable");
  assertEquals(b.trend, "flat");
});

Deno.test("computeEcBehaviour — steadily climbing series reads as rising", () => {
  // +8%/day compounding — well past the 5% half-vs-half threshold.
  const b = computeEcBehaviour(buildSeries(7, (day) => 400 * 1.08 ** day));
  assertEquals(b.trend, "rising");
  assert(b.stability === "drifting" || b.stability === "volatile", `stability ${b.stability}`);
});

Deno.test("computeEcBehaviour — big day-to-day jumps read as volatile", () => {
  const b = computeEcBehaviour(buildSeries(6, (day) => (day % 2 === 0 ? 300 : 700)));
  assertEquals(b.stability, "volatile");
});

Deno.test("computeEcBehaviour — zero-mean (idle raw ADC) gives unknown, not NaN", () => {
  const b = computeEcBehaviour(buildSeries(7, () => 0));
  assertEquals(b.stability, "unknown");
  assertEquals(b.cv, null);
  assertEquals(b.mean, 0);
});

Deno.test("computeEcBehaviour — no EC readings at all is unknown with 0 sample days", () => {
  const b = computeEcBehaviour(buildSeries(7, () => null));
  assertEquals(b.sampleDays, 0);
  assertEquals(b.stability, "unknown");
  assertEquals(b.trend, "unknown");
});
