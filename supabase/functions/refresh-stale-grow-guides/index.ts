// refresh-stale-grow-guides
//
// Plant Grow Guides — daily cron that walks `plant_grow_guides` rows whose
// `last_freshness_check_at` is NULL or older than 90 days, re-asks Gemini
// for a fresh comprehensive guide, diffs the result, and either bumps
// `freshness_version` + stamps `updated_fields` (when something changed)
// or just resets `last_freshness_check_at` (when nothing changed).
//
// - Cron only (no JWT auth — invoked via service-role header from the
//   pg_net call inside the cron schedule).
// - Walks every grow guide regardless of plant source. Grow guides are
//   server-only writable (RLS blocks client writes), so there's no
//   user-edit collision risk.
// - Batch capped at STALE_GROW_GUIDE_BATCH_SIZE (env, default 25).
// - Per-plant try/catch — a bad guide logs to Sentry, the rest of the
//   batch still runs.
// - Idempotent: `last_freshness_check_at` is updated only after the
//   per-plant work succeeds.
// - System AI-usage attribution: { userId: null, homeId: null } against
//   ai_usage_log so the cost doesn't land on any user's quota.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { log, error as logError } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import { callGeminiCascade, toMessages } from "../_shared/gemini.ts";
import {
  GROW_GUIDE_SCHEMA,
  buildGrowGuidePrompt,
  type PlantGrowGuide,
} from "../_shared/growGuide.ts";
import { refreshStaleGrowGuides } from "../_shared/refreshStaleGrowGuides.ts";

const FN = "refresh-stale-grow-guides";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const apiKey = Deno.env.get("GEMINI_API_KEY")!;
  const batchSize = Number(Deno.env.get("STALE_GROW_GUIDE_BATCH_SIZE") ?? "25");

  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    // Use UTC date for the prompt — the cron doesn't know each plant's
    // home timezone, and grow-guide timing is climatological not personal.
    const todayIso = new Date().toISOString().split("T")[0];

    const summary = await refreshStaleGrowGuides(
      supabase,
      async ({ commonName, scientificName, source, manualNotes }) => {
        // No hemisphere available from the cron context — guides include a
        // default Northern-hemisphere calibration. Users in the Southern
        // hemisphere see the same guide; future improvement is to store
        // per-region guides or thread the requesting user's home into the
        // prompt for on-demand regens.
        const prompt = buildGrowGuidePrompt({
          commonName,
          scientificName,
          source,
          manualNotes,
          hemisphere: "Northern",
          currentDate: todayIso,
        });

        const { text: rawText, usage } = await callGeminiCascade(
          apiKey,
          FN,
          toMessages([prompt]),
          {
            responseSchema: GROW_GUIDE_SCHEMA,
            temperature: 0.2,
            // 9 structured sections with key_facts + steps + tips easily exceed
            // the default 2048 cap; truncation breaks JSON.parse downstream.
            maxOutputTokens: 8192,
            logContext: { commonName },
          },
        );
        if (!rawText || !rawText.trim()) {
          throw new Error("Gemini returned empty text for the grow guide.");
        }
        const guide = JSON.parse(rawText) as PlantGrowGuide;
        return { guide, usage };
      },
      { batchSize, sleepMs: 1000 },
    );

    log(FN, "complete", { ...summary });

    return new Response(
      JSON.stringify({ message: "Stale grow-guide check complete.", ...summary }),
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
