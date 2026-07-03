// Garden Walk — walk-list query + ordering helper.
//
// Builds the ordered list of plant instances the user should visit on a
// fresh walk. Pulls everything in one round-trip (inventory_items joined
// with the latest journal note, active ailment count, due/overdue task
// count, fresh insight count, last walk-visit) so the walk page never
// has to hit the network mid-walk.
//
// Ordering algorithm — highest priority band first; within a band,
// stable order by area name + plant name so the same user walks plants
// in the same physical order each day.
//
//   Band 1 — Critical    active ailments
//   Band 2 — Overdue     pending tasks past their due_date
//   Band 3 — Due today   pending tasks due today
//   Band 4 — Fresh hits  user_insights in the last 24h
//   Band 5 — Stale       not walked-as-all-good in the last N days
//   Band 6 — Everything else (already walked recently)
//
// Settings exclude archived items, items in indoor areas (unless opted
// in), and items already visited (any outcome) earlier today.

import { supabase } from "./supabase";
import { Logger } from "./errorHandler";
import { TaskEngine } from "./taskEngine";

/**
 * RHO-17 (approved answer 7) — the walk's plant-step cap, as a single
 * documented knob. Caps PLANT steps only; section cards (home / location
 * / area) always render for any section with at least one plant step or
 * task. Because plants are banded by urgency before the cap applies, a
 * big garden keeps its most signal-heavy plants and drops the quiet
 * ones. Raise (or effectively disable with a large number) here if a
 * "full day's gardening" walk needs more room — no other call site
 * hardcodes 30.
 */
export const MAX_PLANTS_PER_WALK = 30;

export interface WalkSettings {
  /** Skip plants in areas flagged as indoor. Default true. */
  skipIndoor: boolean;
  /** Skip plants visited as "all_good" within the last N days. Default 7. */
  skipAllGoodDays: number;
  /** Cap the walk's PLANT steps so big gardens stay digestible. Default MAX_PLANTS_PER_WALK. */
  maxPerWalk: number;
}

export const DEFAULT_WALK_SETTINGS: WalkSettings = {
  skipIndoor: true,
  skipAllGoodDays: 7,
  maxPerWalk: MAX_PLANTS_PER_WALK,
};

export type WalkBand =
  | "critical"
  | "overdue"
  | "due_today"
  | "fresh_hit"
  | "stale"
  | "everything_else";

export interface WalkPlant {
  inventoryItemId: string;
  plantName: string;       // either the inventory_items nickname or plant_name
  scientificName: string | null;
  thumbnailUrl: string | null;
  areaId: string | null;
  areaName: string | null;
  locationId: string | null;
  locationName: string | null;
  plantedAt: string | null;
  daysSincePlanted: number | null;
  lastJournalSubject: string | null;
  lastJournalDescription: string | null;
  lastJournalImageUrl: string | null;
  lastJournalAt: string | null;
  lastWateredAt: string | null;
  lastPhotoAt: string | null;
  activeAilmentCount: number;
  overdueTaskCount: number;
  dueTodayTaskCount: number;
  freshInsightCount: number;
  lastWalkVisitedAt: string | null;
  lastWalkOutcome: string | null;
  band: WalkBand;
}

/** ISO date string for "today" in the user's local timezone, YYYY-MM-DD. */
function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Date N days ago as an ISO timestamptz string. */
function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

export interface InventoryItemRow {
  id: string;
  home_id: string;
  plant_id: string | null;
  plant_name: string | null;
  nickname: string | null;
  status: string;
  area_id: string | null;
  area_name: string | null;
  location_id: string | null;
  location_name: string | null;
  environment: string | null;
  planted_at: string | null;
}

export interface JournalRow {
  inventory_item_id: string;
  subject: string;
  description: string | null;
  image_url: string | null;
  created_at: string;
}

export interface PiaRow {
  plant_instance_id: string;
}

export interface TaskRow {
  inventory_item_ids: string[] | null;
  due_date: string;
  status: string;
}

export interface InsightRow {
  inventory_item_id: string | null;
  created_at: string;
}

export interface VisitRow {
  inventory_item_id: string;
  outcome: string;
  visited_at: string;
}

export interface PlantsRow {
  id: number;
  thumbnail_url: string | null;
  scientific_name: unknown;
}

/**
 * Pure helper — given the raw rows pulled from supabase, returns the
 * ordered list of plants the walk should visit. Exposed for unit tests
 * and for any future caller that wants to compose the walk list from a
 * different data source.
 */
