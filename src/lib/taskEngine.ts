import { supabase } from "./supabase";

export const getAbsoluteDays = (dateStr: string) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d, 12, 0, 0);
  return Math.floor(date.getTime() / (1000 * 60 * 60 * 24));
};

export const getLocalDateString = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const TaskEngine = {
  async fetchTasksWithGhosts({
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
  }) {
    // 1. Fetch Inventory Context
    const { data: invData } = await supabase
      .from("inventory_items")
      .select(
        "id, plant_name, identifier, location_name, area_name, status, plants(thumbnail_url)",
      )
      .eq("home_id", homeId);
    const invMap = (invData || []).reduce(
      (acc, item) => {
        acc[item.id] = item;
        return acc;
      },
      {} as Record<string, any>,
    );

    // 2. Fetch Physical Tasks (We fetch ALL tasks up to the endDate so we can track pending carryovers)
    let pQuery = supabase
      .from("tasks")
      .select(
        `*, locations(name, is_outside), areas(name), plans(ai_blueprint, name)`,
      )
      .eq("home_id", homeId)
      .neq("status", "Skipped")
      .lte("due_date", endDateStr);

    const { data: physicalData } = await pQuery;
    let allPhysicalTasks = physicalData || [];

    // 3. Automated Weather Checks
    const { data: rainAlerts } = await supabase
      .from("weather_alerts")
      .select("starts_at, locations!inner(home_id)")
      .eq("locations.home_id", homeId)
      .eq("type", "rain");
    const rainDates = new Set(
      (rainAlerts || []).map((a) => a.starts_at.split("T")[0]),
    );

    allPhysicalTasks = allPhysicalTasks.map((t) => {
      const isOutside = t.locations?.is_outside;
      const isAutoCompleted =
        rainDates.has(t.due_date) &&
        isOutside &&
        t.type === "Watering" &&
        t.status === "Pending";
      if (isAutoCompleted)
        return { ...t, status: "Completed", isAutoCompleted: true };
      return t;
    });

    // 4. Filter physical tasks for the UI
    let physicalTasksToReturn = allPhysicalTasks.filter((t) => {
      if (includeOverdue) {
        return (
          t.due_date <= endDateStr &&
          (t.due_date >= startDateStr || t.status === "Pending")
        );
      } else {
        return t.due_date >= startDateStr && t.due_date <= endDateStr;
      }
    });

    // 5. Fetch Blueprints
    const { data: bpData } = await supabase
      .from("task_blueprints")
      .select(
        `*, locations(name, is_outside), areas(name), plans(ai_blueprint, name)`,
      )
      .eq("home_id", homeId)
      .eq("is_recurring", true);
    const blueprints = bpData || [];

    // 6. Generate Ghosts (Only for Today or Future)
    const ghostTasks: any[] = [];
    const startDays = getAbsoluteDays(startDateStr);
    const endDays = getAbsoluteDays(endDateStr);
    const todayDays = getAbsoluteDays(todayStr);

    for (let d = startDays; d <= endDays; d++) {
      if (d < todayDays) continue; // Ghosts never generate in the past

      // Calculate exact date string for this loop iteration
      const curDateObj = new Date(startDateStr + "T12:00:00");
      curDateObj.setDate(curDateObj.getDate() + (d - startDays));
      const curDateStr = getLocalDateString(curDateObj);

      blueprints.forEach((bp) => {
        const anchorDateStr = (bp.start_date || bp.created_at || "").split(
          "T",
        )[0];
        if (!anchorDateStr || curDateStr < anchorDateStr) return;
        if (bp.end_date && curDateStr > bp.end_date) return;

        const anchorDays = getAbsoluteDays(anchorDateStr);
        const diffDays = d - anchorDays;

        if (diffDays >= 0 && diffDays % bp.frequency_days === 0) {
          // 🚀 UPGRADED GHOST SUPPRESSION LOGIC:
          // 1. Is there an EXACT physical task for this blueprint on this specific date?
          const hasExactPhysical = allPhysicalTasks.some(
            (t) => t.blueprint_id === bp.id && t.due_date === curDateStr,
          );

          // 2. If we are evaluating TODAY, does an older pending task exist? (Prevents double tasks today)
          const isToday = curDateStr === todayStr;
          const hasPendingCarryover =
            isToday &&
            allPhysicalTasks.some(
              (t) =>
                t.blueprint_id === bp.id &&
                t.status === "Pending" &&
                t.due_date <= todayStr,
            );

          // Only spawn the ghost if there is no physical equivalent taking its place
          if (!hasExactPhysical && !hasPendingCarryover) {
            ghostTasks.push({
              id: `ghost-${bp.id}-${curDateStr}`,
              home_id: bp.home_id,
              blueprint_id: bp.id,
              title: bp.title,
              description: bp.description,
              type: bp.task_type,
              status:
                rainDates.has(curDateStr) &&
                bp.locations?.is_outside &&
                bp.task_type === "Watering"
                  ? "Completed"
                  : "Pending",
              due_date: curDateStr,
              location_id: bp.location_id,
              area_id: bp.area_id,
              plan_id: bp.plan_id,
              inventory_item_ids: bp.inventory_item_ids,
              isGhost: true,
              isAutoCompleted:
                rainDates.has(curDateStr) &&
                bp.locations?.is_outside &&
                bp.task_type === "Watering",
              locations: bp.locations,
              areas: bp.areas,
              plans: bp.plans,
            });
          }
        }
      });
    }

    let allTasks = [...physicalTasksToReturn, ...ghostTasks];

    // 7. Scrub items that only contain archived plants
    allTasks = allTasks.filter((task) => {
      if (!task.inventory_item_ids || task.inventory_item_ids.length === 0)
        return true;
      return task.inventory_item_ids.some(
        (id: string) => invMap[id]?.status !== "Archived",
      );
    });

    // 8. Establish Dependencies
    const taskIds = allTasks
      .map((t) => t.id)
      .filter((id) => !id.startsWith("ghost"));
    const newBlockedSet = new Set<string>();
    if (taskIds.length > 0) {
      const { data: depData } = await supabase
        .from("task_dependencies")
        .select("task_id, depends_on_task_id")
        .in("task_id", taskIds);
      if (depData && depData.length > 0) {
        const blockerIds = [
          ...new Set(depData.map((d) => d.depends_on_task_id)),
        ];
        const { data: blockerStatuses } = await supabase
          .from("tasks")
          .select("id, status")
          .in("id", blockerIds);
        depData.forEach((dep) => {
          const statusObj = blockerStatuses?.find(
            (s) => s.id === dep.depends_on_task_id,
          );
          if (statusObj?.status === "Pending") newBlockedSet.add(dep.task_id);
        });
      }
    }

    return {
      tasks: allTasks,
      blockedTaskIds: newBlockedSet,
      inventoryDict: invMap,
    };
  },
};
