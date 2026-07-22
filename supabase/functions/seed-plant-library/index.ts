// Plant Library seeder.
//
// Triggered by cron (daily 02:00 UTC) AND admin manual runs.
//
// Name source: Wikipedia category APIs (free, no key — see
// `_shared/plantNameSources.ts`). We pull a pool of candidate plant
// names from a random selection of cultivated-plant categories
// (Vegetables, Herbs, Houseplants, Tomato_cultivars, etc.) and then
// drop anything we already have in the DB. The survivors are passed
// to Gemini ONLY for care-data enrichment — the AI is never asked to
// "think of" plants. This eliminates the bias-toward-famous-species
// duplicate problem the previous AI-invents-names approach hit.
//
// Self-chunking architecture: a single invocation can't fit a
// 100-plant (let alone 1000-plant) run inside Supabase's
// background-task wall-clock cap, so the function splits the work
// into CHUNK_SIZE chunks and CHAINS ITSELF — at the end of each
// chunk, POST to its own URL with `{ count: remaining, run_id }`.
// The self-call is wrapped in EdgeRuntime.waitUntil so the request
// survives the chunk's function teardown. Each invocation does
// ~30s of work and dispatches the next.
//
// Request body shapes:
//   - First call:        { count, triggered_by? }
//   - Continuation call: { count: <remaining>, run_id }
//
// Fire-and-forget on the first call too: HTTP responds with
// `{ run_id }` after creating the run row; the actual seeding
// continues in the background.
//
// Dedup is enforced first by a DB pre-filter (cheap) and backstopped
// by the `plants_library_sci_key_idx` unique index (ON CONFLICT DO
// NOTHING).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { log, error as logError } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import { callGeminiCascade, toMessages } from "../_shared/gemini.ts";
import { estimateGeminiCostUsd } from "../_shared/geminiCost.ts";
import {
  ACTIVE_SOURCES,
  computeSciKey,
  extractScientificName,
  fetchCandidatePlantNames,
  FRESH_RATE_THRESHOLD,
  type CandidatePlant,
  type SourceName,
} from "../_shared/plantNameSources.ts";
import { fetchWikipediaSummary } from "../_shared/plantLibrarySources.ts";
import {
  buildEnrichmentPrompt,
  salvageTruncatedPlants,
  SEED_BATCH_SCHEMA,
  SEED_PROMPT_BATCH_SIZE,
  seedRowToColumnShape,
  type SeedRow,
} from "../_shared/plantSeedPrompt.ts";
import { isAcceptablePlantEnrichment } from "../_shared/plantEnrichmentGuard.ts";

const FN = "seed-plant-library";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Each batch's Gemini response stays small — faster end-to-end,
// AND if the cascade has to retry / fall back through multiple
// models on a slow batch, the wasted time is half what it was.
// Shared with the Batch API submit path so prompt + sizing stay
// in lockstep across both flows.
const BATCH_SIZE = SEED_PROMPT_BATCH_SIZE;
/**
 * How many plants ONE function invocation handles before chaining to
 * itself for the next chunk. 30 = 3 batches × 10 plants ≈ 30s of
 * work per invocation — comfortable inside Supabase's
 * background-task wall-clock cap with headroom for slow Gemini
 * cascades. For a 100-plant manual run we chain ~4 invocations; for
 * a 1000-plant cron run we chain ~34. Each starts cold but the chain
 * is reliable — and a single bad chunk doesn't take the whole run
 * down with it.
 */
const CHUNK_SIZE = 30;
/**
 * Wikipedia is over-fetched per chunk so that after we drop names
 * already in the DB we still have CHUNK_SIZE unique candidates. 3×
 * is conservative headroom — typical filtering loses 20-40% to
 * existing rows + non-plant titles that slipped past the heuristic.
 */
const NAME_OVERFETCH_MULTIPLIER = 3;
/** Cap on `failed_inserts` so a pathological run can't balloon the row size. */
const MAX_FAILED_INSERTS_PER_RUN = 200;

interface FailedInsert {
  common_name: string;
  scientific_name: string | null;
  error: string;
  at: string;
}

