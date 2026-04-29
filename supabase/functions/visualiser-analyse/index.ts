import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callGeminiCascade, toMessages } from "../_shared/gemini.ts";

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
    const { imageBase64, mimeType, plants } = await req.json() as {
      imageBase64: string;
      mimeType: string;
      plants: PlantContext[];
    };

    if (!imageBase64) throw new Error("imageBase64 is required");
    if (!plants?.length) throw new Error("plants array is required");

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

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

    const raw = await callGeminiCascade(
      apiKey,
      FN,
      messages,
      {
        systemPrompt:
          "You are an expert garden and landscape planner. Analyse camera images of outdoor spaces with plant sprites overlaid on them and give practical, concise placement advice. Return valid JSON only.",
        temperature: 0.4,
        maxOutputTokens: 1024,
        responseSchema: RESPONSE_SCHEMA,
        models: ["gemini-2.5-flash-lite", "gemini-3.1-flash-lite-preview", "gemini-3-flash-preview"],
      },
    );

    const result = JSON.parse(raw);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error(`[${FN}]`, err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
