import React, { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import {
  Loader2,
  Calendar,
  Droplets,
  Scissors,
  Activity,
  Edit3,
  Save,
  X,
  Plus,
  Leaf,
  Trash2,
  CheckCircle2,
  Sprout,
} from "lucide-react";
import toast from "react-hot-toast";
import { ConfirmModal } from "./ConfirmModal";

// 🧠 IMPORT THE AI CONTEXT
import { usePlantDoctor } from "../context/PlantDoctorContext";
import { BlueprintService } from "../services/blueprintService";

interface InstanceCareRoutineProps {
  inventoryItemId: string;
  homeId: string;
  locationId: string;
  areaId: string;
  onRoutineUpdated?: () => void;
}

const TASK_TYPES = ["Watering", "Maintenance", "Harvesting", "Planting"];

export default function InstanceCareRoutine({
  inventoryItemId,
  homeId,
  locationId,
  areaId,
  onRoutineUpdated,
}: InstanceCareRoutineProps) {
  // 🧠 GRAB THE SETTER FROM CONTEXT
  const { setPageContext } = usePlantDoctor();

  const [blueprints, setBlueprints] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Edit State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState({
    frequency_days: "" as number | "",
    start_date: "",
    end_date: "",
  });

  // Delete State
  const [routineToDelete, setRoutineToDelete] = useState<any | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Add New Routine State
  const [isAdding, setIsAdding] = useState(false);
  const [isSavingNew, setIsSavingNew] = useState(false);
  const todayStr = new Date().toISOString().split("T")[0];
  const [newRoutine, setNewRoutine] = useState({
    title: "",
    description: "",
    task_type: "Watering",
    is_recurring: true,
    frequency_days: 7 as number | "",
    start_date: todayStr,
    end_date: "",
  });

  // Success animation state
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);
  const [successRoutineId, setSuccessRoutineId] = useState<string | null>(null);

  // Focus management for delete modal
  const deleteButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    fetchBlueprints();
  }, [inventoryItemId]);

  const fetchBlueprints = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("task_blueprints")
        .select("*")
        .contains("inventory_item_ids", [inventoryItemId])
        .order("created_at", { ascending: true });

      if (error) throw error;
      setBlueprints(data || []);
    } catch (error) {
      toast.error("Failed to load care routine.");
    } finally {
      setIsLoading(false);
    }
  };

  // 🧠 LIVE AI SYNC: Update context based on current blueprints and form activity
  useEffect(() => {
    setPageContext({
      action: isAdding
        ? "Creating a Care Routine"
        : editingId
          ? "Editing a Care Routine"
          : "Viewing Care Routines",
      activeRoutines: blueprints.map((bp) => ({
        title: bp.title,
        type: bp.task_type,
        frequency: bp.is_recurring
          ? `Every ${bp.frequency_days} days`
          : "One-time",
        startDate: bp.start_date,
        endDate: bp.end_date || "Ongoing",
      })),
      formState: isAdding
        ? {
            mode: "Creating New",
            type: newRoutine.task_type,
            frequency: newRoutine.frequency_days,
            title: newRoutine.title,
          }
        : editingId
          ? {
              mode: "Editing Existing",
              frequency: editData.frequency_days,
              startDate: editData.start_date,
            }
          : null,
    });

    // Cleanup isn't strictly necessary for sub-components, but good practice
    // return () => setPageContext(null);
  }, [blueprints, isAdding, newRoutine, editingId, editData, setPageContext]);

  const getTaskIcon = (type: string) => {
    switch (type) {
      case "Watering":
        return <Droplets size={16} className="text-rhozly-primary" />;
      case "Maintenance":
        return <Scissors size={16} className="text-rhozly-secondary" />;
      case "Harvesting":
        return <Leaf size={16} className="text-rhozly-tertiary" />;
      default:
        return <Activity size={16} className="text-rhozly-primary" />;
    }
  };

  // --- EDIT EXISTING ROUTINE ---
  const handleEditClick = (blueprint: any) => {
    setEditingId(blueprint.id);
    setEditData({
      frequency_days: blueprint.frequency_days || "",
      start_date: blueprint.start_date || "",
      end_date: blueprint.end_date || "",
    });
  };

  const handleSaveEdit = async (blueprintId: string) => {
    // Optimistic update: store previous state for rollback
    const previousBlueprints = [...blueprints];
    const freq =
      typeof editData.frequency_days === "number"
        ? editData.frequency_days
        : null;

    // Optimistically update UI
    const optimisticUpdate = blueprints.map((bp) =>
      bp.id === blueprintId
        ? {
            ...bp,
            frequency_days: freq,
            start_date: editData.start_date || null,
            end_date: editData.end_date || null,
          }
        : bp
    );
    setBlueprints(optimisticUpdate);
    setEditingId(null);

    try {
      const { error } = await supabase
        .from("task_blueprints")
        .update({
          frequency_days: freq,
          start_date: editData.start_date || null,
          end_date: editData.end_date || null,
        })
        .eq("id", blueprintId);

      if (error) throw error;

      toast.success("Routine updated!");

      // Show success animation
      setSuccessRoutineId(blueprintId);
      setShowSuccessAnimation(true);
      setTimeout(() => {
        setShowSuccessAnimation(false);
        setSuccessRoutineId(null);
      }, 2000);

      await BlueprintService.generateHomeTasks(homeId);

      setTimeout(() => {
        if (onRoutineUpdated) onRoutineUpdated();
      }, 600);
    } catch (error) {
      // Rollback on error
      setBlueprints(previousBlueprints);
      toast.error("Failed to update routine.");
    }
  };

  // --- DELETE ROUTINE ---
  const handleConfirmDelete = async () => {
    if (!routineToDelete) return;
    setIsDeleting(true);
    try {
      const { error: taskError } = await supabase
        .from("tasks")
        .delete()
        .eq("blueprint_id", routineToDelete.id)
        .eq("status", "Pending");

      if (taskError) throw taskError;

      const { error: bpError } = await supabase
        .from("task_blueprints")
        .delete()
        .eq("id", routineToDelete.id);

      if (bpError) throw bpError;

      toast.success("Routine and pending tasks removed.");
      setBlueprints(blueprints.filter((bp) => bp.id !== routineToDelete.id));

      if (onRoutineUpdated) onRoutineUpdated();
    } catch (error: any) {
      toast.error("Failed to delete routine.");
    } finally {
      setIsDeleting(false);
      setRoutineToDelete(null);
      // Return focus to delete button after modal closes
      setTimeout(() => {
        deleteButtonRef.current?.focus();
      }, 100);
    }
  };

  // --- CREATE NEW ROUTINE ---
  const handleCreateRoutine = async () => {
    if (!newRoutine.title.trim())
      return toast.error("Please enter a task title.");
    if (
      newRoutine.is_recurring &&
      (!newRoutine.frequency_days || newRoutine.frequency_days <= 0)
    ) {
      return toast.error("Please enter a valid frequency.");
    }

    setIsSavingNew(true);

    // Store previous state for rollback
    const previousBlueprints = [...blueprints];

    // Create optimistic entry
    const optimisticId = `temp-${Date.now()}`;
    const optimisticRoutine = {
      id: optimisticId,
      home_id: homeId,
      inventory_item_ids: [inventoryItemId],
      location_id: locationId,
      area_id: areaId,
      title: newRoutine.title,
      description: newRoutine.description,
      task_type: newRoutine.task_type,
      is_recurring: newRoutine.is_recurring,
      frequency_days: newRoutine.is_recurring
        ? newRoutine.frequency_days
        : null,
      start_date: newRoutine.start_date || todayStr,
      end_date:
        newRoutine.is_recurring && newRoutine.end_date
          ? newRoutine.end_date
          : null,
      priority: "Medium",
      created_at: new Date().toISOString(),
    };

    // Optimistically update UI
    setBlueprints([...blueprints, optimisticRoutine]);
    setNewRoutine({
      title: "",
      description: "",
      task_type: "Watering",
      is_recurring: true,
      frequency_days: 7,
      start_date: todayStr,
      end_date: "",
    });
    setIsAdding(false);

    try {
      const payload = {
        home_id: homeId,
        inventory_item_ids: [inventoryItemId],
        location_id: locationId,
        area_id: areaId,
        title: optimisticRoutine.title,
        description: optimisticRoutine.description,
        task_type: optimisticRoutine.task_type,
        is_recurring: optimisticRoutine.is_recurring,
        frequency_days: optimisticRoutine.frequency_days,
        start_date: optimisticRoutine.start_date,
        end_date: optimisticRoutine.end_date,
        priority: "Medium",
      };

      const { data, error } = await supabase
        .from("task_blueprints")
        .insert([payload])
        .select();
      if (error) throw error;

      toast.success("New routine created!");

      // Replace optimistic entry with real data
      if (data && data[0]) {
        setBlueprints((current) =>
          current.map((bp) => (bp.id === optimisticId ? data[0] : bp))
        );
        // Show success animation
        setSuccessRoutineId(data[0].id);
        setShowSuccessAnimation(true);
        setTimeout(() => {
          setShowSuccessAnimation(false);
          setSuccessRoutineId(null);
        }, 2000);
      }

      await BlueprintService.generateHomeTasks(homeId);

      setTimeout(() => {
        if (onRoutineUpdated) onRoutineUpdated();
      }, 600);
    } catch (error) {
      // Rollback on error
      setBlueprints(previousBlueprints);
      setIsAdding(true);
      setNewRoutine({
        title: optimisticRoutine.title,
        description: optimisticRoutine.description,
        task_type: optimisticRoutine.task_type,
        is_recurring: optimisticRoutine.is_recurring,
        frequency_days: optimisticRoutine.frequency_days || 7,
        start_date: optimisticRoutine.start_date,
        end_date: optimisticRoutine.end_date || "",
      });
      toast.error("Failed to create routine.");
    } finally {
      setIsSavingNew(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8 opacity-50">
        <Loader2 className="animate-spin text-rhozly-primary" size={24} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pb-2 border-b border-rhozly-outline/10">
        <h4 className="font-black text-rhozly-on-surface/60 uppercase tracking-widest text-xs">
          Active Routines
        </h4>
        {!isAdding && (
          <button
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-rhozly-primary bg-rhozly-primary/10 px-3 py-1.5 rounded-lg hover:bg-rhozly-primary/20 transition-colors"
          >
            <Plus size={14} /> Add Routine
          </button>
        )}
      </div>

      {isAdding && (
        <div className="p-5 bg-rhozly-surface-low border border-rhozly-outline/20 rounded-2xl animate-in slide-in-from-top-2 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h5 className="font-black text-sm text-rhozly-on-surface">
              Create Custom Routine
            </h5>
            <button
              onClick={() => setIsAdding(false)}
              className="text-rhozly-on-surface/40 hover:text-rhozly-on-surface"
            >
              <X size={16} />
            </button>
          </div>

          <div className="space-y-3">
            <input
              type="text"
              placeholder="Task Title (e.g., Deep Watering)"
              value={newRoutine.title}
              onChange={(e) =>
                setNewRoutine({ ...newRoutine, title: e.target.value })
              }
              className="w-full p-3 bg-white rounded-xl font-bold text-sm outline-none border border-transparent focus:border-rhozly-primary"
            />

            <textarea
              placeholder="Description / Instructions (Optional)"
              value={newRoutine.description}
              onChange={(e) =>
                setNewRoutine({ ...newRoutine, description: e.target.value })
              }
              rows={2}
              className="w-full p-3 bg-white rounded-xl font-bold text-sm outline-none border border-transparent focus:border-rhozly-primary resize-none"
            />

            <div className="grid grid-cols-2 gap-3">
              <select
                value={newRoutine.task_type}
                onChange={(e) =>
                  setNewRoutine({ ...newRoutine, task_type: e.target.value })
                }
                className="w-full p-3 bg-white rounded-xl font-bold text-sm outline-none border border-transparent focus:border-rhozly-primary"
              >
                {TASK_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>

              <div className="flex items-center justify-between bg-white px-3 rounded-xl border border-transparent focus-within:border-rhozly-primary">
                <span className="text-[10px] font-black uppercase text-rhozly-on-surface/40">
                  Recurring?
                </span>
                <input
                  type="checkbox"
                  checked={newRoutine.is_recurring}
                  onChange={(e) =>
                    setNewRoutine({
                      ...newRoutine,
                      is_recurring: e.target.checked,
                    })
                  }
                  className="accent-rhozly-primary w-4 h-4 cursor-pointer"
                />
              </div>
            </div>

            {newRoutine.is_recurring && (
              <div className="flex items-center bg-white p-3 rounded-xl gap-3">
                <span className="text-[10px] font-black uppercase text-rhozly-on-surface/40 whitespace-nowrap">
                  Every
                </span>
                <input
                  type="number"
                  placeholder="7"
                  value={newRoutine.frequency_days}
                  onChange={(e) =>
                    setNewRoutine({
                      ...newRoutine,
                      frequency_days: parseInt(e.target.value),
                    })
                  }
                  className="w-full bg-rhozly-surface-low rounded-lg p-2 font-bold text-center text-sm outline-none"
                />
                <span className="text-[10px] font-black uppercase text-rhozly-on-surface/40 whitespace-nowrap">
                  Days
                </span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-black uppercase text-rhozly-on-surface/40 ml-1">
                  Start Date
                </label>
                <input
                  type="date"
                  value={newRoutine.start_date}
                  onChange={(e) =>
                    setNewRoutine({ ...newRoutine, start_date: e.target.value })
                  }
                  className="w-full p-3 bg-white rounded-xl font-bold text-sm outline-none border border-transparent focus:border-rhozly-primary"
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-rhozly-on-surface/40 ml-1">
                  End Date (Optional)
                </label>
                <input
                  type="date"
                  disabled={!newRoutine.is_recurring}
                  value={newRoutine.end_date}
                  onChange={(e) =>
                    setNewRoutine({ ...newRoutine, end_date: e.target.value })
                  }
                  className="w-full p-3 bg-white rounded-xl font-bold text-sm outline-none border border-transparent focus:border-rhozly-primary disabled:opacity-50"
                />
              </div>
            </div>

            <button
              onClick={handleCreateRoutine}
              disabled={isSavingNew}
              className="w-full py-3 mt-2 bg-rhozly-primary text-white rounded-xl font-black text-sm shadow-md hover:bg-rhozly-primary-container transition-colors flex items-center justify-center gap-2"
            >
              {isSavingNew ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                "Save Routine"
              )}
            </button>
          </div>
        </div>
      )}

      {blueprints.length === 0 && !isAdding ? (
        <div className="text-center p-12 bg-gradient-to-br from-rhozly-surface-low to-rhozly-primary/5 rounded-2xl border border-rhozly-outline/10">
          <div className="relative inline-block mb-4">
            <div className="absolute inset-0 bg-rhozly-primary/10 rounded-full blur-xl"></div>
            <div className="relative bg-white p-4 rounded-full shadow-sm">
              <Sprout
                size={40}
                className="text-rhozly-primary"
                strokeWidth={2}
              />
            </div>
          </div>
          <h3 className="font-black text-base text-rhozly-on-surface mb-2">
            No Care Routines Yet
          </h3>
          <p className="font-bold text-xs text-rhozly-on-surface/60 max-w-xs mx-auto mb-4">
            Create your first routine to keep this plant thriving with automated care reminders
          </p>
          <button
            onClick={() => setIsAdding(true)}
            className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-white bg-rhozly-primary px-5 py-2.5 rounded-xl hover:bg-rhozly-primary-container transition-all shadow-md hover:shadow-lg"
          >
            <Plus size={16} /> Create Routine
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {blueprints.map((bp) => (
            <div
              key={bp.id}
              className="p-4 bg-white rounded-2xl border border-rhozly-outline/10 shadow-sm flex flex-col group hover:border-rhozly-primary/30 transition-colors"
            >
              <div className="flex items-start justify-between w-full">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-rhozly-surface-low rounded-xl">
                    {getTaskIcon(bp.task_type)}
                  </div>
                  <div>
                    <h4 className="font-black text-sm text-rhozly-on-surface">
                      {bp.title}
                    </h4>
                    <p className="text-[10px] font-bold text-rhozly-on-surface/50 uppercase tracking-widest">
                      {bp.is_recurring ? "Recurring Task" : "One-off Task"}
                    </p>
                    {bp.description && (
                      <p className="text-xs text-rhozly-on-surface/60 mt-1 line-clamp-1">
                        {bp.description}
                      </p>
                    )}
                    {(bp.start_date || bp.end_date) && editingId !== bp.id && (
                      <p className="text-[9px] font-bold text-rhozly-primary mt-1">
                        {bp.start_date
                          ? new Date(bp.start_date).toLocaleDateString()
                          : "Now"}
                        {bp.end_date
                          ? ` - ${new Date(bp.end_date).toLocaleDateString()}`
                          : " - Ongoing"}
                      </p>
                    )}
                  </div>
                </div>

                {editingId !== bp.id && (
                  <div className="flex items-center gap-1">
                    {showSuccessAnimation && successRoutineId === bp.id && (
                      <div className="animate-in fade-in zoom-in duration-300 mr-2">
                        <CheckCircle2
                          size={20}
                          className="text-green-500 animate-pulse"
                        />
                      </div>
                    )}
                    {bp.frequency_days && (
                      <div className="text-right mr-2">
                        <p className="text-[9px] font-black uppercase tracking-widest text-rhozly-on-surface/40">
                          Frequency
                        </p>
                        <p className="font-bold text-sm text-rhozly-primary">
                          {bp.frequency_days} Days
                        </p>
                      </div>
                    )}
                    <button
                      onClick={() => handleEditClick(bp)}
                      aria-label={`Edit routine: ${bp.title}`}
                      className="min-w-[44px] min-h-[44px] flex items-center justify-center text-rhozly-on-surface/30 hover:text-rhozly-primary hover:bg-rhozly-primary/10 rounded-xl transition-all"
                    >
                      <Edit3 size={18} />
                    </button>
                    <button
                      ref={routineToDelete?.id === bp.id ? deleteButtonRef : null}
                      onClick={() => setRoutineToDelete(bp)}
                      aria-label={`Delete routine: ${bp.title}`}
                      className="min-w-[44px] min-h-[44px] flex items-center justify-center text-rhozly-on-surface/30 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                )}
              </div>

              {editingId === bp.id && (
                <div className="mt-4 pt-4 border-t border-rhozly-outline/10 animate-in slide-in-from-top-2">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                    <div>
                      <label className="text-[10px] font-black uppercase text-rhozly-on-surface/40 ml-1">
                        Frequency (Days)
                      </label>
                      <input
                        type="number"
                        value={editData.frequency_days}
                        onChange={(e) =>
                          setEditData({
                            ...editData,
                            frequency_days: parseInt(e.target.value),
                          })
                        }
                        className="w-full p-2.5 bg-rhozly-surface-low rounded-xl font-bold text-sm outline-none border border-transparent focus:border-rhozly-primary"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase text-rhozly-on-surface/40 ml-1">
                        Start Date
                      </label>
                      <input
                        type="date"
                        value={editData.start_date}
                        onChange={(e) =>
                          setEditData({
                            ...editData,
                            start_date: e.target.value,
                          })
                        }
                        className="w-full p-2.5 bg-rhozly-surface-low rounded-xl font-bold text-sm outline-none border border-transparent focus:border-rhozly-primary"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase text-rhozly-on-surface/40 ml-1">
                        End Date
                      </label>
                      <input
                        type="date"
                        value={editData.end_date}
                        onChange={(e) =>
                          setEditData({ ...editData, end_date: e.target.value })
                        }
                        className="w-full p-2.5 bg-rhozly-surface-low rounded-xl font-bold text-sm outline-none border border-transparent focus:border-rhozly-primary"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setEditingId(null)}
                      className="px-4 py-2 bg-rhozly-surface-low text-rhozly-on-surface/60 rounded-xl hover:bg-rhozly-surface transition-colors font-bold text-sm"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleSaveEdit(bp.id)}
                      className="px-4 py-2 bg-rhozly-primary text-white rounded-xl hover:bg-rhozly-primary-container transition-colors font-bold text-sm shadow-sm flex items-center gap-2"
                    >
                      <Save size={16} /> Save Changes
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmModal
        isOpen={routineToDelete !== null}
        isLoading={isDeleting}
        onClose={() => {
          setRoutineToDelete(null);
          // Return focus to delete button when modal is dismissed without confirming
          setTimeout(() => {
            deleteButtonRef.current?.focus();
          }, 100);
        }}
        onConfirm={handleConfirmDelete}
        title="Delete Routine"
        description={`Are you sure you want to delete "${routineToDelete?.title}"? All pending tasks for this routine will also be removed from your calendar. (Past completed tasks will be kept for your records).`}
        confirmText="Delete Routine"
        isDestructive={true}
      />
    </div>
  );
}
