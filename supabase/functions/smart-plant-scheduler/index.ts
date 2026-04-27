import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { log, warn, error as logError } from "../_shared/logger.ts";
import { callGeminiCascade, toMessages } from "../_shared/gemini.ts";
import { loadPreferences, formatPreferencesBlock } from "../_shared/preferences.ts";

const FN = "smart-plant-scheduler";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { plantName, areaDetails, address, availableMethods, homeId, priorSchedule } =
      await req.json();

    const authHeader = req.headers.get("Authorization") ?? "";
    const authToken = authHeader.replace("Bearer ", "");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabase.auth.getUser(authToken);
    const userId = user?.id ?? null;

    log(FN, "request_received", { plantName, address, homeId, userId, availableMethodsCount: availableMethods?.length ?? 0 });

    if (!address || !plantName || !availableMethods) {
      throw new Error(
        "Missing required fields. Ensure home address/postcode is set.",
      );
    }

    // =================================================================
    // GEOCODING LOGIC (Open-Meteo + Postcodes.io Fallback)
    // =================================================================
    let lat, lng;

    // --- GEOCODER 1: OPEN-METEO (Great for Cities) ---
    const meteoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(address)}&count=1&format=json`,
    );
    const meteoData = await meteoRes.json();

    if (meteoData.results && meteoData.results.length > 0) {
      lat = meteoData.results[0].latitude;
      lng = meteoData.results[0].longitude;
      log(FN, "geocode_success", { source: "open-meteo", name: meteoData.results[0].name, lat, lng });
    }
    // --- GEOCODER 2: POSTCODES.IO FALLBACK (Great for UK Postcodes) ---
    else {
      warn(FN, "geocode_fallback", { address, reason: "open-meteo returned no results" });
      const cleanPostcode = address.replace(/\s+/g, "");
      const pcRes = await fetch(
        `https://api.postcodes.io/postcodes/${encodeURIComponent(cleanPostcode)}`,
      );

      if (pcRes.status === 200) {
        const pcData = await pcRes.json();
        lat = pcData.result.latitude;
        lng = pcData.result.longitude;
        log(FN, "geocode_success", { source: "postcodes.io", postcode: pcData.result.postcode, lat, lng });
      }
    }

    // --- DID WE FIND COORDINATES? ---
    if (lat === undefined || lng === undefined) {
      throw new Error(
        `Could not find GPS coordinates for the address/postcode: ${address}`,
      );
    }

    const hemisphere = lat >= 0 ? "Northern Hemisphere" : "Southern Hemisphere";

    // Load user preferences in parallel with the weather fetch
    const [weatherRes, existingPrefs] = await Promise.all([
      fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max&timezone=auto&forecast_days=14`),
      homeId
        ? loadPreferences(supabase, userId ? { userId } : { homeId })
        : Promise.resolve([]),
    ]);

    log(FN, "context_loaded", {
      hemisphere,
      prefsCount: existingPrefs.length,
      prefsSummary: existingPrefs.map((p) => `${p.sentiment}:${p.entity_name}`),
    });

    const prefsBlock = formatPreferencesBlock(existingPrefs, "simple");

    // =================================================================
    // WEATHER PARSE (fetched above in parallel with preferences)
    // =================================================================
    const weatherData = await weatherRes.json();

    const dailyForecasts = weatherData.daily.time.map(
      (date: string, index: number) => ({
        date,
        maxTempC: weatherData.daily.temperature_2m_max[index],
        minTempC: weatherData.daily.temperature_2m_min[index],
        rainProb: weatherData.daily.precipitation_probability_max[index],
      }),
    );

    // =================================================================
    // 🧠 AI PROMPT & GEMINI FETCH
    // =================================================================
    const systemPrompt = `You are an expert horticulturist and garden planner.
    You will be provided with:
    1. A plant name
    2. The target garden area details (including environment, light, soil, etc.)
    3. A 14-day local weather forecast (Celsius)
    4. A list of available propagation methods

    LOCATION CONTEXT: The user is in the ${hemisphere}. All seasonal advice (spring, summer, autumn/fall, winter) MUST be calibrated to this hemisphere.

    USER'S KNOWN PREFERENCES (honour these when giving advice — if they dislike something, never recommend it):
    ${prefsBlock}

    Determine the optimal planting strategy for EVERY viable propagation method. Please evaluate 'Seed' generously if it is biologically possible.

    Return ONLY a JSON object with this exact structure:
    {
      "personalized_assessment": "Write a brief, encouraging paragraph confirming you have considered their specific area details, the upcoming weather forecast, and their personal preferences.",
      "schedules": [
        {
          "method": "Must be one of the provided available methods.",
          "is_viable": true,
          "reasoning": "Why this method works for this specific plant and area.",
          "phases": [
            {
              "phase_name": "Name of the distinct task (e.g., 'Sow Seeds Indoors', 'Germination', 'Transplant Outdoors', 'Direct Sow')",
              "recommended_date": "YYYY-MM-DD (Choose the best specific date from the 14-day forecast for THIS specific phase. If it needs to be done later than 14 days, estimate the best future date based on seasonal norms for the ${hemisphere})",
              "steps": ["Step 1...", "Include highly specific advice based on the area details, like using a frost cover if outdoors, or soil amendments."]
            }
          ]
        }
      ]
    }`;

    const priorScheduleText = priorSchedule
      ? `\nPrior Schedule (previously generated for this plant/area — refine or improve upon it based on the latest forecast): ${JSON.stringify(priorSchedule)}`
      : "";

    const userMessage = `Plant: ${plantName}
Area Details: ${JSON.stringify(areaDetails || "General Garden")}
Available Methods: ${JSON.stringify(availableMethods)}
14-Day Forecast: ${JSON.stringify(dailyForecasts)}${priorScheduleText}`;

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey)
      throw new Error("GEMINI_API_KEY is missing from environment variables.");

    const rawText = await callGeminiCascade(
      apiKey,
      FN,
      toMessages([userMessage]),
      { systemPrompt, responseMimeType: "application/json" },
    );

    const smartSchedule = JSON.parse(rawText);

    if (smartSchedule.schedules) {
      smartSchedule.schedules = smartSchedule.schedules.filter((s: any) =>
        availableMethods.includes(s.method),
      );
    }

    log(FN, "result", {
      plantName,
      address,
      hemisphere,
      homeId,
      userId,
      schedulesCount: smartSchedule.schedules?.length ?? 0,
      methods: smartSchedule.schedules?.map((s: any) => s.method),
    });

    return new Response(JSON.stringify(smartSchedule), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    logError(FN, "error", { error: error.message });
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
