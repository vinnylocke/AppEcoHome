import { describe, test, expect } from "vitest";
import {
  composeAndOrderWalk,
  composeWalkRoute,
  derivePlanPhase,
  sectionForStep,
  isWalkableTask,
  DEFAULT_WALK_SETTINGS,
  MAX_PLANTS_PER_WALK,
  type ComposeWalkRouteInput,
  type InventoryItemRow,
  type RouteAreaRow,
  type RouteTaskRow,
  type WalkDevice,
  type WalkPlant,
  type WalkPlantInstance,
  type WalkStep,
} from "../../../src/lib/gardenWalk";

// All rows use this home id for brevity.
const HOME = "00000000-0000-0000-0000-000000000001";

function mkItem(over: Partial<InventoryItemRow>): InventoryItemRow {
  return {
    id: over.id ?? crypto.randomUUID(),
    home_id: HOME,
    plant_id: over.plant_id ?? null,
    plant_name: over.plant_name ?? "Plant",
    nickname: over.nickname ?? null,
    status: over.status ?? "Planted",
    area_id: over.area_id ?? "area-1",
    area_name: over.area_name ?? "Back bed",
    location_id: over.location_id ?? "loc-1",
    location_name: over.location_name ?? "Garden",
    environment: over.environment ?? "Outdoors",
    planted_at: over.planted_at ?? null,
  };
}

function bandOf(list: WalkPlant[], id: string): string | undefined {
  return list.find((p) => p.inventoryItemId === id)?.band;
}

describe("composeAndOrderWalk", () => {
  test("plants with active ailments go in the critical band first", () => {
    const ailing = mkItem({ id: "ailing", plant_name: "Tomato" });
    const healthy = mkItem({ id: "healthy", plant_name: "Lavender" });

    const out = composeAndOrderWalk(
      [ailing, healthy],
      [],
      [{ plant_instance_id: ailing.id }],
      [],
      [],
      [],
      new Map(),
      DEFAULT_WALK_SETTINGS,
      "2026-05-21",
    );

    expect(out[0].inventoryItemId).toBe("ailing");
    expect(out[0].band).toBe("critical");
    expect(bandOf(out, "healthy")).toBe("stale");
  });

  test("overdue tasks beat due-today tasks beat fresh hits", () => {
    const overdue = mkItem({ id: "od", plant_name: "Cucumber" });
    const dueToday = mkItem({ id: "dt", plant_name: "Basil" });
    const hit = mkItem({ id: "hit", plant_name: "Sage" });

    const out = composeAndOrderWalk(
      [overdue, dueToday, hit],
      [],
      [],
      [
        { inventory_item_ids: [overdue.id],  due_date: "2026-05-20T08:00:00Z", status: "Pending" },
        { inventory_item_ids: [dueToday.id], due_date: "2026-05-21T08:00:00Z", status: "Pending" },
      ],
      [{ inventory_item_id: hit.id, created_at: "2026-05-21T07:00:00Z" }],
      [],
      new Map(),
      DEFAULT_WALK_SETTINGS,
      "2026-05-21",
    );

    expect(out.map((p) => p.inventoryItemId)).toEqual(["od", "dt", "hit"]);
    expect(out[0].band).toBe("overdue");
    expect(out[1].band).toBe("due_today");
    expect(out[2].band).toBe("fresh_hit");
  });

  test("recently-walked 'all good' plants drop to everything_else band", () => {
    const fresh = mkItem({ id: "fresh", plant_name: "Mint" });
    const seen = mkItem({ id: "seen", plant_name: "Thyme" });

    const out = composeAndOrderWalk(
      [fresh, seen],
      [],
      [],
      [],
      [],
      [
        // seen was walked yesterday and marked "all good"
        { inventory_item_id: seen.id, outcome: "all_good", visited_at: "2026-05-20T07:00:00Z" },
      ],
      new Map(),
      DEFAULT_WALK_SETTINGS,
      "2026-05-21",
    );

    expect(bandOf(out, "fresh")).toBe("stale");
    expect(bandOf(out, "seen")).toBe("everything_else");
    // stale beats everything_else
    expect(out.map((p) => p.inventoryItemId)).toEqual(["fresh", "seen"]);
  });

  test("indoor plants are excluded when skipIndoor is true", () => {
    const indoor = mkItem({ id: "indoor", plant_name: "Aloe", environment: "Indoors" });
    const outdoor = mkItem({ id: "outdoor", plant_name: "Aster" });

    const out = composeAndOrderWalk(
      [indoor, outdoor],
      [],
      [],
      [],
      [],
      [],
      new Map(),
      { ...DEFAULT_WALK_SETTINGS, skipIndoor: true },
      "2026-05-21",
    );

    expect(out.map((p) => p.inventoryItemId)).toEqual(["outdoor"]);
  });

  test("indoor plants are kept when skipIndoor is false", () => {
    const indoor = mkItem({ id: "indoor", plant_name: "Aloe", environment: "Indoors" });
    const outdoor = mkItem({ id: "outdoor", plant_name: "Aster" });

    const out = composeAndOrderWalk(
      [indoor, outdoor],
      [],
      [],
      [],
      [],
      [],
      new Map(),
      { ...DEFAULT_WALK_SETTINGS, skipIndoor: false },
      "2026-05-21",
    );

    expect(new Set(out.map((p) => p.inventoryItemId))).toEqual(new Set(["indoor", "outdoor"]));
  });

  test("plants visited (any outcome) earlier today are not re-walked", () => {
    const visitedToday = mkItem({ id: "today", plant_name: "Onion" });
    const fresh = mkItem({ id: "fresh", plant_name: "Garlic" });

    const out = composeAndOrderWalk(
      [visitedToday, fresh],
      [],
      [],
      [],
      [],
      [
        { inventory_item_id: visitedToday.id, outcome: "noted", visited_at: "2026-05-21T06:30:00Z" },
      ],
      new Map(),
      DEFAULT_WALK_SETTINGS,
      "2026-05-21",
    );

    expect(out.map((p) => p.inventoryItemId)).toEqual(["fresh"]);
  });

  test("within a band, sorts by area then plant name for stable physical order", () => {
    const items = [
      mkItem({ id: "a", plant_name: "Rosemary",  area_name: "Back bed"  }),
      mkItem({ id: "b", plant_name: "Mint",      area_name: "Back bed"  }),
      mkItem({ id: "c", plant_name: "Coriander", area_name: "Front bed" }),
    ];
    const out = composeAndOrderWalk(
      items,
      [],
      [],
      [],
      [],
      [],
      new Map(),
      DEFAULT_WALK_SETTINGS,
      "2026-05-21",
    );
    // all stale band — area asc, then plant asc
    expect(out.map((p) => p.inventoryItemId)).toEqual(["b", "a", "c"]);
  });

  test("nickname takes precedence over plant_name for display", () => {
    const item = mkItem({ id: "n", plant_name: "Tomato", nickname: "Big Red" });
    const out = composeAndOrderWalk(
      [item],
      [],
      [],
      [],
      [],
      [],
      new Map(),
      DEFAULT_WALK_SETTINGS,
      "2026-05-21",
    );
    expect(out[0].plantName).toBe("Big Red");
  });

  test("maxPerWalk caps the result length", () => {
    const items = Array.from({ length: 50 }, (_, i) =>
      mkItem({ id: `i${i}`, plant_name: `Plant ${String(i).padStart(2, "0")}` }),
    );
    const out = composeAndOrderWalk(
      items,
      [],
      [],
      [],
      [],
      [],
      new Map(),
      { ...DEFAULT_WALK_SETTINGS, maxPerWalk: 10 },
      "2026-05-21",
    );
    expect(out.length).toBe(10);
  });

  test("counts on the WalkPlant payload match the input signal counts", () => {
    const item = mkItem({ id: "x", plant_name: "Rose" });
    const out = composeAndOrderWalk(
      [item],
      [
        { inventory_item_id: item.id, subject: "Note",  description: "n", image_url: null, created_at: "2026-05-19" },
      ],
      [{ plant_instance_id: item.id }, { plant_instance_id: item.id }],
      [
        { inventory_item_ids: [item.id], due_date: "2026-05-20T00:00:00Z", status: "Pending" },
        { inventory_item_ids: [item.id], due_date: "2026-05-21T00:00:00Z", status: "Pending" },
        { inventory_item_ids: [item.id], due_date: "2026-05-21T00:00:00Z", status: "Pending" },
      ],
      [
        { inventory_item_id: item.id, created_at: "2026-05-21" },
      ],
      [],
      new Map(),
      DEFAULT_WALK_SETTINGS,
      "2026-05-21",
    );
    expect(out[0].activeAilmentCount).toBe(2);
    expect(out[0].overdueTaskCount).toBe(1);
    expect(out[0].dueTodayTaskCount).toBe(2);
    expect(out[0].freshInsightCount).toBe(1);
    expect(out[0].lastJournalSubject).toBe("Note");
    // critical because there are ailments — beats the overdue tasks
    expect(out[0].band).toBe("critical");
  });
});

