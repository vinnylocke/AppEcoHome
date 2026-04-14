import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { GoogleGenerativeAI } from "npm:@google/generative-ai";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    const perenualKey = Deno.env.get("PERENUAL_API_KEY");

    if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");

    const {
      imageBase64,
      mimeType,
      action,
      plantSearch,
      targetPlant,
      diagnosisContext,
      diseaseName,
      notes,
      // 🚀 NEW FIELDS FOR RECOMMENDATIONS
      areaData,
      existingPlants,
      tasks,
      isOutside,
    } = await req.json();

    if (action === "test") {
      return new Response(
        JSON.stringify({ notes: "🟢 SUCCESS!", possible_names: null }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (action === "fetch_perenual_disease") {
      if (!perenualKey)
        throw new Error(
          "PERENUAL_API_KEY is missing in edge function environment.",
        );
      if (!diseaseName) throw new Error("Disease name is required.");

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
        return new Response(JSON.stringify({ notFound: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash-lite",
    });
    let promptText = "";
    let contents: any[] = [];

    if (action === "identify_vision") {
      if (!imageBase64) throw new Error("No image data provided.");
      const cleanBase64 = imageBase64.replace(
        /^data:image\/(png|jpeg|jpg|webp);base64,/,
        "",
      );

      promptText = `
        Identify the plant in this image. 
        ${plantSearch ? `The user thinks it might be a "${plantSearch}". Confirm if this is correct.` : ""}
        
        You MUST respond ONLY in valid JSON format. Return the top 3 most likely common names.
        {
          "notes": "A brief 1-2 sentence observation.",
          "possible_names": ["Most Likely Name", "Alternative 1", "Alternative 2"]
        }
      `;
      contents = [
        promptText,
        {
          inlineData: { data: cleanBase64, mimeType: mimeType || "image/jpeg" },
        },
      ];
    } else if (action === "diagnose") {
      if (!imageBase64) throw new Error("No image data provided.");
      const cleanBase64 = imageBase64.replace(
        /^data:image\/(png|jpeg|jpg|webp);base64,/,
        "",
      );

      promptText = `
        Look at this plant. Are there visible signs of pests, disease, or under/over-watering? 
        Provide a brief diagnosis and actionable advice. 
        You MUST respond ONLY in valid JSON using this exact schema:
        {
          "notes": "Your diagnosis and advice here.",
          "possible_diseases": ["Disease Name 1", "Disease Name 2", "Disease Name 3"] (Array of top 3 most likely specific pests or diseases. CRITICAL: Provide ONLY the simple common name. DO NOT include scientific names, Latin names, or brackets. Example GOOD: "Late Blight". Example BAD: "Late Blight (Phytophthora infestans)". If healthy or purely environmental like 'underwatering', return null),
          "possible_names": null
        }
      `;
      contents = [
        promptText,
        {
          inlineData: { data: cleanBase64, mimeType: mimeType || "image/jpeg" },
        },
      ];
    } else if (action === "get_ai_disease_info") {
      promptText = `
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
      contents = [promptText];
    } else if (action === "generate_remedial_plan") {
      if (!diagnosisContext) throw new Error("No diagnosis context provided.");

      promptText = `
        Based on the following diagnosis for the plant "${targetPlant || "the plant"}": "${diagnosisContext}"
        Create a complete remedial care plan containing 1 to 4 specific tasks to help the plant recover.
        
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
      contents = [promptText];
    } else if (action === "search_plants_text") {
      if (!plantSearch) throw new Error("No search query provided.");
      promptText = `
        The user is searching for a plant using the query: "${plantSearch}".
        Return the top 5 most likely specific plant matches.
        
        You MUST respond ONLY in valid JSON format using this exact schema:
        {
          "matches": ["Common Name 1", "Common Name 2", "Common Name 3", "Common Name 4", "Common Name 5"]
        }
      `;
      contents = [promptText];
    } else if (action === "generate_care_guide") {
      if (!targetPlant) throw new Error("No target plant provided.");
      promptText = `
        Generate a comprehensive botanical care guide for "${targetPlant}".
        You MUST respond ONLY in valid JSON format. Do not use markdown blocks. 
        
        CRITICAL INSTRUCTION: For fields with a predefined list of choices, you MUST use EXACTLY the strings provided. 
        Do not add extra words. Do not change capitalization. (e.g. use "Cuttings", NOT "Stem cuttings"). 
        If a field is not applicable, return null or an empty array.

        Use this exact schema:
        {
          "plantData": {
            "common_name": "${targetPlant}",
            "scientific_name": ["String"],
            "description": "String (1 paragraph overview)",
            "plant_type": "String (e.g., Houseplant, Shrub, Tree, Vegetable, Flower)",
            "cycle": "String (MUST be one of: 'Perennial', 'Annual', 'Biannual', 'Herbaceous Perennial')",
            "care_level": "String (e.g., Beginner, Intermediate, Expert)",
            "growth_rate": "String (e.g., Slow, Medium, Fast)",
            "maintenance": "String (e.g., Low, Average, High)",
            "watering_min_days": Number,
            "watering_max_days": Number,
            "sunlight": ["String"] (MUST choose ONLY from: "full sun", "part sun", "part shade", "filtered shade", "full shade"),
            "flowering_season": ["String"] (MUST choose ONLY from: "Spring", "Summer", "Autumn", "Winter", "Year-round"),
            "harvest_season": ["String"] (MUST choose ONLY from: "Spring", "Summer", "Autumn", "Winter", "Year-round"),
            "pruning_month": ["String"] (MUST choose ONLY from: "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"),
            "propagation": ["String"] (MUST choose ONLY from: "Seed", "Cuttings", "Division", "Layering", "Grafting"),
            "attracts": ["String"] (MUST choose ONLY from: "Bees", "Butterflies", "Hummingbirds", "Ladybugs", "Moths"),
            "is_toxic_pets": Boolean,
            "is_toxic_humans": Boolean,
            "indoor": Boolean,
            "is_edible": Boolean,
            "drought_tolerant": Boolean,
            "tropical": Boolean,
            "medicinal": Boolean,
            "cuisine": Boolean
          }
        }
      `;
      contents = [promptText];
    }
    // 🚀 NEW: RECOMMENDATION LOGIC
    else if (action === "recommend_plants") {
      promptText = `
        You are an expert botanical consultant. Recommend exactly 5 plants for a specific area based on the following data:
        
        ENVIRONMENT: ${isOutside ? "Outdoor" : "Indoor"}
        AREA SETTINGS: ${JSON.stringify(areaData)}
        CURRENT PLANTS: ${existingPlants?.map((p: any) => p.plant_name).join(", ") || "None"}
        ACTIVE TASKS/ISSUES: ${tasks?.map((t: any) => `${t.title}: ${t.description}`).join("; ") || "No active issues."}

        CRITICAL INSTRUCTIONS:
        1. BE SPECIFIC: Your "reason" MUST explicitly mention the provided data. If a plant is chosen because of the pH, mention the pH value. If chosen because of a pest found in the TASKS, mention that pest by name.
        2. COMPANION PLANTING: Check the "CURRENT PLANTS". If they have specific needs or common pests, recommend a companion plant that helps them.
        3. DIVERSITY: Provide a mix (Pest Control, Edible, Aesthetic).
        
        You MUST respond ONLY in valid JSON using this exact schema:
        {
          "recommendations": [
            {
              "name": "Common Name",
              "scientific_name": "Scientific Name",
              "category": "Pest Control | Edible | Aesthetic | Structural",
              "reason": "A specific 2-3 sentence explanation. Start with 'Given your...' or 'Since you have...'. Explicitly cite the provided Environment, pH, Lux, or Task data."
            }
          ]
        }
      `;
      contents = [promptText];
    }

    const result = (await Promise.race([
      model.generateContent(contents),
      new Promise((_, reject) =>
        setTimeout(
          () =>
            reject(new Error("Google Gemini API timed out. Please try again.")),
          45000,
        ),
      ),
    ])) as any;

    const response = await result.response;
    let text = response.text();
    text = text
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    return new Response(text, {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("🚨 EDGE FUNCTION CRASHED:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
