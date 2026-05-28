import { useEffect, useState } from "react";
import {
  ensureCataloguePlantFromSearchResult,
  type CataloguePlant,
} from "../lib/plantCatalogue";
import type { ProviderSearchResult } from "../lib/verdantlyUtils";
import { Logger } from "../lib/errorHandler";

/**
 * Resolve a search result into a catalogue plant for the detail tabs.
 *
 * Renders an instant placeholder (hero + empty care fields) from the
 * search-result data, then clones the plant into the catalogue in the
 * background via `ensureCataloguePlantFromSearchResult` and swaps in the
 * real row (with a positive `plantId`) once it resolves. The Grow Guide /
 * Companions / Light tabs gate their content on `plant.plantId > 0`.
 *
 * Mirrors the instant-preview path in `library/PlantPreview.tsx` so the
 * full-care modal and the full-care screen behave identically.
 */
export function useCataloguePlantFromResult(
  result: ProviderSearchResult | null,
  homeId: string,
): { plant: CataloguePlant | null; ensuring: boolean; error: string | null } {
  const [plant, setPlant] = useState<CataloguePlant | null>(null);
  const [ensuring, setEnsuring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!result) {
      setPlant(null);
      setEnsuring(false);
      setError(null);
      return;
    }

    const source: CataloguePlant["source"] =
      result._provider === "ai"
        ? "ai"
        : result._provider === "verdantly"
          ? "verdantly"
          : "api";

    const placeholder: CataloguePlant = {
      plantId: -1, // sentinel — tabs wait until this becomes a real id
      source,
      details: {
        common_name: result.common_name,
        scientific_name: result.scientific_name ?? [],
        other_names: [],
        family: null,
        plant_type: null,
        cycle: null,
        image_url: result.thumbnail_url ?? null,
        thumbnail_url: result.thumbnail_url ?? null,
        watering: null,
        watering_benchmark: null,
        watering_min_days: null,
        watering_max_days: null,
        sunlight: [],
        care_level: null,
        hardiness_min: null,
        hardiness_max: null,
        is_edible: false,
        is_toxic_pets: false,
        is_toxic_humans: false,
        attracts: [],
        description: null,
        maintenance: null,
        growth_rate: null,
        growth_habit: null,
        drought_tolerant: false,
        salt_tolerant: false,
        thorny: false,
        invasive: false,
        tropical: false,
        indoor: false,
        pest_susceptibility: [],
        flowers: false,
        cones: false,
        fruits: false,
        edible_leaf: false,
        cuisine: false,
        medicinal: false,
        leaf: false,
        flowering_season: null,
        harvest_season: null,
        pruning_month: [],
        propagation: [],
        perenual_id: result.perenual_id ?? null,
        verdantly_id: result.verdantly_id ?? null,
        source,
      },
      fromCache: false,
    };

    setPlant(placeholder);
    setEnsuring(true);
    setError(null);

    let cancelled = false;
    ensureCataloguePlantFromSearchResult(result, { homeId })
      .then((real) => {
        if (!cancelled) setPlant(real);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        Logger.error("useCataloguePlantFromResult ensure failed", err, {
          provider: result._provider,
          name: result.common_name,
        });
        setError(
          err instanceof Error ? err.message : "Couldn't load the full plant details.",
        );
      })
      .finally(() => {
        if (!cancelled) setEnsuring(false);
      });

    return () => {
      cancelled = true;
    };
    // Re-run only when the result identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.id, result?._provider, homeId]);

  return { plant, ensuring, error };
}
