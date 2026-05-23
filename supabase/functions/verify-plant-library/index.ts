// Plant Library verifier.
//
// Picks `plant_library` rows where `verified_at IS NULL`, cross-checks
// each against Wikipedia + GBIF, asks Gemini whether our data matches
// the online sources under a tolerance-banded rubric (see the prompt
// below). Outcome per row:
//
//   matched  → valid = true; no further writes
//   amended  → overwrite the diverging fields with AI's correction;
//              valid = false; sources jsonb stores the cited URLs.
//
// Same fire-and-forget pattern as the seed fn: respond with run_id,
// continue work in the background via EdgeRuntime.waitUntil.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { log, error as logError } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import { callGeminiCascade, toMessages } from "../_shared/gemini.ts";
import { estimateGeminiCostUsd } from "../_shared/geminiCost.ts";
import {
  fetchWikipediaSummary,
  fetchGbifMatch,
} from "../_shared/plantLibrarySources.ts";

const FN = "verify-plant-library";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 10;
/**
 * After this many failed attempts the verifier default-passes the row
 * (valid = true) so the seed→verify pipeline doesn't churn the same
 * broken rows every cron run. The `verification_error` column still
 * captures what went wrong, so admins can investigate.
 */
const MAX_ATTEMPTS = 3;

/** Fields the verifier must coerce to a finite number before applying. */
const NUMERIC_FIELDS = new Set([
  "watering_min_days", "watering_max_days",
  "days_to_harvest_min", "days_to_harvest_max",
  "soil_ph_min", "soil_ph_max",
]);

// Fields the verifier is allowed to amend. We accept partial updates
// targeted only at the columns that diverged so the AI doesn't rewrite
// the whole row on every call.
const VERIFIABLE_FIELDS = [
  "common_name", "scientific_name", "family", "plant_type", "cycle",
  "care_level", "watering", "watering_min_days", "watering_max_days",
  "sunlight", "hardiness_min", "hardiness_max", "growth_rate", "growth_habit",
  "maintenance", "is_edible", "is_toxic_pets", "is_toxic_humans",
  "attracts", "description", "drought_tolerant", "salt_tolerant",
  "flowers", "fruits", "indoor", "invasive", "flowering_season",
  "harvest_season", "propagation", "pest_susceptibility", "soil",
  "soil_ph_min", "soil_ph_max", "days_to_harvest_min", "days_to_harvest_max",
] as const;

type VerifiableField = typeof VERIFIABLE_FIELDS[number];

const VERIFY_SCHEMA = {
  type: "OBJECT",
  properties: {
    verdict: { type: "STRING", enum: ["matched", "amended"] },
    /** Only present when verdict = 'amended'. Subset of the row's fields. */
    updates: { type: "OBJECT" },
    sources: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          url:         { type: "STRING" },
          title:       { type: "STRING" },
          source:      { type: "STRING", enum: ["wikipedia", "gbif"] },
          licence:     { type: "STRING" },
          accessed_at: { type: "STRING" },
        },
        required: ["url", "source", "licence"],
      },
    },
  },
  required: ["verdict"],
};

function buildVerifyPrompt(
  row: Record<string, unknown>,
  wiki: { url: string; title: string; extract: string; licence: string; accessed_at: string } | null,
  gbif: { url: string; canonical_name: string; family: string | null; rank: string | null; status: string | null; licence: string; accessed_at: string } | null,
): string {
  const wikiBlock = wiki
    ? `WIKIPEDIA (${wiki.licence}, ${wiki.url}, accessed ${wiki.accessed_at}):
Title: ${wiki.title}
${wiki.extract}`
    : "WIKIPEDIA: no result";
  const gbifBlock = gbif
    ? `GBIF TAXONOMY (${gbif.licence}, ${gbif.url}, accessed ${gbif.accessed_at}):
Canonical name: ${gbif.canonical_name}
Family: ${gbif.family ?? "(unknown)"}
Rank: ${gbif.rank ?? "(unknown)"}
Status: ${gbif.status ?? "(unknown)"}`
    : "GBIF: no result";

  return `You are verifying a plant library row against two free, attributable sources.

OUR ROW (JSON):
${JSON.stringify(row, null, 2)}

${wikiBlock}

${gbifBlock}

TASK
Compare our row to the sources above using these tolerance rules:

- watering_min_days / watering_max_days: within ±2 days OR overlapping range → OK
- watering category (frequent/average/minimum): exact → OK
- sunlight (array): at least one overlapping category → OK
- cycle (annual/perennial/biennial): exact → OK
- care_level: within one step (low/medium/high) → OK
- hardiness_min / hardiness_max: within ±1 USDA zone → OK
- is_edible / is_toxic_pets / is_toxic_humans: EXACT — no tolerance
- family / plant_type / propagation / flowering_season / harvest_season: set-overlap → OK
- description: semantic-match only; verbatim differences are OK
- All other jsonb arrays: set-overlap → OK

OUTPUT
Return JSON matching the schema:

If our row passes ALL applicable rules against the sources, return:
  { "verdict": "matched" }

Otherwise return:
  {
    "verdict": "amended",
    "updates": { ...only the fields that failed, with corrected values... },
    "sources": [ { "url", "title", "source", "licence", "accessed_at" }, ... ]
  }

RULES FOR CORRECTIONS
- When you correct \`description\`, WRITE A NEW DESCRIPTION IN YOUR OWN WORDS. Do NOT copy or paraphrase Wikipedia. Use Wikipedia only to verify facts.
- Cite EVERY source you actually used in the \`sources\` array (URL + title + source + licence + accessed_at).
- For \`scientific_name\`, prefer the GBIF \`canonical_name\` when our value differs.
- If both Wikipedia and GBIF returned nothing useful, return { "verdict": "matched" } — we have nothing to verify against.

No prose, no markdown — JSON only.`;
}

