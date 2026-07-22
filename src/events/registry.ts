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
  // Cross-home favourites (Phase 1 — plants). Payload: { plant_ref_id, source }.
  PLANT_FAVOURITED:            "plant_favourited",
  PLANT_UNFAVOURITED:          "plant_unfavourited",
  FAVOURITE_ADDED_TO_HOME:     "favourite_added_to_home",
  // Copy-on-write edit — a non-manual plant was saved as the user's own copy.
  PLANT_FORKED_ON_EDIT:        "plant_forked_on_edit",
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
  // Cross-home favourites (Phase 2 — ailments). Payload: { ailment_library_id, source }.
  AILMENT_FAVOURITED:            "ailment_favourited",
  AILMENT_UNFAVOURITED:          "ailment_unfavourited",
  FAVOURITE_AILMENT_ADDED_TO_HOME: "favourite_ailment_added_to_home",
  // Cross-home favourites (Phase 3 — nursery seed packets). Payload: { identity_key }.
  SEED_PACKET_FAVOURITED:            "seed_packet_favourited",
  SEED_PACKET_UNFAVOURITED:          "seed_packet_unfavourited",
  FAVOURITE_SEED_PACKET_ADDED_TO_HOME: "favourite_seed_packet_added_to_home",
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
  // Garden Brain — adaptive care (Phase 1, 2026-07-10)
  CARE_ADJUSTMENT_APPLIED:   "care_adjustment_applied",
  CARE_ADJUSTMENT_DISMISSED: "care_adjustment_dismissed",
  // Plant Doctor AI
  AI_IDENTIFY:               "ai_identify",
  AI_DIAGNOSE:               "ai_diagnose",
  // Sprint 3 (UX review 2026-06-15 item 3.1) — fires when a free-tier user
  // tries to identify after exhausting their 5-per-rolling-7-day quota.
  AI_QUOTA_EXCEEDED:         "ai_quota_exceeded",
  // Sprint 4a (UX review 2026-06-15 item 4.1) — bulk paste plant import.
  // Payload: { attempted, succeeded, failed, source: "ai" | "local" }.
  BULK_PLANT_IMPORT_COMPLETED: "bulk_plant_import_completed",
  // RHO-4 Phase 2 — bulk ailment import (Watchlist CSV / AI paste).
  // Payload: { attempted, succeeded, failed, favourited, mode: "csv" | "paste", source }.
  BULK_AILMENT_IMPORT_COMPLETED: "bulk_ailment_import_completed",
  // Sprint 4b (UX review 2026-06-15 item 5.1) — tokenised email invites.
  INVITE_SENT:               "invite_sent",
  INVITE_REDEEMED:           "invite_redeemed",
  INVITE_EXPIRED:            "invite_expired",
  PLANT_DOCTOR_CHAT_MESSAGE: "plant_doctor_chat_message",
  PLANT_DOCTOR_CHAT_PLAN_SUGGESTION_SHOWN:     "plant_doctor_chat_plan_suggestion_shown",
  PLANT_DOCTOR_CHAT_PLAN_SUGGESTION_ACCEPTED:  "plant_doctor_chat_plan_suggestion_accepted",
  PLANT_DOCTOR_CHAT_PLAN_SUGGESTION_DISMISSED: "plant_doctor_chat_plan_suggestion_dismissed",
  // Seasonal Picks ("What can I grow right now?")
  SEASONAL_PICKS_LOADED:    "seasonal_picks_loaded",
  SEASONAL_PICKS_REFRESHED: "seasonal_picks_refreshed",
  SEASONAL_PICK_OPENED:     "seasonal_pick_opened",
  // One-tap "Add planting tasks" from a seasonal pick tile (2026-07-22).
  SEASONAL_PICK_QUICK_ADD:  "seasonal_pick_quick_add",
  // RHO-4 Phase 3 — bulk seed-packet import (Nursery CSV / AI paste).
  // Payload: { attempted, succeeded, failed, favourited, mode: "csv" | "paste", source }.
  BULK_PACKET_IMPORT_COMPLETED: "bulk_packet_import_completed",
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
