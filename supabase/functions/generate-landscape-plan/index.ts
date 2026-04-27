import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { log, warn, error as logError } from "../_shared/logger.ts";
import {
  loadPreferences,
  formatPreferencesBlock,
  savePreferences,
  ENTITY_TYPES,
  type PreferenceRow,
} from "../_shared/preferences.ts";
import { callGeminiCascade } from "../_shared/gemini.ts";

const FN = "generate-landscape-plan";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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

const PREF_EXTRACTION_SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      entity_type: { type: "STRING" },
      entity_name: { type: "STRING" },
      sentiment: { type: "STRING" },
      reason: { type: "STRING", nullable: true },
    },
    required: ["entity_type", "entity_name", "sentiment"],
  },
};

// Extract structured preferences from free-text feedback.
// Returns an empty array on any failure so the main flow is never interrupted.
async function extractPreferencesFromFeedback(
  apiKey: string,
  feedbackText: string,
): Promise<Array<{ entity_type: string; entity_name: string; sentiment: string; reason: string | null }>> {
  try {
    const rawText = await callGeminiCascade(
      apiKey,
      FN,
      [{
        role: "user",
        parts: [{
          text: `You are a preference extraction engine for a gardening app. Extract structured preferences from this user feedback about their garden plan.

Feedback: "${feedbackText}"

Rules:
- entity_type must be one of: ${ENTITY_TYPES.map((t) => `"${t}"`).join(", ")}
- entity_name: normalise to title case (e.g. "Rose", "Tropical", "Water Feature", "Low Maintenance")
- sentiment: "positive" if the user likes or wants it, "negative" if they dislike or don't want it
- reason: the user's stated reason in their own words, concise, or null if not given
- Mapping hints: style/look → aesthetic; water feature/budget/raised bed → feature; preferred colours → colour; organic/chemical-free → pest_management; drought/frost → climate; sandy/clay → soil; watering habits → water_usage; "make it cheaper" → feature "Budget Friendly"
- Return an empty array [] if no extractable preferences exist`,
        }],
      }],
      { temperature: 0, maxOutputTokens: 400, responseSchema: PREF_EXTRACTION_SCHEMA, logContext: { step: "pref_extraction" } },
    );
    return JSON.parse(rawText) || [];
  } catch {
    return [];
  }
}

