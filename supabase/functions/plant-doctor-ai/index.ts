import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Helper function to call the Gemini REST API
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
      generationConfig: { temperature: 0.7, maxOutputTokens: 500 },
    }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || `Gemini API Error from ${model}`);
  }

  const data = await response.json();
  return data.candidates[0].content.parts[0].text;
}

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  try {
    const { messages, currentContext, homeId } = await req.json();

    // 1. Initialize Supabase using the USER'S auth token to enforce RLS
    const authHeader = req.headers.get("Authorization")!;
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    // 2. Fetch the user's real garden data to give the AI context
    const { data: areas } = await supabase
      .from("areas")
      .select("name, sunlight, location_id")
      .eq("home_id", homeId);
    const { data: inventory } = await supabase
      .from("inventory_items")
      .select("plant_name, status")
      .eq("home_id", homeId);

    // 3. Build the Master System Prompt
    const systemPrompt = `
      You are the Rhozly Plant Doctor, an expert, empathetic, and highly knowledgeable botanist and garden planner.
      YOUR PRIME DIRECTIVE: You MUST ONLY answer questions related to plants, gardening, landscaping, botany, and agriculture. 
      If the user asks about anything else (coding, politics, math, etc.), politely refuse and steer the conversation back to their garden.

      You have access to the user's specific garden data. 
      USER'S CURRENT GARDEN AREAS: ${JSON.stringify(areas || [])}
      USER'S CURRENT PLANTS: ${JSON.stringify(inventory || [])}

      The user is currently looking at this specific context on their screen:
      CURRENT SCREEN CONTEXT: ${currentContext ? JSON.stringify(currentContext) : "Dashboard/General"}

      Use this data to provide highly personalized advice. If they ask "where should I put this?", look at their areas and sunlight data to make a recommendation. Keep answers concise, formatted with markdown, and highly actionable.
    `;

    // 4. Format messages specifically for Gemini
    const geminiMessages = messages.map((msg: any) => ({
      role: msg.role === "assistant" ? "model" : msg.role,
      parts: [{ text: msg.content }],
    }));

    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiApiKey) throw new Error("Missing GEMINI_API_KEY");

    // 5. The Waterfall Fallback Logic
    const modelsToTry = [
      "gemini-3.1-flash-lite-preview", // Primary
      "gemini-2.5-flash-lite", // Fast fallback
      "gemini-3-flash-preview", // Heavy-duty fallback
      "gemini-3.1-pro-preview", // Heavy-duty fallback
    ];

    let reply = "";
    let success = false;
    let lastError = "";

    for (const model of modelsToTry) {
      try {
        console.log(`Attempting generation with model: ${model}...`);
        reply = await callGemini(
          model,
          geminiApiKey,
          geminiMessages,
          systemPrompt,
        );
        success = true;
        console.log(`Success with ${model}!`);
        break; // Exit the loop immediately if successful
      } catch (error: any) {
        console.warn(`Failed with ${model}:`, error.message);
        lastError = error.message;
        // The loop naturally continues to the next model in the array
      }
    }

    if (!success) {
      throw new Error(
        `All AI models are currently overwhelmed. Last error: ${lastError}`,
      );
    }

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
