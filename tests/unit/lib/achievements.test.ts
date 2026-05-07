import { describe, test, expect } from "vitest";
import { computeUnlocked, ACHIEVEMENTS, type AchievementStats } from "../../../src/lib/achievements";

const empty: AchievementStats = {
  plantAdded: 0,
  plantPruned: 0,
  plantHarvested: 0,
  taskCompleted: 0,
  aiIdentify: 0,
  aiDiagnose: 0,
  planCompleted: 0,
  blueprintCreated: 0,
  ailmentAdded: 0,
  ailmentResolved: 0,
  profileComplete: false,
};

describe("computeUnlocked", () => {
  test("early_adopter is always unlocked", () => {
    expect(computeUnlocked(empty)).toContain("early_adopter");
  });

  test("nothing else unlocked on empty stats", () => {
    const unlocked = computeUnlocked(empty);
    expect(unlocked.filter((k) => k !== "early_adopter")).toHaveLength(0);
  });

  test("first_plant unlocks at 1 plant added", () => {
    expect(computeUnlocked({ ...empty, plantAdded: 1 })).toContain("first_plant");
    expect(computeUnlocked({ ...empty, plantAdded: 0 })).not.toContain("first_plant");
  });

  test("plant_5 unlocks at 5 and not before", () => {
    expect(computeUnlocked({ ...empty, plantAdded: 4 })).not.toContain("plant_5");
    expect(computeUnlocked({ ...empty, plantAdded: 5 })).toContain("plant_5");
    expect(computeUnlocked({ ...empty, plantAdded: 25 })).toContain("plant_5");
  });

  test("plant_25 unlocks at 25", () => {
    expect(computeUnlocked({ ...empty, plantAdded: 24 })).not.toContain("plant_25");
    expect(computeUnlocked({ ...empty, plantAdded: 25 })).toContain("plant_25");
  });

  test("task milestones unlock at correct thresholds", () => {
    expect(computeUnlocked({ ...empty, taskCompleted: 1 })).toContain("first_task");
    expect(computeUnlocked({ ...empty, taskCompleted: 10 })).toContain("task_10");
    expect(computeUnlocked({ ...empty, taskCompleted: 9 })).not.toContain("task_10");
    expect(computeUnlocked({ ...empty, taskCompleted: 50 })).toContain("task_50");
    expect(computeUnlocked({ ...empty, taskCompleted: 100 })).toContain("task_100");
    expect(computeUnlocked({ ...empty, taskCompleted: 99 })).not.toContain("task_100");
  });

  test("AI achievements unlock correctly", () => {
    expect(computeUnlocked({ ...empty, aiIdentify: 1 })).toContain("first_identify");
    expect(computeUnlocked({ ...empty, aiIdentify: 10 })).toContain("identify_10");
    expect(computeUnlocked({ ...empty, aiDiagnose: 1 })).toContain("first_diagnose");
    expect(computeUnlocked({ ...empty, aiDiagnose: 10 })).toContain("diagnose_10");
  });

  test("planning achievements", () => {
    expect(computeUnlocked({ ...empty, blueprintCreated: 1 })).toContain("first_blueprint");
    expect(computeUnlocked({ ...empty, planCompleted: 1 })).toContain("first_plan");
    expect(computeUnlocked({ ...empty, planCompleted: 5 })).toContain("plan_5");
    expect(computeUnlocked({ ...empty, planCompleted: 4 })).not.toContain("plan_5");
  });

  test("health achievements", () => {
    expect(computeUnlocked({ ...empty, ailmentAdded: 1 })).toContain("first_ailment");
    expect(computeUnlocked({ ...empty, ailmentResolved: 1 })).toContain("ailment_resolved");
  });

  test("profile_complete unlocks when flag is true", () => {
    expect(computeUnlocked({ ...empty, profileComplete: true })).toContain("profile_complete");
    expect(computeUnlocked({ ...empty, profileComplete: false })).not.toContain("profile_complete");
  });

  test("all achievements defined have unique keys", () => {
    const keys = ACHIEVEMENTS.map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test("all achievements have required fields", () => {
    for (const a of ACHIEVEMENTS) {
      expect(a.key).toBeTruthy();
      expect(a.label).toBeTruthy();
      expect(a.description).toBeTruthy();
      expect(a.icon).toBeTruthy();
      expect(typeof a.check).toBe("function");
    }
  });

  test("progress functions return correct bounds", () => {
    const withPlants = { ...empty, plantAdded: 3 };
    const plantFiveDef = ACHIEVEMENTS.find((a) => a.key === "plant_5")!;
    expect(plantFiveDef.progress!(withPlants)).toEqual({ current: 3, total: 5 });

    const withPlants30 = { ...empty, plantAdded: 30 };
    expect(plantFiveDef.progress!(withPlants30)).toEqual({ current: 5, total: 5 });
  });
});
