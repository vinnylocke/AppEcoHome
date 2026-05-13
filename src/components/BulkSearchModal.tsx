import React, { useState, useEffect, useRef } from "react";
import {
  X,
  Search,
  Loader2,
  Lock,
  ChevronUp,
  Info,
  CheckSquare2,
  Square,
  ListPlus,
  ChevronLeft,
  Trash2,
  Edit3,
  SlidersHorizontal,
  ChevronDown,
  RefreshCw,
} from "lucide-react";
import { IconPlantDB, IconAI } from "../constants/icons";
import { PerenualService } from "../lib/perenualService";
import { searchAllProviders } from "../lib/plantProvider";
import { VerdantlyService } from "../lib/verdantlyService";
import { getProviderLabel } from "../lib/verdantlyUtils";
import toast from "react-hot-toast";
import { usePlantDoctor } from "../context/PlantDoctorContext";
import { PlantDoctorService } from "../services/plantDoctorService";
import ManualPlantCreation from "./ManualPlantCreation";

interface PlantSearchFilters {
  cycle?: string[];
  watering?: string[];
  sunlight?: string[];
  edible?: 0 | 1;
  poisonous?: 0 | 1;
  indoor?: 0 | 1;
  hardinessMin?: number;
  hardinessMax?: number;
}

interface Props {
  homeId: string;
  isPremium: boolean;
  isAiEnabled: boolean;
  onClose: () => void;
  onProceedToBulkAdd: (selectedPlants: any[]) => void;
  initialSearchTerm?: string;
  initialCartItems?: { type: "api" | "ai"; data: any }[];
  onManualSave?: (plantData: any) => void;
}

const CYCLE_OPTIONS = [
  { value: "perennial", label: "Perennial" },
  { value: "annual", label: "Annual" },
  { value: "biennial", label: "Biennial" },
  { value: "biannual", label: "Biannual" },
];

const WATERING_OPTIONS = [
  { value: "frequent", label: "Frequent" },
  { value: "average", label: "Average" },
  { value: "minimum", label: "Minimum" },
  { value: "none", label: "None" },
];

const SUNLIGHT_OPTIONS = [
  { value: "full_sun", label: "Full Sun" },
  { value: "sun-part_shade", label: "Sun / Part Shade" },
  { value: "part_shade", label: "Part Shade" },
  { value: "full_shade", label: "Full Shade" },
];

function countActiveFilters(f: PlantSearchFilters): number {
  return [
    f.cycle?.length ? 1 : undefined,
    f.watering?.length ? 1 : undefined,
    f.sunlight?.length ? 1 : undefined,
    f.edible !== undefined ? 1 : undefined,
    f.poisonous !== undefined ? 1 : undefined,
    f.indoor !== undefined ? 1 : undefined,
    f.hardinessMin !== undefined || f.hardinessMax !== undefined ? 1 : undefined,
  ].filter((v) => v !== undefined).length;
}

