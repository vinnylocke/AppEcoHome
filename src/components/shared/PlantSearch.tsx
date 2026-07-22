import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSearchPreference } from "../../lib/searchPreference";
import ImageDisclaimer from "../ImageDisclaimer";
import { Search, Loader2, Sparkles, Database, Plus, Pencil, Lock, SlidersHorizontal, ChevronDown, Check, Info, ChevronUp, BookOpen, Heart } from "lucide-react";
import {
  isLibraryResultFavourited,
  type FavouriteLookup,
} from "../../lib/libraryFavouriteMatch";
import {
  searchLibrary,
  didYouMean,
  aiSuggestPlantNames,
  searchExternalPaged,
  cursorHasMore,
  createWithAI,
  libraryRowToSelection,
  providerResultToSelection,
  countActiveFilters,
  type PlantSelection,
  type PlantFilters,
  type ProviderCursor,
} from "../../lib/unifiedPlantSearch";
import type { PlantLibraryRow } from "../../services/plantLibraryAdminService";
import type { ProviderSearchResult, PlantDetails } from "../../lib/verdantlyUtils";
import { getProviderPlantDetails } from "../../lib/plantProvider";
import { libraryRowToPlantDetails } from "../../lib/plantCatalogue";
import { formatOtherNames } from "../../lib/plantNames";
import { Logger } from "../../lib/errorHandler";
import PlantInfoPanel from "../PlantInfoPanel";
import PlantResultThumb from "../PlantResultThumb";

export interface PlantSearchGates {
  /** Botanist+ — may opt into Perenual + Verdantly ("more databases"). */
  canSearchExternal: boolean;
  /** Sage+ — may create a plant with AI (enriches + adds to the library). */
  canCreateWithAI: boolean;
}

interface Props {
  homeId: string;
  gates: PlantSearchGates;
  onSelect: (sel: PlantSelection) => void;
  /** Show an "Add manually" fallback that emits a manual PlantSelection. */
  allowManual?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
  /** Seed the input (e.g. from a ?q= URL param) and run an initial search. */
  initialQuery?: string;
  /** Seed the structured filters (mount-only, like initialQuery) and run an
   *  initial browse-by-filter search — the Shed's persona browse chips
   *  ("Edible favourites" etc.) open the search pre-filtered this way
   *  (overhaul Stage 3). Also auto-opens the filter panel so the seeded
   *  filters are visible. */
  initialFilters?: PlantFilters;
  /** Notified whenever the query changes — lets hosts sync URL / sessionStorage. */
  onQueryChange?: (query: string) => void;
  /** Show the structured filter panel (cycle / sunlight / edible / indoor). */
  showFilters?: boolean;
  /** Multi-select mode — rows show a checkbox and onSelect toggles. Host owns the set. */
  multiSelect?: boolean;
  /** In multiSelect mode, returns whether a given selection is currently picked. */
  isSelected?: (sel: PlantSelection) => boolean;
  /** Show a per-row info (ⓘ) button that expands an inline details preview
   *  without selecting the row. Used by Add-to-Shed so users can inspect a
   *  plant before adding it to the cart. */
  allowPreview?: boolean;
  /** When set (with allowPreview), the inline preview gains a "See full care"
   *  button that hands the selection to the host (e.g. to open the full
   *  care / grow guide / companions detail modal). */
  onViewDetails?: (sel: PlantSelection) => void;
  /** Controlled mode (hub search overlay, 2026-07-21): the host owns the
   *  input in its pinned top bar and feeds the live query down. PlantSearch
   *  hides its own input row + empty-state prompt and searches (debounced)
   *  whenever this value changes. Suggestion chips report back through
   *  `onQueryChange` so the host input stays in sync. */
  controlledQuery?: string;
  /** Overlay result contract: tapping the row body opens the full detail
   *  (via onViewDetails) instead of selecting; adding happens only on the
   *  trailing + button. The inline ⓘ preview is hidden (redundant). */
  tapOpensDetails?: boolean;
  /** Hub v3 Stage E — when supplied, result rows matching one of the user's
   *  favourite plants show a filled ♥ glyph (build via buildFavouriteLookup). */
  favouriteLookup?: FavouriteLookup;
}

const CYCLE_OPTIONS = [
  { value: "perennial", label: "Perennial" },
  { value: "annual", label: "Annual" },
  { value: "biennial", label: "Biennial" },
];
const SUNLIGHT_OPTIONS = [
  { value: "full_sun", label: "Full Sun" },
  { value: "part_shade", label: "Part Shade" },
  { value: "full_shade", label: "Full Shade" },
];

function toggleArr(arr: string[] | undefined, v: string): string[] | undefined {
  const cur = arr ?? [];
  const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
  return next.length ? next : undefined;
}

// One distinct colour per source (2026-07-22) — Perenual previously wore the
// Library colours, so "which API is this from?" was invisible at a glance.
// Library = house green, Perenual = sky, Verdantly = emerald, AI = amber.
const SOURCE_BADGE: Record<string, { label: string; className: string }> = {
  library:   { label: "Library",   className: "text-rhozly-primary bg-rhozly-primary/10" },
  perenual:  { label: "Perenual",  className: "text-sky-700 bg-sky-100" },
  verdantly: { label: "Verdantly", className: "text-emerald-700 bg-emerald-100" },
  ai:        { label: "AI",        className: "text-amber-600 bg-amber-100" },
};

