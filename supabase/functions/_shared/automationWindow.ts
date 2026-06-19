/**
 * Home-level default automation "active hours" window.
 *
 * An automation whose condition tree carries no time/date condition of its own
 * runs 24/7. To avoid surprise overnight watering, each home has a default
 * window (08:00–20:00 by default) that the engine applies ONLY to such
 * automations. Pure — unit-tested without a DB.
 */

import { localParts, type ConditionNode } from "./conditionTree.ts";

export interface DefaultWindow {
  /** "HH:MM" or "HH:MM:SS" (Postgres `time`). */
  start: string;
  end: string;
  enabled: boolean;
}

/** Does the tree contain a time or date_range leaf (its own schedule)? Pure. */
export function treeHasOwnSchedule(node: ConditionNode): boolean {
  if (node.kind === "group") return node.children.some(treeHasOwnSchedule);
  return node.kind === "time" || node.kind === "date_range";
}

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Is `now` (interpreted in `tz`) within [start, end]? An end at or before the
 * start wraps past midnight (e.g. 21:00–06:00). A zero-length window is treated
 * as always-open. Pure.
 */
export function isWithinWindow(now: Date, start: string, end: string, tz: string): boolean {
  const { minutes } = localParts(now, tz);
  const a = toMin(start), b = toMin(end);
  if (a === b) return true;                 // zero-length / all-day sentinel
  if (a < b) return minutes >= a && minutes < b;
  return minutes >= a || minutes < b;       // overnight wrap
}

/**
 * Should the default-window gate allow firing now?
 *  - window disabled / absent → always open (no gate).
 *  - tree defines its own time/date condition → always open (default doesn't apply).
 *  - otherwise → `now` (home tz) must sit inside the window.
 * Pure.
 */
export function defaultWindowOpen(
  tree: ConditionNode,
  window: DefaultWindow | null | undefined,
  now: Date,
  tz: string,
): boolean {
  if (!window || !window.enabled) return true;
  if (treeHasOwnSchedule(tree)) return true;
  return isWithinWindow(now, window.start, window.end, tz);
}
