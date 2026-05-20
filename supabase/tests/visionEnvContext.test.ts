import { assertEquals, assertStringIncludes } from "@std/assert";
import { buildEnvBlock } from "@shared/visionEnvContext.ts";

// Chainable mock that records which table each query targets and resolves
// to a per-table fixture. Designed to match the calls inside buildEnvBlock.
function makeMockSupabase(tables: Record<string, { data: unknown } | { data: unknown[] }>) {
  const chain = (tableName: string) => {
    const data = tables[tableName]?.data;
    const builder: Record<string, unknown> = {};
    const noop = () => builder;
    builder.select = noop;
    builder.eq = noop;
    builder.neq = noop;
    builder.gte = noop;
    builder.contains = noop;
    builder.order = noop;
    builder.limit = noop;
    builder.maybeSingle = () => Promise.resolve({ data });
    builder.then = (
      onFulfilled: (v: { data: unknown }) => unknown,
      onRejected?: (e: unknown) => unknown,
    ) => Promise.resolve({ data }).then(onFulfilled, onRejected);
    return builder;
  };
  return { from: (tableName: string) => chain(tableName) };
}

Deno.test("buildEnvBlock — returns empty string when no ids provided", async () => {
  const db = makeMockSupabase({});
  const result = await buildEnvBlock(db, {});
  assertEquals(result, "");
});

Deno.test("buildEnvBlock — returns empty string when only homeId is provided", async () => {
  // homeId alone shouldn't trigger the block — we need an item or area to anchor context
  const db = makeMockSupabase({});
  const result = await buildEnvBlock(db, { homeId: "home-1" });
  assertEquals(result, "");
});

Deno.test("buildEnvBlock — emits GROWING ENVIRONMENT lines when area is found", async () => {
  const db = makeMockSupabase({
    areas: {
      data: {
        name: "South Bed",
        is_outside: true,
        sunlight: "full_sun",
        growing_medium: "loam",
        medium_ph: 6.5,
        water_movement: "well_drained",
        nutrient_source: "compost",
      },
    },
    area_lux_readings: { data: [] },
    inventory_items: { data: [] },
    tasks: { data: [] },
    weather_snapshots: { data: null },
  });
  const result = await buildEnvBlock(db, { areaId: "area-1" });
  assertStringIncludes(result, "GROWING ENVIRONMENT:");
  assertStringIncludes(result, "Area: South Bed (Outdoor)");
  assertStringIncludes(result, "Sunlight: full_sun");
  assertStringIncludes(result, "Soil pH: 6.5");
  assertStringIncludes(result, "Drainage: well_drained");
});

Deno.test("buildEnvBlock — averages multiple lux readings", async () => {
  const db = makeMockSupabase({
    areas: { data: null },
    area_lux_readings: { data: [{ lux_value: 1000 }, { lux_value: 2000 }, { lux_value: 3000 }] },
    inventory_items: { data: [] },
    tasks: { data: [] },
    weather_snapshots: { data: null },
  });
  const result = await buildEnvBlock(db, { areaId: "area-1" });
  assertStringIncludes(result, "Light (recent avg): 2,000 lux");
});

Deno.test("buildEnvBlock — lists companion plants when present", async () => {
  const db = makeMockSupabase({
    areas: { data: null },
    area_lux_readings: { data: [] },
    inventory_items: { data: [{ plant_name: "Basil" }, { plant_name: "Marigold" }] },
    tasks: { data: [] },
    weather_snapshots: { data: null },
  });
  const result = await buildEnvBlock(db, { areaId: "area-1", inventoryItemId: "inv-1" });
  assertStringIncludes(result, "COMPANION PLANTS IN SAME AREA: Basil, Marigold");
});

Deno.test("buildEnvBlock — emits 'no tasks' line when an inventory item has no recent tasks", async () => {
  const db = makeMockSupabase({
    areas: { data: null },
    area_lux_readings: { data: [] },
    inventory_items: { data: [] },
    tasks: { data: [] },
    weather_snapshots: { data: null },
  });
  const result = await buildEnvBlock(db, { inventoryItemId: "inv-1" });
  assertStringIncludes(result, "RECENT CARE: No tasks logged for this plant in the last 14 days.");
});

Deno.test("buildEnvBlock — formats recent tasks with status and type", async () => {
  const db = makeMockSupabase({
    areas: { data: null },
    area_lux_readings: { data: [] },
    inventory_items: { data: [] },
    tasks: {
      data: [
        { type: "Watering", title: "Water tomato", status: "Completed", due_date: "2026-05-10" },
        { type: "Maintenance", title: "Prune", status: "Pending", due_date: "2026-05-12" },
      ],
    },
    weather_snapshots: { data: null },
  });
  const result = await buildEnvBlock(db, { inventoryItemId: "inv-1" });
  assertStringIncludes(result, "RECENT CARE (last 14 days):");
  assertStringIncludes(result, "[Completed] Watering: Water tomato (due 2026-05-10)");
  assertStringIncludes(result, "[Pending] Maintenance: Prune (due 2026-05-12)");
});

Deno.test("buildEnvBlock — appends weather line when snapshot is present", async () => {
  const db = makeMockSupabase({
    areas: { data: null },
    area_lux_readings: { data: [] },
    inventory_items: { data: [] },
    tasks: { data: [] },
    weather_snapshots: {
      data: {
        data: {
          current: {
            temperature_2m: 22.4,
            relative_humidity_2m: 65,
            weather_description: "Partly cloudy",
          },
        },
      },
    },
  });
  const result = await buildEnvBlock(db, { inventoryItemId: "inv-1", homeId: "home-1" });
  assertStringIncludes(result, "CURRENT WEATHER: 22°C, 65% humidity, Partly cloudy");
});

Deno.test("buildEnvBlock — supports the legacy `currently`/`temp`/`humidity` weather keys", async () => {
  const db = makeMockSupabase({
    areas: { data: null },
    area_lux_readings: { data: [] },
    inventory_items: { data: [] },
    tasks: { data: [] },
    weather_snapshots: {
      data: {
        data: {
          currently: { temp: 18, humidity: 70, condition: "Light rain" },
        },
      },
    },
  });
  const result = await buildEnvBlock(db, { inventoryItemId: "inv-1", homeId: "home-1" });
  assertStringIncludes(result, "CURRENT WEATHER: 18°C, 70% humidity, Light rain");
});
