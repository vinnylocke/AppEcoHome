import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowLeft,
  Compass,
  ChevronDown,
  ChevronUp,
  MapPin,
  Sunrise,
  Sunset,
  Sun,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import SunCalc from "suncalc";
import { supabase } from "../lib/supabase";
import { useDeviceOrientation } from "../hooks/useDeviceOrientation";
import { useSunArc } from "../hooks/useSunArc";
import type { SunArcData } from "../hooks/useSunArc";
import {
  projectSunToScreen,
  projectSunToDome,
  sunCalcAzimuthToCompassDeg,
  shadowBearingDeg,
  shadowLengthMultiplier,
  DEFAULT_HFOV_RAD,
  DEFAULT_VFOV_RAD,
} from "../lib/sunProjection";
import type { ShapeData } from "./GardenShapeProperties";
import { isShapeInShadowAt, getShapeCentre } from "../lib/sunAnalysis";

const DEG = Math.PI / 180;

interface Props {
  homeId: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Canvas drawing helpers (module-level pure functions)
// ─────────────────────────────────────────────────────────────────────────────

function drawSunOrb(ctx: CanvasRenderingContext2D, sx: number, sy: number) {
  // Outer glow
  const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, 44);
  glow.addColorStop(0, "rgba(253,186,116,0.7)");
  glow.addColorStop(0.4, "rgba(251,146,60,0.35)");
  glow.addColorStop(1, "rgba(251,146,60,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(sx, sy, 44, 0, 2 * Math.PI);
  ctx.fill();

  // Core
  const core = ctx.createRadialGradient(sx - 5, sy - 5, 0, sx, sy, 22);
  core.addColorStop(0, "#fef9c3");
  core.addColorStop(0.5, "#fbbf24");
  core.addColorStop(1, "#d97706");
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(sx, sy, 22, 0, 2 * Math.PI);
  ctx.fill();
}

function drawEdgeArrow(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  edgeAngle: number,
) {
  // Place arrow on the edge of the canvas pointing toward off-screen sun
  const margin = 40;
  const cx = W / 2;
  const cy = H / 2;
  const maxR = Math.min(cx, cy) - margin;
  const ax = cx + Math.sin(edgeAngle) * maxR;
  const ay = cy - Math.cos(edgeAngle) * maxR;

  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate(edgeAngle);
  ctx.fillStyle = "rgba(251,191,36,0.9)";
  ctx.strokeStyle = "rgba(0,0,0,0.3)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, -18);
  ctx.lineTo(8, 6);
  ctx.lineTo(-8, 6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawArcOnCanvas(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  arc: SunArcData,
  alphaRad: number,
  cameraTilt: number,
  selectedMs: number,
) {
  if (arc.arc.length < 2) return;
  const goldenAMMs = arc.events.goldenHourAM.getTime();
  const goldenPMMs = arc.events.goldenHourPM.getTime();

  // Draw arc as small line segments coloured by time-of-day
  for (let i = 0; i < arc.arc.length - 1; i++) {
    const a = arc.arc[i];
    const b = arc.arc[i + 1];
    const pa = projectSunToScreen(a.azimuth, a.altitude, alphaRad, cameraTilt);
    const pb = projectSunToScreen(b.azimuth, b.altitude, alphaRad, cameraTilt);

    const t = a.time.getTime();
    const isGolden = t < goldenAMMs || t > goldenPMMs;
    ctx.strokeStyle = isGolden
      ? "rgba(251,146,60,0.65)"
      : "rgba(251,191,36,0.45)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(pa.x * W, pa.y * H);
    ctx.lineTo(pb.x * W, pb.y * H);
    ctx.stroke();
  }

  // Solar event dots
  const events = [
    { time: arc.events.sunrise, label: "Sunrise", color: "#fb923c" },
    { time: arc.events.goldenHourAM, label: "", color: "#fbbf24" },
    { time: arc.events.solarNoon, label: "Noon", color: "#fef08a" },
    { time: arc.events.goldenHourPM, label: "", color: "#fbbf24" },
    { time: arc.events.sunset, label: "Sunset", color: "#fb923c" },
  ];
  for (const ev of events) {
    const pos = SunCalc.getPosition(ev.time, 0, 0); // placeholder — use the arc point closest in time
    // Find closest arc point
    const closest = arc.arc.reduce((best, pt) =>
      Math.abs(pt.time.getTime() - ev.time.getTime()) <
      Math.abs(best.time.getTime() - ev.time.getTime())
        ? pt
        : best,
    );
    const p = projectSunToScreen(
      closest.azimuth,
      closest.altitude,
      alphaRad,
      cameraTilt,
    );
    void pos;
    const px = p.x * W;
    const py = p.y * H;

    ctx.fillStyle = ev.color;
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, 2 * Math.PI);
    ctx.fill();

    if (ev.label) {
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.font = "bold 10px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(ev.label, px, py - 12);
    }
  }

  // Progress dot at selected time
  const selPt = arc.arc.reduce((best, pt) =>
    Math.abs(pt.time.getTime() - selectedMs) <
    Math.abs(best.time.getTime() - selectedMs)
      ? pt
      : best,
  );
  const sp = projectSunToScreen(selPt.azimuth, selPt.altitude, alphaRad, cameraTilt);
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.fillStyle = "#fbbf24";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(sp.x * W, sp.y * H, 7, 0, 2 * Math.PI);
  ctx.fill();
  ctx.stroke();
}

function drawShadowArrow(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  sunAzimuthRad: number,
  sunAltitudeRad: number,
) {
  const bearing = shadowBearingDeg(sunAzimuthRad);
  const mult = shadowLengthMultiplier(sunAltitudeRad);
  // Normalise multiplier for visual length: short = long shadows
  const arrowLen = Math.min(60, 12 + mult * 3);
  const angleRad = bearing * DEG;

  const ox = W / 2;
  const oy = H - 60;

  ctx.save();
  ctx.translate(ox, oy);
  ctx.rotate(angleRad);
  ctx.strokeStyle = "rgba(100,100,255,0.85)";
  ctx.fillStyle = "rgba(100,100,255,0.85)";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -arrowLen);
  ctx.stroke();
  // Arrowhead
  ctx.beginPath();
  ctx.moveTo(0, -arrowLen);
  ctx.lineTo(-6, -arrowLen + 10);
  ctx.lineTo(6, -arrowLen + 10);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Label
  const label = `Shadow: ${compassLabel(bearing)}`;
  ctx.fillStyle = "rgba(200,200,255,0.9)";
  ctx.font = "bold 11px system-ui";
  ctx.textAlign = "center";
  ctx.fillText(label, ox, H - 20);
}

function drawHorizonLine(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  cameraTilt: number,
) {
  // Horizon is at screen y where the projected altitude = 0
  const horizY =
    (0.5 + Math.sin(-cameraTilt) / (2 * Math.sin(DEFAULT_VFOV_RAD / 2))) * H;
  if (horizY < 0 || horizY > H) return;

  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(0, horizY);
  ctx.lineTo(W, horizY);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.font = "10px system-ui";
  ctx.textAlign = "right";
  ctx.fillText("Horizon", W - 8, horizY - 4);
}

function drawCompassBadge(
  ctx: CanvasRenderingContext2D,
  W: number,
  alphaRad: number,
) {
  const deg = Math.round((alphaRad / DEG + 360) % 360);
  const label = `${compassLabel(deg)}  ${deg}°`;
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  roundRect(ctx, W / 2 - 38, 14, 76, 22, 11);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "bold 11px system-ui";
  ctx.textAlign = "center";
  ctx.fillText(label, W / 2, 30);
}

// ─── Sky dome (fallback when camera unavailable) ───────────────────────────

function drawSkyDome(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  sunPos: { altitude: number; azimuth: number },
  arc: SunArcData | null,
  northUpRad: number, // rotation so that this bearing points up (=0 → North up)
  selectedMs: number,
) {
  const cx = W / 2;
  const cy = (H - 120) / 2 + 20; // leave room for controls below
  const r = Math.min(cx, cy) * 0.85;

  // Sky gradient background
  const sky = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  sky.addColorStop(0, "#bfdbfe");
  sky.addColorStop(0.6, "#93c5fd");
  sky.addColorStop(1, "#60a5fa");
  ctx.fillStyle = sky;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  ctx.fill();

  // Horizon ring
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  ctx.stroke();

  // Altitude rings at 30° and 60°
  for (const altDeg of [30, 60]) {
    const rr = r * (1 - altDeg / 90);
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, 2 * Math.PI);
    ctx.stroke();
  }

