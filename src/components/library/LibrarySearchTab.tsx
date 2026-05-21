import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Search,
  Loader2,
  Sparkles,
  Database,
  BookmarkCheck,
  AlertCircle,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import toast from "react-hot-toast";
import { ensureCataloguePlantFromSearchResult } from "../../lib/plantCatalogue";
import { PerenualService } from "../../lib/perenualService";
import { VerdantlyService } from "../../lib/verdantlyService";
import { PlantDoctorService } from "../../services/plantDoctorService";
import { useShedPlantMatcher } from "../../hooks/useShedPlantMatcher";
import { Logger } from "../../lib/errorHandler";
import { supabase } from "../../lib/supabase";
import type { ProviderSearchResult } from "../../lib/verdantlyUtils";

interface Props {
  homeId: string;
  aiEnabled: boolean;
}

const PAGE_SIZE = 10;
const SNAPSHOT_KEY = "library:search:snapshot";

interface SearchSnapshot {
  query: string;
  aiResults: string[];
  aiHasMore: boolean;
  perenualResults: ProviderSearchResult[];
  perenualPage: number;
  perenualNextPage: number;
  perenualHasMore: boolean;
  verdantlyResults: ProviderSearchResult[];
  verdantlyNextPage: number;
  verdantlyHasMore: boolean;
}

function readCachedSnapshot(query: string): SearchSnapshot | null {
  try {
    const raw = sessionStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SearchSnapshot;
    if (parsed.query?.trim().toLowerCase() !== query.trim().toLowerCase()) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCachedSnapshot(snap: SearchSnapshot): void {
  try {
    sessionStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snap));
  } catch {
    // session storage is best-effort; ignore quota errors
  }
}

function fromPerenualSearchItem(item: any): ProviderSearchResult {
  return {
    id: item.id,
    common_name: item.common_name ?? "Unknown",
    scientific_name: Array.isArray(item.scientific_name)
      ? item.scientific_name
      : item.scientific_name
      ? [item.scientific_name]
      : [],
    thumbnail_url: item.default_image?.thumbnail ?? null,
    _provider: "perenual",
    perenual_id: item.id,
  };
}

/**
 * Search tab — explicit Search button (no auto-fire on type) and results
 * grouped by provider, with a per-provider "Show more" button.
 *
 * Order mirrors The Shed's BulkSearchModal:
 *   1. AI suggestions   (page-by-page from search_plants_text)
 *   2. Perenual         (10 per page from PerenualService.searchPlantsPaged)
 *   3. Verdantly        (page-by-page from VerdantlyService.searchPlants)
 *
 * Last-submitted query is persisted to `?q=` and sessionStorage so Back
 * from the preview restores the search.
 */
