import React, { useState } from "react";
import { createPortal } from "react-dom";
import { X, ShoppingCart, Plus, Loader2 } from "lucide-react";
import type { ShoppingList, ShoppingListItem } from "../../types/shopping";

export interface SuggestedItem {
  name: string;
  item_type: "plant" | "product";
  category?: string;
}

interface Props {
  homeId: string;
  suggestedItems: SuggestedItem[];
  activeLists: ShoppingList[];
  onClose: () => void;
  onConfirm: (listId: string, items: SuggestedItem[]) => Promise<void>;
  onCreateAndConfirm: (listName: string, items: SuggestedItem[]) => Promise<void>;
}

export default function AddToListSheet({
  homeId, suggestedItems, activeLists,
  onClose, onConfirm, onCreateAndConfirm,
}: Props) {
  const [selectedItems, setSelectedItems] = useState<Set<number>>(
    new Set(suggestedItems.map((_, i) => i))
  );
  const [selectedListId, setSelectedListId] = useState<string | "new">(
    activeLists[0]?.id ?? "new"
  );
  const [newListName, setNewListName] = useState("Shopping List");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const toggleItem = (i: number) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  const handleConfirm = async () => {
    const items = suggestedItems.filter((_, i) => selectedItems.has(i));
    if (!items.length) { onClose(); return; }
    setIsSubmitting(true);
    if (selectedListId === "new") {
      await onCreateAndConfirm(newListName || "Shopping List", items);
    } else {
      await onConfirm(selectedListId, items);
    }
    setIsSubmitting(false);
    onClose();
  };

  const content = (
    <div
      className="fixed inset-0 z-[130] flex items-end justify-center bg-black/40 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        data-testid="shopping-add-to-list-sheet"
        className="w-full max-w-lg bg-white rounded-t-3xl shadow-2xl flex flex-col max-h-[80vh] animate-in slide-in-from-bottom duration-300"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
          <div className="flex items-center gap-2">
            <ShoppingCart size={18} className="text-rhozly-primary" />
            <p className="font-black text-rhozly-on-surface">Add to Shopping List</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl text-rhozly-on-surface/30 hover:text-rhozly-on-surface">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-6 space-y-4">
          {/* Items to add */}
          <div>
            <p className="text-[10px] font-black text-rhozly-on-surface/40 uppercase tracking-widest mb-2">Items</p>
            <div className="space-y-1">
              {suggestedItems.map((item, i) => (
                <label
                  key={i}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-2xl hover:bg-rhozly-surface cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selectedItems.has(i)}
                    onChange={() => toggleItem(i)}
                    className="w-4 h-4 rounded accent-rhozly-primary"
                  />
                  <span className="flex-1 text-xs font-bold text-rhozly-on-surface">{item.name}</span>
                  {item.category && (
                    <span className="text-[9px] font-black uppercase tracking-widest text-rhozly-on-surface/40 bg-rhozly-surface px-1.5 py-0.5 rounded-full">
                      {item.category}
                    </span>
                  )}
                  {item.item_type === "plant" && (
                    <span className="text-[9px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">
                      Plant
                    </span>
                  )}
                </label>
              ))}
            </div>
          </div>

          {/* List picker */}
          <div>
            <p className="text-[10px] font-black text-rhozly-on-surface/40 uppercase tracking-widest mb-2">Which list?</p>
            <div className="space-y-1">
              {activeLists.map(list => (
                <button
                  key={list.id}
                  data-testid={`shopping-list-pick-${list.id}`}
                  onClick={() => setSelectedListId(list.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-2xl text-xs font-bold transition-colors ${selectedListId === list.id ? "bg-rhozly-primary/10 text-rhozly-primary border border-rhozly-primary/20" : "hover:bg-rhozly-surface text-rhozly-on-surface"}`}
                >
                  {list.name}
                </button>
              ))}
              <button
                data-testid="shopping-list-pick-new"
                onClick={() => setSelectedListId("new")}
                className={`w-full flex items-center gap-2 text-left px-3 py-2.5 rounded-2xl text-xs font-bold transition-colors ${selectedListId === "new" ? "bg-rhozly-primary/10 text-rhozly-primary border border-rhozly-primary/20" : "hover:bg-rhozly-surface text-rhozly-on-surface/60"}`}
              >
                <Plus size={13} /> Create new list
              </button>
            </div>

            {selectedListId === "new" && (
              <input
                type="text"
                value={newListName}
                onChange={e => setNewListName(e.target.value)}
                placeholder="New list name…"
                className="mt-2 w-full bg-rhozly-bg border border-rhozly-outline/20 rounded-2xl px-4 py-2.5 text-sm font-bold text-rhozly-on-surface outline-none focus:border-rhozly-primary"
              />
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 pt-3 border-t border-rhozly-outline/10 shrink-0 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-2xl border border-rhozly-outline/20 text-xs font-black text-rhozly-on-surface/60"
          >
            Cancel
          </button>
          <button
            data-testid="shopping-add-to-list-confirm"
            onClick={handleConfirm}
            disabled={selectedItems.size === 0 || isSubmitting}
            className="flex-1 py-3 rounded-2xl bg-rhozly-primary text-white text-xs font-black hover:bg-rhozly-primary/90 transition-colors disabled:opacity-40"
          >
            {isSubmitting ? <Loader2 size={14} className="animate-spin mx-auto" /> : `Add ${selectedItems.size} item${selectedItems.size !== 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
