import React, { useState } from "react";
import {
  ArrowLeft,
  Droplets,
  Wind,
  Sun,
  Gauge,
  Thermometer,
  CheckCircle2,
  Scissors,
  Shovel,
  Wheat,
  CloudRain,
  CloudSun,
  AlertTriangle,
  Clock,
  RefreshCw,
  Snowflake,
  X,
  Home,
  CloudSnow,
  Flame,
  Cloud,
  Moon,
  Zap,
} from "lucide-react";
import {
  Location,
  WeatherData,
  InventoryItem,
  GardenTask,
  Plant,
  WeatherAlert,
} from "../types";
import { motion } from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { PlantDetailsModal } from "./PlantDetailsModal";
import { TaskDetailsModal } from "./TaskDetailsModal";
import { getPlantDisplayName } from "../utils/plantUtils";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const getWeatherIcon = (code: number, isDay: boolean) => {
  // ☀️ 0: Clear Sky
  if (code === 0) {
    return isDay ? (
      <Sun
        size={24}
        className="text-amber-500 fill-amber-100 drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]"
      />
    ) : (
      <Moon size={24} className="text-indigo-300 fill-indigo-50/50" />
    );
  }

  // 🌤️ 1 & 2: Mainly Clear / Partly Cloudy
  if (code === 1 || code === 2) {
    return isDay ? (
      <CloudSun size={24} className="text-amber-400" />
    ) : (
      <div className="relative">
        <Moon size={18} className="text-indigo-300 absolute -top-1 -left-1" />
        <Cloud size={20} className="text-slate-400" />
      </div>
    );
  }

  // ☁️ 3: Overcast (Per your request: Blue Sun/Cloud)
  if (code === 3) {
    return <CloudSun size={24} className="text-blue-400" />;
  }

  // 🌫️ 45, 48: Fog/Mist
  if (code === 45 || code === 48) {
    return <Cloud size={24} className="text-stone-300 animate-pulse" />;
  }

  // 🌧️ 51-67: Rain/Drizzle
  if (code >= 51 && code <= 67) {
    return <CloudRain size={24} className="text-blue-500" />;
  }

  // ❄️ 71 - 77: Snow
  if (code >= 71 && code <= 77) {
    return <CloudSnow size={24} className="text-cyan-100" />;
  }

  // ⚡ 95+: Thunderstorm
  if (code >= 95) {
    return <Zap size={24} className="text-amber-500 animate-bounce" />;
  }

  return <Cloud size={24} className="text-stone-400" />;
};

interface LocationDetailsProps {
  userId: string;
  location: Location;
  weather: WeatherData | null;
  inventory: InventoryItem[];
  tasks: GardenTask[];
  plants: Plant[];
  weatherAlerts?: WeatherAlert[];
  onBack: () => void;
  onRefresh: () => Promise<void> | void;
  onToggleTask: (taskId: string, currentStatus: string) => Promise<void>;
  onDismissAlert?: (alertId: string) => void;
}