  // Cardinal labels
  const cardinals = [
    { label: "N", angle: northUpRad },
    { label: "E", angle: northUpRad + Math.PI / 2 },
    { label: "S", angle: northUpRad + Math.PI },
    { label: "W", angle: northUpRad + (3 * Math.PI) / 2 },
  ];
  ctx.font = "bold 13px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const c of cardinals) {
    const dx = Math.sin(c.angle) * (r + 16);
    const dy = -Math.cos(c.angle) * (r + 16);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText(c.label, cx + dx, cy + dy);
  }
  ctx.textBaseline = "alphabetic";

  // Sun arc on dome
  if (arc && arc.arc.length > 1) {
    const goldenAMMs = arc.events.goldenHourAM.getTime();
    const goldenPMMs = arc.events.goldenHourPM.getTime();

    for (let i = 0; i < arc.arc.length - 1; i++) {
      const a = arc.arc[i];
      const b = arc.arc[i + 1];
      const compassA =
        ((a.azimuth + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
      const compassB =
        ((b.azimuth + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
      const pa = projectSunToDome(compassA - northUpRad, a.altitude);
      const pb = projectSunToDome(compassB - northUpRad, b.altitude);

      const t = a.time.getTime();
      const isGolden = t < goldenAMMs || t > goldenPMMs;
      ctx.strokeStyle = isGolden ? "rgba(251,146,60,0.8)" : "rgba(251,191,36,0.6)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx + pa.nx * r, cy + pa.ny * r);
      ctx.lineTo(cx + pb.nx * r, cy + pb.ny * r);
      ctx.stroke();
    }

    // Key event dots
    for (const [evTime, color] of [
      [arc.events.sunrise, "#fb923c"],
      [arc.events.solarNoon, "#fef08a"],
      [arc.events.sunset, "#fb923c"],
    ] as [Date, string][]) {
      const closest = arc.arc.reduce((best, pt) =>
        Math.abs(pt.time.getTime() - evTime.getTime()) <
        Math.abs(best.time.getTime() - evTime.getTime())
          ? pt
          : best,
      );
      const comp =
        ((closest.azimuth + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
      const pd = projectSunToDome(comp - northUpRad, closest.altitude);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx + pd.nx * r, cy + pd.ny * r, 5, 0, 2 * Math.PI);
      ctx.fill();
    }

    // Selected time dot
    const selPt = arc.arc.reduce((best, pt) =>
      Math.abs(pt.time.getTime() - selectedMs) <
      Math.abs(best.time.getTime() - selectedMs)
        ? pt
        : best,
    );
    const compSel =
      ((selPt.azimuth + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    const ps = projectSunToDome(compSel - northUpRad, selPt.altitude);
    ctx.fillStyle = "#fbbf24";
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx + ps.nx * r, cy + ps.ny * r, 8, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
  }

  // Current sun position
  if (sunPos.altitude > 0) {
    const compassSun =
      ((sunPos.azimuth + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    const ps = projectSunToDome(compassSun - northUpRad, sunPos.altitude);
    const sx = cx + ps.nx * r;
    const sy = cy + ps.ny * r;

    const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, 28);
    glow.addColorStop(0, "rgba(253,186,116,0.8)");
    glow.addColorStop(1, "rgba(251,146,60,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(sx, sy, 28, 0, 2 * Math.PI);
    ctx.fill();

    const core = ctx.createRadialGradient(sx - 3, sy - 3, 0, sx, sy, 14);
    core.addColorStop(0, "#fef9c3");
    core.addColorStop(1, "#f59e0b");
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(sx, sy, 14, 0, 2 * Math.PI);
    ctx.fill();
  }
}

// ─── Utility helpers ────────────────────────────────────────────────────────

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function compassLabel(deg: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(deg / 45) % 8];
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function formatDateDisplay(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ─── Garden shadow panel ────────────────────────────────────────────────────

interface GardenLayout {
  id: string;
  name: string;
  canvas_w_m: number;
  canvas_h_m: number;
  north_offset_deg: number;
}

interface GardenShadowPanelProps {
  homeId: string;
  latLng: { lat: number; lng: number };
  selectedDate: Date;
}

function GardenShadowPanel({ homeId, latLng, selectedDate }: GardenShadowPanelProps) {
  const [layouts, setLayouts] = useState<GardenLayout[]>([]);
  const [selectedLayoutId, setSelectedLayoutId] = useState<string | null>(null);
  const [shapes, setShapes] = useState<ShapeData[]>([]);
  const [northOffset, setNorthOffset] = useState(0);
  const [canvasW, setCanvasW] = useState(30);
  const [canvasH, setCanvasH] = useState(20);
  const [loading, setLoading] = useState(true);
  const panelCanvasRef = useRef<HTMLCanvasElement>(null);

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
        setShapes(
          (data ?? []).map((s: any) => ({
            ...s,
            points: s.points ?? null,
            extrude_m: s.extrude_m ?? null,
            preset_id: s.preset_id ?? null,
          })),
        );
      });
  }, [selectedLayoutId, layouts]);

  // Render garden shadow canvas
  useEffect(() => {
    const canvas = panelCanvasRef.current;
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
        shape,
        shapes,
        latLng.lat,
        latLng.lng,
        selectedDate,
        northOffset,
      );

      ctx.save();
      const baseColor = shape.color || "#4ade80";
      ctx.fillStyle = inShadow ? blendWithGrey(baseColor, 0.55) : baseColor;
      ctx.strokeStyle = "rgba(0,0,0,0.15)";
      ctx.lineWidth = 0.5;

      const { x: cx, z: cz } = getShapeCentre(shape);
      void cx; void cz;

      const px = shape.x_m * scale + offX;
      const py = shape.y_m * scale + offY;

      if (shape.shape_type === "rect" || shape.shape_type === "path") {
        const pw = (shape.width_m ?? 1) * scale;
        const ph = (shape.height_m ?? 1) * scale;
        ctx.fillRect(px, py, pw, ph);
        ctx.strokeRect(px, py, pw, ph);
      } else if (
        shape.shape_type === "circle" ||
        shape.preset_id === "tree-canopy"
      ) {
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

      ctx.restore();
    }

    // North indicator
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.font = "bold 10px system-ui";
    ctx.textAlign = "left";
    ctx.fillText("N↑", 6, 14);
  }, [shapes, selectedDate, latLng, northOffset, canvasW, canvasH]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 size={20} className="animate-spin text-rhozly-primary" />
      </div>
    );
  }

  if (layouts.length === 0) {
    return (
      <p className="text-xs text-rhozly-on-surface/50 font-semibold text-center py-4">
        No garden layout found. Create one in the Garden Layout tool.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {layouts.length > 1 && (
        <select
          data-testid="sun-tracker-layout-select"
          value={selectedLayoutId ?? ""}
          onChange={e => setSelectedLayoutId(e.target.value)}
          className="w-full text-xs font-bold bg-white border border-rhozly-outline/20 rounded-xl px-3 py-2"
        >
          {layouts.map(l => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      )}
      <div className="rounded-xl overflow-hidden border border-rhozly-outline/15">
        <canvas
          ref={panelCanvasRef}
          width={340}
          height={220}
          className="w-full h-auto"
          data-testid="sun-tracker-garden-canvas"
        />
      </div>
      <div className="flex items-center gap-3 text-[10px] font-bold text-rhozly-on-surface/50">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm bg-amber-200 border border-amber-400 inline-block" />
          In sun
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm bg-slate-300 border border-slate-400 inline-block" />
          In shadow
        </span>
      </div>
    </div>
  );
}

function blendWithGrey(hex: string, t: number): string {
  // Simple hex → grey blend for shadow effect
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return "#aaaaaa";
  const gr = Math.round(r * (1 - t) + 150 * t);
  const gg = Math.round(g * (1 - t) + 160 * t);
  const gb = Math.round(b * (1 - t) + 180 * t);
  return `rgb(${gr},${gg},${gb})`;
}

// ─── Sun info badge ──────────────────────────────────────────────────────────

function SunInfoBadge({
  altitude,
  azimuth,
  selectedDate,
}: {
  altitude: number;
  azimuth: number;
  selectedDate: Date;
}) {
  const altDeg = Math.round(altitude * (180 / Math.PI));
  const compassDeg = Math.round(sunCalcAzimuthToCompassDeg(azimuth));
  const dir = compassLabel(compassDeg);
  const isGoldenHour = altDeg >= 0 && altDeg <= 6;

  return (
    <div className="absolute top-14 left-4 right-4 flex gap-2 flex-wrap">
      <div className="flex items-center gap-1.5 bg-black/40 backdrop-blur-sm rounded-xl px-3 py-1.5">
        <Sun size={12} className="text-amber-300" />
        <span className="text-white text-[11px] font-black">
          {altDeg > 0 ? `${altDeg}° alt` : "Below horizon"}
        </span>
      </div>
      <div className="flex items-center gap-1.5 bg-black/40 backdrop-blur-sm rounded-xl px-3 py-1.5">
        <Compass size={12} className="text-sky-300" />
        <span className="text-white text-[11px] font-black">
          {dir} {compassDeg}°
        </span>
      </div>
      {isGoldenHour && (
        <div className="flex items-center gap-1.5 bg-amber-500/70 backdrop-blur-sm rounded-xl px-3 py-1.5">
          <span className="text-white text-[11px] font-black">✨ Golden Hour</span>
        </div>
      )}
    </div>
  );
}

// ─── Time controls ───────────────────────────────────────────────────────────

interface SunControlsProps {
  selectedDate: Date;
  onDateChange: (d: Date) => void;
  arc: SunArcData | null;
}

function SunControls({ selectedDate, onDateChange, arc }: SunControlsProps) {
  const totalMinutes = selectedDate.getHours() * 60 + selectedDate.getMinutes();

  const handleTimeChange = (minutes: number) => {
    const d = new Date(selectedDate);
    d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
    onDateChange(d);
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const [year, month, day] = e.target.value.split("-").map(Number);
    const d = new Date(selectedDate);
    d.setFullYear(year, month - 1, day);
    onDateChange(d);
  };

  const dateInputValue = selectedDate.toISOString().split("T")[0];

  // Event positions along the 0-1440 scrubber
  const eventMarkers = arc
    ? [
        { time: arc.events.sunrise, label: "SR", icon: "↑" },
        { time: arc.events.solarNoon, label: "Noon", icon: "●" },
        { time: arc.events.sunset, label: "SS", icon: "↓" },
      ]
    : [];

  return (
    <div className="bg-rhozly-surface/95 backdrop-blur-sm border-t border-rhozly-outline/10 px-4 pt-3 pb-2 space-y-2">
      {/* Date row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-sm font-black text-rhozly-on-surface">
          <Sunrise size={14} className="text-amber-500" />
          <span>{formatDateDisplay(selectedDate)}</span>
        </div>
        <input
          data-testid="sun-tracker-date-input"
          type="date"
          value={dateInputValue}
          onChange={handleDateChange}
          className="text-xs font-bold border border-rhozly-outline/20 rounded-lg px-2 py-1 bg-white text-rhozly-on-surface"
        />
      </div>

      {/* Time scrubber */}
      <div className="relative">
        <input
          data-testid="sun-tracker-time-scrubber"
          type="range"
          min={0}
          max={1439}
          value={totalMinutes}
          onChange={e => handleTimeChange(Number(e.target.value))}
          className="w-full h-2 rounded-full accent-amber-500 cursor-pointer"
        />
        {/* Event markers */}
        <div className="relative h-5 mt-0.5">
          {eventMarkers.map(ev => {
            const pos =
              (ev.time.getHours() * 60 + ev.time.getMinutes()) / 1439;
            return (
              <div
                key={ev.label}
                className="absolute flex flex-col items-center"
                style={{ left: `calc(${pos * 100}% - 10px)` }}
              >
                <span className="text-[8px] font-black text-rhozly-on-surface/40">
                  {ev.icon}
                </span>
                <span className="text-[7px] font-bold text-rhozly-on-surface/30 whitespace-nowrap">
                  {formatTime(ev.time)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Current time label */}
      <p className="text-center text-xs font-black text-rhozly-on-surface/60">
        {selectedDate.toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
        })}
        {arc &&
          selectedDate.getTime() >= arc.events.sunrise.getTime() &&
          selectedDate.getTime() <= arc.events.sunset.getTime() && (
            <span className="ml-2 text-amber-500">☀</span>
          )}
      </p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SunTrajectoryAR({ homeId }: Props) {
  const navigate = useNavigate();

  // Time state — start at current moment
  const [selectedDate, setSelectedDate] = useState(() => new Date());

  // Location
  const [latLng, setLatLng] = useState<{ lat: number; lng: number } | null>(null);

  // Camera
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Canvas
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  // Refs for rAF closure (avoid stale state)
  const latLngRef = useRef(latLng);
  const dateRef = useRef(selectedDate);
  const arcRef = useRef<SunArcData | null>(null);
  const orientRef = useRef({ alpha: 0, beta: 90, gamma: 0 });
  const cameraReadyRef = useRef(cameraReady);

  useEffect(() => { latLngRef.current = latLng; }, [latLng]);
  useEffect(() => { dateRef.current = selectedDate; }, [selectedDate]);
  useEffect(() => { cameraReadyRef.current = cameraReady; }, [cameraReady]);

  // Device orientation
  const orientation = useDeviceOrientation();

  useEffect(() => {
    orientRef.current = {
      alpha: orientation.alpha,
      beta: orientation.beta,
      gamma: orientation.gamma,
    };
  }, [orientation.alpha, orientation.beta, orientation.gamma]);

  // Sun arc (re-computed once per calendar day)
  const sunArc = useSunArc(latLng?.lat ?? null, latLng?.lng ?? null, selectedDate);
  useEffect(() => { arcRef.current = sunArc; }, [sunArc]);

  // Current sun info (for badge display — React state, not rAF)
  const sunInfo = useMemo(() => {
    if (!latLng) return null;
    return SunCalc.getPosition(selectedDate, latLng.lat, latLng.lng);
  }, [latLng, selectedDate]);

  // Garden panel
  const [showGardenPanel, setShowGardenPanel] = useState(false);

  // Fetch home lat/lng — fall back to geolocation and persist if not stored
  useEffect(() => {
    if (!homeId) return;
    supabase
      .from("homes")
      .select("lat,lng")
      .eq("id", homeId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.lat != null && data?.lng != null) {
          setLatLng({ lat: data.lat, lng: data.lng });
        } else if ("geolocation" in navigator) {
          navigator.geolocation.getCurrentPosition(
            pos => {
              const lat = pos.coords.latitude;
              const lng = pos.coords.longitude;
              setLatLng({ lat, lng });
              supabase.from("homes").update({ lat, lng }).eq("id", homeId);
            },
            () => {},
          );
        }
      });
  }, [homeId]);

  // Camera setup
  useEffect(() => {
    let active = true;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: "environment" } } })
      .then(stream => {
        if (!active) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().then(() => {
            if (active) setCameraReady(true);
          }).catch(() => {
            if (active) setCameraError("Could not start camera preview");
          });
        }
      })
      .catch(() => {
        if (active) setCameraError("Camera unavailable — sky dome view active");
      });
    return () => {
      active = false;
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  // Canvas draw loop
  const startDrawLoop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) { rafRef.current = requestAnimationFrame(draw); return; }

      const ll = latLngRef.current;
      const date = dateRef.current;
      const arc = arcRef.current;
      const orient = orientRef.current;
      const isCameraUp = cameraReadyRef.current;

      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      if (!ll) { rafRef.current = requestAnimationFrame(draw); return; }

      const sunPos = SunCalc.getPosition(date, ll.lat, ll.lng);
      const alphaRad = orient.alpha * DEG;
      const cameraTilt = (orient.beta - 90) * DEG;
      const selectedMs = date.getTime();

      if (isCameraUp) {
        // AR overlay mode
        if (arc) {
          drawArcOnCanvas(ctx, W, H, arc, alphaRad, cameraTilt, selectedMs);
        }

        const proj = projectSunToScreen(
          sunPos.azimuth,
          sunPos.altitude,
          alphaRad,
          cameraTilt,
        );

        if (proj.visible) {
          drawSunOrb(ctx, proj.x * W, proj.y * H);
        } else if (sunPos.altitude > 0) {
          drawEdgeArrow(ctx, W, H, proj.edgeAngle);
        }

        if (sunPos.altitude > 0.05) {
          drawShadowArrow(ctx, W, H, sunPos.azimuth, sunPos.altitude);
        }

        if (orientation.granted) {
          drawHorizonLine(ctx, W, H, cameraTilt);
          drawCompassBadge(ctx, W, alphaRad);
        }
      } else {
        // Sky dome fallback
        drawSkyDome(ctx, W, H, sunPos, arc, 0, selectedMs);
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [orientation.granted]);

  useEffect(() => {
    return startDrawLoop();
  }, [startDrawLoop]);

  // Resize canvas to container
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const needsOrientationPrompt =
    orientation.supported &&
    !orientation.granted &&
    typeof (DeviceOrientationEvent as any).requestPermission === "function";

  return (
    <div className="flex flex-col h-full bg-black overflow-hidden">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center gap-3 px-4 py-3 bg-gradient-to-b from-black/60 to-transparent">
        <button
          data-testid="sun-tracker-back"
          onClick={() => navigate("/tools")}
          className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <h1 className="text-white font-black text-base leading-tight">
            Sun Tracker
          </h1>
          {latLng ? (
            <p className="text-white/60 text-[10px] font-semibold flex items-center gap-1">
              <MapPin size={8} />
              {latLng.lat.toFixed(3)}, {latLng.lng.toFixed(3)}
            </p>
          ) : (
            <p className="text-amber-300/70 text-[10px] font-semibold">
              No home location set
            </p>
          )}
        </div>
        {!orientation.granted && orientation.supported && (
          <div className="flex items-center gap-1.5 bg-black/40 backdrop-blur-sm rounded-xl px-2.5 py-1.5">
            <Compass size={12} className="text-amber-300" />
            <span className="text-white/70 text-[10px] font-bold">Dome view</span>
          </div>
        )}
      </div>

      {/* Camera + canvas */}
      <div ref={containerRef} className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          className={`absolute inset-0 w-full h-full object-cover${cameraReady ? "" : " hidden"}`}
          playsInline
          muted
        />
        {!cameraReady && !cameraError && (
          <div className="absolute inset-0 flex items-center justify-center bg-sky-900">
            <Loader2 size={32} className="animate-spin text-white/50" />
          </div>
        )}
        {!cameraReady && cameraError && (
          <div className="absolute inset-0 bg-gradient-to-b from-sky-800 to-sky-950" />
        )}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          data-testid="sun-tracker-canvas"
        />

        {/* Sun info badge */}
        {sunInfo && (
          <SunInfoBadge
            altitude={sunInfo.altitude}
            azimuth={sunInfo.azimuth}
            selectedDate={selectedDate}
          />
        )}

        {/* Orientation permission prompt (iOS) */}
        {needsOrientationPrompt && (
          <div className="absolute bottom-4 left-4 right-4 bg-black/60 backdrop-blur-sm rounded-2xl p-4 flex items-center gap-3">
            <Compass size={20} className="text-amber-300 shrink-0" />
            <div className="flex-1">
              <p className="text-white text-xs font-black">Enable compass for AR mode</p>
              <p className="text-white/60 text-[10px] font-semibold">
                Allows the sun to track as you move your phone
              </p>
            </div>
            <button
              data-testid="sun-tracker-orientation-prompt"
              onClick={orientation.requestPermission}
              className="bg-amber-500 text-white text-xs font-black px-3 py-2 rounded-xl shrink-0"
            >
              Enable
            </button>
          </div>
        )}

        {/* No location warning */}
        {!latLng && (
          <div className="absolute bottom-4 left-4 right-4 bg-black/50 backdrop-blur-sm rounded-2xl p-3 flex items-center gap-2">
            <AlertCircle size={16} className="text-amber-300 shrink-0" />
            <p className="text-white/80 text-xs font-semibold">
              Add your home's coordinates in Home Settings for accurate sun positioning.
            </p>
          </div>
        )}
      </div>

      {/* Time controls */}
      <SunControls
        selectedDate={selectedDate}
        onDateChange={setSelectedDate}
        arc={sunArc}
      />

      {/* Garden shadow panel */}
      <div className="bg-rhozly-surface/95 backdrop-blur-sm border-t border-rhozly-outline/10">
        <button
          data-testid="sun-tracker-garden-panel-toggle"
          onClick={() => setShowGardenPanel(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3"
        >
          <div className="flex items-center gap-2">
            <Sun size={14} className="text-amber-500" />
            <span className="text-sm font-black text-rhozly-on-surface">
              Garden Shadow Map
            </span>
          </div>
          {showGardenPanel ? (
            <ChevronDown size={16} className="text-rhozly-on-surface/40" />
          ) : (
            <ChevronUp size={16} className="text-rhozly-on-surface/40" />
          )}
        </button>

        {showGardenPanel && latLng && (
          <div className="px-4 pb-4">
            <GardenShadowPanel
              homeId={homeId}
              latLng={latLng}
              selectedDate={selectedDate}
            />
          </div>
        )}
        {showGardenPanel && !latLng && (
          <p className="px-4 pb-4 text-xs text-rhozly-on-surface/40 font-semibold">
            Home location required for shadow mapping.
          </p>
        )}
      </div>

      {/* Sunset/Sunrise info row */}
      {sunArc && (
        <div className="bg-rhozly-surface/95 border-t border-rhozly-outline/10 px-4 py-2 flex justify-between text-[10px] font-black text-rhozly-on-surface/50">
          <span className="flex items-center gap-1">
            <Sunrise size={10} className="text-amber-400" />
            {formatTime(sunArc.events.sunrise)}
          </span>
          <span className="flex items-center gap-1">
            <Sun size={10} className="text-amber-400" />
            Noon {formatTime(sunArc.events.solarNoon)}
          </span>
          <span className="flex items-center gap-1">
            <Sunset size={10} className="text-amber-400" />
            {formatTime(sunArc.events.sunset)}
          </span>
        </div>
      )}
    </div>
  );
}
