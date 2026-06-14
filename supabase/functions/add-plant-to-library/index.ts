// Plant Library — add a single plant by name (admin "AI search → Add" flow).
//
// The admin's AI search method surfaces AI-suggested plants. When one
// isn't yet in plant_library, the admin clicks "Add" → this function
// runs the same Gemini enrichment the bulk seeder uses (one plant, not
// a batch), dedups against scientific_name_key, inserts one row, and
// records a 1-row plant_library_runs entry for cost attribution.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { log, warn, error as logError } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import { callGeminiCascade, toMessages } from "../_shared/gemini.ts";
import { estimateGeminiCostUsd } from "../_shared/geminiCost.ts";
import {
  buildEnrichmentPrompt,
  salvageTruncatedPlants,
  SEED_BATCH_SCHEMA,
  seedRowToColumnShape,
} from "../_shared/plantSeedPrompt.ts";
import { computeSciKey } from "../_shared/plantNameSources.ts";
import { requireAuth } from "../_shared/requireAuth.ts";

const FN = "add-plant-to-library";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const apiKey = Deno.env.get("GEMINI_API_KEY") ?? "";
    if (!supabaseUrl || !serviceKey || !apiKey) {
      throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / GEMINI_API_KEY.");
    }
    const db = createClient(supabaseUrl, serviceKey);

    // Authenticated callers only (the admin screen is access-controlled
    // client-side; this is defense in depth + identifies who triggered it).
    const authResult = await requireAuth(req, db);
    if (authResult instanceof Response) return authResult;
    const userId = authResult.user.id;

    const body = await req.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return json({ error: "name is required" }, 400);

    log(FN, "request", { name, userId });

    // 1. Enrich the single plant via Gemini (same prompt + schema as the seeder).
    const { text, usage } = await callGeminiCascade(
      apiKey,
      FN,
      toMessages([buildEnrichmentPrompt([name])]),
      {
        temperature: 0.3,
        maxOutputTokens: 8192,
        responseSchema: SEED_BATCH_SCHEMA,
        responseMimeType: "application/json",
        maxRetriesPerModel: 1,
        timeoutMs: 20_000,
        logContext: { single_add: true },
      },
    );

    let parsed: { plants: any[] };
    try {
      parsed = JSON.parse(text);
    } catch {
      const salvaged = salvageTruncatedPlants(text);
      if (!salvaged?.plants?.length) {
        return json({ error: "AI couldn't return care data for that plant. Try a more specific name." }, 422);
      }
      parsed = salvaged;
    }

    const aiPlant = Array.isArray(parsed.plants) ? parsed.plants[0] : null;
    if (!aiPlant) {
      return json({ error: "No plant data returned." }, 422);
    }

    // 2. Dedup against scientific_name_key BEFORE insert.
    // scientific_name_key is a GENERATED column = lowercased + whitespace-
    // collapsed first scientific name (falling back to common name).
    // computeSciKey produces the exact same value the DB will compute.
    const sciRaw = Array.isArray(aiPlant.scientific_name)
      ? aiPlant.scientific_name[0]
      : aiPlant.scientific_name;
    const sciKey = computeSciKey(
      typeof sciRaw === "string" ? sciRaw : null,
      aiPlant.common_name ?? name,
    );
    if (sciKey) {
      const { data: existing } = await db
        .from("plant_library")
        .select("id, common_name")
        .eq("scientific_name_key", sciKey)
        .maybeSingle();
      if (existing) {
        return json({
          status: "already_exists",
          plant: existing,
          message: `"${existing.common_name}" is already in the library.`,
        });
      }
    }

    // 3. Cost attribution — create a 1-row seed run.
    const costUsd = estimateGeminiCostUsd(usage.model, {
      promptTokenCount: usage.promptTokenCount,
      candidatesTokenCount: usage.candidatesTokenCount,
      cachedContentTokenCount: usage.cachedContentTokenCount,
      thoughtsTokenCount: usage.thoughtsTokenCount,
    });
    const { data: runRow } = await db
      .from("plant_library_runs")
      .insert({
        kind: "seed",
        triggered_by: userId,
        count_requested: 1,
        count_inserted: 0,
        status: "running",
      })
      .select("id")
      .single();

    // 4. Insert the row.
    // Preserve the user's exact input as `common_name` — Gemini may
    // canonicalise "Sungold Tomato" → "Tomato", losing the cultivar the
    // user actually wanted to track. The scientific_name + care data
    // from Gemini are still authoritative; only the user-facing label is
    // pinned to what they typed.
    const userInputName = name.trim();
    const aiPlantWithUserName = {
      ...aiPlant,
      common_name: userInputName || aiPlant.common_name,
    };
    const row = seedRowToColumnShape(aiPlantWithUserName, { seeded_by_run_id: runRow?.id });
    if (!row) {
      if (runRow) {
        await db.from("plant_library_runs").update({ status: "failed", count_failed: 1, error_message: "row shape invalid" }).eq("id", runRow.id);
      }
      return json({ error: "Couldn't normalise the AI response into a library row." }, 422);
    }

    const { data: inserted, error: insertErr } = await db
      .from("plant_library")
      .insert(row)
      .select("id, common_name, scientific_name, is_edible, sunlight, watering")
      .single();

    if (insertErr) {
      // Unique violation = race; treat as already exists.
      if (insertErr.code === "23505") {
        if (runRow) await db.from("plant_library_runs").update({ status: "succeeded", count_skipped: 1 }).eq("id", runRow.id);
        return json({ status: "already_exists", message: "That plant is already in the library." });
      }
      if (runRow) await db.from("plant_library_runs").update({ status: "failed", count_failed: 1, error_message: insertErr.message }).eq("id", runRow.id);
      throw insertErr;
    }

    if (runRow) {
      await db.from("plant_library_runs").update({
        status: "succeeded",
        count_inserted: 1,
        finished_at: new Date().toISOString(),
        total_prompt_tokens: usage.promptTokenCount,
        total_candidates_tokens: usage.candidatesTokenCount,
        total_tokens: usage.totalTokenCount,
        total_cost_usd: costUsd,
      }).eq("id", runRow.id);
    }

    log(FN, "added", { id: inserted.id, name: inserted.common_name });
    return json({ status: "added", plant: inserted });
  } catch (err: any) {
    logError(FN, "error", { error: err.message });
    await captureException(FN, err);
    return json({ error: err.message ?? "Unknown error" }, 500);
  }
});
