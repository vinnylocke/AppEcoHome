// AI Plant Overhaul Wave 4 — stale-check batch processor (shared)
//
// Pure-ish function that walks one batch of global AI plants whose
// `last_freshness_check_at` is NULL or older than 90 days, re-asks Gemini for
// a fresh care guide, runs `diffCareGuide`, and either:
//
//   - writes a `plant_care_revisions` row + bumps `freshness_version` +
//     stamps `updated_care_fields` (when something changed), OR
//   - just resets `last_freshness_check_at` (when nothing changed).
//
// The Gemini caller is injected so unit tests can stub it without a network
// call. The edge function passes the real `callGeminiCascade` wrapper.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import type { GeminiUsage } from "./gemini.ts";
import { diffCareGuide, USER_VISIBLE_CARE_FIELDS } from "./aiPlantCatalogue.ts";
import { logAiUsage } from "./aiUsage.ts";

export type GeminiCareGuideCall = (
  commonName: string,
) => Promise<{ plantData: { plantData: unknown } | Record<string, unknown>; usage: GeminiUsage }>;

export type RefreshOptions = {
  /** Hard cap on plants processed in one invocation. Default 25. */
  batchSize?: number;
  /** Milliseconds to sleep between Gemini calls. Default 1000. Set to 0 in tests. */
  sleepMs?: number;
  /** Now-source for testability. Default `() => new Date()`. */
  now?: () => Date;
  /** How old `last_freshness_check_at` must be to count as stale. Default 90 days. */
  staleDays?: number;
};

export type RefreshSummary = {
  examined: number;
  changed: number;
  unchanged: number;
  errors: number;
  errorDetails: { plant_id: number; message: string }[];
};

type CandidateRow = {
  id: number;
  common_name: string;
  scientific_name: unknown;
  care_guide_data: unknown;
  freshness_version: number | null;
  last_freshness_check_at: string | null;
};

const DEFAULT_BATCH = 25;
const DEFAULT_SLEEP_MS = 1000;
const DEFAULT_STALE_DAYS = 90;

export async function refreshStaleAiPlants(
  db: SupabaseClient,
  geminiCall: GeminiCareGuideCall,
  options: RefreshOptions = {},
): Promise<RefreshSummary> {
  const batchSize = options.batchSize ?? DEFAULT_BATCH;
  const sleepMs = options.sleepMs ?? DEFAULT_SLEEP_MS;
  const staleDays = options.staleDays ?? DEFAULT_STALE_DAYS;
  const now = options.now ?? (() => new Date());

  const cutoffIso = new Date(now().getTime() - staleDays * 24 * 60 * 60 * 1000).toISOString();

  // Filters in this order are load-bearing:
  //   - source=ai + home_id IS NULL → globals only (forks skipped by construction)
  //   - last_freshness_check_at NULL OR < cutoff → stale rows only
  //   - order by last_freshness_check_at ASC NULLS FIRST → never-checked rows
  //     win, then oldest-checked. Pairs with the partial index
  //     `plants_ai_global_stale_idx` from Wave 1.
  const { data: candidatesRaw, error: fetchErr } = await db
    .from("plants")
    .select("id, common_name, scientific_name, care_guide_data, freshness_version, last_freshness_check_at")
    .eq("source", "ai")
    .is("home_id", null)
    .or(`last_freshness_check_at.is.null,last_freshness_check_at.lt.${cutoffIso}`)
    .order("last_freshness_check_at", { ascending: true, nullsFirst: true })
    .limit(batchSize);

  if (fetchErr) {
    throw new Error(`candidate fetch failed: ${fetchErr.message}`);
  }

  const candidates = (candidatesRaw ?? []) as CandidateRow[];
  const summary: RefreshSummary = {
    examined: 0,
    changed: 0,
    unchanged: 0,
    errors: 0,
    errorDetails: [],
  };

  for (let i = 0; i < candidates.length; i++) {
    const plant = candidates[i];
    try {
      const { plantData: rawNewData, usage } = await geminiCall(plant.common_name);
      // Normalise: callers can return either `{ plantData: {...} }` or the
      // inner `{...}` directly. We want the wrapped form on disk.
      const newData = (rawNewData as { plantData?: unknown }).plantData
        ? rawNewData
        : { plantData: rawNewData };

      const diff = diffCareGuide(plant.care_guide_data, newData);
      const nowIso = now().toISOString();

      if (diff.changed) {
        const newVersion = (plant.freshness_version ?? 1) + 1;
        // Audit row first — if this throws, the plants row stays at the old
        // version + old check timestamp, so the next run will re-process.
        const { error: revErr } = await db.from("plant_care_revisions").insert({
          plant_id: plant.id,
          version: newVersion,
          source: "stale_check",
          care_guide_data: newData,
          changed_fields: diff.fieldNames,
          diff_summary: diff.perField,
          triggered_by: null,
        });
        if (revErr) throw new Error(`revision insert failed: ${revErr.message}`);

        // Also sync the user-visible top-level columns on the global so that
        // when manual-refresh-ai-plant later copies the global's values down
        // to a home row, there ARE authoritative values to copy. Previously
        // the cron only updated `care_guide_data` jsonb — the global's
        // sunlight/watering/etc top-level columns stayed at their original
        // add-time values forever, and the user's home row never received
        // any changed data even when the chip said "N fields updated".
        const newPlantData = (newData as { plantData?: Record<string, unknown> }).plantData ?? {};
        const topLevelPatch: Record<string, unknown> = {};
        for (const f of USER_VISIBLE_CARE_FIELDS) {
          if (newPlantData[f] !== undefined) topLevelPatch[f] = newPlantData[f];
        }

        const { error: updErr } = await db
          .from("plants")
          .update({
            care_guide_data: newData,
            updated_care_fields: diff.fieldNames,
            freshness_version: newVersion,
            last_freshness_check_at: nowIso,
            last_care_generated_at: nowIso,
            ...topLevelPatch,
          })
          .eq("id", plant.id);
        if (updErr) throw new Error(`plants update failed: ${updErr.message}`);

        summary.changed += 1;
      } else {
        // No diff — just reset the freshness clock so this row drops out of
        // the cron's selection window for the next ${staleDays} days.
        const { error: updErr } = await db
          .from("plants")
          .update({ last_freshness_check_at: nowIso })
          .eq("id", plant.id);
        if (updErr) throw new Error(`plants update failed: ${updErr.message}`);

        summary.unchanged += 1;
      }

      // Log system-attributed AI usage (no user, no home).
      await logAiUsage(db, {
        homeId: null,
        userId: null,
        functionName: "refresh-stale-ai-plants",
        action: "stale_check",
        usage,
      });

      summary.examined += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      summary.errors += 1;
      summary.examined += 1;
      summary.errorDetails.push({ plant_id: plant.id, message });
      // Intentionally do NOT update last_freshness_check_at on error — the next
      // run will pick the row up again. Keeps the cron self-healing.
    }

    // Rate-limit between Gemini calls. Skip after the last plant.
    if (sleepMs > 0 && i < candidates.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, sleepMs));
    }
  }

  return summary;
}
