import { assert, assertEquals } from "@std/assert";
import {
  evaluateTree,
  isWithinSchedule,
  evalSensorLeaf,
  evalWeatherLeaf,
  shouldFire,
  summariseTree,
  type ConditionNode,
  type LeafNode,
  type WeeklySchedule,
} from "@shared/conditionTree.ts";
import type { RainForecast } from "@shared/automationEvaluator.ts";

// Stub leaves: a task_due leaf whose single id is "true"/"false" drives leafEval.
const T: ConditionNode = { kind: "task_due", blueprintIds: ["true"] };
const F: ConditionNode = { kind: "task_due", blueprintIds: ["false"] };
const stubEval = (leaf: LeafNode) => leaf.kind === "task_due" && leaf.blueprintIds[0] === "true";

// ── evaluateTree ─────────────────────────────────────────────────────────────

Deno.test("evaluateTree — AND / OR", () => {
  assert(evaluateTree({ kind: "group", op: "and", children: [T, T] }, stubEval));
  assert(!evaluateTree({ kind: "group", op: "and", children: [T, F] }, stubEval));
  assert(evaluateTree({ kind: "group", op: "or", children: [T, F] }, stubEval));
  assert(!evaluateTree({ kind: "group", op: "or", children: [F, F] }, stubEval));
});

Deno.test("evaluateTree — negate on leaf and group", () => {
  assert(evaluateTree({ ...F, negate: true } as ConditionNode, stubEval));
  assert(evaluateTree({ kind: "group", op: "and", negate: true, children: [T, F] }, stubEval));
});

Deno.test("evaluateTree — nesting (A or B) and not C", () => {
  const tree: ConditionNode = {
    kind: "group", op: "and", children: [
      { kind: "group", op: "or", children: [T, F] },
      { ...F, negate: true } as ConditionNode,
    ],
  };
  assert(evaluateTree(tree, stubEval));
});

Deno.test("evaluateTree — empty groups: AND=true, OR=false", () => {
  assert(evaluateTree({ kind: "group", op: "and", children: [] }, stubEval));
  assert(!evaluateTree({ kind: "group", op: "or", children: [] }, stubEval));
});

// ── isWithinSchedule ─────────────────────────────────────────────────────────

const empty = (): WeeklySchedule => ({ mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] });

Deno.test("isWithinSchedule — weekday + time window (UTC)", () => {
  const s = empty(); s.thu = [{ start: "18:00", end: "19:00" }];
  assert(isWithinSchedule(new Date("2026-01-15T18:30:00Z"), s, "UTC"));     // Thu 18:30
  assert(!isWithinSchedule(new Date("2026-01-15T19:30:00Z"), s, "UTC"));    // Thu 19:30 — out
  assert(!isWithinSchedule(new Date("2026-01-16T18:30:00Z"), s, "UTC"));    // Fri — wrong day
});

Deno.test("isWithinSchedule — timezone shifts the local day/time", () => {
  const s = empty(); s.thu = [{ start: "18:00", end: "19:00" }];
  // 23:30 UTC Thu → 18:30 Thu in New York (UTC-5) → inside; in UTC it's 23:30 → outside.
  assert(isWithinSchedule(new Date("2026-01-15T23:30:00Z"), s, "America/New_York"));
  assert(!isWithinSchedule(new Date("2026-01-15T23:30:00Z"), s, "UTC"));
});

Deno.test("isWithinSchedule — overnight slot wraps past midnight", () => {
  const s = empty(); s.mon = [{ start: "22:00", end: "06:00" }];
  assert(isWithinSchedule(new Date("2026-01-19T23:00:00Z"), s, "UTC"));  // Mon 23:00 — inside (post-start)
  assert(isWithinSchedule(new Date("2026-01-20T05:00:00Z"), s, "UTC"));  // Tue 05:00 — inside (wrap)
  assert(!isWithinSchedule(new Date("2026-01-20T07:00:00Z"), s, "UTC")); // Tue 07:00 — out
});

Deno.test("isWithinSchedule — all-day slot, empty day off", () => {
  const s = empty(); s.wed = [{ start: "00:00", end: "24:00" }];
  assert(isWithinSchedule(new Date("2026-01-14T03:00:00Z"), s, "UTC"));  // Wed
  assert(!isWithinSchedule(new Date("2026-01-15T03:00:00Z"), s, "UTC")); // Thu — empty
});

// ── leaf evaluators ──────────────────────────────────────────────────────────

Deno.test("evalSensorLeaf — agg modes + empty", () => {
  const leaf = { metric: "soil_moisture" as const, comparator: "<" as const, value: 30, agg: "any" as const };
  assert(evalSensorLeaf(leaf, [{ value: 25 }, { value: 40 }]));
  assert(!evalSensorLeaf({ ...leaf, agg: "all" }, [{ value: 25 }, { value: 40 }]));
  assert(evalSensorLeaf({ ...leaf, agg: "average" }, [{ value: 20 }, { value: 30 }])); // avg 25 < 30
  assert(!evalSensorLeaf(leaf, []));
});

const forecast = (rainMm: number, prob: number, hot: boolean, maxTempC = 20) => ({
  rain: { rainMm, probabilityMax: prob, windowEnd: new Date() } as RainForecast,
  isHeatwave: hot, maxTempC,
});

Deno.test("evalWeatherLeaf — rain forecast + heatwave", () => {
  assert(evalWeatherLeaf({ type: "rain_forecast", thresholdMm: 5, minProbability: 60 }, forecast(8, 80, false)));
  assert(!evalWeatherLeaf({ type: "rain_forecast", thresholdMm: 5, minProbability: 60 }, forecast(8, 40, false)));
  assert(evalWeatherLeaf({ type: "heatwave" }, forecast(0, 0, true)));
  assert(evalWeatherLeaf({ type: "heatwave", thresholdC: 28 }, forecast(0, 0, false, 30)));
  assert(!evalWeatherLeaf({ type: "heatwave", thresholdC: 28 }, forecast(0, 0, false, 25)));
});

// ── shouldFire (rising edge + cooldown) ──────────────────────────────────────

Deno.test("summariseTree — root group unwrapped, leaves + negate", () => {
  const tree: ConditionNode = {
    kind: "group", op: "and", children: [
      { kind: "sensor", metric: "soil_moisture", comparator: "<", value: 30, agg: "any" },
      { kind: "weather", type: "rain_forecast", thresholdMm: 5, negate: true },
    ],
  };
  assertEquals(summariseTree(tree), "moisture < 30% and not rain forecast (≥5mm)");
  assertEquals(summariseTree(null), "");
});

Deno.test("shouldFire — rising edge, holds, cooldown floor", () => {
  const now = new Date("2026-01-15T08:00:00Z");
  assert(shouldFire(true, false, null, 60, now));                                  // fresh edge
  assert(!shouldFire(true, true, null, 60, now));                                  // holding
  assert(!shouldFire(false, false, null, 60, now));                                // not true
  assert(!shouldFire(true, false, new Date("2026-01-15T07:30:00Z"), 60, now));     // edge but cooling
  assert(shouldFire(true, false, new Date("2026-01-15T06:30:00Z"), 60, now));      // edge, cooled
});
