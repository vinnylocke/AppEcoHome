import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Pencil, Trash2, ChevronRight, Loader2, Wand2, SquareDashed, ArrowLeft, Sprout, Copy, MoreVertical, PenLine } from "lucide-react";
import { IconLayout } from "../constants/icons";
import { supabase } from "../lib/supabase";
import { Logger } from "../lib/errorHandler";
import { readSnapshot, writeSnapshot } from "../lib/snapshotCache";
import toast from "react-hot-toast";
import FeatureGate from "./shared/FeatureGate";
import SketchToLayoutWizard from "./SketchToLayoutWizard";

interface Layout {
  id: string;
  name: string;
  canvas_w_m: number;
  canvas_h_m: number;
  created_at: string;
  updated_at: string;
}

interface Props {
  homeId: string;
}

type GardenShape = "rect" | "square" | "l-shape" | "t-shape" | "trapezoid";
type BorderStyle = "none" | "fence" | "hedge" | "wall";
type EdgeConfig = { style: BorderStyle; height: number };

// SVG viewBox is 200×150 for all shapes
interface EdgeDef {
  id: string;
  label: string;
  x1: number; y1: number; x2: number; y2: number;
  lx: number; ly: number; anchor: "start" | "middle" | "end";
}

const RECT_EDGES: EdgeDef[] = [
  { id: "top",    label: "Top",    x1: 15,  y1: 20,  x2: 185, y2: 20,  lx: 100, ly: 12,  anchor: "middle" },
  { id: "right",  label: "Right",  x1: 185, y1: 20,  x2: 185, y2: 130, lx: 194, ly: 78,  anchor: "start"  },
  { id: "bottom", label: "Bottom", x1: 185, y1: 130, x2: 15,  y2: 130, lx: 100, ly: 144, anchor: "middle" },
  { id: "left",   label: "Left",   x1: 15,  y1: 130, x2: 15,  y2: 20,  lx: 6,   ly: 78,  anchor: "end"    },
];

// L-shape: polygon 15,15 185,15 185,55 71,55 71,135 15,135
// inner step is ~1/3 of full width/height
const L_EDGES: EdgeDef[] = [
  { id: "top",         label: "Top",        x1: 15,  y1: 15,  x2: 185, y2: 15,  lx: 100, ly: 7,   anchor: "middle" },
  { id: "right-outer", label: "Right",      x1: 185, y1: 15,  x2: 185, y2: 55,  lx: 194, ly: 37,  anchor: "start"  },
  { id: "inner-horiz", label: "Inner top",  x1: 185, y1: 55,  x2: 71,  y2: 55,  lx: 128, ly: 46,  anchor: "middle" },
  { id: "inner-vert",  label: "Inner side", x1: 71,  y1: 55,  x2: 71,  y2: 135, lx: 80,  ly: 97,  anchor: "start"  },
  { id: "bottom",      label: "Bottom",     x1: 71,  y1: 135, x2: 15,  y2: 135, lx: 43,  ly: 148, anchor: "middle" },
  { id: "left",        label: "Left",       x1: 15,  y1: 135, x2: 15,  y2: 15,  lx: 6,   ly: 75,  anchor: "end"    },
];

function getEdgeDefs(shape: GardenShape): EdgeDef[] {
  return shape === "l-shape" ? L_EDGES : RECT_EDGES;
}

function getShapePoints(shape: GardenShape): string {
  switch (shape) {
    case "l-shape":   return "15,15 185,15 185,55 71,55 71,135 15,135";
    case "t-shape":   return "15,15 185,15 185,55 121,55 121,135 75,135 75,55 15,55";
    case "trapezoid": return "55,15 145,15 185,135 15,135";
    default:          return "15,20 185,20 185,130 15,130";
  }
}

function edgeToRectGeom(
  edgeId: string,
  shape: GardenShape,
  gW: number, gH: number,
  ox: number, oy: number,
  t: number,
): { x_m: number; y_m: number; width_m: number; height_m: number } | null {
  if (shape === "rect" || shape === "square") {
    const map: Record<string, { x_m: number; y_m: number; width_m: number; height_m: number }> = {
      top:    { x_m: ox,        y_m: oy,        width_m: gW, height_m: t  },
      right:  { x_m: ox+gW-t,  y_m: oy,        width_m: t,  height_m: gH },
      bottom: { x_m: ox,        y_m: oy+gH-t,  width_m: gW, height_m: t  },
      left:   { x_m: ox,        y_m: oy,        width_m: t,  height_m: gH },
    };
    return map[edgeId] ?? null;
  }
  if (shape === "l-shape") {
    const sc = Math.min(gW / 3, gH / 3);
    const map: Record<string, { x_m: number; y_m: number; width_m: number; height_m: number }> = {
      "top":          { x_m: ox,        y_m: oy,       width_m: gW,    height_m: t     },
      "right-outer":  { x_m: ox+gW-t,  y_m: oy,       width_m: t,     height_m: sc    },
      "inner-horiz":  { x_m: ox+sc,    y_m: oy+sc,    width_m: gW-sc, height_m: t     },
      "inner-vert":   { x_m: ox+sc,    y_m: oy+sc,    width_m: t,     height_m: gH-sc },
      "bottom":       { x_m: ox,        y_m: oy+gH-t, width_m: sc,    height_m: t     },
      "left":         { x_m: ox,        y_m: oy,       width_m: t,     height_m: gH    },
    };
    return map[edgeId] ?? null;
  }
  return null;
}

const BORDER_META: Record<Exclude<BorderStyle, "none">, {
  color: string; preset_id: string | null; thickness: number; label: string; svgColor: string;
}> = {
  fence: { color: "#a16207", preset_id: "fence-panel", thickness: 0.15, label: "Fence", svgColor: "#b45309" },
  hedge: { color: "#16a34a", preset_id: null,          thickness: 0.5,  label: "Hedge", svgColor: "#16a34a" },
  wall:  { color: "#78716c", preset_id: "wall",         thickness: 0.2,  label: "Wall",  svgColor: "#57534e" },
};

const DEFAULT_EDGE_CONFIG: EdgeConfig = { style: "none", height: 1.2 };

