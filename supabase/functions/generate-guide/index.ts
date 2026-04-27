import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { log, error as logError } from "../_shared/logger.ts";
import { callGeminiCascade } from "../_shared/gemini.ts";

const FN = "generate-guide";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  try {
    const { topic, difficulty = "Intermediate", target_audience = "Home Gardeners" } = await req.json();
    log(FN, "request_received", { topic, difficulty, target_audience });

    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!geminiApiKey) throw new Error("Missing Gemini API Key");
    if (!supabaseUrl || !supabaseServiceKey)
      throw new Error("Missing Supabase Variables");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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

    const rawText = await callGeminiCascade(
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

            const imageResponse = await fetch(pollinationsUrl);
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

    return new Response(
      JSON.stringify({ guide_data: guideData, labels: rawJson.labels }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error: any) {
    logError(FN, "error", { error: error.message });
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
