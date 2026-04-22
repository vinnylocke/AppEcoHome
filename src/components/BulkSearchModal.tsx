import React, { useState, useEffect } from "react";
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
} from "lucide-react";
import { PerenualService } from "../lib/perenualService";
import { supabase } from "../lib/supabase";
import toast from "react-hot-toast";
import { usePlantDoctor } from "../context/PlantDoctorContext";

interface Props {
  homeId: string;
  isPremium: boolean;
  onClose: () => void;
  onProceedToBulkAdd: (selectedPlants: any[]) => void;
  initialSearchTerm?: string;
}

export default function BulkSearchModal({
  homeId,
  isPremium,
  onClose,
  onProceedToBulkAdd,
  initialSearchTerm,
}: Props) {
  const { setPageContext } = usePlantDoctor();

  // --- STATE ---
  const [step, setStep] = useState<"search" | "review">("search");
  const [activeTab, setActiveTab] = useState<"api" | "ai">("api");
  const [query, setQuery] = useState(initialSearchTerm || "");
  const [isSearching, setIsSearching] = useState(false);

  // Results
  const [apiResults, setApiResults] = useState<any[]>([]);
  const [aiResults, setAiResults] = useState<string[]>([]);

  // Accordion & Preview UI State
  const [expandedResultId, setExpandedResultId] = useState<string | null>(null);
  const [previewCache, setPreviewCache] = useState<
    Record<string, { loading: boolean; images?: string[]; desc?: string }>
  >({});

  // 🚀 THE CART
  const [selectedPlantsMap, setSelectedPlantsMap] = useState<Map<string, any>>(
    new Map(),
  );

  // --- LIVE AI SYNC ---
  useEffect(() => {
    setPageContext({
      action:
        step === "review"
          ? "Reviewing Bulk Import Cart"
          : "Bulk Searching Plants",
      searchContext: {
        activeTab,
        currentQuery: query,
        selectedCount: selectedPlantsMap.size,
      },
    });
    return () => setPageContext(null);
  }, [activeTab, query, selectedPlantsMap.size, step, setPageContext]);

  // --- PREVIEW FETCHER (Decoupled so it can run automatically) ---
  const fetchPreviewData = async (
    identifier: string,
    isAi: boolean,
    commonNameFallback?: string,
  ) => {
    // Prevent duplicate fetches
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

    try {
      const wikiRes = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(primarySearchTerm)}`,
      );
      let data;
      if (wikiRes.ok) {
        data = await wikiRes.json();
      } else if (scientificName) {
        const fallbackRes = await fetch(
          `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(commonName)}`,
        );
        if (fallbackRes.ok) data = await fallbackRes.json();
      }

      if (data) {
        description = data.extract;
        const wImg = data.thumbnail?.source || data.originalimage?.source;
        if (wImg) fetchedImages.push(wImg);
      }
    } catch (e) {
      console.warn("Wiki fetch failed");
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

  // --- AUTO-FETCH AI IMAGES ---
  useEffect(() => {
    if (activeTab === "ai" && aiResults.length > 0) {
      aiResults.forEach((match) => {
        // Safe to call, the function checks if it already exists
        fetchPreviewData(match, true);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiResults, activeTab]);

  // --- SEARCH LOGIC ---
  const performSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim()) return;

    setIsSearching(true);
    setExpandedResultId(null);

    try {
      if (activeTab === "api") {
        const data = await PerenualService.searchPlants(query);
        setApiResults(data || []);
      } else {
        const { data, error } = await supabase.functions.invoke(
          "plant-doctor",
          {
            body: { action: "search_plants_text", plantSearch: query },
          },
        );
        if (error) throw error;
        setAiResults(data.matches || []);
      }
    } catch (err) {
      toast.error("Search failed. Please try again.");
    } finally {
      setIsSearching(false);
    }
  };

  // --- ACCORDION PREVIEW LOGIC ---
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
    // If it hasn't started loading for some reason, trigger it manually
    if (!previewCache[identifier]) {
      fetchPreviewData(identifier, isAi, commonNameFallback);
    }
  };

  // --- CART SELECTION LOGIC ---
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

  // --- RENDER HELPERS ---
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

  if (!isPremium) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-rhozly-bg/95 backdrop-blur-xl animate-in fade-in">
        <div className="bg-rhozly-surface-lowest w-full max-w-md p-8 rounded-[3rem] shadow-2xl border border-rhozly-outline/20 text-center relative">
          <button
            onClick={onClose}
            className="absolute top-6 right-6 p-2 bg-rhozly-surface-low rounded-xl"
          >
            <X size={20} />
          </button>
          <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6 text-amber-600">
            <Lock size={32} />
          </div>
          <h3 className="text-2xl font-black mb-2">Global Database Access</h3>
          <p className="text-sm font-bold text-rhozly-on-surface/60 mb-8">
            Upgrade to Premium to import detailed care guides.
          </p>
          <button className="w-full py-4 bg-rhozly-primary text-white rounded-2xl font-black shadow-xl">
            Upgrade Now
          </button>
        </div>
      </div>
    );
  }

  // 🚀 REVIEW CART UI
  if (step === "review") {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-rhozly-bg/95 backdrop-blur-xl animate-in fade-in">
        <div className="bg-rhozly-surface-lowest w-full max-w-2xl h-[85vh] flex flex-col rounded-[3rem] shadow-2xl border border-rhozly-outline/20 overflow-hidden relative">
          <div className="p-8 pb-4 shrink-0 flex justify-between items-start border-b border-rhozly-outline/10">
            <div>
              <button
                onClick={() => {
                  setStep("search");
                  setExpandedResultId(null);
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
              className="p-3 bg-rhozly-surface-low rounded-2xl hover:scale-110 transition-transform"
            >
              <X size={24} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-3">
            {Array.from(selectedPlantsMap.entries()).map(([id, item]) => {
              const isApi = item.type === "api";
              const name = isApi
                ? item.data.common_name
                : item.data.split("(")[0].trim();
              const subName = isApi
                ? item.data.scientific_name?.[0]
                : item.data.match(/\(([^)]+)\)/)?.[1];

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
                        className="p-2 hover:bg-rhozly-surface-low rounded-xl text-rhozly-on-surface/60 hover:text-rhozly-primary transition-colors"
                      >
                        {expandedResultId === id ? (
                          <ChevronUp size={18} />
                        ) : (
                          <Info size={18} />
                        )}
                      </button>
                      <button
                        onClick={() => toggleSelection(id, item)}
                        className="p-3 bg-red-50 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-colors"
                        title="Remove from cart"
                      >
                        <Trash2 size={18} />
                      </button>
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
              Start Automated Import
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 🚀 SEARCH UI
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-rhozly-bg/95 backdrop-blur-xl animate-in fade-in">
      <div className="bg-rhozly-surface-lowest w-full max-w-3xl h-[85vh] flex flex-col rounded-[3rem] shadow-2xl border border-rhozly-outline/20 overflow-hidden relative">
        {/* HEADER */}
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
            className="p-3 bg-rhozly-surface-low rounded-2xl hover:scale-110 transition-transform"
          >
            <X size={24} />
          </button>
        </div>

        {/* TABS */}
        <div className="px-8 shrink-0">
          <div className="flex bg-rhozly-surface-low p-1.5 rounded-2xl border border-rhozly-outline/10">
            <button
              onClick={() => {
                setActiveTab("api");
                setExpandedResultId(null);
              }}
              className={`flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-black transition-all ${activeTab === "api" ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-on-surface/40 hover:text-rhozly-on-surface"}`}
            >
              <Database size={16} /> Perenual Database
            </button>
            <button
              onClick={() => {
                setActiveTab("ai");
                setExpandedResultId(null);
              }}
              className={`flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-black transition-all ${activeTab === "ai" ? "bg-white text-amber-500 shadow-sm" : "text-rhozly-on-surface/40 hover:text-rhozly-on-surface"}`}
            >
              <Sparkles size={16} /> AI Generator
            </button>
          </div>
        </div>

        {/* SEARCH BAR */}
        <div className="p-8 pb-4 shrink-0">
          <form onSubmit={performSearch} className="relative flex items-center">
            <input
              type="text"
              placeholder={
                activeTab === "api"
                  ? "Search real plants..."
                  : "Ask AI for any plant..."
              }
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className={`w-full pl-6 pr-14 py-4 rounded-2xl font-bold border outline-none shadow-sm transition-colors ${activeTab === "api" ? "bg-rhozly-surface-low focus:border-rhozly-primary border-transparent" : "bg-white focus:border-amber-500 border-rhozly-outline/10"}`}
            />
            <button
              type="submit"
              disabled={isSearching || !query.trim()}
              className={`absolute right-2 p-2 text-white rounded-xl hover:scale-105 transition-transform disabled:opacity-50 ${activeTab === "api" ? "bg-rhozly-primary" : "bg-amber-500"}`}
            >
              <Search size={20} />
            </button>
          </form>
        </div>

        {/* RESULTS LIST */}
        <div className="flex-1 overflow-y-auto p-8 pt-0 custom-scrollbar space-y-3 pb-32">
          {isSearching ? (
            <div className="flex flex-col items-center justify-center h-40 opacity-50">
              <Loader2
                className={`animate-spin mb-4 ${activeTab === "ai" ? "text-amber-500" : "text-rhozly-primary"}`}
                size={32}
              />
              <p className="font-bold text-sm">Searching...</p>
            </div>
          ) : activeTab === "api" ? (
            // --- API RESULTS ---
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
                      className="p-2 hover:bg-rhozly-primary/10 rounded-xl text-rhozly-primary transition-colors"
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
            // --- AI RESULTS ---
            aiResults.map((match: string, i) => {
              const isSelected = selectedPlantsMap.has(match);
              // 🚀 FIXED: Dynamic Thumbnail fetching from our Auto-Cache
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
                      className={`shrink-0 transition-colors ${isSelected ? "text-amber-500" : "text-rhozly-on-surface/20 hover:text-amber-500/50"}`}
                    >
                      {isSelected ? (
                        <CheckSquare2 size={24} />
                      ) : (
                        <Square size={24} />
                      )}
                    </button>

                    {/* 🚀 FIXED: Added Wikipedia Thumbnail box to the AI list */}
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
                      className="p-2 hover:bg-amber-100 rounded-xl text-amber-600 transition-colors"
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

        {/* FLOATING CART BAR */}
        {selectedPlantsMap.size > 0 && (
          <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-white via-white to-transparent animate-in slide-in-from-bottom-8">
            <div className="bg-rhozly-surface-lowest shadow-2xl border border-rhozly-outline/20 rounded-[2rem] p-4 flex items-center justify-between">
              <div className="px-2">
                <p className="text-sm font-black text-rhozly-on-surface">
                  {selectedPlantsMap.size} Plants Selected
                </p>
                <p className="text-[10px] font-bold uppercase tracking-widest text-rhozly-on-surface/40">
                  Ready to review
                </p>
              </div>
              <button
                onClick={() => setStep("review")}
                className={`px-8 py-4 text-white rounded-2xl font-black shadow-lg hover:scale-105 transition-transform flex items-center gap-2 ${activeTab === "ai" ? "bg-amber-500" : "bg-rhozly-primary"}`}
              >
                <ListPlus size={20} /> Review & Add
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
