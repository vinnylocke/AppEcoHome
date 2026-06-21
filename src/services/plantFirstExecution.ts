// Materialise a plant-first plan into real garden state — looped per area group.
// Reuses `saveToShed` for plant-catalogue resolution and the same task /
// task_blueprint column shapes as PlanStaging. Idempotency is best-effort:
// catalogue rows are de-duped by common_name within the home so re-running
// doesn't pile up duplicate `plants` rows.

import { supabase } from "../lib/supabase";
import { saveToShed } from "../lib/saveToShed";
import type { PlantFirstBlueprint } from "../lib/plantFirstPlan";

export interface PlantFirstExecutionResult {
  areasCreated: number;
  plantsAdded: number;
  prepTasksAdded: number;
  maintenanceBlueprintsAdded: number;
}

export async function executePlantFirstPlan(params: {
  homeId: string;
  planId: string;
  blueprint: PlantFirstBlueprint;
}): Promise<PlantFirstExecutionResult> {
  const { homeId, planId, blueprint } = params;
  const today = new Date();
  const iso = (d: Date) => d.toISOString().split("T")[0];

  // A location is needed to hang any NEW area off. Use the home's first.
  const { data: locs } = await supabase
    .from("locations")
    .select("id")
    .eq("home_id", homeId)
    .order("created_at", { ascending: true })
    .limit(1);
  const defaultLocationId: string | null = locs?.[0]?.id ?? null;

  // De-dupe catalogue rows by common_name so re-running / shed-sourced plants
  // reuse the existing `plants` row instead of creating a copy.
  const { data: existingPlants } = await supabase
    .from("plants")
    .select("id, common_name")
    .eq("home_id", homeId);
  const plantIdByName = new Map<string, number>();
  for (const p of existingPlants ?? []) {
    if (p.common_name) plantIdByName.set(String(p.common_name).toLowerCase(), p.id as number);
  }

  const result: PlantFirstExecutionResult = {
    areasCreated: 0,
    plantsAdded: 0,
    prepTasksAdded: 0,
    maintenanceBlueprintsAdded: 0,
  };

  for (const area of blueprint.areas) {
    // ── Resolve the area ──
    let areaId: string | null = area.existing_area_id ?? null;
    let locationId: string | null = defaultLocationId;

    if (areaId) {
      const { data: ar } = await supabase
        .from("areas")
        .select("location_id")
        .eq("id", areaId)
        .maybeSingle();
      locationId = (ar?.location_id as string | null) ?? defaultLocationId;
    } else if (defaultLocationId) {
      const { data: newArea, error } = await supabase
        .from("areas")
        .insert({
          location_id: defaultLocationId,
          name: area.area_name,
          sunlight: area.suggested_sunlight ?? null,
          growing_medium: area.suggested_medium ?? null,
        })
        .select("id")
        .single();
      if (!error && newArea) {
        areaId = newArea.id as string;
        result.areasCreated += 1;
      }
    }

    // ── Add the group's plants to the Shed ──
    for (const plant of area.plants) {
      const key = plant.common_name.toLowerCase();
      let plantId = plantIdByName.get(key);
      if (!plantId) {
        try {
          const { plantId: newId } = await saveToShed(
            {
              common_name: plant.common_name,
              scientific_name: plant.scientific_name ? [plant.scientific_name] : null,
              source: "ai",
            },
            undefined,
            homeId,
          );
          plantId = newId;
          plantIdByName.set(key, newId);
        } catch {
          continue; // skip a plant that won't resolve; never break the plan
        }
      }
      const qty = Math.max(1, Math.min(99, plant.quantity || 1));
      const rows = Array.from({ length: qty }, () => ({
        home_id: homeId,
        location_id: locationId,
        area_id: areaId,
        plant_id: plantId,
        plant_name: plant.common_name,
        status: "Unplanted",
      }));
      const { error } = await supabase.from("inventory_items").insert(rows);
      if (!error) result.plantsAdded += rows.length;
    }

    // ── Prep tasks (one-off, staggered) ──
    const prepRows = area.preparation_tasks.map((t, i) => ({
      home_id: homeId,
      plan_id: planId,
      location_id: locationId,
      area_id: areaId,
      title: t.title,
      description: t.description,
      type: "Maintenance",
      due_date: iso(new Date(today.getTime() + (i + 1) * 86_400_000)),
      status: "Pending",
    }));
    if (prepRows.length) {
      const { error } = await supabase.from("tasks").insert(prepRows);
      if (!error) result.prepTasksAdded += prepRows.length;
    }

    // ── Recurring maintenance blueprints ──
    const bpRows = area.maintenance_tasks.map((t) => ({
      home_id: homeId,
      plan_id: planId,
      location_id: locationId,
      area_id: areaId,
      title: t.title,
      description: t.description,
      task_type: "Maintenance",
      frequency_days: t.frequency_days,
      is_recurring: true,
      is_auto_generated: true,
      start_date: iso(today),
    }));
    if (bpRows.length) {
      const { error } = await supabase.from("task_blueprints").insert(bpRows);
      if (!error) result.maintenanceBlueprintsAdded += bpRows.length;
    }
  }

  await supabase.from("plans").update({ status: "In Progress" }).eq("id", planId);
  return result;
}
