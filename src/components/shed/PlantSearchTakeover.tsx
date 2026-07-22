import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Search,
  Loader2,
  ChevronUp,
  Info,
  ListPlus,
  ChevronLeft,
  ArrowLeft,
  Trash2,
  Edit3,
  X,
  ShoppingBasket,
  Clock,
} from "lucide-react";
import { getProviderPlantDetails, careGuideToPlantDetails } from "../../lib/plantProvider";
import type { PlantDetails } from "../../lib/verdantlyUtils";
import { usePlantDoctor } from "../../context/PlantDoctorContext";
import { usePersona } from "../../hooks/usePersona";
import { PlantDoctorService } from "../../services/plantDoctorService";
import ManualPlantCreation from "../ManualPlantCreation";
import PlantInfoPanel from "../PlantInfoPanel";
import PlantSearch from "../shared/PlantSearch";
import PlantDetailModal from "../PlantDetailModal";
import PlantResultThumb from "../PlantResultThumb";
import { libraryRowToPlantDetails } from "../../lib/plantCatalogue";
import { isUsablePlantImageUrl } from "../../lib/plantThumb";
import { selectionToProviderResult, type PlantSelection, type PlantFilters } from "../../lib/unifiedPlantSearch";
import type { ProviderSearchResult } from "../../lib/verdantlyUtils";

/** Minimal owned-plant shape for the "In your Shed" section (Stage 3). */
export interface OwnedPlantMatch {
  id: number | string;
  common_name: string;
  scientific_name?: string[] | null;
  image_url?: string | null;
  instance_count?: number | null;
}

interface Props {
  homeId: string;
  isPremium: boolean;
  isAiEnabled: boolean;
  onClose: () => void;
  onProceedToBulkAdd: (selectedPlants: any[]) => void;
  initialSearchTerm?: string;
  /** Seed the structured filters (the takeover's browse-by-filter entries). */
  initialFilters?: PlantFilters;
  initialCartItems?: { type: "api" | "ai" | "verdantly"; data: any }[];
  onManualSave?: (plantData: any) => void;
  /** Stage 3 — one search: the landing grid-filter died, so YOUR plants
   *  surface here first ("In your Shed") above the library results. */
  ownedPlants?: OwnedPlantMatch[];
  /** Tap an owned row → the host closes the overlay + opens that plant. */
  onOpenOwnedPlant?: (plant: OwnedPlantMatch) => void;
  /** Hub v3 Stage A — derived presence per plant id (plant_presence view).
   *  Owned rows show ONE pill: Active > Inactive > Saved. */
  plantPresence?: Map<number, "active" | "inactive">;
}

// Recent searches — a small local ring so the takeover never opens blank.
const RECENTS_KEY = "rhozly.recent-plant-searches";
function readRecents(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENTS_KEY) || "[]");
    return Array.isArray(v) ? v.filter((s: unknown) => typeof s === "string").slice(0, 5) : [];
  } catch {
    return [];
  }
}
function pushRecent(term: string): string[] {
  const t = term.trim();
  if (t.length < 2) return readRecents();
  const next = [t, ...readRecents().filter((r) => r.toLowerCase() !== t.toLowerCase())].slice(0, 5);
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    // storage unavailable (private mode) — recents just don't persist
  }
  return next;
}

const EXAMPLE_SEARCHES = ["tomato", "lavender", "monstera"];

// Persona browse chips — re-homed from the Shed landing (Stage 3): a warm way
// IN for new gardeners; each seeds a browse-by-filter search.
const BROWSE_CHIPS: Array<{ label: string; filters: PlantFilters }> = [
  { label: "Edible favourites", filters: { edible: true } },
  { label: "Indoor friends", filters: { indoor: true } },
  { label: "Sun lovers", filters: { sunlight: ["full_sun"] } },
  { label: "Easy annuals", filters: { cycle: ["annual"] } },
];