/**
 * Library-first unified plant search. Renders local plant_library results
 * instantly + free for every tier, with "did you mean?" spelling help, and
 * opt-in CTAs to search external databases (Botanist+) or create with AI
 * (Sage+). Emits a normalised `PlantSelection`; the host decides what
 * "select" does.
 */
export default function PlantSearch({
  homeId,
  gates,
  onSelect,
  allowManual = false,
  autoFocus = false,
  placeholder = "Search any plant…",
  initialQuery = "",
  initialFilters,
  onQueryChange,
  showFilters = false,
  multiSelect = false,
  isSelected,
  allowPreview = false,
  onViewDetails,
  controlledQuery,
  tapOpensDetails = false,
  favouriteLookup,
}: Props) {
  const [query, setQuery] = useState(controlledQuery ?? initialQuery);
  const [libraryRows, setLibraryRows] = useState<PlantLibraryRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  /** Semantic AI suggestions — fired when the library + trigram both
   *  return nothing AND the user is AI-tier-eligible. Surfaces likely
   *  cultivar / variety matches the catalogue hasn't seen yet. */
  const [aiSuggestions, setAiSuggestions] = useState<Array<{ name: string; reason: string }>>([]);
  const [aiSuggestLoading, setAiSuggestLoading] = useState(false);
  const [externalRows, setExternalRows] = useState<ProviderSearchResult[]>([]);
  const [externalLoading, setExternalLoading] = useState(false);
  const [externalDone, setExternalDone] = useState(false);
  // Scroll-to-load-more (2026-07-22): per-provider page cursors returned by
  // searchExternalPaged. Null until the first external fetch; a sentinel at the
  // bottom of the external section keeps fetching pages while any provider
  // reports more.
  const [externalCursor, setExternalCursor] = useState<ProviderCursor | null>(null);
  const [externalLoadingMore, setExternalLoadingMore] = useState(false);
  const loadingMoreRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const externalCursorRef = useRef<ProviderCursor | null>(null);
  externalCursorRef.current = externalCursor;
  const externalRowsRef = useRef<ProviderSearchResult[]>([]);
  externalRowsRef.current = externalRows;
  const [aiCreating, setAiCreating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [filters, setFilters] = useState<PlantFilters>(initialFilters ?? {});
  const [filterPanelOpen, setFilterPanelOpen] = useState(
    () => countActiveFilters(initialFilters ?? {}) > 0,
  );

  // Inline details preview (opt-in via allowPreview). Keyed by the row's
  // stable testId so each row tracks its own expand/loading/details.
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [previewCache, setPreviewCache] = useState<Map<string, PlantDetails | null>>(new Map());
  const [previewLoading, setPreviewLoading] = useState<Set<string>>(new Set());

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seqRef = useRef(0);
  // Filters are read inside runLibrary; keep a ref so the latest value is
  // used without runLibrary needing to be re-created on every filter change.
  const filtersRef = useRef<PlantFilters>(filters);
  filtersRef.current = filters;
  // Keep gates in a ref so the stable `runLibrary` callback can read the
  // current AI-tier flag without restarting on every prop change.
  const gatesRef = useRef<PlantSearchGates>(gates);
  gatesRef.current = gates;

  // Default search source (Settings). Drives the auto-run "preferred first"
  // behaviour + the now-gated external tier (Verdantly + Perenual = enable_perenual).
  const pref = useSearchPreference();
  const prefRef = useRef(pref);
  prefRef.current = pref;
  const homeIdRef = useRef(homeId);
  homeIdRef.current = homeId;
  const canExternal = gates.canSearchExternal && pref.enablePerenual;

  const runLibrary = useCallback(async (q: string) => {
    const trimmed = q.trim();
    const activeFilters = filtersRef.current;
    const filterCount = countActiveFilters(activeFilters);
    // Reset the opt-in tiers whenever the query/filters change.
    setExternalRows([]);
    setExternalDone(false);
    setExternalCursor(null);
    setAiError(null);
    setAiSuggestions([]);
    // Need either a 2+ char query OR at least one active filter (browse-by-filter).
    if (trimmed.length < 2 && filterCount === 0) {
      setLibraryRows([]);
      setSuggestions([]);
      setSearching(false);
      return;
    }
    const seq = ++seqRef.current;
    setSearching(true);
    try {
      const { rows } = await searchLibrary(trimmed, { pageSize: 12, filters: activeFilters });
      if (seq !== seqRef.current) return; // stale
      setLibraryRows(rows);
      // Spelling suggestions when a typed query returns thin results.
      if (trimmed.length >= 2 && rows.length <= 1) {
        const sugg = await didYouMean(trimmed);
        if (seq === seqRef.current) setSuggestions(sugg);
      } else {
        setSuggestions([]);
      }
      // Semantic AI suggestions when library AND trigram both come up
      // empty AND the user is AI-tier-eligible. This catches the
      // cultivar / variety case ("Sungold Tomato") where the user knows
      // exactly what they want but the catalogue hasn't indexed it.
      if (
        gatesRef.current.canCreateWithAI &&
        trimmed.length >= 3 &&
        rows.length === 0
      ) {
        setAiSuggestLoading(true);
        try {
          const ai = await aiSuggestPlantNames(trimmed);
          if (seq === seqRef.current) setAiSuggestions(ai);
        } finally {
          if (seq === seqRef.current) setAiSuggestLoading(false);
        }
      }

      // Preferred-source default — auto-run the user's chosen first source (no
      // button click) when it's a provider. The library above is the fallback;
      // the render shows the preferred section first. Min length 3 + the 350ms
      // debounce keep paid-source (Perenual/Verdantly/AI) spend sane.
      const prefSource = prefRef.current.plantSource;
      if (prefSource !== "library" && trimmed.length >= 3) {
        setExternalLoading(true);
        try {
          const ext = prefSource === "ai"
            ? await searchExternalPaged(trimmed, null, { includeAi: true, only: ["ai"], homeId: homeIdRef.current })
            : await searchExternalPaged(trimmed, null, { only: [prefSource], homeId: homeIdRef.current });
          if (seq === seqRef.current) {
            setExternalRows(ext.results);
            setExternalCursor(ext.cursor);
            setExternalDone(true);
          }
        } finally {
          if (seq === seqRef.current) setExternalLoading(false);
        }
      }
    } catch (err) {
      Logger.error("PlantSearch library search failed", err, { q: trimmed });
      if (seq === seqRef.current) { setLibraryRows([]); setSuggestions([]); }
    } finally {
      if (seq === seqRef.current) setSearching(false);
    }
  }, []);

  const onChange = (val: string) => {
    setQuery(val);
    onQueryChange?.(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runLibrary(val), 350);
  };

  // Suggestion chips ("did you mean" / AI "try") apply a query directly —
  // in controlled mode the host input must follow, so route through
  // onQueryChange as well as searching immediately.
  const applyQuery = (val: string) => {
    setQuery(val);
    onQueryChange?.(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    runLibrary(val);
  };

  // Controlled mode — follow the host-owned input. Skips values we already
  // hold (applyQuery echoes back through onQueryChange → host → here).
  const queryRef = useRef(query);
  queryRef.current = query;
  useEffect(() => {
    if (controlledQuery === undefined) return;
    if (controlledQuery === queryRef.current) return;
    setQuery(controlledQuery);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runLibrary(controlledQuery), 350);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlledQuery]);
  const isControlled = controlledQuery !== undefined;

  const applyFilter = (next: PlantFilters) => {
    setFilters(next);
    filtersRef.current = next;
    runLibrary(query);
  };

  // Run an initial search when seeded with a query (e.g. ?q= on /library) OR
  // with filters (the browse chips — empty query + filters = browse-by-filter,
  // which runLibrary supports natively).
  useEffect(() => {
    const seed = controlledQuery ?? initialQuery;
    if (seed.trim().length >= 2 || countActiveFilters(initialFilters ?? {}) > 0) {
      runLibrary(seed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeFilterCount = countActiveFilters(filters);

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  const handleSearchExternal = async () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setExternalLoading(true);
    try {
      const { results, cursor } = await searchExternalPaged(trimmed, null, { includeAi: false, homeId });
      setExternalRows(results);
      setExternalCursor(cursor);
      setExternalDone(true);
    } catch (err) {
      Logger.error("PlantSearch external search failed", err, { q: trimmed });
      setExternalDone(true);
    } finally {
      setExternalLoading(false);
    }
  };

  // Fetch the next provider page(s) when the sentinel scrolls into view.
  // Appended rows dedupe by provider identity — providers can overlap page
  // boundaries when their catalogues shift between requests.
  const loadMoreExternal = useCallback(async () => {
    const cursor = externalCursorRef.current;
    if (!cursor || !cursorHasMore(cursor) || loadingMoreRef.current) return;
    const trimmed = queryRef.current.trim();
    if (!trimmed) return;
    const seq = seqRef.current;
    loadingMoreRef.current = true;
    setExternalLoadingMore(true);
    try {
      const { results, cursor: nextCursor } = await searchExternalPaged(trimmed, cursor, { homeId: homeIdRef.current });
      if (seq !== seqRef.current) return; // a new query superseded this page
      const seen = new Set(externalRowsRef.current.map((r) => `${r._provider}:${r.id}`));
      const fresh = results.filter((r) => !seen.has(`${r._provider}:${r.id}`));
      setExternalRows((prev) => [...prev, ...fresh]);
      setExternalCursor(nextCursor);
    } catch (err) {
      Logger.error("PlantSearch external load-more failed", err, { q: trimmed });
      if (seq === seqRef.current) setExternalCursor(null); // retire the sentinel
    } finally {
      loadingMoreRef.current = false;
      if (seq === seqRef.current) setExternalLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMoreExternal();
      },
      { rootMargin: "200px" },
    );
    obs.observe(node);
    return () => obs.disconnect();
    // externalCursor in deps: the sentinel mounts/unmounts with cursorHasMore,
    // so the observer must re-attach when the cursor changes.
  }, [loadMoreExternal, externalCursor]);

  const handleCreateWithAI = async () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setAiCreating(true);
    setAiError(null);
    try {
      const plant = await createWithAI(trimmed);
      // Re-run the library search so the freshly-created plant appears as a
      // normal library row, then auto-select it for convenience.
      await runLibrary(trimmed);
      onSelect({ source: "library", common_name: plant.common_name, library_id: plant.id });
    } catch (err: any) {
      setAiError(err?.message ?? "Couldn't create that plant.");
    } finally {
      setAiCreating(false);
    }
  };

  // Toggle the inline details preview for a row. Library rows resolve
  // instantly from the row we already hold; provider rows fetch on demand.
  const togglePreview = async (sel: PlantSelection, key: string) => {
    if (previewKey === key) { setPreviewKey(null); return; }
    setPreviewKey(key);
    if (previewCache.has(key)) return;
    if (sel.source === "library" && sel.raw) {
      setPreviewCache((prev) => new Map(prev).set(key, libraryRowToPlantDetails(sel.raw)));
      return;
    }
    if (sel.source !== "perenual" && sel.source !== "verdantly") {
      setPreviewCache((prev) => new Map(prev).set(key, null));
      return;
    }
    setPreviewLoading((prev) => new Set(prev).add(key));
    try {
      const details = await getProviderPlantDetails({
        source: sel.source === "verdantly" ? "verdantly" : "api",
        perenual_id: sel.source === "verdantly" ? null : (sel.perenual_id ?? (sel.raw as any)?.id ?? null),
        verdantly_id: sel.source === "verdantly" ? (sel.verdantly_id ?? (sel.raw as any)?.id ?? null) : null,
      });
      setPreviewCache((prev) => new Map(prev).set(key, details));
    } catch (err) {
      Logger.warn("PlantSearch preview fetch failed", err, { key });
      setPreviewCache((prev) => new Map(prev).set(key, null));
    } finally {
      setPreviewLoading((prev) => { const s = new Set(prev); s.delete(key); return s; });
    }
  };

  // Inline preview body for an expanded row: the details panel plus an
  // optional "See full care" hand-off to the host's detail modal.
  const renderPreview = (rowKey: string, name: string, sel: PlantSelection) => {
    if (previewKey !== rowKey) return null;
    return (
      <>
        <PlantInfoPanel
          details={previewCache.get(rowKey) ?? null}
          loading={previewLoading.has(rowKey)}
          plantName={name}
        />
        {onViewDetails && (
          <div className="px-4 pb-4">
            <button
              type="button"
              data-testid={`${rowKey}-full-care`}
              onClick={() => onViewDetails(sel)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl border border-rhozly-primary/30 text-xs font-black text-rhozly-primary hover:bg-rhozly-primary/5 transition-colors"
            >
              <BookOpen size={14} /> See full care
            </button>
          </div>
        )}
      </>
    );
  };

  const hasCriteria = query.trim().length >= 2 || activeFilterCount > 0;
  const hasQuery = query.trim().length >= 2;
  const noLibraryResults = hasCriteria && !searching && libraryRows.length === 0;

  return (
    <div data-testid="plant-search" className="space-y-3">
      {/* Input (+ filters toggle). In controlled mode the host owns the input
          (pinned in its top bar) — only the filters toggle renders here, as a
          slim right-aligned row so filter logic stays encapsulated. */}
      {isControlled ? (
        showFilters && (
          <div className="flex items-center justify-end gap-2">
            {searching && (
              <Loader2 size={14} className="animate-spin text-rhozly-on-surface/40" />
            )}
            <button
              type="button"
              data-testid="plant-search-filters-toggle"
              onClick={() => setFilterPanelOpen((v) => !v)}
              className={`relative shrink-0 flex items-center gap-1.5 px-3 min-h-[40px] pointer-coarse:min-h-11 rounded-2xl text-xs font-black border transition-colors ${filterPanelOpen ? "bg-rhozly-primary text-white border-rhozly-primary" : "bg-white text-rhozly-on-surface/70 border-rhozly-outline/20 hover:border-rhozly-primary/30"}`}
            >
              <SlidersHorizontal size={15} />
              Filters
              {activeFilterCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-rhozly-primary text-white rounded-full text-[9px] font-black flex items-center justify-center border-2 border-white">
                  {activeFilterCount}
                </span>
              )}
              <ChevronDown size={13} className={`transition-transform ${filterPanelOpen ? "rotate-180" : ""}`} />
            </button>
          </div>
        )
      ) : (
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-rhozly-on-surface/40 pointer-events-none" />
            <input
              type="search"
              data-testid="plant-search-input"
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus={autoFocus}
              placeholder={placeholder}
              value={query}
              onChange={(e) => onChange(e.target.value)}
              className="w-full pl-10 pr-9 py-3 min-h-[48px] rounded-2xl bg-white border border-rhozly-outline/20 text-sm font-bold text-rhozly-on-surface placeholder:text-rhozly-on-surface/40 outline-none focus:border-rhozly-primary/50"
            />
            {searching && (
              <Loader2 size={15} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-rhozly-on-surface/40" />
            )}
          </div>
          {showFilters && (
            <button
              type="button"
              data-testid="plant-search-filters-toggle"
              onClick={() => setFilterPanelOpen((v) => !v)}
              className={`relative shrink-0 flex items-center gap-1.5 px-3 min-h-[48px] rounded-2xl text-xs font-black border transition-colors ${filterPanelOpen ? "bg-rhozly-primary text-white border-rhozly-primary" : "bg-white text-rhozly-on-surface/70 border-rhozly-outline/20 hover:border-rhozly-primary/30"}`}
            >
              <SlidersHorizontal size={15} />
              {activeFilterCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-rhozly-primary text-white rounded-full text-[9px] font-black flex items-center justify-center border-2 border-white">
                  {activeFilterCount}
                </span>
              )}
              <ChevronDown size={13} className={`transition-transform ${filterPanelOpen ? "rotate-180" : ""}`} />
            </button>
          )}
        </div>
      )}

      {/* Filter panel — capped height + internal scroll for mobile. */}
      {showFilters && filterPanelOpen && (
        <div
          data-testid="plant-search-filter-panel"
          className="bg-rhozly-surface-low rounded-2xl p-4 space-y-3 max-h-[45vh] overflow-y-auto custom-scrollbar"
        >
          <FilterChipRow
            label="Cycle"
            options={CYCLE_OPTIONS}
            selected={filters.cycle}
            onToggle={(v) => applyFilter({ ...filters, cycle: toggleArr(filters.cycle, v) })}
          />
          <FilterChipRow
            label="Sunlight"
            options={SUNLIGHT_OPTIONS}
            selected={filters.sunlight}
            onToggle={(v) => applyFilter({ ...filters, sunlight: toggleArr(filters.sunlight, v) })}
          />
          <div className="flex flex-wrap gap-2">
            <TriToggle
              label="Edible"
              value={filters.edible}
              onCycle={() => applyFilter({ ...filters, edible: cycleTri(filters.edible) })}
            />
            <TriToggle
              label="Indoor"
              value={filters.indoor}
              onCycle={() => applyFilter({ ...filters, indoor: cycleTri(filters.indoor) })}
            />
          </div>
          {activeFilterCount > 0 && (
            <button
              type="button"
              data-testid="plant-search-filters-clear"
              onClick={() => applyFilter({})}
              className="text-[11px] font-black uppercase tracking-widest text-rhozly-on-surface/45 hover:text-rhozly-primary"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Empty prompt — controlled hosts render their own idle state. */}
      {!hasCriteria && !isControlled && (
        <p data-testid="plant-search-prompt" className="text-[12px] font-bold text-rhozly-on-surface/45 px-1 leading-snug">
          Start typing a plant name — e.g. <span className="text-rhozly-primary">"tomato"</span> or <span className="text-rhozly-primary">"lavender"</span>{showFilters ? ", or filter by cycle, sunlight and more" : ""}.
        </p>
      )}

      {/* Did you mean? */}
      {suggestions.length > 0 && (
        <div data-testid="plant-search-suggestions" className="flex items-center gap-2 flex-wrap px-1">
          <span className="text-[11px] font-bold text-rhozly-on-surface/50">Did you mean</span>
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => applyQuery(s)}
              className="text-xs font-black text-rhozly-primary bg-rhozly-primary/10 px-3 py-2 min-h-[36px] pointer-coarse:min-h-11 rounded-full hover:bg-rhozly-primary/20 transition-colors"
            >
              {s}
            </button>
          ))}
          <span className="text-[11px] font-bold text-rhozly-on-surface/50">?</span>
        </div>
      )}

      {/* AI semantic suggestions — only when the library + trigram came
          up empty. Each chip shows the suggested name and a brief reason
          on hover. */}
      {(aiSuggestLoading || aiSuggestions.length > 0) && (
        <div
          data-testid="plant-search-ai-suggestions"
          className="flex items-center gap-2 flex-wrap px-1"
        >
          <span className="text-[11px] font-bold text-amber-600/70 flex items-center gap-1">
            <Sparkles size={11} /> Try
          </span>
          {aiSuggestLoading && aiSuggestions.length === 0 && (
            <span className="text-[11px] font-bold text-rhozly-on-surface/40 flex items-center gap-1">
              <Loader2 size={10} className="animate-spin" /> thinking…
            </span>
          )}
          {aiSuggestions.map((s) => (
            <button
              key={s.name}
              type="button"
              title={s.reason || undefined}
              onClick={() => applyQuery(s.name)}
              className="text-xs font-black text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 min-h-[36px] pointer-coarse:min-h-11 rounded-full hover:bg-amber-100 transition-colors"
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {/* Results — when the user set a non-library default, the preferred
          (external) source renders first and the library falls back below. */}
      {(() => {
        const libSection = libraryRows.length > 0 ? (
          <ul className="space-y-1.5" data-testid="plant-search-results">
            {libraryRows.map((row) => {
              const sel = libraryRowToSelection(row);
              const rowKey = `plant-search-result-library-${row.id}`;
              return (
                <ResultRow
                  key={`lib-${row.id}`}
                  testId={rowKey}
                  name={row.common_name}
                  sub={Array.isArray(row.scientific_name) ? row.scientific_name[0] : undefined}
                  other={formatOtherNames((row as any).other_names, [row.common_name, Array.isArray(row.scientific_name) ? row.scientific_name[0] : undefined])}
                  thumb={row.thumbnail_url ?? row.image_url ?? null}
                  credit={(row as any).image_credit ?? null}
                  source="library"
                  fav={!!favouriteLookup && isLibraryResultFavourited(row, favouriteLookup)}
                  multiSelect={multiSelect}
                  selected={multiSelect ? !!isSelected?.(sel) : false}
                  onClick={() => onSelect(sel)}
                  tapOpensDetails={tapOpensDetails && !!onViewDetails}
                  onDetails={() => onViewDetails?.(sel)}
                  allowPreview={allowPreview && !tapOpensDetails}
                  onInfo={() => togglePreview(sel, rowKey)}
                  infoActive={previewKey === rowKey}
                  infoLoading={previewLoading.has(rowKey)}
                  preview={renderPreview(rowKey, row.common_name, sel)}
                />
              );
            })}
          </ul>
        ) : null;

        const extSection = externalRows.length > 0 ? (
          <div className="space-y-1.5">
            <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 px-1">
              {pref.plantSource === "library"
                ? "From other databases"
                : `Your default — ${pref.plantSource === "ai" ? "Rhozly AI" : pref.plantSource === "perenual" ? "Perenual" : "Verdantly"}`}
            </p>
            <ul className="space-y-1.5">
              {externalRows.map((r) => {
                const sel = providerResultToSelection(r);
                const rowKey = `plant-search-result-${r._provider}-${r.id}`;
                return (
                  <ResultRow
                    key={`ext-${r._provider}-${r.id}`}
                    testId={rowKey}
                    name={r.common_name}
                    sub={r.scientific_name?.[0]}
                    other={formatOtherNames((r as any).other_names, [r.common_name, r.scientific_name?.[0]])}
                    thumb={r.thumbnail_url ?? null}
                    credit={(r as any).image_credit ?? null}
                    source={r._provider}
                    fav={
                      !!favouriteLookup &&
                      isLibraryResultFavourited(
                        {
                          common_name: r.common_name,
                          scientific_name: r.scientific_name,
                          perenual_id: r._provider === "perenual" ? r.id : undefined,
                          verdantly_id: r._provider === "verdantly" ? String(r.id) : undefined,
                        },
                        favouriteLookup,
                      )
                    }
                    multiSelect={multiSelect}
                    selected={multiSelect ? !!isSelected?.(sel) : false}
                    onClick={() => onSelect(sel)}
                    tapOpensDetails={tapOpensDetails && !!onViewDetails}
                    onDetails={() => onViewDetails?.(sel)}
                    allowPreview={allowPreview && !tapOpensDetails}
                    onInfo={() => togglePreview(sel, rowKey)}
                    infoActive={previewKey === rowKey}
                    infoLoading={previewLoading.has(rowKey)}
                    preview={renderPreview(rowKey, r.common_name, sel)}
                  />
                );
              })}
            </ul>
            {/* Scroll sentinel (2026-07-22) — while any provider has another
                page, scrolling here fetches it seamlessly; the sentinel
                retires itself once both catalogues are exhausted. */}
            {cursorHasMore(externalCursor) && (
              <div
                ref={sentinelRef}
                data-testid="plant-search-external-sentinel"
                className="flex items-center justify-center py-3"
              >
                {externalLoadingMore && (
                  <Loader2 size={16} className="animate-spin text-rhozly-on-surface/30" />
                )}
              </div>
            )}
          </div>
        ) : null;

        return pref.plantSource !== "library"
          ? <>{extSection}{libSection}</>
          : <>{libSection}{extSection}</>;
      })()}

      {/* Escalation ladder (hub overhaul, 2026-07-21) — quiet, left-aligned,
          result-styled rows appended after real results, sequenced so each
          step appears only when the previous one is exhausted. Never a stack
          of centered CTAs. Testids unchanged (e2e + PO contracts). */}
      {hasQuery && (
        <div className="space-y-2 pt-1">
          {noLibraryResults && externalRows.length === 0 && !externalLoading && (
            <p className="text-[13px] font-bold text-rhozly-on-surface/55 px-1">
              Nothing called "{query.trim()}" yet.
            </p>
          )}

          {/* Step 1 — search wider (Botanist+: Verdantly + Perenual) */}
          {!externalDone && (
            canExternal ? (
              <button
                type="button"
                data-testid="plant-search-external"
                onClick={handleSearchExternal}
                disabled={externalLoading}
                className="w-full flex items-center gap-3 px-3 py-2.5 min-h-[56px] rounded-2xl border border-rhozly-outline/15 bg-white text-left can-hover:hover:border-rhozly-primary/30 transition-colors disabled:opacity-60"
              >
                <span className="w-9 h-9 shrink-0 rounded-xl bg-rhozly-surface-low flex items-center justify-center text-rhozly-on-surface/50">
                  {externalLoading ? <Loader2 size={16} className="animate-spin" /> : <Database size={16} />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-black text-rhozly-on-surface">Search wider</span>
                  <span className="block text-[11px] font-bold text-rhozly-on-surface/45">Perenual + Verdantly plant databases</span>
                </span>
              </button>
            ) : (
              <div className="w-full flex items-center gap-3 px-3 py-2.5 min-h-[56px] rounded-2xl border border-dashed border-rhozly-outline/20 text-left">
                <span className="w-9 h-9 shrink-0 rounded-xl bg-rhozly-surface-low flex items-center justify-center text-rhozly-on-surface/35">
                  <Lock size={14} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-black text-rhozly-on-surface/50">Search wider</span>
                  <span className="block text-[11px] font-bold text-rhozly-on-surface/40">Upgrade to Botanist to search more databases</span>
                </span>
              </div>
            )
          )}

          {/* Step 2 — add it anyway (Sage+, AI-written care details). Only
              once wider search is exhausted (or unavailable to this tier). */}
          {(canExternal ? externalDone && externalRows.length === 0 : noLibraryResults) && (
            gates.canCreateWithAI ? (
              <button
                type="button"
                data-testid="plant-search-create-ai"
                onClick={handleCreateWithAI}
                disabled={aiCreating}
                className="w-full flex items-center gap-3 px-3 py-2.5 min-h-[56px] rounded-2xl border border-amber-200 bg-amber-50/40 text-left can-hover:hover:bg-amber-50 transition-colors disabled:opacity-60"
              >
                <span className="w-9 h-9 shrink-0 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600">
                  {aiCreating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-black text-amber-700">Add "{query.trim()}" anyway</span>
                  <span className="block text-[11px] font-bold text-amber-600/70">We'll write up the care details for you</span>
                </span>
              </button>
            ) : (
              <div className="w-full flex items-center gap-3 px-3 py-2.5 min-h-[56px] rounded-2xl border border-dashed border-amber-200 text-left">
                <span className="w-9 h-9 shrink-0 rounded-xl bg-amber-50 flex items-center justify-center text-amber-400">
                  <Lock size={14} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-black text-amber-600/60">Add "{query.trim()}" anyway</span>
                  <span className="block text-[11px] font-bold text-amber-500/70">Upgrade to Sage and we'll write up the care details</span>
                </span>
              </div>
            )
          )}
          {aiError && <p className="text-[11px] font-bold text-rose-600 px-1">{aiError}</p>}

          {/* Manual fallback */}
          {allowManual && (
            <button
              type="button"
              data-testid="plant-search-manual"
              onClick={() => onSelect({ source: "manual", common_name: query.trim() })}
              className="w-full flex items-center gap-2 px-3 py-2.5 min-h-[48px] rounded-2xl text-left text-xs font-black text-rhozly-on-surface/55 can-hover:hover:text-rhozly-on-surface can-hover:hover:bg-rhozly-surface transition-colors"
            >
              <Pencil size={13} /> Enter "{query.trim()}" manually
            </button>
          )}

          <ImageDisclaimer className="px-1 pt-2 border-t border-rhozly-outline/5 mt-1" />
        </div>
      )}
    </div>
  );
}

function ResultRow({
  testId, name, sub, other, thumb, credit, source, fav = false, onClick, multiSelect = false, selected = false,
  tapOpensDetails = false, onDetails,
  allowPreview = false, onInfo, infoActive = false, infoLoading = false, preview = null,
}: {
  testId: string;
  name: string;
  sub?: string;
  /** Alternate / "also known as" names (deduped vs common + scientific). */
  other?: string[];
  thumb: string | null;
  /** Wave 22.0005 — forwarded to PlantResultThumb so the credit badge
   *  renders on the thumbnail tile when the row carries provider metadata. */
  credit?: unknown;
  source: string;
  /** Stage E — this result matches one of the user's favourite plants. */
  fav?: boolean;
  onClick: () => void;
  multiSelect?: boolean;
  selected?: boolean;
  /** Overlay contract: row body opens the full detail; + adds. */
  tapOpensDetails?: boolean;
  onDetails?: () => void;
  allowPreview?: boolean;
  onInfo?: () => void;
  infoActive?: boolean;
  infoLoading?: boolean;
  preview?: React.ReactNode;
}) {
  const badge = SOURCE_BADGE[source] ?? SOURCE_BADGE.library;
  return (
    <li>
      <div
        className={`rounded-2xl bg-white border overflow-hidden transition-colors ${selected ? "border-rhozly-primary ring-1 ring-rhozly-primary/30" : "border-rhozly-outline/15 hover:border-rhozly-primary/40"}`}
      >
        <div className="flex items-center gap-2 pl-3 pr-2 py-2.5 min-h-[72px]">
          <button
            type="button"
            data-testid={testId}
            data-selected={selected || undefined}
            aria-pressed={multiSelect && !tapOpensDetails ? selected : undefined}
            onClick={tapOpensDetails && onDetails ? onDetails : onClick}
            className="flex-1 min-w-0 flex items-center gap-3 text-left active:scale-[0.99] transition-transform"
          >
            <div className="w-14 h-14 shrink-0 rounded-2xl overflow-hidden bg-rhozly-primary/5 flex items-center justify-center text-rhozly-primary/50">
              <PlantResultThumb name={name} url={thumb} source={source} iconSize={22} credit={credit} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-black text-rhozly-on-surface text-base leading-tight truncate">{name}</p>
              {/* Source chip leads the meta line (2026-07-22) — a fixed,
                  coloured slot that survives truncation, instead of a plain
                  word trailing the scientific name. */}
              <p className="text-xs font-bold text-rhozly-on-surface/45 flex items-center gap-1.5 min-w-0">
                <span
                  data-testid={`${testId}-source-badge`}
                  className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide ${badge.className}`}
                >
                  {badge.label}
                </span>
                {sub && <span className="italic truncate">{sub}</span>}
                {fav && (
                  <Heart
                    size={12}
                    data-testid={`${testId}-fav-glyph`}
                    aria-label="In your favourites"
                    className="shrink-0 fill-current text-rose-500"
                  />
                )}
              </p>
              {other && other.length > 0 && (
                <p
                  data-testid={`${testId}-other-names`}
                  className="text-[10px] font-semibold text-rhozly-on-surface/40 truncate"
                >
                  Also known as: {other.slice(0, 3).join(", ")}
                </p>
              )}
            </div>
          </button>

          {allowPreview && onInfo && (
            <button
              type="button"
              data-testid={`${testId}-info`}
              aria-label={infoActive ? "Hide details" : "View details"}
              aria-expanded={infoActive}
              onClick={onInfo}
              className={`shrink-0 p-2 pointer-coarse:min-h-11 pointer-coarse:min-w-11 rounded-xl transition-colors ${infoActive ? "text-rhozly-primary bg-rhozly-primary/10" : "text-rhozly-on-surface/40 hover:text-rhozly-primary hover:bg-rhozly-primary/5"}`}
            >
              {infoLoading ? <Loader2 size={16} className="animate-spin" /> : infoActive ? <ChevronUp size={16} /> : <Info size={16} />}
            </button>
          )}

          {/* Add / select — its own 44px hit area, visually separated from the
              row body so "open detail" and "add" never fight for a thumb. */}
          <button
            type="button"
            data-testid={`${testId}-add`}
            aria-label={selected ? `Remove ${name} from selection` : `Add ${name}`}
            aria-pressed={multiSelect ? selected : undefined}
            onClick={onClick}
            className={`shrink-0 w-11 h-11 rounded-full border-2 flex items-center justify-center transition-colors active:scale-[0.92] ${selected ? "bg-rhozly-primary border-rhozly-primary text-white" : "bg-white border-rhozly-outline/25 text-rhozly-on-surface/50 can-hover:hover:border-rhozly-primary/50 can-hover:hover:text-rhozly-primary"}`}
          >
            {selected ? <Check size={18} strokeWidth={3} /> : <Plus size={18} />}
          </button>
        </div>

        {preview && (
          <div data-testid="plant-search-preview-panel" className="border-t border-rhozly-outline/10">
            {preview}
          </div>
        )}
      </div>
    </li>
  );
}

/** Tri-state cycle for boolean filters: undefined → true → false → undefined. */
function cycleTri(v: boolean | undefined): boolean | undefined {
  return v === undefined ? true : v === true ? false : undefined;
}

function FilterChipRow({
  label, options, selected, onToggle,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[] | undefined;
  onToggle: (value: string) => void;
}) {
  return (
    <div>
      <p className="text-[9px] font-black uppercase tracking-widest text-rhozly-on-surface/50 mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = (selected ?? []).includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onToggle(o.value)}
              className={`text-[11px] font-black px-2.5 py-1 rounded-full border transition-colors ${on ? "bg-rhozly-primary text-white border-rhozly-primary" : "bg-white text-rhozly-on-surface/60 border-rhozly-outline/20 hover:border-rhozly-primary/30"}`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TriToggle({
  label, value, onCycle,
}: {
  label: string;
  value: boolean | undefined;
  onCycle: () => void;
}) {
  const text = value === true ? "Yes" : value === false ? "No" : "Any";
  const cls =
    value === true ? "bg-green-100 text-green-700 border-green-300"
    : value === false ? "bg-red-100 text-red-700 border-red-300"
    : "bg-white text-rhozly-on-surface/60 border-rhozly-outline/20";
  return (
    <button
      type="button"
      onClick={onCycle}
      className={`text-[11px] font-black px-3 py-1.5 rounded-full border transition-colors ${cls}`}
    >
      {label}: {text}
    </button>
  );
}
