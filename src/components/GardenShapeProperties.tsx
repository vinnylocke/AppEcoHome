import React, { useState, useEffect } from "react";
import { Trash2, Link, X, RotateCcw, ArrowUpToLine, ArrowUp, ArrowDown, ArrowDownToLine, Palette, Ruler, Layers, Image as ImageIcon, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Logger } from "../lib/errorHandler";
import toast from "react-hot-toast";
import ShapePhotoTimeline from "./garden/ShapePhotoTimeline";
import ShapeSuggestions from "./garden/ShapeSuggestions";
import ShapeQuickActions from "./garden/ShapeQuickActions";
import ShapeNotes from "./garden/ShapeNotes";
import ShapeHistory from "./garden/ShapeHistory";
import { Zap, BookmarkPlus } from "lucide-react";
import type { SunClass } from "../lib/sunAnalysis";

export type ShapeData = {
  id: string;
  layout_id: string;
  area_id: string | null;
  shape_type: "rect" | "circle" | "ellipse" | "polygon" | "path";
  label: string | null;
  color: string;
  x_m: number;
  y_m: number;
  width_m: number | null;
  height_m: number | null;
  radius_m: number | null;
  points: { x: number; y: number }[] | null;
  rotation: number;
  z_index: number;
  dashed: boolean;
  extrude_m: number | null;
  preset_id: string | null;
  plan_id?: string | null;
};

type PaletteKey = "foliage" | "hardscape" | "water" | "accents";

const PALETTES: Record<PaletteKey, { label: string; swatches: string[] }> = {
  foliage:   { label: "Foliage",   swatches: ["#a3e635", "#84cc16", "#65a30d", "#86efac", "#22c55e", "#15803d"] },
  hardscape: { label: "Hardscape", swatches: ["#d6d3d1", "#a8a29e", "#78716c", "#92400e", "#b45309", "#44403c"] },
  water:     { label: "Water",     swatches: ["#bae6fd", "#7dd3fc", "#38bdf8", "#0ea5e9", "#0284c7", "#075985"] },
  accents:   { label: "Accents",   swatches: ["#fbbf24", "#f97316", "#ef4444", "#a855f7", "#ec4899", "#fde047"] },
};
const PALETTE_ORDER: PaletteKey[] = ["foliage", "hardscape", "water", "accents"];

interface Area { id: string; name: string; location_id: string; }

export type ShapeTaskRow = {
  id: string;
  title: string;
  type: string;
  status: string;
  due_date: string;
  inventory_item_ids: string[] | null;
};

export type ShapeAilmentRow = {
  id: string;
  name: string;
  type: string;
};

interface Props {
  shape: ShapeData;
  homeId: string;
  taskCounts?: { overdue: number; today: number };
  ailmentSummary?: { count: number; severity: "low" | "moderate" | "severe" };
  sunClassification?: SunClass | null;
  hemisphere?: "northern" | "southern";
  onChange: (updated: Partial<ShapeData>) => void;
  onDelete: () => void;
  onClose: () => void;
  onBringToFront: () => void;
  onBringForward: () => void;
  onSendBackward: () => void;
  onSendToBack: () => void;
  onTaskCompleted?: () => void;
  onSaveAsTemplate?: () => void;
}

type PropertyTab = "style" | "size" | "link" | "photos";

