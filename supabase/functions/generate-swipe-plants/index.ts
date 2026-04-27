import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { log, error as logError } from "../_shared/logger.ts";
import { loadPreferences, formatPreferencesBlock, ENTITY_TYPES } from "../_shared/preferences.ts";
import { callGeminiCascade } from "../_shared/gemini.ts";

const FN = "generate-swipe-plants";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SWIPE_SCHEMA = {
  type: "OBJECT",
  properties: {
    plants: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING", description: "Common name (e.g., 'Lavender')" },
          scientific_name: { type: "STRING", description: "Latin name (e.g., 'Lavandula angustifolia')" },
          tagline: { type: "STRING", description: "One punchy sentence about why this plant is great." },
          tags: {
            type: "ARRAY",
            description: "3-6 trait tags — pick from the list of valid tags only.",
            items: { type: "STRING" },
          },
          image_query: { type: "STRING", description: "Simple search term for an image (e.g., 'Lavender flower')" },
        },
        required: ["name", "scientific_name", "tagline", "tags", "image_query"],
      },
    },
  },
  required: ["plants"],
};

const VALID_TAGS = [
  "low-maintenance", "high-maintenance", "drought-tolerant", "water-hungry",
  "full-sun", "partial-shade", "full-shade",
  "fragrant", "edible", "medicinal", "ornamental",
  "pollinator-friendly", "wildlife-friendly", "pet-safe", "toxic-to-pets",
  "fast-growing", "slow-growing", "evergreen", "deciduous",
  "frost-hardy", "frost-tender",
  "ground-cover", "climbing", "tree", "shrub", "perennial", "annual",
  "cottage-garden", "modern", "tropical", "mediterranean",
];

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  try {
    const { homeId, count = 10, alreadySeenPlantNames = [] } = await req.json();

    if (!homeId) throw new Error("homeId is required");

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user } } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    const userId = user?.id ?? null;

    log(FN, "request_received", { homeId, userId, count, seenCount: alreadySeenPlantNames.length });

    const [inventoryRes, existingPrefs] = await Promise.all([
      supabase
        .from("inventory_items")
        .select("plant_name, areas(name, sunlight)")
        .eq("home_id", homeId),
      loadPreferences(supabase, userId ? { userId } : { homeId }),
    ]);

    const inventory = inventoryRes.data || [];
    const ownedNames = inventory.map((i: any) => i.plant_name);
    const skipNames = Array.from(new Set([...ownedNames, ...alreadySeenPlantNames]));

    const prefsText = formatPreferencesBlock(existingPrefs, "simple");

    const systemPrompt = `
      You are a horticultural expert helping users discover plants they'll love.
      Generate exactly ${count} diverse plant suggestions for a swipe-style discovery feature.

      USER'S KNOWN PREFERENCES:
      ${prefsText}

      PLANTS THE USER ALREADY OWNS (do NOT suggest these):
      ${ownedNames.length > 0 ? ownedNames.join(", ") : "None yet."}

      PLANTS ALREADY SHOWN (do NOT repeat these):
      ${alreadySeenPlantNames.length > 0 ? alreadySeenPlantNames.join(", ") : "None yet."}

      RULES:
      - Never suggest a plant from either skip list.
      - Honour the user's preferences — avoid anything they dislike.
      - Skew toward plants matching positive preferences, but include some variety to help them discover new things.
      - Include a wide range of plant types: flowering shrubs, herbs, vegetables, climbers, ornamentals, trees.
      - Tags MUST only come from this approved list: ${VALID_TAGS.join(", ")}.
      - Each tagline must be one punchy sentence that would make someone want (or not want) this plant.
      - image_query should be a simple 2-3 word search phrase (e.g., "English Lavender", "Cherry Tomato plant").
    `;

    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiApiKey) throw new Error("Missing GEMINI_API_KEY");

    const rawText = await callGeminiCascade(
      geminiApiKey,
      FN,
      [{ role: "user", parts: [{ text: `Generate ${count} plant suggestions.` }] }],
      {
        systemPrompt,
        temperature: 0.9,
        maxOutputTokens: 2000,
        responseSchema: SWIPE_SCHEMA,
      },
    );

    const result = JSON.parse(rawText);
    const plants = (result.plants || []).slice(0, count).map((p: any) => ({
      ...p,
      id: crypto.randomUUID(),
      source: "ai" as const,
    }));

    log(FN, "result", { homeId, userId, plantCount: plants.length });

    return new Response(
      JSON.stringify({ plants }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (err: any) {
    logError(FN, "error", { error: err.message });
    return new Response(
      JSON.stringify({ error: err.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
    );
  }
});