function toggleChip(arr: string[] | undefined, value: string): string[] | undefined {
  const current = arr ?? [];
  const next = current.includes(value)
    ? current.filter((v) => v !== value)
    : [...current, value];
  return next.length > 0 ? next : undefined;
}

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
  const [query, setQuery] = useState(initialSearchTerm || "");
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [searchError, setSearchError] = useState<string>("");
  const [hasSearched, setHasSearched] = useState(false);

  const [apiResults, setApiResults] = useState<any[]>([]);
  const [aiResults, setAiResults] = useState<string[]>([]);
  const [canShowMoreAi, setCanShowMoreAi] = useState(false);
  const [canShowMoreVerdantly, setCanShowMoreVerdantly] = useState(false);
  const [isLoadingMoreVerdantly, setIsLoadingMoreVerdantly] = useState(false);
  const [verdantlyNextPage, setVerdantlyNextPage] = useState(2);

  const [filters, setFilters] = useState<PlantSearchFilters>({});
  const [showFilters, setShowFilters] = useState(false);

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

  const hasAnySource = isAiEnabled || isPremium;
  const hasResults = aiResults.length > 0 || apiResults.length > 0;
  const activeFilterCount = countActiveFilters(filters);
  const hasSearchCriteria = query.trim().length > 0 || activeFilterCount > 0;

  // De-duplicate AI results against Perenual names only (Verdantly variety names are too
  // specific and would incorrectly filter out valid AI suggestions).
  const perenualNames = new Set(
    apiResults
      .filter((p: any) => p._provider !== "verdantly")
      .map((p: any) => p.common_name?.toLowerCase().trim()),
  );
  const deduplicatedAiResults = aiResults.filter((match) => {
    const commonName = match.split("(")[0].trim().toLowerCase();
    return !perenualNames.has(commonName);
  });

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
        currentQuery: query,
        selectedCount: selectedPlantsMap.size,
        sourcesEnabled: { ai: isAiEnabled, perenual: isPremium },
      },
    });
    return () => setPageContext(null);
  }, [query, selectedPlantsMap.size, step, isAiEnabled, isPremium, setPageContext]);

  // Focus trap and return focus on close
  useEffect(() => {
    triggerRef.current = document.activeElement as HTMLElement;
    if (modalRef.current) modalRef.current.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Tab" && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
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

    // Variety/cultivar scientific names (var., subsp., 'cultivar', f.) have no Wikipedia articles.
    // Use common name as the primary term in those cases to avoid guaranteed 404s.
    const isVariety = scientificName != null && /var\.|subsp\.|'\w|f\.\s|cv\./.test(scientificName);
    const primarySearchTerm = scientificName && !isVariety ? scientificName : commonName;

    let data = await fetchWiki(primarySearchTerm);
    // Wikipedia uses sentence case ("Grape tomato" not "Grape Tomato") — try sentence-cased fallback
    if (!data && /[A-Z]/.test(primarySearchTerm.slice(1))) {
      const sentenceCase =
        primarySearchTerm.charAt(0).toUpperCase() + primarySearchTerm.slice(1).toLowerCase();
      if (sentenceCase !== primarySearchTerm) data = await fetchWiki(sentenceCase);
    }
    if (!data && scientificName && !isVariety) data = await fetchWiki(commonName);
    // Last word of a multi-word common name often has a Wikipedia genus/species article
    // (e.g. "Tomato" from "Cherry Tomato"). Skip "{name} plant" — not a Wikipedia pattern.
    if (!data && commonName.includes(" ")) {
      data = await fetchWiki(commonName.split(" ").pop()!);
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

  // Auto-load previews for AI results as soon as they arrive
  useEffect(() => {
    if (aiResults.length > 0) {
      aiResults.forEach((match) => fetchPreviewData(match, true));
    }
  }, [aiResults]);

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
    if (!hasSearchCriteria) {
      setSearchError("Enter a plant name or select at least one filter");
      return;
    }

    setIsSearching(true);
    setSearchError("");
    setExpandedResultId(null);
    setAiResults([]);
    setApiResults([]);
    setCanShowMoreAi(false);
    setCanShowMoreVerdantly(false);
    setVerdantlyNextPage(2);
    setHasSearched(false);

    const searches: Promise<void>[] = [];

    if (isAiEnabled) {
      searches.push(
        PlantDoctorService.searchPlantsText(query, {
          searchFilters: activeFilterCount > 0 ? filters : undefined,
        })
          .then((data) => {
            const matches = data.matches || [];
            setAiResults(matches);
            setCanShowMoreAi(matches.length >= 10);
          })
          .catch(() => {}),
      );
    }

    if (isPremium) {
      // Perenual handles filter params; Verdantly is added by searchAllProviders when enabled.
      const perenualFilters = activeFilterCount > 0 ? filters : undefined;
      searches.push(
        PerenualService.searchPlants(query, perenualFilters)
          .then((perenualItems) => {
            // Normalise Perenual raw items to the shared shape used for display
            const normalized = perenualItems.map((p: any) => ({
              ...p,
              thumbnail_url: p.default_image?.thumbnail ?? null,
              _provider: "perenual",
            }));
            setApiResults(normalized);
          })
          .catch((err) => {
            const msg = (err.message || "") as string;
            if (msg.includes("Unexpected token") || msg.includes("Please Upg")) {
              toast.error("Perenual API limit reached.");
            }
          }),
      );
      // Verdantly runs in parallel — called directly so we get pagination info.
      searches.push(
        VerdantlyService.searchPlants(query, 1)
          .then(({ results, hasMore, nextPage }) => {
            if (results.length > 0) {
              setApiResults((prev: any[]) => [...prev, ...results]);
            }
            setCanShowMoreVerdantly(hasMore);
            setVerdantlyNextPage(nextPage);
          })
          .catch(() => {}),
      );
    }

    await Promise.all(searches);
    setIsSearching(false);
    setHasSearched(true);
  };

  const handleShowMoreAi = async () => {
    setIsLoadingMore(true);
    const exclude = [
      ...aiResults,
      // Only exclude Perenual names — Verdantly returns specific variety names that
      // the AI would never generate and should not count as "already shown".
      ...apiResults
        .filter((p: any) => p._provider !== "verdantly")
        .map((p: any) => p.common_name)
        .filter(Boolean),
    ];
    try {
      const data = await PlantDoctorService.searchPlantsText(query, {
        searchFilters: activeFilterCount > 0 ? filters : undefined,
        excludeNames: exclude,
      });
      const more = data.matches || [];
      setAiResults((prev) => [...prev, ...more]);
      setCanShowMoreAi(more.length >= 10);
    } catch {
      toast.error("Could not load more AI suggestions.");
    }
    setIsLoadingMore(false);
  };

  const handleShowMoreVerdantly = async () => {
    setIsLoadingMoreVerdantly(true);
    try {
      const { results, hasMore, nextPage } = await VerdantlyService.searchPlants(query, verdantlyNextPage);
      if (results.length > 0) {
        setApiResults((prev) => [...prev, ...results]);
      }
      setCanShowMoreVerdantly(hasMore);
      setVerdantlyNextPage(nextPage);
    } catch {
      toast.error("Could not load more Verdantly results.");
    }
    setIsLoadingMoreVerdantly(false);
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
      if (newMap.has(id)) newMap.delete(id);
      else newMap.set(id, plantData);
      return newMap;
    });
  };

  const setTriState = (
    field: "edible" | "poisonous" | "indoor",
    current: 0 | 1 | undefined,
  ) => {
    // cycles: undefined → 1 → 0 → undefined
    const next =
      current === undefined ? 1 : current === 1 ? 0 : undefined;
    setFilters((prev) => {
      const updated = { ...prev };
      if (next === undefined) delete updated[field];
      else updated[field] = next as 0 | 1;
      return updated;
    });
  };

  const triStateLabel = (val: 0 | 1 | undefined, trueLabel: string, falseLabel: string) =>
    val === 1 ? trueLabel : val === 0 ? falseLabel : "Any";

  const triStateClass = (val: 0 | 1 | undefined) =>
    val === 1
      ? "bg-green-100 text-green-700 border-green-300"
      : val === 0
        ? "bg-red-100 text-red-700 border-red-300"
        : "bg-rhozly-surface-low text-rhozly-on-surface/60 border-transparent";

  const renderAccordionContent = (id: string) => {
    const cache = previewCache[id];
    if (!cache) return null;

    return (
      <div className="p-4 bg-amber-50/50 border-t border-rhozly-outline/5 text-sm flex flex-col gap-4 animate-in slide-in-from-top-2">
        {cache.loading ? (
          <div className="flex items-center gap-2 text-amber-600/60 justify-center py-4">
            <Loader2 size={16} className="animate-spin" /> Fetching preview data...
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
              const isApi = item.type === "api";
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
                          <img src={thumbnail} alt={name} className="w-full h-full object-cover" />
                        ) : isApi ? (
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
                        <span
                          className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md mt-1 inline-block ${isApi ? "bg-rhozly-primary/10 text-rhozly-primary" : "bg-amber-100 text-amber-600"}`}
                        >
                          {isApi ? "Perenual" : "AI"}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleExpandResult(id, !isApi, name)}
                        className="p-3 hover:bg-rhozly-surface-low rounded-xl text-rhozly-on-surface/60 hover:text-rhozly-primary transition-colors"
                      >
                        {expandedResultId === id ? <ChevronUp size={18} /> : <Info size={18} />}
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
                  {expandedResultId === id && renderAccordionContent(id)}
                </div>
              );
            })}
          </div>

          <div className="p-6 border-t border-rhozly-outline/10 bg-white shrink-0">
            <button
              onClick={() => onProceedToBulkAdd(Array.from(selectedPlantsMap.values()))}
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
        ) : !hasAnySource ? (
          <div
            data-testid="bulk-search-no-sources"
            className="flex-1 flex flex-col items-center justify-center p-8 text-center"
          >
            <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mb-6 text-amber-600">
              <Lock size={32} />
            </div>
            <h3 className="text-2xl font-black mb-2">No Sources Enabled</h3>
            <p className="text-sm font-bold text-rhozly-on-surface/60 mb-6 max-w-xs">
              Enable the Perenual database or AI in your account settings to search for plants.
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
            {/* Search input + filters toggle */}
            <div className="px-8 pt-4 pb-0 shrink-0 space-y-3">
              <form onSubmit={performSearch}>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      id="bulk-search-input"
                      data-testid="bulk-search-input"
                      type="text"
                      placeholder={
                        isAiEnabled && isPremium
                          ? "Plant name (optional if filters set)…"
                          : isAiEnabled
                            ? "Ask AI for any plant…"
                            : "Search the Perenual database…"
                      }
                      value={query}
                      onChange={(e) => {
                        setQuery(e.target.value);
                        if (searchError) setSearchError("");
                      }}
                      aria-describedby="search-helper-text"
                      aria-invalid={!!searchError}
                      className={`w-full pl-6 pr-4 py-4 rounded-2xl font-bold border outline-none shadow-sm transition-colors bg-rhozly-surface-low focus:border-rhozly-primary ${searchError ? "border-red-500" : "border-transparent"}`}
                    />
                  </div>

                  {/* Filters toggle button */}
                  <button
                    type="button"
                    data-testid="bulk-search-filters-toggle"
                    onClick={() => setShowFilters((v) => !v)}
                    className={`relative flex items-center gap-2 px-4 py-3 rounded-2xl font-black text-xs border transition-colors ${showFilters ? "bg-rhozly-primary text-white border-rhozly-primary" : "bg-rhozly-surface-low text-rhozly-on-surface/70 border-transparent hover:border-rhozly-primary/30"}`}
                  >
                    <SlidersHorizontal size={16} />
                    <span className="hidden sm:inline">Filters</span>
                    {activeFilterCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-rhozly-primary text-white rounded-full text-[9px] font-black flex items-center justify-center border-2 border-rhozly-surface-lowest">
                        {activeFilterCount}
                      </span>
                    )}
                    <ChevronDown
                      size={14}
                      className={`transition-transform ${showFilters ? "rotate-180" : ""}`}
                    />
                  </button>

                  {/* Search button */}
                  <button
                    type="submit"
                    disabled={isSearching || !hasSearchCriteria}
                    aria-label="Search"
                    className="px-5 py-3 bg-rhozly-primary text-white rounded-2xl hover:scale-105 transition-transform disabled:opacity-50 flex items-center gap-2 font-black text-xs"
                  >
                    {isSearching ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
                    <span className="hidden sm:inline">Search</span>
                  </button>
                </div>

                {searchError && (
                  <p className="text-xs text-red-500 font-bold mt-2 px-2 animate-in slide-in-from-top-1" role="alert">
                    {searchError}
                  </p>
                )}
              </form>

              {/* Filter panel */}
              {showFilters && (
                <div
                  data-testid="bulk-search-filter-panel"
                  className="bg-rhozly-surface-low rounded-2xl p-4 space-y-4 animate-in slide-in-from-top-2"
                >
                  <div className="space-y-3">
                    {/* Cycle chips */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-black uppercase tracking-widest text-rhozly-on-surface/50">
                        Life Cycle
                      </label>
                      <div className="flex flex-wrap gap-1.5" data-testid="filter-cycle">
                        {CYCLE_OPTIONS.map((o) => {
                          const active = filters.cycle?.includes(o.value);
                          return (
                            <button
                              key={o.value}
                              type="button"
                              onClick={() => setFilters((prev) => ({ ...prev, cycle: toggleChip(prev.cycle, o.value) }))}
                              className={`px-3 py-1.5 rounded-xl text-xs font-black border transition-colors ${active ? "bg-rhozly-primary text-white border-rhozly-primary" : "bg-white text-rhozly-on-surface/60 border-rhozly-outline/20 hover:border-rhozly-primary/40"}`}
                            >
                              {o.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Watering chips */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-black uppercase tracking-widest text-rhozly-on-surface/50">
                        Watering
                      </label>
                      <div className="flex flex-wrap gap-1.5" data-testid="filter-watering">
                        {WATERING_OPTIONS.map((o) => {
                          const active = filters.watering?.includes(o.value);
                          return (
                            <button
                              key={o.value}
                              type="button"
                              onClick={() => setFilters((prev) => ({ ...prev, watering: toggleChip(prev.watering, o.value) }))}
                              className={`px-3 py-1.5 rounded-xl text-xs font-black border transition-colors ${active ? "bg-rhozly-primary text-white border-rhozly-primary" : "bg-white text-rhozly-on-surface/60 border-rhozly-outline/20 hover:border-rhozly-primary/40"}`}
                            >
                              {o.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Sunlight chips */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-black uppercase tracking-widest text-rhozly-on-surface/50">
                        Sunlight
                      </label>
                      <div className="flex flex-wrap gap-1.5" data-testid="filter-sunlight">
                        {SUNLIGHT_OPTIONS.map((o) => {
                          const active = filters.sunlight?.includes(o.value);
                          return (
                            <button
                              key={o.value}
                              type="button"
                              onClick={() => setFilters((prev) => ({ ...prev, sunlight: toggleChip(prev.sunlight, o.value) }))}
                              className={`px-3 py-1.5 rounded-xl text-xs font-black border transition-colors ${active ? "bg-rhozly-primary text-white border-rhozly-primary" : "bg-white text-rhozly-on-surface/60 border-rhozly-outline/20 hover:border-rhozly-primary/40"}`}
                            >
                              {o.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">

                    {/* Hardiness zone range */}
                    <div className="flex flex-col gap-1 col-span-2 sm:col-span-3">
                      <label className="text-[9px] font-black uppercase tracking-widest text-rhozly-on-surface/50">
                        USDA Hardiness Zone
                      </label>
                      <div className="flex items-center gap-2">
                        <select
                          data-testid="filter-hardiness-min"
                          value={filters.hardinessMin ?? ""}
                          onChange={(e) =>
                            setFilters((prev) => ({
                              ...prev,
                              hardinessMin: e.target.value ? parseInt(e.target.value) : undefined,
                            }))
                          }
                          className="flex-1 py-2 px-3 rounded-xl bg-white border border-rhozly-outline/20 text-xs font-bold outline-none focus:border-rhozly-primary"
                        >
                          <option value="">From (any)</option>
                          {Array.from({ length: 13 }, (_, i) => i + 1).map((z) => (
                            <option key={z} value={z} disabled={filters.hardinessMax !== undefined && z > filters.hardinessMax}>
                              Zone {z}
                            </option>
                          ))}
                        </select>
                        <span className="text-xs font-black text-rhozly-on-surface/40">to</span>
                        <select
                          data-testid="filter-hardiness-max"
                          value={filters.hardinessMax ?? ""}
                          onChange={(e) =>
                            setFilters((prev) => ({
                              ...prev,
                              hardinessMax: e.target.value ? parseInt(e.target.value) : undefined,
                            }))
                          }
                          className="flex-1 py-2 px-3 rounded-xl bg-white border border-rhozly-outline/20 text-xs font-bold outline-none focus:border-rhozly-primary"
                        >
                          <option value="">To (any)</option>
                          {Array.from({ length: 13 }, (_, i) => i + 1).map((z) => (
                            <option key={z} value={z} disabled={filters.hardinessMin !== undefined && z < filters.hardinessMin}>
                              Zone {z}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Edible toggle */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-black uppercase tracking-widest text-rhozly-on-surface/50">
                        Edible
                      </label>
                      <button
                        data-testid="filter-edible"
                        type="button"
                        onClick={() => setTriState("edible", filters.edible)}
                        className={`py-2 px-3 rounded-xl border text-xs font-black transition-colors text-left ${triStateClass(filters.edible)}`}
                      >
                        {triStateLabel(filters.edible, "Yes", "No")}
                      </button>
                    </div>

                    {/* Poisonous toggle */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-black uppercase tracking-widest text-rhozly-on-surface/50">
                        Poisonous
                      </label>
                      <button
                        data-testid="filter-poisonous"
                        type="button"
                        onClick={() => setTriState("poisonous", filters.poisonous)}
                        className={`py-2 px-3 rounded-xl border text-xs font-black transition-colors text-left ${triStateClass(filters.poisonous)}`}
                      >
                        {triStateLabel(filters.poisonous, "Yes", "No")}
                      </button>
                    </div>

                    {/* Indoor toggle */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-black uppercase tracking-widest text-rhozly-on-surface/50">
                        Indoor
                      </label>
                      <button
                        data-testid="filter-indoor"
                        type="button"
                        onClick={() => setTriState("indoor", filters.indoor)}
                        className={`py-2 px-3 rounded-xl border text-xs font-black transition-colors text-left ${triStateClass(filters.indoor)}`}
                      >
                        {triStateLabel(filters.indoor, "Yes", "Outdoor only")}
                      </button>
                    </div>
                  </div>
                  </div>

                  {/* Clear filters */}
                  {activeFilterCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setFilters({})}
                      className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 hover:text-rhozly-primary transition-colors"
                    >
                      Clear all filters
                    </button>
                  )}
                </div>
              )}

              <p id="search-helper-text" className="text-xs text-rhozly-on-surface/50 font-medium px-1">
                {isAiEnabled && isPremium
                  ? "AI suggestions shown first, then Perenual matches"
                  : isAiEnabled
                    ? "AI-generated plant suggestions"
                    : "Searches the Perenual plant database"}
              </p>
            </div>

            {/* Results */}
            <div className="flex-1 overflow-y-auto px-8 py-4 custom-scrollbar space-y-3">
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
                    <Loader2 className="animate-spin mb-2 text-rhozly-primary" size={24} />
                    <p className="font-bold text-xs">Searching…</p>
                  </div>
                </div>
              ) : (
                <>
                  {/* AI results — shown first, de-duplicated against Perenual */}
                  {deduplicatedAiResults.length > 0 && (
                    <>
                      {isPremium && (
                        <p className="text-[10px] font-black uppercase tracking-widest text-amber-500/70 px-1 pt-1">
                          AI Suggestions
                        </p>
                      )}
                      {deduplicatedAiResults.map((match: string, i) => {
                        const isSelected = selectedPlantsMap.has(match);
                        const cachedThumb = previewCache[match]?.images?.[0];

                        return (
                          <div
                            key={`ai-${i}`}
                            className={`w-full bg-white border rounded-2xl transition-all overflow-hidden flex flex-col shadow-sm ${isSelected ? "border-amber-500 ring-1 ring-amber-500/30" : "border-rhozly-outline/10 hover:border-amber-500/40"}`}
                          >
                            <div className="flex items-center p-3 gap-3">
                              <button
                                onClick={() => toggleSelection(match, { type: "ai", data: match })}
                                aria-label={isSelected ? "Remove from selection" : "Add to selection"}
                                className={`shrink-0 transition-colors ${isSelected ? "text-amber-500" : "text-rhozly-on-surface/20 hover:text-amber-500/50"}`}
                              >
                                {isSelected ? <CheckSquare2 size={24} /> : <Square size={24} />}
                              </button>

                              <div className="w-12 h-12 rounded-xl bg-amber-500/5 overflow-hidden shrink-0 flex items-center justify-center text-amber-500/40">
                                {cachedThumb ? (
                                  <img src={cachedThumb} alt={match} className="w-full h-full object-cover" />
                                ) : previewCache[match]?.loading ? (
                                  <Loader2 size={16} className="animate-spin" />
                                ) : (
                                  <IconAI size={20} />
                                )}
                              </div>

                              <div className="flex-1 min-w-0">
                                <span className="font-bold text-rhozly-on-surface truncate block">{match}</span>
                                <span className="text-[8px] font-black uppercase tracking-widest text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded-md inline-block mt-0.5">
                                  AI
                                </span>
                              </div>
                              <button
                                onClick={() => handleExpandResult(match, true)}
                                className="p-3 hover:bg-amber-100 rounded-xl text-amber-600 transition-colors"
                              >
                                {expandedResultId === match ? <ChevronUp size={18} /> : <Info size={18} />}
                              </button>
                            </div>
                            {expandedResultId === match && renderAccordionContent(match)}
                          </div>
                        );
                      })}

                      {/* Show more / end-of-results indicator */}
                      {isAiEnabled && hasSearched && !isLoadingMore && (
                        canShowMoreAi ? (
                          <button
                            data-testid="bulk-search-show-more-ai"
                            onClick={handleShowMoreAi}
                            className="w-full py-3 border-2 border-dashed border-amber-300 text-amber-600 rounded-2xl font-black text-xs hover:bg-amber-50 transition-colors flex items-center justify-center gap-2"
                          >
                            <RefreshCw size={14} /> Show more AI suggestions
                          </button>
                        ) : deduplicatedAiResults.length > 0 ? (
                          <p
                            data-testid="bulk-search-ai-exhausted"
                            className="text-center text-[10px] font-black uppercase tracking-widest text-amber-400/70 py-1"
                          >
                            All AI suggestions shown
                          </p>
                        ) : null
                      )}
                      {isAiEnabled && isLoadingMore && (
                        <button
                          disabled
                          className="w-full py-3 border-2 border-dashed border-amber-300 text-amber-600 rounded-2xl font-black text-xs flex items-center justify-center gap-2 opacity-60"
                        >
                          <Loader2 size={14} className="animate-spin" /> Loading more AI suggestions…
                        </button>
                      )}
                    </>
                  )}

                  {/* Database results (Perenual + Verdantly) */}
                  {(apiResults.length > 0 || canShowMoreVerdantly) && (
                    <>
                      {isAiEnabled && (
                        <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-primary/70 px-1 pt-1">
                          Plant Database
                        </p>
                      )}
                      {apiResults.map((plant: any) => {
                        const isSelected = selectedPlantsMap.has(String(plant.id));
                        const thumb = plant.thumbnail_url?.includes("upgrade_access") ? null : plant.thumbnail_url;
                        const providerLabel = getProviderLabel(plant._provider === "verdantly" ? "verdantly" : "api");
                        const itemType = plant._provider === "verdantly" ? "verdantly" : "api";
                        return (
                          <div
                            key={`${plant._provider ?? "api"}-${plant.id}`}
                            className={`w-full bg-white border rounded-2xl transition-all overflow-hidden flex flex-col shadow-sm ${isSelected ? "border-rhozly-primary ring-1 ring-rhozly-primary/30" : "border-rhozly-outline/10 hover:border-rhozly-primary/30"}`}
                          >
                            <div className="flex items-center p-3 gap-3">
                              <button
                                onClick={() =>
                                  toggleSelection(String(plant.id), { type: itemType, data: plant })
                                }
                                aria-label={isSelected ? "Remove from selection" : "Add to selection"}
                                className={`shrink-0 transition-colors ${isSelected ? "text-rhozly-primary" : "text-rhozly-on-surface/20 hover:text-rhozly-primary/50"}`}
                              >
                                {isSelected ? <CheckSquare2 size={24} /> : <Square size={24} />}
                              </button>
                              <div className="w-12 h-12 rounded-xl bg-rhozly-primary/5 overflow-hidden shrink-0">
                                {thumb ? (
                                  <img
                                    src={thumb}
                                    alt={plant.common_name}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-rhozly-on-surface/20">
                                    <IconPlantDB size={16} />
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 className="font-black text-rhozly-on-surface truncate">{plant.common_name}</h4>
                                <p className="text-[10px] font-bold text-rhozly-on-surface/50 italic truncate">
                                  {plant.scientific_name?.[0]}
                                </p>
                                <span className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md inline-block mt-0.5 ${
                                  providerLabel === "Verdantly"
                                    ? "text-emerald-700 bg-emerald-100"
                                    : "text-rhozly-primary bg-rhozly-primary/10"
                                }`}>
                                  {providerLabel ?? "Database"}
                                </span>
                              </div>
                              <button
                                onClick={() => handleExpandResult(String(plant.id), false, plant.common_name)}
                                className="p-3 hover:bg-rhozly-primary/10 rounded-xl text-rhozly-primary transition-colors"
                              >
                                {expandedResultId === String(plant.id) ? <ChevronUp size={18} /> : <Info size={18} />}
                              </button>
                            </div>
                            {expandedResultId === String(plant.id) && renderAccordionContent(String(plant.id))}
                          </div>
                        );
                      })}

                      {/* Show more Verdantly results */}
                      {hasSearched && !isLoadingMoreVerdantly && canShowMoreVerdantly && (
                        <button
                          data-testid="bulk-search-show-more-verdantly"
                          onClick={handleShowMoreVerdantly}
                          className="w-full py-3 border-2 border-dashed border-emerald-300 text-emerald-700 rounded-2xl font-black text-xs hover:bg-emerald-50 transition-colors flex items-center justify-center gap-2"
                        >
                          <RefreshCw size={14} /> Show more Verdantly results
                        </button>
                      )}
                      {hasSearched && isLoadingMoreVerdantly && (
                        <button
                          disabled
                          className="w-full py-3 border-2 border-dashed border-emerald-300 text-emerald-700 rounded-2xl font-black text-xs flex items-center justify-center gap-2 opacity-60"
                        >
                          <Loader2 size={14} className="animate-spin" /> Loading more Verdantly results…
                        </button>
                      )}
                    </>
                  )}

                  {/* Empty state */}
                  {!isSearching && hasSearchCriteria && !hasResults && (
                    <div className="flex flex-col items-center justify-center py-20 text-center gap-2 opacity-50">
                      <Search size={32} />
                      <p className="font-black text-sm">No results found</p>
                      <p className="text-xs font-bold">Try a different name or adjust the filters</p>
                    </div>
                  )}

                  {/* Initial prompt state */}
                  {!isSearching && !hasSearchCriteria && !hasResults && (
                    <div className="flex flex-col items-center justify-center py-20 text-center gap-2 opacity-40">
                      <SlidersHorizontal size={32} />
                      <p className="font-black text-sm">Search by name, filters, or both</p>
                      <p className="text-xs font-bold">Use the Filters button to narrow by watering, sunlight, and more</p>
                    </div>
                  )}
                </>
              )}
            </div>

            {selectedPlantsMap.size > 0 && (
              <div className="shrink-0 p-6 bg-white border-t border-rhozly-outline/10 md:absolute md:bottom-0 md:left-0 md:right-0 md:bg-gradient-to-t md:from-white md:via-white md:to-transparent md:border-t-0 animate-in slide-in-from-bottom-8">
                <div className="bg-rhozly-surface-lowest shadow-2xl border border-rhozly-outline/20 rounded-2xl p-4 flex flex-col md:flex-row items-center gap-4 md:justify-between">
                  <div className="px-2 text-center md:text-left">
                    <p className="text-sm font-black text-rhozly-on-surface">{selectedPlantsMap.size} Plants Selected</p>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-rhozly-on-surface/40">Ready to review</p>
                  </div>
                  <button
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
