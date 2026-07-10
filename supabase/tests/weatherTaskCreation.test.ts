import { assertEquals } from "@std/assert";
import {
  buildWeatherTasks,
  isBlueprintDueToday,
  type PlantedInstanceRow,
  type AreaRow,
  type TodayWateringTaskRow,
  type WateringBlueprintRow,
} from "@shared/weatherTaskCreation.ts";
// Import rules via the barrel ONLY — a direct rule-file import alongside the
// barrel causes the documented circular-import TDZ error.
import {
  WEATHER_RULES,
  type WeatherTaskCreate,
  type WeatherContext,
} from "@shared/weatherRules/index.ts";

const heatwave = WEATHER_RULES.find((r) => r.id === "heatwave")!;

const TODAY = "2026-07-10";
const HOME = "home-1";
const LOC_OUT = "loc-out";
const LOC_OUT_2 = "loc-out-2";

const CREATE: WeatherTaskCreate = {
  ruleId: "heatwave",
  taskType: "Watering",
  titleTemplate: "Extra watering — {group}",
  description: "Heatwave — up to 31°C.",
  onDates: [TODAY, "2026-07-11"],
};

function inst(id: string, area_id: string | null, location_id: string | null): PlantedInstanceRow {
  return { id, area_id, location_id };
}
const AREAS: AreaRow[] = [
  { id: "area-1", name: "Raised Bed A", location_id: LOC_OUT },
  { id: "area-2", name: "South Border", location_id: LOC_OUT },
];

function build(over: Partial<Parameters<typeof buildWeatherTasks>[0]> = {}) {
  return buildWeatherTasks({
    create: CREATE,
    homeId: HOME,
    today: TODAY,
    instances: [],
    areas: AREAS,
    outsideLocationIds: [LOC_OUT, LOC_OUT_2],
    existingToday: [],
    blueprints: [],
    ...over,
  });
}

// ─── Grouping ────────────────────────────────────────────────────────────────

Deno.test("WTC-001: one task per area over its planted instances (never per plant)", () => {
  const { rows } = build({
    instances: [inst("i1", "area-1", null), inst("i2", "area-1", null), inst("i3", "area-2", null)],
  });
  assertEquals(rows.length, 2);
  const a1 = rows.find((r) => r.area_id === "area-1")!;
  assertEquals(a1.inventory_item_ids, ["i1", "i2"]);
  assertEquals(a1.title, "Extra watering — Raised Bed A");
  assertEquals(a1.type, "Watering");
  assertEquals(a1.due_date, TODAY);
  assertEquals(a1.location_id, LOC_OUT); // count-safety: always set
  assertEquals(a1.blueprint_id, null);
  assertEquals(a1.weather_event_key, `heatwave:${TODAY}:area:area-1`);
});

Deno.test("WTC-002: planted-but-unassigned instances group per outdoor location", () => {
  const { rows } = build({
    instances: [inst("i1", null, LOC_OUT), inst("i2", null, LOC_OUT), inst("i3", null, LOC_OUT_2)],
  });
  assertEquals(rows.length, 2);
  const l1 = rows.find((r) => r.location_id === LOC_OUT)!;
  assertEquals(l1.area_id, null);
  assertEquals(l1.inventory_item_ids, ["i1", "i2"]);
  assertEquals(l1.title, "Extra watering — unassigned plants");
  assertEquals(l1.weather_event_key, `heatwave:${TODAY}:loc:${LOC_OUT}`);
});

Deno.test("WTC-003: instances with NEITHER area nor location get NO task, counted as unplaced", () => {
  const { rows, unplacedCount } = build({
    instances: [inst("i1", null, null), inst("i2", null, null)],
  });
  assertEquals(rows.length, 0);
  assertEquals(unplacedCount, 2);
});

Deno.test("WTC-004: indoor instances (area not in outdoor set / indoor location) are ignored", () => {
  const { rows, unplacedCount } = build({
    instances: [inst("i1", "area-indoor", null), inst("i2", null, "loc-inside")],
  });
  assertEquals(rows.length, 0);
  assertEquals(unplacedCount, 0); // out of scope, not "unplaced"
});

// ─── Only on the event's dates ───────────────────────────────────────────────

Deno.test("WTC-005: no creation when today is not one of the event's dates (future heatwave)", () => {
  const { rows } = build({
    create: { ...CREATE, onDates: ["2026-07-13", "2026-07-14"] },
    instances: [inst("i1", "area-1", null)],
  });
  assertEquals(rows.length, 0);
});

// ─── Dedup: today's watering wins ────────────────────────────────────────────

Deno.test("WTC-006: an existing watering task today for the area suppresses it (incl. our own from a prior run)", () => {
  const existing: TodayWateringTaskRow[] = [{ area_id: "area-1", location_id: LOC_OUT, inventory_item_ids: [] }];
  const { rows } = build({
    instances: [inst("i1", "area-1", null), inst("i2", "area-2", null)],
    existingToday: existing,
  });
  assertEquals(rows.length, 1);
  assertEquals(rows[0].area_id, "area-2");
});

Deno.test("WTC-007: a watering blueprint due today on its grid suppresses its area", () => {
  const bp: WateringBlueprintRow = {
    area_id: "area-1", location_id: LOC_OUT, frequency_days: 2,
    start_date: "2026-07-04", end_date: null, paused_until: null,
  }; // 4 → 6 → 8 → 10: due today
  const { rows } = build({
    instances: [inst("i1", "area-1", null), inst("i2", "area-2", null)],
    blueprints: [bp],
  });
  assertEquals(rows.length, 1);
  assertEquals(rows[0].area_id, "area-2");
});

