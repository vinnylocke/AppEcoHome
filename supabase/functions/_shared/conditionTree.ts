/**
 * Unified automation condition tree (Phase 1).
 *
 * An automation's trigger is a free boolean tree of condition leaves combined
 * with AND/OR groups and an `negate` (is/isn't) flag on any node. The polling
 * loop builds a context (sensor readings, local time, due blueprints, forecast)
 * and evaluates the tree; actions fire on the rising edge (false→true).
 *
 * This module is PURE — `evaluateTree` does only boolean composition; the leaf
 * evaluators take already-fetched primitives. All of it is unit-tested without
 * a DB or network.
 */

import {
  ruleSatisfiedAcrossSensors,
  type SensorObservation,
  type SensorMetric,
  type Comparator,
  type AggMode,
} from "./automationEvaluator.ts";
import type { RainForecast } from "./automationEvaluator.ts";

export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export interface Slot { start: string; end: string } // "HH:MM"; end<=start ⇒ wraps past midnight
export type WeeklySchedule = Record<Weekday, Slot[]>;

export type ConditionNode =
  | { kind: "group"; op: "and" | "or"; negate?: boolean; children: ConditionNode[] }
  | {
      kind: "sensor"; negate?: boolean;
      metric: SensorMetric; comparator: Comparator; value: number; agg: AggMode;
      sensorIds?: string[]; areaId?: string | null;
    }
  | { kind: "time"; negate?: boolean; schedule: WeeklySchedule; tz?: string }
  | { kind: "task_due"; negate?: boolean; blueprintIds: string[] }
  | {
      kind: "weather"; negate?: boolean; type: "rain_forecast" | "heatwave";
      thresholdMm?: number; minProbability?: number; windowHours?: number; thresholdC?: number;
    };

export type LeafNode = Exclude<ConditionNode, { kind: "group" }>;

/** Evaluate the tree. `leafEval` resolves a single leaf to a boolean. Pure. */
export function evaluateTree(node: ConditionNode, leafEval: (leaf: LeafNode) => boolean): boolean {
  if (node.kind === "group") {
    let result: boolean;
    if (node.children.length === 0) {
      result = node.op === "and"; // empty AND = true, empty OR = false
    } else if (node.op === "and") {
      result = node.children.every((c) => evaluateTree(c, leafEval));
    } else {
      result = node.children.some((c) => evaluateTree(c, leafEval));
    }
    return node.negate ? !result : result;
  }
  const v = leafEval(node);
  return node.negate ? !v : v;
}

// ── Leaf evaluators (pure) ───────────────────────────────────────────────────

const WEEKDAYS: Weekday[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}

/** Local weekday + minutes-of-day for `now` in `tz` (IANA). */
export function localParts(now: Date, tz: string): { weekday: Weekday; minutes: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const wd = (parts.find((p) => p.type === "weekday")?.value ?? "Sun").toLowerCase().slice(0, 3) as Weekday;
  let hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  if (hour === 24) hour = 0;
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return { weekday: wd, minutes: hour * 60 + minute };
}

function prevWeekday(d: Weekday): Weekday {
  const i = WEEKDAYS.indexOf(d);
  return WEEKDAYS[(i + 6) % 7];
}

/**
 * Is `now` (interpreted in `tz`) inside an enabled slot? Handles overnight slots
 * (end <= start wraps to the next day) by also checking the previous day's
 * wrapping slots. Empty day = off. A slot 00:00–24:00 is all-day. Pure.
 */
export function isWithinSchedule(now: Date, schedule: WeeklySchedule, tz: string): boolean {
  const { weekday, minutes } = localParts(now, tz);
  const todaySlots = schedule[weekday] ?? [];
  for (const s of todaySlots) {
    const a = toMin(s.start), b = toMin(s.end);
    if (a < b) { if (minutes >= a && minutes < b) return true; }
    else { if (minutes >= a) return true; } // wraps past midnight: [a, 1440)
  }
  // Previous day's wrapping slots cover [0, end) of today.
  for (const s of schedule[prevWeekday(weekday)] ?? []) {
    const a = toMin(s.start), b = toMin(s.end);
    if (b <= a && minutes < b) return true;
  }
  return false;
}

// ── Plain-English summary (server-side, for the AI Area Coach) ────────────────

