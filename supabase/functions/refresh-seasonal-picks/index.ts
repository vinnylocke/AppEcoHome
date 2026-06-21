// refresh-seasonal-picks
//
// Weekly cron that pre-warms `home_seasonal_picks` for every home whose
// current ISO-week row is missing. The on-demand `seasonal_picks` action
// on plant-doctor handles cache misses lazily — this just front-loads the
// work so Monday morning's Today screen paints instantly rather than
// waiting on a 5-8 second Gemini call.
//
// - Cron only (service-role invocation from pg_cron via pg_net).
// - Walks every home that has at least one home_members row (skips
//   homes that were created but never had a user attached).
// - Skips homes whose row for the current ISO week is already populated.
// - Batch capped at STALE_SEASONAL_BATCH_SIZE (env, default 25). Runs
//   sequentially with a small sleep between calls to avoid quota spikes.
// - System AI-usage attribution: { userId: null }. The cost doesn't land
//   on any user's quota.
// - Per-home try/catch — one bad home logs to Sentry, the rest of the
//   batch still runs.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { log, error as logError } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import { isoWeekKey } from "../_shared/seasonalPicks.ts";
import { generateSeasonalPicksForHome } from "../_shared/seasonalPicksHandler.ts";

const FN = "refresh-seasonal-picks";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const apiKey = Deno.env.get("GEMINI_API_KEY")!;
  const batchSize = Number(Deno.env.get("STALE_SEASONAL_BATCH_SIZE") ?? "25");

  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const now = new Date();
    const weekIso = isoWeekKey(now);

    // 1. Find homes that already have this week's row cached so we can
    //    exclude them from the work list.
    const { data: warmRows, error: warmErr } = await supabase
      .from("home_seasonal_picks")
      .select("home_id")
      .eq("week_iso", weekIso);
    if (warmErr) throw new Error(`Failed to load warm rows: ${warmErr.message}`);
    const warmHomeIds = new Set((warmRows ?? []).map((r) => r.home_id as string));

    // 2. Pull every home that has at least one member — i.e. is "in use",
    //    not a half-created shell. Cap at batchSize and skip warm ones.
    const { data: candidates, error: candidateErr } = await supabase
      .from("home_members")
      .select("home_id")
      .limit(500);
    if (candidateErr) throw new Error(`Failed to load home_members: ${candidateErr.message}`);

    const homeIds = Array.from(
      new Set((candidates ?? []).map((r) => r.home_id as string)),
    ).filter((id) => !warmHomeIds.has(id));

    const work = homeIds.slice(0, batchSize);

    log(FN, "batch_start", {
      weekIso,
      total_homes_with_members: homeIds.length + warmHomeIds.size,
      already_warm: warmHomeIds.size,
      batch_size: batchSize,
      to_process: work.length,
    });

    let succeeded = 0;
    let failed = 0;
    let aiCount = 0;
    let fallbackCount = 0;

    for (const homeId of work) {
      try {
        const result = await generateSeasonalPicksForHome(supabase, {
          homeId,
          apiKey,
          forceRegen: false,
          callerUserId: null,
          functionName: FN,
          now,
        });
        succeeded++;
        if (result.source === "ai") aiCount++;
        else fallbackCount++;
        // Small sleep so we don't spike Gemini quota on big batches.
        await sleep(750);
      } catch (err) {
        failed++;
        logError(FN, "home_failed", {
          homeId,
          error: err instanceof Error ? err.message : String(err),
        });
        await captureException(FN, err, { homeId });
      }
    }

    const summary = {
      week_iso: weekIso,
      processed: work.length,
      succeeded,
      failed,
      ai_count: aiCount,
      fallback_count: fallbackCount,
      already_warm: warmHomeIds.size,
      remaining: Math.max(0, homeIds.length - work.length),
    };

    log(FN, "complete", summary);

    return new Response(
      JSON.stringify({ message: "Seasonal-picks pre-warm complete.", ...summary }),
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
