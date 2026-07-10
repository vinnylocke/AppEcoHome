import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { log, warn, error as logError } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import { callGeminiCascade, toMessages } from "../_shared/gemini.ts";
import { loadPreferences, formatPreferencesBlock } from "../_shared/preferences.ts";
import { guardAiByHome } from "../_shared/aiGuard.ts";
import { logAiUsage } from "../_shared/aiUsage.ts";
import { enforceRateLimit } from "../_shared/rateLimit.ts";
import { requireAuth } from "../_shared/requireAuth.ts";
import { requireHomeMembership } from "../_shared/requireHomeMembership.ts";

const FN = "smart-plant-scheduler";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Aggregate a year of daily weather into 12 monthly averages.
// Returns entries sorted chronologically — oldest month first.
function aggregateToMonthly(
  times: string[],
  meanTemps: number[],
  precipSums: number[],
): { month: string; avgTempC: number; totalRainMm: number }[] {
  const buckets: Record<string, { tempSum: number; rainSum: number; count: number }> = {};

  for (let i = 0; i < times.length; i++) {
    const month = times[i].substring(0, 7); // "YYYY-MM"
    if (!buckets[month]) buckets[month] = { tempSum: 0, rainSum: 0, count: 0 };
    buckets[month].tempSum += meanTemps[i] ?? 0;
    buckets[month].rainSum += precipSums[i] ?? 0;
    buckets[month].count++;
  }

  return Object.entries(buckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, { tempSum, rainSum, count }]) => ({
      month,
      avgTempC: Math.round((tempSum / count) * 10) / 10,
      totalRainMm: Math.round(rainSum),
    }));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { plantName, areaDetails, address, availableMethods, homeId, priorSchedule, plantMetadata } =
      await req.json();

    const serviceDb = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Require a real caller and authorise them against this home BEFORE the tier
    // gate — guardAiByHome only checks the owner's tier, and previously a null
    // userId simply skipped the rate limit (bug-audit-2026-07-10 #14).
    const auth = await requireAuth(req, serviceDb);
    if (auth instanceof Response) return auth;
    const userId = auth.user.id;
    if (!homeId) {
      return new Response(JSON.stringify({ error: "homeId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const memErr = await requireHomeMembership(serviceDb, homeId, userId);
    if (memErr) return memErr;

    const guardErr = await guardAiByHome(serviceDb, homeId);
    if (guardErr) return guardErr;

    const rateLimitErr = await enforceRateLimit(serviceDb, userId, FN);
    if (rateLimitErr) return rateLimitErr;

    log(FN, "request_received", { plantName, address, homeId, userId, availableMethodsCount: availableMethods?.length ?? 0 });

    if (!address || !plantName || !availableMethods) {
      throw new Error(
        "Missing required fields. Ensure home address/postcode is set.",
      );
    }

    // =================================================================
    // GEOCODING LOGIC (Open-Meteo + Postcodes.io Fallback)
    // =================================================================
    let lat: number | undefined, lng: number | undefined;

    const meteoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(address)}&count=1&format=json`,
      { signal: AbortSignal.timeout(10_000) },
    );
    const meteoData = meteoRes.ok ? await meteoRes.json() : {};

    if (meteoData.results && meteoData.results.length > 0) {
      lat = meteoData.results[0].latitude;
      lng = meteoData.results[0].longitude;
      log(FN, "geocode_success", { source: "open-meteo", name: meteoData.results[0].name, lat, lng });
    } else {
      warn(FN, "geocode_fallback", { address, reason: "open-meteo returned no results" });
      const cleanPostcode = address.replace(/\s+/g, "");
      const pcRes = await fetch(
        `https://api.postcodes.io/postcodes/${encodeURIComponent(cleanPostcode)}`,
        { signal: AbortSignal.timeout(8_000) },
      );
      if (pcRes.ok) {
        const pcData = await pcRes.json();
        lat = pcData.result.latitude;
        lng = pcData.result.longitude;
        log(FN, "geocode_success", { source: "postcodes.io", postcode: pcData.result.postcode, lat, lng });
      }
    }

    if (lat === undefined || lng === undefined) {
      throw new Error(
        `Could not find GPS coordinates for the address/postcode: ${address}`,
      );
    }

    const hemisphere = lat >= 0 ? "Northern Hemisphere" : "Southern Hemisphere";

    // =================================================================
    // WEATHER + PREFERENCES (parallel)
    // Archive API: last 12 months daily → aggregated to monthly averages.
    // Free, no key required. Yesterday is the latest available date.
    // =================================================================
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const oneYearAgo = new Date(today);
    oneYearAgo.setFullYear(today.getFullYear() - 1);

    const fmt = (d: Date) => d.toISOString().substring(0, 10);
    const archiveUrl =
      `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}` +
      `&start_date=${fmt(oneYearAgo)}&end_date=${fmt(yesterday)}` +
      `&daily=temperature_2m_mean,precipitation_sum&timezone=auto`;

    const forecastUrl =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max` +
      `&timezone=auto&forecast_days=14`;

    const [forecastRes, archiveRes, existingPrefs] = await Promise.all([
      fetch(forecastUrl, { signal: AbortSignal.timeout(15_000) }),
      fetch(archiveUrl, { signal: AbortSignal.timeout(20_000) }),
      homeId
        ? loadPreferences(serviceDb, userId ? { userId } : { homeId })
        : Promise.resolve([]),
    ]);

    log(FN, "context_loaded", {
      hemisphere,
      prefsCount: existingPrefs.length,
      prefsSummary: existingPrefs.map((p) => `${p.sentiment}:${p.entity_name}`),
    });

    // 14-day forecast — used for precise date selection when planting is imminent
    if (!forecastRes.ok) throw new Error(`Open-Meteo forecast error: ${forecastRes.status}`);
    const forecastData = await forecastRes.json();
    const dailyForecasts = forecastData.daily.time.map(
      (date: string, i: number) => ({
        date,
        maxTempC: forecastData.daily.temperature_2m_max[i],
        minTempC: forecastData.daily.temperature_2m_min[i],
        rainProb: forecastData.daily.precipitation_probability_max[i],
      }),
    );

    // Monthly climate profile — used for seasonal reasoning
    let monthlyClimate: { month: string; avgTempC: number; totalRainMm: number }[] = [];
    try {
      const archiveData = await archiveRes.json();
      monthlyClimate = aggregateToMonthly(
        archiveData.daily.time,
        archiveData.daily.temperature_2m_mean,
        archiveData.daily.precipitation_sum,
      );
      log(FN, "climate_profile_loaded", { months: monthlyClimate.length });
    } catch {
      warn(FN, "climate_profile_failed", { reason: "archive API unavailable — falling back to forecast only" });
    }

    const prefsBlock = formatPreferencesBlock(existingPrefs, "simple");
    const todayIso = fmt(today);

    // =================================================================
    // AI PROMPT
    // =================================================================
    const systemPrompt = `You are an expert horticulturist and garden planner.

LOCATION CONTEXT: The user is in the ${hemisphere}. All seasonal advice MUST be calibrated to this hemisphere.

USER'S KNOWN PREFERENCES (honour these — if they dislike something, never recommend it):
${prefsBlock}

You will be given:
1. A plant name and target area details
2. A 12-month climate profile (monthly average temperature and rainfall) for the user's location
3. A 14-day detailed weather forecast
4. Available propagation methods
5. Today's date: ${todayIso}

YOUR TASK — follow these steps for EVERY available propagation method:

STEP 1 — DETERMINE THE OPTIMAL PLANTING SEASON
Using the plant's biological requirements and the monthly climate profile, identify the ideal month(s) to begin each propagation method. Consider frost risk, soil temperature, day length, and rainfall patterns. Do NOT default to "now" — reason carefully about what the plant actually needs.

STEP 2 — CHECK IF NOW IS THE RIGHT TIME
Compare today's date (${todayIso}) against the optimal season you identified in Step 1.
- If the optimal window begins within the next 14 days: the user should plant soon.
- If the optimal window is more than 14 days away: the user should wait and plan ahead.

STEP 3a — IF PLANTING IS IMMINENT (optimal window within 14 days)
Pick the specific best date from the 14-day forecast for each phase. Prefer days with warmer temperatures and lower rain probability for outdoor phases. Use the forecast dates precisely.

STEP 3b — IF PLANTING SHOULD WAIT (optimal window is later in the year)
Calculate the estimated start date based on the monthly climate profile — e.g. if September is optimal, return "YYYY-09-15". Do NOT schedule phases in the current 14-day window just to seem helpful. It is better to give the correct future date.

IMPORTANT EXAMPLES:
- Allium (garlic/onion): typically planted in autumn. If it is currently spring or summer, schedule for late September or October.
- Tomato: needs warm soil (>15°C). If frost risk still exists in the forecast, delay or recommend indoor sowing first.
- Hardy annuals: can often be sown now if conditions allow — check the forecast carefully.

Evaluate 'Seed' generously if it is biologically possible. Evaluate 'Bulb' for any plant that grows from bulbs, corms, rhizomes, or tubers (e.g. alliums, tulips, dahlias, irises, gladioli) — this is often the primary method and should be recommended with precise planting depth and spacing advice.

CRITICAL RULE: Generate EXACTLY ONE schedule entry per method. Each entry must cover ONLY that one method — never combine Division and Bulb into the same entry, never combine Seed and Cutting, etc. If both 'Division' and 'Bulb' are available methods, return two completely separate entries with their own distinct phases and reasoning.

Return ONLY a JSON object with this exact structure:
{
  "personalized_assessment": "A brief paragraph explaining what planting season was identified for each method, whether now is the right time, and why — referencing the climate data and forecast.",
  "schedules": [
    {
      "method": "Must be exactly one of the provided available methods — one entry per method.",
      "is_viable": true,
      "reasoning": "Why THIS specific method works for this plant and area, and which season is optimal. Do not mention other methods here.",
      "phases": [
        {
          "phase_name": "Name of the task (e.g. 'Sow Seeds Indoors', 'Transplant Outdoors', 'Plant Bulbs')",
          "recommended_date": "YYYY-MM-DD",
          "steps": ["Specific, actionable step referencing area conditions, soil type, frost risk, etc."]
        }
      ]
    }
  ]
}`;

    const priorScheduleText = priorSchedule
      ? `\nPrior Schedule (previously generated — refine based on the latest data): ${JSON.stringify(priorSchedule)}`
      : "";

    // Verdantly-sourced planting instructions — use these verbatim in step descriptions when present
    let plantingInstructionsText = "";
    if (plantMetadata?.planting_methods) {
      const pm = plantMetadata.planting_methods;
      const lines: string[] = [];
      if (pm.start_indoors) lines.push(`Start Indoors: ${pm.start_indoors}`);
      if (pm.transplant_outdoors) lines.push(`Transplant Outdoors: ${pm.transplant_outdoors}`);
      if (pm.direct_sow) lines.push(`Direct Sow: ${pm.direct_sow}`);
      if (lines.length > 0) {
        plantingInstructionsText = `\nVerified Planting Instructions (use these for step content — they take priority over generic advice):\n${lines.join("\n")}`;
      }
    }
    if (plantMetadata?.care_notes) {
      plantingInstructionsText += `\nAdditional Care Notes: ${plantMetadata.care_notes}`;
    }
    if (plantMetadata?.spacing_inches) {
      plantingInstructionsText += `\nRecommended Spacing: ${plantMetadata.spacing_inches} inches`;
    }
    if (plantMetadata?.frost_tolerance) {
      plantingInstructionsText += `\nFrost Tolerance: ${plantMetadata.frost_tolerance}`;
    }

    const climateBlock = monthlyClimate.length > 0
      ? `12-Month Climate Profile (${fmt(oneYearAgo)} to ${fmt(yesterday)}): ${JSON.stringify(monthlyClimate)}`
      : "12-Month Climate Profile: unavailable — use your knowledge of the hemisphere and plant requirements.";

    // Strip area name from the details object — pass only horticultural properties.
    const safeAreaDetails = areaDetails
      ? Object.fromEntries(Object.entries(areaDetails).filter(([k]) => k !== "name"))
      : "General Garden";

    const userMessage = `Plant: ${plantName}
Area Details: ${JSON.stringify(safeAreaDetails)}
Available Methods: ${JSON.stringify(availableMethods)}
Today's Date: ${todayIso}
${climateBlock}
14-Day Forecast (precise dates for imminent planting): ${JSON.stringify(dailyForecasts)}${plantingInstructionsText}${priorScheduleText}`;

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey)
      throw new Error("GEMINI_API_KEY is missing from environment variables.");

    const { text: rawText, usage } = await callGeminiCascade(
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

    await logAiUsage(serviceDb, { homeId, userId, functionName: FN, action: "plant_scheduler", usage, contextBlock: userMessage, prompt: `${systemPrompt}\n\n${userMessage}`, rawResult: rawText });
    log(FN, "result", {
      plantName,
      address,
      hemisphere,
      homeId,
      userId,
      schedulesCount: smartSchedule.schedules?.length ?? 0,
      methods: smartSchedule.schedules?.map((s: any) => s.method),
      climateMonths: monthlyClimate.length,
    });

    return new Response(JSON.stringify(smartSchedule), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    logError(FN, "error", { error: error.message });
    await captureException(FN, error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
