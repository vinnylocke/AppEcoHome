import React, { useState } from "react";
import { Pencil, Waves, PanelLeftClose, PanelLeftOpen } from "lucide-react";

const COLLAPSE_KEY = "rhozly:shape-rail-collapsed";

export type ShapeGroup = "beds" | "structures" | "hardscape" | "features";

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
  extrude_m: number;
  group: ShapeGroup;
};

const GROUP_META: Record<ShapeGroup, { label: string; order: number }> = {
  beds:       { label: "Beds & Planters", order: 0 },
  structures: { label: "Structures",      order: 1 },
  hardscape:  { label: "Hardscape",       order: 2 },
  features:   { label: "Features",        order: 3 },
};

// Wave 6D — short hover descriptions to disambiguate similar-looking preset icons
const PRESET_DESCRIPTIONS: Record<string, string> = {
  "raised-bed":     "Wood-framed bed for vegetables and herbs",
  "planter-box":    "Small container — good for one plant per box",
  "round-planter":  "Round pot or planter",
  "oval-bed":       "Oval-shaped bed for flowering displays",
  "l-shape":        "L-shaped bed — useful for corners",
  "greenhouse":     "Glass / poly-tunnel structure",
  "shed":           "Garden shed for tools and storage",
  "path":           "Walkway between beds",
  "fence-panel":    "Fence section — defines boundaries",
  "wall":           "Stone or brick wall",
  "gate":           "Gateway through a fence or wall",
  "door":           "Door of a structure",
  "pond":           "Water feature",
  "tree-canopy":    "Tree footprint (shows shadow casting)",
  "garden-boundary":"Outline of your overall garden",
};

export const SHAPE_PRESETS: ShapePreset[] = [
  // Beds & Planters
  { id: "raised-bed",    label: "Raised Bed",    shapeType: "rect",    color: "#4ade80", defaultW: 2,   defaultH: 1,    extrude_m: 0.3, group: "beds" },
  { id: "planter-box",   label: "Planter Box",   shapeType: "rect",    color: "#a3e635", defaultW: 0.6, defaultH: 0.6,  extrude_m: 0.3, group: "beds" },
  { id: "round-planter", label: "Round Planter", shapeType: "circle",  color: "#86efac", defaultR: 0.4,                extrude_m: 0.3, group: "beds" },
  { id: "oval-bed",      label: "Oval Bed",      shapeType: "ellipse", color: "#4ade80", defaultW: 2,   defaultH: 1,    extrude_m: 0.3, group: "beds" },
  { id: "l-shape",       label: "L-Shape Bed",   shapeType: "polygon", color: "#4ade80",                               extrude_m: 0.3, group: "beds",
    defaultPoints: [
      { x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 1 },
      { x: 1, y: 1 }, { x: 1, y: 3 }, { x: 0, y: 3 },
    ],
  },

  // Structures
  { id: "greenhouse", label: "Greenhouse", shapeType: "rect", color: "#bfdbfe", defaultW: 6, defaultH: 3, extrude_m: 2.5, group: "structures" },
  { id: "shed",       label: "Shed",       shapeType: "rect", color: "#a8a29e", defaultW: 3, defaultH: 2, extrude_m: 2.5, group: "structures" },

  // Hardscape
  { id: "path",        label: "Path",        shapeType: "rect", color: "#d6d3d1", defaultW: 4,   defaultH: 0.8,  extrude_m: 0.02, group: "hardscape" },
  { id: "fence-panel", label: "Fence Panel", shapeType: "rect", color: "#92400e", defaultW: 2,   defaultH: 0.15, extrude_m: 1.2,  group: "hardscape" },
  { id: "wall",        label: "Wall",        shapeType: "rect", color: "#78716c", defaultW: 3,   defaultH: 0.2,  extrude_m: 1.2,  group: "hardscape" },
  { id: "gate",        label: "Gate",        shapeType: "rect", color: "#d97706", defaultW: 1,   defaultH: 0.1,  extrude_m: 2.0,  group: "hardscape" },
  { id: "door",        label: "Door",        shapeType: "rect", color: "#b45309", defaultW: 0.9, defaultH: 0.15, extrude_m: 2.0,  group: "hardscape" },

  // Features
  { id: "pond",            label: "Pond",            shapeType: "circle", color: "#7dd3fc", defaultR: 1.5,                 extrude_m: 0.0, group: "features" },
  { id: "tree-canopy",     label: "Tree Canopy",     shapeType: "circle", color: "#86efac", defaultR: 2,   dashed: true,   extrude_m: 2.0, group: "features" },
  { id: "garden-boundary", label: "Garden Boundary", shapeType: "rect",   color: "#92400e", defaultW: 20,  defaultH: 15, dashed: true, extrude_m: 0.0, group: "features" },
];

