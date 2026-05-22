import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Search,
  Loader2,
  Lock,
  Plus,
  ChevronLeft,
} from "lucide-react";
import { IconPlantDB, IconAI } from "../constants/icons";
import { supabase } from "../lib/supabase";
import { useShedPlantMatcher } from "../hooks/useShedPlantMatcher";
import { getProviderPlantDetails, careGuideToPlantDetails } from "../lib/plantProvider";
import { PlantDoctorService } from "../services/plantDoctorService";
import { PerenualService } from "../lib/perenualService";
import { VerdantlyService } from "../lib/verdantlyService";
import { getProviderLabel, type ProviderSearchResult } from "../lib/verdantlyUtils";
import toast from "react-hot-toast";
import ManualPlantCreation from "./ManualPlantCreation";
import MultiImageGallery from "./MultiImageGallery";

import { usePlantDoctor } from "../context/PlantDoctorContext";
import { scorePlantByPreferences } from "../hooks/useUserPreferences";

interface Props {
  homeId: string;
  isPremium: boolean;
  isAiEnabled?: boolean;
  onClose: () => void;
  onSuccess: (newPlant?: any) => void;
  initialSearchTerm?: string;
  initialScientificName?: string;
  /**
   * Optional Tailwind z-index class — used when the modal is mounted on
   * top of another modal that already lives at z-[100] (e.g. the
   * Nursery packet editor). Defaults to "z-[100]" for the standalone
   * usages where nothing else is on screen.
   */
  zIndexClassName?: string;
}

