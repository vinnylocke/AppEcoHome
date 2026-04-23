import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Helper function to call the Gemini REST API with Structured Outputs
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
        maxOutputTokens: 1000, // Bumped up to allow for both tasks and plants JSON overhead
        responseMimeType: "application/json",
        // 🔥 Forces Gemini to output the exact object shape we need!
        responseSchema: {
          type: "OBJECT",
          properties: {
            text: {
              type: "STRING",
              description:
                "Your standard conversational markdown reply to the user.",
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
                    description:
                      "Full common name (e.g., 'Monstera Deliciosa')",
                  },
                  search_query: {
                    type: "STRING",
                    description:
                      "Simplified name for API searching (e.g., 'Monstera')",
                  },
                },
                required: ["name", "search_query"],
              },
            },
            // 🚀 NEW: Suggested Tasks Array
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
                    description:
                      "true for continuous habits, false for one-offs",
                  },
                  frequency_days: {
                    type: "INTEGER",
                    nullable: true,
                    description: "interval if is_recurring is true, else null",
                  },
                  end_offset_days: {
                    type: "INTEGER",
                    nullable: true,
                    description:
                      "how many days until the recurring task stops, else null",
                  },
                  depends_on_index: {
                    type: "INTEGER",
                    nullable: true,
                    description: "Array index of the blocking task, else null",
                  },
                },
                required: [
                  "title",
                  "description",
                  "task_type",
                  "due_in_days",
                  "is_recurring",
                ],
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
  const rawString = data.candidates[0].content.parts[0].text;

  // Gemini returns a JSON string, so we parse it into a real object
  return JSON.parse(rawString);
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

    const { data: areas } = await supabase
      .from("areas")
      .select("name, sunlight, location_id")
      .eq("home_id", homeId);
    const { data: inventory } = await supabase
      .from("inventory_items")
      .select("plant_name, status")
      .eq("home_id", homeId);

    // 🚀 NEW: Injected the CRITICAL TASK GENERATION RULES
    const systemPrompt = `
      You are the Rhozly Plant Doctor, an expert, empathetic, and highly knowledgeable botanist and garden planner.
      YOUR PRIME DIRECTIVE: You MUST ONLY answer questions related to plants, gardening, landscaping, botany, and agriculture. 
      If the user asks about anything else, politely refuse.

      USER'S CURRENT GARDEN AREAS: ${JSON.stringify(areas || [])}
      USER'S CURRENT PLANTS: ${JSON.stringify(inventory || [])}
      CURRENT SCREEN CONTEXT: ${currentContext ? JSON.stringify(currentContext) : "Dashboard/General"}

      Provide highly personalized advice formatted in markdown. 
      IMPORTANT: If you recommend a specific plant that they do NOT already own, you must include it in the 'suggested_plants' array in your JSON response so the UI can generate action buttons.

      CRITICAL TASK GENERATION RULES:
      If the user asks for a schedule, a care plan, to-do list, or advice on what to do next, you MUST generate an array of tasks in the "suggested_tasks" JSON field.

      You must obey the database schema exactly:
      - "task_type": MUST be exactly one of: 'Planting', 'Watering', 'Harvesting', 'Maintenance'. Do not use any other words.
      - "due_in_days": Number. Use 0 for today, 1 for tomorrow, 7 for next week, etc.
      - "is_recurring": Boolean. Use true only for continuous habits (like weekly watering). Use false for one-off actions (like planting a seed or pruning a dead leaf).
      - "frequency_days": Number or null. If is_recurring is true, you must provide the interval (e.g., 7).
      - "depends_on_index": Number or null. If a task cannot be completed until another task in this array is done, put the array index of the blocking task here (e.g., if Planting (index 1) requires Prep Soil (index 0), put 0).
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
        aiResult = await callGemini(
          model,
          geminiApiKey,
          geminiMessages,
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
      throw new Error(
        `All AI models are currently overwhelmed. Last error: ${lastError}`,
      );
    }

    // 🚀 NEW: Return the structured object including suggested_tasks
    return new Response(
      JSON.stringify({
        reply: aiResult.text,
        suggested_plants: aiResult.suggested_plants || [],
        suggested_tasks: aiResult.suggested_tasks || [],
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
