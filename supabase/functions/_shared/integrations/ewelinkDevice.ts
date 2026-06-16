const DEFAULT_DURATION_SECONDS = 1800;

export function resolveEffectiveDuration(
  durationSeconds: number | undefined,
  meta: Record<string, unknown>,
): number {
  if (durationSeconds !== undefined) return durationSeconds;
  if (typeof meta.default_duration_seconds === "number") return meta.default_duration_seconds;
  return DEFAULT_DURATION_SECONDS;
}

export function buildControlPayload(
  meta: Record<string, unknown>,
  command: "turn_on" | "turn_off",
  durationSeconds: number,
  externalDeviceId?: string,
): { apiPath: string; payload: Record<string, unknown> } {
  const switchState = command === "turn_on" ? "on" : "off";

  // Sub-devices: address the valve directly by its own device ID.
  // The eWeLink cloud routes through the bridge transparently.
  if (meta.use_sub_device) {
    const targetId = externalDeviceId ?? meta.sub_device_id ?? meta.parent_device_id;
    return {
      apiPath: "/v2/device/thing/status",
      payload: {
        type: 1,
        id: targetId,
        params: {
          switch: switchState,
          ...(command === "turn_on" ? { countdown: durationSeconds } : {}),
        },
      },
    };
  }

  return {
    apiPath: "/v2/device/thing/status",
    payload: {
      type: 1,
      id: meta.direct_device_id,
      params: {
        switch: switchState,
        ...(command === "turn_on" ? { countdown: durationSeconds } : {}),
      },
    },
  };
}

export interface ParsedEwelinkState {
  state: "on" | "off";
  /** 0-100 integer, or null when the device's state payload didn't
   *  include any recognised battery field. Sonoff Zigbee valves
   *  report battery directly as a percent in one of several param
   *  spellings — we accept any of the three I've seen across firmwares.
   *  If a fourth turns up, add it to BATTERY_PARAM_CANDIDATES. */
  battery_percent: number | null;
}

/**
 * eWeLink Zigbee devices (e.g. Sonoff SWV water valve) report battery
 * percentage in their `thing/status` response under `params`. The exact
 * field name varies by firmware revision — we check the well-known
 * spellings first, then fall back to scanning any `params` key whose
 * lowercase form contains "batt".
 *
 * `getDevicePowerUsage` is a separate API for mains-powered Sonoff POW
 * devices (current consumption in kWh). It does NOT report battery and
 * is not used here.
 */
const BATTERY_PARAM_CANDIDATES = [
  "battery",
  "battPercentage",
  "batteryPercentage",
  "batteryLevel",
  "batt",
  "voltage",
] as const;

function pickNumeric0to100(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  const v = typeof value === "number" ? value : parseFloat(String(value));
  if (!Number.isFinite(v)) return null;
  if (v < 0 || v > 100) return null;
  return Math.round(v);
}

export function parseEwelinkBattery(params: Record<string, unknown>): number | null {
  // 1. Try the well-known candidates in priority order.
  for (const key of BATTERY_PARAM_CANDIDATES) {
    const picked = pickNumeric0to100(params[key]);
    if (picked !== null) return picked;
  }

  // 2. Fallback — scan all keys for anything containing "batt" with a
  //    numeric 0-100 value. Catches firmware variants we haven't seen
  //    yet (e.g. `device_battery`, `sensor_batt_pct`).
  for (const [key, value] of Object.entries(params)) {
    if (!/batt/i.test(key)) continue;
    const picked = pickNumeric0to100(value);
    if (picked !== null) return picked;
  }

  return null;
}

export function parseDeviceState(
  stateJsonData: Record<string, unknown>,
): ParsedEwelinkState {
  const params = (stateJsonData?.params ?? {}) as Record<string, unknown>;
  const switches = params.switches as Array<Record<string, unknown>> | undefined;
  const raw: string = (params.switch as string) ?? (switches?.[0]?.switch as string) ?? "off";
  const state: "on" | "off" = raw === "on" ? "on" : "off";
  return { state, battery_percent: parseEwelinkBattery(params) };
}
