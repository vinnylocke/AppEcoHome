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
        maxOutputTokens: 800, // Bumped up slightly to allow for JSON overhead
        responseMimeType: "application/json",
        // 🔥 This forces Gemini to output the exact object shape we need!
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

    // Minor update to the system prompt to remind it about the JSON
    const systemPrompt = `
      You are the Rhozly Plant Doctor, an expert, empathetic, and highly knowledgeable botanist and garden planner.
      YOUR PRIME DIRECTIVE: You MUST ONLY answer questions related to plants, gardening, landscaping, botany, and agriculture. 
      If the user asks about anything else, politely refuse.

      USER'S CURRENT GARDEN AREAS: ${JSON.stringify(areas || [])}
      USER'S CURRENT PLANTS: ${JSON.stringify(inventory || [])}
      CURRENT SCREEN CONTEXT: ${currentContext ? JSON.stringify(currentContext) : "Dashboard/General"}

      Provide highly personalized advice formatted in markdown. 
      IMPORTANT: If you recommend a specific plant that they do NOT already own, you must include it in the 'suggested_plants' array in your JSON response so the UI can generate action buttons.
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

    // We now return the structured object directly to the frontend!
    return new Response(
      JSON.stringify({
        reply: aiResult.text,
        suggested_plants: aiResult.suggested_plants || [],
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
