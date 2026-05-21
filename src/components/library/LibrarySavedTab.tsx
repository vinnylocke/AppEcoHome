import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Loader2,
  Sparkles,
  Database,
  ArrowRight,
} from "lucide-react";
import { useCachedShed } from "../../hooks/useCachedShed";

interface Props {
  homeId: string;
}

function providerColour(source: string): string {
  if (source === "ai") return "text-amber-500";
  if (source === "verdantly") return "text-emerald-600";
  if (source === "manual") return "text-rhozly-on-surface/60";
  return "text-rhozly-primary";
}

function providerLabel(source: string): string {
  if (source === "ai") return "AI";
  if (source === "verdantly") return "Verdantly";
  if (source === "manual") return "Manual";
  return "Perenual";
}

/**
 * Saved tab — lists plants already in the user's Shed and opens them in
 * the same `PlantPreview` route. Cheap re-use of `useCachedShed` so the
 * first paint is instant from localStorage.
 */
export default function LibrarySavedTab({ homeId }: Props) {
  const navigate = useNavigate();
  const { plants, isInitialLoading } = useCachedShed(homeId);
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    const term = filter.trim().toLowerCase();
    const active = (plants ?? []).filter((p: any) => !p.is_archived);
    if (!term) return active;
    return active.filter((p: any) => {
      const common = (p.common_name ?? "").toLowerCase();
      const sci = (p.scientific_name?.[0] ?? "").toString().toLowerCase();
      return common.includes(term) || sci.includes(term);
    });
  }, [plants, filter]);

  if (isInitialLoading && (plants?.length ?? 0) === 0) {
    return (
      <div
        data-testid="library-saved-loading"
        className="flex items-center gap-2 px-4 py-8 text-sm text-rhozly-on-surface/55 justify-center"
      >
        <Loader2 className="animate-spin" size={16} />
        Loading your Shed…
      </div>
    );
  }

  if ((plants?.length ?? 0) === 0) {
    return (
      <div
        data-testid="library-saved-empty"
        className="rounded-2xl bg-white border border-rhozly-outline/15 p-6 text-center"
      >
        <p className="font-display font-black text-rhozly-on-surface text-base mb-1">
          Nothing in your Shed yet.
        </p>
        <p className="text-xs font-bold text-rhozly-on-surface/55 mb-4">
          Search any plant by name on the Search tab — tap one to view its guide and save it here.
        </p>
        <button
          type="button"
          onClick={() => navigate("/library/search")}
          className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] rounded-2xl bg-rhozly-primary text-white text-xs font-black uppercase tracking-widest hover:opacity-90 transition"
        >
          <Search size={14} />
          Go to Search
        </button>
      </div>
    );
  }

  return (
    <div data-testid="library-saved" className="space-y-3">
      {/* Filter input */}
      <div className="relative">
        <Search
          size={16}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-rhozly-on-surface/40 pointer-events-none"
        />
        <input
          type="search"
          data-testid="library-saved-filter"
          placeholder="Filter your Shed…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full pl-10 pr-3 py-3 min-h-[48px] rounded-2xl bg-white border border-rhozly-outline/20 text-sm font-bold text-rhozly-on-surface placeholder:text-rhozly-on-surface/40 focus:outline-none focus:border-rhozly-primary/40 focus:ring-2 focus:ring-rhozly-primary/15"
        />
      </div>

      {/* Plant list */}
      {filtered.length === 0 ? (
        <p
          data-testid="library-saved-no-matches"
          className="text-sm text-rhozly-on-surface/55 italic text-center py-6"
        >
          No plants match "{filter.trim()}".
        </p>
      ) : (
        <ul
          data-testid="library-saved-results"
          className="flex flex-col gap-2"
        >
          {filtered.map((p: any) => (
            <li key={p.id}>
              <button
                type="button"
                data-testid={`library-saved-row-${p.id}`}
                onClick={() => navigate(`/library/plant/${p.id}`)}
                className="w-full text-left rounded-2xl bg-white border border-rhozly-outline/15 hover:border-rhozly-primary/40 active:scale-[0.99] transition-all flex items-center gap-3 p-3"
              >
                <div className="w-14 h-14 shrink-0 rounded-2xl overflow-hidden bg-rhozly-primary/5">
                  {p.thumbnail_url ? (
                    <img
                      src={p.thumbnail_url}
                      alt={p.common_name}
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
                <div className="flex-1 min-w-0">
                  <p className="font-display font-black text-rhozly-on-surface text-sm leading-tight truncate">
                    {p.common_name}
                  </p>
                  {p.scientific_name?.[0] && (
                    <p className="text-[11px] font-bold italic text-rhozly-on-surface/45 truncate">
                      {p.scientific_name[0]}
                    </p>
                  )}
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest mt-1 ${providerColour(p.source ?? "")}`}
                  >
                    <Database size={10} />
                    {providerLabel(p.source ?? "")}
                  </span>
                </div>
                <div className="shrink-0 text-rhozly-on-surface/40">
                  <ArrowRight size={16} />
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
