import React, { useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import PlantSearch from "../shared/PlantSearch";
import { selectionToProviderResult, type PlantSelection } from "../../lib/unifiedPlantSearch";

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

  // Tapping a result navigates to the full-screen preview (the Library's own
  // detail surface). The inline ⓘ peek (allowPreview) gives a quick look
  // first; we don't add a separate "See full care" overlay here because the
  // row tap already opens the full plant page.
  const handleSelect = useCallback(
    (sel: PlantSelection) => {
      navigate("/library/plant/preview", { state: { result: selectionToProviderResult(sel) } });
    },
    [navigate],
  );

  return (
    <div data-testid="library-search" className="space-y-3">
      <PlantSearch
        homeId={homeId}
        autoFocus
        showFilters
        allowPreview
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
