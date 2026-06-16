import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Loader2,
  Wifi,
  WifiOff,
  Cpu,
  Plug,
  Thermometer,
  Droplets,
  Zap,
  Pencil,
} from "lucide-react";
import LogReadingModal from "./LogReadingModal";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import {
  fetchAreaSensors,
  fetchAreaSensorHistory,
  computeAreaMetricSummary,
  type LinkedSensor,
  type HistoryWindow,
  type HistoryPoint,
} from "../../services/areaSensorsService";

interface Props {
  areaId: string;
  areaName: string;
  /** Required for manual reading writes — fan-out trigger needs the
   *  same home_id as the area for RLS. */
  homeId: string;
}

const HISTORY_WINDOWS: { id: HistoryWindow; label: string }[] = [
  { id: "24h", label: "24h" },
  { id: "7d", label: "7d" },
  { id: "30d", label: "30d" },
];

const SENSOR_LINE_COLOURS = [
  "#0ea5e9", // sky
  "#a855f7", // violet
  "#f97316", // orange
  "#10b981", // emerald
  "#ec4899", // pink
];

/**
 * Area ↔ Sensor linkage Phase 1 (2026-06-16).
 *
 * Mounted inside the LocationManager area-edit modal. Shows:
 *  - One tile per linked soil sensor (latest moisture / temp / EC).
 *  - An averaged tile when more than one sensor is linked.
 *  - A "View history" picker (24h / 7d / 30d) that draws a line per
 *    sensor plus an average line on top.
 *  - Empty-state CTA when no sensors are linked, deep-linking to the
 *    Integrations devices tab where the user can assign one.
 */
