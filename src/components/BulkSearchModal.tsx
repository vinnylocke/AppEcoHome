import React, { useState, useEffect, useRef } from "react";
import {
  X,
  Search,
  Loader2,
  ChevronUp,
  Info,
  ListPlus,
  ChevronLeft,
  Trash2,
  Edit3,
} from "lucide-react";
import { IconPlantDB, IconAI } from "../constants/icons";
import { getProviderPlantDetails, careGuideToPlantDetails } from "../lib/plantProvider";
import type { PlantDetails } from "../lib/verdantlyUtils";
import { usePlantDoctor } from "../context/PlantDoctorContext";
import { PlantDoctorService } from "../services/plantDoctorService";
import ManualPlantCreation from "./ManualPlantCreation";
import PlantInfoPanel from "./PlantInfoPanel";
import PlantSearch from "./shared/PlantSearch";
import { libraryRowToPlantDetails } from "../lib/plantCatalogue";
import type { PlantSelection } from "../lib/unifiedPlantSearch";

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
 * Add-to-Shed search — migrated onto the shared, library-first
 * <PlantSearch> engine. Local plant_library results are free for every
 * tier; Perenual/Verdantly are opt-in and AI-create is Sage+. The cart
 * (review step), paste-a-list, manual entry and the downstream
 * `onProceedToBulkAdd` write are preserved verbatim.
 *
 * Selection → cart-item mapping (so each source flows through TheShed's
 * existing per-source processor unchanged):
 *   - library  → { type: "ai", data: commonName } + preloadedDetails from the
 *                 library row (TheShed's AI branch skips Gemini entirely).
 *   - perenual → { type: "api", data: { id, common_name, … } }
 *   - verdantly→ { type: "verdantly", data: { verdantly_id, common_name, … } }
 *   - ai       → { type: "ai", data: commonName } (TheShed regenerates the guide)
 */
export default function BulkSearchModal({
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

  // PlantSearch owns the live query; we mirror it here only for AI page
  // context. `searchSeed` + `searchKey` drive the paste-a-list remount.
  const [contextQuery, setContextQuery] = useState(initialSearchTerm || "");
  const [searchSeed, setSearchSeed] = useState(initialSearchTerm || "");
  const [searchKey, setSearchKey] = useState(0);

  // Paste-a-list mode — user pastes multi-line text, "Search next" seeds the
  // search one line at a time so results stay focused per query.
  const [listMode, setListMode] = useState(false);
  const [pastedList, setPastedList] = useState("");

  const [expandedResultId, setExpandedResultId] = useState<string | null>(null);
  const [detailsCache, setDetailsCache] = useState<Map<string, PlantDetails>>(new Map());
  const [loadingDetailsIds, setLoadingDetailsIds] = useState<Set<string>>(new Set());
  const fetchingDetailsRef = useRef<Set<string>>(new Set());

  const [selectedPlantsMap, setSelectedPlantsMap] = useState<Map<string, any>>(
    new Map(),
  );

  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);

  const triggerRef = useRef<HTMLElement | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

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
    // Library rows carry their full record — pre-map it to PlantDetails so the
    // review preview renders instantly and the AI branch reuses it (no Gemini).
    if (sel.source === "library" && sel.raw) {
      setDetailsCache((prev) =>
        prev.has(key) ? prev : new Map(prev).set(key, libraryRowToPlantDetails(sel.raw)),
      );
    }
  };

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

  useEffect(() => {
    setPageContext({
      action:
        step === "review"
          ? "Reviewing Bulk Import Selection"
          : "Bulk Searching Plants",
      searchContext: {
        currentQuery: contextQuery,
        selectedCount: selectedPlantsMap.size,
        sourcesEnabled: { ai: isAiEnabled, perenual: isPremium },
      },
    });
    return () => setPageContext(null);
  }, [contextQuery, selectedPlantsMap.size, step, isAiEnabled, isPremium, setPageContext]);

  // Focus trap and return focus on close
  useEffect(() => {
    triggerRef.current = document.activeElement as HTMLElement;
    if (modalRef.current) modalRef.current.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Tab" && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (triggerRef.current) triggerRef.current.focus();
    };
  }, []);

  const fetchDetails = async (id: string, plantObj?: any) => {
    if (detailsCache.has(id) || fetchingDetailsRef.current.has(id)) return;
    fetchingDetailsRef.current.add(id);
    setLoadingDetailsIds((prev) => new Set(prev).add(id));
    try {
      let details: PlantDetails;
      if (plantObj) {
        details = await getProviderPlantDetails({
          source: plantObj._provider === "verdantly" ? "verdantly" : "api",
          perenual_id:   plantObj._provider !== "verdantly" ? (plantObj.perenual_id ?? plantObj.id) : null,
          verdantly_id:  plantObj._provider === "verdantly" ? (plantObj.verdantly_id ?? plantObj.id) : null,
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

  // ── REVIEW CART ───────────────────────────────────────────────────────────
  if (step === "review") {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-rhozly-bg/95 backdrop-blur-xl animate-in fade-in">
        <div
          ref={modalRef}
          tabIndex={-1}
          className="bg-rhozly-surface-lowest w-full max-w-2xl h-[85vh] flex flex-col rounded-3xl shadow-2xl border border-rhozly-outline/20 overflow-hidden relative"
        >
          <div className="p-8 pb-4 shrink-0 flex justify-between items-start border-b border-rhozly-outline/10">
            <div>
              <button
                onClick={() => {
                  setStep("search");
                  setExpandedResultId(null);
                  setPendingRemoveId(null);
                }}
                className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-rhozly-on-surface/50 hover:text-rhozly-primary mb-4 transition-colors"
              >
                <ChevronLeft size={16} /> Back to Search
              </button>
              <h3 className="text-3xl font-black">Review Selection</h3>
              <p className="text-[10px] font-black text-rhozly-on-surface/40 uppercase tracking-widest mt-1">
                You have {selectedPlantsMap.size} plants ready to import
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

          <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-3">
            {Array.from(selectedPlantsMap.entries()).map(([id, item]) => {
              const isDb = item.type === "api" || item.type === "verdantly";
              // AI items store data as a string; db items store a plant object
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
              const thumbnail =
                rawThumb && !rawThumb.includes("upgrade_access")
                  ? rawThumb
                  : detailsCache.get(id)?.thumbnail_url || null;

              const badgeClass =
                item.type === "api"       ? "bg-rhozly-primary/10 text-rhozly-primary" :
                item.type === "verdantly" ? "bg-emerald-100 text-emerald-700" :
                                            "bg-amber-100 text-amber-600";
              const badgeLabel =
                item.type === "api"       ? "Perenual" :
                item.type === "verdantly" ? "Verdantly" :
                                            "Library / AI";

              return (
                <div
                  key={id}
                  className="w-full bg-white border border-rhozly-outline/10 rounded-2xl transition-all overflow-hidden flex flex-col shadow-sm"
                >
                  <div className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-rhozly-primary/5 overflow-hidden shrink-0 flex items-center justify-center text-rhozly-primary/40">
                        {thumbnail ? (
                          <img src={thumbnail} alt={name} className="w-full h-full object-cover" />
                        ) : isDb ? (
                          <IconPlantDB size={20} />
                        ) : (
                          <IconAI size={20} />
                        )}
                      </div>
                      <div>
                        <h4 className="font-black text-rhozly-on-surface leading-tight">{name}</h4>
                        <p className="text-[10px] font-bold text-rhozly-on-surface/50 italic">
                          {subName || "Ready for processing"}
                        </p>
                        <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md mt-1 inline-block ${badgeClass}`}>
                          {badgeLabel}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleExpandResult(id, isDb ? item.data : undefined)}
                        className="p-3 hover:bg-rhozly-surface-low rounded-xl text-rhozly-on-surface/60 hover:text-rhozly-primary transition-colors"
                      >
                        {expandedResultId === id ? <ChevronUp size={18} /> : loadingDetailsIds.has(id) ? <Loader2 size={18} className="animate-spin" /> : <Info size={18} />}
                      </button>
                      {pendingRemoveId === id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => { toggleSelection(id, item); setPendingRemoveId(null); }}
                            aria-label="Confirm remove from selection"
                            className="px-3 py-2 bg-red-500 text-white rounded-xl text-xs font-black hover:bg-red-600 transition-colors"
                          >
                            Remove
                          </button>
                          <button
                            onClick={() => setPendingRemoveId(null)}
                            aria-label="Cancel remove"
                            className="px-3 py-2 bg-rhozly-surface-low text-rhozly-on-surface/60 rounded-xl text-xs font-black hover:bg-rhozly-surface transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setPendingRemoveId(id)}
                          aria-label="Remove from selection"
                          className="p-3 bg-red-50 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-colors"
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

          <div className="p-6 border-t border-rhozly-outline/10 bg-white shrink-0">
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
              className="w-full py-4 bg-rhozly-primary text-white rounded-2xl font-black shadow-xl hover:scale-[1.02] transition-transform disabled:opacity-50 disabled:hover:scale-100"
            >
              Start Bulk Import
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── SEARCH UI ─────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-rhozly-bg/95 backdrop-blur-xl animate-in fade-in">
      <div
        ref={modalRef}
        tabIndex={-1}
        className="bg-rhozly-surface-lowest w-full max-w-3xl h-[85vh] flex flex-col rounded-3xl shadow-2xl border border-rhozly-outline/20 overflow-hidden relative"
      >
        <div className="p-8 pb-4 shrink-0 flex justify-between items-start">
          <div>
            <h3 className="text-3xl font-black flex items-center gap-3">
              <ListPlus className="text-rhozly-primary" /> Add to Shed
            </h3>
            <p className="text-[10px] font-black text-rhozly-on-surface/40 uppercase tracking-widest mt-1">
              Select multiple plants to add at once
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

        {/* Tab bar */}
        <div className="px-8 shrink-0">
          <div role="tablist" className="flex bg-rhozly-surface-low p-1 rounded-2xl gap-1">
            <button
              role="tab"
              data-testid="bulk-search-tab-search"
              aria-selected={activeTab === "search"}
              onClick={() => { setActiveTab("search"); setExpandedResultId(null); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl text-xs font-black transition-all ${activeTab === "search" ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-on-surface/40 hover:text-rhozly-on-surface"}`}
            >
              <Search size={14} /> Search
            </button>
            <button
              role="tab"
              data-testid="bulk-search-tab-manual"
              aria-selected={activeTab === "manual"}
              onClick={() => { setActiveTab("manual"); setExpandedResultId(null); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl text-xs font-black transition-all ${activeTab === "manual" ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-on-surface/40 hover:text-rhozly-on-surface"}`}
            >
              <Edit3 size={14} /> Manual
            </button>
          </div>
        </div>

        {activeTab === "manual" ? (
          <div className="flex-1 overflow-y-auto p-8 pt-4 custom-scrollbar">
            <ManualPlantCreation
              onSave={(data) => { onManualSave?.(data); onClose(); }}
              onCancel={onClose}
            />
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-8 py-4 custom-scrollbar space-y-3">
              {/* Paste-a-list toggle + textarea */}
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  data-testid="bulk-paste-toggle"
                  onClick={() => {
                    setListMode((v) => {
                      if (v) setPastedList("");
                      return !v;
                    });
                  }}
                  className={`flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest px-2.5 py-1.5 min-h-[32px] rounded-full transition-colors ${
                    listMode
                      ? "bg-rhozly-primary text-white"
                      : "text-rhozly-on-surface/55 hover:text-rhozly-primary hover:bg-rhozly-primary/5"
                  }`}
                >
                  <ListPlus size={12} />
                  {listMode ? "Hide list" : "Paste a list"}
                </button>
                {listMode && (() => {
                  const remaining = pastedList.split(/\n+/).map((s) => s.trim()).filter(Boolean);
                  return (
                    <span className="text-[11px] font-bold text-rhozly-on-surface/55">
                      {remaining.length} item{remaining.length !== 1 ? "s" : ""} queued
                    </span>
                  );
                })()}
              </div>

              {listMode && (
                <div
                  data-testid="bulk-paste-panel"
                  className="bg-rhozly-surface-low rounded-2xl p-3 space-y-2 animate-in slide-in-from-top-1"
                >
                  <textarea
                    data-testid="bulk-paste-textarea"
                    value={pastedList}
                    onChange={(e) => setPastedList(e.target.value)}
                    placeholder={"Paste plant names — one per line\nTomato\nBasil\nCourgette\nPepper"}
                    rows={5}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-rhozly-outline/15 text-sm font-bold outline-none focus:border-rhozly-primary resize-y min-h-[100px]"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-bold text-rhozly-on-surface/50 leading-snug">
                      Tap "Search next" to search the first item — repeat to work through the list.
                    </p>
                    <button
                      type="button"
                      data-testid="bulk-paste-search-next"
                      onClick={handleSearchNextFromList}
                      disabled={!pastedList.trim()}
                      className="shrink-0 flex items-center gap-1.5 bg-rhozly-primary text-white text-xs font-black px-3 py-2 min-h-[36px] rounded-xl disabled:opacity-50 hover:opacity-90 transition"
                    >
                      <Search size={12} />
                      Search next
                    </button>
                  </div>
                </div>
              )}

              {/* Library-first unified search */}
              <PlantSearch
                key={searchKey}
                homeId={homeId}
                autoFocus
                showFilters
                multiSelect
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
              />
            </div>

            {selectedPlantsMap.size > 0 && (
              <div className="shrink-0 p-6 bg-white border-t border-rhozly-outline/10 md:absolute md:bottom-0 md:left-0 md:right-0 md:bg-gradient-to-t md:from-white md:via-white md:to-transparent md:border-t-0 animate-in slide-in-from-bottom-8">
                <div className="bg-rhozly-surface-lowest shadow-2xl border border-rhozly-outline/20 rounded-2xl p-4 flex flex-col md:flex-row items-center gap-4 md:justify-between">
                  <div className="px-2 text-center md:text-left">
                    <p className="text-sm font-black text-rhozly-on-surface">{selectedPlantsMap.size} Plants Selected</p>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-rhozly-on-surface/40">Ready to review</p>
                  </div>
                  <button
                    data-testid="bulk-search-review"
                    onClick={() => setStep("review")}
                    className="w-full md:w-auto px-8 py-4 bg-rhozly-primary text-white rounded-2xl font-black shadow-lg hover:scale-105 transition-transform flex items-center justify-center gap-2"
                  >
                    <ListPlus size={20} /> Review & Add
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