export function composeAndOrderWalk(
  items: InventoryItemRow[],
  journals: JournalRow[],
  ailments: PiaRow[],
  tasks: TaskRow[],
  insights: InsightRow[],
  visits: VisitRow[],
  speciesById: Map<number, PlantsRow>,
  settings: WalkSettings,
  todayLocalIso: string = todayLocal(),
): WalkPlant[] {
  const filteredItems = settings.skipIndoor
    ? items.filter((i) => i.environment !== "Indoors")
    : items;

  const visitedTodaySet = new Set<string>();
  const allGoodWithinWindow: Map<string, string> = new Map();
  const latestVisitByItem: Map<string, VisitRow> = new Map();
  for (const v of visits) {
    if (!latestVisitByItem.has(v.inventory_item_id)) {
      latestVisitByItem.set(v.inventory_item_id, v);
    }
    if (v.visited_at.startsWith(todayLocalIso)) {
      visitedTodaySet.add(v.inventory_item_id);
    }
    if (v.outcome === "all_good" && !allGoodWithinWindow.has(v.inventory_item_id)) {
      allGoodWithinWindow.set(v.inventory_item_id, v.visited_at);
    }
  }

  const latestJournalByItem: Map<string, JournalRow> = new Map();
  for (const j of journals) {
    if (!latestJournalByItem.has(j.inventory_item_id)) {
      latestJournalByItem.set(j.inventory_item_id, j);
    }
  }

  const ailmentCountByItem: Map<string, number> = new Map();
  for (const a of ailments) {
    ailmentCountByItem.set(
      a.plant_instance_id,
      (ailmentCountByItem.get(a.plant_instance_id) ?? 0) + 1,
    );
  }

  const overdueCountByItem: Map<string, number> = new Map();
  const dueTodayCountByItem: Map<string, number> = new Map();
  for (const t of tasks) {
    const ids = Array.isArray(t.inventory_item_ids) ? t.inventory_item_ids : [];
    if (ids.length === 0) continue;
    const dueDay = t.due_date.slice(0, 10);
    const bucket =
      dueDay < todayLocalIso
        ? overdueCountByItem
        : dueDay === todayLocalIso
        ? dueTodayCountByItem
        : null;
    if (!bucket) continue;
    for (const id of ids) bucket.set(id, (bucket.get(id) ?? 0) + 1);
  }

  const insightCountByItem: Map<string, number> = new Map();
  for (const ins of insights) {
    if (!ins.inventory_item_id) continue;
    insightCountByItem.set(
      ins.inventory_item_id,
      (insightCountByItem.get(ins.inventory_item_id) ?? 0) + 1,
    );
  }

  const composed: WalkPlant[] = filteredItems
    .filter((item) => !visitedTodaySet.has(item.id))
    .map((item) => {
      const speciesIdNum = Number(item.plant_id);
      const species = Number.isFinite(speciesIdNum)
        ? speciesById.get(speciesIdNum) ?? null
        : null;
      const sciRaw = species?.scientific_name;
      const sciName: string | null = Array.isArray(sciRaw)
        ? ((sciRaw[0] ?? null) as string | null)
        : typeof sciRaw === "string"
        ? sciRaw
        : null;

      const journal = latestJournalByItem.get(item.id) ?? null;
      const ailmentCount = ailmentCountByItem.get(item.id) ?? 0;
      const overdueCount = overdueCountByItem.get(item.id) ?? 0;
      const dueTodayCount = dueTodayCountByItem.get(item.id) ?? 0;
      const insightCount = insightCountByItem.get(item.id) ?? 0;
      const recentAllGood = allGoodWithinWindow.get(item.id) ?? null;
      const lastVisit = latestVisitByItem.get(item.id) ?? null;

      const band: WalkBand =
        ailmentCount > 0
          ? "critical"
          : overdueCount > 0
          ? "overdue"
          : dueTodayCount > 0
          ? "due_today"
          : insightCount > 0
          ? "fresh_hit"
          : recentAllGood
          ? "everything_else"
          : "stale";

      const daysSincePlanted = item.planted_at
        ? Math.max(
            0,
            Math.floor(
              (Date.now() - new Date(item.planted_at).getTime()) / 864e5,
            ),
          )
        : null;

      return {
        inventoryItemId: item.id,
        plantName: item.nickname?.trim() || item.plant_name || "Unnamed plant",
        scientificName: sciName,
        thumbnailUrl: species?.thumbnail_url ?? null,
        areaId: item.area_id,
        areaName: item.area_name,
        locationId: item.location_id,
        locationName: item.location_name,
        plantedAt: item.planted_at,
        daysSincePlanted,
        lastJournalSubject: journal?.subject ?? null,
        lastJournalDescription: journal?.description ?? null,
        lastJournalImageUrl: journal?.image_url ?? null,
        lastJournalAt: journal?.created_at ?? null,
        lastPhotoAt: journal?.image_url ? journal.created_at : null,
        lastWateredAt: null,
        activeAilmentCount: ailmentCount,
        overdueTaskCount: overdueCount,
        dueTodayTaskCount: dueTodayCount,
        freshInsightCount: insightCount,
        lastWalkVisitedAt: lastVisit?.visited_at ?? null,
        lastWalkOutcome: lastVisit?.outcome ?? null,
        band,
      };
    });

  const BAND_PRIORITY: Record<WalkBand, number> = {
    critical: 0,
    overdue: 1,
    due_today: 2,
    fresh_hit: 3,
    stale: 4,
    everything_else: 5,
  };
  composed.sort((a, b) => {
    const ba = BAND_PRIORITY[a.band];
    const bb = BAND_PRIORITY[b.band];
    if (ba !== bb) return ba - bb;
    const an = (a.areaName ?? "").localeCompare(b.areaName ?? "");
    if (an !== 0) return an;
    return a.plantName.localeCompare(b.plantName);
  });

  return composed.slice(0, Math.max(1, settings.maxPerWalk));
}

/**
 * Load every signal the walk ordering needs, then merge into one
 * WalkPlant list ordered by band. Designed to issue 4 parallel
 * supabase queries and resolve in well under a second on a typical
 * home (≤100 instances).
 */
export async function buildWalkList(
  homeId: string,
  userId: string,
  settings: WalkSettings = DEFAULT_WALK_SETTINGS,
): Promise<WalkPlant[]> {
  // ── 1. Pull every active inventory item in the home ────────────────
  const itemsQ = supabase
    .from("inventory_items")
    .select(
      "id, home_id, plant_id, plant_name, nickname, status, area_id, area_name, location_id, location_name, environment, planted_at",
    )
    .eq("home_id", homeId)
    .neq("status", "Archived");

  // ── 2. Fresh signal queries, all in parallel ───────────────────────
  const journalsQ = supabase
    .from("plant_journals")
    .select("inventory_item_id, subject, description, image_url, created_at")
    .eq("home_id", homeId)
    .not("inventory_item_id", "is", null)
    .order("created_at", { ascending: false });

  const ailmentsQ = supabase
    .from("plant_instance_ailments")
    .select("plant_instance_id")
    .eq("home_id", homeId)
    .eq("status", "active");

  const tasksQ = supabase
    .from("tasks")
    .select("inventory_item_ids, due_date, status")
    .eq("home_id", homeId)
    .eq("status", "Pending");

  const insightsQ = supabase
    .from("user_insights")
    .select("inventory_item_id, created_at")
    .eq("user_id", userId)
    .is("dismissed_at", null)
    .gte("created_at", daysAgoIso(2));

  const visitsQ = supabase
    .from("garden_walk_visits")
    .select("inventory_item_id, outcome, visited_at")
    .gte("visited_at", daysAgoIso(Math.max(settings.skipAllGoodDays, 1)))
    .order("visited_at", { ascending: false });

  const [items, journals, ailments, tasks, insights, visits] = await Promise.all([
    itemsQ.then((r) => ({ ...r, kind: "items" as const })),
    journalsQ.then((r) => ({ ...r, kind: "journals" as const })),
    ailmentsQ.then((r) => ({ ...r, kind: "ailments" as const })),
    tasksQ.then((r) => ({ ...r, kind: "tasks" as const })),
    insightsQ.then((r) => ({ ...r, kind: "insights" as const })),
    visitsQ.then((r) => ({ ...r, kind: "visits" as const })),
  ]);

  for (const r of [items, journals, ailments, tasks, insights, visits]) {
    if (r.error) {
      Logger.error(`buildWalkList ${r.kind} query failed`, r.error, { homeId });
      throw r.error;
    }
  }

  const itemRows = (items.data ?? []) as InventoryItemRow[];
  if (itemRows.length === 0) return [];

  // Plant catalogue lookup for thumbnails + scientific name.
  const speciesIds = Array.from(
    new Set(
      itemRows
        .map((i) => Number(i.plant_id))
        .filter((n) => Number.isFinite(n)),
    ),
  );
  const speciesById: Map<number, PlantsRow> = new Map();
  if (speciesIds.length > 0) {
    const { data: speciesRows, error: speciesErr } = await supabase
      .from("plants")
      .select("id, thumbnail_url, scientific_name")
      .in("id", speciesIds);
    if (speciesErr) {
      Logger.error("buildWalkList plants lookup failed", speciesErr, { homeId });
      // non-fatal — fall through with empty thumbnails
    } else {
      for (const p of (speciesRows ?? []) as PlantsRow[]) speciesById.set(p.id, p);
    }
  }

  return composeAndOrderWalk(
    itemRows,
    (journals.data ?? []) as JournalRow[],
    (ailments.data ?? []) as PiaRow[],
    (tasks.data ?? []) as TaskRow[],
    (insights.data ?? []) as InsightRow[],
    (visits.data ?? []) as VisitRow[],
    speciesById,
    settings,
  );
}

