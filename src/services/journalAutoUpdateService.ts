import { supabase } from "../lib/supabase";
import { Logger } from "../lib/errorHandler";

/**
 * Auto-update Journal Service
 *
 * Bridges task completion ↔ journal entry creation. Called from every
 * task-completion site after the task is marked done. Reads the user's
 * `auto_update_journal_categories` preference (an array of TaskCategory
 * strings) and inserts a `plant_journals` row only when the task's
 * category is in that array.
 *
 * Idempotency is enforced at the DB level by a UNIQUE index on
 * `plant_journals(task_id) where task_id is not null` — calling this
 * twice for the same task will simply no-op the second insert with a
 * unique-violation error which we swallow.
 *
 * Multi-instance tasks (e.g. "water tomato + basil + pepper") produce a
 * SINGLE unassigned journal entry; the plant names go in the description.
 * This keeps the unique-task-id invariant and avoids spamming each plant's
 * journal with identical entries.
 */

export interface AutoJournalTaskInput {
  id: string;
  title: string;
  type: string;
  inventory_item_ids?: string[] | null;
}

export interface AutoJournalContext {
  homeId: string;
  userId: string;
}

/**
 * Pure helper — given a task and user preferences, decide whether an
 * auto journal entry should be created. Exposed for unit testing.
 */
export function shouldAutoCreate(
  task: AutoJournalTaskInput,
  enabledCategories: string[],
): boolean {
  if (!enabledCategories || enabledCategories.length === 0) return false;
  return enabledCategories.includes(task.type);
}

/**
 * Pure helper — builds the subject + description for an auto entry.
 * Plant-name resolution happens in the caller (via the plants lookup);
 * here we just format. Exposed for unit testing.
 */
export interface AutoEntryCopy {
  subject: string;
  description: string;
}

export function buildAutoEntryCopy(
  task: AutoJournalTaskInput,
  plantNames: string[],
): AutoEntryCopy {
  const verbMap: Record<string, string> = {
    Planting: "Planted",
    Harvesting: "Harvested",
    Pruning: "Pruned",
    Watering: "Watered",
    Maintenance: "Maintained",
  };
  const verb = verbMap[task.type] ?? task.type;
  const plantsLabel =
    plantNames.length === 0
      ? null
      : plantNames.length === 1
        ? plantNames[0]
        : `${plantNames.length} plants`;
  const subject = plantsLabel ? `${verb} · ${plantsLabel}` : verb;
  const description =
    plantNames.length > 1
      ? `${task.title}\n\nPlants: ${plantNames.join(", ")}`
      : task.title;
  return { subject, description };
}

/**
 * Fetches the user's auto-update preference, evaluates the task, and
 * inserts a journal entry if appropriate. Returns the created entry id
 * (or null when nothing was written). Safe to call from anywhere — never
 * throws; failures are logged.
 */
export async function maybeCreateAutoEntry(
  task: AutoJournalTaskInput,
  ctx: AutoJournalContext,
): Promise<string | null> {
  try {
    const { data: profile, error: profileErr } = await supabase
      .from("user_profiles")
      .select("auto_update_journal_categories")
      .eq("uid", ctx.userId)
      .maybeSingle();
    if (profileErr) throw profileErr;
    const enabledCategories: string[] = profile?.auto_update_journal_categories ?? [];
    if (!shouldAutoCreate(task, enabledCategories)) return null;

    const itemIds = task.inventory_item_ids ?? [];
    let plantNames: string[] = [];
    if (itemIds.length > 0) {
      const { data: items, error: itemsErr } = await supabase
        .from("inventory_items")
        .select("id, plant_name, nickname")
        .in("id", itemIds);
      if (itemsErr) throw itemsErr;
      plantNames = (items ?? []).map(
        (i: any) => i.nickname || i.plant_name || "Plant",
      );
    }

    const copy = buildAutoEntryCopy(task, plantNames);

    // Attach to the single plant when there's exactly one; otherwise
    // leave unassigned so the entry surfaces in the global feed only.
    const inventoryItemId = itemIds.length === 1 ? itemIds[0] : null;

    const { data, error: insertErr } = await supabase
      .from("plant_journals")
      .insert({
        home_id: ctx.homeId,
        subject: copy.subject,
        description: copy.description,
        task_id: task.id,
        inventory_item_id: inventoryItemId,
      })
      .select("id")
      .single();

    if (insertErr) {
      // 23505 = unique violation — task already auto-journalled. Expected
      // on uncomplete-then-recomplete; not a real error.
      if ((insertErr as any).code === "23505") return null;
      throw insertErr;
    }
    return data?.id ?? null;
  } catch (err) {
    Logger.error("journalAutoUpdate: maybeCreateAutoEntry failed", err, {
      taskId: task.id,
      taskType: task.type,
    });
    return null;
  }
}
