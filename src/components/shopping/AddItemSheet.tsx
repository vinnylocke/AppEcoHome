import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Loader2 } from "lucide-react";
import { IconPlant } from "../../constants/icons";
import toast from "react-hot-toast";
import { supabase } from "../../lib/supabase";
import { Logger } from "../../lib/errorHandler";
import { SHOPPING_CATEGORIES } from "../../constants/shoppingCategories";
import type { ShoppingListItem } from "../../types/shopping";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import PlantSearch from "../shared/PlantSearch";
import PlantDetailModal from "../PlantDetailModal";
import { selectionToProviderResult, type PlantSelection } from "../../lib/unifiedPlantSearch";
import type { ProviderSearchResult } from "../../lib/verdantlyUtils";

type Tab = "plant" | "product";

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
  const trapRef = useFocusTrap<HTMLDivElement>(true);
  const [activeTab, setActiveTab] = useState<Tab>("plant");

  // Plant flow
  const [submitting, setSubmitting] = useState(false);
  const [shedOfferPlant, setShedOfferPlant] = useState<{ name: string; thumbnail_url?: string } | null>(null);
  const [addingToShed, setAddingToShed] = useState(false);
  // "See full care" overlay — shared <PlantSearch> hands a selection here.
  const [detailResult, setDetailResult] = useState<ProviderSearchResult | null>(null);

  // Product flow
  const [productName, setProductName] = useState("");
  const [productCategory, setProductCategory] = useState<string>("");
  const [productQuantity, setProductQuantity] = useState<string>("");
  const [productSubmitting, setProductSubmitting] = useState(false);

  const productInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (activeTab === "product") setTimeout(() => productInputRef.current?.focus(), 50);
  }, [activeTab]);

  // Library plants are our curated AI-built data; map them + manual to "ai"
  // for the shopping_list_items.source column which expects a known value.
  // Cast: PlantSelection.source is a plain string; at runtime the non-mapped
  // value is the provider source (e.g. "perenual").
  const selectionSource = (sel: PlantSelection) =>
    (sel.source === "library" || sel.source === "manual" ? "ai" : sel.source) as "perenual" | "ai" | "shed";

  const handlePlantSelected = async (sel: PlantSelection) => {
    setSubmitting(true);
    try {
      await onItemAdded({
        list_id: listId, home_id: homeId, item_type: "plant",
        name: sel.common_name,
        is_checked: false,
        perenual_id: sel.perenual_id ?? null,
        thumbnail_url: sel.thumbnail_url ?? null,
        source: selectionSource(sel),
        already_in_shed: false,
      });
      setShedOfferPlant({ name: sel.common_name, thumbnail_url: sel.thumbnail_url ?? undefined });
    } catch (err) {
      Logger.error("Failed to add plant to shopping list", err);
      toast.error("Couldn't add that — try again.");
    } finally {
      setSubmitting(false);
    }
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
    const parsedQty = productQuantity.trim() ? Number(productQuantity) : null;
    await onItemAdded({
      list_id: listId, home_id: homeId, item_type: "product",
      name: productName.trim(), is_checked: false, category: productCategory,
      quantity: parsedQty != null && !Number.isNaN(parsedQty) && parsedQty > 0 ? parsedQty : null,
    });
    setProductSubmitting(false);
    onClose();
  };

  const content = (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/40 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-label="Add shopping list item"
        data-testid="shopping-add-item-sheet"
        className="w-full max-w-lg bg-white rounded-t-3xl shadow-2xl flex flex-col max-h-[85vh] animate-in slide-in-from-bottom duration-300"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
          <p className="font-black text-rhozly-on-surface">Add Item</p>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-xl text-rhozly-on-surface/30 hover:text-rhozly-on-surface">
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
              {shedOfferPlant ? (
                <div className="text-center py-4 space-y-4" data-testid="shopping-shed-offer">
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
              ) : (
                <>
                  <PlantSearch
                    homeId={homeId}
                    autoFocus
                    showFilters
                    allowPreview
                    placeholder="Search plants to add…"
                    gates={{
                      // Verdantly is free; Perenual self-gates inside searchAllProviders.
                      canSearchExternal: true,
                      canCreateWithAI: aiEnabled,
                    }}
                    allowManual
                    onSelect={handlePlantSelected}
                    onViewDetails={(sel) => setDetailResult(selectionToProviderResult(sel))}
                  />
                  {submitting && (
                    <div className="flex items-center gap-2 justify-center py-2 text-xs font-bold text-rhozly-on-surface/50">
                      <Loader2 size={14} className="animate-spin" /> Adding…
                    </div>
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
                  ref={productInputRef}
                  data-testid="shopping-product-name-input"
                  type="text"
                  placeholder="e.g. Tomato feed, copper tape, trowel…"
                  value={productName}
                  onChange={e => setProductName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleAddProduct(); }}
                  className="w-full bg-rhozly-bg border border-rhozly-outline/20 rounded-2xl px-4 py-2.5 text-sm font-bold text-rhozly-on-surface outline-none focus:border-rhozly-primary"
                />
              </div>

              <div className="grid grid-cols-[1fr_auto] gap-3">
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
                <div className="w-24">
                  <p className="text-[10px] font-black text-rhozly-on-surface/40 uppercase tracking-widest mb-1.5">Qty</p>
                  <input
                    data-testid="shopping-product-quantity-input"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    placeholder="—"
                    value={productQuantity}
                    onChange={e => setProductQuantity(e.target.value)}
                    className="w-full bg-rhozly-bg border border-rhozly-outline/20 rounded-2xl px-3 py-2.5 text-sm font-bold text-rhozly-on-surface outline-none focus:border-rhozly-primary text-center"
                  />
                </div>
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

      {detailResult && (
        <PlantDetailModal
          result={detailResult}
          homeId={homeId}
          aiEnabled={aiEnabled}
          isPremium={perenualEnabled}
          onClose={() => setDetailResult(null)}
        />
      )}
    </div>
  );

  return createPortal(content, document.body);
}
