import React, { useState, useEffect } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Filter,
  Plus,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { Logger } from "../lib/errorHandler";
import AddTaskModal, { TASK_CATEGORIES } from "./AddTaskModal";
import TaskList from "./TaskList";

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
  inventory_item_id?: string;
  isGhost?: boolean;
}

export default function TaskCalendar({ homeId }: { homeId: string }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());

  const [tasks, setTasks] = useState<Task[]>([]);
  const [blueprints, setBlueprints] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);

  const [refreshKey, setRefreshKey] = useState(0);

  const [isAddingTask, setIsAddingTask] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedLoc, setSelectedLoc] = useState<string>("all");
  const [selectedArea, setSelectedArea] = useState<string>("all");

  useEffect(() => {
    const fetchLocations = async () => {
      const { data } = await supabase
        .from("locations")
        .select("id, name, areas(id, name)")
        .eq("home_id", homeId);
      if (data) setLocations(data);
    };
    fetchLocations();
  }, [homeId]);

  const fetchTasksAndBlueprints = async () => {
    try {
      const startOfMonth = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth() - 1,
        1,
      )
        .toISOString()
        .split("T")[0];
      const endOfMonth = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth() + 2,
        0,
      )
        .toISOString()
        .split("T")[0];

      const { data: taskData, error: taskError } = await supabase
        .from("tasks")
        .select("*")
        .eq("home_id", homeId)
        .gte("due_date", startOfMonth)
        .lte("due_date", endOfMonth);

      if (taskError) throw taskError;
      if (taskData) setTasks(taskData);

      // 🚀 THE FIX: Included `cycle` in the fetch string
      const { data: bpData, error: bpError } = await supabase
        .from("task_blueprints")
        .select(
          `*, inventory_items(plant_name, identifier, location_name, area_name, plants(cycle, thumbnail_url)), locations(is_outside)`,
        )
        .eq("home_id", homeId)
        .eq("is_recurring", true);

      if (bpError) throw bpError;
      if (bpData) setBlueprints(bpData);
    } catch (err: any) {
      Logger.error("Failed to load calendar tasks", err);
    }
  };

  useEffect(() => {
    fetchTasksAndBlueprints();
  }, [currentDate, homeId]);

  const getLocalDateString = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
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

  const getTasksForDate = (date: Date) => {
    const dateStr = getLocalDateString(date);
    const targetDateMs = new Date(dateStr).getTime();

    const todayStr = getLocalDateString(new Date());
    const todayMs = new Date(todayStr).getTime();

    const physicalTasks = tasks.filter((task) => task.due_date === dateStr);
    const ghostTasks: Task[] = [];
    const uniqueGhostKeys = new Set();

    if (targetDateMs >= todayMs) {
      blueprints.forEach((bp) => {
        const cycle =
          bp.inventory_items?.plants?.cycle?.toLowerCase() || "annual";
        const maxYears = cycle.includes("perennial")
          ? 10
          : cycle.includes("biennial")
            ? 2
            : 1;

        const safeDateString =
          bp.start_date || bp.created_at || new Date().toISOString();
        const anchorDateStr = safeDateString.split("T")[0];
        const originalAnchorMs = new Date(anchorDateStr).getTime();
        const originalAnchorYear = new Date(anchorDateStr).getFullYear();

        const targetYear = new Date(dateStr).getFullYear();
        const yearShift = targetYear - originalAnchorYear;

        // 🚀 THE MAGIC: We test two potential yearly shifts to handle standard seasons AND winter cross-year seasons!
        const shiftsToTest = [yearShift, yearShift - 1];

        for (const shift of shiftsToTest) {
          if (shift < 0 || shift >= maxYears) continue;

          let activeAnchorMs = originalAnchorMs;
          let activeEndMs = bp.end_date
            ? new Date(bp.end_date).getTime()
            : Infinity;

          // Shift seasonal (ended) blueprints forward by the exact year difference
          if (bp.end_date && shift > 0) {
            const shiftedStart = new Date(anchorDateStr);
            shiftedStart.setFullYear(originalAnchorYear + shift);
            activeAnchorMs = shiftedStart.getTime();

            const shiftedEnd = new Date(bp.end_date);
            shiftedEnd.setFullYear(shiftedEnd.getFullYear() + shift);
            activeEndMs = shiftedEnd.getTime();
          }

          if (targetDateMs >= activeAnchorMs && targetDateMs <= activeEndMs) {
            const diffDays = Math.round(
              (targetDateMs - activeAnchorMs) / (1000 * 60 * 60 * 24),
            );

            if (diffDays % bp.frequency_days === 0) {
              const ghostKey = `${bp.task_type}-${bp.inventory_item_id}-${dateStr}`;

              if (!uniqueGhostKeys.has(ghostKey)) {
                const hasPhysical = physicalTasks.some(
                  (t) => t.blueprint_id === bp.id,
                );
                if (!hasPhysical) {
                  uniqueGhostKeys.add(ghostKey);
                  ghostTasks.push({
                    ...bp,
                    status: "Pending",
                    isGhost: true,
                    due_date: dateStr,
                  });
                }
              }
              break; // We found the valid window shift for this date, stop testing other shifts
            }
          }
        }
      });
    }

    const allTasks = [...physicalTasks, ...ghostTasks];

    return allTasks.filter((task) => {
      if (selectedTypes.length > 0 && !selectedTypes.includes(task.type))
        return false;
      if (selectedLoc !== "all" && task.location_id !== selectedLoc)
        return false;
      if (selectedArea !== "all" && task.area_id !== selectedArea) return false;
      return true;
    });
  };

  const days = generateCalendarDays();
  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const availableAreas =
    selectedLoc === "all"
      ? []
      : locations.find((l) => l.id === selectedLoc)?.areas || [];

  const isTodaySelected = isSameDay(selectedDate, new Date());

  return (
    <div className="w-full h-full flex flex-col p-4 md:p-8 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
        <div>
          <h2 className="text-4xl font-black font-display text-rhozly-on-surface">
            Schedule
          </h2>
          <p className="text-sm font-bold text-rhozly-on-surface/40 uppercase tracking-widest mt-1">
            Plant Care Calendar
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            className={`px-4 py-3 rounded-2xl font-black transition-all shadow-sm flex items-center gap-2 ${isFilterOpen || selectedTypes.length > 0 || selectedLoc !== "all" ? "bg-rhozly-primary text-white" : "bg-rhozly-surface-low text-rhozly-on-surface hover:bg-rhozly-surface-mid"}`}
          >
            <Filter size={18} /> Filters
            {(selectedTypes.length > 0 || selectedLoc !== "all") && (
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
        <div className="mb-8 p-6 bg-rhozly-surface-low/50 rounded-3xl border border-rhozly-outline/10 animate-in slide-in-from-top-4 fade-in">
          <div className="flex flex-wrap gap-6 items-start">
            <div className="flex-1 min-w-[250px]">
              <label className="text-[10px] font-black uppercase text-rhozly-on-surface/40 block mb-3">
                Task Types
              </label>
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
            <div className="flex flex-col sm:flex-row gap-4 w-full xl:w-auto">
              <div className="flex-1 sm:w-48">
                <label className="text-[10px] font-black uppercase text-rhozly-on-surface/40 block mb-3">
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
              <div className="flex-1 sm:w-48">
                <label className="text-[10px] font-black uppercase text-rhozly-on-surface/40 block mb-3">
                  Area
                </label>
                <select
                  value={selectedArea}
                  onChange={(e) => setSelectedArea(e.target.value)}
                  disabled={selectedLoc === "all"}
                  className="w-full p-3 bg-white rounded-xl font-bold border border-transparent focus:border-rhozly-primary outline-none text-sm disabled:opacity-50 cursor-pointer"
                >
                  <option value="all">All Areas</option>
                  {availableAreas.map((area: any) => (
                    <option key={area.id} value={area.id}>
                      {area.name}
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

          <div className="grid grid-cols-7 gap-2 sm:gap-3">
            {days.map((dayObj, index) => {
              const isSelected = isSameDay(dayObj.date, selectedDate);
              const isToday = isSameDay(dayObj.date, new Date());
              const dayTasks = getTasksForDate(dayObj.date);
              const pendingTasks = dayTasks.filter(
                (t) => t.status === "Pending",
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
                          className={`w-1.5 h-1.5 rounded-full ${isSelected ? "bg-white" : t.isGhost ? "bg-rhozly-primary/40 border border-rhozly-primary" : "bg-rhozly-primary"}`}
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
              className="flex items-center gap-1 text-xs font-black bg-rhozly-primary text-white px-4 py-2.5 rounded-xl shadow-md hover:scale-105 transition-transform active:scale-95"
            >
              <Plus size={16} strokeWidth={3} /> Add Task
            </button>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 relative">
            <TaskList
              key={`agenda-${selectedDate.toISOString()}-${refreshKey}`}
              homeId={homeId}
              targetDate={selectedDate}
              showOverdue={isTodaySelected}
              onTaskUpdated={fetchTasksAndBlueprints}
              locationId={selectedLoc}
              areaId={selectedArea === "all" ? undefined : selectedArea}
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
            fetchTasksAndBlueprints();
            setRefreshKey((prev) => prev + 1);
          }}
        />
      )}
    </div>
  );
}
