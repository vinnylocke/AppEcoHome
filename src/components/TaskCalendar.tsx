import React, { useState, useEffect, useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Droplets,
  Scissors,
  Sprout,
  Wheat,
  Clock,
  CheckCircle2,
  CloudRain,
  Filter,
  Shovel,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { Logger } from "../lib/errorHandler";
import toast from "react-hot-toast";

// 🚀 MODULAR TASK TYPES: Easy to add new ones here!
export const TASK_TYPES = [
  "Watering",
  "Feeding",
  "Pruning",
  "Harvesting",
  "Planting",
];

export interface Task {
  id: string;
  home_id: string;
  title: string;
  description: string | null;
  status: "Pending" | "Completed" | "Postponed - Rain Expected";
  due_date: string;
  type: string; // Made flexible to match TASK_TYPES
  plant_id: string | null;
  inventory_item_id: string | null;
  created_at: string;
  completed_at: string | null;
  is_virtual: boolean;
  start_date: string | null;
  // UI ONLY: Joined fields for filtering
  location_id?: string;
  area_id?: string;
}

interface TaskCalendarProps {
  homeId: string;
}

export default function TaskCalendar({ homeId }: TaskCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // --- FILTER STATE ---
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedLoc, setSelectedLoc] = useState<string>("all");
  const [selectedArea, setSelectedArea] = useState<string>("all");

  // Fetch Locations & Areas for Filters
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

  // --- MOCK FETCH TASKS ---
  useEffect(() => {
    const fetchTasks = async () => {
      setLoading(true);
      try {
        // TODO: Replace with actual Supabase fetch.
        // NOTE: To filter by location, you'll need to join tasks to plant_instances to get the area_id
        setTasks([]);
      } catch (err: any) {
        Logger.error("Failed to load calendar tasks", err);
        toast.error("Could not load tasks.");
      } finally {
        setLoading(false);
      }
    };
    fetchTasks();
  }, [currentDate, homeId]);

  // --- MODULAR FILTERING LOGIC ---
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      // Filter by Type
      if (selectedTypes.length > 0 && !selectedTypes.includes(task.type))
        return false;
      // Filter by Location
      if (selectedLoc !== "all" && task.location_id !== selectedLoc)
        return false;
      // Filter by Area
      if (selectedArea !== "all" && task.area_id !== selectedArea) return false;

      return true;
    });
  }, [tasks, selectedTypes, selectedLoc, selectedArea]);

  const toggleTypeFilter = (type: string) => {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  };

  // --- CALENDAR LOGIC ---
  const generateCalendarDays = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDayIndex = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const days = [];

    for (let i = firstDayIndex - 1; i >= 0; i--) {
      days.push({
        date: new Date(year, month - 1, daysInPrevMonth - i),
        isCurrentMonth: false,
      });
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({ date: new Date(year, month, i), isCurrentMonth: true });
    }
    const remainingDays = 42 - days.length;
    for (let i = 1; i <= remainingDays; i++) {
      days.push({ date: new Date(year, month + 1, i), isCurrentMonth: false });
    }

    return days;
  };

  const nextMonth = () =>
    setCurrentDate(
      new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1),
    );
  const prevMonth = () =>
    setCurrentDate(
      new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1),
    );
  const goToToday = () => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDate(today);
  };

  // --- HELPERS ---
  const isSameDay = (d1: Date, d2: Date) => {
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
    );
  };

  // 🚀 Read from filteredTasks instead of raw tasks
  const getTasksForDate = (date: Date) => {
    return filteredTasks.filter((task) =>
      isSameDay(new Date(task.due_date), date),
    );
  };

  const getTaskIcon = (type: string) => {
    switch (type) {
      case "Watering":
        return <Droplets size={16} className="text-blue-500" />;
      case "Pruning":
        return <Scissors size={16} className="text-orange-500" />;
      case "Feeding":
        return <Sprout size={16} className="text-green-500" />;
      case "Harvesting":
        return <Wheat size={16} className="text-yellow-500" />;
      case "Planting":
        return <Shovel size={16} className="text-amber-700" />;
      default:
        return <Clock size={16} className="text-gray-500" />;
    }
  };

  const days = generateCalendarDays();
  const selectedDateTasks = getTasksForDate(selectedDate);
  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Helper to get available areas based on selected location
  const availableAreas =
    selectedLoc === "all"
      ? []
      : locations.find((l) => l.id === selectedLoc)?.areas || [];

  return (
    <div className="w-full h-full flex flex-col p-4 md:p-8 animate-in fade-in duration-700">
      {/* HEADER & TOP CONTROLS */}
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
            onClick={goToToday}
            className="px-6 py-3 bg-rhozly-surface-low text-rhozly-on-surface rounded-2xl font-black hover:bg-rhozly-surface-mid transition-all shadow-sm flex items-center gap-2"
          >
            <CalendarIcon size={18} /> Today
          </button>
        </div>
      </div>

      {/* 🚀 MODULAR FILTER BAR (Fixed overflow layout) */}
      {isFilterOpen && (
        <div className="mb-8 p-6 bg-rhozly-surface-low/50 rounded-3xl border border-rhozly-outline/10 animate-in slide-in-from-top-4 fade-in">
          <div className="flex flex-wrap gap-6 items-start">
            {/* Task Type Filters */}
            <div className="flex-1 min-w-[250px]">
              <label className="text-[10px] font-black uppercase text-rhozly-on-surface/40 block mb-3">
                Task Types
              </label>
              <div className="flex flex-wrap gap-2">
                {TASK_TYPES.map((type) => (
                  <button
                    key={type}
                    onClick={() => toggleTypeFilter(type)}
                    className={`px-4 py-2 rounded-xl text-xs font-black transition-all border-2 ${selectedTypes.includes(type) ? "border-rhozly-primary bg-rhozly-primary/10 text-rhozly-primary" : "border-transparent bg-white text-rhozly-on-surface/60 hover:bg-white/50"}`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            {/* Location & Area Filters */}
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

      {/* MAIN CONTENT: GRID & SIDEBAR */}
      <div className="flex flex-col lg:flex-row gap-8 pb-20">
        {/* LEFT: CALENDAR GRID */}
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
                onClick={prevMonth}
                className="p-3 bg-rhozly-surface-low rounded-2xl hover:bg-rhozly-primary hover:text-white transition-all"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                onClick={nextMonth}
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
              const hasTasks = dayTasks.length > 0;

              return (
                <button
                  key={index}
                  onClick={() => setSelectedDate(dayObj.date)}
                  className={`
                    relative flex flex-col items-center justify-center aspect-square rounded-2xl sm:rounded-3xl transition-all border-2
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

                  {hasTasks && (
                    <div className="absolute bottom-2 sm:bottom-3 flex gap-1">
                      {dayTasks.slice(0, 3).map((t, i) => (
                        <span
                          key={i}
                          className={`w-1.5 h-1.5 rounded-full ${isSelected ? "bg-white" : "bg-rhozly-primary"}`}
                        />
                      ))}
                      {dayTasks.length > 3 && (
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${isSelected ? "bg-white/50" : "bg-rhozly-primary/50"}`}
                        />
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* RIGHT: DAILY AGENDA */}
        <div className="flex-1 bg-rhozly-surface-lowest rounded-[3rem] p-8 shadow-2xl border border-rhozly-outline/10 flex flex-col min-h-[500px]">
          <div className="mb-8">
            <h3 className="text-2xl font-black">Agenda</h3>
            <p className="text-sm font-bold text-rhozly-primary mt-1">
              {selectedDate.toLocaleDateString("default", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-4">
            {loading ? (
              <div className="h-full flex items-center justify-center">
                <Loader2
                  className="animate-spin text-rhozly-primary"
                  size={32}
                />
              </div>
            ) : selectedDateTasks.length > 0 ? (
              selectedDateTasks.map((task) => (
                <div
                  key={task.id}
                  className="p-5 rounded-3xl bg-rhozly-surface-low border border-rhozly-outline/5 hover:border-rhozly-primary/20 transition-all"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-white shadow-sm flex items-center justify-center">
                        {getTaskIcon(task.type)}
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/60">
                        {task.type}
                      </span>
                    </div>
                    {task.status === "Completed" && (
                      <CheckCircle2 size={18} className="text-green-500" />
                    )}
                    {task.status === "Postponed - Rain Expected" && (
                      <CloudRain size={18} className="text-blue-400" />
                    )}
                  </div>
                  <h4 className="text-lg font-black leading-tight mb-1">
                    {task.title}
                  </h4>
                  {task.description && (
                    <p className="text-sm font-bold text-rhozly-on-surface/50 leading-relaxed line-clamp-2">
                      {task.description}
                    </p>
                  )}
                </div>
              ))
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center opacity-40 py-20">
                <div className="w-20 h-20 bg-rhozly-on-surface/5 rounded-full flex items-center justify-center mb-4">
                  <Droplets size={32} className="text-rhozly-on-surface" />
                </div>
                <p className="font-black text-lg">No Tasks Scheduled</p>
                <p className="text-sm font-bold mt-1 max-w-[200px]">
                  Your plants are happy and resting for today.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
