// AI Plant Overhaul Wave 5 — freshness hook
//
// Given a list of plant rows from the user's Shed, resolves each row to its
// "freshness state": is there a new catalogue version the user hasn't ack'd?
//
// Resolution rules:
//   - Plant rows with `source !== "ai"` → null. (Perenual / Verdantly / manual
//     never get the chip.)
//   - Shallow forks (`forked_from_plant_id != null` AND `overridden_fields`
//     empty) → resolve via the global parent.
//   - Deep forks (`overridden_fields.length > 0`) → null. The user has opted
//     out of the auto-updating catalogue.
//   - Global rows (`source === "ai"` AND `forked_from_plant_id == null`) →
//     resolve against themselves.
//
// Mark-as-reviewed always writes a `user_plant_ack` row keyed by the GLOBAL
// plant_id (not the home-scoped row's id), so multiple homes with shallow
// forks of the same global share the same ack semantics.

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { Logger } from "../lib/errorHandler";

type PlantRow = {
  id: number;
  source: string | null;
  /**
   * NULL → row is the global catalogue entry (pure global).
   * Non-NULL → row is home-scoped (shallow fork, deep fork, or orphan).
   * Optional so non-AI callers don't have to plumb it.
   */
  home_id?: string | null;
  forked_from_plant_id: number | null;
  overridden_fields: string[] | null;
};

export interface PlantFreshness {
  /** Canonical AI plant id — equals `plant.id` for globals, `forked_from_plant_id` for shallow forks. */
  global_plant_id: number;
  freshness_version: number;
  seen_version: number;
  updated_care_fields: string[];
  last_care_generated_at: string | null;
  has_update: boolean;
  acknowledge: () => Promise<void>;
}

export interface UseAiPlantFreshnessResult {
  /** Sparse map keyed by the **input row id** (not the global). `null` = not eligible (non-AI, deep fork, or unresolvable). */
  byPlantId: Record<number, PlantFreshness | null>;
  loading: boolean;
  refresh: () => void;
}

/**
 * Decide whether a plant row should look up freshness via itself or via its
 * global parent. Returns the global plant id to query, or null when the row
 * is not eligible for the freshness chip.
 *
 *   - Non-AI row                                            → null
 *   - Deep fork (overridden_fields non-empty)               → null (user opted out)
 *   - Shallow fork (forked_from_plant_id set)               → its parent
 *   - True global (home_id NULL, no forked_from)            → itself
 *   - Orphan home-scoped AI (home_id != null, no parent)    → null
 *
 * The orphan case appears when an AI plant was added before the Wave 2
 * catalogue-write code was active, or when the catalogue insert race-recovery
 * failed silently. Treating them as ineligible keeps the chip + Refresh-now
 * button hidden, which is correct — we have no global to compare against or
 * refresh.
 */
function resolveGlobalId(p: PlantRow): number | null {
  if (p.source !== "ai") return null;
  const overrides = p.overridden_fields ?? [];
  if (overrides.length > 0) return null;
  if (p.forked_from_plant_id != null) return p.forked_from_plant_id;
  if (p.home_id == null) return p.id;
  return null;
}

