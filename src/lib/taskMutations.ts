import { supabase } from "./supabase";

export function buildGhostPayload(
  ghost: any,
  status: string,
  overrides: Record<string, any> = {},
): Record<string, any> {
  return {
    home_id: ghost.home_id,
    blueprint_id: ghost.blueprint_id,
    title: ghost.title,
    description: ghost.description,
    type: ghost.type,
    due_date: ghost.due_date,
    status,
    location_id: ghost.location_id,
    area_id: ghost.area_id,
    plan_id: ghost.plan_id,
    inventory_item_ids: ghost.inventory_item_ids,
    // Wave-20.8 — preserve harvest window context across materialisation
    // / postpone. Without these, a delayed (postponed) harvest task would
    // be created without window_end_date and silently lose every window
    // affordance — green tint, in-window footer, click-any-day-in-range
    // visibility. Same applies to next_check_at when a snoozed task is
    // moved.
    window_end_date: ghost.window_end_date ?? null,
    next_check_at: ghost.next_check_at ?? null,
    ...overrides,
  };
}

export async function hasBlockingDependencies(taskId: string): Promise<boolean> {
  const { data: deps } = await supabase
    .from("task_dependencies")
    .select("depends_on_task_id")
    .eq("task_id", taskId);

  if (!deps || deps.length === 0) return false;

  const depIds = deps.map((d: any) => d.depends_on_task_id);
  const { data: pendingDeps } = await supabase
    .from("tasks")
    .select("id")
    .in("id", depIds)
    .eq("status", "Pending");

  return !!(pendingDeps && pendingDeps.length > 0);
}
