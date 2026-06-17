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
 * given the agg_mode. Exported so the hybrid evaluator can re-use it for
 * the critical-low check with the same aggregation.
 */
export function ruleSatisfiedAcrossSensors(
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

// ── Hybrid weather-aware layer ───────────────────────────────────────────────
// Applied AFTER the base rule says "water" (moisture low + cooldown passed).
// The moisture sensor is the source of truth — weather may only DEFER a
// watering, never cancel it, because every deferral ends in a sensor recheck.

export type WeatherMode = "off" | "skip" | "defer";

/** One hourly forecast point (already parsed). */
export interface HourlyPoint {
  time: Date;
  /** Rain probability %. */
  probability: number;
  /** Expected mm this hour, when the snapshot carries hourly precipitation. */
  precipitation?: number | null;
}

export interface RainForecast {
  /** Expected rain across the look-ahead window (mm). */
  rainMm: number;
  /** Peak rain probability % across the window. */
  probabilityMax: number;
  /** When the rain window ends + an infiltration buffer — the recheck time. */
  windowEnd: Date;
}

/**
 * Resolve the rain look-ahead from the forecast. Pure.
 *
 * - `rainMm` = sum of hourly precipitation inside the window when available,
 *   else the daily total (`todayRainMm`).
 * - `probabilityMax` = peak hourly probability in the window, falling back to
 *   `dailyProbabilityMax` when there's no hourly data.
 * - `windowEnd` = (last hour at/above `minProbability`) + `bufferHours`, or
 *   `now + windowHours` when no qualifying hour is found. Always defined so the
 *   caller can schedule a recheck whenever it decides to defer.
 */
export function computeRainWindow(
  todayRainMm: number,
  dailyProbabilityMax: number,
  hourly: HourlyPoint[],
  now: Date,
  windowHours: number,
  minProbability: number,
  bufferHours = 2,
): RainForecast {
  const windowEndLimit = new Date(now.getTime() + windowHours * 3_600_000);
  const inWindow = hourly
    .filter((h) => h.time >= now && h.time <= windowEndLimit)
    .sort((a, b) => a.time.getTime() - b.time.getTime());

  const hasHourlyMm = inWindow.some((h) => typeof h.precipitation === "number");
  const rainMm = hasHourlyMm
    ? inWindow.reduce((s, h) => s + (typeof h.precipitation === "number" ? h.precipitation : 0), 0)
    : todayRainMm;

  const probabilityMax = inWindow.length > 0
    ? inWindow.reduce((m, h) => Math.max(m, h.probability), 0)
    : dailyProbabilityMax;

  const qualifying = inWindow.filter((h) => h.probability >= minProbability);
  const windowEnd = qualifying.length > 0
    ? new Date(qualifying[qualifying.length - 1].time.getTime() + bufferHours * 3_600_000)
    : windowEndLimit;

  return { rainMm, probabilityMax, windowEnd };
}

export interface HybridInputs {
  weatherMode: WeatherMode;
  /** Soil already below the FAILSAFE floor (critical-low) — water regardless. */
  criticalSatisfied: boolean;
  rain: RainForecast;
  /** automations.rain_threshold_mm — how much rain "counts". */
  rainThresholdMm: number;
  /** weather_min_probability — confidence gate. */
  minProbability: number;
  maxDefers: number;
  deferSkipInHeat: boolean;
  isHeatwave: boolean;
  /** Current single-pending deferral state. */
  defer: { deferUntil: Date | null; deferCount: number };
  now: Date;
}

export type HybridDecision =
  | { decision: "fire"; reason: "rule_satisfied" | "critical_low" | "forecast_underdelivered"; clearDefer: true }
  | { decision: "skip"; reason: "weather_skip" | "still_deferred"; clearDefer: boolean }
  | { decision: "defer"; reason: "rain_forecast"; until: Date; clearDefer: false };

/**
 * Given that the base rule WANTS to water, decide what weather does about it.
 * Pure — the caller persists the resulting defer state. The "five showers"
 * case is handled here: there is one deferral keyed by `defer`, extended (not
 * stacked) on recheck, so multiple forecast showers collapse to a single hold.
 */
export function evaluateHybrid(input: HybridInputs): HybridDecision {
  const { weatherMode, criticalSatisfied, rain, rainThresholdMm, minProbability,
    maxDefers, deferSkipInHeat, isHeatwave, defer, now } = input;

  if (weatherMode === "off") {
    return { decision: "fire", reason: "rule_satisfied", clearDefer: true };
  }

  const meaningfulRain = rain.rainMm >= rainThresholdMm && rain.probabilityMax >= minProbability;

  if (weatherMode === "skip") {
    return meaningfulRain
      ? { decision: "skip", reason: "weather_skip", clearDefer: true }
      : { decision: "fire", reason: "rule_satisfied", clearDefer: true };
  }

  // weather_mode === "defer"
  if (criticalSatisfied) {
    return { decision: "fire", reason: "critical_low", clearDefer: true };
  }
  if (isHeatwave && deferSkipInHeat) {
    return { decision: "fire", reason: "rule_satisfied", clearDefer: true };
  }

  const isDeferred = defer.deferUntil !== null;
  if (isDeferred && now < defer.deferUntil!) {
    return { decision: "skip", reason: "still_deferred", clearDefer: false };
  }
  if (isDeferred && now >= defer.deferUntil!) {
    // Recheck due and soil is still low → forecast under-delivered, unless
    // more rain is still expected and we're under the defer cap.
    if (meaningfulRain && defer.deferCount < maxDefers) {
      return { decision: "defer", reason: "rain_forecast", until: rain.windowEnd, clearDefer: false };
    }
    return { decision: "fire", reason: "forecast_underdelivered", clearDefer: true };
  }
  // Not currently deferred.
  if (meaningfulRain && defer.deferCount < maxDefers) {
    return { decision: "defer", reason: "rain_forecast", until: rain.windowEnd, clearDefer: false };
  }
  return { decision: "fire", reason: "rule_satisfied", clearDefer: true };
}
