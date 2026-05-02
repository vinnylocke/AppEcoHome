import { assertEquals, assertStringIncludes } from "@std/assert";
import { WEATHER_RULES } from "@shared/weatherRules/index.ts";
import {
  makeWeatherContext,
  makeHourlyPoint,
} from "../fixtures/weatherContext.ts";

const frostRisk = WEATHER_RULES.find((r) => r.id === "frost_risk")!;

// threshold = 2°C for standard plants; 5°C when hasTropicalOutdoor = true
// scans ctx.hourly — default tempC = 15 throughout, so no frost by default

Deno.test("frostRisk — triggers critical alert when hourly hits 2°C", () => {
  const ctx = makeWeatherContext({
    hourly: [makeHourlyPoint({ time: "2026-05-01T02:00", tempC: 2 })],
  });
  const result = frostRisk.evaluate(ctx);
  assertEquals(result.alerts.length, 1);
  assertEquals(result.alerts[0].type, "frost");
  assertEquals(result.alerts[0].severity, "critical");
  assertEquals(result.notifications.length, 1);
});

Deno.test("frostRisk — triggers alert at 0°C", () => {
  const ctx = makeWeatherContext({
    hourly: [makeHourlyPoint({ time: "2026-05-01T02:00", tempC: 0 })],
  });
  const result = frostRisk.evaluate(ctx);
  assertEquals(result.alerts.length, 1);
});

Deno.test("frostRisk — no alert at 3°C with standard plants", () => {
  const ctx = makeWeatherContext({
    hourly: [makeHourlyPoint({ time: "2026-05-01T02:00", tempC: 3 })],
  });
  const result = frostRisk.evaluate(ctx);
  assertEquals(result.alerts.length, 0);
});

Deno.test("frostRisk — raises threshold to 5°C for tropical plants", () => {
  // 4°C: above standard threshold (2) but below tropical threshold (5)
  const ctx = makeWeatherContext({
    hasTropicalOutdoor: true,
    hourly: [makeHourlyPoint({ time: "2026-05-01T02:00", tempC: 4 })],
  });
  const result = frostRisk.evaluate(ctx);
  assertEquals(result.alerts.length, 1);
  assertEquals(result.alerts[0].type, "frost");
});

Deno.test("frostRisk — no alert at 6°C with tropical plants", () => {
  const ctx = makeWeatherContext({
    hasTropicalOutdoor: true,
    hourly: [makeHourlyPoint({ time: "2026-05-01T02:00", tempC: 6 })],
  });
  const result = frostRisk.evaluate(ctx);
  assertEquals(result.alerts.length, 0);
});

Deno.test("frostRisk — alert message includes 'Tropical plants are at risk' when tropical", () => {
  const ctx = makeWeatherContext({
    hasTropicalOutdoor: true,
    hourly: [makeHourlyPoint({ time: "2026-05-01T02:00", tempC: 3 })],
  });
  const result = frostRisk.evaluate(ctx);
  assertStringIncludes(result.alerts[0].message, "Tropical plants are at risk");
});

Deno.test("frostRisk — no alert when no outdoor locations", () => {
  const ctx = makeWeatherContext({
    outsideLocationIds: [],
    hourly: [makeHourlyPoint({ time: "2026-05-01T02:00", tempC: -5 })],
  });
  const result = frostRisk.evaluate(ctx);
  assertEquals(result.alerts.length, 0);
});
