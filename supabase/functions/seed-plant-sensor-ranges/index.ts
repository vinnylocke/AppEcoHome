// seed-plant-sensor-ranges
//
// Admin-triggered on-demand generation of soil requirement ranges (moisture /
// EC / soil-temp) for library plants that are missing them — the manual
// counterpart to the daily `backfill-plant-sensor-ranges` cron. Targets
// `plant_library` only (the shared, all-users-readable knowledge base). Records
// its lifecycle in `plant_library_runs` (kind='sensor_ranges') so it shows in
// the Plant Library Admin's Recent-runs table with live progress + cost.
//
// Auth: requireAuth + requireAdmin (this one spends Gemini, so it's gated
// server-side — unlike the older seed/verify functions). Runs in the background
// via EdgeRuntime.waitUntil and returns { run_id } immediately (202).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { log, error as logError } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import { requireAuth } from "../_shared/requireAuth.ts";
import { requireAdmin } from "../_shared/requireAdmin.ts";
import { estimateGeminiCostUsd } from "../_shared/geminiCost.ts";
import { runSensorRangeBackfill, type BackfillDelta } from "../_shared/sensorRangeBackfillRun.ts";

const FN = "seed-plant-sensor-ranges";
const MAX_COUNT = 2000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

interface ModelSlot {
  prompt_tokens: number; candidates_tokens: number; cached_tokens: number;
  thoughts_tokens: number; cost_usd: number; call_count: number;
}

// Read-modify-write the run's counters + token/cost columns after each plant,
// matching the columns seed-plant-library uses so the admin RunRow renders.
async function updateRunProgress(db: any, runId: string, d: BackfillDelta) {
  const { data: row } = await db
    .from("plant_library_runs")
    .select("count_inserted, count_skipped, count_failed, total_prompt_tokens, total_candidates_tokens, total_cached_tokens, total_thoughts_tokens, total_tokens, total_cost_usd, model_usage")
    .eq("id", runId)
    .maybeSingle();
  if (!row) return;

  const u = d.usage;
  const cost = u ? estimateGeminiCostUsd(u.model, u) : 0;
  const patch: Record<string, unknown> = {
    count_inserted: row.count_inserted + d.filled,
    count_skipped: row.count_skipped + d.skipped,
    count_failed: row.count_failed + d.failed,
    total_prompt_tokens: row.total_prompt_tokens + (u?.promptTokenCount ?? 0),
    total_candidates_tokens: row.total_candidates_tokens + (u?.candidatesTokenCount ?? 0),
    total_cached_tokens: row.total_cached_tokens + (u?.cachedContentTokenCount ?? 0),
    total_thoughts_tokens: row.total_thoughts_tokens + (u?.thoughtsTokenCount ?? 0),
    total_tokens: row.total_tokens + (u?.totalTokenCount ?? 0),
    total_cost_usd: Number(row.total_cost_usd ?? 0) + cost,
    last_heartbeat_at: new Date().toISOString(),
  };
  if (u) {
    const usage: Record<string, ModelSlot> = (row.model_usage as Record<string, ModelSlot>) ?? {};
    const slot = usage[u.model] ?? { prompt_tokens: 0, candidates_tokens: 0, cached_tokens: 0, thoughts_tokens: 0, cost_usd: 0, call_count: 0 };
    slot.prompt_tokens += u.promptTokenCount ?? 0;
    slot.candidates_tokens += u.candidatesTokenCount ?? 0;
    slot.cached_tokens += u.cachedContentTokenCount ?? 0;
    slot.thoughts_tokens += u.thoughtsTokenCount ?? 0;
    slot.cost_usd += cost;
    slot.call_count += 1;
    usage[u.model] = slot;
    patch.model_usage = usage;
  }
  await db.from("plant_library_runs").update(patch).eq("id", runId);
}

async function finalizeRun(db: any, runId: string) {
  const { data: row } = await db
    .from("plant_library_runs")
    .select("count_inserted, count_failed")
    .eq("id", runId)
    .maybeSingle();
  const inserted = row?.count_inserted ?? 0;
  const failed = row?.count_failed ?? 0;
  const status = failed > 0 && inserted === 0 ? "failed" : failed > 0 ? "partial" : "succeeded";
  await db.from("plant_library_runs")
    .update({ status, finished_at: new Date().toISOString(), last_heartbeat_at: new Date().toISOString() })
    .eq("id", runId);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const apiKey = Deno.env.get("GEMINI_API_KEY")!;
    const db = createClient(supabaseUrl, serviceKey);

    const authResult = await requireAuth(req, db);
    if (authResult instanceof Response) return authResult;
    const userId = authResult.user.id;

    const adminRes = await requireAdmin(db, userId, corsHeaders);
    if (adminRes) return adminRes;

    const body = await req.json().catch(() => ({}));
    const rawCount = Number((body as { count?: number }).count);
    const count = Number.isFinite(rawCount) ? Math.max(1, Math.min(MAX_COUNT, Math.floor(rawCount))) : 100;
    const triggeredBy = (body as { triggered_by?: string }).triggered_by ?? userId;

    const { data: run, error: runErr } = await db
      .from("plant_library_runs")
      .insert({ kind: "sensor_ranges", triggered_by: triggeredBy, count_requested: count })
      .select("id")
      .single();
    if (runErr || !run) return json({ error: runErr?.message ?? "Couldn't create run" }, 500);
    const runId = run.id as string;

    // @ts-expect-error EdgeRuntime is only available at runtime.
    EdgeRuntime.waitUntil((async () => {
      try {
        await runSensorRangeBackfill(db, apiKey, {
          table: "plant_library",
          limit: count,
          aiAttribution: { userId: triggeredBy, homeId: null },
          action: "care_range_admin_seed",
          onProgress: (delta) => updateRunProgress(db, runId, delta),
        });
        await finalizeRun(db, runId);
      } catch (e) {
        logError(FN, "run_failed", { runId, message: e instanceof Error ? e.message : String(e) });
        await db.from("plant_library_runs")
          .update({ status: "failed", finished_at: new Date().toISOString(), error_message: (e instanceof Error ? e.message : String(e)).slice(0, 2000) })
          .eq("id", runId);
        await captureException(FN, e, { runId });
      }
    })());

    log(FN, "started", { runId, count });
    return json({ run_id: runId }, 202);
  } catch (err) {
    await captureException(FN, err);
    logError(FN, "unhandled", { message: err instanceof Error ? err.message : String(err) });
    return json({ error: "Failed to start soil-requirements run" }, 500);
  }
});
