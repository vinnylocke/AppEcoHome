import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ShoppingCart, Plus, ChevronDown, ChevronRight, Loader2, AlertCircle, X, Wrench, Leaf, FileText, Sparkles } from "lucide-react";
import toast from "react-hot-toast";
import { logEvent, EVENT } from "../events/registry";
import { usePermissions } from "../context/HomePermissionsContext";
import { useBetaFeedbackContext } from "../context/BetaFeedbackContext";
import { useShoppingLists } from "../hooks/useShoppingLists";
import ShoppingListCard from "./shopping/ShoppingListCard";
import AddItemSheet from "./shopping/AddItemSheet";
import { supabase } from "../lib/supabase";
import type { ShoppingListItem } from "../types/shopping";

const TEMPLATES: {
  id: string;
  label: string;
  description: string;
  name: string;
  icon: React.ReactNode;
  items: { name: string; item_type: "plant" | "product" }[];
}[] = [
  {
    id: "blank",
    label: "Blank List",
    description: "Start from scratch with an empty list",
    name: "My List",
    icon: <FileText size={18} />,
    items: [],
  },
  {
    id: "starter",
    label: "Starter Toolkit",
    description: "Essential tools and supplies for new gardeners",
    name: "Starter Toolkit",
    icon: <Wrench size={18} />,
    items: [
      { name: "Hand trowel", item_type: "product" },
      { name: "Watering can", item_type: "product" },
      { name: "Gardening gloves", item_type: "product" },
      { name: "Pruning shears", item_type: "product" },
      { name: "General-purpose fertiliser", item_type: "product" },
      { name: "Potting compost", item_type: "product" },
    ],
  },
  {
    id: "veg",
    label: "Seasonal Veg Patch",
    description: "Popular vegetables to get your patch going",
    name: "Seasonal Veg Patch",
    icon: <Leaf size={18} />,
    items: [
      { name: "Tomato", item_type: "plant" },
      { name: "Courgette", item_type: "plant" },
      { name: "Lettuce", item_type: "plant" },
      { name: "Basil", item_type: "plant" },
      { name: "Runner beans", item_type: "plant" },
      { name: "Cucumber", item_type: "plant" },
    ],
  },
];

interface Props {
  homeId: string;
  aiEnabled: boolean;
  perenualEnabled: boolean;
}

