import { supabase } from "../lib/supabase";

export async function injectBlueprintTasks(params: {
  homeId: string;
  planId: string;
  areaId: string;
  locationId: string | undefined;
  preparationTasks: any[];
  plantManifest: any[];
  plantMapping: Record<number, string>;
}): Promise<void> {
  const {
    homeId,
    planId,
    areaId,
    locationId,
    preparationTasks,
    plantManifest,
    plantMapping,
  } = params;

  const today = new Date();
  const idMap = new Map<number, string>();

  for (const task of preparationTasks) {
    const targetDate = new Date(today);
    targetDate.setDate(targetDate.getDate() + task.task_index);
    const { data, error } = await supabase
      .from("tasks")
      .insert({
        home_id: homeId,
        plan_id: planId,
        location_id: locationId,
        area_id: areaId,
        title: task.title,
        description: task.description,
        type: "Maintenance",
        due_date: targetDate.toISOString().split("T")[0],
        status: "Pending",
      })
      .select("id")
      .single();
    if (error) throw error;
    idMap.set(task.task_index, data.id);
  }

  const dependenciesToInsert = [];
  for (const task of preparationTasks) {
    if (task.depends_on_index !== null && idMap.has(task.depends_on_index)) {
      dependenciesToInsert.push({
        task_id: idMap.get(task.task_index),
        depends_on_task_id: idMap.get(task.depends_on_index),
      });
    }
  }
  if (dependenciesToInsert.length > 0)
    await supabase.from("task_dependencies").insert(dependenciesToInsert);

  const lastPrepTaskIndex =
    preparationTasks.length > 0
      ? Math.max(...preparationTasks.map((t: any) => t.task_index))
      : -1;
  const lastPrepTaskId =
    lastPrepTaskIndex >= 0 ? idMap.get(lastPrepTaskIndex) : null;

  const { data: stagedItems } = await supabase
    .from("inventory_items")
    .select("id, plant_id")
    .eq("area_id", areaId)
    .eq("status", "Unplanted");

  const plantingTasks = plantManifest.map((plantDef: any, idx: number) => {
    const targetDate = new Date(today);
    targetDate.setDate(targetDate.getDate() + lastPrepTaskIndex + 1);

    const plantIdStr = plantMapping[idx];
    const matchingInventoryIds = stagedItems
      ? stagedItems
          .filter((item) => item.plant_id.toString() === plantIdStr)
          .map((item) => item.id)
      : [];

    return {
      home_id: homeId,
      plan_id: planId,
      location_id: locationId,
      area_id: areaId,
      title: `Plant ${plantDef.common_name} (x${plantDef.quantity})`,
      description: `Role: ${plantDef.role}\nAdvice: ${plantDef.procurement_advice}`,
      type: "Planting",
      due_date: targetDate.toISOString().split("T")[0],
      status: "Pending",
      inventory_item_ids: matchingInventoryIds,
    };
  });

  if (plantingTasks.length > 0) {
    const { data: pTasks, error: pError } = await supabase
      .from("tasks")
      .insert(plantingTasks)
      .select("id");
    if (pError) throw pError;
    if (lastPrepTaskId && pTasks) {
      const pDeps = pTasks.map((pt: any) => ({
        task_id: pt.id,
        depends_on_task_id: lastPrepTaskId,
      }));
      await supabase.from("task_dependencies").insert(pDeps);
    }
  }

  const { error: planError } = await supabase
    .from("plans")
    .update({ status: "In Progress" })
    .eq("id", planId);
  if (planError) throw planError;
}

export async function activateMaintenanceBlueprints(params: {
  homeId: string;
  planId: string;
  areaId: string;
  locationId: string | undefined;
  maintenanceTasks: any[];
}): Promise<void> {
  const { homeId, planId, areaId, locationId, maintenanceTasks } = params;

  const blueprintsToInsert = maintenanceTasks.map((task: any) => ({
    home_id: homeId,
    plan_id: planId,
    location_id: locationId,
    area_id: areaId,
    title: task.title,
    description: task.description,
    task_type: "Maintenance",
    frequency_days: task.frequency_days,
    is_recurring: true,
    is_auto_generated: true,
    start_date: new Date().toISOString().split("T")[0],
  }));

  if (blueprintsToInsert.length > 0) {
    const { error } = await supabase
      .from("task_blueprints")
      .insert(blueprintsToInsert);
    if (error) throw error;
  }

  const { error: planError } = await supabase
    .from("plans")
    .update({ status: "Completed" })
    .eq("id", planId);
  if (planError) throw planError;
}
