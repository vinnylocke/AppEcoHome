import { supabase } from "./supabase";
import { PerenualService } from "./perenualService";
import { VerdantlyService } from "./verdantlyService";
import { PlantDoctorService } from "../services/plantDoctorService";
import type { PlantDetails, ProviderSearchResult } from "./verdantlyUtils";

// ─── AI care guide adapter ────────────────────────────────────────────────────

export function careGuideToPlantDetails(guide: any, name: string): PlantDetails {
  const flowering = guide.flowering_season;
  const harvest = guide.harvest_season;
  return {
    common_name:         guide.common_name ?? name,
    scientific_name:     Array.isArray(guide.scientific_name)
                           ? guide.scientific_name
                           : guide.scientific_name ? [guide.scientific_name] : [],
    other_names:         [],
    family:              null,
    plant_type:          guide.plant_type ?? null,
    cycle:               guide.cycle ?? null,
    image_url:           guide.thumbnail_url ?? null,
    thumbnail_url:       guide.thumbnail_url ?? null,
    watering:            guide.watering ?? null,
    watering_benchmark:  null,
    watering_min_days:   guide.watering_min_days ?? null,
    watering_max_days:   guide.watering_max_days ?? null,
    sunlight:            guide.sunlight ?? [],
    care_level:          guide.care_level ?? null,
    hardiness_min:       null,
    hardiness_max:       null,
    is_edible:           guide.is_edible ?? false,
    is_toxic_pets:       guide.is_toxic_pets ?? false,
    is_toxic_humans:     guide.is_toxic_humans ?? false,
    attracts:            guide.attracts ?? [],
    description:         guide.description ?? null,
    maintenance:         guide.maintenance ?? null,
    growth_rate:         guide.growth_rate ?? null,
    growth_habit:        null,
    drought_tolerant:    guide.drought_tolerant ?? false,
    salt_tolerant:       false,
    thorny:              false,
    invasive:            false,
    tropical:            guide.tropical ?? false,
    indoor:              guide.indoor ?? false,
    pest_susceptibility: [],
    flowers:             false,
    cones:               false,
    fruits:              false,
    edible_leaf:         false,
    cuisine:             guide.cuisine ?? false,
    medicinal:           guide.medicinal ?? false,
    leaf:                false,
    flowering_season:    Array.isArray(flowering) ? flowering.join(", ") : flowering ?? null,
    harvest_season:      Array.isArray(harvest) ? harvest.join(", ") : harvest ?? null,
    pruning_month:       guide.pruning_month ?? [],
    propagation:         guide.propagation ?? [],
    source:              "ai",
  };
}

// ─── Provider config ──────────────────────────────────────────────────────────

async function getEnabledProviders(): Promise<string[]> {
  const { data } = await supabase
    .from("app_config")
    .select("value")
    .eq("key", "plant_providers")
    .maybeSingle();
  return (data?.value?.enabled as string[]) ?? ["perenual"];
}

// ─── Search ───────────────────────────────────────────────────────────────────

// Convert a raw Perenual search result to the shared ProviderSearchResult shape.
function fromPerenualSearchItem(item: any): ProviderSearchResult {
  return {
    id:              item.id,
    common_name:     item.common_name ?? "Unknown",
    scientific_name: Array.isArray(item.scientific_name) ? item.scientific_name : (item.scientific_name ? [item.scientific_name] : []),
    thumbnail_url:   item.default_image?.thumbnail ?? null,
    _provider:       "perenual",
    perenual_id:     item.id,
  };
}

export async function searchAllProviders(
  query: string,
  filters?: Parameters<typeof PerenualService.searchPlants>[1],
  /** Restrict to specific providers; defaults to all enabled ones (plus AI when opted in). */
  only?: ("perenual" | "verdantly" | "ai")[],
  /** When set, fans out to the AI provider too. Defaults to false to keep the call cheap. */
  options?: { includeAi?: boolean; homeId?: string },
): Promise<ProviderSearchResult[]> {
  const enabled = await getEnabledProviders();
  const active = only ? enabled.filter((p) => only.includes(p as any)) : enabled;
  const wantAi = options?.includeAi || (only?.includes("ai") ?? false);

  const calls: Promise<ProviderSearchResult[]>[] = [];

  if (active.includes("perenual")) {
    calls.push(
      PerenualService.searchPlants(query, filters)
        .then((items) => items.map(fromPerenualSearchItem))
        .catch(() => [] as ProviderSearchResult[]),
    );
  }

  if (active.includes("verdantly")) {
    calls.push(
      VerdantlyService.searchPlants(query, 1, filters ? {
        cycle:        filters.cycle,
        watering:     filters.watering,
        sunlight:     filters.sunlight,
        edible:       filters.edible as 0 | 1 | undefined,
        hardinessMin: filters.hardinessMin,
      } : undefined)
        .then(({ results }) => results)
        .catch(() => [] as ProviderSearchResult[]),
    );
  }

  if (wantAi) {
    calls.push(
      PlantDoctorService.searchPlantsText(query, options?.homeId ? { homeId: options.homeId } : undefined)
        .then((d) => (d.matches || []).slice(0, 5).map<ProviderSearchResult>((name, idx) => {
          const hit = d.hits?.[name];
          return {
            id:              `ai-${idx}-${name}`,
            common_name:     name,
            scientific_name: [],
            thumbnail_url:   null,
            _provider:       "ai",
            ...(hit && {
              catalogue_hit: {
                hit_kind:               hit.hit_kind,
                plant_id:               hit.plant_id,
                freshness_version:      hit.freshness_version,
                last_care_generated_at: hit.last_care_generated_at,
                overridden_fields:      hit.overridden_fields,
              },
            }),
          };
        }))
        .catch(() => [] as ProviderSearchResult[]),
    );
  }

  const batches = await Promise.all(calls);

  // Flatten — each provider's results keep their own identity.
  // We intentionally show both if both return the same plant name.
  return batches.flat();
}

