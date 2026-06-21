import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { requireAuth } from "../_shared/requireAuth.ts";
import { getCached, setCached } from "../_shared/aiCache.ts";
import { callGeminiCascade } from "../_shared/gemini.ts";
import { log, error as logError } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import { logAiUsage } from "../_shared/aiUsage.ts";
import { enforceRateLimit } from "../_shared/rateLimit.ts";

const FN = "home-location-details";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const TTL_DAYS = 180;

interface SoilData {
  ph: number | null;
  clay_pct: number | null;
  sand_pct: number | null;
  silt_pct: number | null;
  organic_carbon_gkg: number | null;
}

interface LocationDetails {
  soil: SoilData;
  gardening_overview: string;
  climate_summary: string;
  soil_interpretation: string;
  common_pests: Array<{ name: string; description: string; severity: string }>;
  common_diseases: Array<{ name: string; description: string }>;
  beneficial_wildlife: Array<{ name: string; benefit: string }>;
  common_wildlife: Array<{ name: string; notes: string }>;
  seasonal_gardening_calendar: { spring: string; summer: string; autumn: string; winter: string };
  top_tips: string[];
  climate_zone_key: string;
  soil_estimated: boolean;
  generated_at: string;
}

const LOCATION_SCHEMA = {
  type: "OBJECT",
  properties: {
    gardening_overview:  { type: "STRING" },
    climate_summary:     { type: "STRING" },
    soil_interpretation: { type: "STRING" },
    common_pests: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name:        { type: "STRING" },
          description: { type: "STRING" },
          severity:    { type: "STRING" },
        },
        required: ["name", "description", "severity"],
      },
    },
    common_diseases: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { name: { type: "STRING" }, description: { type: "STRING" } },
        required: ["name", "description"],
      },
    },
    beneficial_wildlife: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { name: { type: "STRING" }, benefit: { type: "STRING" } },
        required: ["name", "benefit"],
      },
    },
    common_wildlife: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { name: { type: "STRING" }, notes: { type: "STRING" } },
        required: ["name", "notes"],
      },
    },
    seasonal_gardening_calendar: {
      type: "OBJECT",
      properties: {
        spring: { type: "STRING" },
        summer: { type: "STRING" },
        autumn: { type: "STRING" },
        winter: { type: "STRING" },
      },
      required: ["spring", "summer", "autumn", "winter"],
    },
    top_tips: { type: "ARRAY", items: { type: "STRING" } },
    climate_zone_key: { type: "STRING" },
    soil_ph_estimate:  { type: "NUMBER" },
    soil_clay_pct_estimate: { type: "NUMBER" },
    soil_sand_pct_estimate: { type: "NUMBER" },
    soil_oc_gkg_estimate:   { type: "NUMBER" },
  },
  required: [
    "gardening_overview", "climate_summary", "soil_interpretation",
    "common_pests", "common_diseases", "beneficial_wildlife",
    "common_wildlife", "seasonal_gardening_calendar", "top_tips",
    "climate_zone_key",
  ],
};

function parseSoilGrids(raw: any): SoilData {
  if (!raw?.properties?.layers) {
    return { ph: null, clay_pct: null, sand_pct: null, silt_pct: null, organic_carbon_gkg: null };
  }
  const get = (prop: string, depth: string): number | null => {
    const layer = raw.properties.layers.find((l: any) => l.name === prop);
    const d = layer?.depths.find((d: any) => d.label === depth);
    if (!d?.values) return null;
    // SoilGrids returns null mean for urban/gap areas — fall back through quantiles
    return d.values.mean ?? d.values["Q0.5"] ?? d.values["Q0.95"] ?? d.values["Q0.05"] ?? null;
  };
  const ph0  = get("phh2o", "0-5cm");
  const clay = get("clay",  "0-5cm");
  const sand = get("sand",  "0-5cm");
  const soc  = get("soc",   "0-5cm");
  const phVal   = ph0  != null ? Math.round(ph0  / 10 * 10) / 10 : null; // e.g. 6.5
  const clayPct = clay != null ? Math.round(clay / 10)           : null;  // g/kg → %
  const sandPct = sand != null ? Math.round(sand / 10)           : null;
  const siltPct = (clayPct != null && sandPct != null) ? Math.max(0, 100 - clayPct - sandPct) : null;
  const ocGkg   = soc  != null ? Math.round(soc  / 10 * 10) / 10 : null;  // cg/kg → g/kg
  return { ph: phVal, clay_pct: clayPct, sand_pct: sandPct, silt_pct: siltPct, organic_carbon_gkg: ocGkg };
}

async function fetchSoilGrids(lat: number, lng: number): Promise<SoilData> {
  const empty: SoilData = { ph: null, clay_pct: null, sand_pct: null, silt_pct: null, organic_carbon_gkg: null };
  try {
    const url = `https://rest.isric.org/soilgrids/v2.0/properties/query?lon=${lng}&lat=${lat}&property=phh2o&property=clay&property=sand&property=soc&depth=0-5cm&value=mean&value=Q0.5`;
    const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return empty;
    const raw = await res.json();
    return parseSoilGrids(raw);
  } catch {
    return empty;
  }
}

