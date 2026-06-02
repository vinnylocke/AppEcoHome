import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Filter,
  Plus,
  Sparkles,
  Loader2,
  RefreshCw,
  CalendarDays,
  Download,
  ListChecks,
  Sprout,
} from "lucide-react";
import { buildTasksIcs, downloadIcs } from "../lib/icsExport";
import { scorePlantByPreferences } from "../hooks/useUserPreferences";
import { supabase } from "../lib/supabase";
import { Logger } from "../lib/errorHandler";
import toast from "react-hot-toast";
import AddTaskModal from "./AddTaskModal";
import AddToDoListModal from "./todo/AddToDoListModal";
import ToDoListsModal from "./todo/ToDoListsModal";
import { TASK_CATEGORIES } from "../constants/taskCategories";
import TaskList from "./TaskList";
import { usePlantDoctor } from "../context/PlantDoctorContext";
import { TaskEngine, collectHarvestWindowDates } from "../lib/taskEngine";
import { getLocalDateString } from "../lib/dateUtils";

export interface Task {
  id: string;
  home_id: string;
  blueprint_id: string | null;
  title: string;
  description: string | null;
  status: "Pending" | "Completed" | "Skipped";
  due_date: string;
  completed_at?: string | null;
  type: string;
  location_id?: string;
  area_id?: string;
  plan_id?: string;
  inventory_item_ids?: string[];
  isGhost?: boolean;
  overdueCarryoverSince?: string;
  lateCompletionFrom?: string;
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

export default function TaskCalendar({
  homeId,
  preloadedLocations,
  aiEnabled = false,
}: {
  homeId: string;
  preloadedLocations?: any[];
  aiEnabled?: boolean;
}) {
  const { setPageContext, preferences } = usePlantDoctor();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [calendarView, setCalendarView] = useState<"month" | "week">(() => {
    if (typeof window === "undefined") return "month";
    const saved = window.localStorage.getItem("rhozly_calendar_view");
    return saved === "week" ? "week" : "month";
  });
  useEffect(() => {
    try { window.localStorage.setItem("rhozly_calendar_view", calendarView); } catch { /* noop */ }
  }, [calendarView]);
  // Wave-20.2 — harvest-window highlight. When ON, every day inside an
  // active harvest window gets a subtle green tint so the user can see
  // "this whole stretch is ripening". Persists per browser via local
  // storage so the preference sticks across visits.
  const [showHarvestWindows, setShowHarvestWindows] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const saved = window.localStorage.getItem("rhozly_calendar_harvest_windows");
    return saved === null ? true : saved === "1";
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(
        "rhozly_calendar_harvest_windows",
        showHarvestWindows ? "1" : "0",
      );
    } catch { /* noop */ }
  }, [showHarvestWindows]);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const [rescheduling, setRescheduling] = useState(false);

  // 🚀 Tasks array now holds the fully calculated physical AND ghost tasks for the entire month!
  const [tasks, setTasks] = useState<Task[]>([]);
  const [overdueTasks, setOverdueTasks] = useState<Task[]>([]);

  const [locations, setLocations] = useState<any[]>(preloadedLocations ?? []);
  const [plans, setPlans] = useState<any[]>([]);

  const [refreshKey, setRefreshKey] = useState(0);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [inventoryDict, setInventoryDict] = useState<Record<string, any>>({});
  const [blockedTaskIds, setBlockedTaskIds] = useState<Set<string>>(new Set());
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [isAddingToDo, setIsAddingToDo] = useState(false);
  const [todoListsOpenId, setTodoListsOpenId] = useState<string | null | "auto">(null);

  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const open = searchParams.get("open");
    if (open === "add-task") setIsAddingTask(true);
    else if (open === "add-todo-list") setIsAddingToDo(true);
    else if (open === "todo-lists") setTodoListsOpenId("auto");
    if (open) setSearchParams((prev) => { prev.delete("open"); return prev; }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState(false);

  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedLoc, setSelectedLoc] = useState<string>("all");
  const [selectedArea, setSelectedArea] = useState<string>("all");
  const [selectedPlan, setSelectedPlan] = useState<string>("all");

  const todayStr = getLocalDateString(new Date());

  // Wave-20.2 — pre-compute every date string inside an active harvest
  // window from the loaded tasks. The calendar cell renderer checks
  // membership in this set to apply the green tint. Empty when the user
  // has toggled the highlight off, so the cell renderer can skip the
  // lookup entirely on the "off" path.
  const harvestWindowDates = useMemo(() => {
    if (!showHarvestWindows) return new Set<string>();
    return collectHarvestWindowDates([...tasks, ...overdueTasks]);
  }, [tasks, overdueTasks, showHarvestWindows]);

  const getTasksForDate = useCallback(
    (date: Date) => {
      const dateStr = getLocalDateString(date);

      // 🚀 The Engine already did the hard work. Just filter the array for this date.
      //
      // Window tasks (Harvesting with `window_end_date`) are "active"
      // throughout their window — tapping ANY day from due_date through
      // window_end_date should reveal the harvest task in the panel.
      // Without this branch the task would only appear on its due_date,
      // which for a backfilled window task is the window start (often in
      // the past) — so the user sees a green tint with nothing under it.
      const dayTasks = tasks.filter((t) => {
        if (t.window_end_date && t.due_date) {
          return t.due_date <= dateStr && dateStr <= t.window_end_date;
        }
        return t.due_date === dateStr;
      });

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

  const getCellIndicators = useCallback(
    (dateStr: string) => {
      const applyFilters = (t: Task) => {
        if (selectedTypes.length > 0 && !selectedTypes.includes(t.type)) return false;
        if (selectedLoc !== "all" && t.location_id !== selectedLoc) return false;
        if (selectedArea !== "all" && t.area_id !== selectedArea) return false;
        if (selectedPlan !== "all" && t.plan_id !== selectedPlan) return false;
        return true;
      };
      const ft = tasks.filter(applyFilters);
      const fo = overdueTasks.filter(applyFilters);

      const greenCount = ft.filter(
        (t) =>
          t.status === "Completed" &&
          t.completed_at &&
          t.completed_at.slice(0, 10) === dateStr &&
          t.due_date.slice(0, 10) === dateStr,
      ).length;

      const redCheckCount = ft.filter(
        (t) =>
          t.status === "Completed" &&
          t.completed_at &&
          t.completed_at.slice(0, 10) === dateStr &&
          t.due_date.slice(0, 10) < dateStr,
      ).length;

      const redXCount = fo.filter((t) => t.due_date.slice(0, 10) === dateStr).length;
      const faintCount = fo.filter((t) => t.due_date.slice(0, 10) < dateStr).length;

      return { greenCount, redCheckCount, redXCount, faintCount };
    },
    [tasks, overdueTasks, selectedTypes, selectedLoc, selectedArea, selectedPlan],
  );

  const agendaTasks = useMemo(() => {
    const dateStr = getLocalDateString(selectedDate);
    const baseTasks = getTasksForDate(selectedDate);

    if (dateStr > todayStr) return baseTasks;

    const applyFilters = (t: Task) => {
      if (selectedTypes.length > 0 && !selectedTypes.includes(t.type)) return false;
      if (selectedLoc !== "all" && t.location_id !== selectedLoc) return false;
      if (selectedArea !== "all" && t.area_id !== selectedArea) return false;
      if (selectedPlan !== "all" && t.plan_id !== selectedPlan) return false;
      return true;
    };

    const carryoverTasks = overdueTasks
      .filter((t) => t.due_date.slice(0, 10) < dateStr && applyFilters(t))
      .map((t) => ({ ...t, overdueCarryoverSince: t.due_date }));

    const lateCompletions =
      dateStr < todayStr
        ? tasks
            .filter(
              (t) =>
                t.status === "Completed" &&
                t.completed_at &&
                t.completed_at.slice(0, 10) === dateStr &&
                t.due_date.slice(0, 10) < dateStr &&
                applyFilters(t),
            )
            .map((t) => ({ ...t, lateCompletionFrom: t.due_date }))
        : [];

    return [...baseTasks, ...carryoverTasks, ...lateCompletions];
  }, [getTasksForDate, selectedDate, overdueTasks, tasks, todayStr, selectedTypes, selectedLoc, selectedArea, selectedPlan]);

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
      if (!preloadedLocations) {
        const { data: locData } = await supabase
          .from("locations")
          .select("id, name, areas(id, name)")
          .eq("home_id", homeId);
        if (locData) setLocations(locData);
      }

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

      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      const [result, overdueResult] = await Promise.all([
        TaskEngine.fetchTasksWithGhosts({
          homeId,
          startDateStr: getLocalDateString(startOfMonth),
          endDateStr: getLocalDateString(endOfMonth),
          includeOverdue: false,
          todayStr,
        }),
        supabase
          .from("tasks")
          .select(
            "id, home_id, blueprint_id, title, description, status, due_date, type, location_id, area_id, plan_id, inventory_item_ids, completed_at",
          )
          .eq("home_id", homeId)
          .eq("status", "Pending")
          .lt("due_date", todayStr)
          .gte("due_date", getLocalDateString(ninetyDaysAgo)),
      ]);

      setTasks(result.tasks);
      setInventoryDict(result.inventoryDict);
      setBlockedTaskIds(result.blockedTaskIds);
      setOverdueTasks((overdueResult.data as Task[]) || []);
      setHasLoadedOnce(true);
      setRefreshKey((k) => k + 1);
    } catch (err: any) {
      if (err?.name === "AbortError") return;
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

  const generateWeekDays = () => {
    // Build a 7-day window starting on the Sunday on/before currentDate.
    const start = new Date(currentDate);
    start.setDate(start.getDate() - start.getDay());
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  };

  const shiftWeek = (direction: 1 | -1) => {
    const next = new Date(currentDate);
    next.setDate(next.getDate() + direction * 7);
    setCurrentDate(next);
  };

  const handleExportIcs = () => {
    // Export every pending task whose due_date falls within the next 90 days,
    // newest-first. Reuses the in-memory `tasks` array (already includes ghosts).
    const today = getLocalDateString(new Date());
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + 90);
    const horizonStr = getLocalDateString(horizon);
    const exportable = tasks.filter((t) =>
      t.status !== "Completed" &&
      t.due_date >= today &&
      t.due_date <= horizonStr,
    );
    if (exportable.length === 0) {
      toast.error("No upcoming tasks to export — try adding a few first.");
      return;
    }
    const ics = buildTasksIcs(
      exportable.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        due_date: t.due_date,
        type: t.type,
      })),
    );
    downloadIcs(ics, `rhozly-tasks-${today}.ics`);
    toast.success(`Exported ${exportable.length} task${exportable.length === 1 ? "" : "s"} to your calendar.`);
  };

  const handleDropOnDate = async (targetDate: Date) => {
    if (!draggingTaskId) return;
    const task = tasks.find((t) => t.id === draggingTaskId);
    if (!task) {
      setDraggingTaskId(null);
      setDragOverDate(null);
      return;
    }
    const newDateStr = getLocalDateString(targetDate);
    if (task.due_date === newDateStr) {
      setDraggingTaskId(null);
      setDragOverDate(null);
      return;
    }
    setRescheduling(true);
    try {
      // Ghost tasks must be materialized before we can reschedule them.
      if (task.isGhost) {
        const { error } = await supabase
          .from("tasks")
          .insert({
            home_id: task.home_id,
            blueprint_id: task.blueprint_id,
            title: task.title,
            description: task.description,
            type: task.type,
            due_date: newDateStr,
            status: "Pending",
            location_id: task.location_id,
            area_id: task.area_id,
            plan_id: task.plan_id,
            inventory_item_ids: task.inventory_item_ids,
            window_end_date: task.window_end_date ?? null,
          });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("tasks")
          .update({ due_date: newDateStr })
          .eq("id", task.id);
        if (error) throw error;
      }
      toast.success(`Moved to ${targetDate.toLocaleDateString("default", { weekday: "short", day: "numeric", month: "short" })}.`);
      await fetchTasksAndBlueprints();
    } catch (err: any) {
      Logger.error("Failed to reschedule task by drag", err, { taskId: task.id }, "Could not reschedule task.");
    } finally {
      setDraggingTaskId(null);
      setDragOverDate(null);
      setRescheduling(false);
    }
  };

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
        <div className="flex gap-2 flex-wrap">
          {/* View toggle */}
          <div className="flex bg-rhozly-surface-low rounded-2xl p-1 shadow-sm" data-testid="calendar-view-toggle">
            <button
              onClick={() => setCalendarView("month")}
              aria-pressed={calendarView === "month"}
              className={`px-3 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-colors flex items-center gap-1.5 min-h-[36px] ${calendarView === "month" ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-on-surface/50 hover:text-rhozly-on-surface"}`}
              data-testid="calendar-view-month"
            >
              <CalendarIcon size={13} /> Month
            </button>
            <button
              onClick={() => setCalendarView("week")}
              aria-pressed={calendarView === "week"}
              className={`px-3 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-colors flex items-center gap-1.5 min-h-[36px] ${calendarView === "week" ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-on-surface/50 hover:text-rhozly-on-surface"}`}
              data-testid="calendar-view-week"
            >
              <CalendarDays size={13} /> Week
            </button>
          </div>
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
            onClick={handleExportIcs}
            data-testid="calendar-export-ics"
            className="px-4 py-3 bg-rhozly-surface-low text-rhozly-on-surface rounded-2xl font-black hover:bg-rhozly-surface-mid transition-all shadow-sm flex items-center gap-2"
            title="Export upcoming tasks as iCalendar (.ics)"
          >
            <Download size={16} /> Export
          </button>
          <button
            data-testid="calendar-harvest-windows-toggle"
            onClick={() => setShowHarvestWindows((v) => !v)}
            aria-pressed={showHarvestWindows}
            title={
              showHarvestWindows
                ? "Harvest windows are highlighted on the calendar. Tap to hide."
                : "Harvest windows are hidden. Tap to highlight them."
            }
            className={`px-3 sm:px-4 py-3 rounded-2xl font-black flex items-center gap-1.5 transition-all shadow-sm border-2 ${
              showHarvestWindows
                ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                : "bg-rhozly-surface-low text-rhozly-on-surface/55 border-transparent hover:bg-rhozly-surface-mid"
            }`}
          >
            <Sprout size={16} />
            <span className="hidden sm:inline text-sm">
              {showHarvestWindows ? "Harvest windows" : "Harvest windows off"}
            </span>
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
            <div className="flex flex-col sm:flex-row gap-4 w-full xl:w-auto mt-2 sm:mt-0">
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
              {calendarView === "week"
                ? (() => {
                    const wk = generateWeekDays();
                    const first = wk[0];
                    const last = wk[6];
                    const sameMonth = first.getMonth() === last.getMonth();
                    return sameMonth
                      ? `${first.toLocaleString("default", { month: "long", year: "numeric" })}`
                      : `${first.toLocaleString("default", { month: "short" })} – ${last.toLocaleString("default", { month: "short", year: "numeric" })}`;
                  })()
                : currentDate.toLocaleString("default", {
                    month: "long",
                    year: "numeric",
                  })}
            </h3>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (calendarView === "week") {
                    shiftWeek(-1);
                  } else {
                    setCurrentDate(
                      new Date(
                        currentDate.getFullYear(),
                        currentDate.getMonth() - 1,
                        1,
                      ),
                    );
                  }
                }}
                aria-label={calendarView === "week" ? "Previous week" : "Previous month"}
                className="p-3 bg-rhozly-surface-low rounded-2xl hover:bg-rhozly-primary hover:text-white transition-all"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                onClick={() => {
                  if (calendarView === "week") {
                    shiftWeek(1);
                  } else {
                    setCurrentDate(
                      new Date(
                        currentDate.getFullYear(),
                        currentDate.getMonth() + 1,
                        1,
                      ),
                    );
                  }
                }}
                aria-label={calendarView === "week" ? "Next week" : "Next month"}
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
            {(isLoading || rescheduling) && (
              <div className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-white/60 backdrop-blur-sm">
                <Loader2 size={32} className="animate-spin text-rhozly-primary" />
              </div>
            )}
          {calendarView === "week" ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 sm:gap-3" data-testid="calendar-week-grid">
              {generateWeekDays().map((dayDate, index) => {
                const dayDateStr = getLocalDateString(dayDate);
                const isSelected = isSameDay(dayDate, selectedDate);
                const isToday = isSameDay(dayDate, new Date());
                const isPastDay = dayDateStr < todayStr;
                const dayTasks = getTasksForDate(dayDate).filter((t) => t.status !== "Skipped");
                const isDragTarget = dragOverDate === dayDateStr;
                const isHarvestWindow = harvestWindowDates.has(dayDateStr) && !isSelected;
                return (
                  <div
                    key={index}
                    onClick={() => setSelectedDate(dayDate)}
                    data-harvest-window={isHarvestWindow ? "true" : undefined}
                    onDragOver={(e) => {
                      if (draggingTaskId) {
                        e.preventDefault();
                        setDragOverDate(dayDateStr);
                      }
                    }}
                    onDragLeave={() => setDragOverDate((d) => (d === dayDateStr ? null : d))}
                    onDrop={(e) => { e.preventDefault(); handleDropOnDate(dayDate); }}
                    className={`relative flex flex-col rounded-3xl p-3 min-h-[200px] border-2 transition-all cursor-pointer
                      ${isSelected ? "border-rhozly-primary bg-rhozly-primary/5" : isHarvestWindow ? "border-emerald-200/60 bg-emerald-50" : "border-rhozly-outline/10 bg-white"}
                      ${isToday && !isSelected ? "border-rhozly-primary/30" : ""}
                      ${isPastDay && !isSelected ? "opacity-80" : ""}
                      ${isDragTarget ? "ring-2 ring-rhozly-primary scale-[1.02] bg-rhozly-primary/10" : ""}
                    `}
                    data-testid={`calendar-week-day-${dayDateStr}`}
                  >
                    <div className="flex items-baseline justify-between mb-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40">
                        {dayDate.toLocaleDateString("default", { weekday: "short" })}
                      </span>
                      <span className={`text-2xl font-black ${isToday ? "text-rhozly-primary" : "text-rhozly-on-surface"}`}>
                        {dayDate.getDate()}
                      </span>
                    </div>
                    <div className="flex-1 flex flex-col gap-1 overflow-hidden">
                      {dayTasks.length === 0 && (
                        <p className="text-[10px] font-bold text-rhozly-on-surface/30 italic">
                          {isPastDay ? "—" : "Free"}
                        </p>
                      )}
                      {dayTasks.slice(0, 6).map((t) => {
                        const dotCls = TASK_TYPE_DOT[t.type] ?? "bg-rhozly-primary";
                        const completed = t.status === "Completed";
                        return (
                          <div
                            key={t.id}
                            draggable={!completed}
                            onDragStart={(e) => {
                              if (completed) return;
                              setDraggingTaskId(t.id);
                              e.dataTransfer.effectAllowed = "move";
                              e.dataTransfer.setData("text/plain", t.id);
                            }}
                            onDragEnd={() => { setDraggingTaskId(null); setDragOverDate(null); }}
                            onClick={(e) => { e.stopPropagation(); setSelectedDate(dayDate); }}
                            title={t.title}
                            data-testid={`calendar-week-task-${t.id}`}
                            className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-bold leading-tight truncate transition-opacity
                              ${completed ? "bg-rhozly-surface-low text-rhozly-on-surface/40 line-through" : "bg-rhozly-surface-low text-rhozly-on-surface hover:bg-rhozly-primary/10 cursor-grab active:cursor-grabbing"}
                              ${draggingTaskId === t.id ? "opacity-40" : ""}
                              ${t.isGhost ? "italic" : ""}
                            `}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${dotCls} shrink-0`} />
                            <span className="truncate">{t.title}</span>
                          </div>
                        );
                      })}
                      {dayTasks.length > 6 && (
                        <p className="text-[10px] font-black text-rhozly-on-surface/40 mt-1">
                          +{dayTasks.length - 6} more — open day to view
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
          <div className="grid grid-cols-7 gap-2 sm:gap-3">
            {days.map((dayObj, index) => {
              const isSelected = isSameDay(dayObj.date, selectedDate);
              const isToday = isSameDay(dayObj.date, new Date());
              const dayTasks = getTasksForDate(dayObj.date);
              // Wave-20.4 — dots on the calendar grid only ever indicate
              // tasks whose due_date matches this cell. Window tasks
              // intentionally don't paint a dot on every day inside the
              // window; the green tint handles that. The full task panel
              // (after the user taps the day) still includes window
              // tasks via getTasksForDate's expanded match.
              const dayDateStrForDots = getLocalDateString(dayObj.date);
              const pendingTasks = dayTasks.filter(
                (t) =>
                  t.status === "Pending"
                  && (t.window_end_date
                    ? t.due_date === dayDateStrForDots
                    : true),
              );

              const hasPreferredTasks =
                preferences.length > 0 &&
                pendingTasks.some(
                  (t) => scorePlantByPreferences(t.title, "", preferences) > 0,
                );

              const dayDateStr = getLocalDateString(dayObj.date);
              const isPastDay = dayDateStr < todayStr;
              const cellInd = isPastDay ? getCellIndicators(dayDateStr) : null;
              const hasAnyIndicator = cellInd
                ? cellInd.greenCount > 0 || cellInd.redCheckCount > 0 || cellInd.redXCount > 0 || cellInd.faintCount > 0
                : false;
              // Tint the cell green when this date is inside an active
              // harvest window AND the user hasn't toggled the highlight
              // off. Selected / Today states take precedence visually so
              // we skip the tint for those.
              const isHarvestWindow = harvestWindowDates.has(dayDateStr) && !isSelected && !isToday;

              return (
                <button
                  key={index}
                  onClick={() => setSelectedDate(dayObj.date)}
                  data-harvest-window={isHarvestWindow ? "true" : undefined}
                  className={`relative flex flex-col items-center justify-center aspect-square rounded-2xl sm:rounded-3xl transition-all border-2
                    ${dayObj.isCurrentMonth ? "text-rhozly-on-surface hover:border-rhozly-primary/30" : "text-rhozly-on-surface/20 hover:border-rhozly-outline/10"}
                    ${isSelected ? "bg-rhozly-primary text-white border-rhozly-primary shadow-lg scale-105 z-10" : isHarvestWindow ? "bg-emerald-50 border-emerald-200/60" : "bg-transparent border-transparent"}
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

                  {/* Past: overdue / completion indicators replace the dots */}
                  {isPastDay && hasAnyIndicator && (
                    <div className="absolute bottom-1.5 sm:bottom-2 flex items-center gap-0.5 justify-center">
                      {cellInd!.greenCount > 0 && (
                        <span className={`text-[9px] font-black leading-none ${isSelected ? "text-white/90" : "text-green-500"}`}>
                          ✓{cellInd!.greenCount > 1 ? cellInd!.greenCount : ""}
                        </span>
                      )}
                      {cellInd!.redCheckCount > 0 && (
                        <span className={`text-[9px] font-black leading-none ${isSelected ? "text-white/80" : "text-amber-500"}`}>
                          ✓{cellInd!.redCheckCount > 1 ? cellInd!.redCheckCount : ""}
                        </span>
                      )}
                      {cellInd!.redXCount > 0 && (
                        <span className={`text-[9px] font-black leading-none ${isSelected ? "text-white/90" : "text-red-500"}`}>
                          ✗{cellInd!.redXCount > 1 ? cellInd!.redXCount : ""}
                        </span>
                      )}
                      {cellInd!.faintCount > 0 && (
                        <span className={`text-[9px] font-black leading-none ${isSelected ? "text-white/30" : "text-red-400/40"}`}>
                          ✕{cellInd!.faintCount > 1 ? cellInd!.faintCount : ""}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Today + future: pending task dots */}
                  {!isPastDay && pendingTasks.length > 0 && (
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
          )}

          {/* Drag hint — only relevant in week view */}
          {calendarView === "week" && (
            <p className="text-[10px] font-bold text-rhozly-on-surface/40 mt-3 px-1 text-center">
              Tip — drag a task to another day to reschedule.
            </p>
          )}

          {/* Legend */}
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
            <span className="flex items-center gap-1 text-[10px] font-bold text-rhozly-on-surface/40">
              <span className="text-green-500 font-black text-[11px] leading-none">✓</span> Done
            </span>
            <span className="flex items-center gap-1 text-[10px] font-bold text-rhozly-on-surface/40">
              <span className="text-amber-500 font-black text-[11px] leading-none">✓</span> Late
            </span>
            <span className="flex items-center gap-1 text-[10px] font-bold text-rhozly-on-surface/40">
              <span className="text-red-500 font-black text-[11px] leading-none">✗</span> Overdue
            </span>
            <span className="flex items-center gap-1 text-[10px] font-bold text-rhozly-on-surface/40">
              <span className="text-red-400/50 font-black text-[11px] leading-none">✕</span> Missed
            </span>
          </div>
          </div>
        </div>

        <div className="flex-1 bg-rhozly-surface-lowest rounded-[3rem] p-4 sm:p-8 shadow-2xl border border-rhozly-outline/10 flex flex-col lg:min-h-[500px]">
          <div className="flex justify-between items-center mb-4 sm:mb-8">
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
            <div className="flex items-center gap-1.5">
              <button
                data-testid="calendar-add-todo-list"
                onClick={() => setIsAddingToDo(true)}
                title="Group a batch of tasks under one date"
                className="flex items-center gap-1 text-xs font-black bg-rhozly-surface-low text-rhozly-on-surface px-4 py-3 rounded-xl shadow-sm hover:bg-rhozly-surface-mid transition-colors"
              >
                <ListChecks size={16} strokeWidth={2.5} /> To-Do List
              </button>
              <button
                onClick={() => setIsAddingTask(true)}
                className="flex items-center gap-1 text-xs font-black bg-rhozly-primary text-white px-4 py-3 rounded-xl shadow-md hover:scale-105 transition-transform active:scale-95"
              >
                <Plus size={16} strokeWidth={3} /> Add Task
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar pr-1 sm:pr-2 relative">
            {!hasLoadedOnce ? (
              <div className="flex justify-center pt-12">
                <Loader2 size={28} className="animate-spin text-rhozly-primary/40" />
              </div>
            ) : (
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
                preloadedTasks={agendaTasks}
                preloadedInventoryDict={inventoryDict}
                preloadedBlockedTaskIds={blockedTaskIds}
                onOpenToDoList={(listId) => setTodoListsOpenId(listId)}
              />
            )}
          </div>
        </div>
      </div>

      {isAddingTask && (
        <AddTaskModal
          homeId={homeId}
          selectedDate={selectedDate}
          aiEnabled={aiEnabled}
          onClose={() => setIsAddingTask(false)}
          onSuccess={() => {
            setIsAddingTask(false);
            toast.success("Task added to your schedule.");
            fetchTasksAndBlueprints();
            setRefreshKey((prev) => prev + 1);
          }}
        />
      )}

      {isAddingToDo && (
        <AddToDoListModal
          homeId={homeId}
          onClose={() => setIsAddingToDo(false)}
          onSuccess={() => {
            setIsAddingToDo(false);
            fetchTasksAndBlueprints();
            setRefreshKey((prev) => prev + 1);
          }}
          onViewLists={() => setTodoListsOpenId("auto")}
        />
      )}

      {todoListsOpenId !== null && (
        <ToDoListsModal
          homeId={homeId}
          initialOpenListId={todoListsOpenId === "auto" ? undefined : todoListsOpenId}
          onClose={() => setTodoListsOpenId(null)}
          onChange={() => {
            fetchTasksAndBlueprints();
            setRefreshKey((prev) => prev + 1);
          }}
        />
      )}
    </div>
  );
}
