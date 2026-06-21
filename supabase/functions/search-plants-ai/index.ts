import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { callGeminiCascade } from "../_shared/gemini.ts";
import { guardAiByUser } from "../_shared/aiGuard.ts";
import { logAiUsage } from "../_shared/aiUsage.ts";
import { enforceRateLimit } from "../_shared/rateLimit.ts";
import { log, error as logError } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import { getCached, setCached, cacheKey } from "../_shared/aiCache.ts";
import { getFallback } from "../_shared/fallbacks.ts";

const FN = "search-plants-ai";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    plants: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name:        { type: "STRING" },
          description: { type: "STRING" },
        },
        required: ["name", "description"],
      },
    },
  },
  required: ["plants"],
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  try {
    const { query } = await req.json();
    if (!query?.trim()) throw new Error("query is required");

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const serviceDb = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: { user } } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    const userId = user?.id ?? null;

    if (userId) {
      const guardErr = await guardAiByUser(supabase, userId);
      if (guardErr) return guardErr;
      const rateLimitErr = await enforceRateLimit(serviceDb, userId, FN);
      if (rateLimitErr) return rateLimitErr;
    }

    log(FN, "request_received", { query });

    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiApiKey) throw new Error("Missing GEMINI_API_KEY");

    // Load location context so results are regionally relevant
    let locationLine = "";
    let hemisphere = "Northern";
    if (userId) {
      const { data: home } = await supabase
        .from("homes")
        .select("country, lat, lng, timezone")
        .eq("user_id", userId)
        .maybeSingle();

      if (home) {
        hemisphere = (home.lat ?? 0) >= 0 ? "Northern" : "Southern";
        const month = new Date().toLocaleString("en-GB", {
          month: "long",
          timeZone: home.timezone ?? "UTC",
        });
        locationLine = home.country
          ? `The gardener is in ${home.country} (${hemisphere} Hemisphere, ${month}). Favour plants suited to their climate and season.`
          : `The gardener is in the ${hemisphere} Hemisphere (${month}). Favour seasonally appropriate plants.`;
      }
    }

    const searchKey = cacheKey("search_plants", query, hemisphere);
    const cached = await getCached<{ plants: Array<{ name: string; description: string }> }>(serviceDb, searchKey);
    if (cached) {
      log(FN, "success", { count: cached.plants?.length ?? 0, fromCache: true });
      return new Response(JSON.stringify(cached), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prompt = `You are a knowledgeable horticulturalist helping a gardener find plants to buy.

The gardener searched for: "${query}"
${locationLine ? `\n${locationLine}\n` : ""}
Return up to 8 plant names that closely match or relate to this search query.
Include the most likely exact match first, then related varieties or companions.
Each entry needs:
- name: the common English plant name (e.g. "Cherry Tomato", "English Lavender")
- description: one sentence — what it is and why a gardener would want it

Keep names precise and recognisable. Avoid duplicates.`;

    const { text: rawText, usage } = await callGeminiCascade(
      geminiApiKey,
      FN,
      [{ role: "user", parts: [{ text: prompt }] }],
      { temperature: 0.3, responseSchema: RESPONSE_SCHEMA, maxOutputTokens: 800 },
    );

    if (userId) {
      await logAiUsage(serviceDb, { userId, functionName: FN, action: "search_plants_ai", usage, contextBlock: prompt, prompt, rawResult: rawText });
    }

    let parsed: { plants: Array<{ name: string; description: string }> };
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = { plants: [] };
    }

    await setCached(serviceDb, searchKey, FN, { plants: parsed.plants ?? [] }, 30);
    log(FN, "success", { count: parsed.plants?.length ?? 0, fromCache: false });

    return new Response(JSON.stringify({ plants: parsed.plants ?? [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    logError(FN, "search_failed", { error: err instanceof Error ? err.message : String(err) });
    await captureException(FN, err);
    return new Response(
      JSON.stringify(getFallback("search_plants_ai")),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