// ═══════════════════════════════════════════════════════════════════
// RHO-17 — Garden Walk v2: hierarchical route
//
// The walk is no longer a flat plant deck. `composeWalkRoute` (pure,
// unit-tested) turns the banded plant list + locations/areas + today's
// tasks (real AND ghost, via TaskEngine.fetchTasksWithGhosts) into a
// flat ordered array of typed steps grouped into skippable sections:
//
//   Home card → per-Location cards → per-Area cards → per-area plant
//   cards → unassigned-plants section
//
// Progress is derived from garden_walk_visits rows, never a serialized
// route snapshot: sections marked section_done today drop out of a
// same-day rebuild; section_skipped sections REAPPEAR (skipped ≠ done)
// flagged as skippedEarlier. Step types for devices / plans / watchlist
// / readings land in Phases 2–3 — the step shapes below leave room.
// ═══════════════════════════════════════════════════════════════════

/** A task as shown on a walk step — physical row or ghost. */
export interface WalkTask {
  id: string;
  home_id: string;
  title: string;
  description: string | null;
  type: string;
  due_date: string;
  status: string;
  isGhost: boolean;
  blueprint_id: string | null;
  location_id: string | null;
  area_id: string | null;
  plan_id: string | null;
  inventory_item_ids: string[];
  window_end_date: string | null;
  next_check_at: string | null;
  scope: string;
  /** True when the task is past due (window tasks: past window_end_date). */
  isOverdue: boolean;
  /** Personal-scope task shown on the Home step (approved answer 6). */
  isPersonal: boolean;
  /** Multi-plant task shown on its first plant step only — how many other plants it also covers. */
  alsoCoversCount: number;
}

export interface WalkAttentionItem {
  inventoryItemId: string;
  plantName: string;
  areaName: string | null;
  band: WalkBand;
}

// ── Phase 2: walk telemetry (home-overview `view: "walk"`) ──────────

/** Soil-sensor summary as shaped by _shared/homeOverview.ts. */
export interface WalkDeviceSensor {
  moisture: number | null;
  tempC: number | null;
  ec: number | null;
  batteryPercent: number | null;
  readingAgeMin: number | null;
}

/** Valve display state as derived by _shared/homeOverview.ts. */
export interface WalkDeviceValve {
  state: "running" | "idle" | "failed";
  runningUntil: string | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
}

/** One entry from home-overview's walk-view `devices[]` payload. The
 *  valve-control metadata (provider / controllable / default duration)
 *  mirrors ValveControlPanel's props so the walk's valve rows drive the
 *  exact same control path (integrations-ewelink-control /
 *  integrations-adapter-control). */
export interface WalkDevice {
  id: string;
  name: string;
  deviceType: "soil_sensor" | "water_valve";
  areaId: string | null;
  locationId: string | null;
  batteryPercent: number | null;
  sensor: WalkDeviceSensor | null;
  valve: WalkDeviceValve | null;
  provider: string | null;
  controllable: boolean;
  defaultDurationSeconds: number;
}

// ── Phase 3: watchlist weaving + actionable plans ───────────────────

/** One watchlist ailment as woven into the walk. On the Home step the
 *  counts are home-wide ("look out for"); on an Area step they are
 *  scoped to that area's plants ("flagged in this bed"). Read-only
 *  context — tapping opens the Watchlist. */
export interface WalkWatchlistItem {
  id: string;
  name: string;
  /** "pest" | "disease" | "invasive_plant" (ailments.type). */
  type: string;
  /** First symptoms entry — shown as a hint for the "new" persona. */
  firstSymptom: string | null;
  /** Active plant_instance_ailments links (home-wide on the Home step,
   *  this-area-only on an Area step). */
  affectedPlantCount: number;
}

/** Raw active `ailments` row for the route (watchlist). */
export interface RouteAilmentRow {
  id: string;
  name: string;
  type: string;
  symptoms?: unknown;
  is_archived?: boolean;
}

/** Raw active `plant_instance_ailments` link for the route. */
export interface RouteAilmentLinkRow {
  ailment_id: string;
  plant_instance_id: string;
}

/** inventory item → area mapping so ailment links can be bucketed per
 *  area even when the plant itself isn't on today's route. */
export interface RouteItemAreaRow {
  id: string;
  area_id: string | null;
}

/** Raw `plans` row for the route (In Progress only). */
export interface RoutePlanRow {
  id: string;
  name: string;
  status: string;
  kind?: string | null;
  staging_state?: Record<string, unknown> | null;
}

