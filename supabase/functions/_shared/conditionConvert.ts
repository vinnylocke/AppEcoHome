/**
 * Auto-convert a legacy automation (time_scheduled or sensor_threshold + the
 * weather/heat modifiers) into an equivalent unified condition tree. Pure +
 * unit-tested so the Phase-1 backfill preserves behaviour exactly.
 */

import type { ConditionNode, WeeklySchedule, Weekday, Slot } from "./conditionTree.ts";
import type { SensorMetric, Comparator, AggMode } from "./automationEvaluator.ts";

export interface LegacyAutomation {
  trigger_kind: "time_scheduled" | "sensor_threshold" | null;
  area_id: string | null;
  sensor_metric: SensorMetric | null;
  sensor_comparator: Comparator | null;
  sensor_threshold_value: number | null;
  sensor_agg_mode: AggMode | null;
  scheduled_time: string | null; // "HH:MM:SS" — UTC
  weather_mode: "off" | "skip" | "defer" | null;
  skip_if_rained: boolean | null;
  rain_threshold_mm: number | null;
  weather_min_probability: number | null;
  critical_threshold_value: number | null;
  trigger_if_hot: boolean | null;
  heat_threshold_c: number | null;
}

const ALL_DAYS: Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const pad = (n: number) => String(n).padStart(2, "0");

/** Whole-hour window (UTC) matching the legacy `scheduled_time` hour-match. */
function hourSchedule(scheduledTime: string): WeeklySchedule {
  const h = Number(scheduledTime.split(":")[0]) || 0;
  const slot: Slot = { start: `${pad(h)}:00`, end: `${pad(h + 1)}:00` };
  const out = {} as WeeklySchedule;
  for (const d of ALL_DAYS) out[d] = [slot];
  return out;
}

function rainLeaf(a: LegacyAutomation, negate: boolean): ConditionNode {
  return {
    kind: "weather", type: "rain_forecast", negate,
    thresholdMm: a.rain_threshold_mm ?? 5,
    minProbability: a.weather_min_probability ?? 60,
  };
}

function sensorLeaf(a: LegacyAutomation, value: number): ConditionNode {
  return {
    kind: "sensor",
    metric: a.sensor_metric ?? "soil_moisture",
    comparator: a.sensor_comparator ?? "<",
    value,
    agg: a.sensor_agg_mode ?? "any",
    areaId: a.area_id,
  };
}

function deriveCritical(a: LegacyAutomation): number {
  const v = a.sensor_threshold_value ?? 30;
  if (a.critical_threshold_value != null) return a.critical_threshold_value;
  return a.sensor_comparator === "<" || a.sensor_comparator === "<=" ? v - 10 : v + 10;
}

export function convertLegacyToTree(
  a: LegacyAutomation,
  controllingBlueprintIds: string[] = [],
): ConditionNode {
  if (a.trigger_kind === "sensor_threshold") {
    const base = sensorLeaf(a, a.sensor_threshold_value ?? 30);
    if (a.weather_mode === "skip") {
      return { kind: "group", op: "and", children: [base, rainLeaf(a, true)] };
    }
    if (a.weather_mode === "defer") {
      return {
        kind: "group", op: "or", children: [
          { kind: "group", op: "and", children: [base, rainLeaf(a, true)] },
          sensorLeaf(a, deriveCritical(a)),
        ],
      };
    }
    return base;
  }

  // time_scheduled
  const children: ConditionNode[] = [
    { kind: "time", tz: "UTC", schedule: hourSchedule(a.scheduled_time ?? "07:00:00") },
  ];
  if (a.skip_if_rained) children.push(rainLeaf(a, true));

  // Old behaviour: fire when a controlling task is due OR (trigger_if_hot AND hot).
  const triggers: ConditionNode[] = [];
  if (controllingBlueprintIds.length > 0) {
    triggers.push({ kind: "task_due", blueprintIds: controllingBlueprintIds });
  }
  if (a.trigger_if_hot) {
    triggers.push({ kind: "weather", type: "heatwave", thresholdC: a.heat_threshold_c ?? 30 });
  }
  if (triggers.length === 1) children.push(triggers[0]);
  else if (triggers.length > 1) children.push({ kind: "group", op: "or", children: triggers });

  return { kind: "group", op: "and", children };
}
