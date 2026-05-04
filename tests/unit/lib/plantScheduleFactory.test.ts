import { describe, test, expect } from "vitest";
import { buildAutoSeasonalSchedules } from "../../../src/lib/plantScheduleFactory";

const BASE = {
  plantId: "plant-1",
  homeId: "home-1",
  hemisphere: "northern" as const,
  harvestPeriods: [] as string[],
  pruningPeriods: [] as string[],
  wateringMinDays: 3,
  wateringMaxDays: 7,
};

// ---- Watering schedules (always produced) ----

describe("buildAutoSeasonalSchedules — watering", () => {
  test("always generates 4 seasonal watering schedules", () => {
    const schedules = buildAutoSeasonalSchedules(BASE);
    const watering = schedules.filter((s) => s.task_type === "Watering");
    expect(watering).toHaveLength(4);
  });

  test("watering titles cover all four seasons", () => {
    const schedules = buildAutoSeasonalSchedules(BASE);
    const titles = schedules.map((s) => s.title);
    expect(titles).toContain("Summer Watering");
    expect(titles).toContain("Winter Watering");
    expect(titles).toContain("Spring Watering");
    expect(titles).toContain("Autumn Watering");
  });

  test("summer watering uses minimum frequency (most frequent)", () => {
    const schedules = buildAutoSeasonalSchedules(BASE);
    const summer = schedules.find((s) => s.title === "Summer Watering")!;
    expect(summer.frequency_days).toBe(BASE.wateringMinDays); // 3
  });

  test("winter watering uses maximum frequency (least frequent)", () => {
    const schedules = buildAutoSeasonalSchedules(BASE);
    const winter = schedules.find((s) => s.title === "Winter Watering")!;
    expect(winter.frequency_days).toBe(BASE.wateringMaxDays); // 7
  });

  test("spring/autumn watering uses averaged frequency", () => {
    const schedules = buildAutoSeasonalSchedules(BASE);
    const spring = schedules.find((s) => s.title === "Spring Watering")!;
    const autumn = schedules.find((s) => s.title === "Autumn Watering")!;
    const expected = Math.max(1, Math.round((BASE.wateringMinDays + BASE.wateringMaxDays) / 2)); // 5
    expect(spring.frequency_days).toBe(expected);
    expect(autumn.frequency_days).toBe(expected);
  });

  test("watering frequency is at least 1 day even if inputs average to 0", () => {
    const schedules = buildAutoSeasonalSchedules({
      ...BASE,
      wateringMinDays: 0,
      wateringMaxDays: 0,
    });
    const spring = schedules.find((s) => s.title === "Spring Watering")!;
    expect(spring.frequency_days).toBeGreaterThanOrEqual(1);
  });

  test("all watering schedules are marked is_recurring", () => {
    const schedules = buildAutoSeasonalSchedules(BASE);
    schedules
      .filter((s) => s.task_type === "Watering")
      .forEach((s) => expect(s.is_recurring).toBe(true));
  });
});

// ---- Hemisphere affects seasonal date ranges ----

describe("buildAutoSeasonalSchedules — hemisphere dates", () => {
  test("northern summer watering starts in June", () => {
    const schedules = buildAutoSeasonalSchedules({ ...BASE, hemisphere: "northern" });
    const summer = schedules.find((s) => s.title === "Summer Watering")!;
    expect(summer.start_reference).toContain("06-01");
  });

  test("southern summer watering starts in December", () => {
    const schedules = buildAutoSeasonalSchedules({ ...BASE, hemisphere: "southern" });
    const summer = schedules.find((s) => s.title === "Summer Watering")!;
    expect(summer.start_reference).toContain("12-01");
  });

  test("northern winter watering starts in December", () => {
    const schedules = buildAutoSeasonalSchedules({ ...BASE, hemisphere: "northern" });
    const winter = schedules.find((s) => s.title === "Winter Watering")!;
    expect(winter.start_reference).toContain("12-01");
  });

  test("southern winter watering starts in June", () => {
    const schedules = buildAutoSeasonalSchedules({ ...BASE, hemisphere: "southern" });
    const winter = schedules.find((s) => s.title === "Winter Watering")!;
    expect(winter.start_reference).toContain("06-01");
  });
});

// ---- Harvest schedules ----

describe("buildAutoSeasonalSchedules — harvest periods", () => {
  test("generates one Harvesting schedule per harvest period", () => {
    const schedules = buildAutoSeasonalSchedules({
      ...BASE,
      harvestPeriods: ["summer", "autumn"],
    });
    const harvesting = schedules.filter((s) => s.task_type === "Harvesting");
    expect(harvesting).toHaveLength(2);
  });

  test("harvest schedule title capitalises the period name", () => {
    const schedules = buildAutoSeasonalSchedules({
      ...BASE,
      harvestPeriods: ["summer"],
    });
    const harvest = schedules.find((s) => s.task_type === "Harvesting")!;
    expect(harvest.title).toBe("Summer Harvest");
  });

  test("harvest schedule trigger_event is 'Planted'", () => {
    const schedules = buildAutoSeasonalSchedules({
      ...BASE,
      harvestPeriods: ["summer"],
    });
    const harvest = schedules.find((s) => s.task_type === "Harvesting")!;
    expect(harvest.trigger_event).toBe("Planted");
  });

  test("no Harvesting schedules when harvestPeriods is empty", () => {
    const schedules = buildAutoSeasonalSchedules(BASE);
    expect(schedules.filter((s) => s.task_type === "Harvesting")).toHaveLength(0);
  });
});

// ---- Pruning schedules ----

describe("buildAutoSeasonalSchedules — pruning periods", () => {
  test("generates one Pruning schedule per pruning period", () => {
    const schedules = buildAutoSeasonalSchedules({
      ...BASE,
      pruningPeriods: ["spring"],
    });
    const pruning = schedules.filter((s) => s.task_type === "Pruning");
    expect(pruning).toHaveLength(1);
  });

  test("pruning schedule title capitalises and appends 'Pruning'", () => {
    const schedules = buildAutoSeasonalSchedules({
      ...BASE,
      pruningPeriods: ["spring"],
    });
    const pruning = schedules.find((s) => s.task_type === "Pruning")!;
    expect(pruning.title).toBe("Spring Pruning");
  });

  test("all schedules carry the correct home_id and plant_id", () => {
    const schedules = buildAutoSeasonalSchedules({
      ...BASE,
      harvestPeriods: ["summer"],
    });
    schedules.forEach((s) => {
      expect(s.home_id).toBe(BASE.homeId);
      expect(s.plant_id).toBe(BASE.plantId);
    });
  });
});
