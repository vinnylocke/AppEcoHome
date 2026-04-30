import React, { useState, useEffect, useMemo } from "react";
import {
  Cloud, Sun, CloudRain, CloudDrizzle, CloudSnow, CloudLightning,
  Wind, Droplets, Thermometer, ChevronDown, ChevronUp,
  CheckCircle2, AlertTriangle, AlertCircle, Info,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import { Logger } from "../lib/errorHandler";
import { usePlantDoctor } from "../context/PlantDoctorContext";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DaySummary {
  date: string;
  maxTempC: number;
  minTempC: number;
  precipMm: number;
  precipProb: number;
  maxWindKph: number;
  wmoCode: number;
}

interface HourlyPoint {
  time: string;
  temp: number;
  rain: number;
  wind: number;
  humidity: number;
}

interface ThresholdRow {
  label: string;
  actual: string;
  threshold: string;
  met: boolean;
  note?: string;
}

interface RuleResult {
  id: string;
  title: string;
  icon: React.FC<any>;
  status: "clear" | "info" | "warning" | "critical";
  heading: string;
  detail: string;
  thresholdRows?: ThresholdRow[];
}

interface Props {
  weatherData: any;
  alerts: any[];
}

// ─── WMO Code helpers ─────────────────────────────────────────────────────────

function wmoIcon(code: number): React.ReactNode {
  if (code === 0 || code === 1) return <Sun className="w-5 h-5 text-amber-400" />;
  if (code === 2)               return <Cloud className="w-5 h-5 text-rhozly-on-surface/40" />;
  if (code === 3 || (code >= 45 && code <= 48)) return <Cloud className="w-5 h-5 text-rhozly-on-surface/50" />;
  if (code >= 51 && code <= 57) return <CloudDrizzle className="w-5 h-5 text-blue-400" />;
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return <CloudRain className="w-5 h-5 text-blue-500" />;
  if ((code >= 71 && code <= 77) || code === 85 || code === 86)  return <CloudSnow className="w-5 h-5 text-sky-400" />;
  if (code >= 95) return <CloudLightning className="w-5 h-5 text-purple-500" />;
  return <Cloud className="w-5 h-5 text-rhozly-on-surface/40" />;
}

function formatDayLabel(dateStr: string, todayStr: string): string {
  const diff = Math.round(
    (new Date(dateStr).getTime() - new Date(todayStr).getTime()) / 86_400_000,
  );
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short" });
}

function formatFullDate(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "short",
  });
}

// ─── Rule evaluation (mirrors edge function logic, client-side) ───────────────

