import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { Loader2 } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import type { AggregatePeriod } from "../../lib/integrations/types";
import ValveTimeline from "./ValveTimeline";

interface Props {
  deviceId: string;
  deviceType: "soil_sensor" | "water_valve";
  /** Optional — defaults to "celsius". Storage is always Celsius; this
   *  only flips the axis label + value conversion at render time. */
  tempDisplayUnit?: "celsius" | "fahrenheit";
}

const PERIODS: { id: AggregatePeriod; label: string }[] = [
  { id: "24h", label: "24h" },
  { id: "7d", label: "7d" },
  { id: "30d", label: "30d" },
  { id: "12m", label: "12m" },
];

export default function HistoryChart({ deviceId, deviceType, tempDisplayUnit = "celsius" }: Props) {
  const [period, setPeriod] = useState<AggregatePeriod>("24h");
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSoil = deviceType === "soil_sensor";

  useEffect(() => {
    if (!isSoil) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await supabase.functions.invoke("integrations-readings-query", {
          body: { deviceId, period },
          headers: { Authorization: `Bearer ${session?.access_token}` },
        });
        if (!cancelled) {
          if (res.error) throw new Error(res.error.message);
          setData(res.data?.rows ?? []);
        }
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [deviceId, period, isSoil]);

  // Valves use the ValveTimeline component — no period picker needed
  if (!isSoil) {
    return <ValveTimeline deviceId={deviceId} />;
  }

  return (
    <div>
      {/* Period tabs */}
      <div className="flex gap-1 mb-4">
        {PERIODS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPeriod(p.id)}
            data-testid={`period-${p.id}`}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
              period === p.id
                ? "bg-rhozly-primary text-white"
                : "bg-rhozly-surface text-rhozly-on-surface-variant hover:bg-rhozly-surface-low"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="animate-spin text-rhozly-primary" size={22} />
        </div>
      ) : error ? (
        <p className="text-sm text-red-500 text-center py-6">{error}</p>
      ) : data.length === 0 ? (
        <p className="text-sm text-rhozly-on-surface-variant text-center py-6">No data for this period.</p>
      ) : (
        <SoilChart data={data} period={period} tempDisplayUnit={tempDisplayUnit} />
      )}
    </div>
  );
}

function SoilChart({
  data,
  period,
  tempDisplayUnit,
}: {
  data: Record<string, unknown>[];
  period: AggregatePeriod;
  tempDisplayUnit: "celsius" | "fahrenheit";
}) {
  const fmt = (bucket: string) => {
    const d = new Date(bucket);
    if (period === "24h") return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (period === "12m") return d.toLocaleDateString([], { month: "short", day: "numeric" });
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  // 2026-06-16 — temperature stored as Celsius; convert each bucket to
  // Fahrenheit at render time when the user picked that unit. Done as a
  // shallow row-by-row map so the chart's tooltip + axis use the
  // displayed unit consistently.
  const isFahrenheit = tempDisplayUnit === "fahrenheit";
  const tempData = isFahrenheit
    ? data.map((row) => {
        const c = row.soil_temp;
        if (typeof c !== "number") return row;
        return { ...row, soil_temp: c * 9 / 5 + 32 };
      })
    : data;
  const tempTitle = isFahrenheit ? "Soil Temp (°F)" : "Soil Temp (°C)";

  return (
    <div className="space-y-5">
      {/* Moisture */}
      <ChartBlock title="Moisture (%)" data={data} dataKey="soil_moisture" color="#3b82f6" fmt={fmt} domain={[0, 100]} />
      {/* Temperature */}
      <ChartBlock title={tempTitle} data={tempData} dataKey="soil_temp" color="#f97316" fmt={fmt} />
    </div>
  );
}

function ChartBlock({
  title, data, dataKey, color, fmt, domain,
}: {
  title: string;
  data: Record<string, unknown>[];
  dataKey: string;
  color: string;
  fmt: (v: string) => string;
  domain?: [number, number];
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-rhozly-on-surface-variant mb-2">{title}</p>
      <ResponsiveContainer width="100%" height={120}>
        <LineChart data={data} margin={{ left: -20, right: 4, top: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="bucket"
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
            contentStyle={{ borderRadius: 12, border: "none", boxShadow: "0 2px 12px rgba(0,0,0,.08)", fontSize: 12 }}
            labelFormatter={fmt}
          />
          <Line
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
