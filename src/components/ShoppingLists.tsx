import React, { useState } from "react";
import { ShoppingCart, Plus, ChevronDown, ChevronRight, Loader2, AlertCircle } from "lucide-react";
import toast from "react-hot-toast";
import { usePermissions } from "../context/HomePermissionsContext";
import { useShoppingLists } from "../hooks/useShoppingLists";
import ShoppingListCard from "./shopping/ShoppingListCard";
import AddItemSheet from "./shopping/AddItemSheet";

interface Props {
  homeId: string;
  aiEnabled: boolean;
  perenualEnabled: boolean;
}

export default function ShoppingLists({ homeId, aiEnabled, perenualEnabled }: Props) {
  const { can } = usePermissions();
  const {
    lists, items, isLoading, fetchError, refetch,
    createList, renameList, deleteList, markComplete, reopenList,
    fetchItems, addItem, toggleItem, deleteItem,
  } = useShoppingLists(homeId);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addItemListId, setAddItemListId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);

  const activeLists = lists.filter(l => l.status === "active");
  const completedLists = lists.filter(l => l.status === "completed");

  const handleToggleExpand = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
      if (!items[id]) fetchItems(id);
    }
  };

  const handleNewList = async () => {
    setIsCreating(true);
    const list = await createList("My List");
    setIsCreating(false);
    if (list) {
      setExpandedId(list.id);
      toast.success("List created");
    }
  };

  const handleDeleteList = async (id: string) => {
    await deleteList(id);
    toast.success("List deleted");
  };

  const handleMarkComplete = async (id: string) => {
    await markComplete(id);
    toast.success("List completed!");
  };

  const handleAddItem = async (item: Parameters<typeof addItem>[0]) => {
    await addItem(item);
    toast.success("Item added");
  };

  const handleOpenAddItem = (listId: string) => {
    setAddItemListId(listId);
  };

  return (
    <div className="h-full overflow-y-auto bg-rhozly-bg">
      <div className="max-w-5xl 2xl:max-w-7xl mx-auto px-4 py-6 space-y-4">

        {/* Page heading */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rhozly-primary/10 flex items-center justify-center">
              <ShoppingCart size={20} className="text-rhozly-primary" />
            </div>
            <div>
              <h1 className="font-black text-rhozly-on-surface text-2xl leading-tight">Shopping Lists</h1>
              <p className="text-xs font-bold text-rhozly-on-surface/40">
                {activeLists.length} active {activeLists.length === 1 ? "list" : "lists"}
              </p>
            </div>
          </div>
          {can("shopping.create_list") && (
            <button
              data-testid="shopping-new-list-btn"
              onClick={handleNewList}
              disabled={isCreating}
              className="flex items-center gap-1.5 bg-rhozly-primary text-white text-xs font-black px-4 py-2.5 rounded-2xl hover:bg-rhozly-primary/90 active:scale-95 transition-all disabled:opacity-60"
            >
              {isCreating ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              New List
            </button>
          )}
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="space-y-3 animate-pulse">
            {[1, 2].map((i) => (
              <div key={i} className="bg-white rounded-2xl border border-rhozly-outline/10 p-4 h-20" />
            ))}
          </div>
        )}

        {/* Fetch error */}
        {!isLoading && fetchError && (
          <div className="py-12 text-center bg-rhozly-surface-lowest rounded-3xl border border-rhozly-outline/20 flex flex-col items-center gap-3">
            <AlertCircle size={32} className="text-red-400" />
            <p className="font-black text-rhozly-on-surface/40">Could not load your lists.</p>
            <button
              onClick={refetch}
              className="px-5 py-2.5 bg-rhozly-primary text-white rounded-2xl text-sm font-black hover:scale-[1.02] transition-transform"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !fetchError && lists.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
            <div className="w-16 h-16 rounded-3xl bg-rhozly-surface flex items-center justify-center">
              <ShoppingCart size={28} className="text-rhozly-on-surface/20" />
            </div>
            <div>
              <p className="font-black text-rhozly-on-surface/50">No shopping lists yet</p>
              <p className="text-xs font-bold text-rhozly-on-surface/30 mt-1">Tap "New List" to create your first one</p>
            </div>
          </div>
        )}

        {/* Active lists */}
        {!isLoading && activeLists.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {activeLists.map(list => (
              <ShoppingListCard
                key={list.id}
                list={list}
                items={items[list.id]}
                isExpanded={expandedId === list.id}
                onToggleExpand={() => handleToggleExpand(list.id)}
                onRename={name => renameList(list.id, name)}
                onDelete={() => handleDeleteList(list.id)}
                onMarkComplete={() => handleMarkComplete(list.id)}
                onReopen={() => reopenList(list.id)}
                onAddItem={() => handleOpenAddItem(list.id)}
                onToggleItem={toggleItem}
                onDeleteItem={deleteItem}
              />
            ))}
          </div>
        )}

        {/* Completed lists */}
        {!isLoading && completedLists.length > 0 && (
          <div className="pt-2" role="region" aria-label="Completed shopping lists">
            <button
              data-testid="shopping-completed-section-toggle"
              onClick={() => setShowCompleted(v => !v)}
              aria-expanded={showCompleted}
              className="flex items-center gap-2 min-h-[44px] px-1 text-xs font-black text-rhozly-on-surface/40 uppercase tracking-widest mb-3 hover:text-rhozly-on-surface/60 transition-colors"
            >
              {showCompleted ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              Completed ({completedLists.length})
            </button>

            {showCompleted && (
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                {completedLists.map(list => (
                  <ShoppingListCard
                    key={list.id}
                    list={list}
                    items={items[list.id]}
                    isExpanded={expandedId === list.id}
                    onToggleExpand={() => handleToggleExpand(list.id)}
                    onRename={name => renameList(list.id, name)}
                    onDelete={() => handleDeleteList(list.id)}
                    onMarkComplete={() => handleMarkComplete(list.id)}
                    onReopen={() => reopenList(list.id)}
                    onAddItem={() => handleOpenAddItem(list.id)}
                    onToggleItem={toggleItem}
                    onDeleteItem={deleteItem}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add item sheet */}
      {addItemListId && (
        <AddItemSheet
          homeId={homeId}
          listId={addItemListId}
          aiEnabled={aiEnabled}
          perenualEnabled={perenualEnabled}
          onClose={() => setAddItemListId(null)}
          onItemAdded={handleAddItem}
        />
      )}
    </div>
  );
}
