import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Compass,
  Sunrise,
  Sunset,
  Sun,
  AlertCircle,
  Loader2,
  RefreshCw,
  HelpCircle,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import SunCalc from "suncalc";
import { supabase } from "../lib/supabase";
import { useDeviceOrientation } from "../hooks/useDeviceOrientation";
import { useSunArc } from "../hooks/useSunArc";
import type { SunArcData } from "../hooks/useSunArc";
import SunTrackerHeader, { type SunMode } from "./sun/SunTrackerHeader";
import SunGardenMap from "./sun/SunGardenMap";
import SunYearView from "./sun/SunYearView";
import { OrientationFilter } from "../lib/sun/orientationFilter";
import {
  projectSunToScreen,
  projectSunToDome,
  sunCalcAzimuthToCompassDeg,
  shadowBearingDeg,
  shadowLengthMultiplier,
  DEFAULT_HFOV_RAD,
  DEFAULT_VFOV_RAD,
} from "../lib/sunProjection";

const DEG = Math.PI / 180;

interface Props {
  homeId: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Canvas drawing helpers (module-level pure functions)
// ─────────────────────────────────────────────────────────────────────────────

function drawSunOrb(ctx: CanvasRenderingContext2D, sx: number, sy: number) {
  // Subtle glow pulse — 1 cycle per 4 s (90% to 110% glow radius)
  const pulse = 1 + 0.1 * Math.sin((Date.now() / 4000) * 2 * Math.PI);
  const glowR = 44 * pulse;

  // Outer glow
  const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, glowR);
  glow.addColorStop(0, "rgba(253,186,116,0.7)");
  glow.addColorStop(0.4, "rgba(251,146,60,0.35)");
  glow.addColorStop(1, "rgba(251,146,60,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(sx, sy, glowR, 0, 2 * Math.PI);
  ctx.fill();

  // Core — unchanged size
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
    <div className="absolute top-32 left-4 right-4 flex gap-2 flex-wrap z-10">
      <div className="flex items-center gap-1.5 bg-black/65 backdrop-blur-sm rounded-xl px-3 py-2 border border-white/15 shadow-md">
        <Sun size={14} className="text-amber-300" />
        <span className="text-white text-xs font-black">
          {altDeg > 0 ? `${altDeg}° alt` : "Below horizon"}
        </span>
      </div>
      <div className="flex items-center gap-1.5 bg-black/65 backdrop-blur-sm rounded-xl px-3 py-2 border border-white/15 shadow-md">
        <Compass size={14} className="text-sky-300" />
        <span className="text-white text-xs font-black">
          {dir} {compassDeg}°
        </span>
      </div>
      {isGoldenHour && (
        <div className="flex items-center gap-1.5 bg-amber-500 backdrop-blur-sm rounded-xl px-3 py-2 border border-amber-200/40 shadow-md">
          <span className="text-white text-xs font-black">✨ Golden Hour</span>
        </div>
      )}
    </div>
  );
}

// ─── First-visit coach overlay ───────────────────────────────────────────────