function pickAllowedUpdates(updates: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of VERIFIABLE_FIELDS) {
    if (!(key in updates)) continue;
    const raw = updates[key as VerifiableField];
    if (NUMERIC_FIELDS.has(key as string)) {
      // AI sometimes returns numeric fields as strings like "7" or
      // "7-10 days" — postgres rejects the update on type mismatch
      // and we used to silently lose the whole row. Coerce + skip
      // when we can't get a finite number.
      const n = typeof raw === "number" ? raw : Number(String(raw).replace(/[^\d.\-]/g, ""));
      if (!Number.isFinite(n)) continue;
      out[key as VerifiableField] = n;
      continue;
    }
    out[key as VerifiableField] = raw;
  }
  return out;
}

/**
 * Throw on any Supabase update error. Used to surface silent type-
 * mismatch failures into the row's verification_error column rather
 * than letting the row stay un-verified-but-counted.
 */
async function updateOrThrow(
  db: any,
  id: number,
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await db
    .from("plant_library")
    .update(patch)
    .eq("id", id);
  if (error) throw new Error(`update failed: ${error.message}`);
}

/**
 * On any verification failure, increment the attempt counter, record
 * the error, and — once we've hit MAX_ATTEMPTS — default-pass the row
 * (valid = true, verified_at = now()) so it stops churning.
 */
async function recordFailure(
  db: any,
  id: number,
  runId: string,
  current: { verification_attempts?: number | null },
  reason: string,
): Promise<"failed" | "default_passed"> {
  const nextAttempts = (current.verification_attempts ?? 0) + 1;
  if (nextAttempts >= MAX_ATTEMPTS) {
    await db
      .from("plant_library")
      .update({
        verification_attempts: nextAttempts,
        verification_error: `default-passed after ${nextAttempts} failed attempts: ${reason}`,
        valid: true,
        verified_at: new Date().toISOString(),
        verified_by_run_id: runId,
      })
      .eq("id", id);
    return "default_passed";
  }
  await db
    .from("plant_library")
    .update({
      verification_attempts: nextAttempts,
      verification_error: reason,
    })
    .eq("id", id);
  return "failed";
}

interface VerifyOutcome {
  result: "matched" | "amended" | "failed";
  promptTokens: number;
  candidatesTokens: number;
  cachedTokens: number;
  thoughtsTokens: number;
  totalTokens: number;
  costUsd: number;
}

