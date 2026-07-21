import React, { useState, useEffect, useRef } from "react";
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
} from "lucide-react";
import { getProviderPlantDetails, careGuideToPlantDetails } from "../../lib/plantProvider";
import type { PlantDetails } from "../../lib/verdantlyUtils";
import { usePlantDoctor } from "../../context/PlantDoctorContext";
import { PlantDoctorService } from "../../services/plantDoctorService";
import ManualPlantCreation from "../ManualPlantCreation";
import PlantInfoPanel from "../PlantInfoPanel";
import PlantSearch from "../shared/PlantSearch";
import PlantDetailModal from "../PlantDetailModal";
import PlantResultThumb from "../PlantResultThumb";
import { libraryRowToPlantDetails } from "../../lib/plantCatalogue";
import { isUsablePlantImageUrl } from "../../lib/plantThumb";
import { selectionToProviderResult, type PlantSelection } from "../../lib/unifiedPlantSearch";
import type { ProviderSearchResult } from "../../lib/verdantlyUtils";

interface Props {
  homeId: string;
  isPremium: boolean;
  isAiEnabled: boolean;
  onClose: () => void;
  onProceedToBulkAdd: (selectedPlants: any[]) => void;
  initialSearchTerm?: string;
  initialCartItems?: { type: "api" | "ai" | "verdantly"; data: any }[];
  onManualSave?: (plantData: any) => void;
}

/**
 * Find a plant — the FULL-PAGE search experience (ailment-library-shed-search
 * overhaul Stage 2, 2026-07-21). Replaces BulkSearchModal as the Shed's front
 * door: search is the page, not a porthole — no h-[85vh] cap, no p-8 dialog,
 * room for results on a phone. TheShed early-returns this view while open (the
 * same `?open=add-plant&query=` deep links, `state.autoImport` → review-with-
 * cart, and `state.returnTo` contracts all land here unchanged).
 *
 * Extraction contract (review-verified): the props are BulkSearchModal's
 * verbatim; the cart-item shapes (`buildCartItem`/`selectionKey`), the
 * `preloadedDetails` forwarding (no-Gemini library path + user_plant_ack
 * seeding downstream), the paste-a-list seeding, the Search|Manual tab
 * testids (`bulk-search-tab-*` — the manual-add Shepherd tour anchors them),
 * the cart/review testids (`bulk-search-review` / `bulk-search-start-import`)
 * and the AI page-context lifecycle are all preserved. BulkSearchModal itself
 * lives on for its other host (CompanionPlantsTab).
 */