export default function PlantSearchModal({
  homeId,
  isPremium,
  isAiEnabled = false,
  onClose,
  onSuccess,
  initialSearchTerm,
  initialScientificName,
  zIndexClassName = "z-[100]",
}: Props) {
  const { setPageContext, preferences } = usePlantDoctor();

  const { findMatch: findShedMatch } = useShedPlantMatcher(homeId);

  const [query, setQuery] = useState(initialSearchTerm || "");
  const [searchMode, setSearchMode] = useState<"common" | "scientific">("common");

  // ─── Per-provider result buckets ────────────────────────────────────────
  // Order on screen mirrors the Library search: AI → Perenual → Verdantly.
  // Each bucket carries its own paging state so "Show more" expands one
  // provider without disturbing the others.
  const [aiResults, setAiResults] = useState<ProviderSearchResult[]>([]);
  const [aiHasMore, setAiHasMore] = useState(false);
  const [aiOffset, setAiOffset] = useState(0);
  const [aiLoadingMore, setAiLoadingMore] = useState(false);

  const [perenualResults, setPerenualResults] = useState<ProviderSearchResult[]>([]);
  const [perenualHasMore, setPerenualHasMore] = useState(false);
  const [perenualNextPage, setPerenualNextPage] = useState(2);
  const [perenualLoadingMore, setPerenualLoadingMore] = useState(false);

  const [verdantlyResults, setVerdantlyResults] = useState<ProviderSearchResult[]>([]);
  const [verdantlyHasMore, setVerdantlyHasMore] = useState(false);
  const [verdantlyNextPage, setVerdantlyNextPage] = useState(2);
  const [verdantlyLoadingMore, setVerdantlyLoadingMore] = useState(false);

  // Perenual visible-count slicing — the Perenual API returns ~30
  // results per page, but we only show 10 at a time on screen. "Show
  // more" reveals the next 10 from the fetched batch first, and only
  // hits the API for a new page once the current batch is exhausted.
  // Mirrors the BulkSearchModal pattern.
  const [perenualVisibleCount, setPerenualVisibleCount] = useState(10);

  // AI thumbnail prefetch — the AI search endpoint returns just plant
  // names. We fan out to `plant-image-search` (Wikipedia / Pixabay /
  // Unsplash, server-side cached via plant_image_cache) per match and
  // store the first thumbnail URL keyed by lowercased common name.
  // Empty string = "looked up, nothing found" → UI falls back to the
  // placeholder icon. Missing key = "not yet looked up".
  const [aiThumbs, setAiThumbs] = useState<Map<string, string>>(new Map());
  const aiThumbsRef = useRef<Map<string, string>>(new Map());
  const aiInflightRef = useRef<Set<string>>(new Set());

  // Sort each bucket independently by the user's preferences — keeps the
  // bucket order stable but rotates within-bucket so favourites bubble up.
  const sortByPrefs = useCallback(
    (arr: ProviderSearchResult[]) => {
      if (!preferences.length) return arr;
      return [...arr].sort((a, b) => {
        const scoreA = scorePlantByPreferences(a.common_name || "", a.scientific_name?.[0] || "", preferences);
        const scoreB = scorePlantByPreferences(b.common_name || "", b.scientific_name?.[0] || "", preferences);
        return scoreB - scoreA;
      });
    },
    [preferences],
  );

  const rankedAi        = useMemo(() => sortByPrefs(aiResults),        [aiResults, sortByPrefs]);
  const rankedPerenual  = useMemo(() => sortByPrefs(perenualResults),  [perenualResults, sortByPrefs]);
  const rankedVerdantly = useMemo(() => sortByPrefs(verdantlyResults), [verdantlyResults, sortByPrefs]);

  // Flattened in render order — drives keyboard nav (`selectedResultIndex`).
  const visibleResults = useMemo(
    () => [...rankedAi, ...rankedPerenual, ...rankedVerdantly],
    [rankedAi, rankedPerenual, rankedVerdantly],
  );

  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [selectedResultIndex, setSelectedResultIndex] = useState(-1);

  const [previewPlant, setPreviewPlant] = useState<any | null>(null);
  const [isFetchingPreview, setIsFetchingPreview] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Auto-focus search input when modal opens
  useEffect(() => {
    if (!previewPlant && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [previewPlant]);

  // Scroll selected result into view
  useEffect(() => {
    if (selectedResultIndex >= 0 && modalRef.current) {
      const resultsContainer = modalRef.current.querySelector(".custom-scrollbar");
      const selectedElement = resultsContainer?.children[selectedResultIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
  }, [selectedResultIndex]);

  // Focus trap implementation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Tab" && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const firstElement = focusableElements[0] as HTMLElement;
        const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }

      // Escape key to close modal
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    setPageContext({
      action: previewPlant
        ? "Previewing Global Encyclopedia Entry"
        : "Searching Global Plant Database",
      searchContext: {
        currentQuery: query,
        hasResults: visibleResults.length > 0,
        resultCount: visibleResults.length,
      },
      previewedPlant: previewPlant
        ? {
            commonName: previewPlant.common_name,
            scientificName: previewPlant.scientific_name?.[0],
            type: previewPlant.type,
            cycle: previewPlant.cycle,
            watering: previewPlant.watering,
            sunlight: previewPlant.sunlight,
          }
        : null,
    });

    return () => setPageContext(null);
  }, [query, visibleResults, previewPlant, setPageContext]);

  // ── Per-device search snapshot cache ──────────────────────────────────
  // Keyed by query so reopening the modal with the same `initialSearchTerm`
  // can hydrate state from the snapshot rather than firing the network
  // fan-out again. Survives close/reopen, dies on app reload (which is
  // what we want — fresh data on cold start).
  const SNAPSHOT_KEY = "plant_search_modal:lastSnapshot";

  type SearchSnapshot = {
    query: string;
    aiResults: ProviderSearchResult[];
    aiHasMore: boolean;
    aiOffset: number;
    perenualResults: ProviderSearchResult[];
    perenualHasMore: boolean;
    perenualNextPage: number;
    perenualVisibleCount: number;
    verdantlyResults: ProviderSearchResult[];
    verdantlyHasMore: boolean;
    verdantlyNextPage: number;
    aiThumbs: Array<[string, string]>;
  };

  const readSnapshot = (forQuery: string): SearchSnapshot | null => {
    try {
      const raw = sessionStorage.getItem(SNAPSHOT_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as SearchSnapshot;
      if (parsed.query?.trim().toLowerCase() !== forQuery.trim().toLowerCase()) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  };

  const writeSnapshot = useCallback((q: string) => {
    try {
      const snap: SearchSnapshot = {
        query: q,
        aiResults,
        aiHasMore,
        aiOffset,
        perenualResults,
        perenualHasMore,
        perenualNextPage,
        perenualVisibleCount,
        verdantlyResults,
        verdantlyHasMore,
        verdantlyNextPage,
        aiThumbs: Array.from(aiThumbsRef.current.entries()),
      };
      sessionStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snap));
    } catch {
      // session storage is best-effort; swallow quota errors.
    }
  }, [
    aiResults, aiHasMore, aiOffset,
    perenualResults, perenualHasMore, perenualNextPage, perenualVisibleCount,
    verdantlyResults, verdantlyHasMore, verdantlyNextPage,
  ]);

  // Rewrite the snapshot whenever any bucket changes — cheap enough
  // (one JSON.stringify on a few dozen rows) and saves us a network
  // round-trip on reopen.
  useEffect(() => {
    if (!hasSearched || !query.trim()) return;
    writeSnapshot(query);
  }, [hasSearched, query, writeSnapshot]);

  /** Convert a raw Perenual search item to the shared `ProviderSearchResult`
   *  shape. Local copy — the shared helper inside `plantProvider.ts` isn't
   *  exported. Kept identical to the one in `LibrarySearchTab`. */
  const fromPerenualSearchItem = (item: any): ProviderSearchResult => ({
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
  });

  /** Map AI `matches` string[] back to ProviderSearchResults with
   *  catalogue-hit metadata when available. Same shape the legacy
   *  `searchAllProviders` produced. */
  const fromAiMatches = (
    matches: string[],
    hits: Record<string, any> | undefined,
    offset: number,
  ): ProviderSearchResult[] =>
    matches.map((name, idx) => {
      const hit = hits?.[name];
      return {
        id: `ai-${offset + idx}-${name}`,
        common_name: name,
        scientific_name: [],
        thumbnail_url: null,
        _provider: "ai",
        ...(hit && {
          catalogue_hit: {
            hit_kind: hit.hit_kind,
            plant_id: hit.plant_id,
            freshness_version: hit.freshness_version,
            last_care_generated_at: hit.last_care_generated_at,
            overridden_fields: hit.overridden_fields,
          },
        }),
      } as ProviderSearchResult;
    });

  /**
   * Fan out to `plant-image-search` per AI common name, caching the
   * first returned thumbnail in `aiThumbsRef` so re-renders or
   * StrictMode double-invocations don't re-fire the same lookup.
   * Server-side `plant_image_cache` makes the second user to search
   * the same name pay only a ~50ms DB hit instead of a fresh external
   * lookup. Empty string in the map = "looked up, found nothing"; the
   * UI falls back to the placeholder icon in that case.
   */
  const prefetchAiThumbnails = useCallback(async (matches: ProviderSearchResult[]) => {
    const toFetch = matches
      .map((m) => m.common_name?.split("(")[0]?.trim())
      .filter((name): name is string => !!name)
      .filter((name) => {
        const key = name.toLowerCase();
        if (aiThumbsRef.current.has(key)) return false;
        if (aiInflightRef.current.has(key)) return false;
        aiInflightRef.current.add(key);
        return true;
      });

    if (toFetch.length === 0) return;

    await Promise.all(
      toFetch.map(async (name) => {
        const key = name.toLowerCase();
        try {
          const { data } = await supabase.functions.invoke("plant-image-search", {
            body: { query: name, count: 1 },
          });
          const thumb = (data?.images?.[0]?.thumb_url as string | undefined) ?? "";
          aiThumbsRef.current.set(key, thumb);
          setAiThumbs(new Map(aiThumbsRef.current));
        } catch {
          aiThumbsRef.current.set(key, "");
          setAiThumbs(new Map(aiThumbsRef.current));
        } finally {
          aiInflightRef.current.delete(key);
        }
      }),
    );
  }, []);

  const performSearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setSearchError(false);
    setPreviewPlant(null);
    setSelectedResultIndex(-1);

    // Clear all three buckets up-front so the loading state isn't
    // mixed with stale results from the previous query.
    setAiResults([]);
    setAiHasMore(false);
    setAiOffset(0);
    setPerenualResults([]);
    setPerenualHasMore(false);
    setPerenualNextPage(2);
    setPerenualVisibleCount(10);
    setVerdantlyResults([]);
    setVerdantlyHasMore(false);
    setVerdantlyNextPage(2);

    // Fan out into the three providers in parallel. Each settles
    // independently — a slow Verdantly call doesn't delay Perenual
    // results from rendering.
    const aiPromise = isAiEnabled
      ? PlantDoctorService.searchPlantsText(searchQuery, { homeId, offset: 0 })
          .then((res) => {
            const mapped = fromAiMatches(res.matches ?? [], res.hits, 0);
            setAiResults(mapped);
            setAiHasMore(!!res.hasMore);
            setAiOffset(res.matches?.length ?? 0);
            // Fire-and-forget thumbnail lookups — server-side cache
            // keeps the second user's cost down to ~50ms.
            prefetchAiThumbnails(mapped);
          })
          .catch(() => {
            // AI failures shouldn't surface as a hard search error — the
            // other two providers can still produce results. Just leave
            // the bucket empty.
          })
      : Promise.resolve();

    const perenualPromise = PerenualService.searchPlantsPaged(searchQuery, 1)
      .then((page) => {
        setPerenualResults(page.data.map(fromPerenualSearchItem));
        setPerenualHasMore(page.hasMore);
        setPerenualNextPage(page.nextPage);
      })
      .catch(() => {
        // Same rationale — soft fail per provider, hard fail only when all three throw.
      });

    const verdantlyPromise = VerdantlyService.searchPlants(searchQuery, 1)
      .then((page) => {
        setVerdantlyResults(page.results);
        setVerdantlyHasMore(page.hasMore);
        setVerdantlyNextPage(page.nextPage);
      })
      .catch(() => {});

    try {
      await Promise.all([aiPromise, perenualPromise, verdantlyPromise]);
      setHasSearched(true);
    } catch {
      setSearchError(true);
      toast.error("Search failed. Check your connection.");
    } finally {
      setIsSearching(false);
    }
  };

  /** Append the next page of AI matches. The offset is what the AI
   *  endpoint pages on; we keep the running offset client-side and pass
   *  it forward each call. */
  const loadMoreAi = async () => {
    if (aiLoadingMore || !aiHasMore) return;
    setAiLoadingMore(true);
    try {
      const res = await PlantDoctorService.searchPlantsText(query, {
        homeId,
        offset: aiOffset,
      });
      const next = fromAiMatches(res.matches ?? [], res.hits, aiOffset);
      setAiResults((prev) => [...prev, ...next]);
      setAiHasMore(!!res.hasMore);
      setAiOffset((prev) => prev + (res.matches?.length ?? 0));
      prefetchAiThumbnails(next);
    } catch {
      toast.error("Couldn't load more AI suggestions.");
    } finally {
      setAiLoadingMore(false);
    }
  };

  /**
   * Hybrid "Show more" for Perenual:
   *   - If the current batch has more rows than we're showing, reveal
   *     the next 10 client-side (no network round-trip).
   *   - Else, if the API reports more pages, fetch the next page and
   *     bump visibleCount by its size.
   * Mirrors the BulkSearchModal pattern so the user sees the same
   * "10 at a time" rhythm even though Perenual returns ~30 per page.
   */
  const loadMorePerenual = async () => {
    if (perenualLoadingMore) return;
    if (perenualVisibleCount < perenualResults.length) {
      setPerenualVisibleCount((prev) =>
        Math.min(prev + 10, perenualResults.length),
      );
      return;
    }
    if (!perenualHasMore) return;
    setPerenualLoadingMore(true);
    try {
      const page = await PerenualService.searchPlantsPaged(query, perenualNextPage);
      const mapped = page.data.map(fromPerenualSearchItem);
      setPerenualResults((prev) => [...prev, ...mapped]);
      setPerenualHasMore(page.hasMore);
      setPerenualNextPage(page.nextPage);
      setPerenualVisibleCount((prev) => prev + mapped.length);
    } catch {
      toast.error("Couldn't load more Perenual results.");
    } finally {
      setPerenualLoadingMore(false);
    }
  };

  /** Effective "has more" for the Perenual section — true if either
   *  the visible slice can grow OR the API has more pages. Drives
   *  whether the "Show more" pill renders at all. */
  const perenualCanShowMore =
    perenualVisibleCount < perenualResults.length || perenualHasMore;

  const loadMoreVerdantly = async () => {
    if (verdantlyLoadingMore || !verdantlyHasMore) return;
    setVerdantlyLoadingMore(true);
    try {
      const page = await VerdantlyService.searchPlants(query, verdantlyNextPage);
      setVerdantlyResults((prev) => [...prev, ...page.results]);
      setVerdantlyHasMore(page.hasMore);
      setVerdantlyNextPage(page.nextPage);
    } catch {
      toast.error("Couldn't load more Verdantly results.");
    } finally {
      setVerdantlyLoadingMore(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    performSearch(query);
  };

  const hasAutoSearched = useRef(false);

  useEffect(() => {
    if (initialSearchTerm && isPremium && !hasAutoSearched.current) {
      hasAutoSearched.current = true;
      // Try the per-device snapshot first — if it matches the initial
      // search term, hydrate state from cache and skip the network
      // fan-out entirely. The user gets the same results instantly on
      // reopen.
      const cached = readSnapshot(initialSearchTerm);
      if (cached) {
        setAiResults(cached.aiResults);
        setAiHasMore(cached.aiHasMore);
        setAiOffset(cached.aiOffset);
        setPerenualResults(cached.perenualResults);
        setPerenualHasMore(cached.perenualHasMore);
        setPerenualNextPage(cached.perenualNextPage);
        setPerenualVisibleCount(cached.perenualVisibleCount ?? 10);
        setVerdantlyResults(cached.verdantlyResults);
        setVerdantlyHasMore(cached.verdantlyHasMore);
        setVerdantlyNextPage(cached.verdantlyNextPage);
        // Restore AI thumb lookups so the cached results paint with images.
        aiThumbsRef.current = new Map(cached.aiThumbs ?? []);
        setAiThumbs(new Map(aiThumbsRef.current));
        setHasSearched(true);
        // Refresh any AI thumbs that weren't yet looked up.
        prefetchAiThumbnails(cached.aiResults);
        return;
      }
      performSearch(initialSearchTerm);
    }
  }, [initialSearchTerm, isPremium]);

  const switchMode = (next: "common" | "scientific") => {
    setSearchMode(next);
    const nextQuery = next === "scientific"
      ? (initialScientificName || query)
      : (initialSearchTerm || query);
    setQuery(nextQuery);
    performSearch(nextQuery);
  };

  const handlePreviewPlant = async (searchResultPlant: ProviderSearchResult) => {
    setIsFetchingPreview(true);
    try {
      let fullPlantData: any;
      if (searchResultPlant._provider === "ai") {
        // AI suggestions don't have provider IDs — synthesise a care guide instead.
        const guide = await PlantDoctorService.generateCareGuide(searchResultPlant.common_name, homeId);
        fullPlantData = careGuideToPlantDetails(guide?.plantData ?? guide, searchResultPlant.common_name);
        // Wave 3 — propagate catalogue identity so add-to-shed can point at the
        // global plant row instead of creating a per-home duplicate.
        if (guide?.db_plant_id != null) {
          fullPlantData.db_plant_id = guide.db_plant_id;
          fullPlantData.freshness_version = guide.freshness_version ?? null;
          fullPlantData.from_catalogue = guide.fromCatalogue ?? false;
        }
      } else {
        fullPlantData = await getProviderPlantDetails({
          source: searchResultPlant._provider === "verdantly" ? "verdantly" : "api",
          perenual_id: searchResultPlant.perenual_id,
          verdantly_id: searchResultPlant.verdantly_id,
        });
      }

      const getValidImage = (...urls: (string | null | undefined)[]) =>
        urls.find((u) => u && typeof u === "string" && !u.includes("upgrade_access")) ?? "";

      const safeImage = getValidImage(
        fullPlantData.image_url,
        fullPlantData.thumbnail_url,
        searchResultPlant.thumbnail_url,
      );

      setPreviewPlant({
        ...fullPlantData,
        image_url: safeImage,
        thumbnail_url: safeImage,
        _provider: searchResultPlant._provider,
      });
    } catch (err) {
      toast.error("Failed to load plant details.");
    } finally {
      setIsFetchingPreview(false);
    }
  };

  // Keyboard navigation for search results
  const handleResultsKeyDown = (e: React.KeyboardEvent) => {
    if (visibleResults.length === 0 || previewPlant) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedResultIndex((prev) =>
        prev < visibleResults.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedResultIndex((prev) => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === "Enter" && selectedResultIndex >= 0) {
      e.preventDefault();
      handlePreviewPlant(visibleResults[selectedResultIndex]);
    }
  };

  const handleAddToShed = async () => {
    if (!previewPlant) return;
    setIsAdding(true);

    const isVerdantly = previewPlant.source === "verdantly";
    const isAi = previewPlant.source === "ai" || previewPlant._provider === "ai";

    try {
      // Duplicate check per provider
      let existingPlant: any = null;
      if (isVerdantly && previewPlant.verdantly_id) {
        const { data, error } = await supabase
          .from("plants")
          .select("id")
          .eq("home_id", homeId)
          .eq("verdantly_id", previewPlant.verdantly_id)
          .maybeSingle();
        if (error) throw new Error("Could not verify if plant exists. Try again.");
        existingPlant = data;
      } else if (isAi) {
        // Wave 7 (D2) — AI plants don't have a stable provider ID. Match on
        // common_name within the home (same check Wave 3's bulk-add uses).
        const { data, error } = await supabase
          .from("plants")
          .select("id")
          .eq("home_id", homeId)
          .ilike("common_name", previewPlant.common_name)
          .limit(1);
        if (error) throw new Error("Could not verify if plant exists. Try again.");
        existingPlant = data && data.length > 0 ? data[0] : null;
      } else {
        const pId = String(previewPlant.perenual_id);
        const { data, error } = await supabase
          .from("plants")
          .select("id")
          .eq("home_id", homeId)
          .eq("perenual_id", pId)
          .maybeSingle();
        if (error) throw new Error("Could not verify if plant exists. Try again.");
        existingPlant = data;
      }

      if (existingPlant) {
        toast.error(`${previewPlant.common_name} is already in your Shed!`, { icon: "🚫" });
        setIsAdding(false);
        return;
      }

      let permanentImageUrl = previewPlant.image_url || previewPlant.thumbnail_url || "";

      if (permanentImageUrl) {
        try {
          const { data: proxyData, error: proxyError } = await supabase.functions.invoke("image-proxy", {
            body: { imageUrl: permanentImageUrl, plantName: previewPlant.common_name },
          });
          if (proxyError) throw proxyError;
          if (proxyData?.publicUrl) {
            permanentImageUrl = proxyData.publicUrl;
            if (permanentImageUrl.includes("kong:8000")) {
              permanentImageUrl = permanentImageUrl.replace("http://kong:8000", "http://127.0.0.1:54321");
            }
          }
        } catch (proxyErr) {
          console.error("Proxy Failed:", proxyErr);
        }
      }

      // Wave 7 (D2) — three-way branch: Verdantly, AI, or Perenual.
      // AI plants follow Wave 3's shallow-fork pattern: when the catalogue
      // returned a `db_plant_id`, we record it as `forked_from_plant_id` so
      // the new row is registered as a shallow fork tracking the global.
      let skeletonPlant: Record<string, unknown>;
      if (isVerdantly) {
        skeletonPlant = {
          id:              Math.floor(Date.now() / 1000),
          home_id:         homeId,
          common_name:     previewPlant.common_name,
          scientific_name: previewPlant.scientific_name,
          thumbnail_url:   permanentImageUrl,
          source:          "verdantly",
          verdantly_id:    previewPlant.verdantly_id,
          growth_habit:    previewPlant.growth_habit ?? null,
          days_to_harvest_min: previewPlant.days_to_harvest_min ?? null,
          days_to_harvest_max: previewPlant.days_to_harvest_max ?? null,
          soil_ph_min:     previewPlant.soil_ph_min ?? null,
          soil_ph_max:     previewPlant.soil_ph_max ?? null,
          planting_instructions: previewPlant.planting_instructions ?? null,
        };
      } else if (isAi) {
        skeletonPlant = {
          id:              Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 1000),
          home_id:         homeId,
          common_name:     previewPlant.common_name,
          scientific_name: previewPlant.scientific_name ?? [],
          thumbnail_url:   permanentImageUrl,
          source:          "ai",
          perenual_id:     null,
          // Sync top-level AI care fields so TheShed / Plant Edit Modal can
          // render without re-fetching the care guide.
          watering:           previewPlant.watering ?? null,
          care_level:         previewPlant.care_level ?? null,
          cycle:              previewPlant.cycle ?? null,
          sunlight:           previewPlant.sunlight ?? [],
          description:        previewPlant.description ?? null,
          watering_min_days:  previewPlant.watering_min_days ?? null,
          watering_max_days:  previewPlant.watering_max_days ?? null,
          is_edible:          previewPlant.is_edible ?? false,
          is_toxic_pets:      previewPlant.is_toxic_pets ?? false,
          is_toxic_humans:    previewPlant.is_toxic_humans ?? false,
          attracts:           previewPlant.attracts ?? [],
        };
        if (previewPlant.db_plant_id != null) {
          skeletonPlant.forked_from_plant_id = previewPlant.db_plant_id;
          skeletonPlant.overridden_fields = [];
        }
      } else {
        skeletonPlant = {
          id:          Math.floor(Date.now() / 1000),
          home_id:     homeId,
          common_name: previewPlant.common_name,
          scientific_name: previewPlant.scientific_name,
          thumbnail_url: permanentImageUrl,
          source:      "api",
          perenual_id: String(previewPlant.perenual_id),
        };
      }

      const { data: savedPlant, error } = await supabase
        .from("plants")
        .insert([skeletonPlant])
        .select()
        .single();

      if (error) throw error;

      // Post-Wave-7 hotfix — for AI plants where the catalogue is known,
      // seed user_plant_ack at the global's current freshness_version so
      // the freshness chip doesn't fire on a freshly-added plant. Mirrors
      // the same step in TheShed.handleProceedToBulkAdd.
      if (isAi && previewPlant.db_plant_id != null) {
        const { data: userData } = await supabase.auth.getUser();
        const callerId = userData?.user?.id;
        if (callerId) {
          await supabase.from("user_plant_ack").upsert(
            {
              user_id: callerId,
              plant_id: previewPlant.db_plant_id,
              seen_freshness_version: previewPlant.freshness_version ?? 1,
              acked_at: new Date().toISOString(),
            },
            { onConflict: "user_id,plant_id" },
          );
        }
      }

      // Only Perenual rows get the auto-generated harvest schedule today
      // (it references "Perenual Database" in the description). Wave 7 (D2)
      // explicitly excludes AI plants from this branch — their schedules
      // come from buildAutoSeasonalSchedules in the bulk-add flow when used.
      if (!isVerdantly && !isAi && previewPlant.harvest_season) {
        await supabase.from("plant_schedules").insert([{
          home_id:         homeId,
          plant_id:        savedPlant.id,
          title:           `${previewPlant.harvest_season} Harvest Season`,
          description:     "Auto-generated from Perenual Database",
          task_type:       "Harvesting",
          trigger_event:   "Planted",
          start_reference: "Seasonal: 09-01",
          end_reference:   "Seasonal: 11-30",
          start_offset_days: 0,
          end_offset_days:   0,
          frequency_days:  1,
          is_recurring:    true,
        }]);
      }

      toast.success(`${previewPlant.common_name} added to your Shed!`);
      onSuccess(savedPlant);
    } catch (err: any) {
      toast.error(err.message || "Failed to add plant.");
    } finally {
      setIsAdding(false);
    }
  };

  // 🚀 SSR Safety
  if (typeof document === "undefined") return null;

  // 🚀 LOGIC FOR PREMIUM LOCK
  if (!isPremium) {
    return createPortal(
      <div data-testid="plant-search-perenual-gate" className={`fixed inset-0 ${zIndexClassName} flex items-center justify-center p-4 bg-rhozly-bg/95 backdrop-blur-xl animate-in fade-in`}>
        <div className="bg-rhozly-surface-lowest w-full max-w-md p-8 rounded-[3rem] shadow-2xl border border-rhozly-outline/20 text-center relative">
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="absolute top-6 right-6 p-2 bg-rhozly-surface-low rounded-xl text-rhozly-on-surface/40 hover:text-rhozly-on-surface"
          >
            <X size={20} />
          </button>
          <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6 text-amber-600">
            <Lock size={32} />
          </div>
          <h3 className="text-2xl font-black mb-2">Global Database Access</h3>
          <p className="text-sm font-bold text-rhozly-on-surface/60 mb-8">
            Upgrade to Premium to instantly import detailed care guides, images,
            and watering benchmarks for over 10,000 species.
          </p>
          <button className="w-full py-4 bg-rhozly-primary text-white rounded-2xl font-black shadow-xl hover:scale-105 transition-transform">
            Upgrade Now
          </button>
        </div>
      </div>,
      document.body,
    );
  }

  // 🚀 MAIN MODAL PORTAL
  return createPortal(
    <div className={`fixed inset-0 ${zIndexClassName} flex items-center justify-center p-4 bg-rhozly-bg/95 backdrop-blur-xl animate-in fade-in`}>
      <div
        ref={modalRef}
        className="bg-rhozly-surface-lowest w-full max-w-2xl h-[85vh] flex flex-col rounded-[3rem] shadow-2xl border border-rhozly-outline/20 overflow-hidden relative"
      >
        {isFetchingPreview && (
          <div className="absolute inset-0 bg-white/50 backdrop-blur-sm z-50 flex flex-col items-center justify-center animate-in fade-in">
            <Loader2
              className="animate-spin text-rhozly-primary mb-2"
              size={32}
            />
            <p className="font-bold text-sm">Loading encyclopedia data...</p>
          </div>
        )}

        <div className="p-4 sm:p-8 pb-4 shrink-0 flex justify-between items-start border-b border-rhozly-outline/10">
          <div>
            <h3 className="text-3xl font-black flex items-center gap-3">
              <IconPlantDB className="text-rhozly-primary" /> Global Plant Search
            </h3>
            <p className="text-[10px] font-black text-rhozly-on-surface/40 uppercase tracking-widest mt-1">
              Powered by Perenual &amp; Verdantly
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="p-3 bg-rhozly-surface-low rounded-2xl hover:scale-110 transition-transform"
          >
            <X size={24} />
          </button>
        </div>

        {previewPlant ? (
          <div className="flex-1 overflow-y-auto p-4 sm:p-8 custom-scrollbar animate-in slide-in-from-right-4 flex flex-col">
            <button
              onClick={() => setPreviewPlant(null)}
              className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-rhozly-on-surface/50 hover:text-rhozly-primary mb-6 transition-colors"
            >
              <ChevronLeft size={16} /> Back to Results
            </button>

            <div className="flex-1">
              <ManualPlantCreation
                initialData={previewPlant}
                isReadOnly={true}
              />
            </div>

            <div className="mt-8 pt-4 border-t border-rhozly-outline/10 shrink-0">
              <button
                onClick={handleAddToShed}
                disabled={isAdding}
                className="w-full py-4 bg-rhozly-primary text-white rounded-2xl font-black shadow-lg hover:scale-[1.02] transition-transform flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isAdding ? (
                  <Loader2 className="animate-spin" size={20} />
                ) : (
                  <>
                    <Plus size={20} /> Add {previewPlant.common_name} to My Shed
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="p-4 sm:p-8 pb-4 shrink-0">
              {searchError && (
                <div className="mb-3 flex items-center justify-between gap-3 bg-red-50 border border-red-200 text-red-700 rounded-2xl px-4 py-3">
                  <p className="text-xs font-black">Search failed. Check your connection and try again.</p>
                  <button
                    type="button"
                    onClick={() => performSearch(query)}
                    className="shrink-0 px-3 py-1.5 bg-red-600 text-white text-xs font-black rounded-xl hover:bg-red-700 transition-colors"
                  >
                    Retry
                  </button>
                </div>
              )}
              <form
                onSubmit={handleSearch}
                className="relative flex items-center"
              >
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder={searchMode === "scientific" ? "Search by scientific name, e.g. Monstera deliciosa..." : "Search by common name, e.g. Swiss Cheese Plant..."}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleResultsKeyDown}
                  aria-label={`Search for plants by ${searchMode} name`}
                  className="w-full pl-6 pr-14 py-4 bg-rhozly-surface-low rounded-2xl font-bold border border-transparent focus:border-rhozly-primary outline-none"
                />
                <button
                  type="submit"
                  aria-label="Search"
                  className="absolute right-2 p-2 bg-rhozly-primary text-white rounded-xl hover:scale-105 transition-transform"
                >
                  <Search size={20} />
                </button>
              </form>
              <div className="flex items-center gap-2 mt-3">
                <span className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40">Search by:</span>
                <button
                  type="button"
                  data-testid="search-mode-common"
                  onClick={() => switchMode("common")}
                  className={`px-3 py-1 rounded-full text-[11px] font-black transition-colors ${searchMode === "common" ? "bg-rhozly-primary text-white" : "bg-rhozly-surface-low text-rhozly-on-surface/50 hover:text-rhozly-on-surface"}`}
                >
                  Common Name
                </button>
                <button
                  type="button"
                  data-testid="search-mode-scientific"
                  onClick={() => switchMode("scientific")}
                  className={`px-3 py-1 rounded-full text-[11px] font-black transition-colors ${searchMode === "scientific" ? "bg-rhozly-primary text-white" : "bg-rhozly-surface-low text-rhozly-on-surface/50 hover:text-rhozly-on-surface"}`}
                >
                  Scientific Name
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-8 pt-0 custom-scrollbar space-y-4">
              {isSearching ? (
                <div className="flex flex-col items-center justify-center h-40 opacity-50">
                  <Loader2
                    className="animate-spin text-rhozly-primary mb-4"
                    size={32}
                  />
                  <p className="font-bold text-sm">Searching Database...</p>
                </div>
              ) : visibleResults.length > 0 ? (
                (() => {
                  // Build sections in the canonical order. `flatIndex`
                  // tracks the running position across all three buckets
                  // so the keyboard-nav highlight maps correctly.
                  const sections: Array<{
                    key: "ai" | "perenual" | "verdantly";
                    label: string;
                    chipBg: string;
                    chipText: string;
                    items: ProviderSearchResult[];
                    hasMore: boolean;
                    loadingMore: boolean;
                    onLoadMore: () => void;
                  }> = [
                    {
                      key: "ai",
                      label: "Rhozly AI suggestions",
                      chipBg: "bg-amber-100",
                      chipText: "text-amber-700",
                      items: rankedAi,
                      hasMore: aiHasMore,
                      loadingMore: aiLoadingMore,
                      onLoadMore: loadMoreAi,
                    },
                    {
                      key: "perenual",
                      label: "Perenual",
                      chipBg: "bg-blue-100",
                      chipText: "text-blue-700",
                      // Perenual returns ~30 per API page; show 10 at a
                      // time and let "Show more" reveal the rest, then
                      // fetch the next page when the current batch runs
                      // out (see `loadMorePerenual`).
                      items: rankedPerenual.slice(0, perenualVisibleCount),
                      hasMore: perenualCanShowMore,
                      loadingMore: perenualLoadingMore,
                      onLoadMore: loadMorePerenual,
                    },
                    {
                      key: "verdantly",
                      label: "Verdantly",
                      chipBg: "bg-emerald-100",
                      chipText: "text-emerald-700",
                      items: rankedVerdantly,
                      hasMore: verdantlyHasMore,
                      loadingMore: verdantlyLoadingMore,
                      onLoadMore: loadMoreVerdantly,
                    },
                  ];

                  let flatIndex = -1;
                  return sections
                    .filter((section) => section.items.length > 0)
                    .map((section) => (
                      <div key={section.key} className="space-y-3">
                        <div className="flex items-center justify-between px-1">
                          <span
                            className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full ${section.chipBg} ${section.chipText}`}
                          >
                            {section.label}
                          </span>
                          <span className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/35">
                            {section.items.length}{section.hasMore ? "+" : ""} results
                          </span>
                        </div>
                        {section.items.map((plant) => {
                          flatIndex += 1;
                          const prefScore = scorePlantByPreferences(
                            plant.common_name || "",
                            plant.scientific_name?.[0] || "",
                            preferences,
                          );
                          const isSelected = flatIndex === selectedResultIndex;
                          // AI results carry no thumbnail from the
                          // search endpoint — use the prefetched lookup
                          // from `plant-image-search`. Empty string in
                          // the map = "looked up, none found" → fall
                          // back to the placeholder.
                          const aiThumb =
                            plant._provider === "ai"
                              ? aiThumbs.get(plant.common_name?.toLowerCase() ?? "")
                              : undefined;
                          const rawThumb = aiThumb ?? plant.thumbnail_url;
                          const thumb = rawThumb?.includes("upgrade_access")
                            ? null
                            : rawThumb || null;
                          const providerLabel = getProviderLabel(plant._provider);
                          const inShed = findShedMatch({
                            source: plant._provider === "verdantly" ? "verdantly" : plant._provider === "ai" ? "ai" : "api",
                            perenual_id: plant._provider !== "verdantly" && plant._provider !== "ai" ? (plant.perenual_id ?? plant.id) : undefined,
                            verdantly_id: plant._provider === "verdantly" ? (plant.verdantly_id ?? plant.id) : undefined,
                            common_name: plant.common_name,
                          });
                          return (
                            <div
                              key={`${plant._provider}-${plant.id}`}
                              tabIndex={0}
                              role="button"
                              aria-label={`View ${plant.common_name}`}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  handlePreviewPlant(plant);
                                }
                              }}
                              onClick={() => handlePreviewPlant(plant)}
                              className={`bg-rhozly-surface-lowest p-4 rounded-2xl border shadow-sm flex items-center justify-between group transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-rhozly-primary/40 ${
                                isSelected
                                  ? "border-rhozly-primary ring-2 ring-rhozly-primary/20"
                                  : "border-rhozly-outline/10 hover:border-rhozly-primary/30"
                              }`}
                            >
                              <div className="flex items-center gap-4">
                                <div className="relative w-16 h-16 rounded-xl bg-rhozly-primary/5 overflow-hidden shrink-0">
                                  {thumb ? (
                                    <img
                                      src={thumb}
                                      alt={plant.common_name}
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-rhozly-on-surface/20">
                                      <IconPlantDB size={24} />
                                    </div>
                                  )}
                                  <MultiImageGallery
                                    query={`${plant.common_name} ${plant.scientific_name?.[0] ?? ""} plant`}
                                    label={plant.common_name}
                                    existingImageUrl={thumb}
                                    triggerClassName="absolute bottom-1 right-1"
                                    compact
                                  />
                                </div>
                                <div>
                                  <div className="flex items-center gap-2 mb-0.5">
                                    <h4 className="font-black text-lg text-rhozly-on-surface leading-tight">
                                      {plant.common_name}
                                    </h4>
                                    {providerLabel && (
                                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full shrink-0 ${
                                        providerLabel === "Verdantly"
                                          ? "bg-emerald-100 text-emerald-700"
                                          : providerLabel === "Rhozly AI"
                                            ? "bg-amber-100 text-amber-700"
                                            : "bg-blue-100 text-blue-700"
                                      }`}>
                                        {providerLabel}
                                      </span>
                                    )}
                                    {inShed && (
                                      <span
                                        data-testid="search-result-in-shed"
                                        title="This plant is already in your shed"
                                        className="text-[10px] font-black px-2 py-0.5 rounded-full shrink-0 bg-emerald-100 text-emerald-700"
                                      >
                                        In your shed
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs font-bold text-rhozly-on-surface/50 italic">
                                    {plant.scientific_name?.[0]}
                                  </p>
                                  {prefScore > 0 && (
                                    <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                                      <IconAI size={9} /> Matches your preference
                                    </span>
                                  )}
                                </div>
                              </div>
                              <button
                                onClick={() => handlePreviewPlant(plant)}
                                className="px-4 py-2 bg-rhozly-primary/10 text-rhozly-primary font-black text-xs uppercase tracking-widest rounded-xl hover:bg-rhozly-primary hover:text-white transition-all active:scale-95"
                              >
                                View
                              </button>
                            </div>
                          );
                        })}
                        {section.hasMore && (
                          <button
                            type="button"
                            data-testid={`plant-search-load-more-${section.key}`}
                            onClick={section.onLoadMore}
                            disabled={section.loadingMore}
                            className="w-full py-2.5 rounded-2xl bg-rhozly-primary/5 hover:bg-rhozly-primary/10 text-rhozly-primary text-xs font-black uppercase tracking-widest inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                          >
                            {section.loadingMore ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <Plus size={13} />
                            )}
                            Show more {section.label.replace("Rhozly AI suggestions", "AI suggestions")}
                          </button>
                        )}
                      </div>
                    ));
                })()
              ) : hasSearched ? (
                <div className="h-full flex flex-col items-center justify-center text-center px-4">
                  <Search
                    size={48}
                    className="mb-4 text-rhozly-on-surface/30"
                  />
                  <p className="font-black text-lg mb-2">No Results Found</p>
                  <p className="text-sm font-bold text-rhozly-on-surface/60 mb-6">
                    No plants matched "{query}"
                  </p>
                  <button
                    type="button"
                    data-testid="try-other-name-type"
                    onClick={() => switchMode(searchMode === "common" ? "scientific" : "common")}
                    className="w-full max-w-xs py-3 px-6 bg-rhozly-primary/10 text-rhozly-primary font-black text-sm rounded-2xl hover:bg-rhozly-primary hover:text-white transition-all active:scale-95 mb-4"
                  >
                    Try {searchMode === "common" ? "Scientific" : "Common"} Name Search
                  </button>
                  <p className="text-xs font-bold text-rhozly-on-surface/40">
                    {searchMode === "common"
                      ? "Switch to scientific name — e.g. \"Monstera deliciosa\" instead of \"Swiss Cheese Plant\""
                      : "Switch to common name — e.g. \"peace lily\" instead of \"Spathiphyllum wallisii\""}
                  </p>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
                  <Search
                    size={48}
                    className="mb-4 text-rhozly-on-surface/50"
                  />
                  <p className="font-black text-lg">Find Any Plant</p>
                  <p className="text-sm font-bold mt-1">
                    Search the global database to auto-fill your care guides.
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
