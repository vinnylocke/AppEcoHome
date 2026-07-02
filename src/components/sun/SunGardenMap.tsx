import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Loader2, Flame, Eye, X, Sprout, Filter } from "lucide-react";
import { supabase } from "../../lib/supabase";
import type { ShapeData } from "../GardenShapeProperties";
import {
  computeAllShapesSunHours,
  isShapeInShadowAt,
  getShapeCentre,
  SUN_CLASS_COLOR,
  SUN_CLASS_TEXT_COLOR,
  type SunClass,
  type ShapeSunResult,
} from "../../lib/sunAnalysis";
import {
  parsePlantSunPreference,
  getPlantSunFit,
  type PlantSunPreference,
  type SunFit,
} from "../../lib/garden/sunFit";
import PlantSpotPicker, { type PlantSpotOption } from "./PlantSpotPicker";
import {
  parseHourlyCloudFactor,
  computeEffectiveSunForShape,
  type EffectiveSunResult,
} from "../../lib/sun/effectiveSun";
import { classifyFrostRisk, type FrostRisk } from "../../lib/garden/microclimate";
import { getLocalDateString } from "../../lib/taskEngine";

interface GardenLayout {
  id: string;
  name: string;
  canvas_w_m: number;
  canvas_h_m: number;
  north_offset_deg: number;
}

interface PlantInArea {
  id: string;
  plant_name: string | null;
  nickname: string | null;
  area_id: string;
  sunlight: string | null;
}

interface Props {
  homeId: string;
  latLng: { lat: number; lng: number };
  selectedDate: Date;
}

// Heatmap colour: red (0h) → amber (4h) → green (8h+)
function heatmapColor(sunHours: number): string {
  const clamped = Math.max(0, Math.min(8, sunHours));
  if (clamped < 4) {
    // Red → amber
    const t = clamped / 4;
    const r = 239;
    const g = Math.round(68 + (159 - 68) * t);
    const b = Math.round(68 + (11 - 68) * t);
    return `rgb(${r},${g},${b})`;
  }
  // Amber → green
  const t = (clamped - 4) / 4;
  const r = Math.round(245 + (34 - 245) * t);
  const g = Math.round(159 + (197 - 159) * t);
  const b = Math.round(11 + (94 - 11) * t);
  return `rgb(${r},${g},${b})`;
}

function blendWithGrey(hex: string, t: number): string {
  if (hex.startsWith("rgb")) {
    const m = hex.match(/\d+/g);
    if (!m) return "#aaaaaa";
    const [r, g, b] = m.map(Number);
    const gr = Math.round(r * (1 - t) + 150 * t);
    const gg = Math.round(g * (1 - t) + 160 * t);
    const gb = Math.round(b * (1 - t) + 180 * t);
    return `rgb(${gr},${gg},${gb})`;
  }
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return "#aaaaaa";
  const gr = Math.round(r * (1 - t) + 150 * t);
  const gg = Math.round(g * (1 - t) + 160 * t);
  const gb = Math.round(b * (1 - t) + 180 * t);
  return `rgb(${gr},${gg},${gb})`;
}

function fitIcon(fit: SunFit): "check" | "warn" | "cross" | null {
  if (fit === "Match")          return "check";
  if (fit === "AdjacentDrier")  return "warn";
  if (fit === "AdjacentShadier") return "warn";
  if (fit === "Mismatch")        return "cross";
  return null;
}

