import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import {
  CheckSquare,
  Clock,
  Droplets,
  Scissors,
  Shovel,
  Wheat,
  Sparkles,
  Loader2,
  Trash2,
  MapPin,
  Info,
  Repeat,
  FileText,
  X,
  Leaf,
  CloudRain,
} from "lucide-react";
import type { Task } from "./TaskCalendar";
import toast from "react-hot-toast";
import { Logger } from "../lib/errorHandler";

interface TaskListProps {
  homeId: string;
  areaId?: string;
  inventoryItemId?: string;
  targetDate?: Date;
  onTaskUpdated?: () => void;
  locationId?: string;
  selectedTypes?: string[];
}

const getLocalDateString = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export default function TaskList({
  homeId,
  areaId,
  inventoryItemId,
  targetDate,
  onTaskUpdated,
  locationId,
  selectedTypes,
}: TaskListProps) {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUpdatingTask, setIsUpdatingTask] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<any | null>(null);

  const dateStr = getLocalDateString(targetDate || new Date());
  const typesFilterStr = selectedTypes?.join(",") || "";

  const fetchTasksAndGhosts = useCallback(async () => {
    setLoading(true);
    const targetDateMs = new Date(dateStr).getTime();

    try {
      // 🚀 1. Query the actual database for rain alerts
      let isRainingTargetDate = false;

      const { data: rainAlerts, error: alertError } = await supabase
        .from("weather_alerts")
        .select("starts_at, locations!inner(home_id)")
        .eq("locations.home_id", homeId)
        .eq("type", "rain");

      if (!alertError && rainAlerts && rainAlerts.length > 0) {
        // If there is a rain alert that starts on our target date, it's a rainy day!
        isRainingTargetDate = rainAlerts.some((alert) =>
          alert.starts_at.startsWith(dateStr),
        );
      }

      // 🚀 2. FETCH PHYSICAL TASKS
      let physicalQuery = supabase
        .from("tasks")
        .select(
          `*, inventory_items(plant_name, identifier, location_name, area_name, plants(thumbnail_url)), locations(is_outside)`,
        )
        .eq("home_id", homeId)
        .eq("due_date", dateStr)
        .neq("status", "Skipped");

      if (areaId) physicalQuery = physicalQuery.eq("area_id", areaId);
      if (inventoryItemId)
        physicalQuery = physicalQuery.eq("inventory_item_id", inventoryItemId);

      const { data: physicalData, error: physicalError } = await physicalQuery;
      if (physicalError) throw physicalError;

      // Apply the weather logic to physical tasks too!
      const physicalTasks = (physicalData || []).map((t) => {
        const isOutside = t.locations?.is_outside;
        const isAutoCompleted =
          isRainingTargetDate &&
          isOutside &&
          t.type === "Watering" &&
          t.status === "Pending";

        if (isAutoCompleted) {
          return { ...t, status: "Completed", isAutoCompleted: true };
        }
        return t;
      });

      // 🚀 3. FETCH BLUEPRINTS FOR GHOST GENERATION
      let bpQuery = supabase
        .from("task_blueprints")
        .select(
          `*, inventory_items(plant_name, identifier, location_name, area_name, plants(thumbnail_url)), locations(is_outside)`,
        )
        .eq("home_id", homeId)
        .eq("is_recurring", true);

      if (areaId) bpQuery = bpQuery.eq("area_id", areaId);
      if (inventoryItemId)
        bpQuery = bpQuery.eq("inventory_item_id", inventoryItemId);

      const { data: bpData, error: bpError } = await bpQuery;
      if (bpError) throw bpError;
      const blueprints = bpData || [];

      // 🚀 4. GENERATE GHOSTS
      const ghostTasks: any[] = [];

      blueprints.forEach((bp) => {
        const safeDateString =
          bp.start_date || bp.created_at || new Date().toISOString();
        const anchorDateStr = safeDateString.split("T")[0];
        const anchorDateMs = new Date(anchorDateStr).getTime();

        if (targetDateMs < anchorDateMs) return;
        if (bp.end_date && targetDateMs > new Date(bp.end_date).getTime())
          return;

        const diffDays = Math.round(
          (targetDateMs - anchorDateMs) / (1000 * 60 * 60 * 24),
        );

        if (diffDays % bp.frequency_days === 0) {
          const hasPhysical = physicalTasks.some(
            (t) => t.blueprint_id === bp.id,
          );

          if (!hasPhysical) {
            const isOutside = bp.locations?.is_outside;
            const isAutoCompleted =
              isRainingTargetDate && isOutside && bp.task_type === "Watering";

            ghostTasks.push({
              id: `ghost-${bp.id}-${dateStr}`,
              home_id: bp.home_id,
              blueprint_id: bp.id,
              title: bp.title,
              description: bp.description,
              type: bp.task_type,
              status: isAutoCompleted ? "Completed" : "Pending",
              due_date: dateStr,
              location_id: bp.location_id,
              area_id: bp.area_id,
              inventory_item_id: bp.inventory_item_id,
              isGhost: true,
              isAutoCompleted: isAutoCompleted,
              inventory_items: bp.inventory_items,
            });
          }
        }
      });

      let allTasks = [...physicalTasks, ...ghostTasks];

      if (locationId && locationId !== "all") {
        allTasks = allTasks.filter((t) => t.location_id === locationId);
      }
      if (typesFilterStr) {
        const typesArray = typesFilterStr.split(",");
        allTasks = allTasks.filter((t) => typesArray.includes(t.type));
      }

      allTasks.sort((a, b) => {
        if (a.status === "Completed" && b.status !== "Completed") return 1;
        if (a.status !== "Completed" && b.status === "Completed") return -1;
        return 0;
      });

      setTasks(allTasks);
    } catch (err) {
      Logger.error("Failed to load dashboard tasks", err);
    } finally {
      setLoading(false);
    }
  }, [homeId, areaId, inventoryItemId, dateStr, locationId, typesFilterStr]);

  useEffect(() => {
    fetchTasksAndGhosts();
  }, [fetchTasksAndGhosts]);

  const toggleTaskCompletion = async (task: any, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    setIsUpdatingTask(task.id);
    const newStatus = task.status === "Completed" ? "Pending" : "Completed";

    try {
      if (task.isGhost) {
        const { data, error } = await supabase
          .from("tasks")
          .insert([
            {
              home_id: task.home_id,
              blueprint_id: task.blueprint_id,
              title: task.title,
              description: task.description,
              type: task.type,
              due_date: task.due_date,
              status: newStatus,
              completed_at:
                newStatus === "Completed" ? new Date().toISOString() : null,
              location_id: task.location_id,
              area_id: task.area_id,
              inventory_item_id: task.inventory_item_id,
            },
          ])
          .select(
            `*, inventory_items(plant_name, identifier, location_name, area_name, plants(thumbnail_url))`,
          )
          .single();

        if (error) throw error;
        const finalData = { ...data, isAutoCompleted: false };
        setTasks(tasks.map((t) => (t.id === task.id ? finalData : t)));
        if (selectedTask?.id === task.id) setSelectedTask(finalData);
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

        const updatedTask = {
          ...task,
          status: newStatus,
          isAutoCompleted: false,
        };
        setTasks(tasks.map((t) => (t.id === task.id ? updatedTask : t)));
        if (selectedTask?.id === task.id) setSelectedTask(updatedTask);
      }

      if (newStatus === "Completed") toast.success("Task completed!");
      onTaskUpdated?.();
    } catch (err) {
      toast.error("Failed to update task.");
    } finally {
      setIsUpdatingTask(null);
    }
  };

  const handleDeleteTask = async (task: any) => {
    if (!window.confirm(`Are you sure you want to remove this task for today?`))
      return;

    setIsUpdatingTask(task.id);
    try {
      if (task.isGhost) {
        await supabase.from("tasks").insert([
          {
            home_id: task.home_id,
            blueprint_id: task.blueprint_id,
            title: task.title,
            description: task.description,
            type: task.type,
            due_date: task.due_date,
            status: "Skipped",
            location_id: task.location_id,
            area_id: task.area_id,
            inventory_item_id: task.inventory_item_id,
          },
        ]);
      } else if (task.blueprint_id) {
        await supabase
          .from("tasks")
          .update({ status: "Skipped" })
          .eq("id", task.id);
      } else {
        await supabase.from("tasks").delete().eq("id", task.id);
      }

      toast.success("Task removed for today.");
      setTasks(tasks.filter((t) => t.id !== task.id));
      setSelectedTask(null);
      onTaskUpdated?.();
    } catch (err) {
      toast.error("Failed to remove task.");
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
      case "Harvesting":
        return <Wheat size={16} className="text-yellow-500" />;
      case "Planting":
        return <Shovel size={16} className="text-amber-700" />;
      default:
        return <Clock size={16} className="text-gray-500" />;
    }
  };

  if (loading)
    return (
      <div className="p-10 flex justify-center">
        <Loader2 className="animate-spin text-rhozly-primary" />
      </div>
    );

  if (tasks.length === 0) {
    return (
      <div className="bg-rhozly-surface-lowest border-2 border-dashed border-rhozly-outline/10 rounded-[2rem] p-8 text-center opacity-50">
        <div className="w-16 h-16 bg-rhozly-primary/5 rounded-full flex items-center justify-center mx-auto mb-4 text-rhozly-primary">
          <CheckSquare size={24} />
        </div>
        <p className="font-black text-lg text-rhozly-on-surface">
          All Caught Up!
        </p>
        <p className="text-xs font-bold mt-1">No tasks matching filters.</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {tasks.map((task) => {
          const plantName = task.inventory_items?.plant_name;
          const plantIdentifier = task.inventory_items?.identifier;
          const thumbnail = task.inventory_items?.plants?.thumbnail_url;
          const locationName = task.inventory_items?.location_name;
          const areaName = task.inventory_items?.area_name;
          const isCompleted = task.status === "Completed";

          return (
            <div
              key={task.id}
              onClick={() => setSelectedTask(task)}
              className={`bg-white p-5 rounded-3xl border border-rhozly-outline/10 shadow-sm flex items-center justify-between group relative cursor-pointer hover:border-rhozly-primary/30 transition-all
                ${isCompleted ? "opacity-60 bg-gray-50" : ""}
              `}
            >
              {task.isAutoCompleted ? (
                <div className="absolute -top-2 -right-2 z-10 text-[8px] font-black uppercase text-white bg-blue-500 px-2 py-1 rounded-full shadow-md flex items-center gap-1">
                  <CloudRain size={8} /> Nature Watered
                </div>
              ) : task.isGhost && !isCompleted ? (
                <div className="absolute -top-2 -right-2 z-10 text-[8px] font-black uppercase text-white bg-rhozly-primary px-2 py-1 rounded-full shadow-md flex items-center gap-1">
                  <Sparkles size={8} /> Auto
                </div>
              ) : null}

              <div className="flex items-center gap-4 w-full">
                <button
                  onClick={(e) => toggleTaskCompletion(task, e)}
                  disabled={isUpdatingTask === task.id}
                  className={`w-10 h-10 shrink-0 rounded-2xl flex items-center justify-center border-2 transition-all active:scale-90 
                    ${
                      isUpdatingTask === task.id
                        ? "border-rhozly-primary/30"
                        : isCompleted
                          ? "bg-green-500 border-green-500 text-white"
                          : "border-rhozly-outline/20 hover:border-rhozly-primary text-transparent hover:text-rhozly-primary/30"
                    }
                  `}
                >
                  {isUpdatingTask === task.id ? (
                    <Loader2
                      size={18}
                      className="animate-spin text-rhozly-primary"
                    />
                  ) : (
                    <CheckSquare size={18} className="currentColor" />
                  )}
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <span
                      className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md flex items-center gap-1 ${isCompleted ? "bg-gray-200 text-gray-500" : "text-rhozly-primary bg-rhozly-primary/10"}`}
                    >
                      {getTaskIcon(task.type)} {task.type}
                    </span>

                    {(locationName || areaName) && (
                      <span className="text-[10px] font-bold text-rhozly-on-surface/50 flex items-center gap-1 truncate max-w-full">
                        <MapPin size={10} className="shrink-0" />
                        <span className="truncate">
                          {locationName}{" "}
                          {areaName && (
                            <>
                              <span className="opacity-50 mx-0.5">•</span>
                              {areaName}
                            </>
                          )}
                        </span>
                      </span>
                    )}
                  </div>

                  <h4
                    className={`font-black text-rhozly-on-surface text-sm md:text-base leading-tight truncate ${isCompleted ? "line-through decoration-2 decoration-green-500/50" : ""}`}
                  >
                    {task.title}
                  </h4>

                  {plantName && (
                    <div
                      className={`text-[11px] font-bold mt-1 flex items-center gap-1.5 truncate ${isCompleted ? "text-gray-400" : "text-rhozly-on-surface/70"}`}
                    >
                      <Leaf
                        size={12}
                        className={`shrink-0 ${isCompleted ? "text-gray-400" : "text-rhozly-primary/70"}`}
                      />
                      <span className="truncate">
                        {plantName}{" "}
                        {plantIdentifier && (
                          <span className="opacity-50">
                            ({plantIdentifier.split("#")[1]})
                          </span>
                        )}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {thumbnail && (
                <img
                  src={thumbnail}
                  className={`w-14 h-14 rounded-[1rem] object-cover border border-rhozly-outline/10 hidden sm:block shrink-0 ml-4 ${isCompleted ? "grayscale opacity-50" : ""}`}
                  alt="plant"
                />
              )}
            </div>
          );
        })}
      </div>

      {selectedTask && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-rhozly-bg/90 backdrop-blur-sm animate-in fade-in"
          onClick={() => setSelectedTask(null)}
        >
          <div
            className="bg-white w-full max-w-md rounded-[3rem] p-8 shadow-2xl border border-rhozly-outline/10 flex flex-col max-h-[90vh] overflow-y-auto custom-scrollbar"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-6">
              <div className="flex gap-3 items-center">
                <div
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${selectedTask.status === "Completed" ? "bg-green-100 text-green-600" : "bg-rhozly-primary/10 text-rhozly-primary"}`}
                >
                  {getTaskIcon(selectedTask.type)}
                </div>
                <div>
                  <h3
                    className={`text-xl font-black leading-tight ${selectedTask.status === "Completed" ? "line-through decoration-2 decoration-green-500/50" : ""}`}
                  >
                    {selectedTask.title}
                  </h3>
                  <span className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40">
                    {selectedTask.status === "Completed"
                      ? "Completed"
                      : "Pending Task"}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedTask(null)}
                className="p-2 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors shrink-0"
              >
                <X size={18} />
              </button>
            </div>

            {selectedTask.isAutoCompleted && (
              <div className="mb-6 bg-blue-50 border border-blue-100 p-4 rounded-2xl flex items-start gap-3 text-blue-800">
                <CloudRain className="shrink-0 mt-0.5" size={18} />
                <div>
                  <p className="text-sm font-black">Nature handled this!</p>
                  <p className="text-xs font-bold opacity-80 mt-0.5">
                    We forecasted rain on this day for this outside area, so we
                    automatically checked this off for you.
                  </p>
                </div>
              </div>
            )}

            {selectedTask.description && (
              <div className="mb-6 bg-rhozly-surface-lowest p-4 rounded-2xl border border-rhozly-outline/5">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 flex items-center gap-1 mb-2">
                  <FileText size={12} /> Instructions
                </h4>
                <p className="text-sm font-bold text-rhozly-on-surface/60">
                  {selectedTask.description}
                </p>
              </div>
            )}

            <div className="space-y-3 mb-8">
              {selectedTask.inventory_items?.plant_name && (
                <div className="flex items-center gap-3 p-3 bg-rhozly-surface-lowest rounded-2xl">
                  {selectedTask.inventory_items?.plants?.thumbnail_url ? (
                    <img
                      src={selectedTask.inventory_items.plants.thumbnail_url}
                      className="w-10 h-10 rounded-xl object-cover shrink-0"
                      alt="plant"
                    />
                  ) : (
                    <div className="w-10 h-10 bg-rhozly-primary/10 rounded-xl flex items-center justify-center text-rhozly-primary shrink-0">
                      <Leaf size={16} />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40">
                      Related Plant
                    </p>
                    <p className="text-sm font-bold truncate">
                      {selectedTask.inventory_items.plant_name}{" "}
                      <span className="opacity-50 text-xs">
                        (
                        {selectedTask.inventory_items.identifier?.split("#")[1]}
                        )
                      </span>
                    </p>
                  </div>
                </div>
              )}

              {(selectedTask.inventory_items?.location_name ||
                selectedTask.inventory_items?.area_name) && (
                <div className="flex items-center gap-3 p-3 bg-rhozly-surface-lowest rounded-2xl">
                  <div className="w-10 h-10 bg-blue-50 text-blue-500 rounded-xl flex items-center justify-center shrink-0">
                    <MapPin size={16} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40">
                      Location
                    </p>
                    <p className="text-sm font-bold truncate">
                      {selectedTask.inventory_items.location_name}{" "}
                      {selectedTask.inventory_items.area_name &&
                        `• ${selectedTask.inventory_items.area_name}`}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3 p-3 bg-rhozly-surface-lowest rounded-2xl">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${selectedTask.blueprint_id ? "bg-purple-50 text-purple-500" : "bg-orange-50 text-orange-500"}`}
                >
                  {selectedTask.blueprint_id ? (
                    <Repeat size={16} />
                  ) : (
                    <Info size={16} />
                  )}
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40">
                    Origin
                  </p>
                  <p className="text-sm font-bold">
                    {selectedTask.blueprint_id
                      ? "Automated Schedule"
                      : "Manual Entry"}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-auto shrink-0">
              <button
                onClick={() => handleDeleteTask(selectedTask)}
                className="w-14 h-14 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center hover:bg-red-500 hover:text-white transition-all shrink-0"
                title="Remove task"
              >
                {isUpdatingTask === selectedTask.id ? (
                  <Loader2 className="animate-spin" size={20} />
                ) : (
                  <Trash2 size={20} />
                )}
              </button>

              <button
                onClick={() => toggleTaskCompletion(selectedTask)}
                className={`flex-1 h-14 rounded-2xl font-black text-white flex items-center justify-center gap-2 transition-all ${selectedTask.status === "Completed" ? "bg-gray-800 hover:bg-gray-900" : "bg-rhozly-primary hover:scale-[1.02]"}`}
              >
                {isUpdatingTask === selectedTask.id ? (
                  <Loader2 className="animate-spin" size={20} />
                ) : selectedTask.status === "Completed" ? (
                  <>Mark as Pending</>
                ) : (
                  <>
                    <CheckSquare size={20} /> Mark as Complete
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
