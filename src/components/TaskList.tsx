import React, { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useBetaFeedbackContext } from "../context/BetaFeedbackContext";
import { supabase } from "../lib/supabase";
import { isTaskVisibleOnDate } from "../lib/taskFilters";
import { maybeCreateAutoEntry } from "../services/journalAutoUpdateService";
import { shouldPromptForSowing } from "../services/sowingAutoCreateService";
import LogSowingFromTaskModal from "./nursery/LogSowingFromTaskModal";
import HarvestEndOfLifePrompt from "./HarvestEndOfLifePrompt";
import { useHarvestYieldGate } from "../hooks/useHarvestYieldGate";
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
  Square,
  CheckSquare2,
  CheckCircle2,
  ListChecks,
  Lock,
  Grid,
  FolderKanban,
  CloudRain,
  Repeat,
} from "lucide-react";
import toast from "react-hot-toast";
import { Logger } from "../lib/errorHandler";
import { enqueue as enqueueWrite, getQueue, remove as removeQueued } from "../lib/offlineQueue";
import TaskModal from "./TaskModal";
import { TaskEngine, lateCompletionDueDate, completedLocalDate } from "../lib/taskEngine";
import { getLocalDateString, formatDisplayDate } from "../lib/dateUtils";
import { taskDueLabel } from "../lib/taskDueLabel";
import { taskListEmptyVariant } from "../lib/taskListEmptyState";
import { AutomationEngine } from "../lib/automationEngine";
import { buildGhostPayload, hasBlockingDependencies } from "../lib/taskMutations";
import { materialiseGhost, postponeTask } from "../lib/taskActions";
import { spawnBurst } from "../lib/burst";
import EmptyState from "./shared/EmptyState";
import { scoreTaskByPlantPreferences } from "../hooks/useUserPreferences";
import { usePlantDoctor } from "../context/PlantDoctorContext";
import { logEvent, EVENT } from "../events/registry";
import { useHomeRealtime } from "../hooks/useHomeRealtime";
import { usePermissions } from "../context/HomePermissionsContext";

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
  preloadedTasks?: any[];
  preloadedInventoryDict?: Record<string, any>;
  preloadedBlockedTaskIds?: Set<string>;
  /**
   * Mobile Quick Access Wave 3 — slim variant used by /quick/calendar.
   * Hides the Pending/Completed tab bar, scope filter, and bulk-edit
   * toolbar. Filters to today's pending tasks only. Renders a tappable
   * "View calendar →" link at the bottom (unless `hideCalendarLink`). Default false.
   */
  compact?: boolean;
  /** Compact-mode status view override (2026-07-22 — the tray's Today/Completed
   *  tabs). "completed" shows today's completed tasks (undo stays inline);
   *  omitted/"pending" keeps the classic compact behaviour. Ignored when
   *  `compact` is false — the full board owns its own tab bar. */
  compactView?: "pending" | "completed";
  /** Suppress the compact-mode "View calendar →" footer. The home passes this
   *  because it wraps the list with its own prominent "Open board →" / "See all"
   *  header — the footer would be a duplicate. /quick/calendar keeps the footer
   *  (it's that surface's only hop to the full week board). */
  hideCalendarLink?: boolean;
  /** When the opened task belongs to a to-do list, the modal renders a pill
   *  that calls this with the list id so the host can open ToDoListsModal. */
  onOpenToDoList?: (listId: string) => void;
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
  preloadedTasks,
  preloadedInventoryDict,
  preloadedBlockedTaskIds,
  compact = false,
  compactView,
  hideCalendarLink = false,
  onOpenToDoList,
}: TaskListProps) {
  const navigate = useNavigate();
  const { preferences } = usePlantDoctor();
  const { can } = usePermissions();
  const { requestFeedback } = useBetaFeedbackContext();

  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [scopeFilter, setScopeFilter] = useState<"all" | "home" | "mine" | "assigned">("all");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, []);
  const [isUpdatingTask, setIsUpdatingTask] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<any | null>(null);
  const [inventoryDict, setInventoryDict] = useState<Record<string, any>>({});
  const [blockedTaskIds, setBlockedTaskIds] = useState<Set<string>>(new Set());
  const [viewTabState, setViewTab] = useState<"pending" | "completed">("pending");
  // Compact hosts (the tray) drive the status view from their own tabs — the
  // internal tab bar is hidden there, so the prop is the only switch.
  const viewTab = compact && compactView ? compactView : viewTabState;

  const [isPostponing, setIsPostponing] = useState(false);
  const [postponeDate, setPostponeDate] = useState("");

  /** When set, the LogSowingFromTaskModal renders and asks the user to
   *  log the sowing this just-completed task represents. Queue is drained
   *  one-at-a-time (head queued, modal close → shift). */
  const [pendingSowingPrompts, setPendingSowingPrompts] = useState<
    Array<{ taskId: string; packetId: string; title: string }>
  >([]);

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
  /** Queue of harvest tasks whose inventory items should be offered an
   *  optional "mark as End of Life" prompt. Drained one at a time so the
   *  user reviews one task at a time even when many were just completed
   *  in a bulk action. */
  const [pendingHarvestEolPrompts, setPendingHarvestEolPrompts] = useState<
    Array<{ taskId: string; taskTitle: string; inventoryItemIds: string[] }>
  >([]);
  const { requestHarvestComplete, harvestYieldSheet } = useHarvestYieldGate(homeId);

  // Queue the End-of-Life prompt for a just-completed harvest task.
  const queueHarvestEol = (t: { id: string; title: string; inventory_item_ids?: string[] }) =>
    setPendingHarvestEolPrompts((prev) => [
      ...prev,
      { taskId: t.id, taskTitle: t.title, inventoryItemIds: (t.inventory_item_ids ?? []) as string[] },
    ]);

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
      const args = {
        homeId,
        startDateStr: dateStr,
        endDateStr: dateStr,
        includeOverdue: showOverdue || dateStr <= todayStr,
        todayStr,
      };

      // Local filter + sort applied to the engine's raw task list before
      // we hand it to React. Called from both the phase-1 callback (no
      // inventory yet) and the final resolution (full enrichment).
      const filterAndSort = (rawTasks: any[]): any[] => {
        let next = rawTasks;
        // Wave 20+ snooze / harvest-window gate. The engine deliberately
        // returns snoozed tasks; every list consumer that renders a single
        // day has to drop them itself. Without this filter the Dashboard
        // "Today's Tasks" panel kept showing a "Not yet → 3 days" harvest
        // on day 0 (and every day after). Completed tasks bypass the
        // visibility check so the user still sees what they ticked off
        // today on the calendar agenda.
        next = next.filter((t) => {
          if (t.status === "Completed") return true;
          return isTaskVisibleOnDate(t, dateStr, {
            includeOverdue: showOverdue || dateStr <= todayStr,
          });
        });
        if (areaId) next = next.filter((t) => t.area_id === areaId);
        if (planId) next = next.filter((t) => t.plan_id === planId);
        if (locationId && locationId !== "all") {
          next = next.filter((t) => t.location_id === locationId);
        }
        if (inventoryItemId) {
          next = next.filter((t) => t.inventory_item_ids?.includes(inventoryItemId));
        }
        if (typesFilterStr) {
          const typesArray = typesFilterStr.split(",");
          next = next.filter((t) => typesArray.includes(t.type));
        }
        return [...next].sort((a, b) => {
          if (a.status === "Completed" && b.status !== "Completed") return 1;
          if (a.status !== "Completed" && b.status === "Completed") return -1;
          return a.due_date.localeCompare(b.due_date);
        });
      };

      // Stale-while-revalidate — hydrate immediately from the cache if a
      // recent fetch landed within the TTL. Lets navigation back to a
      // TaskList feel instant.
      const cached = TaskEngine.peekCache(args);
      if (cached) {
        setInventoryDict(cached.inventoryDict);
        setBlockedTaskIds(cached.blockedTaskIds);
        setTasks(filterAndSort(cached.tasks));
        setLoading(false);
      } else if (!silent) {
        setLoading(true);
      }

      try {
        const result = await TaskEngine.fetchTasksWithGhosts({
          ...args,
          // Incremental paint — once Round 1 + ghost materialisation lands
          // (~150ms typical), render the list with titles/types/dates.
          // Inventory thumbnails + dependency badges fill in when the
          // full promise resolves.
          onTasksReady: (snapshot) => {
            setTasks(filterAndSort(snapshot.tasks));
            setLoading(false);
          },
        });

        setInventoryDict(result.inventoryDict);
        setBlockedTaskIds(result.blockedTaskIds);
        setTasks(filterAndSort(result.tasks));
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
    if (preloadedTasks === undefined) return;
    const sorted = [...preloadedTasks].sort((a, b) => {
      if (a.status === "Completed" && b.status !== "Completed") return 1;
      if (a.status !== "Completed" && b.status === "Completed") return -1;
      return a.due_date.localeCompare(b.due_date);
    });
    setTasks(sorted);
    if (preloadedInventoryDict !== undefined) setInventoryDict(preloadedInventoryDict);
    if (preloadedBlockedTaskIds !== undefined) setBlockedTaskIds(preloadedBlockedTaskIds);
    setLoading(false);
  }, [preloadedTasks, preloadedInventoryDict, preloadedBlockedTaskIds]);

  useEffect(() => {
    if (preloadedTasks !== undefined) return;
    fetchTasksAndGhosts();
  }, [fetchTasksAndGhosts, preloadedTasks]);

  const fetchTasksAndGhostsSilent = useCallback(() => {
    // Realtime ticks mean someone changed tasks/blueprints elsewhere. Drop
    // the home's cached entries so any other TaskList instances (and the
    // background revalidation here) start from a clean slate.
    TaskEngine.invalidateCache(homeId);
    return fetchTasksAndGhosts(true);
  }, [fetchTasksAndGhosts, homeId]);
  useHomeRealtime("tasks", fetchTasksAndGhostsSilent);
  useHomeRealtime("task_blueprints", fetchTasksAndGhostsSilent);

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
          buildGhostPayload(task, "Completed", { completed_at: completedTime, completed_by: currentUserId }),
        );
        const { error } = await supabase.from("tasks").insert(payloads);
        if (error) throw error;
      }

      if (physicalTasks.length > 0) {
        // Check each result — supabase-js resolves with { error } instead of
        // throwing, so an RLS/permission failure would otherwise still show
        // "N tasks completed!" while nothing changed (bug-audit-2026-07-10).
        const results = await Promise.all(
          physicalTasks.map((t) =>
            supabase
              .from("tasks")
              .update({ status: "Completed", completed_at: completedTime, completed_by: currentUserId })
              .eq("id", t.id),
          ),
        );
        const firstErr = results.find((r) => r.error)?.error;
        if (firstErr) throw firstErr;
      }

      selectedTasks.forEach((t) =>
        logEvent(EVENT.TASK_COMPLETED, {
          task_id: t.id,
          task_type: t.type,
          inventory_item_ids: t.inventory_item_ids ?? [],
        }),
      );

      // Auto-update journal — fire-and-forget per task; the service
      // reads the user's per-category preferences and no-ops when off.
      if (currentUserId) {
        selectedTasks.forEach((t) => {
          maybeCreateAutoEntry(
            {
              id: t.id,
              title: t.title,
              type: t.type,
              inventory_item_ids: t.inventory_item_ids ?? [],
            },
            { homeId, userId: currentUserId },
          );
        });
      }

      // Queue inline sowing prompts for any packet-linked Planting tasks.
      const sowingTasks = selectedTasks.filter((t) =>
        shouldPromptForSowing({
          id: t.id,
          title: t.title,
          type: t.type,
          seed_packet_id: t.seed_packet_id ?? null,
        }),
      );
      if (sowingTasks.length > 0) {
        setPendingSowingPrompts((prev) => [
          ...prev,
          ...sowingTasks.map((t) => ({
            taskId: t.id,
            packetId: t.seed_packet_id as string,
            title: t.title as string,
          })),
        ]);
      }

      toast.success(`${selectedTasks.length} tasks completed!`, {
        id: toastId,
      });
      requestFeedback("complete_task", { task_type: selectedTasks[0]?.type });

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
              // Cast: reduce over untyped supabase rows infers `unknown`.
              items as any[],
              aId,
              todayString,
            );
          }
        }
      }

      const harvestTasks = selectedTasks.filter(
        (t) => t.type === "Harvesting" && t.inventory_item_ids?.length > 0,
      );
      if (harvestTasks.length > 0) {
        setPendingHarvestEolPrompts((prev) => [
          ...prev,
          ...harvestTasks.map((t) => ({
            taskId: t.id,
            taskTitle: t.title,
            inventoryItemIds: t.inventory_item_ids as string[],
          })),
        ]);
        // Bulk complete skips the per-task yield prompt (a stack of sheets would
        // be hostile). Tell the user so they can log yields manually if wanted.
        toast(
          `No yield recorded for ${harvestTasks.length} bulk-completed harvest${harvestTasks.length === 1 ? "" : "s"} — open each to log a yield.`,
          { icon: "🌾" },
        );
      }

      setIsBulkEditing(false);
      setSelectedTaskIds(new Set());
      fetchTasksAndGhosts(true);
      onTaskUpdated?.();
    } catch (err) {
      Logger.error("Bulk complete tasks failed", err, { homeId }, "Failed to complete tasks.");
      toast.dismiss(toastId);
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
            const { error: skipErr } = await supabase.from("tasks").update({ status: "Skipped" }).eq("id", t.id);
            if (skipErr) throw skipErr;
            const { error: insErr } = await supabase.from("tasks").insert(
              buildGhostPayload(t, "Pending", { due_date: bulkPostponeDate }),
            );
            if (insErr) {
              // supabase-js doesn't throw — without this the task was just
              // Skipped with NO replacement Pending row and silently vanished
              // (bug-audit-2026-07-10, TaskList bulk data loss).
              if ((insErr as { code?: string })?.code === "23505") {
                // A row already occupies (blueprint_id, due_date) — e.g. a
                // Skipped tombstone. Revive it to Pending instead of losing the
                // task (mirrors taskActions.postponeTask's fallback).
                const { error: updErr } = await supabase.from("tasks")
                  .update({ status: "Pending" })
                  .eq("blueprint_id", t.blueprint_id)
                  .eq("due_date", bulkPostponeDate);
                if (updErr) throw updErr;
              } else {
                // Revert the skip so the task isn't lost, then surface the error.
                await supabase.from("tasks").update({ status: t.status ?? "Pending" }).eq("id", t.id);
                throw insErr;
              }
            }
          }),
          ...purePhysical.map(async (t: any) => {
            const { error } = await supabase.from("tasks").update({ due_date: bulkPostponeDate }).eq("id", t.id);
            if (error) throw error; // don't toast "postponed!" on a silent failure
          }),
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
      Logger.error("Bulk postpone tasks failed", err, { homeId }, "Failed to postpone tasks.");
      toast.dismiss(toastId);
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
      Logger.error("Bulk delete tasks failed", err, { homeId }, "Failed to remove tasks.");
      toast.dismiss(toastId);
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
        // Wave-20 — window tasks need the close date carried through so
        // the materialised row preserves its "active in window" semantics.
        window_end_date: taskObj.window_end_date ?? null,
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
      Logger.error("Single delete task failed", err, { homeId, taskId: taskToDelete?.id }, "Failed to remove task.");
    } finally {
      setIsUpdatingTask(null);
    }
  };

  const handlePostponeTask = async (task: any) => {
    if (!postponeDate) return toast.error("Please select a valid date.");
    if (postponeDate === task.due_date) return setIsPostponing(false);
    setIsUpdatingTask(task.id);
    try {
      // Shared mutation core (src/lib/taskActions.ts) — ghost tombstone +
      // re-insert, blueprint skip + re-insert, or standalone move. Also
      // fires the task_postponed event.
      await postponeTask(task, postponeDate);
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
          // Pure-UTC shift: date-only strings parse as UTC midnight, so
          // formatting via local getters slid the grid an extra day back
          // for users west of UTC.
          const startMs = Date.parse(`${String(bp.start_date).split("T")[0]}T00:00:00Z`);
          const newStartStr = new Date(startMs + offsetDays * 86_400_000)
            .toISOString()
            .split("T")[0];
          await supabase
            .from("task_blueprints")
            .update({ start_date: newStartStr })
            .eq("id", task.blueprint_id);
        }
      }

      toast.success(`Task postponed to ${formatDisplayDate(postponeDate)}`);
      // task_postponed event is logged inside postponeTask (taskActions).
      setSelectedTask(null);
      setIsPostponing(false);
      setShiftBlueprint(false);
      onTaskUpdated?.();
      fetchTasksAndGhosts(true);
    } catch (err) {
      Logger.error("Postpone task failed", err, { homeId, taskId: task.id, postponeDate }, "Failed to postpone task.");
    } finally {
      setIsUpdatingTask(null);
    }
  };

  const toggleTaskCompletion = async (task: any, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setIsUpdatingTask(task.id);
    const newStatus = task.status === "Completed" ? "Pending" : "Completed";

    // Capture the burst origin synchronously — currentTarget is nulled once
    // the event finishes dispatching, which is before our first await resolves.
    let burstOrigin: { x: number; y: number } | null = null;
    if (newStatus === "Completed" && e?.currentTarget instanceof HTMLElement) {
      const r = e.currentTarget.getBoundingClientRect();
      burstOrigin = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }

    if (newStatus === "Completed" && !task.isGhost) {
      try {
        if (await hasBlockingDependencies(task.id)) {
          toast.error("Cannot complete: Waiting on dependencies!");
          setIsUpdatingTask(null);
          return;
        }
      } catch (err) {
        Logger.error("Dependency check failed", err);
      }
    }

    try {
      const completedAt = newStatus === "Completed" ? new Date().toISOString() : null;
      let finalData = task;

      // Optimistically reflect the toggle locally before the round trip so
      // the UI feels instant. We undo it in the catch below if the request
      // doesn't end up queueing or completing.
      const optimisticTask = { ...task, status: newStatus, completed_at: completedAt, isAutoCompleted: false };
      setTasks((prev) => prev.map((t) => (t.id === task.id ? optimisticTask : t)));
      if (selectedTask?.id === task.id) setSelectedTask(optimisticTask);

      // Celebration moment — leaf burst from the tapped control the instant
      // the task optimistically completes (motionTier-gated inside spawnBurst).
      if (burstOrigin) spawnBurst(burstOrigin.x, burstOrigin.y);

      if (task.isGhost) {
        // Shared mutation core (src/lib/taskActions.ts) — handles the
        // unique_blueprint_date race by falling back to UPDATE when the
        // slot was already materialised from another surface (e.g. the
        // Garden Walk).
        const data = await materialiseGhost(
          task,
          newStatus,
          {
            completed_at: completedAt,
            completed_by: newStatus === "Completed" ? currentUserId : null,
          },
          `*, locations(name, is_outside), areas(name), plans(ai_blueprint, name)`,
        );
        finalData = { ...data, isAutoCompleted: false };
      } else {
        const { error } = await supabase
          .from("tasks")
          .update({
            status: newStatus,
            completed_at: completedAt,
            completed_by: newStatus === "Completed" ? currentUserId : null,
          })
          .eq("id", task.id);
        if (error) {
          // If we're offline, queue the write and keep the optimistic UI.
          // We only queue real tasks — ghost tasks need a multi-step insert
          // that's harder to replay safely.
          if (typeof navigator !== "undefined" && navigator.onLine === false) {
            // One queued status per task: a refetch while offline repaints
            // the task as Pending (queued state isn't overlaid on fetches),
            // so users tap complete again — replace the older entry instead
            // of queueing a duplicate.
            for (const q of getQueue()) {
              if (q.kind === "task-status" && q.taskId === task.id) removeQueued(q.id);
            }
            enqueueWrite({
              kind: "task-status",
              taskId: task.id,
              status: newStatus,
              completedAt,
              completedBy: newStatus === "Completed" ? currentUserId : null,
            });
            toast.success(newStatus === "Completed"
              ? "Marked done — will sync when you're back online."
              : "Reopened — will sync when you're back online.");
            setIsUpdatingTask(null);
            return;
          }
          throw error;
        }
        finalData = { ...task, status: newStatus, isAutoCompleted: false };
      }
      setTasks((prev) => prev.map((t) => (t.id === task.id ? finalData : t)));
      if (selectedTask?.id === task.id) {
        setSelectedTask(finalData);
      }
      if (newStatus === "Completed") {
        toast.success("Task completed!");
        requestFeedback("complete_task", { task_type: finalData.type });
      }

      logEvent(
        newStatus === "Completed" ? EVENT.TASK_COMPLETED : EVENT.TASK_UNCOMPLETED,
        {
          task_id: finalData.id,
          task_type: finalData.type,
          inventory_item_ids: finalData.inventory_item_ids ?? [],
        },
      );

      // Auto-update journal — only on completion, never on uncomplete.
      if (newStatus === "Completed" && currentUserId) {
        maybeCreateAutoEntry(
          {
            id: finalData.id,
            title: finalData.title,
            type: finalData.type,
            inventory_item_ids: finalData.inventory_item_ids ?? [],
          },
          { homeId, userId: currentUserId },
        );
      }

      // Sowing prompt — only for Planting tasks with a packet link.
      if (
        newStatus === "Completed" &&
        shouldPromptForSowing({
          id: finalData.id,
          title: finalData.title,
          type: finalData.type,
          seed_packet_id: finalData.seed_packet_id ?? null,
        })
      ) {
        setPendingSowingPrompts((prev) => [
          ...prev,
          {
            taskId: finalData.id,
            packetId: finalData.seed_packet_id,
            title: finalData.title,
          },
        ]);
      }

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
        // The task is already completed; prompt for the yield (split-evenly or
        // per-plant), then queue the End-of-Life prompt. Any way the yield sheet
        // closes still proceeds to End-of-Life (the harvest is already done).
        requestHarvestComplete(finalData, () => queueHarvestEol(finalData), {
          onDismiss: () => queueHarvestEol(finalData),
        });
      }
      onTaskUpdated?.();
    } catch (err) {
      // Undo the optimistic toggle — the comment above always promised
      // this, but the catch never did it: an online failure (500, RLS)
      // left the task shown Completed while the server said Pending.
      setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
      if (selectedTask?.id === task.id) setSelectedTask(task);
      Logger.error("Toggle task completion failed", err, { homeId, taskId: task.id, newStatus }, "Update failed.");
    } finally {
      setIsUpdatingTask(null);
    }
  };

  const getTaskIcon = (type: string) => {
    switch (type) {
      case "Watering":
        return <Droplets size={16} className="text-blue-500" />;
      case "Maintenance":
        return <Scissors size={16} className="text-orange-500" />;
      case "Pruning":
        return <Scissors size={16} className="text-lime-600" />;
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
    let tabTasks = tasks.filter((t) =>
      viewTab === "pending" ? t.status !== "Completed" : t.status === "Completed",
    );
    if (scopeFilter === "home") {
      tabTasks = tabTasks.filter((t) => t.scope === "home");
    } else if (scopeFilter === "mine" && currentUserId) {
      tabTasks = tabTasks.filter((t) => t.created_by === currentUserId);
    } else if (scopeFilter === "assigned" && currentUserId) {
      tabTasks = tabTasks.filter((t) => t.assigned_to === currentUserId);
    }
    if (!preferences.length) return tabTasks;
    return [...tabTasks].sort((a, b) => {
      const scoreA = scoreTaskByPlantPreferences(a, inventoryDict, preferences);
      const scoreB = scoreTaskByPlantPreferences(b, inventoryDict, preferences);
      return scoreB - scoreA;
    });
  }, [tasks, viewTab, inventoryDict, preferences, scopeFilter, currentUserId]);

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
      {tasks.length > 0 && !compact && (
        <div className="flex flex-col gap-3 mb-4 animate-in fade-in">
          <div className="flex flex-wrap sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex bg-rhozly-surface-low p-1.5 rounded-2xl border border-rhozly-outline/5 min-w-0">
              <button
                onClick={() => setViewTab("pending")}
                className={`flex-1 px-3 sm:px-4 py-2 rounded-xl text-sm font-black transition-all ${viewTab === "pending" ? "bg-white text-rhozly-primary shadow-sm border border-rhozly-primary/10" : "text-rhozly-on-surface/40 hover:text-rhozly-on-surface"}`}
              >
                Pending ({pendingCount})
              </button>
              <button
                onClick={() => setViewTab("completed")}
                className={`flex-1 px-3 sm:px-4 py-2 rounded-xl text-sm font-black transition-all ${viewTab === "completed" ? "bg-white text-green-600 shadow-sm border border-green-100" : "text-rhozly-on-surface/40 hover:text-rhozly-on-surface"}`}
              >
                Completed ({completedCount})
              </button>
            </div>
            {viewTab === "pending" && pendingCount > 0 && !isBulkEditing && (
              <button
                onClick={() => setIsBulkEditing(true)}
                className="shrink-0 flex items-center justify-center gap-1.5 px-4 py-2 bg-rhozly-surface-low rounded-xl text-xs font-black uppercase tracking-widest text-rhozly-on-surface/60 hover:text-rhozly-primary hover:bg-rhozly-primary/10 transition-colors"
              >
                <ListChecks size={16} /> Bulk Edit
              </button>
            )}
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {(["all", "home", "mine", "assigned"] as const).map((f) => {
              const labels: Record<string, string> = { all: "All", home: "Home", mine: "Mine", assigned: "Assigned to me" };
              if (f === "mine" && !can("tasks.create_personal")) return null;
              if (f === "assigned" && !currentUserId) return null;
              return (
                <button
                  key={f}
                  data-testid={`task-scope-filter-${f}`}
                  onClick={() => setScopeFilter(f)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${scopeFilter === f ? "bg-rhozly-primary text-white" : "bg-rhozly-surface-low text-rhozly-on-surface/50 hover:text-rhozly-on-surface"}`}
                >
                  {labels[f]}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {filteredTasks.length === 0 ? (
        // B1 (dashboard-nav-tasks-tray Stage 3): three empty states, not one
        // "Set up a Routine" pitch. Clearing your last task is rewarded with a
        // celebration, not a setup ad; a genuinely quiet day says so; and only a
        // task-less list keeps the setup CTA. In compact mode (home / tray) it
        // renders small + chrome-less so it isn't a giant dashed card mid-feed.
        compact && viewTab === "completed" ? (
          // Tray Completed tab (2026-07-22) — its own quiet empty state; the
          // pending variants' copy ("All done" / setup CTA) reads wrong here.
          <EmptyState
            data-testid="task-list-empty-completed"
            size="sm"
            chrome="none"
            className="animate-in fade-in"
            icon={<CheckCircle2 size={22} />}
            title="Nothing ticked off yet"
            body="Tasks you complete today will collect here."
          />
        ) : taskListEmptyVariant(pendingCount, completedCount) === "all-done" ? (
          <EmptyState
            data-testid="task-list-empty"
            {...(compact ? { size: "sm" as const, chrome: "none" as const } : {})}
            className="animate-in fade-in"
            icon={<CheckCircle2 size={compact ? 22 : 28} />}
            title="All done"
            body="Nice work — nothing left on the list."
          />
        ) : (
          <EmptyState
            data-testid="task-list-empty"
            {...(compact ? { size: "sm" as const, chrome: "none" as const } : {})}
            className="animate-in fade-in"
            icon={<CheckSquare size={compact ? 22 : 28} />}
            title="Nothing on the list"
            body="You're all caught up. New here? Set up a routine and tasks appear here automatically."
            primaryCta={{
              label: "Set up a Routine",
              onClick: () => navigate("/schedule"),
              "data-testid": "task-list-empty-cta",
            }}
          />
        )
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
                className="w-6 h-6 pointer-coarse:w-11 pointer-coarse:h-11 shrink-0 rounded-lg flex items-center justify-center border-2 transition-all active:scale-90 can-hover:hover:border-rhozly-primary"
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
            // RHO-19 — a completed-late task shows a "Completed late" chip
            // wherever it renders (calendar agenda, Dashboard/Today list). The
            // caller may pre-annotate (calendar agenda), otherwise derive it
            // from the task itself so the Today list gets the chip too.
            const lateDue = task.lateCompletionFrom ?? lateCompletionDueDate(task) ?? undefined;
            const lateDone = task.lateCompletedOn ?? (lateDue ? completedLocalDate(task) ?? undefined : undefined);
            // A completed SEASONAL WINDOW task (harvest, or pruning since
            // 2026-07) shows WHEN it was done — the whole window closes on
            // completion, so surfacing the date makes clear "this was done on
            // X" even when it's not flagged late. Suppressed when the late chip
            // already shows a date.
            const isHarvestTask = task.type === "Harvesting" || task.type === "Harvest";
            const isPruningWindowTask = task.type === "Pruning" && !!task.window_end_date;
            const windowDoneOn =
              isCompleted && (isHarvestTask || isPruningWindowTask) && !lateDue
                ? completedLocalDate(task) ?? undefined
                : undefined;
            const windowDoneLabel = isPruningWindowTask ? "Pruning completed" : "Harvest completed";
            // Wave-20 — harvest tasks are "in window" while
            // due_date <= today <= window_end_date. They're styled green
            // and aren't overdue until the window closes.
            const isInHarvestWindow = !!task.window_end_date
              && task.due_date <= todayStr
              && todayStr <= task.window_end_date
              && !isCompleted;
            const isOverdue = !isCompleted && (
              task.window_end_date
                ? task.window_end_date < todayStr
                : task.due_date < todayStr
            );
            const isToday = !isCompleted && !isOverdue && !isInHarvestWindow && task.due_date === todayStr;
            const isBlocked = blockedTaskIds.has(task.id);
            const isSelected = selectedTaskIds.has(task.id);

            // B2 (dashboard-nav-tasks-tray Stage 2): a plain-language due label
            // so overdue is never colour-only (an a11y gap) and every row states
            // when it's due — the compact home/tray list has no calendar column.
            // Logic is the pure, unit-tested `taskDueLabel` helper.
            const dueLabel = taskDueLabel({
              dueDate: task.due_date,
              windowEndDate: task.window_end_date,
              todayStr,
              isCompleted,
              isOverdue,
              isInHarvestWindow,
              hasOverdueChip: !!task.overdueCarryoverSince,
            });

            let cardStyle =
              "bg-white border-rhozly-outline/10 hover:border-rhozly-primary/30";
            if (isCompleted) {
              cardStyle = "opacity-60 bg-gray-50 border-rhozly-outline/10";
            } else if (isBlocked) {
              cardStyle = "bg-rhozly-surface-low border-gray-300 opacity-80";
            } else if (isOverdue) {
              cardStyle = "bg-status-danger-fill border-status-danger-line can-hover:hover:border-status-danger-ink";
            } else if (isInHarvestWindow) {
              cardStyle = "bg-status-caution-fill border-status-caution-line can-hover:hover:border-status-caution-ink";
            } else if (isToday) {
              cardStyle = "bg-status-water-fill border-status-water-line can-hover:hover:border-status-water-ink";
            }
            if (isBulkEditing && isSelected) {
              cardStyle = "bg-rhozly-primary/5 border-rhozly-primary shadow-md";
            }

            return (
              <div
                key={task.id}
                data-testid={`task-row-${task.id}`}
                data-task-type={task.type}
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
                className={`p-3 sm:p-5 rounded-2xl sm:rounded-3xl border shadow-sm group relative transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-rhozly-primary focus:ring-offset-2 ${cardStyle}`}
              >
                {isBlocked && !isCompleted && !isBulkEditing && (
                  <div className="absolute -top-2 -right-2 z-10 text-[9px] font-black uppercase text-gray-500 bg-gray-200 px-3 py-1 rounded-full shadow-sm flex items-center gap-1 border border-gray-300">
                    <Lock size={10} /> Blocked
                  </div>
                )}

                <div className="flex items-start gap-3">
                  {/* Complete toggle / bulk checkbox */}
                  {!isBulkEditing && (
                    <button
                      onClick={(e) => toggleTaskCompletion(task, e)}
                      disabled={isUpdatingTask === task.id || (isBlocked && !isCompleted)}
                      aria-label={`Mark task "${task.title}" as ${isCompleted ? "incomplete" : "complete"}`}
                      className={`w-8 h-8 sm:w-10 sm:h-10 pointer-coarse:w-11 pointer-coarse:h-11 shrink-0 mt-0.5 rounded-xl sm:rounded-2xl flex items-center justify-center border-2 transition-all active:scale-90 ${isUpdatingTask === task.id ? "border-rhozly-primary/30" : isCompleted ? "bg-green-500 border-green-500 text-white" : isBlocked ? "border-gray-300 text-gray-400 bg-gray-200" : "border-rhozly-outline/20 can-hover:hover:border-rhozly-primary text-transparent can-hover:hover:text-rhozly-primary/30"}`}
                    >
                      {isUpdatingTask === task.id ? (
                        <Loader2 size={15} className="animate-spin text-rhozly-primary" />
                      ) : isBlocked && !isCompleted ? (
                        <Lock size={13} className="currentColor" />
                      ) : (
                        <CheckSquare size={15} className="currentColor" />
                      )}
                    </button>
                  )}

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {/* Type badge row — thumbnail sits here on mobile */}
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md flex items-center gap-1 w-fit ${isCompleted ? "bg-gray-200 text-gray-500" : "text-rhozly-primary bg-rhozly-primary/10"}`}>
                        {getTaskIcon(task.type)} {task.type}
                      </span>
                      {thumbnail && (
                        <img
                          src={thumbnail}
                          className={`w-9 h-9 rounded-xl object-cover border border-rhozly-outline/10 md:hidden shrink-0 ${isCompleted ? "grayscale opacity-50" : ""}`}
                          alt="plant"
                        />
                      )}
                    </div>

                    {/* Title — wraps instead of truncating */}
                    <h4 className={`font-black text-sm leading-snug line-clamp-2 ${isCompleted ? "line-through text-gray-500" : ""}`}>
                      {task.title}
                    </h4>

                    {/* B2 — relative due label (overdue gets HC-aware danger ink;
                        everything else a muted line). Compact-only: the full
                        calendar/agenda is date-grouped, so the label would be
                        redundant there — it earns its place on the home + tray. */}
                    {compact && dueLabel && (
                      <p
                        data-testid="task-due-label"
                        className={`text-[11px] mt-1 ${isOverdue ? "font-black text-status-danger-ink" : "font-bold text-rhozly-on-surface-variant"}`}
                      >
                        {dueLabel}
                      </p>
                    )}

                    {/* Chips */}
                    {(plantName || task.areas?.name || planName || task.auto_completed_reason || task.overdueCarryoverSince || lateDue || windowDoneOn || task.weather_event_key || task.blueprint_id || task.isGhost) && (
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {/* B9 — surface that this is a recurring/routine task (a core
                            concept that was previously invisible on the row). Quiet
                            neutral pill so it doesn't compete with the status chips. */}
                        {(task.blueprint_id || task.isGhost) && (
                          <div data-testid="task-recurring-chip" className="text-[10px] font-bold flex items-center gap-1 px-2 py-0.5 rounded-md bg-rhozly-surface-low text-rhozly-on-surface-variant border border-rhozly-outline/10">
                            <Repeat size={10} /> Recurring
                          </div>
                        )}
                        {task.overdueCarryoverSince && (
                          <div className="text-[10px] font-bold flex items-center gap-1 px-2 py-0.5 rounded-md bg-status-danger-fill text-status-danger-ink">
                            <AlertCircle size={10} /> Overdue since {formatDisplayDate(task.overdueCarryoverSince)}
                          </div>
                        )}
                        {lateDue && (
                          <div data-testid="task-late-chip" className="text-[10px] font-bold flex items-center gap-1 px-2 py-0.5 rounded-md bg-status-caution-fill text-status-caution-ink">
                            <CheckSquare size={10} /> Completed late — due {formatDisplayDate(lateDue)}
                            {lateDone && ` · done ${formatDisplayDate(lateDone)}`}
                          </div>
                        )}
                        {windowDoneOn && (
                          <div data-testid="task-harvested-chip" className="text-[10px] font-bold flex items-center gap-1 px-2 py-0.5 rounded-md bg-status-success-fill text-status-success-ink">
                            {isPruningWindowTask ? <Scissors size={10} /> : <Wheat size={10} />} {windowDoneLabel} {formatDisplayDate(windowDoneOn)}
                          </div>
                        )}
                        {plantName && (
                          <div className="text-[10px] font-bold flex items-center gap-1 px-2 py-0.5 rounded-md bg-status-success-fill text-status-success-ink">
                            <Leaf size={10} /> {plantName}{count > 1 && ` (x${count})`}
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
                          <div className="text-[10px] font-bold flex items-center gap-1 px-2 py-0.5 rounded-md bg-status-water-fill text-status-water-ink" title={task.auto_completed_reason}>
                            <CloudRain size={10} /> Auto-watered
                          </div>
                        )}
                        {task.weather_event_key && (
                          <div data-testid="task-weather-chip" className="text-[10px] font-bold flex items-center gap-1 px-2 py-0.5 rounded-md bg-status-caution-fill text-status-caution-ink" title="Created automatically from a weather event">
                            <CloudRain size={10} /> Weather task
                          </div>
                        )}
                      </div>
                    )}

                    {/* Mobile action buttons — below chips, hidden on wide desktop */}
                    {!isBulkEditing && !isCompleted && (
                      <div className="flex items-center gap-0.5 mt-2 md:hidden" onClick={(e) => e.stopPropagation()}>
                        {(task.created_by === currentUserId ? can("tasks.delete_own") : can("tasks.delete_any")) && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setTaskToDelete(task); }}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-black text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            aria-label={`Remove task: ${task.title}`}
                          >
                            <Trash2 size={12} /> Remove
                          </button>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelectedTask(task); setIsPostponing(true); }}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-black text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                          aria-label={`Postpone task: ${task.title}`}
                        >
                          <CalendarClock size={12} /> Postpone
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Desktop: icon action buttons + thumbnail (768px+) */}
                  <div className="hidden md:flex items-center gap-2 shrink-0 ml-2">
                    {!isBulkEditing && !isCompleted && (
                      <div className="flex items-center gap-1 bg-gray-50 border border-gray-100 rounded-xl p-0.5">
                        {(task.created_by === currentUserId ? can("tasks.delete_own") : can("tasks.delete_any")) && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setTaskToDelete(task); }}
                            className="p-2 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-white rounded-lg transition-colors"
                            aria-label={`Remove task: ${task.title}`}
                            title="Remove Task"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelectedTask(task); setIsPostponing(true); }}
                          className="p-2 flex items-center justify-center text-gray-400 hover:text-blue-500 hover:bg-white rounded-lg transition-colors"
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
                        className={`w-14 h-14 rounded-[1rem] object-cover border border-rhozly-outline/10 shrink-0 ${isCompleted ? "grayscale opacity-50" : ""}`}
                        alt="plant"
                      />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Compact "View calendar →" footer. HomeMain suppresses it via
          `hideCalendarLink` (it supplies its own prominent "Open board →" /
          "See all" header — the footer would duplicate it); /quick/calendar
          keeps it as that surface's only hop to the full week board. */}
      {compact && !hideCalendarLink && tasks.length > 0 && (
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            data-testid="task-list-compact-view-calendar"
            onClick={() => navigate("/calendar")}
            className="text-xs font-black uppercase tracking-widest text-rhozly-primary can-hover:hover:underline px-2 py-1"
          >
            View calendar →
          </button>
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
                  onOpenToDoList={onOpenToDoList ? (listId) => {
                    // Close the task modal first so the list modal stacks cleanly.
                    setSelectedTask(null);
                    onOpenToDoList(listId);
                  } : undefined}
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

          </>,
          document.body,
        )}

      {/* Inline sowing prompt — drained one at a time. The user always
          gets a Skip path, so this is interruptive but non-blocking. */}
      {pendingSowingPrompts.length > 0 && (
        <LogSowingFromTaskModal
          isOpen
          homeId={homeId}
          taskId={pendingSowingPrompts[0].taskId}
          packetId={pendingSowingPrompts[0].packetId}
          taskTitle={pendingSowingPrompts[0].title}
          onClose={() => setPendingSowingPrompts((prev) => prev.slice(1))}
        />
      )}

      {/* Harvest → End-of-Life prompt — drained one task at a time.
          The user can skip (most harvests keep producing) or tick which
          instances reached the end of their life cycle with this harvest. */}
      {pendingHarvestEolPrompts.length > 0 && (
        <HarvestEndOfLifePrompt
          isOpen
          homeId={homeId}
          taskId={pendingHarvestEolPrompts[0].taskId}
          taskTitle={pendingHarvestEolPrompts[0].taskTitle}
          inventoryItemIds={pendingHarvestEolPrompts[0].inventoryItemIds}
          onClose={() => {
            setPendingHarvestEolPrompts((prev) => prev.slice(1));
            fetchTasksAndGhosts(true);
            onTaskUpdated?.();
          }}
        />
      )}
      {harvestYieldSheet}
    </>
  );
}