/** An In-Progress plan digest as woven into the walk (approved answer 3
 *  — plans are actionable, not read-only). The Home step carries every
 *  In-Progress plan; an Area step carries the plans whose
 *  staging_state.linked_area_id is that area. */
export interface WalkPlanDigest {
  id: string;
  name: string;
  kind: string;
  /** Current phase 1–5 (PlanStaging semantics); null when every phase is
   *  done or the plan kind is phase-less (plant-first). */
  phase: number | null;
  phaseLabel: string | null;
  /** Completed phases, 0–5. */
  phasesDone: number;
  /** One human line describing what moves the plan forward next. */
  nextAction: string;
  linkedAreaId: string | null;
  /** True when phase 5 (Activate maintenance) is the current phase — the
   *  one staging mutation that lifts cleanly into the walk
   *  (planStagingService.activateMaintenanceBlueprints). */
  canActivateMaintenance: boolean;
  /** This plan's open tasks on today's route (complete them in-walk via
   *  the shared taskActions rows). */
  openTaskCount: number;
}

export const PLAN_PHASE_LABELS: Record<number, string> = {
  1: "Infrastructure",
  2: "The Shed",
  3: "Staging",
  4: "Execution",
  5: "Maintenance",
};

/**
 * Pure mirror of PlanStaging's phase derivation (getCurrentPhaseId /
 * isPhaseNDone): 1 = linked_area_id, 2 = plants_linked, 3 =
 * plants_assigned, 4 = status In Progress/Completed, 5 =
 * maintenance_active. Plant-first plans don't use staging_state — they
 * get a phase-less digest pointing at the planner.
 */
export function derivePlanPhase(plan: RoutePlanRow): Omit<WalkPlanDigest, "openTaskCount"> {
  const staging = plan.staging_state ?? {};
  const kind = plan.kind ?? "designed";

  if (kind === "plant-first") {
    return {
      id: plan.id,
      name: plan.name,
      kind,
      phase: null,
      phaseLabel: null,
      phasesDone: 0,
      nextAction: "Tracked in the planner",
      linkedAreaId: null,
      canActivateMaintenance: false,
    };
  }

  const linkedAreaId =
    typeof staging["linked_area_id"] === "string"
      ? (staging["linked_area_id"] as string)
      : null;
  const done = [
    !!linkedAreaId,
    !!staging["plants_linked"],
    !!staging["plants_assigned"],
    plan.status === "In Progress" || plan.status === "Completed",
    !!staging["maintenance_active"],
  ];
  const phasesDone = done.filter(Boolean).length;
  const firstOpen = done.findIndex((d) => !d);
  const phase = firstOpen === -1 ? null : firstOpen + 1;

  const NEXT_ACTION: Record<number, string> = {
    1: "Link an area to start building",
    2: "Source the plan's plants in the Shed",
    3: "Stage the plants into the linked bed",
    4: "Inject the preparation & planting tasks",
    5: "Activate recurring maintenance to finish",
  };

  return {
    id: plan.id,
    name: plan.name,
    kind,
    phase,
    phaseLabel: phase ? PLAN_PHASE_LABELS[phase] : null,
    phasesDone,
    nextAction: phase ? NEXT_ACTION[phase] : "All phases complete",
    linkedAreaId,
    canActivateMaintenance: phase === 5,
  };
}

/** areas.latest_soil_* strip for the area card — useful without any
 *  hardware ("last logged 3 days ago" is itself a prompt). */
export interface AreaLatestReadings {
  moisturePct: number | null;
  moistureAt: string | null;
  tempC: number | null;
  tempAt: string | null;
  ec: number | null;
  ecAt: string | null;
}

export type WalkStep =
  | {
      kind: "home";
      tasks: WalkTask[];
      /** Top critical/overdue plants + where they are, so hierarchy order never hides urgency. */
      attentionPreview: WalkAttentionItem[];
      /** Devices assigned to no location/area (Phase 2 telemetry). */
      devices: WalkDevice[];
      /** Phase 3 — home-wide "look out for" watchlist digest. */
      watchlist: WalkWatchlistItem[];
      /** Phase 3 — every In-Progress plan (digest; actions live on the area banners). */
      plans: WalkPlanDigest[];
    }
  | {
      kind: "location";
      id: string;
      name: string;
      tasks: WalkTask[];
      areaCount: number;
      plantCount: number;
      /** Devices on this location but not inside any of its areas. */
      devices: WalkDevice[];
    }
  | {
      kind: "area";
      id: string;
      name: string;
      locationId: string;
      locationName: string;
      tasks: WalkTask[];
      plantCount: number;
      /** ALL of this area's devices — not just the first sensor like the dashboard grid. */
      devices: WalkDevice[];
      /** areas.latest_soil_* snapshot; null when the area has never been read. */
      latest: AreaLatestReadings | null;
      /** Phase 3 — ailments with active links among THIS area's plants. */
      watchlist: WalkWatchlistItem[];
      /** Phase 3 — In-Progress plans staged into this area (actionable banner). */
      plans: WalkPlanDigest[];
    }
  | { kind: "plant"; plant: WalkPlant; tasks: WalkTask[] };

export type WalkSectionKind = "home" | "location" | "area" | "unassigned_plants";

export interface WalkSection {
  /** "home" | `loc-${id}` | `area-${id}` | "unassigned-plants" */
  key: string;
  kind: WalkSectionKind;
  /** location/area uuid; null for home + unassigned. */
  refId: string | null;
  label: string;
  /** Inclusive index range into WalkRoute.steps. Location sections span their areas' ranges. */
  stepStart: number;
  stepEnd: number;
  /** The user skipped this section earlier today — it reappears, flagged. */
  skippedEarlier: boolean;
}

export interface WalkRoute {
  steps: WalkStep[];
  sections: WalkSection[];
}

/** Raw task row (physical or ghost) as returned by TaskEngine. */
export interface RouteTaskRow {
  id: string;
  home_id: string;
  title: string;
  description?: string | null;
  type: string;
  due_date: string;
  status: string;
  isGhost?: boolean;
  blueprint_id?: string | null;
  location_id?: string | null;
  area_id?: string | null;
  plan_id?: string | null;
  inventory_item_ids?: string[] | null;
  window_end_date?: string | null;
  next_check_at?: string | null;
  scope?: string | null;
  created_by?: string | null;
  assigned_to?: string | null;
}

