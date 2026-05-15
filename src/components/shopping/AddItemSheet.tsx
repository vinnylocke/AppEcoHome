import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, Search, Loader2, ArrowLeft, Info, ChevronUp } from "lucide-react";
import { IconPlant, IconAI, IconPlantDB } from "../../constants/icons";
import toast from "react-hot-toast";
import { supabase } from "../../lib/supabase";
import { searchAllProviders, getProviderPlantDetails, careGuideToPlantDetails } from "../../lib/plantProvider";
import type { ProviderSearchResult, PlantDetails } from "../../lib/verdantlyUtils";
import { PlantDoctorService } from "../../services/plantDoctorService";
import PlantInfoPanel from "../PlantInfoPanel";
import { Logger } from "../../lib/errorHandler";
import { SHOPPING_CATEGORIES } from "../../constants/shoppingCategories";
import type { ShoppingListItem } from "../../types/shopping";

type Tab = "plant" | "product";
type PlantSearchState =
  | "idle"
  | "searching_shed"
  | "shed_results"
  | "all_searching"
  | "all_results"
  | "preview"
  | "shed_offer";

interface ShedPlant { id: string; plant_name: string; nickname: string | null; }
type DbResult = ProviderSearchResult;
interface AiResult { name: string; description: string; }

interface Props {
  homeId: string;
  listId: string;
  aiEnabled: boolean;
  perenualEnabled: boolean;
  onClose: () => void;
  onItemAdded: (item: Omit<ShoppingListItem, "id" | "created_at">) => Promise<void>;
}