// ═══════════════════════════════════════════════════════════════════
// RHO-18 — composeAndOrderWalk groups same-plant, same-area instances
// ═══════════════════════════════════════════════════════════════════

describe("composeAndOrderWalk — RHO-18 instance grouping", () => {
  const call = (items: InventoryItemRow[], ailments: { plant_instance_id: string }[] = []) =>
    composeAndOrderWalk(
      items, [], ailments, [], [], [], new Map(), DEFAULT_WALK_SETTINGS, "2026-05-21",
    );

  test("N instances of the same plant in the same area collapse into ONE card", () => {
    const items = [
      mkItem({ id: "t1", plant_id: 5, plant_name: "Tomato", area_id: "area-1" }),
      mkItem({ id: "t2", plant_id: 5, plant_name: "Tomato", area_id: "area-1" }),
      mkItem({ id: "t3", plant_id: 5, plant_name: "Tomato", area_id: "area-1" }),
    ];
    const out = call(items);
    expect(out).toHaveLength(1);
    expect(out[0].instanceCount).toBe(3);
    expect(out[0].instances).toHaveLength(3);
    expect(out[0].plantName).toBe("Tomato");
    // Every member instance id is preserved.
    expect(new Set(out[0].instances!.map((i) => i.inventoryItemId))).toEqual(
      new Set(["t1", "t2", "t3"]),
    );
  });

  test("same plant in DIFFERENT areas stays as separate cards", () => {
    const items = [
      mkItem({ id: "a", plant_id: 5, plant_name: "Tomato", area_id: "area-1" }),
      mkItem({ id: "b", plant_id: 5, plant_name: "Tomato", area_id: "area-2", area_name: "Front bed" }),
    ];
    const out = call(items);
    expect(out).toHaveLength(2);
    expect(out.every((p) => (p.instanceCount ?? 1) === 1)).toBe(true);
  });

  test("manual instances (no plant_id) group by normalised name + area; different names stay apart", () => {
    const items = [
      mkItem({ id: "m1", plant_id: null, plant_name: "Basil", area_id: "area-1" }),
      mkItem({ id: "m2", plant_id: null, plant_name: "basil", area_id: "area-1" }), // case-insensitive
      mkItem({ id: "m3", plant_id: null, plant_name: "Mint", area_id: "area-1" }),
    ];
    const out = call(items);
    const basil = out.find((p) => p.plantName.toLowerCase() === "basil")!;
    expect(basil.instanceCount).toBe(2);
    expect(out.find((p) => p.plantName === "Mint")!.instanceCount).toBe(1);
  });

  test("group band = the most urgent member's band; counts are summed", () => {
    const items = [
      mkItem({ id: "sick", plant_id: 7, plant_name: "Rose", area_id: "area-1" }),
      mkItem({ id: "fine", plant_id: 7, plant_name: "Rose", area_id: "area-1" }),
    ];
    const out = call(items, [{ plant_instance_id: "sick" }, { plant_instance_id: "sick" }]);
    expect(out).toHaveLength(1);
    expect(out[0].band).toBe("critical"); // sickest member wins
    expect(out[0].activeAilmentCount).toBe(2); // summed across the group
  });

  test("distinctly-nicknamed instances still collapse (same plant + area)", () => {
    const items = [
      mkItem({ id: "n1", plant_id: 9, plant_name: "Chilli", nickname: "Lefty", area_id: "area-1" }),
      mkItem({ id: "n2", plant_id: 9, plant_name: "Chilli", nickname: "Righty", area_id: "area-1" }),
    ];
    const out = call(items);
    expect(out).toHaveLength(1);
    expect(out[0].instanceCount).toBe(2);
    // The individual nicknames are preserved inside the group.
    expect(out[0].instances!.map((i) => i.label).sort()).toEqual(["Lefty", "Righty"]);
  });

  test("the plant-step cap applies to GROUPS, not raw instances", () => {
    const items = Array.from({ length: 40 }, (_, i) =>
      mkItem({ id: `t${i}`, plant_id: 3, plant_name: "Tomato", area_id: "area-1" }),
    );
    const out = call(items);
    // 40 instances of one plant in one bed = a single group, well under the cap.
    expect(out).toHaveLength(1);
    expect(out[0].instanceCount).toBe(40);
  });
});

