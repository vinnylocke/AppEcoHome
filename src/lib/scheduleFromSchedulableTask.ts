// Bridge from the AI's hemisphere-aware `SchedulableTask` (months) into
// the existing `SuggestedTask` shape that `TaskActionButtons` consumes
// (day offsets from today).
//
// The grow guide emits each task with `active_months` like ["Mar","Apr",
// "May"] — calibrated to the user's hemisphere already. This helper
// computes:
//   - `due_in_days`: days until the next occurrence of the first active
//                    month's start in the user's local calendar.
//   - `end_offset_days`: total span from due_date to the end of the last
//                    active month (or `duration_days` when supplied).
//
// Pure function, no side effects. Lives in `src/lib/` so both the
// per-section Add-to-calendar flow and the bulk "Add all" flow share
// the same conversion logic.

import type { SuggestedTask } from "../components/TaskActionButtons";

export type MonthAbbrev =
  | "Jan" | "Feb" | "Mar" | "Apr" | "May" | "Jun"
  | "Jul" | "Aug" | "Sep" | "Oct" | "Nov" | "Dec";

export const MONTH_TO_INDEX: Record<MonthAbbrev, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

const ALLOWED_TASK_TYPES = [
  "Watering",
  "Pruning",
  "Harvesting",
  "Planting",
  "Maintenance",
  "Fertilizing",
  "Inspection",
] as const;

export type AllowedTaskType = (typeof ALLOWED_TASK_TYPES)[number];

/** The shape we receive from the AI inside each guide section. */
export interface SchedulableTask {
  title: string;
  description: string;
  task_type: string;                  // validated → AllowedTaskType (fallback "Maintenance")
  is_recurring: boolean;
  frequency_days: number | null;
  active_months: string[] | null;     // ["Mar","Apr",…] or null/empty for year-round
  duration_days: number | null;
  priority: "Low" | "Medium" | "High";
  depends_on_index: number | null;
}

export interface ConvertOptions {
  /** Reference "today" for the conversion. Defaults to new Date() — pass
   *  explicitly for unit tests so they're stable. */
  today?: Date;
}

/**
 * Convert a `SchedulableTask` (from the grow guide) into the
 * `SuggestedTask` shape `TaskActionButtons` knows how to insert.
 */
export function scheduleFromSchedulableTask(
  t: SchedulableTask,
  opts: ConvertOptions = {},
): SuggestedTask {
  const today = opts.today ?? new Date();
  const todayY = today.getFullYear();
  const todayM = today.getMonth();
  const todayD = today.getDate();

  const validatedType = validateTaskType(t.task_type);
  const months = validateMonths(t.active_months);

  // ── Date math ─────────────────────────────────────────────────────
  let dueInDays = 0;
  let endOffsetDays = 0;

  if (months.length === 0 || months.length === 12) {
    // Year-round — start now; end span derived from duration_days OR
    // a sensible default (~1y for recurring, 0 for one-off).
    dueInDays = 0;
    if (t.is_recurring) {
      endOffsetDays = t.duration_days ?? 365;
    } else {
      endOffsetDays = 0;
    }
  } else {
    // The window may wrap the year boundary (["Nov","Dec","Jan"] — every
    // southern-hemisphere summer window does). Plain min/max collapsed such
    // windows to Jan..Dec = "active all year", producing "sow now" tasks in
    // midwinter. Instead, the window START is the month after the largest
    // cyclic gap between the sorted months, and the END is the month before
    // that gap.
    const sortedAsc = [...months].sort((a, b) => a - b);
    let gapStartIdx = 0;
    let largestGap = -1;
    for (let i = 0; i < sortedAsc.length; i++) {
      const prev = sortedAsc[(i - 1 + sortedAsc.length) % sortedAsc.length];
      const gap = (sortedAsc[i] - prev + 12) % 12;
      if (gap > largestGap) {
        largestGap = gap;
        gapStartIdx = i;
      }
    }
    const firstMonthIdx = sortedAsc[gapStartIdx];
    const lastMonthIdx = sortedAsc[(gapStartIdx - 1 + sortedAsc.length) % sortedAsc.length];
    const wraps = firstMonthIdx > lastMonthIdx;

    // "Active right now" means today's month is inside the (possibly
    // wrapping) first→last window; gappy windows are treated as contiguous.
    const isActive = wraps
      ? todayM >= firstMonthIdx || todayM <= lastMonthIdx
      : todayM >= firstMonthIdx && todayM <= lastMonthIdx;

    let startDate: Date;
    if (isActive) {
      startDate = new Date(todayY, todayM, todayD);
    } else if (todayM < firstMonthIdx) {
      // Active later this year. (A wrapping window's inactive stretch is
      // always before firstMonthIdx, so it lands here too.)
      startDate = new Date(todayY, firstMonthIdx, 1);
    } else {
      // Active in the next calendar year.
      startDate = new Date(todayY + 1, firstMonthIdx, 1);
    }

    // End = the NEXT occurrence of the last month on/after the start —
    // across the year boundary when the window wraps.
    // End-of-last-month day = day 0 of (last+1).
    const endYear = lastMonthIdx < startDate.getMonth()
      ? startDate.getFullYear() + 1
      : startDate.getFullYear();
    const endDate = new Date(endYear, lastMonthIdx + 1, 0);

    dueInDays = daysBetween(today, startDate);

    if (t.is_recurring) {
      endOffsetDays = t.duration_days ?? daysBetween(startDate, endDate);
    } else {
      // One-off — fires on the start date itself; end offset isn't
      // meaningful but TaskActionButtons accepts null.
      endOffsetDays = 0;
    }
  }

  return {
    title: t.title,
    description: t.description,
    // Cast: SuggestedTask declares the four core types, but validated task
    // types also include Pruning/Fertilizing/Inspection at runtime
    // (pre-existing behaviour — consumers treat task_type as a string).
    task_type: validatedType as SuggestedTask["task_type"],
    due_in_days: dueInDays,
    is_recurring: t.is_recurring,
    frequency_days: t.is_recurring ? (t.frequency_days ?? 7) : null,
    end_offset_days: t.is_recurring ? endOffsetDays : null,
    depends_on_index: t.is_recurring ? null : t.depends_on_index,
  };
}

