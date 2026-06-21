// refresh-stale-ai-plants
//
// AI Plant Overhaul Wave 4 — daily cron that walks global AI plants whose
// care guide hasn't been verified in the last 90 days, re-asks Gemini,
// diffs the result, and bumps the row's freshness_version only when
// something genuinely changed.
//
// - Cron only (no JWT auth — invoked via service-role header on the
//   pg_net call inside the cron schedule, same pattern as
//   purge-stale-species-cache).
// - Filters: source='ai' AND home_id IS NULL → globals only. Forks
//   (home_id != null) are never touched here; they're owned by the home.
// - Batch capped at STALE_CHECK_BATCH_SIZE (env, default 25). Ramp from
//   10 → 25 on first production runs to validate cost in the Audit Log.
// - Per-plant try/catch — a bad plant logs to Sentry, the rest of the
//   batch still runs.
// - Idempotent: `last_freshness_check_at` is updated only after the
//   per-plant work succeeds. Crash mid-batch → next run picks up the
//   unprocessed plants.
// - System AI-usage attribution: { userId: null, homeId: null } against
//   ai_usage_log so the cost doesn't land on any user's quota.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { log, error as logError } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import { callGeminiCascade, toMessages } from "../_shared/gemini.ts";
import { refreshStaleAiPlants } from "../_shared/refreshStaleAiPlants.ts";

const FN = "refresh-stale-ai-plants";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Mirrors manual-refresh-ai-plant's schema so both surfaces produce the same
// shape of care_guide_data. Seasonal enums are server-enforced.
const CARE_GUIDE_SCHEMA = {
  type: "OBJECT",
  properties: {
    plantData: {
      type: "OBJECT",
      properties: {
        common_name:       { type: "STRING" },
        scientific_name:   { type: "ARRAY", items: { type: "STRING" } },
        description:       { type: "STRING" },
        plant_type:        { type: "STRING" },
        cycle:             { type: "STRING" },
        care_level:        { type: "STRING" },
        growth_rate:       { type: "STRING" },
        maintenance:       { type: "STRING" },
        watering_min_days: { type: "NUMBER" },
        watering_max_days: { type: "NUMBER" },
        sunlight:          { type: "ARRAY", items: { type: "STRING" } },
        flowering_season: {
          type: "ARRAY",
          description: "Seasons in which the plant flowers. Each element MUST be one of: 'Spring', 'Summer', 'Autumn', 'Winter'.",
          items: { type: "STRING", enum: ["Spring", "Summer", "Autumn", "Winter"] },
        },
        harvest_season: {
          type: "ARRAY",
          description: "Seasons in which the plant is ready to harvest. Each element MUST be one of: 'Spring', 'Summer', 'Autumn', 'Winter'.",
          items: { type: "STRING", enum: ["Spring", "Summer", "Autumn", "Winter"] },
        },
        pruning_month: {
          type: "ARRAY",
          description: "Abbreviated month names. Each element MUST be one of: 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'.",
          items: { type: "STRING", enum: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] },
        },
        propagation:       { type: "ARRAY", items: { type: "STRING" } },
        attracts:          { type: "ARRAY", items: { type: "STRING" } },
        is_toxic_pets:     { type: "BOOLEAN" },
        is_toxic_humans:   { type: "BOOLEAN" },
        indoor:            { type: "BOOLEAN" },
        is_edible:         { type: "BOOLEAN" },
      },
      required: ["common_name", "scientific_name", "description", "plant_type", "cycle", "care_level", "watering_min_days", "watering_max_days", "sunlight"],
    },
  },
  required: ["plantData"],
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const apiKey = Deno.env.get("GEMINI_API_KEY")!;
  const batchSize = Number(Deno.env.get("STALE_CHECK_BATCH_SIZE") ?? "25");

  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const summary = await refreshStaleAiPlants(
      supabase,
      async (commonName: string) => {
        const prompt = `Generate a comprehensive botanical care guide for "${commonName}". Return all fields accurately. STRICT formatting rules:
- flowering_season + harvest_season: only one or more of "Spring", "Summer", "Autumn", "Winter". Never months.
- pruning_month: only abbreviated month names ("Jan", "Feb", ... "Dec"). Never full names. Never seasons.`;
        const { text: rawText, usage } = await callGeminiCascade(
          apiKey,
          FN,
          toMessages([prompt]),
          { responseSchema: CARE_GUIDE_SCHEMA, temperature: 0.2, logContext: { commonName } },
        );
        let parsed = JSON.parse(rawText);
        if (!parsed.plantData) parsed = { plantData: parsed };
        return { plantData: parsed, usage };
      },
      { batchSize, sleepMs: 1000 },
    );

    log(FN, "complete", summary);

    return new Response(
      JSON.stringify({ message: `Stale-check complete.`, ...summary }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logError(FN, "error", { error: message });
    await captureException(FN, err, {});
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
