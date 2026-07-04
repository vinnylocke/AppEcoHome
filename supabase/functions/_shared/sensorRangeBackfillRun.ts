// Shared orchestrator for filling missing plant soil ranges (moisture / EC /
// soil-temp). Used by BOTH the daily `backfill-plant-sensor-ranges` cron and
// the admin-triggered `seed-plant-sensor-ranges` run, so there's one
// implementation of "find rows missing ranges → generate → fill only the
// NULLs". The pure selection/patch logic lives in `sensorRangeBackfill.ts`;
// this adds the DB + Gemini I/O and an optional per-plant progress callback.

import { callGeminiCascade, toMessages, type GeminiUsage } from "./gemini.ts";
import { logAiUsage } from "./aiUsage.ts";
import { buildPlantCareRangePrompt, parseCareRangeResponse, CARE_RANGE_SCHEMA } from "./plantCareRangeGen.ts";
import { needsRangeBackfill, buildRangePatch, SENSOR_RANGE_FIELDS } from "./sensorRangeBackfill.ts";

// The supabase-js client is passed in typed loosely (matching the repo's edge
// convention) so callers with a fully-typed `public` schema client still fit,
// and so shared helpers like logAiUsage that expect the concrete client accept it.
// deno-lint-ignore no-explicit-any
type Db = any;

const RANGE_COLS = SENSOR_RANGE_FIELDS.join(", ");
// PostgREST OR filter: "any of the six columns is null".
const ANY_NULL = SENSOR_RANGE_FIELDS.map((f) => `${f}.is.null`).join(",");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Per-plant outcome, reported to `onProgress` so a caller (the admin run) can
 *  stream counts + token/cost into a `plant_library_runs` row. Exactly one of
 *  filled / skipped / failed is 1. */
export interface BackfillDelta {
  filled: number;
  skipped: number;
  failed: number;
  usage: GeminiUsage | null;
}

export interface BackfillSummary {
  scanned: number;
  filled: number;
  skipped: number;
  failed: number;
  /** Highest plant id processed this pass — the cursor for a chained continuation. */
  lastId: number | null;
}

export interface RunSensorRangeBackfillOpts {
  table: "plant_library" | "plants";
  limit: number;
  /** AI-usage attribution: cron = {null,null}; admin = {adminUserId,null}. */
  aiAttribution: { userId: string | null; homeId: string | null };
  action?: string;
  onProgress?: (delta: BackfillDelta) => Promise<void>;
  sleepMs?: number;
  /** Only consider rows with id > afterId (cursor for chained continuations —
   *  guarantees forward progress so a persistently-failing row can't be
   *  re-selected forever). */
  afterId?: number | null;
  /** Stop the loop once this many ms have elapsed, so a single invocation stays
   *  under the edge-function wall-clock limit and can chain the rest. */
  maxRunMs?: number;
}

// Cap how many rows we pull per call regardless of `limit` — the time budget +
// chaining handle the rest, and this keeps the in-memory row set small.
const FETCH_CAP = 250;

/**
 * Fill missing soil ranges for up to `limit` rows of `table` that have at least
 * one NULL range column. For the global `plants` catalogue we restrict to
 * home_id IS NULL + api/ai/verdantly sources. Fills ONLY the NULL columns
 * (never clobbers existing / verified values).
 */
export async function runSensorRangeBackfill(
  db: Db,
  apiKey: string,
  opts: RunSensorRangeBackfillOpts,
): Promise<BackfillSummary> {
  const { table, limit, aiAttribution, onProgress, afterId, maxRunMs } = opts;
  const sleepMs = opts.sleepMs ?? 500;
  const action = opts.action ?? "care_range_backfill";

  let query = db
    .from(table)
    .select(`id, common_name, scientific_name, ${RANGE_COLS}`)
    .or(ANY_NULL)
    .order("id", { ascending: true })
    .limit(Math.min(FETCH_CAP, Math.max(0, limit)));
  if (afterId != null) query = query.gt("id", afterId);
  if (table === "plants") {
    query = query.is("home_id", null).in("source", ["api", "ai", "verdantly"]);
  }
  const { data: rows, error: queryError } = await query;
  // supabase-js doesn't throw on query errors — surface it so the run is marked
  // failed with a real reason instead of silently reporting zero rows.
  if (queryError) throw new Error(`sensor-range query failed: ${queryError.message}`);

  const startedAt = Date.now();
  let scanned = 0, filled = 0, skipped = 0, failed = 0, lastId: number | null = null;

  for (const row of (rows ?? []) as Array<Record<string, unknown>>) {
    if (maxRunMs != null && Date.now() - startedAt > maxRunMs) break;
    if (!needsRangeBackfill(row)) continue;
    scanned++;
    lastId = row.id as number;
    const delta: BackfillDelta = { filled: 0, skipped: 0, failed: 0, usage: null };
    try {
      const prompt = buildPlantCareRangePrompt({
        common_name: row.common_name as string,
        scientific_name: row.scientific_name,
      });
      const { text, usage } = await callGeminiCascade(
        apiKey, "plant-care-ranges", toMessages([prompt]),
        { responseSchema: CARE_RANGE_SCHEMA, responseMimeType: "application/json", temperature: 0.2, maxOutputTokens: 512, logContext: { table, id: row.id } },
      );
      delta.usage = usage;
      await logAiUsage(db, {
        userId: aiAttribution.userId, homeId: aiAttribution.homeId,
        functionName: "plant-care-ranges", action, usage,
        contextBlock: prompt, prompt, rawResult: text,
      });
      const gen = parseCareRangeResponse(text);
      const patch = buildRangePatch(row, gen ?? undefined);
      if (Object.keys(patch).length > 0) {
        const { error } = await db.from(table).update(patch).eq("id", row.id as number);
        if (error) { failed++; delta.failed = 1; }
        else { filled++; delta.filled = 1; }
      } else {
        // Nothing usable came back — count as skipped, not failed.
        skipped++; delta.skipped = 1;
      }
    } catch {
      failed++; delta.failed = 1;
    }
    if (onProgress) await onProgress(delta);
    await sleep(sleepMs);
  }

  return { scanned, filled, skipped, failed, lastId };
}
