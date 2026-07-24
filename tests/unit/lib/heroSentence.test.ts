import { describe, test, expect } from "vitest";
import {
  timeOfDayGreeting,
  composeHeroSentence,
  composeConsoleSegments,
  extractFrostMin,
  extractRainToday,
  formatSunMicroLine,
  type HeroInputs,
  type ConsoleInputs,
} from "../../../src/lib/heroSentence";

const summary = (over: Partial<HeroInputs["todaySummary"]> = {}) => ({
  done: 0,
  pending: 0,
  total: 0,
  skipped: 0,
  postponed: 0,
  ...over,
});

const base = (over: Partial<HeroInputs> = {}): HeroInputs => ({
  todaySummary: summary(),
  overdueCount: 0,
  frostMinC: null,
  rainTodayMm: null,
  alerts: [],
  ...over,
});

const at = (hour: number) => new Date(2026, 6, 20, hour, 30, 0);

describe("timeOfDayGreeting", () => {
  test("morning / afternoon / evening boundaries", () => {
    expect(timeOfDayGreeting(at(8), "Vinny")).toBe("Good morning, Vinny");
    expect(timeOfDayGreeting(at(13), "Vinny")).toBe("Good afternoon, Vinny");
    expect(timeOfDayGreeting(at(19), "Vinny")).toBe("Good evening, Vinny");
  });
  test("null first name drops the comma clause", () => {
    expect(timeOfDayGreeting(at(8), null)).toBe("Good morning");
  });
});

describe("composeHeroSentence — the clause ladder", () => {
  test("frost beats everything", () => {
    const s = composeHeroSentence(base({
      frostMinC: -1.4,
      overdueCount: 9,
      alerts: [{ type: "heat", severity: "warning" }],
      todaySummary: summary({ pending: 5, total: 8, done: 3 }),
    }));
    expect(s).toBe("Frost tonight at -1° — cover anything tender before dark.");
  });

  test("severe alert beats overdue; folds in pending tasks", () => {
    const s = composeHeroSentence(base({
      overdueCount: 4,
      alerts: [{ type: "heat", severity: "warning" }],
      todaySummary: summary({ pending: 3, total: 6, done: 3 }),
    }));
    expect(s).toBe("Hot day ahead — 3 tasks still to do.");
  });
  test("severe alert with a clear list", () => {
    const s = composeHeroSentence(base({
      alerts: [{ type: "wind", severity: "critical" }],
    }));
    expect(s).toBe("Wind warning — the garden's ready for it.");
  });
  test("info-severity alerts never claim the sentence (banner-owned)", () => {
    const s = composeHeroSentence(base({
      alerts: [{ type: "wind", severity: "info" }],
      todaySummary: summary({ pending: 2, total: 2 }),
    }));
    expect(s).toBe("2 of 2 tasks left today.");
  });

  test("overdue pile-up, plural and singular", () => {
    expect(composeHeroSentence(base({ overdueCount: 5 }))).toBe(
      "5 tasks need catching up — start with the oldest.",
    );
    expect(composeHeroSentence(base({ overdueCount: 1 }))).toBe(
      "1 task needs catching up — a quick win.",
    );
  });

  test("rain pairs with remaining tasks", () => {
    const s = composeHeroSentence(base({
      rainTodayMm: 4.2,
      todaySummary: summary({ pending: 3, total: 5, done: 2 }),
    }));
    expect(s).toBe("3 tasks left before today's rain.");
  });
  test("rain with an empty list celebrates the free watering", () => {
    expect(composeHeroSentence(base({ rainTodayMm: 6 }))).toBe(
      "Rain due today — the garden waters itself.",
    );
  });
  test("sub-threshold drizzle doesn't earn the rain clause", () => {
    const s = composeHeroSentence(base({
      rainTodayMm: 0.4,
      todaySummary: summary({ pending: 1, total: 1 }),
    }));
    expect(s).toBe("1 of 1 task left today.");
  });

  test("plain task days", () => {
    expect(
      composeHeroSentence(base({ todaySummary: summary({ pending: 4, total: 10, done: 6 }) })),
    ).toBe("4 of 10 tasks left today.");
  });
  test("all done earns praise", () => {
    expect(
      composeHeroSentence(base({ todaySummary: summary({ done: 7, total: 7 }) })),
    ).toBe("All 7 tasks done — lovely work.");
    expect(
      composeHeroSentence(base({ todaySummary: summary({ done: 1, total: 1 }) })),
    ).toBe("All 1 task done — lovely work.");
  });
  test("empty day stays quiet", () => {
    expect(composeHeroSentence(base())).toBe("Nothing on the list — enjoy the garden.");
  });
});