async function runSeedBatch(
  db: any,
  apiKey: string,
  runId: string,
  plantNames: string[],
): Promise<{
  inserted: number;
  skipped: number;
  failed: number;
  /** Gemini token usage for this batch — accumulated on the run row. */
  promptTokens: number;
  candidatesTokens: number;
  cachedTokens: number;
  thoughtsTokens: number;
  totalTokens: number;
  costUsd: number;
  /** Model that actually answered (after any cascade fallbacks). Used
   *  to bucket per-model usage on the run row. */
  model: string | null;
  /** Per-row insert failures captured during this batch. Appended
   *  to `plant_library_runs.failed_inserts` so the admin can see
   *  which plants couldn't land + why, without diving into Sentry. */
  failedInserts: FailedInsert[];
}> {
  const batchCount = plantNames.length;
  const stats = {
    inserted: 0,
    skipped: 0,
    failed: 0,
    promptTokens: 0,
    candidatesTokens: 0,
    cachedTokens: 0,
    thoughtsTokens: 0,
    totalTokens: 0,
    costUsd: 0,
    model: null as string | null,
    failedInserts: [] as FailedInsert[],
  };

  const { text, usage } = await callGeminiCascade(
    apiKey,
    FN,
    toMessages([buildEnrichmentPrompt(plantNames)]),
    {
      // Lower temperature — we want consistent, accurate care data,
      // not creative variety. The names are pre-supplied; the AI's
      // job is to look them up and fill in known values.
      temperature: 0.3,
      // Bumped from 8192 — at 25-plant batches we were truncating
      // responses mid-string and failing JSON.parse. 32k gives huge
      // headroom even on chunky cultivar batches with long
      // descriptions + every applicable field populated.
      maxOutputTokens: 32768,
      responseSchema: SEED_BATCH_SCHEMA,
      responseMimeType: "application/json",
      // FAIL-FAST cascade. 6 models × 1 attempt = 6 calls max per
      // batch, not 18. A slow / loaded Gemini won't blow the entire
      // background-task budget on one batch — bad batch fails, the
      // rest of the run continues. If we start seeing batch failures
      // spike under heavy load, we re-add retries selectively.
      maxRetriesPerModel: 1,
      // Tight timeout per call so a stuck model bails fast and we
      // cascade to the next.
      timeoutMs: 20_000,
      logContext: { run_id: runId, batch_count: batchCount },
    },
  );

  // Record AI usage for this batch — sums onto the run's totals later.
  // Captures the full breakdown Gemini returns in `usageMetadata` so
  // the cost estimate accounts for cheap cached input + Pro-model
  // thinking tokens (billed at output rate).
  stats.promptTokens = usage.promptTokenCount ?? 0;
  stats.candidatesTokens = usage.candidatesTokenCount ?? 0;
  stats.cachedTokens = usage.cachedContentTokenCount ?? 0;
  stats.thoughtsTokens = usage.thoughtsTokenCount ?? 0;
  stats.totalTokens = usage.totalTokenCount ?? 0;
  stats.model = usage.model ?? null;
  stats.costUsd = estimateGeminiCostUsd(usage.model, {
    promptTokenCount: stats.promptTokens,
    candidatesTokenCount: stats.candidatesTokens,
    cachedContentTokenCount: stats.cachedTokens,
    thoughtsTokenCount: stats.thoughtsTokens,
  });

  let parsed: { plants: SeedRow[] };
  try {
    parsed = JSON.parse(text) as { plants: SeedRow[] };
  } catch (err) {
    // Try to salvage complete plants from a truncated response.
    // Gemini's output cap occasionally cuts off mid-batch; the
    // plants before the cut are perfectly valid even if the JSON
    // overall is malformed.
    const salvaged = salvageTruncatedPlants(text);
    if (salvaged && salvaged.plants?.length) {
      log(FN, "parse_failed_salvaged", {
        run_id: runId,
        error: (err as Error).message,
        text_length: text.length,
        salvaged_count: salvaged.plants.length,
        requested: batchCount,
      });
      parsed = salvaged;
      // Account for the plants we couldn't recover so the run's
      // failed count is accurate.
      stats.failed += Math.max(0, batchCount - salvaged.plants.length);
    } else {
      logError(FN, "parse_failed", {
        run_id: runId,
        error: (err as Error).message,
        text_length: text.length,
      });
      stats.failed += batchCount;
      return stats;
    }
  }

  const aiPlants = Array.isArray(parsed.plants) ? parsed.plants : [];
  log(FN, "batch_received", { run_id: runId, ai_returned: aiPlants.length, model: usage.model });

  // Last-line key recheck — drop any AI-returned plant whose
  // scientific_name_key already exists in the DB BEFORE the insert
  // loop. The pre-AI filter in runOneChunk catches most of these
  // upstream (and saves the AI token spend); this catches the few
  // that slip through when AI normalises a binomial differently.
  const { surviving: plants, preInsertSkipped } = await dropKeyCollidersFromAiResponse(db, aiPlants);
  if (preInsertSkipped > 0) {
    stats.skipped += preInsertSkipped;
    log(FN, "pre_insert_key_skipped", {
      run_id: runId,
      pre_insert_skipped: preInsertSkipped,
      ai_returned: aiPlants.length,
    });
  }

  // Thumbnails are now backfilled lazily by the admin search tab
  // (which writes through plant_image_cache). Doing 20 parallel
  // plant-image-search calls inline used to add 3-10s per batch and
  // pushed background-task runs past the wall-clock limit. Rows
  // land with thumbnail_url = null; the search UI fills them in on
  // render and the cache warms organically.

  for (let i = 0; i < plants.length; i++) {
    const p = plants[i];
    const row = seedRowToColumnShape(p, { seeded_by_run_id: runId });
    if (!row) {
      stats.failed += 1;
      continue;
    }

    // Reject over-generic / garbage enrichments (e.g. a cultivar answered as
    // the bare category "Root vegetable", or a junk scientific name) so they
    // never poison the global library — a miss is filled on demand by the AI
    // care-guide path.
    const guard = isAcceptablePlantEnrichment(row.common_name, row.scientific_name);
    if (!guard.ok) {
      stats.skipped += 1;
      log(FN, "enrichment_rejected", {
        run_id: runId,
        common_name: String(row.common_name ?? ""),
        reason: guard.reason,
      });
      continue;
    }

    const { data, error } = await db
      .from("plant_library")
      .insert(row, { count: "exact" })
      .select("id");

    if (error) {
      // Unique-violation = silent skip (DB pre-filter should catch
      // most, but the AI sometimes returns a scientific name that
      // normalises to an existing key). Anything else = real failure
      // → record on the run row so the admin UI can surface it.
      if (error.code === "23505") {
        stats.skipped += 1;
      } else {
        stats.failed += 1;
        const commonName = String(row.common_name ?? "(unknown)");
        const sciArr = row.scientific_name;
        const scientificName =
          Array.isArray(sciArr) && typeof sciArr[0] === "string" ? sciArr[0] : null;
        logError(FN, "insert_failed", {
          run_id: runId,
          common_name: commonName,
          error: error.message,
        });
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
      // Defensive — empty data without error usually means a constraint
      // dropped it. Count as skipped.
      stats.skipped += 1;
    }
  }

  return stats;
}

interface ModelUsageSlot {
  prompt_tokens: number;
  candidates_tokens: number;
  cached_tokens: number;
  thoughts_tokens: number;
  cost_usd: number;
  call_count: number;
}

async function updateRunProgress(
  db: any,
  runId: string,
  deltas: {
    inserted?: number;
    skipped?: number;
    failed?: number;
    error?: string | null;
    promptTokens?: number;
    candidatesTokens?: number;
    cachedTokens?: number;
    thoughtsTokens?: number;
    totalTokens?: number;
    costUsd?: number;
    /** Model that answered. When present, the per-model bucket on
     *  `model_usage` is bumped alongside the aggregate totals. */
    model?: string | null;
    failedInserts?: FailedInsert[];
  },
) {
  // Read-modify-write the counter columns. Cheap because there's only
  // one writer per run. The heartbeat is touched on every progress
  // update so the admin sweep can tell live runs from dead ones.
  const { data: row } = await db
    .from("plant_library_runs")
    .select(
      "count_inserted, count_skipped, count_failed, error_message, total_prompt_tokens, total_candidates_tokens, total_cached_tokens, total_thoughts_tokens, total_tokens, total_cost_usd, failed_inserts, model_usage",
    )
    .eq("id", runId)
    .maybeSingle();
  if (!row) return;
  const patch: Record<string, unknown> = {
    count_inserted: row.count_inserted + (deltas.inserted ?? 0),
    count_skipped: row.count_skipped + (deltas.skipped ?? 0),
    count_failed: row.count_failed + (deltas.failed ?? 0),
    total_prompt_tokens: row.total_prompt_tokens + (deltas.promptTokens ?? 0),
    total_candidates_tokens:
      row.total_candidates_tokens + (deltas.candidatesTokens ?? 0),
    total_cached_tokens: row.total_cached_tokens + (deltas.cachedTokens ?? 0),
    total_thoughts_tokens:
      row.total_thoughts_tokens + (deltas.thoughtsTokens ?? 0),
    total_tokens: row.total_tokens + (deltas.totalTokens ?? 0),
    total_cost_usd:
      Number(row.total_cost_usd ?? 0) + (deltas.costUsd ?? 0),
    last_heartbeat_at: new Date().toISOString(),
  };
  // Per-model bucket — only updated when we know which model
  // answered (i.e. the delta came from a real Gemini call, not a
  // synthetic batch-failure ping where we never got a response).
  if (deltas.model) {
    const usage: Record<string, ModelUsageSlot> =
      (row.model_usage as Record<string, ModelUsageSlot>) ?? {};
    const slot: ModelUsageSlot = usage[deltas.model] ?? {
      prompt_tokens: 0,
      candidates_tokens: 0,
      cached_tokens: 0,
      thoughts_tokens: 0,
      cost_usd: 0,
      call_count: 0,
    };
    slot.prompt_tokens     += deltas.promptTokens ?? 0;
    slot.candidates_tokens += deltas.candidatesTokens ?? 0;
    slot.cached_tokens     += deltas.cachedTokens ?? 0;
    slot.thoughts_tokens   += deltas.thoughtsTokens ?? 0;
    slot.cost_usd          += deltas.costUsd ?? 0;
    slot.call_count        += 1;
    usage[deltas.model] = slot;
    patch.model_usage = usage;
  }
  // Preserve the first batch error we see so the admin can read it
  // off the run row. Fatal failures still overwrite this via the
  // outer catch in `processChunkAndContinue`.
  if (deltas.error && !row.error_message) {
    patch.error_message = deltas.error.slice(0, 2000);
  }
  // Synthesize a batch-failure entry into `failed_inserts` when we
  // got an `error` but no per-row failures. Without this, batch-level
  // failures (cascade exhausted, parse failure, etc.) only bump
  // `count_failed` — the admin sees "50 failed" with no reasons.
  // Repurposing `failed_inserts` avoids a schema change; the admin
  // panel renders these alongside row failures.
  let syntheticBatchFailure: FailedInsert | null = null;
  if (
    deltas.error &&
    (!deltas.failedInserts || deltas.failedInserts.length === 0) &&
    (deltas.failed ?? 0) > 0
  ) {
    syntheticBatchFailure = {
      common_name: `(batch of ${deltas.failed} plants)`,
      scientific_name: null,
      error: deltas.error.slice(0, 500),
      at: new Date().toISOString(),
    };
  }
  // Concat new failures onto the existing array; cap so a runaway
  // run with a thousand failures can't balloon the row.
  const incoming: FailedInsert[] = [
    ...(deltas.failedInserts ?? []),
    ...(syntheticBatchFailure ? [syntheticBatchFailure] : []),
  ];
  if (incoming.length > 0) {
    const existing = Array.isArray(row.failed_inserts) ? row.failed_inserts : [];
    const merged = [...existing, ...incoming].slice(
      0,
      MAX_FAILED_INSERTS_PER_RUN,
    );
    patch.failed_inserts = merged;
  }
  await db
    .from("plant_library_runs")
    .update(patch)
    .eq("id", runId);
}

/** Lowercase + strip cultivar quotes for case-insensitive matching. */
function normaliseCommonName(name: string): string {
  return name.toLowerCase().replace(/['"]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * One enriched candidate — passed through `filterCandidatesAgainstDb`
 * and on to the AI prompt. Carries the resolved sciName so we can
 * decorate the prompt as "Name [Sci name]" — keeps AI's
 * scientific_name aligned with the key our pre-filter accepted.
 */
interface EnrichableCandidate {
  name: string;
  /** Best-resolved scientific binomial — null when no source supplied
   *  one and Wikipedia summary extraction didn't find one either. */
  sciName: string | null;
}

/**
 * Aggressive pre-AI filter. Two stages:
 *
 * 1. **Common-name filter** — case-insensitive + quote-stripped
 *    match against every existing common_name (fetched once per
 *    chunk, ~200KB at 10k rows, cheap). O(1) Set lookup.
 *
 * 2. **Scientific-name filter** — for each survivor, resolve the
 *    binomial:
 *      - If the source (iNat / Wikidata / GBIF) already supplied
 *        a `sciName`, use it directly — no HTTP needed.
 *      - Otherwise (Wikipedia source), fetch the Wikipedia summary
 *        in parallel and extract via regex.
 *    Compute `scientific_name_key` the same way the DB's generated
 *    column does, drop colliders against existing rows.
 *
 *    The pre-resolved sciName from iNat/Wikidata/GBIF saves ~70%
 *    of the Wikipedia summary calls in a typical batch — the
 *    slowest part of skip-reduction.
 *
 * Returns the surviving candidates (with their resolved sciName so
 * the caller can decorate prompts as "Name [Sci]").
 */
async function filterCandidatesAgainstDb(
  db: any,
  candidates: CandidatePlant[],
): Promise<EnrichableCandidate[]> {
  if (candidates.length === 0) return [];

  // Stage 1 — common-name filter (Set-based, case-insensitive).
  const { data: existingNames } = await db
    .from("plant_library")
    .select("common_name");
  const knownNormalisedNames = new Set<string>(
    (existingNames ?? [])
      .map((r: { common_name: string }) =>
        r.common_name ? normaliseCommonName(r.common_name) : "",
      )
      .filter(Boolean),
  );
  const afterStage1 = candidates.filter(
    (c) => !knownNormalisedNames.has(normaliseCommonName(c.name)),
  );

  if (afterStage1.length === 0) return [];

  // Stage 2 — resolve a scientific name per candidate. Source-
  // provided sciName takes the fast path; Wikipedia-source
  // candidates still need the summary lookup.
  const resolved = await Promise.all(
    afterStage1.map(async (c) => {
      if (c.sciName) {
        return { name: c.name, sciName: c.sciName, key: computeSciKey(c.sciName, c.name) };
      }
      const summary = await fetchWikipediaSummary(c.name);
      const sci = extractScientificName(summary?.extract ?? null);
      return { name: c.name, sciName: sci, key: computeSciKey(sci, c.name) };
    }),
  );

  // Stage 2.b — single DB query for matching keys across the
  // resolved set. Drop colliders.
  const candidateKeys = resolved.map((r) => r.key).filter(Boolean);
  if (candidateKeys.length === 0) {
    return afterStage1.map((c) => ({ name: c.name, sciName: c.sciName }));
  }

  const { data: existingKeys } = await db
    .from("plant_library")
    .select("scientific_name_key")
    .in("scientific_name_key", candidateKeys);
  const knownKeys = new Set<string>(
    (existingKeys ?? [])
      .map((r: { scientific_name_key: string }) => r.scientific_name_key)
      .filter(Boolean),
  );

  return resolved
    .filter((r) => !knownKeys.has(r.key))
    .map((r) => ({ name: r.name, sciName: r.sciName }));
}

/** Format a name + optional sciName for the prompt list. Bracket
 *  form locks the scientific_name in the AI's response — see
 *  `_shared/plantSeedPrompt.ts` for the matching prompt instruction. */
function decorateForPrompt(c: EnrichableCandidate): string {
  return c.sciName ? `${c.name} [${c.sciName}]` : c.name;
}

/**
 * Last-line defence after the AI responds: compute each returned
 * plant's `scientific_name_key` in JS and drop the ones that
 * collide with existing rows. Doesn't save AI tokens (already
 * spent), but saves N insert round-trips per batch and keeps the
 * "skipped" counter honest about what the cascade actually caught
 * upstream. Modifies `plants` in place; returns the filtered list.
 */
async function dropKeyCollidersFromAiResponse(
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

  return {
    surviving,
    preInsertSkipped: plants.length - surviving.length,
  };
}

/**
 * Process ONE chunk worth of work (up to `chunkPlantCount` plants,
 * split into BATCH_SIZE batches). Writes progress + token usage
 * straight to `plant_library_runs`.
 *
 * Flow:
 *   1. Pull ~3× CHUNK_SIZE candidate names from Wikipedia categories.
 *   2. Drop any whose common_name already exists in the DB.
 *   3. Take up to `chunkPlantCount` survivors.
 *   4. Split into BATCH_SIZE batches; for each batch call AI with
 *      the specific names and ask for care data only.
 */
async function runOneChunk(
  db: any,
  apiKey: string,
  runId: string,
  chunkPlantCount: number,
  /** Optional: pre-resolved candidate names (e.g. from seasonal picks).
   *  When supplied, skip the Wikipedia discovery step entirely. */
  explicitCandidates?: CandidatePlant[],
): Promise<void> {
  // Stamp a heartbeat immediately so the admin sweep can't
  // false-positive a chunk that's just starting.
  await db
    .from("plant_library_runs")
    .update({ last_heartbeat_at: new Date().toISOString() })
    .eq("id", runId);

  let toEnrich: CandidatePlant[];

  if (explicitCandidates && explicitCandidates.length > 0) {
    log(FN, "names_supplied", { run_id: runId, count: explicitCandidates.length });
    const unseen = await filterCandidatesAgainstDb(db, explicitCandidates);
    toEnrich = unseen.slice(0, chunkPlantCount);
  } else {
    // Iterative gather — if the first fetch leaves too few survivors
    // after the DB pre-filter, re-fetch with under-performing sources
    // muted. Caps at 3 iterations so a saturated catalogue doesn't
    // burn the entire chunk's wall-clock budget.
    const HARD_MAX_ITERATIONS = 3;
    const wantedPerIteration = chunkPlantCount * NAME_OVERFETCH_MULTIPLIER;
    const fetchedBySource: Record<string, number> = {};
    const freshBySource: Record<string, number> = {};
    const skipSources = new Set<SourceName>();
    const seenThisChunk = new Set<string>();
    const accumulated: CandidatePlant[] = [];
    let lastRawCount = 0;

    for (let i = 0; i < HARD_MAX_ITERATIONS && accumulated.length < chunkPlantCount; i++) {
      const raw = await fetchCandidatePlantNames(db, wantedPerIteration, skipSources);
      lastRawCount = raw.length;
      for (const c of raw) {
        fetchedBySource[c.source] = (fetchedBySource[c.source] ?? 0) + 1;
      }

      const fresh = raw.filter((c) => {
        const key = c.name.toLowerCase();
        if (seenThisChunk.has(key)) return false;
        seenThisChunk.add(key);
        freshBySource[c.source] = (freshBySource[c.source] ?? 0) + 1;
        return true;
      });

      const unseen = await filterCandidatesAgainstDb(db, fresh);
      accumulated.push(...unseen);

      // Mute any source whose fresh-rate has dropped below threshold.
      // Same logic the Batch API submit path uses — keeps both flows
      // in lockstep via the shared FRESH_RATE_THRESHOLD constant.
      for (const s of ACTIVE_SOURCES) {
        if (skipSources.has(s)) continue;
        const fetched = fetchedBySource[s] ?? 0;
        const freshFromS = freshBySource[s] ?? 0;
        if (fetched >= 50 && freshFromS / fetched < FRESH_RATE_THRESHOLD) {
          skipSources.add(s);
          log(FN, "gather_source_muted", {
            run_id: runId,
            source: s,
            fetched,
            fresh: freshFromS,
            fresh_rate: freshFromS / fetched,
          });
        }
      }

      log(FN, "gather_iteration", {
        run_id: runId,
        iteration: i,
        raw: raw.length,
        fresh: fresh.length,
        unseen: unseen.length,
        running_total: accumulated.length,
        target: chunkPlantCount,
        muted_sources: [...skipSources],
      });

      // All sources muted AND nothing fresh → nothing left to gather.
      if (skipSources.size >= ACTIVE_SOURCES.length) break;
      // Last fetch returned nothing → upstream APIs all failed/timed
      // out together; bail rather than loop forever.
      if (raw.length === 0) break;
    }

    log(FN, "names_fetched", {
      run_id: runId,
      fetched: lastRawCount,
      unseen: accumulated.length,
      iterations_used: Math.min(HARD_MAX_ITERATIONS, accumulated.length === 0 ? 1 : HARD_MAX_ITERATIONS),
    });

    if (accumulated.length === 0) {
      // All sources returned nothing usable.
      await updateRunProgress(db, runId, {
        failed: chunkPlantCount,
        error: "all candidate name sources returned no fresh plants (either all saturated against DB or transient upstream failure)",
      });
      return;
    }
    toEnrich = accumulated.slice(0, chunkPlantCount);
  }

  if (toEnrich.length === 0) {
    // Caller-supplied list filtered out entirely — every requested plant
    // is already in the DB.
    await updateRunProgress(db, runId, {
      failed: chunkPlantCount,
      error: "all supplied plant names are already in the DB",
    });
    return;
  }

  // Split into BATCH_SIZE chunks and enrich each batch. We decorate
  // each name as "Common Name [Scientific name]" when sciName is
  // known so the AI uses the resolved binomial verbatim — preventing
  // the post-AI "AI invented a different sci_name → key collision →
  // SKIP" pattern that was eating ~80% of throughput.
  for (let i = 0; i < toEnrich.length; i += BATCH_SIZE) {
    const batchSurvivors = toEnrich.slice(i, i + BATCH_SIZE);
    const batchNames = batchSurvivors.map(decorateForPrompt);
    try {
      const stats = await runSeedBatch(db, apiKey, runId, batchNames);
      await updateRunProgress(db, runId, {
        inserted: stats.inserted,
        skipped: stats.skipped,
        failed: stats.failed,
        promptTokens: stats.promptTokens,
        candidatesTokens: stats.candidatesTokens,
        cachedTokens: stats.cachedTokens,
        thoughtsTokens: stats.thoughtsTokens,
        totalTokens: stats.totalTokens,
        costUsd: stats.costUsd,
        model: stats.model,
        failedInserts: stats.failedInserts,
      });
    } catch (err) {
      const reason = (err as Error).message ?? "unknown";
      logError(FN, "batch_failed", {
        run_id: runId,
        error: reason,
        batch_names: batchNames,
      });
      // Cascade exhausted (e.g. Gemini overload, all attempts failed)
      // → mark the whole batch as failed and synthesize a
      // failed_inserts entry so the admin sees the reason.
      // Subsequent batches still run.
      await updateRunProgress(db, runId, {
        failed: batchNames.length,
        error: reason,
      });
    }
  }
}

/**
 * Final status reflects partial failures: any failed batches but
 * some plants in → `partial`; every batch failed → `failed`;
 * otherwise `succeeded`.
 */
async function finalizeRun(db: any, runId: string): Promise<void> {
  const { data: final } = await db
    .from("plant_library_runs")
    .select("count_inserted, count_failed")
    .eq("id", runId)
    .maybeSingle();
  const inserted = final?.count_inserted ?? 0;
  const failed = final?.count_failed ?? 0;
  const finalStatus =
    failed > 0 && inserted === 0
      ? "failed"
      : failed > 0
      ? "partial"
      : "succeeded";

  await db
    .from("plant_library_runs")
    .update({
      status: finalStatus,
      finished_at: new Date().toISOString(),
      last_heartbeat_at: new Date().toISOString(),
    })
    .eq("id", runId);
  log(FN, "run_finished", { run_id: runId, status: finalStatus, inserted, failed });
}

/**
 * Fire-and-forget POST to our own URL with the remaining count. The
 * receiving invocation handles the next chunk and recurses.
 * verify_jwt is off for this function, so the cron-style call works
 * without an auth header.
 *
 * The fetch promise is registered with `EdgeRuntime.waitUntil` so the
 * runtime keeps the worker alive until the request actually lands. A
 * bare `fetch().catch()` outside waitUntil gets cancelled when the
 * chunk's waitUntil scope settles — that was the bug that capped runs
 * around 50 (one chunk landed; the chain died on the way to chunk 2).
 *
 * If the dispatch fails (network blip), the chain breaks and the
 * admin sweep eventually marks the run failed via the stale
 * heartbeat — acceptable; admin can re-trigger.
 */
function scheduleContinuation(runId: string, remaining: number): void {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/seed-plant-library`;
  const fetchPromise = fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ count: remaining, run_id: runId }),
  }).catch((err) => {
    logError(FN, "schedule_continuation_failed", {
      run_id: runId,
      remaining,
      error: (err as Error)?.message,
    });
  });
  // @ts-expect-error EdgeRuntime is only available at runtime.
  EdgeRuntime.waitUntil(fetchPromise);
}

/**
 * Run one chunk, then either chain a continuation invocation or
 * finalize. Wrapped in try/catch so any unhandled failure during the
 * chunk marks the run failed instead of leaving it stuck running.
 */
async function processChunkAndContinue(
  db: any,
  apiKey: string,
  runId: string,
  remaining: number,
  /** Optional pre-resolved candidates. Only used on the FIRST chunk —
   *  continuation chains drop back to Wikipedia discovery if there's
   *  still work to do (typical when count > supplied list). */
  explicitCandidates?: CandidatePlant[],
): Promise<void> {
  try {
    const chunkPlants = Math.min(CHUNK_SIZE, remaining);
    await runOneChunk(db, apiKey, runId, chunkPlants, explicitCandidates);
    const stillRemaining = remaining - chunkPlants;
    if (stillRemaining > 0) {
      log(FN, "scheduling_continuation", { run_id: runId, remaining: stillRemaining });
      scheduleContinuation(runId, stillRemaining);
    } else {
      await finalizeRun(db, runId);
    }
  } catch (err: any) {
    await captureException(FN, err);
    await db
      .from("plant_library_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        error_message: err?.message ?? "unknown",
      })
      .eq("id", runId);
    logError(FN, "chunk_failed", { run_id: runId, error: err?.message });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const apiKey = Deno.env.get("GEMINI_API_KEY") ?? "";
    if (!supabaseUrl || !serviceKey || !apiKey) {
      throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / GEMINI_API_KEY env vars.");
    }
    const db = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const rawCount = typeof body.count === "number" ? body.count : 0;
    const triggeredBy = typeof body.triggered_by === "string" ? body.triggered_by : null;
    const continuationRunId =
      typeof body.run_id === "string" && body.run_id ? body.run_id : null;

    // Optional: caller can supply explicit plant names (e.g. the
    // seasonal-picks handler firing seeds for picks that aren't yet
    // in the library). When present, we skip the Wikipedia name
    // discovery step and enrich exactly these plants instead.
    const rawPlantNames: unknown = body.plantNames;
    const callerPlantNames: { name: string; sciName: string | null }[] = Array.isArray(rawPlantNames)
      ? rawPlantNames
          .map((entry) => {
            if (typeof entry === "string" && entry.trim()) {
              return { name: entry.trim(), sciName: null };
            }
            if (entry && typeof entry === "object" && typeof (entry as any).name === "string") {
              const sci = typeof (entry as any).sciName === "string" ? (entry as any).sciName.trim() : null;
              return { name: (entry as any).name.trim(), sciName: sci || null };
            }
            return null;
          })
          .filter((e): e is { name: string; sciName: string | null } => !!e && !!e.name)
      : [];

    // When plantNames is supplied, count defaults to that list's length
    // so we never run beyond the supplied set. The caller can still
    // pass a smaller count to cap the work.
    const effectiveRawCount = callerPlantNames.length > 0
      ? (rawCount > 0 ? Math.min(rawCount, callerPlantNames.length) : callerPlantNames.length)
      : rawCount;
    const count = Math.max(1, Math.min(5000, Math.floor(effectiveRawCount)));

    // Continuation invocation: the previous chunk fired-and-forgot
    // ourselves to process the next chunk. Verify the run is still
    // live (admin may have stopped it via the ✕ button, or the
    // heartbeat sweep may have killed it as stale) — if it's not,
    // drop the call on the floor.
    if (continuationRunId) {
      const { data: row } = await db
        .from("plant_library_runs")
        .select("status")
        .eq("id", continuationRunId)
        .maybeSingle();
      if (!row || row.status !== "running") {
        log(FN, "continuation_skipped", {
          run_id: continuationRunId,
          status: row?.status ?? "missing",
          remaining: count,
        });
        return new Response(
          JSON.stringify({ skipped: true, run_id: continuationRunId }),
          { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
        );
      }

      log(FN, "continuation_started", { run_id: continuationRunId, remaining: count });
      // @ts-expect-error EdgeRuntime is only available at runtime.
      EdgeRuntime.waitUntil(
        processChunkAndContinue(db, apiKey, continuationRunId, count),
      );
      return new Response(
        JSON.stringify({ run_id: continuationRunId, continuation: true }),
        { status: 202, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    // First call: create the run row, then kick off the chain.
    const { data: run, error: runError } = await db
      .from("plant_library_runs")
      .insert({
        kind: "seed",
        triggered_by: triggeredBy,
        count_requested: count,
      })
      .select("id")
      .single();
    if (runError || !run) throw runError ?? new Error("Failed to create run row");

    log(FN, "started", { run_id: run.id, count, triggered_by: triggeredBy });

    // When the caller supplied explicit names, convert them into the
    // CandidatePlant shape that runOneChunk expects.
    const explicitCandidates: CandidatePlant[] | undefined = callerPlantNames.length > 0
      ? callerPlantNames.slice(0, count).map((p) => ({
          name: p.name,
          sciName: p.sciName,
          source: "caller_supplied" as const,
        }))
      : undefined;

    // Fire-and-forget — release the connection immediately and let
    // the first chunk run in the background; it'll chain itself for
    // the rest.
    // @ts-expect-error EdgeRuntime is only available at runtime.
    EdgeRuntime.waitUntil(processChunkAndContinue(db, apiKey, run.id, count, explicitCandidates));

    return new Response(JSON.stringify({ run_id: run.id }), {
      status: 202,
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
