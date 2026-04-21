import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { GoogleGenerativeAI } from "npm:@google/generative-ai";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// 🚀 HELPER: Upload external image to Supabase Storage
async function fetchAndUploadImage(
  url: string,
  plantName: string,
  supabase: any,
) {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    const blob = await response.blob();
    const fileExt = url.split(".").pop()?.split("?")[0] || "jpg";
    const safeName = plantName.toLowerCase().replace(/[^a-z0-9]/g, "_");
    const fileName = `ai-generated/${safeName}_${Date.now()}.${fileExt}`;

    const { error } = await supabase.storage
      .from("plant-images")
      .upload(fileName, blob, {
        contentType: blob.type,
        upsert: true,
      });

    if (error) throw error;

    let {
      data: { publicUrl },
    } = supabase.storage.from("plant-images").getPublicUrl(fileName);

    // 🚀 FIX: Swap 'kong' for the local gateway if developing locally
    if (publicUrl.includes("kong:8000")) {
      publicUrl = publicUrl.replace(
        "http://kong:8000",
        "http://127.0.0.1:54321",
      );
    }

    return publicUrl;
  } catch (err) {
    console.error("Storage Upload Error:", err.message);
    return null;
  }
}

// 🚀 HELPER: Get Image URL from Wikipedia
async function getWikiImage(plantName: string) {
  try {
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(plantName)}`,
    );
    if (res.ok) {
      const data = await res.json();
      return data.originalimage?.source || data.thumbnail?.source || null;
    }
  } catch (e) {
    console.error("Wiki Error:", e);
  }
  return null;
}

const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

async function callGeminiWithCascade(contents: any[], apiKey: string) {
  const modelsToTry = [
    "gemini-3.1-flash-lite-preview",
    "gemini-2.5-flash-lite",
    "gemini-3-flash-preview",
    "gemini-3.1-pro-preview",
  ];
  const maxRetriesPerModel = 2;
  let lastError;
  const genAI = new GoogleGenerativeAI(apiKey);

  for (const modelName of modelsToTry) {
    const model = genAI.getGenerativeModel({ model: modelName });
    for (let attempt = 1; attempt <= maxRetriesPerModel; attempt++) {
      try {
        const result = (await Promise.race([
          model.generateContent(contents),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Timeout")), 45000),
          ),
        ])) as any;
        const response = await result.response;
        return response.text();
      } catch (error: any) {
        lastError = error;
        if (
          error.message.includes("503") ||
          error.message.includes("429") ||
          error.message.includes("Timeout")
        ) {
          if (attempt < maxRetriesPerModel) {
            await delay(attempt * 2000);
            continue;
          }
        }
        break;
      }
    }
  }
  throw new Error(`Overloaded: ${lastError?.message}`);
}

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");

    const body = await req.json();
    const { action, targetPlant, plantSearch } = body;

    // 1. Action: Search Plants
    if (action === "search_plants_text") {
      const prompt = `User searching: "${plantSearch}". Return top 5 matches as JSON: {"matches": ["Common Name (Scientific Name)"]}`;
      const text = await callGeminiWithCascade([prompt], apiKey);
      const cleanJson = text
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();
      return new Response(cleanJson, {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Action: Generate Care Guide
    if (action === "generate_care_guide") {
      if (!targetPlant) throw new Error("No target plant provided.");
      const cleanName = targetPlant.split("(")[0].trim();

      const prompt = `Generate a comprehensive botanical care guide for "${cleanName}". 
      Respond ONLY in valid JSON format.
      Schema:
      {
        "plantData": {
          "common_name": "${cleanName}",
          "scientific_name": ["String"],
          "description": "String (1 paragraph)",
          "plant_type": "Houseplant | Shrub | Tree | Vegetable | Flower",
          "cycle": "Perennial | Annual | Biannual",
          "care_level": "Beginner | Intermediate | Expert",
          "growth_rate": "Slow | Medium | Fast",
          "maintenance": "Low | Average | High",
          "watering_min_days": Number,
          "watering_max_days": Number,
          "sunlight": ["full sun", "part sun", "part shade", "filtered shade", "full shade"],
          "flowering_season": ["Spring", "Summer", "Autumn", "Winter"],
          "harvest_season": ["Spring", "Summer", "Autumn", "Winter"],
          "pruning_month": ["Jan", "Feb", etc],
          "propagation": ["Seed", "Cuttings", "Division", "Layering", "Grafting"],
          "attracts": ["Bees", "Butterflies", etc],
          "is_toxic_pets": Boolean,
          "is_toxic_humans": Boolean,
          "indoor": Boolean,
          "is_edible": Boolean,
          "drought_tolerant": Boolean,
          "tropical": Boolean,
          "medicinal": Boolean,
          "cuisine": Boolean
        }
      }`;

      let aiText = await callGeminiWithCascade([prompt], apiKey);
      aiText = aiText
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();
      let parsedData = JSON.parse(aiText);

      // Handle model response variance
      if (!parsedData.plantData) parsedData = { plantData: parsedData };

      // Wikipedia Sourcing + Storage Proxy
      const wikiImageUrl = await getWikiImage(cleanName);
      if (wikiImageUrl) {
        const permanentUrl = await fetchAndUploadImage(
          wikiImageUrl,
          cleanName,
          supabase,
        );
        if (permanentUrl) parsedData.plantData.thumbnail_url = permanentUrl;
      }

      return new Response(JSON.stringify(parsedData), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("Action not implemented");
  } catch (error: any) {
    console.error("🚨 Edge Function Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