export const LocationDetails: React.FC<LocationDetailsProps> = ({
  userId,
  location,
  weather,
  inventory,
  tasks,
  plants,
  weatherAlerts = [],
  onBack,
  onRefresh,
  onToggleTask,
  onDismissAlert,
}) => {
  if (!inventory || !tasks) {
    return (
      <div className="p-8 text-center text-stone-500">
        Loading location details...
      </div>
    );
  }

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [selectedTask, setSelectedTask] = useState<GardenTask | null>(null);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await onRefresh();
    setIsRefreshing(false);
  };

  const locationItems = inventory.filter(
    (item) => item.locationId === location.id && item.status === "Planted",
  );
  const locationItemIds = locationItems.map((i) => i.id);

  const locationTasks = tasks
    .filter((task) => {
      const isThisLocation = locationItemIds.includes(
        task.inventoryItemId || "",
      );
      if (!isThisLocation) return false;
      const taskDate = new Date(task.dueDate);
      const today = new Date();
      return (
        taskDate.getDate() === today.getDate() &&
        taskDate.getMonth() === today.getMonth() &&
        taskDate.getFullYear() === today.getFullYear()
      );
    })
    .sort((a, b) => {
      if (a.status === "Completed" && b.status !== "Completed") return 1;
      if (a.status !== "Completed" && b.status === "Completed") return -1;
      return 0;
    });

  const locationAlerts = weatherAlerts.filter(
    (alert) => alert.locationId === location.id,
  );

  const getWindColor = (speed: number) => {
    if (speed > 30) return "text-red-500";
    if (speed > 15) return "text-orange-500";
    return "text-emerald-500";
  };

  const getTaskIcon = (type: GardenTask["type"]) => {
    switch (type) {
      case "Watering":
        return <Droplets size={18} />;
      case "Pruning":
        return <Scissors size={18} />;
      case "Feeding":
        return <Shovel size={18} />;
      case "Harvesting":
        return <Wheat size={18} />;
      default:
        return <CheckCircle2 size={18} />;
    }
  };

  const getAlertStyles = (type: string) => {
    switch (type) {
      case "rain":
        return {
          bg: "bg-blue-50",
          border: "border-blue-200",
          text: "text-blue-900",
          icon: <CloudRain className="text-blue-500" />,
        };
      case "snow":
        return {
          bg: "bg-indigo-50",
          border: "border-indigo-200",
          text: "text-indigo-900",
          icon: <CloudSnow className="text-indigo-500" />,
        };
      case "frost":
        return {
          bg: "bg-cyan-50",
          border: "border-cyan-200",
          text: "text-cyan-900",
          icon: <Snowflake className="text-cyan-500" />,
        };
      case "heat":
        return {
          bg: "bg-orange-50",
          border: "border-orange-200",
          text: "text-orange-900",
          icon: <Flame className="text-orange-500" />,
        };
      case "wind":
        return {
          bg: "bg-red-50",
          border: "border-red-200",
          text: "text-red-900",
          icon: <Wind className="text-red-500" />,
        };
      default:
        return {
          bg: "bg-amber-50",
          border: "border-amber-200",
          text: "text-amber-900",
          icon: <AlertTriangle className="text-amber-500" />,
        };
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-8"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-3 bg-white border border-stone-200 rounded-xl hover:bg-stone-50"
          >
            <ArrowLeft size={20} className="text-stone-600" />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-stone-900">
              {location.name}
            </h1>
            <p className="text-stone-500">{location.address}</p>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="p-3 bg-white border border-stone-200 rounded-xl"
        >
          <RefreshCw size={20} className={isRefreshing ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Alerts */}
      {locationAlerts.length > 0 && (
        <div className="flex flex-col gap-3">
          {locationAlerts.map((alert) => {
            const styles = getAlertStyles(alert.type);
            return (
              <div
                key={alert.id}
                className={cn(
                  "p-5 rounded-[2rem] border-2 flex items-start justify-between gap-4 animate-pulse shadow-sm",
                  styles.bg,
                  styles.border,
                )}
              >
                <div className="flex items-start gap-4">
                  <div className="mt-1">{styles.icon}</div>
                  <div>
                    <div
                      className={cn(
                        "font-black text-sm uppercase tracking-wider mb-1",
                        styles.text,
                      )}
                    >
                      {alert.type} Warning
                    </div>
                    <div
                      className={cn(
                        "text-sm font-medium leading-relaxed",
                        styles.text,
                      )}
                    >
                      {alert.message}
                    </div>
                  </div>
                </div>
                {onDismissAlert && (
                  <button
                    onClick={() => onDismissAlert(alert.id)}
                    className="p-1 hover:bg-black/5 rounded-lg"
                  >
                    <X size={18} className={styles.text} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Weather Dashboard */}
      {weather && (
        <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-stone-100">
          <div className="flex flex-col gap-8">
            <div className="flex flex-col md:flex-row gap-8 items-center">
              <div className="flex items-center gap-4 min-w-[220px]">
                <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-[2rem] flex items-center justify-center">
                  {weather.condition?.includes("Rain") ? (
                    <CloudRain size={40} />
                  ) : (
                    <CloudSun size={40} />
                  )}
                </div>
                <div>
                  <div className="text-5xl font-bold text-stone-900">
                    {(weather.temp ?? 0).toFixed(0)}°C
                  </div>
                  <div className="text-stone-500 font-medium capitalize">
                    {weather.condition}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 w-full">
                <WeatherStat
                  icon={<Droplets size={20} />}
                  label="Humidity"
                  value={`${weather.humidity ?? 0}%`}
                  color="text-blue-400"
                />
                <WeatherStat
                  icon={<Wind size={20} />}
                  label="Wind"
                  value={`${(weather.windSpeed ?? 0).toFixed(1)}`}
                  unit="km/h"
                  color={getWindColor(weather.windSpeed ?? 0)}
                />
                <WeatherStat
                  icon={<Sun size={20} />}
                  label="Peak UV"
                  value={`${(weather.uvMax ?? 0).toFixed(1)}`}
                  color="text-orange-400"
                />
                <WeatherStat
                  icon={<Thermometer size={20} />}
                  label="Dew Point"
                  value={`${(weather.dewPoint ?? 0).toFixed(0)}°C`}
                  color="text-rose-400"
                />
                <WeatherStat
                  icon={<Gauge size={20} />}
                  label="Pressure"
                  value={`${(weather.pressure ?? 0).toFixed(0)}`}
                  unit="hPa"
                  color="text-indigo-400"
                />
              </div>
            </div>

            {/* 24-Hour Forecast */}
            <div className="mt-2">
              <h3 className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-4">
                24-Hour Forecast
              </h3>
              <div className="flex overflow-x-auto gap-4 pb-6 snap-x scrollbar-thin scrollbar-thumb-stone-200 scrollbar-track-transparent">
                {weather.forecast24h?.map((f: any, i: number) => {
                  const hour = new Date(f.time).getHours();
                  // Update this range: 07:00 to 18:00 is Day. Everything else is Night.
                  const isDay = hour >= 7 && hour <= 18;

                  return (
                    <div key={i} className="min-w-[100px] ...">
                      <span className="text-[10px] ...">
                        {new Date(f.time).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>

                      <div className="mb-2">
                        {getWeatherIcon(f.code, isDay)}
                      </div>

                      <span className="font-bold text-stone-900 text-lg">
                        {(f.temp ?? 0).toFixed(0)}°
                      </span>

                      {/* ✅ Enhanced Stats Section */}
                      <div className="flex flex-col gap-1 mt-2 w-full pt-2 border-t border-stone-200/50">
                        <div className="flex items-center justify-between text-[10px] font-bold">
                          <CloudRain size={10} className="text-blue-400" />
                          <span className="text-stone-600">
                            {f.rain.toFixed(1)}mm
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] font-bold">
                          <Wind size={10} className="text-emerald-400" />
                          <span className="text-stone-600">
                            {(f.wind || 0).toFixed(0)}k/h
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Planted Items */}
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-stone-100">
          <h2 className="text-xl font-bold text-stone-900 mb-6">
            Planted Here
          </h2>
          <div className="flex flex-col gap-8">
            {location.areas?.map((area) => {
              const areaItems = locationItems.filter(
                (item) => item.areaId === area.id,
              );
              if (areaItems.length === 0) return null;
              return (
                <div key={area.id} className="flex flex-col gap-4">
                  <div className="flex items-center justify-between border-b border-stone-50 pb-2">
                    <h3 className="text-sm font-bold text-stone-600 uppercase tracking-widest flex items-center gap-2">
                      {area.type === "inside" ? (
                        <Home size={14} />
                      ) : (
                        <Sun size={14} />
                      )}{" "}
                      {area.name}
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    {areaItems.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => setSelectedItem(item)}
                        className="p-4 bg-stone-50 rounded-2xl flex items-center justify-between cursor-pointer hover:bg-stone-100 transition-all"
                      >
                        <span className="font-bold text-stone-800">
                          {getPlantDisplayName(item, false)}
                        </span>
                        <span className="text-xs text-stone-400">
                          {item.isEstablished ? "Established" : "Growing"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Tasks */}
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-stone-100">
          <h2 className="text-xl font-bold text-stone-900 mb-6">
            Location Tasks
          </h2>
          <div className="flex flex-col gap-4">
            {locationTasks.length === 0 ? (
              <div className="py-12 text-center bg-stone-50 rounded-[2rem] border border-dashed border-stone-200">
                <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm">
                  <CheckCircle2 className="text-emerald-500" size={24} />
                </div>
                <p className="text-sm text-stone-900 font-bold">
                  All caught up!
                </p>
                <p className="text-xs text-stone-400">
                  No tasks scheduled for today.
                </p>
              </div>
            ) : (
              locationTasks.map((task) => {
                const item = inventory.find(
                  (i) => i.id === task.inventoryItemId,
                );
                const isAutoCompleted =
                  task.description?.includes("[Auto-completed");
                return (
                  <div
                    key={task.id}
                    onClick={() => setSelectedTask(task)}
                    className={cn(
                      "p-4 rounded-2xl border flex items-center justify-between gap-4 cursor-pointer transition-all",
                      task.status === "Completed"
                        ? "opacity-50 bg-stone-50"
                        : "bg-white border-stone-100 shadow-sm hover:shadow-md",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center",
                          isAutoCompleted
                            ? "bg-blue-50 text-blue-600"
                            : "bg-emerald-50 text-emerald-600",
                        )}
                      >
                        {isAutoCompleted ? (
                          <CloudRain size={18} />
                        ) : (
                          getTaskIcon(task.type)
                        )}
                      </div>
                      <div className="flex flex-col">
                        <span
                          className={cn(
                            "text-sm font-bold",
                            task.status === "Completed" && "line-through",
                          )}
                        >
                          {item
                            ? `${task.type} ${getPlantDisplayName(item, false)}`
                            : task.title}
                        </span>
                        <span className="text-[10px] text-stone-400 uppercase font-bold tracking-tighter">
                          {isAutoCompleted
                            ? "Auto-Completed by Rain"
                            : `Due ${new Date(task.dueDate).toLocaleDateString()}`}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleTask(task.id, task.status);
                      }}
                      className="p-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700"
                    >
                      <CheckCircle2 size={20} />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      {selectedItem && (
        <PlantDetailsModal
          userId={userId}
          item={selectedItem}
          plant={plants.find((p) => p.id === selectedItem.plantId)}
          tasks={tasks}
          weather={weather || undefined}
          onClose={() => setSelectedItem(null)}
        />
      )}
      {selectedTask && (
        <TaskDetailsModal
          task={selectedTask}
          item={inventory.find((i) => i.id === selectedTask.inventoryItemId)}
          onClose={() => setSelectedTask(null)}
          onToggle={onToggleTask}
        />
      )}
    </motion.div>
  );
};

const WeatherStat = ({
  icon,
  label,
  value,
  unit,
  color,
}: {
  icon: any;
  label: string;
  value: string;
  unit?: string;
  color: string;
}) => (
  <div className="flex flex-col items-center p-4 bg-stone-50 rounded-2xl border border-stone-100">
    <div className={cn("mb-2", color)}>{icon}</div>
    <span className="text-lg font-bold text-stone-900">
      {value} {unit && <span className="text-[10px]">{unit}</span>}
    </span>
    <span className="text-[9px] text-stone-400 uppercase font-bold tracking-widest">
      {label}
    </span>
  </div>
);
