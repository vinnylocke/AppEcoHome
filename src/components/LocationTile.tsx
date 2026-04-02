import React from "react";
import { MapPin, Leaf, CheckSquare, AlertTriangle } from "lucide-react";

interface LocationTileProps {
  site: any; // Replace 'any' with your actual Location type
  index: number;
  onClick: () => void;
}

export default function LocationTile({
  site,
  index,
  onClick,
}: LocationTileProps) {
  // Alternating styles for that premium editorial look
  const isAlternate = index % 2 !== 0;

  return (
    <div
      onClick={onClick}
      className={`group relative rounded-3xl p-6 shadow-[0_8px_24px_-4px_rgba(26,28,27,0.04)] border hover:border-rhozly-primary/40 transition-all duration-300 cursor-pointer hover:shadow-[0_12px_32px_-4px_rgba(7,87,55,0.12)] hover:-translate-y-1 overflow-hidden ${
        isAlternate
          ? "bg-rhozly-primary/[0.04] border-rhozly-primary/10"
          : "bg-rhozly-surface-lowest border-rhozly-outline/30"
      }`}
    >
      {/* Subtle gradient background glow on hover */}
      <div className="absolute inset-0 bg-gradient-to-br from-rhozly-primary/0 to-rhozly-primary/[0.05] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

      <div className="relative z-10">
        {/* Hazard Banner (Only shows if your database has a hazard/alert field) */}
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
              {site.placement || "Unknown placement"}
            </p>
          </div>
        </div>

        {/* Dynamic Stats Grid */}
        <div className="grid grid-cols-3 gap-3 mt-8">
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
                {/* Note: if site.areas is an array from your DB, you might need site.areas.length here instead! */}
                {site.areas || 0}
              </span>
            </div>
          </div>
          <div
            className={`group-hover:bg-white transition-colors duration-300 rounded-2xl p-3 flex flex-col border border-transparent group-hover:border-rhozly-outline/20 ${isAlternate ? "bg-white/50" : "bg-rhozly-surface-low"}`}
          >
            <span className="text-[10px] text-rhozly-on-surface/50 font-black uppercase tracking-widest mb-1.5">
              Plants
            </span>
            <div className="flex items-center gap-2 text-rhozly-primary">
              <div className="w-6 h-6 rounded-full bg-rhozly-primary/10 flex items-center justify-center">
                <Leaf className="w-3 h-3" />
              </div>
              <span className="font-display font-black text-xl">
                {site.plants || 0}
              </span>
            </div>
          </div>
          <div
            className={`group-hover:bg-white transition-colors duration-300 rounded-2xl p-3 flex flex-col border border-transparent group-hover:border-rhozly-outline/20 ${isAlternate ? "bg-white/50" : "bg-rhozly-surface-low"}`}
          >
            <span className="text-[10px] text-rhozly-on-surface/50 font-black uppercase tracking-widest mb-1.5">
              Tasks
            </span>
            <div className="flex items-center gap-2 text-rhozly-primary">
              <div className="w-6 h-6 rounded-full bg-rhozly-primary/10 flex items-center justify-center">
                <CheckSquare className="w-3 h-3" />
              </div>
              <span className="font-display font-black text-xl">
                {site.tasks || 0}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
