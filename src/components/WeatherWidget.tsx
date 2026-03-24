import React, { useState } from "react";
import {
  CloudRain,
  Thermometer,
  Wind,
  AlertTriangle,
  CloudSun,
  Droplets,
  Sun,
  Gauge,
  MapPin,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";
import { WeatherData, Location, GardenTask, InventoryItem } from "../types";
import { motion } from "motion/react";

interface WeatherWidgetProps {
  locations: Location[];
  weatherMap: Record<string, WeatherData>;
  onSelectLocation: (id: string) => void;
  onRefresh: () => Promise<void> | void;
  tasks: GardenTask[];
  inventory: InventoryItem[];
}

export const WeatherWidget: React.FC<WeatherWidgetProps> = ({
  locations,
  weatherMap,
  onSelectLocation,
  onRefresh,
  tasks,
  inventory,
}) => {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await onRefresh();
    setIsRefreshing(false);
  };

  if (locations.length === 0) {
    return (
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-stone-100 text-center flex flex-col items-center justify-center min-h-[200px]">
        <MapPin size={32} className="text-stone-300 mb-4" />
        <p className="text-stone-500 font-medium">
          Add a location below to see weather forecasts.
        </p>
      </div>
    );
  }

  const getWindColor = (speed: number) => {
    if (speed > 30) return "text-red-500";
    if (speed > 15) return "text-orange-500";
    return "text-emerald-500";
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between px-2">
        <h2 className="text-xl font-bold text-stone-900">
          Locations & Weather
        </h2>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="p-2 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-full transition-all disabled:opacity-50"
          title="Refresh Weather"
        >
          <RefreshCw size={20} className={isRefreshing ? "animate-spin" : ""} />
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {locations.map((loc) => {
          const weather = weatherMap[loc.id];

          const now = new Date();
          const today = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
          );

          // Filter real tasks for this location (today or overdue)
          const locationTasks = tasks.filter((task) => {
            if (task.status === "Completed") return false;
            const item = inventory.find((i) => i.id === task.inventoryItemId);
            if (item?.locationId !== loc.id) return false;

            const taskDate = new Date(task.dueDate);
            const taskDay = new Date(
              taskDate.getFullYear(),
              taskDate.getMonth(),
              taskDate.getDate(),
            );
            return taskDay <= today;
          });

          // Deduplicate tasks for the same plant, type, and day
          const deduplicatedTasks = locationTasks.reduce(
            (acc: GardenTask[], current) => {
              const currentDay = new Date(current.dueDate).toDateString();
              const isDuplicate = acc.some(
                (item) =>
                  item.inventoryItemId === current.inventoryItemId &&
                  item.type === current.type &&
                  new Date(item.dueDate).toDateString() === currentDay,
              );
              if (!isDuplicate) {
                acc.push(current);
              }
              return acc;
            },
            [],
          );

          const pendingTaskCount = deduplicatedTasks.length;

          return (
            <motion.div
              key={loc.id}
              whileHover={{ scale: 1.02 }}
              onClick={() => onSelectLocation(loc.id)}
              className="bg-white p-5 rounded-3xl shadow-sm border border-stone-100 cursor-pointer hover:border-blue-200 transition-all flex flex-col gap-4 relative"
            >
              {pendingTaskCount > 0 && (
                <div className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shadow-md animate-bounce">
                  {pendingTaskCount}
                </div>
              )}
              <h3 className="font-bold text-stone-900">{loc.name}</h3>
              {!weather ? (
                <div className="animate-pulse h-24 bg-stone-50 rounded-2xl w-full"></div>
              ) : (
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
                        {weather.condition.includes("Rain") ? (
                          <CloudRain size={24} />
                        ) : (
                          <CloudSun size={24} />
                        )}
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-stone-900">
                          {Math.round(weather.temp)}°C
                        </div>
                        <div className="text-xs text-stone-500 font-medium">
                          {weather.condition}
                        </div>
                      </div>
                    </div>
                    {(weather.todayWarnings?.frost.active ||
                      weather.todayWarnings?.heat.active ||
                      weather.todayWarnings?.wind.active ||
                      weather.tomorrowWarnings?.frost.active ||
                      weather.tomorrowWarnings?.heat.active ||
                      weather.tomorrowWarnings?.wind.active) && (
                      <div
                        className="flex items-center gap-1 bg-amber-100 text-amber-700 px-2 py-1 rounded-lg text-xs font-bold animate-pulse"
                        title="Weather warning for today or tomorrow"
                      >
                        <AlertTriangle size={14} />
                        <span>Warning</span>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="flex flex-col items-center p-2 bg-stone-50 rounded-xl">
                      <Droplets size={16} className="text-blue-400 mb-1" />
                      <span className="text-sm font-bold text-stone-900">
                        {weather.humidity}%
                      </span>
                      <span className="text-[10px] text-stone-400 uppercase tracking-wider">
                        Humid
                      </span>
                    </div>
                    <div className="flex flex-col items-center p-2 bg-stone-50 rounded-xl">
                      <Wind
                        size={16}
                        className={`${getWindColor(weather.windSpeed)} mb-1`}
                      />
                      <span className="text-sm font-bold text-stone-900">
                        {weather.windSpeed}{" "}
                        <span className="text-[10px]">km/h</span>
                      </span>
                      <span className="text-[10px] text-stone-400 uppercase tracking-wider">
                        Wind
                      </span>
                    </div>
                    <div className="flex flex-col items-center p-2 bg-stone-50 rounded-xl">
                      <Sun size={16} className="text-orange-400 mb-1" />
                      <span className="text-sm font-bold text-stone-900">
                        {weather.uvIndex}
                      </span>
                      <span className="text-[10px] text-stone-400 uppercase tracking-wider">
                        UV
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};
