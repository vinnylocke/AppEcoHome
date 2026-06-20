import { assert, assertEquals } from "@std/assert";
import {
  computeMoistureProfile,
  classifyRetention,
  weatherKeyForSegment,
  detectSegments,
  type MoisturePoint,
  type DrydownSegment,
  type WeatherDay,
} from "../functions/_shared/soilProfile/drydown.ts";

const DAY = 86_400_000;
const BASE = Date.UTC(2026, 5, 1); // 2026-06-01

/** 3 clean dry-down segments (2 days each, 60→40 at 10%/day), rewet between. */
function buildSawtooth(): MoisturePoint[] {
  const pts: MoisturePoint[] = [];
  let dayOffset = 0;
  for (let seg = 0; seg < 3; seg++) {
    for (let d = 0; d <= 2.0001; d += 0.25) {
      pts.push({ t: BASE + (dayOffset + d) * DAY, moisture: 60 - 10 * d });
    }
    dayOffset += 2.01; // tiny gap; next segment's first point (60) is the rewet
  }
  return pts;
}

Deno.test("computeMoistureProfile — clean sawtooth yields ~10%/day, fast-draining", () => {
  const p = computeMoistureProfile(buildSawtooth());
  assertEquals(p.sampleSegments, 3);
  assertEquals(p.rewetCount, 2);
  assert(p.drydownRatePerDay !== null && Math.abs(p.drydownRatePerDay - 10) < 0.5,
    `rate ${p.drydownRatePerDay} should be ~10`);
  assertEquals(p.retentionClass, "fast_draining");
  assert(p.avgRewetJump !== null && Math.abs(p.avgRewetJump - 20) < 0.5);
  assert(p.avgSegmentDurationDays !== null && Math.abs(p.avgSegmentDurationDays - 2) < 0.1);
  assert(p.confidence >= 0.5 && p.confidence <= 0.7, `confidence ${p.confidence} ~0.6`);
  // No weather supplied → every segment buckets as "mild".
  assertEquals(p.byWeather.reduce((n, b) => n + b.segments, 0), 3);
  assertEquals(p.byWeather.every((b) => b.key === "mild"), true);
});

Deno.test("computeMoistureProfile — flat / noisy series gives no reliable profile", () => {
  const pts: MoisturePoint[] = [];
  for (let d = 0; d <= 5; d += 0.25) pts.push({ t: BASE + d * DAY, moisture: 50 + (d % 0.5 === 0 ? 0.3 : -0.3) });
  const p = computeMoistureProfile(pts);
  assertEquals(p.drydownRatePerDay, null);
  assertEquals(p.retentionClass, "unknown");
  assertEquals(p.sampleSegments, 0);
  assertEquals(p.confidence, 0);
});

Deno.test("classifyRetention — thresholds", () => {
  assertEquals(classifyRetention(null), "unknown");
  assertEquals(classifyRetention(2), "moisture_retentive");
  assertEquals(classifyRetention(3), "balanced");
  assertEquals(classifyRetention(5), "balanced");
  assertEquals(classifyRetention(7), "balanced");
  assertEquals(classifyRetention(8), "fast_draining");
});

Deno.test("weatherKeyForSegment — hot/dry vs cool/wet vs mild", () => {
  const seg: DrydownSegment = {
    startT: BASE, endT: BASE + 2 * DAY,
    startMoisture: 60, endMoisture: 40, ratePerDay: 10, durationDays: 2, points: 9, r2: 1,
  };
  const days = (temp: number, rain: number): Map<string, WeatherDay> => {
    const m = new Map<string, WeatherDay>();
    for (let i = 0; i <= 3; i++) {
      const date = new Date(BASE + i * DAY).toISOString().split("T")[0];
      m.set(date, { date, maxTempC: temp, rainMm: rain });
    }
    return m;
  };
  assertEquals(weatherKeyForSegment(seg, days(28, 0)), "hot_dry");
  assertEquals(weatherKeyForSegment(seg, days(10, 0)), "cool_wet");
  assertEquals(weatherKeyForSegment(seg, days(20, 5)), "cool_wet"); // rain dominates
  assertEquals(weatherKeyForSegment(seg, days(18, 0)), "mild");
  assertEquals(weatherKeyForSegment(seg, new Map()), "mild"); // no data → neutral
});

Deno.test("detectSegments — a data gap ends a segment without a rewet", () => {
  const pts: MoisturePoint[] = [];
  // Segment A: 2 days of decline.
  for (let d = 0; d <= 2.0001; d += 0.25) pts.push({ t: BASE + d * DAY, moisture: 60 - 10 * d });
  // 24h gap (> MAX_GAP_HOURS) then a second decline starting LOWER (no rewet jump).
  for (let d = 0; d <= 2.0001; d += 0.25) pts.push({ t: BASE + (3 + d) * DAY, moisture: 38 - 8 * d });
  const { segments, rewets } = detectSegments(pts);
  assertEquals(segments.length, 2);
  assertEquals(rewets.length, 0); // the split was a gap, not a watering
});
