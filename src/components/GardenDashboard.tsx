import React, { useState } from "react";
import {
  Sprout,
  CheckCircle2,
  Clock,
  AlertCircle,
  Droplets,
  Scissors,
  Shovel,
  Wheat,
  Wind,
  Snowflake,
  AlertTriangle,
  X,
  Leaf,
} from "lucide-react";
import {
  InventoryItem,
  GardenTask,
  WeatherData,
  Plant,
  WeatherAlert,
  Location,
} from "../types";
import { motion } from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { PlantDetailsModal } from "./PlantDetailsModal";
import { TaskDetailsModal } from "./TaskDetailsModal";
import { getPlantDisplayName } from "../utils/plantUtils";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface GardenDashboardProps {
  userId: string;
  inventory: InventoryItem[];
  tasks: GardenTask[];
  plants: Plant[];
  locations: Location[];
  weatherMap: Record<string, WeatherData>;
  weatherAlerts?: WeatherAlert[];
  onToggleTask: (taskId: string, currentStatus: string) => Promise<void>;
  onDismissAlert?: (alertId: string) => void;
  selectedItem: InventoryItem | null;
  setSelectedItem: (item: InventoryItem | null) => void;
}

export const GardenDashboard: React.FC<GardenDashboardProps> = ({
  userId,
  inventory,
  tasks,
  plants,
  locations,
  weatherMap,
  weatherAlerts = [],
  onToggleTask,
  onDismissAlert,
  selectedItem,
  setSelectedItem,
}) => {
  const [selectedTask, setSelectedTask] = useState<GardenTask | null>(null);
  const [taskTab, setTaskTab] = useState<"pending" | "completed">("pending");
  const plantedItems = inventory.filter((item) => item.status === "Planted");

  const isItemOutdoors = (item: InventoryItem) => {
    if (item.environment === "Outdoors") return true;
    if (item.environment === "Indoors") return false;

    if (item.locationId && item.areaId) {
      const loc = locations.find((l) => l.id === item.locationId);
      const area = loc?.areas?.find((a) => a.id === item.areaId);
      if (area?.type === "outside") return true;
    }

    return item.status === "Planted";
  };

  const filteredTasks = tasks.filter((task) => {
    const taskDate = new Date(task.dueDate);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const taskDay = new Date(
      taskDate.getFullYear(),
      taskDate.getMonth(),
      taskDate.getDate(),
    );

    if (task.status === "Completed") {
      if (!task.completedAt) return true;
      const diffMs = now.getTime() - new Date(task.completedAt).getTime();
      return diffMs < 24 * 60 * 60 * 1000;
    }

    return taskDay <= today;
  });

  const deduplicatedTasks = filteredTasks.reduce(
    (acc: GardenTask[], current) => {
      const item = inventory.find((i) => i.id === current.inventoryItemId);
      const locWeather = item?.locationId ? weatherMap[item.locationId] : null;

      // ✅ FIX: Safe access for todayWarnings
      const isRainPostponed =
        locWeather?.todayWarnings?.rain?.active &&
        current.type === "Watering" &&
        item &&
        isItemOutdoors(item) &&
        current.status !== "Completed";

      const isDone = current.status === "Completed" || isRainPostponed;
      const currentDay = new Date(current.dueDate).toDateString();

      const existingIndex = acc.findIndex(
        (existing) =>
          existing.inventoryItemId === current.inventoryItemId &&
          existing.type === current.type,
      );

      if (existingIndex >= 0) {
        const existing = acc[existingIndex];
        const existingItem = inventory.find(
          (i) => i.id === existing.inventoryItemId,
        );
        const existingLocWeather = existingItem?.locationId
          ? weatherMap[existingItem.locationId]
          : null;

        // ✅ FIX: Safe access for todayWarnings
        const existingRainPostponed =
          existingLocWeather?.todayWarnings?.rain?.active &&
          existing.type === "Watering" &&
          existingItem &&
          isItemOutdoors(existingItem) &&
          existing.status !== "Completed";

        const existingDone =
          existing.status === "Completed" || existingRainPostponed;
        const existingDay = new Date(existing.dueDate).toDateString();

        let replace = false;
        let keepBoth = false;

        if (isDone && existingDone) {
          if (currentDay === existingDay) {
            if (
              current.status === "Completed" &&
              existing.status !== "Completed"
            )
              replace = true;
          } else {
            keepBoth = true;
          }
        } else if (isDone && !existingDone) {
          replace = true;
        } else if (!isDone && existingDone) {
          replace = false;
        } else {
          if (
            new Date(current.dueDate).getTime() <
            new Date(existing.dueDate).getTime()
          )
            replace = true;
        }

        if (keepBoth) {
          acc.push(current);
        } else if (replace) {
          acc[existingIndex] = current;
        }
      } else {
        acc.push(current);
      }
      return acc;
    },
    [],
  );

  const pendingTasks = deduplicatedTasks
    .filter((t) => {
      const isCompleted = t.status === "Completed";
      const item = inventory.find((i) => i.id === t.inventoryItemId);
      const locWeather = item?.locationId ? weatherMap[item.locationId] : null;
      const isRainPostponed =
        locWeather?.todayWarnings?.rain?.active &&
        t.type === "Watering" &&
        item &&
        isItemOutdoors(item);
      return !isCompleted && !isRainPostponed;
    })
    .sort(
      (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
    );

  const completedTasks = deduplicatedTasks
    .filter((t) => {
      const isCompleted = t.status === "Completed";
      const item = inventory.find((i) => i.id === t.inventoryItemId);
      const locWeather = item?.locationId ? weatherMap[item.locationId] : null;
      const isRainPostponed =
        locWeather?.todayWarnings?.rain?.active &&
        t.type === "Watering" &&
        item &&
        isItemOutdoors(item);
      return isCompleted || isRainPostponed;
    })
    .sort(
      (a, b) =>
        new Date(b.completedAt || b.dueDate).getTime() -
        new Date(a.completedAt || a.dueDate).getTime(),
    );

  const activeTasks = taskTab === "pending" ? pendingTasks : completedTasks;

  const isOverdue = (dueDate: string, status: string) => {
    if (status === "Completed") return false;
    const now = new Date();
    const due = new Date(dueDate);
    const diffHours = (now.getTime() - due.getTime()) / (1000 * 60 * 60);
    return diffHours > 2;
  };

  const getTaskIcon = (type: GardenTask["type"]) => {
    switch (type) {
      case "Watering":
        return <Droplets size={18} />;
      case "Pruning":
        return <Scissors size={18} />;
      case "Feeding":
        return <Shovel size={18} />;
      case "Harvesting":
        return <Wheat size={18} />;
      default:
        return <CheckCircle2 size={18} />;
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center">
            <Sprout size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-stone-900">My Garden</h2>
            <p className="text-xs text-stone-500">
              {plantedItems.length} plants currently growing
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {plantedItems.length === 0 ? (
            <div className="col-span-full py-8 text-center bg-stone-50 rounded-3xl border border-stone-100">
              <p className="text-sm text-stone-400">
                No plants in the garden yet.
              </p>
            </div>
          ) : (
            plantedItems.map((item) => (
              <motion.div
                key={item.id}
                whileHover={{ scale: 1.05 }}
                onClick={() => setSelectedItem(item)}
                className="bg-white p-3 sm:p-4 rounded-2xl border border-stone-100 shadow-sm cursor-pointer hover:border-emerald-200 transition-all flex flex-col items-center text-center gap-1.5 sm:gap-2"
              >
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center shrink-0">
                  <Leaf className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div className="w-full">
                  <h4 className="text-xs sm:text-sm font-bold text-stone-900 leading-tight break-words">
                    {getPlantDisplayName(item)}
                  </h4>
                  <p className="text-[9px] sm:text-[10px] text-stone-400 uppercase tracking-widest mt-0.5 sm:mt-1 leading-tight">
                    {item.locationName || "Planted"}
                    {item.areaName ? ` (${item.areaName})` : ""}
                  </p>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>

      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center">
              <CheckCircle2 size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-stone-900">Daily Tasks</h2>
              <p className="text-xs text-stone-500">
                Keep your garden thriving
              </p>
            </div>
          </div>

          <div className="flex bg-stone-100 p-1 rounded-xl">
            <button
              onClick={() => setTaskTab("pending")}
              className={cn(
                "px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all",
                taskTab === "pending"
                  ? "bg-white text-stone-900 shadow-sm"
                  : "text-stone-500 hover:text-stone-700",
              )}
            >
              Pending ({pendingTasks.length})
            </button>
            <button
              onClick={() => setTaskTab("completed")}
              className={cn(
                "px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all",
                taskTab === "completed"
                  ? "bg-white text-stone-900 shadow-sm"
                  : "text-stone-500 hover:text-stone-700",
              )}
            >
              Done ({completedTasks.length})
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {activeTasks.length === 0 ? (
            <div className="py-8 text-center bg-stone-50 rounded-3xl border border-stone-100">
              <p className="text-sm text-stone-400">
                {taskTab === "pending"
                  ? "All tasks completed! Relax."
                  : "No completed tasks yet."}
              </p>
            </div>
          ) : (
            activeTasks.map((task) => {
              const overdue = isOverdue(task.dueDate, task.status);
              const isCompleted = task.status === "Completed";
              const item = inventory.find((i) => i.id === task.inventoryItemId);
              const locWeather = item?.locationId
                ? weatherMap[item.locationId]
                : null;

              // ✅ FIX: Safe access for rain warnings
              const isRainPostponed =
                locWeather?.todayWarnings?.rain?.active &&
                task.type === "Watering" &&
                !isCompleted &&
                item &&
                isItemOutdoors(item);

              let daysOverdue = 0;
              if (overdue && !isCompleted) {
                const taskDate = new Date(task.dueDate);
                taskDate.setHours(0, 0, 0, 0);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                daysOverdue = Math.floor(
                  (today.getTime() - taskDate.getTime()) /
                    (1000 * 60 * 60 * 24),
                );
              }

              return (
                <motion.div
                  key={task.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  whileHover={{ scale: 1.02 }}
                  onClick={() => setSelectedTask(task)}
                  className={cn(
                    "p-4 rounded-2xl border transition-all flex items-center justify-between gap-4 cursor-pointer",
                    overdue
                      ? "bg-red-50 border-red-100 shadow-lg shadow-red-100/50 animate-pulse"
                      : "bg-white border-stone-100 shadow-sm",
                    (isRainPostponed || isCompleted) && "opacity-60 grayscale",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                        overdue
                          ? "bg-red-600 text-white"
                          : isCompleted
                            ? "bg-emerald-100 text-emerald-600"
                            : "bg-stone-50 text-stone-600",
                      )}
                    >
                      {getTaskIcon(task.type)}
                    </div>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={cn(
                            "text-sm font-bold",
                            overdue ? "text-red-900" : "text-stone-900",
                            isCompleted && "line-through",
                          )}
                        >
                          {item
                            ? `${task.type} ${getPlantDisplayName(item)}`
                            : task.title}
                        </span>
                        {daysOverdue > 0 && (
                          <span className="bg-red-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md whitespace-nowrap">
                            +{daysOverdue} {daysOverdue === 1 ? "day" : "days"}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-stone-400 uppercase tracking-widest mt-0.5">
                        {isCompleted
                          ? `Completed ${task.completedAt ? new Date(task.completedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}`
                          : isRainPostponed
                            ? "Postponed - Rain Expected"
                            : `Due ${new Date(task.dueDate).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleTask(task.id, task.status);
                    }}
                    disabled={isRainPostponed}
                    className={cn(
                      "p-2 rounded-xl transition-all",
                      isCompleted
                        ? "bg-emerald-600 text-white hover:bg-emerald-700"
                        : overdue
                          ? "bg-red-600 text-white hover:bg-red-700"
                          : "bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white",
                      isRainPostponed && "cursor-not-allowed",
                    )}
                  >
                    <CheckCircle2 size={20} />
                  </button>
                </motion.div>
              );
            })
          )}
        </div>
      </div>

      {selectedItem && (
        <PlantDetailsModal
          // ✅ Ensure we always have the freshest version of the item
          item={inventory.find((i) => i.id === selectedItem.id) || selectedItem}
          // ✅ FIX: Improved lookup with a dummy fallback to prevent crashes
          plant={
            plants.find(
              (p) => String(p.id) === String(selectedItem.plant_id),
            ) ||
            ({
              id: selectedItem.plant_id,
              common_name: selectedItem.plant_name || "Unknown Plant",
              scientific_name: [],
              cycle: "Unknown",
              watering: "Average",
              sunlight: [],
              care_level: "Beginner",
              is_edible: false,
              is_toxic_pets: false,
              is_toxic_humans: false,
            } as Plant)
          }
          tasks={tasks}
          onClose={() => setSelectedItem(null)}
        />
      )}
    </div>
  );
};