/**
 * Search plants — the full-screen search overlay (garden-hub search-first
 * overhaul Stage 1, 2026-07-21). A `fixed inset-0 z-[60]` surface that covers
 * the app header, weather bar and hub tabs, with the input pinned in a top
 * bar (~y=60) so a phone keyboard never hides what you're typing — the
 * measured predecessor put the input at y=601 with zero results visible.
 * The Shed grid stays MOUNTED underneath (no more early-return, no scroll
 * save/restore) so closing lands exactly where you left off.
 *
 * Contracts preserved verbatim: props are BulkSearchModal's; cart-item shapes
 * (`buildCartItem`/`selectionKey`); `preloadedDetails` forwarding (no-Gemini
 * library path + user_plant_ack seeding downstream); paste-a-list seeding
 * ("Add a whole list"); the Search|Manual tab testids (`bulk-search-tab-*` —
 * Shepherd tour anchors); `plant-search-input` on the (now host-owned) input;
 * `bulk-search-review` on the review opener (the top-bar basket, rendered
 * only when the cart is non-empty — e2e asserts count 0 when idle);
 * `bulk-search-start-import`; `shed-search-back`; deep links
 * (`?open=add-plant&query=`, `state.autoImport` → review). NOT role="dialog"
 * — it's a page surface (SHED-TKO-001 asserts no aria-modal overlay).
 */