function CoachOverlay({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="absolute inset-0 z-30 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-300">
      <div className="bg-rhozly-bg rounded-3xl w-full max-w-sm shadow-2xl border border-rhozly-outline/10 overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="px-5 pt-6 pb-4 text-center">
          <div className="inline-block bg-amber-500/15 p-3 rounded-2xl mb-3">
            <Sun size={28} className="text-amber-500" />
          </div>
          <h3 className="font-display font-black text-lg text-rhozly-on-surface mb-1">
            Welcome to the Sun Tracker
          </h3>
          <p className="text-xs font-bold text-rhozly-on-surface/60 leading-relaxed">
            See where the sun is right now, scrub through the day, and check
            which beds get the most light.
          </p>
        </div>
        <div className="px-5 pb-2 space-y-2.5">
          <div className="flex items-start gap-3">
            <div className="bg-amber-500/10 p-2 rounded-xl shrink-0">
              <Sun size={14} className="text-amber-500" />
            </div>
            <div>
              <p className="text-xs font-black text-rhozly-on-surface">Live AR</p>
              <p className="text-[11px] font-bold text-rhozly-on-surface/55 leading-snug">
                Hold your phone up to overlay the sun on the real sky.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="bg-sky-500/10 p-2 rounded-xl shrink-0">
              <Compass size={14} className="text-sky-500" />
            </div>
            <div>
              <p className="text-xs font-black text-rhozly-on-surface">Sky View</p>
              <p className="text-[11px] font-bold text-rhozly-on-surface/55 leading-snug">
                A top-down dome showing today's sun path.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="bg-emerald-500/10 p-2 rounded-xl shrink-0">
              <HelpCircle size={14} className="text-emerald-600" />
            </div>
            <div>
              <p className="text-xs font-black text-rhozly-on-surface">Garden Map</p>
              <p className="text-[11px] font-bold text-rhozly-on-surface/55 leading-snug">
                See sun + shadow over your garden layout for any time of day.
              </p>
            </div>
          </div>
        </div>
        <div className="px-5 pb-5 pt-3">
          <button
            data-testid="sun-tracker-coach-dismiss"
            onClick={onDismiss}
            className="w-full py-3 min-h-[44px] bg-amber-500 hover:bg-amber-600 text-white rounded-2xl font-black text-sm transition-colors flex items-center justify-center gap-2"
          >
            Got it
          </button>
        </div>
      </div>
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
          className="text-xs font-bold border border-rhozly-outline/20 rounded-xl px-3 py-2 min-h-[44px] bg-white text-rhozly-on-surface"
        />
      </div>

      {/* Time scrubber */}
      <div className="relative py-2">
        <input
          data-testid="sun-tracker-time-scrubber"
          type="range"
          min={0}
          max={1439}
          value={totalMinutes}
          onChange={e => handleTimeChange(Number(e.target.value))}
          className="w-full h-3 rounded-full accent-amber-500 cursor-pointer touch-none"
          aria-label="Time of day"
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

  // Low-pass filter to smooth compass / tilt jitter — wraps raw orientation
  // values before they reach the rAF draw loop. Window of 5 samples balances
  // smoothness against responsiveness when the user turns the phone.
  const orientFilterRef = useRef(new OrientationFilter(5));
  useEffect(() => {
    if (!orientation.granted) return;
    orientRef.current = orientFilterRef.current.push({
      alpha: orientation.alpha,
      beta: orientation.beta,
      gamma: orientation.gamma,
    });
  }, [orientation.alpha, orientation.beta, orientation.gamma, orientation.granted]);

  // Sun arc (re-computed once per calendar day)
  const sunArc = useSunArc(latLng?.lat ?? null, latLng?.lng ?? null, selectedDate);
  useEffect(() => { arcRef.current = sunArc; }, [sunArc]);

  // Current sun info (for badge display — React state, not rAF)
  const sunInfo = useMemo(() => {
    if (!latLng) return null;
    return SunCalc.getPosition(selectedDate, latLng.lat, latLng.lng);
  }, [latLng, selectedDate]);

  // Mode: ar (camera) / dome (sky-only) / garden (top-down map) / year
  // Start in URL-supplied mode if valid, else "garden" until camera is known.
  // (Avoids flashing AR while camera initialises.)
  const [searchParams, setSearchParams] = useSearchParams();
  const initialMode: SunMode = (() => {
    const m = searchParams.get("mode");
    if (m === "ar" || m === "dome" || m === "garden" || m === "year") return m;
    return "garden";
  })();
  const [mode, setMode] = useState<SunMode>(initialMode);
  // If user landed via a handoff (mode in URL), treat as an explicit choice so
  // the camera-ready effect doesn't override it.
  const userPickedMode = useRef(searchParams.get("mode") !== null);

  // Strip the ?mode= param after consumption so back-navigation doesn't replay it
  useEffect(() => {
    if (searchParams.get("mode")) {
      const next = new URLSearchParams(searchParams);
      next.delete("mode");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Coach overlay — shown once per browser
  const [showCoach, setShowCoach] = useState(() => {
    try {
      return localStorage.getItem("rhozly_sun_tracker_coach") !== "dismissed";
    } catch {
      return true;
    }
  });
  const dismissCoach = () => {
    setShowCoach(false);
    try { localStorage.setItem("rhozly_sun_tracker_coach", "dismissed"); } catch { /* ignore */ }
  };

  // Camera retry tick
  const [cameraRetryTick, setCameraRetryTick] = useState(0);

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

  // Camera setup — retries when cameraRetryTick changes
  useEffect(() => {
    let active = true;
    setCameraError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera not supported on this device");
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: "environment" } } })
      .then(stream => {
        if (!active) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().then(() => {
            if (active) {
              setCameraReady(true);
              // Auto-pick AR mode the first time the camera comes up unless
              // the user has already switched modes themselves.
              if (!userPickedMode.current) setMode("ar");
            }
          }).catch(() => {
            if (active) setCameraError("Could not start camera preview");
          });
        }
      })
      .catch(err => {
        if (!active) return;
        const message =
          err?.name === "NotAllowedError"
            ? "Camera permission denied — enable in browser settings, then retry"
            : err?.name === "NotFoundError"
              ? "No camera detected on this device"
              : "Camera unavailable";
        setCameraError(message);
      });
    return () => {
      active = false;
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, [cameraRetryTick]);

  // Wrap setMode so we know the user explicitly chose it
  const handleModeChange = useCallback((m: SunMode) => {
    userPickedMode.current = true;
    setMode(m);
  }, []);

  // Canvas draw loop — with battery-saver:
  //   • Suspends entirely when document.hidden (resumes on visibilitychange)
  //   • Skips frames when idle (no orientation change > 1° or date unchanged
  //     for > 30s) — effectively 5 fps when stationary
  //   • Returns early when current mode doesn't use the canvas
  const modeRef = useRef<SunMode>(mode);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  const startDrawLoop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let frameCount = 0;
    let lastChangeMs = Date.now();
    let lastAlpha = orientRef.current.alpha;
    let lastBeta  = orientRef.current.beta;
    let lastDateMs = dateRef.current.getTime();

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      if (document.hidden) return;
      const m = modeRef.current;
      if (m !== "ar" && m !== "dome") return;

      // Idle detection — significant change resets the clock
      const orient = orientRef.current;
      const dateMs = dateRef.current.getTime();
      const angularDelta = Math.min(
        Math.abs(orient.alpha - lastAlpha),
        360 - Math.abs(orient.alpha - lastAlpha),
      );
      if (angularDelta > 1 || Math.abs(orient.beta - lastBeta) > 1 || dateMs !== lastDateMs) {
        lastChangeMs = Date.now();
        lastAlpha = orient.alpha;
        lastBeta = orient.beta;
        lastDateMs = dateMs;
      }
      const idle = (Date.now() - lastChangeMs) > 30_000;
      frameCount++;
      // 60 fps active; when idle, throttle to 5 fps (every 12th frame)
      if (idle && frameCount % 12 !== 0) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const ll = latLngRef.current;
      const date = dateRef.current;
      const arc = arcRef.current;
      const isCameraUp = cameraReadyRef.current;

      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      if (!ll) return;

      const sunPos = SunCalc.getPosition(date, ll.lat, ll.lng);
      const alphaRad = orient.alpha * DEG;
      const cameraTilt = (orient.beta - 90) * DEG;
      const selectedMs = date.getTime();

      if (isCameraUp) {
        if (arc) drawArcOnCanvas(ctx, W, H, arc, alphaRad, cameraTilt, selectedMs);
        const proj = projectSunToScreen(sunPos.azimuth, sunPos.altitude, alphaRad, cameraTilt);
        if (proj.visible) drawSunOrb(ctx, proj.x * W, proj.y * H);
        else if (sunPos.altitude > 0) drawEdgeArrow(ctx, W, H, proj.edgeAngle);
        if (sunPos.altitude > 0.05) drawShadowArrow(ctx, W, H, sunPos.azimuth, sunPos.altitude);
        if (orientation.granted) {
          drawHorizonLine(ctx, W, H, cameraTilt);
          drawCompassBadge(ctx, W, alphaRad);
        }
      } else {
        drawSkyDome(ctx, W, H, sunPos, arc, 0, selectedMs);
      }
    };

    // Resume rAF when tab regains visibility — fires a fresh draw scheduler
    const onVisibility = () => {
      if (!document.hidden) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(draw);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(rafRef.current);
      document.removeEventListener("visibilitychange", onVisibility);
    };
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

  const cameraAvailable = cameraReady;
  const showsCameraView = mode === "ar" && cameraReady;
  const showsCanvas = mode === "ar" || mode === "dome";

  // Time-of-day gradient for the dome view background — derived from current
  // sun altitude. Below-horizon = night, low = golden hour, high = midday blue.
  const skyGradient = useMemo(() => {
    const altDeg = sunInfo ? sunInfo.altitude * (180 / Math.PI) : 30;
    if (altDeg < -6)  return "linear-gradient(to bottom, #0a0e2e 0%, #1a1d4a 50%, #2d1845 100%)";
    if (altDeg < 0)   return "linear-gradient(to bottom, #1d2a5e 0%, #5e3a6e 50%, #c44569 100%)";
    if (altDeg < 6)   return "linear-gradient(to bottom, #3b5b9b 0%, #c66f4d 60%, #f4a261 100%)";
    if (altDeg < 30)  return "linear-gradient(to bottom, #2563eb 0%, #5b8ec4 50%, #a8d0ed 100%)";
    return "linear-gradient(to bottom, #1e40af 0%, #3b82f6 50%, #93c5fd 100%)";
  }, [sunInfo]);

  return (
    <div className="flex flex-col h-full bg-black overflow-hidden">
      {/* Header — title + day length + mode tabs */}
      <SunTrackerHeader
        mode={mode}
        onModeChange={handleModeChange}
        onBack={() => navigate("/tools")}
        latLng={latLng}
        selectedDate={selectedDate}
        dayLengthHours={sunArc?.dayLengthHours ?? null}
        cameraAvailable={cameraAvailable}
        sunArc={sunArc}
      />

      {/* Body switches per mode */}
      <div ref={containerRef} className="relative flex-1 overflow-hidden">
        {/* Camera feed — only visible in AR mode when ready */}
        <video
          ref={videoRef}
          className={`absolute inset-0 w-full h-full object-cover ${showsCameraView ? "" : "hidden"}`}
          playsInline
          muted
        />

        {/* Time-of-day sky gradient for dome mode or when camera not ready */}
        {!showsCameraView && showsCanvas && (
          <div
            data-testid="sun-tracker-sky-gradient"
            className="absolute inset-0 transition-[background] duration-700"
            style={{ background: skyGradient }}
          />
        )}

        {/* Loading spinner while camera initialises in AR mode */}
        {mode === "ar" && !cameraReady && !cameraError && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 size={32} className="animate-spin text-white/50" />
          </div>
        )}

        {/* Sky-dome / AR overlay canvas */}
        {showsCanvas && (
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full"
            data-testid="sun-tracker-canvas"
          />
        )}

        {/* Sun info badge — only in AR / Sky View */}
        {sunInfo && showsCanvas && (
          <SunInfoBadge
            altitude={sunInfo.altitude}
            azimuth={sunInfo.azimuth}
            selectedDate={selectedDate}
          />
        )}

        {/* Garden Map mode — top-down garden view at full bleed */}
        {mode === "garden" && (
          <div className="absolute inset-0 bg-rhozly-bg overflow-y-auto pt-36 px-4 pb-4 animate-in fade-in duration-300">
            {latLng ? (
              <SunGardenMap
                homeId={homeId}
                latLng={latLng}
                selectedDate={selectedDate}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center px-6 py-12">
                <AlertCircle size={32} className="text-amber-500 mb-3" />
                <p className="text-sm font-black text-rhozly-on-surface mb-1">
                  Home location required
                </p>
                <p className="text-xs font-bold text-rhozly-on-surface/50">
                  Add your home's coordinates in Home Settings to see your garden's sun pattern.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Year View mode — day-length curve + seasonal compare */}
        {mode === "year" && (
          <div className="absolute inset-0 bg-rhozly-bg overflow-y-auto pt-36 px-4 pb-4 animate-in fade-in duration-300">
            {latLng ? (
              <SunYearView
                latLng={latLng}
                selectedDate={selectedDate}
                onDateChange={setSelectedDate}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center px-6 py-12">
                <AlertCircle size={32} className="text-amber-500 mb-3" />
                <p className="text-sm font-black text-rhozly-on-surface mb-1">
                  Home location required
                </p>
                <p className="text-xs font-bold text-rhozly-on-surface/50">
                  Add your home's coordinates in Home Settings to see seasonal sun patterns.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Camera permission denied / unavailable — show retry card in AR mode */}
        {mode === "ar" && cameraError && (
          <div className="absolute bottom-24 left-4 right-4 bg-black/70 backdrop-blur-md rounded-2xl p-4 flex items-start gap-3 border border-white/10">
            <AlertCircle size={20} className="text-amber-300 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-black mb-1">Camera unavailable</p>
              <p className="text-white/60 text-xs font-semibold leading-snug mb-3">
                {cameraError}. You can still use Sky View or Garden Map.
              </p>
              <div className="flex gap-2 flex-wrap">
                <button
                  data-testid="sun-tracker-camera-retry"
                  onClick={() => setCameraRetryTick(t => t + 1)}
                  className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-black px-3 py-2 min-h-[36px] rounded-xl border border-white/15 transition-colors"
                >
                  <RefreshCw size={12} /> Retry
                </button>
                <button
                  onClick={() => handleModeChange("dome")}
                  className="text-white/70 hover:text-white text-xs font-bold px-3 py-2 min-h-[36px] rounded-xl transition-colors"
                >
                  Use Sky View
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Compass permission prompt (iOS) — only relevant in AR mode */}
        {mode === "ar" && needsOrientationPrompt && !cameraError && (
          <div className="absolute bottom-24 left-4 right-4 bg-black/70 backdrop-blur-md rounded-2xl p-4 border border-white/10">
            <div className="flex items-start gap-3">
              <Compass size={20} className="text-amber-300 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-white text-sm font-black mb-1">Enable compass</p>
                <p className="text-white/60 text-[11px] font-semibold leading-snug mb-3">
                  The compass lets the sun stay locked to its real direction as you turn your phone. Without it, the overlay is a rough estimate.
                </p>
                <button
                  data-testid="sun-tracker-orientation-prompt"
                  onClick={orientation.requestPermission}
                  className="bg-amber-500 hover:bg-amber-600 text-white text-xs font-black px-4 py-2 min-h-[36px] rounded-xl transition-colors"
                >
                  Enable compass
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Coach overlay — shown once until dismissed */}
        {showCoach && (
          <CoachOverlay onDismiss={dismissCoach} />
        )}
      </div>

      {/* Time controls — always visible */}
      <SunControls
        selectedDate={selectedDate}
        onDateChange={setSelectedDate}
        arc={sunArc}
      />

      {/* Sunset/Sunrise info row */}
      {sunArc && (
        <div className="bg-rhozly-surface/95 border-t border-rhozly-outline/10 px-4 py-2.5 flex justify-between text-xs font-black text-rhozly-on-surface/70">
          <span className="flex items-center gap-1.5">
            <Sunrise size={13} className="text-amber-500" />
            {formatTime(sunArc.events.sunrise)}
          </span>
          <span className="flex items-center gap-1.5">
            <Sun size={13} className="text-amber-500" />
            Noon {formatTime(sunArc.events.solarNoon)}
          </span>
          <span className="flex items-center gap-1.5">
            <Sunset size={13} className="text-amber-500" />
            {formatTime(sunArc.events.sunset)}
          </span>
        </div>
      )}
    </div>
  );
}
