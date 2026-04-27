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
  messages: any[],
  systemPrompt: string,
) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: messages,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1500,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            text: {
              type: "STRING",
              description: "Your standard conversational markdown reply to the user.",
            },
            suggested_plants: {
              type: "ARRAY",
              description:
                "Only populate this if you are explicitly suggesting new plants for them to add to their garden. Otherwise leave it empty.",
              items: {
                type: "OBJECT",
                properties: {
                  name: {
                    type: "STRING",
                    description: "Full common name (e.g., 'Monstera Deliciosa')",
                  },
                  search_query: {
                    type: "STRING",
                    description: "Simplified name for API searching (e.g., 'Monstera')",
                  },
                },
                required: ["name", "search_query"],
              },
            },
            suggested_tasks: {
              type: "ARRAY",
              description:
                "Populate this if generating a care plan, to-do list, or sequence of actions.",
              items: {
                type: "OBJECT",
                properties: {
                  title: { type: "STRING" },
                  description: { type: "STRING" },
                  task_type: {
                    type: "STRING",
                    description:
                      "MUST be exactly one of: 'Planting', 'Watering', 'Harvesting', 'Maintenance'",
                  },
                  due_in_days: {
                    type: "INTEGER",
                    description: "0 for today, 1 for tomorrow, 7 for next week",
                  },
                  is_recurring: {
                    type: "BOOLEAN",
                    description: "true for continuous habits, false for one-offs",
                  },
                  frequency_days: {
                    type: "INTEGER",
                    nullable: true,
                    description: "interval if is_recurring is true, else null",
                  },
                  end_offset_days: {
                    type: "INTEGER",
                    nullable: true,
                    description: "how many days until the recurring task stops, else null",
                  },
                  depends_on_index: {
                    type: "INTEGER",
                    nullable: true,
                    description: "Array index of the blocking task, else null",
                  },
                },
                required: ["title", "description", "task_type", "due_in_days", "is_recurring"],
              },
            },
            detected_preferences: {
              type: "ARRAY",
              description:
                "Extract explicit preferences from the LATEST user message only. Only capture genuine, stated preferences — never assumptions. Leave empty if the user expresses no clear preference.",
              items: {
                type: "OBJECT",
                properties: {
                  entity_type: {
                    type: "STRING",
                    description:
                      "Category of preference. Must be one of: 'plant', 'aesthetic', 'maintenance', 'difficulty', 'wildlife', 'colour', 'pest_management', 'soil', 'climate', 'water_usage'",
                  },
                  entity_name: {
                    type: "STRING",
                    description:
                      "The specific value being preferred or avoided (e.g., 'Roses', 'low-maintenance', 'organic', 'Mediterranean', 'drought-tolerant')",
                  },
                  sentiment: {
                    type: "STRING",
                    description: "Either 'positive' (user likes/wants this) or 'negative' (user dislikes/avoids this)",
                  },
                  reason: {
                    type: "STRING",
                    description: "Brief quote or paraphrase of what the user said that triggered this detection",
                  },
                },
                required: ["entity_type", "entity_name", "sentiment", "reason"],
              },
            },
          },
          required: ["text"],
        },
      },
    }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || `Gemini API Error from ${model}`);
  }

  const data = await response.json();
  return JSON.parse(data.candidates[0].content.parts[0].text);
}

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  try {
    const { messages, currentContext, homeId } = await req.json();

    const authHeader = req.headers.get("Authorization")!;
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    // Fetch garden context and existing preferences in parallel
    const [areasRes, inventoryRes, prefsRes] = await Promise.all([
      supabase.from("areas").select("name, sunlight, location_id").eq("home_id", homeId),
      supabase.from("inventory_items").select("plant_name, status").eq("home_id", homeId),
      supabase.from("planner_preferences").select("entity_type, entity_name, sentiment, reason").eq("home_id", homeId),
    ]);

    const areas = areasRes.data || [];
    const inventory = inventoryRes.data || [];
    const existingPrefs = prefsRes.data || [];

    const prefsText = existingPrefs.length > 0
      ? existingPrefs
          .map((p: any) =>
            `- ${p.sentiment === "positive" ? "LIKES" : "DISLIKES"} [${p.entity_type}]: "${p.entity_name}"${p.reason ? ` — ${p.reason}` : ""}`,
          )
          .join("\n")
      : "None recorded yet.";

    const systemPrompt = `
      You are the Rhozly Plant Doctor, an expert, empathetic, and highly knowledgeable botanist and garden planner.
      YOUR PRIME DIRECTIVE: You MUST ONLY answer questions related to plants, gardening, landscaping, botany, and agriculture.
      If the user asks about anything else, politely refuse.

      USER'S CURRENT GARDEN AREAS: ${JSON.stringify(areas)}
      USER'S CURRENT PLANTS: ${JSON.stringify(inventory)}
      CURRENT SCREEN CONTEXT: ${currentContext ? JSON.stringify(currentContext) : "Dashboard/General"}

      USER'S KNOWN PREFERENCES (use these to personalise every response):
      ${prefsText}

      Provide highly personalised advice formatted in markdown.
      Always honour the user's known preferences — if they dislike something, never recommend it.
      If you recommend a specific plant they do NOT already own, include it in 'suggested_plants'.

      CRITICAL TASK GENERATION RULES:
      If the user asks for a schedule, a care plan, to-do list, or advice on what to do next, you MUST generate an array of tasks in the "suggested_tasks" JSON field.
      - "task_type": MUST be exactly one of: 'Planting', 'Watering', 'Harvesting', 'Maintenance'.
      - "due_in_days": Number. Use 0 for today, 1 for tomorrow, 7 for next week, etc.
      - "is_recurring": Boolean. true only for continuous habits. false for one-off actions.
      - "frequency_days": Number or null. Required when is_recurring is true.
      - "depends_on_index": Number or null. The array index of the task that must be completed first.

      PREFERENCE DETECTION RULES:
      Scan only the latest user message for explicit preferences. Examples:
      - "I hate pests" → entity_type: pest_management, entity_name: pests, sentiment: negative
      - "I love drought-tolerant plants" → entity_type: water_usage, entity_name: drought-tolerant, sentiment: positive
      - "I don't want anything thorny" → entity_type: plant, entity_name: thorny plants, sentiment: negative
      - "I prefer organic solutions" → entity_type: pest_management, entity_name: organic, sentiment: positive
      Do NOT infer preferences — only capture what is explicitly stated.
    `;

    const geminiMessages = messages.map((msg: any) => ({
      role: msg.role === "assistant" ? "model" : msg.role,
      parts: [{ text: msg.content }],
    }));

    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiApiKey) throw new Error("Missing GEMINI_API_KEY");

    const modelsToTry = [
      "gemini-3.1-flash-lite-preview",
      "gemini-2.5-flash-lite",
      "gemini-3-flash-preview",
      "gemini-3.1-pro-preview",
    ];

    let aiResult: any = null;
    let success = false;
    let lastError = "";

    for (const model of modelsToTry) {
      try {
        console.log(`Attempting generation with model: ${model}...`);
        aiResult = await callGemini(model, geminiApiKey, geminiMessages, systemPrompt);
        success = true;
        console.log(`Success with ${model}!`);
        break;
      } catch (error: any) {
        console.warn(`Failed with ${model}:`, error.message);
        lastError = error.message;
      }
    }

    if (!success) {
      throw new Error(`All AI models are currently overwhelmed. Last error: ${lastError}`);
    }

    // Save any newly detected preferences (deduplicated against existing ones)
    const detectedPrefs: any[] = aiResult.detected_preferences || [];
    let savedCount = 0;

    if (detectedPrefs.length > 0) {
      const { data: { user } } = await supabase.auth.getUser();

      const newPrefs = detectedPrefs.filter((p: any) =>
        !existingPrefs.some(
          (e: any) =>
            e.entity_type === p.entity_type &&
            e.entity_name.toLowerCase() === p.entity_name.toLowerCase() &&
            e.sentiment === p.sentiment,
        ),
      );

      if (newPrefs.length > 0) {
        await supabase.from("planner_preferences").insert(
          newPrefs.map((p: any) => ({
            home_id: homeId,
            user_id: user?.id,
            entity_type: p.entity_type,
            entity_name: p.entity_name,
            sentiment: p.sentiment,
            reason: p.reason,
          })),
        );
        savedCount = newPrefs.length;
        console.log(`Saved ${savedCount} new preference(s) for home ${homeId}`);
      }
    }

    return new Response(
      JSON.stringify({
        reply: aiResult.text,
        suggested_plants: aiResult.suggested_plants || [],
        suggested_tasks: aiResult.suggested_tasks || [],
        preferences_captured: savedCount,
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
