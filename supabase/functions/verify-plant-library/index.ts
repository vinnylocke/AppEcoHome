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
    if (key in updates) {
      out[key as VerifiableField] = updates[key as VerifiableField];
    }
  }
  return out;
}

async function verifyOneRow(
  db: any,
  apiKey: string,
  runId: string,
  row: Record<string, unknown>,
): Promise<"matched" | "amended" | "failed"> {
  const id = row.id;
  const sci =
    Array.isArray(row.scientific_name) && (row.scientific_name as string[])[0]
      ? (row.scientific_name as string[])[0]
      : (row.common_name as string);

  const [wiki, gbif] = await Promise.all([
    fetchWikipediaSummary(sci),
    fetchGbifMatch(sci),
  ]);

  // No sources at all — leave verified_at null so a future run can
  // retry once external sources may have populated.
  if (!wiki && !gbif) {
    log(FN, "no_sources", { run_id: runId, id, sci });
    // Mark verified anyway so we don't churn forever on the same row.
    // Treated as "matched by default" — nothing said otherwise.
    await db
      .from("plant_library")
      .update({
        valid: true,
        verified_at: new Date().toISOString(),
        verified_by_run_id: runId,
      })
      .eq("id", id);
    return "matched";
  }

  const prompt = buildVerifyPrompt(row, wiki, gbif);

  const { text } = await callGeminiCascade(
    apiKey,
    FN,
    toMessages([prompt]),
    {
      temperature: 0.2,
      maxOutputTokens: 4096,
      responseSchema: VERIFY_SCHEMA,
      responseMimeType: "application/json",
      logContext: { run_id: runId, plant_id: id, sci },
    },
  );

  let parsed: { verdict: "matched" | "amended"; updates?: Record<string, unknown>; sources?: unknown[] };
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    logError(FN, "parse_failed", { run_id: runId, id, error: (err as Error).message });
    return "failed";
  }

  if (parsed.verdict === "matched") {
    await db
      .from("plant_library")
      .update({
        valid: true,
        verified_at: new Date().toISOString(),
        verified_by_run_id: runId,
      })
      .eq("id", id);
    return "matched";
  }

  // verdict === "amended"
  const updates = pickAllowedUpdates(parsed.updates ?? {});
  const sources = Array.isArray(parsed.sources) ? parsed.sources : [];
  await db
    .from("plant_library")
    .update({
      ...updates,
      valid: false,
      sources,
      verified_at: new Date().toISOString(),
      verified_by_run_id: runId,
    })
    .eq("id", id);
  return "amended";
}

async function updateRunProgress(
  db: any,
  runId: string,
  deltas: { matched?: number; amended?: number; failed?: number },
) {
  const { data: row } = await db
    .from("plant_library_runs")
    .select("count_matched, count_amended, count_failed")
    .eq("id", runId)
    .maybeSingle();
  if (!row) return;
  await db
    .from("plant_library_runs")
    .update({
      count_matched: row.count_matched + (deltas.matched ?? 0),
      count_amended: row.count_amended + (deltas.amended ?? 0),
      count_failed: row.count_failed + (deltas.failed ?? 0),
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
    const { data: rows } = await db
      .from("plant_library")
      .select("*")
      .is("verified_at", null)
      .order("seeded_at", { ascending: true })
      .limit(count);

    const targets = rows ?? [];
    log(FN, "rows_to_verify", { run_id: runId, count: targets.length });

    for (let i = 0; i < targets.length; i += BATCH_SIZE) {
      const batch = targets.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map((row: any) =>
          verifyOneRow(db, apiKey, runId, row).catch(() => "failed" as const),
        ),
      );
      const matched = results.filter((r: string) => r === "matched").length;
      const amended = results.filter((r: string) => r === "amended").length;
      const failed = results.filter((r: string) => r === "failed").length;
      await updateRunProgress(db, runId, { matched, amended, failed });
    }

    await db
      .from("plant_library_runs")
      .update({
        status: "succeeded",
        finished_at: new Date().toISOString(),
      })
      .eq("id", runId);
    log(FN, "run_succeeded", { run_id: runId });
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
