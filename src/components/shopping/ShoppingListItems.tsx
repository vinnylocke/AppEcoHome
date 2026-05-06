import React from "react";
import { Trash2, Leaf } from "lucide-react";
import type { ShoppingListItem } from "../../types/shopping";

interface Props {
  items: ShoppingListItem[];
  onToggle: (id: string, checked: boolean) => void;
  onDelete: (id: string) => void;
}

export default function ShoppingListItems({ items, onToggle, onDelete }: Props) {
  const sorted = [
    ...items.filter(i => !i.is_checked),
    ...items.filter(i => i.is_checked),
  ];

  if (sorted.length === 0) {
    return (
      <p className="text-xs font-bold text-rhozly-on-surface/30 text-center py-4">
        No items yet — tap "+ Add Item" to get started
      </p>
    );
  }

  return (
    <ul className="space-y-1">
      {sorted.map(item => (
        <li
          key={item.id}
          data-testid={`shopping-item-${item.id}`}
          className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-rhozly-surface/60 group transition-colors"
        >
          <input
            data-testid={`shopping-item-checkbox-${item.id}`}
            type="checkbox"
            checked={item.is_checked}
            onChange={e => onToggle(item.id, e.target.checked)}
            className="w-4 h-4 rounded accent-rhozly-primary shrink-0 cursor-pointer"
          />

          {/* Thumbnail / icon */}
          {item.item_type === "plant" && item.thumbnail_url ? (
            <img
              src={item.thumbnail_url}
              alt=""
              className="w-7 h-7 rounded-lg object-cover shrink-0"
            />
          ) : item.item_type === "plant" ? (
            <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
              <Leaf size={13} className="text-emerald-500" />
            </div>
          ) : (
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-rhozly-surface text-[10px] font-black text-rhozly-on-surface/40"
              title={item.category ?? ""}
            >
              {(item.category ?? "?")[0]}
            </div>
          )}

          {/* Name + badges */}
          <div className="flex-1 min-w-0">
            <span
              className={`text-xs font-bold text-rhozly-on-surface leading-tight block truncate transition-all ${item.is_checked ? "line-through text-rhozly-on-surface/30" : ""}`}
            >
              {item.name}
            </span>
            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
              {item.item_type === "product" && item.category && (
                <span className="text-[9px] font-black uppercase tracking-widest text-rhozly-on-surface/40 bg-rhozly-surface px-1.5 py-0.5 rounded-full">
                  {item.category}
                </span>
              )}
              {item.item_type === "plant" && item.already_in_shed && (
                <span className="text-[9px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">
                  In Shed
                </span>
              )}
              {item.item_type === "plant" && item.source === "ai" && (
                <span className="text-[9px] font-black uppercase tracking-widest text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded-full">
                  AI
                </span>
              )}
            </div>
          </div>

          {/* Delete */}
          <button
            data-testid={`shopping-item-delete-${item.id}`}
            onClick={() => onDelete(item.id)}
            className="p-1 rounded-lg text-rhozly-on-surface/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all shrink-0"
            title="Remove item"
          >
            <Trash2 size={13} />
          </button>
        </li>
      ))}
    </ul>
  );
}
