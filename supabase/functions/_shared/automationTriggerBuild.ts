/**
 * automationTriggerBuild — pure builder + validator that turns the agent-chat
 * tool's structured input into the canonical `trigger_logic` ConditionNode tree
 * and `automation_actions` rows the engine expects.
 *
 * The AI can emit arbitrarily nested AND/OR trees + multiple actions; this is
 * the safety net: it validates shape (leaf kinds, comparators, metrics, time /
 * MM-DD formats) and throws a clear `AutomationBuildError` on anything
 * malformed, so a bad tree never reaches the DB. ID ownership (device /
 * blueprint / area belongs to the home) is checked by the executor, which has
 * DB access — this module is PURE and unit-tested without a DB.
 */

import type { ConditionNode, WeeklySchedule, Weekday } from "./conditionTree.ts";
import type { SensorMetric, Comparator, AggMode } from "./automationEvaluator.ts";

export class AutomationBuildError extends Error {}

const METRICS: SensorMetric[] = ["soil_moisture", "soil_temp_c", "soil_ec"];
const COMPARATORS: Comparator[] = [">", ">=", "<", "<="];
const AGGS: AggMode[] = ["any", "all", "average"];
const WEEKDAYS: Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const MMDD_RE = /^\d{2}-\d{2}$/;

function fail(msg: string): never {
  throw new AutomationBuildError(msg);
}

/** HH:MM, 00:00–24:00 (24:00 allowed as an end-of-day marker). */
function isValidTime(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{2}:\d{2}$/.test(s)) return false;
  const [h, m] = s.split(":").map(Number);
  if (h === 24) return m === 0;
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

// ─── Input shapes (AI-facing — simpler than the canonical tree) ──────────────

export interface GroupInput {
  kind?: "group";
  op: "and" | "or";
  negate?: boolean;
  conditions: ConditionInput[];
}

export type ConditionInput =
  | GroupInput
  | { kind: "sensor"; metric: string; comparator: string; value: number; agg?: string; sensor_device_ids?: string[]; area_id?: string | null; negate?: boolean }
  | { kind: "time"; days?: string[]; start: string; end: string; negate?: boolean }
  | { kind: "date_range"; from: string; to: string; negate?: boolean }
  | { kind: "task_due"; blueprint_ids: string[]; negate?: boolean }
  | { kind: "weather"; type: "rain_forecast" | "heatwave"; threshold_mm?: number; min_probability?: number; window_hours?: number; threshold_c?: number; negate?: boolean };

export interface ActionInput {
  kind: "valve_open" | "valve_close" | "notification" | "complete_task";
  device_id?: string;
  duration_seconds?: number;
  title?: string;
  body?: string;
  blueprint_id?: string;
}

export interface BuiltAction {
  action_kind: "valve_open" | "valve_close" | "notification" | "complete_task";
  target_device_id: string | null;
  valve_duration_seconds: number | null;
  notification_title: string | null;
  notification_body: string | null;
  target_blueprint_id: string | null;
  ord: number;
}

// ─── Trigger tree ────────────────────────────────────────────────────────────

/** Build + validate the top-level trigger group into a canonical ConditionNode. */
export function buildTriggerTree(input: GroupInput): ConditionNode {
  if (!input || typeof input !== "object") fail("trigger must be an object");
  if (input.op !== "and" && input.op !== "or") fail(`trigger.op must be "and" or "or"`);
  if (!Array.isArray(input.conditions) || input.conditions.length === 0) {
    fail("trigger.conditions must be a non-empty array");
  }
  return {
    kind: "group",
    op: input.op,
    ...(input.negate ? { negate: true } : {}),
    children: input.conditions.map((c, i) => buildCondition(c, `trigger.conditions[${i}]`)),
  };
}

