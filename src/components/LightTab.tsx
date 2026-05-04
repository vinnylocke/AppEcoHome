import React, { useState, useEffect } from "react";
import { Sun, Loader2, Info, Zap } from "lucide-react";
import { supabase } from "../lib/supabase";
import {
  getOptimalLuxRange,
  type LuxRange,
} from "../lib/plantLightUtils";
import PlantLightReader from "./PlantLightReader";

interface LightTabProps {
  plantId: number | null;
  plantName: string;
  areaId?: string | null;
  homeId?: string;
  areaName?: string | null;
}

export default function LightTab({ plantId, plantName, areaId, homeId, areaName }: LightTabProps) {
  const [loading, setLoading] = useState(true);
  const [optimalRange, setOptimalRange] = useState<LuxRange | null>(null);
  const [showReader, setShowReader] = useState(false);

  useEffect(() => {
    if (!plantId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    supabase
      .from("plants")
      .select("sunlight")
      .eq("id", plantId)
      .single()
      .then(({ data }) => {
        if (cancelled) return;
        if (data?.sunlight) {
          const sunlight = Array.isArray(data.sunlight) ? data.sunlight : [];
          setOptimalRange(getOptimalLuxRange(sunlight));
        }
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [plantId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-rhozly-on-surface/40 py-8 justify-center">
        <Loader2 size={16} className="animate-spin" />
        <span className="text-xs font-bold">Loading light data…</span>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <p className="text-[10px] font-black text-rhozly-primary uppercase tracking-widest">
        Light Requirements
      </p>

      {optimalRange ? (
        <div
          data-testid="light-tab-optimal-range"
          className="bg-amber-50 border border-amber-200 rounded-3xl p-5 flex gap-4"
        >
          <div className="w-10 h-10 bg-amber-100 rounded-2xl flex items-center justify-center shrink-0">
            <Sun size={18} className="text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-black text-rhozly-on-surface text-sm mb-0.5">
              {optimalRange.label}
            </p>
            <p className="text-xs font-bold text-rhozly-on-surface/50">
              {optimalRange.min.toLocaleString()}–{optimalRange.max.toLocaleString()} lux
            </p>
            <p className="text-xs font-bold text-rhozly-on-surface/40 mt-2 leading-snug">
              Use "Get Reading" to measure the light in your plant's current spot and see how well it matches.
            </p>
          </div>
        </div>
      ) : (
        <div
          data-testid="light-tab-no-data"
          className="bg-rhozly-surface border border-rhozly-outline/20 rounded-3xl p-5 flex gap-4"
        >
          <div className="w-10 h-10 bg-rhozly-on-surface/5 rounded-2xl flex items-center justify-center shrink-0">
            <Info size={18} className="text-rhozly-on-surface/30" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-black text-rhozly-on-surface text-sm mb-0.5">
              No light data available
            </p>
            <p className="text-xs font-bold text-rhozly-on-surface/50 leading-snug">
              This plant doesn't have sunlight requirements on file. You can still take a reading — it will show the light level without a fitness rating.
            </p>
          </div>
        </div>
      )}

      {/* Fitness legend */}
      {optimalRange && (
        <div className="bg-rhozly-surface rounded-2xl p-4">
          <p className="text-[9px] font-black text-rhozly-on-surface/40 uppercase tracking-widest mb-3 flex items-center gap-1">
            <Zap size={10} /> Fitness scale
          </p>
          <div className="flex flex-wrap gap-2">
            {[
              { label: "Best", bg: "bg-green-100", text: "text-green-700" },
              { label: "Great", bg: "bg-lime-100", text: "text-lime-700" },
              { label: "Good", bg: "bg-amber-100", text: "text-amber-700" },
              { label: "Bad", bg: "bg-orange-100", text: "text-orange-700" },
              { label: "Worse", bg: "bg-red-100", text: "text-red-700" },
            ].map(({ label, bg, text }) => (
              <span
                key={label}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-black ${bg} ${text}`}
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      )}

      <button
        data-testid="light-tab-get-reading-button"
        onClick={() => setShowReader(true)}
        className="w-full flex items-center justify-center gap-2 py-4 bg-rhozly-primary text-white font-black text-xs uppercase tracking-widest rounded-2xl hover:opacity-90 active:scale-95 transition-all shadow-lg"
      >
        <Sun size={16} />
        Get Reading
      </button>

      {showReader && (
        <PlantLightReader
          plantName={plantName}
          optimalRange={optimalRange}
          onClose={() => setShowReader(false)}
          areaId={areaId}
          homeId={homeId}
          areaName={areaName}
        />
      )}
    </div>
  );
}
