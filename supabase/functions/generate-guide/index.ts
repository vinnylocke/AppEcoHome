import { createClient } from "npm:@supabase/supabase-js@2";
import { log, error as logError } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import { callGeminiCascade } from "../_shared/gemini.ts";
import { requireAuth } from "../_shared/requireAuth.ts";
import { enforceRateLimit } from "../_shared/rateLimit.ts";
import { getCached, setCached, cacheKey } from "../_shared/aiCache.ts";
import { getFallback } from "../_shared/fallbacks.ts";
import { logAiUsage } from "../_shared/aiUsage.ts";

const FN = "generate-guide";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  try {
    const { topic, difficulty = "Intermediate", target_audience = "Home Gardeners" } = await req.json();
    log(FN, "request_received", { topic, difficulty, target_audience });

    // Defence in depth — authenticate BEFORE the env-var checks. The catch
    // block below returns the 200 "Temporarily Unavailable" fallback on any
    // throw; if env checks threw first an anonymous caller would silently get
    // the fallback, bypassing the auth check entirely.
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseServiceKey)
      throw new Error("Missing Supabase Variables");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authResult = await requireAuth(req, supabase);
    if (authResult instanceof Response) return authResult;

    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiApiKey) throw new Error("Missing Gemini API Key");

    const rateLimitErr = await enforceRateLimit(supabase, authResult.user.id, FN);
    if (rateLimitErr) return rateLimitErr;

    const guideKey = cacheKey("guide", topic, difficulty, target_audience);
    const cached = await getCached<{ guide_data: any; labels: string[] }>(supabase, guideKey);
    if (cached) {
      log(FN, "result", { topic, fromCache: true });
      return new Response(JSON.stringify(cached), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // UPDATED PROMPT: Added 'list' type and forced step-by-step breakdown
    const systemPrompt = `
      You are an expert horticulturist and content creator for the 'Rhozly' plant care app.
      The user will give you a topic. You must generate a highly structured, engaging, and accurate plant care guide.
      Target audience: ${target_audience}. Difficulty level: ${difficulty}. Tailor the language complexity, assumed knowledge, and depth of detail accordingly.

      You MUST return a JSON object with EXACTLY two root properties: 'guide_data' and 'labels'.
      
      RULES FOR 'guide_data':
      - 'title': Catchy title.
      - 'subtitle': Brief engaging description.
      - 'difficulty': "Easy", "Medium", or "Hard".
      - 'estimated_minutes': Integer.
      - 'sections': An array of objects. Each object must have a 'type' ("header", "paragraph", "list", "tip", "warning", or "image").
      - If type is "paragraph", provide a 'content' string. Do NOT use giant walls of text for steps.
      - If type is "list", provide an 'items' array of strings. Use this heavily for step-by-step instructions or ingredient lists!
      - If type is "image", 'content' MUST be a visual prompt describing the scene for a scientific diagram (e.g., "A clean technical drawing showing where to cut a monstera node"). Include a 'caption'.

      RULES FOR 'labels':
      - Array of lowercase strings for database tags.
      - MUST include the plant name and task category.
    `;

    const { text: rawText, usage } = await callGeminiCascade(
      geminiApiKey,
      FN,
      [{ role: "user", parts: [{ text: `Topic: ${topic}` }] }],
      { systemPrompt, responseMimeType: "application/json" },
    );

    const rawJson = JSON.parse(
      rawText.replace(/```json\n?/g, "").replace(/```\n?/g, ""),
    );

    const guideData = rawJson.guide_data;
    log(FN, "result", {
      topic,
      targetAudience: target_audience,
      requestedDifficulty: difficulty,
      title: guideData.title,
      difficulty: guideData.difficulty,
      estimatedMinutes: guideData.estimated_minutes,
      sectionsCount: guideData.sections?.length ?? 0,
      labels: rawJson.labels,
    });

    const imagePromises = guideData.sections.map(
      async (section: any, i: number) => {
        if (section.type === "image") {
          try {
            const imagePrompt = section.content;

            // 🚀 UPDATED STYLE: Forcing botanical textbook illustrations instead of photos
            const styleSuffix =
              ", clean botanical illustration, scientific technical diagram, detailed line art with subtle shading, educational textbook style, white background, no text";
            const encodedPrompt = encodeURIComponent(imagePrompt + styleSuffix);
            const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=800&height=600&nologo=true`;

            const imageResponse = await fetch(pollinationsUrl, { signal: AbortSignal.timeout(20_000) });
            if (!imageResponse.ok) return;

            const imageBlob = await imageResponse.blob();
            const fileName = `guide_${crypto.randomUUID()}_${i}.jpg`;

            const { error: uploadError } = await supabase.storage
              .from("guide-images")
              .upload(fileName, imageBlob, {
                contentType: "image/jpeg",
                cacheControl: "3600",
                upsert: false,
              });

            if (uploadError) return;

            const { data: publicUrlData } = supabase.storage
              .from("guide-images")
              .getPublicUrl(fileName);
            let finalUrl = publicUrlData.publicUrl;

            if (finalUrl.includes("kong:8000")) {
              finalUrl = finalUrl.replace(
                "http://kong:8000",
                "http://127.0.0.1:54321",
              );
            }

            section.content = finalUrl;
          } catch (imgError) {
            console.error("Error processing image:", imgError);
          }
        }
      },
    );

    await Promise.all(imagePromises);

    const responsePayload = { guide_data: guideData, labels: rawJson.labels };
    await setCached(supabase, guideKey, FN, responsePayload, 7);
    await logAiUsage(supabase, { userId: authResult.user.id, functionName: FN, action: "generate_guide", usage, contextBlock: systemPrompt, prompt: `${systemPrompt}\n\nTopic: ${topic}`, rawResult: rawText });
    log(FN, "result", { topic, fromCache: false, sectionsCount: guideData.sections?.length ?? 0 });

    return new Response(
      JSON.stringify(responsePayload),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error: any) {
    logError(FN, "error", { error: error.message });
    await captureException(FN, error);
    return new Response(JSON.stringify(getFallback("generate_guide")), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  }
});
