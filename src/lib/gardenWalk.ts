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

export interface WalkSettings {
  /** Skip plants in areas flagged as indoor. Default true. */
  skipIndoor: boolean;
  /** Skip plants visited as "all_good" within the last N days. Default 7. */
  skipAllGoodDays: number;
  /** Cap the walk size so big gardens stay digestible. Default 30. */
  maxPerWalk: number;
}

export const DEFAULT_WALK_SETTINGS: WalkSettings = {
  skipIndoor: true,
  skipAllGoodDays: 7,
  maxPerWalk: 30,
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
  areaName: string | null;
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
        areaName: item.area_name,
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
