// Plant Library — poll pending Gemini Batch API submissions and
// process completed ones.
//
// Triggered every 5 minutes by pg_cron via pg_net.http_post (see
// 20260624002100_plant_library_batches.sql). Walks active rows in
// `plant_library_batches`, polls Gemini for each non-terminal batch,
// and — when a batch flips to JOB_STATE_SUCCEEDED — fetches the
// inline results, parses them, inserts plants into plant_library,
// creates a plant_library_runs row with full per-model + per-token
// breakdown (so the admin's existing expandable-row UI just works),
// and marks the batch row 'processed'.
//
// Defensive across the board: any per-batch failure logs to Sentry
// and leaves that batch in a recoverable state; the rest of the
// active batches still get polled.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { log, error as logError } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import {
  getGeminiBatchResults,
  getGeminiBatchStatus,
  type BatchResponseLine,
  type BatchState,
} from "../_shared/gemini.ts";
import { estimateGeminiCostUsd } from "../_shared/geminiCost.ts";
import {
  salvageTruncatedPlants,
  seedRowToColumnShape,
  type SeedRow,
} from "../_shared/plantSeedPrompt.ts";
import { computeSciKey } from "../_shared/plantNameSources.ts";

const FN = "poll-plant-library-batches";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ModelUsageSlot {
  prompt_tokens: number;
  candidates_tokens: number;
  cached_tokens: number;
  thoughts_tokens: number;
  cost_usd: number;
  call_count: number;
}

interface FailedInsert {
  common_name: string;
  scientific_name: string | null;
  error: string;
  at: string;
}

interface BatchRow {
  id: string;
  kind: "seed";
  triggered_by: string | null;
  count_requested: number;
  candidate_names: string[];
  model: string;
  gemini_batch_name: string | null;
  status: string;
}

/**
 * Map Gemini's `JOB_STATE_*` OR `BATCH_STATE_*` values to our
 * batches table status vocabulary. Normalizes on the SUFFIX so
 * both prefixes route identically — Google has been swapping
 * between the two depending on which API surface answered.
 * Unrecognised states fall through to 'pending' (keep polling) and
 * log so the next surprise prefix surfaces quickly.
 *
 * SUCCEEDED stays as 'succeeded' until we've actually processed
 * the results; only after the inserts+runs row land does the row
 * flip to 'processed'.
 */
function mapState(state: BatchState): string {
  const suffix = String(state ?? "").replace(/^(JOB|BATCH)_STATE_/, "");
  switch (suffix) {
    case "PENDING":   return "pending";
    case "RUNNING":   return "running";
    case "SUCCEEDED": return "succeeded";
    case "FAILED":    return "failed";
    case "CANCELLED": return "cancelled";
    case "EXPIRED":   return "failed";
    default:
      logError(FN, "unknown_gemini_state", { state, suffix });
      return "pending"; // keep in flight rather than incorrectly flipping terminal
  }
}

/**
 * Parse one batch response line. Tries JSON.parse first; falls
 * back to the salvage parser if Gemini hit its output cap mid-line.
 */
function parseBatchLine(text: string): SeedRow[] {
  try {
    const parsed = JSON.parse(text) as { plants: SeedRow[] };
    return Array.isArray(parsed.plants) ? parsed.plants : [];
  } catch {
    const salvaged = salvageTruncatedPlants(text);
    return salvaged?.plants ?? [];
  }
}

/**
 * After AI returns, drop any plant whose scientific_name_key
 * collides with an existing row. Same defence-in-depth as the
 * synchronous seeder uses.
 */
