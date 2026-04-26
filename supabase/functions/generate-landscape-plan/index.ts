import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

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

// Extract structured preferences from free-text feedback using Gemini.
// Returns an empty array on any failure so the main flow is never interrupted.
async function extractPreferencesFromFeedback(
  model: string,
  apiKey: string,
  feedbackText: string,
): Promise<
  Array<{
    entity_type: string;
    entity_name: string;
    sentiment: string;
    reason: string | null;
  }>
> {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `You are a preference extraction engine for a gardening app. Extract structured preferences from this user feedback about their garden plan.

Feedback: "${feedbackText}"

Rules:
- entity_type must be one of: "plant", "aesthetic", "feature", "maintenance", "wildlife", "difficulty"
- entity_name: normalise to title case (e.g. "Rose", "Tropical", "Water Feature", "Low Maintenance")
- sentiment: "positive" if the user likes or wants it, "negative" if they dislike or don't want it
- reason: the user's stated reason in their own words, concise, or null if not given
- For vague feedback like "make it cheaper" use entity_type "feature", entity_name "Budget Friendly"
- Return an empty array [] if no extractable preferences exist`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 400,
          responseMimeType: "application/json",
          responseSchema: {
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
          },
        },
      }),
    });
    if (!response.ok) return [];
    const data = await response.json();
    return JSON.parse(data.candidates[0].content.parts[0].text) || [];
  } catch {
    return [];
  }
}

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
        temperature: 0.2,
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
                  aesthetic_reason: { type: "STRING" },
                  horticultural_reason: { type: "STRING" },
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
    const { formData, homeId, isRegeneration } = await req.json();

    const authHeader = req.headers.get("Authorization")!;
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    // Resolve the calling user's ID from their JWT
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id;

    console.log("=".repeat(60));
    console.log("[REQUEST]");
    console.log(`  User ID     : ${userId ?? "unknown"}`);
    console.log(`  Home ID     : ${homeId}`);
    console.log(`  Plan Name   : ${formData.planName}`);
    console.log(`  Regeneration: ${isRegeneration ? "YES" : "NO"}`);
    if (isRegeneration) {
      console.log(`  Feedback    : "${formData.feedback}"`);
    }
    console.log("=".repeat(60));

    // --- PERSONAL MEMORY: load most-recent preference per entity for this user ---
    const { data: rawPreferences } = await supabase
      .from("planner_preferences")
      .select("entity_type, entity_name, sentiment, reason, recorded_at")
      .eq("user_id", userId)
      .order("recorded_at", { ascending: false });

    // Deduplicate: first occurrence per key = most recent (ordered DESC above)
    const seen = new Set<string>();
    const overriddenBy: Record<string, string> = {};
    const latestPreferences = (rawPreferences || []).filter((p) => {
      const key = `${p.entity_type}:${p.entity_name.toLowerCase()}`;
      if (seen.has(key)) {
        overriddenBy[key] = (overriddenBy[key] || "older entry") + " (shadowed)";
        return false;
      }
      seen.add(key);
      return true;
    });

    console.log("[MEMORY] Raw preferences from DB:");
    if (!rawPreferences || rawPreferences.length === 0) {
      console.log("  (none — first-time user or no preferences saved yet)");
    } else {
      rawPreferences.forEach((p) => {
        const key = `${p.entity_type}:${p.entity_name.toLowerCase()}`;
        const shadowed = overriddenBy[key] ? " ← SHADOWED by newer entry" : "";
        console.log(
          `  [${p.sentiment.toUpperCase()}] [${p.entity_type}] ${p.entity_name}` +
          `${p.reason ? ` — "${p.reason}"` : ""}` +
          ` (${new Date(p.recorded_at).toLocaleDateString("en-GB")})${shadowed}`,
        );
      });
    }

    const positives = latestPreferences.filter((p) => p.sentiment === "positive");
    const negatives = latestPreferences.filter((p) => p.sentiment === "negative");

    console.log(`\n[MEMORY] Deduplicated — injecting ${latestPreferences.length} active preferences into prompt:`);
    console.log(`  LIKES  (${positives.length}): ${positives.map((p) => p.entity_name).join(", ") || "none"}`);
    console.log(`  AVOIDS (${negatives.length}): ${negatives.map((p) => p.entity_name).join(", ") || "none"}`);

    const personalMemoryBlock =
      latestPreferences.length > 0
        ? `
USER PERSONAL MEMORY (Date-stamped — newer entries override older ones):
LIKES / WANTS:
${
  positives.length > 0
    ? positives
        .map(
          (p) =>
            `• [${p.entity_type}] ${p.entity_name}${p.reason ? ` — "${p.reason}"` : ""} (recorded ${new Date(p.recorded_at).toLocaleDateString("en-GB")})`,
        )
        .join("\n")
    : "  None recorded."
}

DISLIKES / AVOID:
${
  negatives.length > 0
    ? negatives
        .map(
          (p) =>
            `• [${p.entity_type}] ${p.entity_name}${p.reason ? ` — "${p.reason}"` : ""} (recorded ${new Date(p.recorded_at).toLocaleDateString("en-GB")})`,
        )
        .join("\n")
    : "  None recorded."
}

Apply this as soft guidance to fill gaps and make the design feel personal. If the CURRENT REQUEST explicitly includes or excludes anything, that always takes priority over memory.
`.trim()
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

    console.log("\n[CONTEXT] Garden data loaded:");
    console.log(`  Areas     (${(areas || []).length}): ${(areas || []).map((a: any) => a.name).join(", ") || "none"}`);
    console.log(`  Inventory (${(inventory || []).length}): ${(inventory || []).map((i: any) => i.plant_name).join(", ") || "none"}`);

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
      Dimensions: Height: ${formData.height || "N/A"}, Width: ${formData.width || "N/A"}, Depth: ${formData.depth || "N/A"}
      Included Features: ${formData.inclusivePlants || "None"}
      Excluded Features: ${formData.exclusivePlants || "None"}
      Wildlife Goals: ${formData.wildlife || "None"}
      Desired Difficulty: ${formData.difficulty || "Average"}
      Desired Maintenance: ${formData.maintenance || "Average"}
      Special Considerations: ${formData.considerations || "None"}
    `;

    console.log("\n[PROMPT] User request sent to AI:");
    console.log(`  Plan Name       : ${formData.planName}`);
    console.log(`  Description     : ${formData.description}`);
    console.log(`  Dimensions      : H=${formData.height || "N/A"} W=${formData.width || "N/A"} D=${formData.depth || "N/A"}`);
    console.log(`  Aesthetic       : ${formData.aesthetic || "N/A"}`);
    console.log(`  Sunlight        : ${formData.sunlight || "N/A"}`);
    console.log(`  Medium          : ${formData.medium || "N/A"}`);
    console.log(`  Must Include    : ${formData.inclusivePlants || "none"}`);
    console.log(`  Must Exclude    : ${formData.exclusivePlants || "none"}`);
    console.log(`  Wildlife Goals  : ${formData.wildlife || "none"}`);
    console.log(`  Difficulty      : ${formData.difficulty || "N/A"}`);
    console.log(`  Maintenance     : ${formData.maintenance || "N/A"}`);
    console.log(`  Considerations  : ${formData.considerations || "none"}`);
    if (personalMemoryBlock) {
      console.log("\n[PROMPT] Personal memory block injected into system prompt:");
      console.log(personalMemoryBlock);
    } else {
      console.log("\n[PROMPT] No personal memory block — generating from scratch.");
    }

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
    let modelUsed = "";

    for (const model of modelsToTry) {
      try {
        console.log(`\n[AI] Attempting generation with model: ${model} ...`);
        aiResult = await callGemini(model, geminiApiKey, promptText, systemPrompt);
        modelUsed = model;
        success = true;
        break;
      } catch (error: any) {
        console.warn(`[AI] Model ${model} failed: ${error.message}`);
        lastError = error.message;
      }
    }

    if (!success)
      throw new Error(`All AI models failed. Last error: ${lastError}`);

    console.log(`\n[AI] Generation succeeded with model: ${modelUsed}`);
    console.log(`[AI] Result summary:`);
    console.log(`  Title      : ${aiResult.project_overview?.title}`);
    console.log(`  Summary    : ${aiResult.project_overview?.summary}`);
    console.log(`  Difficulty : ${aiResult.project_overview?.estimated_difficulty}`);
    console.log(`  Plants (${(aiResult.plant_manifest || []).length}):`);
    (aiResult.plant_manifest || []).forEach((p: any) => {
      console.log(`    • ${p.common_name} x${p.quantity} [${p.role}]`);
      console.log(`      Aesthetic : ${p.aesthetic_reason}`);
      console.log(`      Horticult.: ${p.horticultural_reason}`);
    });
    console.log(`  Prep tasks (${(aiResult.preparation_tasks || []).length}): ${(aiResult.preparation_tasks || []).map((t: any) => t.title).join(" → ")}`);
    console.log(`  Maintenance tasks (${(aiResult.custom_maintenance_tasks || []).length}): ${(aiResult.custom_maintenance_tasks || []).map((t: any) => `${t.title} (every ${t.frequency_days}d)`).join(", ")}`);

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
      console.log("\n[PREFERENCES] Extracting structured preferences from regen feedback...");
      try {
        const supabaseAdmin = createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        );

        const extracted = await extractPreferencesFromFeedback(
          modelsToTry[0],
          geminiApiKey,
          formData.feedback,
        );

        console.log(`[PREFERENCES] Raw extraction result (${extracted.length} items):`);
        extracted.forEach((p) =>
          console.log(`  [${p.sentiment.toUpperCase()}] [${p.entity_type}] ${p.entity_name}${p.reason ? ` — "${p.reason}"` : ""}`),
        );

        const validEntityTypes = new Set([
          "plant", "aesthetic", "feature", "maintenance", "wildlife", "difficulty",
        ]);
        const validSentiments = new Set(["positive", "negative"]);

        const rows = extracted
          .filter(
            (p) =>
              validEntityTypes.has(p.entity_type) &&
              validSentiments.has(p.sentiment) &&
              p.entity_name?.trim(),
          )
          .map((p) => ({
            home_id: homeId,
            user_id: userId,
            entity_type: p.entity_type,
            entity_name: p.entity_name.trim(),
            sentiment: p.sentiment,
            reason: p.reason?.trim() || null,
          }));

        const skipped = extracted.length - rows.length;
        if (skipped > 0) {
          console.log(`[PREFERENCES] Skipped ${skipped} item(s) with invalid entity_type or sentiment.`);
        }

        if (rows.length > 0) {
          await supabaseAdmin.from("planner_preferences").insert(rows);
          console.log(`[PREFERENCES] Saved ${rows.length} preference(s) to DB — will influence future plans for this user.`);
        } else {
          console.log("[PREFERENCES] No valid preferences to save.");
        }
      } catch (prefError) {
        console.error("[PREFERENCES] Extraction failed (non-critical):", prefError);
      }
    }

    console.log("\n[DONE] Returning blueprint to client.");
    console.log("=".repeat(60));

    return new Response(
      JSON.stringify({ blueprint: aiResult, cover_image_url: coverImageUrl }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error: any) {
    console.error("[ERROR]", error.message);
    console.log("=".repeat(60));
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
