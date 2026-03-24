import React from 'react';
import { X, Calendar, Clock, Droplets, Scissors, Shovel, Wheat, CheckCircle2, AlertCircle } from 'lucide-react';
import { GardenTask, InventoryItem } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { getPlantDisplayName } from '../utils/plantUtils';

interface TaskDetailsModalProps {
  task: GardenTask;
  item?: InventoryItem;
  onClose: () => void;
  onToggle: (taskId: string, currentStatus: string) => Promise<void>;
}

export const TaskDetailsModal: React.FC<TaskDetailsModalProps> = ({ task, item, onClose, onToggle }) => {
  const isCompleted = task.status === 'Completed';
  
  const getTaskIcon = (type: GardenTask['type']) => {
    switch (type) {
      case 'Watering': return <Droplets size={24} />;
      case 'Pruning': return <Scissors size={24} />;
      case 'Feeding': return <Shovel size={24} />;
      case 'Harvesting': return <Wheat size={24} />;
      default: return <CheckCircle2 size={24} />;
    }
  };

  const getTaskColor = (type: GardenTask['type']) => {
    switch (type) {
      case 'Watering': return 'bg-blue-100 text-blue-600';
      case 'Pruning': return 'bg-purple-100 text-purple-600';
      case 'Feeding': return 'bg-orange-100 text-orange-600';
      case 'Harvesting': return 'bg-amber-100 text-amber-600';
      default: return 'bg-emerald-100 text-emerald-600';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden border border-stone-100"
      >
        <div className="relative p-8">
          <button
            onClick={onClose}
            className="absolute top-6 right-6 p-2 hover:bg-stone-100 rounded-full transition-colors text-stone-400"
          >
            <X size={20} />
          </button>

          <div className="flex items-start gap-6 mb-8">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 ${getTaskColor(task.type)}`}>
              {getTaskIcon(task.type)}
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2 mb-1">
                <div className="px-2 py-1 bg-stone-100 text-stone-500 rounded-lg text-[10px] font-bold uppercase tracking-wider">
                  {task.type}
                </div>
                {task.isVirtual && (
                  <div className="px-2 py-1 bg-amber-100 text-amber-600 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                    <AlertCircle size={10} /> Seasonal Reminder
                  </div>
                )}
              </div>
              <h2 className="text-2xl font-bold text-stone-900 leading-tight">
                {item ? `${task.type} ${getPlantDisplayName(item)}` : task.title}
              </h2>
              {item && (
                <p className="text-sm text-stone-500 font-medium">
                  {item.plantName} {item.identifier ? `(${item.identifier})` : ''} {item.plantCode ? `[${item.plantCode}]` : ''}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="p-4 bg-stone-50 rounded-2xl flex flex-col gap-1">
              <span className="text-[10px] text-stone-400 font-bold uppercase tracking-wider flex items-center gap-1">
                <Calendar size={10} /> Due Date
              </span>
              <span className="text-sm font-semibold text-stone-700">
                {new Date(task.dueDate).toLocaleDateString()}
              </span>
            </div>
            <div className="p-4 bg-stone-50 rounded-2xl flex flex-col gap-1">
              <span className="text-[10px] text-stone-400 font-bold uppercase tracking-wider flex items-center gap-1">
                <Clock size={10} /> Time
              </span>
              <span className="text-sm font-semibold text-stone-700">
                {new Date(task.dueDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>

          <div className="mb-8">
            <h3 className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-3">Instructions</h3>
            <div className="p-6 bg-stone-50 rounded-3xl border border-stone-100 text-stone-600 leading-relaxed text-sm whitespace-pre-wrap">
              {task.description || "No specific instructions provided for this task."}
            </div>
          </div>

          <div className="flex gap-3">
            {task.isVirtual ? (
              <button
                onClick={onClose}
                className="flex-1 py-4 bg-stone-900 text-white rounded-2xl font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-stone-200 hover:bg-stone-800"
              >
                <CheckCircle2 size={20} />
                Got it
              </button>
            ) : (
              <button
                onClick={() => {
                  onToggle(task.id, task.status);
                  onClose();
                }}
                className={`flex-1 py-4 rounded-2xl font-bold transition-all flex items-center justify-center gap-2 shadow-lg ${
                  isCompleted 
                    ? "bg-stone-100 text-stone-600 hover:bg-stone-200 shadow-stone-100" 
                    : "bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-200"
                }`}
              >
                <CheckCircle2 size={20} />
                {isCompleted ? "Mark as Pending" : "Complete Task"}
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};
