/**
 * Generic per-screen offline read cache (offline-first Phase 2).
 *
 * The dashboard (`dashboardCache`) and Shed (`useCachedShed`) proved the
 * pattern: paint from a localStorage snapshot instantly, revalidate in the
 * background, write the fresh result back. Phase 2 extends that to every
 * screen the user wants readable offline (Planner/tasks, Journal, Watchlist,
 * Layout, Automations, home list) via ONE utility instead of six bespoke
 * copies.
 *
 * Keyed `rhozly:snap:v1:{name}:{scope}` where scope is usually the home id
 * (or a user id for user-scoped data). Cleared on sign-out so a shared
 * device never leaks one account's data to the next.
 */

const PREFIX = "rhozly:snap:v1:";

function keyFor(name: string, scope: string): string {
  return `${PREFIX}${name}:${scope}`;
}

export interface Snapshot<T> {
  data: T;
  cachedAt: number;
}

export function writeSnapshot<T>(name: string, scope: string, data: T): void {
  if (typeof window === "undefined" || !scope) return;
  try {
    const payload: Snapshot<T> = { data, cachedAt: Date.now() };
    window.localStorage.setItem(keyFor(name, scope), JSON.stringify(payload));
  } catch {
    /* quota / private mode — ignore */
  }
}

export function readSnapshot<T>(name: string, scope: string): Snapshot<T> | null {
  if (typeof window === "undefined" || !scope) return null;
  try {
    const raw = window.localStorage.getItem(keyFor(name, scope));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "data" in parsed && "cachedAt" in parsed) {
      return parsed as Snapshot<T>;
    }
    return null;
  } catch {
    return null;
  }
}

/** Drop every snapshot cache — called on sign-out alongside the others. */
export function clearAllSnapshots(): void {
  if (typeof window === "undefined") return;
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(PREFIX)) toRemove.push(k);
    }
    toRemove.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}
