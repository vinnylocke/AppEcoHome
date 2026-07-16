const DEFAULT_DURATION_SECONDS = 1800;

export function resolveEffectiveDuration(
  durationSeconds: number | undefined,
  meta: Record<string, unknown>,
): number {
  if (durationSeconds !== undefined) return durationSeconds;
  if (typeof meta.default_duration_seconds === "number") return meta.default_duration_seconds;
  return DEFAULT_DURATION_SECONDS;
}

/**
 * The single device-targeting rule, shared by the control payload AND the
 * state query. Sub-devices must be addressed by their own device ID — the
 * eWeLink cloud routes through the bridge transparently. Querying the
 * PARENT bridge instead returns params with no `switch`, which used to
 * read as "off" (the 2026-07-15 phantom-Off incident: control targeted the
 * sub-device, state targeted the bridge, so the modal showed Off while the
 * valve ran).
 */
export function resolveTargetDeviceId(
  meta: Record<string, unknown>,
  externalDeviceId?: string,
): string | undefined {
  if (meta.use_sub_device) {
    return (externalDeviceId ?? meta.sub_device_id ?? meta.parent_device_id) as
      | string
      | undefined;
  }
  return meta.direct_device_id as string | undefined;
}

export function buildControlPayload(
  meta: Record<string, unknown>,
  command: "turn_on" | "turn_off",
  durationSeconds: number,
  externalDeviceId?: string,
): { apiPath: string; payload: Record<string, unknown> } {
  const switchState = command === "turn_on" ? "on" : "off";
  return {
    apiPath: "/v2/device/thing/status",
    payload: {
      type: 1,
      id: resolveTargetDeviceId(meta, externalDeviceId),
      params: {
        switch: switchState,
        ...(command === "turn_on" ? { countdown: durationSeconds } : {}),
      },
    },
  };
}

export interface ParsedEwelinkState {
  /** "unknown" when the status payload carries no switch param at all —
   *  e.g. the query hit a bridge, or the cloud returned sparse params.
   *  That is NOT evidence the valve is off; callers must not persist it. */
  state: "on" | "off" | "unknown";
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
  const raw = (params.switch as string) ?? (switches?.[0]?.switch as string);
  // No switch param at all → "unknown", never "off" — defaulting to off is
  // what made a running sub-device valve read as Off when the state query
  // hit the bridge. A present-but-unrecognised value still reads as off.
  const state: "on" | "off" | "unknown" =
    raw === "on" ? "on" : raw === undefined ? "unknown" : "off";
  return { state, battery_percent: parseEwelinkBattery(params) };
}
