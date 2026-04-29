import { supabase } from "./supabase";
import { Logger } from "./errorHandler";
import { getLocalDateString } from "./taskEngine";

export const AutomationEngine = {
  calculateSeasonalDate(
    reference: string | null | undefined,
    offsetDays: number | null | undefined,
    baseDateStr: string,
  ) {
    const [y, m, d] = baseDateStr.split("-").map(Number);
    const targetDate = new Date(y, m - 1, d);

    if (reference && reference.startsWith("Seasonal:")) {
      const parts = reference.split(":");
      if (parts.length >= 2) {
        const [refMonth, refDay] = parts[1].split("-").map(Number);
        targetDate.setMonth(refMonth - 1, refDay);
      }
    }

    if (offsetDays) {
      targetDate.setDate(targetDate.getDate() + offsetDays);
    }

    return getLocalDateString(targetDate);
  },

  async applyPlantedAutomations(
    itemsToPlant: any[],
    targetAreaId: string,
    baseDateStr: string,
  ) {
    if (!itemsToPlant.length) return;

    try {
      const grouped = itemsToPlant.reduce(
        (acc, item) => {
          if (!acc[item.plant_id]) acc[item.plant_id] = [];
          acc[item.plant_id].push(item.id);
          return acc;
        },
        {} as Record<string, string[]>,
      );

      const { data: existingBps } = await supabase
        .from("task_blueprints")
        .select("*")
        .eq("area_id", targetAreaId);

      for (const [plantId, itemIds] of Object.entries(grouped)) {
        const { data: schedules } = await supabase
          .from("plant_schedules")
          .select("*")
          .eq("plant_id", plantId)
          .eq("trigger_event", "Planted");

        if (schedules && schedules.length > 0) {
          for (const sch of schedules) {
            const matchingBp = existingBps?.find(
              (bp) => bp.title === sch.title && bp.task_type === sch.task_type,
            );

            if (matchingBp) {
              const updatedIds = Array.from(
                new Set([...(matchingBp.inventory_item_ids || []), ...itemIds]),
              );
              await supabase
                .from("task_blueprints")
                .update({ inventory_item_ids: updatedIds })
                .eq("id", matchingBp.id);

              const { data: pendingTasks } = await supabase
                .from("tasks")
                .select("id, inventory_item_ids")
                .eq("blueprint_id", matchingBp.id)
                .eq("status", "Pending");
              if (pendingTasks) {
                for (const pt of pendingTasks) {
                  const updatedTaskIds = Array.from(
                    new Set([...(pt.inventory_item_ids || []), ...itemIds]),
                  );
                  await supabase
                    .from("tasks")
                    .update({ inventory_item_ids: updatedTaskIds })
                    .eq("id", pt.id);
                }
              }
            } else {
              const computedStartDate = this.calculateSeasonalDate(
                sch.start_reference,
                sch.start_offset_days,
                baseDateStr,
              );
              const computedEndDate = sch.end_reference
                ? this.calculateSeasonalDate(
                    sch.end_reference,
                    sch.end_offset_days,
                    baseDateStr,
                  )
                : null;

              const { data: createdBp } = await supabase
                .from("task_blueprints")
                .insert({
                  home_id: itemsToPlant[0].home_id,
                  location_id: itemsToPlant[0].location_id,
                  area_id: targetAreaId,
                  title: sch.title,
                  description: sch.description,
                  task_type: sch.task_type,
                  frequency_days: sch.frequency_days,
                  is_recurring: sch.is_recurring,
                  start_date: computedStartDate,
                  end_date: computedEndDate,
                  inventory_item_ids: itemIds,
                  priority: "Medium",
                })
                .select()
                .single();

              if (createdBp) {
                // Only insert an initial physical task if today is within the seasonal window.
                // Otherwise let the ghost engine spawn it when the season arrives.
                let initialTaskDate: string | null = null;
                if (
                  baseDateStr >= computedStartDate &&
                  (!computedEndDate || baseDateStr <= computedEndDate)
                ) {
                  initialTaskDate = baseDateStr;
                }

                if (initialTaskDate) {
                  // Clamp to today: if the user backdated their planting, the first task
                  // should still be due today, not in the past.
                  const todayStr = new Date().toISOString().split("T")[0];
                  const dueDate = initialTaskDate < todayStr ? todayStr : initialTaskDate;
                  await supabase.from("tasks").insert({
                    home_id: createdBp.home_id,
                    blueprint_id: createdBp.id,
                    title: createdBp.title,
                    description: createdBp.description,
                    type: createdBp.task_type,
                    due_date: dueDate,
                    status: "Pending",
                    location_id: createdBp.location_id,
                    area_id: createdBp.area_id,
                    inventory_item_ids: createdBp.inventory_item_ids,
                  });
                }
              }
            }
          }
        }
      }
    } catch (e) {
      Logger.error("Failed to apply planted automations", e);
      throw e;
    }
  },

  ailmentTaskType(stepType: string): string {
    const map: Record<string, string> = {
      inspect: "Inspection",
      spray: "Pest Control",
      prune: "Pruning",
      remove: "Maintenance",
      water: "Watering",
      fertilize: "Fertilizing",
      other: "Maintenance",
    };
    return map[stepType] ?? stepType;
  },

  frequencyDays(frequencyType: string, everyNDays?: number | null): number | null {
    switch (frequencyType) {
      case "daily":       return 1;
      case "every_n_days": return everyNDays ?? 7;
      case "weekly":      return 7;
      case "monthly":     return 30;
      default:            return null; // "once"
    }
  },

  async applyAilmentAutomations(
    plantInstance: { id: string; home_id: string; location_id: string; area_id: string },
    ailment: {
      id: string;
      prevention_steps: any[];
      remedy_steps: any[];
    },
    baseDateStr: string,
  ) {
    const allSteps = [
      ...ailment.prevention_steps.map((s: any) => ({ ...s, step_group: "prevention" })),
      ...ailment.remedy_steps.map((s: any) => ({ ...s, step_group: "remedy" })),
    ];

    if (!allSteps.length) return;

    try {
      const { data: existingBps } = await supabase
        .from("task_blueprints")
        .select("*")
        .eq("ailment_id", ailment.id)
        .eq("area_id", plantInstance.area_id);

      for (const step of allSteps) {
        const freqDays = this.frequencyDays(step.frequency_type, step.frequency_every_n_days);
        const isRecurring = freqDays !== null;

        const matchingBp = existingBps?.find((bp: any) => bp.title === step.title);

        if (matchingBp) {
          const updatedIds = Array.from(
            new Set([...(matchingBp.inventory_item_ids || []), plantInstance.id]),
          );
          await supabase
            .from("task_blueprints")
            .update({ inventory_item_ids: updatedIds })
            .eq("id", matchingBp.id);
        } else {
          const { data: createdBp } = await supabase
            .from("task_blueprints")
            .insert({
              home_id: plantInstance.home_id,
              location_id: plantInstance.location_id,
              area_id: plantInstance.area_id,
              ailment_id: ailment.id,
              blueprint_type: "ailment",
              title: step.title,
              description: step.description,
              task_type: step.task_type,
              frequency_days: freqDays,
              is_recurring: isRecurring,
              start_date: baseDateStr,
              end_date: null,
              inventory_item_ids: [plantInstance.id],
              priority: "Medium",
            })
            .select()
            .single();

          if (createdBp) {
            await supabase.from("tasks").insert({
              home_id: createdBp.home_id,
              blueprint_id: createdBp.id,
              title: createdBp.title,
              description: createdBp.description,
              type: this.ailmentTaskType(createdBp.task_type),
              due_date: baseDateStr,
              status: "Pending",
              location_id: createdBp.location_id,
              area_id: createdBp.area_id,
              inventory_item_ids: createdBp.inventory_item_ids,
            });
          }
        }
      }
    } catch (e) {
      Logger.error("Failed to apply ailment automations", e);
      throw e;
    }
  },

  async scrubItemsFromAutomations(itemIds: string[]) {
    if (!itemIds.length) return;
    try {
      const { data: linkedBps } = await supabase
        .from("task_blueprints")
        .select("id, inventory_item_ids")
        .overlaps("inventory_item_ids", itemIds);
      if (linkedBps) {
        for (const bp of linkedBps) {
          const newIds = bp.inventory_item_ids.filter(
            (id: string) => !itemIds.includes(id),
          );
          if (newIds.length === 0)
            await supabase.from("task_blueprints").delete().eq("id", bp.id);
          else
            await supabase
              .from("task_blueprints")
              .update({ inventory_item_ids: newIds })
              .eq("id", bp.id);
        }
      }
      const { data: linkedTasks } = await supabase
        .from("tasks")
        .select("id, inventory_item_ids")
        .overlaps("inventory_item_ids", itemIds);
      if (linkedTasks) {
        for (const task of linkedTasks) {
          const newIds = task.inventory_item_ids.filter(
            (id: string) => !itemIds.includes(id),
          );
          if (newIds.length === 0)
            await supabase.from("tasks").delete().eq("id", task.id);
          else
            await supabase
              .from("tasks")
              .update({ inventory_item_ids: newIds })
              .eq("id", task.id);
        }
      }
    } catch (e) {
      Logger.error("Failed to scrub items", e);
      throw e;
    }
  },
};
