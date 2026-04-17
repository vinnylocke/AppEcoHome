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
import { ConfirmModal } from "./ConfirmModal";

interface Props {
  homeId: string;
  plant: any;
}

const TRIGGER_EVENTS = ["Added to Area", "Planted", "Potted", "Moved Outside"];

const SEASONAL_EVENTS_CONFIG = [
  { dbKey: "harvest_season", eventName: "Harvest" },
  { dbKey: "pruning_month", eventName: "Pruning" },
  { dbKey: "flowering_season", eventName: "Flowering" },
];

export default function PlantScheduleTab({ homeId, plant }: Props) {
  const [schedules, setSchedules] = useState<any[]>([]);
  const [homeData, setHomeData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [pendingGeneratedSchedules, setPendingGeneratedSchedules] = useState<
    any[] | null
  >(null);

  const [frequencyMode, setFrequencyMode] = useState<"interval" | "weekly">(
    "interval",
  );
  const [timesPerWeek, setTimesPerWeek] = useState<number>(1);

  const defaultFormState = {
    title: "",
    task_type: "Watering",
    trigger_event: "Planted",
    start_reference: "Trigger Date",
    start_offset_days: 0,
    end_reference: "Ongoing",
    end_offset_days: 0,
    frequency_days: 7,
    apply_to_existing: false,
  };

  const [form, setForm] = useState(defaultFormState);

  useEffect(() => {
    fetchSchedules();
    fetchHomeData();
  }, [plant.id, homeId]);

  useEffect(() => {
    if (frequencyMode === "weekly") {
      const days = Math.max(1, Math.round(7 / timesPerWeek));
      setForm((prev) => ({ ...prev, frequency_days: days }));
    }
  }, [timesPerWeek, frequencyMode]);

  const fetchHomeData = async () => {
    try {
      const { data, error } = await supabase
        .from("homes")
        .select("*")
        .eq("id", homeId)
        .single();
      if (error) throw error;
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

  const normalizePeriods = (input: any): string[] => {
    if (!input) return [];
    if (Array.isArray(input)) return input.flatMap((i) => normalizePeriods(i));
    if (typeof input === "string") {
      return input
        .split(/,|\band\b|&/i)
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return [];
  };

  const getSinglePeriodRange = (
    period: string,
    hemisphere: "northern" | "southern",
  ) => {
    const p = period.toLowerCase();
    if (p.includes("jan")) return { start: "01-01", end: "01-31" };
    if (p.includes("feb")) return { start: "02-01", end: "02-28" };
    if (p.includes("mar")) return { start: "03-01", end: "03-31" };
    if (p.includes("apr")) return { start: "04-01", end: "04-30" };
    if (p.includes("may")) return { start: "05-01", end: "05-31" };
    if (p.includes("jun")) return { start: "06-01", end: "06-30" };
    if (p.includes("jul")) return { start: "07-01", end: "07-31" };
    if (p.includes("aug")) return { start: "08-01", end: "08-31" };
    if (p.includes("sep")) return { start: "09-01", end: "09-30" };
    if (p.includes("oct")) return { start: "10-01", end: "10-31" };
    if (p.includes("nov")) return { start: "11-01", end: "11-30" };
    if (p.includes("dec")) return { start: "12-01", end: "12-31" };
    if (p.includes("spring"))
      return hemisphere === "northern"
        ? { start: "03-01", end: "05-31" }
        : { start: "09-01", end: "11-30" };
    if (p.includes("summer"))
      return hemisphere === "northern"
        ? { start: "06-01", end: "08-31" }
        : { start: "12-01", end: "02-28" };
    if (p.includes("fall") || p.includes("autumn"))
      return hemisphere === "northern"
        ? { start: "09-01", end: "11-30" }
        : { start: "03-01", end: "05-31" };
    if (p.includes("winter"))
      return hemisphere === "northern"
        ? { start: "12-01", end: "02-28" }
        : { start: "06-01", end: "08-31" };
    return { start: "01-01", end: "12-31" };
  };

  const formatMonthDay = (md: string) => {
    if (!md) return "";
    const [m, d] = md.split("-");
    const date = new Date(2024, parseInt(m) - 1, parseInt(d));
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const buildReferenceOptions = () => {
    const options = [{ label: "Trigger Date", value: "Trigger Date" }];
    const hemisphere = getHemisphere(homeData?.country, homeData?.timezone);

    SEASONAL_EVENTS_CONFIG.forEach(({ dbKey, eventName }) => {
      const rawData = plant[dbKey];
      if (!rawData) return;

      const periods = normalizePeriods(rawData);
      periods.forEach((p) => {
        const nicePeriod = p.charAt(0).toUpperCase() + p.slice(1);
        const { start, end } = getSinglePeriodRange(p, hemisphere);
        const startContext = `${nicePeriod} ${eventName} Start`;
        const endContext = `${nicePeriod} ${eventName} End`;

        options.push({
          label: `${startContext} (${formatMonthDay(start)})`,
          value: `Seasonal:${start}:${startContext}`,
        });
        options.push({
          label: `${endContext} (${formatMonthDay(end)})`,
          value: `Seasonal:${end}:${endContext}`,
        });
      });
    });

    if (
      form.start_reference?.startsWith("Seasonal:") &&
      !options.find((o) => o.value === form.start_reference)
    ) {
      const parts = form.start_reference.split(":");
      const datePart =
        parts[1]?.trim() ||
        form.start_reference.replace("Seasonal:", "").trim();
      const contextPart = parts[2] ? ` (${parts[2]})` : "";
      options.push({
        label: `Custom Date ${contextPart} (${formatMonthDay(datePart)})`,
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

  const getDatesForBlueprint = (
    startRef: string | null,
    startOffset: number,
    endRef: string | null,
    endOffset: number,
    freqDays: number,
    plantedAtStr: string,
    plantCycle: string | null,
    targetYear: number,
  ) => {
    const parseSafeDate = (d: string) => new Date(`${d}T12:00:00Z`).getTime();
    const formatSafeDate = (ms: number) =>
      new Date(ms).toISOString().split("T")[0];

    let startMs = parseSafeDate(plantedAtStr);

    if (startRef?.startsWith("Seasonal:")) {
      const mmdd = startRef.split(":")[1].trim();
      startMs = parseSafeDate(`${targetYear}-${mmdd}`);
    }
    startMs += startOffset * 24 * 60 * 60 * 1000;

    let endStr: string | null = null;
    let endMs: number | null = null;

    if (endRef && endRef !== "Ongoing") {
      endMs = parseSafeDate(plantedAtStr);
      if (endRef.startsWith("Seasonal:")) {
        const mmdd = endRef.split(":")[1].trim();
        endMs = parseSafeDate(`${targetYear}-${mmdd}`);

        if (startRef?.startsWith("Seasonal:") && endMs < startMs) {
          endMs += 365 * 24 * 60 * 60 * 1000;
        }
      }
      endMs += endOffset * 24 * 60 * 60 * 1000;
    }

    let absoluteMaxEndMs: number | null = null;
    if (plantCycle) {
      const cycleStr = plantCycle.toLowerCase();
      const plantedMs = parseSafeDate(plantedAtStr);

      if (cycleStr.includes("annual")) {
        absoluteMaxEndMs = plantedMs + 365 * 24 * 60 * 60 * 1000;
      } else if (cycleStr.includes("biennial")) {
        absoluteMaxEndMs = plantedMs + 730 * 24 * 60 * 60 * 1000;
      }
    }

    if (absoluteMaxEndMs) {
      if (!endMs || endMs > absoluteMaxEndMs) {
        endMs = absoluteMaxEndMs;
      }
      if (startMs > absoluteMaxEndMs) {
        return { start_date: null, end_date: null };
      }
    }

    if (endMs) {
      endStr = formatSafeDate(endMs);
    }

    const plantedMs = parseSafeDate(plantedAtStr);
    const todayMs = parseSafeDate(new Date().toISOString().split("T")[0]);
    const floorMs = Math.max(plantedMs, todayMs);

    if (startMs < floorMs) {
      const freqMs = Math.max(1, freqDays) * 24 * 60 * 60 * 1000;
      const periods = Math.ceil((floorMs - startMs) / freqMs);
      startMs += periods * freqMs;
    }

    return {
      start_date: formatSafeDate(startMs),
      end_date: endStr,
    };
  };

  const handleAutoGenerate = async () => {
    setSaving(true);
    toast.loading("Analyzing Seasons & Generating Schedules...", {
      id: "generate",
    });

    try {
      const hemisphere = getHemisphere(homeData?.country, homeData?.timezone);
      const newSchedules: any[] = [];

      const harvestPeriods = normalizePeriods(plant.harvest_season);
      harvestPeriods.forEach((period) => {
        const { start, end } = getSinglePeriodRange(period, hemisphere);
        const niceTitle = period.charAt(0).toUpperCase() + period.slice(1);
        newSchedules.push({
          home_id: homeId,
          plant_id: plant.id,
          title: `${niceTitle} Harvest`,
          description: `Auto-generated from Care Guide`,
          task_type: "Harvesting",
          trigger_event: "Planted",
          start_reference: `Seasonal:${start}:${niceTitle} Harvest Start`,
          start_offset_days: 0,
          end_reference: `Seasonal:${end}:${niceTitle} Harvest End`,
          end_offset_days: 0,
          frequency_days: 1,
          is_recurring: true,
          is_auto_generated: true,
        });
      });

      const pruningPeriods = normalizePeriods(plant.pruning_month);
      pruningPeriods.forEach((period) => {
        const { start, end } = getSinglePeriodRange(period, hemisphere);
        const niceTitle = period.charAt(0).toUpperCase() + period.slice(1);
        newSchedules.push({
          home_id: homeId,
          plant_id: plant.id,
          title: `${niceTitle} Pruning`,
          description: `Auto-generated from Care Guide`,
          task_type: "Maintenance",
          trigger_event: "Planted",
          start_reference: `Seasonal:${start}:${niceTitle} Pruning Start`,
          start_offset_days: 0,
          end_reference: `Seasonal:${end}:${niceTitle} Pruning End`,
          end_offset_days: 0,
          frequency_days: 1,
          is_recurring: true,
          is_auto_generated: true,
        });
      });

      const minWatering = plant.watering_min_days || 3;
      const maxWatering = plant.watering_max_days || 14;
      const avgWatering = Math.max(
        1,
        Math.round((minWatering + maxWatering) / 2),
      );

      const summerDates = getSinglePeriodRange("summer", hemisphere);
      const winterDates = getSinglePeriodRange("winter", hemisphere);
      const springDates = getSinglePeriodRange("spring", hemisphere);
      const fallDates = getSinglePeriodRange("fall", hemisphere);

      newSchedules.push({
        home_id: homeId,
        plant_id: plant.id,
        title: `Summer Watering`,
        description: `Auto-generated high-frequency watering`,
        task_type: "Watering",
        trigger_event: "Planted",
        start_reference: `Seasonal:${summerDates.start}:Summer Start`,
        start_offset_days: 0,
        end_reference: `Seasonal:${summerDates.end}:Summer End`,
        end_offset_days: 0,
        frequency_days: minWatering,
        is_recurring: true,
        is_auto_generated: true,
      });

      newSchedules.push({
        home_id: homeId,
        plant_id: plant.id,
        title: `Winter Watering`,
        description: `Auto-generated low-frequency watering`,
        task_type: "Watering",
        trigger_event: "Planted",
        start_reference: `Seasonal:${winterDates.start}:Winter Start`,
        start_offset_days: 0,
        end_reference: `Seasonal:${winterDates.end}:Winter End`,
        end_offset_days: 0,
        frequency_days: maxWatering,
        is_recurring: true,
        is_auto_generated: true,
      });

      newSchedules.push({
        home_id: homeId,
        plant_id: plant.id,
        title: `Spring Watering`,
        description: `Auto-generated moderate watering`,
        task_type: "Watering",
        trigger_event: "Planted",
        start_reference: `Seasonal:${springDates.start}:Spring Start`,
        start_offset_days: 0,
        end_reference: `Seasonal:${springDates.end}:Spring End`,
        end_offset_days: 0,
        frequency_days: avgWatering,
        is_recurring: true,
        is_auto_generated: true,
      });

      newSchedules.push({
        home_id: homeId,
        plant_id: plant.id,
        title: `Autumn Watering`,
        description: `Auto-generated moderate watering`,
        task_type: "Watering",
        trigger_event: "Planted",
        start_reference: `Seasonal:${fallDates.start}:Autumn Start`,
        start_offset_days: 0,
        end_reference: `Seasonal:${fallDates.end}:Autumn End`,
        end_offset_days: 0,
        frequency_days: avgWatering,
        is_recurring: true,
        is_auto_generated: true,
      });

      const incomingTaskTypes = [
        ...new Set(newSchedules.map((s) => s.task_type)),
      ];
      const { error: delSchedErr } = await supabase
        .from("plant_schedules")
        .delete()
        .eq("plant_id", plant.id)
        .in("task_type", incomingTaskTypes)
        .eq("is_auto_generated", true);
      if (delSchedErr) throw delSchedErr;

      const { data: insertedSchedules, error: insertError } = await supabase
        .from("plant_schedules")
        .insert(newSchedules)
        .select();
      if (insertError) throw insertError;

      const { data: existingPlants, error: exPlantErr } = await supabase
        .from("inventory_items")
        .select("id, location_id, area_id, planted_at")
        .eq("home_id", homeId)
        .eq("plant_id", plant.id)
        .eq("status", "Planted");
      if (exPlantErr) throw exPlantErr;

      if (existingPlants && existingPlants.length > 0 && insertedSchedules) {
        toast.dismiss("generate");
        setPendingGeneratedSchedules(insertedSchedules);
      } else {
        toast.success("Seasonal schedules safely generated!", {
          id: "generate",
        });
        fetchSchedules();
      }
    } catch (err: any) {
      Logger.error("Failed to auto-generate", err);
      toast.error(`Generation failed: ${err.message}`, { id: "generate" });
    } finally {
      if (!pendingGeneratedSchedules) setSaving(false);
    }
  };

  const applyGeneratedSchedulesToPlants = async () => {
    if (!pendingGeneratedSchedules) return;
    setIsAdding(false);
    toast.loading("Applying schedules to active plants...", { id: "sync" });

    try {
      const { data: existingPlants } = await supabase
        .from("inventory_items")
        .select("id, location_id, area_id, planted_at")
        .eq("home_id", homeId)
        .eq("plant_id", plant.id)
        .eq("status", "Planted");
      if (!existingPlants) throw new Error("No active plants found.");

      const existingPlantIds = existingPlants.map((p) => p.id);
      const incomingTaskTypes = [
        ...new Set(pendingGeneratedSchedules.map((s) => s.task_type)),
      ];

      const { error: delBpErr } = await supabase
        .from("task_blueprints")
        .delete()
        .in("inventory_item_id", existingPlantIds)
        .in("task_type", incomingTaskTypes)
        .eq("is_auto_generated", true);
      if (delBpErr) throw delBpErr;

      const blueprintsToCreate: any[] = [];
      const todayStr = new Date().toISOString().split("T")[0];
      const currentYear = new Date().getFullYear();

      for (const p of existingPlants) {
        const plantedAtStr = p.planted_at
          ? p.planted_at.split("T")[0]
          : todayStr;

        for (const s of pendingGeneratedSchedules) {
          const { start_date, end_date } = getDatesForBlueprint(
            s.start_reference,
            s.start_offset_days,
            s.end_reference,
            s.end_offset_days,
            s.frequency_days,
            plantedAtStr,
            plant.cycle,
            currentYear,
          );

          if (!start_date) continue;
          if (end_date && start_date > end_date) continue;

          const cycleStr = (plant.cycle || "").toLowerCase();
          const isPerennial =
            cycleStr.includes("perennial") || cycleStr.includes("biennial");
          if (
            end_date &&
            new Date(end_date).getTime() < new Date(todayStr).getTime()
          ) {
            if (!isPerennial) continue;
          }

          blueprintsToCreate.push({
            home_id: homeId,
            title: s.title,
            task_type: s.task_type,
            location_id: p.location_id,
            area_id: p.area_id,
            inventory_item_id: p.id,
            frequency_days: s.frequency_days,
            is_recurring: true,
            is_auto_generated: true,
            start_date: start_date,
            end_date: end_date,
          });
        }
      }

      if (blueprintsToCreate.length > 0) {
        // 🚀 THE FIX: Fetch start_date along with ID so we can evaluate if it should trigger the Edge Function!
        const { data: createdBps, error: crBpErr } = await supabase
          .from("task_blueprints")
          .insert(blueprintsToCreate)
          .select("id, start_date");
        if (crBpErr) throw crBpErr;

        if (createdBps) {
          // 🚀 THE SHIELD: Only wake up the Edge Function if the blueprint starts today or earlier.
          const activeBps = createdBps.filter(
            (bp) => bp.start_date <= todayStr,
          );

          if (activeBps.length > 0) {
            await Promise.all(
              activeBps.map((bp) =>
                supabase.functions.invoke("generate-tasks", {
                  body: { blueprint_id: bp.id },
                }),
              ),
            );
          }
        }
      }

      toast.success("Schedules updated & synced beautifully!", { id: "sync" });
    } catch (err: any) {
      toast.error("Sync failed: " + err.message, { id: "sync" });
    } finally {
      setPendingGeneratedSchedules(null);
      setSaving(false);
      fetchSchedules();
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

    if (
      schedule.frequency_days > 0 &&
      schedule.frequency_days <= 7 &&
      (7 % schedule.frequency_days === 0 || schedule.frequency_days === 3)
    ) {
      setFrequencyMode("weekly");
      setTimesPerWeek(Math.max(1, Math.round(7 / schedule.frequency_days)));
    } else {
      setFrequencyMode("interval");
    }
    setEditingId(schedule.id);
    setIsAdding(true);
  };

  const closeForm = () => {
    setIsAdding(false);
    setEditingId(null);
    setForm(defaultFormState);
    setFrequencyMode("interval");
    setTimesPerWeek(1);
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
        is_auto_generated: false,
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
        toast.success("Custom schedule saved!");
      }

      if (form.apply_to_existing && newSchedule) {
        toast.loading("Applying to existing active plants...", {
          id: "apply-sync",
        });
        const { data: existingPlants, error: exPlantErr } = await supabase
          .from("inventory_items")
          .select("id, location_id, area_id, planted_at")
          .eq("home_id", homeId)
          .eq("plant_id", plant.id)
          .eq("status", form.trigger_event);
        if (exPlantErr) throw exPlantErr;

        if (existingPlants && existingPlants.length > 0) {
          const existingPlantIds = existingPlants.map((p) => p.id);
          const { error: delBpErr } = await supabase
            .from("task_blueprints")
            .delete()
            .in("inventory_item_id", existingPlantIds)
            .eq("task_type", newSchedule.task_type)
            .eq("is_auto_generated", false);
          if (delBpErr) throw delBpErr;

          const blueprintsToCreate: any[] = [];
          const todayStr = new Date().toISOString().split("T")[0];
          const currentYear = new Date().getFullYear();

          for (const p of existingPlants) {
            const plantedAtStr = p.planted_at
              ? p.planted_at.split("T")[0]
              : todayStr;
            const { start_date, end_date } = getDatesForBlueprint(
              newSchedule.start_reference,
              newSchedule.start_offset_days,
              newSchedule.end_reference,
              newSchedule.end_offset_days,
              newSchedule.frequency_days,
              plantedAtStr,
              plant.cycle,
              currentYear,
            );

            if (!start_date) continue;
            if (end_date && start_date > end_date) continue;

            blueprintsToCreate.push({
              home_id: homeId,
              title: newSchedule.title,
              task_type: newSchedule.task_type,
              location_id: p.location_id,
              area_id: p.area_id,
              inventory_item_id: p.id,
              frequency_days: newSchedule.frequency_days,
              is_recurring: true,
              is_auto_generated: false,
              start_date: start_date,
              end_date: end_date,
            });
          }

          if (blueprintsToCreate.length > 0) {
            // 🚀 THE FIX: Fetch start_date
            const { data: createdBps, error: crBpErr } = await supabase
              .from("task_blueprints")
              .insert(blueprintsToCreate)
              .select("id, start_date");
            if (crBpErr) throw crBpErr;

            if (createdBps) {
              // 🚀 THE SHIELD
              const activeBps = createdBps.filter(
                (bp) => bp.start_date <= todayStr,
              );
              if (activeBps.length > 0) {
                await Promise.all(
                  activeBps.map((bp) =>
                    supabase.functions.invoke("generate-tasks", {
                      body: { blueprint_id: bp.id },
                    }),
                  ),
                );
              }
            }
          }
        }
        toast.success("Schedule applied!", { id: "apply-sync" });
      }

      closeForm();
      fetchSchedules();
    } catch (err: any) {
      Logger.error("Failed to save schedule", err);
      toast.error(`Failed to save: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const deleteSchedule = async (id: string) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("plant_schedules")
        .delete()
        .eq("id", id);
      if (error) throw error;
      setSchedules(schedules.filter((s) => s.id !== id));
      toast.success("Schedule deleted");
    } catch (err: any) {
      toast.error(`Failed to delete: ${err.message}`);
    } finally {
      setSaving(false);
      setConfirmDeleteId(null);
    }
  };

  const parseReferenceString = (ref: string, offset: number) => {
    if (!ref) return "Trigger Date";
    if (ref.startsWith("Seasonal:")) {
      const parts = ref.split(":");
      if (parts.length >= 3) {
        const dateStr = formatMonthDay(parts[1]);
        return `${offset > 0 ? `${offset} days after ` : "on "}${dateStr} (${parts[2]})`;
      } else {
        const dateStr = formatMonthDay(ref.replace("Seasonal:", "").trim());
        return `${offset > 0 ? `${offset} days after ` : "on "}${dateStr}`;
      }
    }
    return `${offset > 0 ? `${offset} days after ` : "on the "}${ref}`;
  };

  if (loading)
    return (
      <div className="flex justify-center p-10">
        <Loader2 className="animate-spin text-rhozly-primary" />
      </div>
    );

  const renderForm = () => (
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
            onChange={(e) => setForm({ ...form, task_type: e.target.value })}
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

      <div className="bg-rhozly-primary/5 p-5 rounded-2xl border border-rhozly-primary/10 space-y-5">
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
              className="flex-1 p-3 bg-white rounded-xl font-bold outline-none text-sm shadow-sm truncate"
            >
              {dynamicOptions.map((o, idx) => (
                <option key={`${o.value}-${idx}`} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

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
              className="flex-1 p-3 bg-white rounded-xl font-bold outline-none text-sm shadow-sm truncate"
            >
              {endOptions.map((o, idx) => (
                <option key={`${o.value}-${idx}`} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <hr className="border-rhozly-primary/10" />

        <div className="flex flex-col sm:flex-row sm:items-start gap-3">
          <span className="font-black text-rhozly-on-surface w-16 mt-3">
            REPEAT
          </span>
          <div className="flex-1 space-y-3">
            <div className="flex gap-2">
              <button
                onClick={() => setFrequencyMode("interval")}
                className={`flex-1 py-2 text-xs font-black uppercase rounded-lg border transition-all ${frequencyMode === "interval" ? "bg-white border-rhozly-primary text-rhozly-primary shadow-sm" : "border-transparent text-rhozly-on-surface/50"}`}
              >
                Every X Days
              </button>
              <button
                onClick={() => setFrequencyMode("weekly")}
                className={`flex-1 py-2 text-xs font-black uppercase rounded-lg border transition-all ${frequencyMode === "weekly" ? "bg-white border-rhozly-primary text-rhozly-primary shadow-sm" : "border-transparent text-rhozly-on-surface/50"}`}
              >
                Times Per Week
              </button>
            </div>

            <div className="flex items-center gap-2">
              {frequencyMode === "interval" ? (
                <>
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
                </>
              ) : (
                <>
                  <input
                    type="number"
                    min="1"
                    max="7"
                    value={timesPerWeek}
                    onChange={(e) =>
                      setTimesPerWeek(parseInt(e.target.value) || 1)
                    }
                    className="w-20 p-3 bg-white rounded-xl font-bold outline-none text-center shadow-sm"
                  />
                  <span className="font-bold text-sm text-rhozly-on-surface/60">
                    times a week
                  </span>
                  <span className="text-xs font-black text-rhozly-primary/50 ml-auto uppercase tracking-widest hidden sm:block">
                    (Spaces tasks ~{form.frequency_days} days apart)
                  </span>
                </>
              )}
            </div>
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
            Will overwrite conflicting tasks for items marked as "
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
            <Save size={18} /> {editingId ? "Save Changes" : "Save Custom Rule"}
          </>
        )}
      </button>
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in relative">
      <ConfirmModal
        isOpen={pendingGeneratedSchedules !== null}
        isLoading={saving}
        onClose={() => {
          setPendingGeneratedSchedules(null);
          setSaving(false);
          fetchSchedules();
        }}
        onConfirm={applyGeneratedSchedulesToPlants}
        title="Sync Active Plants?"
        description="We successfully generated the new schedules! We found some active planted instances of this plant in your garden. Would you like to overwrite their tasks with these new rules?"
        confirmText="Sync Active Plants"
        isDestructive={false}
      />

      {confirmDeleteId && (
        <ConfirmModal
          isOpen={confirmDeleteId !== null}
          isLoading={saving}
          onClose={() => setConfirmDeleteId(null)}
          onConfirm={() => deleteSchedule(confirmDeleteId)}
          title="Delete Automation"
          description="Are you sure you want to permanently delete this schedule template?"
          confirmText="Delete"
          isDestructive={true}
        />
      )}

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

      {isAdding && !editingId && renderForm()}

      <div className="space-y-3">
        {schedules.length === 0 && !isAdding ? (
          <div className="text-center p-8 border-2 border-dashed border-rhozly-outline/20 rounded-3xl opacity-50">
            <Clock className="mx-auto mb-2" size={24} />
            <p className="font-bold text-sm">No schedules created yet.</p>
          </div>
        ) : (
          schedules.map((schedule) => (
            <React.Fragment key={schedule.id}>
              {editingId === schedule.id ? (
                <div className="animate-in fade-in zoom-in-95 duration-200">
                  {renderForm()}
                </div>
              ) : (
                <div className="bg-white p-4 sm:p-5 rounded-2xl border border-rhozly-outline/10 shadow-sm flex items-start sm:items-center justify-between gap-4">
                  <div className="min-w-0 pr-4">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="text-[9px] font-black uppercase tracking-widest bg-rhozly-primary/10 text-rhozly-primary px-2 py-1 rounded-md">
                        {schedule.task_type}
                      </span>
                      {schedule.is_auto_generated ? (
                        <span className="text-[9px] font-black uppercase tracking-widest bg-purple-100 text-purple-700 px-2 py-1 rounded-md">
                          Auto
                        </span>
                      ) : (
                        <span className="text-[9px] font-black uppercase tracking-widest bg-blue-100 text-blue-700 px-2 py-1 rounded-md">
                          Custom
                        </span>
                      )}
                      <span className="text-[9px] font-black uppercase tracking-widest bg-gray-100 text-gray-500 px-2 py-1 rounded-md">
                        When {schedule.trigger_event}
                      </span>
                    </div>
                    <h4 className="font-black text-lg text-rhozly-on-surface mb-1 truncate">
                      {schedule.title}
                    </h4>
                    <div className="text-xs font-bold text-rhozly-on-surface/60 space-y-0.5">
                      <p className="truncate">
                        🟢 Starts{" "}
                        {parseReferenceString(
                          schedule.start_reference,
                          schedule.start_offset_days,
                        )}
                      </p>
                      {schedule.end_reference && (
                        <p className="truncate">
                          🔴 Ends{" "}
                          {parseReferenceString(
                            schedule.end_reference,
                            schedule.end_offset_days,
                          )}
                        </p>
                      )}
                      <p>
                        🔄 Repeats every {schedule.frequency_days} day(s){" "}
                        <span className="opacity-50">
                          (
                          {Math.max(1, Math.round(7 / schedule.frequency_days))}
                          x per week)
                        </span>
                      </p>
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
                      onClick={() => setConfirmDeleteId(schedule.id)}
                      className="p-3 text-red-500/80 hover:text-red-600 hover:bg-red-50 bg-rhozly-surface-lowest rounded-xl transition-all shadow-sm"
                      title="Delete Schedule"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              )}
            </React.Fragment>
          ))
        )}
      </div>
    </div>
  );
}
