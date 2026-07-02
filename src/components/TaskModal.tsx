import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import {
  X,
  Leaf,
  Grid,
  Home,
  MapPin,
  FolderKanban,
  Link as LinkIcon,
  Lock,
  CheckSquare2,
  Unlink,
  Plus,
  Search,
  Loader2,
  Trash2,
  CalendarClock,
  Calendar,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Edit3,
  Save,
  CloudRain,
  Users,
  ListChecks,
  Sprout,
  Clock,
  Sparkles,
  XCircle,
} from "lucide-react";
import toast from "react-hot-toast";
import { Logger } from "../lib/errorHandler";
import { formatDisplayDate } from "../lib/dateUtils";
import { usePermissions } from "../context/HomePermissionsContext";
import { useFocusTrap } from "../hooks/useFocusTrap";
import PhotoUploader from "./PhotoUploader";
import HarvestRipenessSheet from "./HarvestRipenessSheet";
import HarvestPartialPickSheet from "./HarvestPartialPickSheet";
import {
  isTaskOverdue,
  isInsideHarvestWindow,
  daysLeftInWindow,
  getLocalDateString,
} from "../lib/taskEngine";

interface TaskModalProps {
  task: any;
  homeId: string;
  inventoryDict: Record<string, any>;
  isBlocked: boolean;
  isUpdating: boolean;
  onClose: () => void;
  onDelete: () => void;
  onPostpone: () => void;
  onToggleComplete: () => void;
  materializeTask: (task: any) => Promise<any>;
  onTasksUpdated: () => void;
  /** When the task belongs to a to-do list, clicking the "From: <list>" pill
   *  closes this modal and opens the Manage To-Do Lists modal expanded to that
   *  list. The host owns both modals. */
  onOpenToDoList?: (listId: string) => void;
}


