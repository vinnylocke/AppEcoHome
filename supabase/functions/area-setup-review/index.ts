/**
 * area-setup-review — Add-Area wizard AI review (2026-07-18).
 *
 * Scores how well an area's configured conditions (growing medium,
 * texture, pH, water movement, nutrient source, peak light) suit the
 * plants placed in it — and the plants each other — and returns
 * actionable recommendations (companion plants, care tasks in the
 * TaskActionButtons shape, automation ideas).
 *
 * Request:  { homeId: string; areaId: string }
 * Response: AreaSetupReview (see _shared/areaSetupReview.ts)
 * Errors:   401/403 (auth / membership / AI tier), 404 (area),
 *           429 (rate limit), 502 (model output unusable)
 *
 * On-demand only — no cache table. Regenerate = call again (rate-limited).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { callGeminiCascade, toMessages } from "../_shared/gemini.ts";
import { log, error as logError } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import { guardAiByHome } from "../_shared/aiGuard.ts";
import { logAiUsage } from "../_shared/aiUsage.ts";
import { requireAuth } from "../_shared/requireAuth.ts";
import { enforceRateLimit } from "../_shared/rateLimit.ts";
import { requireHomeMembership } from "../_shared/requireHomeMembership.ts";
import {
  AREA_SETUP_REVIEW_SCHEMA,
  buildAreaSetupReviewPrompt,
  parseAreaSetupReview,
  type AreaSetupReviewInput,
  type ReviewPlantInput,
} from "../_shared/areaSetupReview.ts";

const FN = "area-setup-review";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

/** plants.sunlight is jsonb — string, string[], or junk. Coerce to string[]. */
function sunlightList(v: unknown): string[] | null {
  if (typeof v === "string" && v.trim()) return [v.trim()];
  if (Array.isArray(v)) {
    const list = v.filter((s): s is string => typeof s === "string" && s.trim() !== "");
    return list.length ? list : null;
  }
  return null;
}

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

    const { homeId, areaId } = await req.json() as { homeId: string; areaId: string };
    if (!homeId || !areaId) return json({ error: "homeId and areaId are required" }, 400);

    const membershipRes = await requireHomeMembership(db, homeId, userId);
    if (membershipRes) return membershipRes;

    const aiGuardRes = await guardAiByHome(db, homeId);
    if (aiGuardRes) return aiGuardRes;

    const rateLimitRes = await enforceRateLimit(db, userId, FN);
    if (rateLimitRes) return rateLimitRes;

    // ── Gather context ─────────────────────────────────────────────────
    const [{ data: areaRow }, { data: homeRow }, { data: items }] = await Promise.all([
      db.from("areas")
        .select("id, name, growing_medium, medium_texture, medium_ph, water_movement, nutrient_source, light_intensity_lux, locations(is_outside)")
        .eq("id", areaId)
        .maybeSingle(),
      db.from("homes").select("hardiness_zone, climate_zone").eq("id", homeId).maybeSingle(),
      db.from("inventory_items")
        .select("plant_id, plant_name")
        .eq("home_id", homeId)
        .eq("area_id", areaId)
        .neq("status", "Archived"),
    ]);
    if (!areaRow) return json({ error: "Area not found" }, 404);

    // Group instances by species and join their care columns.
    const byPlant = new Map<string, { plantId: number | null; name: string; quantity: number }>();
    for (const it of (items ?? []) as Array<{ plant_id: number | null; plant_name: string | null }>) {
      const key = it.plant_id != null ? `id:${it.plant_id}` : `name:${(it.plant_name ?? "").toLowerCase()}`;
      const existing = byPlant.get(key);
      if (existing) existing.quantity += 1;
      else byPlant.set(key, { plantId: it.plant_id, name: it.plant_name ?? "Unnamed plant", quantity: 1 });
    }

    const plantIds = [...byPlant.values()].map((p) => p.plantId).filter((id): id is number => id != null);
    const careById = new Map<number, Record<string, unknown>>();
    if (plantIds.length > 0) {
      const { data: plantRows } = await db
        .from("plants")
        .select("id, scientific_name, soil_ph_min, soil_ph_max, sunlight, watering_min_days, watering_max_days, soil_moisture_min, soil_moisture_max, soil_ec_min, soil_ec_max, soil_temp_min, soil_temp_max, hardiness_min, hardiness_max, cycle, is_toxic_pets, attracts")
        .in("id", plantIds);
      for (const p of (plantRows ?? []) as Array<Record<string, unknown>>) {
        careById.set(p.id as number, p);
      }
    }

    const plants: ReviewPlantInput[] = [...byPlant.values()].map((p) => {
      const care = p.plantId != null ? careById.get(p.plantId) : undefined;
      return {
        name: p.name,
        scientificName: (care?.scientific_name as string | null) ?? null,
        quantity: p.quantity,
        soilPhMin: (care?.soil_ph_min as number | null) ?? null,
        soilPhMax: (care?.soil_ph_max as number | null) ?? null,
        sunlight: sunlightList(care?.sunlight),
        wateringMinDays: (care?.watering_min_days as number | null) ?? null,
        wateringMaxDays: (care?.watering_max_days as number | null) ?? null,
        soilMoistureMin: (care?.soil_moisture_min as number | null) ?? null,
        soilMoistureMax: (care?.soil_moisture_max as number | null) ?? null,
        soilEcMin: (care?.soil_ec_min as number | null) ?? null,
        soilEcMax: (care?.soil_ec_max as number | null) ?? null,
        soilTempMin: (care?.soil_temp_min as number | null) ?? null,
        soilTempMax: (care?.soil_temp_max as number | null) ?? null,
        hardinessMin: (care?.hardiness_min as number | string | null) ?? null,
        hardinessMax: (care?.hardiness_max as number | string | null) ?? null,
        cycle: (care?.cycle as string | null) ?? null,
        isToxicPets: (care?.is_toxic_pets as boolean | null) ?? null,
        attracts: Array.isArray(care?.attracts) ? (care?.attracts as string[]) : null,
      };
    });

    const input: AreaSetupReviewInput = {
      area: {
        name: areaRow.name as string,
        isOutside: !!(areaRow as { locations?: { is_outside?: boolean } }).locations?.is_outside,
        growingMedium: (areaRow.growing_medium as string | null) ?? null,
        mediumTexture: (areaRow.medium_texture as string | null) ?? null,
        mediumPh: (areaRow.medium_ph as number | null) ?? null,
        waterMovement: (areaRow.water_movement as string | null) ?? null,
        nutrientSource: (areaRow.nutrient_source as string | null) ?? null,
        peakLightLux: (areaRow.light_intensity_lux as number | null) ?? null,
      },
      home: {
        hardinessZone: (homeRow?.hardiness_zone as number | string | null) ?? null,
        climateZone: (homeRow?.climate_zone as string | null) ?? null,
      },
      plants,
    };

    const prompt = buildAreaSetupReviewPrompt(input);
    log(FN, "request", { userId, areaId, plants: plants.length });

    const started = Date.now();
    const { text, usage } = await callGeminiCascade(
      geminiApiKey,
      FN,
      toMessages([prompt]),
      {
        responseSchema: AREA_SETUP_REVIEW_SCHEMA,
        responseMimeType: "application/json",
        temperature: 0.3,
        maxOutputTokens: 2048,
        logContext: { areaId },
      },
    );

    const review = parseAreaSetupReview(text);
    await logAiUsage(db, {
      homeId,
      userId,
      functionName: FN,
      action: "setup_review",
      usage,
      contextBlock: prompt,
      prompt,
      rawResult: text,
      durationMs: Date.now() - started,
      status: review ? "ok" : "error",
      error: review ? null : "unparseable model output",
    });

    if (!review) {
      logError(FN, "unparseable model output", { areaId });
      return json({ error: "The review came back unreadable — please try again." }, 502);
    }

    log(FN, "complete", { areaId, score: review.score, tokens: usage.totalTokenCount });
    return json(review);
  } catch (err) {
    logError(FN, "error", { error: err instanceof Error ? err.message : String(err) });
    await captureException(FN, err);
    return json({ error: "Internal server error" }, 500);
  }
});
