import React, { useState, useMemo } from "react";
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  startOfDay,
  isWithinInterval,
} from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Droplets,
  Wheat,
  Scissors,
  Shovel,
  CheckCircle2,
  Filter,
  Sprout,
  ClipboardList,
} from "lucide-react";
import {
  InventoryItem,
  GardenTask,
  Plant,
  Location,
  WeatherData,
} from "../types";
import { getPlantDisplayName } from "../utils/plantUtils";
import { TaskDetailsModal } from "./TaskDetailsModal";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface CalendarViewProps {
  inventory: InventoryItem[];
  tasks: GardenTask[];
  plants: Plant[];
  locations: Location[];
  weatherMap: Record<string, WeatherData>;
  onToggleTask: (taskId: string, currentStatus: string) => Promise<void>;
}

// ✅ Future-proof Category Mapper
const getTaskCategory = (
  type: string,
): "Plant" | "Watering" | "Harvest" | "Task" => {
  const t = type.toLowerCase();
  if (t.includes("plant") || t.includes("sow") || t.includes("seed"))
    return "Plant";
  if (t.includes("water")) return "Watering";
  if (t.includes("harvest") || t.includes("pick")) return "Harvest";
  return "Task"; // Catch-all for Pruning, Feeding, etc.
};

export const CalendarView: React.FC<CalendarViewProps> = ({
  inventory,
  tasks,
  plants,
  locations,
  onToggleTask,
}) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [selectedTask, setSelectedTask] = useState<GardenTask | null>(null);

  // --- FILTER STATE ---
  const [filterLocationId, setFilterLocationId] = useState<string>("all");
  const [filterAreaId, setFilterAreaId] = useState<string>("all");
  const [activeCategories, setActiveCategories] = useState<string[]>([
    "Plant",
    "Watering",
    "Harvest",
    "Task",
  ]);

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const calendarDays = eachDayOfInterval({
    start: startOfWeek(monthStart),
    end: endOfWeek(monthEnd),
  });

  // --- DERIVED DATA ---
  const availableAreas = useMemo(() => {
    if (filterLocationId === "all") return [];
    return locations.find((l) => l.id === filterLocationId)?.areas || [];
  }, [filterLocationId, locations]);

  const getTaskIcon = (type: GardenTask["type"]) => {
    switch (type) {
      case "Watering":
        return <Droplets size={12} />;
      case "Pruning":
        return <Scissors size={12} />;
      case "Feeding":
        return <Shovel size={12} />;
      case "Harvesting":
        return <Wheat size={12} />;
      default:
        return <CheckCircle2 size={12} />;
    }
  };

  const getTaskColor = (type: GardenTask["type"]) => {
    switch (type) {
      case "Watering":
        return "bg-blue-100 text-blue-600";
      case "Pruning":
        return "bg-emerald-100 text-emerald-600";
      case "Feeding":
        return "bg-orange-100 text-orange-600";
      case "Harvesting":
        return "bg-amber-100 text-amber-600";
      default:
        return "bg-stone-100 text-stone-600";
    }
  };

  const getTasksForDay = (day: Date) => {
    const dayStart = startOfDay(day);

    return tasks.filter((task) => {
      const item = inventory.find((i) => i.id === task.inventoryItemId);
      const category = getTaskCategory(task.type);

      // 1. Location & Area Filters
      if (filterLocationId !== "all" && item?.locationId !== filterLocationId)
        return false;
      if (filterAreaId !== "all" && item?.areaId !== filterAreaId) return false;

      // 2. Category Filter
      if (!activeCategories.includes(category)) return false;

      // 3. Date Range Logic
      const sDate = task.startDate || (task as any).start_date;
      const eDate = task.dueDate || (task as any).due_date;
      if (!eDate) return false;

      const rangeStart = startOfDay(new Date(sDate || eDate));
      const rangeEnd = startOfDay(new Date(eDate));

      try {
        return isWithinInterval(dayStart, { start: rangeStart, end: rangeEnd });
      } catch (e) {
        return false;
      }
    });
  };

  const toggleCategory = (cat: string) => {
    setActiveCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
  };

  return (
    <div className="flex flex-col gap-8">
      {/* 🛠️ HEADER & ADVANCED FILTERS */}
      <div className="flex flex-col gap-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center shadow-sm">
              <CalendarIcon size={28} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-stone-900 tracking-tight">
                Garden Calendar
              </h2>
              <p className="text-sm text-stone-500 font-medium">
                Categorized task schedule
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-white p-1 rounded-2xl border border-stone-100 shadow-sm self-end">
            <button
              onClick={prevMonth}
              className="p-2 hover:bg-stone-50 rounded-xl transition-all"
            >
              <ChevronLeft size={20} />
            </button>
            <span className="px-4 font-bold text-stone-900 min-w-[140px] text-center">
              {format(currentMonth, "MMMM yyyy")}
            </span>
            <button
              onClick={nextMonth}
              className="p-2 hover:bg-stone-50 rounded-xl transition-all"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-stone-100 flex flex-col gap-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="flex flex-col gap-2">
              <label className="text-[10px] uppercase font-black text-stone-400 tracking-widest ml-1">
                Location
              </label>
              <select
                value={filterLocationId}
                onChange={(e) => {
                  setFilterLocationId(e.target.value);
                  setFilterAreaId("all");
                }}
                className="bg-stone-50 border-none rounded-2xl px-4 py-3 text-sm font-bold text-stone-700 focus:ring-2 focus:ring-emerald-500"
              >
                <option value="all">All Locations</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[10px] uppercase font-black text-stone-400 tracking-widest ml-1">
                Specific Area
              </label>
              <select
                disabled={filterLocationId === "all"}
                value={filterAreaId}
                onChange={(e) => setFilterAreaId(e.target.value)}
                className="bg-stone-50 border-none rounded-2xl px-4 py-3 text-sm font-bold text-stone-700 focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
              >
                <option value="all">All Areas</option>
                {availableAreas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-2 md:col-span-2 lg:col-span-1">
              <label className="text-[10px] uppercase font-black text-stone-400 tracking-widest ml-1">
                Task Categories
              </label>
              <div className="flex flex-wrap gap-2">
                <FilterChip
                  label="Plant"
                  icon={<Sprout size={14} />}
                  active={activeCategories.includes("Plant")}
                  onClick={() => toggleCategory("Plant")}
                  color="emerald"
                />
                <FilterChip
                  label="Water"
                  icon={<Droplets size={14} />}
                  active={activeCategories.includes("Watering")}
                  onClick={() => toggleCategory("Watering")}
                  color="blue"
                />
                <FilterChip
                  label="Harvest"
                  icon={<Wheat size={14} />}
                  active={activeCategories.includes("Harvest")}
                  onClick={() => toggleCategory("Harvest")}
                  color="amber"
                />
                <FilterChip
                  label="Other"
                  icon={<ClipboardList size={14} />}
                  active={activeCategories.includes("Task")}
                  onClick={() => toggleCategory("Task")}
                  color="stone"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Calendar Grid */}
        <div className="lg:col-span-3 bg-white p-6 rounded-[2.5rem] shadow-sm border border-stone-100">
          <div className="grid grid-cols-7 mb-4">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div
                key={d}
                className="text-center text-[10px] font-bold text-stone-400 uppercase tracking-widest py-2"
              >
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-px bg-stone-100 rounded-2xl overflow-hidden border border-stone-100">
            {calendarDays.map((day, idx) => {
              const tasksOnDay = getTasksForDay(day);
              const isSelected = selectedDate && isSameDay(day, selectedDate);
              const isCurrentMonth = isSameMonth(day, monthStart);
              const hasHarvest = tasksOnDay.some(
                (t) => getTaskCategory(t.type) === "Harvest",
              );

              return (
                <div
                  key={idx}
                  onClick={() => setSelectedDate(day)}
                  className={cn(
                    "min-h-[110px] p-2 bg-white cursor-pointer transition-all hover:bg-stone-50 relative",
                    !isCurrentMonth && "bg-stone-50/50 opacity-40",
                    isSelected && "ring-2 ring-emerald-500 ring-inset z-20",
                    hasHarvest && "bg-amber-50/40",
                  )}
                >
                  {hasHarvest && (
                    <div className="absolute top-0 left-0 right-0 h-1.5 bg-amber-400 z-10" />
                  )}
                  <div className="relative z-20">
                    <span
                      className={cn(
                        "text-sm font-bold w-7 h-7 flex items-center justify-center rounded-full mb-2",
                        isToday(day)
                          ? "bg-emerald-600 text-white"
                          : "text-stone-900",
                      )}
                    >
                      {format(day, "d")}
                    </span>
                    <div className="flex flex-col gap-1">
                      {tasksOnDay.slice(0, 3).map((task) => (
                        <div
                          key={task.id}
                          className={cn(
                            "text-[9px] px-1.5 py-0.5 rounded-md font-bold truncate flex items-center gap-1 shadow-sm",
                            getTaskColor(task.type),
                          )}
                        >
                          {getTaskIcon(task.type)}
                          <span className="truncate">{task.title}</span>
                        </div>
                      ))}
                      {tasksOnDay.length > 3 && (
                        <span className="text-[9px] text-stone-400 font-bold pl-1">
                          +{tasksOnDay.length - 3} more
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sidebar Details */}
        <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-stone-100 h-fit">
          <h3 className="text-lg font-bold text-stone-900 mb-1">
            {selectedDate
              ? format(selectedDate, "EEEE, MMM do")
              : "Select a date"}
          </h3>
          <p className="text-xs text-stone-500 mb-6 font-medium uppercase tracking-wider">
            Schedule
          </p>

          <div className="flex flex-col gap-3">
            {selectedDate && getTasksForDay(selectedDate).length > 0 ? (
              getTasksForDay(selectedDate).map((task) => (
                <div
                  key={task.id}
                  onClick={() => setSelectedTask(task)}
                  className={cn(
                    "p-3 bg-stone-50 rounded-2xl border border-stone-100 flex items-center gap-3 transition-all cursor-pointer hover:bg-stone-100 hover:shadow-md",
                    task.status === "Completed" && "opacity-60",
                  )}
                >
                  <div
                    className={cn(
                      "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm",
                      getTaskColor(task.type),
                    )}
                  >
                    {getTaskIcon(task.type)}
                  </div>
                  <div className="flex flex-col overflow-hidden">
                    <span className="text-sm font-bold text-stone-900 truncate">
                      {task.title}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-tighter text-stone-400">
                      {task.type} • {task.status}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-12 text-center bg-stone-50 rounded-3xl border border-stone-100 border-dashed">
                <p className="text-sm text-stone-400 font-medium">
                  No tasks found.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedTask && (
        <TaskDetailsModal
          task={selectedTask}
          item={inventory.find((i) => i.id === selectedTask.inventoryItemId)}
          onClose={() => setSelectedTask(null)}
          onToggle={onToggleTask}
        />
      )}
    </div>
  );
};

// --- SUB-COMPONENT FOR FILTER CHIPS ---
const FilterChip = ({ label, icon, active, onClick, color }: any) => {
  const colors: any = {
    emerald: active
      ? "bg-emerald-600 text-white"
      : "bg-emerald-50 text-emerald-600",
    blue: active ? "bg-blue-600 text-white" : "bg-blue-50 text-blue-600",
    amber: active ? "bg-amber-500 text-white" : "bg-amber-50 text-amber-600",
    stone: active ? "bg-stone-600 text-white" : "bg-stone-50 text-stone-600",
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all border border-transparent shadow-sm",
        colors[color],
        !active && "bg-white border-stone-100 text-stone-400",
      )}
    >
      {icon}
      {label}
    </button>
  );
};
