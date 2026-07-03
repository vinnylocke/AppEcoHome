// Garden Walk session + visit writes.
//
// The GardenWalk component drives all UI state itself; this service is
// just the thin persistence boundary. Write paths:
//
//   startSession(homeId, userId)      → returns session row { id }
//   findOpenSession(homeId, userId)   → latest un-ended session (resume check)
//   closeSession(sessionId)           → sets ended_at only (stale/fresh-start close)
//   recordVisit(sessionId, itemId, outcome)              → plant-step row
//   recordSectionVisit(sessionId, kind, refId, outcome)  → section-step row (RHO-17)
//   endSession(sessionId, summary)    → updates the session with metrics
//
// All writes go through RLS. The migration's policies only let the
// session owner mutate, so attempts from another user fail loudly.

import { supabase } from "../lib/supabase";
import { Logger } from "../lib/errorHandler";
import type { WalkSectionKind } from "../lib/gardenWalk";

export type WalkVisitOutcome =
  | "all_good"
  | "snapped"
  | "noted"
  | "ailment_flagged"
  | "task_completed"
  | "skipped"
  | "section_done"
  | "section_skipped"
  | "reading_logged";

export interface WalkSessionSummary {
  plantsVisited: number;
  photosTaken: number;
  notesAdded: number;
  tasksCompleted: number;
  ailmentsFlagged: number;
  sectionsVisited: number;
  readingsLogged: number;
}

export const EMPTY_WALK_SUMMARY: WalkSessionSummary = {
  plantsVisited: 0,
  photosTaken: 0,
  notesAdded: 0,
  tasksCompleted: 0,
  ailmentsFlagged: 0,
  sectionsVisited: 0,
  readingsLogged: 0,
};

export interface WalkSession {
  id: string;
  startedAt: string;
}

export const walkService = {
  async startSession(homeId: string, userId: string): Promise<WalkSession> {
    const { data, error } = await supabase
      .from("garden_walk_sessions")
      .insert({ home_id: homeId, user_id: userId })
      .select("id, started_at")
      .single();
    if (error) throw error;
    return { id: data.id, startedAt: data.started_at };
  },

  /**
   * The user's most recent session with no ended_at, if any. The caller
   * decides whether it's resumable (started today) or stale (close it).
   */
  async findOpenSession(
    homeId: string,
    userId: string,
  ): Promise<WalkSession | null> {
    const { data, error } = await supabase
      .from("garden_walk_sessions")
      .select("id, started_at")
      .eq("home_id", homeId)
      .eq("user_id", userId)
      .is("ended_at", null)
      .order("started_at", { ascending: false })
      .limit(1);
    if (error) {
      // Non-fatal — worst case we start a fresh session.
      Logger.error("walkService.findOpenSession failed", error, { homeId });
      return null;
    }
    const row = data?.[0];
    return row ? { id: row.id, startedAt: row.started_at } : null;
  },

  /** Close a session without touching its metrics (stale open session /
   *  "Start fresh" from the resume prompt / superseded bootstrap). */
  async closeSession(sessionId: string): Promise<void> {
    const { error } = await supabase
      .from("garden_walk_sessions")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", sessionId);
    if (error) {
      Logger.error("walkService.closeSession failed", error, { sessionId });
    }
  },

  /** Fire-and-forget. Failures are logged but don't block the walk. */
  recordVisit(
    sessionId: string,
    inventoryItemId: string,
    outcome: WalkVisitOutcome,
  ): void {
    supabase
      .from("garden_walk_visits")
      .insert({ session_id: sessionId, inventory_item_id: inventoryItemId, outcome })
      .then(({ error }) => {
        if (error) {
          Logger.error("walkService.recordVisit failed", error, {
            sessionId,
            inventoryItemId,
            outcome,
          });
        }
      });
  },

  /** Fire-and-forget section-step visit (RHO-17). `sectionRefId` is the
   *  location/area uuid; null for home + unassigned_plants. */
  recordSectionVisit(
    sessionId: string,
    sectionKind: WalkSectionKind,
    sectionRefId: string | null,
    outcome: WalkVisitOutcome,
  ): void {
    supabase
      .from("garden_walk_visits")
      .insert({
        session_id: sessionId,
        inventory_item_id: null,
        section_kind: sectionKind,
        section_ref_id: sectionRefId,
        outcome,
      })
      .then(({ error }) => {
        if (error) {
          Logger.error("walkService.recordSectionVisit failed", error, {
            sessionId,
            sectionKind,
            sectionRefId,
            outcome,
          });
        }
      });
  },

  async endSession(
    sessionId: string,
    summary: WalkSessionSummary,
  ): Promise<void> {
    const { error } = await supabase
      .from("garden_walk_sessions")
      .update({
        ended_at: new Date().toISOString(),
        plants_visited: summary.plantsVisited,
        photos_taken: summary.photosTaken,
        notes_added: summary.notesAdded,
        tasks_completed: summary.tasksCompleted,
        ailments_flagged: summary.ailmentsFlagged,
        sections_visited: summary.sectionsVisited,
        readings_logged: summary.readingsLogged,
      })
      .eq("id", sessionId);
    if (error) {
      Logger.error("walkService.endSession failed", error, { sessionId });
      throw error;
    }
  },
};
