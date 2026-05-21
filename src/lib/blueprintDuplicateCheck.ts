// Heuristic duplicate detection — given a list of proposed `SuggestedTask`
// entries (from the Grow Guide's Add to calendar flow) and the user's
// existing `task_blueprints`, flags which proposals look like they're
// already on the calendar.
//
// The heuristic is intentionally generous (we'd rather warn on a
// false-positive than burn the user with two watering schedules):
//
//   A proposed task is "likely duplicate" of an existing blueprint when
//   ALL of the following match:
//     - Same task_type (e.g. both Watering).
//     - Same is_recurring flag.
//     - For recurring: frequency_days within ±2 days of the existing
//       blueprint (Gemini's "every 3 days" vs the user's "every 4" is
//       essentially the same job).
//     - Title overlap by word — at least one significant word (≥3 chars,
//       not a stopword) appears in both titles. This stops "Water Roma"
//       and "Prune Lavender" from matching just because they're both
//       recurring.
//
// Returns a Set of *indices* into the proposed list that look
// duplicated. The UI shows a small "may already exist" chip on those
// rows and unchecks them by default.

import type { SuggestedTask } from "../components/TaskActionButtons";

export interface BlueprintRow {
  id: string;
  title: string;
  task_type: string;
  frequency_days: number | null;
  is_recurring: boolean;
}

const STOPWORDS = new Set([
  "the","a","an","of","to","for","and","or","in","on","at","with","your",
  "my","this","that","every","weekly","daily",
]);

function significantWords(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !STOPWORDS.has(w)),
  );
}

function wordsOverlap(a: string, b: string): boolean {
  const aw = significantWords(a);
  const bw = significantWords(b);
  for (const w of aw) if (bw.has(w)) return true;
  return false;
}

/**
 * Returns the set of indices in `proposed` that look like they're
 * already represented by a row in `existing`.
 */
export function findLikelyDuplicates(
  proposed: SuggestedTask[],
  existing: BlueprintRow[],
): Set<number> {
  const dupes = new Set<number>();
  for (let i = 0; i < proposed.length; i++) {
    const p = proposed[i];
    for (const e of existing) {
      if (e.task_type !== p.task_type) continue;
      if (e.is_recurring !== p.is_recurring) continue;
      if (p.is_recurring) {
        const ef = e.frequency_days ?? 0;
        const pf = p.frequency_days ?? 0;
        if (Math.abs(ef - pf) > 2) continue;
      }
      if (!wordsOverlap(p.title, e.title)) continue;
      dupes.add(i);
      break;
    }
  }
  return dupes;
}