export default function PlantSearchTakeover({
  homeId,
  isPremium,
  isAiEnabled,
  onClose,
  onProceedToBulkAdd,
  initialSearchTerm,
  initialCartItems,
  onManualSave,
}: Props) {
  const { setPageContext } = usePlantDoctor();

  const [step, setStep] = useState<"search" | "review">("search");
  const [activeTab, setActiveTab] = useState<"search" | "manual">("search");

  // PlantSearch owns the live query; mirrored here only for AI page context.
  const [contextQuery, setContextQuery] = useState(initialSearchTerm || "");
  const [searchSeed, setSearchSeed] = useState(initialSearchTerm || "");
  const [searchKey, setSearchKey] = useState(0);

  const [listMode, setListMode] = useState(false);
  const [pastedList, setPastedList] = useState("");

  const [expandedResultId, setExpandedResultId] = useState<string | null>(null);
  const [detailsCache, setDetailsCache] = useState<Map<string, PlantDetails>>(new Map());
  const [loadingDetailsIds, setLoadingDetailsIds] = useState<Set<string>>(new Set());
  const fetchingDetailsRef = useRef<Set<string>>(new Set());

  const [selectedPlantsMap, setSelectedPlantsMap] = useState<Map<string, any>>(new Map());
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);
  const [detailResult, setDetailResult] = useState<ProviderSearchResult | null>(null);

  // Restore the Shed grid's scroll position + the opener's focus when the
  // takeover closes. NOTE: main#main-content is overflow-hidden — the REAL
  // scroller is PullToRefresh's .custom-scrollbar child (review finding).
  useEffect(() => {
    const scroller = document.querySelector<HTMLElement>("#main-content .custom-scrollbar");
    const saved = scroller?.scrollTop ?? 0;
    scroller?.scrollTo({ top: 0 });
    return () => {
      requestAnimationFrame(() => {
        scroller?.scrollTo({ top: saved });
        // Best-effort a11y: hand focus back to the button that opened us.
        document.querySelector<HTMLElement>('[data-testid="shed-add-plant-btn"]')?.focus();
      });
    };
  }, []);

  // Escape: review → back to search; search → close the takeover. Guarded so
  // it never fires under the PlantDetailModal (which owns its own Escape —
  // the one-keypress-collapses-both-layers lesson from the tasks tray).
  const detailOpenRef = useRef(false);
  detailOpenRef.current = detailResult !== null;
  const stepRef = useRef(step);
  stepRef.current = step;
  const tabRef = useRef(activeTab);
  tabRef.current = activeTab;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (detailOpenRef.current) return;
      // The Manual tab is a form — Escape there must never discard typed work
      // (the form has its own Cancel).
      if (tabRef.current === "manual" && stepRef.current === "search") return;
      if (stepRef.current === "review") setStep("search");
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
  // search context while the takeover is open).
  useEffect(() => {
    setPageContext({
      action: step === "review" ? "Reviewing Bulk Import Selection" : "Bulk Searching Plants",
      searchContext: {
        currentQuery: contextQuery,
        selectedCount: selectedPlantsMap.size,
        sourcesEnabled: { ai: isAiEnabled, perenual: isPremium },
      },
    });
    return () => setPageContext(null);
  }, [contextQuery, selectedPlantsMap.size, step, isAiEnabled, isPremium, setPageContext]);

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
    setSearchSeed(lines[0]);
    setContextQuery(lines[0]);
    setSearchKey((k) => k + 1); // remount PlantSearch so it runs the seeded search
    setPastedList(lines.slice(1).join("\n"));
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

  // ── REVIEW ─────────────────────────────────────────────────────────────────
  if (step === "review") {
    return (
      <div className="max-w-3xl mx-auto w-full pb-8" data-testid="plant-search-takeover">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => {
              setStep("search");
              setExpandedResultId(null);
              setPendingRemoveId(null);
            }}
            data-testid="bulk-search-back-to-search"
            className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-rhozly-on-surface/50 can-hover:hover:text-rhozly-primary min-h-[44px] transition-colors"
          >
            <ChevronLeft size={16} /> Back to Search
          </button>
          {/* Direct exit — the autoImport path lands HERE first (review finding:
              the modal's review had an X; keep a one-tap way out). */}
          <button
            onClick={onClose}
            data-testid="shed-search-back"
            aria-label="Back to your Shed"
            className="inline-flex items-center gap-1.5 text-xs font-black text-rhozly-on-surface-variant can-hover:hover:text-rhozly-on-surface min-h-[44px] active:scale-[0.97] transition"
          >
            <ArrowLeft size={15} /> Your Shed
          </button>
        </div>
        <h1 className="text-2xl sm:text-3xl font-black font-display tracking-tight">Review your picks</h1>
        <p className="text-2xs font-black text-rhozly-on-surface/40 uppercase tracking-widest mt-1 mb-5">
          {selectedPlantsMap.size} plant{selectedPlantsMap.size === 1 ? "" : "s"} ready to join the Shed
        </p>

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
      </div>
    );
  }

  // ── SEARCH ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto w-full pb-8" data-testid="plant-search-takeover">
      <button
        onClick={onClose}
        data-testid="shed-search-back"
        aria-label="Back to your Shed"
        className="inline-flex items-center gap-1.5 text-xs font-black text-rhozly-on-surface-variant can-hover:hover:text-rhozly-on-surface mb-3 min-h-[44px] active:scale-[0.97] transition"
      >
        <ArrowLeft size={15} /> Your Shed
      </button>

      <h1 className="text-2xl sm:text-3xl font-black font-display tracking-tight flex items-center gap-3">
        <ListPlus className="text-rhozly-primary" /> Find a plant
      </h1>
      <p className="text-xs text-rhozly-on-surface-variant mt-1 mb-4">
        The library is free and instant — pick as many as you like, then review and add them all at once.
      </p>

      {/* Search | Manual tabs — testids are the manual-add Shepherd tour's anchors. */}
      <div role="tablist" className="flex bg-rhozly-surface-low p-1 rounded-control gap-1 mb-4 max-w-md">
        <button
          role="tab"
          data-testid="bulk-search-tab-search"
          aria-selected={activeTab === "search"}
          onClick={() => { setActiveTab("search"); setExpandedResultId(null); }}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 min-h-[44px] rounded-[calc(var(--radius-control)-4px)] text-xs font-black transition-all ${activeTab === "search" ? "bg-rhozly-surface-lowest text-rhozly-primary shadow-card" : "text-rhozly-on-surface/40 can-hover:hover:text-rhozly-on-surface"}`}
        >
          <Search size={14} /> Search
        </button>
        <button
          role="tab"
          data-testid="bulk-search-tab-manual"
          aria-selected={activeTab === "manual"}
          onClick={() => { setActiveTab("manual"); setExpandedResultId(null); }}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 min-h-[44px] rounded-[calc(var(--radius-control)-4px)] text-xs font-black transition-all ${activeTab === "manual" ? "bg-rhozly-surface-lowest text-rhozly-primary shadow-card" : "text-rhozly-on-surface/40 can-hover:hover:text-rhozly-on-surface"}`}
        >
          <Edit3 size={14} /> Manual
        </button>
      </div>

      {activeTab === "manual" ? (
        <ManualPlantCreation
          onSave={(data) => { onManualSave?.(data); onClose(); }}
          onCancel={onClose}
        />
      ) : (
        <>
          {/* Paste-a-list */}
          <div className="flex items-center justify-between gap-2 mb-2">
            <button
              type="button"
              data-testid="bulk-paste-toggle"
              onClick={() => {
                setListMode((v) => {
                  if (v) setPastedList("");
                  return !v;
                });
              }}
              className={`flex items-center gap-1.5 text-2xs font-black uppercase tracking-widest px-2.5 py-1.5 min-h-[36px] pointer-coarse:min-h-11 rounded-full transition-colors ${
                listMode
                  ? "bg-rhozly-primary text-white"
                  : "text-rhozly-on-surface/55 can-hover:hover:text-rhozly-primary can-hover:hover:bg-rhozly-primary/5"
              }`}
            >
              <ListPlus size={12} />
              {listMode ? "Hide list" : "Paste a list"}
            </button>
            {listMode && (() => {
              const remaining = pastedList.split(/\n+/).map((s) => s.trim()).filter(Boolean);
              return (
                <span className="text-2xs font-bold text-rhozly-on-surface/55">
                  {remaining.length} item{remaining.length !== 1 ? "s" : ""} queued
                </span>
              );
            })()}
          </div>

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
                  Tap "Search next" to search the first item — repeat to work through the list.
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

          {/* Library-first unified search — the page body */}
          <PlantSearch
            key={searchKey}
            homeId={homeId}
            autoFocus
            showFilters
            multiSelect
            allowPreview
            placeholder="Search any plant by name…"
            initialQuery={searchSeed}
            onQueryChange={setContextQuery}
            gates={{
              // Verdantly is free for all; Perenual self-gates inside searchAllProviders.
              canSearchExternal: true,
              canCreateWithAI: isAiEnabled,
            }}
            isSelected={(sel) => selectedPlantsMap.has(selectionKey(sel))}
            onSelect={handleSelectFromSearch}
            onViewDetails={(sel) => setDetailResult(selectionToProviderResult(sel))}
          />

          {/* Cart tray — sticky within the page (above the Deck's reserved zone). */}
          {selectedPlantsMap.size > 0 && (
            <div className="sticky bottom-2 mt-5 animate-in slide-in-from-bottom-2">
              <div className="bg-rhozly-surface-lowest shadow-overlay border border-rhozly-outline/20 rounded-card p-4 flex flex-col sm:flex-row items-center gap-3 sm:justify-between">
                <div className="px-2 text-center sm:text-left">
                  <p className="text-sm font-black text-rhozly-on-surface">
                    {selectedPlantsMap.size} plant{selectedPlantsMap.size === 1 ? "" : "s"} selected
                  </p>
                  <p className="text-3xs font-bold uppercase tracking-widest text-rhozly-on-surface/40">Ready to review</p>
                </div>
                <button
                  data-testid="bulk-search-review"
                  onClick={() => setStep("review")}
                  className="w-full sm:w-auto px-8 py-3.5 bg-rhozly-primary text-white rounded-control font-black shadow-raised active:scale-[0.98] transition flex items-center justify-center gap-2"
                >
                  <ListPlus size={18} /> Review &amp; Add
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {detailResult && (
        <PlantDetailModal
          result={detailResult}
          homeId={homeId}
          aiEnabled={isAiEnabled}
          isPremium={isPremium}
          onClose={() => setDetailResult(null)}
        />
      )}
    </div>
  );
}
