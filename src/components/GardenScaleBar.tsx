import React from "react";

interface Props {
  pxPerM: number;
  zoom: number;
}

export default function GardenScaleBar({ pxPerM, zoom }: Props) {
  const pct = Math.round(zoom * 100);

  return (
    <div className="absolute bottom-4 left-4 flex items-center gap-3 pointer-events-none">
      <div className="bg-white/90 backdrop-blur-sm rounded-xl px-3 py-1.5 border border-rhozly-outline/20 shadow-sm flex items-center gap-2">
        <div
          className="h-2 border-l border-b border-r border-rhozly-on-surface/40"
          style={{ width: pxPerM }}
        />
        <span className="text-[10px] font-black text-rhozly-on-surface/60 whitespace-nowrap">1 m</span>
      </div>
      <div className="bg-white/90 backdrop-blur-sm rounded-xl px-3 py-1.5 border border-rhozly-outline/20 shadow-sm">
        <span className="text-[10px] font-black text-rhozly-on-surface/60">{pct}%</span>
      </div>
    </div>
  );
}
