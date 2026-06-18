// Ailment Library — browse the global catalogue of pests / diseases / invasives
// / disorders (Phase 2). Search + filter by kind/severity, detail view, and
// "Add to watchlist" which copies an entry into the home's watchlist.

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Bug, Biohazard, Sprout, AlertTriangle, X, Plus, Loader2, ArrowLeft, Leaf } from "lucide-react";
import toast from "react-hot-toast";
import {
  fetchAilmentLibrary, addLibraryAilmentToWatchlist,
  type LibraryAilment, type AilmentKind, type AilmentSeverity,
} from "../services/ailmentLibraryService";

interface Props { homeId: string }

const KIND_META: Record<AilmentKind, { label: string; icon: typeof Bug; colour: string }> = {
  pest:     { label: "Pest",     icon: Bug,           colour: "bg-red-100 text-red-700" },
  disease:  { label: "Disease",  icon: Biohazard,     colour: "bg-purple-100 text-purple-700" },
  invasive: { label: "Invasive", icon: Sprout,        colour: "bg-orange-100 text-orange-700" },
  disorder: { label: "Disorder", icon: AlertTriangle, colour: "bg-amber-100 text-amber-700" },
};
const SEVERITY_COLOUR: Record<AilmentSeverity, string> = {
  low: "bg-emerald-100 text-emerald-700",
  moderate: "bg-yellow-100 text-yellow-700",
  high: "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
};
const KINDS: AilmentKind[] = ["pest", "disease", "invasive", "disorder"];

export default function AilmentLibrary({ homeId }: Props) {
  const navigate = useNavigate();
  const [list, setList] = useState<LibraryAilment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<AilmentKind | "all">("all");
  const [selected, setSelected] = useState<LibraryAilment | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    fetchAilmentLibrary().then(setList).catch(() => toast.error("Couldn't load the ailment library."))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list.filter((a) => {
      if (kind !== "all" && a.kind !== kind) return false;
      if (!q) return true;
      return a.name.toLowerCase().includes(q)
        || (a.scientific_name ?? "").toLowerCase().includes(q)
        || a.aliases.some((x) => x.toLowerCase().includes(q))
        || a.affected_plant_types.some((x) => x.toLowerCase().includes(q));
    });
  }, [list, search, kind]);

  const addToWatchlist = async (a: LibraryAilment) => {
    setAdding(true);
    try {
      await addLibraryAilmentToWatchlist(a, homeId);
      toast.success(`"${a.name}" added to your watchlist.`);
      setSelected(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't add to watchlist.");
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-6" data-testid="ailment-library">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => navigate("/shed?tab=watchlist")} className="p-2 rounded-xl hover:bg-rhozly-surface-low" aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-black text-rhozly-on-surface">Ailment Library</h1>
          <p className="text-xs text-rhozly-on-surface-variant">Pests, diseases, invasives & disorders — add any to your watchlist.</p>
        </div>
      </div>

      <div className="relative mb-3">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-rhozly-on-surface/40" />
        <input
          data-testid="ailment-library-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, symptom or affected plant…"
          className="w-full pl-9 pr-3 py-2.5 rounded-2xl border border-rhozly-outline/20 bg-white text-sm"
        />
      </div>

      <div className="flex flex-wrap gap-2 mb-5">
        <button onClick={() => setKind("all")} data-testid="ailment-filter-all"
          className={`px-3 py-1.5 rounded-xl text-xs font-bold ${kind === "all" ? "bg-rhozly-primary text-white" : "bg-rhozly-surface-low text-rhozly-on-surface/60"}`}>All</button>
        {KINDS.map((k) => {
          const M = KIND_META[k];
          return (
            <button key={k} onClick={() => setKind(k)} data-testid={`ailment-filter-${k}`}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold ${kind === k ? "bg-rhozly-primary text-white" : "bg-rhozly-surface-low text-rhozly-on-surface/60"}`}>
              <M.icon size={13} /> {M.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-rhozly-on-surface/30" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-sm text-rhozly-on-surface-variant" data-testid="ailment-library-empty">
          No ailments match. The library is growing — check back soon.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((a) => {
            const M = KIND_META[a.kind];
            return (
              <button key={a.id} data-testid={`ailment-card-${a.id}`} onClick={() => setSelected(a)}
                className="text-left rounded-2xl border border-rhozly-outline/15 bg-white p-4 hover:border-rhozly-primary/40 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${M.colour}`}><M.icon size={16} /></span>
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-rhozly-on-surface truncate">{a.name}</p>
                      {a.scientific_name && <p className="text-[11px] italic text-rhozly-on-surface/45 truncate">{a.scientific_name}</p>}
                    </div>
                  </div>
                  {a.severity && <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold ${SEVERITY_COLOUR[a.severity]}`}>{a.severity}</span>}
                </div>
                {a.affected_plant_types.length > 0 && (
                  <p className="mt-2 text-[11px] text-rhozly-on-surface/50 flex items-center gap-1">
                    <Leaf size={11} /> {a.affected_plant_types.slice(0, 4).join(", ")}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setSelected(null)}>
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} data-testid="ailment-detail">
            <div className="flex items-start justify-between gap-3 p-5 border-b border-rhozly-outline/10 sticky top-0 bg-white">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center ${KIND_META[selected.kind].colour}`}>
                  {(() => { const I = KIND_META[selected.kind].icon; return <I size={18} />; })()}
                </span>
                <div className="min-w-0">
                  <h3 className="font-black text-rhozly-on-surface truncate">{selected.name}</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-rhozly-on-surface/50">{KIND_META[selected.kind].label}</span>
                    {selected.severity && <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${SEVERITY_COLOUR[selected.severity]}`}>{selected.severity}</span>}
                  </div>
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="p-2 rounded-xl hover:bg-rhozly-surface-low"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4 text-sm">
              {selected.description && <p className="text-rhozly-on-surface/80">{selected.description}</p>}
              <Section title="Symptoms" items={selected.symptoms} />
              <Field title="Causes" text={selected.causes} />
              <Field title="Treatment" text={selected.treatment} />
              <Field title="Prevention" text={selected.prevention} />
              {selected.affected_plant_types.length > 0 && <Field title="Affected plants" text={selected.affected_plant_types.join(", ")} />}
              {selected.season.length > 0 && <Field title="Most active" text={selected.season.join(", ")} />}
            </div>
            <div className="p-5 pt-0">
              <button
                onClick={() => addToWatchlist(selected)}
                disabled={adding}
                data-testid="ailment-add-watchlist"
                className="w-full py-3 rounded-xl bg-rhozly-primary text-white font-black flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {adding ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />} Add to watchlist
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, items }: { title: string; items: string[] }) {
  if (!items?.length) return null;
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-1">{title}</p>
      <ul className="list-disc pl-5 space-y-0.5 text-rhozly-on-surface/80">
        {items.map((s, i) => <li key={i}>{s}</li>)}
      </ul>
    </div>
  );
}
function Field({ title, text }: { title: string; text: string | null }) {
  if (!text) return null;
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-1">{title}</p>
      <p className="text-rhozly-on-surface/80">{text}</p>
    </div>
  );
}
