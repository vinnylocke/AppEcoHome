import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Stage, Layer, Rect, Circle, Ellipse, Line, Text, Transformer } from "react-konva";
import {
  ArrowLeft, ZoomIn, ZoomOut, Settings, CheckCircle2, Loader2, X,
} from "lucide-react";
import GardenLayout3D from "./GardenLayout3D";
import { supabase } from "../lib/supabase";
import { Logger } from "../lib/errorHandler";
import toast from "react-hot-toast";
import GardenRuler from "./GardenRuler";
import GardenScaleBar from "./GardenScaleBar";
import GardenShapePanel, { type ShapePreset } from "./GardenShapePanel";
import GardenShapeProperties, { type ShapeData } from "./GardenShapeProperties";

interface Layout {
  id: string;
  name: string;
  canvas_w_m: number;
  canvas_h_m: number;
}

interface Props {
  homeId: string;
}

const BASE_PX = 50; // pixels per metre at zoom = 1

export default function GardenLayoutEditor({ homeId }: Props) {
  const { layoutId } = useParams<{ layoutId: string }>();
  const navigate = useNavigate();

  const [layout, setLayout] = useState<Layout | null>(null);
  const [shapes, setShapes] = useState<ShapeData[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<"select" | "polygon">("select");
  const [viewMode, setViewMode] = useState<"2d" | "3d">("2d");
  const [homeLatLng, setHomeLatLng] = useState<{ lat: number; lng: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 32, y: 32 });
  const [polyPoints, setPolyPoints] = useState<{ x: number; y: number }[]>([]);
  const [pointerPos, setPointerPos] = useState<{ x: number; y: number } | null>(null);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "unsaved">("saved");
  const [showSettings, setShowSettings] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth < 768);
  const [containerSize, setContainerSize] = useState({ w: 800, h: 600 });
  const [settingName, setSettingName] = useState("");
  const [settingW, setSettingW] = useState(30);
  const [settingH, setSettingH] = useState(20);

  const stageRef = useRef<any>(null);
  const transformerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shapesRef = useRef<ShapeData[]>([]);

  // Manual pan state — kept in refs so pan moves don't trigger re-renders
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const lastTouchDistRef = useRef<number | null>(null);

  // Refs that mirror state for use inside stable callbacks
  const stagePosRef = useRef(stagePos);
  const zoomRef = useRef(zoom);
  const containerSizeRef = useRef(containerSize);

  useEffect(() => { shapesRef.current = shapes; }, [shapes]);
  useEffect(() => { stagePosRef.current = stagePos; }, [stagePos]);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { containerSizeRef.current = containerSize; }, [containerSize]);

  // Container resize
  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setContainerSize({ w: width, h: height });
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  // Mobile breakpoint
  useEffect(() => {
    const handle = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handle);
    return () => window.removeEventListener("resize", handle);
  }, []);

  // Load layout + shapes + home lat/lng
  useEffect(() => {
    if (!layoutId) return;
    (async () => {
      try {
        const [{ data: lay, error: layErr }, { data: shps, error: shpErr }, { data: homeRow }] = await Promise.all([
          supabase.from("garden_layouts").select("*").eq("id", layoutId).single(),
          supabase.from("garden_shapes").select("*").eq("layout_id", layoutId).order("z_index"),
          supabase.from("homes").select("lat,lng").eq("id", homeId).maybeSingle(),
        ]);
        if (layErr) throw layErr;
        if (shpErr) throw shpErr;
        if (lay) {
          setLayout(lay);
          setSettingName(lay.name);
          setSettingW(lay.canvas_w_m);
          setSettingH(lay.canvas_h_m);
        }
        if (homeRow?.lat != null && homeRow?.lng != null) {
          setHomeLatLng({ lat: homeRow.lat, lng: homeRow.lng });
        }
        setShapes((shps ?? []).map((s: any) => ({
          ...s,
          points: s.points ?? null,
          extrude_m: s.extrude_m ?? null,
          preset_id: s.preset_id ?? null,
        })));
      } catch (err) {
        Logger.error("Failed to load layout", err);
        toast.error("Could not load layout.");
      } finally {
        setLoading(false);
      }
    })();
  }, [layoutId, homeId]);

  // Attach transformer to selected node (not for polygons)
  useEffect(() => {
    if (!transformerRef.current || !stageRef.current) return;
    const sel = shapes.find(s => s.id === selectedId);
    if (!sel || sel.shape_type === "polygon") {
      transformerRef.current.nodes([]);
      return;
    }
    const node = stageRef.current.findOne(`#${selectedId}`);
    transformerRef.current.nodes(node ? [node] : []);
  }, [selectedId, shapes]);

  // Auto-save — delete + re-insert strategy for simplicity
  const triggerSave = useCallback(() => {
    setSaveState("unsaved");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      if (!layoutId) return;
      setSaveState("saving");
      try {
        const current = shapesRef.current;
        const { error: delErr } = await supabase.from("garden_shapes").delete().eq("layout_id", layoutId);
        if (delErr) throw delErr;
        if (current.length > 0) {
          const { error: insErr } = await supabase.from("garden_shapes").insert(
            current.map((s, i) => ({
              id: s.id,
              layout_id: layoutId,
              area_id: s.area_id,
              shape_type: s.shape_type,
              label: s.label,
              color: s.color,
              x_m: s.x_m,
              y_m: s.y_m,
              width_m: s.width_m,
              height_m: s.height_m,
              radius_m: s.radius_m,
              points: s.points,
              rotation: s.rotation,
              z_index: i,
              dashed: s.dashed ?? false,
              extrude_m: s.extrude_m ?? null,
              preset_id: s.preset_id ?? null,
            }))
          );
          if (insErr) throw insErr;
        }
        setSaveState("saved");
      } catch (err) {
        Logger.error("Auto-save failed", err);
        setSaveState("unsaved");
      }
    }, 600);
  }, [layoutId]);

  const updateShape = useCallback((id: string, updates: Partial<ShapeData>) => {
    setShapes(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
    triggerSave();
  }, [triggerSave]);

  const deleteShape = useCallback((id: string) => {
    setShapes(prev => prev.filter(s => s.id !== id));
    setSelectedId(null);
    triggerSave();
  }, [triggerSave]);

  const reorder = useCallback((id: string, action: "front" | "forward" | "backward" | "back") => {
    setShapes(prev => {
      const idx = prev.findIndex(s => s.id === id);
      if (idx === -1) return prev;
      const arr = [...prev];
      if (action === "front") {
        arr.push(arr.splice(idx, 1)[0]);
      } else if (action === "forward" && idx < arr.length - 1) {
        [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
      } else if (action === "backward" && idx > 0) {
        [arr[idx], arr[idx - 1]] = [arr[idx - 1], arr[idx]];
      } else if (action === "back") {
        arr.unshift(arr.splice(idx, 1)[0]);
      }
      return arr;
    });
    triggerSave();
  }, [triggerSave]);

  const addPreset = useCallback((preset: ShapePreset) => {
    if (!layout) return;
    // Place at the centre of what the user is currently looking at
    const pos = stagePosRef.current;
    const z = zoomRef.current;
    const sz = containerSizeRef.current;
    const viewCX = (sz.w / 2 - pos.x) / (z * BASE_PX);
    const viewCY = (sz.h / 2 - pos.y) / (z * BASE_PX);
    const cx = Math.max(0, Math.min(layout.canvas_w_m, viewCX));
    const cy = Math.max(0, Math.min(layout.canvas_h_m, viewCY));
    const id = crypto.randomUUID();
    const base = { id, layout_id: layout.id, area_id: null, label: null, color: preset.color, rotation: 0, z_index: shapesRef.current.length, dashed: preset.dashed ?? false, extrude_m: preset.extrude_m, preset_id: preset.id };
    let shape: ShapeData;
    if (preset.shapeType === "circle") {
      shape = { ...base, shape_type: "circle", x_m: cx, y_m: cy, width_m: null, height_m: null, radius_m: preset.defaultR ?? 0.5, points: null };
    } else if (preset.shapeType === "ellipse") {
      shape = { ...base, shape_type: "ellipse", x_m: cx, y_m: cy, width_m: preset.defaultW ?? 2, height_m: preset.defaultH ?? 1, radius_m: null, points: null };
    } else if (preset.shapeType === "polygon") {
      shape = { ...base, shape_type: "polygon", x_m: cx, y_m: cy, width_m: null, height_m: null, radius_m: null, points: preset.defaultPoints ?? [] };
    } else {
      const w = preset.defaultW ?? 1, h = preset.defaultH ?? 1;
      shape = { ...base, shape_type: "rect", x_m: cx - w / 2, y_m: cy - h / 2, width_m: w, height_m: h, radius_m: null, points: null };
    }
    setShapes(prev => [...prev, shape]);
    setSelectedId(id);
    setTool("select");
    triggerSave();
  }, [layout, triggerSave]);

  // Zoom via scroll wheel
  const handleWheel = useCallback((e: any) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const by = 1.08;
    const old = zoom;
    const pointer = stage.getPointerPosition();
    const next = Math.max(0.1, Math.min(5, e.evt.deltaY < 0 ? old * by : old / by));
    const origin = { x: (pointer.x - stage.x()) / old, y: (pointer.y - stage.y()) / old };
    setZoom(next);
    setStagePos({ x: pointer.x - origin.x * next, y: pointer.y - origin.y * next });
  }, [zoom]);

  const adjustZoom = (delta: number) => setZoom(prev => Math.max(0.1, Math.min(5, prev + delta)));

  // Stage click — deselect or add polygon vertex
  const handleStageClick = useCallback((e: any) => {
    if (e.target !== e.target.getStage()) return;
    if (tool === "select") {
      setSelectedId(null);
    } else if (tool === "polygon") {
      const pos = stageRef.current.getRelativePointerPosition();
      setPolyPoints(prev => [...prev, { x: pos.x / BASE_PX, y: pos.y / BASE_PX }]);
    }
  }, [tool]);

  // Double-click closes polygon
  const handleStageDblClick = useCallback((e: any) => {
    if (tool !== "polygon") return;
    if (polyPoints.length < 3) {
      toast.error("Draw at least 3 points to close a polygon.");
      return;
    }
    if (!layout) return;
    const id = crypto.randomUUID();
    const newShape: ShapeData = {
      id,
      layout_id: layout.id,
      area_id: null,
      shape_type: "polygon",
      label: null,
      color: "#4ade80",
      x_m: 0,
      y_m: 0,
      width_m: null,
      height_m: null,
      radius_m: null,
      // Remove duplicate last point added by the second click of the dblclick
      points: polyPoints.slice(0, -1),
      rotation: 0,
      z_index: shapesRef.current.length,
      dashed: false,
      extrude_m: 0.3,
      preset_id: null,
    };
    setShapes(prev => [...prev, newShape]);
    setSelectedId(id);
    setPolyPoints([]);
    setPointerPos(null);
    setTool("select");
    triggerSave();
  }, [tool, polyPoints, layout, triggerSave]);

  // Manual pan — mousedown on bare stage background starts it
  const handleStageMouseDown = useCallback((e: any) => {
    if (e.target !== e.target.getStage()) return;
    if (tool === "polygon") return;
    isPanningRef.current = true;
    panStartRef.current = { x: e.evt.clientX, y: e.evt.clientY };
  }, [tool]);

  const handleStageMouseMove = useCallback((e: any) => {
    if (isPanningRef.current) {
      const dx = e.evt.clientX - panStartRef.current.x;
      const dy = e.evt.clientY - panStartRef.current.y;
      panStartRef.current = { x: e.evt.clientX, y: e.evt.clientY };
      setStagePos(prev => ({ x: prev.x + dx, y: prev.y + dy }));
    }
    if (tool === "polygon") {
      const pos = stageRef.current?.getRelativePointerPosition();
      if (pos) setPointerPos({ x: pos.x / BASE_PX, y: pos.y / BASE_PX });
    }
  }, [tool]);

  const handleStageMouseUp = useCallback(() => {
    isPanningRef.current = false;
  }, []);

  // Touch: single finger = pan, two fingers = pinch-zoom
  const handleTouchStart = useCallback((e: any) => {
    const touches = e.evt.touches;
    if (touches.length === 1 && tool !== "polygon") {
      isPanningRef.current = true;
      panStartRef.current = { x: touches[0].clientX, y: touches[0].clientY };
    }
    if (touches.length === 2) {
      isPanningRef.current = false;
      lastTouchDistRef.current = Math.hypot(
        touches[0].clientX - touches[1].clientX,
        touches[0].clientY - touches[1].clientY
      );
    }
  }, [tool]);

  const handleTouchMove = useCallback((e: any) => {
    e.evt.preventDefault();
    const touches = e.evt.touches;
    if (touches.length === 1 && isPanningRef.current) {
      const dx = touches[0].clientX - panStartRef.current.x;
      const dy = touches[0].clientY - panStartRef.current.y;
      panStartRef.current = { x: touches[0].clientX, y: touches[0].clientY };
      setStagePos(prev => ({ x: prev.x + dx, y: prev.y + dy }));
    }
    if (touches.length === 2 && lastTouchDistRef.current !== null) {
      const dist = Math.hypot(
        touches[0].clientX - touches[1].clientX,
        touches[0].clientY - touches[1].clientY
      );
      const scale = dist / lastTouchDistRef.current;
      lastTouchDistRef.current = dist;
      setZoom(prev => Math.max(0.1, Math.min(5, prev * scale)));
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    isPanningRef.current = false;
    lastTouchDistRef.current = null;
  }, []);

  const saveSettings = async () => {
    if (!layoutId || !layout) return;
    try {
      const { error } = await supabase.from("garden_layouts").update({
        name: settingName.trim() || layout.name,
        canvas_w_m: settingW,
        canvas_h_m: settingH,
        updated_at: new Date().toISOString(),
      }).eq("id", layoutId);
      if (error) throw error;
      setLayout(l => l ? { ...l, name: settingName.trim() || l.name, canvas_w_m: settingW, canvas_h_m: settingH } : l);
      setShowSettings(false);
    } catch (err) {
      Logger.error("Failed to save canvas settings", err);
      toast.error("Could not save settings.");
    }
  };

  // Shape renderer
  const renderShape = (shape: ShapeData) => {
    const isSel = shape.id === selectedId;
    const shapeClick = (e: any) => { e.cancelBubble = true; setSelectedId(shape.id); };

    const onTransformEnd = (e: any) => {
      const node = e.target;
      const sx = node.scaleX(), sy = node.scaleY();
      node.scaleX(1);
      node.scaleY(1);
      if (shape.shape_type === "circle") {
        const r = Math.max(0.05, (shape.radius_m ?? 0.5) * Math.max(sx, sy));
        node.radius(r * BASE_PX);
        updateShape(shape.id, { radius_m: r, rotation: node.rotation(), x_m: node.x() / BASE_PX, y_m: node.y() / BASE_PX });
      } else if (shape.shape_type === "ellipse") {
        const rx = Math.max(0.05, (shape.width_m ?? 2) / 2 * sx);
        const ry = Math.max(0.05, (shape.height_m ?? 1) / 2 * sy);
        node.radiusX(rx * BASE_PX);
        node.radiusY(ry * BASE_PX);
        updateShape(shape.id, { width_m: rx * 2, height_m: ry * 2, rotation: node.rotation(), x_m: node.x() / BASE_PX, y_m: node.y() / BASE_PX });
      } else {
        const w = Math.max(0.1, (shape.width_m ?? 1) * sx);
        const h = Math.max(0.1, (shape.height_m ?? 1) * sy);
        node.width(w * BASE_PX);
        node.height(h * BASE_PX);
        updateShape(shape.id, { width_m: w, height_m: h, rotation: node.rotation(), x_m: node.x() / BASE_PX, y_m: node.y() / BASE_PX });
      }
    };

    const sharedDrag = {
      draggable: tool === "select",
      onDragEnd: (e: any) => updateShape(shape.id, { x_m: e.target.x() / BASE_PX, y_m: e.target.y() / BASE_PX }),
      onTransformEnd,
    };

    // Dashed shapes (boundaries, canopies) get a very light fill so interior remains visible
    const fill = shape.dashed ? shape.color + "22" : shape.color + "bb";
    const stroke = shape.color;
    const sw = isSel ? 2.5 : 1.5;
    const dashProp = shape.dashed ? [8, 5] : undefined;

    let node: React.ReactNode = null;
    let labelX = 0, labelY = 0;

    if (shape.shape_type === "rect" || shape.shape_type === "path") {
      const w = (shape.width_m ?? 1) * BASE_PX, h = (shape.height_m ?? 1) * BASE_PX;
      labelX = shape.x_m * BASE_PX + w / 2;
      labelY = shape.y_m * BASE_PX + h / 2;
      node = (
        <Rect
          id={shape.id}
          x={shape.x_m * BASE_PX}
          y={shape.y_m * BASE_PX}
          width={w}
          height={h}
          fill={fill}
          stroke={stroke}
          strokeWidth={sw}
          rotation={shape.rotation}
          cornerRadius={3}
          dash={dashProp}
          onClick={shapeClick}
          onTap={shapeClick}
          {...sharedDrag}
        />
      );
    } else if (shape.shape_type === "circle") {
      const r = (shape.radius_m ?? 0.5) * BASE_PX;
      labelX = shape.x_m * BASE_PX;
      labelY = shape.y_m * BASE_PX;
      node = (
        <Circle
          id={shape.id}
          x={shape.x_m * BASE_PX}
          y={shape.y_m * BASE_PX}
          radius={r}
          fill={fill}
          stroke={stroke}
          strokeWidth={sw}
          rotation={shape.rotation}
          dash={dashProp}
          onClick={shapeClick}
          onTap={shapeClick}
          {...sharedDrag}
        />
      );
    } else if (shape.shape_type === "ellipse") {
      const rx = (shape.width_m ?? 2) / 2 * BASE_PX;
      const ry = (shape.height_m ?? 1) / 2 * BASE_PX;
      labelX = shape.x_m * BASE_PX;
      labelY = shape.y_m * BASE_PX;
      node = (
        <Ellipse
          id={shape.id}
          x={shape.x_m * BASE_PX}
          y={shape.y_m * BASE_PX}
          radiusX={rx}
          radiusY={ry}
          fill={fill}
          stroke={stroke}
          strokeWidth={sw}
          rotation={shape.rotation}
          dash={dashProp}
          onClick={shapeClick}
          onTap={shapeClick}
          {...sharedDrag}
        />
      );
    } else if (shape.shape_type === "polygon") {
      const pts = (shape.points ?? []).flatMap(p => [
        (shape.x_m + p.x) * BASE_PX,
        (shape.y_m + p.y) * BASE_PX,
      ]);
      if (pts.length < 4) return null;
      node = (
        <Line
          id={shape.id}
          x={0}
          y={0}
          points={pts}
          closed
          fill={fill}
          stroke={stroke}
          strokeWidth={sw}
          rotation={shape.rotation}
          dash={dashProp}
          draggable={tool === "select"}
          onClick={shapeClick}
          onTap={shapeClick}
          onDragEnd={(e: any) => {
            const dx = e.target.x() / BASE_PX;
            const dy = e.target.y() / BASE_PX;
            e.target.x(0);
            e.target.y(0);
            updateShape(shape.id, {
              points: (shape.points ?? []).map(p => ({ x: p.x + dx, y: p.y + dy })),
            });
          }}
        />
      );
      // centroid label for polygon
      if (shape.points && shape.points.length > 0) {
        const cx = shape.points.reduce((s, p) => s + p.x, 0) / shape.points.length;
        const cy = shape.points.reduce((s, p) => s + p.y, 0) / shape.points.length;
        labelX = (shape.x_m + cx) * BASE_PX;
        labelY = (shape.y_m + cy) * BASE_PX;
      }
    }

    if (!node) return null;

    return (
      <React.Fragment key={shape.id}>
        {node}
        {shape.label && (
          <Text
            x={labelX}
            y={labelY - 6}
            text={shape.label}
            fontSize={11}
            fontStyle="bold"
            fill="rgba(0,0,0,0.7)"
            align="center"
            offsetX={shape.label.length * 3.2}
            listening={false}
          />
        )}
      </React.Fragment>
    );
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-rhozly-primary" />
      </div>
    );
  }

  if (!layout) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="font-bold text-rhozly-on-surface/50">Layout not found.</p>
      </div>
    );
  }

  const selectedShape = shapes.find(s => s.id === selectedId) ?? null;

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-white border-b border-rhozly-outline/20 shrink-0">
        <button
          data-testid="back-to-layouts-btn"
          onClick={() => navigate("/garden-layout")}
          className="p-2 rounded-xl text-rhozly-on-surface/50 hover:text-rhozly-on-surface hover:bg-rhozly-surface transition-colors"
        >
          <ArrowLeft size={18} />
        </button>

        <div className="flex-1 min-w-0">
          <p className="font-black text-rhozly-on-surface text-sm truncate">{layout.name}</p>
          <p className="text-[10px] font-bold text-rhozly-on-surface/40">{layout.canvas_w_m}m × {layout.canvas_h_m}m</p>
        </div>

        {/* Save state indicator */}
        <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest shrink-0">
          {saveState === "saving" && (
            <><Loader2 size={12} className="animate-spin text-rhozly-on-surface/40" /><span className="text-rhozly-on-surface/40 hidden sm:inline">Saving…</span></>
          )}
          {saveState === "saved" && (
            <><CheckCircle2 size={12} className="text-emerald-500" /><span className="text-emerald-500 hidden sm:inline">Saved</span></>
          )}
          {saveState === "unsaved" && (
            <span className="text-amber-500">Unsaved</span>
          )}
        </div>

        {/* 2D / 3D pill toggle */}
        <div className="flex items-center gap-0.5 bg-rhozly-surface rounded-xl p-0.5">
          <button
            data-testid="view-2d-btn"
            onClick={() => setViewMode("2d")}
            className={`px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors ${viewMode === "2d" ? "bg-white text-rhozly-on-surface shadow-sm" : "text-rhozly-on-surface/50"}`}
          >
            2D
          </button>
          <button
            data-testid="view-3d-btn"
            onClick={() => setViewMode("3d")}
            className={`px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors ${viewMode === "3d" ? "bg-white text-rhozly-on-surface shadow-sm" : "text-rhozly-on-surface/50"}`}
          >
            3D
          </button>
        </div>

        {/* Zoom controls (2D only) */}
        {viewMode === "2d" && (
          <div className="flex items-center gap-0.5">
            <button
              data-testid="zoom-out-btn"
              onClick={() => adjustZoom(-0.15)}
              className="p-1.5 rounded-lg text-rhozly-on-surface/50 hover:bg-rhozly-surface hover:text-rhozly-on-surface transition-colors"
            >
              <ZoomOut size={16} />
            </button>
            <button
              data-testid="zoom-in-btn"
              onClick={() => adjustZoom(0.15)}
              className="p-1.5 rounded-lg text-rhozly-on-surface/50 hover:bg-rhozly-surface hover:text-rhozly-on-surface transition-colors"
            >
              <ZoomIn size={16} />
            </button>
          </div>
        )}

        {/* Canvas settings */}
        <button
          data-testid="canvas-settings-btn"
          onClick={() => setShowSettings(true)}
          className="p-1.5 rounded-xl text-rhozly-on-surface/50 hover:bg-rhozly-surface hover:text-rhozly-on-surface transition-colors"
        >
          <Settings size={16} />
        </button>
      </div>

      {/* Editor body */}
      <div className={`flex-1 flex overflow-hidden ${isMobile ? "flex-col" : "flex-row"}`}>
        {/* Desktop: shape panel on left */}
        {!isMobile && (
          <GardenShapePanel
            tool={tool}
            viewMode={viewMode}
            onAddPreset={addPreset}
            onStartPolygon={() => { setTool("polygon"); setPolyPoints([]); setSelectedId(null); }}
            isMobile={false}
          />
        )}

        {/* Canvas */}
        <div ref={containerRef} className="flex-1 relative overflow-hidden bg-rhozly-bg">
          {/* 3D view */}
          {viewMode === "3d" && (
            <GardenLayout3D
              shapes={shapes}
              selectedId={selectedId}
              canvasW={layout.canvas_w_m}
              canvasH={layout.canvas_h_m}
              containerW={containerSize.w}
              containerH={containerSize.h}
              homeLatLng={homeLatLng}
              onSelect={setSelectedId}
              onShapeChange={updateShape}
            />
          )}

          {/* 2D Konva stage */}
          {viewMode === "2d" && <Stage
            ref={stageRef}
            width={containerSize.w}
            height={containerSize.h}
            scaleX={zoom}
            scaleY={zoom}
            x={stagePos.x}
            y={stagePos.y}
            onWheel={handleWheel}
            onClick={handleStageClick}
            onTap={handleStageClick}
            onDblClick={handleStageDblClick}
            onDblTap={handleStageDblClick}
            onMouseDown={handleStageMouseDown}
            onMouseMove={handleStageMouseMove}
            onMouseUp={handleStageMouseUp}
            onMouseLeave={handleStageMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={{ cursor: tool === "polygon" ? "crosshair" : "grab" }}
          >
            <GardenRuler
              canvasWm={layout.canvas_w_m}
              canvasHm={layout.canvas_h_m}
              pxPerM={BASE_PX}
              offsetX={0}
              offsetY={0}
            />

            <Layer>
              {shapes.map(renderShape)}

              {/* In-progress polygon preview */}
              {tool === "polygon" && polyPoints.length > 0 && (() => {
                const preview = [
                  ...polyPoints.flatMap(p => [p.x * BASE_PX, p.y * BASE_PX]),
                  ...(pointerPos ? [pointerPos.x * BASE_PX, pointerPos.y * BASE_PX] : []),
                ];
                return (
                  <>
                    <Line points={preview} stroke="#4ade80" strokeWidth={1.5} dash={[5, 3]} listening={false} />
                    {polyPoints.map((p, i) => (
                      <Circle
                        key={`pv-${i}`}
                        x={p.x * BASE_PX}
                        y={p.y * BASE_PX}
                        radius={4}
                        fill={i === 0 ? "#22c55e" : "#fff"}
                        stroke="#4ade80"
                        strokeWidth={1.5}
                        listening={false}
                      />
                    ))}
                  </>
                );
              })()}

              <Transformer
                ref={transformerRef}
                keepRatio={false}
                rotateEnabled
                rotateAnchorOffset={24}
                rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
                anchorSize={10}
                anchorCornerRadius={2}
                anchorFill="#fff"
                anchorStroke="#3b82f6"
                anchorStrokeWidth={1.5}
                borderStroke="#3b82f6"
                borderStrokeWidth={1.5}
                borderDash={[4, 3]}
                boundBoxFunc={(oldBox: any, newBox: any) =>
                  newBox.width < 5 || newBox.height < 5 ? oldBox : newBox
                }
              />
            </Layer>
          </Stage>}

          {/* Scale bar + polygon instructions — 2D only */}
          {viewMode === "2d" && <GardenScaleBar pxPerM={BASE_PX * zoom} zoom={zoom} />}

          {viewMode === "2d" && tool === "polygon" && (
            <>
              <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-sm rounded-xl px-4 py-2 border border-rhozly-outline/20 shadow-sm pointer-events-none">
                <p className="text-xs font-black text-rhozly-on-surface/70">
                  {polyPoints.length === 0
                    ? "Click to start drawing"
                    : `${polyPoints.length} vertices — double-click to close`}
                </p>
              </div>
              <button
                onClick={() => { setTool("select"); setPolyPoints([]); setPointerPos(null); }}
                className="absolute top-4 right-4 p-2 rounded-xl bg-white border border-rhozly-outline/20 shadow-sm text-rhozly-on-surface/50 hover:text-rhozly-on-surface transition-colors"
              >
                <X size={16} />
              </button>
            </>
          )}
        </div>

        {/* Desktop: properties panel on right (when shape selected) */}
        {!isMobile && selectedShape && (
          <GardenShapeProperties
            shape={selectedShape}
            homeId={homeId}
            onChange={updates => updateShape(selectedShape.id, updates)}
            onDelete={() => deleteShape(selectedShape.id)}
            onClose={() => setSelectedId(null)}
            onBringToFront={() => reorder(selectedShape.id, "front")}
            onBringForward={() => reorder(selectedShape.id, "forward")}
            onSendBackward={() => reorder(selectedShape.id, "backward")}
            onSendToBack={() => reorder(selectedShape.id, "back")}
          />
        )}
      </div>

      {/* Mobile: shape panel at bottom */}
      {isMobile && (
        <GardenShapePanel
          tool={tool}
          viewMode={viewMode}
          onAddPreset={addPreset}
          onStartPolygon={() => { setTool("polygon"); setPolyPoints([]); setSelectedId(null); }}
          isMobile
        />
      )}

      {/* Mobile: properties sheet when shape selected */}
      {isMobile && selectedShape && (
        <div className="fixed inset-x-0 bottom-0 z-50 bg-white border-t border-rhozly-outline/20 max-h-[55vh] overflow-y-auto shadow-2xl">
          <GardenShapeProperties
            shape={selectedShape}
            homeId={homeId}
            onChange={updates => updateShape(selectedShape.id, updates)}
            onDelete={() => deleteShape(selectedShape.id)}
            onClose={() => setSelectedId(null)}
            onBringToFront={() => reorder(selectedShape.id, "front")}
            onBringForward={() => reorder(selectedShape.id, "forward")}
            onSendBackward={() => reorder(selectedShape.id, "backward")}
            onSendToBack={() => reorder(selectedShape.id, "back")}
          />
        </div>
      )}

      {/* Canvas settings modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <p className="font-black text-rhozly-on-surface">Canvas Settings</p>
              <button onClick={() => setShowSettings(false)} className="p-1.5 rounded-lg text-rhozly-on-surface/40 hover:text-rhozly-on-surface">
                <X size={16} />
              </button>
            </div>

            <div>
              <p className="text-[10px] font-black text-rhozly-on-surface/40 uppercase tracking-widest mb-1">Layout Name</p>
              <input
                data-testid="layout-name-input"
                type="text"
                value={settingName}
                onChange={e => setSettingName(e.target.value)}
                className="w-full bg-rhozly-bg rounded-xl px-3 py-2.5 text-sm font-bold text-rhozly-on-surface border border-rhozly-outline/20 outline-none focus:border-rhozly-primary"
              />
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <p className="text-[10px] font-black text-rhozly-on-surface/40 uppercase tracking-widest mb-1">Width (m)</p>
                <input
                  data-testid="canvas-width-input"
                  type="number"
                  min="1"
                  step="1"
                  value={settingW}
                  onChange={e => setSettingW(parseFloat(e.target.value) || 30)}
                  className="w-full bg-rhozly-bg rounded-xl px-3 py-2.5 text-sm font-bold text-rhozly-on-surface border border-rhozly-outline/20 outline-none focus:border-rhozly-primary"
                />
              </div>
              <div className="flex-1">
                <p className="text-[10px] font-black text-rhozly-on-surface/40 uppercase tracking-widest mb-1">Height (m)</p>
                <input
                  data-testid="canvas-height-input"
                  type="number"
                  min="1"
                  step="1"
                  value={settingH}
                  onChange={e => setSettingH(parseFloat(e.target.value) || 20)}
                  className="w-full bg-rhozly-bg rounded-xl px-3 py-2.5 text-sm font-bold text-rhozly-on-surface border border-rhozly-outline/20 outline-none focus:border-rhozly-primary"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setShowSettings(false)}
                className="flex-1 py-3 rounded-2xl border border-rhozly-outline/20 text-sm font-black text-rhozly-on-surface/60"
              >
                Cancel
              </button>
              <button
                data-testid="save-settings-btn"
                onClick={saveSettings}
                className="flex-1 py-3 rounded-2xl bg-rhozly-primary text-white text-sm font-black"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