const LP_SCHEMA = {
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
          aesthetic_reason: { type: "STRING" },
          horticultural_reason: { type: "STRING" },
          procurement_advice: { type: "STRING" },
        },
        required: ["common_name", "scientific_name", "quantity", "role", "aesthetic_reason", "horticultural_reason", "procurement_advice"],
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
        required: ["title", "description", "frequency_days", "seasonality"],
      },
    },
  },
  required: ["project_overview", "infrastructure_requirements", "plant_manifest", "preparation_tasks", "custom_maintenance_tasks"],
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  try {
    const { formData, homeId, isRegeneration } = await req.json();

    const authHeader = req.headers.get("Authorization") ?? "";
    const authToken = authHeader.replace("Bearer ", "");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    // Resolve the calling user's ID — pass the token explicitly so it works
    // in edge function environments where global header override is unreliable.
    const { data: { user } } = await supabase.auth.getUser(authToken);
    const userId = user?.id;

    log(FN, "request_received", {
      userId: userId ?? null,
      homeId,
      planName: formData.planName,
      isRegeneration,
      feedback: isRegeneration ? formData.feedback : undefined,
    });

    // --- PERSONAL MEMORY: load most-recent preference per entity for this user ---
    const latestPreferences = await loadPreferences(supabase, { userId: userId ?? undefined });
    const positives = latestPreferences.filter((p) => p.sentiment === "positive");
    const negatives = latestPreferences.filter((p) => p.sentiment === "negative");

    log(FN, "preferences_loaded", {
      userId,
      activeCount: latestPreferences.length,
      likes: positives.map((p) => `${p.entity_type}:${p.entity_name}`),
      avoids: negatives.map((p) => `${p.entity_type}:${p.entity_name}`),
    });

    const personalMemoryBlock = latestPreferences.length > 0
      ? formatPreferencesBlock(latestPreferences, "rich")
      : "";

    // --- GARDEN CONTEXT ---
    const { data: areas } = await supabase
      .from("areas")
      .select("id, name, sunlight, locations!inner(home_id)")
      .eq("locations.home_id", homeId);

    const { data: inventory } = await supabase
      .from("inventory_items")
      .select("plant_name, status, area_id")
      .eq("home_id", homeId);

    log(FN, "context_loaded", {
      homeId,
      areasCount: (areas || []).length,
      areas: (areas || []).map((a: any) => a.name),
      inventoryCount: (inventory || []).length,
      inventory: (inventory || []).map((i: any) => i.plant_name),
    });

    // --- SYSTEM PROMPT ---
    const systemPrompt = `
      You are the Rhozly Master Landscape Architect. Output a strict, professional, and highly detailed project execution plan.

      ${personalMemoryBlock}

      USER'S CURRENT GARDEN AREAS: ${JSON.stringify(areas || [])}
      USER'S CURRENT INVENTORY: ${JSON.stringify(inventory || [])}

      CRITICAL RULES:
      1. ABSOLUTE EXCLUSIONS: You MUST NOT include any plant, feature, or concept listed in the "Excluded Features", the "User Feedback", or the DISLIKES in the personal memory above, under any circumstances.
      2. INVENTORY VETO: Do NOT force inventory items into the design unless they perfectly match the user's aesthetic, dimensional, and environmental goals.
      3. DIMENSIONS MATTER: Ensure the suggested plant quantities and sizes physically fit within the provided Height, Width, and Depth.
      4. The 'preparation_tasks' MUST be sequential. Use 'depends_on_index' to link them logically. Do NOT include 'planting' tasks here.
      5. 'custom_maintenance_tasks' are ONLY for non-plant chores (e.g., cleaning the planter, checking drainage).
      6. AESTHETIC STYLE: Every plant in 'plant_manifest' MUST visually match the stated Aesthetic Style. The 'aesthetic_reason' field MUST explicitly confirm how the plant fits that style.
      7. SUNLIGHT & MEDIUM: Every plant MUST be compatible with the stated Sunlight Conditions and Growing Medium. Set 'suggested_sunlight' and 'suggested_medium' in 'infrastructure_requirements' to exactly match the user's stated values unless there is a critical horticultural reason to override them.

      ${FEW_SHOT_EXAMPLES}
    `;

    // --- PROMPT TEXT ---
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
      Aesthetic Style: ${formData.aesthetic || "Natural"}
      Dimensions: Height: ${formData.height || "N/A"}, Width: ${formData.width || "N/A"}, Depth: ${formData.depth || "N/A"}
      Sunlight Conditions: ${formData.sunlight || "Not specified"}
      Preferred Growing Medium: ${formData.medium || "Not specified"}
      Included Features: ${formData.inclusivePlants || "None"}
      Excluded Features: ${formData.exclusivePlants || "None"}
      Wildlife Goals: ${formData.wildlife || "None"}
      Desired Difficulty: ${formData.difficulty || "Average"}
      Desired Maintenance: ${formData.maintenance || "Average"}
      Special Considerations: ${formData.considerations || "None"}
    `;

    log(FN, "prompt_built", {
      planName: formData.planName,
      dimensions: `H=${formData.height || "N/A"} W=${formData.width || "N/A"} D=${formData.depth || "N/A"}`,
      aesthetic: formData.aesthetic || null,
      sunlight: formData.sunlight || null,
      medium: formData.medium || null,
      mustInclude: formData.inclusivePlants || null,
      mustExclude: formData.exclusivePlants || null,
      wildlife: formData.wildlife || null,
      difficulty: formData.difficulty || null,
      memoryInjected: !!personalMemoryBlock,
    });

    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiApiKey) throw new Error("Missing GEMINI_API_KEY");

    const rawText = await callGeminiCascade(
      geminiApiKey,
      FN,
      [{ role: "user", parts: [{ text: promptText }] }],
      { systemPrompt, temperature: 0.2, maxOutputTokens: 2500, responseSchema: LP_SCHEMA },
    );

    const aiResult = JSON.parse(rawText);

    log(FN, "result", {
      title: aiResult.project_overview?.title,
      difficulty: aiResult.project_overview?.estimated_difficulty,
      plantsCount: (aiResult.plant_manifest || []).length,
      plants: (aiResult.plant_manifest || []).map((p: any) => `${p.common_name} x${p.quantity}`),
      prepTasksCount: (aiResult.preparation_tasks || []).length,
      maintenanceTasksCount: (aiResult.custom_maintenance_tasks || []).length,
    });

    // --- COVER IMAGE ---
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

    // --- PREFERENCE EXTRACTION (regen only) ---
    // Extract structured preferences from the user's free-text feedback and persist
    // them so future plans automatically reflect their evolving tastes.
    if (isRegeneration && formData.feedback) {
      try {
        const extracted = await extractPreferencesFromFeedback(geminiApiKey, formData.feedback);

        log(FN, "preferences_extracted", {
          count: extracted.length,
          items: extracted.map((p) => `${p.sentiment}:${p.entity_type}:${p.entity_name}`),
        });

        const validEntityTypes = new Set(ENTITY_TYPES);

        const rows: PreferenceRow[] = extracted
          .filter(
            (p) =>
              validEntityTypes.has(p.entity_type) &&
              (p.sentiment === "positive" || p.sentiment === "negative") &&
              p.entity_name?.trim(),
          )
          .map((p) => ({
            home_id: homeId,
            user_id: userId ?? null,
            entity_type: p.entity_type,
            entity_name: p.entity_name.trim(),
            sentiment: p.sentiment,
            reason: p.reason?.trim() || null,
          }));

        const skipped = extracted.length - rows.length;
        if (skipped > 0) {
          warn(FN, "preferences_skipped", { skipped, reason: "invalid entity_type or sentiment" });
        }

        const supabaseAdmin = createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        );
        const saved = await savePreferences(supabaseAdmin, rows);
        if (saved > 0) {
          log(FN, "preferences_saved", { count: saved, userId, homeId });
        }
      } catch (prefError: any) {
        warn(FN, "preferences_extraction_failed", { error: prefError.message });
      }
    }

    log(FN, "done", { homeId, planName: formData.planName });

    return new Response(
      JSON.stringify({ blueprint: aiResult, cover_image_url: coverImageUrl }),
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
