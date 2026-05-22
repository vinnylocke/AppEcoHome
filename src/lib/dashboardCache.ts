// Local-first Dashboard cache.
//
// Stores one snapshot per home in localStorage so the Dashboard can
// paint instantly on cold open, then revalidate against the network in
// the background. Pairs with the `withRetry`-hardened
// `fetchDashboardData` — cache is the SHOW path, network is the REFRESH
// path; whichever finishes faster wins the first paint.
//
// Key shape: `rhozly:dashboard:v1:{home_id}`. The `:v1:` segment is the
// schema version — bump it whenever the snapshot shape changes
// incompatibly so old caches are ignored cleanly rather than crashing
// the app.
//
// TTL: 24 hours from `cachedAt`. After the TTL the snapshot still
// renders on cold open (better than a blank screen) but `isStale: true`
// flips so the UI can show a small "Last synced N days ago" banner.

import { Logger } from "./errorHandler";

// v2 bump (2026-05-22): v1 snapshots cached `weather.Icon` (a lucide
// forwardRef object) directly. After JSON.stringify drops its function
// + Symbol fields, the read path hydrated `weather.Icon = {}` and
// `<weather.Icon />` crashed the Dashboard with React #130. v2 reads
// strip the Icon on write AND recompute weather from rawWeather on
// read; bumping the key forces every device to discard the poisoned
// v1 entries cleanly.
export const DASHBOARD_CACHE_KEY_PREFIX = "rhozly:dashboard:v2";
export const DASHBOARD_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Everything the App-level Dashboard mount needs to render the
 * `/dashboard` screen. Keep this shape stable; add new fields with
 * `| undefined` and a schema-version bump if you need to break it.
 */
export interface DashboardSnapshot {
  cachedAt: string;                                          // ISO timestamp
  rawWeather: unknown;
  weather: unknown;
  locations: unknown[];
  homeLatLng: { lat: number | null; lng: number | null } | null;
  hardinessZone: number | null;
  overdueTaskCount: number;
  alerts: unknown[];
  locationTaskCounts: Record<string, number>;
}

export interface DashboardCacheRead {
  snapshot: DashboardSnapshot;
  /** True when the snapshot is older than the TTL. Still returned so the
   *  UI can paint stale data with a sync-status hint rather than nothing. */
  isStale: boolean;
  /** ms since the snapshot was written. Useful for the "Last synced X" footer. */
  ageMs: number;
}

function storageKey(homeId: string): string {
  return `${DASHBOARD_CACHE_KEY_PREFIX}:${homeId}`;
}

function isStorageAvailable(): boolean {
  try {
    return typeof window !== "undefined" && !!window.localStorage;
  } catch {
    return false;
  }
}

/**
 * Read the cached snapshot for a home. Returns null when:
 *   - Storage isn't available (private mode, SSR).
 *   - There's no entry for this home.
 *   - The entry is malformed (clears the corrupt key as a side effect).
 */
export function readDashboardCache(homeId: string): DashboardCacheRead | null {
  if (!isStorageAvailable() || !homeId) return null;
  const key = storageKey(homeId);
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as DashboardSnapshot;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.cachedAt !== "string" ||
      !Array.isArray(parsed.locations) ||
      !Array.isArray(parsed.alerts) ||
      typeof parsed.locationTaskCounts !== "object" ||
      parsed.locationTaskCounts === null
    ) {
      // Corrupt blob — clear it so the next write starts fresh.
      try { window.localStorage.removeItem(key); } catch { /* non-fatal */ }
      return null;
    }
    const ageMs = Date.now() - new Date(parsed.cachedAt).getTime();
    return {
      snapshot: parsed,
      isStale: ageMs > DASHBOARD_CACHE_TTL_MS,
      ageMs: Math.max(0, ageMs),
    };
  } catch (err) {
    Logger.error("dashboardCache: read failed — clearing", err, { homeId });
    try { window.localStorage.removeItem(key); } catch { /* non-fatal */ }
    return null;
  }
}

/**
 * Write the latest dashboard data to the cache. Wraps localStorage in a
 * try/catch so quota / private-mode failures don't break the network
 * path that just succeeded.
 */
export function writeDashboardCache(
  homeId: string,
  snapshot: Omit<DashboardSnapshot, "cachedAt">,
): void {
  if (!isStorageAvailable() || !homeId) return;
  try {
    const payload: DashboardSnapshot = {
      ...snapshot,
      cachedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(storageKey(homeId), JSON.stringify(payload));
  } catch {
    /* quota exceeded / private mode — non-fatal */
  }
}

/** Remove the cache for a single home — used after sign-out etc. */
export function clearDashboardCache(homeId: string): void {
  if (!isStorageAvailable() || !homeId) return;
  try {
    window.localStorage.removeItem(storageKey(homeId));
  } catch {
    /* non-fatal */
  }
}

/**
 * Remove every dashboard cache entry. Used on full sign-out so a
 * different account opening the app on the same device never sees the
 * previous user's data flash on screen.
 */
export function clearAllDashboardCaches(): void {
  if (!isStorageAvailable()) return;
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      // Match v2 (current) and any legacy v1 entries — sign-out should
      // wipe all of them, and so should the schema-bump migration that
      // moved the prefix from v1 → v2.
      if (k && (k.startsWith(`${DASHBOARD_CACHE_KEY_PREFIX}:`) || k.startsWith("rhozly:dashboard:v1:"))) {
        toRemove.push(k);
      }
    }
    for (const k of toRemove) window.localStorage.removeItem(k);
  } catch {
    /* non-fatal */
  }
}

/**
 * One-shot cleanup of legacy v1 cache keys. Called on app mount so
 * every device's first paint after the v2 bump discards any poisoned
 * v1 weather snapshots, without waiting for sign-out.
 */
export function purgeLegacyV1DashboardCaches(): void {
  if (!isStorageAvailable()) return;
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith("rhozly:dashboard:v1:")) toRemove.push(k);
    }
    for (const k of toRemove) window.localStorage.removeItem(k);
  } catch {
    /* non-fatal */
  }
}
