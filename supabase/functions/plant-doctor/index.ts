import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { log, warn, error as logError } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import { callGeminiCascade, toMessages } from "../_shared/gemini.ts";
import { loadPreferences, formatPreferencesBlock } from "../_shared/preferences.ts";
import { guardAiByHome, guardPerenualByHome } from "../_shared/aiGuard.ts";
import { logAiUsage } from "../_shared/aiUsage.ts";
import { requireAuth } from "../_shared/requireAuth.ts";
import { enforceRateLimit } from "../_shared/rateLimit.ts";
import { getCached, setCached, cacheKey } from "../_shared/aiCache.ts";
import { getFallback } from "../_shared/fallbacks.ts";
import { reverseGeocodeCity } from "../_shared/locationContext.ts";
import { normaliseScientificKey, parseMatchString } from "../_shared/aiPlantCatalogue.ts";
import { buildEnvBlock } from "../_shared/visionEnvContext.ts";
import { validateFrostPayload } from "../_shared/frostValidation.ts";
import {
  GROW_GUIDE_SCHEMA,
  buildGrowGuidePrompt,
  diffGrowGuide,
  type PlantGrowGuide,
} from "../_shared/growGuide.ts";
import { generateSeasonalPicksForHome } from "../_shared/seasonalPicksHandler.ts";

const FN = "plant-doctor";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ── Response schemas ────────────────────────────────────────────────────────

const SEARCH_PLANTS_SCHEMA = {
  type: "OBJECT",
  properties: {
    matches: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["matches"],
};

const CARE_GUIDE_SCHEMA = {
  type: "OBJECT",
  properties: {
    plantData: {
      type: "OBJECT",
      properties: {
        common_name:       { type: "STRING" },
        scientific_name:   { type: "ARRAY", items: { type: "STRING" } },
        description:       { type: "STRING" },
        plant_type:        { type: "STRING" },
        cycle:             { type: "STRING" },
        care_level:        { type: "STRING" },
        growth_rate:       { type: "STRING" },
        maintenance:       { type: "STRING" },
        watering_min_days: { type: "NUMBER" },
        watering_max_days: { type: "NUMBER" },
        sunlight:          { type: "ARRAY", items: { type: "STRING" } },
        flowering_season:  {
          type: "ARRAY",
          description: "Seasons in which the plant flowers. Each element MUST be one of: 'Spring', 'Summer', 'Autumn', 'Winter'. Use seasons appropriate for the user's hemisphere. Return an empty array if the plant does not flower or flowering is year-round.",
          items: { type: "STRING", enum: ["Spring", "Summer", "Autumn", "Winter"] },
        },
        harvest_season:    {
          type: "ARRAY",
          description: "Seasons in which the plant is ready to harvest. Each element MUST be one of: 'Spring', 'Summer', 'Autumn', 'Winter'. Use seasons appropriate for the user's hemisphere. Return an empty array if the plant is not typically harvested.",
          items: { type: "STRING", enum: ["Spring", "Summer", "Autumn", "Winter"] },
        },
        pruning_month:     {
          type: "ARRAY",
          description: "Abbreviated month names when pruning is appropriate. Each element MUST be one of: 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'. Use months appropriate for the user's hemisphere. Return an empty array if the plant doesn't need pruning.",
          items: { type: "STRING", enum: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] },
        },
        propagation:       { type: "ARRAY", items: { type: "STRING" } },
        attracts:          { type: "ARRAY", items: { type: "STRING" } },
        is_toxic_pets:     { type: "BOOLEAN" },
        is_toxic_humans:   { type: "BOOLEAN" },
        indoor:            { type: "BOOLEAN" },
        is_edible:         { type: "BOOLEAN" },
        drought_tolerant:  { type: "BOOLEAN" },
        tropical:          { type: "BOOLEAN" },
        medicinal:         { type: "BOOLEAN" },
        cuisine:           { type: "BOOLEAN" },
      },
      required: [
        "common_name", "scientific_name", "description", "plant_type",
        "cycle", "care_level", "watering_min_days", "watering_max_days", "sunlight",
      ],
    },
  },
  required: ["plantData"],
};

const RECOMMEND_PLANTS_SCHEMA = {
  type: "OBJECT",
  properties: {
    recommendations: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name:            { type: "STRING" },
          scientific_name: { type: "STRING" },
          reason:          { type: "STRING" },
          difficulty:      { type: "STRING" },
        },
        required: ["name", "scientific_name", "reason", "difficulty"],
      },
    },
  },
  required: ["recommendations"],
};

const IDENTIFY_VISION_SCHEMA = {
  type: "OBJECT",
  properties: {
    notes: { type: "STRING" },
    possible_names: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name:            { type: "STRING",  description: "Well-known common name of the plant (e.g. 'Peace Lily')" },
          scientific_name: { type: "STRING",  description: "Latin binomial scientific name (e.g. 'Spathiphyllum wallisii')" },
          confidence:      { type: "INTEGER", description: "0–100 confidence score based on visible features" },
        },
        required: ["name", "scientific_name", "confidence"],
      },
    },
  },
  required: ["notes", "possible_names"],
};

const DIAGNOSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    notes:    { type: "STRING" },
    possible_diseases: {
      type: "ARRAY",
      nullable: true,
      items: {
        type: "OBJECT",
        properties: {
          name:       { type: "STRING",  description: "Common name of the condition (e.g. 'Late Blight')" },
          confidence: { type: "INTEGER", description: "0–100 confidence based on visible symptoms and context" },
        },
        required: ["name", "confidence"],
      },
    },
    possible_names:        { type: "STRING", nullable: true },
    severity:              { type: "STRING", nullable: true, description: "One of: Healthy, Low, Medium, High" },
    environmental_factors: { type: "ARRAY", nullable: true, items: { type: "STRING" } },
    immediate_actions:     { type: "ARRAY", nullable: true, items: { type: "STRING" } },
  },
  required: ["notes"],
};

const DISEASE_INFO_SCHEMA = {
  type: "OBJECT",
  properties: {
    diseaseInfo: {
      type: "OBJECT",
      properties: {
        description: { type: "STRING" },
        solution:    { type: "STRING" },
        source:      { type: "STRING" },
      },
      required: ["description", "solution", "source"],
    },
  },
  required: ["diseaseInfo"],
};

const REMEDIAL_PLAN_SCHEMA = {
  type: "OBJECT",
  properties: {
    remedial_schedules: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          title:           { type: "STRING" },
          description:     { type: "STRING" },
          task_type:       { type: "STRING" },
          is_recurring:    { type: "BOOLEAN" },
          frequency_days:  { type: "NUMBER", nullable: true },
          end_offset_days: { type: "NUMBER", nullable: true },
        },
        required: ["title", "description", "task_type", "is_recurring"],
      },
    },
  },
  required: ["remedial_schedules"],
};

// Combined comprehensive analysis — returns identification, health, pruning,
// propagation, edibility, optional disease/pest, and a list of suggested_tasks
// in the same shape PlantDoctorChat already produces (consumed by
// `TaskActionButtons.tsx`). One Gemini call, full payload.
const ANALYSE_COMPREHENSIVE_SCHEMA = {
  type: "OBJECT",
  properties: {
    identification: {
      type: "OBJECT",
      properties: {
        common_name:     { type: "STRING" },
        scientific_name: { type: "ARRAY", items: { type: "STRING" } },
        confidence:      { type: "INTEGER", description: "0-100" },
      },
      required: ["common_name", "scientific_name", "confidence"],
    },
    health: {
      type: "OBJECT",
      properties: {
        state: {
          type: "STRING",
          enum: ["healthy", "stressed", "diseased", "pest_damaged"],
        },
        notes:                        { type: "STRING" },
        sunlight_appears_appropriate: { type: "BOOLEAN", nullable: true },
        sunlight_notes:               { type: "STRING",  nullable: true },
      },
      required: ["state", "notes"],
    },
    pruning: {
      type: "OBJECT",
      properties: {
        method:       { type: "STRING" },
        where_to_cut: { type: "STRING" },
        how_to_cut:   { type: "STRING" },
        tips:         { type: "ARRAY", items: { type: "STRING" } },
      },
      required: ["method", "where_to_cut", "how_to_cut", "tips"],
    },
    propagation: {
      type: "OBJECT",
      properties: {
        method: { type: "STRING" },
        when:   { type: "STRING", description: "Relative to user's hemisphere — e.g. 'late spring', 'now'" },
        steps:  { type: "ARRAY", items: { type: "STRING" } },
      },
      required: ["method", "when", "steps"],
    },
    edibility: {
      type: "OBJECT",
      nullable: true,
      properties: {
        is_edible: { type: "BOOLEAN" },
        ripeness: {
          type: "STRING",
          nullable: true,
          enum: ["not_yet", "near_ripe", "ripe", "overripe"],
        },
        estimated_days_until_ripe: { type: "INTEGER", nullable: true },
        notes:                     { type: "STRING",  nullable: true },
      },
      required: ["is_edible"],
    },
    disease: {
      type: "OBJECT",
      nullable: true,
      properties: {
        name:               { type: "STRING" },
        cure_methods:       { type: "ARRAY", items: { type: "STRING" } },
        prevention_methods: { type: "ARRAY", items: { type: "STRING" } },
      },
      required: ["name", "cure_methods", "prevention_methods"],
    },
    pest: {
      type: "OBJECT",
      nullable: true,
      properties: {
        name:               { type: "STRING" },
        removal_methods:    { type: "ARRAY", items: { type: "STRING" } },
        prevention_methods: { type: "ARRAY", items: { type: "STRING" } },
      },
      required: ["name", "removal_methods", "prevention_methods"],
    },
    suggested_tasks: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          title:            { type: "STRING" },
          description:      { type: "STRING" },
          task_type:        { type: "STRING", enum: ["Planting", "Watering", "Harvesting", "Maintenance"] },
          due_in_days:      { type: "INTEGER", description: "0 = today, N = N days from now" },
          is_recurring:     { type: "BOOLEAN" },
          frequency_days:   { type: "INTEGER", nullable: true },
          end_offset_days:  { type: "INTEGER", nullable: true },
          depends_on_index: { type: "INTEGER", nullable: true },
        },
        required: ["title", "description", "task_type", "due_in_days", "is_recurring"],
      },
    },
  },
  required: ["identification", "health", "pruning", "propagation", "suggested_tasks"],
};

