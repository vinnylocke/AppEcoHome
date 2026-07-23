// Annual carry-over (Track B) — Deno mirror of src/lib/windowTasks.ts's
// projection helper. A blueprint with recurrence_kind 'annual' /
// 'lifecycle_capped' treats its stored start_date/end_date as a MM-DD TEMPLATE
// that repeats each year on the same fixed calendar boundaries; the ghost
// engine and the server surfaces roll it into the occurrence year they need.
//
// src (browser) and this (Deno) copy cannot share a module across runtimes —
// keep them in lock-step. Tested in supabase/tests/annualWindows.test.ts, and
// the src copy in tests/unit/lib/windowTasks.test.ts.

export const ANNUAL_PROJECTION_MAX_YEARS = 5;

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

/** `${year}-${mmdd}`, clamping the only impossible case (02-29 in a non-leap
 *  year → 02-28) so a leap-day template still projects every year. */
const dateInYear = (year: number, mmdd: string): string =>
  mmdd === "02-29" && !isLeapYear(year) ? `${year}-02-28` : `${year}-${mmdd}`;

/**
 * Project the annual occurrences of a seasonal window whose stored
 * `[templateStart, templateEnd]` are a MM-DD template, returning the
 * occurrences whose `[start, end]` intersects `[rangeStartStr, rangeEndStr]`.
 * Pure: strings in, strings out, no Date.now(). See src/lib/windowTasks.ts for
 * the authoritative doc comment.
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
  const firstYear = Math.max(templateYear, rangeStartYear - 1);
  const lastYear = Math.min(ceilingYear, rangeEndYear);

  const windows: ProjectedWindow[] = [];
  for (let y = firstYear; y <= lastYear; y++) {
    const s = dateInYear(y, startMMDD);
    if (recursUntil && s > recursUntil) continue;
    const e = dateInYear(wraps ? y + 1 : y, endMMDD);
    if (s <= rangeEndStr && e >= rangeStartStr) windows.push({ start: s, end: e, year: y });
  }
  return windows;
}
