import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import {
  MapPin,
  CheckSquare,
  AlertTriangle,
  Sprout,
  Database,
  Loader2,
} from "lucide-react";

import { usePlantDoctor } from "../context/PlantDoctorContext";
import { getLocalDateString } from "../lib/dateUtils";

interface LocationTileProps {
  site: any;
  index: number;
  onClick: () => void;
}


export default function LocationTile({
  site,
  index,
  onClick,
}: LocationTileProps) {
  // 🧠 GRAB THE SETTER FROM CONTEXT
  const { setPageContext } = usePlantDoctor();

  // Alternating styles for that premium editorial look
  const isAlternate = index % 2 !== 0;

  // 🚀 Local state for our smart task calculation
  const [tasksCount, setTasksCount] = useState<number | null>(null);

  // 🚀 Calculate exact counts from the nested data
  const areasCount = site.areas?.length || 0;
  const plantedCount =
    site.inventory_items?.filter((i: any) => i.status === "Planted").length ||
    0;
  const unplantedCount =
    site.inventory_items?.filter((i: any) => i.status === "Unplanted").length ||
    0;

  // 🧠 LIVE AI SYNC: Update the AI on the stats for this specific location card
  useEffect(() => {
    // We provide a summary of this tile to the AI context.
    // In a list view, the AI will have context for the most recently rendered/updated tile.
    setPageContext({
      action: "Browsing Garden Dashboard",
      currentlyViewingTile: {
        locationName: site.name,
        environment: site.is_outside ? "Outdoors" : "Indoors",
        stats: {
          areas: areasCount,
          plantedPlants: plantedCount,
          unplantedPlants: unplantedCount,
          tasksToday: tasksCount ?? "Loading...",
        },
        hasHazards: !!site.hazard,
      },
    });

    // Note: We don't cleanup (set to null) here because other tiles
    // in the list are also trying to set the context.
  }, [
    site.name,
    site.is_outside,
    site.hazard,
    areasCount,
    plantedCount,
    unplantedCount,
    tasksCount,
    setPageContext,
  ]);

  // 🚀 MINI GHOST ENGINE: Calculates Today's Tasks for this specific location
  useEffect(() => {
    const fetchLocationTaskCount = async () => {
      const todayStr = getLocalDateString(new Date());
      const targetDateMs = new Date(todayStr).getTime();

      try {
        // 1. Get physical pending tasks for this location today
        const { data: physicalTasks } = await supabase
          .from("tasks")
          .select("id, blueprint_id")
          .eq("location_id", site.id)
          .eq("due_date", todayStr)
          .neq("status", "Skipped")
          .neq("status", "Completed"); // Don't count finished tasks

        // 2. Get recurring blueprints for this location
        const { data: blueprints } = await supabase
          .from("task_blueprints")
          .select("id, start_date, created_at, end_date, frequency_days")
          .eq("location_id", site.id)
          .eq("is_recurring", true);

        let count = physicalTasks?.length || 0;
        const existingBlueprints = new Set(
          physicalTasks?.map((t) => t.blueprint_id).filter(Boolean),
        );

        // 3. Count the ghosts
        (blueprints || []).forEach((bp) => {
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

          if (
            diffDays % bp.frequency_days === 0 &&
            !existingBlueprints.has(bp.id)
          ) {
            count++; // Add a ghost task to the count!
          }
        });

        setTasksCount(count);
      } catch (err) {
        console.error("Failed to count tasks for location", err);
        setTasksCount(0);
      }
    };

    fetchLocationTaskCount();
  }, [site.id]);

  return (
    <div
      onClick={onClick}
      className={`group relative rounded-3xl p-6 shadow-[0_8px_24px_-4px_rgba(26,28,27,0.04)] border hover:border-rhozly-primary/40 transition-all duration-300 cursor-pointer hover:shadow-[0_12px_32px_-4px_rgba(7,87,55,0.12)] hover:-translate-y-1 overflow-hidden ${
        isAlternate
          ? "bg-rhozly-primary/[0.04] border-rhozly-primary/10"
          : "bg-rhozly-surface-lowest border-rhozly-outline/30"
      }`}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-rhozly-primary/0 to-rhozly-primary/[0.05] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

      <div className="relative z-10">
        {/* Hazard Banner */}
        {site.hazard && (
          <div className="absolute -top-6 -left-6 -right-6 bg-gradient-to-r from-rhozly-tertiary to-[#ffd0cd] text-[#900b09] text-xs font-bold px-6 py-2 flex items-center gap-2 shadow-sm">
            <AlertTriangle className="w-4 h-4 animate-pulse" />
            {site.hazard}
          </div>
        )}

        <div
          className={`flex justify-between items-start ${site.hazard ? "mt-6" : ""}`}
        >
          <div>
            <h3 className="font-display font-black text-2xl text-rhozly-on-surface tracking-tight">
              {site.name || "Unnamed Location"}
            </h3>
            <p className="text-xs font-bold text-rhozly-on-surface/40 uppercase tracking-widest mt-1">
              {site.is_outside ? "Outdoors" : "Indoors"}
            </p>
          </div>
        </div>

        {/* 2x2 Dynamic Stats Grid */}
        <div className="grid grid-cols-2 gap-3 mt-8">
          {/* Areas */}
          <div
            className={`group-hover:bg-white transition-colors duration-300 rounded-2xl p-3 flex flex-col border border-transparent group-hover:border-rhozly-outline/20 ${isAlternate ? "bg-white/50" : "bg-rhozly-surface-low"}`}
          >
            <span className="text-[10px] text-rhozly-on-surface/50 font-black uppercase tracking-widest mb-1.5">
              Areas
            </span>
            <div className="flex items-center gap-2 text-rhozly-primary">
              <div className="w-6 h-6 rounded-full bg-rhozly-primary/10 flex items-center justify-center">
                <MapPin className="w-3 h-3" />
              </div>
              <span className="font-display font-black text-xl">
                {areasCount}
              </span>
            </div>
          </div>

          {/* Planted */}
          <div
            className={`group-hover:bg-white transition-colors duration-300 rounded-2xl p-3 flex flex-col border border-transparent group-hover:border-rhozly-outline/20 ${isAlternate ? "bg-white/50" : "bg-rhozly-surface-low"}`}
          >
            <span className="text-[10px] text-rhozly-on-surface/50 font-black uppercase tracking-widest mb-1.5">
              Planted
            </span>
            <div className="flex items-center gap-2 text-green-600">
              <div className="w-6 h-6 rounded-full bg-green-500/10 flex items-center justify-center">
                <Sprout className="w-3 h-3" />
              </div>
              <span className="font-display font-black text-xl">
                {plantedCount}
              </span>
            </div>
          </div>

          {/* Unplanted / Potted */}
          <div
            className={`group-hover:bg-white transition-colors duration-300 rounded-2xl p-3 flex flex-col border border-transparent group-hover:border-rhozly-outline/20 ${isAlternate ? "bg-white/50" : "bg-rhozly-surface-low"}`}
          >
            <span className="text-[10px] text-rhozly-on-surface/50 font-black uppercase tracking-widest mb-1.5">
              Unplanted
            </span>
            <div className="flex items-center gap-2 text-blue-600">
              <div className="w-6 h-6 rounded-full bg-blue-500/10 flex items-center justify-center">
                <Database className="w-3 h-3" />
              </div>
              <span className="font-display font-black text-xl">
                {unplantedCount}
              </span>
            </div>
          </div>

          {/* Tasks */}
          <div
            className={`group-hover:bg-white transition-colors duration-300 rounded-2xl p-3 flex flex-col border border-transparent group-hover:border-rhozly-outline/20 ${isAlternate ? "bg-white/50" : "bg-rhozly-surface-low"}`}
          >
            <span className="text-[10px] text-rhozly-on-surface/50 font-black uppercase tracking-widest mb-1.5">
              Tasks
            </span>
            <div className="flex items-center gap-2 text-orange-500">
              <div className="w-6 h-6 rounded-full bg-orange-500/10 flex items-center justify-center">
                <CheckSquare className="w-3 h-3" />
              </div>
              <span className="font-display font-black text-xl">
                {tasksCount === null ? (
                  <Loader2 className="w-4 h-4 animate-spin opacity-50" />
                ) : (
                  tasksCount
                )}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
