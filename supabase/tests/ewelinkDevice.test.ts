import { assertEquals } from "@std/assert";
import {
  parseDeviceState,
  parseEwelinkBattery,
} from "@shared/integrations/ewelinkDevice.ts";

// 2026-06-16 (battery follow-up) — Sonoff Zigbee valves report battery
// as a 0-100 percent under one of several param names. The parser
// accepts the three I've seen across firmwares; if a fourth turns up,
// it gets added to BATTERY_PARAM_CANDIDATES and one of these tests.

// ── parseEwelinkBattery ────────────────────────────────────────────────────

Deno.test("parseEwelinkBattery — params.battery numeric", () => {
  assertEquals(parseEwelinkBattery({ battery: 87 }), 87);
});

Deno.test("parseEwelinkBattery — params.battery string", () => {
  assertEquals(parseEwelinkBattery({ battery: "62" }), 62);
});

Deno.test("parseEwelinkBattery — battPercentage variant", () => {
  assertEquals(parseEwelinkBattery({ battPercentage: 45 }), 45);
});

Deno.test("parseEwelinkBattery — batteryPercentage variant", () => {
  assertEquals(parseEwelinkBattery({ batteryPercentage: 12 }), 12);
});

Deno.test("parseEwelinkBattery — fractional snapped to integer", () => {
  assertEquals(parseEwelinkBattery({ battery: 73.6 }), 74);
});

Deno.test("parseEwelinkBattery — out of range returns null", () => {
  assertEquals(parseEwelinkBattery({ battery: 150 }), null);
  assertEquals(parseEwelinkBattery({ battery: -1 }), null);
});

Deno.test("parseEwelinkBattery — non-numeric returns null", () => {
  assertEquals(parseEwelinkBattery({ battery: "full" }), null);
});

Deno.test("parseEwelinkBattery — missing returns null", () => {
  assertEquals(parseEwelinkBattery({}), null);
  assertEquals(parseEwelinkBattery({ switch: "on" }), null);
});

// ── broadened candidate list + regex fallback ───────────────────────────

Deno.test("parseEwelinkBattery — batteryLevel candidate", () => {
  assertEquals(parseEwelinkBattery({ batteryLevel: 73 }), 73);
});

Deno.test("parseEwelinkBattery — batt candidate (short form)", () => {
  assertEquals(parseEwelinkBattery({ batt: 28 }), 28);
});

Deno.test("parseEwelinkBattery — voltage candidate accepted when in 0-100 range", () => {
  assertEquals(parseEwelinkBattery({ voltage: 88 }), 88);
});

Deno.test("parseEwelinkBattery — regex fallback catches unknown spellings", () => {
  // device_battery / sensor_batt_pct / batt_percent — anything containing
  // "batt" gets a look as long as it's a 0-100 numeric.
  assertEquals(parseEwelinkBattery({ device_battery: 64 }), 64);
  assertEquals(parseEwelinkBattery({ sensor_batt_pct: 31 }), 31);
  assertEquals(parseEwelinkBattery({ batt_percent: "12" }), 12);
});

Deno.test("parseEwelinkBattery — regex fallback rejects non-numeric / out-of-range", () => {
  assertEquals(parseEwelinkBattery({ batt_percent: "wat" }), null);
  assertEquals(parseEwelinkBattery({ batt_percent: 150 }), null);
});

Deno.test("parseEwelinkBattery — well-known candidate beats regex fallback", () => {
  // `battery` is in the candidate list and is checked first; the
  // fallback should not flip the value.
  assertEquals(parseEwelinkBattery({ battery: 80, device_battery: 20 }), 80);
});

// ── parseDeviceState ───────────────────────────────────────────────────────

Deno.test("parseDeviceState — state + battery together", () => {
  const parsed = parseDeviceState({ params: { switch: "on", battery: 87 } });
  assertEquals(parsed.state, "on");
  assertEquals(parsed.battery_percent, 87);
});

Deno.test("parseDeviceState — switches array + battery", () => {
  const parsed = parseDeviceState({
    params: { switches: [{ switch: "off" }, { switch: "on" }], battery: 50 },
  });
  // First-switch wins for state, matching prior behaviour
  assertEquals(parsed.state, "off");
  assertEquals(parsed.battery_percent, 50);
});

Deno.test("parseDeviceState — no battery yields null", () => {
  const parsed = parseDeviceState({ params: { switch: "off" } });
  assertEquals(parsed.state, "off");
  assertEquals(parsed.battery_percent, null);
});

Deno.test("parseDeviceState — empty payload defaults to off + null battery", () => {
  const parsed = parseDeviceState({});
  assertEquals(parsed.state, "off");
  assertEquals(parsed.battery_percent, null);
});
