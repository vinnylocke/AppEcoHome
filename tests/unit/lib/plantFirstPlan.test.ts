import { describe, test, expect } from "vitest";
import { countBlueprintPlants, type PlantFirstBlueprint } from "../../../src/lib/plantFirstPlan";

const bp = (areas: Array<{ plants: unknown[] }>): PlantFirstBlueprint =>
  ({ project_overview: { title: "t", summary: "s", estimated_difficulty: "Easy" }, areas } as PlantFirstBlueprint);

describe("countBlueprintPlants", () => {
  test("sums plants across all area groups", () => {
    expect(countBlueprintPlants(bp([{ plants: [1, 2] }, { plants: [3] }, { plants: [] }]))).toBe(3);
  });

  test("returns 0 for null / undefined / no areas", () => {
    expect(countBlueprintPlants(null)).toBe(0);
    expect(countBlueprintPlants(undefined)).toBe(0);
    expect(countBlueprintPlants(bp([]))).toBe(0);
  });
});
