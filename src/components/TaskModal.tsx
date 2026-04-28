import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import {
  X,
  Leaf,
  Grid,
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
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Edit3,
  Save,
} from "lucide-react";
import toast from "react-hot-toast";
import { formatDisplayDate } from "../lib/dateUtils";

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
}: TaskModalProps) {
  const navigate = useNavigate();

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
      console.error(e);
      toast.error("Failed to load task dependencies.");
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
        console.error("Dependency Search Error:", e);
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
      toast.error("Failed to link task.");
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
      toast.error("Failed to remove dependency.");
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
      toast.error("Failed to update instances.");
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
      toast.error("Failed to save task details.");
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
            <div className="flex-1 flex gap-2 pr-4">
              <h3 className="text-xl font-black leading-tight">{task.title}</h3>
              <button
                onClick={() => setIsEditingDetails(true)}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center text-rhozly-primary/60 hover:text-rhozly-primary transition-colors shrink-0"
                title="Edit Task Details"
              >
                <Edit3 size={16} />
              </button>
            </div>
          )}
          <button
            onClick={onClose}
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
              {task.areas?.name && (
                <div
                  className="flex items-center gap-3 p-3 bg-rhozly-surface-lowest rounded-2xl border border-rhozly-outline/10 cursor-pointer hover:bg-rhozly-surface-low transition-colors"
                  onClick={() => {
                    onClose();
                    navigate("/areas");
                  }}
                >
                  <div className="w-10 h-10 bg-rhozly-surface rounded-xl flex items-center justify-center text-rhozly-primary shrink-0">
                    <Grid size={16} />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40">
                      Location • Area
                    </p>
                    <p className="text-sm font-bold text-rhozly-on-surface">
                      {task.locations?.name} • {task.areas?.name}
                    </p>
                  </div>
                </div>
              )}

              {task.plans?.name && (
                <div
                  className="flex items-center gap-3 p-3 bg-rhozly-surface-lowest rounded-2xl border border-rhozly-outline/10 cursor-pointer hover:bg-rhozly-surface-low transition-colors"
                  onClick={() => {
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
                      {task.plans.name}
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

        {/* Action Footer */}
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
      </div>
    </div>
  );
}
