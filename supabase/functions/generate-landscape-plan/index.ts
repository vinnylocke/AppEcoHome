import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// 🧠 1. FEW-SHOT EXAMPLES
const FEW_SHOT_EXAMPLES = `
EXAMPLE INPUT:
Dimensions: Height: 50cm, Width: 100cm, Depth: 30cm. Description: I want a colorful, vibrant window box. Inventory: [Tomato, Basil]. Sunlight: Full Sun.

EXAMPLE IDEAL OUTPUT (Notice how it ignores the tomatoes because they don't fit the colorful aesthetic):
{
  "project_overview": { "title": "Vibrant Sun-Drenched Window Box", "summary": "A highly colorful, trailing floral arrangement perfect for a shallow, sunny container.", "estimated_difficulty": "Beginner" },
  "infrastructure_requirements": { "needs_new_area": true, "suggested_area_name": "Front Window Box", "suggested_environment": "Outdoor", "suggested_sunlight": "Full Sun", "suggested_medium": "Potting Soil with Perlite" },
  "plant_manifest": [
    { "common_name": "Petunia", "scientific_name": "Petunia × atkinsiana", "quantity": 3, "role": "Spiller (Trailing)", "aesthetic_reason": "Provides bright, continuous trumpet-shaped blooms that spill over the edge.", "horticultural_reason": "Thrives in full sun and shallow 30cm depth.", "procurement_advice": "Buy established plugs from a nursery." },
    { "common_name": "Marigold", "scientific_name": "Tagetes", "quantity": 2, "role": "Filler", "aesthetic_reason": "Adds vibrant orange and yellow contrast.", "horticultural_reason": "Highly heat tolerant and roots easily in a 50cm tall space.", "procurement_advice": "Can be grown from seed easily." }
  ],
  "preparation_tasks": [
    { "task_index": 1, "title": "Drill Drainage Holes", "description": "Ensure the 100cm x 30cm container has adequate drainage.", "depends_on_index": null },
    { "task_index": 2, "title": "Fill with Medium", "description": "Add the potting soil mix, leaving 2 inches at the top.", "depends_on_index": 1 }
  ],
  "custom_maintenance_tasks": [
    { "title": "Deadheading", "description": "Pinch off spent Petunia and Marigold blooms to encourage new growth.", "frequency_days": 4, "seasonality": "Active Growing Season" }
  ]
}
`;

