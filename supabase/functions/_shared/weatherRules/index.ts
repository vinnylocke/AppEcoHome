// Weather rule engine — same pattern as PatternDetector.
// Each rule is a pure function: receives a WeatherContext, returns WeatherRuleResult.
// analyse-weather builds the context, runs all rules, then executes the results.

export interface DailySummary {
  date: string;               // YYYY-MM-DD
  precipMm: number;           // total precipitation in mm
  maxTempC: number;
  minTempC: number;
  maxWindKph: number;
  wmoCode: number;            // WMO dominant weather code
  precipProbability: number;  // 0–100
}

export interface HourlyPoint {
  time: string;    // ISO-like: "2026-04-29T14:00"
  tempC: number;
  windKph: number;
}

export interface WeatherContext {
  homeId: string;
  today: string;              // YYYY-MM-DD
  outsideLocationIds: string[];
  hasTropicalOutdoor: boolean;
  daily: DailySummary[];      // daily[0] = yesterday (past_days=1), daily[1] = today, ...
  hourly: HourlyPoint[];      // 48h window starting from today for frost detection
}

export type AlertSeverity = "critical" | "warning" | "info";

export interface WeatherAlert {
  type: "rain" | "snow" | "heat" | "frost" | "wind";
  severity: AlertSeverity;
  message: string;
  starts_at: string;
}

export interface TaskAutoComplete {
  taskType: string;  // e.g. "Watering"
  reason: string;    // stored in tasks.auto_completed_reason
}

export interface NotificationPayload {
  type: string;
  title: string;
  body: string;
}

export interface WeatherRuleResult {
  alerts: WeatherAlert[];
  taskAutoCompletes: TaskAutoComplete[];
  notifications: NotificationPayload[];
}

export const EMPTY_RESULT: WeatherRuleResult = {
  alerts: [],
  taskAutoCompletes: [],
  notifications: [],
};

export interface WeatherRule {
  id: string;
  evaluate(ctx: WeatherContext): WeatherRuleResult;
}

import frostRisk from "./frostRisk.ts";
import highWind from "./highWind.ts";
import rainAutoComplete from "./rainAutoComplete.ts";
import waterlogging from "./waterlogging.ts";
import heatwave from "./heatwave.ts";

export const WEATHER_RULES: WeatherRule[] = [
  frostRisk,
  highWind,
  rainAutoComplete,
  waterlogging,
  heatwave,
  // Add new rule: one file in this folder + one line here
];
