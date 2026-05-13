import { supabase } from "./supabase";
import type { PlantDetails, ProviderSearchResult } from "./verdantlyUtils";

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verdantly-search`;

async function callEdgeFunction(body: Record<string, unknown>): Promise<any> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token ?? "";

  const res = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `Verdantly request failed (${res.status})`);
  }
  return res.json();
}

// Forward-direction mappings: Perenual internal values → Verdantly API params
const PERENUAL_WATERING_TO_VERDANTLY: Record<string, string> = {
  frequent: "High",
  average:  "Moderate",
  minimum:  "Low",
};

const PERENUAL_SUNLIGHT_TO_VERDANTLY: Record<string, string> = {
  full_sun:   "Full sun",
  part_shade: "Partial shade",
  deep_shade: "Full shade",
};

const PERENUAL_CYCLE_TO_VERDANTLY: Record<string, string> = {
  annual:    "Annual",
  perennial: "Perennial",
  biennial:  "Biennial",
};

export interface VerdantlySearchFilters {
  cycle?: string[];
  watering?: string[];
  sunlight?: string[];
  edible?: 0 | 1;
  hardinessMin?: number;
}

export const VerdantlyService = {
  searchPlants: async (
    query: string,
    page = 1,
    filters?: VerdantlySearchFilters,
  ): Promise<{ results: ProviderSearchResult[]; hasMore: boolean; nextPage: number }> => {
    const cycles    = filters?.cycle?.length
      ? filters.cycle.map((c) => PERENUAL_CYCLE_TO_VERDANTLY[c.toLowerCase()]).filter(Boolean)
      : [];
    const waterings = filters?.watering?.length
      ? filters.watering.map((w) => PERENUAL_WATERING_TO_VERDANTLY[w.toLowerCase()]).filter(Boolean)
      : [];
    const sunlights = filters?.sunlight?.length
      ? filters.sunlight.map((s) => PERENUAL_SUNLIGHT_TO_VERDANTLY[s.toLowerCase()]).filter(Boolean)
      : [];

    const hasVerdantlyFilter =
      cycles.length > 0 ||
      waterings.length > 0 ||
      sunlights.length > 0 ||
      filters?.edible !== undefined ||
      filters?.hardinessMin !== undefined;

    if (!hasVerdantlyFilter) {
      const data = await callEdgeFunction({ action: "search", query, page });
      return {
        results:  (data.results ?? []) as ProviderSearchResult[],
        hasMore:  data.hasMore  ?? false,
        nextPage: data.nextPage ?? page + 1,
      };
    }

    // Build the cartesian product of filter values (one API call per combination)
    const cycleValues    = cycles.length    > 0 ? cycles    : [undefined];
    const wateringValues = waterings.length > 0 ? waterings : [undefined];
    const sunlightValues = sunlights.length > 0 ? sunlights : [undefined];

    const bodies: Record<string, unknown>[] = [];
    for (const duration of cycleValues) {
      for (const waterRequirement of wateringValues) {
        for (const sunlightRequirement of sunlightValues) {
          const body: Record<string, unknown> = { action: "filter", query, page };
          if (duration)             body.duration = duration;
          if (waterRequirement)     body.waterRequirement = waterRequirement;
          if (sunlightRequirement)  body.sunlightRequirement = sunlightRequirement;
          if (filters?.edible === 1)  body.edible = true;
          else if (filters?.edible === 0) body.edible = false;
          if (filters?.hardinessMin !== undefined) body.growingZone = filters.hardinessMin;
          bodies.push(body);
        }
      }
    }

    // Single combination — call directly so pagination (hasMore / nextPage) flows through
    if (bodies.length === 1) {
      const data = await callEdgeFunction(bodies[0]);
      return {
        results:  (data.results ?? []) as ProviderSearchResult[],
        hasMore:  data.hasMore  ?? false,
        nextPage: data.nextPage ?? page + 1,
      };
    }

    // Multiple combinations — parallel calls, merge results, no cross-combo pagination
    const batches = await Promise.all(
      bodies.map((body) =>
        callEdgeFunction(body)
          .then((d) => (d.results ?? []) as ProviderSearchResult[])
          .catch(() => []),
      ),
    );
    const seen = new Set<string>();
    const merged: ProviderSearchResult[] = [];
    for (const batch of batches) {
      for (const r of batch) {
        const key = String(r.id);
        if (!seen.has(key)) { seen.add(key); merged.push(r); }
      }
    }
    return { results: merged, hasMore: false, nextPage: page + 1 };
  },

  getPlantDetails: async (verdantlyId: string): Promise<PlantDetails> => {
    const data = await callEdgeFunction({ action: "details", id: verdantlyId });
    return data as PlantDetails;
  },
};
