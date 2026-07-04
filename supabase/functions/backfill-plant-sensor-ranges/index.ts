// backfill-plant-sensor-ranges
//
// Daily cron that guarantees our knowledge base has a soil-range record for
// every plant. Sweeps `plant_library` first, then the global `plants`
// catalogue, for rows missing any of the six soil-range columns and fills ONLY
// the NULLs (reusing the shared runSensorRangeBackfill orchestrator — the same
// one the admin-triggered seed-plant-sensor-ranges run uses). Existing values —
// including verified library values — are never overwritten. New library rows
// already get ranges from the seeder; this is the belt-and-braces sweep.
//
// - Cron only (no JWT — invoked via the service-role header on the pg_net call).
// - Bounded batch (env BACKFILL_BATCH_SIZE, default 25) across both tables.
// - System AI-usage attribution ({ userId: null, homeId: null }).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { log, error as logError } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import { runSensorRangeBackfill } from "../_shared/sensorRangeBackfillRun.ts";

const FN = "backfill-plant-sensor-ranges";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const apiKey = Deno.env.get("GEMINI_API_KEY")!;
  const batchSize = Number(Deno.env.get("BACKFILL_BATCH_SIZE") ?? "25");
  const db = createClient(supabaseUrl, serviceKey);
  const system = { userId: null, homeId: null };

  try {
    // 1. Library first (the canonical knowledge base).
    const lib = await runSensorRangeBackfill(db, apiKey, {
      table: "plant_library", limit: batchSize, aiAttribution: system,
    });
    // 2. Global plants catalogue — remaining budget.
    const remaining = Math.max(0, batchSize - lib.scanned);
    const cat = remaining > 0
      ? await runSensorRangeBackfill(db, apiKey, { table: "plants", limit: remaining, aiAttribution: system })
      : { scanned: 0, filled: 0, skipped: 0, failed: 0 };

    const summary = { filledLibrary: lib.filled, filledPlants: cat.filled, batchSize };
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
