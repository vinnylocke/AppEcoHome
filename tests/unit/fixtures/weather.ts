// Matches the structure stored in the `weather_snapshots.data` JSON column,
// which is consumed by the frontend WeatherForecast component.

export interface DailySummary {
  date: string;           // YYYY-MM-DD
  precipMm: number;
  maxTempC: number;
  minTempC: number;
  maxWindKph: number;
  wmoCode: number;
  precipProbability: number;
}

export interface HourlyPoint {
  time: string;           // "YYYY-MM-DDTHH:00"
  tempC: number;
  windKph: number;
}

export interface WeatherSnapshotData {
  daily: DailySummary[];
  hourly: HourlyPoint[];
  fetchedAt: string;
}

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

export function makeWeatherSnapshot(overrides: Partial<WeatherSnapshotData> = {}): WeatherSnapshotData {
  const today = "2026-05-01";
  return {
    daily: Array.from({ length: 7 }, (_, i) => {
      const d = new Date(`${today}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + i - 1); // day[0] = yesterday
      return makeDailySummary({ date: d.toISOString().split("T")[0] });
    }),
    hourly: Array.from({ length: 48 }, (_, i) => {
      const d = new Date(`${today}T00:00:00Z`);
      d.setUTCHours(d.getUTCHours() + i);
      return makeHourlyPoint({ time: d.toISOString().slice(0, 16) });
    }),
    fetchedAt: `${today}T08:00:00.000Z`,
    ...overrides,
  };
}

// Convenience builders for specific weather conditions
export const hotDay = (date: string): DailySummary =>
  makeDailySummary({ date, maxTempC: 35, minTempC: 22, precipMm: 0, precipProbability: 5 });

export const coldDay = (date: string): DailySummary =>
  makeDailySummary({ date, maxTempC: 2, minTempC: -1, precipMm: 0, precipProbability: 20 });

export const rainyDay = (date: string): DailySummary =>
  makeDailySummary({ date, maxTempC: 14, minTempC: 9, precipMm: 12, precipProbability: 85 });

export const windyDay = (date: string): DailySummary =>
  makeDailySummary({ date, maxTempC: 17, minTempC: 10, precipMm: 2, maxWindKph: 65, precipProbability: 30 });
