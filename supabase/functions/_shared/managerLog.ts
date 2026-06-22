/**
 * managerLog — pure helpers for the Head Gardener continuity log.
 *
 * The log is reconciled DETERMINISTICALLY: a gap the manager flagged is only ever
 * marked "acted" because that gap genuinely no longer appears in gapAnalysis — never
 * because the AI guessed. diffGapLog computes, from the current gap set and the
 * currently-open gap entries, which entries to close and which fresh gaps to open.
 *
 * Side-effect free (Deno-tested in supabase/tests/managerLog.test.ts).
 * See docs/plans/head-gardener-ai-manager.md.
 */

export interface OpenLogEntry {
  id: string;
  target_id: string | null;
}

/** Stable key for a gap entry: goal + machine code. */
export function gapKey(goal: string, code: string): string {
  return `${goal}:${code}`;
}

const GAP_TITLES: Record<string, string> = {
  no_plants: "Get something planted",
  no_flowering: "Add some flowering plants",
  bare_seasons: "Fill the colour gaps",
  no_edibles: "Start growing something edible",
  harvest_gap: "Extend your harvest",
  no_wildlife_plants: "Add plants for wildlife",
  maintenance_overload: "Lighten the upkeep",
  toxic_pets: "Review pet-toxic plants",
  toxic_humans: "Review toxic plants",
};

/** Short, action-oriented title for a gap entry in the continuity log. */
export function gapTitle(code: string): string {
  return GAP_TITLES[code] ?? "Worth a look";
}

/**
 * Given the current gap keys (goal:code) and the currently-open gap log entries,
 * return which entry ids to close (their gap has gone) and which gap keys to open
 * (newly detected, not already tracked).
 */
export function diffGapLog(
  currentKeys: string[],
  open: OpenLogEntry[],
): { closeIds: string[]; openKeys: string[] } {
  const current = new Set(currentKeys);
  const openKeySet = new Set(open.map((o) => o.target_id).filter((x): x is string => !!x));
  const closeIds = open.filter((o) => o.target_id && !current.has(o.target_id)).map((o) => o.id);
  const openKeys = [...new Set(currentKeys)].filter((k) => !openKeySet.has(k));
  return { closeIds, openKeys };
}