const IDENTIFY_PEST_SCHEMA = {
  type: "OBJECT",
  properties: {
    notes: { type: "STRING" },
    possible_pests: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name:       { type: "STRING",  description: "Common name of the insect or pest" },
          confidence: { type: "INTEGER", description: "0–100 confidence based on visible features" },
        },
        required: ["name", "confidence"],
      },
    },
    is_pest:       { type: "BOOLEAN" },
    pest_severity: { type: "STRING", nullable: true },
  },
  required: ["notes", "possible_pests", "is_pest"],
};

const PEST_INFO_SCHEMA = {
  type: "OBJECT",
  properties: {
    pestInfo: {
      type: "OBJECT",
      properties: {
        description:     { type: "STRING" },
        affected_plants: { type: "STRING" },
        treatment:       { type: "STRING" },
        prevention:      { type: "STRING" },
        source:          { type: "STRING" },
      },
      required: ["description", "affected_plants", "treatment", "prevention", "source"],
    },
  },
  required: ["pestInfo"],
};

// Mobile Quick Access Wave 3 — frost dates returned by `lookup_frost_dates`.
const LOOKUP_FROST_DATES_SCHEMA = {
  type: "OBJECT",
  properties: {
    last_frost_iso:      { type: "STRING",  description: "ISO date (YYYY-MM-DD) of the average LAST spring frost for this location, in the current year." },
    first_frost_iso:     { type: "STRING",  description: "ISO date (YYYY-MM-DD) of the average FIRST autumn frost for this location, in the current year (or next year if already past)." },
    growing_season_days: { type: "INTEGER", description: "Days between last and first frost. 30-365." },
    notes:               { type: "STRING",  nullable: true, description: "Optional one-line caveat — e.g. 'highly variable in coastal microclimates' or 'no meaningful frost risk'." },
  },
  required: ["last_frost_iso", "first_frost_iso", "growing_season_days"],
};

// Mobile Quick Access Wave 3 — per-plant planting guidance returned by `plant_when_to_plant`.
const PLANT_WHEN_TO_PLANT_SCHEMA = {
  type: "OBJECT",
  properties: {
    plant_name:               { type: "STRING" },
    scientific_name:          { type: "STRING", nullable: true },
    can_plant_outdoors_now:   { type: "BOOLEAN" },
    earliest_outdoor_date:    { type: "STRING", description: "ISO date — earliest safe outdoor planting based on the home's frost dates." },
    latest_outdoor_date:      { type: "STRING", description: "ISO date — latest sensible outdoor planting given growing-season days." },
    indoor_start_recommended: { type: "BOOLEAN" },
    indoor_start_date:        { type: "STRING", nullable: true, description: "ISO date — when to start seeds indoors if recommended." },
    spacing_cm:               { type: "INTEGER", nullable: true },
    depth_cm:                 { type: "NUMBER",  nullable: true },
    sun_requirement:          { type: "STRING",  description: "e.g. 'full sun' / 'partial shade' / 'shade-tolerant'" },
    tips:                     { type: "ARRAY",   items: { type: "STRING" }, description: "2-4 concrete tips tailored to this plant + this home's climate." },
  },
  required: [
    "plant_name",
    "can_plant_outdoors_now",
    "earliest_outdoor_date",
    "latest_outdoor_date",
    "indoor_start_recommended",
    "sun_requirement",
    "tips",
  ],
};

// ── Image helpers ───────────────────────────────────────────────────────────

async function fetchAndUploadImage(url: string, plantName: string, supabase: any) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) return null;
    const blob = await response.blob();
    const fileExt = url.split(".").pop()?.split("?")[0] || "jpg";
    const safeName = plantName.toLowerCase().replace(/[^a-z0-9]/g, "_");
    const fileName = `ai-generated/${safeName}_${Date.now()}.${fileExt}`;
    const { error } = await supabase.storage.from("plant-images").upload(fileName, blob, {
      contentType: blob.type,
      upsert: true,
    });
    if (error) throw error;
    let { data: { publicUrl } } = supabase.storage.from("plant-images").getPublicUrl(fileName);
    if (publicUrl.includes("kong:8000")) {
      publicUrl = publicUrl.replace("http://kong:8000", "http://127.0.0.1:54321");
    }
    return publicUrl;
  } catch (err: any) {
    warn(FN, "image_upload_failed", { error: err.message, url });
    return null;
  }
}