describe("composeConsoleSegments — the Workbench line", () => {
  const consoleBase = (over: Partial<ConsoleInputs> = {}): ConsoleInputs => ({
    ...base(),
    weatherNow: null,
    sun: null,
    now: at(10),
    ...over,
  });

  test("full line: tasks, overdue, weather, golden hour", () => {
    const segs = composeConsoleSegments(consoleBase({
      todaySummary: summary({ done: 4, total: 12, pending: 8 }),
      overdueCount: 3,
      weatherNow: { tempC: 23.6, description: "Clear" },
      sun: { goldenPM: at(19), sunset: at(21) },
    }));
    expect(segs.map((s) => s.label)).toEqual([
      "4/12 today",
      "3 overdue",
      "24° clear",
      "golden hour 19:30",
    ]);
    expect(segs.find((s) => s.id === "overdue")?.tone).toBe("danger");
    expect(segs.find((s) => s.id === "tasks")?.to).toBe("/calendar");
    expect(segs.find((s) => s.id === "weather")?.to).toBe("/calendar?tab=weather");
  });

  test("zero-value segments drop; empty day reads 'clear today'", () => {
    const segs = composeConsoleSegments(consoleBase());
    expect(segs.map((s) => s.id)).toEqual(["tasks"]);
    expect(segs[0].label).toBe("clear today");
  });

  test("frost segment appears with danger tone", () => {
    const segs = composeConsoleSegments(consoleBase({ frostMinC: 1.2 }));
    expect(segs.find((s) => s.id === "frost")?.label).toBe("frost 1°");
    expect(segs.find((s) => s.id === "frost")?.tone).toBe("danger");
  });

  test("after golden hour the sun segment shows sunset; after sunset it drops", () => {
    const sun = { goldenPM: at(19), sunset: at(21) };
    const during = composeConsoleSegments(consoleBase({ sun, now: at(20) }));
    expect(during.find((s) => s.id === "sun")?.label).toBe("sunset 21:30");
    const after = composeConsoleSegments(consoleBase({ sun, now: at(22) }));
    expect(after.find((s) => s.id === "sun")).toBeUndefined();
  });
});

describe("raw-weather extractors", () => {
  const raw = {
    daily: {
      time: ["2026-07-19", "2026-07-20", "2026-07-21"],
      temperature_2m_min: [4, 2.4, 8],
      precipitation_sum: [0, 5.5, 1],
    },
  };
  test("extractFrostMin finds tonight's min at/below the threshold", () => {
    expect(extractFrostMin(raw, "2026-07-20")).toBe(2.4);
  });
  test("extractFrostMin returns null above the threshold or off-index", () => {
    expect(extractFrostMin(raw, "2026-07-21")).toBeNull();
    expect(extractFrostMin(raw, "2099-01-01")).toBeNull();
    expect(extractFrostMin(null, "2026-07-20")).toBeNull();
  });
  test("extractRainToday reads the precipitation sum", () => {
    expect(extractRainToday(raw, "2026-07-20")).toBe(5.5);
    expect(extractRainToday({}, "2026-07-20")).toBeNull();
  });
});

describe("formatSunMicroLine — the Porch proof-of-life", () => {
  const sun = { goldenPM: at(19), sunset: at(21) };
  test("before golden hour: both times", () => {
    expect(formatSunMicroLine(sun, at(10))).toBe("Golden hour 19:30 · sunset 21:30");
  });
  test("during golden hour: 'now'", () => {
    expect(formatSunMicroLine(sun, at(20))).toBe("Golden hour now · sunset 21:30");
  });
  test("after sunset: hides", () => {
    expect(formatSunMicroLine(sun, at(22))).toBeNull();
  });
  test("no sun data: hides", () => {
    expect(formatSunMicroLine(null, at(10))).toBeNull();
  });
});
