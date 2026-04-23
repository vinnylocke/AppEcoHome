import React, { useState } from "react";
import { supabase } from "../lib/supabase";
import {
  Check,
  ClipboardList,
  Loader2,
  CalendarPlus,
  Syringe,
  Clock,
  Droplets,
  Scissors,
  Shovel,
  Wheat,
  Link as LinkIcon,
} from "lucide-react";
import toast from "react-hot-toast";

interface SuggestedTask {
  title: string;
  description: string;
  task_type: "Planting" | "Watering" | "Harvesting" | "Maintenance";
  due_in_days: number;
  is_recurring: boolean;
  frequency_days: number | null;
  end_offset_days: number | null;
  depends_on_index: number | null; // 🚀 The AI uses this to link tasks together!
}

interface TaskActionProps {
  tasks: SuggestedTask[];
  homeId: string;
  onSuccess?: () => void;
}

const getTaskIcon = (type: string) => {
  switch (type) {
    case "Watering":
      return <Droplets size={16} className="text-blue-500" />;
    case "Maintenance":
      return <Scissors size={16} className="text-orange-500" />;
    case "Harvesting":
      return <Wheat size={16} className="text-yellow-500" />;
    case "Planting":
      return <Shovel size={16} className="text-amber-700" />;
    default:
      return <Clock size={16} className="text-gray-500" />;
  }
};

