import { assert, assertEquals } from "@std/assert";
import {
  computeRainWindow,
  evaluateHybrid,
  type HourlyPoint,
  type RainForecast,
} from "@shared/automationEvaluator.ts";

const NOW = new Date("2026-06-17T08:00:00Z");

function hours(spec: Array<[string, number, number?]>): HourlyPoint[] {
  return spec.map(([t, prob, precip]) => ({ time: new Date(t), probability: prob, precipitation: precip }));
}

// ── computeRainWindow ────────────────────────────────────────────────────────

Deno.test("computeRainWindow — sums hourly mm in window + ends after last wet hour", () => {
  const hourly = hours([
    ["2026-06-17T09:00:00Z", 80, 2],
    ["2026-06-17T10:00:00Z", 70, 3],
    ["2026-06-17T20:00:00Z", 10, 0], // outside the qualifying probability
  ]);
  const r = computeRainWindow(99, 0, hourly, NOW, 12, 60, 2);
  assertEquals(r.rainMm, 5); // 2 + 3 (hourly preferred over daily 99)
  assertEquals(r.probabilityMax, 80);
  // last qualifying hour 10:00 + 2h buffer
  assertEquals(r.windowEnd.toISOString(), "2026-06-17T12:00:00.000Z");
});

Deno.test("computeRainWindow — falls back to daily total + now+window when no hourly", () => {
  const r = computeRainWindow(7, 65, [], NOW, 12, 60);
  assertEquals(r.rainMm, 7);
  assertEquals(r.probabilityMax, 65);
  assertEquals(r.windowEnd.toISOString(), "2026-06-17T20:00:00.000Z"); // now + 12h
});

Deno.test("computeRainWindow — ignores hours outside the look-ahead window", () => {
  const hourly = hours([["2026-06-18T09:00:00Z", 90, 5]]); // > 12h away
  const r = computeRainWindow(0, 0, hourly, NOW, 12, 60);
  assertEquals(r.rainMm, 0);
});

// ── evaluateHybrid ───────────────────────────────────────────────────────────

const rainNow: RainForecast = { rainMm: 8, probabilityMax: 80, windowEnd: new Date("2026-06-17T14:00:00Z") };
const noRain: RainForecast = { rainMm: 0, probabilityMax: 10, windowEnd: new Date("2026-06-17T20:00:00Z") };

const base = {
  rainThresholdMm: 5,
  minProbability: 60,
  maxDefers: 2,
  deferSkipInHeat: true,
  isHeatwave: false,
  criticalSatisfied: false,
  now: NOW,
};

Deno.test("off mode always fires", () => {
  const d = evaluateHybrid({ ...base, weatherMode: "off", rain: rainNow, defer: { deferUntil: null, deferCount: 0 } });
  assertEquals(d.decision, "fire");
});

Deno.test("skip mode skips on meaningful rain, fires otherwise", () => {
  assertEquals(evaluateHybrid({ ...base, weatherMode: "skip", rain: rainNow, defer: { deferUntil: null, deferCount: 0 } }).decision, "skip");
  assertEquals(evaluateHybrid({ ...base, weatherMode: "skip", rain: noRain, defer: { deferUntil: null, deferCount: 0 } }).decision, "fire");
});

Deno.test("defer mode defers when rain forecast + soil low", () => {
  const d = evaluateHybrid({ ...base, weatherMode: "defer", rain: rainNow, defer: { deferUntil: null, deferCount: 0 } });
  assertEquals(d.decision, "defer");
  if (d.decision === "defer") assertEquals(d.until.toISOString(), rainNow.windowEnd.toISOString());
});

Deno.test("defer mode — critical-low fires regardless of forecast", () => {
  const d = evaluateHybrid({ ...base, weatherMode: "defer", criticalSatisfied: true, rain: rainNow, defer: { deferUntil: null, deferCount: 0 } });
  assertEquals(d.decision, "fire");
  if (d.decision === "fire") assertEquals(d.reason, "critical_low");
});

Deno.test("defer mode — heatwave waters anyway when defer_skip_in_heat", () => {
  const hot = evaluateHybrid({ ...base, weatherMode: "defer", isHeatwave: true, deferSkipInHeat: true, rain: rainNow, defer: { deferUntil: null, deferCount: 0 } });
  assertEquals(hot.decision, "fire");
  const wait = evaluateHybrid({ ...base, weatherMode: "defer", isHeatwave: true, deferSkipInHeat: false, rain: rainNow, defer: { deferUntil: null, deferCount: 0 } });
  assertEquals(wait.decision, "defer");
});

Deno.test("defer mode — holds while deferral is in the future", () => {
  const future = new Date(NOW.getTime() + 3_600_000);
  const d = evaluateHybrid({ ...base, weatherMode: "defer", rain: rainNow, defer: { deferUntil: future, deferCount: 1 } });
  assertEquals(d.decision, "skip");
  if (d.decision === "skip") assertEquals(d.reason, "still_deferred");
});

Deno.test("defer mode — recheck due + still low + rain gone → waters (forecast under-delivered)", () => {
  const past = new Date(NOW.getTime() - 3_600_000);
  const d = evaluateHybrid({ ...base, weatherMode: "defer", rain: noRain, defer: { deferUntil: past, deferCount: 1 } });
  assertEquals(d.decision, "fire");
  if (d.decision === "fire") assertEquals(d.reason, "forecast_underdelivered");
});

Deno.test("defer mode — max_defers cap forces a fire instead of endless deferral", () => {
  const d = evaluateHybrid({ ...base, weatherMode: "defer", rain: rainNow, maxDefers: 2, defer: { deferUntil: null, deferCount: 2 } });
  assertEquals(d.decision, "fire");
});

Deno.test("five forecast showers collapse to ONE deferral (no per-event conflict)", () => {
  // Five showers across today; one look-ahead resolves a single window end.
  const showers = hours([
    ["2026-06-17T09:00:00Z", 70, 1],
    ["2026-06-17T11:00:00Z", 80, 1],
    ["2026-06-17T13:00:00Z", 75, 1],
    ["2026-06-17T15:00:00Z", 65, 1],
    ["2026-06-17T17:00:00Z", 90, 1],
  ]);
  const rain = computeRainWindow(0, 0, showers, NOW, 12, 60);
  // First tick: not deferred → one defer to the end of the last shower (+2h).
  const first = evaluateHybrid({ ...base, weatherMode: "defer", rain, defer: { deferUntil: null, deferCount: 0 } });
  assertEquals(first.decision, "defer");
  if (first.decision === "defer") assertEquals(first.until.toISOString(), "2026-06-17T19:00:00.000Z");
  // Subsequent ticks while showers come and go just HOLD the single deferral.
  const held = evaluateHybrid({ ...base, weatherMode: "defer", rain, defer: { deferUntil: first.decision === "defer" ? first.until : null, deferCount: 1 } });
  assertEquals(held.decision, "skip");
});
