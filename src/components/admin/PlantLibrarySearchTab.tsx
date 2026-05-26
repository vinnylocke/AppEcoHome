import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Leaf,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Info,
  FlaskConical,
} from "lucide-react";
import { Logger } from "../../lib/errorHandler";
import { supabase } from "../../lib/supabase";
import {
  PLANT_LIBRARY_SEARCH_PAGE_SIZE,
  type PlantLibraryRow,
  type PlantLibrarySearchResult,
} from "../../services/plantLibraryAdminService";
import {
  SEARCH_METHODS,
  DEFAULT_METHOD_ID,
  type SearchMethod,
} from "../../services/plantLibrarySearch";
import PlantLibraryCareGuideModal from "./PlantLibraryCareGuideModal";
import PlantLibraryQuickPreviewModal from "./PlantLibraryQuickPreviewModal";

/**
 * Admin-only Plant Library Search Lab.
 *
 * Modular search-strategy registry — each method (alphabetical /
 * relevance / advanced / fuzzy) is a self-contained file under
 * `src/services/plantLibrarySearch/`. The tab strip is auto-rendered
 * from the registry, so adding a new strategy is a one-file change.
 *
 * Search runs only on Submit (Search button or Enter key) — with 40k+
 * rows the previous per-keystroke ILIKE was unworkable.
 */
