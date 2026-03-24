import React, { useState, useMemo } from 'react';
import { 
  format, 
  addMonths, 
  subMonths, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  isToday,
  addDays,
  isWithinInterval
} from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Droplets, Wheat, Scissors, Shovel, CheckCircle2, Filter, Sprout } from 'lucide-react';
import { InventoryItem, GardenTask, Plant, Location, WeatherData } from '../types';
import { parseHarvestMonths } from '../utils/dateUtils';
import { getPlantDisplayName } from '../utils/plantUtils';
import { TaskDetailsModal } from './TaskDetailsModal';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface CalendarViewProps {
  inventory: InventoryItem[];
  tasks: GardenTask[];
  plants: Plant[];
  locations: Location[];
  weatherMap: Record<string, WeatherData>;
  onToggleTask: (taskId: string, currentStatus: string) => Promise<void>;
}

export const CalendarView: React.FC<CalendarViewProps> = ({ inventory, tasks, plants, locations, weatherMap, onToggleTask }) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [filterLocationId, setFilterLocationId] = useState<string>('all');
  const [selectedTask, setSelectedTask] = useState<GardenTask | null>(null);

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);

  const calendarDays = eachDayOfInterval({
    start: startDate,
    end: endDate,
  });

  const getTaskIcon = (type: GardenTask['type']) => {
    switch (type) {
      case 'Watering': return <Droplets size={12} />;
      case 'Pruning': return <Scissors size={12} />;
      case 'Feeding': return <Shovel size={12} />;
      case 'Harvesting': return <Wheat size={12} />;
      default: return <CheckCircle2 size={12} />;
    }
  };

  const getTaskColor = (type: GardenTask['type']) => {
    switch (type) {
      case 'Watering': return 'bg-blue-100 text-blue-600';
      case 'Pruning': return 'bg-emerald-100 text-emerald-600';
      case 'Feeding': return 'bg-orange-100 text-orange-600';
      case 'Harvesting': return 'bg-amber-100 text-amber-600';
      default: return 'bg-stone-100 text-stone-600';
    }
  };

  const dayTasks = (day: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dayStart = new Date(day);
    dayStart.setHours(0, 0, 0, 0);
    const isToday = isSameDay(dayStart, today);

    // 1. Real Tasks
    let realTasks = tasks.filter(task => {
      const taskDate = new Date(task.dueDate);
      taskDate.setHours(0, 0, 0, 0);
      
      if (isToday) {
        // Show tasks due today, OR tasks due in the past that are NOT completed
        return isSameDay(taskDate, dayStart) || (taskDate < today && task.status !== 'Completed');
      } else if (dayStart < today) {
        // For past days, only show tasks that were due on that day AND are completed
        return isSameDay(taskDate, dayStart) && task.status === 'Completed';
      } else {
        // For future days, show tasks due on that day
        return isSameDay(taskDate, dayStart);
      }
    });
    
    // Apply location filter to real tasks
    if (filterLocationId !== 'all') {
      realTasks = realTasks.filter(task => {
        const item = inventory.find(i => i.id === task.inventoryItemId);
        return item?.locationId === filterLocationId;
      });
    }

    // Deduplicate real tasks (especially for today where overdue tasks roll over)
    realTasks = realTasks.reduce((acc: GardenTask[], current) => {
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
    
    // 2. Virtual watering tasks (Projected for the whole year)
    const virtualTasks: any[] = [];
    
    // Only project forward from today (or the visible range)
    if (day >= today) {
      inventory
        .filter(item => item.status === 'Planted')
        .filter(item => filterLocationId === 'all' || item.locationId === filterLocationId)
        .forEach(item => {
          const plant = plants.find(p => p.id === item.plantId || p.name === item.plantName);
          
          // Improved frequency parsing
          const waterStr = (plant?.careGuide?.water || 'every 3 days').toLowerCase();
          let frequencyDays = 0;
          
          if (waterStr.includes('daily')) {
            frequencyDays = 1;
          } else if (waterStr.includes('every other day')) {
            frequencyDays = 2;
          } else {
            // Check for "X times a week" (e.g., "2-3 times a week", "3 times a week")
            const timesAWeekMatch = waterStr.match(/(\d+)\s*(?:-|to)?\s*(\d+)?\s*times?\s*(?:a|per)?\s*week/);
            if (timesAWeekMatch) {
              const times = parseInt(timesAWeekMatch[2] || timesAWeekMatch[1]);
              frequencyDays = Math.max(1, Math.floor(7 / times));
            } else if (waterStr.includes('twice a week')) {
              frequencyDays = 3;
            } else if (waterStr.includes('once a week') || waterStr.includes('weekly')) {
              frequencyDays = 7;
            } else if (waterStr.includes('every 2 weeks')) {
              frequencyDays = 14;
            } else if (waterStr.includes('dry')) {
              frequencyDays = 3; // Default fallback for "when soil is dry"
            } else {
              // Check for "every X days"
              const everyXDaysMatch = waterStr.match(/every\s*(\d+)\s*days?/);
              if (everyXDaysMatch) {
                frequencyDays = parseInt(everyXDaysMatch[1]);
              }
            }
          }
          
          // If still 0, but we have a water string, default to weekly to be safe
          if (frequencyDays === 0 && waterStr.length > 0) {
            frequencyDays = 7;
          }
          
          if (frequencyDays > 0) {
            // Find the last watering task for this item
            const itemWaterTasks = tasks
              .filter(t => t.inventoryItemId === item.id && t.type.toLowerCase() === 'watering')
              .sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime());
            
            let lastWateringDateStr = item.plantedAt || item.createdAt;
            if (itemWaterTasks.length > 0) {
              lastWateringDateStr = itemWaterTasks[0].dueDate;
            }

            const lastWatering = new Date(lastWateringDateStr);
            lastWatering.setHours(0, 0, 0, 0);
            
            // Project forward from lastWatering
            let nextWatering = new Date(lastWatering);
            
            // If lastWatering is in the past, skip ahead to near today to avoid excessive looping
            const diffDays = Math.floor((today.getTime() - nextWatering.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays > frequencyDays) {
              const skip = Math.floor(diffDays / frequencyDays) * frequencyDays;
              nextWatering = addDays(nextWatering, skip);
            }

            // Safety break to prevent infinite loops
            let iterations = 0;
            while (nextWatering <= day && iterations < 365) { // Allow projecting up to a year
              if (isSameDay(nextWatering, day) && nextWatering >= today) {
                // Check if a real task already exists for this day to avoid duplicates
                const exists = realTasks.some(t => 
                  t.inventoryItemId === item.id && 
                  t.type.toLowerCase() === 'watering'
                );
                if (!exists) {
                  const locWeather = item.locationId ? weatherMap[item.locationId] : null;
                  const isRainExpected = locWeather?.rainExpected && isSameDay(day, today);
                  
                  virtualTasks.push({
                    id: `virtual-${item.id}-${day.getTime()}`,
                    title: `Water ${getPlantDisplayName(item, true)}`,
                    description: isRainExpected 
                      ? `Rain is expected at this location. Task auto-completed.\n\nOriginal Instructions:\n- Time: Early morning or late evening\n- Method: Water at the base, avoid leaves\n- Frequency: ${plant?.careGuide?.water || 'As needed'}`
                      : `Predicted watering task based on your ${item.plantName}'s care guide.\n\nInstructions:\n- Time: Early morning or late evening\n- Method: Water at the base, avoid leaves\n- Frequency: ${plant?.careGuide?.water || 'As needed'}`,
                    type: 'Watering',
                    status: isRainExpected ? 'Completed' : 'Pending',
                    completedAt: isRainExpected ? day.toISOString() : undefined,
                    isVirtual: true,
                    dueDate: day.toISOString(),
                    inventoryItemId: item.id
                  });
                }
                break;
              }
              nextWatering = addDays(nextWatering, frequencyDays);
              iterations++;
            }
          }
        });
    }
    
    return [...realTasks, ...virtualTasks];
  };

  const dayHarvests = (day: Date) => {
    const monthIdx = day.getMonth();
    return inventory
      .filter(item => item.status === 'Planted')
      .filter(item => filterLocationId === 'all' || item.locationId === filterLocationId)
      .filter(item => {
        const plant = plants.find(p => p.id === item.plantId || p.name === item.plantName);
        if (!plant?.careGuide?.harvestMonth) return false;
        const harvestMonths = parseHarvestMonths(plant.careGuide.harvestMonth);
        return harvestMonths.includes(monthIdx);
      });
  };

  const dayPlantingReminders = (day: Date) => {
    const monthIdx = day.getMonth();
    return inventory
      .filter(item => item.status === 'In Shed')
      .filter(item => {
        const plant = plants.find(p => p.id === item.plantId || p.name === item.plantName);
        if (!plant?.careGuide?.plantingMonth) return false;
        const plantingMonths = parseHarvestMonths(plant.careGuide.plantingMonth);
        return plantingMonths.includes(monthIdx);
      });
  };

  const selectedDayTasks = selectedDate ? dayTasks(selectedDate) : [];
  const selectedDayHarvests = selectedDate ? dayHarvests(selectedDate) : [];
  const selectedDayPlanting = selectedDate ? dayPlantingReminders(selectedDate) : [];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center shadow-sm">
            <CalendarIcon size={28} />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-stone-900 tracking-tight">Garden Calendar</h2>
            <p className="text-sm text-stone-500">Plan your season and track upcoming tasks</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Location Filter */}
          <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-2xl border border-stone-100 shadow-sm">
            <Filter size={16} className="text-stone-400" />
            <select
              value={filterLocationId}
              onChange={(e) => setFilterLocationId(e.target.value)}
              className="text-sm font-bold text-stone-600 bg-transparent focus:outline-none cursor-pointer"
            >
              <option value="all">All Locations</option>
              {locations.map(loc => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 bg-white p-1 rounded-2xl border border-stone-100 shadow-sm">
            <button onClick={prevMonth} className="p-2 hover:bg-stone-50 rounded-xl transition-all text-stone-600">
              <ChevronLeft size={20} />
            </button>
            <span className="px-4 font-bold text-stone-900 min-w-[140px] text-center">
              {format(currentMonth, 'MMMM yyyy')}
            </span>
            <button onClick={nextMonth} className="p-2 hover:bg-stone-50 rounded-xl transition-all text-stone-600">
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Calendar Grid */}
        <div className="lg:col-span-3 bg-white p-6 rounded-[2.5rem] shadow-sm border border-stone-100">
          <div className="grid grid-cols-7 mb-4">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="text-center text-[10px] font-bold text-stone-400 uppercase tracking-widest py-2">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-px bg-stone-100 rounded-2xl overflow-hidden border border-stone-100">
            {calendarDays.map((day, idx) => {
              const tasksOnDay = dayTasks(day);
              const harvestsOnDay = dayHarvests(day);
              const plantingOnDay = dayPlantingReminders(day);
              const isSelected = selectedDate && isSameDay(day, selectedDate);
              const isCurrentMonth = isSameMonth(day, monthStart);

              return (
                <div
                  key={idx}
                  onClick={() => setSelectedDate(day)}
                  className={cn(
                    "min-h-[100px] p-2 bg-white cursor-pointer transition-all hover:bg-stone-50 relative group",
                    !isCurrentMonth && "bg-stone-50/50",
                    isSelected && "ring-2 ring-emerald-500 ring-inset z-10"
                  )}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className={cn(
                      "text-sm font-bold w-7 h-7 flex items-center justify-center rounded-full transition-all",
                      isToday(day) ? "bg-emerald-600 text-white" : isSelected ? "text-emerald-600" : "text-stone-900",
                      !isCurrentMonth && "opacity-30"
                    )}>
                      {format(day, 'd')}
                    </span>
                  </div>
                  
                  <div className="flex flex-col gap-1">
                    {tasksOnDay.slice(0, 2).map(task => {
                      const item = inventory.find(i => i.id === task.inventoryItemId);
                      const label = item ? `${task.type} ${getPlantDisplayName(item, true)}` : task.title;
                      
                      let daysOverdue = 0;
                      if (task.status !== 'Completed' && !task.isVirtual) {
                        const taskDate = new Date(task.dueDate);
                        taskDate.setHours(0, 0, 0, 0);
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        daysOverdue = Math.floor((today.getTime() - taskDate.getTime()) / (1000 * 60 * 60 * 24));
                      }
                      
                      return (
                        <div key={task.id} className={cn("text-[10px] px-1.5 py-0.5 rounded-md font-bold truncate flex items-center gap-1", daysOverdue > 0 ? "bg-red-100 text-red-700" : getTaskColor(task.type))}>
                          {getTaskIcon(task.type)}
                          <span className="truncate">{label}</span>
                          {daysOverdue > 0 && (
                            <span className="bg-red-600 text-white text-[8px] px-1 rounded-sm ml-auto shrink-0">+{daysOverdue}</span>
                          )}
                        </div>
                      );
                    })}
                    {harvestsOnDay.length > 0 && tasksOnDay.length < 2 && (
                      <div className="text-[10px] px-1.5 py-0.5 rounded-md font-bold bg-amber-50 text-amber-600 truncate flex items-center gap-1">
                        <Wheat size={10} />
                        Harvest
                      </div>
                    )}
                    {plantingOnDay.length > 0 && tasksOnDay.length < 1 && harvestsOnDay.length === 0 && (
                      <div className="text-[10px] px-1.5 py-0.5 rounded-md font-bold bg-emerald-50 text-emerald-600 truncate flex items-center gap-1">
                        <Sprout size={10} />
                        Planting
                      </div>
                    )}
                    {(tasksOnDay.length + (harvestsOnDay.length > 0 ? 1 : 0) + (plantingOnDay.length > 0 ? 1 : 0)) > 2 && (
                      <div className="text-[9px] text-stone-400 font-bold pl-1">
                        + {(tasksOnDay.length + (harvestsOnDay.length > 0 ? 1 : 0) + (plantingOnDay.length > 0 ? 1 : 0)) - 2} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Day Details */}
        <div className="flex flex-col gap-6">
          <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-stone-100 h-full">
            <h3 className="text-lg font-bold text-stone-900 mb-1">
              {selectedDate ? format(selectedDate, 'EEEE, MMM do') : 'Select a date'}
            </h3>
            <p className="text-xs text-stone-500 mb-6">Daily schedule & reminders</p>

            <div className="flex flex-col gap-4">
              {selectedDayTasks.length === 0 && selectedDayHarvests.length === 0 && selectedDayPlanting.length === 0 ? (
                <div className="py-12 text-center bg-stone-50 rounded-3xl border border-stone-100">
                  <p className="text-sm text-stone-400">No tasks or reminders for this day.</p>
                </div>
              ) : (
                <>
                  {selectedDayTasks.length > 0 && (
                    <div className="flex flex-col gap-3">
                      <h4 className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Tasks</h4>
                      {selectedDayTasks.map(task => {
                        const item = inventory.find(i => i.id === task.inventoryItemId);
                        const label = item ? `${task.type} ${getPlantDisplayName(item, true)}` : task.title;
                        const isCompleted = task.status === 'Completed';
                        
                        let daysOverdue = 0;
                        if (!isCompleted && !task.isVirtual) {
                          const taskDate = new Date(task.dueDate);
                          taskDate.setHours(0, 0, 0, 0);
                          const today = new Date();
                          today.setHours(0, 0, 0, 0);
                          daysOverdue = Math.floor((today.getTime() - taskDate.getTime()) / (1000 * 60 * 60 * 24));
                        }
                        
                        return (
                          <div 
                            key={task.id} 
                            onClick={() => setSelectedTask(task)}
                            className={cn(
                              "p-3 bg-stone-50 rounded-2xl border border-stone-100 flex items-center gap-3 transition-all cursor-pointer hover:bg-stone-100 hover:shadow-sm",
                              isCompleted && "opacity-60 grayscale",
                              daysOverdue > 0 && "border-red-100 bg-red-50 hover:bg-red-100"
                            )}
                          >
                            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", daysOverdue > 0 ? "bg-red-100 text-red-600" : getTaskColor(task.type))}>
                              {getTaskIcon(task.type)}
                            </div>
                            <div className="flex flex-col">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={cn("text-sm font-bold", daysOverdue > 0 ? "text-red-900" : "text-stone-900", isCompleted && "line-through")}>{label}</span>
                                {daysOverdue > 0 && (
                                  <span className="bg-red-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md whitespace-nowrap">
                                    +{daysOverdue} {daysOverdue === 1 ? 'day' : 'days'}
                                  </span>
                                )}
                              </div>
                              <span className={cn("text-[10px] uppercase tracking-wider mt-0.5", daysOverdue > 0 ? "text-red-500" : "text-stone-500")}>{task.type} {task.isVirtual ? '(Predicted)' : ''}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {selectedDayHarvests.length > 0 && (
                    <div className="flex flex-col gap-3">
                      <h4 className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Harvest Season</h4>
                      {selectedDayHarvests.map(item => {
                        const plant = plants.find(p => p.id === item.plantId || p.name === item.plantName);
                        const virtualTask: GardenTask = {
                          id: `harvest-${item.id}-${selectedDate?.getTime()}`,
                          title: `Harvest ${getPlantDisplayName(item, true)}`,
                          description: `This is the peak harvest season for your ${item.plantName}. Check for ripeness and harvest as needed.\n\nGeneral Guide:\n${plant?.careGuide?.harvestMonth ? `Harvest Months: ${plant.careGuide.harvestMonth}` : ''}\n${plant?.careGuide?.sun ? `Sun: ${plant.careGuide.sun}` : ''}`,
                          type: 'Harvesting',
                          status: 'Pending',
                          dueDate: selectedDate?.toISOString() || new Date().toISOString(),
                          inventoryItemId: item.id,
                          isVirtual: true
                        };
                        
                        return (
                          <div 
                            key={item.id} 
                            onClick={() => setSelectedTask(virtualTask)}
                            className="p-3 bg-amber-50 rounded-2xl border border-amber-100 flex items-center gap-3 cursor-pointer hover:bg-amber-100 transition-all hover:shadow-sm"
                          >
                            <div className="w-8 h-8 bg-amber-100 text-amber-600 rounded-lg flex items-center justify-center">
                              <Wheat size={18} />
                            </div>
                            <div className="flex flex-col">
                              <span className="text-sm font-bold text-amber-900">{getPlantDisplayName(item, true)}</span>
                              <span className="text-[10px] text-amber-600 uppercase tracking-wider">Ready to Harvest</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {selectedDayPlanting.length > 0 && (
                    <div className="flex flex-col gap-3">
                      <h4 className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Planting Season</h4>
                      {selectedDayPlanting.map(item => {
                        const plant = plants.find(p => p.id === item.plantId || p.name === item.plantName);
                        const virtualTask: GardenTask = {
                          id: `planting-${item.id}-${selectedDate?.getTime()}`,
                          title: `Planting Season: ${getPlantDisplayName(item, false)}`,
                          description: `It's the ideal time to plant more ${item.plantName} in your garden.\n\nCare Guide:\n- Sun: ${plant?.careGuide?.sun || 'N/A'}\n- Water: ${plant?.careGuide?.water || 'N/A'}\n- Soil: ${plant?.careGuide?.soil || 'N/A'}\n- Planting Months: ${plant?.careGuide?.plantingMonth || 'N/A'}`,
                          type: 'Feeding', // Using Feeding as a proxy for planting tasks if needed, or just a generic type
                          status: 'Pending',
                          dueDate: selectedDate?.toISOString() || new Date().toISOString(),
                          inventoryItemId: item.id,
                          isVirtual: true
                        };

                        return (
                          <div 
                            key={item.id} 
                            onClick={() => setSelectedTask(virtualTask)}
                            className="p-3 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-center gap-3 cursor-pointer hover:bg-emerald-100 transition-all hover:shadow-sm"
                          >
                            <div className="w-8 h-8 bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center">
                              <Sprout size={18} />
                            </div>
                            <div className="flex flex-col">
                              <span className="text-sm font-bold text-emerald-900">{getPlantDisplayName(item, false)}</span>
                              <span className="text-[10px] text-emerald-600 uppercase tracking-wider">Best time to plant</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {selectedTask && (
        <TaskDetailsModal
          task={selectedTask}
          item={inventory.find(i => i.id === selectedTask.inventoryItemId)}
          onClose={() => setSelectedTask(null)}
          onToggle={onToggleTask}
        />
      )}
    </div>
  );
};
