import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { log, error as logError } from "../_shared/logger.ts";
import { requireAuth } from "../_shared/requireAuth.ts";
import { enforceRateLimit } from "../_shared/rateLimit.ts";

const FN = "verdantly-search";
const CACHE_TTL_DAYS = 30;
const RAPIDAPI_HOST = "verdantly-gardening-api.p.rapidapi.com";
const BASE_URL = `https://${RAPIDAPI_HOST}`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ─── Field Conversion Tables ────────────────────────────────────────────────

const WATERING_DAYS: Record<string, { min: number; max: number; label: string }> = {
  "Low":      { min: 14, max: 21, label: "Minimum" },
  "Moderate": { min: 7,  max: 14, label: "Average"  },
  "High":     { min: 2,  max: 7,  label: "Frequent" },
};

const SUNLIGHT_MAP: Record<string, string[]> = {
  "Full sun":                      ["full_sun"],
  "Full Sun":                      ["full_sun"],
  "Partial shade":                 ["part_shade"],
  "Partial Shade":                 ["part_shade"],
  "Full shade":                    ["deep_shade"],
  "Full Shade":                    ["deep_shade"],
  "Full sun to partial shade":     ["full_sun", "part_shade"],
  "Full Sun to Partial Shade":     ["full_sun", "part_shade"],
  "Partial to full shade":         ["part_shade", "deep_shade"],
  "Partial to Full Shade":         ["part_shade", "deep_shade"],
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function verdantlyHeaders(apiKey: string): Record<string, string> {
  return {
    "X-RapidAPI-Host": RAPIDAPI_HOST,
    "X-RapidAPI-Key":  apiKey,
    "Content-Type":    "application/json",
  };
}

function buildDescription(v: any): string | null {
  const parts: string[] = [];
  const highlights = Array.isArray(v.highlights)
    ? v.highlights.join(" ")
    : (typeof v.highlights === "string" ? v.highlights : null);
  if (highlights) parts.push(highlights);
  if (v.description && v.description !== highlights) parts.push(v.description);
  if (v.commonUses && typeof v.commonUses === "string") parts.push(`Common uses: ${v.commonUses}`);
  return parts.length > 0 ? parts.join("\n\n") : null;
}

function buildPlantingInstructions(pi: any): string | null {
  if (!pi) return null;
  if (typeof pi === "string") return pi;
  const parts: string[] = [];
  if (pi.startIndoors) parts.push(`Start indoors: ${pi.startIndoors}`);
  if (pi.transplantOutdoors) parts.push(`Transplant outdoors: ${pi.transplantOutdoors}`);
  if (pi.directSow) parts.push(`Direct sow: ${pi.directSow}`);
  return parts.length > 0 ? parts.join("\n") : null;
}

function buildMaintenance(ci: any): string | null {
  if (!ci) return null;
  const parts: string[] = [];
  if (ci.pruningInstructions) parts.push(ci.pruningInstructions);
  if (ci.harvestingInstructions) parts.push(ci.harvestingInstructions);
  return parts.length > 0 ? parts.join("\n\n") : null;
}

function buildAttracts(ecology: any): string[] {
  const result: string[] = [];
  if (Array.isArray(ecology?.attracts)) {
    result.push(...ecology.attracts.filter((a: any) => typeof a === "string"));
  }
  if (ecology?.attractsPollinators === true && !result.includes("Pollinators")) {
    result.push("Pollinators");
  }
  return result;
}

function parseSpacingInches(s: any): number | null {
  if (!s) return null;
  const m = String(s).match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
}

function buildMetadata(v: any): Record<string, any> | null {
  const meta: Record<string, any> = {};
  const lm = v.lifecycleMilestones ?? {};
  const gr = v.growingRequirements ?? {};
  const pi = v.careInstructions?.plantingInstructions;

  // Harvest timing — drives harvest-check blueprint auto-creation
  if (lm.daysToHarvestMin != null) meta.harvest_days_min = lm.daysToHarvestMin;
  if (lm.daysToHarvestMax != null) meta.harvest_days_max = lm.daysToHarvestMax;
  // Single daysToHarvest field (some plants only have one value)
  if (lm.daysToHarvest != null && meta.harvest_days_min == null) {
    meta.harvest_days_min = lm.daysToHarvest;
    meta.harvest_days_max = lm.daysToHarvest;
  }

  // Structured planting instructions — passed to AI planting schedule
  if (pi && typeof pi === "object") {
    const methods: Record<string, string> = {};
    if (pi.startIndoors) methods.start_indoors = pi.startIndoors;
    if (pi.transplantOutdoors) methods.transplant_outdoors = pi.transplantOutdoors;
    if (pi.directSow) methods.direct_sow = pi.directSow;
    if (Object.keys(methods).length > 0) meta.planting_methods = methods;
  }

  // Growing context
  if (gr.spacingRequirement) meta.spacing_inches = parseSpacingInches(gr.spacingRequirement);
  if (gr.frostTolerance) meta.frost_tolerance = gr.frostTolerance;
  if (gr.careInstructions) meta.care_notes = gr.careInstructions;
  if (gr.soilPreference) meta.soil_preference = gr.soilPreference;

  // Additional AI context
  if (v.pestAndDiseaseRisks) meta.pest_disease_info = v.pestAndDiseaseRisks;
  if (v.commonUses) meta.common_uses = v.commonUses;
  if (v.history) meta.history = v.history;

  return Object.keys(meta).length > 0 ? meta : null;
}

function mapToPlantDetails(v: any) {
  const waterReq = v.growingRequirements?.waterRequirement ?? null;
  const waterDays = waterReq ? (WATERING_DAYS[waterReq] ?? null) : null;
  const sunReq = v.growingRequirements?.sunlightRequirement ?? null;
  const sunlight = sunReq ? (SUNLIGHT_MAP[sunReq] ?? []) : [];
  const lm = v.lifecycleMilestones ?? {};

  return {
    common_name:           v.name ?? "Unknown",
    scientific_name:       v.species?.scientificName ? [v.species.scientificName] : [],
    other_names:           [],
    family:                v.species?.taxonomy?.family ?? null,
    plant_type:            v.category ?? null,
    cycle:                 v.growthDetails?.growthPeriod ?? null,
    image_url:             v.imageUrl ?? null,
    thumbnail_url:         v.imageUrl ?? null,
    watering:              waterDays?.label ?? null,
    watering_benchmark:    null,
    watering_min_days:     waterDays?.min ?? null,
    watering_max_days:     waterDays?.max ?? null,
    sunlight,
    care_level:            null,
    hardiness_min:         v.growingRequirements?.minGrowingZone ?? null,
    hardiness_max:         v.growingRequirements?.maxGrowingZone ?? null,
    is_edible:             v.ecology?.isEdible ?? false,
    is_toxic_pets:         !!(v.safety?.toxicity?.dogs?.level || v.safety?.toxicity?.cats?.level || v.safety?.toxicity?.horses?.level),
    is_toxic_humans:       !!(v.safety?.toxicity?.humans?.level),
    attracts:              buildAttracts(v.ecology),
    description:           buildDescription(v),
    maintenance:           buildMaintenance(v.careInstructions),
    growth_rate:           null,
    growth_habit:          v.growthDetails?.growthType ?? null,
    drought_tolerant:      v.ecology?.droughtTolerant ?? false,
    salt_tolerant:         false,
    thorny:                false,
    invasive:              v.ecology?.isInvasive ?? false,
    tropical:              false,
    indoor:                false,
    pest_susceptibility:   [],
    flowers:               false,
    cones:                 false,
    fruits:                !!(v.ecology?.isEdible),
    edible_leaf:           false,
    cuisine:               !!(v.ecology?.isEdible),
    medicinal:             false,
    leaf:                  true,
    flowering_season:      lm.avgFirstBloomDate ?? lm.bloomDate ?? null,
    harvest_season:        lm.firstHarvestDate ?? lm.lastHarvestDate ?? null,
    pruning_month:         [],
    propagation:           [],
    verdantly_id:          v.id ?? null,
    perenual_id:           null,
    days_to_harvest_min:   lm.daysToHarvestMin ?? lm.daysToHarvest ?? null,
    days_to_harvest_max:   lm.daysToHarvestMax ?? lm.daysToHarvest ?? null,
    soil_ph_min:           v.ecology?.soilPhMin ?? null,
    soil_ph_max:           v.ecology?.soilPhMax ?? null,
    planting_instructions: buildPlantingInstructions(v.careInstructions?.plantingInstructions),
    plant_metadata:        buildMetadata(v),
    source:                "verdantly" as const,
  };
}

function mapToSearchResult(v: any) {
  return {
    id:              v.id,
    common_name:     v.name ?? "Unknown",
    scientific_name: v.species?.scientificName ? [v.species.scientificName] : [],
    thumbnail_url:   v.imageUrl ?? null,
    _provider:       "verdantly" as const,
    verdantly_id:    v.id,
  };
}

// ─── Main ────────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const apiKey      = Deno.env.get("VERDANTLY_API_KEY");

  const db = createClient(supabaseUrl, serviceKey);

  try {
    if (!apiKey) throw new Error("Missing VERDANTLY_API_KEY");

    const authResult = await requireAuth(req, db);
    if (authResult instanceof Response) return authResult;
    const userId = authResult.user.id;

    const rateLimitErr = await enforceRateLimit(db, userId, FN);
    if (rateLimitErr) return rateLimitErr;

    const { action, query, id, page: pageParam } = await req.json();

    // ── SEARCH ───────────────────────────────────────────────────────────────
    if (action === "search") {
      if (!query?.trim()) throw new Error("query is required");
      const page = typeof pageParam === "number" && pageParam >= 1 ? pageParam : 1;
      log(FN, "search", { query, page });

      const res = await fetch(
        `${BASE_URL}/v1/plants/varieties/search?page=${page}&q=${encodeURIComponent(query)}&sortOrder=asc`,
        { headers: verdantlyHeaders(apiKey) },
      );

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Verdantly search failed (${res.status}): ${body.slice(0, 200)}`);
      }

      const data = await res.json();
      const items: any[] = data?.data ?? [];
      const results = items.map(mapToSearchResult);

      // Verdantly returns pagination info under `meta.pages`
      const meta = data?.meta ?? {};
      const pag  = data?.pagination ?? {};
      const totalPages: number | null =
        meta.pages ?? pag.totalPages ?? pag.total_pages ?? pag.lastPage ?? null;
      const hasMore = totalPages != null ? page < totalPages : results.length >= 10;
      const nextPage = page + 1;

      log(FN, "search_result", { query, page, count: results.length, hasMore });
      return new Response(JSON.stringify({ results, hasMore, nextPage }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── DETAILS ──────────────────────────────────────────────────────────────
    if (action === "details") {
      if (!id) throw new Error("id is required");
      log(FN, "details", { id });

      // Check cache first
      const { data: cached } = await db
        .from("verdantly_cache")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (cached) {
        const ageDays = (Date.now() - new Date(cached.updated_at).getTime()) / 86_400_000;
        if (ageDays < CACHE_TTL_DAYS) {
          log(FN, "cache_hit", { id });
          return new Response(JSON.stringify(mapToPlantDetails(cached.raw_data)), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      // Fetch from Verdantly
      const res = await fetch(
        `${BASE_URL}/v1/plants/varieties/${id}`,
        { headers: verdantlyHeaders(apiKey) },
      );

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Verdantly details failed (${res.status}): ${body.slice(0, 200)}`);
      }

      const raw = await res.json();

      // Upsert cache (fire-and-forget)
      db.from("verdantly_cache").upsert({
        id,
        raw_data: raw,
        updated_at: new Date().toISOString(),
      }).then(() => log(FN, "cache_saved", { id }));

      log(FN, "details_result", { id });

      return new Response(JSON.stringify(mapToPlantDetails(raw)), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (err: any) {
    logError(FN, "error", { error: err.message });
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
