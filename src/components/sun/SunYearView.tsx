import React, { useMemo, useState } from "react";
import { Calendar, Layers, Sunrise, Sunset } from "lucide-react";
import SunCalc from "suncalc";
import { computeSunArc } from "../../hooks/useSunArc";
import { projectSunToDome } from "../../lib/sunProjection";

interface Props {
  latLng: { lat: number; lng: number };
  selectedDate: Date;
  onDateChange: (d: Date) => void;
}

interface YearSample {
  date: Date;
  dayOfYear: number;     // 0..365
  dayLengthHours: number; // 0..24
}

interface KeyEvent {
  date: Date;
  label: string;
  type: "solstice-summer" | "solstice-winter" | "equinox-spring" | "equinox-autumn";
}

const CHART_HEIGHT = 180;
const CHART_PADDING_X = 14;
const CHART_PADDING_TOP = 16;
const CHART_PADDING_BOTTOM = 24;

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function startOfYear(d: Date): Date {
  return new Date(d.getFullYear(), 0, 1);
}
function endOfYear(d: Date): Date {
  return new Date(d.getFullYear(), 11, 31, 23, 59, 59);
}
function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function computeDayLengthHours(lat: number, lng: number, date: Date): number {
  const t = SunCalc.getTimes(date, lat, lng);
  const ms = t.sunset.getTime() - t.sunrise.getTime();
  if (!isFinite(ms) || ms <= 0) return 0;
  return ms / 3_600_000;
}

function buildYearSamples(lat: number, lng: number, year: number): YearSample[] {
  const samples: YearSample[] = [];
  const start = new Date(year, 0, 1);
  // 73 samples (every 5 days) — smooth enough, computes fast
  for (let day = 0; day <= 365; day += 5) {
    const d = addDays(start, day);
    samples.push({
      date: d,
      dayOfYear: day,
      dayLengthHours: computeDayLengthHours(lat, lng, d),
    });
  }
  return samples;
}

function findKeyEvents(samples: YearSample[]): KeyEvent[] {
  if (samples.length < 4) return [];
  // Solstices = extrema in day length
  let maxIdx = 0;
  let minIdx = 0;
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].dayLengthHours > samples[maxIdx].dayLengthHours) maxIdx = i;
    if (samples[i].dayLengthHours < samples[minIdx].dayLengthHours) minIdx = i;
  }
  // Equinoxes = where day length crosses 12h (rising for spring, falling for autumn)
  const equinoxes: KeyEvent[] = [];
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1].dayLengthHours - 12;
    const b = samples[i].dayLengthHours - 12;
    if (a * b < 0) {
      // Linear interpolate the crossing day
      const t = a / (a - b);
      const dayOfYear = samples[i - 1].dayOfYear + t * (samples[i].dayOfYear - samples[i - 1].dayOfYear);
      const d = addDays(startOfYear(samples[0].date), Math.round(dayOfYear));
      equinoxes.push({
        date: d,
        label: b > a ? "Spring equinox" : "Autumn equinox",
        type: b > a ? "equinox-spring" : "equinox-autumn",
      });
    }
  }
  return [
    { date: samples[maxIdx].date, label: "Longest day", type: "solstice-summer" },
    ...equinoxes,
    { date: samples[minIdx].date, label: "Shortest day", type: "solstice-winter" },
  ].sort((a, b) => a.date.getTime() - b.date.getTime());
}

function eventColor(type: KeyEvent["type"]): string {
  switch (type) {
    case "solstice-summer": return "#f59e0b"; // amber
    case "solstice-winter": return "#60a5fa"; // sky blue
    case "equinox-spring":  return "#22c55e"; // emerald
    case "equinox-autumn":  return "#a78bfa"; // violet
  }
}

