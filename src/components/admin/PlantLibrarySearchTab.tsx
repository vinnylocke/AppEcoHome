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
} from "lucide-react";
import { Logger } from "../../lib/errorHandler";
import {
  PLANT_LIBRARY_SEARCH_PAGE_SIZE,
  searchPlantLibrary,
  type PlantLibraryRow,
  type PlantLibrarySearchResult,
} from "../../services/plantLibraryAdminService";
import PlantLibraryCareGuideModal from "./PlantLibraryCareGuideModal";

const DEBOUNCE_MS = 250;

/**
 * Admin-only search over the global `plant_library` knowledge base.
 *
 * Single text input → server-side ILIKE over the generated
 * `search_text` column (lowercased common_name + scientific_name).
 * Results are paginated server-side at 10 rows per page; tapping a
 * row opens the existing care guide UI populated from the row.
 *
 * Empty query falls through to "most recently seeded" so the tab
 * shows something useful on first paint.
 */
export default function PlantLibrarySearchTab() {
  const [input, setInput] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<PlantLibrarySearchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PlantLibraryRow | null>(null);

  // Debounce input → appliedQuery so the typist isn't firing a search
  // on every keystroke. 250ms is short enough to feel responsive and
  // long enough to skip mid-word fetches.
  const debounceRef = useRef<number | null>(null);
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      setPage(1);
      setAppliedQuery(input);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [input]);

  const runSearch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await searchPlantLibrary(appliedQuery, page);
      setResult(res);
    } catch (err) {
      Logger.error("plant library search failed", err);
      setResult({ rows: [], total: 0, page, pageSize: PLANT_LIBRARY_SEARCH_PAGE_SIZE });
    } finally {
      setLoading(false);
    }
  }, [appliedQuery, page]);

  useEffect(() => {
    runSearch();
  }, [runSearch]);

  const totalPages = useMemo(() => {
    if (!result) return 1;
    return Math.max(1, Math.ceil(result.total / result.pageSize));
  }, [result]);

  return (
    <div className="space-y-4">
      {/* Search input */}
      <div className="relative">
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
          className="w-full pl-9 pr-12 py-3 min-h-[44px] rounded-2xl bg-white border border-rhozly-outline/20 text-sm font-bold text-rhozly-on-surface focus:outline-none focus:border-rhozly-primary/40 focus:ring-2 focus:ring-rhozly-primary/15"
        />
        {loading && (
          <Loader2
            size={14}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-rhozly-on-surface/40 animate-spin"
          />
        )}
      </div>

      {/* Result count + pagination header */}
      <div className="flex items-center justify-between px-1 text-xs">
        <span className="text-rhozly-on-surface/55">
          {result == null ? (
            "Loading…"
          ) : result.total === 0 ? (
            <>No matches{appliedQuery && <> for "{appliedQuery}"</>}.</>
          ) : (
            <>
              {result.total.toLocaleString()} match{result.total === 1 ? "" : "es"}
              {appliedQuery && <> for "{appliedQuery}"</>} · page {page} of{" "}
              {totalPages}
            </>
          )}
        </span>
      </div>

      {/* Results list */}
      <ul
        data-testid="plant-library-search-results"
        className="flex flex-col gap-2"
      >
        {result?.rows.map((row) => (
          <SearchResultRow
            key={row.id}
            row={row}
            onOpen={() => setSelected(row)}
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

      {/* Care guide modal */}
      {selected && (
        <PlantLibraryCareGuideModal
          row={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function SearchResultRow({
  row,
  onOpen,
}: {
  row: PlantLibraryRow;
  onOpen: () => void;
}) {
  const thumb = row.thumbnail_url || row.image_url || null;
  const sciName = row.scientific_name?.[0] ?? null;

  return (
    <li>
      <button
        type="button"
        data-testid={`plant-library-search-row-${row.id}`}
        onClick={onOpen}
        className="w-full text-left rounded-2xl border border-rhozly-outline/15 bg-white hover:border-rhozly-primary/30 hover:shadow-sm transition-all flex items-center gap-3 p-3"
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
