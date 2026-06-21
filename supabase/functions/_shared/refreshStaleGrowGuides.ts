// Plant Grow Guides — stale-check batch processor (shared).
//
// Pure-ish function that walks one batch of `plant_grow_guides` rows whose
// `last_freshness_check_at` is NULL or older than 90 days, re-asks Gemini
// for a fresh guide, runs `diffGrowGuide`, and either:
//
//   - upserts the row with bumped `freshness_version` + new
//     `updated_fields` (when something changed), OR
//   - just resets `last_freshness_check_at` (when nothing changed).
//
// The Gemini caller is injected so unit tests can stub it without a
// network call. The edge function passes the real `callGeminiCascade`
// wrapper.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import type { GeminiUsage } from "./gemini.ts";
import { diffGrowGuide, type PlantGrowGuide } from "./growGuide.ts";
import { logAiUsage } from "./aiUsage.ts";

export type GeminiGrowGuideCall = (params: {
  plantId: number;
  commonName: string;
  scientificName: string | null;
  source: "manual" | "api" | "ai" | "verdantly";
  manualNotes: string | null;
  /** Existing guide — the cron threads this in so Gemini re-emits
   *  unchanged sections verbatim instead of paraphrasing. */
  existingGuide: PlantGrowGuide | null;
}) => Promise<{ guide: PlantGrowGuide; usage: GeminiUsage }>;

export interface RefreshGrowGuidesOptions {
  /** Hard cap on guides processed in one invocation. Default 25. */
  batchSize?: number;
  /** Milliseconds to sleep between Gemini calls. Default 1000. Set to 0 in tests. */
  sleepMs?: number;
  /** Now-source for testability. Default `() => new Date()`. */
  now?: () => Date;
  /** How old `last_freshness_check_at` must be to count as stale. Default 90 days. */
  staleDays?: number;
}

export interface RefreshGrowGuidesSummary {
  examined: number;
  changed: number;
  unchanged: number;
  errors: number;
  errorDetails: { plant_id: number; message: string }[];
}

interface PlantJoinRow {
  common_name: string | null;
  scientific_name: unknown;
  source: string;
  data: unknown;
}

interface CandidateRow {
  plant_id: number;
  guide_data: unknown;
  freshness_version: number | null;
  last_freshness_check_at: string | null;
  // PostgREST returns joined rows as an array; we read [0].
  plants: PlantJoinRow[] | PlantJoinRow | null;
}

function unwrapPlant(plants: CandidateRow["plants"]): PlantJoinRow | null {
  if (!plants) return null;
  if (Array.isArray(plants)) return plants[0] ?? null;
  return plants;
}

const DEFAULT_BATCH = 25;
const DEFAULT_SLEEP_MS = 1000;
const DEFAULT_STALE_DAYS = 90;

function extractScientificName(value: unknown): string | null {
  if (Array.isArray(value) && value.length > 0) {
    const first = value[0];
    if (typeof first === "string" && first.trim()) return first.trim();
  }
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

function extractManualNotes(source: string, data: unknown): string | null {
  if (source !== "manual" || !data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const candidate = d.description ?? d.notes ?? d.manual_notes ?? null;
  if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  return null;
}

export async function refreshStaleGrowGuides(
  db: SupabaseClient,
  geminiCall: GeminiGrowGuideCall,
  options: RefreshGrowGuidesOptions = {},
): Promise<RefreshGrowGuidesSummary> {
  const batchSize = options.batchSize ?? DEFAULT_BATCH;
  const sleepMs = options.sleepMs ?? DEFAULT_SLEEP_MS;
  const staleDays = options.staleDays ?? DEFAULT_STALE_DAYS;
  const now = options.now ?? (() => new Date());

  const cutoffIso = new Date(now().getTime() - staleDays * 24 * 60 * 60 * 1000).toISOString();

  // Walk grow guides whose last check is NULL or older than 90 days.
  // Join to plants for the prompt-building inputs (name, source, notes).
  const { data: candidatesRaw, error: fetchErr } = await db
    .from("plant_grow_guides")
    .select(
      "plant_id, guide_data, freshness_version, last_freshness_check_at, plants(common_name, scientific_name, source, data)",
    )
    .or(`last_freshness_check_at.is.null,last_freshness_check_at.lt.${cutoffIso}`)
    .order("last_freshness_check_at", { ascending: true, nullsFirst: true })
    .limit(batchSize);

  if (fetchErr) {
    throw new Error(`grow-guide candidate fetch failed: ${fetchErr.message}`);
  }

  const candidates = (candidatesRaw ?? []) as CandidateRow[];
  const summary: RefreshGrowGuidesSummary = {
    examined: 0,
    changed: 0,
    unchanged: 0,
    errors: 0,
    errorDetails: [],
  };

  for (let i = 0; i < candidates.length; i++) {
    const row = candidates[i];
    summary.examined++;
    const plantInfo = unwrapPlant(row.plants);
    if (!plantInfo) {
      // Parent plant row was deleted but the guide hadn't been cascaded
      // yet, OR a join glitch. Skip safely.
      summary.errors++;
      summary.errorDetails.push({ plant_id: row.plant_id, message: "missing parent plant row" });
      continue;
    }

    try {
      const geminiParams = {
        plantId: row.plant_id,
        commonName: plantInfo.common_name ?? "Unknown plant",
        scientificName: extractScientificName(plantInfo.scientific_name),
        source: plantInfo.source as "manual" | "api" | "ai" | "verdantly",
        manualNotes: extractManualNotes(plantInfo.source, plantInfo.data),
        existingGuide: (row.guide_data ?? null) as PlantGrowGuide | null,
      };
      const { guide: newGuide, usage } = await geminiCall(geminiParams);

      const growGuideContext = JSON.stringify({
        commonName: geminiParams.commonName,
        scientificName: geminiParams.scientificName,
        source: geminiParams.source,
        manualNotes: geminiParams.manualNotes,
      });
      await logAiUsage(db, {
        homeId: null,
        userId: null,
        functionName: "refresh-stale-grow-guides",
        action: "regenerate",
        usage,
        contextBlock: growGuideContext,
        prompt: growGuideContext,
        rawResult: newGuide,
      });

      const previousGuide = (row.guide_data ?? null) as PlantGrowGuide | null;
      const changedCategories = diffGrowGuide(previousGuide, newGuide);

      const newFreshnessVersion =
        changedCategories.length > 0
          ? (row.freshness_version ?? 1) + 1
          : row.freshness_version ?? 1;

      const updatePayload = changedCategories.length > 0
        ? {
            guide_data: newGuide,
            freshness_version: newFreshnessVersion,
            last_generated_at: now().toISOString(),
            last_freshness_check_at: now().toISOString(),
            updated_fields: changedCategories,
          }
        : {
            // No content change — just stamp the check timestamp.
            last_freshness_check_at: now().toISOString(),
          };

      const { error: updateErr } = await db
        .from("plant_grow_guides")
        .update(updatePayload)
        .eq("plant_id", row.plant_id);

      if (updateErr) throw new Error(updateErr.message);

      if (changedCategories.length > 0) summary.changed++;
      else summary.unchanged++;
    } catch (err: unknown) {
      summary.errors++;
      const message = err instanceof Error ? err.message : String(err);
      summary.errorDetails.push({ plant_id: row.plant_id, message });
    }

    // Pace the Gemini calls a touch to avoid rate-limit hits.
    if (i < candidates.length - 1 && sleepMs > 0) {
      await new Promise((res) => setTimeout(res, sleepMs));
    }
  }

  return summary;
}