async function fetchOpenLandMap(lat: number, lng: number): Promise<SoilData> {
  const empty: SoilData = { ph: null, clay_pct: null, sand_pct: null, silt_pct: null, organic_carbon_gkg: null };
  try {
    const colls = [
      "sol_ph.h2o_usda.a268_m_250m_s0..0cm_1950..2017_v0.2",
      "sol_clay.wfraction_usda.3a1a1a_m_250m_s0..0cm_1950..2017_v0.2",
      "sol_sand.wfraction_usda.3a1a1a_m_250m_s0..0cm_1950..2017_v0.2",
      "sol_organic.carbon_usda.6a1c_m_250m_s0..0cm_1950..2017_v0.2",
    ];
    const params = new URLSearchParams({ lat: lat.toString(), lon: lng.toString() });
    colls.forEach(c => params.append("coll", c));
    const res = await fetch(`https://api.openlandmap.org/query/point?${params}`, { signal: AbortSignal.timeout(12_000) });
    if (!res.ok) {
      log(FN, "openlandmap_failed", { status: res.status, url: `https://api.openlandmap.org/query/point?${params}` });
      return empty;
    }
    const data = await res.json();
    log(FN, "openlandmap_raw", { result: data?.result });
    const getVal = (substr: string): number | null => {
      const item = data?.result?.find((r: any) => r.layername?.includes(substr));
      return item?.point_val ?? null;
    };
    const phRaw  = getVal("sol_ph");
    const clay   = getVal("sol_clay");
    const sand   = getVal("sol_sand");
    const soc    = getVal("sol_organic");
    // OpenLandMap: pH stored ×10 (same as SoilGrids), clay/sand in %, SOC in g/kg
    const phVal   = phRaw != null ? Math.round(phRaw / 10 * 10) / 10 : null;
    const clayPct = clay  != null ? Math.round(clay)                  : null;
    const sandPct = sand  != null ? Math.round(sand)                  : null;
    const siltPct = (clayPct != null && sandPct != null) ? Math.max(0, 100 - clayPct - sandPct) : null;
    const ocGkg   = soc   != null ? Math.round(soc * 10) / 10         : null;
    return { ph: phVal, clay_pct: clayPct, sand_pct: sandPct, silt_pct: siltPct, organic_carbon_gkg: ocGkg };
  } catch (e: any) {
    log(FN, "openlandmap_failed", { error: e.message });
    return empty;
  }
}