/** Convert an array of schedulable tasks, preserving order. */
export function scheduleFromSchedulableTasks(
  list: SchedulableTask[],
  opts: ConvertOptions = {},
): SuggestedTask[] {
  return list.map((t) => scheduleFromSchedulableTask(t, opts));
}

/** The how-to step shape carried inside each grow-guide section. */
export interface GuideStep {
  step: number;
  title: string;
  detail: string;
}

/**
 * Returns a new `SchedulableTask` with the section's how-to steps
 * appended to the description as a numbered "How to" checklist. When
 * `steps` is empty, the original task is returned unchanged.
 */
export function enrichDescriptionWithSteps(
  task: SchedulableTask,
  steps: GuideStep[] | null | undefined,
): SchedulableTask {
  if (!steps || steps.length === 0) return task;
  const checklist = steps
    .slice()
    .sort((a, b) => a.step - b.step)
    .map((s) => `${s.step}. ${s.title} — ${s.detail}`.trim())
    .join("\n");
  const original = task.description?.trim() ?? "";
  const description = original
    ? `${original}\n\nHow to:\n${checklist}`
    : `How to:\n${checklist}`;
  return { ...task, description };
}

/** Minimal section shape this module needs — keeps us decoupled from
 *  the wider GuideSection definition in the edge function. */
export interface SectionForCalendar {
  schedulable_tasks?: SchedulableTask[] | null;
  steps?: GuideStep[] | null;
}

/**
 * Flatten an array of guide sections into a single ordered list of
 * `SchedulableTask`s, applying the steps-into-description enrichment
 * to the FIRST task of each section. Subsequent tasks in the same
 * section keep their own short description — they carry their own
 * timing (e.g. germination's "Transplant seedlings" after "Sow") and
 * shouldn't duplicate the whole how-to checklist.
 */
export function flattenSectionsForCalendar(
  sections: SectionForCalendar[],
): SchedulableTask[] {
  const out: SchedulableTask[] = [];
  for (const section of sections) {
    const tasks = section.schedulable_tasks ?? [];
    if (tasks.length === 0) continue;
    const [first, ...rest] = tasks;
    out.push(enrichDescriptionWithSteps(first, section.steps));
    for (const t of rest) out.push(t);
  }
  return out;
}

// ─── Helpers ───────────────────────────────────────────────────────────

function validateTaskType(raw: string): AllowedTaskType {
  if ((ALLOWED_TASK_TYPES as readonly string[]).includes(raw)) {
    return raw as AllowedTaskType;
  }
  // Fallback for any stray task_type the AI emits outside the enum.
  return "Maintenance";
}

function validateMonths(input: string[] | null | undefined): number[] {
  if (!input) return [];
  const result: number[] = [];
  for (const raw of input) {
    const idx = MONTH_TO_INDEX[raw as MonthAbbrev];
    if (typeof idx === "number") result.push(idx);
  }
  return result;
}

/** Days from a → b, rounded to the nearest whole day. Never negative. */
function daysBetween(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}