// ═══════════════════════════════════════════════════════════════════
// RHO-17 — composeWalkRoute (hierarchical route)
// ═══════════════════════════════════════════════════════════════════

const TODAY = "2026-07-02";

function mkWalkPlant(
  over: Partial<WalkPlant> & { inventoryItemId: string },
): WalkPlant {
  return {
    inventoryItemId: over.inventoryItemId,
    plantName: over.plantName ?? "Plant",
    scientificName: null,
    thumbnailUrl: null,
    areaId: over.areaId !== undefined ? over.areaId : "area-1",
    areaName: over.areaName ?? "Back bed",
    locationId: over.locationId !== undefined ? over.locationId : "loc-1",
    locationName: over.locationName ?? "Garden",
    plantedAt: null,
    daysSincePlanted: null,
    lastJournalSubject: null,
    lastJournalDescription: null,
    lastJournalImageUrl: null,
    lastJournalAt: null,
    lastWateredAt: null,
    lastPhotoAt: null,
    activeAilmentCount: 0,
    overdueTaskCount: 0,
    dueTodayTaskCount: 0,
    freshInsightCount: 0,
    lastWalkVisitedAt: null,
    lastWalkOutcome: null,
    band: over.band ?? "stale",
    instanceCount: over.instanceCount,
    instances: over.instances,
  };
}

function mkInstance(inventoryItemId: string, over: Partial<WalkPlantInstance> = {}): WalkPlantInstance {
  return {
    inventoryItemId,
    label: over.label ?? "Plant",
    scientificName: null,
    thumbnailUrl: null,
    plantedAt: null,
    daysSincePlanted: null,
    lastJournalSubject: null,
    lastJournalDescription: null,
    lastJournalImageUrl: null,
    lastJournalAt: null,
    lastPhotoAt: null,
    activeAilmentCount: 0,
    overdueTaskCount: 0,
    dueTodayTaskCount: 0,
    freshInsightCount: 0,
    lastWalkVisitedAt: null,
    lastWalkOutcome: null,
    band: over.band ?? "stale",
  };
}

function mkRouteTask(over: Partial<RouteTaskRow> & { id: string }): RouteTaskRow {
  return {
    id: over.id,
    home_id: HOME,
    title: over.title ?? "Task",
    description: null,
    type: over.type ?? "Watering",
    due_date: over.due_date ?? TODAY,
    status: over.status ?? "Pending",
    isGhost: over.isGhost ?? false,
    blueprint_id: over.blueprint_id ?? null,
    location_id: over.location_id ?? null,
    area_id: over.area_id ?? null,
    plan_id: null,
    inventory_item_ids: over.inventory_item_ids ?? [],
    window_end_date: over.window_end_date ?? null,
    next_check_at: over.next_check_at ?? null,
    scope: over.scope ?? "home",
    created_by: over.created_by ?? null,
    assigned_to: over.assigned_to ?? null,
  };
}

const LOCATIONS = [
  { id: "loc-1", name: "Garden" },
  { id: "loc-2", name: "Allotment" },
];
const AREAS = [
  { id: "area-1", name: "Back bed", location_id: "loc-1" },
  { id: "area-2", name: "Front bed", location_id: "loc-1" },
  { id: "area-3", name: "Plot A", location_id: "loc-2" },
];

function baseInput(over: Partial<ComposeWalkRouteInput> = {}): ComposeWalkRouteInput {
  return {
    plants: [],
    locations: LOCATIONS,
    areas: AREAS,
    tasks: [],
    sectionVisits: [],
    userId: "user-1",
    todayIso: TODAY,
    ...over,
  };
}

function kinds(steps: WalkStep[]): string[] {
  return steps.map((s) => s.kind);
}

