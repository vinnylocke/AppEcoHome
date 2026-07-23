// Seasonal "window" task types — the single source of truth for which task
// types use the Wave-20 window model (ONE task spanning [start_date,
// end_date], active across the whole window, not a task per day).
//
// Harvesting and Pruning are both seasonal: you do them across a window, not
// on one fixed day. Keeping the set here means the ghost engine
// (`taskEngine.buildRenderTasks`), the "remaining today" count
// (`locationTaskCounts`), and any other window gate stay in lock-step instead
// of drifting apart (which is how Pruning ended up materialising a task every
// day of its season while Harvesting got one window task).
//
// NOTE: the `generate-tasks` Deno cron mirrors this list locally (it can't
// import from `src/`). Keep the two in sync — see
// `supabase/functions/generate-tasks/index.ts`.

export const SEASONAL_WINDOW_TYPES: ReadonlySet<string> = new Set([
  "Harvesting",
  "Harvest", // legacy synonym from Save-to-Shed / Companion Plants
  "Pruning",
]);

/** True for a task/blueprint type that uses the seasonal window model. A type
 *  only becomes a *window* task when it also carries an `end_date`; callers
 *  combine this with that check. */
export function isSeasonalWindowType(taskType?: string | null): boolean {
  return !!taskType && SEASONAL_WINDOW_TYPES.has(taskType);
}

// ---------------------------------------------------------------------------
// Annual carry-over (Track B) — per-year projection of seasonal windows.
// ---------------------------------------------------------------------------
//
// A blueprint with recurrence_kind = 'annual' | 'lifecycle_capped' treats its
// stored start_date/end_date as a MM-DD TEMPLATE for the FIRST window; the
// ghost engine projects one occurrence per year on the same month/day (fixed
// calendar boundaries), so completing this year never touches next year (each
// occurrence's due_date embeds its own year → the unique_blueprint_date
// tombstone is year-scoped by construction).
//
// NOTE: the `generate-tasks` Deno cron mirrors these helpers locally (it can't
// import from `src/`). Keep the two in sync — see
// `supabase/functions/generate-tasks/index.ts`.

/** How many years past the current year the projector will emit. Exposed as a
 *  single knob so "how far ahead does the calendar show next year's windows"
 *  is trivially tunable. Mirrored in the generate-tasks Deno copy. */
export const ANNUAL_PROJECTION_MAX_YEARS = 5;

export type RecurrenceKind = "once" | "annual" | "lifecycle_capped";

export interface ProjectedWindow {
  /** Window start for a specific occurrence year (YYYY-MM-DD). */
  start: string;
  /** Window end (YYYY-MM-DD); rolled into year+1 when the window wraps the
   *  year boundary (end MM-DD before start MM-DD, e.g. Nov → Feb). */
  end: string;
  /** The calendar year the window STARTS in. */
  year: number;
}

const isLeapYear = (y: number): boolean =>
  (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** `${year}-${mmdd}`, guarding the only impossible case: 02-29 in a non-leap
 *  year clamps to 02-28 (keeps a leap-day template projecting every year). */
const dateInYear = (year: number, mmdd: string): string =>
  mmdd === "02-29" && !isLeapYear(year) ? `${year}-02-28` : `${year}-${mmdd}`;

/**
 * Project the annual occurrences of a seasonal window whose stored
 * `[templateStart, templateEnd]` are treated as a MM-DD template, returning the
 * occurrences whose `[start, end]` intersects the render band
 * `[rangeStartStr, rangeEndStr]`.
 *
 * - Fixed calendar boundaries: same month/day every year, only the year moves.
 * - Year-wrapping windows (end MM-DD before start MM-DD) put the end in year+1
 *   so the window stays contiguous (mirrors plantScheduleGenerator's wrap fix).
 * - Never projects before the template's own first year (the blueprint didn't
 *   exist earlier).
 * - Ceiling: `todayYear + maxYearsAhead`, and never past `recursUntil` (the
 *   lifecycle cap) — an occurrence is dropped once its start passes recursUntil.
 * - Leap-day safe (see `dateInYear`).
 *
 * Pure: strings in, strings out, no Date.now(); callers pass `todayStr`.
 */
export function projectAnnualWindows(
  templateStart: string,
  templateEnd: string,
  rangeStartStr: string,
  rangeEndStr: string,
  todayStr: string,
  opts: { recursUntil?: string | null; maxYearsAhead?: number } = {},
): ProjectedWindow[] {
  const start = String(templateStart).slice(0, 10);
  const end = String(templateEnd).slice(0, 10);
  const startMMDD = start.slice(5);
  const endMMDD = end.slice(5);
  const templateYear = Number(start.slice(0, 4));
  if (!Number.isFinite(templateYear) || startMMDD.length !== 5 || endMMDD.length !== 5) return [];

  const wraps = endMMDD < startMMDD;
  const todayYear = Number(String(todayStr).slice(0, 4));
  const maxYearsAhead = opts.maxYearsAhead ?? ANNUAL_PROJECTION_MAX_YEARS;
  const recursUntil = opts.recursUntil ? String(opts.recursUntil).slice(0, 10) : null;
  const ceilingYear = Math.min(
    todayYear + maxYearsAhead,
    recursUntil ? Number(recursUntil.slice(0, 4)) : Number.POSITIVE_INFINITY,
  );

  const rangeStartYear = Number(String(rangeStartStr).slice(0, 4));
  const rangeEndYear = Number(String(rangeEndStr).slice(0, 4));
  // A wrapping window that starts in year Y ends in Y+1, so a band opening in
  // year R can still be met by the occurrence that started in R-1.
  const firstYear = Math.max(templateYear, rangeStartYear - 1);
  const lastYear = Math.min(ceilingYear, rangeEndYear);

  const windows: ProjectedWindow[] = [];
  for (let y = firstYear; y <= lastYear; y++) {
    const s = dateInYear(y, startMMDD);
    if (recursUntil && s > recursUntil) continue; // past the lifecycle cap
    const e = dateInYear(wraps ? y + 1 : y, endMMDD);
    if (s <= rangeEndStr && e >= rangeStartStr) windows.push({ start: s, end: e, year: y });
  }
  return windows;
}
