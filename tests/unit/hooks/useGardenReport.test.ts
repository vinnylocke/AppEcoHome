import { describe, it, expect } from "vitest";
import {
  subtractStats,
  sumStats,
  generateHighlights,
} from "../../../src/hooks/useGardenReport";
import type { MonthStats } from "../../../src/hooks/useGardenReport";

const emptyStats = (): MonthStats => ({
  tasksCompleted: 0,
  tasksByType: { Planting: 0, Watering: 0, Harvesting: 0, Maintenance: 0, Pruning: 0 },
  newPlants: 0,
  pruned: 0,
  harvested: 0,
  weatherEvents: 0,
});

const makeStats = (overrides: Partial<MonthStats> = {}): MonthStats => ({
  ...emptyStats(),
  ...overrides,
  tasksByType: { ...emptyStats().tasksByType, ...(overrides.tasksByType ?? {}) },
});

describe("subtractStats", () => {
  it("subtracts two identical stat objects to zeroes", () => {
    const s = makeStats({ tasksCompleted: 5, newPlants: 2 });
    const result = subtractStats(s, s);
    expect(result.tasksCompleted).toBe(0);
    expect(result.newPlants).toBe(0);
  });

  it("returns positive delta when current is higher than previous", () => {
    const current = makeStats({ tasksCompleted: 10, pruned: 3 });
    const previous = makeStats({ tasksCompleted: 7, pruned: 1 });
    const delta = subtractStats(current, previous);
    expect(delta.tasksCompleted).toBe(3);
    expect(delta.pruned).toBe(2);
  });

  it("returns negative delta when current is lower than previous", () => {
    const current = makeStats({ harvested: 1 });
    const previous = makeStats({ harvested: 5 });
    const delta = subtractStats(current, previous);
    expect(delta.harvested).toBe(-4);
  });

  it("subtracts tasksByType per category", () => {
    const a = makeStats({ tasksByType: { Planting: 5, Watering: 10, Harvesting: 2, Maintenance: 1, Pruning: 3 } });
    const b = makeStats({ tasksByType: { Planting: 2, Watering: 8, Harvesting: 1, Maintenance: 0, Pruning: 3 } });
    const d = subtractStats(a, b);
    expect(d.tasksByType.Planting).toBe(3);
    expect(d.tasksByType.Watering).toBe(2);
    expect(d.tasksByType.Pruning).toBe(0);
  });
});

describe("sumStats", () => {
  it("returns empty stats for empty array", () => {
    const result = sumStats([]);
    expect(result.tasksCompleted).toBe(0);
    expect(result.newPlants).toBe(0);
  });

  it("sums all numeric fields across multiple months", () => {
    const months = [
      makeStats({ tasksCompleted: 5, newPlants: 2, harvested: 1, weatherEvents: 1 }),
      makeStats({ tasksCompleted: 8, newPlants: 1, harvested: 3, weatherEvents: 2 }),
      makeStats({ tasksCompleted: 3, newPlants: 0, harvested: 0, weatherEvents: 0 }),
    ];
    const total = sumStats(months);
    expect(total.tasksCompleted).toBe(16);
    expect(total.newPlants).toBe(3);
    expect(total.harvested).toBe(4);
    expect(total.weatherEvents).toBe(3);
  });

  it("sums tasksByType correctly", () => {
    const months = [
      makeStats({ tasksByType: { Planting: 3, Watering: 5, Harvesting: 2, Maintenance: 1, Pruning: 0 } }),
      makeStats({ tasksByType: { Planting: 1, Watering: 7, Harvesting: 0, Maintenance: 2, Pruning: 4 } }),
    ];
    const total = sumStats(months);
    expect(total.tasksByType.Planting).toBe(4);
    expect(total.tasksByType.Watering).toBe(12);
    expect(total.tasksByType.Pruning).toBe(4);
  });
});

describe("generateHighlights", () => {
  const makeMonth = (month: Date, overrides: Partial<MonthStats> = {}) => ({
    month,
    ...makeStats(overrides),
  });

  it("returns empty array when all months are zero", () => {
    const months = Array.from({ length: 12 }, (_, i) =>
      makeMonth(new Date(2026, i, 1)),
    );
    expect(generateHighlights(months)).toEqual([]);
  });

  it("identifies the busiest month", () => {
    const months = Array.from({ length: 12 }, (_, i) =>
      makeMonth(new Date(2026, i, 1), { tasksCompleted: i === 5 ? 28 : i + 1 }),
    );
    const h = generateHighlights(months);
    expect(h.some((s) => s.includes("June") && s.includes("28"))).toBe(true);
  });

  it("identifies the most common task type", () => {
    const months = Array.from({ length: 12 }, (_, i) =>
      makeMonth(new Date(2026, i, 1), {
        tasksCompleted: 10,
        tasksByType: { Planting: 0, Watering: 7, Harvesting: 1, Maintenance: 1, Pruning: 1 },
      }),
    );
    const h = generateHighlights(months);
    expect(h.some((s) => s.includes("Watering"))).toBe(true);
  });

  it("includes total new plants", () => {
    const months = Array.from({ length: 12 }, (_, i) =>
      makeMonth(new Date(2026, i, 1), {
        tasksCompleted: 1,
        newPlants: i === 3 ? 5 : 1,
      }),
    );
    const h = generateHighlights(months);
    expect(h.some((s) => s.includes("plant"))).toBe(true);
  });

  it("includes harvest count when present", () => {
    const months = Array.from({ length: 12 }, (_, i) =>
      makeMonth(new Date(2026, i, 1), { tasksCompleted: 2, harvested: 2 }),
    );
    const h = generateHighlights(months);
    expect(h.some((s) => s.includes("harvest"))).toBe(true);
  });
});
