// generate-plant-sensor-ranges
//
// On-demand generation of a single plant's ideal soil ranges (moisture / EC /
// soil-temperature) for the "Soil Requirements" tab. Reuses the SAME shared
// prompt + schema + parser the library seeder and Area Coach use, so values
// stay consistent and, once written to the shared `plants` catalogue, are
// reused by every gardener with that plant.
//
// Resolution order (cheapest first):
//   1. library resolve — coalesce the plant's row with its `plant_library`
//      match (no Gemini). Free.
//   2. Gemini — only for the ranges STILL missing after the resolve (or all
//      six when `force`). Rate-limited + AI-gated.
// Persists to `plants` (fills the missing columns) and tops up the matching
// `plant_library` row's NULL columns (never overwriting verified values).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { callGeminiCascade, toMessages } from "../_shared/gemini.ts";
import { log, error as logError } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import { guardAiByHome } from "../_shared/aiGuard.ts";
import { logAiUsage } from "../_shared/aiUsage.ts";
import { requireAuth } from "../_shared/requireAuth.ts";
import { enforceRateLimit } from "../_shared/rateLimit.ts";
import { requireHomeMembership } from "../_shared/requireHomeMembership.ts";
import { mergeCareRanges, careMatchKey, type CareRanges } from "../_shared/careRanges.ts";
import { buildPlantCareRangePrompt, parseCareRangeResponse, CARE_RANGE_SCHEMA } from "../_shared/plantCareRangeGen.ts";

const FN = "generate-plant-sensor-ranges";

const RANGE_FIELDS = [
  "soil_moisture_min", "soil_moisture_max",
  "soil_ec_min", "soil_ec_max",
  "soil_temp_min", "soil_temp_max",
] as const;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const pickRanges = (r: CareRanges | undefined | null): Record<string, number | null> => {
  const out: Record<string, number | null> = {};
  for (const f of RANGE_FIELDS) out[f] = (r?.[f] as number | null | undefined) ?? null;
  return out;
};
const missingAny = (r: CareRanges | undefined | null) =>
  RANGE_FIELDS.some((f) => (r?.[f] as number | null | undefined) == null);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY")!;
    const db = createClient(supabaseUrl, serviceKey);

    const authResult = await requireAuth(req, db);
    if (authResult instanceof Response) return authResult;
    const userId = authResult.user.id;

    const { plantId, homeId, force } = await req.json() as {
      plantId: number; homeId?: string | null; force?: boolean;
    };
    if (typeof plantId !== "number" || !Number.isFinite(plantId) || plantId <= 0) {
      return json({ error: "plantId is required" }, 400);
    }

    // AI gate + rate limit are keyed on the caller's home (the plant catalogue
    // itself is global). homeId is required so we can enforce both.
    if (!homeId) return json({ error: "homeId is required" }, 400);
    const membershipRes = await requireHomeMembership(db, homeId, userId);
    if (membershipRes) return membershipRes;
    const aiGuardRes = await guardAiByHome(db, homeId);
    if (aiGuardRes) return aiGuardRes;

    const { data: plant } = await db.from("plants")
      .select("id, common_name, scientific_name, soil_moisture_min, soil_moisture_max, soil_ec_min, soil_ec_max, soil_temp_min, soil_temp_max")
      .eq("id", plantId)
      .maybeSingle();
    if (!plant) return json({ error: "Plant not found" }, 404);

    const key = careMatchKey(plant.scientific_name, plant.common_name);
    let libRow: CareRanges | null = null;
    if (key) {
      const { data: lib } = await db.from("plant_library")
        .select("scientific_name_key, soil_moisture_min, soil_moisture_max, soil_ec_min, soil_ec_max, soil_temp_min, soil_temp_max")
        .eq("scientific_name_key", key)
        .maybeSingle();
      libRow = (lib as unknown as CareRanges) ?? null;
    }

    // 1) Library resolve (free). On `force`, ignore existing values and go
    //    straight to a fresh AI generation.
    let resolved: CareRanges = force
      ? ({} as CareRanges)
      : mergeCareRanges(plant as Partial<CareRanges>, libRow ?? undefined);

    // 2) Gemini for whatever is still missing (all six on force).
    if (force || missingAny(resolved)) {
      const rateLimitRes = await enforceRateLimit(db, userId, FN);
      if (rateLimitRes) return rateLimitRes;

      const prompt = buildPlantCareRangePrompt({ common_name: plant.common_name, scientific_name: plant.scientific_name });
      const { text, usage } = await callGeminiCascade(
        geminiApiKey,
        "plant-care-ranges",
        toMessages([prompt]),
        { responseSchema: CARE_RANGE_SCHEMA, responseMimeType: "application/json", temperature: 0.2, maxOutputTokens: 512, logContext: { plantId } },
      );
      const gen = parseCareRangeResponse(text);
      await logAiUsage(db, { userId, homeId, functionName: "plant-care-ranges", action: "generate_plant_sensor_ranges", usage, contextBlock: prompt, prompt, rawResult: text });
      if (gen) {
        // On force, the fresh AI values win outright; otherwise they only fill gaps.
        resolved = force ? mergeCareRanges(gen as Partial<CareRanges>, undefined) : mergeCareRanges(resolved, gen);
      }
    }

    // Persist to `plants`. On force, overwrite the six columns with the fresh
    // resolution; otherwise only fill the columns that were NULL.
    const plantPatch: Record<string, number> = {};
    for (const f of RANGE_FIELDS) {
      const val = resolved[f] as number | null | undefined;
      if (val == null) continue;
      if (force || (plant as Record<string, unknown>)[f] == null) plantPatch[f] = val;
    }
    if (Object.keys(plantPatch).length > 0) {
      const { error } = await db.from("plants").update(plantPatch).eq("id", plantId);
      if (error) logError(FN, "plant_range_persist_failed", { plantId, message: error.message });
    }

    // Top up the library row's NULL columns only (never clobber verified values).
    if (key && libRow) {
      const libPatch: Record<string, number> = {};
      for (const f of RANGE_FIELDS) {
        const val = resolved[f] as number | null | undefined;
        if (val != null && (libRow as unknown as Record<string, unknown>)[f] == null) libPatch[f] = val;
      }
      if (Object.keys(libPatch).length > 0) {
        const { error } = await db.from("plant_library").update(libPatch).eq("scientific_name_key", key);
        if (error) logError(FN, "library_range_persist_failed", { key, message: error.message });
      }
    }

    log(FN, "done", { plantId, filled: Object.keys(plantPatch).length });
    return json({ ranges: pickRanges(resolved) });
  } catch (err) {
    await captureException(FN, err);
    logError(FN, "unhandled", { message: err instanceof Error ? err.message : String(err) });
    return json({ error: "Failed to generate soil requirements" }, 500);
  }
});
