import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { Logger } from "../lib/errorHandler";

/**
 * Quick Capture journal entry — a `plant_journals` row with no
 * `inventory_item_id` set yet. Created by the Quick Capture screen at
 * `/quick/journal`; assigned to a specific plant later via the
 * AssignToPlantSheet.
 *
 * The existing `plant_journals` RLS policy already gates on home_id
 * membership, so this hook makes no privileged calls.
 */
export interface UnassignedJournalEntry {
  id: string;
  subject: string;
  description: string | null;
  image_url: string | null;
  created_at: string;
}

export interface UseUnassignedJournalsResult {
  entries: UnassignedJournalEntry[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** Assigns the entry to a plant instance and removes it from local state. */
  assign: (entryId: string, inventoryItemId: string) => Promise<void>;
  /** Deletes the entry (only valid before assignment). */
  remove: (entryId: string) => Promise<void>;
}

const PAGE_LIMIT = 100;

export function useUnassignedJournals(homeId: string | null): UseUnassignedJournalsResult {
  const [entries, setEntries] = useState<UnassignedJournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!homeId) {
      setEntries([]);
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const { data, error: queryErr } = await supabase
        .from("plant_journals")
        .select("id, subject, description, image_url, created_at")
        .eq("home_id", homeId)
        .is("inventory_item_id", null)
        .order("created_at", { ascending: false })
        .limit(PAGE_LIMIT);
      if (queryErr) throw queryErr;
      setEntries((data ?? []) as UnassignedJournalEntry[]);
    } catch (err: any) {
      Logger.error("Failed to load unassigned journal entries", err, { homeId });
      setError(err?.message ?? "Couldn't load captures.");
    } finally {
      setLoading(false);
    }
  }, [homeId]);

  useEffect(() => {
    setLoading(true);
    refresh();
  }, [refresh]);

  const assign = useCallback(
    async (entryId: string, inventoryItemId: string) => {
      const { error: updateErr } = await supabase
        .from("plant_journals")
        .update({ inventory_item_id: inventoryItemId })
        .eq("id", entryId);
      if (updateErr) {
        Logger.error("Failed to assign journal entry", updateErr, { entryId, inventoryItemId });
        throw updateErr;
      }
      // Optimistic local removal — the assigned row no longer matches our query.
      setEntries((prev) => prev.filter((e) => e.id !== entryId));
    },
    [],
  );

  const remove = useCallback(async (entryId: string) => {
    const { error: deleteErr } = await supabase
      .from("plant_journals")
      .delete()
      .eq("id", entryId);
    if (deleteErr) {
      Logger.error("Failed to delete journal entry", deleteErr, { entryId });
      throw deleteErr;
    }
    setEntries((prev) => prev.filter((e) => e.id !== entryId));
  }, []);

  return { entries, loading, error, refresh, assign, remove };
}
