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
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { Logger } from "../lib/errorHandler";
import toast from "react-hot-toast";
import { usePlantDoctor } from "../context/PlantDoctorContext";

interface Props {
  homeId: string;
  selectedDate?: Date;
  isBlueprintMode?: boolean;
  existingBlueprint?: any;
  onClose: () => void;
  onSuccess: () => void;
}

export const TASK_CATEGORIES = [
  "Planting",
  "Watering",
  "Harvesting",
  "Maintenance",
];

const getLocalDateString = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatDisplayDate = (dateString: string) => {
  if (!dateString) return "";
  const [y, m, d] = dateString.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

export default function AddTaskModal({
  homeId,
  selectedDate,
  isBlueprintMode = false,
  existingBlueprint,
  onClose,
  onSuccess,
}: Props) {
  const { setPageContext } = usePlantDoctor();

  const [loading, setLoading] = useState(false);
  const [locations, setLocations] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);

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

  useEffect(() => {
    const fetchData = async () => {
      const { data: locData } = await supabase
        .from("locations")
        .select(
          `id, name, areas(id, name, inventory_items(id, identifier, plant_name))`,
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
    availableAreas,
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
    if (!form.title.trim()) return toast.error("Title is required.");
    if (!form.start_date) return toast.error("Start Date is required.");
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

        supabase.functions.invoke("generate-tasks", {
          body: { blueprint_id: blueprint.id, start_date: form.start_date },
        });
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
      toast.error("Failed to schedule task.");
    } finally {
      setLoading(false);
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-rhozly-bg/95 backdrop-blur-xl animate-in fade-in duration-300">
      <div className="bg-rhozly-surface-lowest w-full max-w-2xl max-h-[90vh] overflow-y-auto custom-scrollbar rounded-[3rem] p-8 shadow-2xl border border-rhozly-outline/20">
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
                className="w-full p-4 bg-rhozly-surface-low rounded-2xl font-bold outline-none border border-transparent focus:border-rhozly-primary cursor-pointer"
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
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-40 overflow-y-auto custom-scrollbar pr-1">
                  {availableInstances.map((inst: any) => {
                    const isSelected = form.inventory_item_ids.includes(
                      inst.id,
                    );
                    return (
                      <button
                        key={inst.id}
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