function formatHoursMinutes(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h} h ${m.toString().padStart(2, "0")} m`;
}

function dateLabel(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default function SunYearView({ latLng, selectedDate, onDateChange }: Props) {
  const [compareMode, setCompareMode] = useState(false);
  const [chartWidth, setChartWidth] = useState(360);
  const chartRef = React.useRef<SVGSVGElement>(null);

  // Re-sample when year or lat/lng changes
  const samples = useMemo(
    () => buildYearSamples(latLng.lat, latLng.lng, selectedDate.getFullYear()),
    [latLng.lat, latLng.lng, selectedDate.getFullYear()],
  );
  const keyEvents = useMemo(() => findKeyEvents(samples), [samples]);

  // Track resize
  React.useEffect(() => {
    const measure = () => {
      if (chartRef.current) {
        setChartWidth(chartRef.current.getBoundingClientRect().width);
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (chartRef.current) ro.observe(chartRef.current);
    return () => ro.disconnect();
  }, []);

  const innerW = chartWidth - CHART_PADDING_X * 2;
  const innerH = CHART_HEIGHT - CHART_PADDING_TOP - CHART_PADDING_BOTTOM;
  const minH = Math.min(...samples.map(s => s.dayLengthHours));
  const maxH = Math.max(...samples.map(s => s.dayLengthHours));
  const pad = Math.max(0.5, (maxH - minH) * 0.1);
  const yMin = Math.max(0, minH - pad);
  const yMax = Math.min(24, maxH + pad);

  const dayToX = (dayOfYear: number) => CHART_PADDING_X + (dayOfYear / 365) * innerW;
  const hoursToY = (hours: number) =>
    CHART_PADDING_TOP + innerH - ((hours - yMin) / (yMax - yMin)) * innerH;

  const pathD = useMemo(() => {
    if (samples.length === 0) return "";
    return samples.map((s, i) => {
      const x = dayToX(s.dayOfYear).toFixed(1);
      const y = hoursToY(s.dayLengthHours).toFixed(1);
      return `${i === 0 ? "M" : "L"} ${x} ${y}`;
    }).join(" ");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [samples, chartWidth, yMin, yMax]);

  // Filled area under the curve for visual interest
  const areaD = useMemo(() => {
    if (samples.length === 0) return "";
    const top = samples.map((s, i) => {
      const x = dayToX(s.dayOfYear).toFixed(1);
      const y = hoursToY(s.dayLengthHours).toFixed(1);
      return `${i === 0 ? "M" : "L"} ${x} ${y}`;
    }).join(" ");
    const right = `L ${dayToX(365).toFixed(1)} ${(CHART_PADDING_TOP + innerH).toFixed(1)}`;
    const left = `L ${dayToX(0).toFixed(1)} ${(CHART_PADDING_TOP + innerH).toFixed(1)} Z`;
    return `${top} ${right} ${left}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [samples, chartWidth, yMin, yMax]);

  const selectedDayOfYear = daysBetween(startOfYear(selectedDate), selectedDate);
  const todayDayLength = computeDayLengthHours(latLng.lat, latLng.lng, selectedDate);

  // Next solstice countdown — pick the next key event after today, prefer solstices
  const nextSolstice = useMemo(() => {
    const today = selectedDate.getTime();
    const solstices = keyEvents.filter(
      e => e.type === "solstice-summer" || e.type === "solstice-winter",
    );
    // Also include next year's solstices
    if (solstices.length > 0) {
      const nextYear = solstices.map(s => ({
        ...s,
        date: new Date(s.date.getFullYear() + 1, s.date.getMonth(), s.date.getDate()),
      }));
      const all = [...solstices, ...nextYear]
        .filter(e => e.date.getTime() > today)
        .sort((a, b) => a.date.getTime() - b.date.getTime());
      return all[0] ?? null;
    }
    return null;
  }, [keyEvents, selectedDate]);

  const daysToNextSolstice = nextSolstice
    ? Math.ceil((nextSolstice.date.getTime() - selectedDate.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const handleChartClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const localX = cx * (chartWidth / rect.width);
    const fraction = Math.max(0, Math.min(1, (localX - CHART_PADDING_X) / innerW));
    const dayOfYear = Math.round(fraction * 365);
    const newDate = addDays(startOfYear(selectedDate), dayOfYear);
    // Preserve current time-of-day
    newDate.setHours(selectedDate.getHours(), selectedDate.getMinutes(), 0, 0);
    onDateChange(newDate);
  };

  return (
    <div className="space-y-4">
      {/* Info card */}
      <div className="bg-white rounded-2xl border border-rhozly-outline/15 px-4 py-3 flex items-start gap-3">
        <div className="bg-amber-500/10 p-2 rounded-xl shrink-0">
          <Calendar size={16} className="text-amber-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40">
            {selectedDate.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
          </p>
          <p className="text-base font-black text-rhozly-on-surface leading-tight">
            {formatHoursMinutes(todayDayLength)} of daylight
          </p>
          {nextSolstice && daysToNextSolstice != null && (
            <p className="text-[11px] font-bold text-rhozly-on-surface/60 mt-0.5">
              {nextSolstice.label.toLowerCase()} in {daysToNextSolstice} {daysToNextSolstice === 1 ? "day" : "days"}
              <span className="text-rhozly-on-surface/30"> · {dateLabel(nextSolstice.date)}</span>
            </p>
          )}
        </div>
      </div>

      {/* Year chart */}
      <div className="bg-white rounded-2xl border border-rhozly-outline/15 p-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 px-2 pt-1 pb-2">
          Day length across {selectedDate.getFullYear()} · tap to jump
        </p>
        <svg
          ref={chartRef}
          data-testid="sun-tracker-year-chart"
          viewBox={`0 0 ${chartWidth} ${CHART_HEIGHT}`}
          width="100%"
          height={CHART_HEIGHT}
          onClick={handleChartClick}
          className="cursor-pointer"
        >
          <defs>
            <linearGradient id="sun-year-area" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#fde68a" stopOpacity="0.7" />
              <stop offset="100%" stopColor="#fde68a" stopOpacity="0.05" />
            </linearGradient>
          </defs>

          {/* Month grid lines */}
          {MONTH_LABELS.map((label, i) => {
            const d = new Date(selectedDate.getFullYear(), i, 1);
            const dayOfYear = daysBetween(startOfYear(d), d);
            const x = dayToX(dayOfYear);
            return (
              <g key={label}>
                <line
                  x1={x}
                  x2={x}
                  y1={CHART_PADDING_TOP}
                  y2={CHART_PADDING_TOP + innerH}
                  stroke="#e5e7eb"
                  strokeWidth={0.5}
                />
                <text
                  x={x}
                  y={CHART_HEIGHT - 6}
                  textAnchor="start"
                  fontSize="9"
                  fontWeight="700"
                  fill="#94a3b8"
                >
                  {label}
                </text>
              </g>
            );
          })}

          {/* Filled area */}
          <path d={areaD} fill="url(#sun-year-area)" />

          {/* Day-length curve */}
          <path
            d={pathD}
            fill="none"
            stroke="#f59e0b"
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Key event markers */}
          {keyEvents.map((ev) => {
            const dayOfYear = daysBetween(startOfYear(ev.date), ev.date);
            const dayLength = computeDayLengthHours(latLng.lat, latLng.lng, ev.date);
            const x = dayToX(dayOfYear);
            const y = hoursToY(dayLength);
            return (
              <g key={ev.label + ev.date.getTime()}>
                <circle cx={x} cy={y} r={5} fill={eventColor(ev.type)} stroke="white" strokeWidth={2} />
                <text
                  x={x}
                  y={y - 9}
                  textAnchor="middle"
                  fontSize="9"
                  fontWeight="900"
                  fill={eventColor(ev.type)}
                >
                  {ev.label}
                </text>
              </g>
            );
          })}

          {/* Today marker */}
          <line
            x1={dayToX(selectedDayOfYear)}
            x2={dayToX(selectedDayOfYear)}
            y1={CHART_PADDING_TOP}
            y2={CHART_PADDING_TOP + innerH}
            stroke="#0f172a"
            strokeWidth={1.5}
            strokeDasharray="3 3"
          />
          <circle
            cx={dayToX(selectedDayOfYear)}
            cy={hoursToY(todayDayLength)}
            r={6}
            fill="#0f172a"
            stroke="white"
            strokeWidth={2.5}
          />
        </svg>
        <div className="flex items-center gap-3 text-[10px] font-bold text-rhozly-on-surface/55 px-2 pt-1 flex-wrap">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
            Solstice
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
            Equinox
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-900 inline-block" />
            Today
          </span>
        </div>
      </div>

      {/* Seasonal compare toggle */}
      <button
        data-testid="sun-tracker-compare-toggle"
        onClick={() => setCompareMode(v => !v)}
        className={`w-full flex items-center justify-between gap-3 px-4 py-3 min-h-[48px] rounded-2xl border transition-colors ${
          compareMode
            ? "bg-amber-500 text-white border-amber-600"
            : "bg-white text-rhozly-on-surface border-rhozly-outline/20 hover:border-amber-300"
        }`}
      >
        <span className="flex items-center gap-2 text-xs font-black">
          <Layers size={14} />
          Compare seasons on a sky dome
        </span>
        <span className="text-[10px] font-bold uppercase tracking-widest opacity-70">
          {compareMode ? "On" : "Off"}
        </span>
      </button>

      {compareMode && (
        <SeasonalCompareDome latLng={latLng} selectedDate={selectedDate} keyEvents={keyEvents} />
      )}
    </div>
  );
}

