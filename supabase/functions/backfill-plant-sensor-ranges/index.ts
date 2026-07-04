// backfill-plant-sensor-ranges
//
// Daily cron that guarantees our knowledge base has a soil-range record for
// every plant. It sweeps `plant_library` first, then the global `plants`
// catalogue, for rows missing any of the six soil-range columns, and fills
// ONLY the NULLs with AI-generated values (reusing the shared care-range
// prompt/schema/parser). Existing values — including verified library values —
// are never overwritten. New library rows already get ranges from the seeder;
// this is the belt-and-braces sweep for older/missed rows.
//
// - Cron only (no JWT — invoked via the service-role header on the pg_net call,
//   same pattern as refresh-stale-ai-plants).
// - Bounded batch (env BACKFILL_BATCH_SIZE, default 25) across both tables.
// - Per-row try/catch; a bad row logs + continues.
// - System AI-usage attribution ({ userId: null, homeId: null }) so cost lands
//   on no user's quota.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { log, error as logError } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import { callGeminiCascade, toMessages } from "../_shared/gemini.ts";
import { logAiUsage } from "../_shared/aiUsage.ts";
import { buildPlantCareRangePrompt, parseCareRangeResponse, CARE_RANGE_SCHEMA } from "../_shared/plantCareRangeGen.ts";
import { needsRangeBackfill, buildRangePatch, SENSOR_RANGE_FIELDS } from "../_shared/sensorRangeBackfill.ts";

const FN = "backfill-plant-sensor-ranges";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RANGE_COLS = SENSOR_RANGE_FIELDS.join(", ");
// PostgREST OR filter: "any of the six columns is null".
const ANY_NULL = SENSOR_RANGE_FIELDS.map((f) => `${f}.is.null`).join(",");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const apiKey = Deno.env.get("GEMINI_API_KEY")!;
  const batchSize = Number(Deno.env.get("BACKFILL_BATCH_SIZE") ?? "25");
  const db = createClient(supabaseUrl, serviceKey);

  let filledLibrary = 0;
  let filledPlants = 0;
  let scanned = 0;

  const generateRanges = async (common_name: string, scientific_name: unknown, ctx: Record<string, unknown>) => {
    const prompt = buildPlantCareRangePrompt({ common_name, scientific_name });
    const { text, usage } = await callGeminiCascade(
      apiKey, "plant-care-ranges", toMessages([prompt]),
      { responseSchema: CARE_RANGE_SCHEMA, responseMimeType: "application/json", temperature: 0.2, maxOutputTokens: 512, logContext: ctx },
    );
    // System-level attribution — cron cost lands on no user's quota.
    await logAiUsage(db, { userId: null, homeId: null, functionName: "plant-care-ranges", action: "care_range_backfill", usage, contextBlock: prompt, prompt, rawResult: text });
    return parseCareRangeResponse(text);
  };

  try {
    // ── 1. Library first (the canonical knowledge base) ──────────────────────
    const { data: libRows, error: libErr } = await db
      .from("plant_library")
      .select(`id, common_name, scientific_name, ${RANGE_COLS}`)
      .or(ANY_NULL)
      .order("id", { ascending: true })
      .limit(batchSize);
    if (libErr) logError(FN, "library_query_failed", { message: libErr.message });

    for (const row of libRows ?? []) {
      if (!needsRangeBackfill(row as unknown as Record<string, unknown>)) continue;
      scanned++;
      try {
        const gen = await generateRanges((row as any).common_name, (row as any).scientific_name, { table: "plant_library", id: (row as any).id });
        const patch = buildRangePatch(row as unknown as Record<string, unknown>, gen ?? undefined);
        if (Object.keys(patch).length > 0) {
          const { error } = await db.from("plant_library").update(patch).eq("id", (row as any).id);
          if (error) logError(FN, "library_update_failed", { id: (row as any).id, message: error.message });
          else filledLibrary++;
        }
      } catch (e) {
        logError(FN, "library_row_failed", { id: (row as any).id, message: e instanceof Error ? e.message : String(e) });
      }
      await sleep(500);
    }

    // ── 2. Global plants catalogue — remaining budget ────────────────────────
    const remaining = Math.max(0, batchSize - scanned);
    if (remaining > 0) {
      const { data: plantRows, error: plantErr } = await db
        .from("plants")
        .select(`id, common_name, scientific_name, ${RANGE_COLS}`)
        .is("home_id", null)
        .in("source", ["api", "ai", "verdantly"])
        .or(ANY_NULL)
        .order("id", { ascending: true })
        .limit(remaining);
      if (plantErr) logError(FN, "plants_query_failed", { message: plantErr.message });

      for (const row of plantRows ?? []) {
        if (!needsRangeBackfill(row as unknown as Record<string, unknown>)) continue;
        try {
          const gen = await generateRanges((row as any).common_name, (row as any).scientific_name, { table: "plants", id: (row as any).id });
          const patch = buildRangePatch(row as unknown as Record<string, unknown>, gen ?? undefined);
          if (Object.keys(patch).length > 0) {
            const { error } = await db.from("plants").update(patch).eq("id", (row as any).id);
            if (error) logError(FN, "plants_update_failed", { id: (row as any).id, message: error.message });
            else filledPlants++;
          }
        } catch (e) {
          logError(FN, "plants_row_failed", { id: (row as any).id, message: e instanceof Error ? e.message : String(e) });
        }
        await sleep(500);
      }
    }

    const summary = { filledLibrary, filledPlants, batchSize };
    log(FN, "complete", summary);
    return new Response(JSON.stringify({ message: "Sensor-range backfill complete.", ...summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logError(FN, "error", { error: message });
    await captureException(FN, err, {});
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
    });
  }
});
