/**
 * Pure evaluator for sensor-threshold automations (Phase 3, 2026-06-16).
 *
 * Decides, given:
 *   - the automation's rule (metric / comparator / threshold / hysteresis),
 *   - the latest sensor reading per linked sensor,
 *   - the agg_mode (any / all / average),
 *   - the cooldown window,
 *
 * whether the automation should fire RIGHT NOW. Stateless beyond what
 * the caller passes in — `lastFiredAt` is read from
 * `automations.sensor_last_fired_at`, `now` is wall-clock.
 *
 * Kept dependency-free so `supabase/tests/automationEvaluator.test.ts`
 * can exercise every edge without touching the DB.
 */

export type SensorMetric = "soil_moisture" | "soil_temp_c" | "soil_ec";
export type Comparator = ">" | ">=" | "<" | "<=";
export type AggMode = "any" | "all" | "average";

export interface SensorRule {
  metric: SensorMetric;
  comparator: Comparator;
  threshold: number;
  /** Effective margin past the nominal threshold before firing. 0 = fire
   *  on exact crossing; cooldown alone prevents re-firing. */
  hysteresis: number;
  /** Minimum minutes between successive fires. */
  cooldown_minutes: number;
  agg_mode: AggMode;
}

export interface SensorObservation {
  /** Numeric reading already converted to the rule's unit. */
  value: number;
}

export type EvaluationOutcome =
  | { decision: "fire"; reason: "rule_satisfied"; aggregated_value: number }
  | { decision: "skip"; reason: "no_sensors_with_data" }
  | { decision: "skip"; reason: "cooling_down"; cooldown_remaining_seconds: number }
  | { decision: "skip"; reason: "rule_not_satisfied"; aggregated_value: number };

/**
 * Apply the comparator with hysteresis to a single value.
 *
 * Hysteresis pushes the effective threshold *further* in the firing
 * direction. For `>=`/`>` the value must exceed `threshold + hysteresis`;
 * for `<=`/`<` it must be below `threshold - hysteresis`.
 */
export function satisfiesRule(value: number, rule: SensorRule): boolean {
  const h = rule.hysteresis;
  switch (rule.comparator) {
    case ">":  return value > rule.threshold + h;
    case ">=": return value >= rule.threshold + h;
    case "<":  return value < rule.threshold - h;
    case "<=": return value <= rule.threshold - h;
  }
}

/**
 * Aggregate a list of sensor readings according to the rule's agg_mode.
 *
 * For `any` / `all` we don't actually need a single aggregated value
 * to decide firing — but we return one anyway so the caller can log
 * what tipped the automation. We use the average for both because it's
 * the most informative single number.
 */
export function aggregateForLog(values: number[], _aggMode: AggMode): number {
  if (values.length === 0) return NaN;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Decide whether the rule is satisfied across the linked sensors,
 * given the agg_mode.
 */
function ruleSatisfiedAcrossSensors(
  observations: SensorObservation[],
  rule: SensorRule,
): boolean {
  if (observations.length === 0) return false;
  switch (rule.agg_mode) {
    case "any":
      return observations.some((o) => satisfiesRule(o.value, rule));
    case "all":
      return observations.every((o) => satisfiesRule(o.value, rule));
    case "average": {
      const avg = observations.reduce((s, o) => s + o.value, 0) / observations.length;
      return satisfiesRule(avg, rule);
    }
  }
}

/**
 * Main entry — given the rule, current observations, the last time we
 * fired, and a "now" timestamp, return the firing decision + reason.
 *
 * Stateless. The caller is responsible for stamping
 * `sensor_last_fired_at` on a successful fire.
 */
export function evaluateAutomation(
  rule: SensorRule,
  observations: SensorObservation[],
  lastFiredAt: Date | null,
  now: Date,
): EvaluationOutcome {
  if (observations.length === 0) {
    return { decision: "skip", reason: "no_sensors_with_data" };
  }

  // Cooldown gate — cheapest check, do it first.
  if (lastFiredAt !== null && rule.cooldown_minutes > 0) {
    const cooldownMs = rule.cooldown_minutes * 60 * 1000;
    const elapsedMs = now.getTime() - lastFiredAt.getTime();
    if (elapsedMs < cooldownMs) {
      return {
        decision: "skip",
        reason: "cooling_down",
        cooldown_remaining_seconds: Math.ceil((cooldownMs - elapsedMs) / 1000),
      };
    }
  }

  const satisfied = ruleSatisfiedAcrossSensors(observations, rule);
  const aggregated = aggregateForLog(observations.map((o) => o.value), rule.agg_mode);

  if (satisfied) {
    return { decision: "fire", reason: "rule_satisfied", aggregated_value: aggregated };
  }
  return { decision: "skip", reason: "rule_not_satisfied", aggregated_value: aggregated };
}
