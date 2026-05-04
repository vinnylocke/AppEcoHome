import React, { useState, useEffect, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Filter,
  Plus,
  Sparkles,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { scorePlantByPreferences } from "../hooks/useUserPreferences";
import { supabase } from "../lib/supabase";
import { Logger } from "../lib/errorHandler";
import toast from "react-hot-toast";
import AddTaskModal from "./AddTaskModal";
import { TASK_CATEGORIES } from "../constants/taskCategories";
import TaskList from "./TaskList";
import { usePlantDoctor } from "../context/PlantDoctorContext";
import { TaskEngine } from "../lib/taskEngine";
import { getLocalDateString } from "../lib/dateUtils";

export interface Task {
  id: string;
  home_id: string;
  blueprint_id: string | null;
  title: string;
  description: string | null;
  status: "Pending" | "Completed" | "Skipped";
  due_date: string;
  type: string;
  location_id?: string;
  area_id?: string;
  plan_id?: string;
  inventory_item_ids?: string[];
  isGhost?: boolean;
}

const TASK_TYPE_DOT: Record<string, string> = {
  Watering:    "bg-blue-400",
  Planting:    "bg-emerald-400",
  Harvesting:  "bg-amber-400",
  Maintenance: "bg-purple-400",
  Pruning:     "bg-lime-400",
};

function taskDotColor(type: string, isSelected: boolean): string {
  if (isSelected) return "bg-white";
  return TASK_TYPE_DOT[type] ?? "bg-rhozly-primary";
}

export default function TaskCalendar({ homeId }: { homeId: string }) {
  const { setPageContext, preferences } = usePlantDoctor();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());

  // 🚀 Tasks array now holds the fully calculated physical AND ghost tasks for the entire month!
  const [tasks, setTasks] = useState<Task[]>([]);

  const [locations, setLocations] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);

  const [refreshKey, setRefreshKey] = useState(0);
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState(false);

  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedLoc, setSelectedLoc] = useState<string>("all");
  const [selectedArea, setSelectedArea] = useState<string>("all");
  const [selectedPlan, setSelectedPlan] = useState<string>("all");

  const getTasksForDate = useCallback(
    (date: Date) => {
      const dateStr = getLocalDateString(date);

      // 🚀 The Engine already did the hard work. Just filter the array for this date.
      const dayTasks = tasks.filter((t) => t.due_date === dateStr);

      return dayTasks.filter((task) => {
        if (selectedTypes.length > 0 && !selectedTypes.includes(task.type))
          return false;
        if (selectedLoc !== "all" && task.location_id !== selectedLoc)
          return false;
        if (selectedArea !== "all" && task.area_id !== selectedArea)
          return false;
        if (selectedPlan !== "all" && task.plan_id !== selectedPlan)
          return false;
        return true;
      });
    },
    [tasks, selectedTypes, selectedLoc, selectedArea, selectedPlan],
  );

  useEffect(() => {
    const activeTasksOnSelectedDate = getTasksForDate(selectedDate);
    const locName =
      selectedLoc === "all"
        ? "All Locations"
        : locations.find((l) => l.id === selectedLoc)?.name ||
          "Selected Location";

    setPageContext({
      action: "Viewing Plant Care Schedule",
      calendarContext: {
        viewingMonth: currentDate.toLocaleString("default", {
          month: "long",
          year: "numeric",
        }),
        selectedDate: selectedDate.toDateString(),
        tasksOnSelectedDate: activeTasksOnSelectedDate.map((t) => ({
          title: t.title,
          type: t.type,
          status: t.status,
          isGhost: !!t.isGhost,
        })),
        filters: {
          taskTypes: selectedTypes.length > 0 ? selectedTypes : "All",
          location: locName,
          area: selectedArea,
          plan: selectedPlan,
        },
      },
    });
    return () => setPageContext(null);
  }, [
    currentDate,
    selectedDate,
    getTasksForDate,
    locations,
    selectedLoc,
    selectedArea,
    selectedPlan,
    selectedTypes,
    setPageContext,
  ]);

  useEffect(() => {
    const fetchFilters = async () => {
      const { data: locData } = await supabase
        .from("locations")
        .select("id, name, areas(id, name)")
        .eq("home_id", homeId);
      if (locData) setLocations(locData);

      const { data: planData } = await supabase
        .from("plans")
        .select("id, ai_blueprint")
        .eq("home_id", homeId);
      if (planData) {
        setPlans(
          planData.map((p) => ({
            id: p.id,
            title: p.ai_blueprint?.project_overview?.title || "Untitled Plan",
          })),
        );
      }
    };
    fetchFilters();
  }, [homeId]);

  const fetchTasksAndBlueprints = async () => {
    setIsLoading(true);
    setFetchError(false);
    try {
      const startOfMonth = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth() - 1,
        1,
      );
      const endOfMonth = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth() + 2,
        0,
      );

      const todayStr = getLocalDateString(new Date());

      const result = await TaskEngine.fetchTasksWithGhosts({
        homeId,
        startDateStr: getLocalDateString(startOfMonth),
        endDateStr: getLocalDateString(endOfMonth),
        includeOverdue: false,
        todayStr,
      });

      setTasks(result.tasks);
    } catch (err: any) {
      Logger.error("Failed to load calendar tasks", err);
      setFetchError(true);
      toast.error("Could not load your schedule. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTasksAndBlueprints();
  }, [currentDate, homeId]);

  const generateCalendarDays = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const days = [];
    for (let i = firstDayIndex - 1; i >= 0; i--)
      days.push({
        date: new Date(year, month - 1, daysInPrevMonth - i),
        isCurrentMonth: false,
      });
    for (let i = 1; i <= daysInMonth; i++)
      days.push({ date: new Date(year, month, i), isCurrentMonth: true });
    const remainingDays = 42 - days.length;
    for (let i = 1; i <= remainingDays; i++)
      days.push({ date: new Date(year, month + 1, i), isCurrentMonth: false });
    return days;
  };

  const isSameDay = (d1: Date, d2: Date) =>
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();

  const days = generateCalendarDays();
  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const availableAreas =
    selectedLoc === "all"
      ? []
      : locations.find((l) => l.id === selectedLoc)?.areas || [];

  const hasActiveFilters =
    selectedTypes.length > 0 ||
    selectedLoc !== "all" ||
    selectedPlan !== "all" ||
    selectedArea !== "all";

  return (
    <div className="w-full h-full flex flex-col p-4 md:p-8 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
        <div>
          <h2 className="text-4xl font-black font-display text-rhozly-on-surface">
            Schedule
          </h2>
          <p className="text-sm font-bold text-rhozly-on-surface/40 uppercase tracking-widest mt-1">
            Operational Hub
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            className={`px-4 py-3 rounded-2xl font-black transition-all shadow-sm flex items-center gap-2 ${isFilterOpen || hasActiveFilters ? "bg-rhozly-primary text-white" : "bg-rhozly-surface-low text-rhozly-on-surface hover:bg-rhozly-surface-mid"}`}
          >
            <Filter size={18} /> Filters
            {hasActiveFilters && (
              <span className="bg-white text-rhozly-primary rounded-full w-5 h-5 flex items-center justify-center text-[10px]">
                !
              </span>
            )}
          </button>
          <button
            onClick={() => {
              const today = new Date();
              setCurrentDate(today);
              setSelectedDate(today);
            }}
            className="px-6 py-3 bg-rhozly-surface-low text-rhozly-on-surface rounded-2xl font-black hover:bg-rhozly-surface-mid transition-all shadow-sm flex items-center gap-2"
          >
            <CalendarIcon size={18} /> Today
          </button>
        </div>
      </div>

      {isFilterOpen && (
        <div className="mb-8 p-6 bg-rhozly-surface-low/50 rounded-3xl border border-rhozly-outline/10 animate-in slide-in-from-top-4 fade-in duration-300">
          <div className="flex flex-wrap gap-6 items-start">
            <div className="flex-1 min-w-[250px]">
              <div className="flex justify-between items-center mb-3">
                <label className="text-[10px] font-black uppercase text-rhozly-on-surface/40 ml-1">
                  Task Types
                </label>
                {hasActiveFilters && (
                  <button
                    onClick={() => {
                      setSelectedTypes([]);
                      setSelectedLoc("all");
                      setSelectedArea("all");
                      setSelectedPlan("all");
                    }}
                    className="text-[10px] font-black uppercase tracking-widest text-rhozly-primary hover:text-rhozly-primary/70 transition-colors"
                  >
                    Clear All
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {TASK_CATEGORIES.map((type) => (
                  <button
                    key={type}
                    onClick={() =>
                      setSelectedTypes((prev) =>
                        prev.includes(type)
                          ? prev.filter((t) => t !== type)
                          : [...prev, type],
                      )
                    }
                    className={`px-4 py-2 rounded-xl text-xs font-black transition-all border-2 ${selectedTypes.includes(type) ? "border-rhozly-primary bg-rhozly-primary/10 text-rhozly-primary" : "border-transparent bg-white text-rhozly-on-surface/60 hover:bg-white/50"}`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap sm:flex-nowrap gap-4 w-full xl:w-auto mt-2 sm:mt-0">
              <div className="flex-1 sm:w-40">
                <label className="text-[10px] font-black uppercase text-rhozly-on-surface/40 block mb-3 ml-1">
                  Location
                </label>
                <select
                  value={selectedLoc}
                  onChange={(e) => {
                    setSelectedLoc(e.target.value);
                    setSelectedArea("all");
                  }}
                  className="w-full p-3 bg-white rounded-xl font-bold border border-transparent focus:border-rhozly-primary outline-none text-sm"
                >
                  <option value="all">All Locations</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1 sm:w-40">
                <label className="text-[10px] font-black uppercase text-rhozly-on-surface/40 block mb-3 ml-1">
                  Area
                </label>
                <select
                  value={selectedArea}
                  onChange={(e) => setSelectedArea(e.target.value)}
                  disabled={selectedLoc === "all"}
                  className="w-full p-3 bg-white rounded-xl font-bold border border-transparent focus:border-rhozly-primary outline-none text-sm disabled:opacity-50"
                >
                  <option value="all">All Areas</option>
                  {availableAreas.map((area: any) => (
                    <option key={area.id} value={area.id}>
                      {area.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1 sm:w-48">
                <label className="text-[10px] font-black uppercase text-rhozly-on-surface/40 block mb-3 ml-1">
                  Garden Plan
                </label>
                <select
                  value={selectedPlan}
                  onChange={(e) => setSelectedPlan(e.target.value)}
                  className="w-full p-3 bg-white rounded-xl font-bold border border-transparent focus:border-rhozly-primary outline-none text-sm"
                >
                  <option value="all">All Garden Plans</option>
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-8 pb-20">
        <div className="flex-[2] bg-rhozly-surface-lowest rounded-[3rem] p-6 shadow-2xl border border-rhozly-outline/10">
          <div className="flex items-center justify-between mb-8 px-4">
            <h3 className="text-2xl font-black">
              {currentDate.toLocaleString("default", {
                month: "long",
                year: "numeric",
              })}
            </h3>
            <div className="flex gap-2">
              <button
                onClick={() =>
                  setCurrentDate(
                    new Date(
                      currentDate.getFullYear(),
                      currentDate.getMonth() - 1,
                      1,
                    ),
                  )
                }
                className="p-3 bg-rhozly-surface-low rounded-2xl hover:bg-rhozly-primary hover:text-white transition-all"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                onClick={() =>
                  setCurrentDate(
                    new Date(
                      currentDate.getFullYear(),
                      currentDate.getMonth() + 1,
                      1,
                    ),
                  )
                }
                className="p-3 bg-rhozly-surface-low rounded-2xl hover:bg-rhozly-primary hover:text-white transition-all"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 mb-4">
            {weekDays.map((day) => (
              <div
                key={day}
                className="text-center text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 pb-2"
              >
                {day}
              </div>
            ))}
          </div>

          {fetchError && (
            <div className="mb-4 flex items-center justify-between gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-2xl text-sm font-bold text-red-600">
              <span>Failed to load schedule.</span>
              <button
                onClick={fetchTasksAndBlueprints}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-100 hover:bg-red-200 rounded-xl transition-colors text-xs font-black"
              >
                <RefreshCw size={13} /> Retry
              </button>
            </div>
          )}

          <div className="relative">
            {isLoading && (
              <div className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-white/60 backdrop-blur-sm">
                <Loader2 size={32} className="animate-spin text-rhozly-primary" />
              </div>
            )}
          <div className="grid grid-cols-7 gap-2 sm:gap-3">
            {days.map((dayObj, index) => {
              const isSelected = isSameDay(dayObj.date, selectedDate);
              const isToday = isSameDay(dayObj.date, new Date());
              const dayTasks = getTasksForDate(dayObj.date);
              const pendingTasks = dayTasks.filter(
                (t) => t.status === "Pending",
              );

              const hasPreferredTasks =
                preferences.length > 0 &&
                pendingTasks.some(
                  (t) => scorePlantByPreferences(t.title, "", preferences) > 0,
                );

              return (
                <button
                  key={index}
                  onClick={() => setSelectedDate(dayObj.date)}
                  className={`relative flex flex-col items-center justify-center aspect-square rounded-2xl sm:rounded-3xl transition-all border-2
                    ${dayObj.isCurrentMonth ? "text-rhozly-on-surface hover:border-rhozly-primary/30" : "text-rhozly-on-surface/20 hover:border-rhozly-outline/10"}
                    ${isSelected ? "bg-rhozly-primary text-white border-rhozly-primary shadow-lg scale-105 z-10" : "bg-transparent border-transparent"}
                    ${isToday && !isSelected ? "bg-rhozly-primary/5 border-rhozly-primary/20 text-rhozly-primary" : ""}
                  `}
                >
                  {hasPreferredTasks && !isSelected && dayObj.isCurrentMonth && (
                    <span className="absolute top-1.5 right-1.5">
                      <Sparkles size={7} className="text-amber-400" />
                    </span>
                  )}
                  <span
                    className={`text-sm sm:text-lg font-black ${isSelected ? "text-white" : ""}`}
                  >
                    {dayObj.date.getDate()}
                  </span>
                  {pendingTasks.length > 0 && (
                    <div className="absolute bottom-2 sm:bottom-3 flex items-center justify-center gap-0.5 sm:gap-1">
                      {pendingTasks.slice(0, 3).map((t, i) => (
                        <span
                          key={i}
                          className={`w-1.5 h-1.5 rounded-full ${taskDotColor(t.type, isSelected)} ${!isSelected && t.isGhost ? "opacity-50" : ""}`}
                        />
                      ))}
                      {pendingTasks.length > 3 && (
                        <span
                          className={`text-[8px] font-black leading-none ml-0.5 ${isSelected ? "text-white" : "text-rhozly-primary"}`}
                        >
                          +{pendingTasks.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Dot colour legend */}
          <div className="flex items-center justify-center flex-wrap gap-x-5 gap-y-1 pt-3 pb-1">
            {Object.entries(TASK_TYPE_DOT).map(([type, color]) => (
              <span key={type} className="flex items-center gap-1.5 text-[10px] font-bold text-rhozly-on-surface/40">
                <span className={`w-2 h-2 rounded-full ${color}`} />
                {type}
              </span>
            ))}
            {preferences.length > 0 && (
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-amber-500/80">
                <Sparkles size={9} className="text-amber-400" />
                Preferred plant
              </span>
            )}
          </div>
          </div>
        </div>

        <div className="flex-1 bg-rhozly-surface-lowest rounded-[3rem] p-8 shadow-2xl border border-rhozly-outline/10 flex flex-col min-h-[500px]">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h3 className="text-2xl font-black">Agenda</h3>
              <p className="text-sm font-bold text-rhozly-primary mt-1">
                {selectedDate.toLocaleDateString("default", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>
            <button
              onClick={() => setIsAddingTask(true)}
              className="flex items-center gap-1 text-xs font-black bg-rhozly-primary text-white px-4 py-3 rounded-xl shadow-md hover:scale-105 transition-transform active:scale-95"
            >
              <Plus size={16} strokeWidth={3} /> Add Task
            </button>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 relative">
            <TaskList
              key={`agenda-${selectedDate.toISOString()}-${refreshKey}`}
              homeId={homeId}
              targetDate={selectedDate}
              showOverdue={isSameDay(selectedDate, new Date())}
              onTaskUpdated={fetchTasksAndBlueprints}
              locationId={selectedLoc}
              areaId={selectedArea === "all" ? undefined : selectedArea}
              planId={selectedPlan === "all" ? undefined : selectedPlan}
              selectedTypes={selectedTypes}
            />
          </div>
        </div>
      </div>

      {isAddingTask && (
        <AddTaskModal
          homeId={homeId}
          selectedDate={selectedDate}
          onClose={() => setIsAddingTask(false)}
          onSuccess={() => {
            setIsAddingTask(false);
            toast.success("Task added to your schedule.");
            fetchTasksAndBlueprints();
            setRefreshKey((prev) => prev + 1);
          }}
        />
      )}
    </div>
  );
}
