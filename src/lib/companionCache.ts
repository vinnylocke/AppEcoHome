// In-memory promise cache for the `companion-planting` edge function.
//
// Why this exists: `companion-planting` doesn't have a server-side cache,
// so naive callers fire a fresh Gemini call every time the Companions tab
// mounts. The Library wants to pre-warm the companions data the moment
// the plant page opens (before the user even taps the Companions tab),
// but if both the prewarm AND the tab's own mount-fetch each fired a
// separate Gemini call we'd burn 2× quota per plant viewed.
//
// This module memoises the in-flight promise per `(source, verdantly_id,
// plant_name, ai_enabled)` tuple — the second caller awaits the first
// caller's promise instead of firing a duplicate request. The cache is
// lifetime-bounded to the page session (cleared on full reload).

import { supabase } from "./supabase";

export interface CompanionEntry {
  id: string | null;
  name: string;
  scientificName?: string | null;
  reason?: string | null;
}

export interface CompanionResult {
  beneficial: CompanionEntry[];
  harmful: CompanionEntry[];
  neutral: CompanionEntry[];
  /** Errors from the edge function bubble back so callers can branch the UI. */
  error?: string;
}

interface CompanionRequest {
  source: string;
  verdantlyId: string | null;
  plantName: string;
  aiEnabled: boolean;
}

function cacheKey(req: CompanionRequest): string {
  return `${req.source}::${req.verdantlyId ?? ""}::${req.plantName.trim().toLowerCase()}::${req.aiEnabled ? 1 : 0}`;
}

const cache = new Map<string, Promise<CompanionResult>>();

/**
 * Fetch (or replay) the companions data for a plant. Concurrent callers
 * with the same key share a single network request.
 *
 * The promise is cached even on failure so a flaky network doesn't make
 * us burn quota retrying the same call from every mount — call
 * `invalidateCompanions(req)` if the caller wants to force a refresh.
 */
export function fetchCompanions(req: CompanionRequest): Promise<CompanionResult> {
  const key = cacheKey(req);
  const existing = cache.get(key);
  if (existing) return existing;

  const promise = supabase.functions
    .invoke("companion-planting", {
      body: {
        source: req.source,
        verdantly_id: req.verdantlyId,
        plant_name: req.plantName,
        ai_enabled: req.aiEnabled,
      },
    })
    .then(({ data, error }): CompanionResult => {
      if (error) throw new Error(error.message);
      if (data?.error) {
        return { beneficial: [], harmful: [], neutral: [], error: data.error };
      }
      return {
        beneficial: data?.beneficial ?? [],
        harmful: data?.harmful ?? [],
        neutral: data?.neutral ?? [],
      };
    });

  cache.set(key, promise);
  // Drop the entry on rejection so a retry actually retries (but only
  // once a tick later, so concurrent callers all see the same error).
  promise.catch(() => {
    queueMicrotask(() => {
      if (cache.get(key) === promise) cache.delete(key);
    });
  });
  return promise;
}

export function invalidateCompanions(req: CompanionRequest): void {
  cache.delete(cacheKey(req));
}