// ─── Paged search (2026-07-22) ───────────────────────────────────────────────
// Both providers page their catalogues (Verdantly especially), but the classic
// searchAllProviders only ever fetched page 1. This variant carries per-provider
// cursors so the search UI can load further pages seamlessly as the user
// scrolls, instead of eagerly burning metered API calls on results most
// searches never reach.

export interface ProviderCursor {
  perenual: { nextPage: number; hasMore: boolean };
  verdantly: { nextPage: number; hasMore: boolean };
}

export function cursorHasMore(cursor: ProviderCursor | null): boolean {
  return !!cursor && (cursor.perenual.hasMore || cursor.verdantly.hasMore);
}

export async function searchAllProvidersPaged(
  query: string,
  /** null = first page (also runs the AI branch when requested). */
  cursor: ProviderCursor | null,
  only?: ("perenual" | "verdantly" | "ai")[],
  options?: { includeAi?: boolean; homeId?: string },
): Promise<{ results: ProviderSearchResult[]; cursor: ProviderCursor }> {
  const enabled = await getEnabledProviders();
  const active = only ? enabled.filter((p) => only.includes(p as "perenual" | "verdantly" | "ai")) : enabled;
  const firstPage = cursor === null;
  const wantAi = firstPage && (options?.includeAi || (only?.includes("ai") ?? false));

  const next: ProviderCursor = {
    perenual: cursor?.perenual ?? { nextPage: 1, hasMore: true },
    verdantly: cursor?.verdantly ?? { nextPage: 1, hasMore: true },
  };

  const calls: Promise<ProviderSearchResult[]>[] = [];

  if (active.includes("perenual") && next.perenual.hasMore) {
    const page = next.perenual.nextPage;
    calls.push(
      PerenualService.searchPlantsPaged(query, page)
        .then(({ data, hasMore, nextPage }) => {
          next.perenual = { nextPage, hasMore };
          return data.map(fromPerenualSearchItem);
        })
        .catch(() => {
          next.perenual = { nextPage: page, hasMore: false };
          return [] as ProviderSearchResult[];
        }),
    );
  } else if (!active.includes("perenual")) {
    next.perenual = { nextPage: 1, hasMore: false };
  }

  if (active.includes("verdantly") && next.verdantly.hasMore) {
    const page = next.verdantly.nextPage;
    calls.push(
      VerdantlyService.searchPlants(query, page)
        .then(({ results, hasMore, nextPage }) => {
          next.verdantly = { nextPage, hasMore };
          return results;
        })
        .catch(() => {
          next.verdantly = { nextPage: page, hasMore: false };
          return [] as ProviderSearchResult[];
        }),
    );
  } else if (!active.includes("verdantly")) {
    next.verdantly = { nextPage: 1, hasMore: false };
  }

  if (wantAi) {
    calls.push(
      PlantDoctorService.searchPlantsText(query, options?.homeId ? { homeId: options.homeId } : undefined)
        .then((d) => (d.matches || []).slice(0, 5).map<ProviderSearchResult>((name, idx) => {
          const hit = d.hits?.[name];
          return {
            id:              `ai-${idx}-${name}`,
            common_name:     name,
            scientific_name: [],
            thumbnail_url:   null,
            _provider:       "ai",
            ...(hit && {
              catalogue_hit: {
                hit_kind:               hit.hit_kind,
                plant_id:               hit.plant_id,
                freshness_version:      hit.freshness_version,
                last_care_generated_at: hit.last_care_generated_at,
                overridden_fields:      hit.overridden_fields,
              },
            }),
          };
        }))
        .catch(() => [] as ProviderSearchResult[]),
    );
  }

  const batches = await Promise.all(calls);
  return { results: batches.flat(), cursor: next };
}

// ─── Details ─────────────────────────────────────────────────────────────────

export async function getProviderPlantDetails(plant: {
  source: string;
  perenual_id?: number | null;
  verdantly_id?: string | null;
}): Promise<PlantDetails> {
  if (plant.source === "verdantly" && plant.verdantly_id) {
    return VerdantlyService.getPlantDetails(plant.verdantly_id);
  }

  if ((plant.source === "api" || plant.source === "perenual") && plant.perenual_id) {
    // PerenualService returns a compatible shape; cast to PlantDetails
    return PerenualService.getPlantDetails(plant.perenual_id) as unknown as PlantDetails;
  }

  throw new Error("Cannot load plant details: unknown source or missing ID");
}
