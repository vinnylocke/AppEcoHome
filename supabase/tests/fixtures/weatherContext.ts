import type {
  WeatherContext,
  DailySummary,
  HourlyPoint,
} from "@shared/weatherRules/index.ts";

export function makeDailySummary(overrides: Partial<DailySummary> = {}): DailySummary {
  return {
    date: "2026-05-01",
    precipMm: 0,
    maxTempC: 20,
    minTempC: 12,
    maxWindKph: 15,
    wmoCode: 0,
    precipProbability: 10,
    ...overrides,
  };
}

export function makeHourlyPoint(overrides: Partial<HourlyPoint> = {}): HourlyPoint {
  return {
    time: "2026-05-01T12:00",
    tempC: 18,
    windKph: 12,
    ...overrides,
  };
}

export function makeWeatherContext(overrides: Partial<WeatherContext> = {}): WeatherContext {
  const today = "2026-05-01";
  return {
    homeId: "home-test-1",
    today,
    outsideLocationIds: ["loc-outdoor-1"],
    hasTropicalOutdoor: false,
    // daily[0] = yesterday, daily[1] = today, daily[2] = tomorrow …
    daily: Array.from({ length: 8 }, (_, i) => {
      const d = new Date(`${today}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + i - 1);
      return makeDailySummary({ date: d.toISOString().split("T")[0] });
    }),
    hourly: Array.from({ length: 48 }, (_, i) => {
      const d = new Date(`${today}T00:00:00Z`);
      d.setUTCHours(d.getUTCHours() + i);
      return makeHourlyPoint({ time: d.toISOString().slice(0, 16), tempC: 15 });
    }),
    ...overrides,
  };
}

// --- Condition helpers ---
// Replace or splice specific days in a context to trigger weather rules.

export function withHotDay(
  ctx: WeatherContext,
  targetDate: string,
  maxTempC = 35,
): WeatherContext {
  return {
    ...ctx,
    daily: ctx.daily.map((d) =>
      d.date === targetDate ? { ...d, maxTempC } : d
    ),
  };
}

export function withFrostNight(
  ctx: WeatherContext,
  targetDate: string,
  minTempC = -2,
): WeatherContext {
  return {
    ...ctx,
    daily: ctx.daily.map((d) =>
      d.date === targetDate ? { ...d, minTempC } : d
    ),
  };
}

export function withHeavyRain(
  ctx: WeatherContext,
  targetDate: string,
  precipMm = 15,
  precipProbability = 90,
): WeatherContext {
  return {
    ...ctx,
    daily: ctx.daily.map((d) =>
      d.date === targetDate ? { ...d, precipMm, precipProbability } : d
    ),
  };
}

export function withHighWind(
  ctx: WeatherContext,
  targetDate: string,
  maxWindKph = 70,
): WeatherContext {
  return {
    ...ctx,
    daily: ctx.daily.map((d) =>
      d.date === targetDate ? { ...d, maxWindKph } : d
    ),
  };
}
