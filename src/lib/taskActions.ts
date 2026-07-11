// Task action mutation core — complete / skip / postpone.
//
// Extracted from TaskList.tsx (RHO-17 Garden Walk v2) so the Garden Walk
// and the task list share ONE implementation of the mutation semantics:
//
//   • Ghost tasks (virtual `ghost-{blueprint_id}-{date}` instances) are
//     materialised via buildGhostPayload — INSERT a physical row at the
//     ghost's (blueprint_id, due_date) slot with the target status.
//   • Postponing a blueprint-linked task tombstones the original slot as
//     Skipped (so the ghost engine won't regenerate it) and INSERTs a new
//     Pending row at the new date. Standalone tasks just move.
//   • A unique violation (23505 on `unique_blueprint_date`) during ghost
//     materialisation means another surface (a second tab, the task list)
//     already materialised the same slot — fall back to UPDATEing the
//     existing row instead of failing the action.
//
// Side-effects mirrored from TaskList: `logEvent` for the pattern engine
// and `maybeCreateAutoEntry` (auto journal) on completion. UI concerns
// (toasts, optimistic state, offline queue, blueprint shifting, sowing
// prompts, automation engine) stay with the calling component.

import { supabase } from "./supabase";
import { buildGhostPayload } from "./taskMutations";
import { getLocalDateString } from "./taskEngine";
import { logEvent, EVENT } from "../events/registry";
import { maybeCreateAutoEntry } from "../services/journalAutoUpdateService";

/** The minimal task shape the actions need — physical row or ghost.
 *  Extra row fields are welcome (buildGhostPayload reads them off the
 *  object directly); these are just the ones the actions touch. */
export interface ActionableTask {
  id: string;
  home_id: string;
  title: string;
  type: string;
  due_date: string;
  status?: string;
  description?: string | null;
  isGhost?: boolean;
  blueprint_id?: string | null;
  location_id?: string | null;
  area_id?: string | null;
  plan_id?: string | null;
  inventory_item_ids?: string[] | null;
  window_end_date?: string | null;
  next_check_at?: string | null;
  scope?: string | null;
  created_by?: string | null;
  assigned_to?: string | null;
}

export interface TaskActionContext {
  homeId: string;
  userId: string;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "23505"
  );
}

/**
 * Materialise a ghost task as a physical row with the given status.
 * On a `unique_blueprint_date` violation (the slot was already
 * materialised elsewhere) falls back to UPDATE on the existing row.
 * Returns the resulting row (selected with `select`, default `*`).
 */
export async function materialiseGhost(
  ghost: ActionableTask,
  status: string,
  overrides: Record<string, unknown> = {},
  select: string = "*",
): Promise<any> {
  const payload = buildGhostPayload(ghost, status, overrides);
  const { data, error } = await supabase
    .from("tasks")
    .insert([payload])
    .select(select)
    .single();
  if (!error) return data;

  if (isUniqueViolation(error) && ghost.blueprint_id) {
    const { data: updated, error: updError } = await supabase
      .from("tasks")
      .update({ status, ...overrides })
      .eq("blueprint_id", ghost.blueprint_id)
      .eq("due_date", ghost.due_date)
      .select(select)
      .single();
    if (updError) throw updError;
    return updated;
  }
  throw error;
}

/**
 * Complete a task (ghost or physical). Mirrors TaskList's complete
 * semantics: ghost → INSERT Completed row (unique-violation → UPDATE);
 * physical → UPDATE status/completed_at/completed_by. Fires
 * `task_completed` + the auto-journal side-effect. Returns the final row
 * (ghosts) or the input task with the completed fields applied.
 */
export async function completeTask(
  task: ActionableTask,
  ctx: TaskActionContext,
): Promise<any> {
  const completedAt = new Date().toISOString();
  let finalRow: any;

  if (task.isGhost) {
    finalRow = await materialiseGhost(task, "Completed", {
      completed_at: completedAt,
      completed_by: ctx.userId,
    });
  } else {
    const { error } = await supabase
      .from("tasks")
      .update({
        status: "Completed",
        completed_at: completedAt,
        completed_by: ctx.userId,
      })
      .eq("id", task.id);
    if (error) throw error;
    finalRow = { ...task, status: "Completed", completed_at: completedAt };
  }

  logEvent(EVENT.TASK_COMPLETED, {
    task_id: finalRow?.id ?? task.id,
    task_type: task.type,
    inventory_item_ids: task.inventory_item_ids ?? [],
  });

  // Auto-update journal — fire-and-forget; the service reads the user's
  // per-category preferences and no-ops when off.
  void maybeCreateAutoEntry(
    {
      id: finalRow?.id ?? task.id,
      title: task.title,
      type: task.type,
      inventory_item_ids: task.inventory_item_ids ?? [],
    },
    { homeId: ctx.homeId, userId: ctx.userId },
  );

  return finalRow;
}