function evaluateRules(rawWeather: any, today: string): RuleResult[] {
  const rawDaily = rawWeather?.daily ?? {};
  const rawHourly = rawWeather?.hourly ?? {};
  const dailyTimes: string[] = rawDaily.time ?? [];

  const daily: DaySummary[] = dailyTimes.map((date: string, i: number) => ({
    date,
    maxTempC: rawDaily.temperature_2m_max?.[i] ?? 20,
    minTempC: rawDaily.temperature_2m_min?.[i] ?? 10,
    precipMm: rawDaily.precipitation_sum?.[i] ?? 0,
    precipProb: rawDaily.precipitation_probability_max?.[i] ?? 0,
    maxWindKph: rawDaily.windspeed_10m_max?.[i] ?? 0,
    wmoCode: rawDaily.weathercode?.[i] ?? 0,
  }));

  const todayData = daily.find((d) => d.date === today);
  const yesterdayData = daily.find((d) => d.date < today);
  const futureDays = daily.filter((d) => d.date >= today);

  // Hourly for frost (next 48h from today)
  const hourlyTimes: string[] = rawHourly.time ?? [];
  const todayHourlyStart = hourlyTimes.findIndex((t) => t.startsWith(today));
  const next48h = hourlyTimes
    .slice(todayHourlyStart, todayHourlyStart + 48)
    .map((time, i) => ({
      time,
      tempC: rawHourly.temperature_2m?.[todayHourlyStart + i] ?? 20,
    }));

  const results: RuleResult[] = [];

  // 1. Auto-Watering Completion
  const RAIN_AUTO_THRESHOLD = 5;
  const rainToday = todayData?.precipMm ?? 0;
  const rainYesterday = yesterdayData?.precipMm ?? 0;
  const rule1Met = rainToday >= RAIN_AUTO_THRESHOLD;
  const rule2Met = rainYesterday >= RAIN_AUTO_THRESHOLD && rainToday > 0;
  const rainTriggered = rule1Met || rule2Met;

  const rainWeek = futureDays.slice(0, 7)
    .filter((d) => d.precipMm > 0 || d.precipProb >= 40)
    .map((d) => `${formatDayLabel(d.date, today)} ${d.precipMm > 0 ? d.precipMm.toFixed(1) + "mm" : d.precipProb + "%"}`)
    .join(" · ");

  results.push({
    id: "rain",
    title: "Auto-Watering",
    icon: CloudRain,
    status: rainTriggered ? "info" : "clear",
    heading: rainTriggered ? "Outdoor watering auto-completed" : "No watering tasks skipped today",
    detail: rainWeek ? `Week ahead: ${rainWeek}.` : "No significant rain forecast this week.",
    thresholdRows: [
      {
        label: "Today's rainfall",
        actual: `${rainToday.toFixed(1)}mm`,
        threshold: `${RAIN_AUTO_THRESHOLD}mm`,
        met: rule1Met,
        note: rule1Met ? "Watering tasks skipped" : undefined,
      },
      {
        label: "Yesterday carry-over",
        actual: rainYesterday > 0
          ? `${rainYesterday.toFixed(1)}mm yesterday · ${rainToday.toFixed(1)}mm today`
          : `${rainYesterday.toFixed(1)}mm yesterday`,
        threshold: `≥${RAIN_AUTO_THRESHOLD}mm yesterday + any rain today`,
        met: rule2Met,
        note: rule2Met ? "Soil still saturated" : undefined,
      },
    ],
  });

  // 2. Frost Risk
  const frostThreshold = 2;
  const frostPoint = next48h.find((h) => h.tempC <= frostThreshold);
  const minTemp48h = next48h.length > 0
    ? Math.min(...next48h.map((h) => h.tempC))
    : null;

  results.push({
    id: "frost",
    title: "Frost Risk",
    icon: Thermometer,
    status: frostPoint ? "critical" : "clear",
    heading: frostPoint
      ? `Frost warning — ${Math.round(frostPoint.tempC)}°C expected`
      : "No frost risk (next 48h)",
    detail: frostPoint
      ? `Sub-zero temperatures expected around ${new Date(frostPoint.time).toLocaleTimeString("en-GB", { weekday: "short", hour: "numeric", hour12: true })}. Protect outdoor plants.`
      : `Minimum temperature in the next 48h: ${minTemp48h !== null ? Math.round(minTemp48h) + "°C" : "unknown"} (threshold: ${frostThreshold}°C).`,
  });

  // 3. Heatwave
  const HEAT_THRESHOLD = 32;
  const hotDay = futureDays.slice(0, 2).find((d) => d.maxTempC >= HEAT_THRESHOLD);
  const maxTemp2d = futureDays.slice(0, 2).reduce((m, d) => Math.max(m, d.maxTempC), 0);

  results.push({
    id: "heat",
    title: "Heatwave",
    icon: Sun,
    status: hotDay ? "warning" : "clear",
    heading: hotDay
      ? `Heat warning — ${Math.round(hotDay.maxTempC)}°C forecast`
      : "No heatwave (next 2 days)",
    detail: hotDay
      ? `${Math.round(hotDay.maxTempC)}°C on ${formatFullDate(hotDay.date)}. Outdoor plants may need extra watering.`
      : `Max temperature in next 2 days: ${Math.round(maxTemp2d)}°C (threshold: ${HEAT_THRESHOLD}°C).`,
  });

  // 4. High Winds
  const WIND_THRESHOLD = 40;
  const windDay = futureDays.slice(0, 2).find((d) => d.maxWindKph >= WIND_THRESHOLD);
  const maxWind2d = futureDays.slice(0, 2).reduce((m, d) => Math.max(m, d.maxWindKph), 0);

  results.push({
    id: "wind",
    title: "High Winds",
    icon: Wind,
    status: windDay ? "warning" : "clear",
    heading: windDay
      ? `Wind warning — ${Math.round(windDay.maxWindKph)} km/h`
      : "No high winds (next 2 days)",
    detail: windDay
      ? `Strong winds forecast on ${formatFullDate(windDay.date)}. Secure vulnerable outdoor plants.`
      : `Max wind in next 2 days: ${Math.round(maxWind2d)} km/h (threshold: ${WIND_THRESHOLD} km/h).`,
  });

  // 5. Waterlogging / Overwatering Risk
  const CONSEC_THRESHOLD = 5;
  const WATERLOG_MM_THRESHOLD = 5;
  const WATERLOG_PROB_THRESHOLD = 70;
  let consecutiveRainDays = 0;
  const rainDayLabels: string[] = [];
  for (const day of futureDays) {
    const byMm = day.precipMm >= WATERLOG_MM_THRESHOLD;
    const byProb = day.precipProb >= WATERLOG_PROB_THRESHOLD;
    if (byMm || byProb) {
      consecutiveRainDays++;
      rainDayLabels.push(
        byMm
          ? `${formatDayLabel(day.date, today)} ${day.precipMm.toFixed(1)}mm`
          : `${formatDayLabel(day.date, today)} ${day.precipProb}%`,
      );
    } else break;
  }
  const waterlogging = consecutiveRainDays >= CONSEC_THRESHOLD;

  results.push({
    id: "waterlogging",
    title: "Overwatering Risk",
    icon: Droplets,
    status: waterlogging ? "warning" : "clear",
    heading: waterlogging
      ? `${consecutiveRainDays} consecutive rainy days ahead`
      : consecutiveRainDays > 0
        ? `${consecutiveRainDays} consecutive rainy day${consecutiveRainDays === 1 ? "" : "s"} (${CONSEC_THRESHOLD - consecutiveRainDays} more for alert)`
        : "No consecutive rain forecast",
    detail: waterlogging
      ? `Check drainage and soil saturation — roots at risk after prolonged saturation.`
      : consecutiveRainDays > 0
        ? `Rain days detected: ${rainDayLabels.join(" · ")}.`
        : "No run of rainy days forecast this week.",
    thresholdRows: [
      {
        label: "Consecutive rainy days",
        actual: consecutiveRainDays > 0
          ? `${consecutiveRainDays} day${consecutiveRainDays !== 1 ? "s" : ""} — ${rainDayLabels.slice(0, 4).join(", ")}${rainDayLabels.length > 4 ? "…" : ""}`
          : "0 days",
        threshold: `${CONSEC_THRESHOLD} days (≥${WATERLOG_MM_THRESHOLD}mm or ≥${WATERLOG_PROB_THRESHOLD}% prob each)`,
        met: waterlogging,
        note: waterlogging ? "Overwatering alert active" : undefined,
      },
    ],
  });

  return results;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<RuleResult["status"], { row: string; badge: string; icon: React.ReactNode }> = {
  clear:    { row: "bg-green-50/50 border-green-200/50",    badge: "bg-green-100 text-green-700",   icon: <CheckCircle2 size={16} className="text-green-500" /> },
  info:     { row: "bg-blue-50/50 border-blue-200/50",      badge: "bg-blue-100 text-blue-700",     icon: <Info size={16} className="text-blue-500" /> },
  warning:  { row: "bg-amber-50/50 border-amber-200/50",    badge: "bg-amber-100 text-amber-700",   icon: <AlertTriangle size={16} className="text-amber-500" /> },
  critical: { row: "bg-red-50/50 border-red-200/50",        badge: "bg-red-100 text-red-700",       icon: <AlertCircle size={16} className="text-red-500" /> },
};

const STATUS_LABEL: Record<RuleResult["status"], string> = {
  clear: "Clear", info: "Active", warning: "Warning", critical: "Alert",
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-rhozly-surface-lowest p-4 rounded-2xl shadow-xl border border-rhozly-outline/20 z-50">
      <p className="text-xs font-black text-rhozly-on-surface/40 uppercase tracking-widest mb-3">{label}</p>
      <div className="space-y-2">
        {payload.map((entry: any, i: number) => (
          <div key={i} className="flex items-center justify-between gap-8">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
              <span className="text-sm font-bold text-rhozly-on-surface/70">{entry.name}</span>
            </div>
            <span className="text-sm font-black text-rhozly-on-surface">
              {entry.value}{entry.name === "Temperature" ? "°C" : entry.name === "Wind Speed" ? " km/h" : "%"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const METRICS = [
  { id: "temp",     label: "Temperature", icon: Thermometer, color: "var(--color-rhozly-primary, #075737)", unit: "°C",    dataKey: "temp" },
  { id: "rain",     label: "Rain Chance",  icon: CloudRain,   color: "#3b82f6",                             unit: "%",     dataKey: "rain" },
  { id: "wind",     label: "Wind Speed",   icon: Wind,        color: "#8b5cf6",                             unit: " km/h", dataKey: "wind" },
  { id: "humidity", label: "Humidity",     icon: Droplets,    color: "#f59e0b",                             unit: "%",     dataKey: "humidity" },
];

export default function WeatherForecast({ weatherData, alerts }: Props) {
  const { setPageContext } = usePlantDoctor();

  const today = useMemo(() => new Date().toISOString().split("T")[0], []);

  // ── Parse 7-day strip (today + next 6) ──────────────────────────────────────
  const weekDays = useMemo((): DaySummary[] => {
    if (!weatherData?.daily) return [];
    const raw = weatherData.daily;
    const times: string[] = raw.time ?? [];
    const todayIdx = times.findIndex((t) => t === today);
    if (todayIdx < 0) return [];
    return times.slice(todayIdx, todayIdx + 7).map((date, i) => {
      const absIdx = todayIdx + i;
      return {
        date,
        maxTempC:   raw.temperature_2m_max?.[absIdx] ?? 0,
        minTempC:   raw.temperature_2m_min?.[absIdx] ?? 0,
        precipMm:   raw.precipitation_sum?.[absIdx] ?? 0,
        precipProb: raw.precipitation_probability_max?.[absIdx] ?? 0,
        maxWindKph: raw.windspeed_10m_max?.[absIdx] ?? 0,
        wmoCode:    raw.weathercode?.[absIdx] ?? 0,
      };
    });
  }, [weatherData, today]);

  // ── Selected day state ───────────────────────────────────────────────────────
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [activeMetrics, setActiveMetrics] = useState<string[]>(["temp"]);
  const [selectedHourIndex, setSelectedHourIndex] = useState(new Date().getHours());
  const [showFilters, setShowFilters] = useState(true);
  const [intelligenceOpen, setIntelligenceOpen] = useState(true);

  // ── Hourly data for the selected day ────────────────────────────────────────
  const hourlyData = useMemo((): HourlyPoint[] => {
    if (!weatherData?.hourly || !weekDays[selectedDayIndex]) return [];
    const raw = weatherData.hourly;
    const times: string[] = raw.time ?? [];
    const dayDate = weekDays[selectedDayIndex].date;
    const startIdx = times.findIndex((t) => t.startsWith(dayDate));
    if (startIdx < 0) return [];

    const points: HourlyPoint[] = [];
    for (let i = 0; i < 24; i++) {
      const idx = startIdx + i;
      if (!times[idx]) break;
      points.push({
        time:     times[idx].substring(11, 16),
        temp:     Math.round(raw.temperature_2m?.[idx] ?? 0),
        rain:     Math.round(raw.precipitation_probability?.[idx] ?? 0),
        wind:     Math.round(raw.wind_speed_10m?.[idx] ?? 0),
        humidity: Math.round(raw.relative_humidity_2m?.[idx] ?? 0),
      });
    }
    return points;
  }, [weatherData, weekDays, selectedDayIndex]);

  const selectedHour = hourlyData[selectedHourIndex] ?? hourlyData[0];

  // ── Rule evaluations ─────────────────────────────────────────────────────────
  const ruleResults = useMemo(
    () => (weatherData ? evaluateRules(weatherData, today) : []),
    [weatherData, today],
  );

  // ── Clamp hour index when day changes ────────────────────────────────────────
  useEffect(() => {
    if (selectedDayIndex === 0) {
      setSelectedHourIndex(Math.min(new Date().getHours(), hourlyData.length - 1));
    } else {
      setSelectedHourIndex(0);
    }
  }, [selectedDayIndex]);

  // ── AI context ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedHour || !weekDays.length) return;
    try {
      setPageContext({
        action: "Analyzing Weather Forecast",
        forecastContext: {
          viewingDay: weekDays[selectedDayIndex]?.date,
          selectedTime: selectedHour.time,
          hourlySnapshot: {
            temp: `${selectedHour.temp}°C`,
            rainProbability: `${selectedHour.rain}%`,
            windSpeed: `${selectedHour.wind} km/h`,
            humidity: `${selectedHour.humidity}%`,
          },
          weekSummary: weekDays.map((d) => ({
            date: d.date,
            maxC: d.maxTempC,
            rainMm: d.precipMm,
          })),
          activeAlertsCount: alerts.length,
        },
      });
    } catch (err: any) {
      Logger.error("WeatherForecast setPageContext", err, {});
    }
    return () => setPageContext(null);
  }, [selectedDayIndex, selectedHour, weekDays, alerts, setPageContext]);

  // ── Guard ────────────────────────────────────────────────────────────────────
  if (!weatherData || weekDays.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-rhozly-surface-lowest rounded-3xl border border-rhozly-outline/20">
        <Cloud className="w-12 h-12 text-rhozly-primary/30 mb-4 animate-pulse" />
        <p className="font-bold text-rhozly-on-surface/50">Awaiting weather data...</p>
      </div>
    );
  }

  const toggleMetric = (id: string) =>
    setActiveMetrics((prev) =>
      prev.includes(id) ? (prev.length > 1 ? prev.filter((m) => m !== id) : prev) : [...prev, id],
    );

  const selectedDay = weekDays[selectedDayIndex];
  const maxRain = hourlyData.length > 0 ? Math.max(...hourlyData.map((d) => d.rain)) : selectedDay.precipProb;
  const avgWind = hourlyData.length > 0
    ? Math.round(hourlyData.reduce((a, c) => a + c.wind, 0) / hourlyData.length)
    : Math.round(selectedDay.maxWindKph);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-black font-display text-rhozly-on-surface tracking-tight">
          Weather Forecast
        </h2>
        <p className="text-sm font-bold text-rhozly-on-surface/40 uppercase tracking-widest mt-1">
          7-day outlook · hourly detail · garden decisions
        </p>
      </div>

      {/* ── 7-day strip ───────────────────────────────────────────────────────── */}
      <div className="overflow-x-auto pb-2 -mx-1 px-1">
        <div className="flex gap-2 min-w-max sm:min-w-0 sm:grid sm:grid-cols-7">
          {weekDays.map((day, i) => {
            const isSelected = i === selectedDayIndex;
            const isToday = i === 0;
            return (
              <button
                key={day.date}
                onClick={() => setSelectedDayIndex(i)}
                className={`flex flex-col items-center gap-2 p-3 rounded-2xl border transition-all min-w-[80px] sm:min-w-0 ${
                  isSelected
                    ? "bg-rhozly-primary text-white border-rhozly-primary shadow-md"
                    : "bg-white border-rhozly-outline/10 hover:border-rhozly-primary/30 hover:bg-rhozly-primary/5"
                }`}
              >
                <p className={`text-xs font-black uppercase tracking-widest ${isSelected ? "text-white/80" : "text-rhozly-on-surface/40"}`}>
                  {formatDayLabel(day.date, today)}
                </p>
                <div className={isSelected ? "opacity-90" : ""}>
                  {wmoIcon(day.wmoCode)}
                </div>
                <p className={`text-sm font-black ${isSelected ? "text-white" : "text-rhozly-on-surface"}`}>
                  {Math.round(day.maxTempC)}°
                </p>
                <p className={`text-xs font-bold ${isSelected ? "text-white/60" : "text-rhozly-on-surface/40"}`}>
                  {Math.round(day.minTempC)}°
                </p>
                {(day.precipMm > 0.5 || day.precipProb >= 40) && (
                  <p className={`text-xs font-bold ${isSelected ? "text-white/70" : "text-blue-500"}`}>
                    {day.precipMm > 0.5 ? `${day.precipMm.toFixed(1)}mm` : `${day.precipProb}%`}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Hourly Chart ──────────────────────────────────────────────────────── */}
      <div className="bg-rhozly-surface-lowest rounded-3xl p-6 md:p-10 border border-rhozly-outline/30 shadow-sm overflow-hidden relative">
        <div className="absolute top-0 right-0 w-64 h-64 bg-rhozly-primary/5 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none" />
        <div className="relative z-10 space-y-8">

          {/* Day title */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="font-black text-xl text-rhozly-on-surface">
                {formatFullDate(selectedDay.date)}
              </h3>
              <p className="text-xs font-bold text-rhozly-on-surface/40 mt-0.5 uppercase tracking-widest">
                {Math.round(selectedDay.maxTempC)}° high · {Math.round(selectedDay.minTempC)}° low
                {selectedDay.precipMm > 0 ? ` · ${selectedDay.precipMm.toFixed(1)}mm rain` : ""}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-2xl border border-rhozly-outline/10 shadow-sm">
                <CloudRain size={14} className="text-blue-500" />
                <span className="text-xs font-black text-rhozly-on-surface/60">Max {maxRain}%</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-2xl border border-rhozly-outline/10 shadow-sm">
                <Wind size={14} className="text-rhozly-primary" />
                <span className="text-xs font-black text-rhozly-on-surface/60">Avg {avgWind} km/h</span>
              </div>
            </div>
          </div>

          {/* Metric toggles */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-black text-rhozly-on-surface/40 uppercase tracking-widest">Chart Metrics</p>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rhozly-primary/5 hover:bg-rhozly-primary/10 text-rhozly-primary font-bold text-xs transition-colors"
              >
                {showFilters ? <><ChevronUp size={14} /> Hide</> : <><ChevronDown size={14} /> Show</>}
              </button>
            </div>
            <div className={`grid grid-cols-2 lg:grid-cols-4 gap-3 transition-all duration-300 overflow-hidden ${showFilters ? "opacity-100 max-h-96" : "opacity-0 max-h-0 pointer-events-none"}`}>
              {METRICS.map((m) => {
                const isActive = activeMetrics.includes(m.id);
                const val = selectedHour ? selectedHour[m.dataKey as keyof HourlyPoint] : "—";
                return (
                  <button
                    key={m.id}
                    onClick={() => toggleMetric(m.id)}
                    className={`flex items-center justify-between p-3 rounded-2xl border transition-all ${isActive ? "bg-rhozly-primary/5 border-rhozly-primary/30 shadow-sm" : "bg-transparent border-rhozly-outline/10 hover:border-rhozly-primary/20"}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center ${isActive ? "bg-rhozly-primary border-rhozly-primary" : "border-rhozly-outline/30 bg-white"}`}>
                        {isActive && <div className="w-1.5 h-1.5 bg-white rounded-sm" />}
                      </div>
                      <div className="text-left">
                        <p className="text-[10px] font-black text-rhozly-on-surface/40 uppercase tracking-widest">{m.label}</p>
                        <p className={`text-base font-black font-display ${isActive ? "text-rhozly-primary" : "text-rhozly-on-surface"}`}>
                          {val}{m.unit}
                        </p>
                      </div>
                    </div>
                    <m.icon size={16} className={isActive ? "text-rhozly-primary" : "text-rhozly-on-surface/20"} />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Chart */}
          {hourlyData.length > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <p className="text-xs font-black text-rhozly-on-surface/40 uppercase tracking-widest">
                  Viewing{" "}
                  <span className="text-rhozly-primary">{selectedHour?.time ?? "—"}</span>
                </p>
                <p className="text-xs font-bold text-rhozly-primary/60 bg-rhozly-primary/5 px-3 py-1 rounded-xl border border-rhozly-primary/15">
                  Tap chart to select time
                </p>
              </div>
              <div className="h-[340px] w-full">
                <ResponsiveContainer width="99%" height={340}>
                  <AreaChart
                    data={hourlyData}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                    onClick={(e) => {
                      if (e?.activeTooltipIndex !== undefined && e.activeTooltipIndex >= 0) {
                        setSelectedHourIndex(e.activeTooltipIndex);
                      }
                    }}
                  >
                    <defs>
                      {METRICS.map((m) => (
                        <linearGradient key={m.id} id={`color-${m.id}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={m.color} stopOpacity={0.15} />
                          <stop offset="95%" stopColor={m.color} stopOpacity={0} />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-rhozly-outline, #e5e7eb)" />
                    <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 700, fill: "#1a1c1b66" }} interval={3} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 700, fill: "#1a1c1b66" }} />
                    <Tooltip content={<CustomTooltip />} cursor={{ stroke: "var(--color-rhozly-primary,#075737)", strokeWidth: 2, strokeDasharray: "5 5" }} />
                    {selectedHour && (
                      <ReferenceLine x={selectedHour.time} stroke="var(--color-rhozly-primary,#075737)" strokeWidth={2} strokeOpacity={0.4}
                        label={{ position: "top", value: "▼", fill: "var(--color-rhozly-primary,#075737)", fontSize: 10 }}
                      />
                    )}
                    {METRICS.filter((m) => activeMetrics.includes(m.id)).map((m) => (
                      <Area key={m.id} type="monotone" dataKey={m.dataKey} name={m.label}
                        stroke={m.color} strokeWidth={3} fillOpacity={1} fill={`url(#color-${m.id})`} animationDuration={800} />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-rhozly-on-surface/40 text-sm font-bold">
              Hourly data not available for this day.
            </div>
          )}
        </div>
      </div>

      {/* ── Garden Intelligence ───────────────────────────────────────────────── */}
      <div className="bg-rhozly-surface-lowest rounded-3xl border border-rhozly-outline/30 shadow-sm overflow-hidden">
        <button
          onClick={() => setIntelligenceOpen((v) => !v)}
          className="w-full flex items-center justify-between p-6 hover:bg-black/[0.02] transition-colors"
        >
          <div>
            <h3 className="font-black text-xl font-display text-rhozly-on-surface tracking-tight text-left">
              Garden Intelligence
            </h3>
            <p className="text-xs font-bold text-rhozly-on-surface/40 uppercase tracking-widest mt-0.5 text-left">
              Every rule evaluated for this week
            </p>
          </div>
          <div className="flex items-center gap-3">
            {ruleResults.filter((r) => r.status !== "clear").length > 0 && (
              <span className="text-xs font-black px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">
                {ruleResults.filter((r) => r.status !== "clear").length} active
              </span>
            )}
            {intelligenceOpen ? <ChevronUp size={18} className="text-rhozly-on-surface/30" /> : <ChevronDown size={18} className="text-rhozly-on-surface/30" />}
          </div>
        </button>

        {intelligenceOpen && (
          <div className="px-6 pb-6 space-y-3">
            {ruleResults.map((rule) => {
              const styles = STATUS_STYLES[rule.status];
              return (
                <div key={rule.id} className={`rounded-2xl border p-4 space-y-2 ${styles.row}`}>
                  {/* Header row */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      {styles.icon}
                      <p className="font-black text-sm text-rhozly-on-surface">{rule.heading}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${styles.badge}`}>
                        {STATUS_LABEL[rule.status]}
                      </span>
                      <span className="text-[10px] font-bold text-rhozly-on-surface/30 uppercase tracking-widest">{rule.title}</span>
                    </div>
                  </div>

                  {/* Threshold breakdown */}
                  {rule.thresholdRows && rule.thresholdRows.length > 0 && (
                    <div className="ml-6 mt-1 rounded-xl border border-rhozly-outline/20 bg-white/50 overflow-hidden">
                      <div className="px-3 py-1.5 border-b border-rhozly-outline/10 flex items-center gap-1.5">
                        <span className="text-[9px] font-black uppercase tracking-widest text-rhozly-on-surface/30">Rule Conditions</span>
                      </div>
                      <div className="divide-y divide-rhozly-outline/10">
                        {rule.thresholdRows.map((row, i) => (
                          <div key={i} className="px-3 py-2.5 flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-rhozly-on-surface/70">{row.label}</p>
                              {row.note && (
                                <p className="text-[10px] font-bold text-blue-600 mt-0.5">{row.note}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-2.5 shrink-0 text-right">
                              <div>
                                <p className={`text-xs font-black ${row.met ? "text-rhozly-on-surface" : "text-rhozly-on-surface/50"}`}>
                                  {row.actual}
                                </p>
                                <p className="text-[10px] font-bold text-rhozly-on-surface/30">
                                  threshold: {row.threshold}
                                </p>
                              </div>
                              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${
                                row.met
                                  ? rule.status === "warning" || rule.status === "critical"
                                    ? "bg-amber-100 text-amber-700"
                                    : "bg-blue-100 text-blue-700"
                                  : "bg-rhozly-outline/15 text-rhozly-on-surface/30"
                              }`}>
                                {row.met ? "✓" : "✗"}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Detail text */}
                  {rule.detail && (
                    <p className="text-xs text-rhozly-on-surface/55 leading-relaxed pl-6">{rule.detail}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