interface Props {
  tool: "select" | "polygon" | "draw";
  viewMode: "2d" | "3d";
  pendingPresetId?: string | null;
  /** True when the polygon tool was activated via the Free-form Bed tile (smoothed). */
  curveMode?: boolean;
  onAddPreset: (preset: ShapePreset) => void;
  onStartPolygon: () => void;
  onStartCurve: () => void;
  isMobile: boolean;
}

function ShapeIcon({ preset, size = 32 }: { preset: ShapePreset; size?: number }) {
  const pad = 4;
  const inner = size - pad * 2;

  if (preset.shapeType === "circle") {
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
        strokeDasharray={preset.dashed ? "3,2" : undefined}
      />
    </svg>
  );
}

function groupedPresets(): { group: ShapeGroup; presets: ShapePreset[] }[] {
  const groups: Record<ShapeGroup, ShapePreset[]> = { beds: [], structures: [], hardscape: [], features: [] };
  for (const p of SHAPE_PRESETS) groups[p.group].push(p);
  return (Object.keys(GROUP_META) as ShapeGroup[])
    .sort((a, b) => GROUP_META[a].order - GROUP_META[b].order)
    .map(g => ({ group: g, presets: groups[g] }));
}

export default function GardenShapePanel({ tool, viewMode, pendingPresetId, curveMode, onAddPreset, onStartPolygon, onStartCurve, isMobile }: Props) {
  const sections = groupedPresets();
  const polygonActiveSharp  = tool === "polygon" && !curveMode;
  const polygonActiveCurved = tool === "polygon" &&  curveMode;

  if (isMobile) {
    return (
      <div
        data-testid="shape-rail-mobile"
        className="bg-white border-t border-rhozly-outline/20 shrink-0 overflow-x-auto"
      >
        <div className="flex items-stretch gap-3 px-3 py-2 min-h-[88px]">
          {sections.map(({ group, presets }) => (
            <React.Fragment key={group}>
              <div className="flex flex-col items-start gap-1 shrink-0" data-testid={`rail-section-${group}`}>
                <p className="text-[8px] font-black text-rhozly-on-surface/40 uppercase tracking-widest px-1">
                  {GROUP_META[group].label}
                </p>
                <div className="flex gap-1.5">
                  {presets.map(preset => {
                    const active = pendingPresetId === preset.id;
                    return (
                      <button
                        key={preset.id}
                        data-testid={`shape-tile-${preset.id}`}
                        onClick={() => onAddPreset(preset)}
                        aria-label={preset.label}
                        aria-pressed={active}
                        className={`flex flex-col items-center gap-1 shrink-0 min-w-[64px] min-h-[64px] p-2 rounded-2xl active:scale-95 transition-all ${
                          active ? "bg-rhozly-primary/10 ring-2 ring-rhozly-primary" : "bg-rhozly-surface/60 hover:bg-rhozly-surface"
                        }`}
                      >
                        <ShapeIcon preset={preset} size={36} />
                        <span className="text-[9px] font-black text-rhozly-on-surface/70 whitespace-nowrap leading-none">{preset.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="w-px bg-rhozly-outline/15 self-stretch shrink-0" aria-hidden="true" />
            </React.Fragment>
          ))}
          {viewMode === "2d" && (
            <div className="flex flex-col items-start gap-1 shrink-0" data-testid="rail-section-custom">
              <p className="text-[8px] font-black text-rhozly-on-surface/40 uppercase tracking-widest px-1">Custom</p>
              <div className="flex gap-1.5">
                <button
                  data-testid="shape-tile-custom"
                  onClick={onStartPolygon}
                  aria-label="Draw custom polygon"
                  aria-pressed={polygonActiveSharp}
                  className={`flex flex-col items-center gap-1 shrink-0 min-w-[64px] min-h-[64px] p-2 rounded-2xl active:scale-95 transition-all ${
                    polygonActiveSharp ? "bg-rhozly-primary/10 ring-2 ring-rhozly-primary" : "bg-rhozly-surface/60 hover:bg-rhozly-surface"
                  }`}
                >
                  <Pencil size={20} className={polygonActiveSharp ? "text-rhozly-primary" : "text-rhozly-on-surface/50"} />
                  <span className="text-[9px] font-black text-rhozly-on-surface/70 leading-none">Polygon</span>
                </button>
                <button
                  data-testid="shape-tile-curve"
                  onClick={onStartCurve}
                  aria-label="Draw free-form curved bed"
                  aria-pressed={polygonActiveCurved}
                  className={`flex flex-col items-center gap-1 shrink-0 min-w-[64px] min-h-[64px] p-2 rounded-2xl active:scale-95 transition-all ${
                    polygonActiveCurved ? "bg-rhozly-primary/10 ring-2 ring-rhozly-primary" : "bg-rhozly-surface/60 hover:bg-rhozly-surface"
                  }`}
                >
                  <Waves size={20} className={polygonActiveCurved ? "text-rhozly-primary" : "text-rhozly-on-surface/50"} />
                  <span className="text-[9px] font-black text-rhozly-on-surface/70 leading-none">Free-form</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Desktop — sectioned vertical rail (collapsible). Local state with localStorage so the
  // preference sticks across navigations.
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(COLLAPSE_KEY) === "1";
  });
  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  };

  if (collapsed) {
    return (
      <div
        data-testid="shape-rail-desktop-collapsed"
        className="w-10 shrink-0 bg-white border-r border-rhozly-outline/20 flex flex-col items-center pt-3"
      >
        <button
          data-testid="shape-rail-toggle"
          onClick={toggleCollapsed}
          aria-label="Show shape palette"
          title="Show shape palette"
          className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl text-rhozly-on-surface/50 hover:bg-rhozly-surface hover:text-rhozly-on-surface transition-colors"
        >
          <PanelLeftOpen size={18} />
        </button>
      </div>
    );
  }

  return (
    <div
      data-testid="shape-rail-desktop"
      className="w-48 shrink-0 bg-white border-r border-rhozly-outline/20 flex flex-col overflow-y-auto"
    >
      <div className="flex items-center justify-between px-3 pt-2">
        <p className="text-[9px] font-black text-rhozly-on-surface/30 uppercase tracking-widest">Shapes</p>
        <button
          data-testid="shape-rail-toggle"
          onClick={toggleCollapsed}
          aria-label="Hide shape palette"
          title="Hide shape palette"
          className="min-h-[28px] min-w-[28px] flex items-center justify-center rounded-lg text-rhozly-on-surface/40 hover:bg-rhozly-surface hover:text-rhozly-on-surface transition-colors"
        >
          <PanelLeftClose size={14} />
        </button>
      </div>
      {sections.map(({ group, presets }) => (
        <div key={group} data-testid={`rail-section-${group}`} className="border-b border-rhozly-outline/10 last:border-b-0">
          <div className="px-3 pt-4 pb-1">
            <p className="text-[10px] font-black text-rhozly-on-surface/40 uppercase tracking-widest">
              {GROUP_META[group].label}
            </p>
          </div>
          <div className="px-2 pb-3 space-y-1">
            {presets.map(preset => {
              const active = pendingPresetId === preset.id;
              const description = PRESET_DESCRIPTIONS[preset.id];
              return (
                <button
                  key={preset.id}
                  data-testid={`shape-tile-${preset.id}`}
                  onClick={() => onAddPreset(preset)}
                  aria-pressed={active}
                  title={description ? `${preset.label} — ${description}` : preset.label}
                  className={`w-full flex items-center gap-2.5 p-2 rounded-2xl active:scale-95 transition-all text-left ${
                    active ? "bg-rhozly-primary/10 ring-1 ring-rhozly-primary" : "hover:bg-rhozly-surface"
                  }`}
                >
                  <ShapeIcon preset={preset} />
                  <span className="text-xs font-bold text-rhozly-on-surface/70 leading-tight">{preset.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {viewMode === "2d" && (
        <div data-testid="rail-section-custom" className="px-2 py-3 space-y-1">
          <div className="px-1 pb-1">
            <p className="text-[10px] font-black text-rhozly-on-surface/40 uppercase tracking-widest">Custom</p>
          </div>
          <button
            data-testid="shape-tile-custom"
            onClick={onStartPolygon}
            aria-pressed={polygonActiveSharp}
            className={`w-full flex items-center gap-2.5 p-2 rounded-2xl transition-all text-left ${
              polygonActiveSharp ? "bg-rhozly-primary/10 ring-1 ring-rhozly-primary" : "hover:bg-rhozly-surface"
            }`}
          >
            <div className="w-8 h-8 flex items-center justify-center">
              <Pencil size={18} className={polygonActiveSharp ? "text-rhozly-primary" : "text-rhozly-on-surface/40"} />
            </div>
            <span className={`text-xs font-bold leading-tight ${polygonActiveSharp ? "text-rhozly-primary" : "text-rhozly-on-surface/70"}`}>
              {polygonActiveSharp ? "Drawing polygon…" : "Polygon"}
            </span>
          </button>
          <button
            data-testid="shape-tile-curve"
            onClick={onStartCurve}
            aria-pressed={polygonActiveCurved}
            className={`w-full flex items-center gap-2.5 p-2 rounded-2xl transition-all text-left ${
              polygonActiveCurved ? "bg-rhozly-primary/10 ring-1 ring-rhozly-primary" : "hover:bg-rhozly-surface"
            }`}
          >
            <div className="w-8 h-8 flex items-center justify-center">
              <Waves size={18} className={polygonActiveCurved ? "text-rhozly-primary" : "text-rhozly-on-surface/40"} />
            </div>
            <span className={`text-xs font-bold leading-tight ${polygonActiveCurved ? "text-rhozly-primary" : "text-rhozly-on-surface/70"}`}>
              {polygonActiveCurved ? "Drawing free-form…" : "Free-form Bed"}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
