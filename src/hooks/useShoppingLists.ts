import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useHomeRealtime } from "./useHomeRealtime";
import { Logger } from "../lib/errorHandler";
import type { ShoppingList, ShoppingListItem } from "../types/shopping";

interface UseShoppingListsReturn {
  lists: ShoppingList[];
  items: Record<string, ShoppingListItem[]>; // keyed by list_id
  isLoading: boolean;
  createList: (name: string) => Promise<ShoppingList | null>;
  renameList: (id: string, name: string) => Promise<void>;
  deleteList: (id: string) => Promise<void>;
  markComplete: (id: string) => Promise<void>;
  reopenList: (id: string) => Promise<void>;
  fetchItems: (listId: string) => Promise<void>;
  addItem: (item: Omit<ShoppingListItem, "id" | "created_at">) => Promise<void>;
  toggleItem: (id: string, checked: boolean) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
}

export function useShoppingLists(homeId: string): UseShoppingListsReturn {
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [items, setItems] = useState<Record<string, ShoppingListItem[]>>({});
  const [isLoading, setIsLoading] = useState(true);

  const fetchLists = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("shopping_lists")
        .select("*")
        .eq("home_id", homeId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setLists(data ?? []);
    } catch (err) {
      Logger.error("Failed to fetch shopping lists", err);
    } finally {
      setIsLoading(false);
    }
  }, [homeId]);

  useEffect(() => {
    fetchLists();
  }, [fetchLists]);

  useHomeRealtime("shopping_lists", fetchLists);

  const fetchItems = useCallback(async (listId: string) => {
    try {
      const { data, error } = await supabase
        .from("shopping_list_items")
        .select("*")
        .eq("list_id", listId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      setItems(prev => ({ ...prev, [listId]: data ?? [] }));
    } catch (err) {
      Logger.error("Failed to fetch shopping list items", err);
    }
  }, []);

  useHomeRealtime("shopping_list_items", useCallback(() => {
    // Re-fetch items for any list we've already loaded
    setItems(prev => {
      Object.keys(prev).forEach(listId => fetchItems(listId));
      return prev;
    });
  }, [fetchItems]));

  const createList = useCallback(async (name: string): Promise<ShoppingList | null> => {
    try {
      const { data, error } = await supabase
        .from("shopping_lists")
        .insert({ home_id: homeId, name: name.trim() || "My List" })
        .select()
        .single();
      if (error) throw error;
      setLists(prev => [data, ...prev]);
      return data;
    } catch (err) {
      Logger.error("Failed to create shopping list", err);
      return null;
    }
  }, [homeId]);

  const renameList = useCallback(async (id: string, name: string) => {
    try {
      const { error } = await supabase
        .from("shopping_lists")
        .update({ name: name.trim() || "My List", updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      setLists(prev => prev.map(l => l.id === id ? { ...l, name: name.trim() || "My List" } : l));
    } catch (err) {
      Logger.error("Failed to rename shopping list", err);
    }
  }, []);

  const deleteList = useCallback(async (id: string) => {
    try {
      const { error } = await supabase.from("shopping_lists").delete().eq("id", id);
      if (error) throw error;
      setLists(prev => prev.filter(l => l.id !== id));
      setItems(prev => { const next = { ...prev }; delete next[id]; return next; });
    } catch (err) {
      Logger.error("Failed to delete shopping list", err);
    }
  }, []);

  const markComplete = useCallback(async (id: string) => {
    try {
      const { error } = await supabase
        .from("shopping_lists")
        .update({ status: "completed", updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      setLists(prev => prev.map(l => l.id === id ? { ...l, status: "completed" } : l));
    } catch (err) {
      Logger.error("Failed to mark list complete", err);
    }
  }, []);

  const reopenList = useCallback(async (id: string) => {
    try {
      const { error } = await supabase
        .from("shopping_lists")
        .update({ status: "active", updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      setLists(prev => prev.map(l => l.id === id ? { ...l, status: "active" } : l));
    } catch (err) {
      Logger.error("Failed to reopen list", err);
    }
  }, []);

  const addItem = useCallback(async (item: Omit<ShoppingListItem, "id" | "created_at">) => {
    try {
      const { data, error } = await supabase
        .from("shopping_list_items")
        .insert(item)
        .select()
        .single();
      if (error) throw error;
      setItems(prev => ({
        ...prev,
        [item.list_id]: [...(prev[item.list_id] ?? []), data],
      }));
    } catch (err) {
      Logger.error("Failed to add shopping list item", err);
    }
  }, []);

  const toggleItem = useCallback(async (id: string, checked: boolean) => {
    try {
      const { error } = await supabase
        .from("shopping_list_items")
        .update({ is_checked: checked })
        .eq("id", id);
      if (error) throw error;
      setItems(prev => {
        const next = { ...prev };
        for (const listId of Object.keys(next)) {
          next[listId] = next[listId].map(i => i.id === id ? { ...i, is_checked: checked } : i);
        }
        return next;
      });
    } catch (err) {
      Logger.error("Failed to toggle shopping list item", err);
    }
  }, []);

  const deleteItem = useCallback(async (id: string) => {
    try {
      const { error } = await supabase.from("shopping_list_items").delete().eq("id", id);
      if (error) throw error;
      setItems(prev => {
        const next = { ...prev };
        for (const listId of Object.keys(next)) {
          next[listId] = next[listId].filter(i => i.id !== id);
        }
        return next;
      });
    } catch (err) {
      Logger.error("Failed to delete shopping list item", err);
    }
  }, []);

  return {
    lists, items, isLoading,
    createList, renameList, deleteList, markComplete, reopenList,
    fetchItems, addItem, toggleItem, deleteItem,
  };
}