export interface RouteLocationRow {
  id: string;
  name: string;
}

export interface RouteAreaRow {
  id: string;
  name: string;
  location_id: string;
  /** areas.latest_soil_* columns (Phase 2 — optional so Phase 1 callers
   *  and tests stay valid). */
  latest_soil_moisture_pct?: number | null;
  latest_soil_moisture_recorded_at?: string | null;
  latest_soil_temp_c?: number | null;
  latest_soil_temp_recorded_at?: string | null;
  latest_soil_ec?: number | null;
  latest_soil_ec_recorded_at?: string | null;
}

export interface SectionVisitRow {
  section_kind: string;
  section_ref_id: string | null;
  outcome: string;
}

/**
 * Should this task appear on today's walk? Pending, due today or
 * overdue (harvest-window tasks are "open" from due_date), and not
 * snoozed into the future — mirroring home-overview's predicates.
 */
export function isWalkableTask(task: RouteTaskRow, todayIso: string): boolean {
  if (task.status !== "Pending") return false;
  if (!task.due_date) return false;
  if (task.due_date.slice(0, 10) > todayIso) return false;
  if (task.next_check_at && String(task.next_check_at).slice(0, 10) > todayIso) {
    return false;
  }
  return true;
}

function toWalkTask(
  t: RouteTaskRow,
  todayIso: string,
  extras: Partial<Pick<WalkTask, "isPersonal" | "alsoCoversCount">> = {},
): WalkTask {
  const windowEnd = t.window_end_date ? String(t.window_end_date).slice(0, 10) : null;
  const due = t.due_date.slice(0, 10);
  return {
    id: t.id,
    home_id: t.home_id,
    title: t.title,
    description: t.description ?? null,
    type: t.type,
    due_date: t.due_date,
    status: t.status,
    isGhost: !!t.isGhost,
    blueprint_id: t.blueprint_id ?? null,
    location_id: t.location_id ?? null,
    area_id: t.area_id ?? null,
    plan_id: t.plan_id ?? null,
    inventory_item_ids: t.inventory_item_ids ?? [],
    window_end_date: t.window_end_date ?? null,
    next_check_at: t.next_check_at ?? null,
    scope: t.scope ?? "home",
    isOverdue: windowEnd ? windowEnd < todayIso : due < todayIso,
    isPersonal: extras.isPersonal ?? false,
    alsoCoversCount: extras.alsoCoversCount ?? 0,
  };
}

export interface ComposeWalkRouteInput {
  /** Output of composeAndOrderWalk — already banded, filtered and capped. */
  plants: WalkPlant[];
  locations: RouteLocationRow[];
  areas: RouteAreaRow[];
  /** Raw task rows incl. ghosts (TaskEngine.fetchTasksWithGhosts). */
  tasks: RouteTaskRow[];
  /** Today's section-visit rows for the walking user. */
  sectionVisits: SectionVisitRow[];
  /** The walker — personal-scope tasks are matched against this. */
  userId: string;
  todayIso?: string;
  /** Phase 2 telemetry — home-overview walk-view devices. Optional and
   *  best-effort: the walk never blocks on telemetry. */
  devices?: WalkDevice[];
  /** Phase 3 — active (non-archived) watchlist ailments. Optional and
   *  best-effort (enrichment, like devices). */
  watchlist?: RouteAilmentRow[];
  /** Phase 3 — ACTIVE plant_instance_ailments links. */
  ailmentLinks?: RouteAilmentLinkRow[];
  /** Phase 3 — inventory item → area map for bucketing ailment links
   *  (covers plants not on today's route, e.g. already visited). */
  itemAreas?: RouteItemAreaRow[];
  /** Phase 3 — In-Progress plans. */
  plans?: RoutePlanRow[];
}

/**
 * Pure route composer. Ordering: Home step first (frames the walk;
 * carries unassigned + personal tasks and the attention preview), then
 * locations in name order, each location's areas in name order, each
 * area's plants banded within the area (the plants input is already
 * band→area→name sorted), then plants with no area as a trailing
 * "unassigned plants" section.
 *
 * Task → step assignment (most specific wins, exactly one step):
 *   personal-scope        → Home step (labelled)
 *   inventory_item_ids    → the FIRST of its plants in route order
 *                           (alsoCoversCount notes the rest); falls back
 *                           down area → location → home when none of its
 *                           plants are on today's route
 *   area_id               → that area step
 *   location_id (no area) → that location step
 *   none                  → Home step
 *
 * Sections with a `section_done` visit today omit their header step
 * (their plant steps remain individually governed by plant visits).
 * `section_skipped` sections reappear with skippedEarlier = true.
 * Empty locations/areas (no plant steps AND no tasks) are omitted.
 */
