// Shared automation action executor.
//
// Runs an automation's `automation_actions` (notification / valve_open /
// valve_close / complete_task) — the canonical "do the thing" logic. Used by
// `evaluate-automations` (auto path, on the firing edge) AND `run-automations`
// (manual "Run now", bypassing conditions). Keeping it in one place means a
// manual run does EXACTLY what an automatic fire does.

import { error as logError } from "./logger.ts";
import { buildValveQueueRows } from "./valveQueueRows.ts";

const FN = "fanout-actions";

export interface ActionRow {
  id: string;
  action_kind: "notification" | "send_notification" | "valve_open" | "valve_close" | "complete_task";
  notification_title: string | null;
  notification_body: string | null;
  target_device_id: string | null;
  target_blueprint_id: string | null;
  valve_duration_seconds: number | null;
  ord: number;
}

export interface TaskCompletion { blueprint_id: string; title: string; already_done: boolean }

export interface FanoutResult {
  /** Distinct home members reached by a `send_notification` (reminder) action, 0 if none. */
  notifications_sent: number;
  valves_queued: number;
  tasks_completed: TaskCompletion[];
}

export async function fanoutActions(
  // `any` so every caller's client passes cleanly — this helper is shared by
  // functions pinned to different supabase-js versions, whose SupabaseClient
  // types are nominally incompatible (protected members).
  // deno-lint-ignore no-explicit-any
  db: any,
  automation: { id: string; home_id: string; name: string },
  runId: string,
  now: Date,
): Promise<FanoutResult> {
  const { data: actions } = await db.from("automation_actions")
    .select("id, action_kind, notification_title, notification_body, target_device_id, target_blueprint_id, valve_duration_seconds, ord")
    .eq("automation_id", automation.id).order("ord", { ascending: true });
  if (!actions?.length) return { notifications_sent: 0, valves_queued: 0, tasks_completed: [] };

  let valvesQueued = 0;
  let reminderMembers = 0;
  const tasksCompleted: TaskCompletion[] = [];

  // Home members are only needed for a `send_notification` reminder — fetch lazily, once.
  let memberIds: string[] | null = null;
  const getMembers = async (): Promise<string[]> => {
    if (memberIds !== null) return memberIds;
    const { data } = await db.from("home_members").select("user_id").eq("home_id", automation.home_id);
    const ids = (data ?? []).map((m: { user_id: string }) => m.user_id as string);
    memberIds = ids;
    return ids;
  };

  let valveStaggerSeconds = 0;
  for (const action of actions as ActionRow[]) {
    // `notification` actions are receipts — sent by the runner at decision time, not here.
    if (action.action_kind === "notification") continue;
    if (action.action_kind === "send_notification") {
      // Custom-message reminder, sent to every home member when the automation fires.
      const members = await getMembers();
      if (members.length === 0) continue;
      const title = action.notification_title?.trim() || automation.name;
      const body = action.notification_body?.trim() || `Reminder from "${automation.name}".`;
      const rows = members.map((uid) => ({
        user_id: uid, home_id: automation.home_id, title, body,
        type: "automation_reminder", data: { route: "/integrations", automationId: automation.id }, is_read: false,
      }));
      const { error } = await db.from("notifications").insert(rows);
      if (error) logError(FN, "send_notification_failed", { automation_id: automation.id, message: error.message });
      else reminderMembers = members.length;
      continue;
    }
    if (action.action_kind === "valve_open" || action.action_kind === "valve_close") {
      if (!action.target_device_id) continue;
      // valve_open with a duration also enqueues the paired turn_off, so the
      // valve actually closes after its run time (the drain cron only fires
      // what's queued — without this the valve stays open forever).
      const rows = buildValveQueueRows({
        actionKind: action.action_kind,
        runId,
        deviceId: action.target_device_id,
        fireAtMs: Date.now() + valveStaggerSeconds * 1000,
        durationSeconds: action.valve_duration_seconds,
      });
      const { error } = await db.from("automation_valve_queue").insert(rows);
      if (error) logError(FN, "valve_queue_insert_failed", { automation_id: automation.id, message: error.message });
      else { valvesQueued += 1; valveStaggerSeconds += 5; }
      continue;
    }
    if (action.action_kind === "complete_task") {
      // Opt-in task completion (#10): mark today's (or overdue) Pending/Postponed
      // task(s) for the linked blueprint Completed. Never materialises a task.
      if (!action.target_blueprint_id) continue;
      const today = now.toISOString().split("T")[0];
      const { data: dueTasks } = await db.from("tasks")
        .select("id, title, blueprint_id")
        .eq("blueprint_id", action.target_blueprint_id)
        .lte("due_date", today)
        .in("status", ["Pending", "Postponed"]);
      for (const t of (dueTasks ?? []) as Array<{ id: string; title: string; blueprint_id: string }>) {
        const { error } = await db.from("tasks").update({
          status: "Completed",
          completed_at: now.toISOString(),
          auto_completed_reason: "automation",
        }).eq("id", t.id);
        if (error) logError(FN, "task_complete_failed", { automation_id: automation.id, message: error.message });
        else tasksCompleted.push({ blueprint_id: t.blueprint_id, title: t.title ?? "", already_done: false });
      }

      // Weather-created tasks (2026-07-10): weather-driven extras are
      // STANDALONE rows (blueprint_id NULL, weather_event_key set) so the
      // blueprint-keyed query above never sees them. An automation that
      // waters this blueprint's area has physically done the extra watering
      // too — complete matching weather tasks for the same (task_type,
      // area_id) so they don't linger as phantom to-dos.
      const { data: bpTarget } = await db.from("task_blueprints")
        .select("task_type, area_id")
        .eq("id", action.target_blueprint_id)
        .maybeSingle();
      if (bpTarget?.area_id && bpTarget?.task_type) {
        const { data: weatherTasks } = await db.from("tasks")
          .select("id, title")
          .eq("home_id", automation.home_id)
          .is("blueprint_id", null)
          .not("weather_event_key", "is", null)
          .eq("type", bpTarget.task_type)
          .eq("area_id", bpTarget.area_id)
          .lte("due_date", today)
          .in("status", ["Pending", "Postponed"]);
        for (const t of (weatherTasks ?? []) as Array<{ id: string; title: string }>) {
          const { error } = await db.from("tasks").update({
            status: "Completed",
            completed_at: now.toISOString(),
            auto_completed_reason: "automation",
          }).eq("id", t.id);
          if (error) logError(FN, "weather_task_complete_failed", { automation_id: automation.id, message: error.message });
          // Attribute to the triggering blueprint — the automation that watered
          // this area is what completed the weather extra.
          else tasksCompleted.push({ blueprint_id: action.target_blueprint_id, title: t.title ?? "", already_done: false });
        }
      }
    }
  }
  return {
    notifications_sent: reminderMembers,
    valves_queued: valvesQueued,
    tasks_completed: tasksCompleted,
  };
}