const SUMMARY_METRIC: Record<string, string> = { soil_moisture: "moisture", soil_temp_c: "soil temp", soil_ec: "EC" };
const SUMMARY_UNIT: Record<string, string> = { soil_moisture: "%", soil_temp_c: "°C", soil_ec: "µS/cm" };

function summariseDays(schedule: WeeklySchedule): string {
  const active = WEEKDAYS.filter((d) => (schedule[d]?.length ?? 0) > 0);
  if (active.length === 7) return "every day";
  if (active.length === 5 && active.every((d) => d !== "sat" && d !== "sun")) return "weekdays";
  if (active.length === 2 && active.includes("sat") && active.includes("sun")) return "weekends";
  if (active.length === 0) return "never";
  return active.join(", ");
}

export function summariseNode(node: ConditionNode): string {
  if (node.kind === "group") {
    if (node.children.length === 0) return node.op === "and" ? "always" : "never";
    const joined = node.children.map(summariseNode).join(node.op === "and" ? " and " : " or ");
    const wrapped = node.children.length > 1 ? `(${joined})` : joined;
    return node.negate ? `not ${wrapped}` : wrapped;
  }
  let s: string;
  switch (node.kind) {
    case "sensor": s = `${SUMMARY_METRIC[node.metric]} ${node.comparator} ${node.value}${SUMMARY_UNIT[node.metric]}`; break;
    case "time": {
      const slots = WEEKDAYS.flatMap((d) => node.schedule[d] ?? []);
      const uniq = [...new Set(slots.map((x) => `${x.start}–${x.end === "24:00" ? "00:00" : x.end}`))];
      s = `time is${uniq.length === 1 ? ` ${uniq[0]}` : slots.length ? " (varies)" : ""} ${summariseDays(node.schedule)}`.replace(/\s+/g, " ").trim();
      break;
    }
    case "task_due": s = "a linked task is due"; break;
    case "weather": s = node.type === "rain_forecast" ? `rain forecast (≥${node.thresholdMm ?? 5}mm)` : `heatwave${node.thresholdC ? ` (≥${node.thresholdC}°C)` : ""}`; break;
  }
  return node.negate ? `not ${s}` : s;
}

/** Top-level summary (root group unwrapped). */
export function summariseTree(node: ConditionNode | null | undefined): string {
  if (!node) return "";
  if (node.kind === "group" && !node.negate) {
    if (node.children.length === 0) return node.op === "and" ? "always" : "never";
    return node.children.map(summariseNode).join(node.op === "and" ? " and " : " or ");
  }
  return summariseNode(node);
}

export interface SensorLeafInput { metric: SensorMetric; comparator: Comparator; value: number; agg: AggMode }
export function evalSensorLeaf(leaf: SensorLeafInput, observations: SensorObservation[]): boolean {
  if (observations.length === 0) return false;
  return ruleSatisfiedAcrossSensors(observations, {
    metric: leaf.metric, comparator: leaf.comparator, threshold: leaf.value,
    hysteresis: 0, cooldown_minutes: 0, agg_mode: leaf.agg,
  });
}

export interface WeatherLeafInput {
  type: "rain_forecast" | "heatwave";
  thresholdMm?: number; minProbability?: number; thresholdC?: number;
}
export function evalWeatherLeaf(
  leaf: WeatherLeafInput,
  forecast: { rain: RainForecast; isHeatwave: boolean; maxTempC: number },
): boolean {
  if (leaf.type === "rain_forecast") {
    return forecast.rain.rainMm >= (leaf.thresholdMm ?? 5)
      && forecast.rain.probabilityMax >= (leaf.minProbability ?? 60);
  }
  // heatwave
  return leaf.thresholdC != null ? forecast.maxTempC >= leaf.thresholdC : forecast.isHeatwave;
}

/**
 * Rising-edge fire decision. Fires when the tree is true now and either it was
 * false last tick (a fresh edge) or the cooldown has elapsed since the last
 * fire. Pure.
 */
export function shouldFire(
  nowTrue: boolean,
  wasTrue: boolean,
  lastFiredAt: Date | null,
  cooldownMinutes: number,
  now: Date,
): boolean {
  if (!nowTrue) return false;
  const cooledDown = lastFiredAt === null
    || (now.getTime() - lastFiredAt.getTime()) >= cooldownMinutes * 60_000;
  if (!wasTrue) return cooledDown;     // rising edge
  return false;                         // already true and holding → no re-fire
}