export const TaskActionButtons = ({
  tasks,
  homeId,
  onSuccess,
}: TaskActionProps) => {
  // Start with all tasks selected by default
  const [selectedIndices, setSelectedIndices] = useState<number[]>(
    tasks.map((_, i) => i),
  );
  const [isProcessing, setIsProcessing] = useState(false);

  const toggleSelection = (index: number) => {
    setSelectedIndices((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index],
    );
  };

  const handleSaveTasks = async () => {
    if (selectedIndices.length === 0) return;
    setIsProcessing(true);

    const toastId = toast.loading("Adding tasks to your calendar...");

    try {
      const today = new Date();
      // This map will store { original_array_index: new_database_uuid }
      // so we can link dependencies together after they are created!
      const idMap = new Map<number, string>();
      const createdPhysicalTasks: string[] = [];

      // 1. Loop through and create the tasks/blueprints sequentially
      for (let i = 0; i < tasks.length; i++) {
        if (!selectedIndices.includes(i)) continue; // Skip unchecked tasks

        const task = tasks[i];
        const targetDate = new Date(today);
        targetDate.setDate(targetDate.getDate() + task.due_in_days);
        const dateStr = targetDate.toISOString().split("T")[0];

        if (task.is_recurring) {
          // It's a Blueprint
          const endDate = new Date(targetDate);
          endDate.setDate(endDate.getDate() + (task.end_offset_days || 28));

          const { data, error } = await supabase
            .from("task_blueprints")
            .insert({
              home_id: homeId,
              title: task.title,
              description: task.description,
              task_type: task.task_type,
              frequency_days: task.frequency_days || 7,
              is_recurring: true,
              start_date: dateStr,
              end_date: endDate.toISOString().split("T")[0],
              priority: "Medium",
            })
            .select("id")
            .single();

          if (error) throw error;
          idMap.set(i, data.id);
        } else {
          // It's a One-Off Task
          const { data, error } = await supabase
            .from("tasks")
            .insert({
              home_id: homeId,
              title: task.title,
              description: task.description,
              type: task.task_type,
              due_date: dateStr,
              status: "Pending",
            })
            .select("id")
            .single();

          if (error) throw error;
          idMap.set(i, data.id);
          createdPhysicalTasks.push(data.id);
        }
      }

      // 2. Second pass: Create the dependencies!
      const dependenciesToInsert = [];
      for (let i = 0; i < tasks.length; i++) {
        if (!selectedIndices.includes(i)) continue;

        const task = tasks[i];
        // If this task depends on another task, AND we actually opted to save the parent task
        if (
          task.depends_on_index !== null &&
          idMap.has(task.depends_on_index)
        ) {
          const thisTaskId = idMap.get(i);
          const parentTaskId = idMap.get(task.depends_on_index);

          // Only link physical tasks (blueprints generate ghosts, linking them is complex)
          if (
            thisTaskId &&
            parentTaskId &&
            createdPhysicalTasks.includes(thisTaskId) &&
            createdPhysicalTasks.includes(parentTaskId)
          ) {
            dependenciesToInsert.push({
              task_id: thisTaskId,
              depends_on_task_id: parentTaskId,
            });
          }
        }
      }

      if (dependenciesToInsert.length > 0) {
        const { error: depError } = await supabase
          .from("task_dependencies")
          .insert(dependenciesToInsert);
        if (depError) console.error("Failed to link dependencies", depError);
      }

      toast.success("Tasks added to your schedule!", { id: toastId });
      setSelectedIndices([]); // Clear selection to prevent double-adding
      if (onSuccess) onSuccess();
    } catch (error: any) {
      console.error(error);
      toast.error("Failed to save some tasks.", { id: toastId });
    } finally {
      setIsProcessing(false);
    }
  };

  if (!tasks || tasks.length === 0) return null;

  return (
    <div className="mt-3 p-4 bg-white/80 backdrop-blur-md rounded-2xl border border-blue-100 shadow-sm">
      <div className="flex items-center gap-2 mb-3 text-blue-800">
        <CalendarPlus size={16} />
        <p className="text-xs font-bold uppercase tracking-widest">
          Suggested Schedule
        </p>
      </div>

      <div className="space-y-2 mb-4">
        {tasks.map((task, idx) => {
          const isSelected = selectedIndices.includes(idx);
          const hasDependency = task.depends_on_index !== null;

          return (
            <div
              key={idx}
              onClick={() => toggleSelection(idx)}
              className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition-colors ${
                isSelected
                  ? "border-blue-400 bg-blue-50/50"
                  : "border-gray-200 bg-white opacity-60 hover:opacity-100"
              }`}
            >
              <div
                className={`w-5 h-5 mt-0.5 rounded flex items-center justify-center border transition-colors shrink-0 ${
                  isSelected
                    ? "bg-blue-500 border-blue-500 text-white"
                    : "border-gray-300 bg-white"
                }`}
              >
                {isSelected && <Check size={14} strokeWidth={4} />}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="bg-white px-1.5 py-0.5 rounded shadow-sm border border-gray-100 inline-flex items-center">
                    {getTaskIcon(task.task_type)}
                  </span>
                  <span className="font-bold text-sm text-gray-900 leading-tight truncate">
                    {task.title}
                  </span>
                </div>

                <p className="text-xs text-gray-600 font-medium leading-snug">
                  {task.description}
                </p>

                <div className="flex flex-wrap gap-2 mt-2">
                  <span className="inline-block text-[9px] font-black uppercase tracking-widest text-blue-600 bg-blue-100/50 px-2 py-0.5 rounded-md">
                    {task.due_in_days === 0
                      ? "Do Today"
                      : `In ${task.due_in_days} Days`}
                  </span>

                  {task.is_recurring && (
                    <span className="inline-block text-[9px] font-black uppercase tracking-widest text-purple-600 bg-purple-100/50 px-2 py-0.5 rounded-md flex items-center gap-1">
                      <Repeat size={10} /> Every {task.frequency_days} Days
                    </span>
                  )}

                  {hasDependency && (
                    <span className="inline-block text-[9px] font-black uppercase tracking-widest text-orange-600 bg-orange-100/50 px-2 py-0.5 rounded-md flex items-center gap-1">
                      <LinkIcon size={10} /> Blocked by Task{" "}
                      {task.depends_on_index! + 1}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {selectedIndices.length > 0 && (
        <div className="pt-2 border-t border-blue-100">
          <button
            onClick={handleSaveTasks}
            disabled={isProcessing}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-xs flex items-center justify-center gap-2 transition-transform active:scale-95 disabled:opacity-50"
          >
            {isProcessing ? (
              <Loader2 className="animate-spin" size={16} />
            ) : (
              <CalendarPlus size={16} />
            )}
            Add {selectedIndices.length} Task(s) to Calendar
          </button>
        </div>
      )}
    </div>
  );
};
