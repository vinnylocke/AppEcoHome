import { assertEquals, assertStringIncludes } from "@std/assert";
import { WEATHER_RULES } from "@shared/weatherRules/index.ts";
import {
  makeWeatherContext,
  makeDailySummary,
  withHeavyRain,
} from "../fixtures/weatherContext.ts";

const rainAutoComplete = WEATHER_RULES.find((r) => r.id === "rain_auto_complete")!;

// RAIN_THRESHOLD_MM = 5
// today = "2026-05-01"; yesterday = "2026-04-30" (daily[0])
// Triggers when: today >= 5mm OR (yesterday >= 5mm AND today > 0mm)

Deno.test("rainAutoComplete — auto-completes when today >= 5mm", () => {
  const ctx = withHeavyRain(makeWeatherContext(), "2026-05-01", 8, 90);
  const result = rainAutoComplete.evaluate(ctx);
  assertEquals(result.taskAutoCompletes.length, 1);
  assertEquals(result.taskAutoCompletes[0].taskType, "Watering");
  assertEquals(result.alerts.length, 1);
  assertEquals(result.alerts[0].type, "rain");
  assertEquals(result.notifications.length, 1);
});

Deno.test("rainAutoComplete — auto-completes at exactly 5mm today", () => {
  const ctx = withHeavyRain(makeWeatherContext(), "2026-05-01", 5, 80);
  const result = rainAutoComplete.evaluate(ctx);
  assertEquals(result.taskAutoCompletes.length, 1);
});

Deno.test("rainAutoComplete — auto-completes when yesterday >= 5mm and today > 0mm", () => {
  let ctx = withHeavyRain(makeWeatherContext(), "2026-04-30", 7, 85);
  ctx = {
    ...ctx,
    daily: ctx.daily.map((d) =>
      d.date === "2026-05-01" ? { ...d, precipMm: 1 } : d
    ),
  };
  const result = rainAutoComplete.evaluate(ctx);
  assertEquals(result.taskAutoCompletes.length, 1);
  assertStringIncludes(result.taskAutoCompletes[0].reason, "yesterday");
});

Deno.test("rainAutoComplete — no auto-complete when today < 5mm and yesterday < 5mm", () => {
  const result = rainAutoComplete.evaluate(makeWeatherContext());
  assertEquals(result.taskAutoCompletes.length, 0);
  assertEquals(result.alerts.length, 0);
});

Deno.test("rainAutoComplete — no auto-complete when yesterday >= 5mm but today = 0mm", () => {
  const ctx = withHeavyRain(makeWeatherContext(), "2026-04-30", 10, 90);
  const result = rainAutoComplete.evaluate(ctx);
  assertEquals(result.taskAutoCompletes.length, 0);
});

Deno.test("rainAutoComplete — no effect when no outdoor locations", () => {
  const ctx = makeWeatherContext({
    outsideLocationIds: [],
    daily: [
      makeDailySummary({ date: "2026-04-30", precipMm: 0 }),
      makeDailySummary({ date: "2026-05-01", precipMm: 20 }),
    ],
  });
  const result = rainAutoComplete.evaluate(ctx);
  assertEquals(result.taskAutoCompletes.length, 0);
});
