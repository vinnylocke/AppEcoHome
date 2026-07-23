// Track B — map the "Repeat every year" checkbox + optional "Stop after N
// years" cap to/from the persisted recurrence columns. "Repeat for N years" =
// N annual windows (year Y … Y+(N-1)); the cap reuses `recurs_until`, so there
// is NO schema or engine change. Pure — string/number in, string out, no
// Date.now(). See docs/plans/recurrence-year-cap.md.

export type RecurrenceKind = "once" | "annual" | "lifecycle_capped";

/** Add whole calendar years to a YYYY-MM-DD ("same date next year" via
 *  setUTCFullYear — a Feb 29 anchor rolls to Mar 1, matching the existing
 *  `plantScheduleGenerator.addYears` convention). */
function addYearsStr(dateStr: string, years: number): string {
  const d = new Date(`${String(dateStr).slice(0, 10)}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().split("T")[0];
}

/**
 * Derive the persisted recurrence columns from the authoring controls.
 * - `repeatAnnually` false → `once`.
 * - `repeatAnnually` true, no cap (`repeatYears` null/≤0) → `annual` (forever).
 * - `repeatAnnually` true, `repeatYears` = N → `lifecycle_capped` with
 *   `recurs_until = start + (N-1) years`, so the window opens in exactly N
 *   consecutive years (Y … Y+(N-1)). N=1 caps to the start year (one window).
 */
export function deriveRecurrence(
  startDateStr: string | null | undefined,
  repeatAnnually: boolean,
  repeatYears: number | null,
): { recurrence_kind: RecurrenceKind; recurs_until: string | null } {
  if (!repeatAnnually) return { recurrence_kind: "once", recurs_until: null };
  if (repeatYears == null || !Number.isFinite(repeatYears) || repeatYears <= 0) {
    return { recurrence_kind: "annual", recurs_until: null };
  }
  const start = startDateStr ? String(startDateStr).slice(0, 10) : null;
  // Without an anchor date we can't compute a cap — fall back to uncapped.
  if (!start) return { recurrence_kind: "annual", recurs_until: null };
  return {
    recurrence_kind: "lifecycle_capped",
    recurs_until: addYearsStr(start, Math.floor(repeatYears) - 1),
  };
}

/**
 * Inverse of `deriveRecurrence` — reconstruct the authoring controls from the
 * persisted columns so opening an existing routine pre-fills correctly.
 */
export function yearsFromRecurrence(
  startDateStr: string | null | undefined,
  recurrenceKind: string | null | undefined,
  recursUntil: string | null | undefined,
): { repeatAnnually: boolean; repeatYears: number | null } {
  if (!recurrenceKind || recurrenceKind === "once") {
    return { repeatAnnually: false, repeatYears: null };
  }
  if (recurrenceKind === "annual" || !recursUntil) {
    return { repeatAnnually: true, repeatYears: null };
  }
  // lifecycle_capped: N = (recurs_until year − start year) + 1.
  const startYear = startDateStr
    ? Number(String(startDateStr).slice(0, 4))
    : Number(String(recursUntil).slice(0, 4));
  const capYear = Number(String(recursUntil).slice(0, 4));
  const n = capYear - startYear + 1;
  return { repeatAnnually: true, repeatYears: Number.isFinite(n) && n >= 1 ? n : null };
}
