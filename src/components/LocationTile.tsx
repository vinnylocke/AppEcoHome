import React, { useEffect } from "react";
import {
  MapPin,
  CheckSquare,
  AlertTriangle,
  Sprout,
  Database,
  Loader2,
  ChevronRight,
} from "lucide-react";

import { usePlantDoctor } from "../context/PlantDoctorContext";

interface LocationTileProps {
  site: any;
  index: number;
  tasksCount: number | null;
  onClick: () => void;
}

export default function LocationTile({
  site,
  index,
  tasksCount,
  onClick,
}: LocationTileProps) {
  const { setPageContext } = usePlantDoctor();

  const isAlternate = index % 2 !== 0;

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


  return (
    <div
      onClick={onClick}
      className={`group relative rounded-3xl p-6 shadow-[0_8px_24px_-4px_rgba(26,28,27,0.04)] border hover:border-rhozly-primary/40 transition-all duration-300 cursor-pointer hover:shadow-[0_12px_32px_-4px_rgba(7,87,55,0.12)] hover:-translate-y-1 active:scale-[0.98] active:shadow-none overflow-hidden ${
        isAlternate
          ? "bg-rhozly-primary/[0.04] border-rhozly-primary/10"
          : "bg-rhozly-surface-lowest border-rhozly-outline/30"
      }`}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-rhozly-primary/0 to-rhozly-primary/[0.05]" />

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
          <div className="flex-1 min-w-0">
            <h3 className="font-display font-black text-2xl text-rhozly-on-surface tracking-tight">
              {site.name || "Unnamed Location"}
            </h3>
            <p className="text-xs font-bold text-rhozly-on-surface/40 uppercase tracking-widest mt-1">
              {site.is_outside ? "Outdoors" : "Indoors"}
            </p>
          </div>
          <ChevronRight className="w-5 h-5 text-rhozly-on-surface/30 group-hover:text-rhozly-primary/60 transition-colors duration-300 flex-shrink-0 mt-1" />
        </div>

        {/* 2x2 Dynamic Stats Grid */}
        <div className="grid grid-cols-2 gap-3 mt-8">
          {/* Areas */}
          <div
            className={`group-hover:bg-white transition-colors duration-300 rounded-2xl p-3 flex flex-col border border-transparent group-hover:border-rhozly-outline/20 ${isAlternate ? "bg-white/50" : "bg-rhozly-surface-low"}`}
          >
            <span className="text-xs text-rhozly-on-surface/50 font-black uppercase tracking-widest mb-1.5">
              Areas
            </span>
            <div className="flex items-center gap-2 text-rhozly-primary">
              <div className="w-8 h-8 rounded-full bg-rhozly-primary/10 flex items-center justify-center">
                <MapPin className="w-4 h-4" />
              </div>
              <span className="font-display font-black text-xl" data-testid={`location-${site.id}-areas-count`}>
                {areasCount}
              </span>
            </div>
          </div>

          {/* Planted */}
          <div
            className={`group-hover:bg-white transition-colors duration-300 rounded-2xl p-3 flex flex-col border border-transparent group-hover:border-rhozly-outline/20 ${isAlternate ? "bg-white/50" : "bg-rhozly-surface-low"}`}
          >
            <span className="text-xs text-rhozly-on-surface/50 font-black uppercase tracking-widest mb-1.5">
              Planted
            </span>
            <div className="flex items-center gap-2 text-rhozly-primary">
              <div className="w-8 h-8 rounded-full bg-rhozly-primary/10 flex items-center justify-center">
                <Sprout className="w-4 h-4" />
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
            <span className="text-xs text-rhozly-on-surface/50 font-black uppercase tracking-widest mb-1.5">
              Unplanted
            </span>
            <div className="flex items-center gap-2 text-rhozly-secondary">
              <div className="w-8 h-8 rounded-full bg-rhozly-secondary/10 flex items-center justify-center">
                <Database className="w-4 h-4" />
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
            <span className="text-xs text-rhozly-on-surface/50 font-black uppercase tracking-widest mb-1.5">
              Tasks
            </span>
            <div className="flex items-center gap-2 text-rhozly-tertiary">
              <div className="w-8 h-8 rounded-full bg-rhozly-tertiary/10 flex items-center justify-center">
                <CheckSquare className="w-4 h-4" />
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
