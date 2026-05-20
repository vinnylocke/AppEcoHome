// Returns a matcher function for plant search results to tell the user
// whether they already have that plant in their shed.
//
// Match rules per source:
//   - Perenual:  same home_id AND same perenual_id
//   - Verdantly: same home_id AND same verdantly_id
//   - AI:        same home_id AND source='ai' AND common_name ILIKE result
//                (no stable provider id for AI plants — common name is the
//                best signal)
//
// Loads the home's plants once per hook lifetime, indexes them by the three
// keys, then returns a `findMatch(result)` helper for the modal to call per
// rendered row. No per-row queries.

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { Logger } from "../lib/errorHandler";

interface ShedPlantRow {
  id: number;
  common_name: string;
  source: string | null;
  perenual_id: string | null;
  verdantly_id: string | null;
}

export interface ShedSearchMatch {
  /** The home plant id that matches — useful if the caller wants to deep-link. */
  homePlantId: number;
}

/**
 * Inputs for `findMatch`. Mirrors the union of fields the three search modals
 * already carry on their result rows.
 */
export interface SearchResultShape {
  source?: string | null;     // "api" | "verdantly" | "ai" | undefined
  _provider?: string | null;  // same possible values; alternate field name
  perenual_id?: number | string | null;
  verdantly_id?: number | string | null;
  /** For AI results without a provider id, the common name is what we match on. */
  common_name?: string | null;
}

export function useShedPlantMatcher(homeId: string | null | undefined) {
  const [byPerenualId, setByPerenualId] = useState<Map<string, ShedPlantRow>>(new Map());
  const [byVerdantlyId, setByVerdantlyId] = useState<Map<string, ShedPlantRow>>(new Map());
  const [byAiName, setByAiName] = useState<Map<string, ShedPlantRow>>(new Map());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!homeId) {
      setByPerenualId(new Map());
      setByVerdantlyId(new Map());
      setByAiName(new Map());
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("plants")
          .select("id, common_name, source, perenual_id, verdantly_id")
          .eq("home_id", homeId)
          .eq("is_archived", false);
        if (cancelled) return;
        if (error) {
          Logger.error("useShedPlantMatcher fetch failed", error);
          return;
        }
        const perenual = new Map<string, ShedPlantRow>();
        const verdantly = new Map<string, ShedPlantRow>();
        const ai = new Map<string, ShedPlantRow>();
        for (const row of (data ?? []) as ShedPlantRow[]) {
          if (row.perenual_id) perenual.set(String(row.perenual_id), row);
          if (row.verdantly_id) verdantly.set(String(row.verdantly_id), row);
          if (row.source === "ai" && row.common_name) {
            ai.set(row.common_name.trim().toLowerCase(), row);
          }
        }
        setByPerenualId(perenual);
        setByVerdantlyId(verdantly);
        setByAiName(ai);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [homeId]);

  function findMatch(result: SearchResultShape): ShedSearchMatch | null {
    const provider = result.source ?? result._provider ?? null;
    // Perenual ("api" or "perenual") → match by perenual_id
    if ((provider === "api" || provider === "perenual") && result.perenual_id != null) {
      const hit = byPerenualId.get(String(result.perenual_id));
      return hit ? { homePlantId: hit.id } : null;
    }
    if (provider === "verdantly" && result.verdantly_id != null) {
      const hit = byVerdantlyId.get(String(result.verdantly_id));
      return hit ? { homePlantId: hit.id } : null;
    }
    if (provider === "ai" && result.common_name) {
      const key = result.common_name.trim().toLowerCase();
      const hit = byAiName.get(key);
      return hit ? { homePlantId: hit.id } : null;
    }
    return null;
  }

  return { findMatch, loading };
}