async function dropKeyColliders(
  db: any,
  plants: SeedRow[],
): Promise<{ surviving: SeedRow[]; preInsertSkipped: number }> {
  if (plants.length === 0) return { surviving: [], preInsertSkipped: 0 };
  const keys = plants
    .map((p) =>
      computeSciKey(
        Array.isArray(p.scientific_name) ? p.scientific_name[0] ?? null : null,
        p.common_name ?? "",
      ),
    )
    .filter(Boolean);
  if (keys.length === 0) return { surviving: plants, preInsertSkipped: 0 };

  const { data: existing } = await db
    .from("plant_library")
    .select("scientific_name_key")
    .in("scientific_name_key", keys);
  const knownKeys = new Set<string>(
    (existing ?? [])
      .map((r: { scientific_name_key: string }) => r.scientific_name_key)
      .filter(Boolean),
  );
  const surviving = plants.filter((p) => {
    const key = computeSciKey(
      Array.isArray(p.scientific_name) ? p.scientific_name[0] ?? null : null,
      p.common_name ?? "",
    );
    return !knownKeys.has(key);
  });
  return { surviving, preInsertSkipped: plants.length - surviving.length };
}

/**
 * Insert one batch row's worth of plants. Uses ON CONFLICT-aware
 * sequential inserts so unique-violation = silent skip (same as
 * the sync seeder); any other insert error is captured in the
 * failed_inserts log.
 */
async function insertPlants(
  db: any,
  plants: SeedRow[],
  runId: string,
): Promise<{
  inserted: number;
  skipped: number;
  failed: number;
  failedInserts: FailedInsert[];
}> {
  const stats = { inserted: 0, skipped: 0, failed: 0, failedInserts: [] as FailedInsert[] };
  for (const p of plants) {
    const row = seedRowToColumnShape(p, { seeded_by_run_id: runId });
    if (!row) {
      stats.failed += 1;
      continue;
    }
    const { data, error } = await db
      .from("plant_library")
      .insert(row, { count: "exact" })
      .select("id");
    if (error) {
      if (error.code === "23505") {
        stats.skipped += 1;
      } else {
        stats.failed += 1;
        const commonName = String(row.common_name ?? "(unknown)");
        const sciArr = row.scientific_name;
        const scientificName =
          Array.isArray(sciArr) && typeof sciArr[0] === "string" ? sciArr[0] : null;
        stats.failedInserts.push({
          common_name: commonName,
          scientific_name: scientificName,
          error: String(error.message ?? "unknown").slice(0, 500),
          at: new Date().toISOString(),
        });
      }
    } else if (data && data.length > 0) {
      stats.inserted += 1;
    } else {
      stats.skipped += 1;
    }
  }
  return stats;
}

/**
 * Process a SUCCEEDED batch: pull results, parse each line, insert
 * plants, create a plant_library_runs row with the per-model
 * breakdown (cost computed using the batch 50% discount), mark the
 * batch row 'processed'.
 */
