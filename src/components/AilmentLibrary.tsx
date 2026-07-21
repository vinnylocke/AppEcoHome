// Ailment Library — the field guide (ailment-library-shed-search overhaul
// Stage 1). Browse the global catalogue of pests / diseases / invasives /
// disorders with real thumbnails, kind + severity filters and live
// watching-state; open an entry as a FULL-PAGE detail (no more porthole modal)
// with the 🔭 Watch (→ this home's watchlist) / ♥ Favourite (→ your cross-home
// list) / ✦ Ask Rhozly AI action bar and a "could affect your garden" strip.
//
// URL contract: ?ailment=<id> opens that entry's detail. Opening PUSHES (back
// closes the detail); the X replaces back to the browse URL. `selected` derives
// REACTIVELY from the param, so in-app navigations (the watchlist's "In
// library" chip) work after mount too — both review-verified fixes.

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Search, Bug, Biohazard, Sprout, AlertTriangle, Loader2, ArrowLeft, Leaf,
  Binoculars, Check,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  fetchAilmentLibrary, addLibraryAilmentToWatchlist, favouriteLibraryAilment,
  type LibraryAilment, type AilmentKind, type AilmentSeverity,
} from "../services/ailmentLibraryService";
import { listFavouriteAilments, unfavouriteAilment } from "../services/favouritesService";
import type { FavouriteAilment } from "../types";
import { AILMENT_KIND_CLASSES, AILMENT_SEVERITY_CLASSES } from "../lib/ailmentPresentation";
import { ailmentIdentityKey } from "../lib/favouriteIdentity";
import { usePermissions } from "../context/HomePermissionsContext";
import { usePlantDoctor } from "../context/PlantDoctorContext";
import { usePersona } from "../hooks/usePersona";
import { supabase } from "../lib/supabase";
import SmartImage from "./SmartImage";
import AilmentDetailBody from "./ailments/AilmentDetailBody";

interface Props {
  homeId: string;
  aiEnabled?: boolean;
}

const KIND_ICONS: Record<AilmentKind, typeof Bug> = {
  pest: Bug,
  disease: Biohazard,
  invasive: Sprout,
  disorder: AlertTriangle,
};
const KINDS: AilmentKind[] = ["pest", "disease", "invasive", "disorder"];
const SEVERITIES: AilmentSeverity[] = ["low", "moderate", "high", "critical"];

