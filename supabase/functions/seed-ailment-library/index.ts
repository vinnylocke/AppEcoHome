// Ailment Library seeder (Phase 1).
//
// Admin / cron triggered. One invocation asks Gemini to propose `count`
// ailments NOT already in the library (an exclusion list of existing names is
// supplied), fills full detail, and inserts them ON CONFLICT DO NOTHING (dedup
// by the generated name_key). Logs an `ailment_library_runs` row.
//
// Kept single-batch (no self-chaining) — the ailment universe is small enough
// that a periodic small run grows the catalogue without the plant seeder's
// chunk-chaining machinery. `verify_jwt = false` (service-role, cron/admin).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { log, error as logError } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import { callGeminiCascade, toMessages } from "../_shared/gemini.ts";
import { logAiUsage } from "../_shared/aiUsage.ts";
import { estimateGeminiCostUsd } from "../_shared/geminiCost.ts";
import {
  AILMENT_SEED_BATCH_SCHEMA,
  buildAilmentSeedPrompt,
  ailmentRowToColumnShape,
  parseAilmentBatch,
} from "../_shared/ailmentSeedPrompt.ts";

const FN = "seed-ailment-library";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const apiKey = Deno.env.get("GEMINI_API_KEY") ?? "";
    if (!url || !serviceKey || !apiKey) throw new Error("Missing env vars.");
    const db = createClient(url, serviceKey);

    const body = await req.json().catch(() => ({}));
    const triggeredBy = typeof body.triggered_by === "string" ? body.triggered_by : null;
    const count = Math.max(1, Math.min(20, Math.floor(typeof body.count === "number" ? body.count : 8)));

    const { data: run, error: runErr } = await db
      .from("ailment_library_runs")
      .insert({ kind: "seed", triggered_by: triggeredBy, count_requested: count })
      .select("id").single();
    if (runErr || !run) throw runErr ?? new Error("Failed to create run row");
    const runId = run.id as string;
    log(FN, "started", { run_id: runId, count, triggered_by: triggeredBy });

    // Run the AI proposal + insert in the background; respond immediately.
    const work = (async () => {
      let inserted = 0, skipped = 0, failed = 0, costUsd = 0;
      let model: string | null = null;
      try {
        const { data: existing } = await db.from("ailment_library").select("name");
        const excludeNames = (existing ?? []).map((r: { name: string }) => r.name).filter(Boolean);

        const seedPrompt = buildAilmentSeedPrompt(count, excludeNames);
        const { text, usage } = await callGeminiCascade(
          apiKey, FN, toMessages([seedPrompt]),
          {
            temperature: 0.4,
            maxOutputTokens: 32768,
            responseSchema: AILMENT_SEED_BATCH_SCHEMA,
            responseMimeType: "application/json",
            // Open-ended generation + a rich schema makes the small/lite models
            // time out; pin the models proven to handle this (gemini-3-flash-
            // preview lands it), so we don't burn ~3 min cascading through
            // time-outs + a 404 model first.
            models: ["gemini-3-flash-preview", "gemini-2.5-flash", "gemini-3.5-flash"],
            maxRetriesPerModel: 1,
            timeoutMs: 60_000,
            logContext: { run_id: runId },
          },
        );
        model = usage.model ?? null;
        costUsd = estimateGeminiCostUsd(usage.model, {
          promptTokenCount: usage.promptTokenCount ?? 0,
          candidatesTokenCount: usage.candidatesTokenCount ?? 0,
          cachedContentTokenCount: usage.cachedContentTokenCount ?? 0,
          thoughtsTokenCount: usage.thoughtsTokenCount ?? 0,
        });

        await logAiUsage(db, { functionName: FN, action: "seed_ailments", usage, contextBlock: seedPrompt, prompt: seedPrompt, rawResult: text });

        const { ailments } = parseAilmentBatch(text);
        log(FN, "batch_received", { run_id: runId, ai_returned: ailments.length, model });

        for (const a of ailments) {
          const row = ailmentRowToColumnShape(a, { seeded_by_run_id: runId });
          if (!row) { failed += 1; continue; }
          const { data, error } = await db.from("ailment_library").insert(row).select("id");
          if (error) {
            if (error.code === "23505") skipped += 1;
            else { failed += 1; logError(FN, "insert_failed", { run_id: runId, name: row.name, error: error.message }); }
          } else if (data && data.length > 0) inserted += 1;
          else skipped += 1;
        }

        const status = failed > 0 && inserted === 0 ? "failed" : failed > 0 ? "partial" : "succeeded";
        await db.from("ailment_library_runs").update({
          count_inserted: inserted, count_skipped: skipped, count_failed: failed,
          status, model, total_cost_usd: costUsd, finished_at: new Date().toISOString(),
        }).eq("id", runId);
        log(FN, "run_finished", { run_id: runId, inserted, skipped, failed, status });
      } catch (err) {
        await captureException(FN, err, { run_id: runId });
        await db.from("ailment_library_runs").update({
          status: "failed", error_message: (err as Error)?.message ?? "unknown",
          finished_at: new Date().toISOString(),
        }).eq("id", runId);
        logError(FN, "run_failed", { run_id: runId, error: (err as Error)?.message });
      }
    })();
    // @ts-expect-error EdgeRuntime is only available at runtime.
    EdgeRuntime.waitUntil(work);

    return new Response(JSON.stringify({ run_id: runId }), {
      status: 202, headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err) {
    logError(FN, "fatal", { error: (err as Error)?.message });
    await captureException(FN, err);
    return new Response(JSON.stringify({ error: (err as Error)?.message ?? "unknown" }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
