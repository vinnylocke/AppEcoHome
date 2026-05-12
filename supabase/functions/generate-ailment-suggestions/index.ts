import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { log, error as logError } from "../_shared/logger.ts";
import { callGeminiCascade } from "../_shared/gemini.ts";
import { guardAiByUser } from "../_shared/aiGuard.ts";
import { logAiUsage } from "../_shared/aiUsage.ts";
import { getCached, setCached, cacheKey } from "../_shared/aiCache.ts";
import { getFallback } from "../_shared/fallbacks.ts";

const FN = "generate-ailment-suggestions";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const STEP_SCHEMA = {
  type: "OBJECT",
  properties: {
    id:                     { type: "STRING" },
    step_order:             { type: "INTEGER" },
    title:                  { type: "STRING" },
    description:            { type: "STRING" },
    task_type:              { type: "STRING", enum: ["inspect", "spray", "prune", "remove", "water", "fertilize", "other"] },
    frequency_type:         { type: "STRING", enum: ["once", "daily", "every_n_days", "weekly", "monthly"] },
    frequency_every_n_days: { type: "INTEGER" },
    duration_minutes:       { type: "INTEGER" },
    product:                { type: "STRING" },
    notes:                  { type: "STRING" },
  },
  required: ["id", "step_order", "title", "description", "task_type", "frequency_type"],
};

const SYMPTOM_SCHEMA = {
  type: "OBJECT",
  properties: {
    id:          { type: "STRING" },
    title:       { type: "STRING" },
    description: { type: "STRING" },
    severity:    { type: "STRING", enum: ["mild", "moderate", "severe"] },
    location:    { type: "STRING" },
  },
  required: ["id", "title", "description", "severity", "location"],
};

const AILMENT_SCHEMA = {
  type: "OBJECT",
  properties: {
    name:             { type: "STRING" },
    scientific_name:  { type: "STRING" },
    type:             { type: "STRING", enum: ["invasive_plant", "pest", "disease"] },
    description:      { type: "STRING" },
    symptoms:         { type: "ARRAY", items: SYMPTOM_SCHEMA },
    affected_plants:  { type: "ARRAY", items: { type: "STRING" } },
    prevention_steps: { type: "ARRAY", items: STEP_SCHEMA },
    remedy_steps:     { type: "ARRAY", items: STEP_SCHEMA },
    thumbnail_query:  { type: "STRING" },
  },
  required: ["name", "type", "description", "affected_plants", "prevention_steps", "remedy_steps"],
};

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    results: { type: "ARRAY", items: AILMENT_SCHEMA },
  },
  required: ["results"],
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  try {
    const { query, extraContext } = await req.json();

    if (!query?.trim()) throw new Error("query is required");

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    const userId = user?.id ?? null;

    if (userId) {
      const guardErr = await guardAiByUser(supabase, userId);
      if (guardErr) return guardErr;
    }

    log(FN, "request_received", { query, hasExtraContext: !!extraContext });

    // Only cache generic queries — extraContext is user-specific so skip caching when present.
    const ailmentKey = !extraContext ? cacheKey("ailments", query) : null;
    if (ailmentKey) {
      const cached = await getCached<{ results: any[] }>(supabase, ailmentKey);
      if (cached) {
        log(FN, "result", { query, count: cached.results?.length ?? 0, fromCache: true });
        return new Response(
          JSON.stringify(cached),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
        );
      }
    }

    const systemPrompt = `
You are a horticulture and plant pathology expert helping gardeners build a watchlist of threats to their garden.

The gardener searched for: "${query}"

Return 3 to 6 distinct ailments (pests, diseases, or invasive plants) that closely match or relate to this search query.
Aim for variety — include both the most likely exact match AND related threats they might also want to track.

For each ailment provide:
- name: common English name
- scientific_name: Latin binomial if applicable
- type: one of "invasive_plant", "pest", or "disease"
- description: 2–3 sentences — what it is, origin, and why it threatens gardens
- symptoms: 3–5 identifiable symptoms for pests/diseases (empty array for invasive plants)
- affected_plants: up to 8 common plant species or families
- prevention_steps: 3–5 actionable prevention steps, each mapped to a task_type
- remedy_steps: 3–6 treatment steps ordered by what a gardener should do first, with product suggestions where relevant
- For every step set frequency_type correctly and include a realistic duration_minutes estimate
- thumbnail_query: 2–4 word image search phrase for a recognisable photo
${extraContext ? `\nADDITIONAL CONTEXT:\n${extraContext}` : ""}
`;

    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiApiKey) throw new Error("Missing GEMINI_API_KEY");

    const { text: rawText, usage } = await callGeminiCascade(
      geminiApiKey,
      FN,
      [{ role: "user", parts: [{ text: `Search query: "${query}"` }] }],
      {
        systemPrompt,
        temperature: 0.5,
        maxOutputTokens: 6000,
        responseSchema: RESPONSE_SCHEMA,
      },
    );

    const result = JSON.parse(rawText);

    const stampIds = (steps: any[]) =>
      (steps || []).map((s: any, i: number) => ({
        ...s,
        id: s.id || crypto.randomUUID(),
        step_order: s.step_order ?? i + 1,
      }));

    const results = (result.results || []).map((ailment: any) => ({
      ...ailment,
      source: "ai" as const,
      symptoms:         (ailment.symptoms || []).map((s: any) => ({ ...s, id: s.id || crypto.randomUUID() })),
      prevention_steps: stampIds(ailment.prevention_steps),
      remedy_steps:     stampIds(ailment.remedy_steps),
    }));

    if (ailmentKey) await setCached(supabase, ailmentKey, FN, { results }, 14);
    await logAiUsage(supabase, { userId, functionName: FN, action: "ailment_suggestions", usage });
    log(FN, "result", { query, count: results.length, fromCache: false });

    return new Response(
      JSON.stringify({ results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (err: any) {
    logError(FN, "error", { error: err.message });
    return new Response(
      JSON.stringify(getFallback("ailment_suggestions")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  }
});