export default function PlantLibrarySearchTab() {
  const [methodId, setMethodId] = useState<string>(DEFAULT_METHOD_ID);
  const selectedMethod: SearchMethod<any> = useMemo(
    () => SEARCH_METHODS.find((m) => m.id === methodId) ?? SEARCH_METHODS[0],
    [methodId],
  );

  // Per-method options state — keyed by methodId so switching tabs
  // preserves each method's settings (e.g. the Advanced match-type
  // dropdown or the Fuzzy threshold slider).
  const [optionsByMethod, setOptionsByMethod] = useState<Record<string, unknown>>(
    () =>
      SEARCH_METHODS.reduce<Record<string, unknown>>((acc, m) => {
        acc[m.id] = m.defaultOptions;
        return acc;
      }, {}),
  );
  const setMethodOptions = useCallback((id: string, next: unknown) => {
    setOptionsByMethod((prev) => ({ ...prev, [id]: next }));
  }, []);

  const [input, setInput] = useState("");
  const [appliedQuery, setAppliedQuery] = useState<string | null>(null);
  /** Method id that was active when the current `appliedQuery` was submitted. */
  const [appliedMethodId, setAppliedMethodId] = useState<string | null>(null);
  /** Snapshot of the options the active query was run with — re-used on pagination. */
  const [appliedOptions, setAppliedOptions] = useState<unknown>(null);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<PlantLibrarySearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  /** Care-guide modal target — full preview (ManualPlantCreation). */
  const [selected, setSelected] = useState<PlantLibraryRow | null>(null);
  /** Quick-preview modal target. */
  const [quickPreview, setQuickPreview] = useState<PlantLibraryRow | null>(null);

  /** Lazy thumbnails for rows seeded before the image-fetch fix shipped. */
  const [lazyThumbs, setLazyThumbs] = useState<Map<number, string>>(new Map());
  const lazyThumbsRef = useRef<Map<number, string>>(new Map());
  const lazyInflightRef = useRef<Set<number>>(new Set());

  const runSearch = useCallback(async () => {
    if (appliedQuery == null || appliedMethodId == null) return;
    const method = SEARCH_METHODS.find((m) => m.id === appliedMethodId);
    if (!method) return;
    setLoading(true);
    try {
      const res = await method.run({
        query: appliedQuery,
        page,
        pageSize: PLANT_LIBRARY_SEARCH_PAGE_SIZE,
        options: appliedOptions,
      });
      setResult(res);
    } catch (err) {
      Logger.error("plant library search failed", err, {
        method: appliedMethodId,
        query: appliedQuery,
      });
      setResult({ rows: [], total: 0, page, pageSize: PLANT_LIBRARY_SEARCH_PAGE_SIZE });
    } finally {
      setLoading(false);
    }
  }, [appliedQuery, appliedMethodId, appliedOptions, page]);

  useEffect(() => {
    runSearch();
  }, [runSearch]);

  const handleSubmit = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setPage(1);
    setAppliedQuery(trimmed);
    setAppliedMethodId(selectedMethod.id);
    setAppliedOptions(optionsByMethod[selectedMethod.id]);
  }, [input, selectedMethod, optionsByMethod]);

  const handleClear = useCallback(() => {
    setInput("");
    setAppliedQuery(null);
    setAppliedMethodId(null);
    setAppliedOptions(null);
    setResult(null);
    setPage(1);
  }, []);

  /**
   * Backfill thumbnails for visible rows that don't have one stored.
   */
  useEffect(() => {
    if (!result?.rows.length) return;
    const targets = result.rows.filter((row) => {
      if (row.thumbnail_url || row.image_url) return false;
      if (lazyThumbsRef.current.has(row.id)) return false;
      if (lazyInflightRef.current.has(row.id)) return false;
      lazyInflightRef.current.add(row.id);
      return true;
    });
    if (targets.length === 0) return;

    Promise.all(
      targets.map(async (row) => {
        const query = row.scientific_name?.[0] ?? row.common_name;
        try {
          const { data } = await supabase.functions.invoke("plant-image-search", {
            body: { query, count: 1 },
          });
          const thumb = (data?.images?.[0]?.thumb_url as string | undefined) ?? "";
          lazyThumbsRef.current.set(row.id, thumb);
          setLazyThumbs(new Map(lazyThumbsRef.current));
        } catch {
          lazyThumbsRef.current.set(row.id, "");
          setLazyThumbs(new Map(lazyThumbsRef.current));
        } finally {
          lazyInflightRef.current.delete(row.id);
        }
      }),
    );
  }, [result]);

  const totalPages = useMemo(() => {
    if (!result) return 1;
    return Math.max(1, Math.ceil(result.total / result.pageSize));
  }, [result]);

  const OptionsComponent = selectedMethod.Options;

  return (
    <div className="space-y-4">
      {/* Search Lab header — method tabs */}
      <div className="rounded-2xl bg-rhozly-primary/[0.04] border border-rhozly-primary/15 p-3 sm:p-4">
        <div className="flex items-center gap-2 mb-3">
          <FlaskConical size={14} className="text-rhozly-primary shrink-0" />
          <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-primary">
            Search Lab
          </p>
        </div>
        <div
          role="tablist"
          aria-label="Search method"
          className="flex flex-wrap gap-1.5"
        >
          {SEARCH_METHODS.map((m) => (
            <button
              key={m.id}
              role="tab"
              aria-selected={methodId === m.id}
              data-testid={`plant-library-search-method-${m.id}`}
              onClick={() => setMethodId(m.id)}
              className={`px-3 py-2 min-h-[36px] rounded-xl text-xs font-black transition-colors ${
                methodId === m.id
                  ? "bg-rhozly-primary text-white shadow-sm"
                  : "bg-white text-rhozly-on-surface/60 border border-rhozly-outline/15 hover:text-rhozly-primary hover:border-rhozly-primary/30"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="text-[11px] font-bold text-rhozly-on-surface/55 mt-3 leading-snug">
          {selectedMethod.description}
        </p>
      </div>

      {/* Per-method options control */}
      {OptionsComponent && (
        <div className="px-1">
          <OptionsComponent
            value={optionsByMethod[selectedMethod.id]}
            onChange={(next) => setMethodOptions(selectedMethod.id, next)}
          />
        </div>
      )}

      {/* Search input + submit button */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
        className="flex gap-2"
      >
        <div className="relative flex-1">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-rhozly-on-surface/40"
          />
          <input
            type="text"
            data-testid="plant-library-search-input"
            placeholder="Search by common name or scientific name…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="w-full pl-9 pr-10 py-3 min-h-[44px] rounded-2xl bg-white border border-rhozly-outline/20 text-sm font-bold text-rhozly-on-surface focus:outline-none focus:border-rhozly-primary/40 focus:ring-2 focus:ring-rhozly-primary/15"
          />
          {loading && (
            <Loader2
              size={14}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-rhozly-on-surface/40 animate-spin"
            />
          )}
        </div>
        <button
          type="submit"
          data-testid="plant-library-search-submit"
          disabled={loading || !input.trim()}
          className="shrink-0 inline-flex items-center justify-center gap-1.5 px-4 sm:px-5 py-3 min-h-[44px] rounded-2xl bg-rhozly-primary text-white text-sm font-black shadow-sm hover:bg-rhozly-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Search size={14} />
          <span className="hidden sm:inline">Search</span>
        </button>
        {appliedQuery !== null && (
          <button
            type="button"
            onClick={handleClear}
            data-testid="plant-library-search-clear"
            className="shrink-0 inline-flex items-center justify-center px-3 py-3 min-h-[44px] rounded-2xl border border-rhozly-outline/15 text-xs font-black uppercase tracking-widest text-rhozly-on-surface/55 hover:text-rhozly-primary hover:border-rhozly-primary/30 transition-colors"
          >
            Clear
          </button>
        )}
      </form>

      {/* Result count header */}
      {appliedQuery !== null && (
        <div className="flex items-center justify-between px-1 text-xs">
          <span className="text-rhozly-on-surface/55">
            {result == null ? (
              "Searching…"
            ) : result.total === 0 ? (
              <>No matches for "{appliedQuery}".</>
            ) : (
              <>
                {result.total.toLocaleString()} match{result.total === 1 ? "" : "es"}{" "}
                for "{appliedQuery}"
                {appliedMethodId && appliedMethodId !== selectedMethod.id && (
                  <span className="ml-1 text-rhozly-on-surface/40">
                    (via {SEARCH_METHODS.find((m) => m.id === appliedMethodId)?.label})
                  </span>
                )}{" "}
                · page {page} of {totalPages}
              </>
            )}
          </span>
        </div>
      )}

      {/* Empty state — shown before the first search runs */}
      {appliedQuery === null && (
        <div className="rounded-2xl border-2 border-dashed border-rhozly-outline/15 bg-rhozly-surface-low/50 p-8 sm:p-12 flex flex-col items-center justify-center text-center gap-3">
          <div className="w-14 h-14 rounded-3xl bg-rhozly-primary/10 text-rhozly-primary flex items-center justify-center">
            <Search size={22} />
          </div>
          <h3 className="text-base font-black text-rhozly-on-surface">
            Search the plant library
          </h3>
          <p className="text-xs font-bold text-rhozly-on-surface/55 max-w-sm leading-relaxed">
            Type a name above and tap{" "}
            <span className="font-black text-rhozly-on-surface/80">Search</span>{" "}
            (or press Enter). Use the tabs above to try a different search
            strategy.
          </p>
        </div>
      )}

      {/* Results list */}
      <ul
        data-testid="plant-library-search-results"
        className="flex flex-col gap-2"
      >
        {result?.rows.map((row) => (
          <SearchResultRow
            key={row.id}
            row={row}
            lazyThumb={lazyThumbs.get(row.id) ?? null}
            onOpen={() => setSelected(row)}
            onInfo={() => setQuickPreview(row)}
          />
        ))}
      </ul>

      {/* Pagination footer */}
      {result && result.total > 0 && (
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            data-testid="plant-library-search-prev"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl border border-rhozly-outline/15 text-[11px] font-black uppercase tracking-widest text-rhozly-on-surface/65 hover:text-rhozly-primary hover:border-rhozly-primary/30 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={13} />
            Previous
          </button>
          <span className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/45">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            data-testid="plant-library-search-next"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl border border-rhozly-outline/15 text-[11px] font-black uppercase tracking-widest text-rhozly-on-surface/65 hover:text-rhozly-primary hover:border-rhozly-primary/30 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next
            <ChevronRight size={13} />
          </button>
        </div>
      )}

      {/* Quick-preview modal */}
      {quickPreview && (
        <PlantLibraryQuickPreviewModal
          row={quickPreview}
          fallbackThumbnail={lazyThumbs.get(quickPreview.id) ?? null}
          onClose={() => setQuickPreview(null)}
          onOpenCareGuide={() => {
            const target = quickPreview;
            setQuickPreview(null);
            setSelected(target);
          }}
        />
      )}

      {/* Care guide modal */}
      {selected && (
        <PlantLibraryCareGuideModal
          row={selected}
          fallbackThumbnail={lazyThumbs.get(selected.id) ?? null}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function SearchResultRow({
  row,
  lazyThumb,
  onOpen,
  onInfo,
}: {
  row: PlantLibraryRow;
  lazyThumb: string | null;
  onOpen: () => void;
  onInfo: () => void;
}) {
  const thumb = row.thumbnail_url || row.image_url || (lazyThumb || null);
  const sciName = row.scientific_name?.[0] ?? null;

  return (
    <li
      data-testid={`plant-library-search-row-${row.id}`}
      className="rounded-2xl border border-rhozly-outline/15 bg-white hover:border-rhozly-primary/30 hover:shadow-sm transition-all flex items-center gap-3 p-3"
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex-1 min-w-0 text-left flex items-center gap-3"
        aria-label={`Open full care guide for ${row.common_name}`}
      >
        <div className="shrink-0 w-14 h-14 rounded-xl bg-rhozly-surface-low overflow-hidden border border-rhozly-outline/10 flex items-center justify-center">
          {thumb ? (
            <img
              src={thumb}
              alt={row.common_name}
              loading="lazy"
              className="w-full h-full object-cover"
            />
          ) : (
            <Leaf size={20} className="text-rhozly-on-surface/30" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-display font-black text-rhozly-on-surface text-sm leading-tight truncate">
            {row.common_name}
          </p>
          {sciName && (
            <p className="text-[11px] text-rhozly-on-surface/55 italic truncate">
              {sciName}
            </p>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <ValidityChip valid={row.valid} />
            {row.family && (
              <span className="inline-flex items-center text-[9px] font-black uppercase tracking-widest text-rhozly-on-surface/45">
                {row.family}
              </span>
            )}
          </div>
        </div>
      </button>
      <button
        type="button"
        data-testid={`plant-library-search-row-${row.id}-info`}
        onClick={onInfo}
        aria-label={`Show quick preview for ${row.common_name}`}
        title="Quick preview"
        className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-xl text-rhozly-on-surface/55 hover:text-rhozly-primary hover:bg-rhozly-primary/10 transition-colors"
      >
        <Info size={16} />
      </button>
    </li>
  );
}

function ValidityChip({ valid }: { valid: boolean | null }) {
  if (valid === true) {
    return (
      <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-100">
        <CheckCircle2 size={9} /> Matched
      </span>
    );
  }
  if (valid === false) {
    return (
      <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full border bg-amber-50 text-amber-800 border-amber-100">
        <AlertTriangle size={9} /> Amended
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full border bg-rhozly-surface-low text-rhozly-on-surface/55 border-rhozly-outline/20">
      <HelpCircle size={9} /> Unverified
    </span>
  );
}