function buildCondition(c: ConditionInput, path: string): ConditionNode {
  if (!c || typeof c !== "object") fail(`${path} must be an object`);
  const kind = (c as { kind?: string }).kind;

  // A nested group is identified by op+conditions (kind optional).
  if (kind === "group" || (c as GroupInput).op !== undefined) {
    return buildTriggerTree(c as GroupInput);
  }

  switch (kind) {
    case "sensor": {
      const s = c as Extract<ConditionInput, { kind: "sensor" }>;
      if (!METRICS.includes(s.metric as SensorMetric)) fail(`${path}.metric must be one of ${METRICS.join(", ")}`);
      if (!COMPARATORS.includes(s.comparator as Comparator)) fail(`${path}.comparator must be one of ${COMPARATORS.join(", ")}`);
      if (typeof s.value !== "number" || !Number.isFinite(s.value)) fail(`${path}.value must be a number`);
      const agg = (s.agg ?? "any") as AggMode;
      if (!AGGS.includes(agg)) fail(`${path}.agg must be one of ${AGGS.join(", ")}`);
      const sensorIds = Array.isArray(s.sensor_device_ids) ? s.sensor_device_ids.filter((x) => typeof x === "string") : undefined;
      return {
        kind: "sensor", metric: s.metric as SensorMetric, comparator: s.comparator as Comparator,
        value: s.value, agg,
        ...(sensorIds && sensorIds.length ? { sensorIds } : {}),
        ...(s.area_id ? { areaId: s.area_id } : {}),
        ...(s.negate ? { negate: true } : {}),
      };
    }
    case "time": {
      const t = c as Extract<ConditionInput, { kind: "time" }>;
      if (!isValidTime(t.start) || !isValidTime(t.end)) fail(`${path}.start/end must be HH:MM (00:00–24:00)`);
      const days = (Array.isArray(t.days) && t.days.length ? t.days : WEEKDAYS).map((d) => String(d).toLowerCase());
      for (const d of days) if (!WEEKDAYS.includes(d as Weekday)) fail(`${path}.days must be mon..sun (got "${d}")`);
      const schedule = {} as WeeklySchedule;
      for (const d of WEEKDAYS) schedule[d] = days.includes(d) ? [{ start: t.start, end: t.end }] : [];
      return { kind: "time", schedule, ...(t.negate ? { negate: true } : {}) };
    }
    case "date_range": {
      const d = c as Extract<ConditionInput, { kind: "date_range" }>;
      if (!MMDD_RE.test(d.from) || !MMDD_RE.test(d.to)) fail(`${path}.from/to must be "MM-DD"`);
      return { kind: "date_range", from: d.from, to: d.to, ...(d.negate ? { negate: true } : {}) };
    }
    case "task_due": {
      const t = c as Extract<ConditionInput, { kind: "task_due" }>;
      const ids = Array.isArray(t.blueprint_ids) ? t.blueprint_ids.filter((x) => typeof x === "string") : [];
      if (ids.length === 0) fail(`${path}.blueprint_ids must be a non-empty array`);
      return { kind: "task_due", blueprintIds: ids, ...(t.negate ? { negate: true } : {}) };
    }
    case "weather": {
      const w = c as Extract<ConditionInput, { kind: "weather" }>;
      if (w.type !== "rain_forecast" && w.type !== "heatwave") fail(`${path}.type must be "rain_forecast" or "heatwave"`);
      return {
        kind: "weather", type: w.type,
        ...(typeof w.threshold_mm === "number" ? { thresholdMm: w.threshold_mm } : {}),
        ...(typeof w.min_probability === "number" ? { minProbability: w.min_probability } : {}),
        ...(typeof w.window_hours === "number" ? { windowHours: w.window_hours } : {}),
        ...(typeof w.threshold_c === "number" ? { thresholdC: w.threshold_c } : {}),
        ...(w.negate ? { negate: true } : {}),
      };
    }
    default:
      return fail(`${path}.kind must be one of group, sensor, time, date_range, task_due, weather (got "${kind}")`);
  }
}

// ─── Actions ─────────────────────────────────────────────────────────────────

/** Build + validate the ordered actions list into automation_actions rows
 *  (without automation_id — the executor attaches it). */
export function buildActions(actions: ActionInput[]): BuiltAction[] {
  if (!Array.isArray(actions) || actions.length === 0) fail("actions must be a non-empty array");
  return actions.map((a, i) => {
    const path = `actions[${i}]`;
    if (!a || typeof a !== "object") fail(`${path} must be an object`);
    switch (a.kind) {
      case "valve_open":
      case "valve_close": {
        if (typeof a.device_id !== "string" || !a.device_id) fail(`${path}.device_id is required for ${a.kind}`);
        // valve_open defaults to 30 min (matches the builder UI) so the valve
        // always gets a paired turn_off and never stays open forever.
        const dur = a.kind === "valve_open"
          ? (typeof a.duration_seconds === "number" ? Math.max(1, Math.floor(a.duration_seconds)) : 1800)
          : null;
        return { action_kind: a.kind, target_device_id: a.device_id, valve_duration_seconds: dur, notification_title: null, notification_body: null, target_blueprint_id: null, ord: i };
      }
      case "notification":
        return { action_kind: "notification", target_device_id: null, valve_duration_seconds: null, notification_title: a.title?.trim() || null, notification_body: a.body?.trim() || null, target_blueprint_id: null, ord: i };
      case "complete_task":
        if (typeof a.blueprint_id !== "string" || !a.blueprint_id) fail(`${path}.blueprint_id is required for complete_task`);
        return { action_kind: "complete_task", target_device_id: null, valve_duration_seconds: null, notification_title: null, notification_body: null, target_blueprint_id: a.blueprint_id, ord: i };
      default:
        return fail(`${path}.kind must be one of valve_open, valve_close, notification, complete_task (got "${(a as { kind?: string }).kind}")`);
    }
  });
}

/** Device IDs referenced by valve actions (for the executor's ownership check). */
export function actionDeviceIds(actions: BuiltAction[]): string[] {
  return [...new Set(actions.map((a) => a.target_device_id).filter((x): x is string => !!x))];
}

/** Sensor + area IDs referenced anywhere in the tree (for ownership checks). */
export function treeReferencedIds(node: ConditionNode): { sensorIds: string[]; areaIds: string[]; blueprintIds: string[] } {
  const sensorIds: string[] = [], areaIds: string[] = [], blueprintIds: string[] = [];
  const walk = (n: ConditionNode) => {
    if (n.kind === "group") { n.children.forEach(walk); return; }
    if (n.kind === "sensor") { if (n.sensorIds) sensorIds.push(...n.sensorIds); if (n.areaId) areaIds.push(n.areaId); }
    if (n.kind === "task_due") blueprintIds.push(...n.blueprintIds);
  };
  walk(node);
  return { sensorIds: [...new Set(sensorIds)], areaIds: [...new Set(areaIds)], blueprintIds: [...new Set(blueprintIds)] };
}