export default function GardenShapeProperties({
  shape, homeId, taskCounts, ailmentSummary, sunClassification, hemisphere,
  onChange, onDelete, onClose,
  onBringToFront, onBringForward, onSendBackward, onSendToBack, onTaskCompleted,
  onSaveAsTemplate,
}: Props) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<PropertyTab>("style");
  const [areas, setAreas] = useState<Area[]>([]);
  const [areaSearch, setAreaSearch] = useState("");
  const [showAreaPicker, setShowAreaPicker] = useState(false);
  const [plantedHere, setPlantedHere] = useState<
    Array<{ id: string; plant_name: string; nickname: string | null }>
  >([]);
  const [tasksForBed, setTasksForBed] = useState<ShapeTaskRow[]>([]);
  const [activeAilments, setActiveAilments] = useState<ShapeAilmentRow[]>([]);
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [showQuickActions, setShowQuickActions] = useState(false);
  const [activePalette, setActivePalette] = useState<PaletteKey>(() => {
    // Pick the palette whose swatches contain the current shape colour, falling back to foliage.
    for (const key of PALETTE_ORDER) {
      if (PALETTES[key].swatches.includes(shape.color)) return key;
    }
    return "foliage";
  });

  useEffect(() => {
    fetchAreas();
  }, [homeId]);

  useEffect(() => {
    if (!shape.area_id) {
      setPlantedHere([]);
      setTasksForBed([]);
      setActiveAilments([]);
      return;
    }
    let cancelled = false;
    (async () => {
      // Plants in this bed
      const { data: plants } = await supabase
        .from("inventory_items")
        .select("id, plant_name, nickname")
        .eq("area_id", shape.area_id)
        .eq("status", "Planted");
      if (cancelled) return;
      setPlantedHere(plants ?? []);

      const plantIds = (plants ?? []).map((p) => p.id);
      if (plantIds.length === 0) {
        setTasksForBed([]);
        setActiveAilments([]);
        return;
      }

      // Pending / overdue tasks for these plants
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);
      const { data: tasks } = await supabase
        .from("tasks")
        .select("id, title, type, status, due_date, inventory_item_ids")
        .eq("home_id", homeId)
        .overlaps("inventory_item_ids", plantIds)
        .neq("status", "Completed")
        .neq("status", "Skipped")
        .lte("due_date", todayEnd.toISOString())
        .order("due_date", { ascending: true });
      if (cancelled) return;
      setTasksForBed(tasks ?? []);

      // Active ailments
      const { data: aRows } = await supabase
        .from("plant_instance_ailments")
        .select("ailment_id, ailments(id, name, type)")
        .eq("home_id", homeId)
        .eq("status", "active")
        .in("plant_instance_id", plantIds);
      if (cancelled) return;
      const ailmentList: ShapeAilmentRow[] = [];
      const seen = new Set<string>();
      for (const row of aRows ?? []) {
        const a = (row as any).ailments;
        if (a && !seen.has(a.id)) { seen.add(a.id); ailmentList.push(a); }
      }
      setActiveAilments(ailmentList);
    })();
    return () => { cancelled = true; };
  }, [shape.area_id, homeId]);

  async function handleCompleteTask(taskId: string) {
    if (completingTaskId) return;
    setCompletingTaskId(taskId);
    try {
      const { error } = await supabase
        .from("tasks")
        .update({ status: "Completed", completed_at: new Date().toISOString() })
        .eq("id", taskId);
      if (error) throw error;
      setTasksForBed((prev) => prev.filter((t) => t.id !== taskId));
      toast.success("Task completed");
      onTaskCompleted?.();
    } catch (err) {
      Logger.error("Failed to complete task", err);
      toast.error("Could not complete task");
    } finally {
      setCompletingTaskId(null);
    }
  }

  const fetchAreas = async () => {
    try {
      const { data } = await supabase
        .from("areas")
        .select("id, name, location_id")
        .in("location_id", (
          await supabase.from("locations").select("id").eq("home_id", homeId)
        ).data?.map((l: any) => l.id) ?? [])
        .order("name");
      setAreas(data ?? []);
    } catch (err) {
      Logger.error("Failed to fetch areas for shape properties", err);
    }
  };

  const linkedArea = areas.find(a => a.id === shape.area_id);
  const filteredAreas = areas.filter(a => a.name.toLowerCase().includes(areaSearch.toLowerCase()));

  const field = (label: string, children: React.ReactNode) => (
    <div>
      <p className="text-[10px] font-black text-rhozly-on-surface/40 uppercase tracking-widest mb-1">{label}</p>
      {children}
    </div>
  );

  const TAB_META: { id: PropertyTab; label: string; Icon: any }[] = [
    { id: "style",  label: "Style",  Icon: Palette },
    { id: "size",   label: "Size",   Icon: Ruler },
    { id: "link",   label: "Link",   Icon: Layers },
    { id: "photos", label: "Photos", Icon: ImageIcon },
  ];

  return (
    <div className="w-72 shrink-0 bg-white border-l border-rhozly-outline/20 flex flex-col overflow-y-auto">
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <p className="text-xs font-black text-rhozly-on-surface uppercase tracking-widest">Properties</p>
        <button
          data-testid="properties-close-btn"
          onClick={onClose}
          aria-label="Close properties"
          className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-rhozly-on-surface/40 hover:text-rhozly-on-surface hover:bg-rhozly-surface transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* Tab strip — compact so all four headers fit a desktop panel.
          Inactive tabs show icon only; the active tab shows icon + label. */}
      <div className="px-3 pb-2" role="tablist" aria-label="Properties tabs">
        <div className="flex items-center gap-0.5 bg-rhozly-surface rounded-2xl p-0.5">
          {TAB_META.map(({ id, label, Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                data-testid={`property-tab-${id}`}
                onClick={() => setTab(id)}
                role="tab"
                aria-selected={active}
                title={label}
                className={`flex-1 flex items-center justify-center gap-1 min-h-[38px] px-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors ${
                  active ? "bg-white text-rhozly-on-surface shadow-sm" : "text-rhozly-on-surface/50 hover:text-rhozly-on-surface"
                }`}
              >
                <Icon size={13} className="shrink-0" />
                <span className={active ? "" : "sr-only"}>{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 px-4 pb-4 space-y-4">
        {/* ── Style tab ── */}
        {tab === "style" && (
          <>
            {field("Label",
              <input
                data-testid="shape-label-input"
                type="text"
                value={shape.label ?? ""}
                onChange={e => onChange({ label: e.target.value || null })}
                placeholder={shape.shape_type}
                className="w-full bg-rhozly-bg rounded-xl px-3 py-2.5 text-xs font-bold text-rhozly-on-surface border border-rhozly-outline/20 outline-none focus:border-rhozly-primary min-h-[44px]"
              />
            )}

            {field("Colour",
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1" role="tablist" aria-label="Colour palette">
                  {PALETTE_ORDER.map((key) => (
                    <button
                      key={key}
                      data-testid={`palette-tab-${key}`}
                      onClick={() => setActivePalette(key)}
                      role="tab"
                      aria-selected={activePalette === key}
                      className={`min-h-[32px] px-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors ${
                        activePalette === key
                          ? "bg-rhozly-on-surface text-white"
                          : "bg-rhozly-surface text-rhozly-on-surface/60 hover:text-rhozly-on-surface"
                      }`}
                    >
                      {PALETTES[key].label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  {PALETTES[activePalette].swatches.map(c => (
                    <button
                      key={c}
                      data-testid={`shape-colour-swatch-${c}`}
                      onClick={() => onChange({ color: c })}
                      aria-label={`Colour ${c}`}
                      aria-pressed={shape.color === c}
                      className={`w-9 h-9 rounded-xl border-2 transition-transform active:scale-90 ${shape.color === c ? "border-rhozly-on-surface scale-110" : "border-transparent"}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                  <input
                    data-testid="shape-colour-custom"
                    type="color"
                    value={shape.color}
                    onChange={e => onChange({ color: e.target.value })}
                    className="w-9 h-9 rounded-xl border border-rhozly-outline/20 cursor-pointer overflow-hidden"
                    title="Custom colour"
                    aria-label="Custom colour"
                  />
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Size tab ── */}
        {tab === "size" && (
          <>
            {(shape.shape_type === "rect" || shape.shape_type === "ellipse" || shape.shape_type === "path") && field("Size (metres)",
              <div className="flex gap-2">
                <div className="flex-1">
                  <p className="text-[9px] font-bold text-rhozly-on-surface/40 mb-1">W</p>
                  <input
                    data-testid="shape-width-input"
                    type="number" min="0.1" step="0.1"
                    value={shape.width_m ?? ""}
                    onChange={e => onChange({ width_m: parseFloat(e.target.value) || null })}
                    className="w-full bg-rhozly-bg rounded-xl px-3 py-2.5 text-xs font-bold text-rhozly-on-surface border border-rhozly-outline/20 outline-none focus:border-rhozly-primary min-h-[44px]"
                  />
                </div>
                <div className="flex-1">
                  <p className="text-[9px] font-bold text-rhozly-on-surface/40 mb-1">L</p>
                  <input
                    data-testid="shape-height-input"
                    type="number" min="0.1" step="0.1"
                    value={shape.height_m ?? ""}
                    onChange={e => onChange({ height_m: parseFloat(e.target.value) || null })}
                    className="w-full bg-rhozly-bg rounded-xl px-3 py-2.5 text-xs font-bold text-rhozly-on-surface border border-rhozly-outline/20 outline-none focus:border-rhozly-primary min-h-[44px]"
                  />
                </div>
              </div>
            )}

            {shape.shape_type === "circle" && field("Radius (m)",
              <input
                data-testid="shape-radius-input"
                type="number" min="0.05" step="0.05"
                value={shape.radius_m ?? ""}
                onChange={e => onChange({ radius_m: parseFloat(e.target.value) || null })}
                className="w-full bg-rhozly-bg rounded-xl px-3 py-2.5 text-xs font-bold text-rhozly-on-surface border border-rhozly-outline/20 outline-none focus:border-rhozly-primary min-h-[44px]"
              />
            )}

            {field("Rotation",
              <div className="flex items-center gap-2">
                <input
                  data-testid="shape-rotation-input"
                  type="number" min="-360" max="360" step="5"
                  value={Math.round(shape.rotation)}
                  onChange={e => onChange({ rotation: parseFloat(e.target.value) || 0 })}
                  className="flex-1 bg-rhozly-bg rounded-xl px-3 py-2.5 text-xs font-bold text-rhozly-on-surface border border-rhozly-outline/20 outline-none focus:border-rhozly-primary min-h-[44px]"
                />
                <span className="text-xs font-bold text-rhozly-on-surface/40">°</span>
                <button
                  data-testid="shape-rotation-reset-btn"
                  onClick={() => onChange({ rotation: 0 })}
                  aria-label="Reset rotation"
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-rhozly-on-surface/40 hover:text-rhozly-on-surface hover:bg-rhozly-surface transition-colors"
                >
                  <RotateCcw size={15} />
                </button>
              </div>
            )}

            {field("3D Height (m)",
              <input
                data-testid="shape-extrude-input"
                type="number" min="0" step="0.05"
                value={shape.extrude_m ?? ""}
                onChange={e => onChange({ extrude_m: parseFloat(e.target.value) || null })}
                placeholder="0.3"
                className="w-full bg-rhozly-bg rounded-xl px-3 py-2.5 text-xs font-bold text-rhozly-on-surface border border-rhozly-outline/20 outline-none focus:border-rhozly-primary min-h-[44px]"
              />
            )}
          </>
        )}

        {/* ── Link tab ── */}
        {tab === "link" && (
          <>
            {field("Linked Area",
              <div className="space-y-2">
                {linkedArea ? (
                  <div className="flex items-center gap-2 bg-rhozly-primary/10 rounded-xl px-3 min-h-[44px]">
                    <Link size={14} className="text-rhozly-primary shrink-0" />
                    <span className="text-xs font-black text-rhozly-primary truncate">{linkedArea.name}</span>
                    <button
                      data-testid="unlink-area-btn"
                      onClick={() => onChange({ area_id: null })}
                      aria-label="Unlink area"
                      className="ml-auto min-h-[36px] min-w-[36px] flex items-center justify-center text-rhozly-primary/60 hover:text-rhozly-primary"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <button
                    data-testid="link-area-btn"
                    onClick={() => setShowAreaPicker(v => !v)}
                    className="w-full flex items-center gap-2 bg-rhozly-bg rounded-xl px-3 min-h-[44px] border border-rhozly-outline/20 text-xs font-bold text-rhozly-on-surface/50 hover:border-rhozly-primary transition-colors"
                  >
                    <Link size={14} /> Link to area…
                  </button>
                )}

                {showAreaPicker && (
                  <div className="bg-rhozly-bg rounded-xl border border-rhozly-outline/20 overflow-hidden">
                    <input
                      autoFocus
                      type="text"
                      placeholder="Search areas…"
                      value={areaSearch}
                      onChange={e => setAreaSearch(e.target.value)}
                      className="w-full px-3 py-2.5 text-xs font-bold text-rhozly-on-surface outline-none border-b border-rhozly-outline/20 bg-transparent min-h-[44px]"
                    />
                    <div className="max-h-40 overflow-y-auto">
                      {filteredAreas.map(a => (
                        <button
                          key={a.id}
                          data-testid={`area-option-${a.id}`}
                          onClick={() => { onChange({ area_id: a.id, label: shape.label ?? a.name }); setShowAreaPicker(false); setAreaSearch(""); }}
                          className="w-full text-left px-3 min-h-[44px] flex items-center text-xs font-bold text-rhozly-on-surface hover:bg-rhozly-surface transition-colors"
                        >
                          {a.name}
                        </button>
                      ))}
                      {filteredAreas.length === 0 && (
                        <p className="px-3 py-3 text-xs font-bold text-rhozly-on-surface/30">No areas found</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {plantedHere.length > 0 && field("Planted Here",
              <div className="space-y-1.5">
                {plantedHere.map(p => (
                  <div key={p.id} className="flex items-center gap-2 text-xs font-bold text-rhozly-on-surface/70">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                    {p.nickname ?? p.plant_name}
                  </div>
                ))}
              </div>
            )}

            {shape.area_id && (
              <button
                data-testid="shape-quick-actions-btn"
                onClick={() => setShowQuickActions(true)}
                className="w-full flex items-center justify-center gap-2 min-h-[44px] rounded-2xl bg-rhozly-primary text-white text-xs font-black hover:bg-rhozly-primary/90 transition-colors"
              >
                <Zap size={14} /> Quick Actions
              </button>
            )}

            {shape.area_id && field("Plant Suggestions",
              <ShapeSuggestions
                shapeId={shape.id}
                homeId={homeId}
                sunClassification={sunClassification}
                hemisphere={hemisphere}
              />
            )}

            {(taskCounts && (taskCounts.overdue > 0 || taskCounts.today > 0)) || tasksForBed.length > 0 ? field("Pending Tasks",
              <div className="space-y-2" data-testid="shape-tasks-list">
                <div className="flex items-center gap-1.5">
                  {taskCounts && taskCounts.overdue > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-red-50 text-red-600 text-[10px] font-black uppercase tracking-widest">
                      {taskCounts.overdue} overdue
                    </span>
                  )}
                  {taskCounts && taskCounts.today > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-50 text-amber-600 text-[10px] font-black uppercase tracking-widest">
                      {taskCounts.today} today
                    </span>
                  )}
                </div>
                <div className="space-y-1.5">
                  {tasksForBed.slice(0, 6).map((t) => (
                    <div key={t.id} className="flex items-center gap-2 bg-rhozly-bg rounded-xl px-2 py-1.5 border border-rhozly-outline/15">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-rhozly-on-surface truncate">{t.title}</p>
                        <p className="text-[9px] font-bold text-rhozly-on-surface/40">{t.type} · {new Date(t.due_date).toLocaleDateString()}</p>
                      </div>
                      <button
                        data-testid={`shape-task-done-${t.id}`}
                        onClick={() => handleCompleteTask(t.id)}
                        disabled={completingTaskId === t.id}
                        aria-label="Mark task done"
                        className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-emerald-600 hover:bg-emerald-50 disabled:opacity-50 transition-colors"
                      >
                        {completingTaskId === t.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={16} />}
                      </button>
                    </div>
                  ))}
                  {tasksForBed.length > 6 && (
                    <p className="text-[10px] font-bold text-rhozly-on-surface/40">+{tasksForBed.length - 6} more</p>
                  )}
                </div>
              </div>
            ) : null}

            {(ailmentSummary || activeAilments.length > 0) && field("Active Ailments",
              <div className="space-y-2" data-testid="shape-ailments-list">
                {ailmentSummary && (
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${
                    ailmentSummary.severity === "severe" ? "bg-red-50 text-red-600" :
                    ailmentSummary.severity === "moderate" ? "bg-orange-50 text-orange-600" :
                    "bg-yellow-50 text-yellow-700"
                  }`}>
                    <AlertTriangle size={11} />
                    {ailmentSummary.count} active · {ailmentSummary.severity}
                  </span>
                )}
                <div className="space-y-1">
                  {activeAilments.map((a) => (
                    <div key={a.id} className="flex items-center gap-2 text-xs font-bold text-rhozly-on-surface/70">
                      <span className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0" />
                      <span className="flex-1 truncate">{a.name}</span>
                      <span className="text-[9px] font-bold text-rhozly-on-surface/40 uppercase tracking-wider">{a.type.replace("_", " ")}</span>
                    </div>
                  ))}
                </div>
                <button
                  data-testid="shape-open-watchlist-btn"
                  onClick={() => navigate("/shed?tab=watchlist")}
                  className="text-[10px] font-black text-rhozly-primary uppercase tracking-widest hover:underline"
                >
                  Open Watchlist →
                </button>
              </div>
            )}

            {field("Layer Order",
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { icon: <ArrowDownToLine size={14} />, label: "Back",    action: onSendToBack,   testId: "send-to-back-btn" },
                  { icon: <ArrowDown size={14} />,       label: "Back 1",  action: onSendBackward, testId: "send-backward-btn" },
                  { icon: <ArrowUp size={14} />,         label: "Fwd 1",   action: onBringForward, testId: "bring-forward-btn" },
                  { icon: <ArrowUpToLine size={14} />,   label: "Front",   action: onBringToFront, testId: "bring-to-front-btn" },
                ].map(btn => (
                  <button
                    key={btn.testId}
                    data-testid={btn.testId}
                    onClick={btn.action}
                    title={btn.label}
                    aria-label={btn.label}
                    className="flex flex-col items-center gap-0.5 min-h-[44px] py-2 rounded-xl bg-rhozly-bg border border-rhozly-outline/20 text-rhozly-on-surface/50 hover:text-rhozly-on-surface hover:border-rhozly-primary/40 transition-colors"
                  >
                    {btn.icon}
                    <span className="text-[8px] font-black uppercase tracking-wide leading-none">{btn.label}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="pt-2 border-t border-rhozly-outline/10 space-y-3">
              {shape.area_id && <ShapeHistory areaId={shape.area_id} />}
              <ShapeNotes shapeId={shape.id} homeId={homeId} />
              {onSaveAsTemplate && (
                <button
                  data-testid="save-as-template-btn"
                  onClick={onSaveAsTemplate}
                  className="w-full flex items-center justify-center gap-2 min-h-[44px] rounded-xl border border-rhozly-primary/30 text-rhozly-primary text-xs font-black hover:bg-rhozly-primary/5 transition-colors"
                >
                  <BookmarkPlus size={14} /> Save as Template
                </button>
              )}
              <button
                data-testid="delete-shape-btn"
                onClick={onDelete}
                className="w-full flex items-center justify-center gap-2 min-h-[44px] rounded-xl border border-red-200 text-red-500 text-xs font-black hover:bg-red-50 transition-colors"
              >
                <Trash2 size={14} /> Delete shape
              </button>
            </div>
          </>
        )}

        {/* ── Photos tab ── */}
        {tab === "photos" && (
          <ShapePhotoTimeline shapeId={shape.id} homeId={homeId} />
        )}
      </div>

      {showQuickActions && (
        <ShapeQuickActions
          shapeId={shape.id}
          shapeLabel={shape.label}
          areaId={shape.area_id}
          homeId={homeId}
          onClose={() => setShowQuickActions(false)}
          onActionComplete={() => onTaskCompleted?.()}
        />
      )}
    </div>
  );
}
