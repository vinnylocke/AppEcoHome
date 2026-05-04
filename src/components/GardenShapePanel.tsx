import React from "react";
import { Pencil } from "lucide-react";

export type ShapePreset = {
  id: string;
  label: string;
  shapeType: "rect" | "circle" | "ellipse" | "polygon";
  color: string;
  defaultW?: number;
  defaultH?: number;
  defaultR?: number;
  defaultPoints?: { x: number; y: number }[];
  dashed?: boolean;
};

export const SHAPE_PRESETS: ShapePreset[] = [
  { id: "raised-bed",    label: "Raised Bed",    shapeType: "rect",    color: "#4ade80", defaultW: 2,   defaultH: 1 },
  { id: "planter-box",  label: "Planter Box",   shapeType: "rect",    color: "#a3e635", defaultW: 0.6, defaultH: 0.6 },
  { id: "greenhouse",   label: "Greenhouse",    shapeType: "rect",    color: "#bfdbfe", defaultW: 6,   defaultH: 3 },
  { id: "round-planter",label: "Round Planter", shapeType: "circle",  color: "#86efac", defaultR: 0.4 },
  { id: "oval-bed",     label: "Oval Bed",      shapeType: "ellipse", color: "#4ade80", defaultW: 2,   defaultH: 1 },
  { id: "pond",         label: "Pond",          shapeType: "circle",  color: "#7dd3fc", defaultR: 1.5 },
  { id: "l-shape",      label: "L-Shape Bed",   shapeType: "polygon", color: "#4ade80",
    defaultPoints: [
      { x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 1 },
      { x: 1, y: 1 }, { x: 1, y: 3 }, { x: 0, y: 3 },
    ],
  },
  { id: "path",         label: "Path",          shapeType: "rect",    color: "#d6d3d1", defaultW: 4, defaultH: 0.8 },
  { id: "shed",         label: "Shed",          shapeType: "rect",    color: "#a8a29e", defaultW: 3, defaultH: 2 },
  { id: "tree-canopy",  label: "Tree Canopy",   shapeType: "circle",  color: "#86efac", defaultR: 2, dashed: true },
];

interface Props {
  tool: "select" | "polygon";
  onAddPreset: (preset: ShapePreset) => void;
  onStartPolygon: () => void;
  isMobile: boolean;
}

function ShapeIcon({ preset }: { preset: ShapePreset }) {
  const size = 32;
  const pad = 4;
  const inner = size - pad * 2;

  if (preset.shapeType === "circle" || (preset.shapeType === "circle" && preset.defaultR)) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2} cy={size / 2} r={inner / 2}
          fill={preset.color + "99"}
          stroke={preset.color}
          strokeWidth={1.5}
          strokeDasharray={preset.dashed ? "3,2" : undefined}
        />
      </svg>
    );
  }
  if (preset.shapeType === "ellipse") {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <ellipse
          cx={size / 2} cy={size / 2} rx={inner / 2} ry={inner / 3}
          fill={preset.color + "99"} stroke={preset.color} strokeWidth={1.5}
        />
      </svg>
    );
  }
  if (preset.shapeType === "polygon" && preset.defaultPoints) {
    const pts = preset.defaultPoints;
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const scaleX = inner / (maxX - minX), scaleY = inner / (maxY - minY);
    const sc = Math.min(scaleX, scaleY);
    const pointsStr = pts.map(p => `${pad + (p.x - minX) * sc},${pad + (p.y - minY) * sc}`).join(" ");
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <polygon points={pointsStr} fill={preset.color + "99"} stroke={preset.color} strokeWidth={1.5} />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <rect x={pad} y={pad + 4} width={inner} height={inner - 4}
        fill={preset.color + "99"} stroke={preset.color} strokeWidth={1.5} rx={2}
      />
    </svg>
  );
}

export default function GardenShapePanel({ tool, onAddPreset, onStartPolygon, isMobile }: Props) {
  if (isMobile) {
    return (
      <div className="flex gap-2 overflow-x-auto px-4 py-2 bg-white border-t border-rhozly-outline/20 shrink-0">
        {SHAPE_PRESETS.map(preset => (
          <button
            key={preset.id}
            data-testid={`shape-tile-${preset.id}`}
            onClick={() => onAddPreset(preset)}
            className="flex flex-col items-center gap-1 shrink-0 p-2 rounded-2xl hover:bg-rhozly-surface active:scale-95 transition-all"
          >
            <ShapeIcon preset={preset} />
            <span className="text-[9px] font-black text-rhozly-on-surface/60 whitespace-nowrap">{preset.label}</span>
          </button>
        ))}
        <button
          data-testid="shape-tile-custom"
          onClick={onStartPolygon}
          className={`flex flex-col items-center gap-1 shrink-0 p-2 rounded-2xl active:scale-95 transition-all ${tool === "polygon" ? "bg-rhozly-primary/10 ring-1 ring-rhozly-primary" : "hover:bg-rhozly-surface"}`}
        >
          <div className="w-8 h-8 flex items-center justify-center">
            <Pencil size={18} className={tool === "polygon" ? "text-rhozly-primary" : "text-rhozly-on-surface/40"} />
          </div>
          <span className="text-[9px] font-black text-rhozly-on-surface/60 whitespace-nowrap">Custom</span>
        </button>
      </div>
    );
  }

  return (
    <div className="w-44 shrink-0 bg-white border-r border-rhozly-outline/20 flex flex-col overflow-y-auto">
      <div className="px-3 pt-4 pb-2">
        <p className="text-[10px] font-black text-rhozly-on-surface/40 uppercase tracking-widest">Shapes</p>
      </div>
      <div className="flex-1 px-2 pb-4 space-y-1">
        {SHAPE_PRESETS.map(preset => (
          <button
            key={preset.id}
            data-testid={`shape-tile-${preset.id}`}
            onClick={() => onAddPreset(preset)}
            className="w-full flex items-center gap-2.5 p-2 rounded-2xl hover:bg-rhozly-surface active:scale-95 transition-all text-left"
          >
            <ShapeIcon preset={preset} />
            <span className="text-xs font-bold text-rhozly-on-surface/70 leading-tight">{preset.label}</span>
          </button>
        ))}
        <div className="border-t border-rhozly-outline/10 my-2" />
        <button
          data-testid="shape-tile-custom"
          onClick={onStartPolygon}
          className={`w-full flex items-center gap-2.5 p-2 rounded-2xl transition-all text-left ${tool === "polygon" ? "bg-rhozly-primary/10 ring-1 ring-rhozly-primary" : "hover:bg-rhozly-surface"}`}
        >
          <div className="w-8 h-8 flex items-center justify-center">
            <Pencil size={18} className={tool === "polygon" ? "text-rhozly-primary" : "text-rhozly-on-surface/40"} />
          </div>
          <span className={`text-xs font-bold leading-tight ${tool === "polygon" ? "text-rhozly-primary" : "text-rhozly-on-surface/70"}`}>
            {tool === "polygon" ? "Drawing…" : "Draw Custom"}
          </span>
        </button>
      </div>
    </div>
  );
}
