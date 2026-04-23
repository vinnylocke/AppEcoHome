import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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
        temperature: 0.7,
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
                  reason: { type: "STRING" },
                  procurement_advice: { type: "STRING" },
                },
                required: [
                  "common_name",
                  "scientific_name",
                  "quantity",
                  "role",
                  "reason",
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
    const { formData, homeId } = await req.json();

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

    const systemPrompt = `
      You are the Rhozly Master Landscape Architect. Your job is to take a user's rough idea and output a strict, professional, and highly detailed project execution plan.
      
      USER'S CURRENT GARDEN AREAS: ${JSON.stringify(areas || [])}
      USER'S CURRENT INVENTORY: ${JSON.stringify(inventory || [])}
      
      RULES:
      1. If the user specifies an existing area, use it. If not, design the infrastructure for a new one.
      2. If the user wants to use plants they already own, incorporate them into the plan without suggesting they buy them.
      3. The 'preparation_tasks' MUST be sequential. Use 'depends_on_index' to link them logically. Do NOT include 'planting' tasks here; the app handles planting natively.
      4. 'custom_maintenance_tasks' are ONLY for non-plant chores.
    `;

    const promptText = `
      Please generate a project blueprint based on these user requirements:
      Project Name: ${formData.planName}
      Description: ${formData.description}
      Target Area: ${formData.targetArea || "Create New"}
      Size: ${formData.locationSize || "Unknown"}
      Included Plants/Features: ${formData.inclusivePlants || "None"}
      Excluded Plants/Features: ${formData.exclusivePlants || "None"}
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
        console.log(`Success with ${model}!`);
        break;
      } catch (error: any) {
        console.warn(`Failed with ${model}:`, error.message);
        lastError = error.message;
      }
    }

    if (!success) {
      throw new Error(`All AI models failed. Last error: ${lastError}`);
    }

    // 🚀 NEW: Generate the Project Cover Image using Pollinations.ai
    let coverImageUrl =
      "https://images.unsplash.com/photo-1584479898061-15742e14f50d?auto=format&fit=crop&q=80&w=800"; // Default fallback

    try {
      const styleSuffix =
        "photorealistic, 8k resolution, architectural digest, professional landscape photography, beautiful garden design, sunny day";
      const imagePrompt = `A high quality landscaping photo of a ${aiResult.project_overview.title}. Style: ${formData.aesthetic}. ${styleSuffix}`;

      const encodedPrompt = encodeURIComponent(imagePrompt);
      const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=800&height=500&nologo=true`;

      console.log("Fetching image from Pollinations...");
      const imageResponse = await fetch(pollinationsUrl);

      if (imageResponse.ok) {
        const imageBlob = await imageResponse.blob();
        const fileName = `plan_${crypto.randomUUID()}.jpg`;

        // 🚀 THE FIX: Create an Admin client to bypass Storage RLS policies
        const supabaseAdmin = createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        );

        console.log("Uploading to Supabase Storage...");
        const { error: uploadError } = await supabaseAdmin.storage
          .from("guide-images")
          .upload(fileName, imageBlob, {
            contentType: "image/jpeg",
            cacheControl: "3600",
            upsert: false,
          });

        if (uploadError) {
          console.error("Storage upload failed:", uploadError);
        } else {
          // Get the public URL using the admin client
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
          console.log("Image generation and upload successful!");
        }
      } else {
        console.error(
          "Pollinations API returned non-OK status:",
          imageResponse.status,
        );
      }
    } catch (imgError) {
      console.error("Error generating cover image:", imgError);
    }

    return new Response(
      JSON.stringify({
        blueprint: aiResult,
        cover_image_url: coverImageUrl,
      }),
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