export default function TaskModal({
  task,
  homeId,
  inventoryDict,
  isBlocked,
  isUpdating,
  onClose,
  onDelete,
  onPostpone,
  onToggleComplete,
  materializeTask,
  onTasksUpdated,
  onOpenToDoList,
}: TaskModalProps) {
  const navigate = useNavigate();
  const { homeMembers } = usePermissions();
  const trapRef = useFocusTrap<HTMLDivElement>(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [completionPhotoUrl, setCompletionPhotoUrl] = useState<string | null>(
    task?.completion_photo_url ?? null,
  );

  useEffect(() => {
    setCompletionPhotoUrl(task?.completion_photo_url ?? null);
  }, [task?.id, task?.completion_photo_url]);

  const saveCompletionPhoto = async (url: string | null) => {
    setCompletionPhotoUrl(url);
    if (task.isGhost) {
      // Photo can only attach to a real (materialized) task — completed ghosts
      // are always materialized first, so this branch shouldn't fire in practice.
      return;
    }
    try {
      const { error } = await supabase
        .from("tasks")
        .update({ completion_photo_url: url })
        .eq("id", task.id);
      if (error) throw error;
      onTasksUpdated();
    } catch (err: any) {
      Logger.error("Failed to save completion photo", err, { taskId: task.id }, "Could not save photo — please try again.");
    }
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, []);

  // Local UI State
  const [showTaskInstances, setShowTaskInstances] = useState(false);

  // Instance Editing State
  const [isEditingInstances, setIsEditingInstances] = useState(false);
  const [areaInventory, setAreaInventory] = useState<any[]>([]);
  const [editingPlantName, setEditingPlantName] = useState<string>("");
  const [editedInstanceIds, setEditedInstanceIds] = useState<string[]>([]);
  const [isSavingInstances, setIsSavingInstances] = useState(false);

  // Task Details Editing State
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [isSavingDetails, setIsSavingDetails] = useState(false);
  const [editForm, setEditForm] = useState({
    title: task.title || "",
    description: task.description || "",
    location_id: task.location_id || "",
    area_id: task.area_id || "",
    plan_id: task.plan_id || "",
    scope: (task.scope as "home" | "personal") || "home",
    assigned_to: task.assigned_to || "",
  });
  const [dropdownOptions, setDropdownOptions] = useState({
    locations: [] as any[],
    areas: [] as any[],
    plans: [] as any[],
  });
  const [isFetchingDropdowns, setIsFetchingDropdowns] = useState(false);

  // Dependency State
  const [blockers, setBlockers] = useState<any[]>([]);
  const [blocking, setBlocking] = useState<any[]>([]);
  const [isDependenciesLoading, setIsDependenciesLoading] = useState(false);
  const [isLinking, setIsLinking] = useState(false);
  const [linkType, setLinkType] = useState<"waiting_on" | "blocking">(
    "waiting_on",
  );
  const [linkTaskId, setLinkTaskId] = useState("");

  // Search State
  const [depSearchQuery, setDepSearchQuery] = useState("");
  const [depSearchResults, setDepSearchResults] = useState<any[]>([]);
  const [isSearchingDeps, setIsSearchingDeps] = useState(false);
  const [selectedDepTask, setSelectedDepTask] = useState<any | null>(null);
  const [showDepDropdown, setShowDepDropdown] = useState(false);

  const depSearchRef = useRef<HTMLDivElement>(null);

  const resetLinkBuilder = () => {
    setLinkTaskId("");
    setLinkType("waiting_on");
    setDepSearchQuery("");
    setSelectedDepTask(null);
    setShowDepDropdown(false);
  };

  const loadDependencies = async (targetTask: any) => {
    if (targetTask.isGhost) {
      setBlockers([]);
      setBlocking([]);
      return;
    }
    setIsDependenciesLoading(true);
    try {
      const { data: blockerLinks } = await supabase
        .from("task_dependencies")
        .select("depends_on_task_id")
        .eq("task_id", targetTask.id);
      if (blockerLinks && blockerLinks.length > 0) {
        const blockerIds = blockerLinks.map((b) => b.depends_on_task_id);
        const { data: blockerTasks } = await supabase
          .from("tasks")
          .select("id, title, status")
          .in("id", blockerIds);
        setBlockers(blockerTasks || []);
      } else setBlockers([]);

      const { data: blockingLinks } = await supabase
        .from("task_dependencies")
        .select("task_id")
        .eq("depends_on_task_id", targetTask.id);
      if (blockingLinks && blockingLinks.length > 0) {
        const blockingIds = blockingLinks.map((b) => b.task_id);
        const { data: blockingTasks } = await supabase
          .from("tasks")
          .select("id, title, status")
          .in("id", blockingIds);
        setBlocking(blockingTasks || []);
      } else setBlocking([]);
    } catch (e) {
      Logger.error("Failed to load task dependencies", e, { taskId: targetTask.id }, "Failed to load task dependencies.");
    } finally {
      setIsDependenciesLoading(false);
    }
  };

  useEffect(() => {
    loadDependencies(task);
  }, [task.id]);

  useEffect(() => {
    if (isEditingInstances && task.area_id) {
      const fetchInv = async () => {
        const { data } = await supabase
          .from("inventory_items")
          .select("*")
          .eq("area_id", task.area_id);
        setAreaInventory(data || []);

        const activeIds = (task.inventory_item_ids || []).filter(
          (id: any) => inventoryDict[id]?.status !== "Archived",
        );
        setEditedInstanceIds(activeIds);

        if (activeIds.length > 0) {
          setEditingPlantName(inventoryDict[activeIds[0]]?.plant_name || "");
        } else {
          setEditingPlantName("");
        }
      };
      fetchInv();
    }
  }, [
    isEditingInstances,
    task.area_id,
    task.inventory_item_ids,
    inventoryDict,
  ]);

  useEffect(() => {
    if (isEditingDetails) {
      const fetchDropdowns = async () => {
        setIsFetchingDropdowns(true);
        const { data: locs } = await supabase
          .from("locations")
          .select("id, name, areas(id, name)")
          .eq("home_id", homeId);
        const { data: plns } = await supabase
          .from("plans")
          .select("id, name")
          .eq("home_id", homeId);

        const flatAreas = locs
          ? locs.flatMap((l: any) =>
              l.areas.map((a: any) => ({ ...a, location_id: l.id })),
            )
          : [];

        setDropdownOptions({
          locations: locs || [],
          areas: flatAreas,
          plans: plns || [],
        });
        setIsFetchingDropdowns(false);
      };
      fetchDropdowns();
    }
  }, [isEditingDetails, homeId]);

  useEffect(() => {
    if (!isLinking) return;
    const searchTasks = async () => {
      setIsSearchingDeps(true);
      try {
        let q = supabase
          .from("tasks")
          .select("id, title, status, due_date, type")
          .eq("home_id", homeId)
          .neq("status", "Skipped");
        if (!task.isGhost) q = q.neq("id", task.id);
        if (linkType === "waiting_on")
          q = q
            .lte("due_date", task.due_date)
            .order("due_date", { ascending: false });
        else
          q = q
            .gte("due_date", task.due_date)
            .order("due_date", { ascending: true });
        if (depSearchQuery.trim())
          q = q.ilike("title", `%${depSearchQuery.trim()}%`);

        const { data, error } = await q.limit(15);
        if (error) throw error;
        setDepSearchResults(data || []);
      } catch (e) {
        Logger.error("Dependency search failed", e, { homeId, taskId: task.id });
      } finally {
        setIsSearchingDeps(false);
      }
    };
    const debounce = setTimeout(searchTasks, 300);
    return () => clearTimeout(debounce);
  }, [depSearchQuery, linkType, isLinking, homeId, task]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        depSearchRef.current &&
        !depSearchRef.current.contains(event.target as Node)
      ) {
        setShowDepDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleExecuteLink = async () => {
    if (!linkTaskId) return;
    setIsDependenciesLoading(true);
    try {
      let currentTarget = task;
      if (currentTarget.isGhost) {
        currentTarget = await materializeTask(currentTarget);
      }

      const { data: depData } = await supabase
        .from("tasks")
        .select("*")
        .eq("id", linkTaskId)
        .single();
      let depTask = depData;
      if (!depTask) throw new Error("Task not found");
      if (depTask.isGhost) depTask = await materializeTask(depTask);

      const payload =
        linkType === "waiting_on"
          ? { task_id: currentTarget.id, depends_on_task_id: depTask.id }
          : { task_id: depTask.id, depends_on_task_id: currentTarget.id };

      const { error } = await supabase
        .from("task_dependencies")
        .insert(payload);
      if (error) throw error;
      toast.success("Dependency linked!");
      loadDependencies(currentTarget);
      setIsLinking(false);
      resetLinkBuilder();
      onTasksUpdated();
    } catch (e) {
      Logger.error("Failed to link task dependency", e, { homeId, taskId: task.id, linkTaskId }, "Failed to link task.");
    } finally {
      setIsDependenciesLoading(false);
    }
  };

  const handleRemoveDependency = async (
    taskId: string,
    dependsOnId: string,
  ) => {
    setIsDependenciesLoading(true);
    try {
      const { error } = await supabase
        .from("task_dependencies")
        .delete()
        .eq("task_id", taskId)
        .eq("depends_on_task_id", dependsOnId);
      if (error) throw error;
      toast.success("Dependency removed.");
      loadDependencies(task);
      onTasksUpdated();
    } catch (e) {
      Logger.error("Failed to remove task dependency", e, { taskId, dependsOnId }, "Failed to remove dependency.");
    } finally {
      setIsDependenciesLoading(false);
    }
  };

  const handleSaveInstances = async () => {
    setIsSavingInstances(true);
    try {
      if (task.blueprint_id) {
        await supabase
          .from("task_blueprints")
          .update({ inventory_item_ids: editedInstanceIds })
          .eq("id", task.blueprint_id);
      }
      if (!task.isGhost) {
        await supabase
          .from("tasks")
          .update({ inventory_item_ids: editedInstanceIds })
          .eq("id", task.id);
      }
      toast.success("Plant instances updated!");
      setIsEditingInstances(false);
      onTasksUpdated();
      setTimeout(onClose, 800);
    } catch (e) {
      Logger.error("Failed to update task plant instances", e, { taskId: task.id }, "Failed to update instances.");
    } finally {
      setIsSavingInstances(false);
    }
  };

  const handleSaveDetails = async () => {
    if (!editForm.title.trim()) return toast.error("Title is required");
    setIsSavingDetails(true);
    try {
      const payload = {
        title: editForm.title,
        description: editForm.description,
        location_id: editForm.location_id || null,
        area_id: editForm.area_id || null,
        plan_id: editForm.plan_id || null,
        scope: editForm.scope,
        assigned_to: editForm.scope === "personal"
          ? (currentUserId || null)
          : (editForm.assigned_to || null),
      };

      if (task.isGhost) {
        const materialized = await materializeTask(task);
        await supabase.from("tasks").update(payload).eq("id", materialized.id);
      } else {
        if (task.blueprint_id) {
          await supabase
            .from("task_blueprints")
            .update(payload)
            .eq("id", task.blueprint_id);
        }
        await supabase.from("tasks").update(payload).eq("id", task.id);
      }

      toast.success("Task details updated!");
      setIsEditingDetails(false);
      onTasksUpdated();
      setTimeout(onClose, 800);
    } catch (e) {
      Logger.error("Failed to save task details", e, { taskId: task.id }, "Failed to save task details.");
    } finally {
      setIsSavingDetails(false);
    }
  };

  const activeIds = (task.inventory_item_ids || []).filter(
    (id: any) => inventoryDict[id]?.status !== "Archived",
  );
  const hasPlants = activeIds.length > 0;
  const primaryPlantName = hasPlants
    ? inventoryDict[activeIds[0]]?.plant_name
    : "No Active Plants";

  const availableAreas = dropdownOptions.areas.filter(
    (a) => a.location_id === editForm.location_id,
  );

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-rhozly-bg/90 backdrop-blur-sm animate-in fade-in"
      onClick={onClose}
    >
      <div
        ref={trapRef}
        data-testid="task-modal"
        data-task-id={task.id}
        role="dialog"
        aria-modal="true"
        aria-label="Task details"
        className="bg-white w-full max-w-lg rounded-3xl p-8 shadow-2xl border border-rhozly-outline/10 flex flex-col max-h-[90vh] overflow-y-auto custom-scrollbar"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-start mb-6">
          {isEditingDetails ? (
            <input
              value={editForm.title}
              onChange={(e) =>
                setEditForm({ ...editForm, title: e.target.value })
              }
              className="text-xl font-black leading-tight pr-4 w-full outline-none border-b-2 border-rhozly-primary focus:border-rhozly-primary pb-1"
              placeholder="Task Title"
            />
          ) : (
            <div className="flex-1 pr-4">
              {/* From-list pill — links back to the to-do list this task belongs to. */}
              {task.todo_list_id && onOpenToDoList && (
                <button
                  type="button"
                  data-testid="task-from-todo-list"
                  onClick={() => onOpenToDoList(task.todo_list_id)}
                  className="inline-flex items-center gap-1.5 mb-2 px-2.5 py-1 rounded-full bg-rhozly-primary/10 text-rhozly-primary text-[10px] font-black uppercase tracking-widest hover:bg-rhozly-primary/15 transition-colors"
                  title="Open the to-do list this task belongs to"
                >
                  <ListChecks size={11} />
                  From: {task.todo_list?.name?.trim() || `To-do for ${task.due_date}`}
                </button>
              )}
              <div className="flex gap-2">
                <h3 className="text-xl font-black leading-tight">{task.title}</h3>
                <button
                  onClick={() => setIsEditingDetails(true)}
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center text-rhozly-primary/60 hover:text-rhozly-primary transition-colors shrink-0"
                  title="Edit Task Details"
                >
                  <Edit3 size={16} />
                </button>
              </div>
            </div>
          )}
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 bg-rhozly-surface-low rounded-xl hover:bg-rhozly-surface transition-colors shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* Instructions / Description */}
        {isEditingDetails ? (
          <div className="mb-6 space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40">
              Description
            </label>
            <textarea
              value={editForm.description}
              onChange={(e) =>
                setEditForm({ ...editForm, description: e.target.value })
              }
              className="w-full p-3 bg-rhozly-surface-lowest rounded-xl outline-none border border-rhozly-outline/10 focus:border-rhozly-primary text-sm font-bold min-h-[80px]"
              placeholder="Add instructions or notes..."
            />
          </div>
        ) : (
          task.description && (
            <div className="mb-6 bg-rhozly-surface-lowest p-4 rounded-2xl border border-rhozly-outline/5">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 flex items-center gap-1 mb-2">
                Instructions
              </h4>
              <p className="text-sm font-bold text-rhozly-on-surface/60 whitespace-pre-wrap">
                {task.description}
              </p>
            </div>
          )
        )}

        {/* Auto-completed reason */}
        {task.auto_completed_reason && (
          <div className="mb-6 bg-sky-50 border border-sky-100 p-4 rounded-2xl flex items-start gap-3">
            <div className="bg-sky-100 p-2 rounded-xl shrink-0">
              <CloudRain size={16} className="text-sky-600" />
            </div>
            <div>
              <h4 className="text-[10px] font-black uppercase tracking-widest text-sky-600/70 mb-1">
                Auto-completed by weather
              </h4>
              <p className="text-sm font-bold text-sky-700">
                {task.auto_completed_reason}
              </p>
            </div>
          </div>
        )}

        {/* Context Links (Plants, Area, Plan) */}
        <div className="space-y-3 mb-8">
          {/* Active Plants - Only visible if not editing core details */}
          {!isEditingDetails && task.area_id && (
            <div className="bg-rhozly-surface-lowest rounded-2xl border border-rhozly-outline/10 overflow-hidden transition-all">
              {isEditingInstances ? (
                <div className="p-4 animate-in slide-in-from-top-2">
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="text-sm font-black text-rhozly-on-surface">
                      Edit Plant Instances
                    </h4>
                    <button
                      onClick={() => setIsEditingInstances(false)}
                      aria-label="Cancel editing instances"
                      className="min-w-[44px] min-h-[44px] flex items-center justify-center text-rhozly-primary hover:text-rhozly-primary/80"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  {!editingPlantName ? (
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40">
                        Select Plant Type
                      </label>
                      <select
                        value={editingPlantName}
                        onChange={(e) => setEditingPlantName(e.target.value)}
                        className="w-full p-3 rounded-xl text-sm font-bold border border-rhozly-outline/10 outline-none focus:border-rhozly-primary"
                      >
                        <option value="">-- Choose a plant --</option>
                        {Array.from(
                          new Set(areaInventory.map((i) => i.plant_name)),
                        ).map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40">
                          Select Instances ({editingPlantName})
                        </label>
                        {(task.inventory_item_ids || []).length === 0 && (
                          <button
                            onClick={() => setEditingPlantName("")}
                            className="text-[10px] text-rhozly-primary underline font-bold"
                          >
                            Change Plant
                          </button>
                        )}
                      </div>
                      <div className="max-h-40 overflow-y-auto space-y-1 custom-scrollbar">
                        {areaInventory
                          .filter(
                            (i) =>
                              i.plant_name === editingPlantName &&
                              i.status !== "Archived",
                          )
                          .map((item) => (
                            <label
                              key={item.id}
                              className="flex items-center gap-3 p-3 bg-white rounded-xl border border-rhozly-outline/10 cursor-pointer hover:bg-rhozly-surface-lowest transition-colors"
                            >
                              <input
                                type="checkbox"
                                checked={editedInstanceIds.includes(item.id)}
                                onChange={(e) => {
                                  if (e.target.checked)
                                    setEditedInstanceIds([
                                      ...editedInstanceIds,
                                      item.id,
                                    ]);
                                  else
                                    setEditedInstanceIds(
                                      editedInstanceIds.filter(
                                        (id) => id !== item.id,
                                      ),
                                    );
                                }}
                                className="accent-rhozly-primary w-4 h-4 shrink-0"
                              />
                              <span className="text-xs font-bold text-rhozly-on-surface leading-tight">
                                {item.identifier}
                              </span>
                            </label>
                          ))}
                        {areaInventory.filter(
                          (i) =>
                            i.plant_name === editingPlantName &&
                            i.status !== "Archived",
                        ).length === 0 && (
                          <p className="text-xs text-rhozly-on-surface/40 italic p-2 text-center">
                            No active instances found for this plant.
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  <button
                    onClick={handleSaveInstances}
                    disabled={isSavingInstances}
                    className="w-full mt-4 py-3 bg-rhozly-primary text-white rounded-xl font-black shadow-md hover:bg-rhozly-primary/90 disabled:opacity-50 flex justify-center items-center gap-2"
                  >
                    {isSavingInstances ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      "Save Instances"
                    )}
                  </button>
                </div>
              ) : (
                <>
                  <div
                    className="flex items-center justify-between p-3 cursor-pointer hover:bg-rhozly-surface-low transition-colors"
                    onClick={() => setShowTaskInstances(!showTaskInstances)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-rhozly-surface rounded-xl flex items-center justify-center text-rhozly-primary shrink-0">
                        <Leaf size={16} />
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40">
                          Active Plants
                        </p>
                        <p className="text-sm font-bold text-rhozly-on-surface">
                          {primaryPlantName}{" "}
                          {hasPlants ? `(x${activeIds.length})` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsEditingInstances(true);
                        }}
                        className="min-w-[44px] min-h-[44px] flex items-center justify-center text-rhozly-primary hover:bg-rhozly-surface rounded-xl transition-colors"
                        title="Edit Plant Instances"
                      >
                        <Edit3 size={16} />
                      </button>
                      <div className="text-rhozly-primary p-2">
                        {showTaskInstances ? (
                          <ChevronUp size={20} />
                        ) : (
                          <ChevronDown size={20} />
                        )}
                      </div>
                    </div>
                  </div>
                  {showTaskInstances && hasPlants && (
                    <div className="px-4 pb-4 pt-1 space-y-1.5 animate-in slide-in-from-top-2">
                      <div className="w-full h-px bg-rhozly-outline/10 mb-3" />
                      {activeIds.map((id: string) => (
                        <div
                          key={id}
                          className="flex justify-between items-center text-xs font-bold text-rhozly-on-surface bg-white/50 p-2 rounded-lg"
                        >
                          <span>
                            {inventoryDict[id]?.identifier || "Unknown Plant"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* EDIT MODE: Dropdowns */}
          {isEditingDetails ? (
            <div className="space-y-4 bg-rhozly-surface-lowest p-4 rounded-2xl border border-rhozly-outline/10 animate-in slide-in-from-top-2">
              {isFetchingDropdowns ? (
                <div className="flex justify-center p-4">
                  <Loader2 className="animate-spin text-rhozly-primary" />
                </div>
              ) : (
                <>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-1 block">
                      Location
                    </label>
                    <select
                      value={editForm.location_id}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          location_id: e.target.value,
                          area_id: "",
                        })
                      }
                      className="w-full p-3 rounded-xl border border-rhozly-outline/10 outline-none focus:border-rhozly-primary text-sm font-bold"
                    >
                      <option value="">-- No Location --</option>
                      {dropdownOptions.locations.map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-1 block">
                      Area
                    </label>
                    <select
                      value={editForm.area_id}
                      onChange={(e) =>
                        setEditForm({ ...editForm, area_id: e.target.value })
                      }
                      disabled={!editForm.location_id}
                      className="w-full p-3 rounded-xl border border-rhozly-outline/10 outline-none focus:border-rhozly-primary text-sm font-bold disabled:opacity-50"
                    >
                      <option value="">-- No Area --</option>
                      {availableAreas.map((area) => (
                        <option key={area.id} value={area.id}>
                          {area.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-1 block">
                      Plan
                    </label>
                    <select
                      value={editForm.plan_id}
                      onChange={(e) =>
                        setEditForm({ ...editForm, plan_id: e.target.value })
                      }
                      className="w-full p-3 rounded-xl border border-rhozly-outline/10 outline-none focus:border-rhozly-primary text-sm font-bold"
                    >
                      <option value="">-- No Plan --</option>
                      {dropdownOptions.plans.map((plan) => (
                        <option key={plan.id} value={plan.id}>
                          {plan.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-2 block">
                      Scope
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        data-testid="task-scope-home"
                        onClick={() => setEditForm({ ...editForm, scope: "home" })}
                        className={`flex-1 py-3 rounded-2xl text-sm font-black border transition-colors ${
                          editForm.scope === "home"
                            ? "bg-rhozly-primary text-white border-rhozly-primary"
                            : "bg-rhozly-surface-low text-rhozly-on-surface/60 border-transparent hover:border-rhozly-primary/30"
                        }`}
                      >
                        Home
                      </button>
                      <button
                        type="button"
                        data-testid="task-scope-personal"
                        onClick={() => setEditForm({ ...editForm, scope: "personal", assigned_to: currentUserId || "" })}
                        className={`flex-1 py-3 rounded-2xl text-sm font-black border transition-colors ${
                          editForm.scope === "personal"
                            ? "bg-rhozly-primary text-white border-rhozly-primary"
                            : "bg-rhozly-surface-low text-rhozly-on-surface/60 border-transparent hover:border-rhozly-primary/30"
                        }`}
                      >
                        Personal
                      </button>
                    </div>
                  </div>

                  {editForm.scope === "home" && homeMembers.length > 1 && (
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-1 block">
                        Assign To (Optional)
                      </label>
                      <select
                        data-testid="task-assigned-to"
                        value={editForm.assigned_to}
                        onChange={(e) => setEditForm({ ...editForm, assigned_to: e.target.value })}
                        className="w-full p-3 rounded-xl border border-rhozly-outline/10 outline-none focus:border-rhozly-primary text-sm font-bold"
                      >
                        <option value="">Unassigned</option>
                        {homeMembers.map((m) => (
                          <option key={m.user_id} value={m.user_id}>
                            {m.display_name || m.email || m.user_id}
                            {m.user_id === currentUserId ? " (you)" : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <button
                    onClick={handleSaveDetails}
                    disabled={isSavingDetails}
                    className="w-full mt-2 py-3 bg-rhozly-primary hover:bg-rhozly-primary/90 text-white font-black rounded-xl transition-all flex justify-center items-center gap-2"
                  >
                    {isSavingDetails ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Save size={16} />
                    )}{" "}
                    Save Changes
                  </button>
                </>
              )}
            </div>
          ) : (
            <>
              {/* Due Date row — always visible */}
              {(() => {
                const today = getLocalDateString(new Date());
                // Wave-20 — window tasks (Harvesting with `window_end_date`)
                // are only overdue past the window close; inside the window
                // they're "active", not overdue.
                const isOverdue = isTaskOverdue(task, today);
                const isInWindow = isInsideHarvestWindow(task, today);
                const daysLeft = daysLeftInWindow(task, today);
                const closedAt = task.window_end_date && !isInWindow && task.status === "Pending"
                  ? task.window_end_date
                  : null;
                return (
                  <>
                    {isInWindow && task.status !== "Completed" && (
                      <div
                        data-testid="task-harvest-window-pill"
                        className="flex items-center gap-3 p-3 rounded-2xl border bg-amber-50 border-amber-200"
                      >
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-amber-100 text-amber-700">
                          <Sprout size={16} />
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-amber-700/80">
                            Harvest window
                          </p>
                          <p className="text-sm font-black text-amber-800">
                            {daysLeft === 0
                              ? "Last day of the window"
                              : daysLeft === 1
                                ? "1 day left"
                                : `${daysLeft} days left`}
                            {task.window_end_date && (
                              <span className="font-semibold text-amber-700/70"> · closes {formatDisplayDate(task.window_end_date)}</span>
                            )}
                          </p>
                        </div>
                      </div>
                    )}
                    {closedAt && (
                      <div
                        data-testid="task-harvest-window-closed"
                        className="flex items-center gap-3 p-3 rounded-2xl border bg-amber-50 border-amber-200"
                      >
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-amber-100 text-amber-700">
                          <Calendar size={16} />
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-amber-700/80">
                            Window closed
                          </p>
                          <p className="text-sm font-black text-amber-800">
                            Was open until {formatDisplayDate(closedAt)}
                          </p>
                        </div>
                      </div>
                    )}
                    <div className={`flex items-center gap-3 p-3 rounded-2xl border ${isOverdue ? "bg-red-50 border-red-100" : "bg-rhozly-surface-lowest border-rhozly-outline/10"}`}>
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isOverdue ? "bg-red-100 text-red-500" : "bg-rhozly-surface text-rhozly-primary"}`}>
                        <Calendar size={16} />
                      </div>
                      <div>
                        <p className={`text-[10px] font-black uppercase tracking-widest ${isOverdue ? "text-red-400" : "text-rhozly-on-surface/40"}`}>
                          {isOverdue ? "Overdue" : task.status === "Completed" ? "Completed on" : "Due Date"}
                        </p>
                        <p className={`text-sm font-bold ${isOverdue ? "text-red-600" : "text-rhozly-on-surface"}`}>
                          {task.due_date ? formatDisplayDate(task.due_date) : "No date set"}
                        </p>
                      </div>
                    </div>
                  </>
                );
              })()}

              {/* Location row — always visible */}
              <div
                className={`flex items-center gap-3 p-3 bg-rhozly-surface-lowest rounded-2xl border border-rhozly-outline/10 transition-colors ${task.location_id ? "cursor-pointer hover:bg-rhozly-surface-low" : "opacity-50 cursor-default"}`}
                onClick={() => {
                  if (!task.location_id) return;
                  onClose();
                  navigate(`/dashboard?locationId=${task.location_id}`);
                }}
              >
                <div className="w-10 h-10 bg-rhozly-surface rounded-xl flex items-center justify-center text-rhozly-primary shrink-0">
                  <Home size={16} />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40">
                    Location
                  </p>
                  <p className="text-sm font-bold text-rhozly-on-surface">
                    {task.locations?.name || "Not set"}
                  </p>
                </div>
              </div>

              {/* Area row — always visible */}
              <div
                className={`flex items-center gap-3 p-3 bg-rhozly-surface-lowest rounded-2xl border border-rhozly-outline/10 transition-colors ${task.area_id ? "cursor-pointer hover:bg-rhozly-surface-low" : "opacity-50 cursor-default"}`}
                onClick={() => {
                  if (!task.area_id) return;
                  onClose();
                  navigate(`/dashboard?locationId=${task.location_id}&areaId=${task.area_id}`);
                }}
              >
                <div className="w-10 h-10 bg-rhozly-surface rounded-xl flex items-center justify-center text-rhozly-primary shrink-0">
                  <MapPin size={16} />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40">
                    Area
                  </p>
                  <p className="text-sm font-bold text-rhozly-on-surface">
                    {task.areas?.name || "Not set"}
                  </p>
                </div>
              </div>

              {/* Plan row — always visible */}
              <div
                className={`flex items-center gap-3 p-3 bg-rhozly-surface-lowest rounded-2xl border border-rhozly-outline/10 transition-colors ${task.plan_id ? "cursor-pointer hover:bg-rhozly-surface-low" : "opacity-50 cursor-default"}`}
                onClick={() => {
                  if (!task.plan_id) return;
                  onClose();
                  navigate("/planner");
                }}
              >
                <div className="w-10 h-10 bg-rhozly-surface rounded-xl flex items-center justify-center text-rhozly-primary shrink-0">
                  <FolderKanban size={16} />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40">
                    Plan
                  </p>
                  <p className="text-sm font-bold text-rhozly-on-surface">
                    {task.plans?.name || "Not set"}
                  </p>
                </div>
              </div>

              {/* Scope / Assignee row */}
              <div className="flex items-center gap-3 p-3 bg-rhozly-surface-lowest rounded-2xl border border-rhozly-outline/10">
                <div className="w-10 h-10 bg-rhozly-surface rounded-xl flex items-center justify-center text-rhozly-primary shrink-0">
                  <Users size={16} />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40">
                    Scope
                  </p>
                  <p className="text-sm font-bold text-rhozly-on-surface">
                    {task.scope === "personal" ? "Personal" : "Home"}
                    {task.assigned_to
                      ? task.assigned_to === currentUserId
                        ? " · Assigned to you"
                        : ` · ${homeMembers.find(m => m.user_id === task.assigned_to)?.display_name || "Team member"}`
                      : task.scope !== "personal"
                      ? " · Unassigned"
                      : ""}
                  </p>
                </div>
              </div>

              {/* Plant row — only when exactly one active instance */}
              {task.area_id && activeIds.length === 1 && inventoryDict[activeIds[0]] && (
                <div
                  className="flex items-center gap-3 p-3 bg-rhozly-surface-lowest rounded-2xl border border-rhozly-outline/10 cursor-pointer hover:bg-rhozly-surface-low transition-colors"
                  onClick={() => {
                    onClose();
                    navigate(`/dashboard?locationId=${task.location_id}&areaId=${task.area_id}&instanceId=${activeIds[0]}`);
                  }}
                >
                  <div className="w-10 h-10 bg-rhozly-surface rounded-xl flex items-center justify-center text-rhozly-primary shrink-0">
                    <Leaf size={16} />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40">
                      Plant
                    </p>
                    <p className="text-sm font-bold text-rhozly-on-surface">
                      {inventoryDict[activeIds[0]]?.identifier || inventoryDict[activeIds[0]]?.plant_name}
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Task Dependencies (Hidden while editing core details) */}
        {!isEditingDetails && (
          <div className="bg-rhozly-surface-lowest p-4 rounded-2xl border border-rhozly-outline/5 mt-4 mb-8">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-3">
              <LinkIcon size={12} className="inline mr-1" /> Task Dependencies
            </h4>
            {isDependenciesLoading ? (
              <Loader2
                className="animate-spin text-rhozly-primary mx-auto"
                size={20}
              />
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-bold text-rhozly-on-surface/50 mb-2">
                    Waiting On (Blockers):
                  </p>
                  {blockers.length === 0 ? (
                    <p className="text-xs text-rhozly-on-surface/30 italic">None.</p>
                  ) : (
                    blockers.map((b) => (
                      <div
                        key={b.id}
                        className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-rhozly-outline/10 shadow-sm mb-2"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {b.status === "Pending" ? (
                            <Lock size={14} className="text-red-500 shrink-0" />
                          ) : (
                            <CheckSquare2
                              size={14}
                              className="text-rhozly-primary shrink-0"
                            />
                          )}
                          <span
                            className={`text-sm font-bold truncate ${b.status === "Pending" ? "text-rhozly-on-surface" : "text-rhozly-on-surface/40 line-through"}`}
                          >
                            {b.title}
                          </span>
                        </div>
                        <button
                          onClick={() => handleRemoveDependency(task.id, b.id)}
                          className="min-w-[44px] min-h-[44px] flex items-center justify-center text-rhozly-on-surface/30 hover:text-red-500 hover:bg-red-50 rounded-lg shrink-0 transition-colors"
                        >
                          <Unlink size={14} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
                <div>
                  <p className="text-xs font-bold text-rhozly-on-surface/50 mb-2">
                    Blocking (Depends on this):
                  </p>
                  {blocking.length === 0 ? (
                    <p className="text-xs text-rhozly-on-surface/30 italic">None.</p>
                  ) : (
                    <div className="space-y-2">
                      {blocking.map((b) => (
                        <div
                          key={b.id}
                          className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-rhozly-outline/10 shadow-sm"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <LinkIcon
                              size={14}
                              className="text-rhozly-primary/50 shrink-0"
                            />
                            <span className="text-sm font-bold truncate text-rhozly-on-surface">
                              {b.title}
                            </span>
                          </div>
                          <button
                            onClick={() =>
                              handleRemoveDependency(b.id, task.id)
                            }
                            className="min-w-[44px] min-h-[44px] flex items-center justify-center text-rhozly-on-surface/30 hover:text-red-500 hover:bg-red-50 rounded-lg shrink-0 transition-colors"
                          >
                            <Unlink size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="pt-2 border-t border-rhozly-outline/10 mt-4">
              {isLinking ? (
                <div className="flex flex-col gap-2 p-3 bg-rhozly-surface-lowest rounded-xl border border-rhozly-outline/10">
                  <p className="text-xs font-bold text-rhozly-on-surface/40 uppercase tracking-widest mb-1">
                    Add New Link
                  </p>
                  <select
                    value={linkType}
                    onChange={(e) => {
                      setLinkType(e.target.value as "waiting_on" | "blocking");
                      setLinkTaskId("");
                      setSelectedDepTask(null);
                      setShowDepDropdown(false);
                    }}
                    className="w-full p-3 bg-white rounded-xl border border-rhozly-outline/10 text-sm font-bold outline-none focus:border-rhozly-primary transition-colors"
                  >
                    <option value="waiting_on">
                      This task is WAITING ON...
                    </option>
                    <option value="blocking">This task is BLOCKING...</option>
                  </select>
                  <div className="relative" ref={depSearchRef}>
                    <div className="flex items-center bg-white border border-rhozly-outline/10 rounded-xl overflow-hidden focus-within:border-rhozly-primary transition-colors">
                      <Search
                        size={16}
                        className="ml-3 text-rhozly-on-surface/30 shrink-0"
                      />
                      <input
                        type="text"
                        placeholder="Search your tasks by name..."
                        value={
                          selectedDepTask
                            ? selectedDepTask.title
                            : depSearchQuery
                        }
                        onChange={(e) => {
                          setSelectedDepTask(null);
                          setLinkTaskId("");
                          setDepSearchQuery(e.target.value);
                          setShowDepDropdown(true);
                        }}
                        onFocus={() => setShowDepDropdown(true)}
                        className="w-full p-3 text-sm font-bold outline-none"
                      />
                      {selectedDepTask && (
                        <button
                          onClick={() => {
                            setSelectedDepTask(null);
                            setLinkTaskId("");
                            setDepSearchQuery("");
                            setShowDepDropdown(true);
                          }}
                          aria-label="Clear dependency"
                          className="p-2 text-rhozly-on-surface/30 hover:text-red-500 mr-1"
                        >
                          <X size={16} />
                        </button>
                      )}
                    </div>
                    {!selectedDepTask && showDepDropdown && (
                      <div className="absolute z-50 w-full mt-2 bg-white border border-rhozly-outline/10 rounded-xl shadow-xl max-h-48 overflow-y-auto custom-scrollbar">
                        {isSearchingDeps ? (
                          <div className="p-4 text-center text-rhozly-on-surface/40 text-xs flex items-center justify-center gap-2">
                            <Loader2 className="animate-spin" size={14} />{" "}
                            Searching...
                          </div>
                        ) : depSearchResults.length === 0 &&
                          depSearchQuery.trim() !== "" ? (
                          <div className="p-4 text-center text-rhozly-on-surface/40 text-xs">
                            No matching tasks found.
                          </div>
                        ) : (
                          depSearchResults.map((t) => (
                            <div
                              key={t.id}
                              onClick={() => {
                                setSelectedDepTask(t);
                                setLinkTaskId(t.id);
                                setShowDepDropdown(false);
                              }}
                              className="p-3 hover:bg-rhozly-primary/5 cursor-pointer border-b border-rhozly-outline/5 last:border-0 flex items-center justify-between transition-colors"
                            >
                              <div className="min-w-0 pr-2">
                                <p className="text-sm font-bold text-rhozly-on-surface truncate">
                                  {t.title}
                                </p>
                                <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mt-0.5 flex gap-1.5 items-center">
                                  <span>{t.type}</span>
                                  <span className="opacity-50">•</span>
                                  <span
                                    className={
                                      t.status === "Completed"
                                        ? "text-rhozly-primary"
                                        : t.status === "Pending"
                                          ? "text-rhozly-primary/60"
                                          : "text-rhozly-on-surface/40"
                                    }
                                  >
                                    {t.status}
                                  </span>
                                </p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-xs font-black text-rhozly-on-surface/50 uppercase">
                                  {formatDisplayDate(t.due_date)}
                                </p>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 mt-1">
                    <button
                      onClick={() => {
                        setIsLinking(false);
                        resetLinkBuilder();
                      }}
                      className="flex-1 py-2 bg-rhozly-surface hover:bg-rhozly-surface-low text-rhozly-on-surface font-bold rounded-lg text-xs transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleExecuteLink}
                      disabled={!linkTaskId || isDependenciesLoading}
                      className="flex-1 py-2 bg-rhozly-primary hover:bg-rhozly-primary/90 text-white font-bold rounded-lg text-xs transition-colors disabled:opacity-50"
                    >
                      Save Link
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setIsLinking(true)}
                  className="text-xs font-bold text-rhozly-primary hover:text-rhozly-primary/80 flex items-center gap-1 bg-rhozly-surface px-3 py-2 rounded-lg transition-colors"
                >
                  <Plus size={14} /> Add Dependency
                </button>
              )}
            </div>
          </div>
        )}

        {/* Completion photo — shown once the task is marked complete */}
        {task.status === "Completed" && !task.isGhost && (
          <div className="mb-6 pt-2" data-testid="task-completion-photo-section">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/55">
                Completion photo
              </h4>
              <span className="text-[10px] font-bold text-rhozly-on-surface/40 uppercase tracking-widest">
                Optional
              </span>
            </div>
            <PhotoUploader
              bucket="plant-images"
              pathPrefix="task-completions"
              value={completionPhotoUrl}
              onChange={saveCompletionPhoto}
              label="Photograph the result"
              aspectClass="h-40"
              testIdPrefix="task-completion-photo"
            />
            <p className="text-[11px] font-medium text-rhozly-on-surface/50 leading-snug mt-1.5 px-1">
              Useful when you want to look back later — pruning before/after, harvest size, repair work.
            </p>
          </div>
        )}

        {/* Action Footer */}
        {(() => {
          const todayStr = getLocalDateString(new Date());
          const isInWindow = isInsideHarvestWindow(task, todayStr);
          const windowClosed = !!task.window_end_date
            && task.status === "Pending"
            && !isInWindow
            && task.window_end_date < todayStr;
          // Accept both the canonical "Harvesting" and the legacy "Harvest"
          // produced by Save-to-Shed + Companion Plants — same concept,
          // both deserve the window-task footer.
          const isHarvestPending = (task.type === "Harvesting" || task.type === "Harvest") && task.status === "Pending";

          if (isHarvestPending && isInWindow) {
            return (
              <HarvestWindowFooter
                task={task}
                homeId={homeId}
                inventoryDict={inventoryDict}
                onDelete={onDelete}
                onComplete={onToggleComplete}
                materializeTask={materializeTask}
                onTasksUpdated={onTasksUpdated}
                onClose={onClose}
                isUpdating={isUpdating}
              />
            );
          }
          if (isHarvestPending && windowClosed) {
            return (
              <HarvestWindowClosedFooter
                task={task}
                onDelete={onDelete}
                onLogYield={onToggleComplete}
                materializeTask={materializeTask}
                onTasksUpdated={onTasksUpdated}
                onClose={onClose}
                isUpdating={isUpdating}
              />
            );
          }

          return (
            <div className="flex gap-3 mt-auto shrink-0 pt-4 border-t border-rhozly-outline/10">
              <button
                onClick={onDelete}
                className="w-14 h-14 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center hover:bg-red-500 hover:text-white transition-all shrink-0"
              >
                <Trash2 size={20} />
              </button>
              <button
                onClick={onPostpone}
                className="w-14 h-14 bg-rhozly-surface text-rhozly-primary rounded-2xl flex items-center justify-center hover:bg-rhozly-primary hover:text-white transition-all shrink-0"
                title="Reschedule task"
              >
                <CalendarClock size={20} />
              </button>
              <button
                onClick={onToggleComplete}
                disabled={isBlocked && task.status !== "Completed"}
                className={`flex-1 h-14 rounded-2xl font-black text-white flex items-center justify-center gap-2 transition-all ${isBlocked && task.status !== "Completed" ? "bg-rhozly-surface-low text-rhozly-on-surface/30 cursor-not-allowed" : task.status === "Completed" ? "bg-rhozly-on-surface hover:bg-rhozly-on-surface/90" : "bg-rhozly-primary hover:scale-[1.02]"}`}
              >
                {isUpdating ? (
                  <Loader2 className="animate-spin" size={20} />
                ) : task.status === "Completed" ? (
                  "Mark as Pending"
                ) : isBlocked ? (
                  <>
                    <Lock size={20} /> Blocked
                  </>
                ) : (
                  "Mark as Complete"
                )}
              </button>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ─── HarvestWindowFooter ──────────────────────────────────────────────────
// Three actions when the user opens a harvest task inside its window:
//   - Harvested: marks complete (parent handles yield-log flow).
//   - Not yet: pops a 3 / 5 / 7-day snooze popover; sets `next_check_at`.
//   - Check with AI: opens HarvestRipenessSheet; verdict either marks
//     complete (ripe) or snoozes by the AI's estimated days.
// All paths materialise ghost tasks before writing.

interface HarvestWindowFooterProps {
  task: any;
  homeId: string;
  inventoryDict: Record<string, any>;
  onDelete: () => void;
  onComplete: () => void;
  materializeTask: (t: any) => Promise<any>;
  onTasksUpdated: () => void;
  onClose: () => void;
  isUpdating: boolean;
}

function HarvestWindowFooter({
  task,
  homeId,
  inventoryDict,
  onDelete,
  onComplete,
  materializeTask,
  onTasksUpdated,
  onClose,
  isUpdating,
}: HarvestWindowFooterProps) {
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [ripenessOpen, setRipenessOpen] = useState(false);
  const [partialOpen, setPartialOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // Running total picked-so-far across all linked instances for this task,
  // grouped by unit so we don't pretend "100g + 5 punnets" is comparable.
  const [yieldTotals, setYieldTotals] = useState<Record<string, number>>({});

  const instanceIds = useMemo(
    () => (Array.isArray(task.inventory_item_ids) ? task.inventory_item_ids : []) as string[],
    [task.inventory_item_ids],
  );

  // Resolve a sensible "plant name" for the AI grounding — first linked
  // inventory item's plant name when present, else the task title minus
  // any "Harvest" suffix.
  const linkedPlant = (() => {
    for (const id of instanceIds) {
      const item = inventoryDict?.[id];
      if (item?.plants?.common_name) return item.plants.common_name as string;
      if (item?.plant_name) return item.plant_name as string;
    }
    return null;
  })();
  const plantNameGuess = linkedPlant
    ?? (typeof task.title === "string"
      ? task.title.replace(/\s+harvest\s*$/i, "").trim() || null
      : null);

  // Fetch picked-so-far totals once on mount + whenever the linked
  // instance set changes. Window start as a lower bound keeps the total
  // honest — only counts harvests inside THIS window.
  useEffect(() => {
    if (instanceIds.length === 0) {
      setYieldTotals({});
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const sinceIso = task.due_date ? new Date(task.due_date).toISOString() : null;
        let q = supabase
          .from("yield_records")
          .select("value, unit")
          .in("instance_id", instanceIds);
        if (sinceIso) q = q.gte("harvested_at", sinceIso);
        const { data } = await q;
        if (cancelled) return;
        const totals: Record<string, number> = {};
        (data ?? []).forEach((r: any) => {
          if (typeof r?.value !== "number" || !r?.unit) return;
          totals[r.unit] = (totals[r.unit] ?? 0) + Number(r.value);
        });
        setYieldTotals(totals);
      } catch {
        // Non-fatal — totals are an enhancement, not load-bearing.
      }
    })();
    return () => { cancelled = true; };
  }, [instanceIds, task.due_date]);

  const totalsLine = Object.entries(yieldTotals)
    .filter(([, v]) => v > 0)
    .map(([unit, v]) => {
      // Round to 2dp without trailing zeros for the inline display.
      const rounded = Math.round(v * 100) / 100;
      return `${rounded}${unit === "count" ? "" : unit}`;
    })
    .join(" · ");

  const snoozeFor = async (days: number) => {
    setBusy(true);
    try {
      let target = task;
      if (target.isGhost) target = await materializeTask(target);
      const today = new Date();
      const next = new Date(today);
      next.setDate(today.getDate() + days);
      const nextStr = getLocalDateString(next);
      // Cap snooze at window end so we never push past the window.
      const cap = target.window_end_date;
      const finalStr = cap && nextStr > cap ? cap : nextStr;
      const { error } = await supabase
        .from("tasks")
        .update({ next_check_at: finalStr })
        .eq("id", target.id);
      if (error) throw error;
      toast.success(`Snoozed until ${formatDisplayDate(finalStr)} — still in window.`);
      onTasksUpdated();
      onClose();
    } catch (err: any) {
      Logger.error("Harvest snooze failed", err, { taskId: task.id }, "Couldn't snooze that task.");
    } finally {
      setBusy(false);
      setSnoozeOpen(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 mt-auto shrink-0 pt-4 border-t border-rhozly-outline/10">
      {totalsLine && (
        <div
          data-testid="harvest-running-total"
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800"
        >
          <Sprout size={14} className="shrink-0" />
          <p className="text-[11px] font-black uppercase tracking-widest">
            Picked so far in this window
          </p>
          <p className="ml-auto text-sm font-black tabular-nums">{totalsLine}</p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <button
          data-testid="harvest-action-harvested"
          onClick={onComplete}
          disabled={busy || isUpdating}
          className="h-16 rounded-2xl bg-rhozly-primary text-white font-black flex flex-col items-center justify-center gap-1 hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {isUpdating ? (
            <Loader2 className="animate-spin" size={20} />
          ) : (
            <>
              <Sprout size={20} />
              <span className="text-xs">Harvested</span>
            </>
          )}
        </button>
        <button
          data-testid="harvest-action-picked-some"
          onClick={() => setPartialOpen(true)}
          disabled={busy || isUpdating || instanceIds.length === 0}
          title={instanceIds.length === 0 ? "Link a plant to this task to log partial picks." : "Log a partial harvest — task stays open."}
          className="h-16 rounded-2xl bg-amber-50 text-amber-800 font-black flex flex-col items-center justify-center gap-1 hover:bg-amber-100 transition-colors disabled:opacity-40"
        >
          <Sprout size={20} />
          <span className="text-xs">Picked some</span>
        </button>
        <button
          data-testid="harvest-action-not-yet"
          onClick={() => setSnoozeOpen((v) => !v)}
          disabled={busy || isUpdating}
          className="h-16 rounded-2xl bg-rhozly-surface text-rhozly-on-surface font-black flex flex-col items-center justify-center gap-1 hover:bg-rhozly-surface-mid transition-colors disabled:opacity-50"
        >
          <Clock size={20} />
          <span className="text-xs">Not yet</span>
        </button>
        <button
          data-testid="harvest-action-check-ai"
          onClick={() => setRipenessOpen(true)}
          disabled={busy || isUpdating}
          className="h-16 rounded-2xl bg-emerald-50 text-emerald-700 font-black flex flex-col items-center justify-center gap-1 hover:bg-emerald-100 transition-colors disabled:opacity-50"
        >
          <Sparkles size={20} />
          <span className="text-xs">Check with AI</span>
        </button>
      </div>
      {snoozeOpen && (
        <div
          data-testid="harvest-snooze-popover"
          className="grid grid-cols-3 gap-2 p-2 rounded-2xl bg-rhozly-surface-lowest border border-rhozly-outline/10"
        >
          {[3, 5, 7].map((d) => (
            <button
              key={d}
              data-testid={`harvest-snooze-${d}`}
              onClick={() => snoozeFor(d)}
              disabled={busy}
              className="py-2.5 rounded-xl bg-white border border-rhozly-outline/15 text-sm font-black text-rhozly-on-surface hover:border-rhozly-primary/40 hover:bg-rhozly-primary/5 transition-colors disabled:opacity-50"
            >
              {busy ? <Loader2 className="animate-spin mx-auto" size={14} /> : `${d} days`}
            </button>
          ))}
        </div>
      )}
      <button
        onClick={onDelete}
        className="text-[11px] font-black uppercase tracking-widest text-rhozly-on-surface/40 hover:text-red-500 transition-colors py-1"
      >
        Delete task
      </button>
      <HarvestRipenessSheet
        isOpen={ripenessOpen}
        onClose={() => setRipenessOpen(false)}
        homeId={homeId}
        taskTitle={task.title}
        plantName={plantNameGuess}
        onReady={onComplete}
        onSnoozeFor={(d) => snoozeFor(Math.max(1, Math.min(28, Math.round(d))))}
      />
      <HarvestPartialPickSheet
        isOpen={partialOpen}
        onClose={() => setPartialOpen(false)}
        homeId={homeId}
        instanceIds={instanceIds}
        taskTitle={task.title}
        plantName={plantNameGuess}
        onLogged={(days) => snoozeFor(days)}
      />
    </div>
  );
}

// ─── HarvestWindowClosedFooter ────────────────────────────────────────────
// When the window has elapsed without a harvest, the user picks between
// "Log yield anyway" (treat as completed + open yield log) and "Mark
// missed" (status = Skipped). No more snoozing past window close.

interface HarvestWindowClosedFooterProps {
  task: any;
  onDelete: () => void;
  onLogYield: () => void;
  materializeTask: (t: any) => Promise<any>;
  onTasksUpdated: () => void;
  onClose: () => void;
  isUpdating: boolean;
}

function HarvestWindowClosedFooter({
  task,
  onDelete,
  onLogYield,
  materializeTask,
  onTasksUpdated,
  onClose,
  isUpdating,
}: HarvestWindowClosedFooterProps) {
  const [busy, setBusy] = useState(false);

  const markMissed = async () => {
    setBusy(true);
    try {
      let target = task;
      if (target.isGhost) target = await materializeTask(target);
      const { error } = await supabase
        .from("tasks")
        .update({ status: "Skipped" })
        .eq("id", target.id);
      if (error) throw error;
      toast("Marked as missed — won't appear in your active tasks.");
      onTasksUpdated();
      onClose();
    } catch (err: any) {
      Logger.error("Mark missed failed", err, { taskId: task.id }, "Couldn't mark that task.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 mt-auto shrink-0 pt-4 border-t border-rhozly-outline/10">
      <p className="text-xs font-bold text-rhozly-on-surface/60 leading-snug px-1">
        The harvest window has closed. Did you harvest?
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button
          data-testid="harvest-closed-log-yield"
          onClick={onLogYield}
          disabled={busy || isUpdating}
          className="h-14 rounded-2xl bg-rhozly-primary text-white font-black flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {isUpdating ? <Loader2 className="animate-spin" size={18} /> : <Sprout size={18} />}
          Log yield anyway
        </button>
        <button
          data-testid="harvest-closed-mark-missed"
          onClick={markMissed}
          disabled={busy || isUpdating}
          className="h-14 rounded-2xl bg-rhozly-surface text-rhozly-on-surface/80 font-black flex items-center justify-center gap-2 hover:bg-rhozly-surface-mid transition-colors disabled:opacity-50"
        >
          {busy ? <Loader2 className="animate-spin" size={18} /> : <XCircle size={18} />}
          Mark missed
        </button>
      </div>
      <button
        onClick={onDelete}
        className="text-[11px] font-black uppercase tracking-widest text-rhozly-on-surface/40 hover:text-red-500 transition-colors py-1"
      >
        Delete task
      </button>
    </div>
  );
}
