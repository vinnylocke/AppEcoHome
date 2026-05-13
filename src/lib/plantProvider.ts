import { supabase } from "./supabase";
import { PerenualService } from "./perenualService";
import { VerdantlyService } from "./verdantlyService";
import type { PlantDetails, ProviderSearchResult } from "./verdantlyUtils";

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
  /** Restrict to specific providers; defaults to all enabled ones. */
  only?: ("perenual" | "verdantly")[],
): Promise<ProviderSearchResult[]> {
  const enabled = await getEnabledProviders();
  const active = only ? enabled.filter((p) => only.includes(p as any)) : enabled;

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
      VerdantlyService.searchPlants(query).catch(() => [] as ProviderSearchResult[]),
    );
  }

  const batches = await Promise.all(calls);

  // Flatten — each provider's results keep their own identity.
  // We intentionally show both if both return the same plant name.
  return batches.flat();
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
