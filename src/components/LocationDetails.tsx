import React, { useState } from 'react';
import { ArrowLeft, Droplets, Wind, Sun, Gauge, Thermometer, CheckCircle2, Scissors, Shovel, Wheat, CloudRain, CloudSun, AlertTriangle, Clock, RefreshCw, Snowflake, X, Home } from 'lucide-react';
import { Location, WeatherData, InventoryItem, GardenTask, Plant, WeatherAlert } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { PlantDetailsModal } from './PlantDetailsModal';
import { TaskDetailsModal } from './TaskDetailsModal';
import { getPlantDisplayName } from '../utils/plantUtils';
import { parseHarvestMonths } from '../utils/dateUtils';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

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

export const LocationDetails: React.FC<LocationDetailsProps> = ({ userId, location, weather, inventory, tasks, plants, weatherAlerts = [], onBack, onRefresh, onToggleTask, onDismissAlert }) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [selectedTask, setSelectedTask] = useState<GardenTask | null>(null);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await onRefresh();
    setIsRefreshing(false);
  };

  const locationItems = inventory.filter(item => item.locationId === location.id && item.status === 'Planted');
  const locationItemIds = locationItems.map(i => i.id);

  const isItemOutdoors = (item: InventoryItem) => {
    if (item.environment === 'Outdoors') return true;
    if (item.environment === 'Indoors') return false;
    
    // If environment is not explicitly set, check the area type
    if (item.locationId && item.areaId) {
      const area = location.areas?.find(a => a.id === item.areaId);
      if (area?.type === 'outside') return true;
    }
    
    // Default to true for planted items if no other info (safe assumption for rain)
    return item.status === 'Planted';
  };
  
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // 1. Filter real tasks for this location (today or overdue)
  const realLocationTasks = tasks.filter(task => {
    if (!locationItemIds.includes(task.inventoryItemId || '')) return false;
    
    const taskDate = new Date(task.dueDate);
    const taskDay = new Date(taskDate.getFullYear(), taskDate.getMonth(), taskDate.getDate());

    // If completed, check if it's recent (last 24h)
    if (task.status === 'Completed') {
      if (!task.completedAt) return true;
      const diffMs = now.getTime() - new Date(task.completedAt).getTime();
      return diffMs < 24 * 60 * 60 * 1000;
    }

    // If pending, show if due today or overdue
    return taskDay <= today;
  });

  // 2. Add virtual tasks for today (Watering, Harvesting, Planting)
  const virtualTasks: GardenTask[] = [];
  
  locationItems.forEach(item => {
    const plant = plants.find(p => p.id === item.plantId || p.name === item.plantName);
    if (!plant) return;

    // A. Virtual Watering
    const waterStr = (plant.careGuide?.water || 'every 3 days').toLowerCase();
    let frequencyDays = 0;
    
    if (waterStr.includes('daily')) frequencyDays = 1;
    else if (waterStr.includes('every other day')) frequencyDays = 2;
    else {
      const timesAWeekMatch = waterStr.match(/(\d+)\s*(?:-|to)?\s*(\d+)?\s*times?\s*(?:a|per)?\s*week/);
      if (timesAWeekMatch) {
        const times = parseInt(timesAWeekMatch[2] || timesAWeekMatch[1]);
        frequencyDays = Math.max(1, Math.floor(7 / times));
      } else if (waterStr.includes('twice a week')) frequencyDays = 3;
      else if (waterStr.includes('once a week') || waterStr.includes('weekly')) frequencyDays = 7;
      else if (waterStr.includes('every 2 weeks')) frequencyDays = 14;
      else if (waterStr.includes('dry')) frequencyDays = 3;
      else {
        const everyXDaysMatch = waterStr.match(/every\s*(\d+)\s*days?/);
        if (everyXDaysMatch) frequencyDays = parseInt(everyXDaysMatch[1]);
      }
    }
    
    if (frequencyDays === 0 && waterStr.length > 0) frequencyDays = 7;

    if (frequencyDays > 0) {
      const itemWaterTasks = tasks
        .filter(t => t.inventoryItemId === item.id && t.type.toLowerCase() === 'watering')
        .sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime());
      
      let lastWateringDateStr = item.plantedAt || item.createdAt;
      if (itemWaterTasks.length > 0) lastWateringDateStr = itemWaterTasks[0].dueDate;

      const lastWatering = new Date(lastWateringDateStr);
      lastWatering.setHours(0, 0, 0, 0);
      
      let nextWatering = new Date(lastWatering);
      const diffDays = Math.floor((today.getTime() - nextWatering.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays > frequencyDays) {
        const skip = Math.floor(diffDays / frequencyDays) * frequencyDays;
        nextWatering = new Date(nextWatering.getTime() + skip * 24 * 60 * 60 * 1000);
      }

      if (nextWatering.toDateString() === today.toDateString()) {
        const exists = realLocationTasks.some(t => t.inventoryItemId === item.id && t.type.toLowerCase() === 'watering');
        if (!exists) {
          const isRainExpected = weather?.todayWarnings?.rain.active && isItemOutdoors(item);
          virtualTasks.push({
            id: `virtual-${item.id}-${today.getTime()}`,
            title: `Water ${getPlantDisplayName(item, true)}`,
            description: isRainExpected 
              ? `Task auto-completed due to expected rain.\n\nOriginal Instructions:\n- Time: Early morning or late evening\n- Method: Water at the base, avoid leaves\n- Frequency: ${plant.careGuide?.water || 'As needed'}`
              : `Predicted watering task based on your ${item.plantName}'s care guide.\n\nInstructions:\n- Time: Early morning or late evening\n- Method: Water at the base, avoid leaves\n- Frequency: ${plant.careGuide?.water || 'As needed'}`,
            type: 'Watering',
            status: isRainExpected ? 'Completed' : 'Pending',
            completedAt: isRainExpected ? today.toISOString() : undefined,
            isVirtual: true,
            dueDate: today.toISOString(),
            inventoryItemId: item.id
          });
        }
      }
    }

    // B. Harvest Season (Virtual)
    const monthIdx = today.getMonth();
    if (plant.careGuide?.harvestMonth) {
      const harvestMonths = parseHarvestMonths(plant.careGuide.harvestMonth);
      if (harvestMonths.includes(monthIdx)) {
        virtualTasks.push({
          id: `harvest-${item.id}-${today.getTime()}`,
          title: `Harvest ${getPlantDisplayName(item, true)}`,
          description: `This is the peak harvest season for your ${item.plantName}. Check for ripeness and harvest as needed.\n\nGeneral Guide:\n${plant.careGuide.harvestMonth ? `Harvest Months: ${plant.careGuide.harvestMonth}` : ''}\n${plant.careGuide.sun ? `Sun: ${plant.careGuide.sun}` : ''}`,
          type: 'Harvesting',
          status: 'Pending',
          dueDate: today.toISOString(),
          inventoryItemId: item.id,
          isVirtual: true
        });
      }
    }
  });

  // 3. Combine and Deduplicate
  const allTasks = [...realLocationTasks, ...virtualTasks];
  const deduplicatedTasks = allTasks.reduce((acc: GardenTask[], current) => {
    if (current.status === 'Completed') {
      const currentDay = new Date(current.dueDate).toDateString();
      const isDuplicate = acc.some(item => 
        item.inventoryItemId === current.inventoryItemId && 
        item.type === current.type && 
        new Date(item.dueDate).toDateString() === currentDay &&
        item.status === current.status
      );
      if (!isDuplicate) {
        acc.push(current);
      }
    } else {
      // For pending tasks, only keep the oldest one for this plant and type
      const existingPendingIndex = acc.findIndex(item => 
        item.inventoryItemId === current.inventoryItemId && 
        item.type === current.type && 
        item.status !== 'Completed'
      );
      
      if (existingPendingIndex >= 0) {
        const existing = acc[existingPendingIndex];
        if (new Date(current.dueDate).getTime() < new Date(existing.dueDate).getTime()) {
          acc[existingPendingIndex] = current;
        }
      } else {
        acc.push(current);
      }
    }
    return acc;
  }, []);

  // 4. Sort: pending first, then completed. Within each, sort by due date.
  const locationTasks = [...deduplicatedTasks].sort((a, b) => {
    if (a.status === 'Completed' && b.status !== 'Completed') return 1;
    if (a.status !== 'Completed' && b.status === 'Completed') return -1;
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
  });

  const locationAlerts = weatherAlerts.filter(alert => alert.id.split('-')[1] === location.id);

  const getWindColor = (speed: number) => {
    if (speed > 30) return 'text-red-500';
    if (speed > 15) return 'text-orange-500';
    return 'text-emerald-500';
  };

  const getTaskIcon = (type: GardenTask['type']) => {
    switch (type) {
      case 'Watering': return <Droplets size={18} />;
      case 'Pruning': return <Scissors size={18} />;
      case 'Feeding': return <Shovel size={18} />;
      case 'Harvesting': return <Wheat size={18} />;
      default: return <CheckCircle2 size={18} />;
    }
  };

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-8"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-3 bg-white border border-stone-200 rounded-xl hover:bg-stone-50 transition-all">
            <ArrowLeft size={20} className="text-stone-600" />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-stone-900">{location.name}</h1>
            <p className="text-stone-500">{location.address}</p>
          </div>
        </div>
        <button 
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="p-3 bg-white border border-stone-200 rounded-xl text-stone-600 hover:bg-stone-50 transition-all disabled:opacity-50"
          title="Refresh Weather"
        >
          <RefreshCw size={20} className={isRefreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {locationAlerts.length > 0 && (
        <div className="flex flex-col gap-3">
            {locationAlerts.map(alert => {
              let bgClass = 'bg-blue-50 border-blue-200 text-blue-800';
              let Icon = Snowflake;
              let iconClass = 'text-blue-600';

              if (alert.type === 'wind') {
                bgClass = 'bg-orange-50 border-orange-200 text-orange-800';
                Icon = Wind;
                iconClass = 'text-orange-600';
              } else if (alert.type === 'rain') {
                bgClass = 'bg-cyan-50 border-cyan-200 text-cyan-800';
                Icon = Droplets;
                iconClass = 'text-cyan-600';
              } else if (alert.type === 'frost') {
                bgClass = 'bg-amber-50 border-amber-200 text-amber-800';
                Icon = AlertTriangle;
                iconClass = 'text-amber-600';
              }

              return (
                <div key={alert.id} className={`p-4 rounded-2xl flex items-start justify-between gap-3 border animate-pulse ${bgClass}`}>
                  <div className="flex items-start gap-3">
                    <Icon size={20} className={`mt-0.5 ${iconClass}`} />
                    <div>
                      <div className="font-bold text-sm">{alert.locationName}</div>
                      <div className="text-sm opacity-90">{alert.message}</div>
                    </div>
                  </div>
                  {onDismissAlert && (
                    <button 
                      onClick={() => onDismissAlert(alert.id)}
                      className="p-1 hover:bg-black/5 rounded-lg transition-all"
                      title="Dismiss Alert"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              );
            })}
        </div>
      )}

      {/* Weather Details */}
      {weather && (
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-stone-100">
          <h2 className="text-xl font-bold text-stone-900 mb-6">Current Conditions</h2>
          <div className="flex flex-col gap-8">
            <div className="flex flex-col md:flex-row gap-8 items-center md:items-start">
              <div className="flex items-center gap-4 min-w-[200px]">
                <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
                  {weather.condition.includes('Rain') ? <CloudRain size={32} /> : <CloudSun size={32} />}
                </div>
                <div>
                  <div className="text-4xl font-bold text-stone-900">{Math.round(weather.temp)}°C</div>
                  <div className="text-stone-500 font-medium">{weather.condition}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 w-full">
                <div className="flex flex-col items-center p-4 bg-stone-50 rounded-2xl">
                  <Droplets size={20} className="text-blue-400 mb-2" />
                  <span className="text-lg font-bold">{weather.humidity}%</span>
                  <span className="text-xs text-stone-400 uppercase tracking-wider">Humidity</span>
                </div>
                <div className="flex flex-col items-center p-4 bg-stone-50 rounded-2xl">
                  <Wind size={20} className={`${getWindColor(weather.windSpeed)} mb-2`} />
                  <span className="text-lg font-bold">{weather.windSpeed} <span className="text-xs">km/h</span></span>
                  <span className="text-xs text-stone-400 uppercase tracking-wider">Wind</span>
                </div>
                <div className="flex flex-col items-center p-4 bg-stone-50 rounded-2xl">
                  <Sun size={20} className="text-orange-400 mb-2" />
                  <span className="text-lg font-bold">{weather.uvIndex}</span>
                  <span className="text-xs text-stone-400 uppercase tracking-wider">UV Index</span>
                </div>
                <div className="flex flex-col items-center p-4 bg-stone-50 rounded-2xl">
                  <Thermometer size={20} className="text-rose-400 mb-2" />
                  <span className="text-lg font-bold">{Math.round(weather.dewPoint)}°C</span>
                  <span className="text-xs text-stone-400 uppercase tracking-wider">Dew Point</span>
                </div>
                <div className="flex flex-col items-center p-4 bg-stone-50 rounded-2xl">
                  <Gauge size={20} className="text-indigo-400 mb-2" />
                  <span className="text-lg font-bold">{Math.round(weather.pressure)}</span>
                  <span className="text-xs text-stone-400 uppercase tracking-wider">hPa</span>
                </div>
              </div>
            </div>

            {/* 12-Hour Forecast */}
            <div className="mt-4">
              <h3 className="text-sm font-bold text-stone-900 uppercase tracking-wider mb-4">12-Hour Forecast</h3>
              <div className="flex overflow-x-auto gap-4 pb-4 snap-x hide-scrollbar">
                {weather.forecast.map((f, i) => (
                  <div key={i} className="min-w-[80px] flex flex-col items-center p-4 bg-stone-50 rounded-2xl snap-start border border-stone-100">
                    <span className="text-xs font-bold text-stone-500 mb-2">{formatTime(f.date)}</span>
                    <div className="text-blue-500 mb-2">
                      {f.condition.includes('Rain') ? <CloudRain size={24} /> : <CloudSun size={24} />}
                    </div>
                    <span className="font-bold text-stone-900 text-lg">{Math.round(f.temp)}°</span>
                    {f.rain > 0 && <span className="text-[10px] font-bold text-blue-500 mt-1">{f.rain}mm</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Planted Here */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-stone-100">
          <h2 className="text-xl font-bold text-stone-900 mb-6">Planted Here</h2>
          <div className="flex flex-col gap-6">
            {locationItems.length === 0 ? (
              <p className="text-stone-500 text-sm text-center py-8 bg-stone-50 rounded-2xl">No plants here yet.</p>
            ) : (
              <>
                {/* Group by area */}
                {location.areas?.map(area => {
                  const areaItems = locationItems.filter(item => item.areaId === area.id);
                  if (areaItems.length === 0) return null;
                  return (
                    <div key={area.id} className="flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-stone-600 uppercase tracking-wider flex items-center gap-2">
                          {area.type === 'inside' ? <Home size={16} className="text-blue-500" /> : <Sun size={16} className="text-orange-500" />}
                          {area.name}
                        </h3>
                        <span className={cn(
                          "text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full",
                          area.type === 'inside' ? "bg-blue-50 text-blue-600" : "bg-orange-50 text-orange-600"
                        )}>
                          {area.type === 'inside' ? 'Inside' : 'Outside'}
                        </span>
                      </div>
                      <div className="flex flex-col gap-3">
                        {areaItems.map(item => (
                          <div 
                            key={item.id} 
                            onClick={() => setSelectedItem(item)}
                            className="p-4 bg-stone-50 rounded-2xl flex items-center justify-between cursor-pointer hover:bg-stone-100 transition-all hover:shadow-sm"
                          >
                            <div className="flex flex-col">
                              <span className="font-bold text-stone-900">{getPlantDisplayName(item, false)}</span>
                              {item.environment && (
                                <span className="text-xs text-stone-500">{item.environment}</span>
                              )}
                            </div>
                            <span className="text-xs text-stone-500 flex items-center gap-1">
                              <Clock size={12} />
                              {item.isEstablished ? 'Established' : (item.plantedAt ? new Date(item.plantedAt).toLocaleDateString() : 'Unknown Date')}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}

                {/* Unassigned items */}
                {(() => {
                  const unassignedItems = locationItems.filter(item => !item.areaId || !location.areas?.some(a => a.id === item.areaId));
                  if (unassignedItems.length === 0) return null;
                  return (
                    <div className="flex flex-col gap-3">
                      {location.areas && location.areas.length > 0 && (
                        <h3 className="text-sm font-bold text-stone-600 uppercase tracking-wider">Unassigned</h3>
                      )}
                      <div className="flex flex-col gap-3">
                        {unassignedItems.map(item => (
                          <div 
                            key={item.id} 
                            onClick={() => setSelectedItem(item)}
                            className="p-4 bg-stone-50 rounded-2xl flex items-center justify-between cursor-pointer hover:bg-stone-100 transition-all hover:shadow-sm"
                          >
                            <div className="flex flex-col">
                              <span className="font-bold text-stone-900">{getPlantDisplayName(item, false)}</span>
                              {item.environment && (
                                <span className="text-xs text-stone-500">{item.environment}</span>
                              )}
                            </div>
                            <span className="text-xs text-stone-500 flex items-center gap-1">
                              <Clock size={12} />
                              {item.isEstablished ? 'Established' : (item.plantedAt ? new Date(item.plantedAt).toLocaleDateString() : 'Unknown Date')}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        </div>

        {/* To-Do List */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-stone-100">
          <h2 className="text-xl font-bold text-stone-900 mb-6">Location Tasks</h2>
          <div className="flex flex-col gap-4">
            {locationTasks.length === 0 ? (
              <p className="text-stone-500 text-sm text-center py-8 bg-stone-50 rounded-2xl">All caught up!</p>
            ) : (
              locationTasks.map(task => {
                const isCompleted = task.status === 'Completed';
                const item = inventory.find(i => i.id === task.inventoryItemId);
                const isRainPostponed = weather?.todayWarnings?.rain.active && task.type === 'Watering' && !isCompleted && item && isItemOutdoors(item);
                return (
                  <div 
                    key={task.id} 
                    onClick={() => setSelectedTask(task)}
                    className={`p-4 rounded-2xl border flex items-center justify-between gap-4 cursor-pointer transition-all ${(isRainPostponed || isCompleted) ? 'opacity-60 bg-stone-50 border-stone-100' : 'bg-white border-stone-200 shadow-sm hover:bg-stone-50'}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-stone-100 text-stone-600 rounded-xl flex items-center justify-center">
                        {getTaskIcon(task.type)}
                      </div>
                      <div className="flex flex-col">
                        <span className={`text-sm font-bold ${isCompleted ? 'text-stone-500 line-through' : 'text-stone-900'}`}>
                          {item ? `${task.type} ${getPlantDisplayName(item, false)}` : task.title}
                        </span>
                        <span className="text-[10px] text-stone-400 uppercase tracking-widest">
                          {isCompleted ? 'Completed' : isRainPostponed ? 'Postponed - Rain' : task.isVirtual ? 'Predicted Task' : `Due ${new Date(task.dueDate).toLocaleDateString()}`}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleTask(task.id, task.status);
                      }}
                      disabled={isRainPostponed}
                      className={`p-2 rounded-xl transition-all ${isCompleted ? 'bg-emerald-600 text-white hover:bg-emerald-700' : isRainPostponed ? 'cursor-not-allowed bg-stone-100 text-stone-400' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white'}`}
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

      {selectedItem && (
        <PlantDetailsModal
          userId={userId}
          item={inventory.find(i => i.id === selectedItem.id) || selectedItem}
          plant={plants.find(p => p.id === selectedItem.plantId || p.name === selectedItem.plantName)}
          tasks={tasks}
          weather={weather || undefined}
          onClose={() => setSelectedItem(null)}
        />
      )}

      {selectedTask && (
        <TaskDetailsModal
          task={selectedTask}
          item={inventory.find(i => i.id === selectedTask.inventoryItemId)}
          onClose={() => setSelectedTask(null)}
          onToggle={onToggleTask}
        />
      )}
    </motion.div>
  );
};
