import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, ChevronRight, MoreHorizontal, Check, RotateCcw, Pencil, Trash2, Plus } from "lucide-react";
import type { ShoppingList, ShoppingListItem } from "../../types/shopping";
import ShoppingListItems from "./ShoppingListItems";
import { usePermissions } from "../../context/HomePermissionsContext";

interface Props {
  list: ShoppingList;
  items: ShoppingListItem[] | undefined;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onMarkComplete: () => void;
  onReopen: () => void;
  onAddItem: () => void;
  onToggleItem: (id: string, checked: boolean) => void;
  onDeleteItem: (id: string) => void;
}

export default function ShoppingListCard({
  list, items, isExpanded, onToggleExpand,
  onRename, onDelete, onMarkComplete, onReopen,
  onAddItem, onToggleItem, onDeleteItem,
}: Props) {
  const { can } = usePermissions();
  const [showMenu, setShowMenu] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(list.name);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isCompleted = list.status === "completed";
  const itemCount = items?.length ?? 0;
  const checkedCount = items?.filter(i => i.is_checked).length ?? 0;

  useEffect(() => {
    if (isRenaming) renameRef.current?.focus();
  }, [isRenaming]);

  // Close menu on outside click
  useEffect(() => {
    if (!showMenu) return;
    const handler = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setShowMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showMenu]);

  const handleDeleteClick = () => {
    if (confirmingDelete) {
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
      setConfirmingDelete(false);
      setShowMenu(false);
      onDelete();
    } else {
      setConfirmingDelete(true);
      deleteTimerRef.current = setTimeout(() => setConfirmingDelete(false), 3000);
    }
  };

  const commitRename = () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== list.name) onRename(trimmed);
    setIsRenaming(false);
  };

  return (
    <div
      data-testid={`shopping-list-card-${list.id}`}
      className="bg-white rounded-3xl border border-rhozly-outline/10 shadow-sm overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3.5">
        {/* Expand toggle */}
        <button
          onClick={onToggleExpand}
          className="text-rhozly-on-surface/30 hover:text-rhozly-on-surface transition-colors shrink-0"
        >
          {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </button>

        {/* Name / rename input */}
        <div className="flex-1 min-w-0" onClick={() => !isRenaming && onToggleExpand()}>
          {isRenaming ? (
            <input
              ref={renameRef}
              data-testid="shopping-rename-input"
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setIsRenaming(false); }}
              onBlur={commitRename}
              className="w-full text-sm font-black text-rhozly-on-surface bg-rhozly-bg border border-rhozly-primary rounded-xl px-3 py-1 outline-none"
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <p
              data-testid={`shopping-list-name-${list.id}`}
              className={`text-sm font-black text-rhozly-on-surface truncate cursor-pointer ${isCompleted ? "line-through text-rhozly-on-surface/40" : ""}`}
            >
              {list.name}
            </p>
          )}
        </div>

        {/* Progress badge */}
        {itemCount > 0 && (
          <span className="text-[10px] font-black text-rhozly-on-surface/40 shrink-0 tabular-nums">
            {checkedCount}/{itemCount}
          </span>
        )}

        {/* Kebab menu */}
        <div className="relative shrink-0" ref={menuRef}>
          <button
            onClick={e => { e.stopPropagation(); setShowMenu(v => !v); }}
            className="p-2 min-w-[36px] min-h-[36px] rounded-xl text-rhozly-on-surface/30 hover:text-rhozly-on-surface hover:bg-rhozly-surface transition-colors flex items-center justify-center"
          >
            <MoreHorizontal size={16} />
          </button>

          {showMenu && (
            <div className="absolute right-0 top-8 z-30 bg-white rounded-2xl shadow-lg border border-rhozly-outline/10 py-1 w-44 overflow-hidden">
              {can("shopping.edit_items") && (
                <button
                  onClick={() => { setIsRenaming(true); setRenameValue(list.name); setShowMenu(false); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-rhozly-on-surface hover:bg-rhozly-surface transition-colors"
                >
                  <Pencil size={13} /> Rename
                </button>
              )}
              {can("shopping.edit_items") && (isCompleted ? (
                <button
                  data-testid={`shopping-reopen-${list.id}`}
                  onClick={() => { onReopen(); setShowMenu(false); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-rhozly-on-surface hover:bg-rhozly-surface transition-colors"
                >
                  <RotateCcw size={13} /> Reopen
                </button>
              ) : (
                <button
                  data-testid={`shopping-mark-complete-${list.id}`}
                  onClick={() => { onMarkComplete(); setShowMenu(false); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-rhozly-on-surface hover:bg-rhozly-surface transition-colors"
                >
                  <Check size={13} /> Mark Complete
                </button>
              ))}
              {can("shopping.delete_list") && (
                <>
                  <div className="border-t border-rhozly-outline/10 my-1" />
                  <button
                    data-testid={`shopping-delete-list-${list.id}`}
                    onClick={handleDeleteClick}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 size={13} />
                    {confirmingDelete ? "Tap again to delete" : "Delete"}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {itemCount > 0 && (
        <div className="h-0.5 bg-rhozly-surface mx-4">
          <div
            className="h-full bg-rhozly-primary rounded-full transition-all duration-300"
            style={{ width: `${Math.round((checkedCount / itemCount) * 100)}%` }}
          />
        </div>
      )}

      {/* Expanded body */}
      {isExpanded && (
        <div className="px-3 pt-3 pb-4">
          <ShoppingListItems
            items={items ?? []}
            onToggle={onToggleItem}
            onDelete={onDeleteItem}
          />

          {!isCompleted && can("shopping.add_items") && (
            <button
              data-testid={`shopping-add-item-btn-${list.id}`}
              onClick={onAddItem}
              className="mt-3 w-full flex items-center justify-center gap-1.5 py-2.5 rounded-2xl border border-dashed border-rhozly-primary/30 text-xs font-black text-rhozly-primary hover:bg-rhozly-primary/5 transition-colors"
            >
              <Plus size={13} /> Add Item
            </button>
          )}
        </div>
      )}
    </div>
  );
}
