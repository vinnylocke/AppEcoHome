import { describe, test, expect } from "vitest";
import { decideTodayFocus } from "../../../src/components/shared/TodayFocusCard";
import type { HomeDashboardStats } from "../../../src/hooks/useHomeDashboardStats";

function makeStats(overrides: Partial<HomeDashboardStats["tasks"]> = {}): HomeDashboardStats {
  return {
    tasks: {
      total: 0,
      completed: 0,
      autoCompleted: 0,
      overdue: 0,
      pending: 0,
      completionRate: 0,
      byCategory: {},
      skippedByRain: 0,
      streak: 0,
      memberBreakdown: [],
      ...overrides,
    },
    garden: {
      totalPlants: 0,
      plantsAddedThisWeek: 0,
      harvestBlueprintsDue: 0,
      harvestBlueprintsCompleted: 0,
      plantInstancesHarvested: 0,
      totalYieldByUnit: {},
      pruningBlueprintsDue: 0,
      pruningBlueprintsCompleted: 0,
      plantInstancesPruned: 0,
      generalPruningEvents: 0,
    },
    weather: { alertCount: 0, activeAlertCount: 0, rainfallMm: null, tasksSkippedByRain: 0 },
    automations: { total: 0, successful: 0, failed: 0, tasksCompleted: 0 },
    additional: { plantDoctorSessions: 0, newWatchlistAlerts: 0 },
    dayStrip: [],
  };
}

describe("decideTodayFocus — priority order", () => {
  test("urgent wins when there are overdue tasks AND it's after 8am", () => {
    const d = decideTodayFocus({
      stats: makeStats({ overdue: 3 }),
      weather: { hasHeatAlert: true, hasFrostAlert: true },
      hourOfDay: 10,
    });
    expect(d.variant).toBe("urgent");
    expect(d.fullMessage).toContain("3 overdue");
    // TodayFocusCard now routes to the Calendar agenda view (where overdue
    // tasks actually surface) instead of the old /schedule?filter=overdue
    // path — see TodayFocusCard.tsx:49-65 for the rationale.
    expect(d.route).toMatch(/^\/dashboard\?view=calendar&date=\d{4}-\d{2}-\d{2}$/);
  });

  test("urgent does NOT fire before 8am even with overdue tasks", () => {
    const d = decideTodayFocus({
      stats: makeStats({ overdue: 5 }),
      weather: {},
      hourOfDay: 7,
    });
    expect(d.variant).not.toBe("urgent");
  });

  test("frost takes priority over heat when both present", () => {
    const d = decideTodayFocus({
      stats: makeStats(),
      weather: { hasHeatAlert: true, hasFrostAlert: true },
      hourOfDay: 12,
    });
    expect(d.variant).toBe("weather");
    expect(d.fullMessage.toLowerCase()).toContain("frost");
  });

  test("heat fires when only heat alert exists", () => {
    const d = decideTodayFocus({
      stats: makeStats(),
      weather: { hasHeatAlert: true },
      hourOfDay: 12,
    });
    expect(d.variant).toBe("weather");
    expect(d.fullMessage.toLowerCase()).toContain("hot");
  });

  test("other weather alert is a generic prompt", () => {
    const d = decideTodayFocus({
      stats: makeStats(),
      weather: { hasOtherAlert: true },
      hourOfDay: 12,
    });
    expect(d.variant).toBe("weather");
    expect(d.fullMessage.toLowerCase()).toContain("weather alert");
  });

  test("streak fires at 3+ days with no urgent or weather", () => {
    const d = decideTodayFocus({
      stats: makeStats({ streak: 5 }),
      weather: {},
      hourOfDay: 12,
    });
    expect(d.variant).toBe("streak");
    expect(d.fullMessage).toContain("5-day streak");
  });

  test("streak does NOT fire at 2 days", () => {
    const d = decideTodayFocus({
      stats: makeStats({ streak: 2 }),
      weather: {},
      hourOfDay: 12,
    });
    expect(d.variant).toBe("quiet");
  });

  test("quiet wins when nothing else fires", () => {
    const d = decideTodayFocus({
      stats: makeStats(),
      weather: {},
      hourOfDay: 12,
    });
    expect(d.variant).toBe("quiet");
    expect(d.route).toBe(null);
  });

  test("null stats returns quiet (handles loading)", () => {
    const d = decideTodayFocus({ stats: null, weather: {}, hourOfDay: 12 });
    expect(d.variant).toBe("quiet");
  });
});

describe("decideTodayFocus — copy variants", () => {
  test("singular vs plural overdue copy", () => {
    const one = decideTodayFocus({
      stats: makeStats({ overdue: 1 }),
      weather: {},
      hourOfDay: 12,
    });
    expect(one.shortMessage).toBe("1 overdue. Finish?");
    expect(one.fullMessage).toBe("1 overdue task — finish it off →");

    const many = decideTodayFocus({
      stats: makeStats({ overdue: 4 }),
      weather: {},
      hourOfDay: 12,
    });
    expect(many.shortMessage).toBe("4 overdue. Finish?");
    expect(many.fullMessage).toBe("4 overdue tasks — finish them off →");
  });

  test("short copy is consistently shorter than full", () => {
    const variants = [
      decideTodayFocus({ stats: makeStats({ overdue: 2 }), weather: {}, hourOfDay: 10 }),
      decideTodayFocus({ stats: makeStats(), weather: { hasHeatAlert: true }, hourOfDay: 10 }),
      decideTodayFocus({ stats: makeStats({ streak: 7 }), weather: {}, hourOfDay: 10 }),
      decideTodayFocus({ stats: makeStats(), weather: {}, hourOfDay: 10 }),
    ];
    for (const v of variants) {
      expect(v.shortMessage.length).toBeLessThanOrEqual(v.fullMessage.length);
    }
  });
});
