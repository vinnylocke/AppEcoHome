// Garden Walk session + visit writes.
//
// The GardenWalk component drives all UI state itself; this service is
// just the thin persistence boundary. Two write paths:
//
//   startSession(homeId, userId)   → returns session row { id }
//   recordVisit(sessionId, itemId, outcome) → fire-and-forget row insert
//   endSession(sessionId, summary) → updates the session with metrics
//
// All writes go through RLS. The migration's policies only let the
// session owner mutate, so attempts from another user fail loudly.

import { supabase } from "../lib/supabase";
import { Logger } from "../lib/errorHandler";

export type WalkVisitOutcome =
  | "all_good"
  | "snapped"
  | "noted"
  | "ailment_flagged"
  | "task_completed"
  | "skipped";

export interface WalkSessionSummary {
  plantsVisited: number;
  photosTaken: number;
  notesAdded: number;
  tasksCompleted: number;
  ailmentsFlagged: number;
}

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
      })
      .eq("id", sessionId);
    if (error) {
      Logger.error("walkService.endSession failed", error, { sessionId });
      throw error;
    }
  },
};
