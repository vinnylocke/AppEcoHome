import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { log, warn, error as logError } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import { callGeminiCascade, toMessages, VISION_DIAGNOSIS_MODELS } from "../_shared/gemini.ts";
import { extractJsonObject } from "../_shared/extractJson.ts";
import { loadPreferences, formatPreferencesBlock } from "../_shared/preferences.ts";
import { guardAiByHome, guardAiByUser, guardPerenualByHome } from "../_shared/aiGuard.ts";
import { logAiUsage } from "../_shared/aiUsage.ts";
import { getIdentifyQuota, type IdentifyQuota } from "../_shared/identifyQuota.ts";
import { requireAuth } from "../_shared/requireAuth.ts";
import { enforceRateLimit } from "../_shared/rateLimit.ts";
import { getCached, setCached, cacheKey } from "../_shared/aiCache.ts";
import { getFallback } from "../_shared/fallbacks.ts";
import { reverseGeocodeCity } from "../_shared/locationContext.ts";
import { normaliseScientificKey, parseMatchString } from "../_shared/aiPlantCatalogue.ts";
import { parseSceneJson } from "../_shared/sceneJson.ts";
import { buildEnvBlock } from "../_shared/visionEnvContext.ts";
import { validateFrostPayload } from "../_shared/frostValidation.ts";
import {
  GROW_GUIDE_SCHEMA,
  buildGrowGuidePrompt,
  diffGrowGuide,
  type PlantGrowGuide,
} from "../_shared/growGuide.ts";
import { generateSeasonalPicksForHome } from "../_shared/seasonalPicksHandler.ts";
import { buildPlantCareRangePrompt, parseCareRangeResponse, CARE_RANGE_SCHEMA } from "../_shared/plantCareRangeGen.ts";
import {
  identifyWithPlantNet,
  decideRouting,
  resolveCrossCheck,
  PlantNetError,
  type PlantNetImageInput,
  type PlantNetResult,
} from "../_shared/plantnet.ts";

const FN = "plant-doctor";

// ─── Multi-image normaliser ─────────────────────────────────────────────────
//
// Wave-19 Plant Lens accepts up to 5 photos per single-plant action. Older
// clients still send the legacy `imageBase64 / mimeType` pair. This helper
// normalises both shapes into a single array used by the prompt builder and
// the Pl@ntNet helper.

interface NormalisedImage {
  base64: string;       // raw, no data-URL prefix
  mimeType: string;
  organ?: "leaf" | "flower" | "fruit" | "bark" | "auto";
}

const stripDataUrlPrefix = (b64: string) =>
  b64.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");

function normaliseImages(body: any): NormalisedImage[] {
  const out: NormalisedImage[] = [];

  // New shape — `images: [{base64, mimeType, organ?}, …]`.
  if (Array.isArray(body?.images)) {
    for (const img of body.images.slice(0, 5)) {
      const b64 = typeof img?.base64 === "string" ? stripDataUrlPrefix(img.base64) : null;
      if (!b64) continue;
      out.push({
        base64: b64,
        mimeType: typeof img?.mimeType === "string" ? img.mimeType : "image/jpeg",
        organ: typeof img?.organ === "string"
          ? (img.organ as NormalisedImage["organ"])
          : "auto",
      });
    }
  }

  // Legacy shape — single `imageBase64 / mimeType`. Folded in if no `images`.
  if (out.length === 0 && typeof body?.imageBase64 === "string") {
    out.push({
      base64: stripDataUrlPrefix(body.imageBase64),
      mimeType: typeof body?.mimeType === "string" ? body.mimeType : "image/jpeg",
      organ: "auto",
    });
  }

  return out;
}

// Build the `parts[]` payload Gemini expects from a normalised image set.
// One text part is prepended; each image becomes its own inlineData part.
function buildVisionMessage(promptText: string, images: NormalisedImage[]) {
  return toMessages([
    promptText,
    ...images.map((img) => ({
      inlineData: { data: img.base64, mimeType: img.mimeType },
    })),
  ]);
}

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