export function useAiPlantFreshness(
  plants: PlantRow[],
): UseAiPlantFreshnessResult {
  const [byPlantId, setByPlantId] = useState<Record<number, PlantFreshness | null>>({});
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  // Build a stable input fingerprint so we don't re-fetch when the caller's
  // plant array reference changes but the resolution targets are identical.
  const fingerprint = useMemo(
    () =>
      plants
        .map((p) =>
          `${p.id}:${p.source ?? ""}:${p.home_id ?? ""}:${p.forked_from_plant_id ?? ""}:${(p.overridden_fields ?? []).length}`,
        )
        .sort()
        .join("|"),
    [plants],
  );

  const fetchFreshness = useCallback(async () => {
    if (plants.length === 0) {
      setByPlantId({});
      return;
    }

    setLoading(true);
    try {
      // Map each input row to (rowId → globalId | null).
      const rowToGlobal = new Map<number, number | null>();
      const globalIds = new Set<number>();
      for (const p of plants) {
        const g = resolveGlobalId(p);
        rowToGlobal.set(p.id, g);
        if (g != null) globalIds.add(g);
      }

      if (globalIds.size === 0) {
        const empty: Record<number, PlantFreshness | null> = {};
        for (const p of plants) empty[p.id] = null;
        setByPlantId(empty);
        return;
      }

      const globalIdsArray = [...globalIds];

      // Pull global rows + this user's ack rows in parallel.
      const [globalsResult, acksResult, userResult] = await Promise.all([
        supabase
          .from("plants")
          .select("id, freshness_version, updated_care_fields, last_care_generated_at")
          .in("id", globalIdsArray),
        supabase
          .from("user_plant_ack")
          .select("plant_id, seen_freshness_version")
          .in("plant_id", globalIdsArray),
        supabase.auth.getUser(),
      ]);

      const userId = userResult.data.user?.id ?? null;
      const globalsById = new Map<number, { freshness_version: number | null; updated_care_fields: string[] | null; last_care_generated_at: string | null }>();
      for (const row of globalsResult.data ?? []) {
        globalsById.set(row.id, {
          freshness_version: row.freshness_version,
          updated_care_fields: row.updated_care_fields,
          last_care_generated_at: row.last_care_generated_at,
        });
      }

      const ackByPlantId = new Map<number, number>();
      for (const row of acksResult.data ?? []) {
        ackByPlantId.set(row.plant_id, row.seen_freshness_version ?? 0);
      }

      const next: Record<number, PlantFreshness | null> = {};
      for (const p of plants) {
        const globalId = rowToGlobal.get(p.id) ?? null;
        if (globalId == null) {
          next[p.id] = null;
          continue;
        }
        const g = globalsById.get(globalId);
        if (!g) {
          // The forked_from_plant_id pointed at a row we couldn't fetch
          // (RLS / deleted). Treat as no-chip rather than crashing.
          next[p.id] = null;
          continue;
        }
        const freshnessVersion = g.freshness_version ?? 1;
        const seenVersion = ackByPlantId.get(globalId) ?? 0;
        const updatedFields = g.updated_care_fields ?? [];
        const hasUpdate = freshnessVersion > seenVersion;

        next[p.id] = {
          global_plant_id: globalId,
          freshness_version: freshnessVersion,
          seen_version: seenVersion,
          updated_care_fields: updatedFields,
          last_care_generated_at: g.last_care_generated_at,
          has_update: hasUpdate,
          acknowledge: async () => {
            if (!userId) {
              Logger.error("useAiPlantFreshness acknowledge skipped — no user", null);
              return;
            }
            const { error } = await supabase
              .from("user_plant_ack")
              .upsert(
                {
                  user_id: userId,
                  plant_id: globalId,
                  seen_freshness_version: freshnessVersion,
                  acked_at: new Date().toISOString(),
                },
                { onConflict: "user_id,plant_id" },
              );
            if (error) {
              Logger.error("useAiPlantFreshness acknowledge failed", error, { plantId: globalId });
              throw error;
            }
            // Optimistically clear has_update locally so the UI updates
            // without waiting for a refetch.
            setByPlantId((prev) => {
              const entry = prev[p.id];
              if (!entry) return prev;
              return {
                ...prev,
                [p.id]: { ...entry, seen_version: freshnessVersion, has_update: false },
              };
            });
          },
        };
      }
      setByPlantId(next);
    } catch (err) {
      Logger.error("useAiPlantFreshness fetch failed", err);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint, tick]);

  useEffect(() => {
    fetchFreshness();
  }, [fetchFreshness]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  return { byPlantId, loading, refresh };
}