Deno.test("WTC-008: a blueprint NOT due today does not suppress", () => {
  const bp: WateringBlueprintRow = {
    area_id: "area-1", location_id: LOC_OUT, frequency_days: 3,
    start_date: "2026-07-04", end_date: null, paused_until: null,
  }; // 4 → 7 → 10? diff=6, 6%3===0 → due! use freq 4: 4 → 8 → 12 (not 10)
  const notDue: WateringBlueprintRow = { ...bp, frequency_days: 4 };
  const { rows } = build({
    instances: [inst("i1", "area-1", null)],
    blueprints: [notDue],
  });
  assertEquals(rows.length, 1);
});

Deno.test("WTC-009: a PAUSED due-today blueprint does not suppress (routine isn't running)", () => {
  const bp: WateringBlueprintRow = {
    area_id: "area-1", location_id: LOC_OUT, frequency_days: 2,
    start_date: "2026-07-04", end_date: null, paused_until: "2026-07-20",
  };
  const { rows } = build({ instances: [inst("i1", "area-1", null)], blueprints: [bp] });
  assertEquals(rows.length, 1);
});

Deno.test("WTC-010: a home-wide watering task today (no area, no location) suppresses everything", () => {
  const { rows } = build({
    instances: [inst("i1", "area-1", null), inst("i2", null, LOC_OUT)],
    existingToday: [{ area_id: null, location_id: null, inventory_item_ids: [] }],
  });
  assertEquals(rows.length, 0);
});

Deno.test("WTC-011: a location-level watering task today suppresses that location's areas + unassigned", () => {
  const { rows } = build({
    instances: [inst("i1", "area-1", null), inst("i2", null, LOC_OUT), inst("i3", null, LOC_OUT_2)],
    existingToday: [{ area_id: null, location_id: LOC_OUT, inventory_item_ids: [] }],
  });
  assertEquals(rows.length, 1);
  assertEquals(rows[0].location_id, LOC_OUT_2);
});

Deno.test("WTC-012: instance-level overlap — a plant already on today's watering is dropped from its group", () => {
  const { rows } = build({
    instances: [inst("i1", "area-1", null), inst("i2", "area-1", null)],
    existingToday: [{ area_id: null, location_id: null, inventory_item_ids: ["i1"] }],
  });
  // NOTE: null/null row is home-wide → suppresses all. Use a targeted row instead:
  const targeted = build({
    instances: [inst("i1", "area-1", null), inst("i2", "area-1", null)],
    existingToday: [{ area_id: "area-2", location_id: LOC_OUT, inventory_item_ids: ["i1"] }],
  });
  assertEquals(rows.length, 0);
  assertEquals(targeted.rows.length, 1);
  assertEquals(targeted.rows[0].inventory_item_ids, ["i2"]); // i1 excluded
});

// ─── isBlueprintDueToday grid ────────────────────────────────────────────────

Deno.test("WTC-013: isBlueprintDueToday — grid, ended, not-started, paused", () => {
  const base: WateringBlueprintRow = {
    area_id: "a", location_id: "l", frequency_days: 3,
    start_date: "2026-07-01", end_date: null, paused_until: null,
  };
  assertEquals(isBlueprintDueToday(base, "2026-07-10"), true);   // 1,4,7,10
  assertEquals(isBlueprintDueToday(base, "2026-07-09"), false);
  assertEquals(isBlueprintDueToday({ ...base, end_date: "2026-07-05" }, "2026-07-10"), false);
  assertEquals(isBlueprintDueToday({ ...base, start_date: "2026-07-12" }, "2026-07-10"), false);
  assertEquals(isBlueprintDueToday({ ...base, paused_until: "2026-07-15" }, "2026-07-10"), false);
});

// ─── The heatwave rule emits taskCreates ─────────────────────────────────────

Deno.test("WTC-014: heatwave rule emits a Watering taskCreate on its hot dates", () => {
  const ctx: WeatherContext = {
    homeId: HOME,
    today: TODAY,
    outsideLocationIds: [LOC_OUT],
    hasTropicalOutdoor: false,
    climateZone: null,
    country: "United Kingdom", // 25°C threshold
    daily: [
      { date: TODAY, precipMm: 0, maxTempC: 31, minTempC: 18, maxWindKph: 5, wmoCode: 0, precipProbability: 0 },
      { date: "2026-07-11", precipMm: 0, maxTempC: 30, minTempC: 18, maxWindKph: 5, wmoCode: 0, precipProbability: 0 },
    ],
    hourly: [],
  };
  const res = heatwave.evaluate(ctx);
  assertEquals(res.taskCreates?.length, 1);
  const c = res.taskCreates![0];
  assertEquals(c.ruleId, "heatwave");
  assertEquals(c.taskType, "Watering");
  assertEquals(c.onDates, [TODAY, "2026-07-11"]);
  assertEquals(res.notifications[0].ruleId, "heatwave");
});

Deno.test("WTC-015: heatwave rule emits NO taskCreates when nothing is hot", () => {
  const ctx: WeatherContext = {
    homeId: HOME, today: TODAY, outsideLocationIds: [LOC_OUT],
    hasTropicalOutdoor: false, climateZone: null, country: "United Kingdom",
    daily: [{ date: TODAY, precipMm: 0, maxTempC: 18, minTempC: 10, maxWindKph: 5, wmoCode: 0, precipProbability: 0 }],
    hourly: [],
  };
  const res = heatwave.evaluate(ctx);
  assertEquals(res.taskCreates ?? [], []);
});
