import { describe, test, expect } from "vitest";
import {
  plantingTasksFromGuide,
  plantingTasksFromPick,
  PLANTING_JOURNEY_CATEGORIES,
} from "../../../src/lib/seasonalPickPlantingTasks";
import type { PlantGrowGuide } from "../../../src/services/plantDoctorService";
import type { SeasonalPick } from "../../../src/services/seasonalPicksService";

function section(category: string, taskTitle: string, opts: { applicable?: boolean; steps?: any[] } = {}) {
  return {
    category,
    applicable: opts.applicable ?? true,
    title: `${category} title`,
    summary: "",
    key_facts: [],
    steps: opts.steps ?? [],
    tips: [],
    notes: null,
    schedulable_tasks: [
      {
        title: taskTitle,
        description: `${taskTitle} desc`,
        task_type: "Planting",
        is_recurring: false,
        frequency_days: null,
        active_months: ["Apr"],
        duration_days: null,
        priority: "Medium",
        depends_on_index: null,
      },
    ],
  };
}

function guide(sections: any[]): PlantGrowGuide {
  return { schema_version: 1, generated_at: "2026-01-01T00:00:00Z", sections } as PlantGrowGuide;
}

function pick(over: Partial<SeasonalPick> = {}): SeasonalPick {
  return {
    common_name: "Tomato",
    scientific_name: "Solanum lycopersicum",
    sow_method: "direct",
    sow_window_start: "2026-04-10",
    sow_window_end: "2026-05-20",
    harvest_window: { start: "2026-08-01", end: "2026-09-15" },
    reasoning: "Warm soil now.",
    effort: "easy",
    sun: ["full_sun"],
    edible: true,
    ...over,
  };
}

describe("plantingTasksFromGuide", () => {
  test("keeps only the planting-journey sections (propagation, germination, harvesting)", () => {
    const g = guide([
      section("water", "Water weekly"),
      section("soil", "Amend soil"),
      section("propagation", "Take cuttings"),
      section("germination", "Sow seed"),
      section("pruning", "Prune"),
      section("harvesting", "Harvest"),
      section("senescence", "Clear out"),
    ]);
    const tasks = plantingTasksFromGuide(g);
    expect(tasks.map((t) => t.title)).toEqual(["Take cuttings", "Sow seed", "Harvest"]);
  });

  test("category set is exactly the three journey stages", () => {
    expect([...PLANTING_JOURNEY_CATEGORIES].sort()).toEqual(["germination", "harvesting", "propagation"]);
  });

  test("skips non-applicable sections", () => {
    const g = guide([
      section("germination", "Sow seed", { applicable: false }),
      section("harvesting", "Harvest"),
    ]);
    expect(plantingTasksFromGuide(g).map((t) => t.title)).toEqual(["Harvest"]);
  });

  test("folds section how-to steps into the first task's description", () => {
    const g = guide([
      section("germination", "Sow seed", {
        steps: [
          { step: 1, title: "Fill trays", detail: "seed compost" },
          { step: 2, title: "Sow thinly", detail: "5mm deep" },
        ],
      }),
    ]);
    const [t] = plantingTasksFromGuide(g);
    expect(t.description).toContain("How to:");
    expect(t.description).toContain("1. Fill trays — seed compost");
    expect(t.description).toContain("2. Sow thinly — 5mm deep");
  });

  test("empty / missing guide returns no tasks", () => {
    expect(plantingTasksFromGuide(null)).toEqual([]);
    expect(plantingTasksFromGuide(guide([]))).toEqual([]);
  });
});

describe("plantingTasksFromPick", () => {
  test("builds a Planting task dated to the sow window + a Harvesting task", () => {
    const tasks = plantingTasksFromPick(pick());
    expect(tasks).toHaveLength(2);

    const [sow, harvest] = tasks;
    expect(sow.title).toBe("Direct sow Tomato");
    expect(sow.task_type).toBe("Planting");
    expect(sow.is_recurring).toBe(false);
    expect(sow.active_months).toEqual(["Apr", "May"]);

    expect(harvest.title).toBe("Harvest Tomato");
    expect(harvest.task_type).toBe("Harvesting");
    expect(harvest.active_months).toEqual(["Aug", "Sep"]);
  });

  test("maps each sow method to the right verb", () => {
    expect(plantingTasksFromPick(pick({ sow_method: "indoor" }))[0].title).toBe("Start indoors Tomato");
    expect(plantingTasksFromPick(pick({ sow_method: "cutting" }))[0].title).toBe("Take a cutting of Tomato");
    expect(plantingTasksFromPick(pick({ sow_method: "division" }))[0].title).toBe("Divide Tomato");
    expect(plantingTasksFromPick(pick({ sow_method: "transplant" }))[0].title).toBe("Transplant Tomato");
  });

  test("omits the harvest task when the pick has no harvest window", () => {
    const tasks = plantingTasksFromPick(pick({ harvest_window: null }));
    expect(tasks).toHaveLength(1);
    expect(tasks[0].task_type).toBe("Planting");
  });

  test("a single-month sow window yields one month; unparseable dates fall back to year-round", () => {
    expect(plantingTasksFromPick(pick({ sow_window_start: "2026-06-05", sow_window_end: "2026-06-25" }))[0].active_months).toEqual(["Jun"]);
    expect(plantingTasksFromPick(pick({ sow_window_start: "n/a", sow_window_end: "n/a", harvest_window: null }))[0].active_months).toBeNull();
  });
});
