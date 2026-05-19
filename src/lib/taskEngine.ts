import { supabase } from "./supabase";

export const getLocalDateString = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const TaskEngine = {
  fetchTasksWithGhosts: async ({
    homeId,
    startDateStr,
    endDateStr,
    includeOverdue = false,
    todayStr,
  }: {
    homeId: string;
    startDateStr: string;
    endDateStr: string;
    includeOverdue?: boolean;
    todayStr: string;
  }) => {
    // Round 1 — fetch all three independent sources in parallel
    let tasksQuery = supabase
      .from("tasks")
      .select("*, locations(name, is_outside), areas(name), plans(name)")
      .eq("home_id", homeId)
      .neq("status", "Skipped");

    if (!includeOverdue) {
      tasksQuery = tasksQuery.gte("due_date", startDateStr);
    }
    tasksQuery = tasksQuery.lte("due_date", endDateStr);

    const [
      { data: physicalTasks, error: tError },
      { data: blueprints, error: bpError },
      { data: skippedTombstones },
    ] = await Promise.all([
      tasksQuery,
      supabase
        .from("task_blueprints")
        .select("*, locations(name, is_outside), areas(name), plans(name)")
        .eq("home_id", homeId)
        .eq("is_recurring", true)
        .eq("is_archived", false),
      supabase
        .from("tasks")
        .select("blueprint_id, due_date")
        .eq("home_id", homeId)
        .eq("status", "Skipped")
        .gte("due_date", startDateStr)
        .lte("due_date", endDateStr)
        .not("blueprint_id", "is", null),
    ]);

    if (tError) throw tError;
    if (bpError) throw bpError;

    const tombstoneSet = new Set(
      (skippedTombstones ?? []).map(
        (t: any) => `${t.blueprint_id}:${t.due_date}`,
      ),
    );

    // Filter historical completed tasks out of the window
    const rawTasks = (physicalTasks || []).filter((task) => {
      if (task.status !== "Completed") return true;
      const isDueInWindow =
        task.due_date >= startDateStr && task.due_date <= endDateStr;
      const timestamp = task.updated_at || task.created_at || task.due_date;
      const completedDateStr = timestamp.split("T")[0];
      const isCompletedInWindow =
        completedDateStr >= startDateStr && completedDateStr <= endDateStr;
      return isDueInWindow || isCompletedInWindow;
    });

    const bps = blueprints || [];

    // Collect unique inventory item IDs needed for Round 2
    const allItemIds = new Set<string>();
    rawTasks.forEach((t) => {
      if (t.inventory_item_ids)
        t.inventory_item_ids.forEach((id: string) => allItemIds.add(id));
    });
    bps.forEach((bp) => {
      if (bp.inventory_item_ids)
        bp.inventory_item_ids.forEach((id: string) => allItemIds.add(id));
    });
    const uniqueItemIds = Array.from(allItemIds);
    const physicalIds = rawTasks.map((t) => t.id);

    // Round 2 — fetch inventory items and task dependencies in parallel
    const [invResult, depsResult] = await Promise.all([
      uniqueItemIds.length > 0
        ? supabase
            .from("inventory_items")
            .select(
              "id, plant_name, identifier, location_name, area_name, plants(thumbnail_url, cycle)",
            )
            .in("id", uniqueItemIds)
        : Promise.resolve({ data: [] as any[], error: null }),
      physicalIds.length > 0
        ? supabase
            .from("task_dependencies")
            .select("task_id, depends_on_task_id")
            .in("task_id", physicalIds)
        : Promise.resolve({ data: [] as any[], error: null }),
    ]);

    if (invResult.error) throw invResult.error;

    const inventoryDict: Record<string, any> = {};
    invResult.data?.forEach((item) => {
      inventoryDict[item.id] = item;
    });

    // Round 3 — pending parents (sequential on deps; skipped when no deps)
    const deps = depsResult.data ?? [];
    const blockedTaskIds = new Set<string>();

    if (deps.length > 0) {
      const parentIds = deps.map((d) => d.depends_on_task_id);
      const { data: pendingParents } = await supabase
        .from("tasks")
        .select("id")
        .in("id", parentIds)
        .eq("status", "Pending");

      if (pendingParents && pendingParents.length > 0) {
        const pendingParentSet = new Set(pendingParents.map((p) => p.id));
        deps.forEach((d) => {
          if (pendingParentSet.has(d.depends_on_task_id)) {
            blockedTaskIds.add(d.task_id);
          }
        });
      }
    }

    // Generate ghost tasks from blueprints (pure JS — no DB calls)
    const ghosts: any[] = [];
    const nowMs = Date.now();
    bps.forEach((bp) => {
      if (!bp.frequency_days || !bp.start_date) return;

      // Paused blueprints don't generate ghost tasks until the pause ends.
      // A past timestamp means the pause has elapsed — treat as active.
      const pausedUntil = bp.paused_until ? new Date(bp.paused_until).getTime() : null;
      const isPaused = pausedUntil !== null && pausedUntil > nowMs;
      if (isPaused) return;

      const freq = bp.frequency_days;
      let currentGhostDate = new Date(bp.start_date);
      const targetEndDate = new Date(endDateStr);

      const windowStart = new Date(startDateStr);
      if (currentGhostDate < windowStart) {
        const diffTime = Math.abs(
          windowStart.getTime() - currentGhostDate.getTime(),
        );
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const cyclesToSkip = Math.ceil(diffDays / freq);
        currentGhostDate.setDate(
          currentGhostDate.getDate() + cyclesToSkip * freq,
        );
      }

      while (currentGhostDate <= targetEndDate) {
        const ghostDateStr = getLocalDateString(currentGhostDate);

        if (bp.end_date && ghostDateStr > bp.end_date) break;

        const alreadyExists =
          rawTasks.some(
            (t) => t.blueprint_id === bp.id && t.due_date === ghostDateStr,
          ) || tombstoneSet.has(`${bp.id}:${ghostDateStr}`);

        if (
          !alreadyExists &&
          ghostDateStr >= startDateStr &&
          ghostDateStr <= endDateStr
        ) {
          ghosts.push({
            id: `ghost-${bp.id}-${ghostDateStr}`,
            blueprint_id: bp.id,
            home_id: bp.home_id,
            title: bp.title,
            description: bp.description,
            type: bp.task_type,
            due_date: ghostDateStr,
            status: "Pending",
            location_id: bp.location_id,
            area_id: bp.area_id,
            plan_id: bp.plan_id,
            inventory_item_ids: bp.inventory_item_ids || [],
            locations: bp.locations,
            scope: bp.scope || "home",
            created_by: bp.created_by || null,
            assigned_to: bp.assigned_to || null,
            isGhost: true,
          });
        }
        currentGhostDate.setDate(currentGhostDate.getDate() + freq);
      }
    });

    return {
      tasks: [...rawTasks, ...ghosts],
      inventoryDict,
      blockedTaskIds,
    };
  },
};
