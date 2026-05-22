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
  PLAN_RESTORED:             "plan_restored",
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
  // Plant Doctor AI
  AI_IDENTIFY:               "ai_identify",
  AI_DIAGNOSE:               "ai_diagnose",
  PLANT_DOCTOR_CHAT_MESSAGE: "plant_doctor_chat_message",
  PLANT_DOCTOR_CHAT_PLAN_SUGGESTION_SHOWN:     "plant_doctor_chat_plan_suggestion_shown",
  PLANT_DOCTOR_CHAT_PLAN_SUGGESTION_ACCEPTED:  "plant_doctor_chat_plan_suggestion_accepted",
  PLANT_DOCTOR_CHAT_PLAN_SUGGESTION_DISMISSED: "plant_doctor_chat_plan_suggestion_dismissed",
  // Seasonal Picks ("What can I grow right now?")
  SEASONAL_PICKS_LOADED:    "seasonal_picks_loaded",
  SEASONAL_PICKS_REFRESHED: "seasonal_picks_refreshed",
  SEASONAL_PICK_OPENED:     "seasonal_pick_opened",
  // The Nursery — seed packets + sowings + plant-out lifecycle
  NURSERY_PACKET_ADDED:        "nursery_packet_added",
  NURSERY_PACKET_EDITED:       "nursery_packet_edited",
  NURSERY_PACKET_ARCHIVED:     "nursery_packet_archived",
  NURSERY_SOWING_LOGGED:       "nursery_sowing_logged",
  NURSERY_SOWING_OBSERVED:     "nursery_sowing_observed",
  NURSERY_SOWING_PLANTED_OUT:  "nursery_sowing_planted_out",
  NURSERY_SOWING_DISCARDED:    "nursery_sowing_discarded",
  // Blueprints (recurring tasks)
  BLUEPRINT_CREATED:         "blueprint_created",
  BLUEPRINT_DELETED:         "blueprint_deleted",
  // Yield & journal
  YIELD_RECORDED:            "yield_recorded",
  JOURNAL_ENTRY_ADDED:       "journal_entry_added",
  // Community guides
  GUIDE_PUBLISHED:           "guide_published",
  GUIDE_STARRED:             "guide_starred",
  GUIDE_COMMENTED:           "guide_commented",
  // Shopping
  SHOPPING_LIST_CREATED:     "shopping_list_created",
  SHOPPING_ITEM_ADDED:       "shopping_item_added",
  // Locations / areas
  LOCATION_CREATED:          "location_created",
  AREA_CREATED:              "area_created",
  // Optimiser
  TASK_OPTIMISED:            "task_optimised",
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
