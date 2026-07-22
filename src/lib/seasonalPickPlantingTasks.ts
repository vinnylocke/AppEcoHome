// Build the "planting journey" calendar tasks for a seasonal pick — the
// sow → germinate/transplant → harvest steps, NOT ongoing care.
//
// Two sources, in preference order:
//   1. plantingTasksFromGuide(guide) — when the plant already has a grow guide,
//      take the schedulable_tasks from the propagation + germination +
//      harvesting sections (step-enriched), preserving the guide's order.
//   2. plantingTasksFromPick(pick) — instant fallback from the tile's own data
//      (sow_method + sow_window + harvest_window) when there's no guide yet.
//
// Both return `SchedulableTask[]` so they feed the existing AddToCalendarSheet
// unchanged. Pure functions, no I/O — unit-tested in
// tests/unit/lib/seasonalPickPlantingTasks.test.ts.

import {
  flattenSectionsForCalendar,
  type SchedulableTask,
} from "./scheduleFromSchedulableTask";
import type { PlantGrowGuide } from "../services/plantDoctorService";
import type { SeasonalPick } from "../services/seasonalPicksService";

/** The grow-guide section categories that make up the planting journey —
 *  getting the plant into the ground and through to harvest. Ongoing care
 *  (water/soil/sunlight/pruning/flowering/senescence) is deliberately excluded. */
export const PLANTING_JOURNEY_CATEGORIES = new Set([
  "propagation",
  "germination",
  "harvesting",
]);

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/** Verb + task title for each sow method. */
const SOW_VERB: Record<SeasonalPick["sow_method"], string> = {
  direct:     "Direct sow",
  indoor:     "Start indoors",
  cutting:    "Take a cutting of",
  division:   "Divide",
  transplant: "Transplant",
};

/**
 * Collapse tasks that share a title (case-insensitive, trimmed), keeping the
 * one with the richer description and its first-seen position. The propagation
 * and germination sections often both carry the same sow step ("Sow X seeds"),
 * which would otherwise land on the calendar twice.
 */
function dedupeByTitle(tasks: SchedulableTask[]): SchedulableTask[] {
  const byKey = new Map<string, SchedulableTask>();
  const order: string[] = [];
  for (const t of tasks) {
    const key = (t.title ?? "").trim().toLowerCase();
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, t);
      order.push(key);
    } else if ((t.description?.length ?? 0) > (existing.description?.length ?? 0)) {
      // Same title — keep the more complete instructions, first-seen position.
      byKey.set(key, t);
    }
  }
  return order.map((k) => byKey.get(k)!);
}

/**
 * Planting-journey tasks from an existing grow guide. Filters to the
 * propagation + germination + harvesting sections (applicable only), reuses
 * `flattenSectionsForCalendar` so each section's how-to steps are folded into
 * its first task's description (the "methods"), then dedupes identical-title
 * tasks so the same sow step isn't added twice.
 */
export function plantingTasksFromGuide(guide: PlantGrowGuide | null | undefined): SchedulableTask[] {
  if (!guide?.sections?.length) return [];
  const journey = guide.sections.filter(
    (s) => s.applicable && PLANTING_JOURNEY_CATEGORIES.has(s.category),
  );
  return dedupeByTitle(flattenSectionsForCalendar(journey));
}

/** Distinct month abbreviations spanned by an inclusive ISO date range,
 *  walking month by month so a multi-month window lists every month. Returns
 *  [] on unparseable input (→ the task becomes year-round / "start now"). */
function monthsInWindow(startIso: string, endIso: string): string[] {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
  // Guard against a reversed / absurd range (cap at 12 months walked).
  const out: string[] = [];
  const seen = new Set<number>();
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  for (let i = 0; i < 12 && cursor <= last; i++) {
    const m = cursor.getMonth();
    if (!seen.has(m)) { seen.add(m); out.push(MONTHS[m]); }
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return out;
}

/**
 * Instant planting-journey tasks derived from the pick itself, for when the
 * plant has no grow guide yet: a one-off `Planting` task dated to the sow
 * window, plus a one-off `Harvesting` task when the pick carries a harvest
 * window. Dates flow through `active_months` — the same hemisphere-aware
 * month → due-date path the guide tasks use.
 */
export function plantingTasksFromPick(pick: SeasonalPick): SchedulableTask[] {
  const tasks: SchedulableTask[] = [];

  const sowMonths = monthsInWindow(pick.sow_window_start, pick.sow_window_end);
  tasks.push({
    title: `${SOW_VERB[pick.sow_method]} ${pick.common_name}`,
    description: pick.reasoning?.trim()
      ? `${pick.reasoning.trim()}\n\nSuggested from this week's Sow & grow picks.`
      : "Suggested from this week's Sow & grow picks.",
    task_type: "Planting",
    is_recurring: false,
    frequency_days: null,
    active_months: sowMonths.length ? sowMonths : null,
    duration_days: null,
    priority: "Medium",
    depends_on_index: null,
  });

  if (pick.harvest_window?.start && pick.harvest_window?.end) {
    const harvestMonths = monthsInWindow(pick.harvest_window.start, pick.harvest_window.end);
    tasks.push({
      title: `Harvest ${pick.common_name}`,
      description: `Expected harvest window for ${pick.common_name}.`,
      task_type: "Harvesting",
      is_recurring: false,
      frequency_days: null,
      active_months: harvestMonths.length ? harvestMonths : null,
      duration_days: null,
      priority: "Medium",
      depends_on_index: null,
    });
  }

  return tasks;
}
