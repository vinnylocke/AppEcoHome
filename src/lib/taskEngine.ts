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
    // 1. Fetch Physical Tasks (NO array joins)
    let tasksQuery = supabase
      .from("tasks")
      .select("*, locations(name, is_outside), areas(name), plans(name)")
      .eq("home_id", homeId)
      .neq("status", "Skipped");

    if (!includeOverdue) {
      tasksQuery = tasksQuery.gte("due_date", startDateStr);
    }
    tasksQuery = tasksQuery.lte("due_date", endDateStr);

    const { data: physicalTasks, error: tError } = await tasksQuery;
    if (tError) throw tError;

    // 2. Fetch Blueprints (NO array joins)
    const { data: blueprints, error: bpError } = await supabase
      .from("task_blueprints")
      .select("*, locations(name, is_outside), areas(name), plans(name)")
      .eq("home_id", homeId)
      .eq("is_recurring", true);

    if (bpError) throw bpError;

    // 2b. Fetch Skipped tombstones in the window — excluded from rawTasks but needed
    //     to suppress ghost re-generation at dates the user already postponed past.
    const { data: skippedTombstones } = await supabase
      .from("tasks")
      .select("blueprint_id, due_date")
      .eq("home_id", homeId)
      .eq("status", "Skipped")
      .gte("due_date", startDateStr)
      .lte("due_date", endDateStr)
      .not("blueprint_id", "is", null);

    const tombstoneSet = new Set(
      (skippedTombstones ?? []).map(
        (t: any) => `${t.blueprint_id}:${t.due_date}`,
      ),
    );

    // 3. Filter and Extract Unique IDs
    // 🚀 NEW LOGIC: Filter out historically completed tasks
    const rawTasks = (physicalTasks || []).filter((task) => {
      // Rule 1: Keep all non-completed tasks (they are pending or overdue)
      if (task.status !== "Completed") return true;

      // Rule 2: If Completed, was it due in the date range we are currently looking at?
      const isDueInWindow =
        task.due_date >= startDateStr && task.due_date <= endDateStr;

      // Rule 3: Was it actually *marked* as completed in this date range?
      // (We split at "T" to just grab the YYYY-MM-DD from the Supabase timestamp)
      const timestamp = task.updated_at || task.created_at || task.due_date;
      const completedDateStr = timestamp.split("T")[0];
      const isCompletedInWindow =
        completedDateStr >= startDateStr && completedDateStr <= endDateStr;

      // Only keep the completed task if it passes Rule 2 or Rule 3
      return isDueInWindow || isCompletedInWindow;
    });

    const bps = blueprints || [];

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
    const inventoryDict: Record<string, any> = {};

    // 4. Fetch the Inventory Items separately and build a dictionary
    if (uniqueItemIds.length > 0) {
      const { data: invItems, error: invError } = await supabase
        .from("inventory_items")
        .select(
          "id, plant_name, identifier, location_name, area_name, plants(thumbnail_url, cycle)",
        )
        .in("id", uniqueItemIds);

      if (invError) throw invError;

      invItems?.forEach((item) => {
        inventoryDict[item.id] = item;
      });
    }

    // 5. Generate Ghost Tasks from Blueprints
    const ghosts: any[] = [];
    bps.forEach((bp) => {
      if (!bp.frequency_days || !bp.start_date) return;

      const freq = bp.frequency_days;
      let currentGhostDate = new Date(bp.start_date);
      const targetEndDate = new Date(endDateStr);

      // Fast forward to our current window
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

        // Stop if blueprint has an end date and we passed it
        if (bp.end_date && ghostDateStr > bp.end_date) break;

        // Ensure we don't duplicate a task that was already materialized or tombstoned
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
            isGhost: true,
          });
        }
        currentGhostDate.setDate(currentGhostDate.getDate() + freq);
      }
    });

    // 6. Fetch Blocked Dependencies
    const allFinalTasks = [...rawTasks, ...ghosts];
    const physicalIds = rawTasks.map((t) => t.id);
    const blockedTaskIds = new Set<string>();

    if (physicalIds.length > 0) {
      const { data: deps } = await supabase
        .from("task_dependencies")
        .select("task_id, depends_on_task_id")
        .in("task_id", physicalIds);

      if (deps && deps.length > 0) {
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
    }

    return {
      tasks: allFinalTasks,
      inventoryDict,
      blockedTaskIds,
    };
  },
};
