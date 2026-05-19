import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Stage, Layer, Rect, Circle, Ellipse, Line, Text } from "react-konva";
import { Loader2 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Logger } from "../../lib/errorHandler";
import GardenRuler from "../GardenRuler";
import GardenScaleBar from "../GardenScaleBar";
import GardenCompass from "../GardenCompass";
import type { ShapeData } from "../GardenShapeProperties";
import { getShapeDecorations } from "../../lib/garden/shapeDecorations";

interface Layout {
  id: string;
  name: string;
  canvas_w_m: number;
  canvas_h_m: number;
  north_offset_deg: number;
}

const BASE_PX = 50;

export default function SharedGardenLayout() {
  const { token } = useParams<{ token: string }>();
  const [layout, setLayout] = useState<Layout | null>(null);
  const [shapes, setShapes] = useState<ShapeData[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [containerSize, setContainerSize] = useState({ w: 800, h: 600 });
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    if (!token) { setNotFound(true); setLoading(false); return; }
    (async () => {
      try {
        const { data: lay } = await supabase
          .from("garden_layouts")
          .select("id, name, canvas_w_m, canvas_h_m, north_offset_deg")
          .eq("share_token", token)
          .maybeSingle();
        if (!lay) { setNotFound(true); return; }
        setLayout(lay);
        const { data: shps } = await supabase
          .from("garden_shapes")
          .select("*")
          .eq("layout_id", lay.id)
          .order("z_index");
        setShapes((shps ?? []).map((s: any) => ({
          ...s,
          points: s.points ?? null,
          extrude_m: s.extrude_m ?? null,
          preset_id: s.preset_id ?? null,
          plan_id: s.plan_id ?? null,
        })));
      } catch (err) {
        Logger.error("Failed to load shared layout", err);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => setContainerSize({ w: window.innerWidth, h: window.innerHeight - 80 });
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const fitZoom = useMemo(() => {
    if (!layout) return 1;
    const padding = 80;
    const fx = (containerSize.w - padding) / (layout.canvas_w_m * BASE_PX);
    const fy = (containerSize.h - padding) / (layout.canvas_h_m * BASE_PX);
    return Math.max(0.2, Math.min(2, Math.min(fx, fy)));
  }, [layout, containerSize]);
  useEffect(() => { setZoom(fitZoom); }, [fitZoom]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-rhozly-bg">
        <Loader2 size={28} className="animate-spin text-rhozly-primary" />
      </div>
    );
  }

  if (notFound || !layout) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-rhozly-bg p-8 text-center">
        <p className="font-black text-rhozly-on-surface text-lg">This shared layout could not be found.</p>
        <p className="text-sm font-bold text-rhozly-on-surface/50 mt-2">The owner may have revoked the link.</p>
      </div>
    );
  }

  const renderShape = (shape: ShapeData) => {
    const fill = shape.color + (shape.dashed ? "22" : "bb");
    const stroke = shape.color;
    const dashProp = shape.dashed ? [8, 5] : undefined;
    let node: React.ReactNode = null;
    if (shape.shape_type === "rect" || shape.shape_type === "path") {
      const w = (shape.width_m ?? 1) * BASE_PX, h = (shape.height_m ?? 1) * BASE_PX;
      node = (
        <Rect
          x={shape.x_m * BASE_PX} y={shape.y_m * BASE_PX}
          width={w} height={h}
          fill={fill} stroke={stroke} strokeWidth={1.5}
          rotation={shape.rotation} cornerRadius={3} dash={dashProp}
          shadowBlur={shape.dashed ? 0 : 3} shadowOffsetY={shape.dashed ? 0 : 2} shadowOpacity={0.3}
          shadowColor="rgba(60,40,20,0.35)"
          listening={false}
        />
      );
    } else if (shape.shape_type === "circle") {
      const r = (shape.radius_m ?? 0.5) * BASE_PX;
      node = (
        <Circle x={shape.x_m * BASE_PX} y={shape.y_m * BASE_PX} radius={r} fill={fill} stroke={stroke} strokeWidth={1.5} dash={dashProp}
          shadowBlur={3} shadowOffsetY={2} shadowOpacity={0.3} shadowColor="rgba(60,40,20,0.35)"
          listening={false} />
      );
    } else if (shape.shape_type === "ellipse") {
      const rx = (shape.width_m ?? 2) / 2 * BASE_PX;
      const ry = (shape.height_m ?? 1) / 2 * BASE_PX;
      node = (
        <Ellipse x={shape.x_m * BASE_PX} y={shape.y_m * BASE_PX} radiusX={rx} radiusY={ry} fill={fill} stroke={stroke} strokeWidth={1.5} dash={dashProp}
          shadowBlur={3} shadowOffsetY={2} shadowOpacity={0.3} shadowColor="rgba(60,40,20,0.35)"
          listening={false} />
      );
    } else if (shape.shape_type === "polygon" && shape.points && shape.points.length > 0) {
      const tension = shape.preset_id === "curve-bed" ? 0.5 : 0;
      const pts = shape.points.flatMap(p => [
        (shape.x_m + p.x) * BASE_PX,
        (shape.y_m + p.y) * BASE_PX,
      ]);
      node = (
        <Line points={pts} closed tension={tension} fill={fill} stroke={stroke} strokeWidth={1.5} dash={dashProp}
          shadowBlur={3} shadowOffsetY={2} shadowOpacity={0.3} shadowColor="rgba(60,40,20,0.35)"
          listening={false} />
      );
    }
    return (
      <React.Fragment key={shape.id}>
        {node}
        {getShapeDecorations(shape, BASE_PX)}
        {shape.label && (
          <Text
            x={shape.shape_type === "circle" || shape.shape_type === "ellipse" ? shape.x_m * BASE_PX : (shape.x_m + (shape.width_m ?? 1) / 2) * BASE_PX}
            y={shape.shape_type === "circle" || shape.shape_type === "ellipse" ? shape.y_m * BASE_PX - 6 : (shape.y_m + (shape.height_m ?? 1) / 2) * BASE_PX - 6}
            text={shape.label}
            fontSize={11} fontStyle="bold"
            fill="rgba(0,0,0,0.7)" align="center"
            offsetX={shape.label.length * 3.2}
            listening={false}
          />
        )}
      </React.Fragment>
    );
  };

  return (
    <div className="h-screen flex flex-col bg-rhozly-bg">
      <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-rhozly-outline/15 shrink-0">
        <div className="flex-1 min-w-0">
          <p className="font-black text-rhozly-on-surface text-sm truncate">{layout.name}</p>
          <p className="text-[10px] font-bold text-rhozly-on-surface/40">{layout.canvas_w_m}m × {layout.canvas_h_m}m · Shared view</p>
        </div>
        <p className="text-[10px] font-black text-rhozly-on-surface/40 uppercase tracking-widest hidden sm:block">Powered by Rhozly</p>
      </div>
      <div className="flex-1 relative overflow-hidden">
        <Stage
          width={containerSize.w}
          height={containerSize.h}
          scaleX={zoom}
          scaleY={zoom}
          x={32}
          y={32}
        >
          <GardenRuler canvasWm={layout.canvas_w_m} canvasHm={layout.canvas_h_m} pxPerM={BASE_PX} offsetX={0} offsetY={0} />
          <Layer>
            {shapes.map(renderShape)}
          </Layer>
        </Stage>
        <GardenScaleBar pxPerM={BASE_PX * zoom} zoom={zoom} />
        <div className="absolute bottom-4 left-4 z-10 bg-white/85 backdrop-blur-sm rounded-2xl p-1.5 shadow-md border border-rhozly-outline/10 pointer-events-none">
          <GardenCompass value={layout.north_offset_deg ?? 0} size={64} readOnly />
        </div>
      </div>
    </div>
  );
}
