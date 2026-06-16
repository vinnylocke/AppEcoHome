import { assert, assertEquals } from "@std/assert";
import {
  evaluateAutomation,
  satisfiesRule,
  type AggMode,
  type Comparator,
  type SensorRule,
} from "@shared/automationEvaluator.ts";

// Phase 3 — sensor-driven automation evaluator tests.

function rule(
  comparator: Comparator,
  threshold: number,
  opts: { hysteresis?: number; cooldown_minutes?: number; agg_mode?: AggMode } = {},
): SensorRule {
  return {
    metric: "soil_temp_c",
    comparator,
    threshold,
    hysteresis: opts.hysteresis ?? 0,
    cooldown_minutes: opts.cooldown_minutes ?? 60,
    agg_mode: opts.agg_mode ?? "any",
  };
}

const NOW = new Date("2026-06-16T12:00:00Z");

// ── satisfiesRule (single-value) ──────────────────────────────────────────

Deno.test("satisfiesRule — >= fires exactly at threshold when hysteresis = 0", () => {
  assertEquals(satisfiesRule(30, rule(">=", 30)), true);
  assertEquals(satisfiesRule(29.9, rule(">=", 30)), false);
});

Deno.test("satisfiesRule — > is strict", () => {
  assertEquals(satisfiesRule(30, rule(">", 30)), false);
  assertEquals(satisfiesRule(30.1, rule(">", 30)), true);
});

Deno.test("satisfiesRule — <= fires exactly at threshold when hysteresis = 0", () => {
  assertEquals(satisfiesRule(8, rule("<=", 8)), true);
  assertEquals(satisfiesRule(8.1, rule("<=", 8)), false);
});

Deno.test("satisfiesRule — hysteresis pushes threshold further for >=", () => {
  // threshold 30, hysteresis 2 → fires at 32+, not at 30.
  const r = rule(">=", 30, { hysteresis: 2 });
  assertEquals(satisfiesRule(31.9, r), false);
  assertEquals(satisfiesRule(32, r), true);
});

Deno.test("satisfiesRule — hysteresis pushes threshold further for <=", () => {
  // threshold 8, hysteresis 2 → fires at 6 or below.
  const r = rule("<=", 8, { hysteresis: 2 });
  assertEquals(satisfiesRule(6.1, r), false);
  assertEquals(satisfiesRule(6, r), true);
});

// ── evaluateAutomation — multi-sensor + agg_mode ──────────────────────────

Deno.test("evaluateAutomation — no sensors → skip with no_sensors_with_data", () => {
  const out = evaluateAutomation(rule(">=", 30), [], null, NOW);
  assertEquals(out.decision, "skip");
  if (out.decision === "skip") assertEquals(out.reason, "no_sensors_with_data");
});

Deno.test("evaluateAutomation — any: one of three sensors hot → fire", () => {
  const r = rule(">=", 30, { agg_mode: "any" });
  const out = evaluateAutomation(
    r,
    [{ value: 25 }, { value: 32 }, { value: 22 }],
    null,
    NOW,
  );
  assertEquals(out.decision, "fire");
});

Deno.test("evaluateAutomation — any: no sensor hot → skip", () => {
  const r = rule(">=", 30, { agg_mode: "any" });
  const out = evaluateAutomation(
    r,
    [{ value: 25 }, { value: 27 }, { value: 22 }],
    null,
    NOW,
  );
  assertEquals(out.decision, "skip");
  if (out.decision === "skip") assertEquals(out.reason, "rule_not_satisfied");
});

Deno.test("evaluateAutomation — all: every sensor must satisfy", () => {
  const r = rule(">=", 30, { agg_mode: "all" });
  // Mixed → skip.
  assertEquals(
    evaluateAutomation(r, [{ value: 30 }, { value: 28 }], null, NOW).decision,
    "skip",
  );
  // Uniformly hot → fire.
  assertEquals(
    evaluateAutomation(r, [{ value: 31 }, { value: 32 }], null, NOW).decision,
    "fire",
  );
});

Deno.test("evaluateAutomation — average: aggregate then compare", () => {
  const r = rule(">=", 30, { agg_mode: "average" });
  // 25 + 35 = 60 → avg 30 → fire (exact).
  assertEquals(
    evaluateAutomation(r, [{ value: 25 }, { value: 35 }], null, NOW).decision,
    "fire",
  );
  // 25 + 32 = 57 → avg 28.5 → skip.
  assertEquals(
    evaluateAutomation(r, [{ value: 25 }, { value: 32 }], null, NOW).decision,
    "skip",
  );
});

// ── Cooldown ──────────────────────────────────────────────────────────────

Deno.test("evaluateAutomation — within cooldown window → skip with remaining seconds", () => {
  const r = rule(">=", 30, { cooldown_minutes: 60 });
  // Last fired 30 min ago → 30 min still to go.
  const lastFired = new Date(NOW.getTime() - 30 * 60 * 1000);
  const out = evaluateAutomation(r, [{ value: 35 }], lastFired, NOW);
  assertEquals(out.decision, "skip");
  if (out.decision === "skip" && out.reason === "cooling_down") {
    assert(out.cooldown_remaining_seconds >= 1700 && out.cooldown_remaining_seconds <= 1801);
  } else {
    throw new Error("expected cooling_down outcome");
  }
});

Deno.test("evaluateAutomation — past cooldown → re-evaluates rule", () => {
  const r = rule(">=", 30, { cooldown_minutes: 60 });
  // Last fired 61 min ago → cooldown elapsed.
  const lastFired = new Date(NOW.getTime() - 61 * 60 * 1000);
  const out = evaluateAutomation(r, [{ value: 35 }], lastFired, NOW);
  assertEquals(out.decision, "fire");
});

Deno.test("evaluateAutomation — cooldown 0 means no cooldown", () => {
  const r = rule(">=", 30, { cooldown_minutes: 0 });
  const lastFired = new Date(NOW.getTime() - 1000); // 1 second ago
  const out = evaluateAutomation(r, [{ value: 35 }], lastFired, NOW);
  assertEquals(out.decision, "fire");
});

Deno.test("evaluateAutomation — never-fired automation fires immediately when rule satisfied", () => {
  const r = rule(">=", 30, { cooldown_minutes: 60 });
  const out = evaluateAutomation(r, [{ value: 35 }], null, NOW);
  assertEquals(out.decision, "fire");
});

// ── Aggregated value in the outcome ───────────────────────────────────────

Deno.test("evaluateAutomation — outcome carries the aggregated value for logging", () => {
  const r = rule(">=", 30, { agg_mode: "any" });
  const out = evaluateAutomation(r, [{ value: 20 }, { value: 40 }], null, NOW);
  // Average is 30 — included in the outcome regardless of agg_mode.
  if (out.decision === "fire") {
    assertEquals(out.aggregated_value, 30);
  } else {
    throw new Error("expected fire");
  }
});