describe("composeWalkRoute — RHO-17 hierarchical route", () => {
  test("orders home, location, area, plants; unassigned plants last; empty areas/locations omitted", () => {
    const route = composeWalkRoute(
      baseInput({
        plants: [
          mkWalkPlant({ inventoryItemId: "p1", plantName: "Basil" }),
          mkWalkPlant({ inventoryItemId: "p2", plantName: "Rose" }),
          mkWalkPlant({ inventoryItemId: "u1", plantName: "Tomato", areaId: null, areaName: null, locationId: null, locationName: null }),
        ],
      }),
    );

    // Allotment (loc-2) and Front bed (area-2) are empty and omitted.
    expect(kinds(route.steps)).toEqual(["home", "location", "area", "plant", "plant", "plant"]);
    expect((route.steps[1] as any).name).toBe("Garden");
    expect((route.steps[2] as any).name).toBe("Back bed");
    // Unassigned plant trails the areas.
    expect((route.steps[5] as any).plant.inventoryItemId).toBe("u1");

    const sectionKeys = route.sections.map((s) => s.key);
    expect(sectionKeys).toContain("home");
    expect(sectionKeys).toContain("loc-loc-1");
    expect(sectionKeys).toContain("area-area-1");
    expect(sectionKeys).toContain("unassigned-plants");
    expect(sectionKeys).not.toContain("loc-loc-2");
    expect(sectionKeys).not.toContain("area-area-2");
  });

  test("a location section spans its areas + plants so skip-section jumps the whole range", () => {
    const route = composeWalkRoute(
      baseInput({
        plants: [
          mkWalkPlant({ inventoryItemId: "p1" }),
          mkWalkPlant({ inventoryItemId: "p2", areaId: "area-2", areaName: "Front bed" }),
        ],
      }),
    );
    const locSection = route.sections.find((s) => s.key === "loc-loc-1")!;
    // home(0) location(1) area-1(2) plant(3) area-2(4) plant(5)
    expect(locSection.stepStart).toBe(1);
    expect(locSection.stepEnd).toBe(5);
    // The smallest enclosing section for a plant step is its area.
    expect(sectionForStep(route, 3)?.key).toBe("area-area-1");
    expect(sectionForStep(route, 1)?.key).toBe("loc-loc-1");
  });

  test("tasks map to exactly one step by most-specific rule", () => {
    const route = composeWalkRoute(
      baseInput({
        plants: [mkWalkPlant({ inventoryItemId: "p1" })],
        tasks: [
          mkRouteTask({ id: "t-plant", inventory_item_ids: ["p1"], area_id: "area-1", location_id: "loc-1" }),
          mkRouteTask({ id: "t-area", area_id: "area-1", location_id: "loc-1" }),
          mkRouteTask({ id: "t-loc", location_id: "loc-1" }),
          mkRouteTask({ id: "t-home" }),
        ],
      }),
    );

    const home = route.steps[0] as Extract<WalkStep, { kind: "home" }>;
    const loc = route.steps[1] as Extract<WalkStep, { kind: "location" }>;
    const area = route.steps[2] as Extract<WalkStep, { kind: "area" }>;
    const plant = route.steps[3] as Extract<WalkStep, { kind: "plant" }>;

    expect(home.tasks.map((t) => t.id)).toEqual(["t-home"]);
    expect(loc.tasks.map((t) => t.id)).toEqual(["t-loc"]);
    expect(area.tasks.map((t) => t.id)).toEqual(["t-area"]);
    expect(plant.tasks.map((t) => t.id)).toEqual(["t-plant"]);

    // No double counting anywhere.
    const allIds = route.steps.flatMap((s) => s.tasks.map((t) => t.id));
    expect(allIds.sort()).toEqual(["t-area", "t-home", "t-loc", "t-plant"]);
  });

  test("RHO-18: a task keyed to a NON-representative grouped instance resolves to the group step", () => {
    const grouped = mkWalkPlant({
      inventoryItemId: "rep",
      plantName: "Tomato",
      instanceCount: 2,
      instances: [mkInstance("rep", { label: "Rep" }), mkInstance("member", { label: "Member" })],
    });
    const route = composeWalkRoute(
      baseInput({
        plants: [grouped],
        // Task links ONLY the non-representative member instance.
        tasks: [mkRouteTask({ id: "t-member", inventory_item_ids: ["member"], area_id: "area-1" })],
      }),
    );
    const plantStep = route.steps.find((s) => s.kind === "plant") as Extract<WalkStep, { kind: "plant" }>;
    expect(plantStep.plant.inventoryItemId).toBe("rep");
    expect(plantStep.tasks.map((t) => t.id)).toEqual(["t-member"]);
    // A task fully covered inside the group reports 0 "also covers".
    expect(plantStep.tasks[0].alsoCoversCount ?? 0).toBe(0);
  });

  test("multi-plant task shows on the FIRST of its plants in route order, with alsoCoversCount", () => {
    const route = composeWalkRoute(
      baseInput({
        plants: [
          mkWalkPlant({ inventoryItemId: "p1", plantName: "Basil" }),
          mkWalkPlant({ inventoryItemId: "p2", plantName: "Rose", areaId: "area-2", areaName: "Front bed" }),
        ],
        tasks: [mkRouteTask({ id: "t-multi", inventory_item_ids: ["p2", "p1", "p-gone"] })],
      }),
    );
    const plantSteps = route.steps.filter((s) => s.kind === "plant") as Extract<WalkStep, { kind: "plant" }>[];
    const first = plantSteps.find((s) => s.plant.inventoryItemId === "p1")!;
    const second = plantSteps.find((s) => s.plant.inventoryItemId === "p2")!;
    expect(first.tasks).toHaveLength(1);
    expect(first.tasks[0].alsoCoversCount).toBe(2);
    expect(second.tasks).toHaveLength(0);
  });

  test("plant task whose plants are not on the route falls back down area then home", () => {
    const route = composeWalkRoute(
      baseInput({
        plants: [mkWalkPlant({ inventoryItemId: "p1" })],
        tasks: [
          mkRouteTask({ id: "t-fb-area", inventory_item_ids: ["visited-today"], area_id: "area-1" }),
          mkRouteTask({ id: "t-fb-home", inventory_item_ids: ["visited-today"] }),
        ],
      }),
    );
    const area = route.steps[2] as Extract<WalkStep, { kind: "area" }>;
    const home = route.steps[0] as Extract<WalkStep, { kind: "home" }>;
    expect(area.tasks.map((t) => t.id)).toContain("t-fb-area");
    expect(home.tasks.map((t) => t.id)).toContain("t-fb-home");
  });

  test("personal-scope tasks land on the Home step, labelled; another user's personal tasks are excluded", () => {
    const route = composeWalkRoute(
      baseInput({
        plants: [mkWalkPlant({ inventoryItemId: "p1" })],
        tasks: [
          mkRouteTask({ id: "t-mine", scope: "personal", created_by: "user-1", area_id: "area-1" }),
          mkRouteTask({ id: "t-theirs", scope: "personal", created_by: "user-2" }),
        ],
      }),
    );
    const home = route.steps[0] as Extract<WalkStep, { kind: "home" }>;
    expect(home.tasks.map((t) => t.id)).toEqual(["t-mine"]);
    expect(home.tasks[0].isPersonal).toBe(true);
    const allIds = route.steps.flatMap((s) => s.tasks.map((t) => t.id));
    expect(allIds).not.toContain("t-theirs");
  });

  test("ghost tasks are included and flagged", () => {
    const route = composeWalkRoute(
      baseInput({
        plants: [mkWalkPlant({ inventoryItemId: "p1" })],
        tasks: [
          mkRouteTask({ id: "ghost-bp1-2026-07-02", isGhost: true, blueprint_id: "bp1", location_id: "loc-1" }),
        ],
      }),
    );
    const loc = route.steps[1] as Extract<WalkStep, { kind: "location" }>;
    expect(loc.tasks).toHaveLength(1);
    expect(loc.tasks[0].isGhost).toBe(true);
  });

  test("snoozed, future-dated and non-Pending tasks are excluded; in-window harvest included and not overdue", () => {
    expect(isWalkableTask(mkRouteTask({ id: "a", next_check_at: "2026-07-04" }), TODAY)).toBe(false);
    expect(isWalkableTask(mkRouteTask({ id: "b", due_date: "2026-07-03" }), TODAY)).toBe(false);
    expect(isWalkableTask(mkRouteTask({ id: "c", status: "Completed" }), TODAY)).toBe(false);
    expect(isWalkableTask(mkRouteTask({ id: "d", due_date: "2026-06-20" }), TODAY)).toBe(true);

    const route = composeWalkRoute(
      baseInput({
        tasks: [
          mkRouteTask({ id: "t-window", due_date: "2026-06-30", window_end_date: "2026-07-06" }),
        ],
      }),
    );
    const home = route.steps[0] as Extract<WalkStep, { kind: "home" }>;
    expect(home.tasks).toHaveLength(1);
    expect(home.tasks[0].isOverdue).toBe(false); // window still open
  });

  test("a task alone keeps its section alive (area with no plants still gets a card)", () => {
    const route = composeWalkRoute(
      baseInput({
        tasks: [mkRouteTask({ id: "t-area3", area_id: "area-3", location_id: "loc-2" })],
      }),
    );
    // Allotment/Plot A render purely because of the task.
    expect(kinds(route.steps)).toEqual(["home", "location", "area"]);
    expect((route.steps[1] as any).name).toBe("Allotment");
    expect((route.steps[2] as any).name).toBe("Plot A");
  });

  test("section_done today removes the header step but keeps its plants; section_skipped reappears flagged", () => {
    const route = composeWalkRoute(
      baseInput({
        plants: [
          mkWalkPlant({ inventoryItemId: "p1" }),
          mkWalkPlant({ inventoryItemId: "p2", areaId: "area-2", areaName: "Front bed" }),
        ],
        sectionVisits: [
          { section_kind: "area", section_ref_id: "area-1", outcome: "section_done" },
          { section_kind: "area", section_ref_id: "area-2", outcome: "section_skipped" },
          { section_kind: "home", section_ref_id: null, outcome: "section_done" },
        ],
      }),
    );
    // Home step gone, area-1 header gone (plant remains), area-2 header present + flagged.
    expect(kinds(route.steps)).toEqual(["location", "plant", "area", "plant"]);
    const area2 = route.sections.find((s) => s.key === "area-area-2")!;
    expect(area2.skippedEarlier).toBe(true);
    // task_completed section rows must NOT exclude a section.
    const route2 = composeWalkRoute(
      baseInput({
        plants: [mkWalkPlant({ inventoryItemId: "p1" })],
        sectionVisits: [
          { section_kind: "home", section_ref_id: null, outcome: "task_completed" },
        ],
      }),
    );
    expect(kinds(route2.steps)[0]).toBe("home");
  });

  test("homes with no locations collapse to Home step then unassigned plants; truly empty homes yield no steps", () => {
    const route = composeWalkRoute(
      baseInput({
        locations: [],
        areas: [],
        plants: [mkWalkPlant({ inventoryItemId: "u1", areaId: null, locationId: null })],
      }),
    );
    expect(kinds(route.steps)).toEqual(["home", "plant"]);

    const empty = composeWalkRoute(baseInput({ locations: [], areas: [] }));
    expect(empty.steps).toHaveLength(0);
  });

  test("home attention preview lists top critical/overdue plants (max 3) with their area", () => {
    const route = composeWalkRoute(
      baseInput({
        plants: [
          mkWalkPlant({ inventoryItemId: "c1", plantName: "Sick Rose", band: "critical" }),
          mkWalkPlant({ inventoryItemId: "o1", plantName: "Dry Basil", band: "overdue" }),
          mkWalkPlant({ inventoryItemId: "c2", plantName: "Sick Fern", band: "critical" }),
          mkWalkPlant({ inventoryItemId: "c3", plantName: "Sick Mint", band: "critical" }),
          mkWalkPlant({ inventoryItemId: "s1", plantName: "Fine Thyme", band: "stale" }),
        ],
      }),
    );
    const home = route.steps[0] as Extract<WalkStep, { kind: "home" }>;
    expect(home.attentionPreview).toHaveLength(3);
    expect(home.attentionPreview[0]).toMatchObject({ plantName: "Sick Rose", areaName: "Back bed" });
    expect(home.attentionPreview.map((a) => a.inventoryItemId)).not.toContain("s1");
  });

  test("MAX_PLANTS_PER_WALK is the default cap; sections render on top of the capped plant list", () => {
    expect(DEFAULT_WALK_SETTINGS.maxPerWalk).toBe(MAX_PLANTS_PER_WALK);
    // composeAndOrderWalk applies the cap to plants; sections are added on
    // top by composeWalkRoute — a capped plant list still gets its
    // section header cards.
    const capped = Array.from({ length: 5 }, (_, i) =>
      mkWalkPlant({ inventoryItemId: `p${i}` }),
    );
    const route = composeWalkRoute(baseInput({ plants: capped }));
    const plantSteps = route.steps.filter((s) => s.kind === "plant");
    const sectionSteps = route.steps.filter((s) => s.kind !== "plant");
    expect(plantSteps).toHaveLength(5);
    expect(sectionSteps.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// RHO-17 Phase 2 — walk telemetry (devices + latest readings on steps)
// ═══════════════════════════════════════════════════════════════════

function mkDevice(over: Partial<WalkDevice> & { id: string }): WalkDevice {
  return {
    id: over.id,
    name: over.name ?? `Device ${over.id}`,
    deviceType: over.deviceType ?? "soil_sensor",
    areaId: over.areaId ?? null,
    locationId: over.locationId ?? null,
    batteryPercent: over.batteryPercent ?? null,
    sensor: over.sensor ?? null,
    valve: over.valve ?? null,
    provider: over.provider ?? null,
    controllable: over.controllable ?? false,
    defaultDurationSeconds: over.defaultDurationSeconds ?? 1800,
  };
}

describe("composeWalkRoute — RHO-17 Phase 2 telemetry", () => {
  test("devices attach to the most specific step: area → location → home", () => {
    const route = composeWalkRoute(
      baseInput({
        plants: [mkWalkPlant({ inventoryItemId: "p1" })],
        devices: [
          mkDevice({ id: "d-area", areaId: "area-1", locationId: "loc-1" }),
          mkDevice({ id: "d-loc", deviceType: "water_valve", locationId: "loc-1" }),
          mkDevice({ id: "d-home" }),
          // Unknown area falls back down the chain to its location.
          mkDevice({ id: "d-ghost-area", areaId: "area-nope", locationId: "loc-1" }),
          // Unknown both → home.
          mkDevice({ id: "d-orphan", areaId: "area-nope", locationId: "loc-nope" }),
        ],
      }),
    );
    const home = route.steps[0] as Extract<WalkStep, { kind: "home" }>;
    const loc = route.steps[1] as Extract<WalkStep, { kind: "location" }>;
    const area = route.steps[2] as Extract<WalkStep, { kind: "area" }>;
    expect(home.devices.map((d) => d.id).sort()).toEqual(["d-home", "d-orphan"]);
    expect(loc.devices.map((d) => d.id).sort()).toEqual(["d-ghost-area", "d-loc"]);
    expect(area.devices.map((d) => d.id)).toEqual(["d-area"]);
  });

  test("a device alone keeps its section alive (area and location cards render for device-only sections)", () => {
    const route = composeWalkRoute(
      baseInput({
        devices: [mkDevice({ id: "d1", areaId: "area-3", locationId: "loc-2" })],
      }),
    );
    expect(kinds(route.steps)).toEqual(["home", "location", "area"]);
    expect((route.steps[1] as any).name).toBe("Allotment");
    expect((route.steps[2] as any).name).toBe("Plot A");
    expect((route.steps[2] as any).devices.map((d: WalkDevice) => d.id)).toEqual(["d1"]);
  });

  test("an unassigned device alone keeps the Home step alive", () => {
    const route = composeWalkRoute(
      baseInput({ devices: [mkDevice({ id: "d-home" })] }),
    );
    expect(kinds(route.steps)).toEqual(["home"]);
    expect((route.steps[0] as any).devices).toHaveLength(1);
  });

  test("multiple sensors in one area all attach (dashboard grid only shows the first)", () => {
    const route = composeWalkRoute(
      baseInput({
        plants: [mkWalkPlant({ inventoryItemId: "p1" })],
        devices: [
          mkDevice({ id: "s1", areaId: "area-1" }),
          mkDevice({ id: "s2", areaId: "area-1" }),
          mkDevice({ id: "v1", deviceType: "water_valve", areaId: "area-1" }),
        ],
      }),
    );
    const area = route.steps[2] as Extract<WalkStep, { kind: "area" }>;
    expect(area.devices).toHaveLength(3);
  });

  test("area steps carry the areas.latest_soil_* strip; all-null areas get latest = null", () => {
    const areas: RouteAreaRow[] = [
      {
        id: "area-1",
        name: "Back bed",
        location_id: "loc-1",
        latest_soil_moisture_pct: 41,
        latest_soil_moisture_recorded_at: "2026-06-29T08:00:00Z",
        latest_soil_temp_c: 16.5,
        latest_soil_temp_recorded_at: "2026-06-29T08:00:00Z",
      },
      { id: "area-2", name: "Front bed", location_id: "loc-1" },
    ];
    const route = composeWalkRoute(
      baseInput({
        areas,
        plants: [
          mkWalkPlant({ inventoryItemId: "p1" }),
          mkWalkPlant({ inventoryItemId: "p2", areaId: "area-2", areaName: "Front bed" }),
        ],
      }),
    );
    const area1 = route.steps[2] as Extract<WalkStep, { kind: "area" }>;
    expect(area1.latest).toMatchObject({ moisturePct: 41, tempC: 16.5, ec: null });
    const area2 = route.steps.find(
      (s) => s.kind === "area" && s.id === "area-2",
    ) as Extract<WalkStep, { kind: "area" }>;
    expect(area2.latest).toBeNull();
  });

  test("no devices input leaves every step with an empty devices list (Phase 1 behaviour preserved)", () => {
    const route = composeWalkRoute(
      baseInput({ plants: [mkWalkPlant({ inventoryItemId: "p1" })] }),
    );
    for (const step of route.steps) {
      if (step.kind !== "plant") expect(step.devices).toEqual([]);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// RHO-17 Phase 3 — watchlist weaving + actionable plans
// ═══════════════════════════════════════════════════════════════════

describe("derivePlanPhase — PlanStaging parity", () => {
  test("In-Progress plan with only linked_area_id → phase 2 (The Shed), 2 phases done", () => {
    const d = derivePlanPhase({
      id: "plan-1",
      name: "Summer Veg Plan",
      status: "In Progress",
      kind: "designed",
      staging_state: { linked_area_id: "area-1" },
    });
    // Phase 1 (area) + phase 4 (status In Progress) are done; phase 2 is current.
    expect(d.phase).toBe(2);
    expect(d.phaseLabel).toBe("The Shed");
    expect(d.phasesDone).toBe(2);
    expect(d.linkedAreaId).toBe("area-1");
    expect(d.canActivateMaintenance).toBe(false);
    expect(d.nextAction).toMatch(/Shed/);
  });

  test("phases 1–4 done → phase 5 (Maintenance) is current and activatable in-walk", () => {
    const d = derivePlanPhase({
      id: "plan-1",
      name: "P",
      status: "In Progress",
      staging_state: {
        linked_area_id: "area-1",
        plants_linked: true,
        plants_assigned: true,
      },
    });
    expect(d.phase).toBe(5);
    expect(d.phaseLabel).toBe("Maintenance");
    expect(d.phasesDone).toBe(4);
    expect(d.canActivateMaintenance).toBe(true);
  });

  test("all five phases done → phase null, 'All phases complete'", () => {
    const d = derivePlanPhase({
      id: "plan-1",
      name: "P",
      status: "Completed",
      staging_state: {
        linked_area_id: "area-1",
        plants_linked: true,
        plants_assigned: true,
        maintenance_active: true,
      },
    });
    expect(d.phase).toBeNull();
    expect(d.phasesDone).toBe(5);
    expect(d.nextAction).toBe("All phases complete");
    expect(d.canActivateMaintenance).toBe(false);
  });

  test("plant-first plans are phase-less (no staging_state) and never activatable", () => {
    const d = derivePlanPhase({
      id: "plan-1",
      name: "P",
      status: "In Progress",
      kind: "plant-first",
      staging_state: null,
    });
    expect(d.phase).toBeNull();
    expect(d.phaseLabel).toBeNull();
    expect(d.canActivateMaintenance).toBe(false);
    expect(d.nextAction).toBe("Tracked in the planner");
  });

  test("Draft plan with nothing staged → phase 1 (Infrastructure)", () => {
    const d = derivePlanPhase({ id: "p", name: "P", status: "Draft", staging_state: {} });
    expect(d.phase).toBe(1);
    expect(d.phasesDone).toBe(0);
  });
});

describe("composeWalkRoute — Phase 3 watchlist weaving", () => {
  const WATCHLIST = [
    { id: "ail-aphid", name: "Aphid", type: "pest", symptoms: ["Sticky residue on leaves", "Curled growth"] },
    { id: "ail-blight", name: "Early Blight", type: "disease", symptoms: ["Dark brown spots"] },
    { id: "ail-arch", name: "Powdery Mildew", type: "disease", is_archived: true },
  ];

  test("home step carries the active watchlist digest with home-wide link counts; archived excluded", () => {
    const route = composeWalkRoute(
      baseInput({
        plants: [mkWalkPlant({ inventoryItemId: "p1" })],
        watchlist: WATCHLIST,
        ailmentLinks: [
          { ailment_id: "ail-aphid", plant_instance_id: "p1" },
          { ailment_id: "ail-aphid", plant_instance_id: "p-other" },
        ],
        itemAreas: [
          { id: "p1", area_id: "area-1" },
          { id: "p-other", area_id: "area-2" },
        ],
      }),
    );
    const home = route.steps[0] as Extract<WalkStep, { kind: "home" }>;
    expect(home.watchlist.map((w) => w.id)).toEqual(["ail-aphid", "ail-blight"]);
    expect(home.watchlist[0]).toMatchObject({
      name: "Aphid",
      type: "pest",
      affectedPlantCount: 2,
      firstSymptom: "Sticky residue on leaves",
    });
    expect(home.watchlist[1].affectedPlantCount).toBe(0);
  });

  test("area steps only list ailments linked to THAT area's plants — even plants not on today's route", () => {
    const route = composeWalkRoute(
      baseInput({
        plants: [
          mkWalkPlant({ inventoryItemId: "p1" }),
          mkWalkPlant({ inventoryItemId: "p2", areaId: "area-2", areaName: "Front bed" }),
        ],
        watchlist: WATCHLIST,
        ailmentLinks: [
          { ailment_id: "ail-aphid", plant_instance_id: "p1" },
          // p-visited was already walked today (not in plants) but its
          // area context must still show the flag.
          { ailment_id: "ail-blight", plant_instance_id: "p-visited" },
        ],
        itemAreas: [
          { id: "p1", area_id: "area-1" },
          { id: "p2", area_id: "area-2" },
          { id: "p-visited", area_id: "area-2" },
        ],
      }),
    );
    const area1 = route.steps.find(
      (s) => s.kind === "area" && s.id === "area-1",
    ) as Extract<WalkStep, { kind: "area" }>;
    const area2 = route.steps.find(
      (s) => s.kind === "area" && s.id === "area-2",
    ) as Extract<WalkStep, { kind: "area" }>;
    expect(area1.watchlist.map((w) => w.name)).toEqual(["Aphid"]);
    expect(area1.watchlist[0].affectedPlantCount).toBe(1);
    expect(area2.watchlist.map((w) => w.name)).toEqual(["Early Blight"]);
  });

  test("no watchlist input leaves empty arrays (enrichment, never load-bearing)", () => {
    const route = composeWalkRoute(
      baseInput({ plants: [mkWalkPlant({ inventoryItemId: "p1" })] }),
    );
    const home = route.steps[0] as Extract<WalkStep, { kind: "home" }>;
    const area = route.steps[2] as Extract<WalkStep, { kind: "area" }>;
    expect(home.watchlist).toEqual([]);
    expect(area.watchlist).toEqual([]);
  });
});

describe("composeWalkRoute — Phase 3 actionable plans", () => {
  const PLANS = [
    {
      id: "plan-a",
      name: "Summer Veg Plan",
      status: "In Progress",
      kind: "designed",
      staging_state: { linked_area_id: "area-1" },
    },
    {
      id: "plan-b",
      name: "Border Refresh",
      status: "In Progress",
      kind: "designed",
      staging_state: {
        linked_area_id: "area-2",
        plants_linked: true,
        plants_assigned: true,
      },
    },
    { id: "plan-done", name: "Old", status: "Completed", staging_state: {} },
  ];

  test("home step digests every In-Progress plan (name order); Completed plans excluded", () => {
    const route = composeWalkRoute(
      baseInput({
        plants: [mkWalkPlant({ inventoryItemId: "p1" })],
        plans: PLANS,
      }),
    );
    const home = route.steps[0] as Extract<WalkStep, { kind: "home" }>;
    expect(home.plans.map((p) => p.id)).toEqual(["plan-b", "plan-a"]);
    expect(home.plans.find((p) => p.id === "plan-a")).toMatchObject({
      phase: 2,
      phaseLabel: "The Shed",
      linkedAreaId: "area-1",
    });
    expect(home.plans.find((p) => p.id === "plan-b")).toMatchObject({
      phase: 5,
      canActivateMaintenance: true,
    });
  });

  test("a plan banner lands ONLY on its staged area; openTaskCount counts the plan's walkable tasks", () => {
    const route = composeWalkRoute(
      baseInput({
        plants: [
          mkWalkPlant({ inventoryItemId: "p1" }),
          mkWalkPlant({ inventoryItemId: "p2", areaId: "area-2", areaName: "Front bed" }),
        ],
        plans: PLANS,
        tasks: [
          { ...mkRouteTask({ id: "t1", area_id: "area-1", location_id: "loc-1" }), plan_id: "plan-a" },
          { ...mkRouteTask({ id: "t2", area_id: "area-1", location_id: "loc-1" }), plan_id: "plan-a" },
          // Future-dated plan task is NOT walkable → not counted.
          { ...mkRouteTask({ id: "t3", area_id: "area-1", location_id: "loc-1", due_date: "2026-08-01" }), plan_id: "plan-a" },
        ],
      }),
    );
    const area1 = route.steps.find(
      (s) => s.kind === "area" && s.id === "area-1",
    ) as Extract<WalkStep, { kind: "area" }>;
    const area2 = route.steps.find(
      (s) => s.kind === "area" && s.id === "area-2",
    ) as Extract<WalkStep, { kind: "area" }>;
    expect(area1.plans.map((p) => p.id)).toEqual(["plan-a"]);
    expect(area1.plans[0].openTaskCount).toBe(2);
    expect(area2.plans.map((p) => p.id)).toEqual(["plan-b"]);
  });

  test("plan/watchlist context never forces an empty section to render", () => {
    // area-3 has no plants, tasks or devices — a plan staged there must
    // not conjure a section card out of nothing (enrichment rule).
    const route = composeWalkRoute(
      baseInput({
        plants: [mkWalkPlant({ inventoryItemId: "p1" })],
        plans: [
          {
            id: "plan-empty",
            name: "Empty Bed Plan",
            status: "In Progress",
            staging_state: { linked_area_id: "area-3" },
          },
        ],
      }),
    );
    expect(route.sections.map((s) => s.key)).not.toContain("area-area-3");
    // ...but the Home digest still lists it.
    const home = route.steps[0] as Extract<WalkStep, { kind: "home" }>;
    expect(home.plans.map((p) => p.id)).toEqual(["plan-empty"]);
  });
});
