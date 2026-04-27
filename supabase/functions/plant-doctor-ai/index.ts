import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { log, error as logError } from "../_shared/logger.ts";
import {
  loadPreferences,
  formatPreferencesBlock,
  filterNewPreferences,
  savePreferences,
  ENTITY_TYPES,
  type PreferenceRow,
} from "../_shared/preferences.ts";
import { callGeminiCascade } from "../_shared/gemini.ts";

const FN = "plant-doctor-ai";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const CHAT_SCHEMA = {
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
          name: { type: "STRING", description: "Full common name (e.g., 'Monstera Deliciosa')" },
          search_query: { type: "STRING", description: "Simplified name for API searching (e.g., 'Monstera')" },
        },
        required: ["name", "search_query"],
      },
    },
    suggested_tasks: {
      type: "ARRAY",
      description: "Populate this if generating a care plan, to-do list, or sequence of actions.",
      items: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING" },
          description: { type: "STRING" },
          task_type: { type: "STRING", description: "MUST be exactly one of: 'Planting', 'Watering', 'Harvesting', 'Maintenance'" },
          due_in_days: { type: "INTEGER", description: "0 for today, 1 for tomorrow, 7 for next week" },
          is_recurring: { type: "BOOLEAN", description: "true for continuous habits, false for one-offs" },
          frequency_days: { type: "INTEGER", nullable: true, description: "interval if is_recurring is true, else null" },
          end_offset_days: { type: "INTEGER", nullable: true, description: "how many days until the recurring task stops, else null" },
          depends_on_index: { type: "INTEGER", nullable: true, description: "Array index of the blocking task, else null" },
        },
        required: ["title", "description", "task_type", "due_in_days", "is_recurring"],
      },
    },
    detected_preferences: {
      type: "ARRAY",
      description: "Extract explicit preferences from the LATEST user message only. Only capture genuine, stated preferences — never assumptions. Leave empty if the user expresses no clear preference.",
      items: {
        type: "OBJECT",
        properties: {
          entity_type: { type: "STRING", description: `Category of preference. Must be one of: ${ENTITY_TYPES.map((t) => `'${t}'`).join(", ")}` },
          entity_name: { type: "STRING", description: "The specific value being preferred or avoided (e.g., 'Roses', 'low-maintenance', 'organic', 'Mediterranean', 'drought-tolerant')" },
          sentiment: { type: "STRING", description: "Either 'positive' (user likes/wants this) or 'negative' (user dislikes/avoids this)" },
          reason: { type: "STRING", description: "Brief quote or paraphrase of what the user said that triggered this detection" },
        },
        required: ["entity_type", "entity_name", "sentiment", "reason"],
      },
    },
  },
  required: ["text"],
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  try {
    const { messages, currentContext, homeId } = await req.json();

    const authHeader = req.headers.get("Authorization") ?? "";
    const authToken = authHeader.replace("Bearer ", "");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    // Resolve the calling user early so preferences are loaded per-user,
    // not per-home (otherwise all household members share one preference set).
    const { data: { user } } = await supabase.auth.getUser(authToken);
    const userId = user?.id ?? null;

    log(FN, "request_received", {
      homeId,
      userId,
      messageCount: messages?.length ?? 0,
      hasContext: !!currentContext,
    });

    const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    // Garden context (shared for the whole home) and preferences (personal) in parallel.
    const [areasRes, inventoryRes, tasksRes, existingPrefs] = await Promise.all([
      supabase.from("areas").select("name, sunlight, location_id").eq("home_id", homeId),
      supabase.from("inventory_items").select("plant_name, status, growth_state, area_id, areas(name, sunlight)").eq("home_id", homeId),
      supabase.from("tasks").select("title, due_date, type").eq("home_id", homeId).eq("status", "Pending").lte("due_date", sevenDaysFromNow).order("due_date", { ascending: true }),
      loadPreferences(supabase, userId ? { userId } : { homeId }),
    ]);

    const areas = areasRes.data || [];
    const inventory = inventoryRes.data || [];
    const upcomingTasks = tasksRes.data || [];

    // Group plants by area for a richer context block
    const plantsByArea: Record<string, { areaName: string; sunlight: string; plants: string[] }> = {};
    const unassignedPlants: string[] = [];
    for (const item of inventory) {
      const areaName = (item.areas as any)?.name;
      const sunlight = (item.areas as any)?.sunlight;
      const label = `${item.plant_name} (${item.status}${item.growth_state ? `, ${item.growth_state}` : ""})`;
      if (areaName) {
        const key = item.area_id;
        if (!plantsByArea[key]) plantsByArea[key] = { areaName, sunlight: sunlight ?? "unknown", plants: [] };
        plantsByArea[key].plants.push(label);
      } else {
        unassignedPlants.push(label);
      }
    }
    const inventoryContext = [
      ...Object.values(plantsByArea).map(
        (g) => `${g.areaName} (${g.sunlight}): ${g.plants.join(", ")}`,
      ),
      ...(unassignedPlants.length > 0 ? [`Unassigned: ${unassignedPlants.join(", ")}`] : []),
    ].join("\n") || "No plants recorded yet.";

    log(FN, "context_loaded", {
      homeId,
      userId,
      areasCount: areas.length,
      inventoryCount: inventory.length,
      areasWithPlants: Object.keys(plantsByArea).length,
      unassignedCount: unassignedPlants.length,
      upcomingTasksCount: upcomingTasks.length,
      prefsCount: existingPrefs.length,
      prefsSummary: existingPrefs.map((p) => `${p.sentiment}:${p.entity_name}`),
    });

    const prefsText = formatPreferencesBlock(existingPrefs, "simple");

    const systemPrompt = `
      You are the Rhozly Plant Doctor, an expert, empathetic, and highly knowledgeable botanist and garden planner.
      YOUR PRIME DIRECTIVE: You MUST ONLY answer questions related to plants, gardening, landscaping, botany, and agriculture.
      If the user asks about anything else, politely refuse.

      USER'S CURRENT GARDEN AREAS: ${JSON.stringify(areas)}
      USER'S CURRENT PLANTS (grouped by area with growth state):
      ${inventoryContext}
      UPCOMING TASKS (next 7 days, pending):
      ${upcomingTasks.length > 0 ? upcomingTasks.map((t: any) => `• [${t.type}] ${t.title} — due ${t.due_date}`).join("\n") : "None scheduled."}
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
      Scan only the latest user message for explicit preferences. Valid entity_type values: ${ENTITY_TYPES.join(", ")}.
      Examples:
      - "I hate pests" → entity_type: pest_management, entity_name: pests, sentiment: negative
      - "I love drought-tolerant plants" → entity_type: water_usage, entity_name: drought-tolerant, sentiment: positive
      - "I don't want anything thorny" → entity_type: plant, entity_name: thorny plants, sentiment: negative
      - "I prefer organic solutions" → entity_type: pest_management, entity_name: organic, sentiment: positive
      - "I love purple flowers" → entity_type: colour, entity_name: purple, sentiment: positive
      - "I want a cottage garden feel" → entity_type: aesthetic, entity_name: Cottage Garden, sentiment: positive
      - "I'd like a water feature" → entity_type: feature, entity_name: Water Feature, sentiment: positive
      - "I need frost-hardy plants" → entity_type: climate, entity_name: frost-hardy, sentiment: positive
      - "I have sandy soil" → entity_type: soil, entity_name: Sandy Soil, sentiment: positive
      Do NOT infer preferences — only capture what is explicitly stated.
    `;

    const geminiMessages = messages.map((msg: any) => ({
      role: msg.role === "assistant" ? "model" : msg.role,
      parts: [{ text: msg.content }],
    }));

    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiApiKey) throw new Error("Missing GEMINI_API_KEY");

    const rawText = await callGeminiCascade(geminiApiKey, FN, geminiMessages, {
      systemPrompt,
      temperature: 0.7,
      maxOutputTokens: 1500,
      responseSchema: CHAT_SCHEMA,
    });

    const aiResult = JSON.parse(rawText);

    // Save any newly detected preferences (deduplicated against existing ones)
    const detectedPrefs = aiResult.detected_preferences || [];
    let savedCount = 0;

    if (detectedPrefs.length > 0) {
      const newPrefs = filterNewPreferences(detectedPrefs, existingPrefs);

      if (newPrefs.length > 0) {
        const rows: PreferenceRow[] = newPrefs.map((p) => ({
          home_id: homeId,
          user_id: userId,
          entity_type: p.entity_type,
          entity_name: p.entity_name,
          sentiment: p.sentiment,
          reason: p.reason ?? null,
        }));

        savedCount = await savePreferences(supabase, rows);
        log(FN, "preferences_saved", {
          homeId,
          userId,
          count: savedCount,
          saved: newPrefs.map((p) => `${p.sentiment}:${p.entity_type}:${p.entity_name}`),
        });
      }
    }

    log(FN, "result", {
      homeId,
      userId,
      suggestedPlantsCount: (aiResult.suggested_plants || []).length,
      suggestedTasksCount: (aiResult.suggested_tasks || []).length,
      detectedPrefsCount: (aiResult.detected_preferences || []).length,
      preferencesSaved: savedCount,
    });

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
  } catch (err: any) {
    logError(FN, "error", { error: err.message });
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
