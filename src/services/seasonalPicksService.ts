// Client-side wrapper around the `seasonal_picks` action on the
// plant-doctor edge function. Handles:
//   - SessionStorage caching keyed by (homeId, ISO week) so navigating
//     between Dashboard and Today doesn't re-fetch.
//   - A tiny in-flight dedupe so two card mounts on the same screen
//     coalesce into one network call.

import { supabase } from "../lib/supabase";
import { Logger } from "../lib/errorHandler";

export type SeasonalPickSowMethod =
  | "direct" | "indoor" | "cutting" | "division" | "transplant";

export type SeasonalPickEffort = "easy" | "moderate" | "advanced";

export type SeasonalPickSun =
  | "full_sun" | "part_sun" | "part_shade" | "full_shade";

export interface SeasonalPick {
  common_name: string;
  scientific_name: string;
  sow_method: SeasonalPickSowMethod;
  sow_window_start: string;
  sow_window_end: string;
  harvest_window: { start: string; end: string } | null;
  reasoning: string;
  effort: SeasonalPickEffort;
  sun: SeasonalPickSun[];
  edible: boolean;
  plant_id?: number | null;
  /** plant_library id when the pick matches an existing global library
   *  row. When present, the preview path can clone the library row's
   *  care guide instead of generating fresh data via Gemini. */
  plant_library_id?: number | null;
}

export interface SeasonalPicksResponse {
  week_iso: string;
  source: "ai" | "fallback";
  generated_at: string;
  picks: SeasonalPick[];
  from_cache: boolean;
}

/**
 * Client-side cache lives in localStorage now (was sessionStorage). The
 * server already caches per (home_id, ISO week), so the original
 * sessionStorage-only setup paid the round-trip + Wikipedia thumbnail
 * cost on every browser-close. localStorage keeps the cache for the
 * entire ISO week — open the app on Wednesday, you get Monday's data
 * instantly. The week-key check below drops stale entries automatically.
 *
 * Key shape: `rhozly:seasonalPicks:{homeId}` so a multi-home user
 * doesn't clobber across homes.
 */
const STORAGE_KEY_PREFIX = "rhozly:seasonalPicks";

interface StoredEntry {
  homeId: string;
  weekIso: string;
  payload: SeasonalPicksResponse;
}

const inFlight = new Map<string, Promise<SeasonalPicksResponse>>();

function storageKey(homeId: string): string {
  return `${STORAGE_KEY_PREFIX}:${homeId}`;
}

function readCache(homeId: string): StoredEntry | null {
  try {
    const raw = window.localStorage.getItem(storageKey(homeId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredEntry;
    if (parsed?.homeId === homeId && parsed?.payload) return parsed;
  } catch {
    /* malformed — fall through */
  }
  return null;
}

function writeCache(entry: StoredEntry): void {
  try {
    window.localStorage.setItem(storageKey(entry.homeId), JSON.stringify(entry));
  } catch {
    /* quota / private mode — non-fatal */
  }
}

function clearCache(homeId: string): void {
  try {
    window.localStorage.removeItem(storageKey(homeId));
  } catch {
    /* non-fatal */
  }
}

/**
 * Fetch this week's seasonal picks for a home.
 *
 * @param homeId    The home scope.
 * @param opts.forceRegen  Bypass both the client and server cache.
 */
export async function fetchSeasonalPicks(
  homeId: string,
  opts: { forceRegen?: boolean } = {},
): Promise<SeasonalPicksResponse> {
  const { forceRegen = false } = opts;

  if (!forceRegen) {
    const cached = readCache(homeId);
    if (cached) {
      // Stale-check: if the ISO week changed since we cached, drop it.
      const todayKey = currentClientWeekKey();
      if (cached.weekIso === todayKey) {
        return cached.payload;
      }
      clearCache(homeId);
    }

    const existing = inFlight.get(homeId);
    if (existing) return existing;
  }

  const promise = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke("plant-doctor", {
        body: { action: "seasonal_picks", homeId, forceRegen },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const payload = data as SeasonalPicksResponse;
      writeCache({ homeId, weekIso: payload.week_iso, payload });
      return payload;
    } catch (err) {
      Logger.error("fetchSeasonalPicks failed", err, { homeId });
      throw err;
    } finally {
      inFlight.delete(homeId);
    }
  })();
  inFlight.set(homeId, promise);
  return promise;
}

/**
 * Best-effort client-side ISO 8601 week key — matches the server's
 * `isoWeekKey()` from `_shared/seasonalPicks.ts`. Used only to detect
 * "the week rolled over while the tab was open" — the server is still
 * the source of truth for the cached row.
 */
export function currentClientWeekKey(date: Date = new Date()): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

export const SeasonalPicksService = {
  fetch: fetchSeasonalPicks,
  clearCache,
};