export default function PlantSearchTakeover({
  homeId,
  isPremium,
  isAiEnabled,
  onClose,
  onProceedToBulkAdd,
  initialSearchTerm,
  initialFilters,
  initialCartItems,
  onManualSave,
  ownedPlants,
  onOpenOwnedPlant,
  plantPresence,
}: Props) {
  const { setPageContext } = usePlantDoctor();
  const persona = usePersona();
  const isNewGardener = persona !== "experienced";

  const [step, setStep] = useState<"search" | "review">("search");
  const [activeTab, setActiveTab] = useState<"search" | "manual">("search");

  // The host owns the input (pinned top bar); PlantSearch follows via
  // controlledQuery and reports suggestion-chip jumps back through
  // onQueryChange.
  const [query, setQuery] = useState(initialSearchTerm || "");
  const [recents, setRecents] = useState<string[]>(() => readRecents());
  // Browse-by-filter seeding: initialFilters is mount-only inside PlantSearch,
  // so the idle browse chips remount it with a fresh seed (key bump).
  const [seedFilters, setSeedFilters] = useState<PlantFilters | undefined>(initialFilters);
  const [seedKey, setSeedKey] = useState(0);

  const [listMode, setListMode] = useState(false);
  const [pastedList, setPastedList] = useState("");

  const [expandedResultId, setExpandedResultId] = useState<string | null>(null);
  const [detailsCache, setDetailsCache] = useState<Map<string, PlantDetails>>(new Map());
  const [loadingDetailsIds, setLoadingDetailsIds] = useState<Set<string>>(new Set());
  const fetchingDetailsRef = useRef<Set<string>>(new Set());

  const [selectedPlantsMap, setSelectedPlantsMap] = useState<Map<string, any>>(new Map());
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);
  const [detailResult, setDetailResult] = useState<ProviderSearchResult | null>(null);

  // Hand focus back to the button that opened us when the overlay closes.
  useEffect(() => {
    return () => {
      requestAnimationFrame(() => {
        document.querySelector<HTMLElement>('[data-testid="shed-add-plant-btn"]')?.focus();
      });
    };
  }, []);

  // Escape ladder: detail modal owns its own Escape → a typed query clears
  // first (standard search-field behaviour) → review steps back to search →
  // the overlay closes. The Manual tab is a form — Escape there must never
  // discard typed work (the form has its own Cancel).
  const detailOpenRef = useRef(false);
  detailOpenRef.current = detailResult !== null;
  const stepRef = useRef(step);
  stepRef.current = step;
  const tabRef = useRef(activeTab);
  tabRef.current = activeTab;
  const queryRef = useRef(query);
  queryRef.current = query;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (detailOpenRef.current) return;
      if (tabRef.current === "manual" && stepRef.current === "search") return;
      if (stepRef.current === "review") setStep("search");
      else if (queryRef.current.trim()) setQuery("");
      else onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stable cart key per selection — db hits keyed by provider id, everything
  // else (library / ai / manual) keyed by common name (matches the AI branch).
  const selectionKey = (sel: PlantSelection): string => {
    if (sel.source === "perenual") return `per:${sel.perenual_id ?? (sel.raw as any)?.id}`;
    if (sel.source === "verdantly") return `ver:${sel.verdantly_id ?? (sel.raw as any)?.id}`;
    return sel.common_name;
  };

  const buildCartItem = (sel: PlantSelection) => {
    if (sel.source === "perenual") {
      const raw = (sel.raw as any) ?? {};
      return {
        type: "api",
        data: {
          _provider: "perenual",
          id: sel.perenual_id ?? raw.id,
          common_name: sel.common_name,
          scientific_name: sel.scientific_name ? [sel.scientific_name] : [],
          default_image: raw.default_image ?? null,
          thumbnail_url: sel.thumbnail_url ?? null,
        },
      };
    }
    if (sel.source === "verdantly") {
      const raw = (sel.raw as any) ?? {};
      return {
        type: "verdantly",
        data: {
          _provider: "verdantly",
          id: raw.id,
          verdantly_id: sel.verdantly_id ?? raw.verdantly_id ?? raw.id,
          common_name: sel.common_name,
          scientific_name: sel.scientific_name ? [sel.scientific_name] : [],
          thumbnail_url: sel.thumbnail_url ?? null,
        },
      };
    }
    // library / ai / manual → AI branch (string data identifier)
    return { type: "ai", data: sel.common_name };
  };

  const handleSelectFromSearch = (sel: PlantSelection) => {
    const key = selectionKey(sel);
    // Recent-push OUTSIDE the updater — updaters must stay pure (StrictMode
    // double-invokes them; localStorage writes + sibling setState don't belong
    // inside). Adding (not removing) counts as search intent.
    if (!selectedPlantsMap.has(key)) setRecents(pushRecent(queryRef.current));
    setSelectedPlantsMap((prev) => {
      const next = new Map(prev);
      if (next.has(key)) next.delete(key);
      else next.set(key, buildCartItem(sel));
      return next;
    });
    // Library rows carry their full record — pre-map to PlantDetails so the
    // review preview renders instantly and the AI branch reuses it (no Gemini).
    if (sel.source === "library" && sel.raw) {
      setDetailsCache((prev) =>
        prev.has(key) ? prev : new Map(prev).set(key, libraryRowToPlantDetails(sel.raw)),
      );
    }
  };

  // state.autoImport (AreaDetails / PlantActionButtons / PlanStaging) lands a
  // pre-built cart and opens DIRECTLY into the review step — contract preserved.
  useEffect(() => {
    if (initialCartItems && initialCartItems.length > 0) {
      const newMap = new Map<string, any>();
      initialCartItems.forEach((item) => {
        const key =
          item.type === "api"
            ? `per:${item.data.id}`
            : item.type === "verdantly"
              ? `ver:${item.data.verdantly_id ?? item.data.id}`
              : typeof item.data === "string"
                ? item.data
                : item.data.common_name;
        newMap.set(key, item);
      });
      setSelectedPlantsMap(newMap);
      setStep("review");
    }
  }, [initialCartItems]);

  // AI page-context lifecycle — verbatim from the modal (the chat keeps
  // search context while the overlay is open).
  useEffect(() => {
    setPageContext({
      action: step === "review" ? "Reviewing Bulk Import Selection" : "Bulk Searching Plants",
      searchContext: {
        currentQuery: query,
        selectedCount: selectedPlantsMap.size,
        sourcesEnabled: { ai: isAiEnabled, perenual: isPremium },
      },
    });
    return () => setPageContext(null);
  }, [query, selectedPlantsMap.size, step, isAiEnabled, isPremium, setPageContext]);

  const fetchDetails = async (id: string, plantObj?: any) => {
    if (detailsCache.has(id) || fetchingDetailsRef.current.has(id)) return;
    fetchingDetailsRef.current.add(id);
    setLoadingDetailsIds((prev) => new Set(prev).add(id));
    try {
      let details: PlantDetails;
      if (plantObj) {
        details = await getProviderPlantDetails({
          source: plantObj._provider === "verdantly" ? "verdantly" : "api",
          perenual_id: plantObj._provider !== "verdantly" ? (plantObj.perenual_id ?? plantObj.id) : null,
          verdantly_id: plantObj._provider === "verdantly" ? (plantObj.verdantly_id ?? plantObj.id) : null,
        });
      } else {
        const cleanName = id.split("(")[0].trim();
        const aiData = await PlantDoctorService.generateCareGuide(cleanName, homeId);
        details = careGuideToPlantDetails(aiData?.plantData ?? aiData, cleanName);
        if (aiData?.db_plant_id != null) {
          details.db_plant_id = aiData.db_plant_id;
          details.freshness_version = aiData.freshness_version ?? null;
          details.from_catalogue = aiData.fromCatalogue ?? false;
        }
      }
      setDetailsCache((prev) => new Map(prev).set(id, details));
    } catch {
      // silently fail — PlantInfoPanel shows "No information available"
    } finally {
      fetchingDetailsRef.current.delete(id);
      setLoadingDetailsIds((prev) => { const s = new Set(prev); s.delete(id); return s; });
    }
  };

  const handleExpandResult = (identifier: string, plantObj?: any) => {
    if (expandedResultId === identifier) {
      setExpandedResultId(null);
      return;
    }
    setExpandedResultId(identifier);
    fetchDetails(identifier, plantObj);
  };

  const toggleSelection = (id: string, plantData: any) => {
    setSelectedPlantsMap((prev) => {
      const newMap = new Map(prev);
      if (newMap.has(id)) newMap.delete(id);
      else newMap.set(id, plantData);
      return newMap;
    });
  };

  const handleSearchNextFromList = () => {
    const lines = pastedList.split(/\n+/).map((s) => s.trim()).filter(Boolean);
    if (lines.length === 0) return;
    setQuery(lines[0]);
    setPastedList(lines.slice(1).join("\n"));
  };

  const openDetail = (sel: PlantSelection) => {
    setRecents(pushRecent(queryRef.current));
    setDetailResult(selectionToProviderResult(sel));
  };

  const renderInfoPanel = (id: string, plantName?: string) => (
    <div className="border-t border-rhozly-outline/5 animate-in slide-in-from-top-2">
      <PlantInfoPanel
        details={detailsCache.get(id) ?? null}
        loading={loadingDetailsIds.has(id)}
        plantName={plantName}
      />
    </div>
  );

  const cartCount = selectedPlantsMap.size;
  const idle = query.trim().length < 2;

  // "In your Shed" — owned matches surface FIRST (Stage 3: this absorbs the
  // landing grid-filter; one search, two worlds). Same matching rules as the
  // old grid filter (common + scientific name contains).
  const ownedMatches = React.useMemo(() => {
    if (!ownedPlants || query.trim().length < 2) return [] as OwnedPlantMatch[];
    const q = query.trim().toLowerCase();
    return ownedPlants
      .filter(
        (p) =>
          p.common_name.toLowerCase().includes(q) ||
          (p.scientific_name ?? []).some((n) => n.toLowerCase().includes(q)),
      )
      .slice(0, 4);
  }, [ownedPlants, query]);

  // PORTAL to document.body: PullToRefresh's scroller keeps a residual
  // `transform` after any pull gesture, which makes it the containing block
  // for `fixed` descendants — the overlay would render trapped inside the
  // content area instead of covering the app chrome (caught live, Stage 2).
  // A React portal moves only the DOM node; router + context still work.
  return createPortal(
    <div
      // z-[60]: above the app header (sticky z-50) + bottom nav, below every
      // modal (z-100+; PlantDetailModal z-[140] stacks over this for
      // detail-from-search).
      className="fixed inset-0 z-[60] bg-rhozly-bg flex flex-col animate-in fade-in duration-200"
      data-testid="plant-search-takeover"
    >
      {/* ── Top bar — the only pinned chrome ───────────────────────────────── */}
      <header
        className="shrink-0 bg-rhozly-bg border-b border-rhozly-outline/10"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="max-w-3xl mx-auto w-full px-3 pt-2 pb-2">
          <div className="flex items-center gap-2">
            {step === "review" ? (
              <button
                onClick={() => {
                  setStep("search");
                  setExpandedResultId(null);
                  setPendingRemoveId(null);
                }}
                data-testid="bulk-search-back-to-search"
                aria-label="Back to search"
                className="shrink-0 w-11 h-11 flex items-center justify-center rounded-control text-rhozly-on-surface/70 can-hover:hover:bg-rhozly-surface-low can-hover:hover:text-rhozly-on-surface active:scale-[0.95] transition"
              >
                <ChevronLeft size={22} />
              </button>
            ) : (
              <button
                onClick={onClose}
                data-testid="shed-search-back"
                aria-label="Back to your Shed"
                className="shrink-0 w-11 h-11 flex items-center justify-center rounded-control text-rhozly-on-surface/70 can-hover:hover:bg-rhozly-surface-low can-hover:hover:text-rhozly-on-surface active:scale-[0.95] transition"
              >
                <ArrowLeft size={20} />
              </button>
            )}

            {step === "review" ? (
              <div className="flex-1 min-w-0">
                <p className="text-base font-black text-rhozly-on-surface leading-tight truncate">Review your picks</p>
                <p className="text-3xs font-black uppercase tracking-widest text-rhozly-on-surface/40">
                  {cartCount} plant{cartCount === 1 ? "" : "s"} ready to join the Shed
                </p>
              </div>
            ) : activeTab === "manual" ? (
              <p className="flex-1 min-w-0 text-base font-black text-rhozly-on-surface px-1 truncate">
                Add a plant manually
              </p>
            ) : (
              <div className="relative flex-1 min-w-0">
                <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-rhozly-on-surface/40 pointer-events-none" />
                <input
                  type="search"
                  data-testid="plant-search-input"
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                  enterKeyHint="search"
                  placeholder="Search plants…"
                  aria-label="Search plants"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full h-[52px] pl-10 pr-10 rounded-control bg-white border border-rhozly-outline/20 text-base font-bold text-rhozly-on-surface placeholder:text-rhozly-on-surface/40 outline-none focus:border-rhozly-primary/50 [&::-webkit-search-cancel-button]:hidden"
                />
                {query && (
                  <button
                    type="button"
                    aria-label="Clear search"
                    data-testid="plant-search-clear"
                    onClick={() => setQuery("")}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-full text-rhozly-on-surface/40 can-hover:hover:text-rhozly-on-surface can-hover:hover:bg-rhozly-surface-low transition"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            )}

            {step === "review" ? (
              <button
                onClick={onClose}
                data-testid="shed-search-back"
                aria-label="Back to your Shed"
                className="shrink-0 w-11 h-11 flex items-center justify-center rounded-control text-rhozly-on-surface/70 can-hover:hover:bg-rhozly-surface-low can-hover:hover:text-rhozly-on-surface active:scale-[0.95] transition"
              >
                <X size={20} />
              </button>
            ) : cartCount > 0 ? (
              <button
                onClick={() => setStep("review")}
                data-testid="bulk-search-review"
                aria-label={`Review ${cartCount} selected plant${cartCount === 1 ? "" : "s"}`}
                className="relative shrink-0 w-11 h-11 flex items-center justify-center rounded-control bg-rhozly-primary text-white shadow-raised active:scale-[0.95] transition animate-in zoom-in-95"
              >
                <ShoppingBasket size={20} />
                <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 bg-status-danger-ink text-white rounded-full text-[10px] font-black flex items-center justify-center border-2 border-rhozly-bg">
                  {cartCount}
                </span>
              </button>
            ) : null}
          </div>

          {/* Utility row — mode tabs + bulk list entry */}
          {step === "search" && (
            <div className="flex items-center justify-between gap-2 mt-2">
              <div role="tablist" className="flex bg-rhozly-surface-low p-1 rounded-control gap-1">
                <button
                  role="tab"
                  data-testid="bulk-search-tab-search"
                  aria-selected={activeTab === "search"}
                  onClick={() => { setActiveTab("search"); setExpandedResultId(null); }}
                  className={`flex items-center justify-center gap-1.5 px-4 py-2 min-h-[40px] pointer-coarse:min-h-11 rounded-[calc(var(--radius-control)-4px)] text-xs font-black transition-all ${activeTab === "search" ? "bg-rhozly-surface-lowest text-rhozly-primary shadow-card" : "text-rhozly-on-surface/40 can-hover:hover:text-rhozly-on-surface"}`}
                >
                  <Search size={14} /> Search
                </button>
                <button
                  role="tab"
                  data-testid="bulk-search-tab-manual"
                  aria-selected={activeTab === "manual"}
                  onClick={() => { setActiveTab("manual"); setExpandedResultId(null); }}
                  className={`flex items-center justify-center gap-1.5 px-4 py-2 min-h-[40px] pointer-coarse:min-h-11 rounded-[calc(var(--radius-control)-4px)] text-xs font-black transition-all ${activeTab === "manual" ? "bg-rhozly-surface-lowest text-rhozly-primary shadow-card" : "text-rhozly-on-surface/40 can-hover:hover:text-rhozly-on-surface"}`}
                >
                  <Edit3 size={14} /> Manual
                </button>
              </div>
              {activeTab === "search" && (
                <button
                  type="button"
                  data-testid="bulk-paste-toggle"
                  onClick={() => {
                    setListMode((v) => {
                      if (v) setPastedList("");
                      return !v;
                    });
                  }}
                  className={`flex items-center gap-1.5 text-xs font-black px-3 py-2 min-h-[40px] pointer-coarse:min-h-11 rounded-full transition-colors ${
                    listMode
                      ? "bg-rhozly-primary text-white"
                      : "text-rhozly-on-surface/55 can-hover:hover:text-rhozly-primary can-hover:hover:bg-rhozly-primary/5"
                  }`}
                >
                  <ListPlus size={14} />
                  {listMode ? "Hide list" : "Add a whole list"}
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      {/* ── Body — everything scrolls under the pinned bar ─────────────────── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar overscroll-contain">
        <div className="max-w-3xl mx-auto w-full px-4 pt-3 pb-10">
          {step === "review" ? (
            <>
              <div className="space-y-3">
                {Array.from(selectedPlantsMap.entries()).map(([id, item]) => {
                  const isDb = item.type === "api" || item.type === "verdantly";
                  const name = typeof item.data === "string"
                    ? item.data.split("(")[0].trim()
                    : item.data.common_name;
                  const subName = typeof item.data === "string"
                    ? item.data.match(/\(([^)]+)\)/)?.[1]
                    : item.data.scientific_name?.[0];
                  const rawThumb =
                    item.type === "api"
                      ? item.data.default_image?.thumbnail
                      : typeof item.data === "string"
                        ? null
                        : item.data.thumbnail_url;
                  const thumbnail = isUsablePlantImageUrl(rawThumb)
                    ? rawThumb
                    : detailsCache.get(id)?.thumbnail_url || null;

                  const badgeClass =
                    item.type === "api"       ? "bg-rhozly-primary/10 text-rhozly-primary" :
                    item.type === "verdantly" ? "bg-status-success-fill text-status-success-ink" :
                                                "bg-status-weather-fill text-status-weather-ink";
                  const badgeLabel =
                    item.type === "api"       ? "Perenual" :
                    item.type === "verdantly" ? "Verdantly" :
                                                "Library / AI";

                  return (
                    <div
                      key={id}
                      className="w-full bg-rhozly-surface-lowest border border-rhozly-outline/10 rounded-card transition-all overflow-hidden flex flex-col shadow-card"
                    >
                      <div className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-4 min-w-0">
                          <div className="w-12 h-12 rounded-control bg-rhozly-primary/5 overflow-hidden shrink-0 flex items-center justify-center text-rhozly-primary/40">
                            <PlantResultThumb
                              name={name}
                              url={thumbnail}
                              source={item.type === "ai" ? "ai" : item.type === "verdantly" ? "verdantly" : "perenual"}
                              iconSize={20}
                            />
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-black text-rhozly-on-surface leading-tight truncate">{name}</h4>
                            <p className="text-2xs font-bold text-rhozly-on-surface/50 italic truncate">
                              {subName || "Ready for processing"}
                            </p>
                            <span className={`text-3xs font-black uppercase tracking-widest px-2 py-0.5 rounded-chip mt-1 inline-block ${badgeClass}`}>
                              {badgeLabel}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => handleExpandResult(id, isDb ? item.data : undefined)}
                            aria-label={`More about ${name}`}
                            className="p-3 pointer-coarse:min-h-11 pointer-coarse:min-w-11 can-hover:hover:bg-rhozly-surface-low rounded-control text-rhozly-on-surface/60 can-hover:hover:text-rhozly-primary transition-colors"
                          >
                            {expandedResultId === id ? <ChevronUp size={18} /> : loadingDetailsIds.has(id) ? <Loader2 size={18} className="animate-spin" /> : <Info size={18} />}
                          </button>
                          {pendingRemoveId === id ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => { toggleSelection(id, item); setPendingRemoveId(null); }}
                                aria-label="Confirm remove from selection"
                                className="px-3 py-2 min-h-[40px] bg-status-danger-ink text-white rounded-control text-xs font-black active:scale-[0.97] transition"
                              >
                                Remove
                              </button>
                              <button
                                onClick={() => setPendingRemoveId(null)}
                                aria-label="Cancel remove"
                                className="px-3 py-2 min-h-[40px] bg-rhozly-surface-low text-rhozly-on-surface/60 rounded-control text-xs font-black active:scale-[0.97] transition"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setPendingRemoveId(id)}
                              aria-label="Remove from selection"
                              className="p-3 pointer-coarse:min-h-11 pointer-coarse:min-w-11 bg-status-danger-fill text-status-danger-ink rounded-control can-hover:hover:bg-status-danger-ink can-hover:hover:text-white active:scale-[0.95] transition-colors"
                            >
                              <Trash2 size={18} />
                            </button>
                          )}
                        </div>
                      </div>
                      {expandedResultId === id && renderInfoPanel(id, name)}
                    </div>
                  );
                })}
              </div>

              <div className="sticky bottom-2 mt-5">
                <button
                  data-testid="bulk-search-start-import"
                  onClick={() =>
                    onProceedToBulkAdd(
                      Array.from(selectedPlantsMap.entries()).map(([id, item]) => ({
                        ...item,
                        preloadedDetails: item.type === "ai" ? detailsCache.get(id) : undefined,
                      })),
                    )
                  }
                  disabled={selectedPlantsMap.size === 0}
                  className="w-full py-4 bg-rhozly-primary text-white rounded-control font-black shadow-raised active:scale-[0.99] transition disabled:opacity-50"
                >
                  Start Bulk Import
                </button>
              </div>
            </>
          ) : activeTab === "manual" ? (
            <ManualPlantCreation
              onSave={(data) => { onManualSave?.(data); onClose(); }}
              onCancel={onClose}
            />
          ) : (
            <>
              {listMode && (
                <div
                  data-testid="bulk-paste-panel"
                  className="bg-rhozly-surface-low rounded-card p-3 space-y-2 animate-in slide-in-from-top-1 mb-3"
                >
                  <textarea
                    data-testid="bulk-paste-textarea"
                    value={pastedList}
                    onChange={(e) => setPastedList(e.target.value)}
                    placeholder={"Paste plant names — one per line\nTomato\nBasil\nCourgette\nPepper"}
                    rows={5}
                    className="w-full px-3 py-2 rounded-control bg-rhozly-surface-lowest border border-rhozly-outline/15 text-sm font-bold outline-none focus:border-rhozly-primary resize-y min-h-[100px]"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-2xs font-bold text-rhozly-on-surface/50 leading-snug">
                      {(() => {
                        const remaining = pastedList.split(/\n+/).map((s) => s.trim()).filter(Boolean);
                        return remaining.length > 0
                          ? `${remaining.length} item${remaining.length !== 1 ? "s" : ""} queued — "Search next" works through them one at a time.`
                          : `Tap "Search next" to search the first item — repeat to work through the list.`;
                      })()}
                    </p>
                    <button
                      type="button"
                      data-testid="bulk-paste-search-next"
                      onClick={handleSearchNextFromList}
                      disabled={!pastedList.trim()}
                      className="shrink-0 flex items-center gap-1.5 bg-rhozly-primary text-white text-xs font-black px-3 py-2 min-h-[36px] pointer-coarse:min-h-11 rounded-control disabled:opacity-50 active:scale-[0.97] transition"
                    >
                      <Search size={12} />
                      Search next
                    </button>
                  </div>
                </div>
              )}

              {/* Idle state — never blank: recent searches, or example rows
                  for gardeners who haven't searched before. */}
              {idle && !listMode && (
                <div className="mb-3" data-testid="search-idle-state">
                  {recents.length > 0 ? (
                    <>
                      <p className="text-2xs font-black uppercase tracking-widest text-rhozly-on-surface/40 px-1 mb-1.5">
                        Recent searches
                      </p>
                      <ul>
                        {recents.map((term, i) => (
                          <li key={term}>
                            <button
                              type="button"
                              data-testid={`search-recent-${i}`}
                              onClick={() => setQuery(term)}
                              className="w-full flex items-center gap-3 px-2 py-2.5 min-h-[48px] rounded-control text-left can-hover:hover:bg-rhozly-surface-low transition-colors"
                            >
                              <Clock size={15} className="shrink-0 text-rhozly-on-surface/35" />
                              <span className="text-sm font-bold text-rhozly-on-surface/80 truncate">{term}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : isNewGardener ? (
                    <>
                      <p className="text-2xs font-black uppercase tracking-widest text-rhozly-on-surface/40 px-1 mb-1.5">
                        Try searching for
                      </p>
                      <ul>
                        {EXAMPLE_SEARCHES.map((term, i) => (
                          <li key={term}>
                            <button
                              type="button"
                              data-testid={`search-example-${i}`}
                              onClick={() => setQuery(term)}
                              className="w-full flex items-center gap-3 px-2 py-2.5 min-h-[48px] rounded-control text-left can-hover:hover:bg-rhozly-surface-low transition-colors"
                            >
                              <Search size={15} className="shrink-0 text-rhozly-on-surface/35" />
                              <span className="text-sm font-bold text-rhozly-on-surface/80">{term}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}

                  {/* Browse chips — new gardeners get a filter-first way in. */}
                  {isNewGardener && (
                    <div data-testid="shed-browse-chips" className="flex flex-wrap gap-2 mt-3 px-1">
                      {BROWSE_CHIPS.map((chip) => (
                        <button
                          key={chip.label}
                          type="button"
                          data-testid={`shed-browse-chip-${chip.label.toLowerCase().replace(/\s+/g, "-")}`}
                          onClick={() => {
                            setSeedFilters(chip.filters);
                            setSeedKey((k) => k + 1);
                          }}
                          className="px-3.5 py-2 min-h-[40px] pointer-coarse:min-h-11 rounded-full bg-rhozly-surface-lowest border border-rhozly-outline/15 text-xs font-bold text-rhozly-on-surface-variant can-hover:hover:border-rhozly-primary/40 can-hover:hover:text-rhozly-primary active:scale-[0.97] transition touch-manipulation"
                        >
                          {chip.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* "In your Shed" — your own plants first, then the world's. */}
              {ownedMatches.length > 0 && (
                <div className="mb-4" data-testid="search-owned-section">
                  <p className="text-2xs font-black uppercase tracking-widest text-rhozly-on-surface/40 px-1 mb-1.5">
                    In your Shed
                  </p>
                  <ul className="space-y-1.5">
                    {ownedMatches.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          data-testid={`search-owned-${p.id}`}
                          onClick={() => onOpenOwnedPlant?.(p)}
                          className="w-full flex items-center gap-3 pl-3 pr-2 py-2.5 min-h-[72px] rounded-2xl bg-rhozly-primary/5 border border-rhozly-primary/15 text-left can-hover:hover:border-rhozly-primary/40 active:scale-[0.99] transition"
                        >
                          <div className="w-14 h-14 shrink-0 rounded-2xl overflow-hidden bg-rhozly-primary/10 flex items-center justify-center text-rhozly-primary/50">
                            <PlantResultThumb name={p.common_name} url={p.image_url ?? null} source="library" iconSize={22} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-black text-base text-rhozly-on-surface leading-tight truncate">{p.common_name}</p>
                            <p className="text-xs font-bold text-rhozly-on-surface/45 truncate flex items-center gap-1.5">
                              {(() => {
                                // Hub v3 Stage A — ONE pill, Active > Inactive > Saved.
                                const pres = plantPresence?.get(Number(p.id));
                                const pill = pres === "active"
                                  ? { label: "Active", cls: "bg-status-success-fill text-status-success-ink border border-status-success-line" }
                                  : pres === "inactive"
                                    ? { label: "Inactive", cls: "bg-rhozly-surface-low text-rhozly-on-surface/55 border border-rhozly-outline/15" }
                                    : { label: "Saved", cls: "bg-rhozly-primary/10 text-rhozly-primary" };
                                return (
                                  <span
                                    data-testid={`search-owned-presence-${p.id}`}
                                    data-presence={pres ?? "saved"}
                                    className={`shrink-0 px-1.5 py-0.5 rounded-chip text-2xs font-black ${pill.cls}`}
                                  >
                                    {pill.label}
                                  </span>
                                );
                              })()}
                              <span className="truncate">
                                {p.scientific_name?.[0] ? <span className="italic">{p.scientific_name[0]}</span> : "In your Shed"}
                                {(p.instance_count ?? 0) > 0 ? ` · ${p.instance_count} planted` : ""}
                              </span>
                            </p>
                          </div>
                          <ChevronLeft size={16} className="shrink-0 rotate-180 text-rhozly-on-surface/30" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Library-first unified search — host-owned input, big rows,
                  row tap → full detail, + → cart. */}
              <PlantSearch
                key={`seed-${seedKey}`}
                homeId={homeId}
                showFilters
                multiSelect
                tapOpensDetails
                controlledQuery={query}
                initialFilters={seedFilters}
                onQueryChange={setQuery}
                gates={{
                  // Verdantly is free for all; Perenual self-gates inside searchAllProviders.
                  canSearchExternal: true,
                  canCreateWithAI: isAiEnabled,
                }}
                isSelected={(sel) => selectedPlantsMap.has(selectionKey(sel))}
                onSelect={handleSelectFromSearch}
                onViewDetails={openDetail}
              />
            </>
          )}
        </div>
      </div>

      {detailResult && (
        <PlantDetailModal
          result={detailResult}
          homeId={homeId}
          aiEnabled={isAiEnabled}
          isPremium={isPremium}
          onClose={() => setDetailResult(null)}
        />
      )}
    </div>,
    document.body,
  );
}
