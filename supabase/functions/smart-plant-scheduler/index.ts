import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { GoogleGenerativeAI } from "npm:@google/generative-ai";

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
    const { plantName, areaDetails, address, availableMethods } =
      await req.json();

    if (!address || !plantName || !availableMethods) {
      throw new Error(
        "Missing required fields. Ensure home address/postcode is set.",
      );
    }

    // =================================================================
    // 🌍 GEOCODING LOGIC (Open-Meteo + Postcodes.io Fallback)
    // =================================================================
    let lat, lng;

    console.log(`🌍 Locating coordinates for: "${address}"...`);

    // --- GEOCODER 1: OPEN-METEO (Great for Cities) ---
    const meteoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(address)}&count=1&format=json`,
    );
    const meteoData = await meteoRes.json();

    if (meteoData.results && meteoData.results.length > 0) {
      lat = meteoData.results[0].latitude;
      lng = meteoData.results[0].longitude;
      console.log(`📍 Found via Open-Meteo: ${meteoData.results[0].name}`);
    }
    // --- GEOCODER 2: POSTCODES.IO FALLBACK (Great for UK Postcodes) ---
    else {
      console.log(`⚠️ Open-Meteo missed it. Trying UK Postcode Database...`);
      const cleanPostcode = address.replace(/\s+/g, "");
      const pcRes = await fetch(
        `https://api.postcodes.io/postcodes/${encodeURIComponent(cleanPostcode)}`,
      );

      if (pcRes.status === 200) {
        const pcData = await pcRes.json();
        lat = pcData.result.latitude;
        lng = pcData.result.longitude;
        console.log(`📍 Found via Postcodes.io: ${pcData.result.postcode}`);
      }
    }

    // --- DID WE FIND COORDINATES? ---
    if (lat === undefined || lng === undefined) {
      throw new Error(
        `Could not find GPS coordinates for the address/postcode: ${address}`,
      );
    }

    // =================================================================
    // ⛅ WEATHER FETCH
    // =================================================================
    console.log(`⛅ Fetching weather for Lat: ${lat}, Lng: ${lng}...`);
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max&timezone=auto&forecast_days=14`;
    const weatherRes = await fetch(weatherUrl);
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
    
    Determine the optimal planting strategy for EVERY viable propagation method. Please evaluate 'Seed' generously if it is biologically possible. 
    
    Return ONLY a JSON object with this exact structure:
    {
      "personalized_assessment": "Write a brief, encouraging paragraph confirming you have considered their specific area details and the upcoming weather forecast.",
      "schedules": [
        {
          "method": "Must be one of the provided available methods.",
          "is_viable": true,
          "reasoning": "Why this method works for this specific plant and area.",
          "phases": [
            {
              "phase_name": "Name of the distinct task (e.g., 'Sow Seeds Indoors', 'Germination', 'Transplant Outdoors', 'Direct Sow')",
              "recommended_date": "YYYY-MM-DD (Choose the best specific date from the 14-day forecast for THIS specific phase. If it needs to be done later than 14 days, estimate the best future date based on seasonal norms)",
              "steps": ["Step 1...", "Include highly specific advice based on the area details, like using a frost cover if outdoors, or soil amendments."]
            }
          ]
        }
      ]
    }`;

    const userMessage = `
    Plant: ${plantName}
    Area Details: ${JSON.stringify(areaDetails || "General Garden")}
    Available Methods: ${JSON.stringify(availableMethods)}
    14-Day Forecast: ${JSON.stringify(dailyForecasts)}
    `;

    const fullPrompt = `${systemPrompt}\n\nUSER REQUEST:\n${userMessage}`;

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey)
      throw new Error("GEMINI_API_KEY is missing from environment variables.");

    const genAI = new GoogleGenerativeAI(apiKey);

    const modelsToTry = [
      "gemini-3.1-flash-lite-preview",
      "gemini-2.5-flash-lite",
      "gemini-3-flash-preview",
      "gemini-3.1-pro-preview",
    ];

    let smartSchedule = null;
    let lastError = null;

    for (const modelName of modelsToTry) {
      try {
        console.log(`🤖 Attempting scheduling with model: ${modelName}`);
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: { responseMimeType: "application/json" },
        });

        const result = await model.generateContent(fullPrompt);
        smartSchedule = JSON.parse(result.response.text());

        if (smartSchedule.schedules) {
          smartSchedule.schedules = smartSchedule.schedules.filter((s: any) =>
            availableMethods.includes(s.method),
          );
        }
        console.log(`✅ Success with ${modelName}!`);
        break;
      } catch (err) {
        console.warn(`⚠️ Model ${modelName} failed:`, err.message);
        lastError = err;
      }
    }

    if (!smartSchedule) {
      throw new Error(
        `All Gemini models failed. Last error: ${lastError?.message}`,
      );
    }

    return new Response(JSON.stringify(smartSchedule), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("🔥 Edge Function Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
