import React, { useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import PlantSearch from "../shared/PlantSearch";
import type { PlantSelection } from "../../lib/unifiedPlantSearch";
import type { ProviderSearchResult } from "../../lib/verdantlyUtils";

interface Props {
  homeId: string;
  aiEnabled: boolean;
}

/**
 * Library search tab — now powered by the shared, library-first
 * <PlantSearch> component. Tapping a result navigates to the plant
 * preview; the preview pipeline (`ensureCataloguePlantFromSearchResult`)
 * already knows how to clone a `plant_library` row into the catalogue
 * via `plant_library_id`, so library hits flow straight through.
 *
 * The last query is mirrored to `?q=` + sessionStorage so Back from a
 * preview restores it (PlantSearch re-runs the fast local search).
 */
export default function LibrarySearchTab({ homeId, aiEnabled }: Props) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialQuery =
    searchParams.get("q") ?? sessionStorage.getItem("library:lastQuery") ?? "";

  const handleQueryChange = useCallback(
    (q: string) => {
      const trimmed = q.trim();
      if (trimmed) {
        sessionStorage.setItem("library:lastQuery", trimmed);
        setSearchParams({ q: trimmed }, { replace: true });
      } else {
        sessionStorage.removeItem("library:lastQuery");
        setSearchParams({}, { replace: true });
      }
    },
    [setSearchParams],
  );

  const handleSelect = useCallback(
    (sel: PlantSelection) => {
      let result: ProviderSearchResult;
      if (sel.source === "library") {
        // Route library hits through the AI provider path carrying
        // plant_library_id — the preview clones the library row into the
        // catalogue without paying Gemini.
        result = {
          id: `library-${sel.library_id}`,
          common_name: sel.common_name,
          scientific_name: sel.scientific_name ? [sel.scientific_name] : [],
          thumbnail_url: sel.thumbnail_url ?? null,
          _provider: "ai",
          plant_library_id: sel.library_id,
        };
      } else if (sel.raw) {
        // External (Perenual / Verdantly / AI) results carry their original
        // ProviderSearchResult in `raw` — pass it straight through.
        result = sel.raw as ProviderSearchResult;
      } else {
        result = {
          id: `ai-${sel.common_name}`,
          common_name: sel.common_name,
          scientific_name: sel.scientific_name ? [sel.scientific_name] : [],
          thumbnail_url: sel.thumbnail_url ?? null,
          _provider: "ai",
        };
      }
      navigate("/library/plant/preview", { state: { result } });
    },
    [navigate],
  );

  return (
    <div data-testid="library-search" className="space-y-3">
      <PlantSearch
        homeId={homeId}
        autoFocus
        showFilters
        placeholder="Search any plant by name…"
        initialQuery={initialQuery}
        onQueryChange={handleQueryChange}
        gates={{
          // Verdantly is free for all; Perenual self-gates inside searchAllProviders.
          canSearchExternal: true,
          canCreateWithAI: aiEnabled,
        }}
        onSelect={handleSelect}
      />
    </div>
  );
}