function hitTestShape(shape: ShapeData, layoutX: number, layoutY: number): boolean {
  if (shape.shape_type === "rect" || shape.shape_type === "path") {
    const w = shape.width_m ?? 1;
    const h = shape.height_m ?? 1;
    return layoutX >= shape.x_m && layoutX <= shape.x_m + w
        && layoutY >= shape.y_m && layoutY <= shape.y_m + h;
  }
  if (shape.shape_type === "circle" || shape.preset_id === "tree-canopy") {
    const r = shape.radius_m ?? 0.5;
    const dx = layoutX - shape.x_m;
    const dy = layoutY - shape.y_m;
    return dx * dx + dy * dy <= r * r;
  }
  if (shape.shape_type === "ellipse") {
    const rw = (shape.width_m ?? 2) / 2;
    const rh = (shape.height_m ?? 1) / 2;
    const dx = layoutX - shape.x_m;
    const dy = layoutY - shape.y_m;
    return (dx * dx) / (rw * rw) + (dy * dy) / (rh * rh) <= 1;
  }
  if (shape.shape_type === "polygon" && shape.points) {
    let inside = false;
    const pts = shape.points;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i].x + shape.x_m, yi = pts[i].y + shape.y_m;
      const xj = pts[j].x + shape.x_m, yj = pts[j].y + shape.y_m;
      if ((yi > layoutY) !== (yj > layoutY) &&
          layoutX < ((xj - xi) * (layoutY - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
    return inside;
  }
  return false;
}

// sessionStorage keys for cross-route handoffs
const SS_PLANT     = "rhozly:sun-tracker-plant";
const SS_PLAN      = "rhozly:sun-tracker-plan-filter";
const SS_PLAN_NAME = "rhozly:sun-tracker-plan-filter-name";

export default function SunGardenMap({ homeId, latLng, selectedDate }: Props) {
  const [layouts, setLayouts] = useState<GardenLayout[]>([]);
  const [selectedLayoutId, setSelectedLayoutId] = useState<string | null>(null);
  const [allShapes, setAllShapes] = useState<ShapeData[]>([]);
  const [northOffset, setNorthOffset] = useState(0);
  const [canvasW, setCanvasW] = useState(30);
  const [canvasH, setCanvasH] = useState(20);
  const [loading, setLoading] = useState(true);
  const [plantsByArea, setPlantsByArea] = useState<Record<string, PlantInArea[]>>({});
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);

  // Cross-route handoffs — consume from sessionStorage on mount
  const [planFilterId, setPlanFilterId] = useState<string | null>(null);
  const [planFilterName, setPlanFilterName] = useState<string | null>(null);
  const [pickedPlant, setPickedPlant] = useState<PlantSpotOption | null>(null);

  // Weather + lux for Wave 5 cross-references
  const [rawWeather, setRawWeather] = useState<any>(null);
  const [latestLuxByArea, setLatestLuxByArea] = useState<Record<string, { lux: number; recordedAt: string }>>({});

  useEffect(() => {
    try {
      const planId = sessionStorage.getItem(SS_PLAN);
      const planName = sessionStorage.getItem(SS_PLAN_NAME);
      if (planId) {
        setPlanFilterId(planId);
        setPlanFilterName(planName);
        sessionStorage.removeItem(SS_PLAN);
        sessionStorage.removeItem(SS_PLAN_NAME);
      }
      const plantRaw = sessionStorage.getItem(SS_PLANT);
      if (plantRaw) {
        const plant = JSON.parse(plantRaw) as PlantSpotOption;
        if (plant && plant.id && plant.name) setPickedPlant(plant);
        sessionStorage.removeItem(SS_PLANT);
      }
    } catch { /* ignore */ }
  }, []);

  // Apply plan filter
  const shapes = useMemo(() => {
    if (!planFilterId) return allShapes;
    return allShapes.filter(s => (s as any).plan_id === planFilterId);
  }, [allShapes, planFilterId]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch layouts on mount
  useEffect(() => {
    supabase
      .from("garden_layouts")
      .select("id, name, canvas_w_m, canvas_h_m, north_offset_deg")
      .eq("home_id", homeId)
      .then(({ data }) => {
        if (data && data.length > 0) {
          setLayouts(data as GardenLayout[]);
          setSelectedLayoutId(data[0].id);
        }
        setLoading(false);
      });
  }, [homeId]);

  // Fetch shapes when layout changes
  useEffect(() => {
    if (!selectedLayoutId) return;
    const layout = layouts.find(l => l.id === selectedLayoutId);
    if (layout) {
      setNorthOffset(layout.north_offset_deg ?? 0);
      setCanvasW(layout.canvas_w_m);
      setCanvasH(layout.canvas_h_m);
    }
    supabase
      .from("garden_shapes")
      .select("*")
      .eq("layout_id", selectedLayoutId)
      .order("z_index")
      .then(({ data }) => {
        setAllShapes(
          (data ?? []).map((s: any) => ({
            ...s,
            points: s.points ?? null,
            extrude_m: s.extrude_m ?? null,
            preset_id: s.preset_id ?? null,
            plan_id: s.plan_id ?? null,
          })),
        );
      });
  }, [selectedLayoutId, layouts]);

  // Fetch weather snapshot for cloud + frost data
  useEffect(() => {
    supabase
      .from("weather_snapshots")
      .select("data")
      .eq("home_id", homeId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.data) setRawWeather(data.data);
      });
  }, [homeId]);

  // Fetch latest lux reading per area in the current layout
  useEffect(() => {
    const areaIds = shapes.map(s => s.area_id).filter((id): id is string => !!id);
    if (areaIds.length === 0) { setLatestLuxByArea({}); return; }
    supabase
      .from("area_lux_readings")
      .select("area_id, lux_value, recorded_at")
      .in("area_id", areaIds)
      .order("recorded_at", { ascending: false })
      .limit(200)
      .then(({ data }) => {
        const latest: Record<string, { lux: number; recordedAt: string }> = {};
        (data ?? []).forEach((row: any) => {
          if (!row.area_id) return;
          if (!latest[row.area_id]) {
            latest[row.area_id] = { lux: row.lux_value, recordedAt: row.recorded_at };
          }
        });
        setLatestLuxByArea(latest);
      });
  }, [shapes]);

  // Fetch plants by area for shapes in the current layout
  useEffect(() => {
    const areaIds = shapes.map(s => s.area_id).filter((id): id is string => !!id);
    if (areaIds.length === 0) { setPlantsByArea({}); return; }
    supabase
      .from("inventory_items")
      .select("id, plant_name, nickname, area_id, plants(sunlight)")
      .in("area_id", areaIds)
      .eq("status", "Planted")
      .then(({ data }) => {
        const grouped: Record<string, PlantInArea[]> = {};
        (data ?? []).forEach((row: any) => {
          if (!row.area_id) return;
          if (!grouped[row.area_id]) grouped[row.area_id] = [];
          // plants.sunlight may be a JSON array, a string, or null
          let sunlight: string | null = null;
          const raw = row.plants?.sunlight;
          if (Array.isArray(raw)) sunlight = raw[0] ?? null;
          else if (typeof raw === "string") sunlight = raw;
          grouped[row.area_id].push({
            id: row.id,
            plant_name: row.plant_name,
            nickname: row.nickname,
            area_id: row.area_id,
            sunlight,
          });
        });
        setPlantsByArea(grouped);
      });
  }, [shapes]);

  // Compute daily sun hours per shape (memoised per date+shapes)
  const dateKey = selectedDate.toISOString().split("T")[0];
  const sunHoursByShape = useMemo(() => {
    if (shapes.length === 0) return new Map<string, ShapeSunResult>();
    const results = computeAllShapesSunHours(
      shapes,
      latLng.lat,
      latLng.lng,
      new Date(dateKey + "T12:00:00"),
      northOffset,
    );
    const map = new Map<string, ShapeSunResult>();
    results.forEach(r => map.set(r.shapeId, r));
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shapes, dateKey, latLng.lat, latLng.lng, northOffset]);

  // Sun fit for picked plant against each shape (only when a plant is picked)
  const fitByShape = useMemo(() => {
    if (!pickedPlant) return new Map<string, SunFit>();
    const plantPref: PlantSunPreference = parsePlantSunPreference(pickedPlant.sunlight);
    const map = new Map<string, SunFit>();
    sunHoursByShape.forEach((r, id) => {
      map.set(id, getPlantSunFit(plantPref, r.classification));
    });
    return map;
  }, [pickedPlant, sunHoursByShape]);

  // Cloud-adjusted effective sun per shape (only meaningful for today)
  const todayKey = getLocalDateString(new Date());
  const isViewingToday = dateKey === todayKey;
  const effectiveSunByShape = useMemo(() => {
    if (!isViewingToday || !rawWeather || shapes.length === 0) {
      return new Map<string, EffectiveSunResult>();
    }
    const cloudByHour = parseHourlyCloudFactor(rawWeather, dateKey);
    if (!cloudByHour) return new Map<string, EffectiveSunResult>();
    const map = new Map<string, EffectiveSunResult>();
    shapes.forEach(s => {
      const r = computeEffectiveSunForShape(
        s, shapes, latLng.lat, latLng.lng,
        new Date(dateKey + "T12:00:00"), northOffset, cloudByHour,
      );
      map.set(s.id, r);
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isViewingToday, rawWeather, shapes, dateKey, latLng.lat, latLng.lng, northOffset]);

  // Tonight's frost risk from forecast
  const tonightFrostRisk = useMemo((): { risk: FrostRisk; minTempC: number | null } => {
    if (!rawWeather?.daily?.time) return { risk: "None", minTempC: null };
    const times: string[] = rawWeather.daily.time;
    const mins: number[] = rawWeather.daily.temperature_2m_min ?? [];
    const idx = times.findIndex(t => t === todayKey);
    if (idx === -1) return { risk: "None", minTempC: null };
    const minTempC = mins[idx];
    if (!isFinite(minTempC)) return { risk: "None", minTempC: null };
    return { risk: classifyFrostRisk(minTempC), minTempC };
  }, [rawWeather, todayKey]);

  // Render canvas — re-runs on each frame-related dep
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || shapes.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const scaleX = W / canvasW;
    const scaleY = H / canvasH;
    const scale = Math.min(scaleX, scaleY);
    const offX = (W - canvasW * scale) / 2;
    const offY = (H - canvasH * scale) / 2;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#f0fdf4";
    ctx.fillRect(0, 0, W, H);

    for (const shape of shapes) {
      const inShadow = isShapeInShadowAt(
        shape, shapes, latLng.lat, latLng.lng, selectedDate, northOffset,
      );
      const sunResult = sunHoursByShape.get(shape.id);
      const baseColor = showHeatmap && sunResult
        ? heatmapColor(sunResult.sunHours)
        : (shape.color || "#4ade80");
      const fillColor = inShadow ? blendWithGrey(baseColor, 0.55) : baseColor;
      const isSelected = shape.id === selectedShapeId;
      const fit = fitByShape.get(shape.id);
      const showFit = !!pickedPlant;

      ctx.save();
      ctx.fillStyle = fillColor;
      ctx.strokeStyle = isSelected ? "#f59e0b" : "rgba(0,0,0,0.18)";
      ctx.lineWidth = isSelected ? 3 : 0.8;

      const { x: cx, z: cz } = getShapeCentre(shape);
      const px = shape.x_m * scale + offX;
      const py = shape.y_m * scale + offY;
      const screenCx = cx * scale + offX;
      const screenCy = cz * scale + offY;

      if (shape.shape_type === "rect" || shape.shape_type === "path") {
        const pw = (shape.width_m ?? 1) * scale;
        const ph = (shape.height_m ?? 1) * scale;
        ctx.fillRect(px, py, pw, ph);
        ctx.strokeRect(px, py, pw, ph);
      } else if (shape.shape_type === "circle" || shape.preset_id === "tree-canopy") {
        const radius = (shape.radius_m ?? 0.5) * scale;
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
      } else if (shape.shape_type === "ellipse") {
        const rw = ((shape.width_m ?? 2) / 2) * scale;
        const rh = ((shape.height_m ?? 1) / 2) * scale;
        ctx.beginPath();
        ctx.ellipse(px, py, rw, rh, 0, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
      } else if (shape.shape_type === "polygon" && shape.points) {
        ctx.beginPath();
        shape.points.forEach((pt, i) => {
          const ppx = (shape.x_m + pt.x) * scale + offX;
          const ppy = (shape.y_m + pt.y) * scale + offY;
          if (i === 0) ctx.moveTo(ppx, ppy);
          else ctx.lineTo(ppx, ppy);
        });
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      // Sun-hour label (skip for very small shapes)
      if (sunResult && !showFit) {
        const label = `${sunResult.sunHours.toFixed(1)}h`;
        ctx.font = "bold 11px system-ui";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        // Background pill for readability
        const metrics = ctx.measureText(label);
        const padX = 4;
        const padY = 2;
        const bgW = metrics.width + padX * 2;
        const bgH = 14;
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.beginPath();
        ctx.roundRect(screenCx - bgW / 2, screenCy - bgH / 2, bgW, bgH, 4);
        ctx.fill();

        ctx.fillStyle = "#0f172a";
        ctx.fillText(label, screenCx, screenCy);
        ctx.textBaseline = "alphabetic";
      }

      // Sun-fit icon when a plant is picked
      if (showFit && fit) {
        const icon = fitIcon(fit);
        if (icon) {
          const colour = icon === "check" ? "#16a34a" : icon === "warn" ? "#f59e0b" : "#dc2626";
          ctx.save();
          ctx.font = "bold 18px system-ui";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          // Background circle
          ctx.fillStyle = "rgba(255,255,255,0.95)";
          ctx.beginPath();
          ctx.arc(screenCx, screenCy, 14, 0, 2 * Math.PI);
          ctx.fill();
          ctx.strokeStyle = colour;
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.fillStyle = colour;
          ctx.fillText(icon === "check" ? "✓" : icon === "warn" ? "!" : "✕", screenCx, screenCy);
          ctx.textBaseline = "alphabetic";
          ctx.restore();
        }
      }

      ctx.restore();
    }

    // North indicator
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.font = "bold 11px system-ui";
    ctx.textAlign = "left";
    ctx.fillText("N↑", 8, 16);
  }, [
    shapes, selectedDate, latLng, northOffset, canvasW, canvasH,
    showHeatmap, selectedShapeId, sunHoursByShape, fitByShape, pickedPlant,
  ]);

  // Resize canvas to container
  useEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      canvas.width = w;
      canvas.height = h;
    };
    resize();
    const ro = new ResizeObserver(resize);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Tap detection — convert click coords to layout coords and hit-test
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || shapes.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const W = canvas.width;
    const H = canvas.height;
    const scaleX = W / canvasW;
    const scaleY = H / canvasH;
    const scale = Math.min(scaleX, scaleY);
    const offX = (W - canvasW * scale) / 2;
    const offY = (H - canvasH * scale) / 2;
    const layoutX = (cx * (W / rect.width) - offX) / scale;
    const layoutY = (cy * (H / rect.height) - offY) / scale;

    // Iterate top-down (highest z_index first) so layered shapes work
    for (let i = shapes.length - 1; i >= 0; i--) {
      if (hitTestShape(shapes[i], layoutX, layoutY)) {
        setSelectedShapeId(shapes[i].id);
        return;
      }
    }
    setSelectedShapeId(null);
  }, [shapes, canvasW, canvasH]);

  const selectedShape = selectedShapeId ? shapes.find(s => s.id === selectedShapeId) : null;
  const selectedSunResult = selectedShape ? sunHoursByShape.get(selectedShape.id) : null;
  const selectedAreaPlants = selectedShape?.area_id ? plantsByArea[selectedShape.area_id] ?? [] : [];

  // Aggregate stats for the picked plant
  const plantFitSummary = useMemo(() => {
    if (!pickedPlant) return null;
    let matches = 0;
    let adjacent = 0;
    let mismatch = 0;
    fitByShape.forEach(fit => {
      if (fit === "Match") matches++;
      else if (fit === "AdjacentDrier" || fit === "AdjacentShadier") adjacent++;
      else if (fit === "Mismatch") mismatch++;
    });
    return { matches, adjacent, mismatch, total: matches + adjacent + mismatch };
  }, [pickedPlant, fitByShape]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={28} className="animate-spin text-rhozly-primary" />
      </div>
    );
  }

  if (layouts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-6 py-12">
        <Sprout size={32} className="text-rhozly-on-surface/30 mb-3" />
        <p className="text-sm font-black text-rhozly-on-surface mb-1">
          No garden layout yet
        </p>
        <p className="text-xs font-bold text-rhozly-on-surface/50 max-w-xs">
          Create a layout in the Garden Layout tool to see sun + shadow patterns for your beds.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Top toolbar */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {layouts.length > 1 && (
          <select
            data-testid="sun-tracker-layout-select"
            value={selectedLayoutId ?? ""}
            onChange={e => setSelectedLayoutId(e.target.value)}
            className="text-xs font-bold bg-white border border-rhozly-outline/20 rounded-xl px-3 py-2 min-h-[40px]"
          >
            {layouts.map(l => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        )}
        <button
          data-testid="sun-tracker-heatmap-toggle"
          onClick={() => setShowHeatmap(v => !v)}
          className={`flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl text-xs font-black transition-colors ${
            showHeatmap
              ? "bg-amber-500 text-white"
              : "bg-white text-rhozly-on-surface/70 border border-rhozly-outline/20 hover:border-amber-300"
          }`}
        >
          {showHeatmap ? <Eye size={13} /> : <Flame size={13} />}
          Heatmap
        </button>
        <div className="ml-auto">
          <PlantSpotPicker
            homeId={homeId}
            value={pickedPlant}
            onChange={setPickedPlant}
          />
        </div>
      </div>

      {/* Plan filter chip — appears when handed off from a plan card */}
      {planFilterId && (
        <div
          data-testid="sun-tracker-plan-filter-chip"
          className="mb-3 flex items-center gap-2 bg-rhozly-primary/10 border border-rhozly-primary/20 rounded-xl px-3 py-2"
        >
          <Filter size={13} className="text-rhozly-primary shrink-0" />
          <p className="flex-1 text-xs font-bold text-rhozly-on-surface min-w-0 truncate">
            <span className="text-rhozly-on-surface/50">Filtered to plan: </span>
            <span className="text-rhozly-primary">{planFilterName || "Selected plan"}</span>
          </p>
          <button
            data-testid="sun-tracker-plan-filter-clear"
            onClick={() => { setPlanFilterId(null); setPlanFilterName(null); }}
            className="text-rhozly-on-surface/40 hover:text-rhozly-on-surface/70 transition-colors p-1"
            aria-label="Clear plan filter"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* Canvas */}
      <div
        ref={containerRef}
        className="flex-1 rounded-2xl overflow-hidden border border-rhozly-outline/20 bg-emerald-50 relative min-h-[280px]"
      >
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          className="w-full h-full cursor-pointer"
          data-testid="sun-tracker-garden-canvas"
        />
      </div>

      {/* Picked-plant summary strip */}
      {pickedPlant && plantFitSummary && (
        <div
          data-testid="sun-tracker-plant-fit-summary"
          className="mt-3 bg-white border border-rhozly-outline/20 rounded-2xl px-4 py-3 flex items-center justify-between gap-3"
        >
          <div className="flex-1 min-w-0">
            <p className="text-xs font-black text-rhozly-on-surface truncate">
              Sun fit for {pickedPlant.name}
            </p>
            <p className="text-[11px] font-bold text-rhozly-on-surface/55 mt-0.5">
              {plantFitSummary.matches > 0 && (
                <span className="text-emerald-600">{plantFitSummary.matches} ideal</span>
              )}
              {plantFitSummary.matches > 0 && plantFitSummary.adjacent > 0 && " · "}
              {plantFitSummary.adjacent > 0 && (
                <span className="text-amber-600">{plantFitSummary.adjacent} workable</span>
              )}
              {(plantFitSummary.matches > 0 || plantFitSummary.adjacent > 0) && plantFitSummary.mismatch > 0 && " · "}
              {plantFitSummary.mismatch > 0 && (
                <span className="text-rose-600">{plantFitSummary.mismatch} unsuitable</span>
              )}
              {plantFitSummary.total === 0 && (
                <span className="text-rhozly-on-surface/40">No fit data — preference unknown</span>
              )}
            </p>
          </div>
          <button
            onClick={() => setPickedPlant(null)}
            className="p-2 min-h-[36px] min-w-[36px] rounded-xl text-rhozly-on-surface/40 hover:text-rhozly-on-surface/70 hover:bg-rhozly-surface-low transition-colors flex items-center justify-center"
            aria-label="Clear plant filter"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Bed-detail drawer */}
      {selectedShape && (
        <ShapeDetailDrawer
          shape={selectedShape}
          sunResult={selectedSunResult ?? null}
          effectiveSun={effectiveSunByShape.get(selectedShape.id) ?? null}
          plants={selectedAreaPlants}
          latestLux={selectedShape.area_id ? latestLuxByArea[selectedShape.area_id] ?? null : null}
          tonightFrostRisk={tonightFrostRisk}
          fitForPickedPlant={pickedPlant ? fitByShape.get(selectedShape.id) ?? null : null}
          pickedPlantName={pickedPlant?.name ?? null}
          onClose={() => setSelectedShapeId(null)}
        />
      )}

      {/* Legend */}
      {!pickedPlant && !showHeatmap && (
        <div className="mt-2 flex items-center gap-3 text-[10px] font-bold text-rhozly-on-surface/55 px-1">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm bg-amber-200 border border-amber-400 inline-block" />
            In sun now
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm bg-slate-300 border border-slate-400 inline-block" />
            In shadow now
          </span>
          <span className="text-rhozly-on-surface/30 ml-auto">Numbers show daily sun hours</span>
        </div>
      )}
      {showHeatmap && !pickedPlant && (
        <div className="mt-2 flex items-center gap-2 text-[10px] font-bold text-rhozly-on-surface/55 px-1">
          <span className="flex items-center gap-1.5">
            Heatmap:
          </span>
          <div className="flex-1 h-2 rounded-full overflow-hidden flex">
            <div className="flex-1" style={{ background: "linear-gradient(to right, rgb(239,68,68), rgb(245,159,11), rgb(34,197,94))" }} />
          </div>
          <span className="flex justify-between min-w-[100px] text-rhozly-on-surface/40">
            <span>0h</span><span>4h</span><span>8h+</span>
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Bed-detail drawer ───────────────────────────────────────────────────────

interface DrawerProps {
  shape: ShapeData;
  sunResult: ShapeSunResult | null;
  effectiveSun: EffectiveSunResult | null;
  plants: PlantInArea[];
  latestLux: { lux: number; recordedAt: string } | null;
  tonightFrostRisk: { risk: FrostRisk; minTempC: number | null };
  fitForPickedPlant: SunFit | null;
  pickedPlantName: string | null;
  onClose: () => void;
}

function expectedLuxForClass(sunClass: SunClass | null): number | null {
  // Rough "typical at noon, clear day" expectations
  switch (sunClass) {
    case "Full Sun":     return 80000;
    case "Partly Sunny": return 35000;
    case "Partly Shady": return 12000;
    case "Shade":        return 4000;
    default:             return null;
  }
}

function formatLuxAge(recordedAt: string): string {
  const ms = Date.now() - new Date(recordedAt).getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} ${Math.floor(days / 7) === 1 ? "week" : "weeks"} ago`;
  return `${Math.floor(days / 30)} months ago`;
}

function ShapeDetailDrawer({
  shape,
  sunResult,
  effectiveSun,
  plants,
  latestLux,
  tonightFrostRisk,
  fitForPickedPlant,
  pickedPlantName,
  onClose,
}: DrawerProps) {
  const sunClass: SunClass | null = sunResult?.classification ?? null;
  const classBg = sunClass ? SUN_CLASS_COLOR[sunClass] : "#e5e7eb";
  const classFg = sunClass ? SUN_CLASS_TEXT_COLOR[sunClass] : "#475569";

  // Lux cross-check: only meaningful interpretation when reading is recent (≤ 14 days)
  const luxAgeDays = latestLux
    ? Math.floor((Date.now() - new Date(latestLux.recordedAt).getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const expectedLux = expectedLuxForClass(sunClass);
  const luxRatio = (latestLux && expectedLux) ? latestLux.lux / expectedLux : null;
  const luxVerdict: "shadier" | "matches" | "brighter" | null = luxRatio
    ? (luxRatio < 0.5 ? "shadier" : luxRatio > 1.5 ? "brighter" : "matches")
    : null;

  // Frost amplification: more meaningful for heavily shaded beds (cold air pools)
  const frostMatters =
    tonightFrostRisk.risk !== "None" &&
    (sunClass === "Shade" || sunClass === "Partly Shady" || (sunResult?.sunHours ?? 99) < 4);

  return (
    <div
      data-testid="sun-tracker-bed-drawer"
      className="mt-3 bg-white border border-rhozly-outline/20 rounded-2xl shadow-sm overflow-hidden animate-in slide-in-from-bottom-4 duration-200"
    >
      <div className="flex items-start justify-between p-4 pb-2">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40">
            Selected bed
          </p>
          <p className="text-base font-black text-rhozly-on-surface truncate">
            {shape.label || "Unnamed shape"}
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-2 min-h-[36px] min-w-[36px] rounded-xl text-rhozly-on-surface/40 hover:text-rhozly-on-surface/70 hover:bg-rhozly-surface-low transition-colors flex items-center justify-center"
          aria-label="Close bed details"
        >
          <X size={14} />
        </button>
      </div>

      <div className="px-4 pb-4 space-y-3">
        {sunResult && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-2xl font-black text-rhozly-on-surface">
              {sunResult.sunHours.toFixed(1)} h
            </span>
            <span className="text-xs font-bold text-rhozly-on-surface/50 -mt-1">
              daily sun
            </span>
            <span
              className="ml-auto px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest"
              style={{ background: classBg, color: classFg }}
            >
              {sunClass}
            </span>
          </div>
        )}

        {/* Effective sun — only when viewing today and weather data available */}
        {effectiveSun && effectiveSun.theoreticalHours > 0 && (
          <div
            data-testid="sun-tracker-effective-sun"
            className="rounded-xl px-3 py-2 bg-amber-50/60 border border-amber-200/50"
          >
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-700 mb-0.5">
              Effective sun today (cloud-adjusted)
            </p>
            <p className="text-xs font-black text-rhozly-on-surface">
              {effectiveSun.effectiveHours.toFixed(1)} h
              <span className="font-bold text-rhozly-on-surface/50">
                {" "}of {effectiveSun.theoreticalHours.toFixed(1)} h theoretical · {Math.round(effectiveSun.averageCloudPct)}% cloud cover
              </span>
            </p>
          </div>
        )}

        {/* Frost-risk chip — only when relevant and bed is shaded */}
        {frostMatters && tonightFrostRisk.minTempC !== null && (
          <div
            data-testid="sun-tracker-frost-chip"
            className={`rounded-xl px-3 py-2 border ${
              tonightFrostRisk.risk === "Severe" ? "bg-rose-50 border-rose-200"
              : tonightFrostRisk.risk === "Moderate" ? "bg-orange-50 border-orange-200"
              : "bg-sky-50 border-sky-200"
            }`}
          >
            <p className={`text-[10px] font-black uppercase tracking-widest mb-0.5 ${
              tonightFrostRisk.risk === "Severe" ? "text-rose-700"
              : tonightFrostRisk.risk === "Moderate" ? "text-orange-700"
              : "text-sky-700"
            }`}>
              ❄ Tonight: {tonightFrostRisk.risk.toLowerCase()} frost risk
            </p>
            <p className="text-[11px] font-bold text-rhozly-on-surface/60 leading-snug">
              Forecast low {tonightFrostRisk.minTempC.toFixed(1)}°C. Shaded beds stay colder — consider fleece or moving tender plants.
            </p>
          </div>
        )}

        {/* Lux cross-check */}
        {latestLux && luxAgeDays !== null && luxAgeDays <= 30 && (
          <div
            data-testid="sun-tracker-lux-cross-check"
            className="rounded-xl px-3 py-2 bg-rhozly-surface-low border border-rhozly-outline/15"
          >
            <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-0.5">
              Measured light
            </p>
            <p className="text-xs font-black text-rhozly-on-surface">
              {Math.round(latestLux.lux).toLocaleString()} lx
              <span className="font-bold text-rhozly-on-surface/45">
                {" "}· {formatLuxAge(latestLux.recordedAt)}
              </span>
            </p>
            {expectedLux && luxVerdict && luxAgeDays <= 14 && (
              <p className={`text-[11px] font-bold leading-snug mt-0.5 ${
                luxVerdict === "shadier" ? "text-amber-700"
                : luxVerdict === "brighter" ? "text-emerald-700"
                : "text-rhozly-on-surface/55"
              }`}>
                {luxVerdict === "shadier" && `Shadier than the model expects (~${Math.round(expectedLux).toLocaleString()} lx for ${sunClass}) — likely an unmapped fence or canopy.`}
                {luxVerdict === "brighter" && `Brighter than the model expects (~${Math.round(expectedLux).toLocaleString()} lx for ${sunClass}) — likely a reflective surface boosting light.`}
                {luxVerdict === "matches" && `Matches the model expectation for ${sunClass}.`}
              </p>
            )}
          </div>
        )}

        {fitForPickedPlant && pickedPlantName && (
          <div className="rounded-xl px-3 py-2 bg-rhozly-surface-low border border-rhozly-outline/15">
            <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-0.5">
              Fit for {pickedPlantName}
            </p>
            <p className={`text-xs font-black ${
              fitForPickedPlant === "Match" ? "text-emerald-600"
              : fitForPickedPlant === "Mismatch" ? "text-rose-600"
              : fitForPickedPlant === "Unknown" ? "text-rhozly-on-surface/50"
              : "text-amber-600"
            }`}>
              {fitForPickedPlant === "Match" && "Ideal — sun preference matches."}
              {fitForPickedPlant === "AdjacentDrier" && "Workable — slightly sunnier than ideal."}
              {fitForPickedPlant === "AdjacentShadier" && "Workable — slightly shadier than ideal."}
              {fitForPickedPlant === "Mismatch" && "Not recommended — sun mismatch."}
              {fitForPickedPlant === "Unknown" && "No sun preference recorded for this plant."}
            </p>
          </div>
        )}

        {plants.length > 0 ? (
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-1.5">
              Plants in this bed ({plants.length})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {plants.map(p => (
                <span
                  key={p.id}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200"
                >
                  <Sprout size={10} />
                  {p.nickname || p.plant_name || "Unnamed"}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-[11px] font-bold text-rhozly-on-surface/40">
            No plants assigned to this bed yet.
          </p>
        )}
      </div>
    </div>
  );
}
