// Garden Shape Suggestions — Wave 8A
// Given a shape's microclimate context (sun classification, lux, area metadata,
// hemisphere, season), suggest 5 plants the user could plant there.

import { createClient } from "npm:@supabase/supabase-js@2";
import { log, error as logError } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import { callGeminiCascade } from "../_shared/gemini.ts";
import { requireAuth } from "../_shared/requireAuth.ts";
import { enforceRateLimit } from "../_shared/rateLimit.ts";
import { logAiUsage } from "../_shared/aiUsage.ts";

const FN = "garden-shape-suggestions";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  shapeId: string;
  homeId: string;
  sunClassification?: string;
  recentLux?: number | null;
  areaPh?: number | null;
  drainage?: string | null;
  growingMedium?: string | null;
  hemisphere?: "northern" | "southern";
  climateZone?: string | null;
  currentSeason?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body: RequestBody = await req.json();
    log(FN, "request_received", { shapeId: body.shapeId });

    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!geminiApiKey) throw new Error("Missing Gemini API Key");
    if (!supabaseUrl || !supabaseServiceKey) throw new Error("Missing Supabase Variables");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authResult = await requireAuth(req, supabase);
    if (authResult instanceof Response) return authResult;

    const rateLimitErr = await enforceRateLimit(supabase, authResult.user.id, FN);
    if (rateLimitErr) return rateLimitErr;

    const systemPrompt = `
You are a horticulturist suggesting plants for a specific garden bed. The user will provide a
microclimate description; you reply with exactly 5 plant suggestions tuned to those conditions.

Output JSON with shape:
{
  "suggestions": [
    {
      "common_name": "string — common UK/US name",
      "scientific_name": "string — botanical name if known, otherwise empty string",
      "type": "vegetable" | "herb" | "flower" | "shrub" | "tree" | "ground_cover",
      "reason": "1 short sentence explaining why this plant fits this bed"
    }
  ]
}

Rules:
- Bias suggestions to the current season + hemisphere (e.g., autumn northern hemisphere → garlic, brassicas, hardy greens).
- Match sun classification: Full Sun → tomatoes/herbs/squash, Partly Sunny → lettuce/spinach, Shade → ferns/hostas.
- If pH is provided and acidic (<6.0) → suggest acid-lovers like blueberries; alkaline (>7.5) → lavender/sage.
- Vary suggestion types — don't return 5 vegetables; mix in herb/flower/ground cover.
- Reason MUST be under 18 words and mention the specific condition (sun/season/ph).
`;

    const conditions = [
      `Sun classification: ${body.sunClassification ?? "Unknown"}`,
      body.recentLux != null ? `Recent lux reading: ${body.recentLux}` : null,
      body.areaPh != null ? `Soil pH: ${body.areaPh}` : null,
      body.drainage ? `Drainage: ${body.drainage}` : null,
      body.growingMedium ? `Growing medium: ${body.growingMedium}` : null,
      body.hemisphere ? `Hemisphere: ${body.hemisphere}` : null,
      body.climateZone ? `Climate zone: ${body.climateZone}` : null,
      body.currentSeason ? `Current season: ${body.currentSeason}` : null,
    ].filter(Boolean).join("\n");

    const userMessage = `Bed conditions:\n${conditions}\n\nSuggest 5 plants that would thrive here right now.`;

    const { text: rawText, usage } = await callGeminiCascade(
      geminiApiKey,
      FN,
      [{ role: "user", parts: [{ text: userMessage }] }],
      {
        systemPrompt,
        temperature: 0.7,
        responseMimeType: "application/json",
        logContext: { shapeId: body.shapeId },
      },
    );

    await logAiUsage(supabase, {
      userId: authResult.user.id,
      homeId: body.homeId,
      functionName: FN,
      action: "suggest_plants",
      usage,
      contextBlock: userMessage,
      prompt: `${systemPrompt}\n\n${userMessage}`,
      rawResult: rawText,
    });

    let parsed: any;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      throw new Error("Gemini returned non-JSON: " + rawText.slice(0, 200));
    }

    if (!Array.isArray(parsed.suggestions)) {
      throw new Error("Response missing suggestions array");
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err: any) {
    logError(FN, "fatal", { error: err.message, stack: err.stack });
    captureException(err, { fn: FN });
    return new Response(
      JSON.stringify({ error: err.message ?? "Unknown error" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
});
