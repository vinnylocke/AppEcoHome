// parse-ailment-list — Sage+ AI bulk-paste parser for the Watchlist.
//
// RHO-4 Phase 2. Accepts a free-text paste of multiple pest / disease /
// invasive-plant descriptions and returns a candidate list the client presents
// for review. The user edits / removes rows before committing to a batch
// `ailments` insert per row (all `source='manual'`). Strictly the "extraction"
// half — never touches the ailments table.
//
// Tier gating: Sage / Evergreen (`ai_enabled = true`). Sprout / Botanist get
// the client-side regex fallback in `src/lib/parseAilmentList.ts`. Both return
// the same `ParsedAilment` shape so the review UI is identical across tiers.
//
// Mirrors parse-plant-list, but authorises by USER (guardAiByUser) since the
// review step is user-scoped and no homeId is needed for the pure extraction.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { callGeminiCascade, toMessages } from "../_shared/gemini.ts";
import { requireAuth } from "../_shared/requireAuth.ts";
import { guardAiByUser } from "../_shared/aiGuard.ts";
import { logAiUsage } from "../_shared/aiUsage.ts";
import { enforceRateLimit } from "../_shared/rateLimit.ts";
import { log, error as logError } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import {
  AILMENT_PARSE_SCHEMA,
  buildAilmentParsePrompt,
  normaliseAilments,
} from "../_shared/ailmentListParse.ts";

const FN = "parse-ailment-list";
const MAX_INPUT_CHARS = 8000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  try {
    const { text } = await req.json();
    if (!text || typeof text !== "string" || !text.trim()) {
      throw new Error("text is required.");
    }
    if (text.length > MAX_INPUT_CHARS) {
      return new Response(
        JSON.stringify({
          error: `Paste too long (${text.length} chars, max ${MAX_INPUT_CHARS}). Split into smaller batches.`,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const serviceDb = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const authResult = await requireAuth(req, serviceDb);
    if (authResult instanceof Response) return authResult;
    const userId = authResult.user.id;

    const guardErr = await guardAiByUser(serviceDb, userId);
    if (guardErr) return guardErr;

    const rateLimitErr = await enforceRateLimit(serviceDb, userId, FN);
    if (rateLimitErr) return rateLimitErr;

    log(FN, "request_received", {
      userId,
      text_length: text.length,
      line_count: text.split("\n").length,
    });

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

    const prompt = buildAilmentParsePrompt(text);

    const { text: rawText, usage } = await callGeminiCascade(
      apiKey,
      FN,
      toMessages([prompt]),
      {
        responseSchema: AILMENT_PARSE_SCHEMA,
        temperature: 0.1,
        maxOutputTokens: 4096,
        logContext: { text_length: text.length },
      },
    );

    await logAiUsage(serviceDb, {
      userId,
      functionName: FN,
      action: "parse",
      usage,
      contextBlock: prompt,
      prompt,
      rawResult: rawText,
    });

    const parsed = JSON.parse(rawText);
    const ailments = normaliseAilments(parsed);

    log(FN, "result", { userId, candidate_count: ailments.length });

    return new Response(
      JSON.stringify({ ailments }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logError(FN, "error", { error: message });
    await captureException(FN, err, {});

    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
