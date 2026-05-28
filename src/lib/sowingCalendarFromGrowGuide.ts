// Pure helper — converts grow_guide propagation + germination schedulable
// tasks into a hemisphere-aware calendar of sowing bands.
//
// The grow_guide AI emits `active_months` already calibrated to the user's
// hemisphere, so this helper doesn't do any seasonal flipping itself — it
// just classifies each task as one of three activities (sow indoors / sow
// direct / transplant out) and returns the resulting bands plus the source
// task so the UI can deep-link to AddToCalendarSheet.

import {
  MONTH_TO_INDEX,
  type MonthAbbrev,
  type SchedulableTask,
} from "./scheduleFromSchedulableTask";

export type SowingActivity = "sow_indoors" | "sow_direct" | "transplant_out";

export interface SowingCalendarBand {
  /** Stable id so React can key the bands. */
  id: string;
  activity: SowingActivity;
  /** User-facing label (e.g. "Sow indoors", "Direct sow", "Transplant out"). */
  label: string;
  /** 0-indexed month numbers (e.g. [2, 3, 4] = Mar/Apr/May). */
  months: number[];
  /** Which grow-guide section produced this (e.g. "propagation"). */
  section: string;
  /** Original schedulable task — kept so the UI can deep-link into AddToCalendarSheet. */
  sourceTask: SchedulableTask;
}

const ACTIVITY_LABELS: Record<SowingActivity, string> = {
  sow_indoors: "Sow indoors",
  sow_direct: "Direct sow",
  transplant_out: "Transplant out",
};

/** Returns the {label} for an activity — exported so the strip can show it in legends. */
export function activityLabel(activity: SowingActivity): string {
  return ACTIVITY_LABELS[activity];
}

/**
 * Classify a schedulable task into a sowing activity using its title +
 * description keywords. Returns null when the task isn't sowing-related
 * (so we drop unrelated propagation/germination tasks like "Check for
 * mould" or "Bottom-water trays").
 */
export function classifySowingActivity(
  task: SchedulableTask,
): SowingActivity | null {
  const haystack = `${task.title} ${task.description}`.toLowerCase();
  // Transplant out / plant out — checked first so "transplant out from indoor
  // sowings" never gets misclassified as a sow.
  if (
    /transplant\s*out|plant\s*out|harden\s*off|move\s*outdoor|move\s*outside|set\s*out/.test(
      haystack,
    )
  ) {
    return "transplant_out";
  }
  // Sow indoors — explicit indoor keywords win over "direct sow" mentions.
  if (
    /sow.*indoor|indoor.*sow|start.*indoor|seed\s*tray|module\s*tray|propagator|greenhouse.*sow/.test(
      haystack,
    )
  ) {
    return "sow_indoors";
  }
  // Direct sow — outdoor / in-place sowing.
  if (
    /direct\s*sow|sow.*direct|sow.*outdoor|sow.*in\s*situ|sow.*in\s*place|sow.*outside|outdoor.*sow/.test(
      haystack,
    )
  ) {
    return "sow_direct";
  }
  // Fallback: bare "sow" goes to "sow_indoors" — the safer default for
  // gardeners following the calendar (catch-22 indoor sowings often
  // unlabelled in AI prose).
  if (/\bsow\b|\bsowing\b/.test(haystack)) {
    return "sow_indoors";
  }
  return null;
}

/**
 * Coerce a list of month strings like ["Mar","Apr","May"] into 0-indexed
 * month numbers. Invalid entries are dropped silently.
 */
function monthsToIndexes(months: string[] | null | undefined): number[] {
  if (!months || months.length === 0) return [];
  const out: number[] = [];
  for (const raw of months) {
    const trimmed = raw.trim() as MonthAbbrev;
    if (trimmed in MONTH_TO_INDEX) {
      out.push(MONTH_TO_INDEX[trimmed]);
    }
  }
  return Array.from(new Set(out)).sort((a, b) => a - b);
}

export interface GuideSection {
  category: string;
  applicable?: boolean;
  schedulable_tasks?: SchedulableTask[];
}

export interface GrowGuideInput {
  sections?: GuideSection[];
}

/**
 * Walk the propagation + germination sections of a grow guide and return
 * every classifiable sowing band. Pure function — testable in isolation.
 *
 * Tasks with no active_months are returned with months=[] so the strip
 * can render them as a "year-round" band; the UI decides how to display
 * those (typically a faded full-width band with a tooltip).
 */
export function sowingCalendarFromGrowGuide(
  guide: GrowGuideInput | null | undefined,
): SowingCalendarBand[] {
  if (!guide || !Array.isArray(guide.sections)) return [];
  const bands: SowingCalendarBand[] = [];
  for (const section of guide.sections) {
    if (!section) continue;
    const cat = section.category?.toLowerCase();
    if (cat !== "propagation" && cat !== "germination") continue;
    // Skip sections explicitly marked not applicable.
    if (section.applicable === false) continue;
    const tasks = section.schedulable_tasks ?? [];
    for (const task of tasks) {
      const activity = classifySowingActivity(task);
      if (!activity) continue;
      const months = monthsToIndexes(task.active_months);
      bands.push({
        id: `${section.category}-${task.title}-${months.join(",")}`,
        activity,
        label: ACTIVITY_LABELS[activity],
        months,
        section: section.category,
        sourceTask: task,
      });
    }
  }
  // Stable ordering: sow_indoors → sow_direct → transplant_out, then by
  // first active month within each activity. Tasks with empty months
  // (year-round) sort to the end.
  const ACTIVITY_ORDER: Record<SowingActivity, number> = {
    sow_indoors: 0,
    sow_direct: 1,
    transplant_out: 2,
  };
  bands.sort((a, b) => {
    const order = ACTIVITY_ORDER[a.activity] - ACTIVITY_ORDER[b.activity];
    if (order !== 0) return order;
    const am = a.months.length === 0 ? 99 : a.months[0];
    const bm = b.months.length === 0 ? 99 : b.months[0];
    return am - bm;
  });
  return bands;
}