export default function LibrarySearchTab({ homeId, aiEnabled }: Props) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialQuery =
    searchParams.get("q") ?? sessionStorage.getItem("library:lastQuery") ?? "";

  // The input value AND the last-submitted query are tracked separately —
  // typing alone doesn't fire a search any more.
  const [input, setInput] = useState(initialQuery);
  const [submitted, setSubmitted] = useState<string>("");

  const [aiResults, setAiResults] = useState<string[]>([]);
  const [aiHasMore, setAiHasMore] = useState(false);
  const [aiLoadingMore, setAiLoadingMore] = useState(false);

  const [perenualResults, setPerenualResults] = useState<ProviderSearchResult[]>([]);
  const [perenualPage, setPerenualPage] = useState(1);
  const [perenualNextPage, setPerenualNextPage] = useState(2);
  const [perenualHasMore, setPerenualHasMore] = useState(false);
  const [perenualLoadingMore, setPerenualLoadingMore] = useState(false);

  const [verdantlyResults, setVerdantlyResults] = useState<ProviderSearchResult[]>([]);
  const [verdantlyHasMore, setVerdantlyHasMore] = useState(false);
  const [verdantlyNextPage, setVerdantlyNextPage] = useState(2);
  const [verdantlyLoadingMore, setVerdantlyLoadingMore] = useState(false);

  const [searching, setSearching] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Lazy thumbnails per AI common name — keyed lowercase so cache hits
  // ignore case. Empty string = looked up, no image found.
  const [aiThumbs, setAiThumbs] = useState<Map<string, string>>(new Map());

  const { findMatch } = useShedPlantMatcher(homeId);

  // Look up a Wikipedia/Pixabay thumbnail per AI common name. Cached in
  // local state so we never re-fire for the same name in the same session.
  const prefetchAiThumbnails = useCallback(async (matches: string[]) => {
    const toFetch: string[] = [];
    setAiThumbs((prev) => {
      const next = new Map(prev);
      for (const match of matches) {
        const name = match.split("(")[0].trim();
        const key = name.toLowerCase();
        if (!next.has(key)) {
          next.set(key, ""); // mark in-flight so a parallel call doesn't double-fire
          toFetch.push(name);
        }
      }
      return next;
    });
    if (toFetch.length === 0) return;
    await Promise.all(
      toFetch.map(async (name) => {
        try {
          const { data } = await supabase.functions.invoke("plant-image-search", {
            body: { query: name, count: 1 },
          });
          const thumb = data?.images?.[0]?.thumb_url ?? "";
          setAiThumbs((prev) => {
            const next = new Map(prev);
            next.set(name.toLowerCase(), thumb);
            return next;
          });
        } catch {
          // leave the empty-string sentinel — UI falls back to the icon
        }
      }),
    );
  }, []);

  // On first mount: if there's a sessionStorage snapshot for the current
  // ?q=, hydrate state from it so Back from a preview is instant — no
  // re-search. Otherwise, if there's a query, run a fresh search.
  useEffect(() => {
    if (!initialQuery || submitted) return;
    const snapshot = readCachedSnapshot(initialQuery);
    if (snapshot) {
      setSubmitted(snapshot.query);
      setAiResults(snapshot.aiResults);
      setAiHasMore(snapshot.aiHasMore);
      setPerenualResults(snapshot.perenualResults);
      setPerenualPage(snapshot.perenualPage);
      setPerenualNextPage(snapshot.perenualNextPage);
      setPerenualHasMore(snapshot.perenualHasMore);
      setVerdantlyResults(snapshot.verdantlyResults);
      setVerdantlyNextPage(snapshot.verdantlyNextPage);
      setVerdantlyHasMore(snapshot.verdantlyHasMore);
      // Re-prefetch thumbnails for restored AI rows. plant-image-search is
      // cheap and the helper de-dupes so already-loaded ones are skipped.
      if (snapshot.aiResults.length > 0) {
        prefetchAiThumbnails(snapshot.aiResults);
      }
      return;
    }
    runSearch(initialQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset results when the user clears the input completely. Avoids stale
  // results lingering when the user blanks the field.
  useEffect(() => {
    if (input.trim().length === 0 && submitted) {
      setAiResults([]);
      setPerenualResults([]);
      setVerdantlyResults([]);
      setAiHasMore(false);
      setPerenualHasMore(false);
      setVerdantlyHasMore(false);
      setSubmitted("");
      setError(null);
      try { sessionStorage.removeItem(SNAPSHOT_KEY); } catch { /* ignore */ }
    }
  }, [input, submitted]);

  // Persist the search snapshot whenever any provider state changes after a
  // submitted query. Lets Back from a preview restore everything verbatim
  // — no re-search, no flicker.
  useEffect(() => {
    if (!submitted) return;
    if (searching) return;
    writeCachedSnapshot({
      query: submitted,
      aiResults,
      aiHasMore,
      perenualResults,
      perenualPage,
      perenualNextPage,
      perenualHasMore,
      verdantlyResults,
      verdantlyNextPage,
      verdantlyHasMore,
    });
  }, [
    submitted,
    searching,
    aiResults,
    aiHasMore,
    perenualResults,
    perenualPage,
    perenualNextPage,
    perenualHasMore,
    verdantlyResults,
    verdantlyNextPage,
    verdantlyHasMore,
  ]);

  const runSearch = useCallback(
    async (rawQuery: string) => {
      const q = rawQuery.trim();
      if (q.length < 2) {
        setError("Type at least two characters.");
        return;
      }
      setError(null);
      setSearching(true);
      setSubmitted(q);
      // Reset all provider state before kicking off a fresh search.
      setAiResults([]);
      setAiHasMore(false);
      setPerenualResults([]);
      setPerenualPage(1);
      setPerenualNextPage(2);
      setPerenualHasMore(false);
      setVerdantlyResults([]);
      setVerdantlyNextPage(2);
      setVerdantlyHasMore(false);

      // Sync URL + sessionStorage so Back from preview restores state.
      sessionStorage.setItem("library:lastQuery", q);
      setSearchParams({ q }, { replace: true });

      const calls: Promise<void>[] = [];

      // AI search (Sage+ only)
      if (aiEnabled) {
        calls.push(
          PlantDoctorService.searchPlantsText(q, { offset: 0, homeId })
            .then((data) => {
              const matches = data.matches ?? [];
              setAiResults(matches);
              setAiHasMore(!!data.hasMore);
              // Fire-and-forget image lookups so each AI row gets a
              // thumbnail without blocking the search render. Wikipedia
              // and Pixabay both have free, fast endpoints; the edge fn
              // is the same one PlantInfoPanel uses for galleries.
              prefetchAiThumbnails(matches);
            })
            .catch((err) => {
              Logger.error("Library AI search failed", err, { q });
            }),
        );
      }

      // Perenual (page 1, capped at PAGE_SIZE rows on render, but the API
      // returns whatever it returns — pagination resumes from page 2 when
      // the user clicks Show more).
      calls.push(
        PerenualService.searchPlantsPaged(q, 1)
          .then(({ data, hasMore, nextPage }) => {
            setPerenualResults(data.map(fromPerenualSearchItem));
            setPerenualHasMore(hasMore);
            setPerenualNextPage(nextPage);
            setPerenualPage(1);
          })
          .catch((err) => {
            Logger.error("Library Perenual search failed", err, { q });
          }),
      );

      // Verdantly (page 1). Same pagination quirk as the BulkSearchModal:
      // if page 1 is empty but hasMore is true, auto-fetch page 2.
      calls.push(
        VerdantlyService.searchPlants(q, 1)
          .then(async ({ results, hasMore, nextPage }) => {
            if (results.length > 0) {
              setVerdantlyResults(results);
              setVerdantlyHasMore(hasMore);
              setVerdantlyNextPage(nextPage);
            } else if (hasMore) {
              try {
                const page2 = await VerdantlyService.searchPlants(q, nextPage);
                setVerdantlyResults(page2.results);
                setVerdantlyHasMore(page2.hasMore);
                setVerdantlyNextPage(page2.nextPage);
              } catch {
                setVerdantlyHasMore(false);
              }
            }
          })
          .catch((err) => {
            Logger.error("Library Verdantly search failed", err, { q });
          }),
      );

      await Promise.all(calls);
      setSearching(false);
    },
    [aiEnabled, homeId, setSearchParams],
  );

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    runSearch(input);
  };

  const handleShowMoreAi = async () => {
    if (!submitted) return;
    setAiLoadingMore(true);
    try {
      const data = await PlantDoctorService.searchPlantsText(submitted, {
        offset: aiResults.length,
        homeId,
      });
      setAiResults((prev) => [...prev, ...(data.matches ?? [])]);
      setAiHasMore(!!data.hasMore);
    } catch (err: unknown) {
      Logger.error("Library AI show-more failed", err, { q: submitted });
      toast.error("Couldn't load more AI suggestions.");
    } finally {
      setAiLoadingMore(false);
    }
  };

  const handleShowMorePerenual = async () => {
    if (!submitted) return;
    setPerenualLoadingMore(true);
    try {
      const { data, hasMore, nextPage } = await PerenualService.searchPlantsPaged(
        submitted,
        perenualNextPage,
      );
      setPerenualResults((prev) => [...prev, ...data.map(fromPerenualSearchItem)]);
      setPerenualHasMore(hasMore);
      setPerenualNextPage(nextPage);
      setPerenualPage(perenualNextPage);
    } catch (err: unknown) {
      Logger.error("Library Perenual show-more failed", err, { q: submitted });
      toast.error("Couldn't load more Perenual results.");
    } finally {
      setPerenualLoadingMore(false);
    }
  };

  const handleShowMoreVerdantly = async () => {
    if (!submitted) return;
    setVerdantlyLoadingMore(true);
    try {
      const { results, hasMore, nextPage } = await VerdantlyService.searchPlants(
        submitted,
        verdantlyNextPage,
      );
      setVerdantlyResults((prev) => [...prev, ...results]);
      setVerdantlyHasMore(hasMore);
      setVerdantlyNextPage(nextPage);
    } catch (err: unknown) {
      Logger.error("Library Verdantly show-more failed", err, { q: submitted });
      toast.error("Couldn't load more Verdantly results.");
    } finally {
      setVerdantlyLoadingMore(false);
    }
  };

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

  // De-duplicate AI results against Perenual common names (same heuristic
  // BulkSearchModal uses) so AI doesn't double-list a plant already found
  // in the database.
  const perenualNames = useMemo(
    () => new Set(perenualResults.map((p) => p.common_name?.toLowerCase().trim())),
    [perenualResults],
  );
  const dedupedAi = useMemo(
    () =>
      aiResults.filter((match) => {
        const name = match.split("(")[0].trim().toLowerCase();
        return !perenualNames.has(name);
      }),
    [aiResults, perenualNames],
  );

  const visiblePerenual = perenualResults.slice(0, perenualPage * PAGE_SIZE);
  // "Show more" is enabled when EITHER the local slice is under-displayed
  // OR the API reports there are more pages. The handler always advances
  // to the next API page; the local slice tracking is just for chunking.
  const perenualCanShowMore =
    visiblePerenual.length < perenualResults.length || perenualHasMore;

  const hasAnyResults =
    dedupedAi.length > 0 ||
    perenualResults.length > 0 ||
    verdantlyResults.length > 0;
  const showEmpty =
    !searching && submitted && !hasAnyResults && !error;

  return (
    <div data-testid="library-search" className="space-y-3">
      {/* Search form — explicit submit (Enter or Search button) */}
      <form
        onSubmit={handleSubmit}
        data-testid="library-search-form"
        className="flex items-center gap-2"
      >
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-rhozly-on-surface/40 pointer-events-none"
          />
          <input
            type="search"
            data-testid="library-search-input"
            placeholder="Search any plant by name…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            autoFocus
            className="w-full pl-10 pr-3 py-3 min-h-[48px] rounded-2xl bg-white border border-rhozly-outline/20 text-sm font-bold text-rhozly-on-surface placeholder:text-rhozly-on-surface/40 focus:outline-none focus:border-rhozly-primary/40 focus:ring-2 focus:ring-rhozly-primary/15"
          />
        </div>
        <button
          type="submit"
          data-testid="library-search-submit"
          disabled={searching || input.trim().length < 2}
          className="shrink-0 inline-flex items-center justify-center gap-1.5 px-4 py-3 min-h-[48px] rounded-2xl bg-rhozly-primary text-white text-xs font-black uppercase tracking-widest hover:opacity-90 disabled:opacity-50 transition"
        >
          {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          Search
        </button>
      </form>

      {/* Helper line — only shown before first submit */}
      {!submitted && !error && (
        <p
          data-testid="library-search-hint"
          className="text-[12px] font-bold text-rhozly-on-surface/45 px-2 leading-snug"
        >
          Type a common name (e.g. <span className="text-rhozly-primary">"tomato"</span>) and press Search.
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

      {/* AI section */}
      {dedupedAi.length > 0 && (
        <section data-testid="library-search-section-ai" className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-500/70 px-1 pt-1">
            AI Suggestions
          </p>
          {dedupedAi.map((match, i) => {
            const aiCommonName = match.split("(")[0].trim();
            const inShed = findMatch({ source: "ai", common_name: aiCommonName });
            const cachedThumb = aiThumbs.get(aiCommonName.toLowerCase());
            const result: ProviderSearchResult = {
              id: `ai-${i}-${aiCommonName}`,
              common_name: aiCommonName,
              scientific_name: [],
              thumbnail_url: cachedThumb || null,
              _provider: "ai",
            };
            const resultKey = `${result._provider}:${result.id}`;
            const isOpening = opening === resultKey;
            return (
              <button
                key={resultKey}
                type="button"
                data-testid={`library-search-result-${resultKey}`}
                onClick={() => handleResultTap(result)}
                disabled={isOpening}
                className="w-full text-left rounded-2xl bg-white border border-rhozly-outline/15 hover:border-amber-400 active:scale-[0.99] disabled:opacity-60 transition-all flex items-center gap-3 p-3"
              >
                <div className="w-12 h-12 shrink-0 rounded-2xl overflow-hidden bg-amber-50 flex items-center justify-center text-amber-500">
                  {cachedThumb ? (
                    <img
                      src={cachedThumb}
                      alt={aiCommonName}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Sparkles size={20} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-display font-black text-rhozly-on-surface text-sm leading-tight truncate">
                    {match}
                  </p>
                  <div className="mt-1 flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-amber-500">
                      <Sparkles size={10} />
                      Rhozly AI
                    </span>
                    {inShed && (
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
                <div className="shrink-0 text-rhozly-on-surface/40">
                  {isOpening ? (
                    <Loader2 size={16} className="animate-spin text-rhozly-primary" />
                  ) : (
                    <ArrowRight size={16} />
                  )}
                </div>
              </button>
            );
          })}
          {aiHasMore && (
            <button
              type="button"
              data-testid="library-search-show-more-ai"
              onClick={handleShowMoreAi}
              disabled={aiLoadingMore}
              className="w-full py-2.5 border-2 border-dashed border-amber-300 text-amber-600 rounded-2xl font-black text-xs hover:bg-amber-50 disabled:opacity-60 transition flex items-center justify-center gap-2"
            >
              {aiLoadingMore ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <RefreshCw size={14} />
              )}
              Show more AI suggestions
            </button>
          )}
        </section>
      )}

      {/* Perenual section */}
      {perenualResults.length > 0 && (
        <section data-testid="library-search-section-perenual" className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-primary/70 px-1 pt-1">
            Perenual
          </p>
          {visiblePerenual.map((r) => {
            const inShed = findMatch({
              source: "api",
              perenual_id: r.perenual_id ?? null,
              common_name: r.common_name,
            });
            const resultKey = `${r._provider}:${r.id}`;
            const isOpening = opening === resultKey;
            return (
              <button
                key={resultKey}
                type="button"
                data-testid={`library-search-result-${resultKey}`}
                onClick={() => handleResultTap(r)}
                disabled={isOpening}
                className="w-full text-left rounded-2xl bg-white border border-rhozly-outline/15 hover:border-rhozly-primary/40 active:scale-[0.99] disabled:opacity-60 transition-all flex items-center gap-3 p-3"
              >
                <div className="w-12 h-12 shrink-0 rounded-2xl overflow-hidden bg-rhozly-primary/5">
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
                      <Database size={18} />
                    </div>
                  )}
                </div>
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
                    <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-rhozly-primary">
                      <Database size={10} />
                      Perenual
                    </span>
                    {inShed && (
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
                <div className="shrink-0 text-rhozly-on-surface/40">
                  {isOpening ? (
                    <Loader2 size={16} className="animate-spin text-rhozly-primary" />
                  ) : (
                    <ArrowRight size={16} />
                  )}
                </div>
              </button>
            );
          })}
          {perenualCanShowMore && (
            <button
              type="button"
              data-testid="library-search-show-more-perenual"
              onClick={async () => {
                // First: if local results have more we haven't shown yet,
                // bump the slice window. Otherwise hit the API for page+1.
                if (visiblePerenual.length < perenualResults.length) {
                  setPerenualPage((p) => p + 1);
                  return;
                }
                await handleShowMorePerenual();
                setPerenualPage((p) => p + 1);
              }}
              disabled={perenualLoadingMore}
              className="w-full py-2.5 border-2 border-dashed border-rhozly-primary/30 text-rhozly-primary rounded-2xl font-black text-xs hover:bg-rhozly-primary/5 disabled:opacity-60 transition flex items-center justify-center gap-2"
            >
              {perenualLoadingMore ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <RefreshCw size={14} />
              )}
              Show more Perenual results
            </button>
          )}
        </section>
      )}

      {/* Verdantly section */}
      {verdantlyResults.length > 0 && (
        <section data-testid="library-search-section-verdantly" className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700/80 px-1 pt-1">
            Verdantly
          </p>
          {verdantlyResults.map((r) => {
            const inShed = findMatch({
              source: "verdantly",
              verdantly_id: r.verdantly_id ?? null,
              common_name: r.common_name,
            });
            const resultKey = `${r._provider}:${r.id}`;
            const isOpening = opening === resultKey;
            return (
              <button
                key={resultKey}
                type="button"
                data-testid={`library-search-result-${resultKey}`}
                onClick={() => handleResultTap(r)}
                disabled={isOpening}
                className="w-full text-left rounded-2xl bg-white border border-rhozly-outline/15 hover:border-emerald-400 active:scale-[0.99] disabled:opacity-60 transition-all flex items-center gap-3 p-3"
              >
                <div className="w-12 h-12 shrink-0 rounded-2xl overflow-hidden bg-emerald-50">
                  {r.thumbnail_url ? (
                    <img
                      src={r.thumbnail_url}
                      alt={r.common_name}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-emerald-600">
                      <Database size={18} />
                    </div>
                  )}
                </div>
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
                    <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-emerald-700">
                      <Database size={10} />
                      Verdantly
                    </span>
                    {inShed && (
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
                <div className="shrink-0 text-rhozly-on-surface/40">
                  {isOpening ? (
                    <Loader2 size={16} className="animate-spin text-rhozly-primary" />
                  ) : (
                    <ArrowRight size={16} />
                  )}
                </div>
              </button>
            );
          })}
          {verdantlyHasMore && (
            <button
              type="button"
              data-testid="library-search-show-more-verdantly"
              onClick={handleShowMoreVerdantly}
              disabled={verdantlyLoadingMore}
              className="w-full py-2.5 border-2 border-dashed border-emerald-300 text-emerald-700 rounded-2xl font-black text-xs hover:bg-emerald-50 disabled:opacity-60 transition flex items-center justify-center gap-2"
            >
              {verdantlyLoadingMore ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <RefreshCw size={14} />
              )}
              Show more Verdantly results
            </button>
          )}
        </section>
      )}

      {/* Empty state */}
      {showEmpty && (
        <div
          data-testid="library-search-empty"
          className="rounded-2xl bg-white border border-rhozly-outline/15 p-5 text-center"
        >
          <p className="text-sm font-bold text-rhozly-on-surface/55">
            No matches for <span className="text-rhozly-primary">"{submitted}"</span>.
          </p>
          <p className="text-[11px] font-bold text-rhozly-on-surface/40 mt-1.5">
            Try a more common name, or check the spelling.
          </p>
        </div>
      )}
    </div>
  );
}