async function verifyOneRow(
  db: any,
  apiKey: string,
  runId: string,
  row: Record<string, unknown>,
): Promise<VerifyOutcome> {
  const id = row.id as number;
  const sci =
    Array.isArray(row.scientific_name) && (row.scientific_name as string[])[0]
      ? (row.scientific_name as string[])[0]
      : (row.common_name as string);
  const currentAttempts =
    typeof row.verification_attempts === "number"
      ? (row.verification_attempts as number)
      : 0;

  // Token usage accumulator — populated only when the AI call
  // actually happens (no-sources path returns zero).
  const usage = {
    promptTokens: 0,
    candidatesTokens: 0,
    cachedTokens: 0,
    thoughtsTokens: 0,
    totalTokens: 0,
    costUsd: 0,
  };

  // Single top-level try/catch — ANY failure (network blip, AI throw,
  // parse failure, postgres type mismatch) routes through
  // `recordFailure` so the row eventually default-passes after
  // MAX_ATTEMPTS instead of looping forever.
  try {
    const [wiki, gbif] = await Promise.all([
      fetchWikipediaSummary(sci),
      fetchGbifMatch(sci),
    ]);

    // No sources at all — treat as "matched by default" so we don't
    // churn forever on plants neither Wikipedia nor GBIF know about.
    if (!wiki && !gbif) {
      log(FN, "no_sources", { run_id: runId, id, sci });
      await updateOrThrow(db, id, {
        valid: true,
        verified_at: new Date().toISOString(),
        verified_by_run_id: runId,
        verification_error: null,
      });
      return { result: "matched", ...usage };
    }

    const prompt = buildVerifyPrompt(row, wiki, gbif);

    const { text, usage: callUsage } = await callGeminiCascade(
      apiKey,
      FN,
      toMessages([prompt]),
      {
        temperature: 0.2,
        maxOutputTokens: 4096,
        responseSchema: VERIFY_SCHEMA,
        responseMimeType: "application/json",
        // Bumped from the default 2 — Gemini Flash overload events
        // shouldn't kill an entire row's verification when the
        // cascade still has Pro to fall through to.
        maxRetriesPerModel: 3,
        logContext: { run_id: runId, plant_id: id, sci },
      },
    );

    // Track the AI cost regardless of verdict — the call happened,
    // tokens were billed. Full breakdown so the cost estimate
    // accounts for cached input + Pro-model thinking tokens.
    usage.promptTokens = callUsage.promptTokenCount ?? 0;
    usage.candidatesTokens = callUsage.candidatesTokenCount ?? 0;
    usage.cachedTokens = callUsage.cachedContentTokenCount ?? 0;
    usage.thoughtsTokens = callUsage.thoughtsTokenCount ?? 0;
    usage.totalTokens = callUsage.totalTokenCount ?? 0;
    usage.costUsd = estimateGeminiCostUsd(callUsage.model, {
      promptTokenCount: usage.promptTokens,
      candidatesTokenCount: usage.candidatesTokens,
      cachedContentTokenCount: usage.cachedTokens,
      thoughtsTokenCount: usage.thoughtsTokens,
    });

    let parsed: { verdict: "matched" | "amended"; updates?: Record<string, unknown>; sources?: unknown[] };
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      throw new Error(`parse failed: ${(err as Error).message}`);
    }
    if (parsed.verdict !== "matched" && parsed.verdict !== "amended") {
      throw new Error(`unexpected verdict: ${JSON.stringify(parsed.verdict)}`);
    }

    if (parsed.verdict === "matched") {
      await updateOrThrow(db, id, {
        valid: true,
        verified_at: new Date().toISOString(),
        verified_by_run_id: runId,
        verification_error: null,
      });
      return { result: "matched", ...usage };
    }

  // verdict === "amended"
  const updates = pickAllowedUpdates(parsed.updates ?? {});

  // Build the sources array deterministically from whichever external
  // sources actually returned data. We don't rely on the AI to cite
  // its work — by the time we get here we KNOW exactly what was made
  // available to it. Anything the AI explicitly cited beyond these
  // two known sources is merged on top (deduped by url) so we never
  // lose information.
  const knownSources: Array<{
    url: string;
    title: string;
    source: "wikipedia" | "gbif";
    licence: string;
    accessed_at: string;
  }> = [];
  if (wiki) {
    knownSources.push({
      url: wiki.url,
      title: wiki.title,
      source: "wikipedia",
      licence: wiki.licence,
      accessed_at: wiki.accessed_at,
    });
  }
  if (gbif) {
    knownSources.push({
      url: gbif.url,
      title: `GBIF taxonomy backbone — ${gbif.canonical_name}`,
      source: "gbif",
      licence: gbif.licence,
      accessed_at: gbif.accessed_at,
    });
  }

  const aiSources = Array.isArray(parsed.sources) ? parsed.sources : [];
  const seenUrls = new Set(knownSources.map((s) => s.url));
  for (const aiSrc of aiSources) {
    const url = (aiSrc as { url?: string })?.url;
    if (!url || seenUrls.has(url)) continue;
    knownSources.push(aiSrc as never);
    seenUrls.add(url);
  }

    await updateOrThrow(db, id, {
      ...updates,
      valid: false,
      sources: knownSources,
      verified_at: new Date().toISOString(),
      verified_by_run_id: runId,
      verification_error: null,
    });
    return { result: "amended", ...usage };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    logError(FN, "row_verification_failed", { run_id: runId, id, sci, reason });
    const outcome = await recordFailure(
      db,
      id,
      runId,
      { verification_attempts: currentAttempts },
      reason,
    );
    // A default-pass counts as a successful resolution for the run
    // counter (the row is now valid=true). A "failed" leaves the row
    // unresolved and the run counts the failure as before.
    return {
      result: outcome === "default_passed" ? "matched" : "failed",
      ...usage,
    };
  }
}

