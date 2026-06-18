// Ailment Library verifier (Phase 3).
//
// Picks `ailment_library` rows where verified_at IS NULL and runs each through
// an AI self-critique pass (accuracy / completeness / SAFE treatment advice).
// matched → valid=true; amended → overwrite corrected fields, valid=false.
// Fire-and-forget; logs an ailment_library_runs row (kind='verify').
// `verify_jwt = false` (service-role, cron/admin).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { log, error as logError } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import { callGeminiCascade, toMessages } from "../_shared/gemini.ts";
import { estimateGeminiCostUsd } from "../_shared/geminiCost.ts";
import {
  AILMENT_VERIFY_SCHEMA, buildAilmentVerifyPrompt, applyVerifyResult, parseVerify,
  type AilmentRowForVerify,
} from "../_shared/ailmentVerifyPrompt.ts";

const FN = "verify-ailment-library";
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
    const count = Math.max(1, Math.min(15, Math.floor(typeof body.count === "number" ? body.count : 8)));

    const { data: run, error: runErr } = await db.from("ailment_library_runs")
      .insert({ kind: "verify", triggered_by: triggeredBy, count_requested: count })
      .select("id").single();
    if (runErr || !run) throw runErr ?? new Error("Failed to create run row");
    const runId = run.id as string;
    log(FN, "started", { run_id: runId, count });

    const work = (async () => {
      let verified = 0, amended = 0, failed = 0, costUsd = 0;
      let model: string | null = null;
      try {
        const { data: rows } = await db.from("ailment_library")
          .select("id, name, kind, scientific_name, description, symptoms, causes, treatment, prevention, severity, affected_plant_types, organic_friendly")
          .is("verified_at", null).order("seeded_at", { ascending: true }).limit(count);

        for (const r of rows ?? []) {
          try {
            const { text, usage } = await callGeminiCascade(
              apiKey, FN, toMessages([buildAilmentVerifyPrompt(r as AilmentRowForVerify)]),
              {
                temperature: 0.2, maxOutputTokens: 4096,
                responseSchema: AILMENT_VERIFY_SCHEMA, responseMimeType: "application/json",
                models: ["gemini-3-flash-preview", "gemini-2.5-flash", "gemini-3.5-flash"],
                maxRetriesPerModel: 1, timeoutMs: 45_000,
                logContext: { run_id: runId, ailment_id: r.id },
              },
            );
            model = usage.model ?? model;
            costUsd += estimateGeminiCostUsd(usage.model, {
              promptTokenCount: usage.promptTokenCount ?? 0,
              candidatesTokenCount: usage.candidatesTokenCount ?? 0,
              cachedContentTokenCount: usage.cachedContentTokenCount ?? 0,
              thoughtsTokenCount: usage.thoughtsTokenCount ?? 0,
            });
            const parsed = parseVerify(text);
            if (!parsed) { failed += 1; continue; }
            const patch = applyVerifyResult(parsed);
            patch.verified_by_run_id = runId;
            await db.from("ailment_library").update(patch).eq("id", r.id);
            verified += 1;
            if (parsed.verdict === "amended" && (patch as { valid?: boolean }).valid === false) amended += 1;
          } catch (err) {
            failed += 1;
            logError(FN, "verify_row_failed", { run_id: runId, ailment_id: r.id, error: (err as Error)?.message });
          }
        }

        const status = failed > 0 && verified === 0 ? "failed" : failed > 0 ? "partial" : "succeeded";
        await db.from("ailment_library_runs").update({
          count_inserted: verified, count_skipped: amended, count_failed: failed,
          status, model, total_cost_usd: costUsd, finished_at: new Date().toISOString(),
        }).eq("id", runId);
        log(FN, "run_finished", { run_id: runId, verified, amended, failed, status });
      } catch (err) {
        await captureException(FN, err, { run_id: runId });
        await db.from("ailment_library_runs").update({
          status: "failed", error_message: (err as Error)?.message ?? "unknown", finished_at: new Date().toISOString(),
        }).eq("id", runId);
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
