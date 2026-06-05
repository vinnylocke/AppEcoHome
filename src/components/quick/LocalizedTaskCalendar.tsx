import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, Loader2, Plus, ListChecks } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Logger } from "../../lib/errorHandler";
import { usePermissions } from "../../context/HomePermissionsContext";

import PlantingCalendarCard from "./PlantingCalendarCard";
import RainWaterAdvice from "./RainWaterAdvice";
import QuickAddTaskModal from "./QuickAddTaskModal";
import TaskList from "../TaskList";
import AddToDoListModal from "../todo/AddToDoListModal";

interface Props {
  homeId: string;
  aiEnabled: boolean;
  isPremium: boolean;
}

interface ClimateThresholds {
  rain_skip_mm: number;
  rain_water_mm: number;
}

const DEFAULTS: ClimateThresholds = { rain_skip_mm: 5, rain_water_mm: 1 };

/**
 * Phone home page at /quick/calendar. Composes the three sub-cards
 * top-to-bottom:
 *   1. PlantingCalendarCard (frost dates + AI helper)
 *   2. RainWaterAdvice (synthesised locally — no AI)
 *   3. TaskList compact (today's pending)
 */
export default function LocalizedTaskCalendar({ homeId, aiEnabled, isPremium }: Props) {
  const navigate = useNavigate();
  const { can } = usePermissions();
  const [rain, setRain] = useState<{ today: number; tomorrow: number } | null>(null);
  const [openWateringTaskCount, setOpenWateringTaskCount] = useState(0);
  const [thresholds, setThresholds] = useState<ClimateThresholds>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  // Increment to force TaskList remount + re-fetch after a Quick Add save.
  const [tasksRefreshKey, setTasksRefreshKey] = useState(0);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [addToDoOpen, setAddToDoOpen] = useState(false);

  const canCreateHomeTask = can("tasks.create_home");

  useEffect(() => {
    if (!homeId) return;
    let cancelled = false;

    (async () => {
      try {
        const todayIso = new Date().toISOString().split("T")[0];

        const [weatherRes, climateRes, tasksRes] = await Promise.all([
          supabase
            .from("weather_snapshots")
            .select("data")
            .eq("home_id", homeId)
            .maybeSingle(),
          supabase
            .from("home_climate")
            .select("rain_skip_mm, rain_water_mm")
            .eq("home_id", homeId)
            .maybeSingle(),
          supabase
            .from("tasks")
            .select("id", { count: "exact", head: true })
            .eq("home_id", homeId)
            .eq("type", "Watering")
            .eq("status", "Pending")
            .eq("due_date", todayIso),
        ]);

        if (cancelled) return;

        const dailyRain = weatherRes.data?.data?.daily?.precipitation_sum ?? [];
        setRain({
          today: Number(dailyRain[0] ?? 0),
          tomorrow: Number(dailyRain[1] ?? 0),
        });

        if (climateRes.data) {
          setThresholds({
            rain_skip_mm: Number(climateRes.data.rain_skip_mm ?? DEFAULTS.rain_skip_mm),
            rain_water_mm: Number(climateRes.data.rain_water_mm ?? DEFAULTS.rain_water_mm),
          });
        }

        setOpenWateringTaskCount(tasksRes.count ?? 0);
      } catch (err) {
        Logger.error("LocalizedTaskCalendar load failed", err, { homeId });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [homeId, tasksRefreshKey]);

  return (
    <div
      data-testid="localized-task-calendar"
      // Wave 10 — push content past the floating menu button.
      style={{ paddingTop: "calc(4rem + env(safe-area-inset-top, 0px))" }}
      className="h-full w-full max-w-2xl mx-auto px-4 sm:px-6 pb-4 flex flex-col"
    >
      {/* Back chrome */}
      <header className="flex items-center justify-between mb-3">
        <button
          type="button"
          data-testid="quick-calendar-back"
          onClick={() => navigate("/quick")}
          className="inline-flex items-center gap-1 min-h-[44px] px-2 -ml-2 text-sm font-bold text-rhozly-on-surface/60 hover:text-rhozly-primary transition"
          aria-label="Back to Quick Access"
        >
          <ChevronLeft size={18} />
          Quick
        </button>
        <span className="text-[10px] font-black uppercase tracking-widest text-rhozly-primary/70">
          Today's Calendar
        </span>
      </header>

      <div className="flex-1 min-h-0 space-y-4">
        {/* 1. Planting Calendar Card */}
        <PlantingCalendarCard homeId={homeId} aiEnabled={aiEnabled} />

        {/* 2. Rain & Watering Advice */}
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-rhozly-on-surface/50 px-4 py-3 rounded-2xl bg-rhozly-surface-low border border-rhozly-outline/10">
            <Loader2 className="animate-spin" size={14} />
            Loading rain forecast…
          </div>
        ) : rain ? (
          <RainWaterAdvice
            todayRainMm={rain.today}
            tomorrowRainMm={rain.tomorrow}
            openWateringTaskCount={openWateringTaskCount}
            rainSkipMm={thresholds.rain_skip_mm}
            rainWaterMm={thresholds.rain_water_mm}
          />
        ) : null}

        {/* 3. Today's tasks (compact) — promoted above seasonal picks so the
            weather banner → tasks → "what to grow" reading order matches what
            users actually want to scan first on the Today screen. */}
        <section
          data-testid="quick-calendar-tasks"
          className="rounded-3xl bg-white border border-rhozly-outline/15 shadow-sm p-4 sm:p-5"
        >
          <div className="flex items-center justify-between mb-3 gap-2">
            <h2 className="font-black text-sm uppercase tracking-widest text-rhozly-on-surface/60">
              Today's tasks
            </h2>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                data-testid="quick-calendar-add-todo-list"
                onClick={() => setAddToDoOpen(true)}
                disabled={!canCreateHomeTask}
                title={canCreateHomeTask ? "Add a to-do list" : "You don't have permission to add tasks here."}
                className="inline-flex items-center gap-1 px-3 py-1.5 min-h-[36px] rounded-xl bg-rhozly-surface-low text-rhozly-on-surface/70 text-[11px] font-black uppercase tracking-widest hover:bg-rhozly-surface-mid disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                <ListChecks size={14} />
                List
              </button>
              <button
                type="button"
                data-testid="quick-calendar-add-task"
                onClick={() => setQuickAddOpen(true)}
                disabled={!canCreateHomeTask}
                title={canCreateHomeTask ? "Add a task quickly" : "You don't have permission to add tasks here."}
                className="inline-flex items-center gap-1 px-3 py-1.5 min-h-[36px] rounded-xl bg-rhozly-primary/10 text-rhozly-primary text-[11px] font-black uppercase tracking-widest hover:bg-rhozly-primary/15 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                <Plus size={14} />
                Add
              </button>
            </div>
          </div>
          <TaskList
            key={tasksRefreshKey}
            homeId={homeId}
            compact
            targetDate={new Date()}
          />
        </section>
      </div>

      {quickAddOpen && (
        <QuickAddTaskModal
          homeId={homeId}
          onClose={() => setQuickAddOpen(false)}
          onSuccess={() => setTasksRefreshKey((k) => k + 1)}
        />
      )}

      {addToDoOpen && (
        <AddToDoListModal
          homeId={homeId}
          onClose={() => setAddToDoOpen(false)}
          onSuccess={() => setTasksRefreshKey((k) => k + 1)}
        />
      )}
    </div>
  );
}