/**
 * Skip a task. Ghost → materialise a Skipped tombstone (suppresses the
 * ghost for that date); physical → UPDATE status='Skipped'. Fires
 * `task_skipped`.
 */
export async function skipTask(task: ActionableTask): Promise<void> {
  if (task.isGhost) {
    await materialiseGhost(task, "Skipped");
  } else {
    const { error } = await supabase
      .from("tasks")
      .update({ status: "Skipped" })
      .eq("id", task.id);
    if (error) throw error;
  }

  logEvent(EVENT.TASK_SKIPPED, {
    task_id: task.id,
    task_type: task.type,
    inventory_item_ids: task.inventory_item_ids ?? [],
  });
}

/**
 * Postpone a task to `newDate` (YYYY-MM-DD). Mirrors TaskList's
 * handlePostponeTask branches exactly:
 *   ghost               → tombstone original slot (Skipped) + INSERT
 *                         Pending at newDate
 *   physical, blueprint → UPDATE original to Skipped + INSERT Pending
 *                         at newDate
 *   standalone          → UPDATE due_date in place
 * Fires `task_postponed` with delay_days. No-op when the date is
 * unchanged.
 */
export async function postponeTask(
  task: ActionableTask,
  newDate: string,
): Promise<void> {
  if (!newDate || newDate === task.due_date) return;

  if (task.isGhost) {
    // Tombstone the original slot, create Pending at the new date.
    const { error } = await supabase.from("tasks").insert([
      buildGhostPayload(task, "Skipped"),
      buildGhostPayload(task, "Pending", { due_date: newDate }),
    ]);
    if (error) {
      if (!isUniqueViolation(error)) throw error;
      // One of the slots was already materialised (walk + another tab).
      // Recover row-by-row: tombstone via the fallback, then insert the
      // Pending row, tolerating an existing row at the new date too.
      await materialiseGhost(task, "Skipped");
      const { error: insError } = await supabase
        .from("tasks")
        .insert([buildGhostPayload(task, "Pending", { due_date: newDate })]);
      if (insError && !isUniqueViolation(insError)) throw insError;
    }
  } else if (task.blueprint_id) {
    // Physical blueprint task: mark in-place as Skipped (tombstone so the
    // ghost engine won't re-generate a ghost at the now-vacated date),
    // then insert a new Pending task at the postponed date.
    const { error } = await supabase
      .from("tasks")
      .update({ status: "Skipped" })
      .eq("id", task.id);
    if (error) throw error;
    const { error: insError } = await supabase
      .from("tasks")
      .insert([buildGhostPayload(task, "Pending", { due_date: newDate })]);
    if (insError && !isUniqueViolation(insError)) throw insError;
  } else {
    // Pure one-off task (no blueprint): just move it.
    const { error } = await supabase
      .from("tasks")
      .update({ due_date: newDate })
      .eq("id", task.id);
    if (error) throw error;
  }

  const delayDays = Math.round(
    (new Date(newDate).getTime() - new Date(task.due_date).getTime()) /
      86_400_000,
  );
  logEvent(EVENT.TASK_POSTPONED, {
    task_id: task.id,
    task_type: task.type,
    delay_days: delayDays,
    inventory_item_ids: task.inventory_item_ids ?? [],
  });
}

/**
 * Snooze a HARVEST-WINDOW task for `days` (RHO-17 Phase 3 — harvest
 * sheets in-walk). Mirrors TaskModal's HarvestWindowFooter.snoozeFor
 * exactly: ghost → materialise a Pending row first, then set
 * `next_check_at` to today + days, CAPPED at `window_end_date` so the
 * snooze never pushes past the window. Returns the final YYYY-MM-DD the
 * task will reappear on.
 */
export async function snoozeHarvestTask(
  task: ActionableTask,
  days: number,
): Promise<string> {
  let targetId = task.id;
  let cap = task.window_end_date
    ? String(task.window_end_date).slice(0, 10)
    : null;

  if (task.isGhost) {
    const row = await materialiseGhost(task, "Pending");
    targetId = row.id;
    if (row.window_end_date) cap = String(row.window_end_date).slice(0, 10);
  }

  const next = new Date();
  next.setDate(next.getDate() + Math.max(1, Math.round(days)));
  const nextStr = getLocalDateString(next);
  const finalStr = cap && nextStr > cap ? cap : nextStr;

  const { error } = await supabase
    .from("tasks")
    .update({ next_check_at: finalStr })
    .eq("id", targetId);
  if (error) throw error;

  return finalStr;
}
