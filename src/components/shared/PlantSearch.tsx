import React, { useCallback, useEffect, useRef, useState } from "react";
import { Search, Loader2, Sparkles, Database, Leaf, Plus, Pencil, Lock, SlidersHorizontal, ChevronDown, Check } from "lucide-react";
import {
  searchLibrary,
  didYouMean,
  searchExternal,
  createWithAI,
  libraryRowToSelection,
  providerResultToSelection,
  countActiveFilters,
  type PlantSelection,
  type PlantFilters,
} from "../../lib/unifiedPlantSearch";
import type { PlantLibraryRow } from "../../services/plantLibraryAdminService";
import type { ProviderSearchResult } from "../../lib/verdantlyUtils";
import { Logger } from "../../lib/errorHandler";

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
  /** Notified whenever the query changes — lets hosts sync URL / sessionStorage. */
  onQueryChange?: (query: string) => void;
  /** Show the structured filter panel (cycle / sunlight / edible / indoor). */
  showFilters?: boolean;
  /** Multi-select mode — rows show a checkbox and onSelect toggles. Host owns the set. */
  multiSelect?: boolean;
  /** In multiSelect mode, returns whether a given selection is currently picked. */
  isSelected?: (sel: PlantSelection) => boolean;
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

const SOURCE_BADGE: Record<string, { label: string; className: string }> = {
  library:   { label: "Library",   className: "text-rhozly-primary bg-rhozly-primary/10" },
  perenual:  { label: "Perenual",  className: "text-rhozly-primary bg-rhozly-primary/10" },
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
  onQueryChange,
  showFilters = false,
  multiSelect = false,
  isSelected,
}: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [libraryRows, setLibraryRows] = useState<PlantLibraryRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [externalRows, setExternalRows] = useState<ProviderSearchResult[]>([]);
  const [externalLoading, setExternalLoading] = useState(false);
  const [externalDone, setExternalDone] = useState(false);
  const [aiCreating, setAiCreating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [filters, setFilters] = useState<PlantFilters>({});
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seqRef = useRef(0);
  // Filters are read inside runLibrary; keep a ref so the latest value is
  // used without runLibrary needing to be re-created on every filter change.
  const filtersRef = useRef<PlantFilters>(filters);
  filtersRef.current = filters;

  const runLibrary = useCallback(async (q: string) => {
    const trimmed = q.trim();
    const activeFilters = filtersRef.current;
    const filterCount = countActiveFilters(activeFilters);
    // Reset the opt-in tiers whenever the query/filters change.
    setExternalRows([]);
    setExternalDone(false);
    setAiError(null);
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

  const applyFilter = (next: PlantFilters) => {
    setFilters(next);
    filtersRef.current = next;
    runLibrary(query);
  };

  // Run an initial search when seeded with a query (e.g. ?q= on /library).
  useEffect(() => {
    if (initialQuery.trim().length >= 2) runLibrary(initialQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeFilterCount = countActiveFilters(filters);

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  const handleSearchExternal = async () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setExternalLoading(true);
    try {
      const rows = await searchExternal(trimmed, { includeAi: false, homeId });
      setExternalRows(rows);
      setExternalDone(true);
    } catch (err) {
      Logger.error("PlantSearch external search failed", err, { q: trimmed });
      setExternalDone(true);
    } finally {
      setExternalLoading(false);
    }
  };

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

  const hasCriteria = query.trim().length >= 2 || activeFilterCount > 0;
  const hasQuery = query.trim().length >= 2;
  const noLibraryResults = hasCriteria && !searching && libraryRows.length === 0;

  return (
    <div data-testid="plant-search" className="space-y-3">
      {/* Input (+ filters toggle) */}
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

      {/* Empty prompt */}
      {!hasCriteria && (
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
              onClick={() => { setQuery(s); runLibrary(s); }}
              className="text-[11px] font-black text-rhozly-primary bg-rhozly-primary/10 px-2.5 py-1 rounded-full hover:bg-rhozly-primary/20 transition-colors"
            >
              {s}
            </button>
          ))}
          <span className="text-[11px] font-bold text-rhozly-on-surface/50">?</span>
        </div>
      )}

      {/* Library results */}
      {libraryRows.length > 0 && (
        <ul className="space-y-1.5" data-testid="plant-search-results">
          {libraryRows.map((row) => {
            const sel = libraryRowToSelection(row);
            return (
              <ResultRow
                key={`lib-${row.id}`}
                testId={`plant-search-result-library-${row.id}`}
                name={row.common_name}
                sub={Array.isArray(row.scientific_name) ? row.scientific_name[0] : undefined}
                thumb={row.thumbnail_url ?? row.image_url ?? null}
                source="library"
                multiSelect={multiSelect}
                selected={multiSelect ? !!isSelected?.(sel) : false}
                onClick={() => onSelect(sel)}
              />
            );
          })}
        </ul>
      )}

      {/* External (opt-in) results */}
      {externalRows.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 px-1">From other databases</p>
          <ul className="space-y-1.5">
            {externalRows.map((r) => {
              const sel = providerResultToSelection(r);
              return (
                <ResultRow
                  key={`ext-${r._provider}-${r.id}`}
                  testId={`plant-search-result-${r._provider}-${r.id}`}
                  name={r.common_name}
                  sub={r.scientific_name?.[0]}
                  thumb={r.thumbnail_url ?? null}
                  source={r._provider}
                  multiSelect={multiSelect}
                  selected={multiSelect ? !!isSelected?.(sel) : false}
                  onClick={() => onSelect(sel)}
                />
              );
            })}
          </ul>
        </div>
      )}

      {/* Opt-in CTAs + fallbacks — shown once the user has a query */}
      {hasQuery && (
        <div className="space-y-2 pt-1">
          {noLibraryResults && externalRows.length === 0 && !externalLoading && (
            <p className="text-[12px] font-bold text-rhozly-on-surface/45 px-1">
              Nothing in our library for "{query.trim()}". Try the options below.
            </p>
          )}

          {/* Search more databases (Botanist+) */}
          {!externalDone && (
            gates.canSearchExternal ? (
              <button
                type="button"
                data-testid="plant-search-external"
                onClick={handleSearchExternal}
                disabled={externalLoading}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl border border-rhozly-outline/20 text-xs font-black text-rhozly-on-surface/70 hover:bg-rhozly-surface hover:text-rhozly-on-surface transition-colors disabled:opacity-60"
              >
                {externalLoading ? <Loader2 size={14} className="animate-spin" /> : <Database size={14} />}
                Search more databases
              </button>
            ) : (
              <div className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl border border-dashed border-rhozly-outline/20 text-[11px] font-bold text-rhozly-on-surface/40">
                <Lock size={12} /> Upgrade to Botanist to search more databases
              </div>
            )
          )}

          {/* Create with AI (Sage+) */}
          {gates.canCreateWithAI ? (
            <button
              type="button"
              data-testid="plant-search-create-ai"
              onClick={handleCreateWithAI}
              disabled={aiCreating}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl border border-amber-300 text-xs font-black text-amber-600 hover:bg-amber-50 transition-colors disabled:opacity-60"
            >
              {aiCreating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              Create "{query.trim()}" with AI
            </button>
          ) : (
            <div className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl border border-dashed border-amber-200 text-[11px] font-bold text-amber-500/70">
              <Lock size={12} /> Upgrade to Sage to create plants with AI
            </div>
          )}
          {aiError && <p className="text-[11px] font-bold text-rose-600 px-1">{aiError}</p>}

          {/* Manual fallback */}
          {allowManual && (
            <button
              type="button"
              data-testid="plant-search-manual"
              onClick={() => onSelect({ source: "manual", common_name: query.trim() })}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl text-xs font-black text-rhozly-on-surface/55 hover:text-rhozly-on-surface hover:bg-rhozly-surface transition-colors"
            >
              <Pencil size={13} /> Add "{query.trim()}" manually
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ResultRow({
  testId, name, sub, thumb, source, onClick, multiSelect = false, selected = false,
}: {
  testId: string;
  name: string;
  sub?: string;
  thumb: string | null;
  source: string;
  onClick: () => void;
  multiSelect?: boolean;
  selected?: boolean;
}) {
  const badge = SOURCE_BADGE[source] ?? SOURCE_BADGE.library;
  return (
    <li>
      <button
        type="button"
        data-testid={testId}
        data-selected={selected || undefined}
        aria-pressed={multiSelect ? selected : undefined}
        onClick={onClick}
        className={`w-full text-left rounded-2xl bg-white border active:scale-[0.99] transition-all flex items-center gap-3 p-3 ${selected ? "border-rhozly-primary ring-1 ring-rhozly-primary/30" : "border-rhozly-outline/15 hover:border-rhozly-primary/40"}`}
      >
        <div className="w-11 h-11 shrink-0 rounded-2xl overflow-hidden bg-rhozly-primary/5 flex items-center justify-center text-rhozly-primary/50">
          {thumb ? (
            <img src={thumb} alt={name} loading="lazy" decoding="async" className="w-full h-full object-cover" />
          ) : source === "ai" ? (
            <Sparkles size={18} />
          ) : (
            <Leaf size={18} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-black text-rhozly-on-surface text-sm leading-tight truncate">{name}</p>
          {sub && <p className="text-[11px] font-bold italic text-rhozly-on-surface/45 truncate">{sub}</p>}
          <span className={`inline-block mt-1 text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md ${badge.className}`}>
            {badge.label}
          </span>
        </div>
        {multiSelect ? (
          <span
            className={`shrink-0 w-5 h-5 rounded-md flex items-center justify-center border-2 transition-colors ${selected ? "bg-rhozly-primary border-rhozly-primary text-white" : "bg-white border-rhozly-outline/30 text-transparent"}`}
          >
            <Check size={12} strokeWidth={3} />
          </span>
        ) : (
          <Plus size={16} className="shrink-0 text-rhozly-on-surface/40" />
        )}
      </button>
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
