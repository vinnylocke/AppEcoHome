import React, { useState, useEffect, useMemo } from "react";
import {
  Cloud,
  Sun,
  CloudRain,
  Wind,
  Droplets,
  Thermometer,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { Logger } from "../lib/errorHandler";

interface HourlyData {
  time: string;
  temp: number;
  rain: number;
  wind: number;
  humidity: number;
}

interface Props {
  weatherData: any;
  alerts: any[];
}

const parseWeatherData = (
  rawData: any,
  dayTarget: "today" | "tomorrow",
): HourlyData[] => {
  if (!rawData?.hourly) return [];

  try {
    const {
      time,
      temperature_2m,
      relative_humidity_2m,
      wind_speed_10m,
      precipitation_probability,
    } = rawData.hourly;

    const startIndex = dayTarget === "today" ? 0 : 24;
    const data: HourlyData[] = [];

    for (let i = 0; i < 24; i++) {
      const idx = startIndex + i;
      if (!time || !time[idx]) break;

      const hourStr = time[idx].substring(11, 16);

      data.push({
        time: hourStr,
        temp: Math.round(Number(temperature_2m?.[idx]) || 0),
        rain: precipitation_probability
          ? Math.round(Number(precipitation_probability[idx]) || 0)
          : 0,
        wind: Math.round(Number(wind_speed_10m?.[idx]) || 0),
        humidity: Math.round(Number(relative_humidity_2m?.[idx]) || 0),
      });
    }

    return data;
  } catch (error: any) {
    Logger.error("Failed to parse weather data", error, {
      rawDataSample: JSON.stringify(rawData).substring(0, 200),
    });
    return [];
  }
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-rhozly-surface-lowest p-4 rounded-2xl shadow-xl border border-rhozly-outline/20 animate-in zoom-in-95 duration-200 z-50">
        <p className="text-xs font-black text-rhozly-on-surface/40 uppercase tracking-widest mb-3">
          {label}
        </p>
        <div className="space-y-2">
          {payload.map((entry: any, index: number) => (
            <div
              key={index}
              className="flex items-center justify-between gap-8"
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: entry.color }}
                />
                <span className="text-sm font-bold text-rhozly-on-surface/70">
                  {entry.name}
                </span>
              </div>
              <span className="text-sm font-black text-rhozly-on-surface">
                {entry.value}
                {entry.name === "Temperature"
                  ? "°C"
                  : entry.name === "Wind Speed"
                    ? " km/h"
                    : "%"}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
};

export default function WeatherForecast({ weatherData, alerts }: Props) {
  const [day, setDay] = useState<"today" | "tomorrow">("today");
  const [activeMetrics, setActiveMetrics] = useState<string[]>(["temp"]);
  const [selectedHourIndex, setSelectedHourIndex] = useState<number>(
    new Date().getHours(),
  );

  const [showFilters, setShowFilters] = useState(true);

  const data = useMemo(
    () => parseWeatherData(weatherData, day),
    [weatherData, day],
  );

  useEffect(() => {
    if (selectedHourIndex >= data.length) {
      setSelectedHourIndex(Math.max(0, data.length - 1));
    }
  }, [data, selectedHourIndex]);

  useEffect(() => {
    setDay("today");
    setSelectedHourIndex(new Date().getHours());
  }, [weatherData]);

  const metrics = [
    {
      id: "temp",
      label: "Temperature",
      icon: Thermometer,
      color: "#075737",
      unit: "°C",
      dataKey: "temp",
    },
    {
      id: "rain",
      label: "Rain Chance",
      icon: CloudRain,
      color: "#3b82f6",
      unit: "%",
      dataKey: "rain",
    },
    {
      id: "wind",
      label: "Wind Speed",
      icon: Wind,
      color: "#8b5cf6",
      unit: " km/h",
      dataKey: "wind",
    },
    {
      id: "humidity",
      label: "Humidity",
      icon: Droplets,
      color: "#f59e0b",
      unit: "%",
      dataKey: "humidity",
    },
  ];

  const toggleMetric = (id: string) => {
    setActiveMetrics((prev) =>
      prev.includes(id)
        ? prev.length > 1
          ? prev.filter((m) => m !== id)
          : prev
        : [...prev, id],
    );
  };

  if (!weatherData || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-rhozly-surface-lowest rounded-3xl border border-rhozly-outline/20">
        <Cloud className="w-12 h-12 text-rhozly-primary/30 mb-4 animate-pulse" />
        <p className="font-bold text-rhozly-on-surface/50">
          Awaiting weather data...
        </p>
      </div>
    );
  }

  const selectedData = data[selectedHourIndex] || data[0];

  const avgWind = Math.round(
    data.reduce((acc, curr) => acc + curr.wind, 0) / data.length,
  );
  const maxRain = Math.max(...data.map((d) => d.rain));

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header & Day Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div>
          <h2 className="text-3xl font-black font-display text-rhozly-on-surface tracking-tight">
            Weather Forecast
          </h2>
          <p className="text-sm font-bold text-rhozly-on-surface/40 uppercase tracking-widest mt-1">
            Hourly predictions for your locations
          </p>
        </div>

        <div className="flex p-1 bg-rhozly-primary/5 rounded-2xl border border-rhozly-outline/10">
          <button
            onClick={() => setDay("today")}
            className={`px-6 py-2 rounded-xl font-bold text-sm transition-all ${day === "today" ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-primary/60 hover:text-rhozly-primary"}`}
          >
            Today
          </button>
          <button
            onClick={() => setDay("tomorrow")}
            className={`px-6 py-2 rounded-xl font-bold text-sm transition-all ${day === "tomorrow" ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-primary/60 hover:text-rhozly-primary"}`}
          >
            Tomorrow
          </button>
        </div>
      </div>

      {/* Main Forecast Card */}
      <div className="bg-rhozly-surface-lowest rounded-[2.5rem] p-6 md:p-10 border border-rhozly-outline/30 shadow-sm overflow-hidden relative">
        <div className="absolute top-0 right-0 w-64 h-64 bg-rhozly-primary/5 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none" />

        <div className="relative z-10 space-y-10">
          {/* Collapsible Filters Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black text-rhozly-on-surface/50 uppercase tracking-widest">
                Chart Metrics
              </h3>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-rhozly-primary/5 hover:bg-rhozly-primary/10 text-rhozly-primary font-bold text-xs transition-colors"
              >
                {showFilters ? (
                  <>
                    Hide Filters <ChevronUp className="w-4 h-4" />
                  </>
                ) : (
                  <>
                    Show Filters <ChevronDown className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>

            {showFilters && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                {metrics.map((m) => {
                  const isActive = activeMetrics.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      onClick={() => toggleMetric(m.id)}
                      className={`flex items-center justify-between p-4 rounded-3xl border transition-all duration-300 text-left group ${isActive ? "bg-rhozly-primary/5 border-rhozly-primary/30 shadow-sm" : "bg-transparent border-rhozly-outline/10 hover:border-rhozly-primary/20"}`}
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${isActive ? "bg-rhozly-primary border-rhozly-primary" : "border-rhozly-outline/30 bg-white"}`}
                        >
                          {isActive && (
                            <div className="w-2 h-2 bg-white rounded-sm" />
                          )}
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-rhozly-on-surface/40 uppercase tracking-widest mb-0.5">
                            {m.label}
                          </p>
                          <p
                            className={`text-lg font-black font-display ${isActive ? "text-rhozly-primary" : "text-rhozly-on-surface"}`}
                          >
                            {selectedData[m.dataKey as keyof HourlyData]}
                            {m.unit}
                          </p>
                        </div>
                      </div>
                      <div
                        className={`p-2 rounded-xl transition-colors ${isActive ? "bg-rhozly-primary/10 text-rhozly-primary" : "bg-rhozly-surface-low text-rhozly-on-surface/20"}`}
                      >
                        <m.icon className="w-4 h-4" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Graph Area */}
          <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
              <p className="text-xs font-black text-rhozly-on-surface/40 uppercase tracking-widest">
                Viewing data for{" "}
                <span className="text-rhozly-primary">{selectedData.time}</span>
              </p>
              <p className="text-[10px] font-bold text-rhozly-on-surface/30 italic">
                Click graph to select time
              </p>
            </div>

            <div className="h-[400px] w-full mt-4">
              <ResponsiveContainer
                width="99%"
                height={400}
                minWidth={0}
                minHeight={0}
              >
                <AreaChart
                  data={data}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  onClick={(e) => {
                    if (e && e.activeTooltipIndex !== undefined) {
                      setSelectedHourIndex(e.activeTooltipIndex);
                    }
                  }}
                >
                  <defs>
                    {metrics.map((m) => (
                      <linearGradient
                        key={m.id}
                        id={`color-${m.id}`}
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor={m.color}
                          stopOpacity={0.15}
                        />
                        <stop
                          offset="95%"
                          stopColor={m.color}
                          stopOpacity={0}
                        />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#e5e7eb"
                  />
                  <XAxis
                    dataKey="time"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fontWeight: 700, fill: "#1a1c1b66" }}
                    interval={3}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fontWeight: 700, fill: "#1a1c1b66" }}
                  />
                  <Tooltip
                    content={<CustomTooltip />}
                    cursor={{
                      stroke: "#075737",
                      strokeWidth: 2,
                      strokeDasharray: "5 5",
                    }}
                  />

                  {selectedData && (
                    <ReferenceLine
                      x={selectedData.time}
                      stroke="#075737"
                      strokeWidth={2}
                      strokeOpacity={0.4}
                      label={{
                        position: "top",
                        value: "Selected",
                        fill: "#075737",
                        fontSize: 10,
                        fontWeight: 900,
                      }}
                    />
                  )}

                  {metrics
                    .filter((m) => activeMetrics.includes(m.id))
                    .map((m) => (
                      <Area
                        key={m.id}
                        type="monotone"
                        dataKey={m.dataKey}
                        name={m.label}
                        stroke={m.color}
                        strokeWidth={4}
                        fillOpacity={1}
                        fill={`url(#color-${m.id})`}
                        animationDuration={1500}
                        isAnimationActive={true}
                      />
                    ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Summary Footer */}
          <div className="flex flex-wrap items-center justify-center gap-8 pt-6 border-t border-rhozly-outline/10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
                <CloudRain className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p className="text-[10px] font-black text-rhozly-on-surface/40 uppercase tracking-widest">
                  Max Rain Chance
                </p>
                <p className="text-sm font-black text-rhozly-on-surface">
                  {maxRain}%
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rhozly-primary/5 flex items-center justify-center">
                <Wind className="w-5 h-5 text-rhozly-primary" />
              </div>
              <div>
                <p className="text-[10px] font-black text-rhozly-on-surface/40 uppercase tracking-widest">
                  Avg. Wind
                </p>
                <p className="text-sm font-black text-rhozly-on-surface">
                  {avgWind} km/h
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