// ─── Seasonal compare dome ───────────────────────────────────────────────────

interface SeasonalCompareDomeProps {
  latLng: { lat: number; lng: number };
  selectedDate: Date;
  keyEvents: KeyEvent[];
}

function SeasonalCompareDome({ latLng, selectedDate, keyEvents }: SeasonalCompareDomeProps) {
  const summer = keyEvents.find(e => e.type === "solstice-summer");
  const winter = keyEvents.find(e => e.type === "solstice-winter");

  const dome = useMemo(() => {
    const computeArcPoints = (date: Date) => {
      const arc = computeSunArc(latLng.lat, latLng.lng, date);
      if (!arc) return [];
      return arc.arc.map(pt => {
        const compass = ((pt.azimuth + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
        return projectSunToDome(compass, pt.altitude);
      });
    };
    return {
      today:  computeArcPoints(selectedDate),
      summer: summer ? computeArcPoints(summer.date) : [],
      winter: winter ? computeArcPoints(winter.date) : [],
    };
  }, [latLng.lat, latLng.lng, selectedDate, summer, winter]);

  const SIZE = 240;
  const R = SIZE / 2 - 16;
  const cx = SIZE / 2;
  const cy = SIZE / 2;

  const pathFromPoints = (pts: { nx: number; ny: number }[]) => {
    if (pts.length === 0) return "";
    return pts.map((p, i) => {
      const x = (cx + p.nx * R).toFixed(1);
      const y = (cy + p.ny * R).toFixed(1);
      return `${i === 0 ? "M" : "L"} ${x} ${y}`;
    }).join(" ");
  };

  const formatSummerLabel = summer ? dateLabel(summer.date) : null;
  const formatWinterLabel = winter ? dateLabel(winter.date) : null;
  const formatTodayLabel = dateLabel(selectedDate);

  return (
    <div className="bg-white rounded-2xl border border-rhozly-outline/15 p-4">
      <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-2">
        Sun paths across the year
      </p>

      <div className="flex flex-col sm:flex-row items-center gap-4">
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          width={SIZE}
          height={SIZE}
          data-testid="sun-tracker-compare-dome"
          className="shrink-0"
        >
          {/* Dome background */}
          <defs>
            <radialGradient id="dome-bg" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#1e3a8a" />
              <stop offset="100%" stopColor="#0c1e3d" />
            </radialGradient>
          </defs>
          <circle cx={cx} cy={cy} r={R + 2} fill="url(#dome-bg)" />
          <circle cx={cx} cy={cy} r={R} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth={1} />
          {/* Altitude rings */}
          {[30, 60].map(deg => {
            const rr = R * (1 - deg / 90);
            return (
              <circle key={deg} cx={cx} cy={cy} r={rr} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={0.5} />
            );
          })}
          {/* Cardinals */}
          {[
            { label: "N", x: 0,  y: -1 },
            { label: "E", x: 1,  y: 0  },
            { label: "S", x: 0,  y: 1  },
            { label: "W", x: -1, y: 0  },
          ].map(c => (
            <text
              key={c.label}
              x={cx + c.x * (R + 9)}
              y={cy + c.y * (R + 9) + 3}
              textAnchor="middle"
              fontSize="10"
              fontWeight="900"
              fill="rgba(255,255,255,0.8)"
            >
              {c.label}
            </text>
          ))}

          {/* Arcs (back to front: winter → summer → today) */}
          {dome.winter.length > 1 && (
            <path d={pathFromPoints(dome.winter)} fill="none" stroke="#60a5fa" strokeWidth={2.5} strokeLinecap="round" opacity={0.85} />
          )}
          {dome.summer.length > 1 && (
            <path d={pathFromPoints(dome.summer)} fill="none" stroke="#fb923c" strokeWidth={2.5} strokeLinecap="round" opacity={0.85} />
          )}
          {dome.today.length > 1 && (
            <path d={pathFromPoints(dome.today)} fill="none" stroke="#fbbf24" strokeWidth={3} strokeLinecap="round" strokeDasharray="6 4" />
          )}
        </svg>

        {/* Legend */}
        <div className="flex-1 space-y-2 w-full">
          <LegendRow
            colour="#fb923c"
            icon={<Sunrise size={12} className="text-orange-400" />}
            label="Summer solstice"
            sublabel={formatSummerLabel}
          />
          <LegendRow
            colour="#fbbf24"
            icon={<Calendar size={12} className="text-amber-500" />}
            label="Today"
            sublabel={formatTodayLabel}
            dashed
          />
          <LegendRow
            colour="#60a5fa"
            icon={<Sunset size={12} className="text-sky-400" />}
            label="Winter solstice"
            sublabel={formatWinterLabel}
          />
        </div>
      </div>
    </div>
  );
}

function LegendRow({
  colour,
  icon,
  label,
  sublabel,
  dashed,
}: {
  colour: string;
  icon: React.ReactNode;
  label: string;
  sublabel: string | null;
  dashed?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-rhozly-surface-low border border-rhozly-outline/10">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {icon}
        <div className="min-w-0">
          <p className="text-[11px] font-black text-rhozly-on-surface truncate">{label}</p>
          {sublabel && (
            <p className="text-[10px] font-bold text-rhozly-on-surface/40 truncate">{sublabel}</p>
          )}
        </div>
      </div>
      <div className="w-10 h-1 rounded-full shrink-0" style={{
        background: dashed ? `repeating-linear-gradient(90deg, ${colour} 0 4px, transparent 4px 7px)` : colour,
      }} />
    </div>
  );
}
