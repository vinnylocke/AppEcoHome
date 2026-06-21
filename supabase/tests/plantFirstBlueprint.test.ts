import { assertEquals } from "@std/assert";
import { normalisePlantFirstBlueprint } from "@shared/plantFirstBlueprint.ts";

Deno.test("derives is_new from existing_area_id + keeps the id", () => {
  const bp = normalisePlantFirstBlueprint({
    project_overview: { title: "T", summary: "S", estimated_difficulty: "Easy" },
    areas: [
      { area_name: "Bed", existing_area_id: "area-1", plants: [{ common_name: "Tomato", quantity: 2, role: "main", companion_note: "x" }], preparation_tasks: [], maintenance_tasks: [] },
      { area_name: "New Corner", existing_area_id: null, plants: [{ common_name: "Fern", quantity: 1, role: "x", companion_note: "y" }], preparation_tasks: [], maintenance_tasks: [] },
    ],
  });
  assertEquals(bp.areas[0].existing_area_id, "area-1");
  assertEquals(bp.areas[0].is_new, false);
  assertEquals(bp.areas[1].existing_area_id, null);
  assertEquals(bp.areas[1].is_new, true);
});

Deno.test("caps the number of areas", () => {
  const areas = Array.from({ length: 10 }, (_, i) => ({
    area_name: `A${i}`,
    plants: [{ common_name: "P", quantity: 1, role: "r", companion_note: "c" }],
    preparation_tasks: [],
    maintenance_tasks: [],
  }));
  const bp = normalisePlantFirstBlueprint({ areas }, { maxAreas: 4 });
  assertEquals(bp.areas.length, 4);
});

Deno.test("drops areas that have no plants", () => {
  const bp = normalisePlantFirstBlueprint({
    areas: [
      { area_name: "Empty", plants: [], preparation_tasks: [], maintenance_tasks: [] },
      { area_name: "Full", plants: [{ common_name: "Basil", quantity: 1, role: "r", companion_note: "c" }], preparation_tasks: [], maintenance_tasks: [] },
    ],
  });
  assertEquals(bp.areas.length, 1);
  assertEquals(bp.areas[0].area_name, "Full");
});

Deno.test("clamps plant quantity and maintenance frequency", () => {
  const bp = normalisePlantFirstBlueprint({
    areas: [{
      area_name: "Bed",
      plants: [
        { common_name: "A", quantity: 0, role: "r", companion_note: "c" },
        { common_name: "B", quantity: 5000, role: "r", companion_note: "c" },
      ],
      preparation_tasks: [],
      maintenance_tasks: [
        { title: "Water", description: "", frequency_days: 0, seasonality: "" },
        { title: "Feed", description: "", frequency_days: 9999, seasonality: "Summer" },
      ],
    }],
  });
  assertEquals(bp.areas[0].plants[0].quantity, 1);
  assertEquals(bp.areas[0].plants[1].quantity, 99);
  assertEquals(bp.areas[0].maintenance_tasks[0].frequency_days, 1);
  assertEquals(bp.areas[0].maintenance_tasks[0].seasonality, "All year"); // empty → default
  assertEquals(bp.areas[0].maintenance_tasks[1].frequency_days, 365);
});

Deno.test("drops plants / tasks with no name + title, and indexes prep tasks", () => {
  const bp = normalisePlantFirstBlueprint({
    areas: [{
      area_name: "Bed",
      plants: [
        { common_name: "", quantity: 1, role: "r", companion_note: "c" },
        { common_name: "Kale", quantity: 1, role: "r", companion_note: "c" },
      ],
      preparation_tasks: [
        { title: "", description: "skip" },
        { title: "Dig", description: "" },
      ],
      maintenance_tasks: [],
    }],
  });
  assertEquals(bp.areas[0].plants.length, 1);
  assertEquals(bp.areas[0].plants[0].common_name, "Kale");
  assertEquals(bp.areas[0].preparation_tasks.length, 1);
  assertEquals(bp.areas[0].preparation_tasks[0].task_index, 1);
});

Deno.test("supplies overview defaults on a bare object", () => {
  const bp = normalisePlantFirstBlueprint({});
  assertEquals(bp.project_overview.title, "My planting plan");
  assertEquals(bp.areas.length, 0);
});
