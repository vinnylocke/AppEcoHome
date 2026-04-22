import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom"; // 🚀 IMPORT THE PORTAL
import { X, Calendar, Repeat, Loader2, Check } from "lucide-react";
import { supabase } from "../lib/supabase";
import { Logger } from "../lib/errorHandler";
import toast from "react-hot-toast";

// 🧠 IMPORT THE AI CONTEXT
import { usePlantDoctor } from "../context/PlantDoctorContext";

interface Props {
  homeId: string;
  selectedDate: Date;
  onClose: () => void;
  onSuccess: () => void;
}

export const TASK_CATEGORIES = [
  "Planting",
  "Watering",
  "Harvesting",
  "Maintenance",
];

export default function AddTaskModal({
  homeId,
  selectedDate,
  onClose,
  onSuccess,
}: Props) {
  // 🧠 GRAB THE SETTER FROM CONTEXT
  const { setPageContext } = usePlantDoctor();

  const [loading, setLoading] = useState(false);
  const [locations, setLocations] = useState<any[]>([]);

  const [form, setForm] = useState({
    title: "",
    type: "Maintenance",
    description: "",
    location_id: "",
    area_id: "",
    inventory_item_id: "",
    isRecurring: false,
    frequency_days: 7,
    end_date: "",
  });

  useEffect(() => {
    const fetchHierarchy = async () => {
      const { data } = await supabase
        .from("locations")
        .select(
          `id, name, areas(id, name, inventory_items(id, identifier, plant_name))`,
        )
        .eq("home_id", homeId);
      if (data) setLocations(data);
    };
    fetchHierarchy();
  }, [homeId]);

  const availableAreas = form.location_id
    ? locations.find((l) => l.id === form.location_id)?.areas || []
    : [];
  const availablePlants = form.area_id
    ? availableAreas.find((a: any) => a.id === form.area_id)?.inventory_items ||
      []
    : [];

  // 🧠 LIVE AI SYNC: Update the AI context whenever the form or selections change
  useEffect(() => {
    const locName =
      locations.find((l) => l.id === form.location_id)?.name || "Unspecified";
    const areaName =
      availableAreas.find((a: any) => a.id === form.area_id)?.name ||
      "Unspecified";
    const plantName =
      availablePlants.find((p: any) => p.id === form.inventory_item_id)
        ?.plant_name || "Unspecified";

    setPageContext({
      action: "Creating a new Schedule/Task",
      selectedDate: selectedDate.toLocaleDateString(),
      taskDetails: {
        title: form.title || "Untitled Task",
        type: form.type,
        description: form.description,
        isRecurring: form.isRecurring,
        repeatFrequency: form.isRecurring
          ? `Every ${form.frequency_days} days`
          : "One-time",
        targetLocation: locName,
        targetArea: areaName,
        targetPlant: plantName,
      },
    });

    // Cleanup when the modal is closed
    return () => setPageContext(null);
  }, [
    form,
    locations,
    availableAreas,
    availablePlants,
    selectedDate,
    setPageContext,
  ]);

  const handleSubmit = async () => {
    if (!form.title.trim()) return toast.error("Title is required.");
    setLoading(true);

    // 🚀 THE FIX: Force it to use local time instead of UTC
    const year = selectedDate.getFullYear();
    const month = String(selectedDate.getMonth() + 1).padStart(2, "0");
    const day = String(selectedDate.getDate()).padStart(2, "0");
    const localDateString = `${year}-${month}-${day}`;

    try {
      if (form.isRecurring) {
        // 1. Create Blueprint
        const { data: blueprint, error: bpError } = await supabase
          .from("task_blueprints")
          .insert([
            {
              home_id: homeId,
              title: form.title.trim(),
              description: form.description,
              task_type: form.type,
              location_id: form.location_id || null,
              area_id: form.area_id || null,
              inventory_item_id: form.inventory_item_id || null,
              frequency_days: form.frequency_days,
              is_recurring: true,
              end_date: form.end_date || null,
            },
          ])
          .select()
          .single();

        if (bpError) throw bpError;

        // 2. Insert the very first task manually to ensure instant UI feedback for the selected date
        await supabase.from("tasks").insert([
          {
            home_id: homeId,
            blueprint_id: blueprint.id,
            title: form.title,
            description: form.description,
            type: form.type,
            due_date: localDateString, // 👈 Using local date
            location_id: form.location_id || null,
            area_id: form.area_id || null,
            inventory_item_id: form.inventory_item_id || null,
          },
        ]);

        // 3. Trigger the Edge Function to map out the rest of the 14 days in the background
        supabase.functions.invoke("generate-tasks", {
          body: { blueprint_id: blueprint.id, start_date: localDateString }, // 👈 Using local date
        });
      } else {
        // Single Task Insert
        const { error } = await supabase.from("tasks").insert([
          {
            home_id: homeId,
            title: form.title.trim(),
            description: form.description,
            type: form.type,
            status: "Pending",
            due_date: localDateString, // 👈 Using local date
            location_id: form.location_id || null,
            area_id: form.area_id || null,
            inventory_item_id: form.inventory_item_id || null,
          },
        ]);
        if (error) throw error;
      }

      toast.success("Task scheduled successfully!");
      onSuccess();
    } catch (error: any) {
      Logger.error("Failed to create task", error);
      toast.error("Failed to schedule task.");
    } finally {
      setLoading(false);
    }
  };

  // 🚀 SAFETY CHECK: Ensure document exists (for Next.js/SSR environments)
  if (typeof document === "undefined") return null;

  // 🚀 PORTAL WRAPPER: Teleports the modal straight to the body
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-rhozly-bg/95 backdrop-blur-xl animate-in fade-in duration-300">
      <div className="bg-rhozly-surface-lowest w-full max-w-2xl max-h-[90vh] overflow-y-auto custom-scrollbar rounded-[3rem] p-8 shadow-2xl border border-rhozly-outline/20">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h3 className="text-3xl font-black text-rhozly-on-surface">
              New Task
            </h3>
            <p className="text-sm font-bold text-rhozly-primary mt-1 flex items-center gap-2">
              <Calendar size={14} /> {selectedDate.toLocaleDateString()}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-3 bg-rhozly-surface-low rounded-2xl hover:scale-110 transition-transform"
          >
            <X size={24} />
          </button>
        </div>

        <div className="space-y-6">
          <input
            type="text"
            placeholder="Task Name *"
            autoFocus
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="w-full p-4 text-xl bg-rhozly-surface-low rounded-2xl font-black border border-transparent focus:border-rhozly-primary outline-none"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="p-4 bg-rhozly-surface-low rounded-2xl font-bold outline-none border border-transparent focus:border-rhozly-primary cursor-pointer"
            >
              {TASK_CATEGORIES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select
              value={form.location_id}
              onChange={(e) =>
                setForm({
                  ...form,
                  location_id: e.target.value,
                  area_id: "",
                  inventory_item_id: "",
                })
              }
              className="p-4 bg-rhozly-surface-low rounded-2xl font-bold outline-none border border-transparent focus:border-rhozly-primary cursor-pointer"
            >
              <option value="">Any Location</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <select
              value={form.area_id}
              onChange={(e) =>
                setForm({
                  ...form,
                  area_id: e.target.value,
                  inventory_item_id: "",
                })
              }
              disabled={!form.location_id}
              className="p-4 bg-rhozly-surface-low rounded-2xl font-bold outline-none border border-transparent focus:border-rhozly-primary disabled:opacity-50 cursor-pointer"
            >
              <option value="">Any Area</option>
              {availableAreas.map((a: any) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <select
              value={form.inventory_item_id}
              onChange={(e) =>
                setForm({ ...form, inventory_item_id: e.target.value })
              }
              disabled={!form.area_id}
              className="p-4 bg-rhozly-surface-low rounded-2xl font-bold outline-none border border-transparent focus:border-rhozly-primary disabled:opacity-50 cursor-pointer"
            >
              <option value="">Any Plant</option>
              {availablePlants.map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.identifier}
                </option>
              ))}
            </select>
          </div>

          <textarea
            placeholder="Additional notes or descriptions..."
            rows={3}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="w-full p-4 bg-rhozly-surface-low rounded-2xl font-bold border border-transparent focus:border-rhozly-primary outline-none resize-none"
          />

          <div className="bg-rhozly-primary/5 border border-rhozly-primary/20 rounded-3xl p-6">
            <label className="flex items-center gap-3 cursor-pointer w-fit">
              <input
                type="checkbox"
                checked={form.isRecurring}
                onChange={(e) =>
                  setForm({ ...form, isRecurring: e.target.checked })
                }
                className="w-5 h-5 accent-rhozly-primary"
              />
              <span className="font-black text-rhozly-primary flex items-center gap-2">
                <Repeat size={18} /> Repeat this task
              </span>
            </label>

            {form.isRecurring && (
              <div className="mt-6 grid grid-cols-2 gap-4 animate-in fade-in">
                <div>
                  <label className="text-[10px] font-black uppercase text-rhozly-primary/60 block mb-2">
                    Repeat Every (Days)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={form.frequency_days}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        frequency_days: parseInt(e.target.value),
                      })
                    }
                    className="w-full p-4 bg-white rounded-2xl font-bold outline-none border border-rhozly-outline/10"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-rhozly-primary/60 block mb-2">
                    End Date (Optional)
                  </label>
                  <input
                    type="date"
                    value={form.end_date}
                    onChange={(e) =>
                      setForm({ ...form, end_date: e.target.value })
                    }
                    className="w-full p-4 bg-white rounded-2xl font-bold outline-none border border-rhozly-outline/10 cursor-pointer"
                  />
                </div>
              </div>
            )}
          </div>

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full py-5 bg-rhozly-primary text-white rounded-2xl font-black text-lg shadow-xl hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 flex justify-center gap-2"
          >
            {loading ? (
              <Loader2 className="animate-spin" />
            ) : (
              <>
                <Check /> Schedule Task
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
