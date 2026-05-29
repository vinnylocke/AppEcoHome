// Shared library-first plant resolution — turns a plant *name* into care
// details (for the ⓘ info pills) + a ProviderSearchResult (to open the full
// care guide / clone into the catalogue). Resolution order keeps AI last:
//   1. plant_library  — free, no AI; clone via plant_library_id.
//   2. provider DB     — Verdantly (free) → Perenual; clone from the provider.
//   3. miss            — AI-by-name; Gemini only runs if the result is opened.
//
// Single source of truth shared by CompanionPlantsTab and the Plant Doctor
// Multi-ID result card. Never throws — a total failure resolves to the AI
// result with null details.

import { searchLibrary } from "./unifiedPlantSearch";
import { searchAllProviders, getProviderPlantDetails } from "./plantProvider";
import { libraryRowToPlantDetails } from "./plantCatalogue";
import type { PlantDetails, ProviderSearchResult } from "./verdantlyUtils";

export interface ResolvedPlantInfo {
  /** Care details for the info pills/description; null when not in library/provider. */
  details: PlantDetails | null;
  /** Result to hand the full care guide (library clone, provider clone, or AI-by-name). */
  result: ProviderSearchResult;
}

export async function resolvePlantInfo(
  name: string,
  scientificName?: string | null,
): Promise<ResolvedPlantInfo> {
  const sci = scientificName ? [scientificName] : [];
  const aiResult = {
    id: `ai-${name}`,
    common_name: name,
    scientific_name: sci,
    thumbnail_url: null,
    _provider: "ai",
  } as ProviderSearchResult;

  // 1) Library-first — free, no AI. Resilient to RPC errors (fall through).
  let libRow: { id: number } | null = null;
  try {
    const { rows } = await searchLibrary(name, { pageSize: 1 });
    libRow = (rows[0] as { id: number } | undefined) ?? null;
  } catch {
    /* fall through to provider/AI */
  }
  if (libRow) {
    const details = libraryRowToPlantDetails(libRow);
    return {
      details,
      result: {
        id: `library-${libRow.id}`,
        common_name: name,
        scientific_name: sci,
        thumbnail_url: details.thumbnail_url ?? null,
        _provider: "ai",
        plant_library_id: libRow.id,
      } as ProviderSearchResult,
    };
  }

  // 2) Provider DB (Verdantly/Perenual) — still no AI. Prefer the free Verdantly hit.
  const hits = await searchAllProviders(name, undefined, ["perenual", "verdantly"]).catch(
    () => [] as ProviderSearchResult[],
  );
  const hit = hits.find((h) => h._provider === "verdantly") ?? hits[0] ?? null;
  if (hit) {
    const details = await getProviderPlantDetails({
      source: hit._provider === "verdantly" ? "verdantly" : "api",
      perenual_id: hit._provider === "verdantly" ? null : (hit.perenual_id ?? (Number((hit as any).id) || null)),
      verdantly_id: hit._provider === "verdantly" ? (hit.verdantly_id ?? (hit as any).id ?? null) : null,
    }).catch(() => null);
    if (details) return { details, result: hit };
  }

  // 3) Nothing in library or provider DBs — AI only when the result is opened.
  return { details: null, result: aiResult };
}
