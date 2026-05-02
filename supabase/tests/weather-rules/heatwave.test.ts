import { assertEquals } from "@std/assert";
import { WEATHER_RULES } from "@shared/weatherRules/index.ts";
import {
  makeWeatherContext,
  withHotDay,
} from "../fixtures/weatherContext.ts";

// Import via the barrel to avoid circular TDZ: heatwave.ts → index.ts → heatwave.ts
const heatwave = WEATHER_RULES.find((r) => r.id === "heatwave")!;

// HEAT_THRESHOLD_C = 32; scans today + tomorrow only (slice 0..2 from today onwards)
// today = "2026-05-01", tomorrow = "2026-05-02"

Deno.test("heatwave — triggers alert when today hits 32°C", () => {
  const ctx = withHotDay(makeWeatherContext(), "2026-05-01", 32);
  const result = heatwave.evaluate(ctx);
  assertEquals(result.alerts.length, 1);
  assertEquals(result.alerts[0].type, "heat");
  assertEquals(result.alerts[0].severity, "warning");
  assertEquals(result.notifications.length, 1);
  assertEquals(result.taskAutoCompletes.length, 0);
});

Deno.test("heatwave — triggers alert when tomorrow hits 35°C", () => {
  const ctx = withHotDay(makeWeatherContext(), "2026-05-02", 35);
  const result = heatwave.evaluate(ctx);
  assertEquals(result.alerts.length, 1);
  assertEquals(result.alerts[0].type, "heat");
});

Deno.test("heatwave — no alert when max temp is 31°C (below threshold)", () => {
  const ctx = withHotDay(makeWeatherContext(), "2026-05-01", 31);
  const result = heatwave.evaluate(ctx);
  assertEquals(result.alerts.length, 0);
  assertEquals(result.notifications.length, 0);
});

Deno.test("heatwave — no alert when hot day is 3+ days away", () => {
  const ctx = withHotDay(makeWeatherContext(), "2026-05-03", 40);
  const result = heatwave.evaluate(ctx);
  assertEquals(result.alerts.length, 0);
});

Deno.test("heatwave — no alert when no outdoor locations", () => {
  const ctx = makeWeatherContext({ outsideLocationIds: [] });
  const result = heatwave.evaluate(ctx);
  assertEquals(result.alerts.length, 0);
});

Deno.test("heatwave — alert message includes rounded temperature", () => {
  const ctx = withHotDay(makeWeatherContext(), "2026-05-01", 34.7);
  const result = heatwave.evaluate(ctx);
  assertEquals(result.alerts[0].message.includes("35°C"), true);
});