export default function AddItemSheet({
  homeId, listId, aiEnabled, perenualEnabled, onClose, onItemAdded,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("plant");

  const [plantQuery, setPlantQuery] = useState("");
  const [plantState, setPlantState] = useState<PlantSearchState>("idle");
  const [shedResults, setShedResults] = useState<ShedPlant[]>([]);
  const [externalAiResults, setExternalAiResults] = useState<AiResult[]>([]);
  const [externalDbResults, setExternalDbResults] = useState<DbResult[]>([]);
  const [preview, setPreview] = useState<any | null>(null);
  const [shedOfferPlant, setShedOfferPlant] = useState<{ name: string; thumbnail_url?: string } | null>(null);
  const [addingToShed, setAddingToShed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Info accordion
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [detailsCache, setDetailsCache] = useState<Map<string, PlantDetails>>(new Map());
  const [loadingDetailsIds, setLoadingDetailsIds] = useState<Set<string>>(new Set());
  const fetchingDetailsRef = useRef<Set<string>>(new Set());

  // Product state
  const [productName, setProductName] = useState("");
  const [productCategory, setProductCategory] = useState<string>("");
  const [productSubmitting, setProductSubmitting] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [activeTab]);

  const searchShed = useCallback(async (q: string) => {
    if (!q.trim()) { setPlantState("idle"); setShedResults([]); return; }
    setPlantState("searching_shed");
    try {
      const { data } = await supabase
        .from("inventory_items")
        .select("id, plant_name, nickname")
        .eq("home_id", homeId)
        .ilike("plant_name", `%${q}%`)
        .limit(10);
      setShedResults(data ?? []);
      setPlantState("shed_results");
    } catch (err) {
      Logger.error("Shed plant search failed", err);
      toast.error("Search failed — please try again");
      setPlantState("shed_results");
    }
  }, [homeId]);

  const handleQueryChange = (val: string) => {
    setPlantQuery(val);
    setExternalAiResults([]);
    setExternalDbResults([]);
    setPreview(null);
    setExpandedItemId(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchShed(val), 400);
  };

  // Unified search across all enabled sources
  const handleSearchAll = async () => {
    if (!plantQuery.trim()) return;
    setPlantState("all_searching");
    setExternalAiResults([]);
    setExternalDbResults([]);
    setExpandedItemId(null);
    try {
      const [aiRes, dbRes] = await Promise.allSettled([
        aiEnabled
          ? supabase.functions.invoke("search-plants-ai", { body: { query: plantQuery } })
              .then(({ data, error }) => { if (error) throw error; return (data?.plants ?? []) as AiResult[]; })
          : Promise.resolve([] as AiResult[]),
        searchAllProviders(plantQuery),
      ]);
      setExternalAiResults(aiRes.status === "fulfilled" ? aiRes.value : []);
      setExternalDbResults(dbRes.status === "fulfilled" ? dbRes.value : []);
      setPlantState("all_results");
    } catch (err) {
      Logger.error("Plant search failed", err);
      toast.error("Search failed — please try again");
      setPlantState("shed_results");
    }
  };

  // Auto-prefetch care guides for AI results as soon as the list populates
  useEffect(() => {
    if (!aiEnabled) return;
    externalAiResults.forEach((r, i) => {
      fetchDetails(`ai-${i}`);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalAiResults]);

  const fetchDetails = async (key: string, plantObj?: any) => {
    if (detailsCache.has(key) || fetchingDetailsRef.current.has(key)) return;
    fetchingDetailsRef.current.add(key);
    setLoadingDetailsIds(prev => new Set(prev).add(key));
    try {
      let details: PlantDetails;
      if (plantObj) {
        details = await getProviderPlantDetails({
          source: plantObj._provider === "verdantly" ? "verdantly" : "api",
          perenual_id:  plantObj._provider !== "verdantly" ? (plantObj.perenual_id ?? plantObj.id) : null,
          verdantly_id: plantObj._provider === "verdantly" ? (plantObj.verdantly_id ?? plantObj.id) : null,
        });
      } else {
        const cleanName = key.replace(/^ai-/, "").split("(")[0].trim();
        const aiData = await PlantDoctorService.generateCareGuide(cleanName, homeId);
        details = careGuideToPlantDetails(aiData?.plantData ?? aiData, cleanName);
      }
      setDetailsCache(prev => new Map(prev).set(key, details));
    } catch {
      // silently fail
    } finally {
      fetchingDetailsRef.current.delete(key);
      setLoadingDetailsIds(prev => { const s = new Set(prev); s.delete(key); return s; });
    }
  };

  const toggleItemExpand = (key: string, plantObj?: any) => {
    setExpandedItemId(prev => prev === key ? null : key);
    fetchDetails(key, plantObj);
  };

  const renderInfoPanel = (key: string, plantName?: string) => (
    <div className="px-3 pb-2 animate-in slide-in-from-top-1">
      <PlantInfoPanel
        details={detailsCache.get(key) ?? null}
        loading={loadingDetailsIds.has(key)}
        plantName={plantName}
      />
    </div>
  );

  const handleOpenDbPreview = async (result: DbResult) => {
    setPlantState("preview");
    try {
      const details = await getProviderPlantDetails({
        source: result._provider === "verdantly" ? "verdantly" : "api",
        perenual_id: result.perenual_id ?? null,
        verdantly_id: result.verdantly_id ?? null,
      });
      setPreview({
        ...details,
        _perenual_id: result.perenual_id ?? null,
        _verdantly_id: result.verdantly_id ?? null,
        _provider: result._provider,
      });
    } catch {
      setPreview({
        common_name: result.common_name,
        scientific_name: result.scientific_name?.[0],
        thumbnail_url: result.thumbnail_url,
        _provider: result._provider,
      });
    }
  };

  const handleAddShedPlant = async (plant: ShedPlant) => {
    setSubmitting(true);
    await onItemAdded({
      list_id: listId, home_id: homeId, item_type: "plant",
      name: plant.nickname ?? plant.plant_name,
      is_checked: false, source: "shed", already_in_shed: true,
    });
    setSubmitting(false);
    onClose();
  };

  const handleAddDbPlant = async () => {
    if (!preview) return;
    setSubmitting(true);
    await onItemAdded({
      list_id: listId, home_id: homeId, item_type: "plant",
      name: preview.common_name ?? preview.name,
      is_checked: false,
      perenual_id: preview._perenual_id ?? null,
      thumbnail_url: preview.thumbnail_url ?? null,
      source: preview._provider === "verdantly" ? "verdantly" : "perenual",
      already_in_shed: false,
    });
    setSubmitting(false);
    setShedOfferPlant({ name: preview.common_name ?? preview.name, thumbnail_url: preview.thumbnail_url });
    setPlantState("shed_offer");
  };

  const handleAddAiPlant = async (plant: AiResult) => {
    setSubmitting(true);
    await onItemAdded({
      list_id: listId, home_id: homeId, item_type: "plant",
      name: plant.name, is_checked: false, source: "ai", already_in_shed: false,
    });
    setSubmitting(false);
    setShedOfferPlant({ name: plant.name });
    setPlantState("shed_offer");
  };

  const handleAddToShed = async () => {
    if (!shedOfferPlant) { onClose(); return; }
    setAddingToShed(true);
    try {
      await supabase.from("inventory_items").insert({
        home_id: homeId, plant_name: shedOfferPlant.name, status: "In Shed",
      });
    } catch (err) {
      Logger.error("Failed to add plant to shed", err);
      toast.error("Could not add to shed");
    }
    setAddingToShed(false);
    onClose();
  };

  const handleAddProduct = async () => {
    if (!productName.trim() || !productCategory) return;
    setProductSubmitting(true);
    await onItemAdded({
      list_id: listId, home_id: homeId, item_type: "product",
      name: productName.trim(), is_checked: false, category: productCategory,
    });
    setProductSubmitting(false);
    onClose();
  };

  const hasFallbacks = aiEnabled || perenualEnabled;
  const showingExternalResults = plantState === "all_results";
  const isExternalSearching = plantState === "all_searching";

  const verdantlyDbResults = externalDbResults.filter((r) => r._provider === "verdantly");
  const perenualDbResults = externalDbResults.filter((r) => r._provider !== "verdantly");

  const content = (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/40 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        data-testid="shopping-add-item-sheet"
        className="w-full max-w-lg bg-white rounded-t-3xl shadow-2xl flex flex-col max-h-[85vh] animate-in slide-in-from-bottom duration-300"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
          <p className="font-black text-rhozly-on-surface">Add Item</p>
          <button onClick={onClose} className="p-1.5 rounded-xl text-rhozly-on-surface/30 hover:text-rhozly-on-surface">
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-5 pb-3 shrink-0">
          <button
            data-testid="shopping-tab-plant"
            onClick={() => setActiveTab("plant")}
            className={`flex-1 py-2 rounded-2xl text-xs font-black transition-colors ${activeTab === "plant" ? "bg-rhozly-primary text-white" : "bg-rhozly-surface text-rhozly-on-surface/50 hover:text-rhozly-on-surface"}`}
          >
            🌱 Plant
          </button>
          <button
            data-testid="shopping-tab-product"
            onClick={() => setActiveTab("product")}
            className={`flex-1 py-2 rounded-2xl text-xs font-black transition-colors ${activeTab === "product" ? "bg-rhozly-primary text-white" : "bg-rhozly-surface text-rhozly-on-surface/50 hover:text-rhozly-on-surface"}`}
          >
            🛒 Product
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 pb-6">

          {/* ── PLANT TAB ── */}
          {activeTab === "plant" && (
            <div className="space-y-3">

              {/* Shed offer */}
              {plantState === "shed_offer" && shedOfferPlant && (
                <div className="text-center py-4 space-y-4">
                  <div className="w-14 h-14 rounded-3xl bg-emerald-50 flex items-center justify-center mx-auto">
                    <IconPlant size={24} className="text-emerald-500" />
                  </div>
                  <div>
                    <p className="font-black text-rhozly-on-surface">Added to list!</p>
                    <p className="text-xs font-bold text-rhozly-on-surface/50 mt-1">
                      Want to add <span className="text-rhozly-on-surface font-black">{shedOfferPlant.name}</span> to your Shed too?
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      data-testid="shopping-add-to-shed-skip"
                      onClick={onClose}
                      className="flex-1 py-3 rounded-2xl border border-rhozly-outline/20 text-xs font-black text-rhozly-on-surface/60 hover:bg-rhozly-surface transition-colors"
                    >
                      Skip
                    </button>
                    <button
                      data-testid="shopping-add-to-shed-yes"
                      onClick={handleAddToShed}
                      disabled={addingToShed}
                      className="flex-1 py-3 rounded-2xl bg-rhozly-primary text-white text-xs font-black hover:bg-rhozly-primary/90 transition-colors disabled:opacity-60"
                    >
                      {addingToShed ? <Loader2 size={14} className="animate-spin mx-auto" /> : "Add to Shed"}
                    </button>
                  </div>
                </div>
              )}

              {/* Preview */}
              {plantState === "preview" && (
                <div className="space-y-3">
                  <button
                    onClick={() => setPlantState("all_results")}
                    className="flex items-center gap-1.5 text-xs font-bold text-rhozly-on-surface/50 hover:text-rhozly-on-surface"
                  >
                    <ArrowLeft size={13} /> Back to results
                  </button>

                  {preview ? (
                    <div className="bg-rhozly-surface rounded-2xl p-4 space-y-3">
                      <div className="flex gap-3">
                        {preview.thumbnail_url && (
                          <img src={preview.thumbnail_url} alt="" className="w-16 h-16 rounded-2xl object-cover shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className="font-black text-rhozly-on-surface text-sm">{preview.common_name}</p>
                          {preview.scientific_name && (
                            <p className="text-[10px] text-rhozly-on-surface/40 italic mt-0.5">{preview.scientific_name}</p>
                          )}
                          <span className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full inline-block mt-1.5 ${
                            preview._provider === "verdantly"
                              ? "text-emerald-700 bg-emerald-100"
                              : "text-rhozly-primary bg-rhozly-primary/10"
                          }`}>
                            {preview._provider === "verdantly" ? "Verdantly" : "Perenual"}
                          </span>
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {preview.watering && (
                              <span className="text-[9px] font-black uppercase tracking-widest bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full">
                                💧 {preview.watering}
                              </span>
                            )}
                            {preview.sunlight && (
                              <span className="text-[9px] font-black uppercase tracking-widest bg-yellow-50 text-yellow-700 px-1.5 py-0.5 rounded-full">
                                ☀ {Array.isArray(preview.sunlight) ? preview.sunlight[0] : preview.sunlight}
                              </span>
                            )}
                            {preview.cycle && (
                              <span className="text-[9px] font-black uppercase tracking-widest bg-rhozly-surface text-rhozly-on-surface/50 px-1.5 py-0.5 rounded-full border border-rhozly-outline/20">
                                {preview.cycle}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <button
                        data-testid="shopping-add-plant-confirm"
                        onClick={handleAddDbPlant}
                        disabled={submitting}
                        className="w-full py-3 rounded-2xl bg-rhozly-primary text-white text-xs font-black hover:bg-rhozly-primary/90 transition-colors disabled:opacity-60"
                      >
                        {submitting ? <Loader2 size={14} className="animate-spin mx-auto" /> : "Add to List"}
                      </button>
                    </div>
                  ) : (
                    <div className="flex justify-center py-8">
                      <Loader2 size={24} className="animate-spin text-rhozly-primary" />
                    </div>
                  )}
                </div>
              )}

              {/* Normal search UI */}
              {plantState !== "shed_offer" && plantState !== "preview" && (
                <>
                  {/* Search input */}
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-rhozly-on-surface/30" />
                    <input
                      ref={inputRef}
                      data-testid="shopping-plant-search-input"
                      type="text"
                      placeholder="Search plants…"
                      value={plantQuery}
                      onChange={e => handleQueryChange(e.target.value)}
                      className="w-full bg-rhozly-bg border border-rhozly-outline/20 rounded-2xl pl-9 pr-4 py-2.5 text-sm font-bold text-rhozly-on-surface outline-none focus:border-rhozly-primary"
                    />
                    {plantState === "searching_shed" && (
                      <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-rhozly-on-surface/30" />
                    )}
                  </div>

                  {/* Shed results */}
                  {(plantState === "shed_results" || showingExternalResults || isExternalSearching) && (
                    <div>
                      {shedResults.length > 0 && (
                        <>
                          <p className="text-[10px] font-black text-rhozly-on-surface/40 uppercase tracking-widest mb-1.5">In Your Shed</p>
                          <ul className="space-y-1 mb-3">
                            {shedResults.map((p, i) => (
                              <li key={p.id} className="flex items-center gap-2.5 px-3 py-2 rounded-2xl hover:bg-rhozly-surface transition-colors">
                                <div className="w-7 h-7 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                                  <IconPlant size={13} className="text-emerald-500" />
                                </div>
                                <span className="flex-1 text-xs font-bold text-rhozly-on-surface truncate">
                                  {p.nickname ?? p.plant_name}
                                </span>
                                <button
                                  data-testid={`shopping-plant-result-${i}`}
                                  onClick={() => handleAddShedPlant(p)}
                                  disabled={submitting}
                                  className="text-[10px] font-black text-rhozly-primary bg-rhozly-primary/10 px-2.5 py-1 rounded-xl hover:bg-rhozly-primary/20 transition-colors"
                                >
                                  + Add
                                </button>
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                      {shedResults.length === 0 && plantState !== "idle" && !showingExternalResults && !isExternalSearching && (
                        <p className="text-xs font-bold text-rhozly-on-surface/30 text-center py-2">
                          Nothing in your shed matches "{plantQuery}"
                        </p>
                      )}
                    </div>
                  )}

                  {/* Search all sources button */}
                  {plantState === "shed_results" && hasFallbacks && (
                    <button
                      data-testid="shopping-fallback-search-all"
                      onClick={handleSearchAll}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl border border-rhozly-outline/20 text-xs font-black text-rhozly-on-surface/70 hover:bg-rhozly-surface hover:text-rhozly-on-surface transition-colors"
                    >
                      <Search size={13} /> Search All Sources
                    </button>
                  )}

                  {plantState === "shed_results" && !hasFallbacks && plantQuery && (
                    <p className="text-[10px] font-bold text-rhozly-on-surface/30 text-center py-1">
                      No additional search methods available
                    </p>
                  )}

                  {/* Searching spinner */}
                  {isExternalSearching && (
                    <div className="flex items-center gap-2 justify-center py-4 text-xs font-bold text-rhozly-on-surface/50">
                      <Loader2 size={14} className="animate-spin" /> Searching all sources…
                    </div>
                  )}

                  {/* Unified external results */}
                  {plantState === "all_results" && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] font-black text-rhozly-on-surface/40 uppercase tracking-widest">Results</p>
                        <button
                          onClick={() => setPlantState("shed_results")}
                          className="text-[10px] font-bold text-rhozly-on-surface/30 hover:text-rhozly-on-surface"
                        >
                          ← Back
                        </button>
                      </div>

                      {externalAiResults.length === 0 && verdantlyDbResults.length === 0 && perenualDbResults.length === 0 && (
                        <p className="text-xs font-bold text-rhozly-on-surface/30 text-center py-3">No results found</p>
                      )}

                      {/* AI results */}
                      {externalAiResults.length > 0 && (
                        <div>
                          <p className="text-[9px] font-black uppercase tracking-widest text-amber-500/80 mb-1.5">AI Suggestions</p>
                          <div className="space-y-0.5">
                            {externalAiResults.map((r, i) => {
                              const key = `ai-${i}`;
                              const isExpanded = expandedItemId === key;
                              return (
                                <div key={i} data-testid={`shopping-ai-result-${i}`} className="rounded-2xl border border-transparent hover:border-amber-100 overflow-hidden transition-colors">
                                  <div className="flex items-center gap-2.5 px-3 py-2">
                                    <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                                      <IconAI size={14} className="text-amber-500" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <p className="text-xs font-black text-rhozly-on-surface truncate">{r.name}</p>
                                      {r.description && (
                                        <p className="text-[9px] text-rhozly-on-surface/40 truncate">{r.description}</p>
                                      )}
                                      <span className="text-[8px] font-black uppercase tracking-widest text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full inline-block mt-0.5">AI</span>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                      <button
                                        onClick={() => toggleItemExpand(key)}
                                        className="p-1.5 rounded-lg text-amber-400 hover:bg-amber-50 hover:text-amber-600 transition-colors"
                                        aria-label="Show info"
                                      >
                                        {isExpanded ? <ChevronUp size={13} /> : loadingDetailsIds.has(key) ? <Loader2 size={13} className="animate-spin" /> : <Info size={13} />}
                                      </button>
                                      <button
                                        onClick={() => handleAddAiPlant(r)}
                                        disabled={submitting}
                                        className="text-[10px] font-black text-amber-600 bg-amber-100 px-2.5 py-1 rounded-xl hover:bg-amber-200 transition-colors"
                                      >
                                        + Add
                                      </button>
                                    </div>
                                  </div>
                                  {isExpanded && renderInfoPanel(key, r.name)}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Verdantly results */}
                      {verdantlyDbResults.length > 0 && (
                        <div>
                          <p className="text-[9px] font-black uppercase tracking-widest text-emerald-600/80 mb-1.5">Verdantly Database</p>
                          <div className="space-y-0.5">
                            {verdantlyDbResults.slice(0, 8).map((r, i) => {
                              const key = `verdantly-${r.id}`;
                              const isExpanded = expandedItemId === key;
                              return (
                                <div key={r.id} data-testid={`shopping-verdantly-result-${i}`} className="rounded-2xl border border-transparent hover:border-emerald-100 overflow-hidden transition-colors">
                                  <div className="flex items-center gap-2.5 px-3 py-2 cursor-pointer" onClick={() => handleOpenDbPreview(r)}>
                                    {r.thumbnail_url ? (
                                      <img src={r.thumbnail_url} alt="" className="w-9 h-9 rounded-xl object-cover shrink-0" />
                                    ) : (
                                      <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                                        <IconPlantDB size={14} className="text-emerald-500" />
                                      </div>
                                    )}
                                    <div className="min-w-0 flex-1">
                                      <p className="text-xs font-black text-rhozly-on-surface truncate">{r.common_name}</p>
                                      {r.scientific_name?.[0] && (
                                        <p className="text-[9px] text-rhozly-on-surface/40 italic truncate">{r.scientific_name[0]}</p>
                                      )}
                                      <span className="text-[8px] font-black uppercase tracking-widest text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full inline-block mt-0.5">Verdantly</span>
                                    </div>
                                    <button
                                      onClick={e => { e.stopPropagation(); toggleItemExpand(key, { ...r, _provider: "verdantly" }); }}
                                      className="p-1.5 rounded-lg text-emerald-400 hover:bg-emerald-50 hover:text-emerald-600 transition-colors shrink-0"
                                      aria-label="Show info"
                                    >
                                      {isExpanded ? <ChevronUp size={13} /> : loadingDetailsIds.has(key) ? <Loader2 size={13} className="animate-spin" /> : <Info size={13} />}
                                    </button>
                                  </div>
                                  {isExpanded && renderInfoPanel(key, r.common_name)}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Perenual results */}
                      {perenualDbResults.length > 0 && (
                        <div>
                          <p className="text-[9px] font-black uppercase tracking-widest text-rhozly-primary/80 mb-1.5">Perenual Database</p>
                          <div className="space-y-0.5">
                            {perenualDbResults.slice(0, 8).map((r, i) => {
                              const key = `perenual-${r.id}`;
                              const isExpanded = expandedItemId === key;
                              return (
                                <div key={r.id} data-testid={`shopping-perenual-result-${i}`} className="rounded-2xl border border-transparent hover:border-rhozly-outline/20 overflow-hidden transition-colors">
                                  <div className="flex items-center gap-2.5 px-3 py-2 cursor-pointer" onClick={() => handleOpenDbPreview(r)}>
                                    {r.thumbnail_url ? (
                                      <img src={r.thumbnail_url} alt="" className="w-9 h-9 rounded-xl object-cover shrink-0" />
                                    ) : (
                                      <div className="w-9 h-9 rounded-xl bg-rhozly-primary/10 flex items-center justify-center shrink-0">
                                        <IconPlantDB size={14} className="text-rhozly-primary/50" />
                                      </div>
                                    )}
                                    <div className="min-w-0 flex-1">
                                      <p className="text-xs font-black text-rhozly-on-surface truncate">{r.common_name}</p>
                                      {r.scientific_name?.[0] && (
                                        <p className="text-[9px] text-rhozly-on-surface/40 italic truncate">{r.scientific_name[0]}</p>
                                      )}
                                      <span className="text-[8px] font-black uppercase tracking-widest text-rhozly-primary bg-rhozly-primary/10 px-1.5 py-0.5 rounded-full inline-block mt-0.5">Perenual</span>
                                    </div>
                                    <button
                                      onClick={e => { e.stopPropagation(); toggleItemExpand(key, { ...r, _provider: "perenual" }); }}
                                      className="p-1.5 rounded-lg text-rhozly-primary/40 hover:bg-rhozly-primary/10 hover:text-rhozly-primary transition-colors shrink-0"
                                      aria-label="Show info"
                                    >
                                      {isExpanded ? <ChevronUp size={13} /> : loadingDetailsIds.has(key) ? <Loader2 size={13} className="animate-spin" /> : <Info size={13} />}
                                    </button>
                                  </div>
                                  {isExpanded && renderInfoPanel(key, r.common_name)}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {plantState === "idle" && (
                    <p className="text-xs font-bold text-rhozly-on-surface/30 text-center py-4">
                      Type a plant name to search your shed
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── PRODUCT TAB ── */}
          {activeTab === "product" && (
            <div className="space-y-4">
              <div>
                <p className="text-[10px] font-black text-rhozly-on-surface/40 uppercase tracking-widest mb-1.5">Product Name</p>
                <input
                  ref={activeTab === "product" ? inputRef : undefined}
                  data-testid="shopping-product-name-input"
                  type="text"
                  placeholder="e.g. Tomato feed, copper tape, trowel…"
                  value={productName}
                  onChange={e => setProductName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleAddProduct(); }}
                  className="w-full bg-rhozly-bg border border-rhozly-outline/20 rounded-2xl px-4 py-2.5 text-sm font-bold text-rhozly-on-surface outline-none focus:border-rhozly-primary"
                />
              </div>

              <div>
                <p className="text-[10px] font-black text-rhozly-on-surface/40 uppercase tracking-widest mb-1.5">Category</p>
                <select
                  data-testid="shopping-product-category-select"
                  value={productCategory}
                  onChange={e => setProductCategory(e.target.value)}
                  className="w-full bg-rhozly-bg border border-rhozly-outline/20 rounded-2xl px-4 py-2.5 text-sm font-bold text-rhozly-on-surface outline-none focus:border-rhozly-primary appearance-none"
                >
                  <option value="">Select category…</option>
                  {SHOPPING_CATEGORIES.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <button
                data-testid="shopping-add-product-confirm"
                onClick={handleAddProduct}
                disabled={!productName.trim() || !productCategory || productSubmitting}
                className="w-full py-3.5 rounded-2xl bg-rhozly-primary text-white font-black text-sm hover:bg-rhozly-primary/90 active:scale-[0.98] transition-all disabled:opacity-40"
              >
                {productSubmitting ? <Loader2 size={14} className="animate-spin mx-auto" /> : "Add to List"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