async function processSucceededBatch(
  db: any,
  apiKey: string,
  batch: BatchRow,
): Promise<void> {
  if (!batch.gemini_batch_name) {
    throw new Error("succeeded batch row has no gemini_batch_name");
  }
  // Atomic claim — set processed_at to now ONLY if it's still null.
  // Wins exactly one of N concurrent attempts to process the same
  // batch (cron tick + Inspect + Reprocess could all race). Anyone
  // else gets 0 affected rows back and bails cleanly. Reprocess
  // clears processed_at first, so it re-claims on its next pass.
  const claimAt = new Date().toISOString();
  const { data: claimed } = await db
    .from("plant_library_batches")
    .update({ processed_at: claimAt })
    .eq("id", batch.id)
    .is("processed_at", null)
    .select("id");
  if (!claimed || claimed.length === 0) {
    log(FN, "process_already_claimed_skip", { batch_id: batch.id });
    return;
  }

  log(FN, "process_start", { batch_id: batch.id, gemini_batch_name: batch.gemini_batch_name });

  const lines = await getGeminiBatchResults(apiKey, batch.gemini_batch_name);
  // Diagnostic: if we got zero lines from a SUCCEEDED batch, the
  // response shape probably changed under us again. Loud log so the
  // next surprise surfaces in seconds rather than after-the-fact.
  if (lines.length === 0) {
    logError(FN, "zero_lines_extracted", {
      batch_id: batch.id,
      gemini_batch_name: batch.gemini_batch_name,
      hint: "response shape may have changed — verify nesting path in getGeminiBatchResults",
    });
  }

  // Create the runs row up-front so we can attribute inserts to it.
  const { data: runRow, error: runErr } = await db
    .from("plant_library_runs")
    .insert({
      kind: "seed",
      triggered_by: batch.triggered_by,
      count_requested: batch.count_requested,
      status: "running",
      last_heartbeat_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (runErr || !runRow) throw runErr ?? new Error("failed to create runs row");
  const runId: string = runRow.id;

  let totalInserted = 0;
  let totalSkipped = 0;
  let totalFailed = 0;
  let totalPromptTokens = 0;
  let totalCandidatesTokens = 0;
  let totalCachedTokens = 0;
  let totalThoughtsTokens = 0;
  let totalTokens = 0;
  let totalCostUsd = 0;
  const failedInsertsAll: FailedInsert[] = [];
  const modelUsage: Record<string, ModelUsageSlot> = {};

  for (const line of lines) {
    if (line.error || !line.text) {
      // Line-level failure — record as a batch-style failed insert
      // entry so the admin sees the reason.
      failedInsertsAll.push({
        common_name: `(batch line ${line.key})`,
        scientific_name: null,
        error: String(line.error ?? "no response text").slice(0, 500),
        at: new Date().toISOString(),
      });
      // Estimate failed plant count from the line key shape — each
      // line was a group of up to SEED_PROMPT_BATCH_SIZE plants.
      totalFailed += 10;
      continue;
    }

    // Tokens + cost for this line — batch 50% discount.
    if (line.usage) {
      const lineCost = estimateGeminiCostUsd(
        batch.model,
        {
          promptTokenCount: line.usage.promptTokenCount,
          candidatesTokenCount: line.usage.candidatesTokenCount,
          cachedContentTokenCount: line.usage.cachedContentTokenCount,
          thoughtsTokenCount: line.usage.thoughtsTokenCount,
        },
        { batch: true },
      );
      totalPromptTokens     += line.usage.promptTokenCount;
      totalCandidatesTokens += line.usage.candidatesTokenCount;
      totalCachedTokens     += line.usage.cachedContentTokenCount;
      totalThoughtsTokens   += line.usage.thoughtsTokenCount;
      totalTokens           += line.usage.totalTokenCount;
      totalCostUsd          += lineCost;
      const slot = modelUsage[batch.model] ?? {
        prompt_tokens: 0, candidates_tokens: 0, cached_tokens: 0,
        thoughts_tokens: 0, cost_usd: 0, call_count: 0,
      };
      slot.prompt_tokens     += line.usage.promptTokenCount;
      slot.candidates_tokens += line.usage.candidatesTokenCount;
      slot.cached_tokens     += line.usage.cachedContentTokenCount;
      slot.thoughts_tokens   += line.usage.thoughtsTokenCount;
      slot.cost_usd          += lineCost;
      slot.call_count        += 1;
      modelUsage[batch.model] = slot;
    }

    const aiPlants = parseBatchLine(line.text);
    const { surviving, preInsertSkipped } = await dropKeyColliders(db, aiPlants);
    totalSkipped += preInsertSkipped;

    const insertStats = await insertPlants(db, surviving, runId);
    totalInserted += insertStats.inserted;
    totalSkipped  += insertStats.skipped;
    totalFailed   += insertStats.failed;
    failedInsertsAll.push(...insertStats.failedInserts);
  }

  // Determine final status — same rule as the synchronous flow.
  const finalStatus =
    totalFailed > 0 && totalInserted === 0
      ? "failed"
      : totalFailed > 0
      ? "partial"
      : "succeeded";

  await db
    .from("plant_library_runs")
    .update({
      count_inserted: totalInserted,
      count_skipped: totalSkipped,
      count_failed: totalFailed,
      total_prompt_tokens: totalPromptTokens,
      total_candidates_tokens: totalCandidatesTokens,
      total_cached_tokens: totalCachedTokens,
      total_thoughts_tokens: totalThoughtsTokens,
      total_tokens: totalTokens,
      total_cost_usd: totalCostUsd,
      model_usage: modelUsage,
      failed_inserts: failedInsertsAll.slice(0, 200),
      status: finalStatus,
      finished_at: new Date().toISOString(),
      last_heartbeat_at: new Date().toISOString(),
    })
    .eq("id", runId);

  await db
    .from("plant_library_batches")
    .update({
      status: "processed",
      processed_at: new Date().toISOString(),
      result_run_id: runId,
    })
    .eq("id", batch.id);

  log(FN, "process_succeeded", {
    batch_id: batch.id,
    run_id: runId,
    inserted: totalInserted,
    skipped: totalSkipped,
    failed: totalFailed,
    total_cost_usd: totalCostUsd,
  });
}

/**
 * Walk one batch row: poll Gemini, update local status, and if the
 * batch is SUCCEEDED kick off processing. Each call to this is
 * safe to retry — processing flips status to 'processed' atomically
 * before the row is touched again.
 */
async function pollOne(db: any, apiKey: string, batch: BatchRow): Promise<void> {
  if (!batch.gemini_batch_name) {
    // Never made it past submit. Mark failed and move on.
    await db
      .from("plant_library_batches")
      .update({
        status: "failed",
        error_message: "no gemini_batch_name (submit never completed)",
        completed_at: new Date().toISOString(),
      })
      .eq("id", batch.id);
    return;
  }

  let status;
  try {
    status = await getGeminiBatchStatus(apiKey, batch.gemini_batch_name);
  } catch (err: any) {
    await db
      .from("plant_library_batches")
      .update({
        last_polled_at: new Date().toISOString(),
        error_message: String(err?.message ?? "poll failed").slice(0, 500),
      })
      .eq("id", batch.id);
    logError(FN, "poll_failed", { batch_id: batch.id, error: err?.message });
    return;
  }

  const mapped = mapState(status.state);

  // Always update last_polled_at + status so the UI countdown is fresh.
  const patch: Record<string, unknown> = {
    last_polled_at: new Date().toISOString(),
    status: mapped,
  };
  if (status.error) patch.error_message = String(status.error).slice(0, 500);
  if (mapped === "succeeded" || mapped === "failed" || mapped === "cancelled") {
    patch.completed_at = new Date().toISOString();
  }
  await db
    .from("plant_library_batches")
    .update(patch)
    .eq("id", batch.id);

  // Only process SUCCEEDED that haven't been processed yet.
  if (mapped === "succeeded") {
    try {
      await processSucceededBatch(db, apiKey, { ...batch, status: mapped });
    } catch (err: any) {
      await captureException(FN, err);
      await db
        .from("plant_library_batches")
        .update({
          status: "failed",
          error_message: String(err?.message ?? "process failed").slice(0, 500),
        })
        .eq("id", batch.id);
      logError(FN, "process_failed", { batch_id: batch.id, error: err?.message });
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const apiKey = Deno.env.get("GEMINI_API_KEY") ?? "";
    if (!supabaseUrl || !serviceKey || !apiKey) {
      throw new Error("Missing env vars (SUPABASE_URL / SERVICE_ROLE / GEMINI_API_KEY).");
    }
    const db = createClient(supabaseUrl, serviceKey);

    // Two modes:
    //   1. Bulk (no body / no batch_id) → cron path. Polls every
    //      non-terminal row, processes SUCCEEDED ones. Returns
    //      `{ polled: N }`.
    //   2. Single (body has `batch_id`) → admin inspect button.
    //      Polls JUST that batch, returns Gemini's raw state +
    //      mapped status so the UI can surface it verbatim.
    const body = await req.json().catch(() => ({}));
    const inspectBatchId = typeof body?.batch_id === "string" && body.batch_id
      ? body.batch_id
      : null;

    if (inspectBatchId) {
      const { data: row } = await db
        .from("plant_library_batches")
        .select("id, kind, triggered_by, count_requested, candidate_names, model, gemini_batch_name, status")
        .eq("id", inspectBatchId)
        .maybeSingle();
      if (!row) {
        return new Response(
          JSON.stringify({ error: "batch not found" }),
          { status: 404, headers: { ...CORS, "Content-Type": "application/json" } },
        );
      }
      const batch = row as BatchRow;
      if (!batch.gemini_batch_name) {
        return new Response(
          JSON.stringify({
            batch_id: batch.id,
            raw_state: null,
            mapped_status: batch.status,
            error: "no gemini_batch_name on this row — submit never completed",
          }),
          { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
        );
      }
      // Polls Gemini, updates the row, processes if newly SUCCEEDED
      // — same path the cron runs, just for one row.
      try {
        await pollOne(db, apiKey, batch);
      } catch (err) {
        logError(FN, "pollOne_unexpected_inspect", {
          batch_id: batch.id,
          error: (err as Error).message,
        });
      }
      // Re-read the row + the live Gemini state so the response
      // carries the verbatim JOB_STATE_* string for the UI.
      const liveStatus = await getGeminiBatchStatus(apiKey, batch.gemini_batch_name).catch(
        (err) => ({ state: null as null, error: String(err?.message ?? "status fetch failed") }),
      );
      const { data: refreshed } = await db
        .from("plant_library_batches")
        .select("status, last_polled_at, error_message")
        .eq("id", batch.id)
        .maybeSingle();
      return new Response(
        JSON.stringify({
          batch_id: batch.id,
          gemini_batch_name: batch.gemini_batch_name,
          raw_state: liveStatus.state,
          mapped_status: refreshed?.status ?? batch.status,
          last_polled_at: refreshed?.last_polled_at ?? null,
          error: liveStatus.error ?? refreshed?.error_message ?? null,
        }),
        { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    // Bulk mode — cron-driven sweep.
    //
    // Step 0: stale-submitting sweep. A batch row stuck at
    // `status='submitting'` for more than 5 minutes means the
    // submit edge fn's background gather/submit died at the
    // Supabase background-task wall-clock cap with no error path
    // firing. Mark it failed so it's visible + the admin can
    // re-submit. (Successful submit flips status to 'pending' in
    // well under 2 min for any realistic count.)
    const staleCutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: staleRows } = await db
      .from("plant_library_batches")
      .update({
        status: "failed",
        error_message: "Submit timed out — background gather/submit didn't complete within 5 min. Try a smaller batch count (e.g. 1000-2000) and re-submit.",
        completed_at: new Date().toISOString(),
      })
      .eq("status", "submitting")
      .lt("submitted_at", staleCutoff)
      .select("id");
    if (staleRows && staleRows.length > 0) {
      log(FN, "stale_submitting_swept", { count: staleRows.length });
    }

    const { data: batches } = await db
      .from("plant_library_batches")
      .select("id, kind, triggered_by, count_requested, candidate_names, model, gemini_batch_name, status")
      .in("status", ["submitting", "pending", "running", "succeeded"])
      .order("submitted_at", { ascending: true })
      .limit(25);

    if (!batches || batches.length === 0) {
      return new Response(JSON.stringify({ polled: 0 }), {
        status: 200,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    for (const batch of batches as BatchRow[]) {
      // 'submitting' means the submit fn crashed mid-flight — admin
      // can re-trigger. We don't try to recover automatically.
      if (batch.status === "submitting") continue;
      try {
        await pollOne(db, apiKey, batch);
      } catch (err) {
        logError(FN, "pollOne_unexpected", { batch_id: batch.id, error: (err as Error).message });
      }
    }

    return new Response(JSON.stringify({ polled: batches.length }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    logError(FN, "fatal", { error: err?.message });
    await captureException(FN, err);
    return new Response(JSON.stringify({ error: err?.message ?? "unknown" }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
