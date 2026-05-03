import { describe, test, expect } from "vitest";
import { derivePlantLabels } from "../../../src/lib/plantLabels";

describe("derivePlantLabels", () => {
  test("returns empty array for empty input", () => {
    expect(derivePlantLabels({})).toEqual([]);
  });

  test("includes plant_type directly", () => {
    expect(derivePlantLabels({ plant_type: "Vegetable" })).toContain("Vegetable");
  });

  test("Annual cycle produces Annual label", () => {
    expect(derivePlantLabels({ cycle: "Annual" })).toContain("Annual");
  });

  test("Perennial cycle produces Perennial label", () => {
    expect(derivePlantLabels({ cycle: "Perennial" })).toContain("Perennial");
  });

  test("Herbaceous Perennial cycle produces Perennial label (contains perennial)", () => {
    expect(derivePlantLabels({ cycle: "Herbaceous Perennial" })).toContain("Perennial");
  });

  test("Biannual cycle produces Biennial label", () => {
    expect(derivePlantLabels({ cycle: "Biannual" })).toContain("Biennial");
  });

  test("Biennial cycle produces Biennial label", () => {
    expect(derivePlantLabels({ cycle: "Biennial" })).toContain("Biennial");
  });

  test("Frequent watering produces Frequent Watering label", () => {
    expect(derivePlantLabels({ watering: "Frequent" })).toContain("Frequent Watering");
  });

  test("Minimum watering produces Drought Tolerant label", () => {
    expect(derivePlantLabels({ watering: "Minimum" })).toContain("Drought Tolerant");
  });

  test("None watering produces Drought Tolerant label", () => {
    expect(derivePlantLabels({ watering: "None" })).toContain("Drought Tolerant");
  });

  test("drought_tolerant flag produces Drought Tolerant label", () => {
    expect(derivePlantLabels({ drought_tolerant: true })).toContain("Drought Tolerant");
  });

  test("Drought Tolerant is deduplicated when both flag and watering match", () => {
    const labels = derivePlantLabels({ drought_tolerant: true, watering: "Minimum" });
    expect(labels.filter((l) => l === "Drought Tolerant")).toHaveLength(1);
  });

  test("High Maintenance care_level produces High Maintenance label", () => {
    expect(derivePlantLabels({ care_level: "High Maintenance" })).toContain("High Maintenance");
  });

  test("Expert care_level produces High Maintenance label", () => {
    expect(derivePlantLabels({ care_level: "Expert" })).toContain("High Maintenance");
  });

  test("Beginner care_level produces Easy Care label", () => {
    expect(derivePlantLabels({ care_level: "Beginner" })).toContain("Easy Care");
  });

  test("Low care_level produces Easy Care label", () => {
    expect(derivePlantLabels({ care_level: "Low" })).toContain("Easy Care");
  });

  test("indoor flag produces Indoor label", () => {
    expect(derivePlantLabels({ indoor: true })).toContain("Indoor");
  });

  test("is_edible flag produces Edible label", () => {
    expect(derivePlantLabels({ is_edible: true })).toContain("Edible");
  });

  test("tropical flag produces Tropical label", () => {
    expect(derivePlantLabels({ tropical: true })).toContain("Tropical");
  });

  test("non-empty pruning_month produces Pruning label", () => {
    expect(derivePlantLabels({ pruning_month: ["Mar", "Apr"] })).toContain("Pruning");
  });

  test("empty pruning_month does not produce Pruning label", () => {
    expect(derivePlantLabels({ pruning_month: [] })).not.toContain("Pruning");
  });

  test("null pruning_month does not produce Pruning label", () => {
    expect(derivePlantLabels({ pruning_month: null })).not.toContain("Pruning");
  });

  test("combines multiple attributes into one array", () => {
    const labels = derivePlantLabels({
      plant_type: "Herb",
      cycle: "Annual",
      indoor: true,
      pruning_month: ["May"],
    });
    expect(labels).toContain("Herb");
    expect(labels).toContain("Annual");
    expect(labels).toContain("Indoor");
    expect(labels).toContain("Pruning");
  });
});
