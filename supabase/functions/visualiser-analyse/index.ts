import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { callGeminiCascade, toMessages } from "../_shared/gemini.ts";
import { guardAiByHome } from "../_shared/aiGuard.ts";
import { logAiUsage } from "../_shared/aiUsage.ts";
import { enforceRateLimit } from "../_shared/rateLimit.ts";
import { captureException } from "../_shared/sentry.ts";

const FN = "visualiser-analyse";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface PlantContext {
  name: string;
  sunlight?: string[] | null;
  watering?: string | null;
}

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    plants: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name:   { type: "string" },
          status: { type: "string", enum: ["good", "warning", "issue"] },
          note:   { type: "string" },
        },
        required: ["name", "status", "note"],
      },
    },
    general: { type: "array", items: { type: "string" } },
  },
  required: ["summary", "plants", "general"],
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  try {
    const { imageBase64, mimeType, plants, homeId } = await req.json() as {
      imageBase64: string;
      mimeType: string;
      plants: PlantContext[];
      homeId?: string;
    };

    if (!imageBase64) throw new Error("imageBase64 is required");
    if (!plants?.length) throw new Error("plants array is required");

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

    const db = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    let userId: string | null = null;
    if (homeId) {
      const guardErr = await guardAiByHome(db, homeId);
      if (guardErr) return guardErr;
      const { data: ownerMember } = await db.from("home_members").select("user_id").eq("home_id", homeId).eq("role", "owner").limit(1).maybeSingle();
      userId = ownerMember?.user_id ?? null;
      if (userId) {
        const rateLimitErr = await enforceRateLimit(db, userId, FN);
        if (rateLimitErr) return rateLimitErr;
      }
    }

    const plantList = plants
      .map((p) => {
        const light = p.sunlight?.length ? ` | light: ${p.sunlight.join(", ")}` : "";
        const water = p.watering ? ` | watering: ${p.watering}` : "";
        return `• ${p.name}${light}${water}`;
      })
      .join("\n");

    const userText = `Analyse the garden scene. Plant sprites have been placed on the camera image.

Placed plants and their requirements:
${plantList}

For each plant, assess whether its position looks suitable based on:
- Visible light level at that spot (sun, shade, partial shade)
- Ground surface type (soil, paving, lawn, gravel)
- Proximity to existing real plants, walls, or structures visible in the scene
- Overall visual spacing

Be specific to what you can actually see. If the image is unclear in any area, say so.`;

    const messages = toMessages([
      { inlineData: { data: imageBase64, mimeType: mimeType ?? "image/jpeg" } },
      { text: userText },
    ]);

    const { text: raw, usage } = await callGeminiCascade(
      apiKey,
      FN,
      messages,
      {
        systemPrompt:
          "You are an expert garden and landscape planner. Analyse camera images of outdoor spaces with plant sprites overlaid on them and give practical, concise placement advice. Return valid JSON only.",
        temperature: 0.4,
        maxOutputTokens: 1024,
        responseSchema: RESPONSE_SCHEMA,
        models: ["gemini-2.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3-flash-preview"],
      },
    );

    const result = JSON.parse(raw);
    if (homeId) {
      await logAiUsage(db, { homeId, userId, functionName: FN, action: "visualiser_analyse", usage });
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error(`[${FN}]`, err.message);
    await captureException(FN, err);
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