function buildSystemPrompt(home: any, soil: SoilData): string {
  const hasMeasuredSoil = soil.ph != null;
  const soilLine = hasMeasuredSoil
    ? `pH=${soil.ph}, clay=${soil.clay_pct}%, sand=${soil.sand_pct}%, silt=${soil.silt_pct}%, organic carbon=${soil.organic_carbon_gkg} g/kg`
    : "No measured soil data available — sensor APIs returned no coverage for this coordinate (common in dense urban areas).";
  const soilEstimateRequest = hasMeasuredSoil ? "" : `
Since no measured soil data is available, use your knowledge of local geology and land use to populate soil_ph_estimate, soil_clay_pct_estimate, soil_sand_pct_estimate, and soil_oc_gkg_estimate with scientifically reasonable estimates for this location. Provide realistic numeric values, not nulls.`;
  return `You are an expert horticulturalist and ecologist generating location-specific gardening insights.

Home location: lat=${home.lat}, lng=${home.lng}, country=${home.country ?? "unknown"}, climate_zone=${home.climate_zone ?? "unknown"}, USDA_hardiness_zone=${home.hardiness_zone ?? "unknown"}.
Soil data (SoilGrids, 0–5 cm): ${soilLine}.
${soilEstimateRequest}
Generate detailed, accurate, and practical gardening insights for this specific location. Be specific to the geography — name real local pests, diseases, and wildlife relevant to this exact region. For seasonal_gardening_calendar, use hemisphere-appropriate seasons (Southern Hemisphere: spring=Sep–Nov, summer=Dec–Feb). Keep each top_tip concise (one sentence). List at least 6 common_pests, 5 common_diseases, 6 beneficial_wildlife, and 6 common_wildlife. For climate_zone_key produce a short snake_case Köppen-based label, e.g. oceanic, temperate_continental, mediterranean, tropical_wet, semi_arid, subarctic.`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const db = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
    const authResult = await requireAuth(req, db);
    if (authResult instanceof Response) return authResult;
    const userId = authResult.user.id;

    const { homeId, bust = false } = await req.json();
    if (!homeId) {
      return new Response(JSON.stringify({ error: "homeId required" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Verify user is a member of this home
    const { data: membership } = await db
      .from("home_members")
      .select("role")
      .eq("home_id", homeId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!membership) {
      return new Response(JSON.stringify({ error: "not_a_member" }), {
        status: 403,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Fetch home coordinates and climate data
    const { data: home } = await db
      .from("homes")
      .select("lat, lng, country, climate_zone, hardiness_zone, timezone")
      .eq("id", homeId)
      .single();

    if (!home?.lat || !home?.lng) {
      return new Response(JSON.stringify({ error: "location_not_set" }), {
        status: 200,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Build cache key — rounded to 2dp (~1 km grid)
    const latR      = Math.round(Math.abs(home.lat * 100));
    const lngR      = Math.round(Math.abs(home.lng * 100));
    const latSuffix = home.lat >= 0 ? "n" : "s";
    const lngSuffix = home.lng >= 0 ? "e" : "w";
    const cacheKey  = `loc_details:${latR}${latSuffix}:${lngR}${lngSuffix}`;

    // Return cached data unless busting
    if (!bust) {
      const cached = await getCached<LocationDetails>(db, cacheKey);
      if (cached) {
        log(FN, "cache_hit", { cacheKey });
        return new Response(JSON.stringify({ data: cached, cached: true }), {
          headers: { ...CORS, "Content-Type": "application/json" },
        });
      }
    } else {
      await db.from("ai_response_cache").delete().eq("cache_key", cacheKey);
      log(FN, "cache_busted", { cacheKey });
    }

    // Rate limit only applies to generation (not cache hits)
    const rateLimitErr = await enforceRateLimit(db, userId, FN);
    if (rateLimitErr) return rateLimitErr;

    // --- Fetch soil data: SoilGrids first, OpenLandMap as fallback ---
    log(FN, "fetching_soil", { lat: home.lat, lng: home.lng });
    let soil = await fetchSoilGrids(home.lat, home.lng);
    if (soil.ph === null && soil.clay_pct === null) {
      log(FN, "soilgrids_null_trying_openlandmap", {});
      soil = await fetchOpenLandMap(home.lat, home.lng);
    }
    log(FN, "soil_final", { ph: soil.ph, clay: soil.clay_pct, sand: soil.sand_pct, oc: soil.organic_carbon_gkg });

    // --- Call Gemini ---
    log(FN, "calling_gemini", { homeId });
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY") ?? "";
    const systemPrompt = buildSystemPrompt(home, soil);
    const userMessage = "Generate location insights for this garden.";
    const { text, usage } = await callGeminiCascade(
      geminiApiKey,
      FN,
      [{ role: "user", parts: [{ text: userMessage }] }],
      {
        systemPrompt,
        temperature:       0.4,
        maxOutputTokens:   2500,
        responseMimeType:  "application/json",
        responseSchema:    LOCATION_SCHEMA,
      },
    );

    await logAiUsage(db, { userId, homeId, functionName: FN, usage, contextBlock: systemPrompt, prompt: `${systemPrompt}\n\n${userMessage}`, rawResult: text });

    const aiResult = JSON.parse(text);

    // If no measured soil data, use AI estimates instead
    const hasMeasuredSoil = soil.ph !== null || soil.clay_pct !== null;
    let finalSoil = soil;
    let soilEstimated = false;
    if (!hasMeasuredSoil && aiResult.soil_ph_estimate != null) {
      const c = aiResult.soil_clay_pct_estimate ?? null;
      const s = aiResult.soil_sand_pct_estimate ?? null;
      finalSoil = {
        ph:                  Math.round(aiResult.soil_ph_estimate * 10) / 10,
        clay_pct:            c != null ? Math.round(c) : null,
        sand_pct:            s != null ? Math.round(s) : null,
        silt_pct:            c != null && s != null ? Math.max(0, 100 - Math.round(c) - Math.round(s)) : null,
        organic_carbon_gkg:  aiResult.soil_oc_gkg_estimate != null ? Math.round(aiResult.soil_oc_gkg_estimate * 10) / 10 : null,
      };
      soilEstimated = true;
      log(FN, "soil_ai_estimated", { ph: finalSoil.ph, clay: finalSoil.clay_pct });
    }

    const details: LocationDetails = {
      soil: finalSoil,
      soil_estimated: soilEstimated,
      ...aiResult,
      generated_at: new Date().toISOString(),
    };

    // Backfill climate_zone on homes table if not already set
    if (!home.climate_zone && details.climate_zone_key) {
      await db.from("homes").update({ climate_zone: details.climate_zone_key }).eq("id", homeId);
      log(FN, "climate_zone_saved", { homeId, climate_zone: details.climate_zone_key });
    }

    await setCached(db, cacheKey, FN, details, TTL_DAYS);
    log(FN, "generated", { homeId, cacheKey });

    return new Response(JSON.stringify({ data: details, cached: false }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    logError(FN, "error", { error: err.message });
    await captureException(FN, err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
