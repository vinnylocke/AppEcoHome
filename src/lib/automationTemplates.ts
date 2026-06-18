// Modular automation templates. Each entry pre-builds a condition tree (and
// optional starter actions + name) so common recipes are one tap in the
// builder. Add a new template by appending to AUTOMATION_TEMPLATES — nothing
// else needs to change.

import { emptySchedule, type ConditionNode, type Weekday } from "./conditionTree";

export type TemplateActionKind = "valve_open" | "valve_close" | "notification";
export interface TemplateAction {
  action_kind: TemplateActionKind;
  valve_duration_seconds?: number;
  notification_title?: string;
}

export interface AutomationTemplate {
  id: string;
  label: string;
  description: string;
  build: () => { name: string; tree: ConditionNode; actions: TemplateAction[] };
}

const allDay = (slotStart: string, slotEnd: string): ReturnType<typeof emptySchedule> => {
  const s = emptySchedule();
  for (const d of Object.keys(s) as Weekday[]) s[d] = [{ start: slotStart, end: slotEnd }];
  return s;
};

const moisture = (value: number): ConditionNode =>
  ({ kind: "sensor", metric: "soil_moisture", comparator: "<", value, agg: "any", sensorIds: [] });
const rainForecast = (negate: boolean): ConditionNode =>
  ({ kind: "weather", type: "rain_forecast", thresholdMm: 5, minProbability: 60, windowHours: 12, negate });

export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  {
    id: "smart_watering",
    label: "Smart watering",
    description: "Water when the soil is dry — but wait if rain is forecast, and water anyway if it gets critically dry.",
    build: () => ({
      name: "Smart watering",
      tree: {
        kind: "group", op: "or", children: [
          { kind: "group", op: "and", children: [moisture(30), rainForecast(true)] },
          moisture(18),
        ],
      },
      actions: [{ action_kind: "valve_open", valve_duration_seconds: 1800 }],
    }),
  },
  {
    id: "scheduled_skip_rain",
    label: "Scheduled — skip if rain",
    description: "Water at a set time each day, unless rain is forecast.",
    build: () => ({
      name: "Daily watering",
      tree: {
        kind: "group", op: "and", children: [
          { kind: "time", schedule: allDay("07:00", "07:30") },
          rainForecast(true),
        ],
      },
      actions: [{ action_kind: "valve_open", valve_duration_seconds: 1800 }],
    }),
  },
  {
    id: "notify_too_dry",
    label: "Alert when too dry",
    description: "Send a notification when the soil moisture drops too low.",
    build: () => ({
      name: "Too dry alert",
      tree: { kind: "group", op: "and", children: [moisture(25)] },
      actions: [{ action_kind: "notification", notification_title: "Soil is getting dry" }],
    }),
  },
  {
    id: "water_when_dry",
    label: "Water when dry",
    description: "Simply open the valve whenever the soil moisture is below your threshold.",
    build: () => ({
      name: "Water when dry",
      tree: { kind: "group", op: "and", children: [moisture(30)] },
      actions: [{ action_kind: "valve_open", valve_duration_seconds: 1800 }],
    }),
  },
];