// Multi-ID — detect every distinct plant in one photo, each with a bounding
// box ([ymin, xmin, ymax, xmax] normalised 0–1000) and ranked candidate IDs.
const SCENE_MAP_SCHEMA = {
  type: "OBJECT",
  properties: {
    notes: { type: "STRING" },
    regions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          box_2d: {
            type: "ARRAY",
            description: "Bounding box [ymin, xmin, ymax, xmax], each value normalised 0–1000 (top-left origin).",
            items: { type: "INTEGER" },
          },
          candidates: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                name:            { type: "STRING",  description: "Well-known common name of the plant" },
                scientific_name: { type: "STRING",  description: "Latin binomial scientific name" },
                confidence:      { type: "INTEGER", description: "0–100 confidence based on visible features" },
              },
              required: ["name", "scientific_name", "confidence"],
            },
          },
        },
        required: ["box_2d", "candidates"],
      },
    },
  },
  required: ["notes", "regions"],
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  let action: string | undefined;
  try {
    // Defence in depth — authenticate BEFORE touching env vars. A
    // misconfigured deploy (missing GEMINI_API_KEY) used to leak
    // `"GEMINI_API_KEY is not set."` to anonymous callers. Auth-first
    // means env-error messages only reach authenticated users.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const authResult = await requireAuth(req, supabase);
    if (authResult instanceof Response) return authResult;
    const callerUserId = authResult.user.id;

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    const perenualKey = Deno.env.get("PERENUAL_API_KEY");
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");

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

    // Multi-image normalisation. New clients send `images: [{base64, mimeType,
    // organ?}, …]`; legacy clients still send `imageBase64 / mimeType`.
    const images = normaliseImages(body);

    log(FN, "request_received", {
      action, homeId: homeId ?? null, targetPlant: targetPlant ?? null,
      diseaseName: diseaseName ?? null,
      imageCount: images.length,
      hasImage: images.length > 0,
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
    // `identify_vision` is open to all tiers with a sliding-window quota
    // for free users (UX review 2026-06-15 item 3.1). The action handler
    // does the quota check itself a few hundred lines below; the broad
    // home-AI gate would 403 free users before we get a chance.
    const skipAiGate = action === "lookup_frost_dates"
      || action === "seasonal_picks"
      || action === "identify_vision";

    // homeId is client-controlled and optional for the heavy vision actions
    // (diagnose / identify_pest only need an image) — omitting it must not
    // skip the tier gate, so fall back to the caller's own ai_enabled flag.
    if (!skipAiGate) {
      const guardErr = homeId
        ? await guardAiByHome(supabase, homeId)
        : await guardAiByUser(supabase, callerUserId);
      if (guardErr) return guardErr;
    }

    // Quota for free-tier identify_vision. Captured up here so the action
    // handler can stamp it into its success payload without re-querying.
    // Sage+ users (ai_enabled = true) get null — unlimited.
    //
    // We return 200 (not 429) with a `quota_exhausted` flag so supabase-js
    // delivers the quota payload as `data` — `error` only fires on
    // non-2xx and the client would have to await error.context.json() to
    // read the quota, which is awkward. The HTTP-purity of 429 isn't
    // worth the client-side ceremony.
    let freeIdentifyQuota: IdentifyQuota | null = null;
    if (action === "identify_vision" && callerUserId) {
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("ai_enabled")
        .eq("uid", callerUserId)
        .single();
      if (!profile?.ai_enabled) {
        freeIdentifyQuota = await getIdentifyQuota(supabase, callerUserId);
        if (freeIdentifyQuota.remaining === 0) {
          return new Response(
            JSON.stringify({
              quota_exhausted: true,
              quota: freeIdentifyQuota,
              message:
                "You've used your free identifications for this week. Upgrade to Sage for unlimited IDs and AI diagnosis.",
            }),
            {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }
      }
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
      const parsed = extractJsonObject(text) as any;
      const allMatches: string[] = parsed.matches ?? [];

      await logAiUsage(supabase, { homeId: homeId ?? null, userId: callerUserId, functionName: FN, action: "search_plants_text", usage, contextBlock: prompt, prompt, rawResult: text });
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
- flowering_season + harvest_season: only one or more of "Spring", "Summer", "Autumn", "Winter". Use British English — "Autumn", NEVER "Fall". Never months. Never year-round descriptions; if year-round, return all four seasons.
- pruning_month: only abbreviated month names from this exact set: "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec". Never full month names. Never seasons.
- Each array element is a SINGLE value — one season or month per element. NEVER comma-join into one string (["Spring","Summer"], not ["Spring, Summer"]).
- All three arrays must be tuned to the ${hemisphere} Hemisphere (e.g. summer harvest in northern hemisphere is Jun-Aug, in southern hemisphere is Dec-Feb).`;

      const { text: rawText, usage } = await callGeminiCascade(
        apiKey, FN, toMessages([prompt]),
        { responseSchema: CARE_GUIDE_SCHEMA, temperature: 0.2, logContext: { action } },
      );
      let parsedData = extractJsonObject(rawText) as any;
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
      await logAiUsage(supabase, { homeId: homeId ?? null, userId: callerUserId, functionName: FN, action: "generate_care_guide", usage, contextBlock: prompt, prompt, rawResult: rawText });
      log(FN, "result", {
        action, plant: cleanName, fromCache: false,
        plantType: parsedData.plantData?.plant_type,
        cycle: parsedData.plantData?.cycle,
        hasWikiImage: !!parsedData.plantData?.thumbnail_url,
        dbPlantId,
      });

      // Chain (background): give the freshly-created AI plant its soil
      // requirement ranges (moisture / EC / soil-temp) so the Soil Requirements
      // tab + Area Coach have them from birth. Runs AFTER the response via
      // waitUntil so it never adds latency to care-guide generation; best-effort.
      if (dbPlantId) {
        const rangePlantId = dbPlantId;
        const rangeCommon = parsedData.plantData?.common_name ?? parsed.commonName ?? cleanName;
        const rangeSci = parsedData.plantData?.scientific_name ?? (parsed.scientificName ? [parsed.scientificName] : []);
        // @ts-expect-error EdgeRuntime is only available at runtime.
        EdgeRuntime.waitUntil((async () => {
          try {
            const rangePrompt = buildPlantCareRangePrompt({ common_name: rangeCommon, scientific_name: rangeSci });
            const { text: rangeText, usage: rangeUsage } = await callGeminiCascade(
              apiKey, "plant-care-ranges", toMessages([rangePrompt]),
              { responseSchema: CARE_RANGE_SCHEMA, responseMimeType: "application/json", temperature: 0.2, maxOutputTokens: 512, logContext: { plantId: rangePlantId } },
            );
            const ranges = parseCareRangeResponse(rangeText);
            await logAiUsage(supabase, { homeId: homeId ?? null, userId: callerUserId, functionName: "plant-care-ranges", action: "care_range_on_create", usage: rangeUsage, contextBlock: rangePrompt, prompt: rangePrompt, rawResult: rangeText });
            if (ranges) {
              const patch: Record<string, number> = {};
              for (const f of ["soil_moisture_min", "soil_moisture_max", "soil_ec_min", "soil_ec_max", "soil_temp_min", "soil_temp_max"] as const) {
                const v = ranges[f];
                if (typeof v === "number" && Number.isFinite(v)) patch[f] = v;
              }
              if (Object.keys(patch).length > 0) {
                await supabase.from("plants").update(patch).eq("id", rangePlantId);
              }
            }
          } catch (e) {
            warn(FN, "care_range_on_create_failed", { plantId: rangePlantId, error: e instanceof Error ? e.message : String(e) });
          }
        })());
      }

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
      const parsedData = extractJsonObject(rawText) as any;
      await logAiUsage(supabase, { homeId: homeId ?? null, userId: callerUserId, functionName: FN, action: "recommend_plants", usage, contextBlock: prompt, prompt, rawResult: rawText });
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
      if (images.length === 0) throw new Error("No image data provided.");

      // ── Pl@ntNet primary ID ────────────────────────────────────────────────
      // We treat Pl@ntNet as the trusted identifier because it's purpose-built
      // for botanical species (vs a general vision LLM). Routing:
      //   score ≥ 0.4  → trust Pl@ntNet for possible_names; Gemini still runs
      //                  (Wave 21.0010) and its top 3 surface as ai_alternatives.
      //   0.15 – 0.4   → cross-check: Gemini's possible_names lead; surface
      //                  disagreement.
      //   < 0.15 / null → AI-fallback (Gemini-only as before).
      const plantNetKey = Deno.env.get("PLANTNET_API_KEY");
      let pnResult: PlantNetResult | null = null;
      let pnRoutingError: string | null = null;
      try {
        pnResult = await identifyWithPlantNet({
          images: images as PlantNetImageInput[],
          apiKey: plantNetKey,
        });
      } catch (err) {
        if (err instanceof PlantNetError) {
          pnRoutingError = err.reason.kind;
          warn(FN, "plantnet_error", { kind: err.reason.kind, message: err.message });
          // Silently fall back to AI-only ID on any Pl@ntNet error.
        } else {
          throw err;
        }
      }

      const routing = decideRouting(pnResult?.bestMatch ?? null);

      // Gemini ID — runs on ALL paths now (Wave 21.0010). On the trust path
      // its top 3 surface as `ai_alternatives` ("Also from Rhozly AI") so users
      // can compare an independent LLM guess against Pl@ntNet's confident match.
      const plantNetHint = routing.confirmedSpecies && routing.crossCheck
        ? `Pl@ntNet's top candidate is "${routing.confirmedCommonName ?? routing.confirmedSpecies}" (${routing.confirmedSpecies}) but its confidence was moderate. Use this as one hypothesis but don't be afraid to suggest a different species if the photo clearly shows something else.`
        : "";

      const promptText = `Identify the plant in this image.
${plantSearch ? `The user thinks it might be a "${plantSearch}". Confirm if this is correct.` : ""}
${plantNetHint}
${locationLine ? `The gardener is located: ${locationLine}. Prioritise plants native to or commonly grown in this region.` : ""}

Return the top 3 most likely identifications in possible_names. For each candidate provide:
- name: the plant's well-known common name (e.g. "Peace Lily", "Swiss Cheese Plant") — what most gardeners call it
- scientific_name: the Latin binomial (e.g. "Spathiphyllum wallisii", "Monstera deliciosa")
- confidence: 0–100 score based on visible leaf shape, colour, texture, and growth habit; 90+ = highly certain, 50–70 = plausible with ambiguity, below 40 = speculative

Also return a brief observation in notes.`;

      const { text: rawText, usage } = await callGeminiCascade(
        apiKey, FN,
        buildVisionMessage(promptText, images),
        // Pro-first cascade — identification accuracy matters more
        // than the ~20× cost delta (still cents per call).
        // 8192 (not the 2048 default): reasoning vision models spend "thinking"
        // tokens against this cap, so a small cap truncated the JSON mid-object
        // → "invalid JSON" / failed to analyze.
        { responseSchema: IDENTIFY_VISION_SCHEMA, models: VISION_DIAGNOSIS_MODELS, maxOutputTokens: 8192, logContext: { action } },
      );
      const aiParsed = extractJsonObject(rawText) as any;
      await logAiUsage(supabase, { homeId: homeId ?? null, userId: callerUserId, functionName: FN, action: "identify_vision", usage, contextBlock: promptText, prompt: promptText, rawResult: rawText });

      const aiCredit = {
        provider: "ai" as const,
        license_name: "AI-generated identification",
        license_url: null,
        attribution: "Identification by Rhozly AI (Google Gemini)",
        source_url: null,
        commercial_ok: null,
      };
      const aiAlternatives = Array.isArray(aiParsed?.possible_names)
        ? aiParsed.possible_names.slice(0, 3).map((c: any) => ({
            ...c,
            // Wave 22.0003 — AI tiles carry an "identification by Rhozly AI"
            // credit so users know the suggestion is LLM-derived, not a real
            // photo / curated record.
            image_credit: aiCredit,
          }))
        : [];

      // Wave 22.0003 — Pl@ntNet's species pages + images are CC-BY-SA. Build
      // the credit once so both the trust path's synthesised possible_names
      // and the response-level `plantnet.image_credit` field can reference it.
      const plantnetCredit = pnResult?.bestMatch
        ? {
            provider: "plantnet" as const,
            license_name: "Pl@ntNet — CC-BY-SA",
            license_url: "https://creativecommons.org/licenses/by-sa/4.0/",
            attribution: null,
            source_url: pnResult.bestMatch.gbifId
              ? `https://www.gbif.org/species/${pnResult.bestMatch.gbifId}`
              : `https://identify.plantnet.org/k-world-flora/species/${encodeURIComponent(pnResult.bestMatch.scientificName)}/data`,
            commercial_ok: false,
          }
        : null;

      // possible_names lead: Pl@ntNet on the trust path (its top 3 synthesised),
      // Gemini on the cross-check / ai_fallback paths.
      let parsed: any;
      if (routing.source === "plantnet" && pnResult?.bestMatch) {
        parsed = {
          notes: pnResult.bestMatch.commonName
            ? `Pl@ntNet matched as ${pnResult.bestMatch.commonName} (${pnResult.bestMatch.scientificName}) — confidence ${Math.round(pnResult.bestMatch.score * 100)}%.`
            : `Pl@ntNet matched as ${pnResult.bestMatch.scientificName} — confidence ${Math.round(pnResult.bestMatch.score * 100)}%.`,
          possible_names: pnResult.topMatches.slice(0, 3).map((m) => ({
            name: m.commonName ?? m.scientificName,
            scientific_name: m.scientificName,
            // Convert 0-1 score → 0-100 confidence. Pl@ntNet's calibration is
            // conservative; a 0.4 match is genuinely "very likely".
            confidence: Math.min(100, Math.round(m.score * 100)),
            // Wave 22.0003 — Pl@ntNet candidates carry the platform credit.
            image_credit: plantnetCredit,
          })),
        };
      } else {
        parsed = aiParsed;
      }

      // Stitch the Pl@ntNet result + cross-check disagreement.
      let identification_source = routing.source;
      let ai_suggested_name: string | null = null;
      if (routing.crossCheck && pnResult?.bestMatch) {
        const aiTopSciName = aiParsed?.possible_names?.[0]?.scientific_name ?? null;
        identification_source = resolveCrossCheck(
          pnResult.bestMatch.scientificName,
          aiTopSciName,
        );
        if (identification_source === "plantnet_vs_ai_disagreement") {
          ai_suggested_name = aiTopSciName;
        }
      }

      // UX review 2026-06-15 item 3.1 — surface the post-call quota state so
      // the client can update the badge without a second round-trip. Null
      // when the caller is Sage+ (unlimited).
      const quotaForResponse = freeIdentifyQuota
        ? {
            ...freeIdentifyQuota,
            used: freeIdentifyQuota.used + 1,
            remaining: Math.max(0, freeIdentifyQuota.remaining - 1),
          }
        : null;

      const responseBody = {
        ...parsed,
        // Wave 21.0010 — Gemini's top 3 candidates as a secondary tile group
        // on the trust path ("Also from Rhozly AI"). On cross-check /
        // ai_fallback the UI ignores this because possible_names already
        // carries Gemini's data.
        ai_alternatives: aiAlternatives,
        plantnet: pnResult
          ? {
              best_match: pnResult.bestMatch,
              top_matches: pnResult.topMatches.slice(0, 5),
              identification_source,
              ai_suggested_name,
              remaining_requests: pnResult.remainingRequests,
            }
          : pnRoutingError
            ? {
                best_match: null,
                top_matches: [],
                identification_source: "ai_fallback" as const,
                ai_suggested_name: null,
                remaining_requests: null,
                error: pnRoutingError,
              }
            : null,
        quota: quotaForResponse,
      };

      log(FN, "result", {
        action,
        identification_source,
        possibleNames: (parsed.possible_names ?? []).map((n: any) => `${n.name} (${n.confidence}%)`),
        aiAlternatives: aiAlternatives.map((n: any) => `${n.name} (${n.confidence}%)`),
      });
      return new Response(JSON.stringify(responseBody), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── action: identify_scene (Multi-ID — detect every plant + weighted IDs) ──

    if (action === "identify_scene") {
      if (images.length === 0) throw new Error("No image data provided.");
      // Multi-ID is intentionally single-photo — its premise is "one overview
      // photo with several plants". Extra photos would just confuse the box
      // detector; reject them with a clear 400 so the UI can guide the user.
      if (images.length > 1) {
        return new Response(
          JSON.stringify({
            error:
              "Multi-ID accepts exactly one overview photo. Use Identify or Analyse for multi-photo identification.",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const sceneImage = images[0];

      const promptText = `Detect every DISTINCT plant in this photo — there may be several.
${locationLine ? `The gardener is located: ${locationLine}. Prioritise plants native to or commonly grown in this region.` : ""}

For each distinct plant return:
- box_2d: a bounding box [ymin, xmin, ymax, xmax] drawn tightly around that plant, each value normalised 0–1000 (top-left origin).
- candidates: the top 1–3 most likely identities, each with:
  - name: the well-known common name (e.g. "Lavender", "Cherry Tomato") — what most gardeners call it
  - scientific_name: the Latin binomial (e.g. "Lavandula angustifolia")
  - confidence: 0–100 based on visible leaf shape, colour, texture, and growth habit; 90+ = highly certain, 50–70 = plausible with ambiguity, below 40 = speculative

Rules:
- Only box things that are clearly plants. Do NOT invent regions for pots, soil, mulch, labels, hands, or background.
- One box per distinct plant. If the same species appears as several separate plants, box each one.
- Order each region's candidates by confidence, highest first.
- Return at most 12 regions — the most prominent plants if there are more.
- If you cannot find any distinct plants, return an empty regions array.

Add a brief overall observation in notes.`;

      const { text: rawText, usage } = await callGeminiCascade(
        apiKey, FN,
        buildVisionMessage(promptText, [sceneImage]),
        // Pro-first cascade + low temperature for the steadiest boxes. A large
        // token budget is essential: the Pro "thinking" models spend most of the
        // default 2048 on reasoning, truncating the JSON mid-array otherwise.
        { responseSchema: SCENE_MAP_SCHEMA, models: VISION_DIAGNOSIS_MODELS, temperature: 0.2, maxOutputTokens: 8192, logContext: { action } },
      );

      // Tolerant parse — survives a prose preamble ("Here is the…") and salvages
      // complete regions from a truncated array rather than 500-ing.
      const parsedRaw = parseSceneJson(rawText);
      // Server-side hygiene: keep only well-formed regions (real 0–1000 box with
      // positive area + ≥1 named candidate); clamp confidence; sort; cap at 12.
      const cleanRegions = (Array.isArray(parsedRaw.regions) ? parsedRaw.regions : [])
        .map((r: any) => {
          const box = Array.isArray(r?.box_2d) ? r.box_2d.map((n: any) => Math.round(Number(n))) : [];
          const candidates = (Array.isArray(r?.candidates) ? r.candidates : [])
            .filter((c: any) => c && typeof c.name === "string" && c.name.trim())
            .map((c: any) => ({
              name: c.name.trim(),
              scientific_name: typeof c.scientific_name === "string" ? c.scientific_name.trim() : "",
              confidence: Math.max(0, Math.min(100, Math.round(Number(c.confidence) || 0))),
            }))
            .sort((a: any, b: any) => b.confidence - a.confidence);
          return { box_2d: box, candidates };
        })
        .filter((r: any) =>
          r.box_2d.length === 4 &&
          r.box_2d.every((n: number) => Number.isFinite(n) && n >= 0 && n <= 1000) &&
          r.box_2d[2] > r.box_2d[0] &&
          r.box_2d[3] > r.box_2d[1] &&
          r.candidates.length > 0,
        )
        .slice(0, 12);

      const result = { notes: parsedRaw.notes ?? "", regions: cleanRegions };
      await logAiUsage(supabase, { homeId: homeId ?? null, userId: callerUserId, functionName: FN, action: "identify_scene", usage, contextBlock: promptText, prompt: promptText, rawResult: rawText });
      log(FN, "result", { action, regionCount: cleanRegions.length });
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── action: diagnose ───────────────────────────────────────────────────

    if (action === "diagnose") {
      if (images.length === 0) throw new Error("No image data provided.");

      const envBlock = await buildEnvBlock(supabase, { inventoryItemId, areaId, homeId });

      const plantContext = targetPlant
        ? `This plant is a "${targetPlant}". Use this to improve your diagnosis accuracy.`
        : "The plant species is unknown — identify any visual clues from the image.";

      const promptText = `${plantContext}
${locationLine ? `Gardener location: ${locationLine}. Regional climate REFINES probability but does not create evidence.` : ""}${envBlock}

You are diagnosing only what is LITERALLY VISIBLE in this photo. Hallucinated diagnoses (reporting symptoms that aren't actually in the image) damage user trust more than missing a subtle real disease.

═══════════════════════════════════════════════════════════════
TWO-STAGE REASONING — perform internally, then return the JSON:
═══════════════════════════════════════════════════════════════

STEP 1 — VISIBLE FEATURES INVENTORY
Enumerate every literally-visible feature in the photo that could indicate pest / disease / stress:
- Spots: colour, shape, location (margins / interveinal / mid-blade), size.
- Discoloration: yellowing (chlorosis), browning, purpling, mottling — and WHERE.
- Damage patterns: holes, jagged edges, skeletonised leaves, stippling.
- Insects / mites: actual visible bugs, webbing, frass (droppings), eggs.
- Mould / mildew: white powdery coatings, fuzzy growth, dark sooty deposits.
- Wilt / posture: drooping with no visible discoloration vs wilting with browning edges.
- Structural: rot at base, cracked stems, broken branches.

If the photo shows a healthy-looking plant with no visible problems, your inventory is EMPTY. That's a valid result.

STEP 2 — DIAGNOSE FROM EVIDENCE
ONLY diagnose conditions whose required visible symptoms appear in your Step 1 inventory.
- DO NOT diagnose "black spot fungus" unless you actually see dark circular leaf spots.
- DO NOT diagnose "aphid infestation" unless you actually see clustered insects, sooty mould, or distorted new growth.
- DO NOT diagnose "powdery mildew" unless you actually see a white powdery coating.
- Species susceptibility + environment REFINE which of the visible-symptom-matching conditions is most likely. They DO NOT justify diagnosing conditions whose symptoms aren't visible.

═══════════════════════════════════════════════════════════════

RESPONSE RULES:
- possible_diseases: array of up to 3 objects, each with 'name' (common name only, no scientific in brackets) and 'confidence' (0–100). 90+ = textbook visible presentation; 60–80 = symptoms clearly visible + species-likely; below 50 = DO NOT INCLUDE (will be filtered out anyway).
- If your Step 1 inventory was empty OR the issue is purely environmental (e.g. underwatering), return [] for possible_diseases.
- severity: "Healthy" if Step 1 was empty (this is the correct answer when nothing is wrong), "Low" for minor cosmetic, "Medium" for moderate, "High" for survival-threatening.
- environmental_factors: contributing conditions from the context above (only if Step 1 had relevant evidence).
- immediate_actions: top 3 urgent steps. If plant is healthy, list general maintenance reminders, not treatment.
- possible_names: null always.`;

      const { text: rawText, usage } = await callGeminiCascade(
        apiKey, FN,
        buildVisionMessage(promptText, images),
        // Pro-first cascade + low temp + two-stage prompt — all three
        // working together to keep diagnoses evidence-grounded.
        { responseSchema: DIAGNOSE_SCHEMA, temperature: 0.2, models: VISION_DIAGNOSIS_MODELS, maxOutputTokens: 8192, logContext: { action } },
      );
      const parsed = extractJsonObject(rawText) as any;

      // Server-side confidence floor — drop anything under 50% so the
      // UI never shows low-confidence speculation. Matches the prompt
      // instruction. Easy to tune the threshold here if it's too
      // aggressive in practice.
      const DIAGNOSE_CONFIDENCE_FLOOR = 50;
      if (Array.isArray(parsed.possible_diseases)) {
        const beforeCount = parsed.possible_diseases.length;
        parsed.possible_diseases = parsed.possible_diseases.filter(
          (d: { confidence?: number }) => (d.confidence ?? 0) >= DIAGNOSE_CONFIDENCE_FLOOR,
        );
        if (parsed.possible_diseases.length !== beforeCount) {
          log(FN, "diagnose_low_confidence_filtered", {
            before: beforeCount,
            after: parsed.possible_diseases.length,
            floor: DIAGNOSE_CONFIDENCE_FLOOR,
          });
        }
        // If filtering emptied the list and severity was previously
        // non-Healthy, downgrade severity to Healthy — the user
        // shouldn't see "Medium severity" with no listed diseases.
        if (parsed.possible_diseases.length === 0 && parsed.severity !== "Healthy") {
          parsed.severity = "Healthy";
        }
      }

      await logAiUsage(supabase, { homeId: homeId ?? null, userId: callerUserId, functionName: FN, action: "diagnose", usage, contextBlock: envBlock, prompt: promptText, rawResult: rawText });
      log(FN, "result", {
        action,
        severity: parsed.severity ?? null,
        possibleDiseases: parsed.possible_diseases ?? null,
        healthy: !parsed.possible_diseases?.length,
        hasEnvContext: !!envBlock,
      });
      return new Response(JSON.stringify(parsed), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── action: analyse_comprehensive ──────────────────────────────────────

    if (action === "analyse_comprehensive") {
      if (images.length === 0) throw new Error("No image data provided.");

      // ── Pl@ntNet ID pre-pass ──────────────────────────────────────────────
      // For comprehensive analyse we always still run Gemini (for health /
      // pruning / disease / pest / tasks). Pl@ntNet just upgrades the ID step
      // — when its match is confident we tell Gemini the species name so it
      // doesn't waste reasoning on identification and focuses on the rest.
      const plantNetKey = Deno.env.get("PLANTNET_API_KEY");
      let pnResult: PlantNetResult | null = null;
      let pnRoutingError: string | null = null;
      if (!targetPlant) { // skip Pl@ntNet when caller already named the plant
        try {
          pnResult = await identifyWithPlantNet({
            images: images as PlantNetImageInput[],
            apiKey: plantNetKey,
          });
        } catch (err) {
          if (err instanceof PlantNetError) {
            pnRoutingError = err.reason.kind;
            warn(FN, "plantnet_error", { kind: err.reason.kind, message: err.message });
          } else {
            throw err;
          }
        }
      }
      const routing = decideRouting(pnResult?.bestMatch ?? null);

      const envBlock = await buildEnvBlock(supabase, { inventoryItemId, areaId, homeId });

      const plantContext = targetPlant
        ? `This plant is a "${targetPlant}". Use this to ground your identification.`
        : routing.source === "plantnet" && routing.confirmedSpecies
          ? `Pl@ntNet has identified this plant as "${routing.confirmedCommonName ?? routing.confirmedSpecies}" (${routing.confirmedSpecies}) with high confidence. Use this as the identification and focus your effort on health, pruning, propagation, disease, pest, and tasks.`
          : routing.confirmedSpecies
            ? `Pl@ntNet's top candidate is "${routing.confirmedCommonName ?? routing.confirmedSpecies}" (${routing.confirmedSpecies}) but its confidence was moderate. Treat this as a strong hypothesis but reach a different identification if the image clearly shows something else.`
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
        buildVisionMessage(promptText, images),
        // Pro-first cascade — comprehensive analyse benefits even
        // more from Pro vision since it integrates many signals at
        // once (health + disease + pest + edibility + pruning).
        { responseSchema: ANALYSE_COMPREHENSIVE_SCHEMA, models: VISION_DIAGNOSIS_MODELS, maxOutputTokens: 8192, logContext: { action } },
      );
      const parsed = extractJsonObject(rawText) as any;
      await logAiUsage(supabase, {
        homeId: homeId ?? null,
        userId: callerUserId,
        functionName: FN,
        action: "analyse_comprehensive",
        usage,
        contextBlock: envBlock,
        prompt: promptText,
        rawResult: rawText,
      });

      // Stitch the Pl@ntNet result + cross-check decision onto the response.
      let identification_source = routing.source;
      let ai_suggested_name: string | null = null;
      if (routing.crossCheck && pnResult?.bestMatch) {
        const aiTopSciName = parsed?.identification?.scientific_name?.[0] ?? null;
        identification_source = resolveCrossCheck(
          pnResult.bestMatch.scientificName,
          aiTopSciName,
        );
        if (identification_source === "plantnet_vs_ai_disagreement") {
          ai_suggested_name = aiTopSciName;
        }
      }
      const responseBody = {
        ...parsed,
        plantnet: pnResult
          ? {
              best_match: pnResult.bestMatch,
              top_matches: pnResult.topMatches.slice(0, 5),
              identification_source,
              ai_suggested_name,
              remaining_requests: pnResult.remainingRequests,
            }
          : pnRoutingError
            ? {
                best_match: null,
                top_matches: [],
                identification_source: "ai_fallback" as const,
                ai_suggested_name: null,
                remaining_requests: null,
                error: pnRoutingError,
              }
            : null,
      };
      log(FN, "result", {
        action,
        identifiedAs: parsed.identification?.common_name ?? null,
        confidence: parsed.identification?.confidence ?? null,
        identification_source,
        healthState: parsed.health?.state ?? null,
        hasDisease: !!parsed.disease,
        hasPest: !!parsed.pest,
        isEdible: parsed.edibility?.is_edible ?? null,
        suggestedTasksCount: (parsed.suggested_tasks ?? []).length,
        hasEnvContext: !!envBlock,
      });
      return new Response(JSON.stringify(responseBody), {
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
      const parsed = extractJsonObject(rawText) as PlantGrowGuide;
      await logAiUsage(supabase, {
        homeId: homeId ?? null,
        userId: callerUserId,
        functionName: FN,
        action: "generate_grow_guide",
        usage,
        contextBlock: promptText,
        prompt: promptText,
        rawResult: rawText,
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
      const parsed = extractJsonObject(rawText) as any;
      await logAiUsage(supabase, {
        homeId, userId: callerUserId, functionName: FN,
        action: "lookup_frost_dates", usage,
        contextBlock: promptText, prompt: promptText, rawResult: rawText,
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
      const parsed = extractJsonObject(rawText) as any;
      await logAiUsage(supabase, {
        homeId, userId: callerUserId, functionName: FN,
        action: "plant_when_to_plant", usage,
        contextBlock: climateContext, prompt: promptText, rawResult: rawText,
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
      await logAiUsage(supabase, { homeId: homeId ?? null, userId: callerUserId, functionName: FN, action: "get_ai_disease_info", usage, contextBlock: promptText, prompt: promptText, rawResult: rawText });
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
      const parsed = extractJsonObject(rawText) as any;
      await logAiUsage(supabase, { homeId: homeId ?? null, userId: callerUserId, functionName: FN, action: "generate_remedial_plan", usage, contextBlock: diagnosisContext, prompt: promptText, rawResult: rawText });
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
      if (images.length === 0) throw new Error("No image data provided.");

      const promptText = `You are identifying an insect or creature LITERALLY VISIBLE in this photo. Hallucinated identifications (claiming you see a pest that isn't actually in the image) damage user trust more than declining to identify a partially-visible specimen.

═══════════════════════════════════════════════════════════════
TWO-STAGE REASONING — perform internally, then return the JSON:
═══════════════════════════════════════════════════════════════

STEP 1 — VISIBLE FEATURES INVENTORY
Describe what you actually see in the photo:
- Is there an insect / mite / slug / snail / other creature visibly present? If yes, where in the frame?
- Body: shape (round / elongate / segmented), approximate size relative to plant features, colour pattern, wing presence, leg count.
- Behaviour clues: clustering, position on plant, visible mouthparts.
- If you see DAMAGE but NO actual creature, note that — the damage alone doesn't identify the cause.

If the photo shows a plant or leaf with no visible creature, your inventory is empty. That's a valid result — set is_pest to null and possible_pests to [].

STEP 2 — IDENTIFY FROM EVIDENCE
ONLY identify creatures whose physical features match what you saw in Step 1.
- DO NOT identify "aphids" based on a damaged leaf if you can't see actual aphids.
- DO NOT identify a species you can't actually see body parts of — partial view = lower confidence.
- Regional prevalence REFINES which visible-feature-matching identification is most likely. It does NOT justify identifying creatures whose body parts aren't visible.

${locationLine ? `Gardener location: ${locationLine}. Use regional prevalence to refine probability — not to invent identifications.` : ""}

═══════════════════════════════════════════════════════════════

RESPONSE RULES:
- is_pest = true if the visible creature is harmful (aphids, spider mites, whitefly, vine weevil, caterpillars, mealybugs, scale insects, thrips, fungus gnats, slugs, cutworms, etc.)
- is_pest = false if beneficial (honeybee, bumblebee, ladybird, lacewing, hoverfly, ground beetle, earthworm, parasitic wasp, etc.)
- is_pest = null if no creature is visible in the photo.
- pest_severity: null if not a pest or no creature visible. Low = cosmetic. Medium = can damage crops. High = serious infestation threat.
- possible_pests: top 3 most likely identifications. Each entry: 'name' (simple common name, no scientific) + 'confidence' (0–100) based on visible body shape, colour, size, markings. 90+ = clear match with multiple distinguishing features visible; 60–80 = probable based on visible features; below 50 = DO NOT INCLUDE (will be filtered out anyway).
- If your Step 1 inventory had no visible creature, return [] for possible_pests.`;

      const { text: rawText, usage } = await callGeminiCascade(
        apiKey, FN,
        buildVisionMessage(promptText, images),
        // Pro-first cascade + low temp + two-stage prompt for the same
        // anti-hallucination reasoning we use on diagnose.
        { responseSchema: IDENTIFY_PEST_SCHEMA, temperature: 0.2, models: VISION_DIAGNOSIS_MODELS, logContext: { action } },
      );
      const parsed = extractJsonObject(rawText) as any;

      // Server-side confidence floor — drop sub-50% guesses before
      // returning, so the UI never shows low-confidence speculation.
      const PEST_CONFIDENCE_FLOOR = 50;
      if (Array.isArray(parsed.possible_pests)) {
        const beforeCount = parsed.possible_pests.length;
        parsed.possible_pests = parsed.possible_pests.filter(
          (p: { confidence?: number }) => (p.confidence ?? 0) >= PEST_CONFIDENCE_FLOOR,
        );
        if (parsed.possible_pests.length !== beforeCount) {
          log(FN, "pest_low_confidence_filtered", {
            before: beforeCount,
            after: parsed.possible_pests.length,
            floor: PEST_CONFIDENCE_FLOOR,
          });
        }
        // If everything got filtered, suppress is_pest + severity so
        // the UI doesn't claim "this is a harmful pest" with no name.
        if (parsed.possible_pests.length === 0) {
          parsed.is_pest = null;
          parsed.pest_severity = null;
        }
      }

      await logAiUsage(supabase, { homeId: homeId ?? null, userId: callerUserId, functionName: FN, action: "identify_pest", usage, contextBlock: promptText, prompt: promptText, rawResult: rawText });
      log(FN, "result", { action, possiblePests: (parsed.possible_pests ?? []).map((p: any) => `${p.name} (${p.confidence}%)`), isPest: parsed.is_pest });
      return new Response(JSON.stringify(parsed), {
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
      await logAiUsage(supabase, { homeId: homeId ?? null, userId: callerUserId, functionName: FN, action: "get_ai_pest_info", usage, contextBlock: promptText, prompt: promptText, rawResult: rawText });
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
