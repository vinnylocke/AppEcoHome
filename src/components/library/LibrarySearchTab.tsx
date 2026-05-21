import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Search,
  Loader2,
  Sparkles,
  Database,
  BookmarkCheck,
  AlertCircle,
  ArrowRight,
} from "lucide-react";
import toast from "react-hot-toast";
import { searchAllProviders } from "../../lib/plantProvider";
import { ensureCataloguePlantFromSearchResult } from "../../lib/plantCatalogue";
import { useShedPlantMatcher } from "../../hooks/useShedPlantMatcher";
import { Logger } from "../../lib/errorHandler";
import type { ProviderSearchResult } from "../../lib/verdantlyUtils";

interface Props {
  homeId: string;
  aiEnabled: boolean;
}

function providerLabel(provider: string): string {
  if (provider === "ai") return "Rhozly AI";
  if (provider === "verdantly") return "Verdantly";
  return "Perenual";
}

function providerColour(provider: string): string {
  if (provider === "ai") return "text-amber-500";
  if (provider === "verdantly") return "text-emerald-600";
  return "text-rhozly-primary";
}

/**
 * Search tab inside The Library. Multi-provider name search backed by the
 * existing `searchAllProviders` helper. Tapping a result persists the
 * underlying plant to the global catalogue (via `ensureCataloguePlant…`)
 * and routes to `/library/plant/:id`.
 *
 * The search input + last-typed query are persisted to sessionStorage so
 * tapping Back from a preview restores the previous search state.
 */
