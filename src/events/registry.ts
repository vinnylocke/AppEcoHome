import { supabase } from "../lib/supabase";

export const EVENT = {
  // Tasks
  TASK_CREATED:       "task_created",
  TASK_COMPLETED:     "task_completed",
  TASK_UNCOMPLETED:   "task_uncompleted",
  TASK_POSTPONED:     "task_postponed",
  TASK_SKIPPED:       "task_skipped",
  // Plants (shed)
  PLANT_ADDED:               "plant_added",
  PLANT_ARCHIVED:            "plant_archived",
  PLANT_VIEWED:              "plant_viewed",
  // Plant instances (area)
  PLANT_ASSIGNED:            "plant_assigned",
  PLANT_INSTANCE_PLANTED:    "plant_instance_planted",
  PLANT_INSTANCE_ARCHIVED:   "plant_instance_archived",
  PLANT_INSTANCE_RESTORED:   "plant_instance_restored",
  PLANT_INSTANCE_DELETED:    "plant_instance_deleted",
  // Ailments / watchlist
  AILMENT_ADDED:             "ailment_added",
  AILMENT_ARCHIVED:          "ailment_archived",
  AILMENT_RESTORED:          "ailment_restored",
  AILMENT_DELETED:           "ailment_deleted",
  AILMENT_LINKED:            "ailment_linked",
  // Planner
  PLAN_CREATED:              "plan_created",
  PLAN_COMPLETED:            "plan_completed",
  PLAN_ARCHIVED:             "plan_archived",
  PLAN_DELETED:              "plan_deleted",
  // Visualiser
  VISUALISER_CAPTURE:        "visualiser_capture",
  VISUALISER_ANALYSE:        "visualiser_analyse",
  // Garden
  GARDEN_QUIZ_DONE:          "garden_quiz_done",
  // Area scans
  AREA_SCAN_COMPLETED:       "area_scan_completed",
  SCAN_TASK_ACCEPTED:        "scan_task_accepted",
  SCAN_AILMENT_LINKED:       "scan_ailment_linked",
} as const;

export type EventType = typeof EVENT[keyof typeof EVENT];

export function logEvent(type: EventType, meta?: Record<string, unknown>): void {
  supabase.auth.getUser().then(({ data: { user } }) => {
    if (!user) return;
    supabase
      .from("user_events")
      .insert({ user_id: user.id, event_type: type, meta: meta ?? {} })
      .then(({ error }) => {
        if (error) console.warn("[logEvent]", type, error.message);
      });
  });
}
