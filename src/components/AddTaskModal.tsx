import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Calendar,
  Repeat,
  Loader2,
  Check,
  Link as LinkIcon,
  Search,
  Sparkles,
  Droplets,
  Scissors,
  Wheat,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { Logger } from "../lib/errorHandler";
import toast from "react-hot-toast";
import { usePlantDoctor } from "../context/PlantDoctorContext";
import { scorePlantByPreferences } from "../hooks/useUserPreferences";
import { getLocalDateString, formatDisplayDate } from "../lib/dateUtils";
import { BlueprintService } from "../services/blueprintService";
import { TASK_CATEGORIES } from "../constants/taskCategories";
export { TASK_CATEGORIES } from "../constants/taskCategories";

interface Props {
  homeId: string;
  selectedDate?: Date;
  isBlueprintMode?: boolean;
  existingBlueprint?: any;
  onClose: () => void;
  onSuccess: () => void;
}


export default function AddTaskModal({
  homeId,
  selectedDate,
  isBlueprintMode = false,
  existingBlueprint,
  onClose,
  onSuccess,
}: Props) {
  const { setPageContext, preferences } = usePlantDoctor();

  const [loading, setLoading] = useState(false);
  const [locations, setLocations] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [liveRegionMessage, setLiveRegionMessage] = useState("");

  const [form, setForm] = useState({
    title: existingBlueprint?.title || "",
    type: existingBlueprint?.task_type || "Maintenance",
    description: existingBlueprint?.description || "",
    location_id: existingBlueprint?.location_id || "",
    area_id: existingBlueprint?.area_id || "",
    selected_species: "",
    inventory_item_ids: existingBlueprint?.inventory_item_ids || [],
    plan_id: existingBlueprint?.plan_id || "",
    start_date:
      existingBlueprint?.start_date ||
      (selectedDate ? getLocalDateString(selectedDate) : ""),
    isRecurring: existingBlueprint ? true : isBlueprintMode ? true : false,
    frequency_days: existingBlueprint?.frequency_days || 7,
    end_date: existingBlueprint?.end_date || "",
  });

  const [smartPresets, setSmartPresets] = useState<{ type: string; frequency_days: number }[]>([]);

  // Dependency Link Builder State
  const [isLinking, setIsLinking] = useState(false);
  const [linkType, setLinkType] = useState<"waiting_on" | "blocking">(
    "waiting_on",
  );
  const [depSearchQuery, setDepSearchQuery] = useState("");
  const [depSearchResults, setDepSearchResults] = useState<any[]>([]);
  const [isSearchingDeps, setIsSearchingDeps] = useState(false);
  const [selectedDepTask, setSelectedDepTask] = useState<any | null>(null);
  const [showDepDropdown, setShowDepDropdown] = useState(false);

  // 🚀 NEW: Ref for click-outside detection
  const depSearchRef = useRef<HTMLDivElement>(null);

  // Focus trap refs
  const modalRef = useRef<HTMLDivElement>(null);
  const firstFocusableRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      const { data: locData } = await supabase
        .from("locations")
        .select(
          `id, name, areas(id, name, inventory_items(id, identifier, plant_name, plant_id))`,
        )
        .eq("home_id", homeId);
      if (locData) setLocations(locData);

      const { data: planData } = await supabase
        .from("plans")
        .select("id, ai_blueprint")
        .eq("home_id", homeId);

      if (planData) {
        setPlans(
          planData.map((p: any) => ({
            id: p.id,
            title: p.ai_blueprint?.project_overview?.title || "Untitled Plan",
          })),
        );
      }
    };
    fetchData();
  }, [homeId]);

  const availableAreas = form.location_id
    ? locations.find((l) => l.id === form.location_id)?.areas || []
    : [];
  const availablePlantsInArea = form.area_id
    ? availableAreas.find((a: any) => a.id === form.area_id)?.inventory_items ||
      []
    : [];

  const uniqueSpecies = Array.from(
    new Set(availablePlantsInArea.map((p: any) => p.plant_name)),
  ).filter(Boolean) as string[];

  const availableInstances = form.selected_species
    ? availablePlantsInArea.filter(
        (p: any) => p.plant_name === form.selected_species,
      )
    : [];

  useEffect(() => {
    if (
      locations.length > 0 &&
      form.inventory_item_ids.length > 0 &&
      !form.selected_species
    ) {
      const firstId = form.inventory_item_ids[0];
      for (const loc of locations) {
        for (const area of loc.areas || []) {
          const found = area.inventory_items?.find(
            (i: any) => i.id === firstId,
          );
          if (found) {
            setForm((prev) => ({
              ...prev,
              selected_species: found.plant_name,
            }));
            return;
          }
        }
      }
    }
  }, [locations, form.inventory_item_ids]);

  useEffect(() => {
    const locName =
      locations.find((l) => l.id === form.location_id)?.name || "Unspecified";
    const areaName =
      availableAreas.find((a: any) => a.id === form.area_id)?.name ||
      "Unspecified";
    const plantName = form.selected_species
      ? `${form.selected_species} (${form.inventory_item_ids.length} selected)`
      : "Unspecified";
    const planName = plans.find((p) => p.id === form.plan_id)?.title || "None";

    setPageContext({
      action: existingBlueprint
        ? "Editing an Automation Rule"
        : isBlueprintMode
          ? "Creating an Automation Rule"
          : "Creating a new Task",
      taskDetails: {
        title: form.title || "Untitled Task",
        type: form.type,
        description: form.description,
        startDate: form.start_date || "Not Set",
        isRecurring: form.isRecurring,
        repeatFrequency: form.isRecurring
          ? `Every ${form.frequency_days} days`
          : "One-time",
        targetLocation: locName,
        targetArea: areaName,
        targetPlant: plantName,
        linkedPlan: planName,
      },
    });

    return () => setPageContext(null);
  }, [
    form,
    locations,
    plans,
    existingBlueprint,
    isBlueprintMode,
    setPageContext,
  ]);

  // Live Task Search for Dependencies
  useEffect(() => {
    if (!isLinking) return;
    const searchTasks = async () => {
      setIsSearchingDeps(true);
      try {
        let q = supabase
          .from("tasks")
          .select("id, title, status, due_date, type")
          .eq("home_id", homeId)
          .neq("status", "Skipped");
        if (depSearchQuery.trim())
          q = q.ilike("title", `%${depSearchQuery.trim()}%`);

        const { data, error } = await q.limit(15);
        if (error) throw error;
        setDepSearchResults(data || []);
      } catch (e) {
        console.error("Dependency Search Error:", e);
      } finally {
        setIsSearchingDeps(false);
      }
    };
    const debounce = setTimeout(searchTasks, 300);
    return () => clearTimeout(debounce);
  }, [depSearchQuery, isLinking, homeId]);

  // 🚀 NEW: Click outside handler for dependency dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        depSearchRef.current &&
        !depSearchRef.current.contains(event.target as Node)
      ) {
        setShowDepDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Focus trap implementation
  useEffect(() => {
    if (!modalRef.current) return;

    const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    firstFocusableRef.current = document.activeElement as HTMLElement;

    if (firstElement) {
      firstElement.focus();
    }

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    document.addEventListener("keydown", handleTab);
    return () => {
      document.removeEventListener("keydown", handleTab);
      if (firstFocusableRef.current) {
        firstFocusableRef.current.focus();
      }
    };
  }, []);

  // Escape key handler to close modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  // Fetch plant_schedules for the selected species to power the Quick Fill presets.
  // Falls back to an empty array so the hardcoded defaults show instead.
  // Depends only on primitive values — avoids the infinite-loop caused by derived
  // array references (availablePlantsInArea) changing on every render.
  useEffect(() => {
    if (!form.selected_species || !form.area_id) {
      setSmartPresets([]);
      return;
    }

    const area = locations
      .flatMap((l: any) => l.areas || [])
      .find((a: any) => a.id === form.area_id);
    const plantId = (area?.inventory_items || []).find(
      (p: any) => p.plant_name === form.selected_species,
    )?.plant_id;

    if (!plantId) {
      setSmartPresets([]);
      return;
    }

    supabase
      .from("plant_schedules")
      .select("task_type, frequency_days")
      .eq("plant_id", plantId)
      .eq("home_id", homeId)
      .then(({ data }) => {
        if (!data || data.length === 0) { setSmartPresets([]); return; }
        // One entry per task_type — pick the least aggressive interval so the
        // suggestion isn't overwhelming (e.g. prefer every 14d over every 3d).
        const byType: Record<string, number> = {};
        data.forEach((s: any) => {
          if (!(s.task_type in byType) || s.frequency_days > byType[s.task_type]) {
            byType[s.task_type] = s.frequency_days;
          }
        });
        setSmartPresets(
          Object.entries(byType).map(([type, frequency_days]) => ({ type, frequency_days })),
        );
      });
  }, [form.selected_species, form.area_id, homeId, locations]);

  const handleToggleInstance = (id: string) => {
    setForm((prev) => {
      const newIds = prev.inventory_item_ids.includes(id)
        ? prev.inventory_item_ids.filter((i) => i !== id)
        : [...prev.inventory_item_ids, id];
      return { ...prev, inventory_item_ids: newIds };
    });
  };

  const handleSelectAllInstances = (e: React.MouseEvent) => {
    e.preventDefault();
    if (form.inventory_item_ids.length === availableInstances.length) {
      setForm((prev) => ({ ...prev, inventory_item_ids: [] }));
    } else {
      setForm((prev) => ({
        ...prev,
        inventory_item_ids: availableInstances.map((i: any) => i.id),
      }));
    }
  };

  const ensurePhysicalTask = async (taskObj: any) => {
    if (!taskObj.isGhost) return taskObj;
    const { data, error } = await supabase
      .from("tasks")
      .insert({
        home_id: taskObj.home_id,
        blueprint_id: taskObj.blueprint_id,
        title: taskObj.title,
        description: taskObj.description,
        type: taskObj.type,
        due_date: taskObj.due_date,
        status: "Pending",
        location_id: taskObj.location_id,
        area_id: taskObj.area_id,
        plan_id: taskObj.plan_id,
        inventory_item_ids: taskObj.inventory_item_ids,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      const errorMsg = "Title is required.";
      toast.error(errorMsg);
      setLiveRegionMessage(errorMsg);
      return;
    }
    if (!form.start_date) {
      const errorMsg = "Start Date is required.";
      toast.error(errorMsg);
      setLiveRegionMessage(errorMsg);
      return;
    }
    setLoading(true);

    try {
      let createdTaskId = null;

      if (existingBlueprint) {
        const { error } = await supabase
          .from("task_blueprints")
          .update({
            title: form.title.trim(),
            description: form.description,
            task_type: form.type,
            location_id: form.location_id || null,
            area_id: form.area_id || null,
            plan_id: form.plan_id || null,
            inventory_item_ids: form.inventory_item_ids,
            frequency_days: form.frequency_days,
            start_date: form.start_date,
            end_date: form.end_date || null,
          })
          .eq("id", existingBlueprint.id);

        if (error) throw error;
        toast.success("Automation updated!");
        onSuccess();
        return;
      }

      if (form.isRecurring) {
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
              plan_id: form.plan_id || null,
              inventory_item_ids: form.inventory_item_ids,
              frequency_days: form.frequency_days,
              is_recurring: true,
              start_date: form.start_date,
              end_date: form.end_date || null,
            },
          ])
          .select()
          .single();

        if (bpError) throw bpError;

        const { data: newTsk, error: tError } = await supabase
          .from("tasks")
          .insert([
            {
              home_id: homeId,
              blueprint_id: blueprint.id,
              title: form.title,
              description: form.description,
              type: form.type,
              due_date: form.start_date,
              location_id: form.location_id || null,
              area_id: form.area_id || null,
              plan_id: form.plan_id || null,
              inventory_item_ids: form.inventory_item_ids,
              status: "Pending",
            },
          ])
          .select()
          .single();

        if (tError) throw tError;
        createdTaskId = newTsk.id;

        BlueprintService.generateBlueprintTasks(blueprint.id, form.start_date);
      } else {
        const { data: newTsk, error } = await supabase
          .from("tasks")
          .insert([
            {
              home_id: homeId,
              title: form.title.trim(),
              description: form.description,
              type: form.type,
              status: "Pending",
              due_date: form.start_date,
              location_id: form.location_id || null,
              area_id: form.area_id || null,
              plan_id: form.plan_id || null,
              inventory_item_ids: form.inventory_item_ids,
            },
          ])
          .select()
          .single();
        if (error) throw error;
        createdTaskId = newTsk.id;
      }

      // Link Dependencies if user selected one
      if (selectedDepTask && createdTaskId) {
        let depTaskToLink = selectedDepTask;
        if (depTaskToLink.isGhost) {
          depTaskToLink = await ensurePhysicalTask(depTaskToLink);
        }

        const payload =
          linkType === "waiting_on"
            ? { task_id: createdTaskId, depends_on_task_id: depTaskToLink.id }
            : { task_id: depTaskToLink.id, depends_on_task_id: createdTaskId };

        await supabase.from("task_dependencies").insert(payload);
      }

      toast.success(
        isBlueprintMode
          ? "Automation created!"
          : "Task scheduled successfully!",
      );
      onSuccess();
    } catch (error: any) {
      Logger.error("Failed to create task", error);
      const errorMsg = "Failed to schedule task.";
      toast.error(errorMsg);
      setLiveRegionMessage(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-rhozly-bg/95 backdrop-blur-xl animate-in fade-in duration-300">
      <div
        ref={modalRef}
        className="bg-rhozly-surface-lowest w-full max-w-2xl max-h-[90vh] overflow-y-auto custom-scrollbar rounded-[3rem] p-8 shadow-2xl border border-rhozly-outline/20"
      >
        <div
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
        >
          {liveRegionMessage}
        </div>
        <div className="flex justify-between items-center mb-8">
          <div>
            <h3 className="text-3xl font-black text-rhozly-on-surface">
              {existingBlueprint
                ? "Edit Automation"
                : isBlueprintMode
                  ? "New Automation"
                  : "New Task"}
            </h3>
            <p className="text-sm font-bold text-rhozly-primary mt-1 flex items-center gap-2">
              {isBlueprintMode ? <Repeat size={14} /> : <Calendar size={14} />}
              {existingBlueprint
                ? "Update recurring rule"
                : isBlueprintMode
                  ? "Recurring Rule Builder"
                  : "Schedule a physical task"}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close task modal"
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
            <div>
              <label className="text-[10px] font-black uppercase text-rhozly-on-surface/40 block mb-2 ml-1">
                Start Date *
              </label>
              <input
                type="date"
                value={form.start_date}
                onChange={(e) =>
                  setForm({ ...form, start_date: e.target.value })
                }
                className="w-full p-4 min-h-[44px] bg-rhozly-surface-low rounded-2xl font-bold outline-none border border-transparent focus:border-rhozly-primary cursor-pointer"
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-rhozly-on-surface/40 block mb-2 ml-1">
                Task Type
              </label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="w-full p-4 bg-rhozly-surface-low rounded-2xl font-bold outline-none border border-transparent focus:border-rhozly-primary cursor-pointer"
              >
                {TASK_CATEGORIES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <select
                value={form.location_id}
                onChange={(e) =>
                  setForm({
                    ...form,
                    location_id: e.target.value,
                    area_id: "",
                    selected_species: "",
                    inventory_item_ids: [],
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
                    selected_species: "",
                    inventory_item_ids: [],
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
                value={form.selected_species}
                onChange={(e) =>
                  setForm({
                    ...form,
                    selected_species: e.target.value,
                    inventory_item_ids: [],
                  })
                }
                disabled={!form.area_id || uniqueSpecies.length === 0}
                className="p-4 bg-rhozly-surface-low rounded-2xl font-bold outline-none border border-transparent focus:border-rhozly-primary disabled:opacity-50 cursor-pointer"
              >
                <option value="">Any Plant Species</option>
                {uniqueSpecies.map((species) => (
                  <option key={species} value={species}>
                    {species}
                  </option>
                ))}
              </select>
            </div>

            {form.selected_species && availableInstances.length > 0 && (
              <div className="sm:col-span-2 bg-rhozly-surface-lowest rounded-2xl p-4 border border-rhozly-outline/10 animate-in fade-in slide-in-from-top-2">
                <div className="flex justify-between items-center mb-3">
                  <label className="text-[10px] font-black uppercase text-rhozly-on-surface/40 ml-1">
                    Select Instances
                  </label>
                  <button
                    onClick={handleSelectAllInstances}
                    className="text-[10px] font-black uppercase tracking-widest text-rhozly-primary hover:underline"
                  >
                    {form.inventory_item_ids.length ===
                    availableInstances.length
                      ? "Deselect All"
                      : "Select All"}
                  </button>
                </div>
                <div
                  role="listbox"
                  aria-label="Select plant instances"
                  aria-multiselectable="true"
                  className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-40 overflow-y-auto custom-scrollbar pr-1"
                >
                  {availableInstances.map((inst: any) => {
                    const isSelected = form.inventory_item_ids.includes(
                      inst.id,
                    );
                    return (
                      <button
                        key={inst.id}
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => handleToggleInstance(inst.id)}
                        className={`p-3 rounded-xl text-xs font-bold border transition-colors text-left truncate flex items-center justify-between ${
                          isSelected
                            ? "bg-rhozly-primary/10 border-rhozly-primary text-rhozly-primary"
                            : "bg-white border-rhozly-outline/10 text-rhozly-on-surface/60 hover:border-rhozly-primary/30"
                        }`}
                      >
                        {inst.identifier}
                        {isSelected && <Check size={14} />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {form.selected_species && (
              <div className="sm:col-span-2 animate-in fade-in slide-in-from-top-2">
                {scorePlantByPreferences(form.selected_species, "", preferences) > 0 && (
                  <div className="flex items-center gap-2 mb-3 text-[11px] font-black text-emerald-700 bg-emerald-50 border border-emerald-100 px-3 py-2 rounded-xl">
                    <Sparkles size={12} /> You like {form.selected_species} — consider a recurring care schedule.
                  </div>
                )}
                <p className="text-[10px] font-black uppercase text-rhozly-on-surface/40 mb-2 ml-1">
                  Quick Fill {smartPresets.length > 0 ? "· from care guide" : "· suggested defaults"}
                </p>
                <div className="flex flex-wrap gap-2">
                  {(() => {
                    const TYPE_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
                      Watering:    { label: "Water",    icon: <Droplets size={12} />, color: "bg-blue-50 text-blue-700 border-blue-100 hover:bg-blue-100" },
                      Maintenance: { label: "Maintain", icon: <Scissors size={12} />, color: "bg-purple-50 text-purple-700 border-purple-100 hover:bg-purple-100" },
                      Harvesting:  { label: "Harvest",  icon: <Wheat size={12} />,    color: "bg-amber-50 text-amber-700 border-amber-100 hover:bg-amber-100" },
                      Planting:    { label: "Plant",    icon: <Sparkles size={12} />, color: "bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-100" },
                    };

                    const presets = smartPresets.length > 0
                      ? smartPresets
                      : [
                          { type: "Watering",    frequency_days: 7  },
                          { type: "Maintenance", frequency_days: 14 },
                          { type: "Harvesting",  frequency_days: 30 },
                        ];

                    return presets.map(({ type, frequency_days }) => {
                      const meta = TYPE_META[type] ?? { label: type, icon: null, color: "bg-gray-50 text-gray-700 border-gray-100 hover:bg-gray-100" };
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() =>
                            setForm((prev) => ({
                              ...prev,
                              type,
                              isRecurring: true,
                              frequency_days,
                              title: prev.title || `${meta.label} ${form.selected_species}`,
                            }))
                          }
                          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-black border transition-colors ${meta.color}`}
                        >
                          {meta.icon} {meta.label} · every {frequency_days}d
                        </button>
                      );
                    });
                  })()}
                </div>
              </div>
            )}

            <div className="sm:col-span-2">
              <label className="text-[10px] font-black uppercase text-rhozly-on-surface/40 block mb-2 ml-1">
                Link to Plan (Optional)
              </label>
              <select
                value={form.plan_id}
                onChange={(e) => setForm({ ...form, plan_id: e.target.value })}
                className="w-full p-4 bg-rhozly-surface-low rounded-2xl font-bold outline-none border border-transparent focus:border-rhozly-primary cursor-pointer"
              >
                <option value="">-- No Plan Linked --</option>
                {plans.map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </div>

            {!existingBlueprint && (
              <div className="sm:col-span-2 pt-4 border-t border-rhozly-outline/5 mt-2">
                <label className="text-[10px] font-black uppercase text-rhozly-on-surface/40 block mb-3 ml-1 flex items-center gap-1">
                  <LinkIcon size={12} /> Task Dependencies (Optional)
                </label>

                {isLinking ? (
                  <div className="flex flex-col gap-2 p-4 bg-gray-50 rounded-2xl border border-gray-100 animate-in fade-in">
                    <select
                      value={linkType}
                      onChange={(e) => {
                        setLinkType(
                          e.target.value as "waiting_on" | "blocking",
                        );
                        setSelectedDepTask(null);
                        setShowDepDropdown(false);
                      }}
                      className="w-full p-3 bg-white rounded-xl border border-rhozly-outline/10 text-sm font-bold outline-none focus:border-rhozly-primary transition-colors"
                    >
                      <option value="waiting_on">
                        This new task is WAITING ON...
                      </option>
                      <option value="blocking">
                        This new task is BLOCKING...
                      </option>
                    </select>
                    {/* 🚀 FIXED: Added the ref to the relative container */}
                    <div className="relative" ref={depSearchRef}>
                      <div className="flex items-center bg-white border border-rhozly-outline/10 rounded-xl overflow-hidden focus-within:border-rhozly-primary transition-colors">
                        <Search
                          size={16}
                          className="ml-3 text-gray-400 shrink-0"
                        />
                        <input
                          type="text"
                          placeholder="Search existing tasks by name..."
                          value={
                            selectedDepTask
                              ? selectedDepTask.title
                              : depSearchQuery
                          }
                          onChange={(e) => {
                            setSelectedDepTask(null);
                            setDepSearchQuery(e.target.value);
                            setShowDepDropdown(true);
                          }}
                          onFocus={() => setShowDepDropdown(true)}
                          className="w-full p-3 text-sm font-bold outline-none"
                        />
                        {selectedDepTask && (
                          <button
                            onClick={() => {
                              setSelectedDepTask(null);
                              setDepSearchQuery("");
                              setShowDepDropdown(true);
                            }}
                            className="p-2 text-gray-400 hover:text-red-500 mr-1"
                          >
                            <X size={16} />
                          </button>
                        )}
                      </div>
                      {!selectedDepTask && showDepDropdown && (
                        <div className="absolute z-50 w-full mt-2 bg-white border border-gray-200 rounded-xl shadow-2xl max-h-48 overflow-y-auto custom-scrollbar">
                          {isSearchingDeps ? (
                            <div className="p-4 text-center text-gray-400 text-xs flex items-center justify-center gap-2">
                              <Loader2 className="animate-spin" size={14} />{" "}
                              Searching...
                            </div>
                          ) : depSearchResults.length === 0 &&
                            depSearchQuery.trim() !== "" ? (
                            <div className="p-4 text-center text-gray-400 text-xs">
                              No matching tasks found.
                            </div>
                          ) : (
                            depSearchResults.map((t) => (
                              <div
                                key={t.id}
                                onClick={() => {
                                  setSelectedDepTask(t);
                                  setShowDepDropdown(false);
                                }}
                                className="p-3 hover:bg-rhozly-primary/5 cursor-pointer border-b border-gray-50 last:border-0 flex items-center justify-between transition-colors"
                              >
                                <div className="min-w-0 pr-2">
                                  <p className="text-sm font-bold text-gray-800 truncate">
                                    {t.title}
                                  </p>
                                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mt-0.5 flex gap-1.5 items-center">
                                    <span>{t.type}</span>
                                    <span className="opacity-50">•</span>
                                    <span
                                      className={
                                        t.status === "Completed"
                                          ? "text-green-500"
                                          : t.status === "Pending"
                                            ? "text-blue-500"
                                            : "text-gray-400"
                                      }
                                    >
                                      {t.status}
                                    </span>
                                  </p>
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="text-xs font-black text-gray-500 uppercase">
                                    {formatDisplayDate(t.due_date)}
                                  </p>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => {
                        setIsLinking(false);
                        setDepSearchQuery("");
                        setSelectedDepTask(null);
                      }}
                      className="w-full mt-2 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold rounded-xl text-xs transition-colors"
                    >
                      Remove Link
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setIsLinking(true)}
                    className="text-sm font-bold text-blue-500 hover:text-blue-700 flex items-center gap-1 bg-blue-50 hover:bg-blue-100 px-4 py-3 rounded-2xl transition-colors"
                  >
                    <LinkIcon size={16} /> Add a Task Link
                  </button>
                )}
              </div>
            )}
          </div>

          <textarea
            placeholder="Additional notes or descriptions..."
            rows={3}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="w-full p-4 bg-rhozly-surface-low rounded-2xl font-bold border border-transparent focus:border-rhozly-primary outline-none resize-none"
          />

          <div className="bg-rhozly-primary/5 border border-rhozly-primary/20 rounded-3xl p-6">
            <label
              className={`flex items-center gap-3 w-fit ${isBlueprintMode ? "cursor-default" : "cursor-pointer"}`}
            >
              <input
                type="checkbox"
                checked={form.isRecurring}
                onChange={(e) =>
                  setForm({ ...form, isRecurring: e.target.checked })
                }
                disabled={isBlueprintMode}
                className={`w-5 h-5 accent-rhozly-primary ${isBlueprintMode ? "opacity-50" : ""}`}
              />
              <span
                className={`font-black flex items-center gap-2 ${isBlueprintMode ? "text-rhozly-primary/60" : "text-rhozly-primary"}`}
              >
                <Repeat size={18} />{" "}
                {isBlueprintMode
                  ? "This is a recurring rule"
                  : "Repeat this task"}
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
                        frequency_days: parseInt(e.target.value) || 1,
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
                    className="w-full p-4 min-h-[44px] bg-white rounded-2xl font-bold outline-none border border-rhozly-outline/10 cursor-pointer"
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
                <Check /> Save
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