async function updateRunProgress(
  db: any,
  runId: string,
  deltas: {
    matched?: number;
    amended?: number;
    failed?: number;
    promptTokens?: number;
    candidatesTokens?: number;
    cachedTokens?: number;
    thoughtsTokens?: number;
    totalTokens?: number;
    costUsd?: number;
  },
) {
  const { data: row } = await db
    .from("plant_library_runs")
    .select(
      "count_matched, count_amended, count_failed, total_prompt_tokens, total_candidates_tokens, total_cached_tokens, total_thoughts_tokens, total_tokens, total_cost_usd",
    )
    .eq("id", runId)
    .maybeSingle();
  if (!row) return;
  // Heartbeat lands on every batch — admin sweep uses it to spot
  // dead-but-still-running rows. Token / cost totals accumulate so
  // the admin can see what each verify run actually cost.
  await db
    .from("plant_library_runs")
    .update({
      count_matched: row.count_matched + (deltas.matched ?? 0),
      count_amended: row.count_amended + (deltas.amended ?? 0),
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
    })
    .eq("id", runId);
}

async function backgroundVerify(
  db: any,
  apiKey: string,
  runId: string,
  count: number,
) {
  try {
    // Stamp a heartbeat immediately so the admin sweep can't
    // false-positive a verify run that's still spinning up.
    await db
      .from("plant_library_runs")
      .update({ last_heartbeat_at: new Date().toISOString() })
      .eq("id", runId);

    // Pick only rows that are TRULY unverified. We require BOTH
    // `verified_at IS NULL` AND `valid IS NULL` — every code path
    // that sets either column sets both together, but the double
    // filter guarantees we can never re-pick a row that's already
    // matched, amended, or default-passed even if the two ever drift
    // out of sync.
    const { data: rows } = await db
      .from("plant_library")
      .select("*")
      .is("verified_at", null)
      .is("valid", null)
      .order("seeded_at", { ascending: true })
      .limit(count);

    const targets = rows ?? [];
    log(FN, "rows_to_verify", { run_id: runId, count: targets.length });

    for (let i = 0; i < targets.length; i += BATCH_SIZE) {
      const batch = targets.slice(i, i + BATCH_SIZE);
      const outcomes = await Promise.all(
        batch.map((row: any) =>
          verifyOneRow(db, apiKey, runId, row).catch(() => ({
            result: "failed" as const,
            promptTokens: 0,
            candidatesTokens: 0,
            cachedTokens: 0,
            thoughtsTokens: 0,
            totalTokens: 0,
            costUsd: 0,
          })),
        ),
      );
      const matched = outcomes.filter((o) => o.result === "matched").length;
      const amended = outcomes.filter((o) => o.result === "amended").length;
      const failed = outcomes.filter((o) => o.result === "failed").length;
      const promptTokens = outcomes.reduce((sum, o) => sum + o.promptTokens, 0);
      const candidatesTokens = outcomes.reduce(
        (sum, o) => sum + o.candidatesTokens,
        0,
      );
      const cachedTokens = outcomes.reduce((sum, o) => sum + o.cachedTokens, 0);
      const thoughtsTokens = outcomes.reduce(
        (sum, o) => sum + o.thoughtsTokens,
        0,
      );
      const totalTokens = outcomes.reduce((sum, o) => sum + o.totalTokens, 0);
      const costUsd = outcomes.reduce((sum, o) => sum + o.costUsd, 0);
      await updateRunProgress(db, runId, {
        matched,
        amended,
        failed,
        promptTokens,
        candidatesTokens,
        cachedTokens,
        thoughtsTokens,
        totalTokens,
        costUsd,
      });
    }

    // Reflect partial failures in the final status — same rule as
    // the seeder.
    const { data: final } = await db
      .from("plant_library_runs")
      .select("count_matched, count_amended, count_failed")
      .eq("id", runId)
      .maybeSingle();
    const matched = final?.count_matched ?? 0;
    const amended = final?.count_amended ?? 0;
    const failed = final?.count_failed ?? 0;
    const finalStatus =
      failed > 0 && matched + amended === 0
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
    log(FN, "run_finished", { run_id: runId, status: finalStatus, matched, amended, failed });
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
    logError(FN, "run_failed", { run_id: runId, error: err?.message });
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
    const rawCount = typeof body.count === "number" ? body.count : 2000;
    const count = Math.max(1, Math.min(5000, Math.floor(rawCount)));
    const triggeredBy = typeof body.triggered_by === "string" ? body.triggered_by : null;

    const { data: run, error: runError } = await db
      .from("plant_library_runs")
      .insert({
        kind: "verify",
        triggered_by: triggeredBy,
        count_requested: count,
      })
      .select("id")
      .single();
    if (runError || !run) throw runError ?? new Error("Failed to create run row");

    log(FN, "started", { run_id: run.id, count, triggered_by: triggeredBy });

    // @ts-expect-error EdgeRuntime is only available at runtime.
    EdgeRuntime.waitUntil(backgroundVerify(db, apiKey, run.id, count));

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
