// Weather-driven task creation — the pure core (opt-in via
// homes.weather_task_creation; executed by analyse-weather).
//
// Given a rule's WeatherTaskCreate + the home's planted instances, outdoor
// areas, today's existing watering tasks, and watering blueprints, produce
// the standalone task rows to insert:
//
//   • ONE task per outdoor area over its planted instances (never per plant —
//     "don't create loads").
//   • Planted-but-unassigned instances (area_id NULL) group per outdoor
//     LOCATION into one "unassigned plants" task. Instances with neither an
//     area nor a location are NEVER given a task — a task without location_id
//     is invisible to the location-keyed pending count while its completion
//     WOULD count in doneToday, corrupting "X of Y done today". They're
//     surfaced via `unplacedCount` for the notification copy instead.
//   • An area/location is SKIPPED when today's watering already covers it —
//     an existing non-Skipped Watering task (by area, location, instance
//     overlap, or a home-wide row) or a watering blueprint due today on its
//     frequency grid (the user's routine wins). Self-healing: the task this
//     module created satisfies that check on the next hourly run.
//
// Idempotency across hourly runs / user deletes is NOT handled here — the
// caller must claim `weather_task_claims` (PK race) before inserting.
//
// Pure: no network, no Date.now() — fully unit-testable in Deno.

import type { WeatherTaskCreate } from "./weatherRules/index.ts";

export interface PlantedInstanceRow {
  id: string;
  area_id: string | null;
  location_id: string | null;
}

export interface AreaRow {
  id: string;
  name: string | null;
  location_id: string;
}

export interface TodayWateringTaskRow {
  area_id: string | null;
  location_id: string | null;
  inventory_item_ids: string[] | null;
}

export interface WateringBlueprintRow {
  area_id: string | null;
  location_id: string | null;
  frequency_days: number | null;
  start_date: string | null;
  created_at?: string | null;
  end_date: string | null;
  paused_until: string | null;
}

export interface WeatherTaskInsertRow {
  home_id: string;
  blueprint_id: null;
  title: string;
  description: string;
  type: string;
  status: "Pending";
  due_date: string;
  location_id: string;
  area_id: string | null;
  inventory_item_ids: string[];
  weather_event_key: string;
  scope: "home";
}

export interface BuildWeatherTasksInput {
  create: WeatherTaskCreate;
  homeId: string;
  today: string; // YYYY-MM-DD
  /** Planted instances for the home (status = 'Planted'). */
  instances: PlantedInstanceRow[];
  /** OUTDOOR areas only (areas of is_outside locations). */
  areas: AreaRow[];
  /** Outdoor location ids — scopes unassigned instances + blueprint coverage. */
  outsideLocationIds: string[];
  /** Non-Skipped Watering tasks due today for the home (any status). */
  existingToday: TodayWateringTaskRow[];
  /** Active recurring Watering blueprints for the home. */
  blueprints: WateringBlueprintRow[];
}

export interface BuildWeatherTasksResult {
  rows: WeatherTaskInsertRow[];
  /** Planted instances with neither an area nor a location — no task created;
   *  mentioned in the notification so they aren't silently forgotten. */
  unplacedCount: number;
}

const MS_PER_DAY = 86_400_000;

/** Is this recurring watering blueprint due today on its frequency grid?
 *  Mirrors the projection generate-tasks / locationTaskCounts use. */
export function isBlueprintDueToday(bp: WateringBlueprintRow, today: string): boolean {
  if (!bp.frequency_days || bp.frequency_days <= 0) return false;
  const anchorStr = (bp.start_date || bp.created_at || "").split("T")[0];
  if (!anchorStr) return false;
  const anchorMs = Date.parse(`${anchorStr}T00:00:00Z`);
  const todayMs = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(anchorMs) || Number.isNaN(todayMs) || todayMs < anchorMs) return false;
  if (bp.end_date && today > bp.end_date.split("T")[0]) return false;
  // Paused occurrences don't materialise — the routine is NOT covering today.
  if (bp.paused_until && today < String(bp.paused_until).split("T")[0]) return false;
  const diffDays = Math.round((todayMs - anchorMs) / MS_PER_DAY);
  return diffDays % bp.frequency_days === 0;
}

