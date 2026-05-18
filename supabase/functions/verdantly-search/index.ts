import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { log, error as logError } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import { requireAuth } from "../_shared/requireAuth.ts";
import { enforceRateLimit } from "../_shared/rateLimit.ts";
import { getCached, setCached, cacheKey } from "../_shared/aiCache.ts";

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
// v2 API returns lowercase water/sunlight values

const WATERING_DAYS: Record<string, { min: number; max: number; label: string }> = {
  "low":      { min: 14, max: 21, label: "Minimum" },
  "moderate": { min: 7,  max: 14, label: "Average"  },
  "high":     { min: 2,  max: 7,  label: "Frequent" },
};

const SUNLIGHT_MAP: Record<string, string[]> = {
  "full sun":                  ["full_sun"],
  "partial shade":             ["part_shade"],
  "full shade":                ["deep_shade"],
  "full sun to partial shade": ["full_sun", "part_shade"],
  "partial to full shade":     ["part_shade", "deep_shade"],
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

// v2: planting instructions live at v.care.planting (same sub-fields as v1)
function buildPlantingInstructions(planting: any): string | null {
  if (!planting) return null;
  if (typeof planting === "string") return planting;
  const parts: string[] = [];
  if (planting.startIndoors)       parts.push(`Start indoors: ${planting.startIndoors}`);
  if (planting.transplantOutdoors) parts.push(`Transplant outdoors: ${planting.transplantOutdoors}`);
  if (planting.directSow)          parts.push(`Direct sow: ${planting.directSow}`);
  return parts.length > 0 ? parts.join("\n") : null;
}

// v2: pruning/harvesting live at v.care.pruning / v.care.harvesting
function buildMaintenance(care: any): string | null {
  if (!care) return null;
  const parts: string[] = [];
  if (care.pruning)    parts.push(care.pruning);
  if (care.harvesting) parts.push(care.harvesting);
  return parts.length > 0 ? parts.join("\n\n") : null;
}

// v2: ecology lives at v.distribution.ecology
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

function buildMetadata(v: any): Record<string, any> | null {
  const meta: Record<string, any> = {};
  const lc      = v.lifecycle ?? {};
  const gr      = v.growing ?? {};
  const planting = v.care?.planting;

  // Harvest timing
  if (lc.daysToHarvestMin != null) meta.harvest_days_min = lc.daysToHarvestMin;
  if (lc.daysToHarvestMax != null) meta.harvest_days_max = lc.daysToHarvestMax;

  // Structured planting instructions
  if (planting && typeof planting === "object") {
    const methods: Record<string, string> = {};
    if (planting.startIndoors)       methods.start_indoors = planting.startIndoors;
    if (planting.transplantOutdoors) methods.transplant_outdoors = planting.transplantOutdoors;
    if (planting.directSow)          methods.direct_sow = planting.directSow;
    if (Object.keys(methods).length > 0) meta.planting_methods = methods;
  }

  // Growing context — v2 spacing is already a number, not a string
  if (gr.spacing != null)      meta.spacing_inches  = gr.spacing;
  if (gr.frostTolerance)       meta.frost_tolerance = gr.frostTolerance;
  if (gr.soil)                 meta.soil_preference = gr.soil;
  if (v.care?.overview)        meta.care_notes      = v.care.overview;

  // Additional AI context
  if (v.pestAndDiseaseRisks) meta.pest_disease_info = v.pestAndDiseaseRisks;
  if (v.commonUses)          meta.common_uses       = v.commonUses;
  if (v.history)             meta.history           = v.history;

  return Object.keys(meta).length > 0 ? meta : null;
}

function mapToPlantDetails(v: any) {
  const waterReq  = v.growing?.water ?? null;
  const waterDays = waterReq ? (WATERING_DAYS[waterReq.toLowerCase()] ?? null) : null;
  const sunReq    = v.growing?.sunlight ?? null;
  const sunlight  = sunReq ? (SUNLIGHT_MAP[sunReq.toLowerCase()] ?? []) : [];
  const lc        = v.lifecycle ?? {};
  const ecology   = v.distribution?.ecology ?? {};

  return {
    common_name:           v.name ?? "Unknown",
    scientific_name:       v.scientificName ? [v.scientificName] : [],
    other_names:           [],
    family:                v.taxonomy?.family ?? null,
    plant_type:            v.classification?.category ?? null,
    cycle:                 lc.duration ?? null,
    image_url:             v.imageUrl ?? null,
    thumbnail_url:         v.imageUrl ?? null,
    watering:              waterDays?.label ?? null,
    watering_benchmark:    null,
    watering_min_days:     waterDays?.min ?? null,
    watering_max_days:     waterDays?.max ?? null,
    sunlight,
    care_level:            null,
    hardiness_min:         v.growing?.hardinessZone?.min ?? null,
    hardiness_max:         v.growing?.hardinessZone?.max ?? null,
    is_edible:             ecology.isEdible ?? false,
    is_toxic_pets:         !!(v.safety?.toxicity?.dogs?.level || v.safety?.toxicity?.cats?.level || v.safety?.toxicity?.horses?.level),
    is_toxic_humans:       !!(v.safety?.toxicity?.humans?.level),
    attracts:              buildAttracts(ecology),
    description:           buildDescription(v),
    maintenance:           buildMaintenance(v.care),
    growth_rate:           null,
    growth_habit:          v.growing?.growthHabit ?? null,
    drought_tolerant:      ecology.droughtTolerant ?? false,
    salt_tolerant:         false,
    thorny:                false,
    invasive:              ecology.isInvasive ?? false,
    tropical:              false,
    indoor:                false,
    pest_susceptibility:   [],
    flowers:               false,
    cones:                 false,
    fruits:                !!(ecology.isEdible),
    edible_leaf:           false,
    cuisine:               !!(ecology.isEdible),
    medicinal:             false,
    leaf:                  true,
    flowering_season:      lc.avgFirstBloomDate ?? null,
    harvest_season:        lc.firstHarvestDate ?? lc.lastHarvestDate ?? null,
    pruning_month:         [],
    propagation:           [],
    verdantly_id:          v.id ?? null,
    perenual_id:           null,
    days_to_harvest_min:   lc.daysToHarvestMin ?? null,
    days_to_harvest_max:   lc.daysToHarvestMax ?? null,
    soil_ph_min:           v.growing?.soilPhMin ?? null,
    soil_ph_max:           v.growing?.soilPhMax ?? null,
    planting_instructions: buildPlantingInstructions(v.care?.planting),
    plant_metadata:        buildMetadata(v),
    source:                "verdantly" as const,
  };
}

function mapToSearchResult(v: any) {
  return {
    id:              v.id,
    common_name:     v.name ?? "Unknown",
    scientific_name: v.scientificName ? [v.scientificName] : [],
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

    const {
      action, query, id, page: pageParam,
      waterRequirement, sunlightRequirement, edible, growingZone,
    } = await req.json();

    // ── SEARCH ───────────────────────────────────────────────────────────────
    if (action === "search") {
      if (!query?.trim()) throw new Error("query is required");
      const page = typeof pageParam === "number" && pageParam >= 1 ? pageParam : 1;
      log(FN, "search", { query, page });

      const searchCacheKey = cacheKey("verdantly_search", query.trim(), String(page));
      const cachedSearch = await getCached<{ results: unknown[]; hasMore: boolean; nextPage: number }>(db, searchCacheKey);
      if (cachedSearch) {
        log(FN, "search_cache_hit", { query, page });
        return new Response(JSON.stringify(cachedSearch), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const res = await fetch(
        `${BASE_URL}/v2/plants/varieties/search?page=${page}&q=${encodeURIComponent(query)}&sortOrder=asc`,
        { headers: verdantlyHeaders(apiKey), signal: AbortSignal.timeout(12_000) },
      );

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Verdantly search failed (${res.status}): ${body.slice(0, 200)}`);
      }

      const data = await res.json();
      const items: any[] = data?.data ?? [];
      const results = items.map(mapToSearchResult);

      const meta = data?.meta ?? {};
      const totalPages: number | null = meta.pages ?? null;
      const hasMore = totalPages != null ? page < totalPages : results.length >= 10;
      const nextPage = page + 1;

      const searchPayload = { results, hasMore, nextPage };
      if (results.length > 0) {
        await setCached(db, searchCacheKey, FN, searchPayload, 1);
      }
      log(FN, "search_result", { query, page, count: results.length, hasMore });
      return new Response(JSON.stringify(searchPayload), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── DETAILS ──────────────────────────────────────────────────────────────
    if (action === "details") {
      if (!id) throw new Error("id is required");
      log(FN, "details", { id });

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

      const res = await fetch(
        `${BASE_URL}/v2/plants/varieties/${id}`,
        { headers: verdantlyHeaders(apiKey), signal: AbortSignal.timeout(12_000) },
      );

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Verdantly details failed (${res.status}): ${body.slice(0, 200)}`);
      }

      // v2 wraps the plant object in { data: {...}, meta: {...} }
      const rawResponse = await res.json();
      const raw = rawResponse.data ?? rawResponse;

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

    // ── FILTER ───────────────────────────────────────────────────────────────
    // v2 merged filtering into /v2/plants/varieties/search — no separate filter endpoint
    if (action === "filter") {
      const filterPage = typeof pageParam === "number" && pageParam >= 1 ? pageParam : 1;

      const filterSig = [
        query?.trim() || "",
        waterRequirement    ? `water:${waterRequirement}`  : null,
        sunlightRequirement ? `sun:${sunlightRequirement}` : null,
        edible !== undefined     ? `edible:${edible}`      : null,
        growingZone !== undefined ? `zone:${growingZone}`  : null,
      ].filter(Boolean).join("|") || "none";
      const filterCacheKey = cacheKey("verdantly_filter", filterSig, String(filterPage));
      const cachedFilter = await getCached<{ results: unknown[]; hasMore: boolean; nextPage: number }>(db, filterCacheKey);
      if (cachedFilter) {
        log(FN, "filter_cache_hit", { filterSig, filterPage });
        return new Response(JSON.stringify(cachedFilter), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const params = new URLSearchParams({ page: String(filterPage), perPage: "10" });
      if (query?.trim())                params.set("q",                  query.trim());
      if (waterRequirement)             params.set("waterRequirement",    String(waterRequirement));
      if (sunlightRequirement)          params.set("sunlightRequirement", String(sunlightRequirement));
      if (edible !== undefined)         params.set("isEdible",            String(edible));
      if (growingZone !== undefined)    params.set("growingZone",         String(growingZone));

      log(FN, "filter", { query, waterRequirement, sunlightRequirement, edible, growingZone, filterPage });

      const filterRes = await fetch(`${BASE_URL}/v2/plants/varieties/search?${params}`, {
        headers: verdantlyHeaders(apiKey),
        signal: AbortSignal.timeout(12_000),
      });
      if (!filterRes.ok) {
        const errBody = await filterRes.text();
        throw new Error(`Verdantly filter failed (${filterRes.status}): ${errBody.slice(0, 200)}`);
      }

      const filterData = await filterRes.json();
      const filterItems: any[] = filterData?.data ?? [];
      const filterResults = filterItems.map(mapToSearchResult);
      const filterTotalPages: number | null = filterData?.meta?.pages ?? null;
      const filterHasMore = filterTotalPages != null ? filterPage < filterTotalPages : filterResults.length >= 10;

      const filterPayload = { results: filterResults, hasMore: filterHasMore, nextPage: filterPage + 1 };
      await setCached(db, filterCacheKey, FN, filterPayload, 1);
      log(FN, "filter_result", { filterPage, count: filterResults.length, filterHasMore });
      return new Response(JSON.stringify(filterPayload), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (err: any) {
    logError(FN, "error", { error: err.message });
    await captureException(FN, err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