export function composeWalkRoute(input: ComposeWalkRouteInput): WalkRoute {
  const today = input.todayIso ?? todayLocal();

  // ── Section visit lookups ──────────────────────────────────────────
  const doneSections = new Set<string>();
  const skippedSections = new Set<string>();
  for (const v of input.sectionVisits) {
    const key = `${v.section_kind}:${v.section_ref_id ?? ""}`;
    if (v.outcome === "section_done") doneSections.add(key);
    if (v.outcome === "section_skipped") skippedSections.add(key);
  }
  const isDone = (kind: WalkSectionKind, refId: string | null) =>
    doneSections.has(`${kind}:${refId ?? ""}`);
  const wasSkipped = (kind: WalkSectionKind, refId: string | null) =>
    skippedSections.has(`${kind}:${refId ?? ""}`);

  // ── Devices → most specific step (area → location → home) ──────────
  const homeDevices: WalkDevice[] = [];
  const devicesByLocation = new Map<string, WalkDevice[]>();
  const devicesByArea = new Map<string, WalkDevice[]>();
  {
    const areaIds = new Set(input.areas.map((a) => a.id));
    const locationIds = new Set(input.locations.map((l) => l.id));
    for (const d of input.devices ?? []) {
      if (d.areaId && areaIds.has(d.areaId)) {
        const list = devicesByArea.get(d.areaId) ?? [];
        list.push(d);
        devicesByArea.set(d.areaId, list);
      } else if (d.locationId && locationIds.has(d.locationId)) {
        const list = devicesByLocation.get(d.locationId) ?? [];
        list.push(d);
        devicesByLocation.set(d.locationId, list);
      } else {
        homeDevices.push(d);
      }
    }
  }

  // ── Phase 3: watchlist weaving (home digest + per-area context) ────
  const activeAilments = (input.watchlist ?? []).filter((a) => !a.is_archived);
  const firstSymptomOf = (a: RouteAilmentRow): string | null => {
    const s = a.symptoms;
    return Array.isArray(s) && typeof s[0] === "string" && s[0].length > 0
      ? (s[0] as string)
      : null;
  };
  // Home-wide + per-area link counts, bucketed by ailment.
  const homeLinkCount = new Map<string, number>();
  const areaLinkCount = new Map<string, Map<string, number>>(); // areaId → ailmentId → n
  {
    const areaByItem = new Map(
      (input.itemAreas ?? []).map((i) => [i.id, i.area_id]),
    );
    for (const link of input.ailmentLinks ?? []) {
      homeLinkCount.set(
        link.ailment_id,
        (homeLinkCount.get(link.ailment_id) ?? 0) + 1,
      );
      const areaId = areaByItem.get(link.plant_instance_id) ?? null;
      if (!areaId) continue;
      const byAilment = areaLinkCount.get(areaId) ?? new Map<string, number>();
      byAilment.set(link.ailment_id, (byAilment.get(link.ailment_id) ?? 0) + 1);
      areaLinkCount.set(areaId, byAilment);
    }
  }
  const homeWatchlist: WalkWatchlistItem[] = activeAilments
    .map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      firstSymptom: firstSymptomOf(a),
      affectedPlantCount: homeLinkCount.get(a.id) ?? 0,
    }))
    .sort(
      (a, b) =>
        b.affectedPlantCount - a.affectedPlantCount ||
        a.name.localeCompare(b.name),
    );
  const watchlistForArea = (areaId: string): WalkWatchlistItem[] => {
    const byAilment = areaLinkCount.get(areaId);
    if (!byAilment) return [];
    return activeAilments
      .filter((a) => (byAilment.get(a.id) ?? 0) > 0)
      .map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        firstSymptom: firstSymptomOf(a),
        affectedPlantCount: byAilment.get(a.id)!,
      }))
      .sort(
        (a, b) =>
          b.affectedPlantCount - a.affectedPlantCount ||
          a.name.localeCompare(b.name),
      );
  };

  // ── Phase 3: In-Progress plan digests (home) + per-area banners ────
  const walkableTasks = input.tasks.filter((t) => isWalkableTask(t, today));
  const planDigests: WalkPlanDigest[] = (input.plans ?? [])
    .filter((p) => p.status === "In Progress")
    .map((p) => ({
      ...derivePlanPhase(p),
      openTaskCount: walkableTasks.filter((t) => t.plan_id === p.id).length,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const plansForArea = (areaId: string): WalkPlanDigest[] =>
    planDigests.filter((p) => p.linkedAreaId === areaId);

  const latestFor = (area: RouteAreaRow): AreaLatestReadings | null => {
    const hasAny =
      area.latest_soil_moisture_pct != null ||
      area.latest_soil_temp_c != null ||
      area.latest_soil_ec != null;
    if (!hasAny) return null;
    return {
      moisturePct: area.latest_soil_moisture_pct ?? null,
      moistureAt: area.latest_soil_moisture_recorded_at ?? null,
      tempC: area.latest_soil_temp_c ?? null,
      tempAt: area.latest_soil_temp_recorded_at ?? null,
      ec: area.latest_soil_ec ?? null,
      ecAt: area.latest_soil_ec_recorded_at ?? null,
    };
  };

  // ── Group plants ───────────────────────────────────────────────────
  const areaById = new Map(input.areas.map((a) => [a.id, a]));
  const locationById = new Map(input.locations.map((l) => [l.id, l]));
  const plantsByArea = new Map<string, WalkPlant[]>();
  const unassignedPlants: WalkPlant[] = [];
  for (const p of input.plants) {
    if (p.areaId && areaById.has(p.areaId)) {
      const list = plantsByArea.get(p.areaId) ?? [];
      list.push(p);
      plantsByArea.set(p.areaId, list);
    } else {
      unassignedPlants.push(p);
    }
  }

  const sortedLocations = [...input.locations].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const areasByLocation = new Map<string, RouteAreaRow[]>();
  for (const a of input.areas) {
    const list = areasByLocation.get(a.location_id) ?? [];
    list.push(a);
    areasByLocation.set(a.location_id, list);
  }
  for (const list of areasByLocation.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }

  // Plant order across the whole route — needed for the "first of its
  // plants in route order" rule for multi-plant tasks.
  const plantOrder: WalkPlant[] = [];
  for (const loc of sortedLocations) {
    for (const area of areasByLocation.get(loc.id) ?? []) {
      for (const p of plantsByArea.get(area.id) ?? []) plantOrder.push(p);
    }
  }
  for (const p of unassignedPlants) plantOrder.push(p);
  const plantRoutePosition = new Map(
    plantOrder.map((p, i) => [p.inventoryItemId, i]),
  );

  // ── Assign tasks to exactly one step ───────────────────────────────
  const homeTasks: WalkTask[] = [];
  const tasksByLocation = new Map<string, WalkTask[]>();
  const tasksByArea = new Map<string, WalkTask[]>();
  const tasksByPlant = new Map<string, WalkTask[]>();

  const pushTo = (map: Map<string, WalkTask[]>, key: string, task: WalkTask) => {
    const list = map.get(key) ?? [];
    list.push(task);
    map.set(key, list);
  };

  for (const raw of input.tasks) {
    if (!isWalkableTask(raw, today)) continue;

    // Personal-scope tasks belong on the Home step (approved answer 6).
    if (raw.scope === "personal") {
      const owner = raw.assigned_to ?? raw.created_by ?? null;
      if (owner && owner !== input.userId) continue; // someone else's list
      homeTasks.push(toWalkTask(raw, today, { isPersonal: true }));
      continue;
    }

    const itemIds = raw.inventory_item_ids ?? [];
    if (itemIds.length > 0) {
      // First of its plants in route order.
      let best: string | null = null;
      let bestPos = Infinity;
      for (const id of itemIds) {
        const pos = plantRoutePosition.get(id);
        if (pos !== undefined && pos < bestPos) {
          best = id;
          bestPos = pos;
        }
      }
      if (best) {
        pushTo(
          tasksByPlant,
          best,
          toWalkTask(raw, today, { alsoCoversCount: itemIds.length - 1 }),
        );
        continue;
      }
      // None of its plants are on today's route — fall through to the
      // area / location / home chain so the task stays actionable.
    }

    if (raw.area_id && areaById.has(raw.area_id)) {
      pushTo(tasksByArea, raw.area_id, toWalkTask(raw, today));
    } else if (raw.location_id && locationById.has(raw.location_id)) {
      pushTo(tasksByLocation, raw.location_id, toWalkTask(raw, today));
    } else {
      homeTasks.push(toWalkTask(raw, today));
    }
  }

  // ── Build steps + sections ─────────────────────────────────────────
  const steps: WalkStep[] = [];
  const sections: WalkSection[] = [];

  for (const loc of sortedLocations) {
    // A section renders for any location/area with ≥1 plant step, task
    // or device (§4.2 — devices added in Phase 2).
    const locAreas = (areasByLocation.get(loc.id) ?? []).filter((area) => {
      const plants = plantsByArea.get(area.id) ?? [];
      const tasks = tasksByArea.get(area.id) ?? [];
      const devices = devicesByArea.get(area.id) ?? [];
      return plants.length > 0 || tasks.length > 0 || devices.length > 0;
    });
    const locTasks = tasksByLocation.get(loc.id) ?? [];
    const locDevices = devicesByLocation.get(loc.id) ?? [];
    if (locAreas.length === 0 && locTasks.length === 0 && locDevices.length === 0) {
      continue; // empty location
    }

    const locStart = steps.length;
    const locPlantCount = locAreas.reduce(
      (n, a) => n + (plantsByArea.get(a.id)?.length ?? 0),
      0,
    );
    if (!isDone("location", loc.id)) {
      steps.push({
        kind: "location",
        id: loc.id,
        name: loc.name,
        tasks: locTasks,
        areaCount: locAreas.length,
        plantCount: locPlantCount,
        devices: locDevices,
      });
    }

    for (const area of locAreas) {
      const areaPlants = plantsByArea.get(area.id) ?? [];
      const areaTasks = tasksByArea.get(area.id) ?? [];
      const areaStart = steps.length;
      if (!isDone("area", area.id)) {
        steps.push({
          kind: "area",
          id: area.id,
          name: area.name,
          locationId: loc.id,
          locationName: loc.name,
          tasks: areaTasks,
          plantCount: areaPlants.length,
          devices: devicesByArea.get(area.id) ?? [],
          latest: latestFor(area),
          watchlist: watchlistForArea(area.id),
          plans: plansForArea(area.id),
        });
      }
      for (const p of areaPlants) {
        steps.push({
          kind: "plant",
          plant: p,
          tasks: tasksByPlant.get(p.inventoryItemId) ?? [],
        });
      }
      if (steps.length > areaStart) {
        sections.push({
          key: `area-${area.id}`,
          kind: "area",
          refId: area.id,
          label: area.name,
          stepStart: areaStart,
          stepEnd: steps.length - 1,
          skippedEarlier: wasSkipped("area", area.id),
        });
      }
    }

    if (steps.length > locStart) {
      sections.push({
        key: `loc-${loc.id}`,
        kind: "location",
        refId: loc.id,
        label: loc.name,
        stepStart: locStart,
        stepEnd: steps.length - 1,
        skippedEarlier: wasSkipped("location", loc.id),
      });
    }
  }

  // Unassigned plants — trailing section, no header card (each plant is
  // individually skippable).
  if (unassignedPlants.length > 0) {
    const start = steps.length;
    for (const p of unassignedPlants) {
      steps.push({
        kind: "plant",
        plant: p,
        tasks: tasksByPlant.get(p.inventoryItemId) ?? [],
      });
    }
    sections.push({
      key: "unassigned-plants",
      kind: "unassigned_plants",
      refId: null,
      label: "Unassigned plants",
      stepStart: start,
      stepEnd: steps.length - 1,
      skippedEarlier: wasSkipped("unassigned_plants", null),
    });
  }

  // Home step — always first when there is anything to walk (it frames
  // the walk), and also when it alone carries tasks or unassigned
  // devices. Omitted once marked section_done today, and for truly-empty
  // homes (preserves the "Nothing to walk today" empty state).
  if (
    (steps.length > 0 || homeTasks.length > 0 || homeDevices.length > 0) &&
    !isDone("home", null)
  ) {
    const attentionPreview: WalkAttentionItem[] = input.plants
      .filter((p) => p.band === "critical" || p.band === "overdue")
      .slice(0, 3)
      .map((p) => ({
        inventoryItemId: p.inventoryItemId,
        plantName: p.plantName,
        areaName: p.areaName,
        band: p.band,
      }));
    steps.unshift({
      kind: "home",
      tasks: homeTasks,
      attentionPreview,
      devices: homeDevices,
      watchlist: homeWatchlist,
      plans: planDigests,
    });
    for (const s of sections) {
      s.stepStart += 1;
      s.stepEnd += 1;
    }
    sections.unshift({
      key: "home",
      kind: "home",
      refId: null,
      label: "Home",
      stepStart: 0,
      stepEnd: 0,
      skippedEarlier: wasSkipped("home", null),
    });
  }

  return { steps, sections };
}

/**
 * The section a step index belongs to — smallest enclosing range wins
 * (area beats its containing location). Used for the header's section
 * label and the skip-section jump.
 */
export function sectionForStep(
  route: WalkRoute,
  stepIndex: number,
): WalkSection | null {
  let best: WalkSection | null = null;
  for (const s of route.sections) {
    if (stepIndex < s.stepStart || stepIndex > s.stepEnd) continue;
    if (!best || s.stepEnd - s.stepStart < best.stepEnd - best.stepStart) {
      best = s;
    }
  }
  return best;
}

/** Start of today (local midnight) as an ISO timestamptz string. */
function startOfTodayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/**
 * Fetch orchestration for the hierarchical walk. Runs the existing
 * plant-signal bootstrap (buildWalkList) in parallel with the route's
 * extra reads — locations+areas, today's tasks incl. ghosts via
 * TaskEngine, and today's section visits for the walking user — then
 * hands everything to the pure composeWalkRoute.
 */
export async function buildWalkRoute(
  homeId: string,
  userId: string,
  settings: WalkSettings = DEFAULT_WALK_SETTINGS,
): Promise<WalkRoute> {
  const today = todayLocal();

  const locationsQ = supabase
    .from("locations")
    .select(
      "id, name, areas(id, name, location_id, latest_soil_moisture_pct, latest_soil_moisture_recorded_at, latest_soil_temp_c, latest_soil_temp_recorded_at, latest_soil_ec, latest_soil_ec_recorded_at)",
    )
    .eq("home_id", homeId);

  // Phase 2 telemetry — home-overview's walk view (flat devices[] with
  // sensor summaries + valve states). Soft-fail like useHomeOverview:
  // devices are enrichment, the walk must NEVER block on telemetry.
  const walkDevicesQ: Promise<WalkDevice[]> = supabase.functions
    .invoke("home-overview", { body: { homeId, today, view: "walk" } })
    .then((res) => {
      if (res.error) throw res.error;
      return ((res.data as { devices?: WalkDevice[] } | null)?.devices ??
        []) as WalkDevice[];
    })
    .catch((err: unknown) => {
      Logger.error("buildWalkRoute walk telemetry failed (non-fatal)", err, {
        homeId,
      });
      return [] as WalkDevice[];
    });

  const sessionsTodayQ = supabase
    .from("garden_walk_sessions")
    .select("id")
    .eq("home_id", homeId)
    .eq("user_id", userId)
    .gte("started_at", startOfTodayIso());

  // Phase 3 — watchlist + plans weaving. All four are ENRICHMENT like
  // the telemetry call: each soft-fails to empty so the walk skeleton
  // never blocks on them.
  const soften = <T,>(
    q: PromiseLike<{ data: T[] | null; error: unknown }>,
    label: string,
  ): Promise<T[]> =>
    Promise.resolve(q).then((res) => {
      if (res.error) {
        Logger.error(`buildWalkRoute ${label} query failed (non-fatal)`, res.error, { homeId });
        return [] as T[];
      }
      return (res.data ?? []) as T[];
    });

  const watchlistQ = soften<RouteAilmentRow>(
    supabase
      .from("ailments")
      .select("id, name, type, symptoms, is_archived")
      .eq("home_id", homeId)
      .eq("is_archived", false),
    "watchlist",
  );
  const ailmentLinksQ = soften<RouteAilmentLinkRow>(
    supabase
      .from("plant_instance_ailments")
      .select("ailment_id, plant_instance_id")
      .eq("home_id", homeId)
      .eq("status", "active"),
    "ailment links",
  );
  const itemAreasQ = soften<RouteItemAreaRow>(
    supabase
      .from("inventory_items")
      .select("id, area_id")
      .eq("home_id", homeId)
      .neq("status", "Archived"),
    "item areas",
  );
  const plansQ = soften<RoutePlanRow>(
    supabase
      .from("plans")
      .select("id, name, status, kind, staging_state")
      .eq("home_id", homeId)
      .eq("status", "In Progress"),
    "plans",
  );

  // Tasks completed/postponed mid-walk must drop out of a same-day
  // rebuild ("Walk what's left") — don't let the engine's 60s cache
  // serve the pre-walk snapshot.
  TaskEngine.invalidateCache(homeId);

  const [
    plants,
    locationsRes,
    tasksRes,
    sessionsRes,
    walkDevices,
    watchlist,
    ailmentLinks,
    itemAreas,
    plans,
  ] = await Promise.all([
    buildWalkList(homeId, userId, settings),
    locationsQ,
    TaskEngine.fetchTasksWithGhosts({
      homeId,
      startDateStr: today,
      endDateStr: today,
      includeOverdue: true,
      todayStr: today,
    }),
    sessionsTodayQ,
    walkDevicesQ,
    watchlistQ,
    ailmentLinksQ,
    itemAreasQ,
    plansQ,
  ]);

  if (locationsRes.error) {
    Logger.error("buildWalkRoute locations query failed", locationsRes.error, { homeId });
    throw locationsRes.error;
  }
  if (sessionsRes.error) {
    Logger.error("buildWalkRoute sessions query failed", sessionsRes.error, { homeId });
    throw sessionsRes.error;
  }

  const locationRows = (locationsRes.data ?? []) as Array<
    RouteLocationRow & { areas: RouteAreaRow[] | null }
  >;
  const locations: RouteLocationRow[] = locationRows.map((l) => ({
    id: l.id,
    name: l.name,
  }));
  const areas: RouteAreaRow[] = locationRows.flatMap((l) => l.areas ?? []);

  // Section visits from today's own sessions only — another member's
  // walk must not mark my sections as done.
  let sectionVisits: SectionVisitRow[] = [];
  const sessionIds = (sessionsRes.data ?? []).map((s: { id: string }) => s.id);
  if (sessionIds.length > 0) {
    const { data: visitRows, error: visitsError } = await supabase
      .from("garden_walk_visits")
      .select("section_kind, section_ref_id, outcome")
      .in("session_id", sessionIds)
      .not("section_kind", "is", null);
    if (visitsError) {
      // Non-fatal: worst case, done/skipped sections reappear.
      Logger.error("buildWalkRoute section visits query failed", visitsError, { homeId });
    } else {
      sectionVisits = (visitRows ?? []) as SectionVisitRow[];
    }
  }

  return composeWalkRoute({
    plants,
    locations,
    areas,
    tasks: (tasksRes.tasks ?? []) as RouteTaskRow[],
    sectionVisits,
    userId,
    todayIso: today,
    devices: walkDevices,
    watchlist,
    ailmentLinks,
    itemAreas,
    plans,
  });
}

/**
 * Tiny client-side helper to label a band for the UI.
 */
export function bandLabel(band: WalkBand): string {
  switch (band) {
    case "critical":
      return "Needs attention";
    case "overdue":
      return "Overdue tasks";
    case "due_today":
      return "Due today";
    case "fresh_hit":
      return "New insight";
    case "stale":
      return "Catch-up";
    case "everything_else":
    default:
      return "";
  }
}
