import { describe, it, expect } from "vitest";
import {
  normaliseOverhaulBlueprint,
  parseFrequencyDays,
} from "../../../src/lib/overhaulBlueprintAdapter";

describe("parseFrequencyDays", () => {
  it("recognises common keywords", () => {
    expect(parseFrequencyDays("daily")).toBe(1);
    expect(parseFrequencyDays("weekly")).toBe(7);
    expect(parseFrequencyDays("monthly")).toBe(30);
    expect(parseFrequencyDays("annually")).toBe(365);
    expect(parseFrequencyDays("fortnightly")).toBe(14);
    expect(parseFrequencyDays("quarterly")).toBe(91);
  });

  it("recognises 'every N units'", () => {
    expect(parseFrequencyDays("every 3 days")).toBe(3);
    expect(parseFrequencyDays("every 2 weeks")).toBe(14);
    expect(parseFrequencyDays("every 6 months")).toBe(182);
    expect(parseFrequencyDays("every 1 year")).toBe(365);
  });

  it("recognises 'N times a unit'", () => {
    expect(parseFrequencyDays("3 times a week")).toBe(2);
    expect(parseFrequencyDays("2 times a month")).toBe(15);
    expect(parseFrequencyDays("twice a week")).toBe(3);
  });

  it("falls back to 30 for unparseable strings", () => {
    expect(parseFrequencyDays("whenever the moon is full")).toBe(30);
    expect(parseFrequencyDays("")).toBe(30);
    expect(parseFrequencyDays(undefined)).toBe(30);
    expect(parseFrequencyDays(null)).toBe(30);
  });

  it("is case-insensitive", () => {
    expect(parseFrequencyDays("WEEKLY")).toBe(7);
    expect(parseFrequencyDays("Every 2 Months")).toBe(60);
  });
});

describe("normaliseOverhaulBlueprint", () => {
  it("returns null for null/undefined input", () => {
    expect(normaliseOverhaulBlueprint(null)).toBeNull();
    expect(normaliseOverhaulBlueprint(undefined)).toBeNull();
  });

  it("maps plant_list to plant_manifest", () => {
    const result = normaliseOverhaulBlueprint({
      project_overview: { title: "Test garden" },
      plant_list: [
        {
          common_name: "Lavender",
          scientific_name: "Lavandula angustifolia",
          role: "focal",
          quantity: 3,
          spacing_cm: 40,
          notes: "Drought tolerant",
        },
      ],
    });
    expect(result?.plant_manifest).toHaveLength(1);
    expect(result?.plant_manifest[0]).toMatchObject({
      common_name: "Lavender",
      scientific_name: "Lavandula angustifolia",
      quantity: 3,
      role: "focal",
      aesthetic_reason: "Drought tolerant",
      horticultural_reason: "Spacing: 40cm",
    });
    expect(result?.plant_manifest[0].procurement_advice).toBeTruthy();
  });

  it("defaults missing plant_list quantities to 1", () => {
    const result = normaliseOverhaulBlueprint({
      plant_list: [{ common_name: "Rose" }],
    });
    expect(result?.plant_manifest[0].quantity).toBe(1);
  });

  it("converts prep_steps strings into sequential preparation_tasks", () => {
    const result = normaliseOverhaulBlueprint({
      prep_steps: [
        "Clear the existing lawn area.",
        "Dig in compost to a depth of 30cm.",
        "Mark out planting positions.",
      ],
    });
    expect(result?.preparation_tasks).toHaveLength(3);
    expect(result?.preparation_tasks[0]).toMatchObject({
      task_index: 0,
      title: "Clear the existing lawn area",
      depends_on_index: null,
    });
    expect(result?.preparation_tasks[1]).toMatchObject({
      task_index: 1,
      depends_on_index: 0,
    });
    expect(result?.preparation_tasks[2]).toMatchObject({
      task_index: 2,
      depends_on_index: 1,
    });
  });

  it("converts maintenance_schedule with freeform frequency strings", () => {
    const result = normaliseOverhaulBlueprint({
      maintenance_schedule: [
        {
          task: "Deadhead lavender",
          frequency: "weekly",
          best_months: ["June", "July", "August"],
          detail: "Snip spent blooms.",
        },
        {
          task: "Annual mulch",
          frequency: "annually",
          detail: "2-inch layer of compost.",
        },
      ],
    });
    expect(result?.custom_maintenance_tasks).toHaveLength(2);
    expect(result?.custom_maintenance_tasks[0]).toMatchObject({
      title: "Deadhead lavender",
      frequency_days: 7,
    });
    expect(result?.custom_maintenance_tasks[0].description).toContain("Snip spent blooms");
    expect(result?.custom_maintenance_tasks[0].description).toContain("Best months");
    expect(result?.custom_maintenance_tasks[1].frequency_days).toBe(365);
  });

  it("synthesises infrastructure_requirements from the title", () => {
    const result = normaliseOverhaulBlueprint({
      project_overview: { title: "Wildlife Haven" },
    });
    expect(result?.infrastructure_requirements).toMatchObject({
      suggested_area_name: "Wildlife Haven",
      suggested_medium: "Garden Soil",
      suggested_sunlight: "part shade",
    });
  });

  it("falls back to a default project title when missing", () => {
    const result = normaliseOverhaulBlueprint({ plant_list: [] });
    expect(result?.project_overview.title).toBe("Garden Overhaul");
  });

  it("is idempotent when given an already-designed blueprint", () => {
    const designed = {
      project_overview: { title: "Already done" },
      infrastructure_requirements: {
        suggested_area_name: "Bed A",
        suggested_medium: "Loam",
        suggested_sunlight: "full sun",
      },
      plant_manifest: [
        {
          common_name: "Tomato",
          scientific_name: "Solanum lycopersicum",
          quantity: 5,
          role: "edible",
          aesthetic_reason: "Bright fruit",
          horticultural_reason: "Sun lover",
          procurement_advice: "Garden centre",
        },
      ],
      preparation_tasks: [
        { task_index: 0, title: "Prep", description: "Prep bed", depends_on_index: null },
      ],
      custom_maintenance_tasks: [
        { title: "Water", description: "Daily", frequency_days: 1 },
      ],
    };
    const result = normaliseOverhaulBlueprint(designed);
    expect(result?.plant_manifest).toEqual(designed.plant_manifest);
    expect(result?.preparation_tasks).toEqual(designed.preparation_tasks);
    expect(result?.custom_maintenance_tasks).toEqual(designed.custom_maintenance_tasks);
    expect(result?.infrastructure_requirements).toEqual(designed.infrastructure_requirements);
  });

  it("handles empty arrays safely", () => {
    const result = normaliseOverhaulBlueprint({
      plant_list: [],
      prep_steps: [],
      maintenance_schedule: [],
    });
    expect(result?.plant_manifest).toEqual([]);
    expect(result?.preparation_tasks).toEqual([]);
    expect(result?.custom_maintenance_tasks).toEqual([]);
  });

  it("derives titles from long prep steps without overflowing", () => {
    const longStep =
      "This is a very long preparation step that includes a lot of contextual detail about why and how to do the thing, and continues for many words.";
    const result = normaliseOverhaulBlueprint({
      prep_steps: [longStep],
    });
    expect(result?.preparation_tasks[0].title.length).toBeLessThanOrEqual(80);
    expect(result?.preparation_tasks[0].description).toBe(longStep);
  });
});