export default function ShoppingLists({ homeId, aiEnabled, perenualEnabled }: Props) {
  const { can } = usePermissions();
  const navigate = useNavigate();
  const { requestFeedback } = useBetaFeedbackContext();
  const {
    lists, items, isLoading, fetchError, refetch,
    createList, renameList, deleteList, markComplete, reopenList,
    fetchItems, addItem, toggleItem, deleteItem,
  } = useShoppingLists(homeId);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addItemListId, setAddItemListId] = useState<string | null>(null);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [isCreatingFromTemplate, setIsCreatingFromTemplate] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [activePlanCount, setActivePlanCount] = useState(0);
  const [planSuggestDismissed, setPlanSuggestDismissed] = useState(
    () => typeof window !== "undefined" && localStorage.getItem("rhozly_shopping_plan_suggest_dismissed") === "true",
  );

  // Fetch the user's active plan count so we can surface a "pull from plans" hint
  useEffect(() => {
    if (!homeId) return;
    let cancelled = false;
    supabase
      .from("plans")
      .select("id", { count: "exact", head: true })
      .eq("home_id", homeId)
      .in("status", ["Draft", "In Progress"])
      .then(({ count }) => {
        if (!cancelled) setActivePlanCount(count ?? 0);
      });
    return () => { cancelled = true; };
  }, [homeId]);

  const activeLists = lists.filter(l => l.status === "active");
  const completedLists = lists.filter(l => l.status === "completed");

  const handleToggleItem = async (itemId: string, checked: boolean) => {
    await toggleItem(itemId, checked);
    if (checked) requestFeedback("shopping_item_check");
  };

  const handleToggleExpand = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
      if (!items[id]) fetchItems(id);
    }
  };

  const handleNewList = () => {
    setShowTemplateModal(true);
  };

  const handleTemplateCreate = async (template: typeof TEMPLATES[number]) => {
    setIsCreatingFromTemplate(true);
    const list = await createList(template.name);
    if (list) {
      logEvent(EVENT.SHOPPING_LIST_CREATED, { list_id: list.id });
      if (template.items.length > 0) {
        await Promise.all(
          template.items.map(item =>
            addItem({ list_id: list.id, home_id: homeId, item_type: item.item_type, name: item.name, is_checked: false }),
          ),
        );
        await fetchItems(list.id);
      }
      setExpandedId(list.id);
      setShowTemplateModal(false);
      toast.success("List created");
    }
    setIsCreatingFromTemplate(false);
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
    logEvent(EVENT.SHOPPING_ITEM_ADDED, { list_id: item.list_id, item_type: item.item_type });
    toast.success("Item added");
  };

  const handleOpenAddItem = (listId: string) => {
    setAddItemListId(listId);
  };

  const handleAddCheckedToShed = async (listId: string, checkedPlants: ShoppingListItem[]) => {
    try {
      await Promise.all(
        checkedPlants.map(p =>
          supabase.from("inventory_items").insert({ home_id: homeId, plant_name: p.name, status: "In Shed" }),
        ),
      );
      const ids = checkedPlants.map(p => p.id);
      await supabase.from("shopping_list_items").update({ already_in_shed: true }).in("id", ids);
      await fetchItems(listId);
      toast.success(`Added ${checkedPlants.length} plant${checkedPlants.length !== 1 ? "s" : ""} to your Shed — find them under Garden > The Shed`);
    } catch {
      toast.error("Could not add plants to shed");
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-rhozly-bg">
      <div className="px-4 py-6 space-y-4">

        {/* Page heading */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rhozly-primary/10 flex items-center justify-center">
              <ShoppingCart size={20} className="text-rhozly-primary" />
            </div>
            <div>
              <h1 className="font-black text-rhozly-on-surface text-2xl leading-tight">Shopping Lists</h1>
              <p className="text-xs font-bold text-rhozly-on-surface/40">
                Track what you need to buy — plants, tools, and supplies
              </p>
            </div>
          </div>
          {can("shopping.create_list") && (
            <button
              data-testid="shopping-new-list-btn"
              onClick={handleNewList}
              className="flex items-center gap-1.5 bg-rhozly-primary text-white text-xs font-black px-4 py-2.5 rounded-2xl hover:bg-rhozly-primary/90 active:scale-95 transition-all"
            >
              <Plus size={13} />
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

        {/* Pull-from-plans suggestion banner */}
        {!isLoading && !fetchError && activePlanCount > 0 && !planSuggestDismissed && (
          <div
            data-testid="shopping-plan-suggest-banner"
            className="bg-gradient-to-br from-violet-50 to-violet-100/80 border border-violet-200 rounded-2xl px-4 py-3 flex items-start gap-3 mb-4"
          >
            <div className="bg-violet-200/60 p-2 rounded-xl shrink-0">
              <Sparkles size={14} className="text-violet-700" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-black text-violet-900 leading-tight">
                {activePlanCount} active plan{activePlanCount !== 1 ? "s" : ""} — pull plant + supply items in?
              </p>
              <p className="text-[11px] font-bold text-violet-700/80 mt-0.5 leading-snug">
                Browse your plans for plants to add to a shopping list. Auto-add coming soon.
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                data-testid="shopping-plan-suggest-open"
                onClick={() => navigate("/planner")}
                className="text-[11px] font-black px-3 py-2 min-h-[36px] rounded-xl bg-violet-600 text-white hover:bg-violet-700 transition-colors"
              >
                View plans
              </button>
              <button
                data-testid="shopping-plan-suggest-dismiss"
                onClick={() => {
                  setPlanSuggestDismissed(true);
                  try { localStorage.setItem("rhozly_shopping_plan_suggest_dismissed", "true"); } catch { /* ignore */ }
                }}
                aria-label="Dismiss suggestion"
                className="p-1.5 text-violet-700/50 hover:text-violet-900 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
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
              <p className="text-xs font-bold text-rhozly-on-surface/30 mt-1">Tap "New List" to get started — choose a template or start from scratch</p>
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
                onToggleItem={handleToggleItem}
                onDeleteItem={deleteItem}
                onAddCheckedToShed={plants => handleAddCheckedToShed(list.id, plants)}
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
                    onToggleItem={handleToggleItem}
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

      {/* Template picker modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm px-4 pb-4 sm:pb-0">
          <div className="bg-white rounded-3xl w-full max-w-sm shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <div>
                <h2 className="font-black text-rhozly-on-surface text-base">New List</h2>
                <p className="text-xs font-bold text-rhozly-on-surface/40 mt-0.5">Choose a quick-start template or start blank</p>
              </div>
              <button
                data-testid="template-modal-close"
                onClick={() => setShowTemplateModal(false)}
                disabled={isCreatingFromTemplate}
                className="p-2 rounded-xl text-rhozly-on-surface/40 hover:text-rhozly-on-surface hover:bg-rhozly-surface transition-colors disabled:opacity-40"
              >
                <X size={18} />
              </button>
            </div>
            <div className="px-4 pb-5 space-y-2">
              {TEMPLATES.map(template => (
                <button
                  key={template.id}
                  data-testid={`template-option-${template.id}`}
                  onClick={() => handleTemplateCreate(template)}
                  disabled={isCreatingFromTemplate}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border border-rhozly-outline/20 bg-rhozly-surface hover:border-rhozly-primary/30 hover:bg-rhozly-primary/5 transition-colors text-left disabled:opacity-50"
                >
                  <span className="text-rhozly-primary shrink-0">{template.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-rhozly-on-surface">{template.label}</p>
                    <p className="text-[11px] font-bold text-rhozly-on-surface/40 mt-0.5">{template.description}</p>
                    {template.items.length > 0 && (
                      <p className="text-[10px] font-semibold text-rhozly-on-surface/30 mt-0.5">
                        {template.items.length} items pre-added
                      </p>
                    )}
                  </div>
                  {isCreatingFromTemplate && (
                    <Loader2 size={14} className="animate-spin text-rhozly-primary shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
