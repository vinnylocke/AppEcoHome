import React, { useState, useEffect } from "react";
import {
  Plus,
  Clock,
  Save,
  X,
  Loader2,
  Wand2,
  Edit3,
  Trash2,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import toast from "react-hot-toast";
import { TASK_CATEGORIES } from "./AddTaskModal";
import { Logger } from "../lib/errorHandler";

interface Props {
  homeId: string;
  plant: any;
}

const TRIGGER_EVENTS = ["Added to Area", "Planted", "Potted", "Moved Outside"];

export default function PlantScheduleTab({ homeId, plant }: Props) {
  const [schedules, setSchedules] = useState<any[]>([]);
  const [homeData, setHomeData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const defaultFormState = {
    title: "",
    task_type: "Watering",
    trigger_event: "Planted",
    start_reference: "Trigger Date",
    start_offset_days: 0,
    end_reference: "Ongoing", // 🚀 NEW: Explicit End State
    end_offset_days: 0, // 🚀 NEW: Explicit End Offset
    frequency_days: 7,
    apply_to_existing: false,
  };

  const [form, setForm] = useState(defaultFormState);

  useEffect(() => {
    fetchSchedules();
    fetchHomeData();
  }, [plant.id, homeId]);

  const fetchHomeData = async () => {
    try {
      const { data } = await supabase
        .from("homes")
        .select("*")
        .eq("id", homeId)
        .single();
      if (data) setHomeData(data);
    } catch (err) {
      Logger.error("Failed to fetch home data", err);
    }
  };

  const fetchSchedules = async () => {
    try {
      const { data, error } = await supabase
        .from("plant_schedules")
        .select("*")
        .eq("plant_id", plant.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (data) setSchedules(data);
    } catch (err) {
      Logger.error("Failed to load schedules", err);
    } finally {
      setLoading(false);
    }
  };

  const getHemisphere = (country?: string, timezone?: string) => {
    const southernCountries = [
      "australia",
      "new zealand",
      "brazil",
      "south africa",
      "argentina",
      "chile",
      "peru",
    ];
    const searchString = `${country || ""} ${timezone || ""}`.toLowerCase();
    if (southernCountries.some((c) => searchString.includes(c)))
      return "southern";
    return "northern";
  };

  const getSeasonDateRange = (
    seasonInput: string | string[],
    hemisphere: "northern" | "southern",
  ) => {
    const s = (
      Array.isArray(seasonInput)
        ? seasonInput.join(" ")
        : String(seasonInput || "")
    ).toLowerCase();
    if (s.includes("year-round") || s.includes("year round"))
      return { start: "01-01", end: "12-31" };

    const hasSpring = s.includes("spring");
    const hasSummer = s.includes("summer");
    const hasFall = s.includes("fall") || s.includes("autumn");
    const hasWinter = s.includes("winter");

    if (hemisphere === "northern") {
      if (hasSpring && hasSummer && hasFall)
        return { start: "03-01", end: "11-30" };
      if (hasSpring && hasSummer) return { start: "03-01", end: "08-31" };
      if (hasSummer && hasFall) return { start: "06-01", end: "11-30" };
      if (hasFall && hasWinter) return { start: "09-01", end: "02-28" };
      if (hasWinter && hasSpring) return { start: "12-01", end: "05-31" };

      if (hasSpring) return { start: "03-01", end: "05-31" };
      if (hasSummer) return { start: "06-01", end: "08-31" };
      if (hasFall) return { start: "09-01", end: "11-30" };
      if (hasWinter) return { start: "12-01", end: "02-28" };
    } else {
      if (hasSpring && hasSummer && hasFall)
        return { start: "09-01", end: "05-31" };
      if (hasSpring && hasSummer) return { start: "09-01", end: "02-28" };
      if (hasSummer && hasFall) return { start: "12-01", end: "05-31" };
      if (hasFall && hasWinter) return { start: "03-01", end: "08-31" };
      if (hasWinter && hasSpring) return { start: "06-01", end: "11-30" };

      if (hasSpring) return { start: "09-01", end: "11-30" };
      if (hasSummer) return { start: "12-01", end: "02-28" };
      if (hasFall) return { start: "03-01", end: "05-31" };
      if (hasWinter) return { start: "06-01", end: "08-31" };
    }

    return { start: "01-01", end: "12-31" };
  };

  // 🚀 FORMATTER: Converts "03-01" to "Mar 1" for UI readability
  const formatMonthDay = (md: string) => {
    if (!md) return "";
    const [m, d] = md.split("-");
    const date = new Date(2024, parseInt(m) - 1, parseInt(d));
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  // 🚀 DYNAMIC REFERENCE DATES: Reads the plant's care guide to build dropdown options
  const buildReferenceOptions = () => {
    const options = [{ label: "Trigger Date", value: "Trigger Date" }];
    const hemisphere = getHemisphere(homeData?.country, homeData?.timezone);

    if (plant.harvest_season && plant.harvest_season.length > 0) {
      const { start, end } = getSeasonDateRange(
        plant.harvest_season,
        hemisphere,
      );
      options.push({
        label: `Harvest Start (${formatMonthDay(start)})`,
        value: `Seasonal: ${start}`,
      });
      options.push({
        label: `Harvest End (${formatMonthDay(end)})`,
        value: `Seasonal: ${end}`,
      });
    }

    if (plant.flowering_season && plant.flowering_season.length > 0) {
      const { start, end } = getSeasonDateRange(
        plant.flowering_season,
        hemisphere,
      );
      options.push({
        label: `Flowering Start (${formatMonthDay(start)})`,
        value: `Seasonal: ${start}`,
      });
      options.push({
        label: `Flowering End (${formatMonthDay(end)})`,
        value: `Seasonal: ${end}`,
      });
    }

    if (plant.pruning_month && plant.pruning_month.length > 0) {
      const { start, end } = getSeasonDateRange(
        plant.pruning_month,
        hemisphere,
      );
      options.push({
        label: `Pruning Start (${formatMonthDay(start)})`,
        value: `Seasonal: ${start}`,
      });
      options.push({
        label: `Pruning End (${formatMonthDay(end)})`,
        value: `Seasonal: ${end}`,
      });
    }

    // Fallback if we are editing an old schedule with an unknown seasonal tag
    if (
      form.start_reference?.startsWith("Seasonal:") &&
      !options.find((o) => o.value === form.start_reference)
    ) {
      options.push({
        label: `Custom Date (${formatMonthDay(form.start_reference.replace("Seasonal: ", ""))})`,
        value: form.start_reference,
      });
    }

    return options;
  };

  const dynamicOptions = buildReferenceOptions();
  const endOptions = [
    { label: "Never (Ongoing)", value: "Ongoing" },
    ...dynamicOptions.filter((o) => o.value !== "Trigger Date"),
  ];

  const handleAutoGenerate = async () => {
    if (!plant.harvest_season || plant.harvest_season.length === 0) {
      return toast.error("No harvest season found in the Care Guide!");
    }

    setSaving(true);
    toast.loading("Translating seasons into calendar dates...", {
      id: "generate",
    });

    try {
      const hemisphere = getHemisphere(homeData?.country, homeData?.timezone);
      const { start, end } = getSeasonDateRange(
        plant.harvest_season,
        hemisphere,
      );
      const seasonTitle = Array.isArray(plant.harvest_season)
        ? plant.harvest_season.join(" & ")
        : plant.harvest_season;

      const { error } = await supabase.from("plant_schedules").insert([
        {
          home_id: homeId,
          plant_id: plant.id,
          title: `${seasonTitle} Harvest`,
          description: `Auto-generated from Care Guide (${hemisphere} hemisphere)`,
          task_type: "Harvesting",
          trigger_event: "Planted",
          start_reference: `Seasonal: ${start}`,
          start_offset_days: 0,
          end_reference: `Seasonal: ${end}`,
          end_offset_days: 0,
          frequency_days: 1,
          is_recurring: true,
        },
      ]);

      if (error) throw error;

      toast.success("Harvest schedule generated!", { id: "generate" });
      fetchSchedules();
    } catch (err) {
      Logger.error("Failed to auto-generate", err);
      toast.error("Generation failed.", { id: "generate" });
    } finally {
      setSaving(false);
    }
  };

  const openEditForm = (schedule: any) => {
    setForm({
      title: schedule.title,
      task_type: schedule.task_type,
      trigger_event: schedule.trigger_event,
      start_reference: schedule.start_reference || "Trigger Date",
      start_offset_days: schedule.start_offset_days || 0,
      end_reference: schedule.end_reference || "Ongoing",
      end_offset_days: schedule.end_offset_days || 0,
      frequency_days: schedule.frequency_days || 1,
      apply_to_existing: false,
    });
    setEditingId(schedule.id);
    setIsAdding(true);
  };

  const closeForm = () => {
    setIsAdding(false);
    setEditingId(null);
    setForm(defaultFormState);
  };

  const handleSave = async () => {
    if (!form.title.trim())
      return toast.error("Please give this schedule a name.");
    setSaving(true);

    try {
      let newSchedule;
      const payload = {
        title: form.title,
        task_type: form.task_type,
        trigger_event: form.trigger_event,
        start_reference: form.start_reference,
        start_offset_days: form.start_offset_days,
        end_reference:
          form.end_reference === "Ongoing" ? null : form.end_reference,
        end_offset_days:
          form.end_reference === "Ongoing" ? null : form.end_offset_days,
        frequency_days: form.frequency_days,
      };

      if (editingId) {
        const { data, error } = await supabase
          .from("plant_schedules")
          .update(payload)
          .eq("id", editingId)
          .select()
          .single();
        if (error) throw error;
        newSchedule = data;
        toast.success("Schedule updated successfully!");
      } else {
        const { data, error } = await supabase
          .from("plant_schedules")
          .insert([
            {
              ...payload,
              home_id: homeId,
              plant_id: plant.id,
              is_recurring: true,
            },
          ])
          .select()
          .single();
        if (error) throw error;
        newSchedule = data;
        toast.success("Schedule saved for future plants!");
      }

      if (form.apply_to_existing && newSchedule) {
        toast.loading("Applying to existing plants...", { id: "apply-sync" });
        const { data: existingPlants } = await supabase
          .from("inventory_items")
          .select("id, location_id, area_id")
          .eq("home_id", homeId)
          .eq("plant_id", plant.id)
          .eq("status", form.trigger_event);

        if (existingPlants && existingPlants.length > 0) {
          const blueprintsToCreate = existingPlants.map((p) => ({
            home_id: homeId,
            title: newSchedule.title,
            task_type: newSchedule.task_type,
            location_id: p.location_id,
            area_id: p.area_id,
            inventory_item_id: p.id,
            frequency_days: newSchedule.frequency_days,
            is_recurring: true,
          }));

          const { data: createdBps } = await supabase
            .from("task_blueprints")
            .insert(blueprintsToCreate)
            .select("id");
          if (createdBps) {
            for (const bp of createdBps) {
              supabase.functions.invoke("generate-tasks", {
                body: { blueprint_id: bp.id },
              });
            }
          }
        }
        toast.success("Schedule applied to existing plants!", {
          id: "apply-sync",
        });
      }

      closeForm();
      fetchSchedules();
    } catch (err) {
      Logger.error("Failed to save schedule", err);
      toast.error("Failed to save schedule.");
    } finally {
      setSaving(false);
    }
  };

  const deleteSchedule = async (id: string) => {
    if (
      !window.confirm(
        "Delete this schedule template? Active tasks won't be deleted.",
      )
    )
      return;
    try {
      await supabase.from("plant_schedules").delete().eq("id", id);
      setSchedules(schedules.filter((s) => s.id !== id));
      toast.success("Schedule deleted");
    } catch (err) {
      toast.error("Failed to delete");
    }
  };

  // 🚀 Helper to make the schedule card descriptions human-readable
  const parseReferenceString = (ref: string, offset: number) => {
    if (!ref) return "Trigger Date";
    if (ref.startsWith("Seasonal: ")) {
      const dateStr = formatMonthDay(ref.replace("Seasonal: ", ""));
      return `${offset > 0 ? `${offset} days after ` : "on "}${dateStr}`;
    }
    return `${offset > 0 ? `${offset} days after ` : "on the "}${ref}`;
  };

  if (loading)
    return (
      <div className="flex justify-center p-10">
        <Loader2 className="animate-spin text-rhozly-primary" />
      </div>
    );

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h3 className="font-black text-xl">Care Schedules</h3>
          <p className="text-xs font-bold text-rhozly-on-surface/50 mt-1">
            Automate tasks when this plant changes status.
          </p>
        </div>

        <div className="flex gap-2 w-full md:w-auto">
          <button
            onClick={handleAutoGenerate}
            disabled={saving}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-rhozly-primary/10 text-rhozly-primary px-4 py-2 rounded-xl text-xs font-black hover:bg-rhozly-primary hover:text-white transition-all disabled:opacity-50"
          >
            <Wand2 size={16} /> Auto-Generate
          </button>

          {!isAdding && (
            <button
              onClick={() => setIsAdding(true)}
              className="flex-1 md:flex-none flex items-center justify-center gap-1 bg-rhozly-primary text-white px-4 py-2 rounded-xl text-xs font-black hover:scale-105 transition-transform"
            >
              <Plus size={16} /> Add Custom
            </button>
          )}
        </div>
      </div>

      {isAdding && (
        <div className="bg-rhozly-surface-low border border-rhozly-outline/20 p-6 rounded-3xl space-y-6 animate-in slide-in-from-top-4">
          <div className="flex justify-between items-center mb-2">
            <h4 className="font-black text-lg text-rhozly-primary">
              {editingId ? "Edit Automation Rule" : "New Automation Rule"}
            </h4>
            <button
              onClick={closeForm}
              className="text-rhozly-on-surface/40 hover:text-rhozly-on-surface"
            >
              <X size={20} />
            </button>
          </div>

          <input
            type="text"
            placeholder="e.g., Weekly Deep Watering"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="w-full p-4 bg-white rounded-2xl font-black border border-transparent focus:border-rhozly-primary outline-none"
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-black uppercase text-rhozly-on-surface/40 block mb-2">
                Task Type
              </label>
              <select
                value={form.task_type}
                onChange={(e) =>
                  setForm({ ...form, task_type: e.target.value })
                }
                className="w-full p-4 bg-white rounded-xl font-bold border border-transparent focus:border-rhozly-primary outline-none"
              >
                {TASK_CATEGORIES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-rhozly-on-surface/40 block mb-2">
                Trigger Event
              </label>
              <select
                value={form.trigger_event}
                onChange={(e) =>
                  setForm({ ...form, trigger_event: e.target.value })
                }
                className="w-full p-4 bg-white rounded-xl font-bold border border-transparent focus:border-rhozly-primary outline-none"
              >
                {TRIGGER_EVENTS.map((t) => (
                  <option key={t} value={t}>
                    When {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 🚀 REDESIGNED: Plain English Sentence Structure for Timing */}
          <div className="bg-rhozly-primary/5 p-5 rounded-2xl border border-rhozly-primary/10 space-y-5">
            {/* Start Row */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <span className="font-black text-rhozly-primary w-16">START</span>
              <div className="flex items-center gap-2 flex-1">
                <input
                  type="number"
                  min="0"
                  value={form.start_offset_days}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      start_offset_days: parseInt(e.target.value) || 0,
                    })
                  }
                  className="w-20 p-3 bg-white rounded-xl font-bold outline-none text-center shadow-sm"
                />
                <span className="font-bold text-sm text-rhozly-on-surface/60 whitespace-nowrap">
                  days after
                </span>
                <select
                  value={form.start_reference}
                  onChange={(e) =>
                    setForm({ ...form, start_reference: e.target.value })
                  }
                  className="flex-1 p-3 bg-white rounded-xl font-bold outline-none text-sm shadow-sm"
                >
                  {dynamicOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* End Row */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <span className="font-black text-red-500 w-16">END</span>
              <div className="flex items-center gap-2 flex-1">
                <input
                  type="number"
                  min="0"
                  disabled={form.end_reference === "Ongoing"}
                  value={form.end_offset_days}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      end_offset_days: parseInt(e.target.value) || 0,
                    })
                  }
                  className="w-20 p-3 bg-white rounded-xl font-bold outline-none text-center shadow-sm disabled:opacity-50"
                />
                <span className="font-bold text-sm text-rhozly-on-surface/60 whitespace-nowrap">
                  days after
                </span>
                <select
                  value={form.end_reference}
                  onChange={(e) =>
                    setForm({ ...form, end_reference: e.target.value })
                  }
                  className="flex-1 p-3 bg-white rounded-xl font-bold outline-none text-sm shadow-sm"
                >
                  {endOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <hr className="border-rhozly-primary/10" />

            {/* Repeat Row */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <span className="font-black text-rhozly-on-surface w-16">
                REPEAT
              </span>
              <div className="flex items-center gap-2 flex-1">
                <span className="font-bold text-sm text-rhozly-on-surface/60">
                  Every
                </span>
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
                  className="w-20 p-3 bg-white rounded-xl font-bold outline-none text-center shadow-sm"
                />
                <span className="font-bold text-sm text-rhozly-on-surface/60">
                  days
                </span>
              </div>
            </div>
          </div>

          <label className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-rhozly-outline/10 cursor-pointer hover:border-rhozly-primary/30 transition-colors">
            <input
              type="checkbox"
              checked={form.apply_to_existing}
              onChange={(e) =>
                setForm({ ...form, apply_to_existing: e.target.checked })
              }
              className="w-5 h-5 accent-rhozly-primary"
            />
            <div>
              <p className="font-black text-sm">Apply to existing plants?</p>
              <p className="text-[10px] font-bold text-rhozly-on-surface/50 mt-0.5">
                Will immediately create tasks for items currently marked as "
                {form.trigger_event}".
              </p>
            </div>
          </label>

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-4 bg-rhozly-primary text-white rounded-xl font-black shadow-lg hover:scale-[1.02] transition-transform disabled:opacity-50 flex justify-center items-center gap-2"
          >
            {saving ? (
              <Loader2 className="animate-spin" size={18} />
            ) : (
              <>
                <Save size={18} />{" "}
                {editingId ? "Save Changes" : "Save Custom Rule"}
              </>
            )}
          </button>
        </div>
      )}

      <div className="space-y-3">
        {schedules.length === 0 && !isAdding ? (
          <div className="text-center p-8 border-2 border-dashed border-rhozly-outline/20 rounded-3xl opacity-50">
            <Clock className="mx-auto mb-2" size={24} />
            <p className="font-bold text-sm">No schedules created yet.</p>
          </div>
        ) : (
          schedules.map((schedule) => (
            <div
              key={schedule.id}
              className="bg-white p-4 sm:p-5 rounded-2xl border border-rhozly-outline/10 shadow-sm flex items-start sm:items-center justify-between gap-4"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="text-[9px] font-black uppercase tracking-widest bg-rhozly-primary/10 text-rhozly-primary px-2 py-1 rounded-md">
                    {schedule.task_type}
                  </span>
                  {schedule.start_reference?.startsWith("Seasonal") && (
                    <span className="text-[9px] font-black uppercase tracking-widest bg-yellow-100 text-yellow-700 px-2 py-1 rounded-md">
                      Annual Cycle
                    </span>
                  )}
                  <span className="text-[9px] font-black uppercase tracking-widest bg-gray-100 text-gray-500 px-2 py-1 rounded-md">
                    When {schedule.trigger_event}
                  </span>
                </div>
                <h4 className="font-black text-lg text-rhozly-on-surface mb-1">
                  {schedule.title}
                </h4>

                {/* 🚀 REDESIGNED: Readable schedule descriptions */}
                <div className="text-xs font-bold text-rhozly-on-surface/60 space-y-0.5">
                  <p>
                    🟢 Starts{" "}
                    {parseReferenceString(
                      schedule.start_reference,
                      schedule.start_offset_days,
                    )}
                  </p>
                  {schedule.end_reference && (
                    <p>
                      🔴 Ends{" "}
                      {parseReferenceString(
                        schedule.end_reference,
                        schedule.end_offset_days,
                      )}
                    </p>
                  )}
                  <p>🔄 Repeats every {schedule.frequency_days} day(s)</p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-2 shrink-0 border-l border-rhozly-outline/10 pl-4">
                <button
                  onClick={() => openEditForm(schedule)}
                  className="p-3 text-rhozly-primary hover:bg-rhozly-primary/10 bg-rhozly-surface-lowest rounded-xl transition-all shadow-sm"
                  title="Edit Schedule"
                >
                  <Edit3 size={18} />
                </button>
                <button
                  onClick={() => deleteSchedule(schedule.id)}
                  className="p-3 text-red-500/80 hover:text-red-600 hover:bg-red-50 bg-rhozly-surface-lowest rounded-xl transition-all shadow-sm"
                  title="Delete Schedule"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
