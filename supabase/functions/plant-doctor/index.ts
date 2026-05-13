import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { log, warn, error as logError } from "../_shared/logger.ts";
import { callGeminiCascade, toMessages } from "../_shared/gemini.ts";
import { loadPreferences, formatPreferencesBlock } from "../_shared/preferences.ts";
import { guardAiByHome, guardPerenualByHome } from "../_shared/aiGuard.ts";
import { logAiUsage } from "../_shared/aiUsage.ts";
import { requireAuth } from "../_shared/requireAuth.ts";
import { enforceRateLimit } from "../_shared/rateLimit.ts";
import { getCached, setCached, cacheKey } from "../_shared/aiCache.ts";
import { getFallback } from "../_shared/fallbacks.ts";

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
        flowering_season:  { type: "ARRAY", items: { type: "STRING" } },
        harvest_season:    { type: "ARRAY", items: { type: "STRING" } },
        pruning_month:     { type: "ARRAY", items: { type: "STRING" } },
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

// ── Image helpers ───────────────────────────────────────────────────────────

async function fetchAndUploadImage(url: string, plantName: string, supabase: any) {
  try {
    const response = await fetch(url);
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
      searchFilters, excludeNames,
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
      );
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

    if (homeId) {
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
          const latStr = `${Math.abs(deviceLat).toFixed(1)}°${deviceLat >= 0 ? "N" : "S"}`;
          const lngStr = `${Math.abs(deviceLng).toFixed(1)}°${deviceLng >= 0 ? "E" : "W"}`;
          locationLine = `Hemisphere: ${hemisphere} | Current month: ${currentMonth} (${season}) | Device location: ${latStr}, ${lngStr}`;
        } else {
          const country = home.country ?? "";
          locationLine = [
            country ? `Country: ${country}` : "",
            `Hemisphere: ${hemisphere}`,
            `Current month: ${currentMonth} (${season})`,
          ].filter(Boolean).join(" | ");
        }
      }
    } else if (hasDeviceCoords) {
      hemisphere = deviceLat! >= 0 ? "Northern" : "Southern";
      currentMonthNum = new Date().getMonth() + 1;
      const season = getSeason(hemisphere, currentMonthNum);
      const latStr = `${Math.abs(deviceLat!).toFixed(1)}°${deviceLat! >= 0 ? "N" : "S"}`;
      const lngStr = `${Math.abs(deviceLng!).toFixed(1)}°${deviceLng! >= 0 ? "E" : "W"}`;
      locationLine = `Hemisphere: ${hemisphere} | Current month: ${currentMonth} (${season}) | Device location: ${latStr}, ${lngStr}`;
    }

    // ── action: search_plants_text ─────────────────────────────────────────

    if (action === "search_plants_text") {
      const hasQuery = plantSearch && plantSearch.trim().length > 0;
      const filters = searchFilters ?? {};
      const exclude: string[] = excludeNames ?? [];

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
      if (exclude.length > 0)              filterLines.push(`- Do NOT include any of these already-shown plants: ${exclude.join(", ")}`);

      const criteriaBlock = filterLines.length > 0
        ? `\nCriteria — the plant MUST satisfy ALL of the following:\n${filterLines.join("\n")}`
        : "";

      const prompt = `Return exactly 10 real plant species that best match the following request.${criteriaBlock}

Each match must be a real plant species. Format each as "Common Name (Scientific Name)".`;

      const { text, usage } = await callGeminiCascade(
        apiKey, FN, toMessages([prompt]),
        { responseSchema: SEARCH_PLANTS_SCHEMA, logContext: { action } },
      );
      const parsed = JSON.parse(text);
      await logAiUsage(supabase, { homeId: homeId ?? null, userId: callerUserId, functionName: FN, action: "search_plants_text", usage });
      log(FN, "result", { action, matchesCount: parsed.matches?.length ?? 0, query: plantSearch ?? null });
      return new Response(JSON.stringify(parsed), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── action: generate_care_guide ────────────────────────────────────────

    if (action === "generate_care_guide") {
      if (!targetPlant) throw new Error("No target plant provided.");
      const cleanName = targetPlant.split("(")[0].trim();
      const careKey = cacheKey("care_guide", cleanName, hemisphere);

      const cached = await getCached<{ plantData: any }>(supabase, careKey);
      if (cached) {
        log(FN, "result", { action, plant: cleanName, fromCache: true });
        return new Response(JSON.stringify(cached), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const prompt = `Generate a comprehensive botanical care guide for "${cleanName}".
${locationLine ? `Location context: ${locationLine}. Ensure seasonal advice (pruning months, flowering season, harvest season) reflects this hemisphere and location.` : ""}

Return all fields accurately. For pruning_month, use the abbreviated month names appropriate for the ${hemisphere} Hemisphere.`;

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

      await setCached(supabase, careKey, FN, parsedData, 30);
      await logAiUsage(supabase, { homeId: homeId ?? null, userId: callerUserId, functionName: FN, action: "generate_care_guide", usage });
      log(FN, "result", {
        action, plant: cleanName, fromCache: false,
        plantType: parsedData.plantData?.plant_type,
        cycle: parsedData.plantData?.cycle,
        hasWikiImage: !!parsedData.plantData?.thumbnail_url,
      });
      return new Response(JSON.stringify(parsedData), {
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

      // ── Environmental enrichment (parallel, only when IDs provided) ────────
      let envBlock = "";
      if (inventoryItemId || areaId) {
        const fourteenDaysAgo = new Date(Date.now() - 14 * 864e5).toISOString().split("T")[0];

        const [tasksRes, areaRes, luxRes, companionRes, weatherRes] = await Promise.all([
          inventoryItemId
            ? supabase.from("tasks")
                .select("type, title, status, due_date")
                .contains("inventory_item_ids", [inventoryItemId])
                .gte("due_date", fourteenDaysAgo)
                .order("due_date", { ascending: false })
                .limit(10)
            : Promise.resolve({ data: [] }),

          areaId
            ? supabase.from("areas")
                .select("name, is_outside, sunlight, growing_medium, medium_ph, medium_texture, water_movement, nutrient_source")
                .eq("id", areaId)
                .maybeSingle()
            : Promise.resolve({ data: null }),

          areaId
            ? supabase.from("area_lux_readings")
                .select("lux_value")
                .eq("area_id", areaId)
                .order("recorded_at", { ascending: false })
                .limit(5)
            : Promise.resolve({ data: [] }),

          areaId && inventoryItemId
            ? supabase.from("inventory_items")
                .select("plant_name")
                .eq("area_id", areaId)
                .neq("id", inventoryItemId)
                .eq("status", "Planted")
                .limit(10)
            : Promise.resolve({ data: [] }),

          homeId
            ? supabase.from("weather_snapshots")
                .select("data")
                .eq("home_id", homeId)
                .maybeSingle()
            : Promise.resolve({ data: null }),
        ]);

        const lines: string[] = [];

        const area = areaRes.data;
        if (area) {
          lines.push(`GROWING ENVIRONMENT:`);
          lines.push(`  Area: ${area.name} (${area.is_outside ? "Outdoor" : "Indoor"})`);
          if (area.sunlight) lines.push(`  Sunlight: ${area.sunlight}`);
          if (area.growing_medium) lines.push(`  Growing medium: ${area.growing_medium}`);
          if (area.medium_ph) lines.push(`  Soil pH: ${area.medium_ph}`);
          if (area.medium_texture) lines.push(`  Texture: ${area.medium_texture}`);
          if (area.water_movement) lines.push(`  Drainage: ${area.water_movement}`);
          if (area.nutrient_source) lines.push(`  Nutrients: ${area.nutrient_source}`);
        }

        const luxRows = (luxRes.data ?? []) as any[];
        if (luxRows.length > 0) {
          const avgLux = Math.round(luxRows.reduce((s: number, r: any) => s + r.lux_value, 0) / luxRows.length);
          lines.push(`  Light (recent avg): ${avgLux.toLocaleString()} lux`);
        }

        const companions = (companionRes.data ?? []) as any[];
        if (companions.length > 0) {
          lines.push(`COMPANION PLANTS IN SAME AREA: ${companions.map((c: any) => c.plant_name).join(", ")}`);
        }

        const recentTasks = (tasksRes.data ?? []) as any[];
        if (recentTasks.length > 0) {
          lines.push(`RECENT CARE (last 14 days):`);
          for (const t of recentTasks) {
            lines.push(`  • [${t.status}] ${t.type}: ${t.title} (due ${t.due_date})`);
          }
        } else if (inventoryItemId) {
          lines.push(`RECENT CARE: No tasks logged for this plant in the last 14 days.`);
        }

        const weatherData = weatherRes.data?.data;
        if (weatherData) {
          const current = weatherData.current ?? weatherData.currently ?? null;
          if (current) {
            const tempC = current.temperature_2m ?? current.temp ?? null;
            const humidity = current.relative_humidity_2m ?? current.humidity ?? null;
            const condition = current.weather_description ?? current.condition ?? null;
            const parts: string[] = [];
            if (tempC != null) parts.push(`${Math.round(tempC)}°C`);
            if (humidity != null) parts.push(`${humidity}% humidity`);
            if (condition) parts.push(condition);
            if (parts.length > 0) lines.push(`CURRENT WEATHER: ${parts.join(", ")}`);
          }
        }

        if (lines.length > 0) envBlock = "\n\n" + lines.join("\n");
      }

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

    throw new Error(`Unknown action: ${action}`);
  } catch (err: any) {
    logError(FN, "error", { error: err.message, action: action ?? "unknown" });
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
