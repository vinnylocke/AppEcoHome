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

function mapToPlantDetails(v: any) {
  const waterReq = v.growingRequirements?.waterRequirement ?? null;
  const waterDays = waterReq ? (WATERING_DAYS[waterReq] ?? null) : null;
  const sunReq = v.growingRequirements?.sunlightRequirement ?? null;
  const sunlight = sunReq ? (SUNLIGHT_MAP[sunReq] ?? []) : [];

  return {
    common_name:           v.name ?? "Unknown",
    scientific_name:       v.species?.scientificName ? [v.species.scientificName] : [],
    other_names:           [],
    family:                v.species?.taxonomy?.family ?? null,
    plant_type:            v.category ?? null,
    cycle:                 null,
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
    attracts:              [],
    description:           v.highlights?.join(" ") ?? v.description ?? null,
    maintenance:           v.careInstructions?.pruningInstructions ?? null,
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
    flowering_season:      v.lifecycleMilestones?.bloomDate ?? null,
    harvest_season:        null,
    pruning_month:         [],
    propagation:           [],
    verdantly_id:          v.id ?? null,
    perenual_id:           null,
    days_to_harvest_min:   v.lifecycleMilestones?.daysToHarvestMin ?? null,
    days_to_harvest_max:   v.lifecycleMilestones?.daysToHarvestMax ?? null,
    soil_ph_min:           v.ecology?.soilPhMin ?? null,
    soil_ph_max:           v.ecology?.soilPhMax ?? null,
    planting_instructions: v.careInstructions?.plantingInstructions ?? null,
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

      // Derive hasMore from whatever pagination shape the API returns
      const pagination = data?.pagination ?? data?.meta ?? {};
      const totalPages: number | null =
        pagination.totalPages ?? pagination.total_pages ?? pagination.lastPage ?? null;
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
