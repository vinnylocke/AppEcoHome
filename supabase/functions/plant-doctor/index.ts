import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { log, error as logError } from "../_shared/logger.ts";
import { callGeminiCascade, toMessages } from "../_shared/gemini.ts";
import { loadPreferences, formatPreferencesBlock } from "../_shared/preferences.ts";

const FN = "plant-doctor";

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

    if (publicUrl.includes("kong:8000")) {
      publicUrl = publicUrl.replace(
        "http://kong:8000",
        "http://127.0.0.1:54321",
      );
    }

    return publicUrl;
  } catch (err: any) {
    console.error("Storage Upload Error:", err.message);
    return null;
  }
}

// 🚀 HELPER: Get Image URL from Wikipedia (DEEP FALLBACK)
async function getWikiImage(plantName: string) {
  const fetchWiki = async (term: string) => {
    try {
      const res = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(term)}`,
      );
      if (!res.ok) return null;
      const data = await res.json();
      if (data.type === "disambiguation" || !data.extract) return null;
      return data;
    } catch (e) {
      return null;
    }
  };

  const cleanName = plantName.split("(")[0].trim();

  let data = await fetchWiki(cleanName);

  if (!data) {
    data = await fetchWiki(`${cleanName} plant`);
  }

  if (!data && cleanName.includes(" ")) {
    const basePlant = cleanName.split(" ").pop();
    if (basePlant) {
      data = await fetchWiki(basePlant);
      if (!data) data = await fetchWiki(`${basePlant} plant`);
    }
  }

  if (data) {
    return data.originalimage?.source || data.thumbnail?.source || null;
  }
  return null;
}


serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    const perenualKey = Deno.env.get("PERENUAL_API_KEY");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");

    const body = await req.json();
    const {
      action,
      homeId,
      targetPlant,
      plantSearch,
      areaData,
      isOutside,
      currentPlants,
      imageBase64,
      mimeType,
      diagnosisContext,
      diseaseName,
      notes,
    } = body;

    log(FN, "request_received", {
      action,
      homeId: homeId ?? null,
      targetPlant: targetPlant ?? null,
      diseaseName: diseaseName ?? null,
      hasImage: !!imageBase64,
      hasDiagnosisContext: !!diagnosisContext,
      hasAreaData: !!areaData,
      currentPlantsCount: currentPlants?.length ?? 0,
    });

    // -------------------------------------------------------------
    // 1. NON-LLM ACTIONS (API FETCHES)
    // -------------------------------------------------------------
    if (action === "fetch_perenual_disease") {
      if (!perenualKey)
        throw new Error(
          "PERENUAL_API_KEY is missing in edge function environment.",
        );
      if (!diseaseName) throw new Error("Disease name is required.");

      log(FN, "perenual_lookup", { diseaseName });
      const res = await fetch(
        `https://perenual.com/api/pest-disease-list?key=${perenualKey}&q=${encodeURIComponent(diseaseName)}`,
      );
      const data = await res.json();

      if (data && data.data && data.data.length > 0) {
        const item = data.data[0];

        let solutionStr = "";
        if (Array.isArray(item.solution)) {
          solutionStr = item.solution
            .map((s: any) => s.description || JSON.stringify(s))
            .join(" ");
        } else {
          solutionStr =
            item.solution || "No specific solution provided by API.";
        }

        let descStr = "";
        if (Array.isArray(item.description)) {
          descStr = item.description
            .map((d: any) => d.description || JSON.stringify(d))
            .join(" ");
        } else {
          descStr = item.description || "No description provided by API.";
        }

        log(FN, "result", { action, found: true, diseaseName });
        return new Response(
          JSON.stringify({
            diseaseInfo: {
              description: descStr,
              solution: solutionStr,
              source: "api",
            },
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      } else {
        log(FN, "result", { action, found: false, diseaseName });
        return new Response(JSON.stringify({ notFound: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // -------------------------------------------------------------
    // 2. LLM ACTIONS (GEMINI)
    // -------------------------------------------------------------

    // Load user preferences once for all personalised actions.
    // If no homeId provided the prefs array is empty and no block is injected.
    const userPrefs = homeId
      ? await loadPreferences(supabase, { homeId })
      : [];
    const prefsBlock = userPrefs.length > 0
      ? `\nUSER PREFERENCES (always honour these — never recommend anything the user dislikes):\n${formatPreferencesBlock(userPrefs, "simple")}\n`
      : "";

    log(FN, "prefs_loaded", { homeId: homeId ?? null, count: userPrefs.length });

    if (action === "search_plants_text") {
      const prompt = `User searching: "${plantSearch}". Return top 5 matches as JSON: {"matches": ["Common Name (Scientific Name)"]}`;
      const text = await callGeminiCascade(apiKey, FN, toMessages([prompt]), { logContext: { action } });
      const cleanJson = text
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();
      const parsed = JSON.parse(cleanJson);
      log(FN, "result", { action, matchesCount: parsed.matches?.length ?? 0, query: plantSearch });
      return new Response(cleanJson, {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

      let aiText = await callGeminiCascade(apiKey, FN, toMessages([prompt]), { logContext: { action } });
      aiText = aiText
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();
      let parsedData = JSON.parse(aiText);

      if (!parsedData.plantData) parsedData = { plantData: parsedData };

      const wikiImageUrl = await getWikiImage(cleanName);
      if (wikiImageUrl) {
        const permanentUrl = await fetchAndUploadImage(
          wikiImageUrl,
          cleanName,
          supabase,
        );
        if (permanentUrl) parsedData.plantData.thumbnail_url = permanentUrl;
      }

      log(FN, "result", {
        action,
        plant: cleanName,
        plantType: parsedData.plantData?.plant_type,
        cycle: parsedData.plantData?.cycle,
        hasWikiImage: !!parsedData.plantData?.thumbnail_url,
      });

      return new Response(JSON.stringify(parsedData), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "recommend_plants") {
      const prompt = `
        You are an expert master gardener. I need plant recommendations for a specific growing area.
        ${prefsBlock}
        ENVIRONMENTAL METRICS:
        - Location: ${isOutside ? "Outside" : "Inside"}
        - Area Name: ${areaData?.name || "Unnamed Area"}
        - Growing Medium: ${areaData?.growing_medium || "Unknown"}
        - Medium Texture: ${areaData?.medium_texture || "Unknown"}
        - pH Level: ${areaData?.medium_ph || "Unknown"}
        - Peak Light (Lux): ${areaData?.light_intensity_lux || "Unknown"}
        - Water Movement: ${areaData?.water_movement || "Unknown"}
        - Nutrient Source: ${areaData?.nutrient_source || "Unknown"}

        CURRENTLY PLANTED HERE: ${currentPlants && currentPlants.length > 0 ? currentPlants.join(", ") : "Nothing yet"}

        Based strictly on these metrics and the user's preferences above, recommend 5 plants that would thrive here.
        NEVER recommend anything the user dislikes or that conflicts with their preferences.
        If there are existing plants, you MUST prioritize companion plants.

        Respond ONLY with a valid JSON object in the exact format below:
        {
          "recommendations": [
            {
              "name": "Highly Specific Common Name (e.g., 'French Marigold' or 'Sweet Basil', NOT just 'Marigold' or 'Basil' to ensure database matches)",
              "scientific_name": "Scientific Name",
              "reason": "1-2 short sentences explaining why it fits the environment AND how it pairs with existing plants.",
              "difficulty": "Beginner | Intermediate | Advanced"
            }
          ]
        }
      `;

      let aiText = await callGeminiCascade(apiKey, FN, toMessages([prompt]), { logContext: { action } });
      aiText = aiText
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();
      const parsedData = JSON.parse(aiText);
      log(FN, "result", {
        action,
        homeId: homeId ?? null,
        area: areaData?.name,
        environment: isOutside ? "outside" : "inside",
        currentPlantsCount: currentPlants?.length ?? 0,
        userPrefsCount: userPrefs.length,
        recommendationsCount: parsedData.recommendations?.length ?? 0,
        recommendations: (parsedData.recommendations ?? []).map((r: any) => r.name),
      });
      return new Response(JSON.stringify(parsedData), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "identify_vision") {
      if (!imageBase64) throw new Error("No image data provided.");
      const cleanBase64 = imageBase64.replace(
        /^data:image\/(png|jpeg|jpg|webp);base64,/,
        "",
      );

      const promptText = `
        Identify the plant in this image. 
        ${plantSearch ? `The user thinks it might be a "${plantSearch}". Confirm if this is correct.` : ""}
        
        You MUST respond ONLY in valid JSON format. Return the top 3 most likely common names.
        {
          "notes": "A brief 1-2 sentence observation.",
          "possible_names": ["Most Likely Name", "Alternative 1", "Alternative 2"]
        }
      `;
      const contents = [
        promptText,
        {
          inlineData: { data: cleanBase64, mimeType: mimeType || "image/jpeg" },
        },
      ];

      let aiText = await callGeminiCascade(apiKey, FN, toMessages(contents), { logContext: { action } });
      aiText = aiText
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();
      const parsed = JSON.parse(aiText);
      log(FN, "result", { action, possibleNames: parsed.possible_names ?? [] });
      return new Response(aiText, {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "diagnose") {
      if (!imageBase64) throw new Error("No image data provided.");
      const cleanBase64 = imageBase64.replace(
        /^data:image\/(png|jpeg|jpg|webp);base64,/,
        "",
      );

      const plantContext = targetPlant
        ? `This plant is a "${targetPlant}". Use this to improve your diagnosis accuracy.`
        : "The plant species is unknown — identify any visual clues from the image.";

      const promptText = `
        ${plantContext}
        Examine the image carefully for visible signs of pests, disease, nutrient deficiencies, or environmental stress (under/over-watering, sunburn, root rot, etc.).
        Provide a precise diagnosis and actionable advice.
        You MUST respond ONLY in valid JSON using this exact schema:
        {
          "notes": "Your diagnosis and advice here.",
          "possible_diseases": ["Disease Name 1", "Disease Name 2", "Disease Name 3"] (Array of top 3 most likely specific pests or diseases. CRITICAL: Provide ONLY the simple common name. DO NOT include scientific names, Latin names, or brackets. Example GOOD: "Late Blight". Example BAD: "Late Blight (Phytophthora infestans)". If healthy or purely environmental like 'underwatering', return null),
          "possible_names": null
        }
      `;
      const contents = [
        promptText,
        {
          inlineData: { data: cleanBase64, mimeType: mimeType || "image/jpeg" },
        },
      ];

      let aiText = await callGeminiCascade(apiKey, FN, toMessages(contents), { logContext: { action } });
      aiText = aiText
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();
      const parsed = JSON.parse(aiText);
      log(FN, "result", {
        action,
        possibleDiseases: parsed.possible_diseases ?? null,
        healthy: parsed.possible_diseases === null,
      });
      return new Response(aiText, {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "get_ai_disease_info") {
      const promptText = `
        Provide a detailed botanical description and step-by-step remedial solution for the plant disease/pest: "${diseaseName}".
        Use this context from the initial diagnosis: "${notes}"

        You MUST respond ONLY in valid JSON format using this exact schema. Do not use markdown blocks.
        {
          "diseaseInfo": {
            "description": "String (Detailed 1-2 paragraph description of the pest/disease and its symptoms)",
            "solution": "String (Detailed step-by-step treatment plan)",
            "source": "ai"
          }
        }
      `;
      let aiText = await callGeminiCascade(apiKey, FN, toMessages([promptText]), { logContext: { action } });
      aiText = aiText
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();
      log(FN, "result", { action, diseaseName, hasNotes: !!notes });
      return new Response(aiText, {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "generate_remedial_plan") {
      if (!diagnosisContext) throw new Error("No diagnosis context provided.");

      const promptText = `
        Based on the following diagnosis for the plant "${targetPlant || "the plant"}": "${diagnosisContext}"
        Create a complete remedial care plan containing 1 to 4 specific tasks to help the plant recover.
        ${prefsBlock}
        CRITICAL INSTRUCTIONS - YOU MUST OBEY THESE RULES:
        1. ONE-OFF TASKS: Immediate triage (pruning, isolating), environmental changes (improving air circulation, moving the plant), and habit changes (adjusting watering routines) MUST be one-off tasks with "is_recurring": false and "frequency_days": null.
        2. NO DUPLICATE WATERING: Do NOT create recurring 'Watering' tasks. If the plant needs a different watering routine, create a SINGLE one-off 'Maintenance' task instructing the user to update their baseline watering schedule.
        3. RECURRING TREATMENTS: Only use "is_recurring": true for active, ongoing medical treatments (e.g., applying fungicide, spraying neem oil).
        4. MAXIMUM DURATION: For recurring treatments, "end_offset_days" MUST be short. Use 14 or 21 days maximum. Never exceed 21 days.
        5. TASK TYPES: Use ONLY the "Maintenance" task_type for all medical tasks (pruning, spraying, adjusting environment).
        
        You MUST respond ONLY in valid JSON using this exact schema. Do not use markdown blocks.
        {
          "remedial_schedules": [
            {
              "title": "String (e.g., Prune Infected Leaves, Adjust Watering Routine, Apply Fungicide)",
              "description": "String (Brief, actionable instruction)",
              "task_type": "String (MUST be 'Maintenance')",
              "is_recurring": Boolean,
              "frequency_days": Number (e.g., 7 for weekly, or null if one-off),
              "end_offset_days": Number (e.g., 14 or 21. Use 0 or null for one-off tasks)
            }
          ]
        }
      `;
      let aiText = await callGeminiCascade(apiKey, FN, toMessages([promptText]), { logContext: { action } });
      aiText = aiText
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();
      const parsed = JSON.parse(aiText);
      log(FN, "result", {
        action,
        targetPlant,
        tasksCount: parsed.remedial_schedules?.length ?? 0,
        tasks: (parsed.remedial_schedules ?? []).map((t: any) => ({
          title: t.title,
          recurring: t.is_recurring,
          frequencyDays: t.frequency_days ?? null,
        })),
      });
      return new Response(aiText, {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (err: any) {
    logError(FN, "error", { error: err.message });
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