export default function AilmentLibrary({ homeId, aiEnabled = false }: Props) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { can } = usePermissions();
  const { setPageContext, setIsOpen: setChatOpen } = usePlantDoctor();
  const persona = usePersona();
  const isNewGardener = persona !== "experienced";

  const [list, setList] = useState<LibraryAilment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<AilmentKind | "all">("all");
  const [severity, setSeverity] = useState<AilmentSeverity | "all">("all");
  const [watchingOnly, setWatchingOnly] = useState(false);
  const [watchingKeys, setWatchingKeys] = useState<Set<string>>(new Set());
  // library id → favourite row id (for the ♥ fill + one-tap unfavourite).
  const [favByLibraryId, setFavByLibraryId] = useState<Map<number, string>>(new Map());
  const [plantNames, setPlantNames] = useState<string[]>([]);
  const [watchingBusy, setWatchingBusy] = useState<number | null>(null);
  const [favBusy, setFavBusy] = useState<number | null>(null);

  const canWatch = can("ailments.add");

  // The detail derives REACTIVELY from the URL param — works on mount, on
  // in-app navigation, and via back/forward.
  const selectedId = params.get("ailment");
  const selected = useMemo(
    () => (selectedId ? list.find((r) => String(r.id) === selectedId) ?? null : null),
    [list, selectedId],
  );

  useEffect(() => {
    fetchAilmentLibrary()
      .then(setList)
      .catch(() => toast.error("Couldn't load the ailment library."))
      .finally(() => setLoading(false));

    // Watching-state: normalized names of this home's non-archived watchlist
    // rows (the mapper writes `name` verbatim and nothing renames, so the
    // match is stable — recon-verified).
    supabase
      .from("ailments")
      .select("name, is_archived")
      .eq("home_id", homeId)
      .then(({ data }) => {
        const keys = new Set<string>();
        for (const r of data ?? []) {
          if (!r.is_archived) {
            const k = ailmentIdentityKey(r.name as string);
            if (k) keys.add(k);
          }
        }
        setWatchingKeys(keys);
      });

    // ♥ fill state — the user's favourites, keyed by library reference.
    listFavouriteAilments()
      .then((rows: FavouriteAilment[]) => {
        const map = new Map<number, string>();
        for (const f of rows) {
          const libId = (f as { ailment_library_id?: number | null }).ailment_library_id;
          const rowId = (f as { id?: string }).id;
          if (libId != null && rowId) map.set(libId, rowId);
        }
        setFavByLibraryId(map);
      })
      .catch(() => {/* favourites are an enhancement — browse still works */});

    // "Could affect your garden" — the home's active plant names.
    supabase
      .from("plants")
      .select("common_name, is_archived")
      .eq("home_id", homeId)
      .then(({ data }) => {
        setPlantNames(
          (data ?? [])
            .filter((p) => !p.is_archived && p.common_name)
            .map((p) => p.common_name as string),
        );
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homeId]);

  /** Open = PUSH (back closes the detail); close = replace back to browse. */
  const openDetail = (a: LibraryAilment) => {
    const next = new URLSearchParams(params);
    next.set("ailment", String(a.id));
    setParams(next);
  };
  const closeDetail = () => {
    const next = new URLSearchParams(params);
    next.delete("ailment");
    setParams(next, { replace: true });
  };

  const isWatching = (a: LibraryAilment) => {
    const k = ailmentIdentityKey(a.name);
    return !!k && watchingKeys.has(k);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list.filter((a) => {
      if (kind !== "all" && a.kind !== kind) return false;
      if (severity !== "all" && a.severity !== severity) return false;
      if (watchingOnly && !isWatching(a)) return false;
      if (!q) return true;
      return a.name.toLowerCase().includes(q)
        || (a.scientific_name ?? "").toLowerCase().includes(q)
        || a.aliases.some((x) => x.toLowerCase().includes(q))
        || a.affected_plant_types.some((x) => x.toLowerCase().includes(q));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, search, kind, severity, watchingOnly, watchingKeys]);

  const watchAilment = async (a: LibraryAilment) => {
    if (!canWatch || isWatching(a)) return;
    setWatchingBusy(a.id);
    try {
      await addLibraryAilmentToWatchlist(a, homeId);
      const k = ailmentIdentityKey(a.name);
      if (k) setWatchingKeys((prev) => new Set(prev).add(k));
      toast.success(`Watching "${a.name}" in this garden.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't add to your watchlist.");
    } finally {
      setWatchingBusy(null);
    }
  };

  const toggleFavourite = async (a: LibraryAilment) => {
    setFavBusy(a.id);
    try {
      const existing = favByLibraryId.get(a.id);
      if (existing) {
        await unfavouriteAilment(existing);
        setFavByLibraryId((prev) => {
          const next = new Map(prev);
          next.delete(a.id);
          return next;
        });
      } else {
        const row = await favouriteLibraryAilment(a, homeId);
        setFavByLibraryId((prev) => new Map(prev).set(a.id, (row as { id: string }).id));
        toast.success(`"${a.name}" saved to your favourites.`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update favourites.");
    } finally {
      setFavBusy(null);
    }
  };

  const askAi = (a: LibraryAilment) => {
    setPageContext({
      action: "Asking about an ailment from the library",
      ailment: {
        name: a.name,
        scientific_name: a.scientific_name,
        type: a.kind,
        description: a.description,
        symptoms: a.symptoms,
        treatment: a.treatment,
        prevention: a.prevention,
      },
    });
    setChatOpen(true);
  };

  // ── Detail takeover — the field-guide page ─────────────────────────────────
  // The body is the shared <AilmentDetailBody> (Stage 2 extraction) — the
  // SAME surface the search takeover opens as a modal. This host keeps the
  // page shell + `?ailment=` URL contract.
  if (selected) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-6" data-testid="ailment-detail">
        <button
          onClick={closeDetail}
          data-testid="ailment-detail-back"
          aria-label="Back to library"
          className="inline-flex items-center gap-1.5 text-xs font-black text-rhozly-on-surface-variant can-hover:hover:text-rhozly-on-surface mb-4 min-h-[44px] active:scale-[0.97] transition"
        >
          <ArrowLeft size={15} /> Ailment Library
        </button>
        <AilmentDetailBody
          ailment={selected}
          watching={isWatching(selected)}
          watchingBusy={watchingBusy === selected.id}
          canWatch={canWatch}
          onWatch={() => watchAilment(selected)}
          favRowId={favByLibraryId.get(selected.id) ?? null}
          favBusy={favBusy === selected.id}
          onToggleFavourite={() => toggleFavourite(selected)}
          aiEnabled={aiEnabled}
          onAskAi={() => askAi(selected)}
          isNewGardener={isNewGardener}
          plantNames={plantNames}
        />
      </div>
    );
  }

  // ── Browse ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-5xl mx-auto px-4 py-6" data-testid="ailment-library">
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={() => navigate("/shed?tab=watchlist")}
          className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-control can-hover:hover:bg-rhozly-surface-low active:scale-[0.94] transition"
          aria-label="Back to watchlist"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-black font-display tracking-tight text-rhozly-on-surface">Ailment Library</h1>
          <p className="text-xs text-rhozly-on-surface-variant">
            The field guide — pests, diseases, invasives &amp; disorders. Watch any of them in your garden.
          </p>
        </div>
      </div>

      <div className="relative mb-3">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-rhozly-on-surface/40" />
        <input
          data-testid="ailment-library-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, symptom or affected plant…"
          className="w-full pl-9 pr-3 py-3 min-h-[48px] rounded-control border border-rhozly-outline/20 bg-rhozly-surface-lowest text-sm focus:outline-none focus:border-rhozly-primary"
        />
      </div>

      <div className="flex flex-wrap gap-2 mb-2">
        <FilterChip active={kind === "all"} onClick={() => setKind("all")} testId="ailment-filter-all">All</FilterChip>
        {KINDS.map((k) => {
          const Icon = KIND_ICONS[k];
          return (
            <FilterChip key={k} active={kind === k} onClick={() => setKind(k)} testId={`ailment-filter-${k}`}>
              <Icon size={13} /> {AILMENT_KIND_CLASSES[k].label}
            </FilterChip>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2 mb-5">
        {SEVERITIES.map((s) => (
          <FilterChip
            key={s}
            active={severity === s}
            onClick={() => setSeverity(severity === s ? "all" : s)}
            testId={`ailment-severity-${s}`}
          >
            {AILMENT_SEVERITY_CLASSES[s].label}
          </FilterChip>
        ))}
        <FilterChip
          active={watchingOnly}
          onClick={() => setWatchingOnly((v) => !v)}
          testId="ailment-filter-watching"
        >
          <Binoculars size={13} /> Watching
        </FilterChip>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-rhozly-on-surface/30" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-sm text-rhozly-on-surface-variant" data-testid="ailment-library-empty">
          {watchingOnly
            ? "You're not watching anything that matches — browse the guide and tap the binoculars on anything worth an eye."
            : "No ailments match. The library is growing — check back soon."}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((a) => {
            const Icon = KIND_ICONS[a.kind];
            const kindMeta = AILMENT_KIND_CLASSES[a.kind];
            const watching = isWatching(a);
            const thumb = a.thumbnail_url ?? a.image_url;
            return (
              <div
                key={a.id}
                data-testid={`ailment-card-${a.id}`}
                className="rounded-card border border-rhozly-outline/10 bg-rhozly-surface-lowest shadow-card overflow-hidden flex flex-col can-hover:hover:border-rhozly-primary/40 transition-colors"
              >
                <button onClick={() => openDetail(a)} className="text-left flex-1" aria-label={`View ${a.name}`}>
                  <div className="h-24 relative">
                    {thumb ? (
                      <SmartImage src={thumb} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className={`w-full h-full flex items-center justify-center ${kindMeta.tile}`}>
                        <Icon size={26} />
                      </div>
                    )}
                    {a.severity && (
                      <span className={`absolute top-2 right-2 px-2 py-0.5 rounded-chip text-3xs font-bold ${AILMENT_SEVERITY_CLASSES[a.severity].chip}`}>
                        {AILMENT_SEVERITY_CLASSES[a.severity].label}
                      </span>
                    )}
                  </div>
                  <div className="p-3.5 pb-2">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-chip text-3xs font-bold ${kindMeta.chip}`}>
                        <Icon size={10} /> {kindMeta.label}
                      </span>
                    </div>
                    <p className="font-bold text-sm text-rhozly-on-surface truncate">{a.name}</p>
                    {a.scientific_name && (
                      <p className="text-2xs italic text-rhozly-on-surface/45 truncate">{a.scientific_name}</p>
                    )}
                    {a.affected_plant_types.length > 0 && (
                      <p className="mt-1 text-2xs text-rhozly-on-surface/50 flex items-center gap-1 truncate">
                        <Leaf size={11} className="shrink-0" /> {a.affected_plant_types.slice(0, 4).join(", ")}
                      </p>
                    )}
                  </div>
                </button>
                <div className="px-3.5 pb-3 flex items-center justify-end">
                  {watching ? (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-chip text-3xs font-bold bg-status-success-fill text-status-success-ink border border-status-success-line">
                      <Check size={11} /> Watching
                    </span>
                  ) : canWatch ? (
                    <button
                      onClick={() => watchAilment(a)}
                      disabled={watchingBusy === a.id}
                      data-testid={`ailment-watch-${a.id}`}
                      aria-label={`Watch ${a.name} in this garden`}
                      className="w-9 h-9 pointer-coarse:w-11 pointer-coarse:h-11 rounded-control flex items-center justify-center border border-rhozly-outline/15 text-rhozly-on-surface-variant can-hover:hover:text-rhozly-primary can-hover:hover:border-rhozly-primary/40 active:scale-[0.94] transition touch-manipulation"
                    >
                      {watchingBusy === a.id ? <Loader2 size={15} className="animate-spin" /> : <Binoculars size={15} />}
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FilterChip({
  active, onClick, testId, children,
}: {
  active: boolean; onClick: () => void; testId: string; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] pointer-coarse:min-h-11 rounded-control text-xs font-bold transition active:scale-[0.97] touch-manipulation ${
        active ? "bg-rhozly-primary text-white" : "bg-rhozly-surface-low text-rhozly-on-surface/60 can-hover:hover:text-rhozly-on-surface"
      }`}
    >
      {children}
    </button>
  );
}