async function callGemini(
  model: string,
  apiKey: string,
  promptText: string,
  systemPrompt: string,
) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: promptText }] }],
      generationConfig: {
        temperature: 0.2, // 🚀 LOWERED TEMP: Makes the AI highly logical and obedient
        maxOutputTokens: 2500,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            project_overview: {
              type: "OBJECT",
              properties: {
                title: { type: "STRING" },
                summary: { type: "STRING" },
                estimated_difficulty: { type: "STRING" },
              },
              required: ["title", "summary", "estimated_difficulty"],
            },
            infrastructure_requirements: {
              type: "OBJECT",
              properties: {
                needs_new_area: { type: "BOOLEAN" },
                suggested_area_name: { type: "STRING", nullable: true },
                suggested_environment: { type: "STRING", nullable: true },
                suggested_sunlight: { type: "STRING", nullable: true },
                suggested_medium: { type: "STRING", nullable: true },
              },
              required: ["needs_new_area"],
            },
            plant_manifest: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  common_name: { type: "STRING" },
                  scientific_name: { type: "STRING" },
                  quantity: { type: "INTEGER" },
                  role: { type: "STRING" },
                  aesthetic_reason: { type: "STRING" }, // 🚀 Split reasoning
                  horticultural_reason: { type: "STRING" }, // 🚀 Split reasoning
                  procurement_advice: { type: "STRING" },
                },
                required: [
                  "common_name",
                  "scientific_name",
                  "quantity",
                  "role",
                  "aesthetic_reason",
                  "horticultural_reason",
                  "procurement_advice",
                ],
              },
            },
            preparation_tasks: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  task_index: { type: "INTEGER" },
                  title: { type: "STRING" },
                  description: { type: "STRING" },
                  depends_on_index: { type: "INTEGER", nullable: true },
                },
                required: ["task_index", "title", "description"],
              },
            },
            custom_maintenance_tasks: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  title: { type: "STRING" },
                  description: { type: "STRING" },
                  frequency_days: { type: "INTEGER" },
                  seasonality: { type: "STRING" },
                },
                required: [
                  "title",
                  "description",
                  "frequency_days",
                  "seasonality",
                ],
              },
            },
          },
          required: [
            "project_overview",
            "infrastructure_requirements",
            "plant_manifest",
            "preparation_tasks",
            "custom_maintenance_tasks",
          ],
        },
      },
    }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || `Gemini API Error from ${model}`);
  }

  const data = await response.json();
  const rawString = data.candidates[0].content.parts[0].text;
  return JSON.parse(rawString);
}

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  try {
    const { formData, homeId, isRegeneration } = await req.json(); // 🚀 Capture regeneration flag

    const authHeader = req.headers.get("Authorization")!;
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: areas } = await supabase
      .from("areas")
      .select("id, name, sunlight, locations!inner(home_id)")
      .eq("locations.home_id", homeId);

    const { data: inventory } = await supabase
      .from("inventory_items")
      .select("plant_name, status, area_id")
      .eq("home_id", homeId);

    // 🧠 2. STRICTER SYSTEM PROMPT
    const systemPrompt = `
      You are the Rhozly Master Landscape Architect. Output a strict, professional, and highly detailed project execution plan.
      
      USER'S CURRENT GARDEN AREAS: ${JSON.stringify(areas || [])}
      USER'S CURRENT INVENTORY: ${JSON.stringify(inventory || [])}
      
      CRITICAL RULES:
      1. ABSOLUTE EXCLUSIONS: You MUST NOT include any plant, feature, or concept listed in the "Excluded Features" or the "User Feedback" under any circumstances. If an item in the user's inventory violates an exclusion, IGNORE THE INVENTORY.
      2. INVENTORY VETO: Do NOT force inventory items into the design unless they perfectly match the user's aesthetic, dimensional, and environmental goals. (e.g., Do not put inventory vegetables in an ornamental floral planter).
      3. DIMENSIONS MATTER: Ensure the suggested plant quantities and sizes physically fit within the provided Height, Width, and Depth.
      4. The 'preparation_tasks' MUST be sequential. Use 'depends_on_index' to link them logically. Do NOT include 'planting' tasks here.
      5. 'custom_maintenance_tasks' are ONLY for non-plant chores (e.g., cleaning the planter, checking drainage).
      
      ${FEW_SHOT_EXAMPLES}
    `;

    // 🧠 3. DYNAMIC PROMPT TEXT (Putting Feedback at the Absolute Top)
    let promptText = "";

    if (isRegeneration) {
      promptText += `
      URGENT REGENERATION REQUEST:
      The user REJECTED your previous blueprint. You MUST apply the following feedback strictly and override any conflicting original requirements. 
      
      USER FEEDBACK: "${formData.feedback}"
      
      PREVIOUS REJECTED BLUEPRINT (For context on what NOT to do):
      ${JSON.stringify(formData.previousBlueprint)}
      
      --------------------------------------------------
      ORIGINAL PROJECT PARAMETERS (Apply feedback overrides to these):
      `;
    }

    promptText += `
      Project Name: ${formData.planName}
      Description: ${formData.description}
      Dimensions: Height: ${formData.height || "N/A"}, Width: ${formData.width || "N/A"}, Depth: ${formData.depth || "N/A"}
      Included Features: ${formData.inclusivePlants || "None"}
      Excluded Features: ${formData.exclusivePlants || "None"}
      Wildlife Goals: ${formData.wildlife || "None"}
      Desired Difficulty: ${formData.difficulty || "Average"}
      Desired Maintenance: ${formData.maintenance || "Average"}
      Special Considerations: ${formData.considerations || "None"}
    `;

    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiApiKey) throw new Error("Missing GEMINI_API_KEY");

    const modelsToTry = [
      "gemini-3.1-flash-lite-preview",
      "gemini-3-flash-preview",
      "gemini-3.1-pro-preview",
    ];

    let aiResult: any = null;
    let success = false;
    let lastError = "";

    for (const model of modelsToTry) {
      try {
        console.log(`Attempting generation with model: ${model}...`);
        aiResult = await callGemini(
          model,
          geminiApiKey,
          promptText,
          systemPrompt,
        );
        success = true;
        break;
      } catch (error: any) {
        lastError = error.message;
      }
    }

    if (!success)
      throw new Error(`All AI models failed. Last error: ${lastError}`);

    // 🚀 4. GENERATING A SMALLER BASE IMAGE
    let coverImageUrl =
      "https://images.unsplash.com/photo-1584479898061-15742e14f50d?auto=format&fit=crop&q=80&w=800";

    try {
      const styleSuffix =
        "photorealistic, architectural digest, professional landscape photography, beautiful garden design, sunny day";
      const imagePrompt = `A high quality landscaping photo of a ${aiResult.project_overview.title}. Style: ${formData.aesthetic}. ${styleSuffix}`;

      const encodedPrompt = encodeURIComponent(imagePrompt);
      const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=600&height=400&nologo=true`;

      const imageResponse = await fetch(pollinationsUrl);

      if (imageResponse.ok) {
        const imageBlob = await imageResponse.blob();
        const fileName = `plan_${crypto.randomUUID()}.jpg`;

        const supabaseAdmin = createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        );

        const { error: uploadError } = await supabaseAdmin.storage
          .from("guide-images")
          .upload(fileName, imageBlob, {
            contentType: "image/jpeg",
            cacheControl: "3600",
            upsert: false,
          });

        if (!uploadError) {
          const { data: publicUrlData } = supabaseAdmin.storage
            .from("guide-images")
            .getPublicUrl(fileName);

          let finalUrl = publicUrlData.publicUrl;
          if (finalUrl.includes("kong:8000")) {
            finalUrl = finalUrl.replace(
              "http://kong:8000",
              "http://127.0.0.1:54321",
            );
          }
          coverImageUrl = finalUrl;
        }
      }
    } catch (imgError) {
      console.error("Error generating cover image:", imgError);
    }

    return new Response(
      JSON.stringify({ blueprint: aiResult, cover_image_url: coverImageUrl }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