function StylePill({ active, onClick, label, color }: { active: boolean; onClick: () => void; label: string; color?: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-xl text-[11px] font-black transition-colors ${
        active ? "text-white" : "bg-rhozly-surface text-rhozly-on-surface/60 hover:bg-rhozly-surface-low"
      }`}
      style={active && color ? { backgroundColor: color } : active ? {} : {}}
    >
      {label}
    </button>
  );
}

export default function GardenLayoutList(props: Props) {
  return (
    <FeatureGate feature="garden_layout">
      <GardenLayoutListInner {...props} />
    </FeatureGate>
  );
}

function GardenLayoutListInner({ homeId }: Props) {
  const navigate = useNavigate();
  const [layouts, setLayouts] = useState<Layout[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  // Mobile card actions live behind a kebab — at 390px four inline 44px icon
  // buttons left ~50px for the title, so card taps landed on Rename.
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [showSketch, setShowSketch] = useState(false);

  // Wizard — defaults to a beginner-friendly 4×3 m "Starter Garden" (Wave 4D)
  const [wizardMode, setWizardMode] = useState<null | "choice" | "scratch" | "builder" | "starter">(null);
  const [builderStep, setBuilderStep] = useState<1 | 2 | 3>(1);
  const [bName, setBName] = useState("");
  const [bShape, setBShape] = useState<GardenShape>("rect");
  const [bWidth, setBWidth] = useState(4);
  const [bLength, setBLength] = useState(3);
  const [borders, setBorders] = useState<Record<string, EdgeConfig>>({});
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  useEffect(() => { fetchLayouts(); }, [homeId]);

  const fetchLayouts = async () => {
    // Offline-first Phase 2: paint the cached layout list instantly.
    const cached = homeId ? readSnapshot<Layout[]>("layouts", homeId) : null;
    if (cached) {
      setLayouts(cached.data);
      setLoading(false);
    }
    try {
      const { data, error } = await supabase
        .from("garden_layouts")
        .select("*")
        .eq("home_id", homeId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setLayouts(data ?? []);
      if (homeId) writeSnapshot("layouts", homeId, (data ?? []) as Layout[]);
    } catch (err) {
      Logger.error("Failed to fetch garden layouts", err);
      if (!cached) toast.error("Could not load layouts."); // keep cache offline
    } finally {
      setLoading(false);
    }
  };

  const closeWizard = () => {
    setWizardMode(null);
    setBuilderStep(1);
    setBName("");
    setBShape("rect");
    setBWidth(4);
    setBLength(3);
    setBorders({});
    setSelectedEdgeId(null);
  };

  // Pre-baked starter layouts (Wave 12E) — each returns the canvas size + list of shapes.
  const STARTER_TEMPLATES: {
    id: string;
    label: string;
    description: string;
    canvasW: number;
    canvasH: number;
    shapes: Array<Omit<any, "layout_id">>;
  }[] = [
    {
      id: "allotment",
      label: "Allotment Plot",
      description: "10 × 5 m plot with 4 raised beds, a path, and a shed.",
      canvasW: 14, canvasH: 9,
      shapes: [
        { shape_type: "rect", preset_id: "garden-boundary", label: "Allotment", color: "#92400e",
          x_m: 2, y_m: 2, width_m: 10, height_m: 5, rotation: 0, z_index: 0, dashed: true, extrude_m: 0 },
        { shape_type: "rect", preset_id: "raised-bed", label: "Bed 1", color: "#4ade80",
          x_m: 3,    y_m: 3,   width_m: 2.5, height_m: 1, rotation: 0, z_index: 1, dashed: false, extrude_m: 0.3 },
        { shape_type: "rect", preset_id: "raised-bed", label: "Bed 2", color: "#4ade80",
          x_m: 6.5,  y_m: 3,   width_m: 2.5, height_m: 1, rotation: 0, z_index: 2, dashed: false, extrude_m: 0.3 },
        { shape_type: "rect", preset_id: "raised-bed", label: "Bed 3", color: "#4ade80",
          x_m: 3,    y_m: 5.5, width_m: 2.5, height_m: 1, rotation: 0, z_index: 3, dashed: false, extrude_m: 0.3 },
        { shape_type: "rect", preset_id: "raised-bed", label: "Bed 4", color: "#4ade80",
          x_m: 6.5,  y_m: 5.5, width_m: 2.5, height_m: 1, rotation: 0, z_index: 4, dashed: false, extrude_m: 0.3 },
        { shape_type: "rect", preset_id: "path",       label: "Main Path", color: "#d6d3d1",
          x_m: 3,    y_m: 4.3, width_m: 6,   height_m: 0.7, rotation: 0, z_index: 5, dashed: false, extrude_m: 0.02 },
        { shape_type: "rect", preset_id: "shed",       label: "Shed", color: "#a8a29e",
          x_m: 9.5,  y_m: 5.5, width_m: 2,   height_m: 1.5, rotation: 0, z_index: 6, dashed: false, extrude_m: 2.5 },
      ],
    },
    {
      id: "front-border",
      label: "Front Border",
      description: "8 × 2 m strip with a hedge and a planted border along the path.",
      canvasW: 12, canvasH: 5,
      shapes: [
        { shape_type: "rect", preset_id: "garden-boundary", label: "Front Border", color: "#92400e",
          x_m: 2, y_m: 1, width_m: 8, height_m: 3, rotation: 0, z_index: 0, dashed: true, extrude_m: 0 },
        { shape_type: "rect", preset_id: "fence-panel", label: "Hedge", color: "#16a34a",
          x_m: 2, y_m: 1, width_m: 8, height_m: 0.4, rotation: 0, z_index: 1, dashed: false, extrude_m: 1.2 },
        { shape_type: "rect", preset_id: "raised-bed", label: "Planting strip", color: "#4ade80",
          x_m: 2, y_m: 1.5, width_m: 8, height_m: 1.5, rotation: 0, z_index: 2, dashed: false, extrude_m: 0.3 },
        { shape_type: "rect", preset_id: "path",       label: "Path", color: "#d6d3d1",
          x_m: 2, y_m: 3.2, width_m: 8, height_m: 0.8, rotation: 0, z_index: 3, dashed: false, extrude_m: 0.02 },
      ],
    },
    {
      id: "container",
      label: "Container Terrace",
      description: "3 × 3 m terrace with 6 pots and a small water feature.",
      canvasW: 6, canvasH: 6,
      shapes: [
        { shape_type: "rect", preset_id: "garden-boundary", label: "Terrace", color: "#92400e",
          x_m: 1.5, y_m: 1.5, width_m: 3, height_m: 3, rotation: 0, z_index: 0, dashed: true, extrude_m: 0 },
        { shape_type: "circle", preset_id: "round-planter", label: "Pot 1", color: "#86efac",
          x_m: 2.0, y_m: 2.0, radius_m: 0.35, rotation: 0, z_index: 1, dashed: false, extrude_m: 0.3 },
        { shape_type: "circle", preset_id: "round-planter", label: "Pot 2", color: "#86efac",
          x_m: 3.0, y_m: 2.0, radius_m: 0.35, rotation: 0, z_index: 2, dashed: false, extrude_m: 0.3 },
        { shape_type: "circle", preset_id: "round-planter", label: "Pot 3", color: "#86efac",
          x_m: 4.0, y_m: 2.0, radius_m: 0.35, rotation: 0, z_index: 3, dashed: false, extrude_m: 0.3 },
        { shape_type: "rect",   preset_id: "planter-box",   label: "Box 4", color: "#a3e635",
          x_m: 1.8, y_m: 3.5, width_m: 0.6, height_m: 0.6, rotation: 0, z_index: 4, dashed: false, extrude_m: 0.3 },
        { shape_type: "rect",   preset_id: "planter-box",   label: "Box 5", color: "#a3e635",
          x_m: 2.7, y_m: 3.5, width_m: 0.6, height_m: 0.6, rotation: 0, z_index: 5, dashed: false, extrude_m: 0.3 },
        { shape_type: "circle", preset_id: "pond",          label: "Water feature", color: "#7dd3fc",
          x_m: 4.0, y_m: 3.7, radius_m: 0.4, rotation: 0, z_index: 6, dashed: false, extrude_m: 0 },
      ],
    },
  ];

  const handleCreateStarter = async (template: typeof STARTER_TEMPLATES[number]) => {
    setCreating(true);
    try {
      const { data: layout, error: layoutErr } = await supabase
        .from("garden_layouts")
        .insert({ home_id: homeId, name: template.label, canvas_w_m: template.canvasW, canvas_h_m: template.canvasH })
        .select()
        .single();
      if (layoutErr) throw layoutErr;
      const inserts = template.shapes.map((s) => ({ ...s, layout_id: layout.id }));
      const { error: shapesErr } = await supabase.from("garden_shapes").insert(inserts);
      if (shapesErr) throw shapesErr;
      closeWizard();
      navigate(`/garden-layout/${layout.id}`);
    } catch (err) {
      Logger.error("Failed to create starter layout", err);
      toast.error("Could not create starter layout.");
    } finally {
      setCreating(false);
    }
  };

  const handleCreateScratch = async () => {
    const name = bName.trim() || "New Layout";
    setCreating(true);
    try {
      const { data, error } = await supabase
        .from("garden_layouts")
        .insert({ home_id: homeId, name })
        .select()
        .single();
      if (error) throw error;
      closeWizard();
      navigate(`/garden-layout/${data.id}`);
    } catch (err) {
      Logger.error("Failed to create layout", err);
      toast.error("Could not create layout.");
    } finally {
      setCreating(false);
    }
  };

  const handleBuilderFinish = async () => {
    const name = bName.trim() || "New Layout";
    const gW = bShape === "square" ? Math.max(bWidth, bLength) : bWidth;
    const gH = bShape === "square" ? Math.max(bWidth, bLength) : bLength;
    const padding = 4;
    const canvasW = Math.max(20, gW + padding * 2);
    const canvasH = Math.max(15, gH + padding * 2);
    const ox = (canvasW - gW) / 2;
    const oy = (canvasH - gH) / 2;

    setCreating(true);
    try {
      const { data: layout, error: layoutErr } = await supabase
        .from("garden_layouts")
        .insert({ home_id: homeId, name, canvas_w_m: canvasW, canvas_h_m: canvasH })
        .select()
        .single();
      if (layoutErr) throw layoutErr;

      const shapesToInsert: object[] = [];

      // Garden boundary
      const polyBase = {
        layout_id: layout.id,
        shape_type: "polygon",
        preset_id: "garden-boundary",
        label: "Garden Boundary",
        color: "#92400e",
        x_m: 0, y_m: 0,
        width_m: null, height_m: null, radius_m: null,
        rotation: 0, z_index: 0, dashed: true, extrude_m: 0,
      } as const;

      if (bShape === "l-shape") {
        const sc = Math.min(gW / 3, gH / 3);
        shapesToInsert.push({
          ...polyBase,
          points: [
            { x: ox,        y: oy },
            { x: ox + gW,   y: oy },
            { x: ox + gW,   y: oy + sc },
            { x: ox + sc,   y: oy + sc },
            { x: ox + sc,   y: oy + gH },
            { x: ox,        y: oy + gH },
          ],
        });
      } else if (bShape === "t-shape") {
        // Top horizontal bar (gW × bar height) + stem coming down from centre
        const barH = gH / 3;
        const stemW = gW / 3;
        const stemX = ox + (gW - stemW) / 2;
        shapesToInsert.push({
          ...polyBase,
          points: [
            { x: ox,            y: oy },
            { x: ox + gW,       y: oy },
            { x: ox + gW,       y: oy + barH },
            { x: stemX + stemW, y: oy + barH },
            { x: stemX + stemW, y: oy + gH },
            { x: stemX,         y: oy + gH },
            { x: stemX,         y: oy + barH },
            { x: ox,            y: oy + barH },
          ],
        });
      } else if (bShape === "trapezoid") {
        // Narrow top edge, wider bottom edge
        const topInset = gW / 5;
        shapesToInsert.push({
          ...polyBase,
          points: [
            { x: ox + topInset,      y: oy },
            { x: ox + gW - topInset, y: oy },
            { x: ox + gW,            y: oy + gH },
            { x: ox,                 y: oy + gH },
          ],
        });
      } else {
        shapesToInsert.push({
          layout_id: layout.id,
          shape_type: "rect",
          preset_id: "garden-boundary",
          label: "Garden Boundary",
          color: "#92400e",
          x_m: ox, y_m: oy,
          width_m: gW, height_m: gH,
          radius_m: null, points: null,
          rotation: 0, z_index: 0, dashed: true, extrude_m: 0,
        });
      }

      // Border edges
      for (const [edgeId, cfg] of Object.entries(borders)) {
        if (cfg.style === "none") continue;
        const meta = BORDER_META[cfg.style];
        const geom = edgeToRectGeom(edgeId, bShape, gW, gH, ox, oy, meta.thickness);
        if (!geom) continue;
        const edgeDef = getEdgeDefs(bShape).find(e => e.id === edgeId);
        shapesToInsert.push({
          layout_id: layout.id,
          shape_type: "rect",
          preset_id: meta.preset_id,
          label: edgeDef ? `${edgeDef.label} ${meta.label}` : meta.label,
          color: meta.color,
          x_m: geom.x_m, y_m: geom.y_m,
          width_m: geom.width_m, height_m: geom.height_m,
          radius_m: null, points: null,
          rotation: 0, z_index: 1, dashed: false,
          extrude_m: cfg.height,
        });
      }

      if (shapesToInsert.length > 0) {
        const { error: shapesErr } = await supabase.from("garden_shapes").insert(shapesToInsert);
        if (shapesErr) throw shapesErr;
      }

      closeWizard();
      navigate(`/garden-layout/${layout.id}`);
    } catch (err) {
      Logger.error("Failed to create layout", err);
      toast.error("Could not create layout.");
    } finally {
      setCreating(false);
    }
  };

  const handleRename = async (id: string) => {
    const name = renameValue.trim();
    if (!name) return;
    try {
      const { error } = await supabase
        .from("garden_layouts")
        .update({ name, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      setLayouts(prev => prev.map(l => l.id === id ? { ...l, name } : l));
      setRenamingId(null);
    } catch (err) {
      Logger.error("Failed to rename layout", err);
      toast.error("Could not rename layout.");
    }
  };

  const handleDuplicate = async (sourceId: string, sourceName: string) => {
    if (duplicatingId) return;
    setDuplicatingId(sourceId);
    try {
      const { data: source, error: sErr } = await supabase
        .from("garden_layouts")
        .select("name, canvas_w_m, canvas_h_m, north_offset_deg")
        .eq("id", sourceId)
        .single();
      if (sErr) throw sErr;

      const { data: clone, error: cErr } = await supabase
        .from("garden_layouts")
        .insert({
          home_id: homeId,
          name: `${source.name} (Copy)`,
          canvas_w_m: source.canvas_w_m,
          canvas_h_m: source.canvas_h_m,
          north_offset_deg: source.north_offset_deg ?? 0,
        })
        .select()
        .single();
      if (cErr) throw cErr;

      const { data: shapes } = await supabase
        .from("garden_shapes")
        .select("*")
        .eq("layout_id", sourceId);
      if (shapes && shapes.length > 0) {
        const newShapes = shapes.map((s) => {
          const { id: _drop, ...rest } = s;
          void _drop;
          return { ...rest, layout_id: clone.id, plan_id: null };
        });
        const { error: insErr } = await supabase.from("garden_shapes").insert(newShapes);
        if (insErr) throw insErr;
      }

      toast.success(`Duplicated "${sourceName}"`);
      await fetchLayouts();
    } catch (err) {
      Logger.error("Failed to duplicate layout", err);
      toast.error("Could not duplicate layout.");
    } finally {
      setDuplicatingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const { error } = await supabase.from("garden_layouts").delete().eq("id", id);
      if (error) throw error;
      setLayouts(prev => prev.filter(l => l.id !== id));
    } catch (err) {
      Logger.error("Failed to delete layout", err);
      toast.error("Could not delete layout.");
    } finally {
      setDeletingId(null);
    }
  };

  const updateEdge = (edgeId: string, patch: Partial<EdgeConfig>) => {
    setBorders(prev => ({
      ...prev,
      [edgeId]: { ...(prev[edgeId] ?? DEFAULT_EDGE_CONFIG), ...patch },
    }));
  };

  const selectedEdge = selectedEdgeId ? (borders[selectedEdgeId] ?? DEFAULT_EDGE_CONFIG) : null;

  const effectiveLength = bShape === "square" ? bWidth : bLength;

  return (
    <div className="h-full flex flex-col bg-rhozly-bg">
      {/* Header */}
      <div className="px-6 pt-8 pb-4">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-2xl font-black text-rhozly-on-surface">Garden Layouts</h1>
          <button
            data-testid="create-layout-btn"
            onClick={() => setWizardMode("choice")}
            className="w-10 h-10 bg-rhozly-primary rounded-2xl flex items-center justify-center text-white shadow-lg shadow-rhozly-primary/20 active:scale-95 transition-transform"
          >
            <Plus size={20} />
          </button>
        </div>
        <p className="text-xs font-bold text-rhozly-on-surface/50">Draw and manage your garden spaces</p>
      </div>

      {/* Layout list */}
      <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center pt-16">
            <Loader2 size={24} className="animate-spin text-rhozly-on-surface/30" />
          </div>
        ) : layouts.length === 0 ? (
          <div className="text-center pt-16 space-y-3">
            <div className="w-16 h-16 bg-rhozly-surface rounded-3xl flex items-center justify-center mx-auto">
              <IconLayout size={28} className="text-rhozly-on-surface/20" />
            </div>
            <p className="font-black text-rhozly-on-surface text-sm">No layouts yet</p>
            <p className="text-xs font-bold text-rhozly-on-surface/50">Create a layout to start mapping your garden</p>
            <button
              onClick={() => setWizardMode("choice")}
              className="mt-2 px-6 py-3 bg-rhozly-primary text-white rounded-2xl font-black text-sm shadow-lg shadow-rhozly-primary/20"
            >
              Create your first layout
            </button>
          </div>
        ) : (
          layouts.map(layout => (
            <div
              key={layout.id}
              data-testid={`layout-card-${layout.id}`}
              className="bg-rhozly-surface rounded-3xl border border-rhozly-outline/20 relative"
            >
              {renamingId === layout.id ? (
                <div className="p-4 space-y-3">
                  <input
                    autoFocus
                    type="text"
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") handleRename(layout.id); if (e.key === "Escape") setRenamingId(null); }}
                    className="w-full bg-rhozly-bg rounded-2xl px-4 py-3 text-sm font-bold text-rhozly-on-surface border border-rhozly-outline/20 outline-none focus:border-rhozly-primary"
                  />
                  <div className="flex gap-2">
                    <button onClick={() => setRenamingId(null)} className="flex-1 py-2.5 rounded-2xl border border-rhozly-outline/20 text-xs font-black text-rhozly-on-surface/60">Cancel</button>
                    <button onClick={() => handleRename(layout.id)} className="flex-1 py-2.5 rounded-2xl bg-rhozly-primary text-white text-xs font-black">Save</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-1 sm:gap-3 p-4">
                  {/* Card body IS the open affordance — icon + name + size in one button. */}
                  <button
                    data-testid={`open-layout-${layout.id}`}
                    onClick={() => navigate(`/garden-layout/${layout.id}`)}
                    className="flex-1 min-w-0 flex items-center gap-3 text-left"
                  >
                    <div className="w-10 h-10 bg-rhozly-primary/10 rounded-2xl flex items-center justify-center shrink-0">
                      <IconLayout size={18} className="text-rhozly-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-black text-rhozly-on-surface text-sm truncate">{layout.name}</p>
                      <p className="text-xs font-bold text-rhozly-on-surface/40">{layout.canvas_w_m}m × {layout.canvas_h_m}m</p>
                    </div>
                  </button>
                  {/* Inline actions — ≥sm only; phones get the kebab below. */}
                  <div className="hidden sm:flex items-center gap-1">
                    <button
                      data-testid={`rename-layout-${layout.id}`}
                      onClick={() => { setRenamingId(layout.id); setRenameValue(layout.name); }}
                      className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-rhozly-on-surface/40 hover:text-rhozly-on-surface hover:bg-rhozly-surface-low transition-colors"
                      aria-label="Rename layout"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      data-testid={`duplicate-layout-${layout.id}`}
                      onClick={() => handleDuplicate(layout.id, layout.name)}
                      disabled={duplicatingId === layout.id}
                      aria-label="Duplicate layout"
                      title="Duplicate this layout"
                      className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-rhozly-on-surface/40 hover:text-rhozly-on-surface hover:bg-rhozly-surface-low transition-colors disabled:opacity-40"
                    >
                      {duplicatingId === layout.id ? <Loader2 size={16} className="animate-spin" /> : <Copy size={16} />}
                    </button>
                    <button
                      data-testid={`delete-layout-${layout.id}`}
                      onClick={() => handleDelete(layout.id)}
                      disabled={deletingId === layout.id}
                      className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-rhozly-on-surface/40 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
                      aria-label="Delete layout"
                    >
                      {deletingId === layout.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                    </button>
                  </div>
                  {/* Mobile kebab — rename/duplicate/delete without crowding the tap area. */}
                  <div className="sm:hidden relative">
                    <button
                      data-testid={`layout-menu-${layout.id}`}
                      onClick={() => setMenuOpenId(menuOpenId === layout.id ? null : layout.id)}
                      aria-label="Layout actions"
                      className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-rhozly-on-surface/40 hover:text-rhozly-on-surface hover:bg-rhozly-surface-low transition-colors"
                    >
                      <MoreVertical size={18} />
                    </button>
                    {menuOpenId === layout.id && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setMenuOpenId(null)} aria-hidden />
                        <div className="absolute right-0 top-full mt-1 z-20 bg-rhozly-surface rounded-2xl border border-rhozly-outline/20 shadow-lg py-1 w-44">
                          <button
                            data-testid={`layout-menu-rename-${layout.id}`}
                            onClick={() => { setMenuOpenId(null); setRenamingId(layout.id); setRenameValue(layout.name); }}
                            className="w-full flex items-center gap-2.5 px-4 py-3 text-xs font-black text-rhozly-on-surface hover:bg-rhozly-surface-low text-left"
                          >
                            <Pencil size={14} /> Rename
                          </button>
                          <button
                            data-testid={`layout-menu-duplicate-${layout.id}`}
                            onClick={() => { setMenuOpenId(null); handleDuplicate(layout.id, layout.name); }}
                            className="w-full flex items-center gap-2.5 px-4 py-3 text-xs font-black text-rhozly-on-surface hover:bg-rhozly-surface-low text-left"
                          >
                            <Copy size={14} /> Duplicate
                          </button>
                          <button
                            data-testid={`layout-menu-delete-${layout.id}`}
                            onClick={() => { setMenuOpenId(null); handleDelete(layout.id); }}
                            className="w-full flex items-center gap-2.5 px-4 py-3 text-xs font-black text-red-600 hover:bg-red-50 text-left"
                          >
                            <Trash2 size={14} /> Delete
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                  <button
                    onClick={() => navigate(`/garden-layout/${layout.id}`)}
                    aria-label="Open layout"
                    className="hidden sm:flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-rhozly-on-surface/30 hover:text-rhozly-on-surface/60"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* ====== Wizard modal ====== */}
      {wizardMode !== null && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl flex flex-col max-h-[92vh]">

            {/* Method choice */}
            {wizardMode === "choice" && (
              <>
                <div className="px-6 pt-6 pb-4 shrink-0">
                  <p className="text-[10px] font-black text-rhozly-on-surface/40 uppercase tracking-widest mb-1">New Layout</p>
                  <h2 className="text-xl font-black text-rhozly-on-surface">How would you like to start?</h2>
                </div>
                <div className="px-6 pb-6 space-y-3 flex-1 overflow-y-auto">
                  <button
                    data-testid="create-blank-canvas"
                    onClick={() => setWizardMode("scratch")}
                    className="w-full flex items-start gap-4 p-5 rounded-3xl border-2 border-rhozly-outline/20 hover:border-rhozly-primary/40 hover:bg-rhozly-primary/5 transition-all text-left active:scale-[0.98]"
                  >
                    <div className="w-12 h-12 bg-rhozly-surface rounded-2xl flex items-center justify-center shrink-0">
                      <SquareDashed size={22} className="text-rhozly-on-surface/50" />
                    </div>
                    <div>
                      <p className="font-black text-rhozly-on-surface text-sm">Blank Canvas</p>
                      <p className="text-xs font-bold text-rhozly-on-surface/50 mt-0.5 leading-relaxed">Start with an empty grid and place everything yourself.</p>
                    </div>
                  </button>
                  <button
                    data-testid="create-garden-builder"
                    onClick={() => setWizardMode("builder")}
                    className="w-full flex items-start gap-4 p-5 rounded-3xl border-2 border-rhozly-primary/30 bg-rhozly-primary/5 hover:border-rhozly-primary/60 hover:bg-rhozly-primary/10 transition-all text-left active:scale-[0.98]"
                  >
                    <div className="w-12 h-12 bg-rhozly-primary/15 rounded-2xl flex items-center justify-center shrink-0">
                      <Wand2 size={22} className="text-rhozly-primary" />
                    </div>
                    <div>
                      <p className="font-black text-rhozly-on-surface text-sm">Garden Builder</p>
                      <p className="text-xs font-bold text-rhozly-on-surface/50 mt-0.5 leading-relaxed">Pick your shape, size, and border styles to get started quickly.</p>
                    </div>
                  </button>
                  <button
                    data-testid="create-starter-layout"
                    onClick={() => setWizardMode("starter")}
                    className="w-full flex items-start gap-4 p-5 rounded-3xl border-2 border-emerald-300/40 bg-emerald-50/40 hover:border-emerald-400/60 hover:bg-emerald-50 transition-all text-left active:scale-[0.98]"
                  >
                    <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center shrink-0">
                      <Sprout size={22} className="text-emerald-600" />
                    </div>
                    <div>
                      <p className="font-black text-rhozly-on-surface text-sm">Starter Layout</p>
                      <p className="text-xs font-bold text-rhozly-on-surface/50 mt-0.5 leading-relaxed">Pre-made gardens — allotment plot, front border, container terrace.</p>
                    </div>
                  </button>
                  <button
                    data-testid="create-sketch-layout"
                    onClick={() => { closeWizard(); setShowSketch(true); }}
                    className="w-full flex items-start gap-4 p-5 rounded-3xl border-2 border-rhozly-outline/20 hover:border-rhozly-primary/40 hover:bg-rhozly-primary/5 transition-all text-left active:scale-[0.98]"
                  >
                    <div className="w-12 h-12 bg-rhozly-surface rounded-2xl flex items-center justify-center shrink-0">
                      <PenLine size={22} className="text-rhozly-primary" />
                    </div>
                    <div>
                      <p className="font-black text-rhozly-on-surface text-sm">Convert a sketch</p>
                      <p className="text-xs font-bold text-rhozly-on-surface/50 mt-0.5 leading-relaxed">Turn a hand-drawn sketch into a layout with AI. Sage+</p>
                    </div>
                  </button>
                </div>
                <div className="px-6 pb-6 shrink-0">
                  <button onClick={closeWizard} className="w-full py-3 rounded-2xl border border-rhozly-outline/20 text-sm font-black text-rhozly-on-surface/60">
                    Cancel
                  </button>
                </div>
              </>
            )}

            {/* Blank canvas */}
            {wizardMode === "starter" && (
              <>
                <div className="px-6 pt-6 pb-4 shrink-0 flex items-center gap-3">
                  <button
                    aria-label="Back"
                    onClick={() => setWizardMode("choice")}
                    className="min-h-[44px] min-w-[44px] -ml-2 flex items-center justify-center rounded-xl hover:bg-rhozly-surface transition-colors"
                  >
                    <ArrowLeft size={18} className="text-rhozly-on-surface/50" />
                  </button>
                  <div>
                    <p className="text-[10px] font-black text-rhozly-on-surface/40 uppercase tracking-widest">Starter Layout</p>
                    <h2 className="text-lg font-black text-rhozly-on-surface">Pick a starter</h2>
                  </div>
                </div>
                <div className="px-6 pb-4 flex-1 overflow-y-auto space-y-3">
                  {STARTER_TEMPLATES.map((t) => (
                    <button
                      key={t.id}
                      data-testid={`starter-template-${t.id}`}
                      onClick={() => handleCreateStarter(t)}
                      disabled={creating}
                      className="w-full flex items-start gap-3 p-4 rounded-3xl border-2 border-rhozly-outline/15 hover:border-rhozly-primary/40 hover:bg-rhozly-primary/5 transition-all text-left active:scale-[0.98] disabled:opacity-60"
                    >
                      <div className="w-10 h-10 bg-emerald-100 rounded-2xl flex items-center justify-center shrink-0">
                        <Sprout size={20} className="text-emerald-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-black text-rhozly-on-surface text-sm">{t.label}</p>
                        <p className="text-[11px] font-bold text-rhozly-on-surface/50 mt-0.5 leading-relaxed">{t.description}</p>
                        <p className="text-[9px] font-black text-rhozly-on-surface/30 uppercase tracking-widest mt-1">{t.canvasW}m × {t.canvasH}m canvas</p>
                      </div>
                      {creating && <Loader2 size={16} className="animate-spin text-rhozly-on-surface/40" />}
                    </button>
                  ))}
                </div>
                <div className="px-6 pb-6 shrink-0">
                  <button onClick={closeWizard} className="w-full py-3 rounded-2xl border border-rhozly-outline/20 text-sm font-black text-rhozly-on-surface/60">
                    Cancel
                  </button>
                </div>
              </>
            )}

            {wizardMode === "scratch" && (
              <>
                <div className="px-6 pt-6 pb-4 shrink-0 flex items-center gap-3">
                  <button
                    aria-label="Back"
                    onClick={() => setWizardMode("choice")}
                    className="min-h-[44px] min-w-[44px] -ml-2 flex items-center justify-center rounded-xl hover:bg-rhozly-surface transition-colors"
                  >
                    <ArrowLeft size={18} className="text-rhozly-on-surface/50" />
                  </button>
                  <div>
                    <p className="text-[10px] font-black text-rhozly-on-surface/40 uppercase tracking-widest">Blank Canvas</p>
                    <h2 className="text-lg font-black text-rhozly-on-surface">Name your layout</h2>
                  </div>
                </div>
                <div className="px-6 pb-4 flex-1 overflow-y-auto">
                  <input
                    data-testid="new-layout-name-input"
                    autoFocus
                    type="text"
                    placeholder="e.g. Back Garden"
                    value={bName}
                    onChange={e => setBName(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleCreateScratch()}
                    className="w-full bg-rhozly-bg rounded-2xl px-4 py-3 text-sm font-bold text-rhozly-on-surface border border-rhozly-outline/20 outline-none focus:border-rhozly-primary"
                  />
                </div>
                <div className="px-6 pb-6 flex gap-3 shrink-0">
                  <button onClick={closeWizard} className="flex-1 py-3 rounded-2xl border border-rhozly-outline/20 text-sm font-black text-rhozly-on-surface/60">Cancel</button>
                  <button
                    data-testid="create-layout-confirm"
                    onClick={handleCreateScratch}
                    disabled={creating}
                    className="flex-1 py-3 rounded-2xl bg-rhozly-primary text-white text-sm font-black disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {creating && <Loader2 size={15} className="animate-spin" />}
                    Create
                  </button>
                </div>
              </>
            )}

            {/* Builder wizard */}
            {wizardMode === "builder" && (() => {
              const goBack = () => {
                if (builderStep === 1) { setWizardMode("choice"); return; }
                setSelectedEdgeId(null);
                setBuilderStep(s => (s - 1) as 1 | 2 | 3);
              };
              const goNext = () => {
                setSelectedEdgeId(null);
                setBuilderStep(s => (s + 1) as 1 | 2 | 3);
              };

              return (
                <>
                  {/* Header */}
                  <div className="px-6 pt-6 pb-3 shrink-0">
                    <div className="flex items-center gap-3 mb-4">
                      <button
                        aria-label="Back"
                        onClick={goBack}
                        className="min-h-[44px] min-w-[44px] -ml-2 flex items-center justify-center rounded-xl hover:bg-rhozly-surface transition-colors"
                      >
                        <ArrowLeft size={18} className="text-rhozly-on-surface/50" />
                      </button>
                      <div className="flex-1">
                        <p className="text-[10px] font-black text-rhozly-on-surface/40 uppercase tracking-widest">Garden Builder · Step {builderStep} of 3</p>
                        <h2 className="text-lg font-black text-rhozly-on-surface leading-tight">
                          {builderStep === 1 && "Name & Shape"}
                          {builderStep === 2 && "Garden Size"}
                          {builderStep === 3 && "Border Styles"}
                        </h2>
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      {[1, 2, 3].map(n => (
                        <div key={n} className={`h-1.5 flex-1 rounded-full transition-colors ${n <= builderStep ? "bg-rhozly-primary" : "bg-rhozly-outline/20"}`} />
                      ))}
                    </div>
                  </div>

                  {/* Step content */}
                  <div className="flex-1 overflow-y-auto px-6 py-2 space-y-5">

                    {/* Step 1 */}
                    {builderStep === 1 && (
                      <>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-rhozly-on-surface/50 uppercase tracking-widest">Layout Name</label>
                          <input
                            data-testid="builder-layout-name-input"
                            autoFocus
                            type="text"
                            placeholder="e.g. Back Garden"
                            value={bName}
                            onChange={e => setBName(e.target.value)}
                            className="w-full bg-rhozly-bg rounded-2xl px-4 py-3 text-sm font-bold text-rhozly-on-surface border border-rhozly-outline/20 outline-none focus:border-rhozly-primary"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-rhozly-on-surface/50 uppercase tracking-widest">Garden Shape</label>
                          <div className="grid grid-cols-3 gap-2">
                            {([
                              { id: "rect",    label: "Rectangle", icon: (
                                <svg viewBox="0 0 40 28" className="w-10 h-7"><rect x="2" y="2" width="36" height="24" rx="2" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="2"/></svg>
                              )},
                              { id: "square",  label: "Square", icon: (
                                <svg viewBox="0 0 28 28" className="w-7 h-7"><rect x="2" y="2" width="24" height="24" rx="2" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="2"/></svg>
                              )},
                              { id: "l-shape", label: "L-Shape", icon: (
                                <svg viewBox="0 0 28 28" className="w-7 h-7"><polygon points="2,2 12,2 12,12 26,12 26,26 2,26" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="2"/></svg>
                              )},
                              { id: "t-shape", label: "T-Shape", icon: (
                                <svg viewBox="0 0 28 28" className="w-7 h-7"><polygon points="2,2 26,2 26,12 18,12 18,26 10,26 10,12 2,12" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="2"/></svg>
                              )},
                              { id: "trapezoid", label: "Trapezoid", icon: (
                                <svg viewBox="0 0 28 28" className="w-7 h-7"><polygon points="8,4 20,4 26,24 2,24" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="2"/></svg>
                              )},
                            ] as { id: GardenShape; label: string; icon: React.ReactNode }[]).map(({ id, label, icon }) => (
                              <button
                                key={id}
                                data-testid={`shape-option-${id}`}
                                onClick={() => { setBShape(id); setBorders({}); }}
                                className={`flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all ${bShape === id ? "border-rhozly-primary bg-rhozly-primary/8 text-rhozly-primary" : "border-rhozly-outline/20 text-rhozly-on-surface/40 hover:border-rhozly-outline/40"}`}
                              >
                                {icon}
                                <span className="text-[10px] font-black">{label}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      </>
                    )}

                    {/* Step 2 */}
                    {builderStep === 2 && (
                      <>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-rhozly-on-surface/50 uppercase tracking-widest">
                            {bShape === "square" ? "Size" : "Width"} (metres)
                          </label>
                          <div className="flex items-center gap-3">
                            <input
                              data-testid="builder-width-input"
                              type="number" min="1" max="200" step="0.5"
                              value={bWidth}
                              onChange={e => setBWidth(parseFloat(e.target.value) || 1)}
                              className="flex-1 bg-rhozly-bg rounded-2xl px-4 py-3 text-sm font-bold text-rhozly-on-surface border border-rhozly-outline/20 outline-none focus:border-rhozly-primary"
                            />
                            <span className="text-sm font-black text-rhozly-on-surface/40">m</span>
                          </div>
                        </div>
                        {bShape !== "square" && (
                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-rhozly-on-surface/50 uppercase tracking-widest">Length (metres)</label>
                            <div className="flex items-center gap-3">
                              <input
                                data-testid="builder-length-input"
                                type="number" min="1" max="200" step="0.5"
                                value={bLength}
                                onChange={e => setBLength(parseFloat(e.target.value) || 1)}
                                className="flex-1 bg-rhozly-bg rounded-2xl px-4 py-3 text-sm font-bold text-rhozly-on-surface border border-rhozly-outline/20 outline-none focus:border-rhozly-primary"
                              />
                              <span className="text-sm font-black text-rhozly-on-surface/40">m</span>
                            </div>
                          </div>
                        )}
                        {/* Size preview */}
                        <div className="bg-rhozly-surface rounded-2xl p-4 flex flex-col items-center gap-2">
                          <p className="text-[10px] font-black text-rhozly-on-surface/40 uppercase tracking-widest">Preview</p>
                          <svg viewBox="0 0 200 150" style={{ width: "100%", maxWidth: 220 }}>
                            <polygon
                              points={getShapePoints(bShape === "square" ? "rect" : bShape)}
                              fill="#86efac30" stroke="#16a34a" strokeWidth="2"
                            />
                          </svg>
                          <p className="text-xs font-black text-rhozly-on-surface/60">
                            {bShape === "square" ? `${bWidth}m × ${bWidth}m` : `${bWidth}m × ${effectiveLength}m`}
                          </p>
                        </div>
                      </>
                    )}

                    {/* Step 3 — interactive edge selector. T-shape/trapezoid skip per-edge picker. */}
                    {builderStep === 3 && (bShape === "t-shape" || bShape === "trapezoid") && (
                      <div className="space-y-4">
                        <div className="bg-rhozly-surface rounded-2xl p-4 text-center space-y-2">
                          <p className="text-xs font-black text-rhozly-on-surface">No border presets yet</p>
                          <p className="text-[11px] font-bold text-rhozly-on-surface/60 leading-relaxed">
                            Per-edge fences/hedges aren't configurable for this shape yet — you can add them by hand in the editor once your layout opens.
                          </p>
                        </div>
                      </div>
                    )}
                    {builderStep === 3 && bShape !== "t-shape" && bShape !== "trapezoid" && (() => {
                      const edges = getEdgeDefs(bShape);
                      return (
                        <div className="space-y-4">
                          <p className="text-[10px] font-black text-rhozly-on-surface/40 uppercase tracking-widest">
                            Tap an edge to set its border material
                          </p>

                          {/* SVG shape outline */}
                          <div className="bg-rhozly-surface rounded-2xl p-3">
                            <svg
                              viewBox="-5 0 210 160"
                              style={{ width: "100%", display: "block" }}
                            >
                              {/* Shape fill */}
                              <polygon
                                points={getShapePoints(bShape)}
                                fill="#bbf7d040"
                                stroke="none"
                              />

                              {/* Edge lines — render click targets first (wider, transparent), then visible lines */}
                              {edges.map(edge => {
                                const cfg = borders[edge.id] ?? DEFAULT_EDGE_CONFIG;
                                const isSelected = selectedEdgeId === edge.id;
                                const isConfigured = cfg.style !== "none";
                                const strokeColor = isSelected
                                  ? "#f97316"
                                  : isConfigured
                                    ? BORDER_META[cfg.style as Exclude<BorderStyle, "none">].svgColor
                                    : "#9ca3af";
                                const strokeW = isSelected ? 5 : isConfigured ? 4 : 2.5;

                                return (
                                  <g key={edge.id}>
                                    {/* Visible line */}
                                    <line
                                      x1={edge.x1} y1={edge.y1} x2={edge.x2} y2={edge.y2}
                                      stroke={strokeColor}
                                      strokeWidth={strokeW}
                                      strokeLinecap="round"
                                    />
                                    {/* Wide transparent click target */}
                                    <line
                                      x1={edge.x1} y1={edge.y1} x2={edge.x2} y2={edge.y2}
                                      stroke="transparent"
                                      strokeWidth={18}
                                      style={{ cursor: "pointer" }}
                                      onClick={() => setSelectedEdgeId(isSelected ? null : edge.id)}
                                    />
                                    {/* Label */}
                                    <text
                                      x={edge.lx} y={edge.ly}
                                      textAnchor={edge.anchor}
                                      fontSize={8}
                                      fontWeight={isSelected ? "900" : "700"}
                                      fill={isSelected ? "#f97316" : isConfigured ? strokeColor : "#9ca3af"}
                                    >
                                      {isConfigured && cfg.style !== "none"
                                        ? `${edge.label} · ${BORDER_META[cfg.style as Exclude<BorderStyle, "none">].label}`
                                        : edge.label}
                                    </text>
                                  </g>
                                );
                              })}
                            </svg>
                          </div>

                          {/* Edge config panel */}
                          {selectedEdgeId && selectedEdge ? (
                            <div className="bg-rhozly-bg rounded-2xl p-4 space-y-3 border border-rhozly-outline/20">
                              <p className="text-xs font-black text-rhozly-on-surface">
                                {getEdgeDefs(bShape).find(e => e.id === selectedEdgeId)?.label} edge
                              </p>
                              <div className="flex gap-1.5 flex-wrap">
                                {(["none", "fence", "hedge", "wall"] as BorderStyle[]).map(style => {
                                  const isActive = selectedEdge.style === style;
                                  const color = style !== "none" ? BORDER_META[style].svgColor : undefined;
                                  return (
                                    <StylePill
                                      key={style}
                                      active={isActive}
                                      onClick={() => updateEdge(selectedEdgeId, { style })}
                                      label={style === "none" ? "None" : BORDER_META[style].label}
                                      color={isActive && color ? color : undefined}
                                    />
                                  );
                                })}
                              </div>
                              {selectedEdge.style !== "none" && (
                                <div className="flex items-center gap-3">
                                  <label className="text-[10px] font-black text-rhozly-on-surface/50 uppercase tracking-widest shrink-0">Height</label>
                                  <input
                                    type="number" min="0.1" max="5" step="0.1"
                                    value={selectedEdge.height}
                                    onChange={e => updateEdge(selectedEdgeId, { height: parseFloat(e.target.value) || 0.1 })}
                                    className="flex-1 bg-white rounded-xl px-3 py-2 text-xs font-bold text-rhozly-on-surface border border-rhozly-outline/20 outline-none focus:border-rhozly-primary"
                                  />
                                  <span className="text-xs font-black text-rhozly-on-surface/40 shrink-0">m</span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <p className="text-center text-xs font-bold text-rhozly-on-surface/40 py-2">
                              Select an edge above to configure its border
                            </p>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Footer */}
                  <div className="px-6 pb-6 pt-4 flex gap-3 shrink-0 border-t border-rhozly-outline/10">
                    <button onClick={closeWizard} className="flex-1 py-3 rounded-2xl border border-rhozly-outline/20 text-sm font-black text-rhozly-on-surface/60">
                      Cancel
                    </button>
                    {builderStep < 3 ? (
                      <button
                        data-testid="builder-next-btn"
                        onClick={goNext}
                        className="flex-1 py-3 rounded-2xl bg-rhozly-primary text-white text-sm font-black"
                      >
                        Next
                      </button>
                    ) : (
                      <button
                        data-testid="builder-create-btn"
                        onClick={handleBuilderFinish}
                        disabled={creating}
                        className="flex-1 py-3 rounded-2xl bg-rhozly-primary text-white text-sm font-black disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {creating && <Loader2 size={15} className="animate-spin" />}
                        Create Layout
                      </button>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {showSketch && <SketchToLayoutWizard homeId={homeId} onClose={() => setShowSketch(false)} />}
    </div>
  );
}
