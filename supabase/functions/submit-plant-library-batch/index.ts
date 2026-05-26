// Plant Library — submit a single batch to Gemini's Batch API.
//
// Triggered by the admin's "Submit batch" button. Runs the same
// skip-reduction pipeline as the synchronous seeder (Wikipedia
// names + DB common-name filter + Wikipedia scientific-name
// resolution + DB key filter), packs survivors into BATCH_SIZE-line
// chunks, and submits one big batch via Gemini's
// :batchGenerateContent endpoint. Returns immediately with the
// batch_id; results land in 1-24h and are processed by
// `poll-plant-library-batches`.
//
// Pricing: batch API is 50% of standard across all models. We
// submit to the cheapest cascade rung that's batch-supported
// (gemini-2.5-flash-lite) — fall-back models are NOT used in batch
// mode because batch lines fail individually and we'd rather get
// a partial result than wait days for retries.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { log, error as logError } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import { submitGeminiBatch, type BatchRequestLine } from "../_shared/gemini.ts";
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
  SEED_BATCH_SCHEMA,
  SEED_PROMPT_BATCH_SIZE,
} from "../_shared/plantSeedPrompt.ts";
import { estimateGeminiCostUsd } from "../_shared/geminiCost.ts";

const FN = "submit-plant-library-batch";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// 10k cap is well under Gemini's 20MB inline-batch limit (~66k
// plants at our prompt sizing). The gather + iteration cap means
// realistic survivor count for a 10k request lands around 3-5k —
// half as many manual submits to ingest a given volume.
const MAX_COUNT = 10000;
/** Model we submit batches to. Fixed (no cascade) because batch
 *  mode runs ~hours; we don't want a fallback to spend 2x what we
 *  expected. Cheapest rung is gemini-2.5-flash-lite. */
const BATCH_MODEL = "gemini-2.5-flash-lite";

