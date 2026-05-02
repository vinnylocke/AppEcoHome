import { assertEquals, assertStringIncludes } from "@std/assert";
import { WEATHER_RULES } from "@shared/weatherRules/index.ts";
import {
  makeWeatherContext,
  makeDailySummary,
} from "../fixtures/weatherContext.ts";

const waterlogging = WEATHER_RULES.find((r) => r.id === "waterlogging")!;

// RAIN_THRESHOLD_MM = 5, PRECIP_PROB_THRESHOLD = 70, CONSECUTIVE_DAYS_THRESHOLD = 5
// futureDays = daily filtered to date >= "2026-05-01"; streak breaks on first dry day.

function rainyDay(date: string): ReturnType<typeof makeDailySummary> {
  return makeDailySummary({ date, precipMm: 8, precipProbability: 80 });
}
function dryDay(date: string): ReturnType<typeof makeDailySummary> {
  return makeDailySummary({ date, precipMm: 0, precipProbability: 10 });
}

Deno.test("waterlogging — triggers notification for 5 consecutive rainy days", () => {
  const ctx = makeWeatherContext({
    daily: [
      dryDay("2026-04-30"),
      rainyDay("2026-05-01"),
      rainyDay("2026-05-02"),
      rainyDay("2026-05-03"),
      rainyDay("2026-05-04"),
      rainyDay("2026-05-05"),
      dryDay("2026-05-06"),
    ],
  });
  const result = waterlogging.evaluate(ctx);
  assertEquals(result.notifications.length, 1);
  assertStringIncludes(result.notifications[0].title, "Waterlogging");
  assertEquals(result.alerts.length, 0);
});

Deno.test("waterlogging — triggers via precipProbability >= 70 even without precipMm", () => {
  const ctx = makeWeatherContext({
    daily: [
      dryDay("2026-04-30"),
      makeDailySummary({ date: "2026-05-01", precipMm: 0, precipProbability: 75 }),
      makeDailySummary({ date: "2026-05-02", precipMm: 0, precipProbability: 80 }),
      makeDailySummary({ date: "2026-05-03", precipMm: 0, precipProbability: 72 }),
      makeDailySummary({ date: "2026-05-04", precipMm: 0, precipProbability: 70 }),
      makeDailySummary({ date: "2026-05-05", precipMm: 0, precipProbability: 85 }),
    ],
  });
  const result = waterlogging.evaluate(ctx);
  assertEquals(result.notifications.length, 1);
});

Deno.test("waterlogging — no notification for only 4 consecutive rainy days", () => {
  const ctx = makeWeatherContext({
    daily: [
      dryDay("2026-04-30"),
      rainyDay("2026-05-01"),
      rainyDay("2026-05-02"),
      rainyDay("2026-05-03"),
      rainyDay("2026-05-04"),
      dryDay("2026-05-05"),
    ],
  });
  const result = waterlogging.evaluate(ctx);
  assertEquals(result.notifications.length, 0);
});

Deno.test("waterlogging — dry day breaks the streak before threshold", () => {
  const ctx = makeWeatherContext({
    daily: [
      dryDay("2026-04-30"),
      rainyDay("2026-05-01"),
      rainyDay("2026-05-02"),
      rainyDay("2026-05-03"),
      dryDay("2026-05-04"),
      rainyDay("2026-05-05"),
      rainyDay("2026-05-06"),
      rainyDay("2026-05-07"),
    ],
  });
  const result = waterlogging.evaluate(ctx);
  assertEquals(result.notifications.length, 0);
});

Deno.test("waterlogging — no notification when no outdoor locations", () => {
  const daily = [dryDay("2026-04-30")];
  for (let i = 0; i < 7; i++) {
    const d = new Date("2026-05-01");
    d.setDate(d.getDate() + i);
    daily.push(rainyDay(d.toISOString().split("T")[0]));
  }
  const ctx = makeWeatherContext({ outsideLocationIds: [], daily });
  const result = waterlogging.evaluate(ctx);
  assertEquals(result.notifications.length, 0);
});

Deno.test("waterlogging — notification body includes the consecutive day count", () => {
  const ctx = makeWeatherContext({
    daily: [
      dryDay("2026-04-30"),
      rainyDay("2026-05-01"),
      rainyDay("2026-05-02"),
      rainyDay("2026-05-03"),
      rainyDay("2026-05-04"),
      rainyDay("2026-05-05"),
      rainyDay("2026-05-06"),
    ],
  });
  const result = waterlogging.evaluate(ctx);
  assertStringIncludes(result.notifications[0].body, "6");
});
