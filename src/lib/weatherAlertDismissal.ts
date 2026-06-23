/**
 * Per-type, per-day weather-alert dismissal.
 *
 * Stored in localStorage as a map of alert TYPE → the local date it was dismissed
 * ("YYYY-MM-DD"). An alert type stays hidden app-wide only for that calendar day;
 * the next day it reappears if it's still active — a gentle reminder, not spam.
 * Replaces the old permanent id-array model. Pure helpers are unit-tested; only
 * load/save touch localStorage.
 */
export type DismissalMap = Record<string, string>;

const KEY = "dismissed-weather-alerts";

/** Local YYYY-MM-DD for "today" — the dismissal granularity. */
export function todayLocal(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function isDismissedToday(map: DismissalMap, type: string, today: string): boolean {
  return map[type] === today;
}

export function dismiss(map: DismissalMap, type: string, today: string): DismissalMap {
  return { ...map, [type]: today };
}

export function undismiss(map: DismissalMap, type: string): DismissalMap {
  const next = { ...map };
  delete next[type];
  return next;
}

/**
 * Coerce stored JSON into a clean map. The legacy format was a `string[]` of alert
 * ids (permanent dismissal) — it's dropped so dismissals start expiring per day.
 */
export function parseDismissed(parsed: unknown): DismissalMap {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const out: DismissalMap = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

export function loadDismissed(): DismissalMap {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? parseDismissed(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

export function saveDismissed(map: DismissalMap): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* ignore quota / unavailable storage */
  }
}