export default function AreaSensorsPanel({ areaId, areaName, homeId }: Props) {
  const navigate = useNavigate();
  const [sensors, setSensors] = useState<LinkedSensor[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyWindow, setHistoryWindow] = useState<HistoryWindow>("24h");
  const [history, setHistory] = useState<Record<string, HistoryPoint[]>>({});
  const [historyLoading, setHistoryLoading] = useState(false);
  // 2026-06-16 Phase 2 — manual reading entry. Bump tick to re-fetch
  // sensors + history after a successful manual log so the new entry
  // appears immediately in the charts.
  const [showLogModal, setShowLogModal] = useState(false);
  const [refetchTick, setRefetchTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await fetchAreaSensors(areaId);
        if (!cancelled) setSensors(data);
      } catch {
        if (!cancelled) setSensors([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [areaId, refetchTick]);

  useEffect(() => {
    if (sensors.length === 0) return;
    let cancelled = false;
    (async () => {
      setHistoryLoading(true);
      try {
        const h = await fetchAreaSensorHistory(areaId, historyWindow);
        if (!cancelled) setHistory(h);
      } catch {
        if (!cancelled) setHistory({});
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [areaId, historyWindow, sensors.length, refetchTick]);

  const summary = useMemo(() => computeAreaMetricSummary(sensors), [sensors]);

  if (loading) {
    return (
      <div className="bg-rhozly-surface-low/40 border border-rhozly-outline/10 rounded-3xl p-6 flex items-center justify-center">
        <Loader2 className="animate-spin text-rhozly-primary" size={20} />
      </div>
    );
  }

  if (sensors.length === 0) {
    return (
      <>
        <div
          data-testid="area-sensors-empty"
          className="bg-emerald-50/60 border border-emerald-200/60 rounded-3xl p-5"
        >
          <div className="flex items-start gap-3">
            <div className="shrink-0 w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <Cpu size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-black text-rhozly-on-surface text-sm">
                Link a soil sensor to {areaName || "this area"}
              </p>
              <p className="text-xs font-bold text-rhozly-on-surface/55 leading-snug mt-1 mb-3">
                Once a sensor is linked, this area starts tracking moisture, temperature and
                EC — and AI care guides can reason about whether plants here are happy.
                You can also log readings manually from a USB probe or calibrated meter.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  data-testid="area-sensors-link-cta"
                  onClick={() => navigate("/integrations")}
                  className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] rounded-2xl bg-emerald-600 text-white text-xs font-black hover:bg-emerald-700 transition-colors"
                >
                  <Plug size={14} /> Open Integrations
                </button>
                <button
                  type="button"
                  data-testid="area-sensors-log-empty"
                  onClick={() => setShowLogModal(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] rounded-2xl bg-white border border-emerald-300 text-emerald-700 text-xs font-black hover:bg-emerald-50 transition-colors"
                >
                  <Pencil size={14} /> Log a reading manually
                </button>
              </div>
            </div>
          </div>
        </div>
        {showLogModal && (
          <LogReadingModal
            homeId={homeId}
            areaId={areaId}
            areaName={areaName}
            onClose={() => setShowLogModal(false)}
            onLogged={() => setRefetchTick((t) => t + 1)}
          />
        )}
      </>
    );
  }

  const multiSensor = sensors.length > 1;
  const sensorsWithData = sensors.filter((s) => s.latest !== null);

  return (
    <div className="space-y-4" data-testid="area-sensors-panel">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40">
            Linked sensors
          </p>
          <p className="text-sm font-black text-rhozly-on-surface mt-0.5">
            {sensors.length} sensor{sensors.length === 1 ? "" : "s"}
            {multiSensor && (
              <span className="text-rhozly-on-surface/50 font-bold">
                {" "}· average across all
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1" role="tablist" aria-label="History window">
          <button
            type="button"
            data-testid="area-sensors-log-button"
            onClick={() => setShowLogModal(true)}
            title="Log a manual reading"
            className="mr-1 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-rhozly-surface border border-rhozly-outline/15 text-[11px] font-black uppercase tracking-widest text-rhozly-on-surface/55 hover:text-rhozly-primary hover:border-rhozly-primary/30 transition-colors"
          >
            <Pencil size={11} /> Log
          </button>
          {HISTORY_WINDOWS.map((w) => (
            <button
              key={w.id}
              type="button"
              data-testid={`area-sensors-history-${w.id}`}
              onClick={() => setHistoryWindow(w.id)}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-colors ${
                historyWindow === w.id
                  ? "bg-rhozly-primary text-white"
                  : "bg-rhozly-surface text-rhozly-on-surface/55 hover:bg-rhozly-surface-low"
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {/* Live tiles — average across sensors when multi, single sensor otherwise. */}
      <div className="grid grid-cols-3 gap-2">
        <MetricTile
          icon={<Thermometer size={16} className="text-orange-600" />}
          bg="bg-orange-50"
          label={multiSensor ? "Avg temp" : "Soil temp"}
          value={
            summary.sensors_with_data > 0
              ? `${summary.avg_soil_temp.toFixed(1)}°C`
              : "—"
          }
        />
        <MetricTile
          icon={<Droplets size={16} className="text-blue-600" />}
          bg="bg-blue-50"
          label={multiSensor ? "Avg moisture" : "Moisture"}
          value={
            summary.sensors_with_data > 0
              ? `${summary.avg_soil_moisture.toFixed(1)}%`
              : "—"
          }
        />
        <MetricTile
          icon={<Zap size={16} className="text-amber-600" />}
          bg="bg-amber-50"
          label={multiSensor ? "Avg EC" : "EC"}
          value={
            summary.sensors_with_data > 0
              ? summary.ec_source === "calibrated_us_cm"
                ? `${summary.avg_soil_ec.toFixed(0)} µS/cm`
                : `${summary.avg_soil_ec.toFixed(0)}`
              : "—"
          }
          hint={
            summary.sensors_with_data > 0 && summary.ec_source === "raw_adc"
              ? "raw"
              : null
          }
        />
      </div>

      {/* Per-sensor list */}
      <div className="space-y-2">
        {sensors.map((s) => (
          <div
            key={s.device_id}
            data-testid={`area-sensors-row-${s.device_id}`}
            className="flex items-center gap-3 bg-rhozly-surface-low/60 border border-rhozly-outline/10 rounded-2xl px-3 py-2"
          >
            <div className="shrink-0 w-8 h-8 rounded-xl bg-white border border-rhozly-outline/15 flex items-center justify-center">
              <Cpu size={14} className="text-rhozly-on-surface/55" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-rhozly-on-surface truncate">{s.name}</p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-rhozly-on-surface/40">
                {s.provider}
              </p>
            </div>
            <div className="shrink-0 text-right">
              {s.latest ? (
                <>
                  <p className="text-xs font-black text-rhozly-on-surface">
                    {s.latest.soil_moisture.toFixed(1)}% ·{" "}
                    {s.latest.soil_temp.toFixed(1)}°C
                  </p>
                  <p className="text-[10px] font-bold text-rhozly-on-surface/45 flex items-center gap-1 justify-end">
                    <Wifi size={9} /> {timeAgo(s.latest.recorded_at)}
                  </p>
                </>
              ) : (
                <p className="text-[10px] font-bold text-rhozly-on-surface/40 flex items-center gap-1 justify-end">
                  <WifiOff size={9} /> Awaiting first reading
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* History charts */}
      {sensorsWithData.length > 0 && (
        <div className="space-y-4 pt-2">
          {historyLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="animate-spin text-rhozly-primary" size={18} />
            </div>
          ) : (
            <>
              <MetricHistoryChart
                title={`Moisture (${historyWindow})`}
                metric="soil_moisture"
                unit="%"
                domain={[0, 100]}
                history={history}
                sensors={sensors}
                window={historyWindow}
              />
              <MetricHistoryChart
                title={`Soil temp (${historyWindow})`}
                metric="soil_temp"
                unit="°C"
                history={history}
                sensors={sensors}
                window={historyWindow}
              />
              <MetricHistoryChart
                title={`EC (${historyWindow})`}
                metric="soil_ec"
                unit={summary.ec_source === "calibrated_us_cm" ? "µS/cm" : ""}
                history={history}
                sensors={sensors}
                window={historyWindow}
              />
            </>
          )}
        </div>
      )}

      {showLogModal && (
        <LogReadingModal
          homeId={homeId}
          areaId={areaId}
          areaName={areaName}
          onClose={() => setShowLogModal(false)}
          onLogged={() => setRefetchTick((t) => t + 1)}
        />
      )}
    </div>
  );
}

// ─── Building blocks ────────────────────────────────────────────────────────

function MetricTile({
  icon,
  bg,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  bg: string;
  label: string;
  value: string;
  hint?: string | null;
}) {
  return (
    <div className={`rounded-2xl ${bg} px-3 py-3`}>
      <div className="w-7 h-7 rounded-xl bg-white flex items-center justify-center mb-1.5">
        {icon}
      </div>
      <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/55 leading-tight">
        {label}
      </p>
      <p className="text-base font-black text-rhozly-on-surface mt-0.5 leading-tight">
        {value}
        {hint && (
          <span className="text-[10px] font-bold text-rhozly-on-surface/40 ml-1">({hint})</span>
        )}
      </p>
    </div>
  );
}

interface ChartProps {
  title: string;
  metric: "soil_temp" | "soil_moisture" | "soil_ec";
  unit: string;
  domain?: [number, number];
  history: Record<string, HistoryPoint[]>;
  sensors: LinkedSensor[];
  window: HistoryWindow;
}

function MetricHistoryChart({ title, metric, unit, domain, history, sensors, window }: ChartProps) {
  // Merge per-sensor points into a single keyed-by-timestamp dataset
  // so recharts can render multiple lines without us reshaping per chart.
  const merged = useMemo(() => mergeForChart(history, metric), [history, metric]);

  if (merged.length === 0) {
    return (
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-2">
          {title}
        </p>
        <div className="bg-rhozly-surface-low/30 border border-dashed border-rhozly-outline/20 rounded-2xl p-6 text-center text-xs font-bold text-rhozly-on-surface/40">
          No data yet for this window.
        </div>
      </div>
    );
  }

  const fmt = (ts: string) => {
    const d = new Date(ts);
    if (window === "24h") return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-2">
        {title}
      </p>
      <ResponsiveContainer width="100%" height={120}>
        <LineChart data={merged} margin={{ left: -20, right: 4, top: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="ts"
            tickFormatter={fmt}
            tick={{ fontSize: 10, fill: "#9ca3af" }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 10, fill: "#9ca3af" }}
            axisLine={false}
            tickLine={false}
            domain={domain ?? ["auto", "auto"]}
          />
          <Tooltip
            contentStyle={{
              borderRadius: 12,
              border: "none",
              boxShadow: "0 2px 12px rgba(0,0,0,.08)",
              fontSize: 12,
            }}
            labelFormatter={fmt}
            formatter={(value: number | string) =>
              typeof value === "number" ? [`${value.toFixed(1)}${unit}`] : [String(value)]
            }
          />
          {sensors.map((s, i) => (
            <Line
              key={s.device_id}
              type="monotone"
              dataKey={s.device_id}
              name={s.name}
              stroke={SENSOR_LINE_COLOURS[i % SENSOR_LINE_COLOURS.length]}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          ))}
          {sensors.length > 1 && (
            <Line
              type="monotone"
              dataKey="__avg"
              name="Average"
              stroke="#111827"
              strokeWidth={2.5}
              strokeDasharray="4 4"
              dot={false}
              isAnimationActive={false}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Pure helpers ──────────────────────────────────────────────────────────

interface MergedRow {
  ts: string;
  __avg: number | null;
  [deviceId: string]: number | string | null;
}

function mergeForChart(
  history: Record<string, HistoryPoint[]>,
  metric: "soil_temp" | "soil_moisture" | "soil_ec",
): MergedRow[] {
  // Walk all timestamps across all device series, bucket the values by
  // timestamp + device, and compute an average per timestamp from the
  // sensors with a value at that exact point.
  const tsMap = new Map<string, MergedRow>();
  for (const [deviceId, points] of Object.entries(history)) {
    for (const p of points) {
      const ts = p.recorded_at;
      const v = p[metric];
      if (v === null || v === undefined) continue;
      let row = tsMap.get(ts);
      if (!row) {
        row = { ts, __avg: null };
        tsMap.set(ts, row);
      }
      row[deviceId] = v;
    }
  }
  const rows = Array.from(tsMap.values()).sort((a, b) => a.ts.localeCompare(b.ts));
  for (const row of rows) {
    let sum = 0, n = 0;
    for (const key of Object.keys(row)) {
      if (key === "ts" || key === "__avg") continue;
      const v = row[key];
      if (typeof v === "number") { sum += v; n += 1; }
    }
    row.__avg = n > 0 ? sum / n : null;
  }
  return rows;
}

function timeAgo(ts: string): string {
  const ms = Date.now() - new Date(ts).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