export default function LibrarySearchTab({ homeId, aiEnabled }: Props) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Hydrate the input from ?q= (or sessionStorage as a backup) so Back
  // from a preview lands the user back where they were.
  const initialQuery =
    searchParams.get("q") ?? sessionStorage.getItem("library:lastQuery") ?? "";

  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<ProviderSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<number | null>(null);

  const { findMatch } = useShedPlantMatcher(homeId);

  // Run the search whenever the query stabilises for ~350ms.
  const runSearch = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (trimmed.length < 2) {
        setResults([]);
        setError(null);
        return;
      }
      setSearching(true);
      setError(null);
      try {
        const out = await searchAllProviders(trimmed, undefined, undefined, {
          includeAi: aiEnabled,
          homeId,
        });
        setResults(out);
      } catch (err: unknown) {
        Logger.error("LibrarySearch failed", err, { query: trimmed });
        setError(
          err instanceof Error ? err.message : "Couldn't reach the search providers.",
        );
        setResults([]);
      } finally {
        setSearching(false);
      }
    },
    [aiEnabled, homeId],
  );

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      runSearch(query);
      // Sync state to the URL + sessionStorage so navigating back from a
      // preview restores the search and scroll position naturally.
      if (query.trim().length >= 2) {
        sessionStorage.setItem("library:lastQuery", query);
        setSearchParams({ q: query }, { replace: true });
      } else if (searchParams.has("q")) {
        sessionStorage.removeItem("library:lastQuery");
        setSearchParams({}, { replace: true });
      }
    }, 350);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query, runSearch, setSearchParams, searchParams]);

  // Tap a result → ensure catalogue → navigate to preview.
  const handleResultTap = async (result: ProviderSearchResult) => {
    const resultKey = `${result._provider}:${result.id}`;
    if (opening) return;
    setOpening(resultKey);
    try {
      const plant = await ensureCataloguePlantFromSearchResult(result, { homeId });
      navigate(`/library/plant/${plant.plantId}`);
    } catch (err: unknown) {
      Logger.error("LibrarySearch open failed", err, {
        provider: result._provider,
        common_name: result.common_name,
      });
      toast.error(
        err instanceof Error
          ? err.message
          : "Couldn't open this plant — try again.",
      );
    } finally {
      setOpening(null);
    }
  };

  const hasResults = results.length > 0;
  const emptyState = !searching && !hasResults && query.trim().length >= 2;

  return (
    <div data-testid="library-search" className="space-y-3">
      {/* Search input */}
      <div className="relative">
        <Search
          size={16}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-rhozly-on-surface/40 pointer-events-none"
        />
        <input
          type="search"
          data-testid="library-search-input"
          placeholder="Search any plant by name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
          className="w-full pl-10 pr-10 py-3 min-h-[48px] rounded-2xl bg-white border border-rhozly-outline/20 text-sm font-bold text-rhozly-on-surface placeholder:text-rhozly-on-surface/40 focus:outline-none focus:border-rhozly-primary/40 focus:ring-2 focus:ring-rhozly-primary/15"
        />
        {searching && (
          <Loader2
            size={16}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-rhozly-primary animate-spin"
          />
        )}
      </div>

      {/* Helper line — only shown when input is empty */}
      {query.trim().length < 2 && (
        <p
          data-testid="library-search-hint"
          className="text-[12px] font-bold text-rhozly-on-surface/45 px-2 leading-snug"
        >
          Type a common name (e.g. <span className="text-rhozly-primary">"tomato"</span>) to browse the plant database. Tapping a result opens its care guide and lets you save it to your Shed.
        </p>
      )}

      {/* Error banner */}
      {error && (
        <div
          data-testid="library-search-error"
          className="px-3 py-2.5 rounded-2xl bg-red-50 border border-red-100 text-xs text-red-800 flex items-start gap-2"
        >
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* Results */}
      {hasResults && (
        <ul
          data-testid="library-search-results"
          className="flex flex-col gap-2"
        >
          {results.map((r) => {
            const shedMatch = findMatch({
              source: r._provider,
              perenual_id: r.perenual_id ?? null,
              verdantly_id: r.verdantly_id ?? null,
              common_name: r.common_name,
            });
            const resultKey = `${r._provider}:${r.id}`;
            const isOpening = opening === resultKey;
            const icon = r._provider === "ai" ? <Sparkles size={12} /> : <Database size={12} />;
            return (
              <li key={resultKey}>
                <button
                  type="button"
                  data-testid={`library-search-result-${resultKey}`}
                  onClick={() => handleResultTap(r)}
                  disabled={isOpening}
                  className="w-full text-left rounded-2xl bg-white border border-rhozly-outline/15 hover:border-rhozly-primary/40 active:scale-[0.99] disabled:opacity-60 transition-all flex items-center gap-3 p-3"
                >
                  {/* Thumb */}
                  <div className="w-14 h-14 shrink-0 rounded-2xl overflow-hidden bg-rhozly-primary/5">
                    {r.thumbnail_url ? (
                      <img
                        src={r.thumbnail_url}
                        alt={r.common_name}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-rhozly-primary/50">
                        <Sparkles size={20} />
                      </div>
                    )}
                  </div>
                  {/* Body */}
                  <div className="flex-1 min-w-0">
                    <p className="font-display font-black text-rhozly-on-surface text-sm leading-tight truncate">
                      {r.common_name}
                    </p>
                    {r.scientific_name?.[0] && (
                      <p className="text-[11px] font-bold italic text-rhozly-on-surface/45 truncate">
                        {r.scientific_name[0]}
                      </p>
                    )}
                    <div className="mt-1 flex items-center gap-2 flex-wrap">
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest ${providerColour(r._provider)}`}
                      >
                        {icon}
                        {providerLabel(r._provider)}
                      </span>
                      {shedMatch && (
                        <span
                          data-testid={`library-search-result-saved-${resultKey}`}
                          className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/55 bg-rhozly-surface-low px-2 py-0.5 rounded-full"
                        >
                          <BookmarkCheck size={10} />
                          In your Shed
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Open affordance */}
                  <div className="shrink-0 text-rhozly-on-surface/40">
                    {isOpening ? (
                      <Loader2 size={16} className="animate-spin text-rhozly-primary" />
                    ) : (
                      <ArrowRight size={16} />
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Empty state */}
      {emptyState && (
        <div
          data-testid="library-search-empty"
          className="rounded-2xl bg-white border border-rhozly-outline/15 p-5 text-center"
        >
          <p className="text-sm font-bold text-rhozly-on-surface/55">
            No matches for <span className="text-rhozly-primary">"{query.trim()}"</span>.
          </p>
          <p className="text-[11px] font-bold text-rhozly-on-surface/40 mt-1.5">
            Try a more common name, or check the spelling.
          </p>
        </div>
      )}
    </div>
  );
}
