import { supabase } from "../lib/supabase";
import { Logger } from "../lib/errorHandler";
import { getLocalDateString } from "../lib/taskEngine";

/**
 * Sowing Auto-Create Service
 *
 * Bridges task completion ↔ Nursery sowing creation. Called from every
 * task-completion site after the task is marked done. When a task carries
 * a `seed_packet_id`, the parent surface opens an inline modal asking
 * the user how many seeds were sown, then calls `commitSowingFromTask`
 * to write the row.
 *
 * Idempotency is enforced at the DB level by a UNIQUE partial index on
 * `seed_sowings(task_id) where task_id is not null`. The 23505 unique
 * violation is swallowed silently so re-completing a task is safe.
 */

export interface CompletedTaskWithPacket {
  id: string;
  title: string;
  type: string;
  seed_packet_id: string | null;
}

export interface CommitSowingInput {
  homeId: string;
  taskId: string;
  packetId: string;
  sownCount: number;
  sownOn?: string; // YYYY-MM-DD, defaults to today
  notes?: string | null;
}

/**
 * Pure helper — decides whether a completed task should trigger the
 * inline log-sowing prompt. Used by both the unit tests and the
 * task-completion sites.
 */
export function shouldPromptForSowing(task: CompletedTaskWithPacket): boolean {
  if (!task) return false;
  if (task.type !== "Planting") return false;
  return !!task.seed_packet_id;
}

/**
 * Writes the sowing row, back-linked to the originating task. Returns
 * the new sowing id or null on failure (including the expected idempotency
 * no-op when the task already has a sowing).
 */
export async function commitSowingFromTask(
  input: CommitSowingInput,
): Promise<string | null> {
  try {
    const sownOn = input.sownOn || getLocalDateString(new Date());
    const { data, error } = await supabase
      .from("seed_sowings")
      .insert({
        home_id: input.homeId,
        seed_packet_id: input.packetId,
        sown_on: sownOn,
        sown_count: input.sownCount,
        notes: input.notes ?? null,
        status: "sown",
        task_id: input.taskId,
      })
      .select("id")
      .single();
    if (error) {
      // 23505 = unique violation — task already produced a sowing. Expected
      // on uncomplete-then-recomplete; not a real error.
      if ((error as any).code === "23505") return null;
      throw error;
    }
    return data?.id ?? null;
  } catch (err) {
    Logger.error("sowingAutoCreate: commitSowingFromTask failed", err, {
      taskId: input.taskId,
      packetId: input.packetId,
    });
    return null;
  }
}

/**
 * Has the given task already produced a sowing? Used by the
 * task-completion sites to skip the prompt when the user uncompletes
 * and re-completes the same task (the unique index would have rejected
 * the second insert anyway, but checking first avoids showing the
 * modal at all).
 */
export async function hasExistingSowingForTask(
  taskId: string,
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("seed_sowings")
      .select("id")
      .eq("task_id", taskId)
      .limit(1)
      .maybeSingle();
    if (error) return false;
    return !!data;
  } catch {
    return false;
  }
}
