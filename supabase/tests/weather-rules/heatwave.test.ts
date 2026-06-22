import { assertEquals } from "@std/assert";
import { WEATHER_RULES } from "@shared/weatherRules/index.ts";
import {
  makeWeatherContext,
  withHotDay,
} from "../fixtures/weatherContext.ts";

// Import via the barrel to avoid circular TDZ: heatwave.ts → index.ts → heatwave.ts
const heatwave = WEATHER_RULES.find((r) => r.id === "heatwave")!;

// Threshold is climate-aware (heatThresholdForClimate). Fixture default climate is
// cool_temperate → 28°C. today = "2026-05-01". The rule scans the WHOLE forecast
// window (not just today+tomorrow) and groups the matching days.

Deno.test("heatwave — triggers when today is over the climate threshold", () => {
  const ctx = withHotDay(makeWeatherContext(), "2026-05-01", 32);
  const result = heatwave.evaluate(ctx);
  assertEquals(result.alerts.length, 1);
  assertEquals(result.alerts[0].type, "heat");
  assertEquals(result.alerts[0].severity, "warning");
  assertEquals(result.alerts[0].dates, ["2026-05-01"]);
  assertEquals(result.notifications.length, 1);
  assertEquals(result.taskAutoCompletes.length, 0);
});

Deno.test("heatwave — no alert below the climate threshold (27°C in cool_temperate)", () => {
  const ctx = withHotDay(makeWeatherContext(), "2026-05-01", 27);
  const result = heatwave.evaluate(ctx);
  assertEquals(result.alerts.length, 0);
  assertEquals(result.notifications.length, 0);
});

Deno.test("heatwave — climate-aware: 30°C alerts in cool_temperate but not in tropical", () => {
  const cool = heatwave.evaluate(withHotDay(makeWeatherContext({ climateZone: "cool_temperate" }), "2026-05-01", 30));
  assertEquals(cool.alerts.length, 1);
  const tropical = heatwave.evaluate(withHotDay(makeWeatherContext({ climateZone: "tropical" }), "2026-05-01", 30));
  assertEquals(tropical.alerts.length, 0); // tropical threshold is 36°C
});

Deno.test("heatwave — looks ahead across the window (a hot day 3 days out still alerts)", () => {
  const ctx = withHotDay(makeWeatherContext(), "2026-05-04", 40);
  const result = heatwave.evaluate(ctx);
  assertEquals(result.alerts.length, 1);
  assertEquals(result.alerts[0].dates, ["2026-05-04"]);
});

Deno.test("heatwave — 3 consecutive hot days are labelled a heatwave + grouped", () => {
  let ctx = makeWeatherContext();
  ctx = withHotDay(ctx, "2026-05-01", 30);
  ctx = withHotDay(ctx, "2026-05-02", 33);
  ctx = withHotDay(ctx, "2026-05-03", 31);
  const result = heatwave.evaluate(ctx);
  assertEquals(result.alerts.length, 1);
  assertEquals(result.alerts[0].dates, ["2026-05-01", "2026-05-02", "2026-05-03"]);
  assertEquals(result.alerts[0].message.includes("Heatwave"), true);
  assertEquals(result.alerts[0].message.includes("33°C"), true); // peak across the run
  assertEquals(result.notifications[0].title.includes("Heatwave"), true);
});

Deno.test("heatwave — no alert when no outdoor locations", () => {
  const ctx = makeWeatherContext({ outsideLocationIds: [] });
  const result = heatwave.evaluate(ctx);
  assertEquals(result.alerts.length, 0);
});

Deno.test("heatwave — peak temperature is rounded in the message", () => {
  const ctx = withHotDay(makeWeatherContext(), "2026-05-01", 34.7);
  const result = heatwave.evaluate(ctx);
  assertEquals(result.alerts[0].message.includes("35°C"), true);
});
