import React, { useState, useEffect, useRef } from "react";
import {
  X,
  Search,
  Loader2,
  Database,
  Lock,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Info,
  CheckSquare2,
  Square,
  ListPlus,
  ChevronLeft,
  Trash2,
  Edit3,
} from "lucide-react";
import { PerenualService } from "../lib/perenualService";
import { supabase } from "../lib/supabase";
import toast from "react-hot-toast";
import { usePlantDoctor } from "../context/PlantDoctorContext";
import { PlantDoctorService } from "../services/plantDoctorService";
import ManualPlantCreation from "./ManualPlantCreation";

interface Props {
  homeId: string;
  isPremium: boolean;
  onClose: () => void;
  onProceedToBulkAdd: (selectedPlants: any[]) => void;
  initialSearchTerm?: string;
  initialCartItems?: { type: "api" | "ai"; data: any }[];
  onManualSave?: (plantData: any) => void;
}

export default function BulkSearchModal({
  homeId,
  isPremium,
  onClose,
  onProceedToBulkAdd,
  initialSearchTerm,
  initialCartItems,
  onManualSave,
}: Props) {
  const { setPageContext } = usePlantDoctor();

  const [step, setStep] = useState<"search" | "review">("search");
  const [activeTab, setActiveTab] = useState<"api" | "ai" | "manual">("api");
  const [query, setQuery] = useState(initialSearchTerm || "");
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string>("");

  const [apiResults, setApiResults] = useState<any[]>([]);
  const [aiResults, setAiResults] = useState<string[]>([]);

  const [expandedResultId, setExpandedResultId] = useState<string | null>(null);
  const [previewCache, setPreviewCache] = useState<
    Record<string, { loading: boolean; images?: string[]; desc?: string }>
  >({});

  const [selectedPlantsMap, setSelectedPlantsMap] = useState<Map<string, any>>(
    new Map(),
  );

  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);

  const triggerRef = useRef<HTMLElement | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialCartItems && initialCartItems.length > 0) {
      const newMap = new Map<string, any>();
      initialCartItems.forEach((item) => {
        const key =
          typeof item.data === "string"
            ? item.data
            : String(item.data.id || item.data.common_name);
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
        activeTab,
        currentQuery: query,
        selectedCount: selectedPlantsMap.size,
      },
    });
    return () => setPageContext(null);
  }, [activeTab, query, selectedPlantsMap.size, step, setPageContext]);

  // Focus trap and return focus on close
  useEffect(() => {
    // Store the previously focused element
    triggerRef.current = document.activeElement as HTMLElement;

    // Focus the modal
    if (modalRef.current) {
      modalRef.current.focus();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Tab" && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
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
      // Return focus to trigger element
      if (triggerRef.current) {
        triggerRef.current.focus();
      }
    };
  }, []);

  // 🚀 SMARTER WIKIPEDIA FETCHER
  const fetchPreviewData = async (
    identifier: string,
    isAi: boolean,
    commonNameFallback?: string,
  ) => {
    setPreviewCache((prev) => {
      if (prev[identifier]) return prev;
      return { ...prev, [identifier]: { loading: true } };
    });

    let scientificName = null;
    let commonName = commonNameFallback || identifier;

    if (isAi) {
      const match = identifier.match(/\(([^)]+)\)/);
      scientificName = match ? match[1] : null;
      commonName = identifier.split("(")[0].trim();
    }

    const primarySearchTerm = scientificName || commonName;
    let fetchedImages: string[] = [];
    let description = "";

    const fetchWiki = async (term: string) => {
      try {
        const res = await fetch(
          `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(term)}`,
        );
        if (!res.ok) return null;
        const data = await res.json();
        if (data.type === "disambiguation" || !data.extract) return null;
        return data;
      } catch (e) {
        return null;
      }
    };

    // 1. Try Primary Term
    let data = await fetchWiki(primarySearchTerm);

    // 2. Fallback to Common Name
    if (!data && scientificName) {
      data = await fetchWiki(commonName);
    }

    // 3. Fallback: Append " plant" (Fixes issues like "Marigold" or "Basil")
    if (!data) {
      data = await fetchWiki(`${commonName} plant`);
    }

    // 🚀 4. DEEP FALLBACK: Base Plant Type (Fixes "Curly Parsley" -> "Parsley")
    if (!data && commonName.includes(" ")) {
      const basePlant = commonName.split(" ").pop(); // Grabs the last word
      if (basePlant) {
        data = await fetchWiki(basePlant);
        if (!data) data = await fetchWiki(`${basePlant} plant`);
      }
    }

    if (data) {
      description = data.extract;
      const wImg = data.thumbnail?.source || data.originalimage?.source;
      if (wImg) fetchedImages.push(wImg);
    }

    setPreviewCache((prev) => ({
      ...prev,
      [identifier]: {
        loading: false,
        images: fetchedImages,
        desc: description || "No detailed encyclopedia entry available.",
      },
    }));
  };

  useEffect(() => {
    if (activeTab === "ai" && aiResults.length > 0) {
      aiResults.forEach((match) => fetchPreviewData(match, true));
    }
  }, [aiResults, activeTab]);

  useEffect(() => {
    if (step === "review") {
      selectedPlantsMap.forEach((item, id) => {
        if (item.type === "ai" && !previewCache[id]) {
          fetchPreviewData(id, true);
        }
      });
    }
  }, [step, selectedPlantsMap]);

  const performSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim()) {
      setSearchError("Please enter a search term");
      return;
    }

    setIsSearching(true);
    setSearchError("");
    setExpandedResultId(null);

    try {
      if (activeTab === "api") {
        const data = await PerenualService.searchPlants(query);
        setApiResults(data || []);
      } else {
        const data = await PlantDoctorService.searchPlantsText(query);
        setAiResults(data.matches || []);
      }
    } catch (err: any) {
      const errorMsg = err.message || "";
      let displayError = "";
      if (
        errorMsg.includes("Unexpected token") ||
        errorMsg.includes("Please Upg")
      ) {
        displayError = "Perenual API limit reached. Try using the AI Generator instead.";
        toast.error(displayError);
      } else {
        displayError = "Search failed. Please try again.";
        toast.error(displayError);
      }
      setSearchError(displayError);
    } finally {
      setIsSearching(false);
    }
  };

  const handleExpandResult = (
    identifier: string,
    isAi: boolean,
    commonNameFallback?: string,
  ) => {
    if (expandedResultId === identifier) {
      setExpandedResultId(null);
      return;
    }
    setExpandedResultId(identifier);
    if (!previewCache[identifier]) {
      fetchPreviewData(identifier, isAi, commonNameFallback);
    }
  };

  const toggleSelection = (id: string, plantData: any) => {
    setSelectedPlantsMap((prev) => {
      const newMap = new Map(prev);
      if (newMap.has(id)) {
        newMap.delete(id);
      } else {
        newMap.set(id, plantData);
      }
      return newMap;
    });
  };

  const renderAccordionContent = (id: string) => {
    const cache = previewCache[id];
    if (!cache) return null;

    return (
      <div className="p-4 bg-amber-50/50 border-t border-rhozly-outline/5 text-sm flex flex-col gap-4 animate-in slide-in-from-top-2">
        {cache.loading ? (
          <div className="flex items-center gap-2 text-amber-600/60 justify-center py-4">
            <Loader2 size={16} className="animate-spin" /> Fetching preview
            data...
          </div>
        ) : (
          <div className="flex gap-4 items-start">
            {cache.images && cache.images.length > 0 && (
              <img
                src={cache.images[0]}
                alt="Preview"
                className="w-24 h-24 rounded-xl object-cover shadow-sm shrink-0"
              />
            )}
            <div className="flex-1">
              <p className="text-sm font-semibold text-rhozly-on-surface/80 leading-relaxed whitespace-pre-wrap">
                {cache.desc}
              </p>
            </div>
          </div>
        )}
      </div>
    );
  };

  // REVIEW CART UI
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
              const isApi = item.type === "api";

              // 🚀 FIX: Safely parse names regardless of whether it's an object or auto-imported string
              const name =
                typeof item.data === "string"
                  ? isApi
                    ? item.data
                    : item.data.split("(")[0].trim()
                  : item.data.common_name;

              const subName =
                typeof item.data === "string"
                  ? isApi
                    ? ""
                    : item.data.match(/\(([^)]+)\)/)?.[1]
                  : item.data.scientific_name?.[0];

              const thumbnail =
                isApi &&
                item.data.default_image?.thumbnail &&
                !item.data.default_image?.thumbnail.includes("upgrade_access")
                  ? item.data.default_image.thumbnail
                  : previewCache[id]?.images?.[0] || null;

              return (
                <div
                  key={id}
                  className="w-full bg-white border border-rhozly-outline/10 rounded-2xl transition-all overflow-hidden flex flex-col shadow-sm"
                >
                  <div className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-rhozly-primary/5 overflow-hidden shrink-0 flex items-center justify-center text-rhozly-primary/40">
                        {thumbnail ? (
                          <img
                            src={thumbnail}
                            alt={name}
                            className="w-full h-full object-cover"
                          />
                        ) : isApi ? (
                          <Database size={20} />
                        ) : (
                          <Sparkles size={20} />
                        )}
                      </div>
                      <div>
                        <h4 className="font-black text-rhozly-on-surface leading-tight">
                          {name}
                        </h4>
                        <p className="text-[10px] font-bold text-rhozly-on-surface/50 italic">
                          {subName || "Ready for processing"}
                        </p>
                        <span
                          className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md mt-1 inline-block ${isApi ? "bg-rhozly-primary/10 text-rhozly-primary" : "bg-amber-100 text-amber-600"}`}
                        >
                          {isApi ? "Perenual API" : "AI Generator"}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleExpandResult(id, !isApi, name)}
                        className="p-3 hover:bg-rhozly-surface-low rounded-xl text-rhozly-on-surface/60 hover:text-rhozly-primary transition-colors"
                      >
                        {expandedResultId === id ? (
                          <ChevronUp size={18} />
                        ) : (
                          <Info size={18} />
                        )}
                      </button>
                      {pendingRemoveId === id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              toggleSelection(id, item);
                              setPendingRemoveId(null);
                            }}
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

                  {expandedResultId === id && renderAccordionContent(id)}
                </div>
              );
            })}
          </div>

          <div className="p-6 border-t border-rhozly-outline/10 bg-white shrink-0">
            <button
              onClick={() =>
                onProceedToBulkAdd(Array.from(selectedPlantsMap.values()))
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

  // SEARCH UI
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

        <div className="px-8 shrink-0">
          <div
            role="tablist"
            className="flex bg-rhozly-surface-low p-1 rounded-2xl gap-1"
          >
            <button
              role="tab"
              aria-selected={activeTab === "manual"}
              onClick={() => { setActiveTab("manual"); setExpandedResultId(null); }}
              className={`flex-1 min-w-[80px] flex items-center justify-center gap-1.5 py-3 rounded-xl text-xs font-black transition-all ${activeTab === "manual" ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-on-surface/40 hover:text-rhozly-on-surface"}`}
            >
              <Edit3 size={14} /> Manual
            </button>
            <button
              role="tab"
              aria-selected={activeTab === "api"}
              onClick={() => { setActiveTab("api"); setExpandedResultId(null); }}
              className={`flex-1 min-w-[80px] flex items-center justify-center gap-1.5 py-3 rounded-xl text-xs font-black transition-all ${activeTab === "api" ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-on-surface/40 hover:text-rhozly-on-surface"}`}
            >
              <Database size={14} /> Perenual
            </button>
            <button
              role="tab"
              aria-selected={activeTab === "ai"}
              onClick={() => { setActiveTab("ai"); setExpandedResultId(null); }}
              className={`flex-1 min-w-[80px] flex items-center justify-center gap-1.5 py-3 rounded-xl text-xs font-black transition-all ${activeTab === "ai" ? "bg-white text-amber-500 shadow-sm" : "text-rhozly-on-surface/40 hover:text-rhozly-on-surface"}`}
            >
              <Sparkles size={14} /> AI
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
        ) : !isPremium ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mb-6 text-amber-600">
              <Lock size={32} />
            </div>
            <h3 className="text-2xl font-black mb-2">Premium Required</h3>
            <p className="text-sm font-bold text-rhozly-on-surface/60 mb-6 max-w-xs">
              Upgrade to import from the Perenual database or use AI plant suggestions.
            </p>
            <button
              onClick={() => setActiveTab("manual")}
              className="px-6 py-3 border-2 border-rhozly-outline/30 rounded-2xl font-black text-sm text-rhozly-on-surface/60 hover:text-rhozly-on-surface transition-colors"
            >
              Use Manual Entry instead
            </button>
          </div>
        ) : (
          <>
        <div className="p-8 pb-4 shrink-0">
          <form onSubmit={performSearch} className="relative">
            <div className="relative flex items-center">
              <input
                id="bulk-search-input"
                type="text"
                placeholder={
                  activeTab === "api"
                    ? "Search real plants..."
                    : "Ask AI for any plant..."
                }
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  if (searchError) setSearchError("");
                }}
                aria-describedby="search-helper-text"
                aria-invalid={!!searchError}
                className={`w-full pl-6 pr-14 py-4 rounded-2xl font-bold border outline-none shadow-sm transition-colors ${searchError ? "border-red-500" : activeTab === "api" ? "bg-rhozly-surface-low focus:border-rhozly-primary border-transparent" : "bg-white focus:border-amber-500 border-rhozly-outline/10"}`}
              />
              <button
                type="submit"
                disabled={isSearching || !query.trim()}
                aria-label="Search"
                className={`absolute right-2 p-2 text-white rounded-xl hover:scale-105 transition-transform disabled:opacity-50 ${activeTab === "api" ? "bg-rhozly-primary" : "bg-amber-500"}`}
              >
                <Search size={20} />
              </button>
            </div>
            <p
              id="search-helper-text"
              className="text-xs text-rhozly-on-surface/50 font-medium mt-2 px-2"
            >
              {activeTab === "api"
                ? "Search the Perenual plant database"
                : "Use AI to generate plant suggestions"}
            </p>
            {searchError && (
              <p
                className="text-xs text-red-500 font-bold mt-2 px-2 animate-in slide-in-from-top-1"
                role="alert"
              >
                {searchError}
              </p>
            )}
          </form>
        </div>

        <div className="flex-1 overflow-y-auto p-8 pt-0 custom-scrollbar space-y-3">
          {isSearching ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="w-full bg-white border border-rhozly-outline/10 rounded-2xl p-3 flex items-center gap-3 animate-pulse"
                >
                  <div className="w-6 h-6 bg-rhozly-surface-low rounded-lg shrink-0" />
                  <div className="w-12 h-12 bg-rhozly-surface-low rounded-xl shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-rhozly-surface-low rounded w-3/4" />
                    <div className="h-3 bg-rhozly-surface-low rounded w-1/2" />
                  </div>
                  <div className="w-8 h-8 bg-rhozly-surface-low rounded-xl shrink-0" />
                </div>
              ))}
              <div className="flex flex-col items-center justify-center py-4 opacity-50">
                <Loader2
                  className={`animate-spin mb-2 ${activeTab === "ai" ? "text-amber-500" : "text-rhozly-primary"}`}
                  size={24}
                />
                <p className="font-bold text-xs">Searching...</p>
              </div>
            </div>
          ) : activeTab === "api" ? (
            apiResults.map((plant: any) => {
              const isSelected = selectedPlantsMap.has(String(plant.id));
              return (
                <div
                  key={plant.id}
                  className={`w-full bg-white border rounded-2xl transition-all overflow-hidden flex flex-col shadow-sm ${isSelected ? "border-rhozly-primary ring-1 ring-rhozly-primary/30" : "border-rhozly-outline/10 hover:border-rhozly-primary/30"}`}
                >
                  <div className="flex items-center p-3 gap-3">
                    <button
                      onClick={() =>
                        toggleSelection(String(plant.id), {
                          type: "api",
                          data: plant,
                        })
                      }
                      aria-label={isSelected ? "Remove from selection" : "Add to selection"}
                      className={`shrink-0 transition-colors ${isSelected ? "text-rhozly-primary" : "text-rhozly-on-surface/20 hover:text-rhozly-primary/50"}`}
                    >
                      {isSelected ? (
                        <CheckSquare2 size={24} />
                      ) : (
                        <Square size={24} />
                      )}
                    </button>
                    <div className="w-12 h-12 rounded-xl bg-rhozly-primary/5 overflow-hidden shrink-0">
                      {plant.default_image?.thumbnail &&
                      !plant.default_image?.thumbnail.includes(
                        "upgrade_access",
                      ) ? (
                        <img
                          src={plant.default_image.thumbnail}
                          alt={plant.common_name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-rhozly-on-surface/20">
                          <Database size={16} />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-black text-rhozly-on-surface truncate">
                        {plant.common_name}
                      </h4>
                      <p className="text-[10px] font-bold text-rhozly-on-surface/50 italic truncate">
                        {plant.scientific_name?.[0]}
                      </p>
                    </div>
                    <button
                      onClick={() =>
                        handleExpandResult(
                          String(plant.id),
                          false,
                          plant.common_name,
                        )
                      }
                      className="p-3 hover:bg-rhozly-primary/10 rounded-xl text-rhozly-primary transition-colors"
                    >
                      {expandedResultId === String(plant.id) ? (
                        <ChevronUp size={18} />
                      ) : (
                        <Info size={18} />
                      )}
                    </button>
                  </div>
                  {expandedResultId === String(plant.id) &&
                    renderAccordionContent(String(plant.id))}
                </div>
              );
            })
          ) : (
            aiResults.map((match: string, i) => {
              const isSelected = selectedPlantsMap.has(match);
              const cachedThumb = previewCache[match]?.images?.[0];

              return (
                <div
                  key={i}
                  className={`w-full bg-white border rounded-2xl transition-all overflow-hidden flex flex-col shadow-sm ${isSelected ? "border-amber-500 ring-1 ring-amber-500/30" : "border-rhozly-outline/10 hover:border-amber-500/40"}`}
                >
                  <div className="flex items-center p-3 gap-3">
                    <button
                      onClick={() =>
                        toggleSelection(match, { type: "ai", data: match })
                      }
                      aria-label={isSelected ? "Remove from selection" : "Add to selection"}
                      className={`shrink-0 transition-colors ${isSelected ? "text-amber-500" : "text-rhozly-on-surface/20 hover:text-amber-500/50"}`}
                    >
                      {isSelected ? (
                        <CheckSquare2 size={24} />
                      ) : (
                        <Square size={24} />
                      )}
                    </button>

                    <div className="w-12 h-12 rounded-xl bg-amber-500/5 overflow-hidden shrink-0 flex items-center justify-center text-amber-500/40">
                      {cachedThumb ? (
                        <img
                          src={cachedThumb}
                          alt={match}
                          className="w-full h-full object-cover"
                        />
                      ) : previewCache[match]?.loading ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Sparkles size={20} />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <span className="font-bold text-rhozly-on-surface truncate block">
                        {match}
                      </span>
                    </div>
                    <button
                      onClick={() => handleExpandResult(match, true)}
                      className="p-3 hover:bg-amber-100 rounded-xl text-amber-600 transition-colors"
                    >
                      {expandedResultId === match ? (
                        <ChevronUp size={18} />
                      ) : (
                        <Info size={18} />
                      )}
                    </button>
                  </div>
                  {expandedResultId === match && renderAccordionContent(match)}
                </div>
              );
            })
          )}
        </div>

        {selectedPlantsMap.size > 0 && (
          <div className="shrink-0 p-6 bg-white border-t border-rhozly-outline/10 md:absolute md:bottom-0 md:left-0 md:right-0 md:bg-gradient-to-t md:from-white md:via-white md:to-transparent md:border-t-0 animate-in slide-in-from-bottom-8">
            <div className="bg-rhozly-surface-lowest shadow-2xl border border-rhozly-outline/20 rounded-2xl p-4 flex flex-col md:flex-row items-center gap-4 md:justify-between">
              <div className="px-2 text-center md:text-left">
                <p className="text-sm font-black text-rhozly-on-surface">
                  {selectedPlantsMap.size} Plants Selected
                </p>
                <p className="text-[10px] font-bold uppercase tracking-widest text-rhozly-on-surface/40">
                  Ready to review
                </p>
              </div>
              <button
                onClick={() => setStep("review")}
                className={`w-full md:w-auto px-8 py-4 text-white rounded-2xl font-black shadow-lg hover:scale-105 transition-transform flex items-center justify-center gap-2 ${activeTab === "ai" ? "bg-amber-500" : "bg-rhozly-primary"}`}
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
