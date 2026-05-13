import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, Search, Loader2, ArrowLeft, Globe } from "lucide-react";
import { IconPlant, IconAI } from "../../constants/icons";
import toast from "react-hot-toast";
import { supabase } from "../../lib/supabase";
import { searchAllProviders, getProviderPlantDetails } from "../../lib/plantProvider";
import type { ProviderSearchResult } from "../../lib/verdantlyUtils";
import { Logger } from "../../lib/errorHandler";
import { SHOPPING_CATEGORIES } from "../../constants/shoppingCategories";
import type { ShoppingListItem } from "../../types/shopping";

type Tab = "plant" | "product";
type PlantSearchState =
  | "idle"
  | "searching_shed"
  | "shed_results"
  | "perenual_searching"
  | "perenual_results"
  | "ai_searching"
  | "ai_results"
  | "preview"
  | "shed_offer"
  | "no_results";

interface ShedPlant { id: string; plant_name: string; nickname: string | null; }
type PerenualResult = ProviderSearchResult;
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

  // Plant search state
  const [plantQuery, setPlantQuery] = useState("");
  const [plantState, setPlantState] = useState<PlantSearchState>("idle");
  const [shedResults, setShedResults] = useState<ShedPlant[]>([]);
  const [perenualResults, setPerenualResults] = useState<PerenualResult[]>([]);
  const [aiResults, setAiResults] = useState<AiResult[]>([]);
  const [preview, setPreview] = useState<any | null>(null);
  const [previewSource, setPreviewSource] = useState<"perenual" | "ai" | null>(null);
  const [shedOfferPlant, setShedOfferPlant] = useState<{ name: string; perenual_id?: number; thumbnail_url?: string } | null>(null);
  const [addingToShed, setAddingToShed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Product state
  const [productName, setProductName] = useState("");
  const [productCategory, setProductCategory] = useState<string>("");
  const [productSubmitting, setProductSubmitting] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [activeTab]);

  // Shed-only search (always runs on query change)
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
    // Reset any external results when query changes
    setPerenualResults([]);
    setAiResults([]);
    setPreview(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchShed(val), 400);
  };

  // Plant database search (user-triggered) — searches all enabled providers
  const handleSearchPerenual = async () => {
    if (!plantQuery.trim()) return;
    setPlantState("perenual_searching");
    setPerenualResults([]);
    try {
      const results = await searchAllProviders(plantQuery);
      setPerenualResults(results ?? []);
      setPlantState("perenual_results");
    } catch (err) {
      Logger.error("Plant database search failed", err);
      toast.error("Search failed — please try again");
      setPlantState("shed_results");
    }
  };

  // AI search (user-triggered)
  const handleSearchAI = async () => {
    if (!plantQuery.trim()) return;
    setPlantState("ai_searching");
    setAiResults([]);
    try {
      const { data, error } = await supabase.functions.invoke("search-plants-ai", {
        body: { query: plantQuery },
      });
      if (error) throw error;
      setAiResults(data?.plants ?? []);
      setPlantState("ai_results");
    } catch (err) {
      Logger.error("AI plant search failed", err);
      toast.error("Search failed — please try again");
      setPlantState("shed_results");
    }
  };

  // Open plant preview (Perenual or Verdantly)
  const handleOpenPerenualPreview = async (result: PerenualResult) => {
    setPlantState("preview");
    setPreviewSource("perenual");
    try {
      const details = await getProviderPlantDetails({
        source: result._provider === "verdantly" ? "verdantly" : "api",
        perenual_id: result.perenual_id ?? null,
        verdantly_id: result.verdantly_id ?? null,
      });
      setPreview({ ...details, _perenual_id: result.perenual_id ?? null, _verdantly_id: result.verdantly_id ?? null });
    } catch {
      setPreview({
        common_name: result.common_name,
        scientific_name: result.scientific_name?.[0],
        thumbnail_url: result.thumbnail_url,
      });
    }
  };

  // Add plant from shed
  const handleAddShedPlant = async (plant: ShedPlant) => {
    setSubmitting(true);
    await onItemAdded({
      list_id: listId,
      home_id: homeId,
      item_type: "plant",
      name: plant.nickname ?? plant.plant_name,
      is_checked: false,
      source: "shed",
      already_in_shed: true,
    });
    setSubmitting(false);
    onClose();
  };

  // Add plant from Perenual preview
  const handleAddPerenualPlant = async () => {
    if (!preview) return;
    setSubmitting(true);
    await onItemAdded({
      list_id: listId,
      home_id: homeId,
      item_type: "plant",
      name: preview.common_name ?? preview.name,
      is_checked: false,
      perenual_id: preview._perenual_id ?? null,
      thumbnail_url: preview.thumbnail_url ?? null,
      source: "perenual",
      already_in_shed: false,
    });
    setSubmitting(false);
    // Offer to add to shed
    setShedOfferPlant({
      name: preview.common_name ?? preview.name,
      perenual_id: preview._perenual_id,
      thumbnail_url: preview.thumbnail_url,
    });
    setPlantState("shed_offer");
  };

  // Add plant from AI results
  const handleAddAiPlant = async (plant: AiResult) => {
    setSubmitting(true);
    await onItemAdded({
      list_id: listId,
      home_id: homeId,
      item_type: "plant",
      name: plant.name,
      is_checked: false,
      source: "ai",
      already_in_shed: false,
    });
    setSubmitting(false);
    setShedOfferPlant({ name: plant.name });
    setPlantState("shed_offer");
  };

  // Add to shed after adding to list
  const handleAddToShed = async () => {
    if (!shedOfferPlant) { onClose(); return; }
    setAddingToShed(true);
    try {
      await supabase.from("inventory_items").insert({
        home_id: homeId,
        plant_name: shedOfferPlant.name,
        status: "In Shed",
      });
    } catch (err) {
      Logger.error("Failed to add plant to shed", err);
      toast.error("Could not add to shed");
    }
    setAddingToShed(false);
    onClose();
  };

  // Add product
  const handleAddProduct = async () => {
    if (!productName.trim() || !productCategory) return;
    setProductSubmitting(true);
    await onItemAdded({
      list_id: listId,
      home_id: homeId,
      item_type: "product",
      name: productName.trim(),
      is_checked: false,
      category: productCategory,
    });
    setProductSubmitting(false);
    onClose();
  };

  const hasFallbacks = aiEnabled || perenualEnabled;
  const showingExternalResults = plantState === "perenual_results" || plantState === "ai_results";
  const isExternalSearching = plantState === "perenual_searching" || plantState === "ai_searching";

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
            onClick={() => { setActiveTab("plant"); }}
            className={`flex-1 py-2 rounded-2xl text-xs font-black transition-colors ${activeTab === "plant" ? "bg-rhozly-primary text-white" : "bg-rhozly-surface text-rhozly-on-surface/50 hover:text-rhozly-on-surface"}`}
          >
            🌱 Plant
          </button>
          <button
            data-testid="shopping-tab-product"
            onClick={() => { setActiveTab("product"); }}
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

              {/* Shed offer state */}
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

              {/* Preview state */}
              {plantState === "preview" && previewSource === "perenual" && (
                <div className="space-y-3">
                  <button
                    onClick={() => setPlantState("perenual_results")}
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
                        onClick={handleAddPerenualPlant}
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

              {/* Normal search UI (not preview/offer) */}
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

                  {/* Shed results section */}
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

                  {/* Fallback buttons */}
                  {(plantState === "shed_results") && hasFallbacks && (
                    <div className="space-y-2">
                      <p className="text-[10px] font-black text-rhozly-on-surface/40 uppercase tracking-widest">Search further</p>
                      <div className="flex gap-2">
                        {perenualEnabled && (
                          <button
                            data-testid="shopping-fallback-perenual"
                            onClick={handleSearchPerenual}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-2xl border border-rhozly-outline/20 text-xs font-black text-rhozly-on-surface/70 hover:bg-rhozly-surface hover:text-rhozly-on-surface transition-colors"
                          >
                            <Globe size={13} /> Search Perenual
                          </button>
                        )}
                        {aiEnabled && (
                          <button
                            data-testid="shopping-fallback-ai"
                            onClick={handleSearchAI}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-2xl border border-violet-200 text-xs font-black text-violet-600 hover:bg-violet-50 transition-colors"
                          >
                            <IconAI size={13} /> Search via AI
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* No fallbacks available */}
                  {plantState === "shed_results" && !hasFallbacks && plantQuery && (
                    <p className="text-[10px] font-bold text-rhozly-on-surface/30 text-center py-1">
                      No additional search methods available
                    </p>
                  )}

                  {/* Perenual searching */}
                  {plantState === "perenual_searching" && (
                    <div className="flex items-center gap-2 justify-center py-4 text-xs font-bold text-rhozly-on-surface/50">
                      <Loader2 size={14} className="animate-spin" /> Searching Perenual…
                    </div>
                  )}

                  {/* Perenual results */}
                  {plantState === "perenual_results" && (
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-[10px] font-black text-rhozly-on-surface/40 uppercase tracking-widest">Perenual Results</p>
                        <button
                          onClick={() => setPlantState("shed_results")}
                          className="text-[10px] font-bold text-rhozly-on-surface/30 hover:text-rhozly-on-surface"
                        >
                          ← Back
                        </button>
                      </div>
                      {perenualResults.length === 0 ? (
                        <p className="text-xs font-bold text-rhozly-on-surface/30 text-center py-3">No results found</p>
                      ) : (
                        <ul className="space-y-1">
                          {perenualResults.slice(0, 12).map((r, i) => (
                            <li
                              key={r.id}
                              data-testid={`shopping-perenual-result-${i}`}
                              onClick={() => handleOpenPerenualPreview(r)}
                              className="flex items-center gap-2.5 px-3 py-2 rounded-2xl hover:bg-rhozly-surface cursor-pointer transition-colors"
                            >
                              {r.thumbnail_url ? (
                                <img src={r.thumbnail_url} alt="" className="w-9 h-9 rounded-xl object-cover shrink-0" />
                              ) : (
                                <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                                  <IconPlant size={14} className="text-emerald-500" />
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-black text-rhozly-on-surface truncate">{r.common_name}</p>
                                {r.scientific_name?.[0] && (
                                  <p className="text-[9px] text-rhozly-on-surface/40 italic truncate">{r.scientific_name[0]}</p>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  {/* AI searching */}
                  {plantState === "ai_searching" && (
                    <div className="flex items-center gap-2 justify-center py-4 text-xs font-bold text-violet-500">
                      <Loader2 size={14} className="animate-spin" /> Asking AI…
                    </div>
                  )}

                  {/* AI results */}
                  {plantState === "ai_results" && (
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-[10px] font-black text-violet-500 uppercase tracking-widest">AI Suggestions</p>
                        <button
                          onClick={() => setPlantState("shed_results")}
                          className="text-[10px] font-bold text-rhozly-on-surface/30 hover:text-rhozly-on-surface"
                        >
                          ← Back
                        </button>
                      </div>
                      {aiResults.length === 0 ? (
                        <p className="text-xs font-bold text-rhozly-on-surface/30 text-center py-3">No suggestions found</p>
                      ) : (
                        <ul className="space-y-1">
                          {aiResults.map((r, i) => (
                            <li
                              key={i}
                              data-testid={`shopping-ai-result-${i}`}
                              className="flex items-center gap-2.5 px-3 py-2 rounded-2xl hover:bg-violet-50 transition-colors"
                            >
                              <div className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center shrink-0">
                                <IconAI size={14} className="text-violet-500" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-black text-rhozly-on-surface truncate">{r.name}</p>
                                {r.description && (
                                  <p className="text-[9px] text-rhozly-on-surface/40 truncate">{r.description}</p>
                                )}
                              </div>
                              <button
                                onClick={() => handleAddAiPlant(r)}
                                disabled={submitting}
                                className="text-[10px] font-black text-violet-600 bg-violet-100 px-2.5 py-1 rounded-xl hover:bg-violet-200 transition-colors shrink-0"
                              >
                                + Add
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  {/* Idle prompt */}
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