async function getWikiImage(plantName: string) {
  const fetchWiki = async (term: string) => {
    try {
      const res = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(term)}`,
        { signal: AbortSignal.timeout(8_000) },
      );
      if (!res.ok) return null;
      const data = await res.json();
      if (data.type === "disambiguation" || !data.extract) return null;
      return data;
    } catch (e: any) {
      warn(FN, "wiki_image_fetch_failed", { term, error: e?.message });
      return null;
    }
  };
  const cleanName = plantName.split("(")[0].trim();
  let data = await fetchWiki(cleanName);
  if (!data) data = await fetchWiki(`${cleanName} plant`);
  if (!data && cleanName.includes(" ")) {
    const base = cleanName.split(" ").pop();
    if (base) {
      data = await fetchWiki(base);
      if (!data) data = await fetchWiki(`${base} plant`);
    }
  }
  return data ? (data.originalimage?.source || data.thumbnail?.source || null) : null;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function getSeason(hemisphere: "Northern" | "Southern", month: number): string {
  const north = month >= 3 && month <= 5 ? "Spring"
    : month >= 6 && month <= 8 ? "Summer"
    : month >= 9 && month <= 11 ? "Autumn"
    : "Winter";
  if (hemisphere === "Northern") return north;
  const map: Record<string, string> = { Spring: "Autumn", Summer: "Winter", Autumn: "Spring", Winter: "Summer" };
  return map[north];
}

// ── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  let action: string | undefined;
  try {
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    const perenualKey = Deno.env.get("PERENUAL_API_KEY");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");

    const authResult = await requireAuth(req, supabase);
    if (authResult instanceof Response) return authResult;
    const callerUserId = authResult.user.id;

    const body = await req.json();
    const {
      action: _action, homeId, targetPlant, plantSearch, areaData, isOutside,
      currentPlants, imageBase64, mimeType, diagnosisContext,
      diseaseName, pestName, notes, inventoryItemId, areaId,
      deviceLat, deviceLng,
      searchFilters, searchOffset,
      forceRegen,
    } = body;
    action = _action;

    log(FN, "request_received", {
      action, homeId: homeId ?? null, targetPlant: targetPlant ?? null,
      diseaseName: diseaseName ?? null, hasImage: !!imageBase64,
      hasDiagnosisContext: !!diagnosisContext, hasAreaData: !!areaData,
      currentPlantsCount: currentPlants?.length ?? 0,
      hasDeviceLocation: !!(deviceLat && deviceLng),
    });

    // ── Non-LLM actions — exempt from AI gate ──────────────────────────────

    if (action === "fetch_perenual_disease") {
      if (!perenualKey) throw new Error("PERENUAL_API_KEY is missing in edge function environment.");
      if (!diseaseName) throw new Error("Disease name is required.");
      if (homeId) {
        const guardErr = await guardPerenualByHome(supabase, homeId);
        if (guardErr) return guardErr;
      }
      log(FN, "perenual_lookup", { diseaseName });
      const res = await fetch(
        `https://perenual.com/api/pest-disease-list?key=${perenualKey}&q=${encodeURIComponent(diseaseName)}`,
        { signal: AbortSignal.timeout(12_000) },
      );
      if (!res.ok) throw new Error(`Perenual pest-disease lookup failed: ${res.status}`);
      const data = await res.json();
      if (data?.data?.length > 0) {
        const item = data.data[0];
        const solutionStr = Array.isArray(item.solution)
          ? item.solution.map((s: any) => s.description || JSON.stringify(s)).join(" ")
          : item.solution || "No specific solution provided by API.";
        const descStr = Array.isArray(item.description)
          ? item.description.map((d: any) => d.description || JSON.stringify(d)).join(" ")
          : item.description || "No description provided by API.";
        log(FN, "result", { action, found: true, diseaseName });
        return new Response(
          JSON.stringify({ diseaseInfo: { description: descStr, solution: solutionStr, source: "api" } }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      log(FN, "result", { action, found: false, diseaseName });
      return new Response(JSON.stringify({ notFound: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── LLM actions — guard AI tier + rate limit ───────────────────────────

    // search_plants_text is lightweight (text-only, no image) so it gets its own
    // higher-limit bucket rather than sharing with heavy vision/care-guide calls.
    const rateLimitFn = action === "search_plants_text" ? "search-plants-ai" : FN;
    const rateLimitErr = await enforceRateLimit(supabase, callerUserId, rateLimitFn);
    if (rateLimitErr) return rateLimitErr;

    // `lookup_frost_dates` is open to all tiers — the cached row is treated
    // as a fact, not a generation. First-time miss still pays a Gemini call,
    // but that's amortised across the home's members and a 6-month TTL.
    // `seasonal_picks` is also open to all tiers — Sprout/Botanist get the
    // deterministic fallback path, Sage+ get the Gemini path; the action
    // handler checks the AI gate itself before the Gemini call.
    const skipAiGate = action === "lookup_frost_dates" || action === "seasonal_picks";

    if (homeId && !skipAiGate) {
      const guardErr = await guardAiByHome(supabase, homeId);
      if (guardErr) return guardErr;
    }

    // Load user preferences — prefer userId for cross-home consistency.
    const userPrefs = await loadPreferences(supabase, { userId: callerUserId });
    const prefsBlock = userPrefs.length > 0
      ? `\nUSER PREFERENCES (always honour these — never recommend anything the user dislikes):\n${formatPreferencesBlock(userPrefs, "simple")}\n`
      : "";

    log(FN, "prefs_loaded", { homeId: homeId ?? null, count: userPrefs.length });

    // Load location context once for all LLM actions.
    // Device GPS coords take priority over home address — covers travel/holiday use.
    let hemisphere: "Northern" | "Southern" = "Northern";
    let currentMonth = new Date().toLocaleString("en-GB", { month: "long" });
    let currentMonthNum = new Date().getMonth() + 1;
    let locationLine = "";

    const hasDeviceCoords = typeof deviceLat === "number" && typeof deviceLng === "number";

    if (homeId) {
      const { data: home } = await supabase
        .from("homes")
        .select("country, lat, lng, timezone")
        .eq("id", homeId)
        .maybeSingle();
      if (home) {
        const effectiveLat = hasDeviceCoords ? deviceLat : (home.lat ?? 0);
        hemisphere = effectiveLat >= 0 ? "Northern" : "Southern";
        currentMonth = new Date().toLocaleString("en-GB", {
          month: "long",
          timeZone: home.timezone ?? "UTC",
        });
        currentMonthNum = new Date(new Date().toLocaleString("en-US", { timeZone: home.timezone ?? "UTC" })).getMonth() + 1;
        const season = getSeason(hemisphere, currentMonthNum);
        if (hasDeviceCoords) {
          const city = await reverseGeocodeCity(deviceLat, deviceLng);
          const country = home?.country ?? "";
          locationLine = [
            city ? `Location: ${city}${country ? `, ${country}` : ""}` : (country ? `Country: ${country}` : ""),
            `Hemisphere: ${hemisphere}`,
            `Current month: ${currentMonth} (${season})`,
          ].filter(Boolean).join(" | ");
        } else {
          const country = home.country ?? "";
          const city = home.lat != null ? await reverseGeocodeCity(home.lat, home.lng ?? 0) : null;
          locationLine = [
            city ? `Location: ${city}${country ? `, ${country}` : ""}` : (country ? `Country: ${country}` : ""),
            `Hemisphere: ${hemisphere}`,
            `Current month: ${currentMonth} (${season})`,
          ].filter(Boolean).join(" | ");
        }
      }
    } else if (hasDeviceCoords) {
      hemisphere = deviceLat! >= 0 ? "Northern" : "Southern";
      currentMonthNum = new Date().getMonth() + 1;
      const season = getSeason(hemisphere, currentMonthNum);
      const city = await reverseGeocodeCity(deviceLat!, deviceLng!);
      locationLine = [
        city ? `Location: ${city}` : "",
        `Hemisphere: ${hemisphere}`,
        `Current month: ${currentMonth} (${season})`,
      ].filter(Boolean).join(" | ");
    }

    // ── action: search_plants_text ─────────────────────────────────────────

    if (action === "search_plants_text") {
      const hasQuery = plantSearch && plantSearch.trim().length > 0;
      const filters = searchFilters ?? {};
      const offset: number = typeof searchOffset === "number" ? searchOffset : 0;
      const PAGE_SIZE = 10;
      const CACHE_SIZE = 30;

      // Build a deterministic cache key from query + active filters (no offset — offset paginates the same dataset).
      const filtersSig = Object.entries(filters as Record<string, unknown>)
        .filter(([, v]) => v !== undefined && v !== null)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}:${Array.isArray(v) ? [...(v as string[])].sort().join(",") : v}`)
        .join("|") || "none";
      const searchCacheKey = cacheKey("plant_search_text", plantSearch?.trim() ?? "", filtersSig);

      // Cache hit — slice the pre-generated full result set.
      const cachedAll = await getCached<{ matches: string[] }>(supabase, searchCacheKey);
      if (cachedAll?.matches?.length) {
        const page = cachedAll.matches.slice(offset, offset + PAGE_SIZE);
        const hasMore = offset + PAGE_SIZE < cachedAll.matches.length;
        const hits = await lookupCatalogueHits(supabase, page, homeId ?? null);
        log(FN, "result", { action, matchesCount: page.length, hitCount: Object.keys(hits).length, query: plantSearch ?? null, fromCache: true, offset });
        return new Response(JSON.stringify({ matches: page, hasMore, hits }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Cache miss — generate CACHE_SIZE results from Gemini, cache all, return first page.
      const filterLines: string[] = [];
      if (hasQuery)                                            filterLines.push(`- Name matches: "${plantSearch.trim()}"`);
      if (filters.cycle?.length)                              filterLines.push(`- Life cycle must be one of: ${filters.cycle.join(", ")}`);
      if (filters.watering?.length)                          filterLines.push(`- Watering needs must be one of: ${filters.watering.join(", ")}`);
      if (filters.sunlight?.length)                          filterLines.push(`- Sunlight must be one of: ${filters.sunlight.map((s: string) => s.replace(/-/g, " ")).join(", ")}`);
      if (filters.edible === 1)             filterLines.push("- Must be edible / has edible parts");
      else if (filters.edible === 0)        filterLines.push("- Must NOT be edible");
      if (filters.poisonous === 1)          filterLines.push("- Must be toxic / poisonous to pets or humans");
      else if (filters.poisonous === 0)     filterLines.push("- Must NOT be toxic or poisonous");
      if (filters.indoor === 1)             filterLines.push("- Must be suitable for indoor growing");
      else if (filters.indoor === 0)        filterLines.push("- Outdoor plants only");
      if (filters.hardinessMin !== undefined || filters.hardinessMax !== undefined) {
        const min = filters.hardinessMin;
        const max = filters.hardinessMax;
        if (min !== undefined && max !== undefined && min !== max) {
          filterLines.push(`- Hardy across USDA hardiness zones ${min}–${max} (must survive zone ${min} winters)`);
        } else {
          filterLines.push(`- Hardy in USDA hardiness zone ${min ?? max}`);
        }
      }

      const criteriaBlock = filterLines.length > 0
        ? `\nCriteria — the plant MUST satisfy ALL of the following:\n${filterLines.join("\n")}`
        : "";

      const prompt = `Return exactly ${CACHE_SIZE} real plant species that best match the following request.${criteriaBlock}

Return the most relevant match first, then different varieties and cultivars of the same plant, then closely related species in the same genus. Do NOT include companion plants or unrelated species. Avoid duplicates.
Each match must be a real plant species. Format each as "Common Name (Scientific Name)".`;

      const { text, usage } = await callGeminiCascade(
        apiKey, FN, toMessages([prompt]),
        { responseSchema: SEARCH_PLANTS_SCHEMA, maxOutputTokens: 1500, logContext: { action } },
      );
      const parsed = JSON.parse(text);
      const allMatches: string[] = parsed.matches ?? [];

      await logAiUsage(supabase, { homeId: homeId ?? null, userId: callerUserId, functionName: FN, action: "search_plants_text", usage });
      await setCached(supabase, searchCacheKey, FN, { matches: allMatches }, 30);

      const page = allMatches.slice(0, PAGE_SIZE);
      const hasMore = allMatches.length > PAGE_SIZE;
      const hits = await lookupCatalogueHits(supabase, page, homeId ?? null);
      log(FN, "result", { action, total: allMatches.length, matchesCount: page.length, hitCount: Object.keys(hits).length, query: plantSearch ?? null, fromCache: false });
      return new Response(JSON.stringify({ matches: page, hasMore, hits }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── action: generate_care_guide ────────────────────────────────────────

    if (action === "generate_care_guide") {
      if (!targetPlant) throw new Error("No target plant provided.");
      const cleanName = targetPlant.split("(")[0].trim();
      const parsed = parseMatchString(targetPlant);
      const key = normaliseScientificKey(parsed.scientificName ? [parsed.scientificName] : [], parsed.commonName);

      // 1. CATALOGUE READ — if a global AI row exists for this species, return its
      //    care_guide_data instead of regenerating. This is the "Tomato already
      //    in the catalogue" path (zero Gemini cost).
      //
      //    Two-pronged lookup: by scientific_name_key (canonical when the user
      //    typed the scientific name) AND by common_name ILIKE (covers the
      //    common case where the user types "Pot Marigold" but the global was
      //    keyed by its scientific name "Calendula officinalis").
      let existing: { id: number; care_guide_data: unknown; freshness_version: number | null; last_care_generated_at: string | null } | null = null;
      if (key) {
        const r = await supabase
          .from("plants")
          .select("id, care_guide_data, freshness_version, last_care_generated_at")
          .eq("source", "ai")
          .is("home_id", null)
          .eq("scientific_name_key", key)
          .maybeSingle();
        existing = r.data ?? null;
      }
      if (!existing) {
        const r = await supabase
          .from("plants")
          .select("id, care_guide_data, freshness_version, last_care_generated_at")
          .eq("source", "ai")
          .is("home_id", null)
          .ilike("common_name", cleanName)
          .limit(1);
        existing = r.data?.[0] ?? null;
      }
      if (existing?.care_guide_data) {
        log(FN, "result", { action, plant: cleanName, fromCatalogue: true, plantId: existing.id });
        return new Response(JSON.stringify({
          plantData: (existing.care_guide_data as Record<string, unknown>).plantData ?? existing.care_guide_data,
          db_plant_id: existing.id,
          freshness_version: existing.freshness_version,
          last_care_generated_at: existing.last_care_generated_at,
          fromCatalogue: true,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // 2. LEGACY STRING CACHE — transitional read for plants not yet in the
      //    catalogue. When we get a hit here, also self-heal the catalogue:
      //    write the cached plantData as a global AI row (if `key` is usable)
      //    so the next call resolves through the catalogue read path. This
      //    closes the orphan-row UX bug where the client's "Refresh Care
      //    Guide" button received the cached payload with no `db_plant_id`
      //    attached and couldn't link the home row to a global.
      const careKey = cacheKey("care_guide", cleanName, hemisphere);
      const cached = await getCached<{ plantData: any }>(supabase, careKey);
      if (cached) {
        let healedPlantId: number | null = null;
        let healedFreshnessVersion: number | null = null;
        let healedLastGenerated: string | null = null;
        if (key) {
          const { data: existing } = await supabase
            .from("plants")
            .select("id, freshness_version, last_care_generated_at")
            .eq("source", "ai")
            .is("home_id", null)
            .eq("scientific_name_key", key)
            .maybeSingle();
          if (existing) {
            healedPlantId = existing.id;
            healedFreshnessVersion = existing.freshness_version;
            healedLastGenerated = existing.last_care_generated_at;
          } else {
            // plants.id has no DB default — every insert must supply one.
            // Use timestamp + jitter, matching the client's convention.
            const insertPayload = {
              id: Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 1000),
              source: "ai",
              home_id: null,
              common_name: cached.plantData?.common_name ?? parsed.commonName,
              scientific_name: cached.plantData?.scientific_name ?? (parsed.scientificName ? [parsed.scientificName] : []),
              thumbnail_url: cached.plantData?.thumbnail_url ?? null,
              care_guide_data: cached,
              freshness_version: 1,
              last_care_generated_at: new Date().toISOString(),
            };
            const insertResult = await supabase.from("plants").insert(insertPayload).select("id, freshness_version, last_care_generated_at").maybeSingle();
            if (insertResult.data) {
              healedPlantId = insertResult.data.id;
              healedFreshnessVersion = insertResult.data.freshness_version;
              healedLastGenerated = insertResult.data.last_care_generated_at;
              // Initial revision audit row, matching the fresh-generate path.
              const { error: revErr } = await supabase.from("plant_care_revisions").insert({
                plant_id: healedPlantId,
                version: 1,
                source: "initial",
                care_guide_data: cached,
                changed_fields: null,
                diff_summary: null,
                triggered_by: callerUserId ?? null,
              });
              if (revErr) warn(FN, "legacy-heal-revision-insert-failed", { error: revErr.message, plantId: healedPlantId });
            } else if (insertResult.error) {
              // INSERT conflicted on the partial unique index — either a
              // concurrent caller inserted first, OR a global already exists
              // with the scientific-name-derived key (different from `key`
              // which was derived from common_name). Re-read by BOTH possible
              // keys + a common_name fallback to find the existing row.
              const insertKey = normaliseScientificKey(
                (insertPayload.scientific_name as string[] | null) ?? [],
                insertPayload.common_name as string,
              );
              const candidateKeys = [key, insertKey].filter((k, i, arr) => k && arr.indexOf(k) === i) as string[];
              let existing2: { id: number; freshness_version: number | null; last_care_generated_at: string | null } | null = null;
              if (candidateKeys.length > 0) {
                const r = await supabase
                  .from("plants")
                  .select("id, freshness_version, last_care_generated_at")
                  .eq("source", "ai").is("home_id", null)
                  .in("scientific_name_key", candidateKeys)
                  .limit(1);
                existing2 = r.data?.[0] ?? null;
              }
              if (!existing2) {
                const r = await supabase
                  .from("plants")
                  .select("id, freshness_version, last_care_generated_at")
                  .eq("source", "ai").is("home_id", null)
                  .ilike("common_name", insertPayload.common_name as string)
                  .limit(1);
                existing2 = r.data?.[0] ?? null;
              }
              if (existing2) {
                healedPlantId = existing2.id;
                healedFreshnessVersion = existing2.freshness_version;
                healedLastGenerated = existing2.last_care_generated_at;
              } else {
                warn(FN, "legacy-heal-insert-failed", { error: insertResult.error.message, key, insertKey });
              }
            }
          }
        }
        log(FN, "result", { action, plant: cleanName, fromCache: true, healedPlantId });
        return new Response(JSON.stringify({
          ...cached,
          db_plant_id: healedPlantId,
          freshness_version: healedFreshnessVersion,
          last_care_generated_at: healedLastGenerated,
          fromCatalogue: healedPlantId != null,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // 3. GEMINI GENERATE
      const prompt = `Generate a comprehensive botanical care guide for "${cleanName}".
${locationLine ? `Location context: ${locationLine}. Ensure seasonal advice (pruning months, flowering season, harvest season) reflects this hemisphere and location.` : ""}

Return all fields accurately. STRICT formatting rules:
- flowering_season + harvest_season: only one or more of "Spring", "Summer", "Autumn", "Winter". Never months. Never year-round descriptions; if year-round, return all four seasons.
- pruning_month: only abbreviated month names from this exact set: "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec". Never full month names. Never seasons.
- All three arrays must be tuned to the ${hemisphere} Hemisphere (e.g. summer harvest in northern hemisphere is Jun-Aug, in southern hemisphere is Dec-Feb).`;

      const { text: rawText, usage } = await callGeminiCascade(
        apiKey, FN, toMessages([prompt]),
        { responseSchema: CARE_GUIDE_SCHEMA, temperature: 0.2, logContext: { action } },
      );
      let parsedData = JSON.parse(rawText);
      if (!parsedData.plantData) parsedData = { plantData: parsedData };

      const wikiImageUrl = await getWikiImage(cleanName);
      if (wikiImageUrl) {
        const permanentUrl = await fetchAndUploadImage(wikiImageUrl, cleanName, supabase);
        if (permanentUrl) parsedData.plantData.thumbnail_url = permanentUrl;
      }

      // 4. CATALOGUE WRITE — insert the freshly-generated care guide as a global
      //    AI row (home_id = NULL). Race-safe: if a concurrent caller inserted
      //    the same species first, the partial unique index throws; we catch
      //    and re-read the now-existing row.
      let dbPlantId: number | null = null;
      let dbFreshnessVersion: number | null = null;
      let dbLastGenerated: string | null = null;
      if (key) {
        // plants.id has no DB default — every insert must supply one.
        // Use timestamp + jitter, matching the client's convention.
        const insertPayload = {
          id: Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 1000),
          source: "ai",
          home_id: null,
          common_name: parsedData.plantData?.common_name ?? parsed.commonName,
          scientific_name: parsedData.plantData?.scientific_name ?? (parsed.scientificName ? [parsed.scientificName] : []),
          thumbnail_url: parsedData.plantData?.thumbnail_url ?? null,
          care_guide_data: parsedData,
          freshness_version: 1,
          last_care_generated_at: new Date().toISOString(),
          // last_freshness_check_at stays NULL — eligible for the next stale-check cron.
        };
        const insertResult = await supabase.from("plants").insert(insertPayload).select("id, freshness_version, last_care_generated_at").maybeSingle();
        if (insertResult.error) {
          // INSERT conflicted on the unique index — either a concurrent caller
          // or a global already exists keyed by the scientific name (which may
          // differ from `key`, the common-name-derived lookup key). Re-read by
          // BOTH possible keys + a common_name fallback.
          const insertKey = normaliseScientificKey(
            insertPayload.scientific_name,
            insertPayload.common_name,
          );
          const candidateKeys = [key, insertKey].filter((k, i, arr) => k && arr.indexOf(k) === i) as string[];
          let existing2: { id: number; freshness_version: number | null; last_care_generated_at: string | null } | null = null;
          if (candidateKeys.length > 0) {
            const r = await supabase
              .from("plants")
              .select("id, freshness_version, last_care_generated_at")
              .eq("source", "ai").is("home_id", null)
              .in("scientific_name_key", candidateKeys)
              .limit(1);
            existing2 = r.data?.[0] ?? null;
          }
          if (!existing2) {
            const r = await supabase
              .from("plants")
              .select("id, freshness_version, last_care_generated_at")
              .eq("source", "ai").is("home_id", null)
              .ilike("common_name", insertPayload.common_name)
              .limit(1);
            existing2 = r.data?.[0] ?? null;
          }
          if (existing2) {
            dbPlantId = existing2.id;
            dbFreshnessVersion = existing2.freshness_version;
            dbLastGenerated = existing2.last_care_generated_at;
          } else {
            // Unexpected — log but don't fail the request. The client still gets
            // the care guide data; just can't link to a global plant_id this time.
            warn(FN, "insert-race-recovery-failed", { error: insertResult.error.message, key, insertKey });
          }
        } else if (insertResult.data) {
          dbPlantId = insertResult.data.id;
          dbFreshnessVersion = insertResult.data.freshness_version;
          dbLastGenerated = insertResult.data.last_care_generated_at;

          // Initial revision audit row. Best-effort — failure here doesn't
          // affect the user response (the data is already in plants).
          const { error: revErr } = await supabase.from("plant_care_revisions").insert({
            plant_id: dbPlantId,
            version: 1,
            source: "initial",
            care_guide_data: parsedData,
            changed_fields: null,
            diff_summary: null,
            triggered_by: callerUserId ?? null,
          });
          if (revErr) warn(FN, "initial-revision-insert-failed", { error: revErr.message, plantId: dbPlantId });
        }
      }

      // Keep the string cache write for backward compat during transition.
      // Wave 4+ will drop this once the catalogue is the canonical store.
      await setCached(supabase, careKey, FN, parsedData, 30);
      await logAiUsage(supabase, { homeId: homeId ?? null, userId: callerUserId, functionName: FN, action: "generate_care_guide", usage });
      log(FN, "result", {
        action, plant: cleanName, fromCache: false,
        plantType: parsedData.plantData?.plant_type,
        cycle: parsedData.plantData?.cycle,
        hasWikiImage: !!parsedData.plantData?.thumbnail_url,
        dbPlantId,
      });
      return new Response(JSON.stringify({
        ...parsedData,
        db_plant_id: dbPlantId,
        freshness_version: dbFreshnessVersion,
        last_care_generated_at: dbLastGenerated,
        fromCatalogue: false,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── action: recommend_plants ───────────────────────────────────────────

    if (action === "recommend_plants") {
      let luxRecommendCtx = areaData?.light_intensity_lux
        ? `Peak Light (Lux): ${areaData.light_intensity_lux}`
        : "Peak Light (Lux): Unknown";
      if (areaData?.id) {
        const { data: luxReadings } = await supabase
          .from("area_lux_readings")
          .select("lux_value, recorded_at, source")
          .eq("area_id", areaData.id)
          .order("recorded_at", { ascending: false })
          .limit(10);
        if (luxReadings?.length) {
          luxRecommendCtx = `Light history (last ${luxReadings.length} readings):\n` +
            luxReadings.map((r: any) =>
              `  ${r.lux_value.toLocaleString()} lux on ${new Date(r.recorded_at).toLocaleString()} (${r.source})`
            ).join("\n");
        }
      }

      const prompt = `You are an expert master gardener. Recommend 5 plants for a specific growing area.
${locationLine ? `\nGardener location: ${locationLine}. Only recommend plants suitable for their climate and current season.\n` : ""}
${prefsBlock}
ENVIRONMENTAL METRICS:
- Location: ${isOutside ? "Outside" : "Inside"}
- Area Name: ${areaData?.name || "Unnamed Area"}
- Growing Medium: ${areaData?.growing_medium || "Unknown"}
- Medium Texture: ${areaData?.medium_texture || "Unknown"}
- pH Level: ${areaData?.medium_ph || "Unknown"}
- ${luxRecommendCtx}
- Water Movement: ${areaData?.water_movement || "Unknown"}
- Nutrient Source: ${areaData?.nutrient_source || "Unknown"}

CURRENTLY PLANTED HERE: ${currentPlants?.length > 0 ? currentPlants.join(", ") : "Nothing yet"}

Based strictly on these metrics and the gardener's preferences, recommend 5 plants that would thrive here.
NEVER recommend anything the user dislikes. If there are existing plants, prioritise companions.
Use specific common names (e.g. "French Marigold" not "Marigold").`;

      const { text: rawText, usage } = await callGeminiCascade(
        apiKey, FN, toMessages([prompt]),
        { responseSchema: RECOMMEND_PLANTS_SCHEMA, logContext: { action } },
      );
      const parsedData = JSON.parse(rawText);
      await logAiUsage(supabase, { homeId: homeId ?? null, userId: callerUserId, functionName: FN, action: "recommend_plants", usage });
      log(FN, "result", {
        action, homeId: homeId ?? null, area: areaData?.name,
        environment: isOutside ? "outside" : "inside",
        currentPlantsCount: currentPlants?.length ?? 0,
        userPrefsCount: userPrefs.length,
        recommendationsCount: parsedData.recommendations?.length ?? 0,
        recommendations: (parsedData.recommendations ?? []).map((r: any) => r.name),
      });
      return new Response(JSON.stringify(parsedData), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── action: identify_vision ────────────────────────────────────────────

    if (action === "identify_vision") {
      if (!imageBase64) throw new Error("No image data provided.");
      const cleanBase64 = imageBase64.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");

      const promptText = `Identify the plant in this image.
${plantSearch ? `The user thinks it might be a "${plantSearch}". Confirm if this is correct.` : ""}
${locationLine ? `The gardener is located: ${locationLine}. Prioritise plants native to or commonly grown in this region.` : ""}

Return the top 3 most likely identifications in possible_names. For each candidate provide:
- name: the plant's well-known common name (e.g. "Peace Lily", "Swiss Cheese Plant") — what most gardeners call it
- scientific_name: the Latin binomial (e.g. "Spathiphyllum wallisii", "Monstera deliciosa")
- confidence: 0–100 score based on visible leaf shape, colour, texture, and growth habit; 90+ = highly certain, 50–70 = plausible with ambiguity, below 40 = speculative

Also return a brief observation in notes.`;

      const { text: rawText, usage } = await callGeminiCascade(
        apiKey, FN,
        toMessages([promptText, { inlineData: { data: cleanBase64, mimeType: mimeType || "image/jpeg" } }]),
        { responseSchema: IDENTIFY_VISION_SCHEMA, logContext: { action } },
      );
      const parsed = JSON.parse(rawText);
      await logAiUsage(supabase, { homeId: homeId ?? null, userId: callerUserId, functionName: FN, action: "identify_vision", usage });
      log(FN, "result", { action, possibleNames: (parsed.possible_names ?? []).map((n: any) => `${n.name} (${n.confidence}%)`) });
      return new Response(rawText, {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── action: diagnose ───────────────────────────────────────────────────

    if (action === "diagnose") {
      if (!imageBase64) throw new Error("No image data provided.");
      const cleanBase64 = imageBase64.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");

      const envBlock = await buildEnvBlock(supabase, { inventoryItemId, areaId, homeId });

      const plantContext = targetPlant
        ? `This plant is a "${targetPlant}". Use this to improve your diagnosis accuracy.`
        : "The plant species is unknown — identify any visual clues from the image.";

      const promptText = `${plantContext}
${locationLine ? `Gardener location: ${locationLine}. Factor in regional climate when assessing likely causes (e.g. high humidity → fungal, dry climate → spider mites).` : ""}${envBlock}

Examine the image carefully for visible signs of pests, disease, nutrient deficiencies, or environmental stress (under/over-watering, sunburn, root rot, etc.).
Use the environmental context above (growing medium, pH, drainage, recent care, weather, companion plants) to refine your diagnosis — they are key clues.
Provide a precise, personalised diagnosis and actionable advice.

For possible_diseases: return an array of up to 3 objects, each with a 'name' (specific common name, e.g. "Late Blight" — no scientific name in brackets) and a 'confidence' score (0–100) reflecting how well the visible symptoms match. 90+ = textbook presentation; 60–80 = likely match; below 50 = speculative.
If the plant appears healthy or the issue is purely environmental (e.g. underwatering), return an empty array for possible_diseases.
Set severity: "Healthy" if no issues, "Low" for minor cosmetic damage, "Medium" for moderate damage requiring action, "High" for serious threat to plant survival.
Set environmental_factors: list any environmental conditions from the context above that are likely contributing to the issue.
Set immediate_actions: top 3 most urgent steps the gardener should take today.
Set possible_names to null always.`;

      const { text: rawText, usage } = await callGeminiCascade(
        apiKey, FN,
        toMessages([promptText, { inlineData: { data: cleanBase64, mimeType: mimeType || "image/jpeg" } }]),
        { responseSchema: DIAGNOSE_SCHEMA, logContext: { action } },
      );
      const parsed = JSON.parse(rawText);
      await logAiUsage(supabase, { homeId: homeId ?? null, userId: callerUserId, functionName: FN, action: "diagnose", usage });
      log(FN, "result", {
        action,
        severity: parsed.severity ?? null,
        possibleDiseases: parsed.possible_diseases ?? null,
        healthy: !parsed.possible_diseases?.length,
        hasEnvContext: !!envBlock,
      });
      return new Response(rawText, {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── action: analyse_comprehensive ──────────────────────────────────────

    if (action === "analyse_comprehensive") {
      if (!imageBase64) throw new Error("No image data provided.");
      const cleanBase64 = imageBase64.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");

      const envBlock = await buildEnvBlock(supabase, { inventoryItemId, areaId, homeId });

      const plantContext = targetPlant
        ? `This plant is a "${targetPlant}". Use this to ground your identification.`
        : "The plant species is unknown — identify it from the image.";

      const promptText = `${plantContext}
${locationLine ? `Gardener location: ${locationLine}. Use regional climate to time pruning, propagation, and harvest windows.` : ""}${envBlock}
${prefsBlock}

You are doing a COMPREHENSIVE analysis of the plant in this photo. Fill in EVERY section of the response schema based on what you can see + the context above.

IDENTIFICATION: Best guess at common + scientific name; confidence 0-100 reflecting how clearly the plant is identifiable from the image.

HEALTH: Overall state (healthy / stressed / diseased / pest_damaged). Notes explain what you see. Sunlight check: based on the leaf colour, posture, and the area's sunlight context above, is the light level appropriate for this plant? Set sunlight_appears_appropriate to null if unclear from the photo alone.

PRUNING: How would an experienced gardener prune this specific plant? Where on the plant to make cuts, how to make the cut (angle, tool, sealing), and 2-4 concrete tips. Tailor to the plant's growth habit (e.g. coppice vs tip-pinch vs deadhead).

PROPAGATION: Best propagation method for this plant (softwood cuttings / division / seed / layering / etc), when to do it relative to the user's hemisphere — current hemisphere is '${hemisphere}', current month is ${currentMonth} — and 3-5 ordered steps.

EDIBILITY: Is any part of this plant edible? If so, what does the ripeness look like in the photo (or null if not visible / not applicable)? If 'not_yet' or 'near_ripe', estimate days_until_ripe. Set the whole edibility object to null only if the plant has no edible parts at all.

DISEASE: ONLY fill if you see clear disease symptoms (leaf spots, mildew, rot, wilt with discoloration, etc). Include 2-4 cure methods and 2-4 prevention methods. Set to null otherwise — do not invent diseases.

PEST: ONLY fill if you see actual pests (insects, mites, slugs) or unmistakable pest damage (holes, frass, webbing). Include 2-4 removal methods and 2-4 prevention methods. Set to null otherwise — do not invent pests.

SUGGESTED_TASKS: 2-6 actionable tasks the user should add to their calendar based on EVERYTHING above. CRITICAL RULES:
1. task_type MUST be exactly one of: 'Planting' | 'Watering' | 'Harvesting' | 'Maintenance'. Pruning, propagation prep, fertilising, and pest/disease treatments all map to 'Maintenance'.
2. due_in_days: 0 = today, N = N days from now. For pruning, pick a date inside the plant's correct pruning month for '${hemisphere}' (today's month is ${currentMonth}). For propagation, pick a date inside the recommended window.
3. is_recurring=true ONLY for active ongoing treatments (e.g. spray neem weekly for 21 days, foliar feed weekly for 14 days). NEVER for normal watering routines — if watering needs adjustment, create ONE one-off Maintenance task explaining the new cadence.
4. For recurring tasks: end_offset_days MUST be <= 21. frequency_days set; null for one-offs.
5. depends_on_index: null unless one task naturally chains from another (e.g. "take cuttings" then "transplant cuttings in 6 weeks" → second task's depends_on_index = the first task's index in this array).
6. If the plant looks ripe or near-ripe, include a 'Harvesting' task with appropriate due_in_days.
7. If a disease or pest is present, prioritise treatment tasks first in the array.
8. If the plant is healthy and no immediate care is required, you can still suggest forward-looking tasks (e.g. a future pruning reminder, a propagation prompt at the right time).`;

      const { text: rawText, usage } = await callGeminiCascade(
        apiKey, FN,
        toMessages([promptText, { inlineData: { data: cleanBase64, mimeType: mimeType || "image/jpeg" } }]),
        { responseSchema: ANALYSE_COMPREHENSIVE_SCHEMA, logContext: { action } },
      );
      const parsed = JSON.parse(rawText);
      await logAiUsage(supabase, {
        homeId: homeId ?? null,
        userId: callerUserId,
        functionName: FN,
        action: "analyse_comprehensive",
        usage,
      });
      log(FN, "result", {
        action,
        identifiedAs: parsed.identification?.common_name ?? null,
        confidence: parsed.identification?.confidence ?? null,
        healthState: parsed.health?.state ?? null,
        hasDisease: !!parsed.disease,
        hasPest: !!parsed.pest,
        isEdible: parsed.edibility?.is_edible ?? null,
        suggestedTasksCount: (parsed.suggested_tasks ?? []).length,
        hasEnvContext: !!envBlock,
      });
      return new Response(rawText, {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── action: generate_grow_guide ────────────────────────────────────────
    //
    // Generates the comprehensive 9-section grow guide for one plant.
    // Cached in plant_grow_guides (1:1 with plants.id). On cache hit and
    // !forceRegen, returns the existing row without calling Gemini. The
    // 90-day refresh cron is the other writer.

    if (action === "generate_grow_guide") {
      const plantId = (body as { plantId?: number }).plantId;
      const forceRegen = !!(body as { forceRegen?: boolean }).forceRegen;
      if (typeof plantId !== "number") {
        throw new Error("plantId (number) is required for generate_grow_guide.");
      }

      // Cache check — return existing without spending Gemini.
      const { data: existing } = await supabase
        .from("plant_grow_guides")
        .select("*")
        .eq("plant_id", plantId)
        .maybeSingle();

      if (existing && !forceRegen) {
        log(FN, "result", { action, plantId, fromCache: true });
        return new Response(
          JSON.stringify({
            guide_data: existing.guide_data,
            schema_version: existing.schema_version,
            freshness_version: existing.freshness_version,
            last_generated_at: existing.last_generated_at,
            updated_fields: existing.updated_fields ?? [],
            from_cache: true,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Rate-limit forced regenerations to once per 90 days, matching the
      // background cron's cadence. Stops button-mashing from burning
      // Gemini quota on a guide the AI just produced. The cron is the
      // automatic 90-day refresh; this rate limit only blocks MANUAL
      // refreshes — the no-existing first-time generate falls through.
      const GROW_GUIDE_MANUAL_REFRESH_DAYS = 90;
      if (existing && forceRegen) {
        const lastCheckIso = (existing.last_freshness_check_at as string | null)
          ?? (existing.last_generated_at as string | null)
          ?? null;
        if (lastCheckIso) {
          const ageMs = Date.now() - new Date(lastCheckIso).getTime();
          const ageDays = ageMs / 86_400_000;
          if (ageDays < GROW_GUIDE_MANUAL_REFRESH_DAYS) {
            const nextAvailableAt = new Date(
              new Date(lastCheckIso).getTime() +
                GROW_GUIDE_MANUAL_REFRESH_DAYS * 86_400_000,
            ).toISOString();
            const daysRemaining = Math.max(
              0,
              Math.ceil(GROW_GUIDE_MANUAL_REFRESH_DAYS - ageDays),
            );
            log(FN, "result", {
              action,
              plantId,
              refused: true,
              daysRemaining,
            });
            return new Response(
              JSON.stringify({
                guide_data: existing.guide_data,
                schema_version: existing.schema_version,
                freshness_version: existing.freshness_version,
                last_generated_at: existing.last_generated_at,
                updated_fields: existing.updated_fields ?? [],
                from_cache: true,
                refused: true,
                next_available_at: nextAvailableAt,
                days_remaining: daysRemaining,
              }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
          }
        }
      }

      // Load the plant species record to thread name + source + manual notes
      // into the prompt.
      const { data: plantRow, error: plantErr } = await supabase
        .from("plants")
        .select("id, common_name, scientific_name, source, description, maintenance_notes")
        .eq("id", plantId)
        .maybeSingle();
      if (plantErr) throw plantErr;
      if (!plantRow) throw new Error(`Plant ${plantId} not found.`);

      // Extract a scientific name string from the jsonb array, if any.
      let sciName: string | null = null;
      if (Array.isArray(plantRow.scientific_name) && plantRow.scientific_name.length > 0) {
        sciName = String(plantRow.scientific_name[0]).trim() || null;
      } else if (typeof plantRow.scientific_name === "string") {
        sciName = plantRow.scientific_name.trim() || null;
      }

      // Pull manual notes from the dedicated columns on the plants table.
      // Manual plants get description + maintenance_notes merged into the prompt
      // so Gemini can use whatever the user wrote about the plant.
      let manualNotes: string | null = null;
      if (plantRow.source === "manual") {
        const parts: string[] = [];
        if (typeof plantRow.description === "string" && plantRow.description.trim()) {
          parts.push(plantRow.description.trim());
        }
        if (typeof plantRow.maintenance_notes === "string" && plantRow.maintenance_notes.trim()) {
          parts.push(plantRow.maintenance_notes.trim());
        }
        manualNotes = parts.length > 0 ? parts.join("\n\n") : null;
      }

      const promptText = buildGrowGuidePrompt({
        commonName: plantRow.common_name ?? "Unknown plant",
        scientificName: sciName,
        source: plantRow.source as "manual" | "api" | "ai" | "verdantly",
        manualNotes,
        hemisphere,
        currentDate: new Date().toISOString().split("T")[0],
        // Pass the existing guide into the prompt so Gemini re-emits
        // unchanged sections verbatim instead of paraphrasing — kills
        // cosmetic diff churn that previously flagged every section
        // on every refresh.
        existingGuide: (existing?.guide_data as PlantGrowGuide | null) ?? null,
      });

      const { text: rawText, usage } = await callGeminiCascade(
        apiKey, FN, toMessages([promptText]),
        {
          responseSchema: GROW_GUIDE_SCHEMA,
          // 9 structured sections with key_facts + steps + tips easily exceed
          // the default 2048 cap; truncation breaks JSON.parse downstream.
          maxOutputTokens: 8192,
          logContext: { action, plantId },
        },
      );
      if (!rawText || !rawText.trim()) {
        throw new Error("Gemini returned empty text for the grow guide.");
      }
      const parsed = JSON.parse(rawText) as PlantGrowGuide;
      await logAiUsage(supabase, {
        homeId: homeId ?? null,
        userId: callerUserId,
        functionName: FN,
        action: "generate_grow_guide",
        usage,
      });

      // Diff against the existing row (if any) to compute changed_fields.
      const previousGuide = (existing?.guide_data ?? null) as PlantGrowGuide | null;
      const changedCategories = diffGrowGuide(previousGuide, parsed);

      // Bump freshness_version only when content actually changed.
      const newFreshnessVersion = existing
        ? changedCategories.length > 0
          ? (existing.freshness_version ?? 1) + 1
          : existing.freshness_version ?? 1
        : 1;

      const upsertRow = {
        plant_id: plantId,
        guide_data: parsed,
        schema_version: parsed.schema_version ?? 1,
        freshness_version: newFreshnessVersion,
        last_generated_at: new Date().toISOString(),
        last_freshness_check_at: new Date().toISOString(),
        updated_fields: changedCategories,
      };

      const { error: upsertErr } = await supabase
        .from("plant_grow_guides")
        .upsert(upsertRow, { onConflict: "plant_id" });
      if (upsertErr) {
        logError(FN, "grow_guide_upsert_failed", { plantId, error: upsertErr.message });
        throw upsertErr;
      }

      log(FN, "result", {
        action,
        plantId,
        fromCache: false,
        changedCategories,
        newFreshnessVersion,
      });
      return new Response(
        JSON.stringify({
          guide_data: parsed,
          schema_version: parsed.schema_version ?? 1,
          freshness_version: newFreshnessVersion,
          last_generated_at: upsertRow.last_generated_at,
          updated_fields: changedCategories,
          from_cache: false,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── action: lookup_frost_dates ─────────────────────────────────────────
    //
    // Returns the cached home_climate row, refreshing if missing or older
    // than 180 days. Open to all tiers; rate-limited like every other action.
    // Validates Gemini output server-side before writing.

    if (action === "lookup_frost_dates") {
      if (!homeId) throw new Error("homeId is required for lookup_frost_dates.");

      const STALE_DAYS = 180;
      const staleThresholdIso = new Date(Date.now() - STALE_DAYS * 864e5).toISOString();

      const { data: existing } = await supabase
        .from("home_climate")
        .select("*")
        .eq("home_id", homeId)
        .maybeSingle();

      const isFresh =
        existing?.last_frost_iso &&
        existing?.first_frost_iso &&
        existing?.last_frost_lookup_at &&
        existing.last_frost_lookup_at >= staleThresholdIso;

      if (isFresh) {
        log(FN, "result", { action, fromCache: true });
        return new Response(
          JSON.stringify({
            last_frost_iso:      existing.last_frost_iso,
            first_frost_iso:     existing.first_frost_iso,
            growing_season_days: existing.growing_season_days,
            notes:               existing.notes,
            rain_skip_mm:        Number(existing.rain_skip_mm ?? 5),
            rain_water_mm:       Number(existing.rain_water_mm ?? 1),
            from_cache:          true,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Cache miss or stale — call Gemini and validate.
      const promptText = `You are a horticultural reference. Return the AVERAGE last spring frost date and AVERAGE first autumn frost date for the location below, plus the growing-season length in days.
${locationLine ? `Location: ${locationLine}.` : ""}
Use ISO 8601 dates (YYYY-MM-DD) for the current year (${new Date().getFullYear()}). For the first autumn frost, use the current year if it hasn't happened yet, otherwise the next year. For frost-free climates, choose the historical edges (e.g. "no meaningful frost — using climatological boundaries") and set growing_season_days near 365.
Hemisphere: ${hemisphere}. Constraints: last frost must precede first frost. For Northern hemisphere, last frost is in Jan-May, first frost is in Aug-Dec. For Southern hemisphere, last frost is in Jul-Nov, first frost is in Feb-Jun.
Notes: optional one-line caveat about regional variability or microclimate considerations.`;

      const { text: rawText, usage } = await callGeminiCascade(
        apiKey, FN, toMessages([promptText]),
        { responseSchema: LOOKUP_FROST_DATES_SCHEMA, logContext: { action } },
      );
      const parsed = JSON.parse(rawText);
      await logAiUsage(supabase, {
        homeId, userId: callerUserId, functionName: FN,
        action: "lookup_frost_dates", usage,
      });

      const validation = validateFrostPayload(parsed, hemisphere);
      if (!validation.ok) {
        warn(FN, "frost_validation_failed", { reason: validation.reason, parsed });
        return new Response(
          JSON.stringify({ error: "frost_lookup_validation_failed", reason: validation.reason }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Upsert into home_climate. Preserve any user-edited rain thresholds.
      const upsertRow = {
        home_id:              homeId,
        last_frost_iso:       parsed.last_frost_iso,
        first_frost_iso:      parsed.first_frost_iso,
        growing_season_days:  parsed.growing_season_days,
        notes:                parsed.notes ?? null,
        last_frost_lookup_at: new Date().toISOString(),
        // Only seed defaults if the row didn't already exist.
        ...(existing ? {} : { rain_skip_mm: 5, rain_water_mm: 1 }),
      };

      const { error: upsertErr } = await supabase
        .from("home_climate")
        .upsert(upsertRow, { onConflict: "home_id" });

      if (upsertErr) {
        logError(FN, "home_climate_upsert_failed", { error: upsertErr.message });
        // Still return the parsed payload to the client — the lookup worked,
        // just the cache write failed. Next call will retry the write.
      }

      log(FN, "result", { action, fromCache: false });
      return new Response(
        JSON.stringify({
          last_frost_iso:      parsed.last_frost_iso,
          first_frost_iso:     parsed.first_frost_iso,
          growing_season_days: parsed.growing_season_days,
          notes:               parsed.notes ?? null,
          rain_skip_mm:        Number(existing?.rain_skip_mm ?? 5),
          rain_water_mm:       Number(existing?.rain_water_mm ?? 1),
          from_cache:          false,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── action: plant_when_to_plant ────────────────────────────────────────
    //
    // Uses the cached home_climate frost dates as context to produce
    // per-plant planting guidance. Sage+ AI-tier-gated (already enforced
    // upstream — this action is not in the `skipAiGate` list).

    if (action === "plant_when_to_plant") {
      if (!homeId) throw new Error("homeId is required for plant_when_to_plant.");
      if (!targetPlant) throw new Error("targetPlant (plant name) is required.");

      // Read the cached frost dates. If missing, the client should have
      // called lookup_frost_dates first; we still proceed with a generic
      // prompt rather than failing hard.
      const { data: climate } = await supabase
        .from("home_climate")
        .select("last_frost_iso, first_frost_iso, growing_season_days, notes")
        .eq("home_id", homeId)
        .maybeSingle();

      const climateContext = climate?.last_frost_iso && climate?.first_frost_iso
        ? `Last frost (avg): ${climate.last_frost_iso}. First frost (avg): ${climate.first_frost_iso}. Growing season: ${climate.growing_season_days ?? "unknown"} days.${climate.notes ? ` Note: ${climate.notes}` : ""}`
        : "Frost dates not yet looked up for this home — use seasonal common sense for the hemisphere.";

      const today = new Date().toISOString().split("T")[0];

      const promptText = `You are a horticultural reference. The user wants to plant: "${targetPlant}".
${locationLine ? `Gardener location: ${locationLine}.` : ""}
${climateContext}
Today's date: ${today}.
${prefsBlock}

Return precise planting guidance for THIS plant in THIS location:
- can_plant_outdoors_now: based on today vs the last frost date, is it safe to plant outdoors now?
- earliest_outdoor_date / latest_outdoor_date: the safe outdoor planting window for this year, anchored to the home's frost dates.
- indoor_start_recommended: if the growing season is short, should seeds be started indoors first?
- indoor_start_date: when to start indoors (only if recommended).
- spacing_cm / depth_cm: typical sowing/transplanting numbers.
- sun_requirement: 'full sun' / 'partial shade' / 'shade-tolerant' / similar.
- tips: 2-4 concrete tips tailored to this plant + climate. Reference the frost dates if relevant.`;

      const { text: rawText, usage } = await callGeminiCascade(
        apiKey, FN, toMessages([promptText]),
        { responseSchema: PLANT_WHEN_TO_PLANT_SCHEMA, logContext: { action } },
      );
      const parsed = JSON.parse(rawText);
      await logAiUsage(supabase, {
        homeId, userId: callerUserId, functionName: FN,
        action: "plant_when_to_plant", usage,
      });

      log(FN, "result", {
        action,
        plant: targetPlant,
        canPlantNow: parsed.can_plant_outdoors_now,
        hasClimateContext: !!climate?.last_frost_iso,
      });
      return new Response(rawText, {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── action: get_ai_disease_info ────────────────────────────────────────

    if (action === "get_ai_disease_info") {
      const promptText = `Provide a detailed botanical description and step-by-step remedial solution for the plant disease/pest: "${diseaseName}".
${notes ? `Context from the initial diagnosis: "${notes}"` : ""}
${locationLine ? `Gardener location: ${locationLine}. Tailor treatment options to what is available/appropriate for their region.` : ""}`;

      const { text: rawText, usage } = await callGeminiCascade(
        apiKey, FN, toMessages([promptText]),
        { responseSchema: DISEASE_INFO_SCHEMA, logContext: { action } },
      );
      await logAiUsage(supabase, { homeId: homeId ?? null, userId: callerUserId, functionName: FN, action: "get_ai_disease_info", usage });
      log(FN, "result", { action, diseaseName, hasNotes: !!notes });
      return new Response(rawText, {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── action: generate_remedial_plan ─────────────────────────────────────

    if (action === "generate_remedial_plan") {
      if (!diagnosisContext) throw new Error("No diagnosis context provided.");

      const promptText = `Based on the following diagnosis for the plant "${targetPlant || "the plant"}": "${diagnosisContext}"

Create a complete remedial care plan containing 1 to 4 specific tasks to help the plant recover.
${prefsBlock}
${locationLine ? `Gardener location: ${locationLine}. Time any spray or treatment tasks to avoid periods of rain or extreme heat common in this region in ${currentMonth}.` : ""}

CRITICAL RULES:
1. ONE-OFF TASKS: Immediate triage (pruning, isolating), environmental changes, and habit changes MUST be one-off tasks with is_recurring: false and frequency_days: null.
2. NO DUPLICATE WATERING: Do NOT create recurring Watering tasks. If watering routine needs changing, create a single one-off Maintenance task.
3. RECURRING TREATMENTS: Only use is_recurring: true for active ongoing treatments (e.g., applying fungicide, spraying neem oil).
4. MAXIMUM DURATION: For recurring treatments, end_offset_days MUST be 14 or 21 days maximum.
5. TASK TYPES: Use ONLY "Maintenance" for all medical tasks.`;

      const { text: rawText, usage } = await callGeminiCascade(
        apiKey, FN, toMessages([promptText]),
        { responseSchema: REMEDIAL_PLAN_SCHEMA, logContext: { action } },
      );
      const parsed = JSON.parse(rawText);
      await logAiUsage(supabase, { homeId: homeId ?? null, userId: callerUserId, functionName: FN, action: "generate_remedial_plan", usage });
      log(FN, "result", {
        action, targetPlant,
        tasksCount: parsed.remedial_schedules?.length ?? 0,
        tasks: (parsed.remedial_schedules ?? []).map((t: any) => ({
          title: t.title,
          recurring: t.is_recurring,
          frequencyDays: t.frequency_days ?? null,
        })),
      });
      return new Response(rawText, {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── action: identify_pest ──────────────────────────────────────────────

    if (action === "identify_pest") {
      if (!imageBase64) throw new Error("No image data provided.");
      const cleanBase64 = imageBase64.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");

      const promptText = `Analyze this image and identify the insect or creature visible.
${locationLine ? `Gardener location: ${locationLine}. Consider regionally prevalent pests for this climate.` : ""}

Determine whether it is a garden pest or a beneficial insect.
- is_pest = true if harmful (aphids, spider mites, whitefly, vine weevil, caterpillars, mealybugs, scale insects, thrips, fungus gnats, slugs, cutworms, etc.)
- is_pest = false if beneficial (honeybee, bumblebee, ladybird, lacewing, hoverfly, ground beetle, earthworm, parasitic wasp, etc.)
- pest_severity: null if not a pest. Low = cosmetic. Medium = can damage crops. High = serious infestation threat.
- possible_pests: top 3 most likely identifications regardless of is_pest. Each entry must have a 'name' (simple common name, no scientific names) and 'confidence' (0–100) based on visible body shape, colour, size, and markings. 90+ = clear match; 60–80 = probable; below 50 = speculative.`;

      const { text: rawText, usage } = await callGeminiCascade(
        apiKey, FN,
        toMessages([promptText, { inlineData: { data: cleanBase64, mimeType: mimeType || "image/jpeg" } }]),
        { responseSchema: IDENTIFY_PEST_SCHEMA, logContext: { action } },
      );
      const parsed = JSON.parse(rawText);
      await logAiUsage(supabase, { homeId: homeId ?? null, userId: callerUserId, functionName: FN, action: "identify_pest", usage });
      log(FN, "result", { action, possiblePests: (parsed.possible_pests ?? []).map((p: any) => `${p.name} (${p.confidence}%)`), isPest: parsed.is_pest });
      return new Response(rawText, {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── action: get_ai_pest_info ───────────────────────────────────────────

    if (action === "get_ai_pest_info") {
      if (!pestName) throw new Error("Pest name is required.");
      const promptText = `Provide detailed information about the garden pest or insect: "${pestName}".
${notes ? `Context from initial identification: "${notes}"` : ""}
${locationLine ? `Gardener location: ${locationLine}. Tailor treatment and prevention advice to their region and current season.` : ""}`;

      const { text: rawText, usage } = await callGeminiCascade(
        apiKey, FN, toMessages([promptText]),
        { responseSchema: PEST_INFO_SCHEMA, logContext: { action } },
      );
      await logAiUsage(supabase, { homeId: homeId ?? null, userId: callerUserId, functionName: FN, action: "get_ai_pest_info", usage });
      log(FN, "result", { action, pestName });
      return new Response(rawText, {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── action: seasonal_picks ─────────────────────────────────────────────
    //
    // Returns 4-6 personalised "what to grow this week" picks. Delegates
    // to the shared `generateSeasonalPicksForHome` orchestrator so the
    // cron pre-warm path uses identical logic.

    if (action === "seasonal_picks") {
      if (!homeId) throw new Error("homeId is required for seasonal_picks.");

      const result = await generateSeasonalPicksForHome(supabase, {
        homeId,
        apiKey,
        forceRegen: !!forceRegen,
        callerUserId,
        functionName: FN,
      });

      log(FN, "result", {
        action,
        fromCache: result.from_cache,
        weekIso: result.week_iso,
        source: result.source,
        count: result.picks.length,
      });

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (err: any) {
    logError(FN, "error", { error: err.message, action: action ?? "unknown" });
    await captureException(FN, err, { action: action ?? "unknown" });
    const fallback = action ? getFallback(action) : null;
    if (fallback) {
      return new Response(JSON.stringify(fallback), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// AI catalogue lookup — used by search_plants_text to mark which matches
// already exist in the global catalogue or as a home-fork. Backward-
// compatible: the function returns a sparse map keyed by the original match
// string; clients that ignore `hits` work as before.
// ──────────────────────────────────────────────────────────────────────────

type CatalogueHit = {
  hit_kind: "global" | "home_fork";
  plant_id: number;
  care_guide_data: unknown;
  freshness_version: number | null;
  last_care_generated_at: string | null;
  overridden_fields: unknown;
};

async function lookupCatalogueHits(
  supabase: any,
  matches: string[],
  homeId: string | null,
): Promise<Record<string, CatalogueHit>> {
  if (!matches?.length) return {};

  // Parse each "Common Name (Scientific Name)" → scientific_name_key.
  const matchByKey = new Map<string, string>();   // key → original match string
  const keys: string[] = [];
  for (const m of matches) {
    const { commonName, scientificName } = parseMatchString(m);
    const k = normaliseScientificKey(scientificName ? [scientificName] : [], commonName);
    if (k && !matchByKey.has(k)) {
      matchByKey.set(k, m);
      keys.push(k);
    }
  }
  if (!keys.length) return {};

  const hits: Record<string, CatalogueHit> = {};

  // Stage 1: home fork takes precedence (this home has its own override).
  if (homeId) {
    const { data: homeForks } = await supabase
      .from("plants")
      .select("id, care_guide_data, freshness_version, last_care_generated_at, scientific_name_key, overridden_fields")
      .eq("source", "ai")
      .eq("home_id", homeId)
      .in("scientific_name_key", keys);
    for (const row of homeForks ?? []) {
      const m = matchByKey.get(row.scientific_name_key);
      if (m) {
        hits[m] = {
          hit_kind: "home_fork",
          plant_id: row.id,
          care_guide_data: row.care_guide_data,
          freshness_version: row.freshness_version,
          last_care_generated_at: row.last_care_generated_at,
          overridden_fields: row.overridden_fields,
        };
      }
    }
  }

  // Stage 2: global rows for keys we haven't matched yet.
  const remainingKeys = keys.filter((k) => {
    const m = matchByKey.get(k);
    return m && !hits[m];
  });
  if (remainingKeys.length) {
    const { data: globals } = await supabase
      .from("plants")
      .select("id, care_guide_data, freshness_version, last_care_generated_at, scientific_name_key")
      .eq("source", "ai")
      .is("home_id", null)
      .in("scientific_name_key", remainingKeys);
    for (const row of globals ?? []) {
      const m = matchByKey.get(row.scientific_name_key);
      if (m) {
        hits[m] = {
          hit_kind: "global",
          plant_id: row.id,
          care_guide_data: row.care_guide_data,
          freshness_version: row.freshness_version,
          last_care_generated_at: row.last_care_generated_at,
          overridden_fields: null,
        };
      }
    }
  }

  return hits;
}
