import React, { useMemo, useState, useRef, useEffect } from "react";
import {
  ArrowLeft,
  Droplets,
  Wind,
  Thermometer,
  CloudRain,
  Sun,
  Cloud,
  CloudLightning,
  Snowflake,
  Navigation,
  ChevronDown,
  ArrowUp,
} from "lucide-react";
import { Logger } from "../lib/errorHandler";

// Helper to map WMO codes to Icons
const getWeatherIcon = (code: number, size = 20) => {
  if (code === 0) return <Sun size={size} className="text-orange-400" />;
  if (code <= 3) return <Cloud size={size} className="text-stone-400" />;
  if (code >= 51 && code <= 67)
    return <CloudRain size={size} className="text-blue-400" />;
  if (code >= 71 && code <= 77)
    return <Snowflake size={size} className="text-sky-300" />;
  if (code >= 95)
    return <CloudLightning size={size} className="text-purple-400" />;
  return <Cloud size={size} className="text-stone-300" />;
};

interface Props {
  location: any;
  onBack: () => void;
}

export const LocationPage: React.FC<Props> = ({ location, onBack }) => {
  const [expandedHour, setExpandedHour] = useState<number | null>(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const snapshot = location?.weather_snapshots?.data;

  // 1. Improved Horizontal Scroll Interceptor
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      // Check if we're at the very start or very end of the scroll container
      const isAtLeft = el.scrollLeft === 0 && e.deltaY < 0;
      const isAtRight =
        Math.abs(el.scrollWidth - el.clientWidth - el.scrollLeft) < 1 &&
        e.deltaY > 0;

      // Only intercept if there's room to scroll horizontally
      if (e.deltaY !== 0 && !isAtLeft && !isAtRight) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const hourlyData = useMemo(() => {
    if (!snapshot?.hourly) return [];

    const nowTime = new Date().getTime();
    let startIndex = snapshot.hourly.time.findIndex(
      (t: string) => new Date(t).getTime() >= nowTime - 3600000,
    );
    if (startIndex === -1) startIndex = 0;

    return snapshot.hourly.time
      .slice(startIndex, startIndex + 24)
      .map((time: string, i: number) => {
        const idx = startIndex + i;
        const isNow = i === 0;

        return {
          displayTime: isNow
            ? "NOW"
            : new Date(time).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              }),
          temp: Math.round(snapshot.hourly.temperature_2m[idx]),
          rainProb: snapshot.hourly.precipitation_probability[idx],
          rainAmount: snapshot.hourly.rain[idx],
          humidity: snapshot.hourly.relative_humidity_2m[idx],
          dewpoint: Math.round(snapshot.hourly.dew_point_2m[idx]),
          soilTemp: Math.round(snapshot.hourly.soil_temperature_6cm[idx]),
          soilMoisture: (
            snapshot.hourly.soil_moisture_0_to_1cm[idx] * 100
          ).toFixed(1),
          windSpeed: Math.round(snapshot.hourly.wind_speed_10m[idx]),
          windDeg: snapshot.hourly.wind_direction_10m[idx],
          code: snapshot.hourly.weather_code[idx],
        };
      });
  }, [snapshot]);

  const toggleHour = (index: number) => {
    setExpandedHour(expandedHour === index ? null : index);
  };

  if (!snapshot)
    return (
      <div className="p-20 text-center text-stone-400 font-bold">
        Loading...
      </div>
    );

  const currentWindDeg =
    snapshot.current?.wind_direction_10m ??
    snapshot.hourly?.wind_direction_10m?.[0] ??
    0;

  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-500 pb-24 w-full">
      {/* 1. NAV */}
      <div className="flex justify-between items-center py-6 lg:py-8">
        <button
          onClick={onBack}
          className="text-xs font-black text-stone-400 uppercase tracking-widest flex items-center gap-2 hover:text-stone-900 transition-colors"
        >
          <ArrowLeft size={16} /> Dashboard
        </button>
        <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full uppercase tracking-widest">
          Live Telemetry
        </span>
      </div>

      {/* 2. RESPONSIVE HERO */}
      <div className="mb-10 lg:mb-16">
        <div className="flex items-center gap-2 text-stone-400 mb-2 font-black text-[10px] uppercase tracking-widest">
          <Navigation size={12} fill="currentColor" /> {location.address}
        </div>

        <h1 className="text-4xl md:text-5xl lg:text-7xl font-black text-stone-900 tracking-tighter mb-8">
          {location.name}
        </h1>

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 lg:gap-5">
          <StatMini
            icon={<Thermometer size={20} />}
            label="Current Temp"
            value={`${Math.round(snapshot.current.temperature_2m)}°`}
          />
          <StatMini
            icon={<CloudRain size={20} />}
            label="Rainfall"
            value={`${snapshot.daily.rain_sum[0]}mm`}
          />
          <StatMini
            icon={<Wind size={20} />}
            label="Wind Surface"
            value={
              <div className="flex items-center gap-1.5">
                <span>{snapshot.current.wind_speed_10m}</span>
                <span className="text-[10px] text-stone-400 font-bold uppercase tracking-wider -mb-1">
                  km/h
                </span>
                <ArrowUp
                  size={16}
                  style={{ transform: `rotate(${currentWindDeg}deg)` }}
                  className="text-stone-900 ml-2 bg-stone-100 rounded-full p-0.5"
                />
              </div>
            }
          />
          <StatMini
            icon={<Droplets size={20} />}
            label="Humidity"
            value={`${snapshot.current.relative_humidity_2m}%`}
          />
        </div>
      </div>

      {/* 3. PREMIUM HORIZONTAL CAROUSEL */}
      <div>
        <div className="flex justify-between items-end mb-6 pl-2">
          <h3 className="text-xs font-black text-stone-400 uppercase tracking-[0.2em]">
            Forecast Details
          </h3>
          <span className="text-[10px] font-bold text-stone-300 uppercase tracking-widest hidden sm:block">
            Scroll to explore →
          </span>
        </div>

        <div
          ref={scrollRef}
          className="flex w-full overflow-x-auto gap-4 lg:gap-6 pb-12 custom-scrollbar items-start cursor-grab active:cursor-grabbing"
        >
          {hourlyData.map((hr, i) => {
            const isExpanded = expandedHour === i;
            const isNow = hr.displayTime === "NOW";

            return (
              <div
                key={i}
                className={`flex-shrink-0 w-[280px] sm:w-[320px] bg-white rounded-[32px] border transition-all duration-300 overflow-hidden ${
                  isExpanded
                    ? "border-emerald-200 shadow-xl ring-4 ring-emerald-50/50"
                    : "border-stone-100 shadow-sm hover:border-emerald-100"
                }`}
              >
                <button
                  onClick={() => toggleHour(i)}
                  className="w-full p-6 flex flex-col gap-6 hover:bg-stone-50/50 transition-colors"
                >
                  {/* Top Row: Time and Icon */}
                  <div className="w-full flex justify-between items-center">
                    <span
                      className={`text-sm font-black tracking-widest ${isNow ? "text-emerald-600" : "text-stone-400"}`}
                    >
                      {hr.displayTime}
                    </span>
                    <div
                      className={`p-3 rounded-2xl ${isNow ? "bg-emerald-50" : "bg-stone-50"}`}
                    >
                      {getWeatherIcon(hr.code, 24)}
                    </div>
                  </div>

                  {/* Middle Row: Big Temp & Rain */}
                  <div className="w-full flex justify-between items-end">
                    <span className="text-5xl font-black text-stone-900 tracking-tighter leading-none">
                      {hr.temp}°
                    </span>
                    <div className="flex flex-col items-end gap-1">
                      <span className="flex items-center gap-1 text-sm font-black text-blue-500">
                        <Droplets size={14} /> {hr.rainProb}%
                      </span>
                      <ChevronDown
                        size={20}
                        className={`text-stone-300 transition-transform duration-300 ${isExpanded ? "rotate-180" : ""}`}
                      />
                    </div>
                  </div>
                </button>

                {/* Expanded Deep Dive Data */}
                <div
                  className={`flex flex-col gap-y-4 bg-stone-50/50 px-6 transition-all duration-300 ease-in-out ${
                    isExpanded
                      ? "py-6 border-t border-stone-100 opacity-100 max-h-[500px]"
                      : "max-h-0 opacity-0 overflow-hidden"
                  }`}
                >
                  <DataRow label="Rain Total" value={`${hr.rainAmount}mm`} />

                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">
                      Wind
                    </span>
                    <div className="flex items-center gap-1 text-sm font-black text-stone-700">
                      {hr.windSpeed}
                      <span className="text-[10px] text-stone-400">km/h</span>
                      <ArrowUp
                        size={14}
                        className="text-stone-900 ml-1"
                        style={{ transform: `rotate(${hr.windDeg}deg)` }}
                      />
                    </div>
                  </div>

                  <DataRow label="Humidity" value={`${hr.humidity}%`} />
                  <DataRow label="Dewpoint" value={`${hr.dewpoint}°`} />

                  {/* Highlighted Soil Stats */}
                  <div className="pt-4 mt-2 border-t border-stone-200/50 flex flex-col gap-4">
                    <DataRow
                      label="Soil Temp"
                      value={`${hr.soilTemp}°`}
                      color="text-orange-600"
                    />
                    <DataRow
                      label="Soil Moist"
                      value={`${hr.soilMoisture}%`}
                      color="text-blue-600"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// --- MINI UTILITY COMPONENTS ---
const StatMini = ({
  icon,
  label,
  value,
}: {
  icon: any;
  label: string;
  value: React.ReactNode;
}) => (
  <div className="bg-white p-6 rounded-[32px] border border-stone-100 shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow">
    <div className="text-emerald-500 bg-stone-50 p-4 rounded-2xl hidden sm:block">
      {icon}
    </div>
    <div className="w-full">
      <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest leading-none mb-2.5">
        {label}
      </p>
      <div className="text-2xl md:text-3xl font-black text-stone-900 leading-none tracking-tighter">
        {value}
      </div>
    </div>
  </div>
);

const DataRow = ({
  label,
  value,
  color = "text-stone-700",
}: {
  label: string;
  value: string;
  color?: string;
}) => (
  <div className="flex justify-between items-center">
    <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">
      {label}
    </span>
    <span className={`text-sm font-black ${color}`}>{value}</span>
  </div>
);
