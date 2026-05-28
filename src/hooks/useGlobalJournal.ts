import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { Logger } from "../lib/errorHandler";
import type { JournalEntry, JournalTargetType } from "../types";

/**
 * Data hook for the global journal page (`/journal`).
 *
 * Reads from `plant_journals` (the same table the per-instance Plant
 * Journal Tab uses), unfiltered by target — meaning every entry in the
 * home appears here: ones tied to a plant instance, a location, an
 * area, a plan, or "unassigned" general garden notes.
 *
 * Filter is applied client-side so chip-toggling is instant. Pagination
 * is intentionally not added in v1 — `PAGE_LIMIT = 200` is generous and
 * paginating the global feed is a v2 problem if it ever materialises.
 */

const PAGE_LIMIT = 200;

export type JournalFilter = "all" | "unassigned" | JournalTargetType;

export interface UseGlobalJournalResult {
  entries: JournalEntry[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  create: (payload: NewJournalEntry) => Promise<JournalEntry | null>;
  update: (entryId: string, patch: Partial<NewJournalEntry>) => Promise<void>;
  remove: (entryId: string) => Promise<void>;
}

export interface NewJournalEntry {
  subject: string;
  description?: string | null;
  image_url?: string | null;
  /**
   * The polymorphic target. Exactly one of `inventory_item_id`,
   * `location_id`, `area_id`, `plan_id` may be set; passing none stores
   * the entry as a general garden note. Enforced by a DB CHECK.
   */
  inventory_item_id?: string | null;
  location_id?: string | null;
  area_id?: string | null;
  plan_id?: string | null;
  /** Set when the entry was auto-created on task completion. */
  task_id?: string | null;
}

export function useGlobalJournal(homeId: string | null): UseGlobalJournalResult {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
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
        .select(
          "id, home_id, subject, description, image_url, created_at, inventory_item_id, location_id, area_id, plan_id, task_id",
        )
        .eq("home_id", homeId)
        .order("created_at", { ascending: false })
        .limit(PAGE_LIMIT);
      if (queryErr) throw queryErr;
      setEntries((data ?? []) as JournalEntry[]);
    } catch (err: any) {
      Logger.error("useGlobalJournal: refresh failed", err, { homeId });
      setError(err?.message ?? "Couldn't load the journal.");
    } finally {
      setLoading(false);
    }
  }, [homeId]);

  useEffect(() => {
    setLoading(true);
    refresh();
  }, [refresh]);

  const create = useCallback(
    async (payload: NewJournalEntry): Promise<JournalEntry | null> => {
      if (!homeId) return null;
      const row = {
        home_id: homeId,
        subject: payload.subject,
        description: payload.description ?? null,
        image_url: payload.image_url ?? null,
        inventory_item_id: payload.inventory_item_id ?? null,
        location_id: payload.location_id ?? null,
        area_id: payload.area_id ?? null,
        plan_id: payload.plan_id ?? null,
        task_id: payload.task_id ?? null,
      };
      const { data, error: insertErr } = await supabase
        .from("plant_journals")
        .insert(row)
        .select(
          "id, home_id, subject, description, image_url, created_at, inventory_item_id, location_id, area_id, plan_id, task_id",
        )
        .single();
      if (insertErr) {
        Logger.error("useGlobalJournal: create failed", insertErr, { homeId });
        throw insertErr;
      }
      const created = data as JournalEntry;
      setEntries((prev) => [created, ...prev]);
      return created;
    },
    [homeId],
  );

  const update = useCallback(
    async (entryId: string, patch: Partial<NewJournalEntry>) => {
      const { error: updateErr } = await supabase
        .from("plant_journals")
        .update(patch)
        .eq("id", entryId);
      if (updateErr) {
        Logger.error("useGlobalJournal: update failed", updateErr, { entryId });
        throw updateErr;
      }
      setEntries((prev) =>
        prev.map((e) => (e.id === entryId ? { ...e, ...patch } as JournalEntry : e)),
      );
    },
    [],
  );

  const remove = useCallback(async (entryId: string) => {
    const { error: deleteErr } = await supabase
      .from("plant_journals")
      .delete()
      .eq("id", entryId);
    if (deleteErr) {
      Logger.error("useGlobalJournal: remove failed", deleteErr, { entryId });
      throw deleteErr;
    }
    setEntries((prev) => prev.filter((e) => e.id !== entryId));
  }, []);

  return { entries, loading, error, refresh, create, update, remove };
}

/**
 * Pure helper — returns the target type of an entry. Used by the global
 * journal page to label cards and by filter chips.
 */
export function getEntryTargetType(entry: JournalEntry): JournalTargetType {
  if (entry.inventory_item_id) return "plant";
  if (entry.location_id) return "location";
  if (entry.area_id) return "area";
  if (entry.plan_id) return "plan";
  return "none";
}
