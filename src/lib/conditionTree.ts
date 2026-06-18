// Client-side mirror of the unified automation condition tree
// (supabase/functions/_shared/conditionTree.ts). Pure helpers for the builder
// UI + the card summary — no React, fully unit-testable.

import { formatMmDd } from "./dateRangeLeaf";

export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export const WEEKDAYS: Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
export const WEEKDAY_LABELS: Record<Weekday, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
};

export interface Slot { start: string; end: string } // "HH:MM"; end<=start wraps overnight
export type WeeklySchedule = Record<Weekday, Slot[]>;

export type SensorMetric = "soil_moisture" | "soil_temp_c" | "soil_ec";
export type Comparator = "<" | "<=" | ">" | ">=";
export type AggMode = "any" | "all" | "average";

export type ConditionNode =
  | { kind: "group"; op: "and" | "or"; negate?: boolean; children: ConditionNode[] }
  | { kind: "sensor"; negate?: boolean; metric: SensorMetric; comparator: Comparator; value: number; agg: AggMode; sensorIds?: string[]; areaId?: string | null }
  | { kind: "time"; negate?: boolean; schedule: WeeklySchedule; tz?: string }
  | { kind: "date_range"; negate?: boolean; from: string; to: string } // "MM-DD"; recurs yearly; to<from wraps year-end
  | { kind: "task_due"; negate?: boolean; blueprintIds: string[] }
  | { kind: "weather"; negate?: boolean; type: "rain_forecast" | "heatwave"; thresholdMm?: number; minProbability?: number; windowHours?: number; thresholdC?: number };

export type LeafKind = "sensor" | "time" | "date_range" | "task_due" | "weather";

export const emptySchedule = (): WeeklySchedule =>
  ({ mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] });

/** A fresh default leaf of the given kind. */
export function newLeaf(kind: LeafKind): ConditionNode {
  switch (kind) {
    case "sensor": return { kind: "sensor", metric: "soil_moisture", comparator: "<", value: 30, agg: "any", sensorIds: [] };
    case "time": {
      const s = emptySchedule();
      for (const d of ["mon", "tue", "wed", "thu", "fri"] as Weekday[]) s[d] = [{ start: "08:00", end: "20:00" }];
      return { kind: "time", schedule: s };
    }
    case "date_range": {
      // Default to the current month (1st → last day).
      const now = new Date();
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      return { kind: "date_range", from: `${mm}-01`, to: `${mm}-${String(last).padStart(2, "0")}` };
    }
    case "task_due": return { kind: "task_due", blueprintIds: [] };
    case "weather": return { kind: "weather", type: "rain_forecast", thresholdMm: 5, minProbability: 60, windowHours: 12 };
  }
}

export const newGroup = (op: "and" | "or" = "and"): ConditionNode => ({ kind: "group", op, children: [] });

const METRIC_LABEL: Record<SensorMetric, string> = { soil_moisture: "moisture", soil_temp_c: "soil temp", soil_ec: "EC" };
const METRIC_UNIT: Record<SensorMetric, string> = { soil_moisture: "%", soil_temp_c: "°C", soil_ec: "µS/cm" };

function summariseDays(schedule: WeeklySchedule): string {
  const active = WEEKDAYS.filter((d) => (schedule[d]?.length ?? 0) > 0);
  if (active.length === 7) return "every day";
  if (active.length === 5 && active.every((d) => d !== "sat" && d !== "sun")) return "weekdays";
  if (active.length === 2 && active.includes("sat") && active.includes("sun")) return "weekends";
  if (active.length === 0) return "never";
  return active.map((d) => WEEKDAY_LABELS[d]).join(", ");
}

function summariseTimes(schedule: WeeklySchedule): string {
  const slots = WEEKDAYS.flatMap((d) => schedule[d] ?? []);
  if (slots.length === 0) return "";
  const uniq = [...new Set(slots.map((s) => `${s.start}–${s.end === "24:00" ? "00:00" : s.end}`))];
  return uniq.length === 1 ? ` ${uniq[0]}` : " (varies)";
}

/** Plain-English one-liner for a node. Pure — used in the builder preview + card. */
export function summariseNode(node: ConditionNode): string {
  if (node.kind === "group") {
    if (node.children.length === 0) return node.op === "and" ? "always" : "never";
    const joined = node.children.map(summariseNode).join(node.op === "and" ? " and " : " or ");
    const wrapped = node.children.length > 1 ? `(${joined})` : joined;
    return node.negate ? `not ${wrapped}` : wrapped;
  }
  let s: string;
  switch (node.kind) {
    case "sensor": {
      const count = node.sensorIds?.length ?? 0;
      const where = count > 0 ? ` (${count} sensor${count === 1 ? "" : "s"})` : "";
      s = `${METRIC_LABEL[node.metric]} ${node.comparator} ${node.value}${METRIC_UNIT[node.metric]}${where}`;
      break;
    }
    case "time":
      s = `time is${summariseTimes(node.schedule)} ${summariseDays(node.schedule)}`.replace(/\s+/g, " ").trim();
      break;
    case "date_range":
      s = `date is between ${formatMmDd(node.from)} and ${formatMmDd(node.to)}`;
      break;
    case "task_due": {
      const n = node.blueprintIds.length;
      s = n > 0 ? `a linked task is due (${n})` : "a linked task is due";
      break;
    }
    case "weather":
      s = node.type === "rain_forecast"
        ? `rain forecast (≥${node.thresholdMm ?? 5}mm)`
        : `heatwave${node.thresholdC ? ` (≥${node.thresholdC}°C)` : ""}`;
      break;
  }
  return node.negate ? `not ${s}` : s;
}

/** Top-level summary for the card, capitalised. The root group isn't wrapped
 *  in parentheses (only nested groups are). */
export function summariseTree(node: ConditionNode | null | undefined): string {
  if (!node) return "—";
  let s: string;
  if (node.kind === "group" && !node.negate) {
    if (node.children.length === 0) s = node.op === "and" ? "always" : "never";
    else s = node.children.map(summariseNode).join(node.op === "and" ? " and " : " or ");
  } else {
    s = summariseNode(node);
  }
  return s.charAt(0).toUpperCase() + s.slice(1);
}