export function buildWeatherTasks(input: BuildWeatherTasksInput): BuildWeatherTasksResult {
  const { create, homeId, today, instances, areas, outsideLocationIds, existingToday, blueprints } = input;

  // Only create on the event's own dates — a heatwave forecast for later
  // this week must not water today.
  if (!create.onDates.includes(today)) return { rows: [], unplacedCount: 0 };

  const areaById = new Map(areas.map((a) => [a.id, a]));
  const outsideLocSet = new Set(outsideLocationIds);

  // ── Coverage from today's existing watering + due-today blueprints ────────
  const dueBps = blueprints.filter((bp) => isBlueprintDueToday(bp, today));
  // A home-wide watering (no area, no location) covers everything today.
  const homeWide =
    existingToday.some((t) => !t.area_id && !t.location_id) ||
    dueBps.some((bp) => !bp.area_id && !bp.location_id);
  const coveredAreas = new Set<string>([
    ...existingToday.filter((t) => t.area_id).map((t) => t.area_id as string),
    ...dueBps.filter((bp) => bp.area_id).map((bp) => bp.area_id as string),
  ]);
  const coveredLocations = new Set<string>([
    ...existingToday.filter((t) => !t.area_id && t.location_id).map((t) => t.location_id as string),
    ...dueBps.filter((bp) => !bp.area_id && bp.location_id).map((bp) => bp.location_id as string),
  ]);
  const coveredInstances = new Set<string>(
    existingToday.flatMap((t) => t.inventory_item_ids ?? []),
  );

  if (homeWide) return { rows: [], unplacedCount: 0 };

  // ── Group planted instances ───────────────────────────────────────────────
  // Per outdoor area; unassigned per outdoor location; neither → unplaced.
  const byArea = new Map<string, PlantedInstanceRow[]>();
  const unassignedByLocation = new Map<string, PlantedInstanceRow[]>();
  let unplacedCount = 0;

  for (const inst of instances) {
    if (coveredInstances.has(inst.id)) continue; // already on today's watering
    if (inst.area_id) {
      const area = areaById.get(inst.area_id);
      if (!area) continue; // indoor area (not in the outdoor set) — heat rule targets outdoors
      const arr = byArea.get(inst.area_id);
      if (arr) arr.push(inst);
      else byArea.set(inst.area_id, [inst]);
      continue;
    }
    if (inst.location_id && outsideLocSet.has(inst.location_id)) {
      const arr = unassignedByLocation.get(inst.location_id);
      if (arr) arr.push(inst);
      else unassignedByLocation.set(inst.location_id, [inst]);
      continue;
    }
    if (!inst.location_id) unplacedCount += 1; // neither area nor location
    // indoor location → silently out of scope
  }

  // ── Build rows ────────────────────────────────────────────────────────────
  const rows: WeatherTaskInsertRow[] = [];

  for (const [areaId, group] of byArea) {
    if (coveredAreas.has(areaId)) continue;
    const area = areaById.get(areaId)!;
    if (coveredLocations.has(area.location_id)) continue; // location-level watering today
    rows.push({
      home_id: homeId,
      blueprint_id: null,
      title: create.titleTemplate.replace("{group}", area.name ?? "area"),
      description: create.description,
      type: create.taskType,
      status: "Pending",
      due_date: today,
      location_id: area.location_id,
      area_id: areaId,
      inventory_item_ids: group.map((i) => i.id),
      weather_event_key: `${create.ruleId}:${today}:area:${areaId}`,
      scope: "home",
    });
  }

  for (const [locId, group] of unassignedByLocation) {
    if (coveredLocations.has(locId)) continue;
    rows.push({
      home_id: homeId,
      blueprint_id: null,
      title: create.titleTemplate.replace("{group}", "unassigned plants"),
      description: create.description,
      type: create.taskType,
      status: "Pending",
      due_date: today,
      location_id: locId,
      area_id: null,
      inventory_item_ids: group.map((i) => i.id),
      weather_event_key: `${create.ruleId}:${today}:loc:${locId}`,
      scope: "home",
    });
  }

  return { rows, unplacedCount };
}