function normaliseCommonName(name: string): string {
  return name.toLowerCase().replace(/['"]/g, "").replace(/\s+/g, " ").trim();
}

interface EnrichableCandidate {
  name: string;
  sciName: string | null;
}

/**
 * Fetch every existing common_name once and build a normalised Set
 * for O(1) lookup. Used as the stable upfront half of the filter so
 * the per-iteration step doesn't re-fetch the same ~10k rows of
 * names from Supabase on every loop pass.
 */
async function fetchKnownCommonNames(db: any): Promise<Set<string>> {
  // `.range()` is required — PostgREST defaults to a 1000-row cap
  // even when no `.limit()` is set. Without this, a DB with 10k
  // plants would only give us the first 1000 common_names; the
  // other 9000 would silently pass the filter and get sent to AI
  // just to ON CONFLICT skip on insert. Range cap at 49,999 keeps
  // the response under Supabase's default network buffer.
  const knownNames = new Set<string>();
  let page = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await db
      .from("plant_library")
      .select("common_name")
      .range(page * pageSize, (page + 1) * pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const r of data) {
      if (r.common_name) knownNames.add(normaliseCommonName(r.common_name));
    }
    if (data.length < pageSize) break;
    page += 1;
    // Safety cap — 50 pages × 1000 = 50k rows. Realistic DB scale
    // won't approach this; defensive against runaway.
    if (page >= 50) break;
  }
  return knownNames;
}

/**
 * Per-iteration filter. Takes a pre-fetched `knownNames` Set so we
 * don't re-pull all DB names on every loop pass. Stage 2 still hits
 * the DB for sci-key collision check, but only against this
 * iteration's candidate set (small query).
 */
async function filterCandidatesAgainstDbState(
  db: any,
  candidates: CandidatePlant[],
  knownNames: Set<string>,
): Promise<EnrichableCandidate[]> {
  if (candidates.length === 0) return [];

  // Stage 1 — common-name filter using the pre-fetched Set.
  const afterStage1 = candidates.filter(
    (c) => !knownNames.has(normaliseCommonName(c.name)),
  );
  if (afterStage1.length === 0) return [];

  // Stage 2 — resolve sci-name per candidate. Source-provided
  // sciName (iNat/Wikidata/GBIF) takes the fast path; only Wikipedia
  // candidates need the per-call summary fetch.
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

/**
 * Iterate fetch + filter until we have `count` surviving candidates
 * OR we hit `maxIterations` OR a fetch round produces zero NEW
 * candidates (signalling we've drained the random sampling pool of
 * fresh names).
 *
 * Without iteration, a single fetch round produces ~3-4k unique
 * candidates from the 4 sources — at ~10k DB size, ~90% collide,
 * leaving ~200 survivors. Iterating across different random pages /
 * offsets in each source lets us extract the maximum the
 * combined-source long-tail actually supports.
 */
async function gatherEnoughCandidates(
  db: any,
  count: number,
): Promise<EnrichableCandidate[]> {
  const knownNames = await fetchKnownCommonNames(db);
  const seenThisSubmit = new Set<string>();
  const survivors: EnrichableCandidate[] = [];
  // Per-source counters for the fresh-rate skip heuristic.
  const fetchedBySource: Record<string, number> = {};
  const freshBySource: Record<string, number> = {};
  const skipSources = new Set<SourceName>();

  // Time budget — use up to 120s of the 150s background-task cap,
  // leaving ~30s for Gemini batch submission afterwards. Hard
  // safety cap on iterations at 12 so a runaway loop still has a
  // ceiling. Whichever fires first wins.
  const BUDGET_MS = 120_000;
  const HARD_MAX_ITERATIONS = 12;
  const startedAt = Date.now();

  for (let i = 0; i < HARD_MAX_ITERATIONS && survivors.length < count; i++) {
    if (Date.now() - startedAt >= BUDGET_MS) {
      log(FN, "gather_time_budget_hit", {
        iteration: i,
        elapsed_ms: Date.now() - startedAt,
        running_total: survivors.length,
        target: count,
      });
      break;
    }

    const raw = await fetchCandidatePlantNames(db, count, skipSources);
    // Track fetched volume per source (for the fresh-rate skip
    // decision after this iteration).
    for (const c of raw) {
      fetchedBySource[c.source] = (fetchedBySource[c.source] ?? 0) + 1;
    }

    // Dedupe against names we've already accepted (or rejected) this submit.
    const fresh = raw.filter((c) => {
      const key = c.name.toLowerCase();
      if (seenThisSubmit.has(key)) return false;
      seenThisSubmit.add(key);
      freshBySource[c.source] = (freshBySource[c.source] ?? 0) + 1;
      return true;
    });
    if (fresh.length === 0 && skipSources.size >= ACTIVE_SOURCES.length) {
      // All sources skipped AND nothing fresh — nothing left to gather.
      log(FN, "gather_all_sources_exhausted", { iteration: i, running_total: survivors.length });
      break;
    }

    const filtered = await filterCandidatesAgainstDbState(db, fresh, knownNames);
    survivors.push(...filtered);

    // After-the-iteration: mute any source whose fresh-rate has
    // dropped below threshold. Frees that source's 8s timeout
    // budget for the next iteration to use on productive sources.
    for (const s of ACTIVE_SOURCES) {
      if (skipSources.has(s)) continue;
      const fetched = fetchedBySource[s] ?? 0;
      const fresh = freshBySource[s] ?? 0;
      // Need enough sample size before judging (avoid muting on
      // a single bad iteration).
      if (fetched >= 100 && fresh / fetched < FRESH_RATE_THRESHOLD) {
        skipSources.add(s);
        log(FN, "gather_source_muted", { source: s, fetched, fresh, fresh_rate: fresh / fetched });
      }
    }

    log(FN, "gather_iteration", {
      iteration: i,
      raw: raw.length,
      fresh: fresh.length,
      filtered_in: filtered.length,
      running_total: survivors.length,
      target: count,
      elapsed_ms: Date.now() - startedAt,
      muted_sources: [...skipSources],
    });
  }

  return survivors.slice(0, count);
}

/** Format a name + optional sciName for the prompt list. Bracket
 *  form locks the scientific_name in the AI's response — see
 *  `_shared/plantSeedPrompt.ts` for the matching prompt instruction. */
function decorateForPrompt(c: EnrichableCandidate): string {
  return c.sciName ? `${c.name} [${c.sciName}]` : c.name;
}

/**
 * Pre-submission cost estimate. Pulls the median $/plant from the
 * last successful sync seed runs, halves for batch, and multiplies
 * by `count`. Falls back to a fixed per-plant estimate if there's
 * no history yet.
 */
async function estimateBatchCostUsd(db: any, count: number): Promise<number> {
  // Read up to the last 5 successful seed runs that processed >0 plants.
  const { data: recent } = await db
    .from("plant_library_runs")
    .select("count_inserted, total_cost_usd")
    .eq("kind", "seed")
    .in("status", ["succeeded", "partial"])
    .gt("count_inserted", 0)
    .order("started_at", { ascending: false })
    .limit(5);

  let perPlantSync = 0;
  if (recent && recent.length > 0) {
    const ratios = recent
      .map((r: { count_inserted: number; total_cost_usd: number | string }) => {
        const cost = Number(r.total_cost_usd ?? 0);
        const n = r.count_inserted;
        return n > 0 ? cost / n : 0;
      })
      .filter((x: number) => x > 0)
      .sort((a: number, b: number) => a - b);
    perPlantSync = ratios.length
      ? ratios[Math.floor(ratios.length / 2)] // median
      : 0;
  }

  if (perPlantSync === 0) {
    // No history — assume a typical enrichment call: ~1k input + ~1.5k
    // output tokens per plant on gemini-2.5-flash-lite.
    perPlantSync = estimateGeminiCostUsd(BATCH_MODEL, {
      promptTokenCount: 1000,
      candidatesTokenCount: 1500,
    });
  }

  return perPlantSync * count * 0.5; // 50% batch discount
}

/**
 * Long-running gather + submit, off the HTTP response path. Inserts
 * happen in three update waves so the admin UI shows accurate
 * status throughout:
 *
 *   1. Pre-insert (in handler): row created at `status='submitting'`
 *      with the cost estimate so the admin sees the batch appear
 *      immediately.
 *   2. After gather + Gemini submit: row updated to `status='pending'`
 *      with the gemini_batch_name. From this point the poll cron
 *      takes over.
 *   3. On any failure: row updated to `status='failed'` with
 *      error_message so the panel surfaces the reason.
 *
 * Pulled out of the request handler because for big counts (≥1000)
 * the iteration loop runs 60-90s, blowing past the edge function's
 * HTTP response timeout. `waitUntil` keeps the worker alive past
 * the response.
 */
async function backgroundGatherAndSubmit(
  db: any,
  apiKey: string,
  batchId: string,
  count: number,
): Promise<void> {
  try {
    const toEnrich = await gatherEnoughCandidates(db, count);
    log(FN, "candidates_gathered", {
      batch_id: batchId,
      requested: count,
      to_enrich: toEnrich.length,
    });
    if (toEnrich.length === 0) {
      await db
        .from("plant_library_batches")
        .update({
          status: "failed",
          error_message: "No unseen candidates produced from any source — library has saturated the popular-plant pool. Try smaller batches or re-run later.",
          completed_at: new Date().toISOString(),
        })
        .eq("id", batchId);
      return;
    }

    // Pack into BATCH_SIZE-plant batch lines, decorated with the
    // bracket-form sciName so AI uses the resolved binomial verbatim.
    const decoratedNames = toEnrich.map(decorateForPrompt);
    const lines: BatchRequestLine[] = [];
    for (let i = 0; i < decoratedNames.length; i += SEED_PROMPT_BATCH_SIZE) {
      const group = decoratedNames.slice(i, i + SEED_PROMPT_BATCH_SIZE);
      lines.push({
        key: `line-${Math.floor(i / SEED_PROMPT_BATCH_SIZE)}`,
        prompt: buildEnrichmentPrompt(group),
      });
    }

    // Persist the resolved candidate list + correct count BEFORE we
    // submit, so the admin can see what the batch actually contains
    // even if the Gemini submit later fails.
    await db
      .from("plant_library_batches")
      .update({
        count_requested: toEnrich.length,
        candidate_names: toEnrich.map((c) => c.name),
      })
      .eq("id", batchId);

    // Submit to Gemini.
    const submit = await submitGeminiBatch(
      apiKey,
      BATCH_MODEL,
      `plant-library-${batchId}`,
      lines,
      {
        temperature: 0.3,
        maxOutputTokens: 32768,
        responseSchema: SEED_BATCH_SCHEMA,
        responseMimeType: "application/json",
      },
    );

    await db
      .from("plant_library_batches")
      .update({
        status: "pending",
        gemini_batch_name: submit.name,
      })
      .eq("id", batchId);

    log(FN, "submit_succeeded", {
      batch_id: batchId,
      gemini_batch_name: submit.name,
      lines: lines.length,
      plants: toEnrich.length,
    });
  } catch (err: any) {
    await captureException(FN, err);
    await db
      .from("plant_library_batches")
      .update({
        status: "failed",
        error_message: String(err?.message ?? "background gather/submit failed").slice(0, 500),
        completed_at: new Date().toISOString(),
      })
      .eq("id", batchId);
    logError(FN, "background_failed", { batch_id: batchId, error: err?.message });
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
    const count = Math.max(1, Math.min(MAX_COUNT, Math.floor(rawCount)));
    const triggeredBy = typeof body.triggered_by === "string" ? body.triggered_by : null;

    log(FN, "submit_start", { count, triggered_by: triggeredBy });

    // Estimate cost upfront so the admin sees the figure on the row.
    // Cheap query (~50ms) — runs synchronously before the response.
    const estimatedCost = await estimateBatchCostUsd(db, count);

    // Insert the row immediately at `status='submitting'`. count_requested
    // is set to the user-requested value here; backgroundGather will
    // overwrite it with the actual survivor count before submitting.
    const { data: batchRow, error: insertErr } = await db
      .from("plant_library_batches")
      .insert({
        kind: "seed",
        triggered_by: triggeredBy,
        count_requested: count,
        candidate_names: [],
        model: BATCH_MODEL,
        estimated_cost_usd: estimatedCost,
        status: "submitting",
      })
      .select("id")
      .single();
    if (insertErr || !batchRow) throw insertErr ?? new Error("Failed to insert batch row");

    // Long-running gather + Gemini submit goes into waitUntil so it
    // doesn't block the HTTP response. The admin sees the row appear
    // immediately at 'submitting' and watches it flip to 'pending'
    // once the gather completes (typically 30-90s for big counts).
    // @ts-expect-error EdgeRuntime is only available at runtime.
    EdgeRuntime.waitUntil(backgroundGatherAndSubmit(db, apiKey, batchRow.id, count));

    return new Response(
      JSON.stringify({
        batch_id: batchRow.id,
        estimated_cost_usd: estimatedCost,
        status: "submitting",
      }),
      { status: 202, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    logError(FN, "fatal", { error: err?.message });
    await captureException(FN, err);
    return new Response(JSON.stringify({ error: err?.message ?? "unknown" }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
