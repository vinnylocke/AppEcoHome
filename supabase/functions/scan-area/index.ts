import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { callGeminiCascade, toMessages } from "../_shared/gemini.ts";
import { log, warn, error as logError } from "../_shared/logger.ts";

const FN = "scan-area";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    capacity: {
      type: "object",
      properties: {
        current_count: { type: "integer" },
        estimated_max: { type: "integer" },
        label: { type: "string", enum: ["Well stocked", "Room to grow", "Near capacity", "Overcrowded"] },
      },
      required: ["current_count", "estimated_max", "label"],
    },
    plants: {
      type: "array",
      items: {
        type: "object",
        properties: {
          identified_name:      { type: "string" },
          scientific_name:      { type: "string" },
          confidence:           { type: "number" },
          health_status:        { type: "string", enum: ["good", "warning", "issue"] },
          health_notes:         { type: "string" },
          pruning_advice:       { type: "string" },
          position_suitability: { type: "string", enum: ["good", "marginal", "poor"] },
          position_notes:       { type: "string" },
        },
        required: ["identified_name", "confidence", "health_status", "health_notes", "position_suitability"],
      },
    },
    companions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name:   { type: "string" },
          reason: { type: "string" },
        },
        required: ["name", "reason"],
      },
    },
    maintenance: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title:          { type: "string" },
          description:    { type: "string" },
          urgency:        { type: "string", enum: ["now", "this_week", "this_month", "seasonal"] },
          recurring:      { type: "boolean" },
          frequency_days: { type: "integer" },
        },
        required: ["title", "description", "urgency", "recurring"],
      },
    },
    pests_diseases: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name:             { type: "string" },
          type:             { type: "string", enum: ["pest", "disease"] },
          severity:         { type: "string", enum: ["mild", "moderate", "severe"] },
          affected_plants:  { type: "array", items: { type: "string" } },
          notes:            { type: "string" },
          action_needed:    { type: "string" },
        },
        required: ["name", "type", "severity", "notes", "action_needed"],
      },
    },
    soil_conditions: {
      type: "object",
      properties: {
        observed_medium:  { type: "string" },
        drainage_notes:   { type: "string" },
        recommendations:  { type: "string" },
      },
    },
    weather_advice: { type: "string" },
  },
  required: ["summary", "capacity", "plants", "companions", "maintenance", "pests_diseases", "soil_conditions"],
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  try {
    const {
      homeId,
      areaId,
      imageBase64,
      mimeType,
      questions,
      weatherSnap,
    } = await req.json() as {
      homeId: string;
      areaId: string;
      imageBase64: string;
      mimeType?: string;
      questions?: Record<string, string>;
      weatherSnap?: {
        temp_c?: number;
        condition?: string;
        humidity?: number;
        wind_kph?: number;
      };
    };

    if (!imageBase64) throw new Error("imageBase64 is required");
    if (!areaId) throw new Error("areaId is required");
    if (!homeId) throw new Error("homeId is required");

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    log(FN, "request_received", { homeId, areaId });

    // Fetch area + location context
    const { data: area } = await supabase
      .from("areas")
      .select("name, growing_medium, medium_ph, light_intensity_lux, locations(name, is_outside)")
      .eq("id", areaId)
      .single();

    // Fetch lux reading history
    const { data: luxReadings } = await supabase
      .from("area_lux_readings")
      .select("lux_value, recorded_at, source")
      .eq("area_id", areaId)
      .order("recorded_at", { ascending: false })
      .limit(10);

    const luxContext = luxReadings?.length
      ? `Last ${luxReadings.length} light readings:\n` +
        luxReadings.map((r: any) =>
          `  ${r.lux_value.toLocaleString()} lux on ${new Date(r.recorded_at).toLocaleString()} (${r.source})`
        ).join("\n")
      : area?.light_intensity_lux
        ? `Light intensity: ${area.light_intensity_lux} lux (single reading, no history)`
        : "Light level: unknown";

    // Fetch existing plants in this area
    const { data: existingPlants } = await supabase
      .from("inventory_items")
      .select("plant_name, identifier")
      .eq("area_id", areaId)
      .neq("status", "Archived");

    const locationName = (area?.locations as any)?.name ?? "Unknown location";
    const isOutside = (area?.locations as any)?.is_outside ?? false;

    const existingPlantsCtx = existingPlants?.length
      ? `Known plants already logged in this area: ${existingPlants.map((p) => p.plant_name).join(", ")}.`
      : "No plants currently logged in this area.";

    const weatherCtx = weatherSnap
      ? `Current weather: ${weatherSnap.condition ?? "unknown"}, ${weatherSnap.temp_c ?? "?"}°C, humidity ${weatherSnap.humidity ?? "?"}%, wind ${weatherSnap.wind_kph ?? "?"} km/h.`
      : "";

    const questionsCtx = questions
      ? Object.entries(questions)
          .map(([q, a]) => `${q}: ${a}`)
          .join("\n")
      : "";

    const userText = `Analyse this garden area image thoroughly.

Area: ${area?.name ?? "Unknown area"} (${isOutside ? "outdoor" : "indoor"})
Location: ${locationName}
Growing medium: ${area?.growing_medium ?? "unknown"}
pH: ${area?.medium_ph ?? "unknown"}
${luxContext}
${existingPlantsCtx}
${weatherCtx ? weatherCtx + "\n" : ""}${questionsCtx ? questionsCtx + "\n" : ""}
For every visible plant: identify it with a confidence score (0–1), assess health, note any pruning needs, and evaluate its position suitability.
Assess overall space capacity.
Suggest up to 3 companion plants that would benefit this area.
List actionable maintenance tasks with urgency.
Flag any pests or diseases visible or likely given the conditions.
Note soil/growing medium observations.
${weatherCtx ? "Include weather-aware advice based on the current conditions provided." : ""}
Return valid JSON matching the schema exactly.`;

    const messages = toMessages([
      { inlineData: { data: imageBase64, mimeType: mimeType ?? "image/jpeg" } },
      { text: userText },
    ]);

    const raw = await callGeminiCascade(
      apiKey,
      FN,
      messages,
      {
        systemPrompt:
          "You are an expert horticulturalist and garden diagnostician. Analyse garden area images and return structured JSON assessments covering plant health, identification, pests, maintenance, and space management. Be specific to what you can actually see in the image. If unclear in any area, note it. Always return valid JSON matching the provided schema.",
        temperature: 0.3,
        maxOutputTokens: 3000,
        responseSchema: RESPONSE_SCHEMA,
        models: [
          "gemini-2.5-flash-lite",
          "gemini-3.1-flash-lite-preview",
          "gemini-3-flash-preview",
          "gemini-3.1-pro-preview",
        ],
        logContext: { homeId, areaId },
      },
    );

    const analysis = JSON.parse(raw);
    log(FN, "analysis_complete", { homeId, areaId, plantCount: analysis.plants?.length ?? 0 });

    return new Response(JSON.stringify(analysis), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    logError(FN, "error", { error: err.message });
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
