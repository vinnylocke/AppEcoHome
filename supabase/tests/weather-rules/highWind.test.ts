import { assertEquals } from "@std/assert";
import { WEATHER_RULES } from "@shared/weatherRules/index.ts";
import {
  makeWeatherContext,
  withHighWind,
} from "../fixtures/weatherContext.ts";

const highWind = WEATHER_RULES.find((r) => r.id === "high_wind")!;

// WIND_THRESHOLD_KPH = 40; scans today + tomorrow only
// today = "2026-05-01", tomorrow = "2026-05-02"; default maxWindKph = 15

Deno.test("highWind — triggers warning when today's wind hits 40 kph", () => {
  const ctx = withHighWind(makeWeatherContext(), "2026-05-01", 40);
  const result = highWind.evaluate(ctx);
  assertEquals(result.alerts.length, 1);
  assertEquals(result.alerts[0].type, "wind");
  assertEquals(result.alerts[0].severity, "warning");
  assertEquals(result.notifications.length, 1);
  assertEquals(result.taskAutoCompletes.length, 0);
});

Deno.test("highWind — triggers warning when tomorrow's wind hits 55 kph", () => {
  const ctx = withHighWind(makeWeatherContext(), "2026-05-02", 55);
  const result = highWind.evaluate(ctx);
  assertEquals(result.alerts.length, 1);
  assertEquals(result.alerts[0].type, "wind");
});

Deno.test("highWind — no alert at 39 kph (below threshold)", () => {
  const ctx = withHighWind(makeWeatherContext(), "2026-05-01", 39);
  const result = highWind.evaluate(ctx);
  assertEquals(result.alerts.length, 0);
  assertEquals(result.notifications.length, 0);
});

Deno.test("highWind — no alert when windy day is 3+ days away", () => {
  const ctx = withHighWind(makeWeatherContext(), "2026-05-03", 80);
  const result = highWind.evaluate(ctx);
  assertEquals(result.alerts.length, 0);
});

Deno.test("highWind — no alert when no outdoor locations", () => {
  const ctx = makeWeatherContext({ outsideLocationIds: [] });
  const result = highWind.evaluate(ctx);
  assertEquals(result.alerts.length, 0);
});

Deno.test("highWind — alert message includes rounded wind speed", () => {
  const ctx = withHighWind(makeWeatherContext(), "2026-05-01", 67.4);
  const result = highWind.evaluate(ctx);
  assertEquals(result.alerts[0].message.includes("67 km/h"), true);
});
