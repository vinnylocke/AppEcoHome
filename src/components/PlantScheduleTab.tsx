import React, { useState, useEffect } from "react";
import { Plus, Clock, Save, X, Loader2, Wand2 } from "lucide-react";
import { supabase } from "../lib/supabase";
import toast from "react-hot-toast";
import { TASK_CATEGORIES } from "./AddTaskModal";
import { Logger } from "../lib/errorHandler";

interface Props {
  homeId: string;
  plant: any;
}

const TRIGGER_EVENTS = ["Added to Area", "Planted", "Potted", "Moved Outside"];
const REFERENCE_DATES = ["Trigger Date", "Estimated Harvest Date"];

export default function PlantScheduleTab({ homeId, plant }: Props) {
  const [schedules, setSchedules] = useState<any[]>([]);
  const [homeData, setHomeData] = useState<any>(null); // 🚀 NEW: Store home location info
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    title: "",
    task_type: "Watering",
    trigger_event: "Planted",
    start_reference: "Trigger Date",
    start_offset_days: 0,
    frequency_days: 7,
    apply_to_existing: false,
  });

  useEffect(() => {
    fetchSchedules();
    fetchHomeData();
  }, [plant.id, homeId]);

  const fetchHomeData = async () => {
    try {
      // Assuming your homes table has a country or timezone column. Adjust if needed!
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

  // 🌍 Hemisphere & Season Logic
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

    // Check if the home location matches a known Southern Hemisphere area
    if (southernCountries.some((c) => searchString.includes(c)))
      return "southern";
    return "northern"; // Default to Northern Hemisphere (UK, US, EU, etc.)
  };

  const getSeasonDateRange = (
    seasonString: string,
    hemisphere: "northern" | "southern",
  ) => {
    const s = seasonString.toLowerCase();

    // Northern Hemisphere Mapping
    if (hemisphere === "northern") {
      if (s.includes("spring") && s.includes("summer"))
        return { start: "03-01", end: "08-31" };
      if (s.includes("spring")) return { start: "03-01", end: "05-31" };
      if (s.includes("summer")) return { start: "06-01", end: "08-31" };
      if (s.includes("fall") || s.includes("autumn"))
        return { start: "09-01", end: "11-30" };
      if (s.includes("winter")) return { start: "12-01", end: "02-28" };
    }
    // Southern Hemisphere Mapping
    else {
      if (s.includes("spring") && s.includes("summer"))
        return { start: "09-01", end: "02-28" };
      if (s.includes("spring")) return { start: "09-01", end: "11-30" };
      if (s.includes("summer")) return { start: "12-01", end: "02-28" };
      if (s.includes("fall") || s.includes("autumn"))
        return { start: "03-01", end: "05-31" };
      if (s.includes("winter")) return { start: "06-01", end: "08-31" };
    }

    return { start: "01-01", end: "12-31" }; // Fallback if no match
  };

  // 🚀 THE MAGIC WIZARD
  const handleAutoGenerate = async () => {
    if (!plant.harvest_season) {
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

      const { error } = await supabase.from("plant_schedules").insert([
        {
          home_id: homeId,
          plant_id: plant.id,
          title: `${plant.harvest_season} Harvest Season`,
          description: `Auto-generated from Care Guide (${hemisphere} hemisphere)`,
          task_type: "Harvesting",
          trigger_event: "Planted",
          start_reference: `Seasonal: ${start}`, // 👈 Our clever new tag!
          start_offset_days: 0,
          end_reference: `Seasonal: ${end}`,
          end_offset_days: 0,
          frequency_days: 1, // Every day during the season
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

  const handleSave = async () => {
    if (!form.title.trim())
      return toast.error("Please give this schedule a name.");
    setSaving(true);

    try {
      const { data: newSchedule, error } = await supabase
        .from("plant_schedules")
        .insert([
          {
            home_id: homeId,
            plant_id: plant.id,
            title: form.title,
            task_type: form.task_type,
            trigger_event: form.trigger_event,
            start_reference: form.start_reference,
            start_offset_days: form.start_offset_days,
            frequency_days: form.frequency_days,
            is_recurring: true,
          },
        ])
        .select()
        .single();

      if (error) throw error;

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
      } else {
        toast.success("Schedule saved for future plants!");
      }

      setIsAdding(false);
      fetchSchedules();
      setForm({
        ...form,
        title: "",
        start_offset_days: 0,
        frequency_days: 7,
        apply_to_existing: false,
      });
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
        <div className="bg-rhozly-surface-low border border-rhozly-outline/20 p-6 rounded-3xl space-y-5 animate-in slide-in-from-top-4">
          <div className="flex justify-between items-center mb-2">
            <h4 className="font-black text-lg text-rhozly-primary">
              New Automation Rule
            </h4>
            <button
              onClick={() => setIsAdding(false)}
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
            className="w-full p-4 bg-white rounded-2xl font-bold border border-transparent focus:border-rhozly-primary outline-none"
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
                className="w-full p-3 bg-white rounded-xl font-bold border border-transparent focus:border-rhozly-primary outline-none"
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
                className="w-full p-3 bg-white rounded-xl font-bold border border-transparent focus:border-rhozly-primary outline-none"
              >
                {TRIGGER_EVENTS.map((t) => (
                  <option key={t} value={t}>
                    When {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="bg-rhozly-primary/5 p-4 rounded-2xl grid grid-cols-1 md:grid-cols-3 gap-4 border border-rhozly-primary/10">
            <div>
              <label className="text-[10px] font-black uppercase text-rhozly-primary/60 block mb-2">
                Start Timing
              </label>
              <select
                value={form.start_reference}
                onChange={(e) =>
                  setForm({ ...form, start_reference: e.target.value })
                }
                className="w-full p-3 bg-white rounded-xl font-bold outline-none text-sm"
              >
                {REFERENCE_DATES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-rhozly-primary/60 block mb-2">
                Offset (Days)
              </label>
              <input
                type="number"
                value={form.start_offset_days}
                onChange={(e) =>
                  setForm({
                    ...form,
                    start_offset_days: parseInt(e.target.value) || 0,
                  })
                }
                className="w-full p-3 bg-white rounded-xl font-bold outline-none text-sm"
                placeholder="e.g. 0 for immediate"
              />
            </div>
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
                className="w-full p-3 bg-white rounded-xl font-bold outline-none text-sm"
              />
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
                Will immediately create blueprints for items currently marked as
                "{form.trigger_event}".
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
                <Save size={18} /> Save Custom Rule
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
              className="bg-white p-4 rounded-2xl border border-rhozly-outline/10 shadow-sm flex items-center justify-between group"
            >
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[9px] font-black uppercase tracking-widest bg-rhozly-primary/10 text-rhozly-primary px-2 py-0.5 rounded-md">
                    {schedule.task_type}
                  </span>
                  {schedule.start_reference?.startsWith("Seasonal") && (
                    <span className="text-[9px] font-black uppercase tracking-widest bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-md">
                      Annual
                    </span>
                  )}
                </div>
                <h4 className="font-black text-rhozly-on-surface">
                  {schedule.title}
                </h4>
                <p className="text-xs font-bold text-rhozly-on-surface/50 mt-0.5">
                  {schedule.start_reference?.startsWith("Seasonal")
                    ? `Occurs annually between ${schedule.start_reference.replace("Seasonal: ", "")} and ${schedule.end_reference.replace("Seasonal: ", "")}`
                    : `Starts ${schedule.start_offset_days} days after ${schedule.trigger_event}`}
                  • Repeats every {schedule.frequency_days} days
                </p>
              </div>
              <button
                onClick={() => deleteSchedule(schedule.id)}
                className="p-2 text-red-500/50 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
              >
                <X size={18} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
