import React, { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import {
  CheckSquare,
  Clock,
  Droplets,
  Scissors,
  Shovel,
  Wheat,
  Loader2,
  Trash2,
  X,
  Leaf,
  AlertCircle,
  CalendarClock,
  Archive,
  Square,
  CheckSquare2,
  ListChecks,
  Lock,
  Grid,
  FolderKanban,
  CloudRain,
} from "lucide-react";
import toast from "react-hot-toast";
import { Logger } from "../lib/errorHandler";
import TaskModal from "./TaskModal";
import { TaskEngine } from "../lib/taskEngine";
import { getLocalDateString, formatDisplayDate } from "../lib/dateUtils";
import { AutomationEngine } from "../lib/automationEngine";
import { buildGhostPayload, hasBlockingDependencies } from "../lib/taskMutations";
import { scoreTaskByPlantPreferences } from "../hooks/useUserPreferences";
import { usePlantDoctor } from "../context/PlantDoctorContext";
import { logEvent, EVENT } from "../events/registry";

interface TaskListProps {
  homeId: string;
  areaId?: string;
  inventoryItemId?: string;
  planId?: string;
  targetDate?: Date;
  onTaskUpdated?: () => void;
  locationId?: string;
  selectedTypes?: string[];
  showOverdue?: boolean;
}


export default function TaskList({
  homeId,
  areaId,
  inventoryItemId,
  planId,
  targetDate,
  onTaskUpdated,
  locationId,
  selectedTypes,
  showOverdue,
}: TaskListProps) {
  const navigate = useNavigate();
  const { preferences } = usePlantDoctor();

  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUpdatingTask, setIsUpdatingTask] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<any | null>(null);
  const [inventoryDict, setInventoryDict] = useState<Record<string, any>>({});
  const [blockedTaskIds, setBlockedTaskIds] = useState<Set<string>>(new Set());
  const [viewTab, setViewTab] = useState<"pending" | "completed">("pending");

  const [isPostponing, setIsPostponing] = useState(false);
  const [postponeDate, setPostponeDate] = useState("");

  const [isBulkEditing, setIsBulkEditing] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(
    new Set(),
  );
  const [isBulkPostponing, setIsBulkPostponing] = useState(false);
  const [bulkPostponeDate, setBulkPostponeDate] = useState("");
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [deleteBlueprints, setDeleteBlueprints] = useState(false);
  const [shiftBlueprint, setShiftBlueprint] = useState(false);
  const [bulkShiftBlueprintIds, setBulkShiftBlueprintIds] = useState<Set<string>>(new Set());
  const [taskToDelete, setTaskToDelete] = useState<any | null>(null);
  const [archivePrompts, setArchivePrompts] = useState<
    { itemId: string; plantName: string }[] | null
  >(null);
  const [isArchiving, setIsArchiving] = useState(false);

  const dateStr = getLocalDateString(targetDate || new Date());
  const todayStr = getLocalDateString(new Date());
  const typesFilterStr = selectedTypes?.join(",") || "";

  useEffect(() => {
    setIsBulkEditing(false);
    setSelectedTaskIds(new Set());
  }, [viewTab]);

  useEffect(() => {
    if (selectedTask && isPostponing) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      setPostponeDate(getLocalDateString(tomorrow));
      setShiftBlueprint(false);
    }
  }, [selectedTask, isPostponing]);

  const fetchTasksAndGhosts = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const result = await TaskEngine.fetchTasksWithGhosts({
          homeId,
          startDateStr: dateStr,
          endDateStr: dateStr,
          includeOverdue: showOverdue || dateStr <= todayStr,
          todayStr,
        });

        setInventoryDict(result.inventoryDict);
        setBlockedTaskIds(result.blockedTaskIds);

        let filteredTasks = result.tasks;

        // Apply Local Component Filters
        if (areaId)
          filteredTasks = filteredTasks.filter((t) => t.area_id === areaId);
        if (planId)
          filteredTasks = filteredTasks.filter((t) => t.plan_id === planId);
        if (locationId && locationId !== "all")
          filteredTasks = filteredTasks.filter(
            (t) => t.location_id === locationId,
          );
        if (inventoryItemId)
          filteredTasks = filteredTasks.filter((t) =>
            t.inventory_item_ids?.includes(inventoryItemId),
          );
        if (typesFilterStr) {
          const typesArray = typesFilterStr.split(",");
          filteredTasks = filteredTasks.filter((t) =>
            typesArray.includes(t.type),
          );
        }

        filteredTasks.sort((a, b) => {
          if (a.status === "Completed" && b.status !== "Completed") return 1;
          if (a.status !== "Completed" && b.status === "Completed") return -1;
          return a.due_date.localeCompare(b.due_date);
        });

        setTasks(filteredTasks);
      } catch (err) {
        Logger.error("Failed", err);
        toast.error("Failed to load tasks. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [
      homeId,
      areaId,
      inventoryItemId,
      planId,
      dateStr,
      locationId,
      typesFilterStr,
      showOverdue,
      todayStr,
    ],
  );

  useEffect(() => {
    fetchTasksAndGhosts();
  }, [fetchTasksAndGhosts]);

  const toggleTaskSelection = (taskId: string) => {
    const newSet = new Set(selectedTaskIds);
    if (newSet.has(taskId)) newSet.delete(taskId);
    else newSet.add(taskId);
    setSelectedTaskIds(newSet);
  };

  const getSelectedTaskObjects = () =>
    tasks.filter((t) => selectedTaskIds.has(t.id));

  const handleBulkComplete = async () => {
    const selectedTasks = getSelectedTaskObjects();
    if (selectedTasks.length === 0) return;
    setIsBulkProcessing(true);
    const toastId = toast.loading(
      `Completing ${selectedTasks.length} tasks...`,
    );

    try {
      const ghostTasks = selectedTasks.filter((t) => t.isGhost);
      const physicalTasks = selectedTasks.filter((t) => !t.isGhost);
      const completedTime = new Date().toISOString();
      const todayString = completedTime.split("T")[0];

      if (ghostTasks.length > 0) {
        const payloads = ghostTasks.map((task) =>
          buildGhostPayload(task, "Completed", { completed_at: completedTime }),
        );
        const { error } = await supabase.from("tasks").insert(payloads);
        if (error) throw error;
      }

      if (physicalTasks.length > 0) {
        await Promise.all(
          physicalTasks.map((t) =>
            supabase
              .from("tasks")
              .update({ status: "Completed", completed_at: completedTime })
              .eq("id", t.id),
          ),
        );
      }

      selectedTasks.forEach((t) =>
        logEvent(EVENT.TASK_COMPLETED, {
          task_id: t.id,
          task_type: t.type,
          inventory_item_ids: t.inventory_item_ids ?? [],
        }),
      );
      toast.success(`${selectedTasks.length} tasks completed!`, {
        id: toastId,
      });

      // 🚀 TRIGGER AUTOMATION ENGINE FOR PLANTING TASKS
      const plantingTasks = selectedTasks.filter(
        (t) => t.type === "Planting" && t.inventory_item_ids?.length > 0,
      );
      if (plantingTasks.length > 0) {
        const plantIdsToUpdate = [
          ...new Set(plantingTasks.flatMap((t) => t.inventory_item_ids)),
        ];

        await supabase
          .from("inventory_items")
          .update({
            status: "Planted",
            growth_state: "Vegetative",
            planted_at: completedTime,
          })
          .in("id", plantIdsToUpdate);

        // Fetch the freshly planted items to run them through the Engine
        const { data: newlyPlantedItems } = await supabase
          .from("inventory_items")
          .select("*")
          .in("id", plantIdsToUpdate);
        if (newlyPlantedItems && newlyPlantedItems.length > 0) {
          // Group by area_id just in case the bulk complete spans multiple areas
          const itemsByArea = newlyPlantedItems.reduce(
            (acc, item) => {
              if (!acc[item.area_id]) acc[item.area_id] = [];
              acc[item.area_id].push(item);
              return acc;
            },
            {} as Record<string, any[]>,
          );

          for (const [aId, items] of Object.entries(itemsByArea)) {
            await AutomationEngine.applyPlantedAutomations(
              items,
              aId,
              todayString,
            );
          }
        }
      }

      const harvestedItems: any[] = [];
      selectedTasks
        .filter(
          (t) => t.type === "Harvesting" && t.inventory_item_ids?.length > 0,
        )
        .forEach((t) => {
          t.inventory_item_ids.forEach((id: string) => {
            harvestedItems.push({
              itemId: id,
              plantName: inventoryDict[id]?.plant_name || "Unknown Plant",
            });
          });
        });

      const uniqueHarvests = Array.from(
        new Map(harvestedItems.map((item) => [item.itemId, item])).values(),
      );
      if (uniqueHarvests.length > 0) setArchivePrompts(uniqueHarvests);

      setIsBulkEditing(false);
      setSelectedTaskIds(new Set());
      fetchTasksAndGhosts(true);
      onTaskUpdated?.();
    } catch (err) {
      toast.error("Failed to complete tasks.", { id: toastId });
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const handleBulkPostpone = async () => {
    if (!bulkPostponeDate) return toast.error("Please select a date.");
    const selectedTasks = getSelectedTaskObjects();
    if (selectedTasks.length === 0) return;
    setIsBulkProcessing(true);
    const toastId = toast.loading(
      `Postponing ${selectedTasks.length} tasks...`,
    );

    try {
      const ghostTasks = selectedTasks.filter((t) => t.isGhost);
      const physicalTasks = selectedTasks.filter((t) => !t.isGhost);

      if (ghostTasks.length > 0) {
        const payloads: any[] = [];
        ghostTasks.forEach((task) => {
          payloads.push(buildGhostPayload(task, "Skipped"));
          payloads.push(buildGhostPayload(task, "Pending", { due_date: bulkPostponeDate }));
        });
        const { error } = await supabase.from("tasks").insert(payloads);
        if (error) throw error;
      }

      if (physicalTasks.length > 0) {
        const blueprintPhysical = physicalTasks.filter((t: any) => t.blueprint_id);
        const purePhysical = physicalTasks.filter((t: any) => !t.blueprint_id);

        await Promise.all([
          ...blueprintPhysical.map(async (t: any) => {
            await supabase.from("tasks").update({ status: "Skipped" }).eq("id", t.id);
            await supabase.from("tasks").insert(
              buildGhostPayload(t, "Pending", { due_date: bulkPostponeDate }),
            );
          }),
          ...purePhysical.map((t: any) =>
            supabase.from("tasks").update({ due_date: bulkPostponeDate }).eq("id", t.id),
          ),
        ]);
      }

      if (bulkShiftBlueprintIds.size > 0) {
        // Build offset map from the first selected occurrence per blueprint
        const bpOffsets = new Map<string, number>();
        [...ghostTasks, ...physicalTasks.filter((t: any) => t.blueprint_id)].forEach((task: any) => {
          if (bpOffsets.has(task.blueprint_id)) return;
          const offset = Math.round(
            (new Date(bulkPostponeDate).getTime() - new Date(task.due_date).getTime()) / 86_400_000,
          );
          bpOffsets.set(task.blueprint_id, offset);
        });

        await Promise.all(
          Array.from(bulkShiftBlueprintIds).map(async (bpId) => {
            const offset = bpOffsets.get(bpId);
            if (offset === undefined) return;
            const { data: bp } = await supabase
              .from("task_blueprints")
              .select("start_date")
              .eq("id", bpId)
              .single();
            if (!bp?.start_date) return;
            const newStart = new Date(bp.start_date);
            newStart.setDate(newStart.getDate() + offset);
            await supabase
              .from("task_blueprints")
              .update({ start_date: getLocalDateString(newStart) })
              .eq("id", bpId);
          }),
        );
      }

      toast.success(`Tasks postponed!`, { id: toastId });
      setIsBulkEditing(false);
      setSelectedTaskIds(new Set());
      setIsBulkPostponing(false);
      setBulkShiftBlueprintIds(new Set());
      fetchTasksAndGhosts(true);
      onTaskUpdated?.();
    } catch (err) {
      toast.error("Failed to postpone tasks.", { id: toastId });
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const executeBulkDelete = async () => {
    const selectedTasks = getSelectedTaskObjects();
    if (selectedTasks.length === 0) return;
    setIsBulkProcessing(true);
    const toastId = toast.loading(`Removing ${selectedTasks.length} tasks...`);

    try {
      const hasBlueprints = selectedTasks.some((t) => t.blueprint_id);
      if (deleteBlueprints && hasBlueprints) {
        const blueprintIds = Array.from(
          new Set(
            selectedTasks
              .filter((t) => t.blueprint_id)
              .map((t) => t.blueprint_id),
          ),
        );
        if (blueprintIds.length > 0) {
          const { error: bpError } = await supabase
            .from("task_blueprints")
            .delete()
            .in("id", blueprintIds);
          if (bpError) throw bpError;
        }
        const pureIds = selectedTasks
          .filter((t) => !t.isGhost && !t.blueprint_id)
          .map((t) => t.id);
        if (pureIds.length > 0) {
          const { error } = await supabase
            .from("tasks")
            .delete()
            .in("id", pureIds);
          if (error) throw error;
        }
      } else {
        const ghostTasks = selectedTasks.filter((t) => t.isGhost);
        const physicalWithBlueprints = selectedTasks.filter(
          (t) => !t.isGhost && t.blueprint_id,
        );
        const physicalPure = selectedTasks.filter(
          (t) => !t.isGhost && !t.blueprint_id,
        );

        if (ghostTasks.length > 0) {
          const payloads = ghostTasks.map((task) =>
            buildGhostPayload(task, "Skipped"),
          );
          const { error } = await supabase.from("tasks").insert(payloads);
          if (error) throw error;
        }

        if (physicalWithBlueprints.length > 0) {
          await Promise.all(
            physicalWithBlueprints.map((t) =>
              supabase
                .from("tasks")
                .update({ status: "Skipped" })
                .eq("id", t.id),
            ),
          );
        }

        if (physicalPure.length > 0) {
          const pureIds = physicalPure.map((t) => t.id);
          const { error } = await supabase
            .from("tasks")
            .delete()
            .in("id", pureIds);
          if (error) throw error;
        }
      }
      selectedTasks.forEach((t) =>
        logEvent(EVENT.TASK_SKIPPED, {
          task_id: t.id,
          task_type: t.type,
          inventory_item_ids: t.inventory_item_ids ?? [],
        }),
      );
      toast.success(`Tasks removed!`, { id: toastId });
      setIsBulkEditing(false);
      setSelectedTaskIds(new Set());
      setShowBulkDeleteModal(false);
      fetchTasksAndGhosts(true);
      onTaskUpdated?.();
    } catch (err) {
      toast.error("Failed to remove tasks.", { id: toastId });
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const ensurePhysicalTask = async (taskObj: any) => {
    if (!taskObj.isGhost) return taskObj;
    const { data, error } = await supabase
      .from("tasks")
      .insert({
        home_id: taskObj.home_id,
        blueprint_id: taskObj.blueprint_id,
        title: taskObj.title,
        description: taskObj.description,
        type: taskObj.type,
        due_date: taskObj.due_date,
        status: "Pending",
        location_id: taskObj.location_id,
        area_id: taskObj.area_id,
        plan_id: taskObj.plan_id,
        inventory_item_ids: taskObj.inventory_item_ids,
      })
      .select()
      .single();

    if (error) throw error;
    const materializedTask = { ...data, isGhost: false };
    setTasks((prev) =>
      prev.map((t) => (t.id === taskObj.id ? materializedTask : t)),
    );
    return materializedTask;
  };

  const executeSingleDelete = async () => {
    if (!taskToDelete) return;
    setIsUpdatingTask(taskToDelete.id);
    try {
      if (deleteBlueprints && taskToDelete.blueprint_id) {
        const { error: bpError } = await supabase
          .from("task_blueprints")
          .delete()
          .eq("id", taskToDelete.blueprint_id);
        if (bpError) throw bpError;
        if (!taskToDelete.isGhost) {
          await supabase.from("tasks").delete().eq("id", taskToDelete.id);
        }
      } else {
        if (taskToDelete.isGhost) {
          await supabase
            .from("tasks")
            .insert([buildGhostPayload(taskToDelete, "Skipped")]);
        } else if (taskToDelete.blueprint_id) {
          await supabase
            .from("tasks")
            .update({ status: "Skipped" })
            .eq("id", taskToDelete.id);
        } else {
          await supabase.from("tasks").delete().eq("id", taskToDelete.id);
        }
      }
      toast.success("Task removed.");
      setTasks(tasks.filter((t) => t.id !== taskToDelete.id));
      setSelectedTask(null);
      setTaskToDelete(null);
      setDeleteBlueprints(false);
      onTaskUpdated?.();
      fetchTasksAndGhosts(true);
    } catch (err) {
      toast.error("Failed to remove task.");
    } finally {
      setIsUpdatingTask(null);
    }
  };

  const handlePostponeTask = async (task: any) => {
    if (!postponeDate) return toast.error("Please select a valid date.");
    if (postponeDate === task.due_date) return setIsPostponing(false);
    setIsUpdatingTask(task.id);
    try {
      if (task.isGhost) {
        // Ghost: tombstone the original slot, create Pending at new date
        await supabase.from("tasks").insert([
          buildGhostPayload(task, "Skipped"),
          buildGhostPayload(task, "Pending", { due_date: postponeDate }),
        ]);
      } else if (task.blueprint_id) {
        // Physical blueprint task: mark in-place as Skipped (tombstone so the ghost
        // engine won't re-generate a ghost at the now-vacated date), then insert a
        // new Pending task at the postponed date.
        await supabase.from("tasks").update({ status: "Skipped" }).eq("id", task.id);
        await supabase.from("tasks").insert(
          buildGhostPayload(task, "Pending", { due_date: postponeDate }),
        );
      } else {
        // Pure one-off task (no blueprint): just move it, no ghost to worry about
        await supabase.from("tasks").update({ due_date: postponeDate }).eq("id", task.id);
      }
      const offsetDays = Math.round(
        (new Date(postponeDate).getTime() - new Date(task.due_date).getTime()) / 86_400_000,
      );

      if (shiftBlueprint && task.blueprint_id) {
        const { data: bp } = await supabase
          .from("task_blueprints")
          .select("start_date")
          .eq("id", task.blueprint_id)
          .single();
        if (bp?.start_date) {
          const newStart = new Date(bp.start_date);
          newStart.setDate(newStart.getDate() + offsetDays);
          await supabase
            .from("task_blueprints")
            .update({ start_date: getLocalDateString(newStart) })
            .eq("id", task.blueprint_id);
        }
      }

      toast.success(`Task postponed to ${formatDisplayDate(postponeDate)}`);
      logEvent(EVENT.TASK_POSTPONED, {
        task_id: task.id,
        task_type: task.type,
        delay_days: offsetDays,
        inventory_item_ids: task.inventory_item_ids ?? [],
      });
      setSelectedTask(null);
      setIsPostponing(false);
      setShiftBlueprint(false);
      onTaskUpdated?.();
      fetchTasksAndGhosts(true);
    } catch (err) {
      toast.error("Failed to postpone task.");
    } finally {
      setIsUpdatingTask(null);
    }
  };

  const toggleTaskCompletion = async (task: any, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setIsUpdatingTask(task.id);
    const newStatus = task.status === "Completed" ? "Pending" : "Completed";

    if (newStatus === "Completed" && !task.isGhost) {
      try {
        if (await hasBlockingDependencies(task.id)) {
          toast.error("Cannot complete: Waiting on dependencies!");
          setIsUpdatingTask(null);
          return;
        }
      } catch (err) {
        console.error("Dependency check failed", err);
      }
    }

    try {
      let finalData = task;
      if (task.isGhost) {
        const { data, error } = await supabase
          .from("tasks")
          .insert([
            buildGhostPayload(task, newStatus, {
              completed_at: newStatus === "Completed" ? new Date().toISOString() : null,
            }),
          ])
          .select(
            `*, locations(name, is_outside), areas(name), plans(ai_blueprint, name)`,
          )
          .single();
        if (error) throw error;
        finalData = { ...data, isAutoCompleted: false };
      } else {
        const { error } = await supabase
          .from("tasks")
          .update({
            status: newStatus,
            completed_at:
              newStatus === "Completed" ? new Date().toISOString() : null,
          })
          .eq("id", task.id);
        if (error) throw error;
        finalData = { ...task, status: newStatus, isAutoCompleted: false };
      }
      setTasks(tasks.map((t) => (t.id === task.id ? finalData : t)));
      if (selectedTask?.id === task.id) {
        setSelectedTask(finalData);
      }
      if (newStatus === "Completed") toast.success("Task completed!");

      logEvent(
        newStatus === "Completed" ? EVENT.TASK_COMPLETED : EVENT.TASK_UNCOMPLETED,
        {
          task_id: finalData.id,
          task_type: finalData.type,
          inventory_item_ids: finalData.inventory_item_ids ?? [],
        },
      );

      // 🚀 TRIGGER AUTOMATION ENGINE FOR SINGLE PLANTING TASK
      if (
        newStatus === "Completed" &&
        finalData.type === "Planting" &&
        finalData.inventory_item_ids?.length > 0
      ) {
        const nowStr = new Date().toISOString();
        const todayString = nowStr.split("T")[0];

        await supabase
          .from("inventory_items")
          .update({
            status: "Planted",
            growth_state: "Vegetative",
            planted_at: nowStr,
          })
          .in("id", finalData.inventory_item_ids);

        // Fetch the freshly planted items to run them through the Engine
        const { data: newlyPlantedItems } = await supabase
          .from("inventory_items")
          .select("*")
          .in("id", finalData.inventory_item_ids);
        if (newlyPlantedItems && newlyPlantedItems.length > 0) {
          await AutomationEngine.applyPlantedAutomations(
            newlyPlantedItems,
            finalData.area_id,
            todayString,
          );
        }
      }

      if (
        newStatus === "Completed" &&
        finalData.type === "Harvesting" &&
        finalData.inventory_item_ids?.length > 0
      ) {
        const harvested = finalData.inventory_item_ids.map((id: string) => ({
          itemId: id,
          plantName: inventoryDict[id]?.plant_name || "this plant",
        }));
        setArchivePrompts(harvested);
      }
      onTaskUpdated?.();
    } catch (err) {
      toast.error("Update failed.");
    } finally {
      setIsUpdatingTask(null);
    }
  };

  const handleArchiveItems = async () => {
    if (!archivePrompts || archivePrompts.length === 0) return;
    setIsArchiving(true);
    try {
      const itemIds = archivePrompts.map((p) => p.itemId);
      const { error: updateError } = await supabase
        .from("inventory_items")
        .update({ status: "Archived" })
        .in("id", itemIds);
      if (updateError) throw updateError;

      // 🚀 TRIGGER ENGINE TO SCRUB TASKS INSTEAD OF DOING IT MANUALLY
      await AutomationEngine.scrubItemsFromAutomations(itemIds);

      toast.success(`Successfully archived ${archivePrompts.length} plant(s)!`);
      setArchivePrompts(null);
      setSelectedTask(null);
      fetchTasksAndGhosts(true);
      onTaskUpdated?.();
    } catch (err: any) {
      toast.error("Failed to archive plants.");
    } finally {
      setIsArchiving(false);
    }
  };

  const getTaskIcon = (type: string) => {
    switch (type) {
      case "Watering":
        return <Droplets size={16} className="text-blue-500" />;
      case "Maintenance":
        return <Scissors size={16} className="text-orange-500" />;
      case "Harvesting":
        return <Wheat size={16} className="text-yellow-500" />;
      case "Planting":
        return <Shovel size={16} className="text-amber-700" />;
      default:
        return <Clock size={16} className="text-gray-500" />;
    }
  };

  const pendingCount = tasks.filter((t) => t.status !== "Completed").length;
  const completedCount = tasks.filter((t) => t.status === "Completed").length;

  // Re-sort the active tab's tasks by preference score, preserving due_date order for ties.
  // JS sort is stable so equal-score tasks keep their existing relative order.
  // Must stay above the early loading return to satisfy Rules of Hooks.
  const filteredTasks = useMemo(() => {
    const tabTasks = tasks.filter((t) =>
      viewTab === "pending" ? t.status !== "Completed" : t.status === "Completed",
    );
    if (!preferences.length) return tabTasks;
    return [...tabTasks].sort((a, b) => {
      const scoreA = scoreTaskByPlantPreferences(a, inventoryDict, preferences);
      const scoreB = scoreTaskByPlantPreferences(b, inventoryDict, preferences);
      return scoreB - scoreA;
    });
  }, [tasks, viewTab, inventoryDict, preferences]);

  if (loading)
    return (
      <div className="space-y-3 animate-in fade-in">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="p-5 rounded-3xl border border-rhozly-outline/10 bg-white shadow-sm flex items-center justify-between animate-pulse"
          >
            <div className="flex items-center gap-4 w-full">
              <div className="w-10 h-10 shrink-0 rounded-2xl bg-gray-200" />
              <div className="flex-1 min-w-0">
                <div className="w-16 h-4 bg-gray-200 rounded-md mb-2" />
                <div className="w-48 h-5 bg-gray-300 rounded-md mb-2" />
                <div className="flex gap-2">
                  <div className="w-20 h-5 bg-gray-200 rounded-md" />
                  <div className="w-24 h-5 bg-gray-200 rounded-md" />
                </div>
              </div>
            </div>
            <div className="w-14 h-14 rounded-[1rem] bg-gray-200 hidden sm:block shrink-0" />
          </div>
        ))}
      </div>
    );

  return (
    <>
      {tasks.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 animate-in fade-in">
          <div className="flex bg-rhozly-surface-low p-1.5 rounded-2xl border border-rhozly-outline/5">
            <button
              onClick={() => setViewTab("pending")}
              className={`flex-1 px-6 py-2 rounded-xl text-sm font-black transition-all ${viewTab === "pending" ? "bg-white text-rhozly-primary shadow-sm border border-rhozly-primary/10" : "text-rhozly-on-surface/40 hover:text-rhozly-on-surface"}`}
            >
              Pending ({pendingCount})
            </button>
            <button
              onClick={() => setViewTab("completed")}
              className={`flex-1 px-6 py-2 rounded-xl text-sm font-black transition-all ${viewTab === "completed" ? "bg-white text-green-600 shadow-sm border border-green-100" : "text-rhozly-on-surface/40 hover:text-rhozly-on-surface"}`}
            >
              Completed ({completedCount})
            </button>
          </div>
          {viewTab === "pending" && pendingCount > 0 && !isBulkEditing && (
            <button
              onClick={() => setIsBulkEditing(true)}
              className="flex items-center justify-center gap-1.5 px-4 py-3 sm:py-2 bg-rhozly-surface-low rounded-xl text-xs font-black uppercase tracking-widest text-rhozly-on-surface/60 hover:text-rhozly-primary hover:bg-rhozly-primary/10 transition-colors"
            >
              <ListChecks size={16} /> Bulk Edit
            </button>
          )}
        </div>
      )}

      {filteredTasks.length === 0 ? (
        <div className="bg-rhozly-surface-lowest border-2 border-dashed border-rhozly-outline/10 rounded-[2rem] p-8 text-center opacity-50 animate-in fade-in">
          No tasks!
        </div>
      ) : (
        <div data-testid="task-list-container" className={`space-y-3 relative ${isBulkEditing ? "pb-24" : ""}`}>
          {isBulkEditing && viewTab === "pending" && (
            <div className="flex items-center gap-3 p-4 bg-rhozly-surface-low rounded-2xl border border-rhozly-outline/10 mb-2">
              <button
                onClick={() => {
                  const allPendingIds = filteredTasks
                    .filter((t) => t.status !== "Completed")
                    .map((t) => t.id);
                  if (selectedTaskIds.size === allPendingIds.length) {
                    setSelectedTaskIds(new Set());
                  } else {
                    setSelectedTaskIds(new Set(allPendingIds));
                  }
                }}
                className="w-6 h-6 shrink-0 rounded-lg flex items-center justify-center border-2 transition-all active:scale-90 hover:border-rhozly-primary"
                aria-label="Select all tasks"
              >
                {selectedTaskIds.size === filteredTasks.filter((t) => t.status !== "Completed").length &&
                selectedTaskIds.size > 0 ? (
                  <CheckSquare2 size={16} className="text-rhozly-primary" />
                ) : (
                  <Square size={16} className="text-rhozly-on-surface/40" />
                )}
              </button>
              <span className="text-xs font-bold text-rhozly-on-surface/60">
                Select All
              </span>
            </div>
          )}
          {filteredTasks.map((task) => {
            const invIds = task.inventory_item_ids || [];
            const activeInvIds = invIds.filter(
              (id: string) => inventoryDict[id]?.status !== "Archived",
            );
            const firstInv =
              activeInvIds.length > 0 ? inventoryDict[activeInvIds[0]] : null;

            const plantName = firstInv?.plant_name;
            const thumbnail = firstInv?.plants?.thumbnail_url;
            const count = activeInvIds.length;
            const planName =
              task.plans?.name ||
              task.plans?.ai_blueprint?.project_overview?.title;

            const isCompleted = task.status === "Completed";
            const isOverdue = !isCompleted && task.due_date < todayStr;
            const isBlocked = blockedTaskIds.has(task.id);
            const isSelected = selectedTaskIds.has(task.id);

            let cardStyle =
              "bg-white border-rhozly-outline/10 hover:border-rhozly-primary/30";
            if (isCompleted) {
              cardStyle = "opacity-60 bg-gray-50 border-rhozly-outline/10";
            } else if (isBlocked) {
              cardStyle = "bg-rhozly-surface-low border-gray-300 opacity-80";
            } else if (isOverdue) {
              cardStyle = "bg-red-100 border-red-300 hover:border-red-500 shadow-red-100";
            }
            if (isBulkEditing && isSelected) {
              cardStyle = "bg-rhozly-primary/5 border-rhozly-primary shadow-md";
            }

            return (
              <div
                key={task.id}
                data-ghost={task.isGhost ? "true" : undefined}
                onClick={() => {
                  if (isBulkEditing) {
                    if (!isCompleted) toggleTaskSelection(task.id);
                  } else {
                    setSelectedTask(task);
                  }
                }}
                tabIndex={0}
                role={isBulkEditing ? "checkbox" : "button"}
                aria-checked={isBulkEditing ? isSelected : undefined}
                aria-label={isBulkEditing ? `Select task: ${task.title}` : `View task: ${task.title}`}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    if (isBulkEditing) {
                      if (!isCompleted) toggleTaskSelection(task.id);
                    } else {
                      setSelectedTask(task);
                    }
                  }
                }}
                className={`p-5 rounded-3xl border shadow-sm flex items-center justify-between group relative transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-rhozly-primary focus:ring-offset-2 ${cardStyle}`}
              >
                {isBlocked && !isCompleted && !isBulkEditing && (
                  <div className="absolute -top-2 -right-2 z-10 text-[9px] font-black uppercase text-gray-500 bg-gray-200 px-3 py-1 rounded-full shadow-sm flex items-center gap-1 border border-gray-300">
                    <Lock size={10} /> Blocked
                  </div>
                )}

                <div className="flex items-center gap-4 w-full">
                  {!isBulkEditing && (
                    <button
                      onClick={(e) => toggleTaskCompletion(task, e)}
                      disabled={
                        isUpdatingTask === task.id ||
                        (isBlocked && !isCompleted)
                      }
                      aria-label={`Mark task "${task.title}" as ${isCompleted ? "incomplete" : "complete"}`}
                      className={`w-10 h-10 shrink-0 rounded-2xl flex items-center justify-center border-2 transition-all active:scale-90 ${isUpdatingTask === task.id ? "border-rhozly-primary/30" : isCompleted ? "bg-green-500 border-green-500 text-white" : isBlocked ? "border-gray-300 text-gray-400 bg-gray-200" : "border-rhozly-outline/20 hover:border-rhozly-primary text-transparent hover:text-rhozly-primary/30"}`}
                    >
                      {isUpdatingTask === task.id ? (
                        <Loader2
                          size={18}
                          className="animate-spin text-rhozly-primary"
                        />
                      ) : isBlocked && !isCompleted ? (
                        <Lock size={16} className="currentColor" />
                      ) : (
                        <CheckSquare size={18} className="currentColor" />
                      )}
                    </button>
                  )}
                  <div className="flex-1 min-w-0">
                    <span
                      className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md flex items-center gap-1 w-fit mb-1.5 ${isCompleted ? "bg-gray-200 text-gray-500" : "text-rhozly-primary bg-rhozly-primary/10"}`}
                    >
                      {getTaskIcon(task.type)} {task.type}
                    </span>
                    <h4
                      className={`font-black text-sm md:text-base leading-tight truncate ${isCompleted ? "line-through text-gray-500" : ""}`}
                    >
                      {task.title}
                    </h4>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {plantName && (
                        <div className="text-[10px] font-bold flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700">
                          <Leaf size={10} /> {plantName}{" "}
                          {count > 1 && `(x${count})`}
                        </div>
                      )}
                      {task.areas?.name && (
                        <div className="text-[10px] font-bold flex items-center gap-1 px-2 py-0.5 rounded-md bg-rhozly-primary-container text-rhozly-primary">
                          <Grid size={10} /> {task.areas.name}
                        </div>
                      )}
                      {planName && (
                        <div className="text-[10px] font-bold flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-50 text-purple-700">
                          <FolderKanban size={10} /> {planName}
                        </div>
                      )}
                      {task.auto_completed_reason && (
                        <div className="text-[10px] font-bold flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-50 text-sky-600" title={task.auto_completed_reason}>
                          <CloudRain size={10} /> Auto-watered
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-2 mt-3 sm:mt-0 sm:ml-4 shrink-0">
                  {!isBulkEditing && !isCompleted && (
                    <div className="flex items-center gap-1 bg-gray-50 border border-gray-100 rounded-xl p-0.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setTaskToDelete(task);
                        }}
                        className="p-3 min-w-[44px] min-h-[44px] sm:p-2 sm:min-w-0 sm:min-h-0 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-white rounded-lg transition-colors"
                        aria-label={`Remove task: ${task.title}`}
                        title="Remove Task"
                      >
                        <Trash2 size={16} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedTask(task);
                          setIsPostponing(true);
                        }}
                        className="p-3 min-w-[44px] min-h-[44px] sm:p-2 sm:min-w-0 sm:min-h-0 flex items-center justify-center text-gray-400 hover:text-blue-500 hover:bg-white rounded-lg transition-colors"
                        aria-label={`Postpone task: ${task.title}`}
                        title="Postpone Task"
                      >
                        <CalendarClock size={16} />
                      </button>
                    </div>
                  )}
                  {thumbnail && (
                    <img
                      src={thumbnail}
                      className={`w-14 h-14 rounded-[1rem] object-cover border border-rhozly-outline/10 hidden sm:block shrink-0 ml-2 ${isCompleted ? "grayscale opacity-50" : ""}`}
                      alt="plant"
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {typeof document !== "undefined" &&
        createPortal(
          <>
            {/* TASK MODAL */}
            {selectedTask &&
              !isBulkEditing &&
              !isPostponing &&
              !taskToDelete && (
                <TaskModal
                  task={selectedTask}
                  homeId={homeId}
                  inventoryDict={inventoryDict}
                  isBlocked={blockedTaskIds.has(selectedTask.id)}
                  isUpdating={isUpdatingTask === selectedTask.id}
                  materializeTask={ensurePhysicalTask}
                  onClose={() => setSelectedTask(null)}
                  onDelete={() => setTaskToDelete(selectedTask)}
                  onPostpone={() => setIsPostponing(true)}
                  onToggleComplete={() => toggleTaskCompletion(selectedTask)}
                  onTasksUpdated={() => {
                    fetchTasksAndGhosts(true);
                    onTaskUpdated?.();
                  }}
                />
              )}

            {/* SINGLE TASK POSTPONE MODAL */}
            {selectedTask && isPostponing && (
              <div
                className="fixed inset-0 z-[105] flex items-center justify-center p-4 bg-rhozly-bg/90 backdrop-blur-sm animate-in fade-in"
                onClick={() => setIsPostponing(false)}
              >
                <div
                  className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl border border-rhozly-outline/10 flex flex-col"
                  onClick={(e) => e.stopPropagation()}
                >
                  <h3 className="text-xl font-black mb-2">Postpone Task</h3>
                  <p className="text-sm font-bold text-gray-500 mb-6">
                    Select a new date for this task.
                  </p>
                  <div className="flex flex-col gap-4">
                    <input
                      type="date"
                      value={postponeDate}
                      min={todayStr}
                      onChange={(e) => setPostponeDate(e.target.value)}
                      className="w-full p-4 bg-rhozly-surface-low rounded-xl font-bold border border-rhozly-outline/10 focus:border-rhozly-primary outline-none"
                    />
                    {(selectedTask.isGhost || selectedTask.blueprint_id) &&
                      postponeDate &&
                      postponeDate !== selectedTask.due_date && (() => {
                        const offsetDays = Math.round(
                          (new Date(postponeDate).getTime() - new Date(selectedTask.due_date).getTime()) / 86_400_000,
                        );
                        return (
                          <label
                            data-testid="shift-blueprint-toggle"
                            className="flex items-center gap-3 p-4 bg-rhozly-surface-low rounded-2xl border border-rhozly-outline/10 cursor-pointer hover:bg-rhozly-primary/5 transition-colors"
                          >
                            <input
                              type="checkbox"
                              checked={shiftBlueprint}
                              onChange={(e) => setShiftBlueprint(e.target.checked)}
                              className="accent-rhozly-primary w-5 h-5 shrink-0"
                            />
                            <span className="text-sm font-bold text-rhozly-on-surface leading-snug">
                              Shift all future{" "}
                              <span className="text-rhozly-primary">"{selectedTask.title}"</span>{" "}
                              tasks ({offsetDays > 0 ? "+" : ""}{offsetDays}d)
                            </span>
                          </label>
                        );
                      })()}
                    <div className="flex gap-2">
                      <button
                        onClick={() => setIsPostponing(false)}
                        disabled={isUpdatingTask === selectedTask.id}
                        className="flex-1 py-4 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold rounded-xl transition-all"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handlePostponeTask(selectedTask)}
                        disabled={isUpdatingTask === selectedTask.id}
                        className="flex-1 py-4 bg-rhozly-primary hover:bg-rhozly-primary/90 text-white font-black rounded-xl transition-all flex items-center justify-center"
                      >
                        {isUpdatingTask === selectedTask.id ? (
                          <Loader2 className="animate-spin" size={20} />
                        ) : (
                          "Confirm"
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* BULK ACTIONS MODALS */}
            {isBulkEditing && (
              <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-full max-w-md px-4 z-[90] animate-in slide-in-from-bottom-8">
                <div className="bg-white rounded-[2rem] shadow-2xl border border-rhozly-outline/20 p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between px-2">
                    <span className="text-sm font-black text-rhozly-on-surface">
                      {selectedTaskIds.size} selected
                    </span>
                    <button
                      onClick={() => setIsBulkEditing(false)}
                      className="text-xs font-bold text-rhozly-on-surface/50 hover:text-rhozly-on-surface uppercase tracking-widest"
                    >
                      Cancel
                    </button>
                  </div>
                  {isBulkPostponing ? (
                    <div className="flex flex-col gap-3">
                      <div className="flex gap-2">
                        <input
                          type="date"
                          value={bulkPostponeDate}
                          min={todayStr}
                          onChange={(e) => setBulkPostponeDate(e.target.value)}
                          className="flex-1 p-3 bg-rhozly-surface-low rounded-xl font-bold border border-rhozly-outline/10 focus:border-rhozly-primary outline-none"
                        />
                        <button
                          onClick={() => { setIsBulkPostponing(false); setBulkShiftBlueprintIds(new Set()); }}
                          className="px-4 py-3 bg-gray-100 font-bold rounded-xl text-gray-500 hover:bg-gray-200"
                        >
                          <X size={18} />
                        </button>
                        <button
                          onClick={handleBulkPostpone}
                          disabled={isBulkProcessing || !bulkPostponeDate}
                          className="px-6 py-3 bg-rhozly-primary hover:bg-rhozly-primary/90 text-white font-black rounded-xl transition-all disabled:opacity-50 flex items-center justify-center min-w-[80px]"
                        >
                          {isBulkProcessing ? (
                            <Loader2 className="animate-spin" size={18} />
                          ) : (
                            <CheckSquare size={18} />
                          )}
                        </button>
                      </div>
                      {/* Per-blueprint shift toggles — only appear when a date is chosen */}
                      {bulkPostponeDate && (() => {
                        const bpMap = new Map<string, { id: string; title: string; offsetDays: number }>();
                        getSelectedTaskObjects().forEach((task) => {
                          if (!task.blueprint_id || bpMap.has(task.blueprint_id)) return;
                          const offset = Math.round(
                            (new Date(bulkPostponeDate).getTime() - new Date(task.due_date).getTime()) / 86_400_000,
                          );
                          bpMap.set(task.blueprint_id, { id: task.blueprint_id, title: task.title, offsetDays: offset });
                        });
                        if (bpMap.size === 0) return null;
                        return (
                          <div className="flex flex-col gap-2 pt-1">
                            <p className="text-xs font-bold text-rhozly-on-surface/50 uppercase tracking-widest px-1">
                              Also shift all future tasks
                            </p>
                            {Array.from(bpMap.values()).map((bp) => (
                              <label
                                key={bp.id}
                                data-testid={`bulk-shift-blueprint-${bp.id}`}
                                className="flex items-center gap-3 p-3 bg-rhozly-surface-low rounded-xl cursor-pointer hover:bg-rhozly-primary/5 transition-colors"
                              >
                                <input
                                  type="checkbox"
                                  checked={bulkShiftBlueprintIds.has(bp.id)}
                                  onChange={(e) => {
                                    const next = new Set(bulkShiftBlueprintIds);
                                    e.target.checked ? next.add(bp.id) : next.delete(bp.id);
                                    setBulkShiftBlueprintIds(next);
                                  }}
                                  className="accent-rhozly-primary w-4 h-4 shrink-0"
                                />
                                <span className="text-sm font-bold text-rhozly-on-surface leading-snug">
                                  "{bp.title}"{" "}
                                  <span className="font-normal text-rhozly-on-surface/60">
                                    ({bp.offsetDays > 0 ? "+" : ""}{bp.offsetDays}d)
                                  </span>
                                </span>
                              </label>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={handleBulkComplete}
                        disabled={
                          selectedTaskIds.size === 0 || isBulkProcessing
                        }
                        className="flex-1 py-3 bg-rhozly-primary text-white rounded-xl font-black shadow-md hover:bg-rhozly-primary/90 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                      >
                        {isBulkProcessing ? (
                          <Loader2 className="animate-spin" size={16} />
                        ) : (
                          <CheckSquare size={16} />
                        )}{" "}
                        Done
                      </button>
                      <button
                        onClick={() => setIsBulkPostponing(true)}
                        disabled={
                          selectedTaskIds.size === 0 || isBulkProcessing
                        }
                        className="flex-1 py-3 bg-rhozly-primary-container text-rhozly-primary rounded-xl font-black transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 hover:bg-rhozly-primary/20"
                      >
                        <CalendarClock size={16} /> Postpone
                      </button>
                      <button
                        onClick={() => {
                          setDeleteBlueprints(false);
                          setShowBulkDeleteModal(true);
                        }}
                        disabled={
                          selectedTaskIds.size === 0 || isBulkProcessing
                        }
                        className="flex-1 py-3 bg-red-100 text-red-600 rounded-xl font-black transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 hover:bg-red-200"
                      >
                        <Trash2 size={16} /> Remove
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* BULK DELETE MODAL */}
            {showBulkDeleteModal && (
              <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-rhozly-bg/95 backdrop-blur-md animate-in fade-in zoom-in-95">
                <div className="bg-white w-full max-w-md rounded-[3rem] p-8 shadow-2xl border border-rhozly-outline/10 flex flex-col items-center text-center relative overflow-hidden">
                  <button
                    onClick={() => setShowBulkDeleteModal(false)}
                    className="absolute top-6 right-6 p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors"
                  >
                    <X size={20} className="text-gray-600" />
                  </button>
                  <div className="w-20 h-20 bg-red-100 text-red-500 rounded-full flex items-center justify-center mb-6 shadow-inner">
                    <Trash2 size={40} />
                  </div>
                  <h3 className="text-2xl font-black leading-tight text-rhozly-on-surface mb-2">
                    Remove Tasks
                  </h3>
                  <p className="text-sm font-bold text-rhozly-on-surface/60 mb-6 leading-relaxed">
                    You are about to remove{" "}
                    <span className="font-black text-rhozly-primary">
                      {selectedTaskIds.size}
                    </span>{" "}
                    task(s) from your schedule.
                  </p>
                  {getSelectedTaskObjects().some((t) => t.blueprint_id) && (
                    <label className="flex items-center gap-3 p-4 bg-red-100/60 rounded-2xl border border-red-200 cursor-pointer mb-6 text-left w-full hover:bg-red-100 transition-colors">
                      <input
                        type="checkbox"
                        checked={deleteBlueprints}
                        onChange={(e) => setDeleteBlueprints(e.target.checked)}
                        className="accent-red-500 w-5 h-5 shrink-0"
                      />
                      <div>
                        <p className="text-sm font-black text-red-900">
                          Delete recurring schedules?
                        </p>
                        <p className="text-[10px] font-bold text-red-700/70 mt-0.5 leading-tight">
                          This will permanently stop these specific tasks from
                          ever appearing again in the future.
                        </p>
                      </div>
                    </label>
                  )}
                  <div className="flex flex-col sm:flex-row gap-3 w-full mt-2">
                    <button
                      onClick={() => setShowBulkDeleteModal(false)}
                      disabled={isBulkProcessing}
                      className="flex-1 py-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-2xl font-black transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={executeBulkDelete}
                      disabled={isBulkProcessing}
                      className="flex-1 py-4 bg-red-500 hover:bg-red-600 text-white rounded-2xl font-black shadow-lg transition-colors flex items-center justify-center gap-2"
                    >
                      {isBulkProcessing ? (
                        <Loader2 className="animate-spin" size={20} />
                      ) : (
                        "Remove Tasks"
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* SINGLE TASK DELETE MODAL */}
            {taskToDelete && (
              <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-rhozly-bg/95 backdrop-blur-md animate-in fade-in zoom-in-95">
                <div className="bg-white w-full max-w-md rounded-[3rem] p-8 shadow-2xl border border-rhozly-outline/10 flex flex-col items-center text-center relative overflow-hidden">
                  <button
                    onClick={() => {
                      setTaskToDelete(null);
                      setDeleteBlueprints(false);
                    }}
                    className="absolute top-6 right-6 p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors"
                  >
                    <X size={20} className="text-gray-600" />
                  </button>
                  <div className="w-20 h-20 bg-red-100 text-red-500 rounded-full flex items-center justify-center mb-6 shadow-inner">
                    <Trash2 size={40} />
                  </div>
                  <h3 className="text-2xl font-black leading-tight text-rhozly-on-surface mb-2">
                    Remove Task
                  </h3>
                  <p className="text-sm font-bold text-rhozly-on-surface/60 mb-6 leading-relaxed">
                    You are about to remove this task from your schedule.
                  </p>
                  {taskToDelete.blueprint_id && (
                    <label className="flex items-center gap-3 p-4 bg-red-100/60 rounded-2xl border border-red-200 cursor-pointer mb-6 text-left w-full hover:bg-red-100 transition-colors">
                      <input
                        type="checkbox"
                        checked={deleteBlueprints}
                        onChange={(e) => setDeleteBlueprints(e.target.checked)}
                        className="accent-red-500 w-5 h-5 shrink-0"
                      />
                      <div>
                        <p className="text-sm font-black text-red-900">
                          Delete recurring schedule?
                        </p>
                        <p className="text-[10px] font-bold text-red-700/70 mt-0.5 leading-tight">
                          This will permanently stop this specific task from
                          ever appearing again in the future.
                        </p>
                      </div>
                    </label>
                  )}
                  <div className="flex flex-col sm:flex-row gap-3 w-full mt-2">
                    <button
                      onClick={() => {
                        setTaskToDelete(null);
                        setDeleteBlueprints(false);
                      }}
                      disabled={isUpdatingTask === taskToDelete.id}
                      className="flex-1 py-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-2xl font-black transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={executeSingleDelete}
                      disabled={isUpdatingTask === taskToDelete.id}
                      className="flex-1 py-4 bg-red-500 hover:bg-red-600 text-white rounded-2xl font-black shadow-lg transition-colors flex items-center justify-center gap-2"
                    >
                      {isUpdatingTask === taskToDelete.id ? (
                        <Loader2 className="animate-spin" size={20} />
                      ) : (
                        "Remove Task"
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ARCHIVE HARVEST PROMPT */}
            {archivePrompts && archivePrompts.length > 0 && (
              <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-rhozly-bg/95 backdrop-blur-md animate-in fade-in zoom-in-95">
                <div className="bg-white w-full max-w-md rounded-[3rem] p-8 shadow-2xl border border-rhozly-outline/10 flex flex-col items-center text-center relative overflow-hidden">
                  <div className="absolute top-0 inset-x-0 h-2 bg-gradient-to-r from-amber-400 to-orange-500" />
                  <div className="w-20 h-20 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mb-6 shadow-inner">
                    <Archive size={40} />
                  </div>
                  <h3 className="text-2xl font-black leading-tight text-rhozly-on-surface mb-2">
                    Harvest Complete!
                  </h3>
                  <p className="text-sm font-bold text-rhozly-on-surface/60 mb-6 leading-relaxed">
                    You've harvested{" "}
                    {archivePrompts.length > 1
                      ? `${archivePrompts.length} plants`
                      : "a plant"}
                    . If they are finished for the season, you can retire them
                    to your History.
                  </p>
                  <div className="w-full bg-rhozly-surface-lowest border border-rhozly-outline/10 rounded-2xl p-4 mb-8 max-h-32 overflow-y-auto custom-scrollbar text-left space-y-2">
                    {archivePrompts.map((p, idx) => (
                      <p
                        key={idx}
                        className="text-xs font-black text-rhozly-on-surface flex items-center gap-2"
                      >
                        <Wheat size={12} className="text-amber-500" />{" "}
                        {p.plantName}
                      </p>
                    ))}
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3 w-full">
                    <button
                      onClick={() => setArchivePrompts(null)}
                      disabled={isArchiving}
                      className="flex-1 py-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-2xl font-black transition-colors"
                    >
                      Keep in Shed
                    </button>
                    <button
                      onClick={handleArchiveItems}
                      disabled={isArchiving}
                      className="flex-1 py-4 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl font-black shadow-lg transition-colors flex items-center justify-center gap-2"
                    >
                      {isArchiving ? (
                        <Loader2 className="animate-spin" size={20} />
                      ) : (
                        "Archive All"
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>,
          document.body,
        )}
    </>
  );
}
