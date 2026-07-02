import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, CalendarPlus, AlertCircle, Check } from "lucide-react";
import toast from "react-hot-toast";
import { supabase } from "../lib/supabase";
import { Logger } from "../lib/errorHandler";
import { BlueprintService } from "../services/blueprintService";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { buildBlueprintFromSchedule } from "../lib/plantScheduleGenerator";
import { getLocalDateString } from "../lib/taskEngine";

interface Schedule {
  id: string;
  title: string;
  task_type: string;
  trigger_event: string;
  start_reference: string | null;
  start_offset_days: number | null;
  end_reference: string | null;
  end_offset_days: number | null;
  frequency_days: number;
}

interface InventoryOption {
  id: string;
  status: string;
  area_id: string | null;
  area_name: string | null;
  location_id: string | null;
  location_name: string | null;
  planted_at: string | null;
}

interface Props {
  homeId: string;
  plant: any;
  schedule: Schedule;
  onClose: () => void;
  onGenerated: () => void;
}

const isoToday = () => getLocalDateString(new Date());

/**
 * Lets the user generate tasks from a single plant_schedules row by
 * mocking the trigger date. Useful when the plant has been planted
 * mentally but hasn't been placed in an area yet — they still want
 * watering / pruning reminders to start counting.
 *
 * Optional knobs:
 *   - Attach to specific inventory items (defaults to free-floating).
 *   - Cap the number of materialised tasks (defaults to whatever the
 *     blueprint's start/end window allows).
 */
export default function PlantScheduleGenerateTasksModal({
  homeId,
  plant,
  schedule,
  onClose,
  onGenerated,
}: Props) {
  const trapRef = useFocusTrap<HTMLDivElement>(true);

  const [triggerDate, setTriggerDate] = useState(isoToday);
  const [inventoryItems, setInventoryItems] = useState<InventoryOption[]>([]);
  const [selectedInventoryIds, setSelectedInventoryIds] = useState<string[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(true);
  const [capEnabled, setCapEnabled] = useState(false);
  const [capValue, setCapValue] = useState(5);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load inventory items for this plant — both planted + unassigned —
  // so the user can optionally pin the new blueprint to specific
  // instances they already have.
  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();
    (async () => {
      try {
        const { data, error: invErr } = await supabase
          .from("inventory_items")
          .select(`
            id, status, area_id, location_id, planted_at,
            areas(name),
            locations(name)
          `)
          .eq("home_id", homeId)
          .eq("plant_id", plant.id)
          .in("status", ["Planted", "Unplanted", "Pending"])
          .order("planted_at", { ascending: false, nullsFirst: false })
          .abortSignal(ac.signal);
        if (cancelled) return;
        if (invErr) throw invErr;
        const mapped: InventoryOption[] = (data ?? []).map((row: any) => ({
          id: row.id,
          status: row.status,
          area_id: row.area_id ?? null,
          area_name: row.areas?.name ?? null,
          location_id: row.location_id ?? null,
          location_name: row.locations?.name ?? null,
          planted_at: row.planted_at ?? null,
        }));
        setInventoryItems(mapped);
      } catch (err: any) {
        if (cancelled || err?.name === "AbortError") return;
        Logger.error("Failed to load inventory for generate tasks", err);
      } finally {
        if (!cancelled) setLoadingInventory(false);
      }
    })();
    return () => { cancelled = true; ac.abort(); };
  }, [homeId, plant.id]);

  const triggerYear = useMemo(() => {
    const [y] = triggerDate.split("-");
    const parsed = parseInt(y, 10);
    return Number.isFinite(parsed) ? parsed : new Date().getFullYear();
  }, [triggerDate]);

  const { start_date, end_date } = useMemo(() => {
    return buildBlueprintFromSchedule({
      schedule: {
        start_reference: schedule.start_reference,
        start_offset_days: schedule.start_offset_days,
        end_reference: schedule.end_reference,
        end_offset_days: schedule.end_offset_days,
        frequency_days: schedule.frequency_days,
      },
      triggerDateStr: triggerDate,
      plantCycle: plant.cycle ?? null,
      targetYear: triggerYear,
    });
  }, [schedule, triggerDate, plant.cycle, triggerYear]);

  const toggleInventoryItem = (id: string) => {
    setSelectedInventoryIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleGenerate = async () => {
    if (!start_date) {
      setError("This schedule produces no tasks for the chosen trigger date — the start would fall past the plant's lifecycle cap.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      // Inherit area / location from the first selected inventory item
      // when one is attached, so the blueprint shows up on the right
      // garden surface.
      const firstAttached = selectedInventoryIds[0]
        ? inventoryItems.find((i) => i.id === selectedInventoryIds[0]) ?? null
        : null;

      // If the user enabled the occurrence cap, override the computed
      // end_date so only N tasks fire. freq_days * (cap-1) days after
      // start_date.
      let effectiveEndDate = end_date;
      if (capEnabled && capValue > 0) {
        const freqDays = Math.max(1, schedule.frequency_days || 1);
        const startMs = new Date(`${start_date}T12:00:00Z`).getTime();
        const cappedMs = startMs + (capValue - 1) * freqDays * 24 * 60 * 60 * 1000;
        const cappedStr = new Date(cappedMs).toISOString().split("T")[0];
        // Pick whichever is earlier — the lifecycle cap or the requested cap.
        effectiveEndDate = !effectiveEndDate || cappedStr < effectiveEndDate
          ? cappedStr
          : effectiveEndDate;
      }

      const { data: created, error: insertErr } = await supabase
        .from("task_blueprints")
        .insert({
          home_id: homeId,
          title: schedule.title,
          task_type: schedule.task_type,
          location_id: firstAttached?.location_id ?? null,
          area_id: firstAttached?.area_id ?? null,
          inventory_item_ids: selectedInventoryIds.length > 0 ? selectedInventoryIds : [],
          frequency_days: schedule.frequency_days,
          is_recurring: true,
          is_auto_generated: false,
          start_date,
          end_date: effectiveEndDate,
        })
        .select("id, start_date")
        .single();
      if (insertErr) throw insertErr;

      // If the blueprint's start is today or in the past, materialise
      // the first task immediately so it shows up on the calendar.
      // Future-dated blueprints will be picked up by the ghost engine
      // when the day arrives.
      const today = isoToday();
      if (created?.start_date && created.start_date <= today) {
        await BlueprintService.generateBlueprintTasks(created.id);
      }

      toast.success(
        `Tasks generated for "${schedule.title}" from ${triggerDate}.`,
      );
      onGenerated();
    } catch (err: any) {
      const message = err?.message ?? "Failed to generate tasks.";
      Logger.error("Failed to generate tasks from schedule", err, {
        schedule_id: schedule.id,
      });
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-label="Generate tasks from schedule"
        className="relative w-full sm:w-[calc(100vw-2rem)] sm:max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-xl max-h-[92vh] overflow-y-auto"
        data-testid="schedule-generate-tasks-modal"
      >
        {/* Header */}
        <div className="sticky top-0 bg-white/95 backdrop-blur-sm z-10 flex items-center justify-between px-6 pt-6 pb-4 border-b border-rhozly-outline/10">
          <div className="min-w-0">
            <h2 className="font-black text-rhozly-on-surface text-lg truncate">
              Generate Tasks
            </h2>
            <p className="text-xs font-bold text-rhozly-on-surface/55 truncate">
              from "{schedule.title}" ({schedule.task_type})
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-xl hover:bg-rhozly-surface transition-colors shrink-0"
          >
            <X size={20} className="text-rhozly-on-surface/60" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* Trigger date */}
          <div>
            <label
              htmlFor="generate-trigger-date"
              className="block text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/55 mb-2"
            >
              Trigger date
            </label>
            <input
              id="generate-trigger-date"
              type="date"
              value={triggerDate}
              onChange={(e) => setTriggerDate(e.target.value)}
              data-testid="generate-trigger-date"
              className="w-full px-4 py-3 rounded-2xl border border-rhozly-outline/30 bg-white text-rhozly-on-surface focus:outline-none focus:border-rhozly-primary text-sm"
            />
            <p className="text-[11px] text-rhozly-on-surface-variant mt-2 leading-relaxed">
              Pretend the plant's "{schedule.trigger_event}" event happened on
              this date — useful when you've planted the plant but haven't
              placed it in an area yet.
            </p>
          </div>

          {/* Computed preview */}
          <div className="rounded-2xl border border-rhozly-primary/20 bg-rhozly-primary/5 p-4 space-y-1.5 text-xs font-bold">
            {start_date ? (
              <>
                <p className="text-rhozly-on-surface/80">
                  🟢 First task: <span className="text-rhozly-primary font-black">{start_date}</span>
                </p>
                <p className="text-rhozly-on-surface/80">
                  🔴 Last task:{" "}
                  <span className="text-rhozly-primary font-black">
                    {end_date ?? "ongoing"}
                  </span>
                </p>
                <p className="text-rhozly-on-surface/80">
                  🔄 Every {schedule.frequency_days} day(s)
                </p>
              </>
            ) : (
              <p className="text-amber-700">
                Cannot generate tasks — the computed start date falls past the
                plant's lifecycle cap. Try an earlier trigger date.
              </p>
            )}
          </div>

          {/* Inventory selector */}
          <div>
            <p className="block text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/55 mb-2">
              Attach to inventory items <span className="opacity-50 normal-case tracking-normal">(optional)</span>
            </p>
            {loadingInventory ? (
              <div className="flex items-center gap-2 py-3 text-xs text-rhozly-on-surface-variant">
                <Loader2 size={14} className="animate-spin" />
                Loading instances…
              </div>
            ) : inventoryItems.length === 0 ? (
              <p className="text-xs text-rhozly-on-surface-variant italic">
                No active instances of this plant. The blueprint will be created
                without any linked items — you can attach them later.
              </p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {inventoryItems.map((item) => {
                  const checked = selectedInventoryIds.includes(item.id);
                  const breadcrumb = [item.location_name, item.area_name]
                    .filter(Boolean)
                    .join(" › ");
                  return (
                    <label
                      key={item.id}
                      className="flex items-center gap-3 p-2.5 rounded-2xl border border-rhozly-outline/15 cursor-pointer hover:bg-rhozly-surface transition-colors"
                      data-testid={`generate-inventory-${item.id}`}
                    >
                      <div
                        className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors shrink-0 ${
                          checked
                            ? "bg-rhozly-primary border-rhozly-primary"
                            : "border-rhozly-outline/40 bg-white"
                        }`}
                        onClick={(e) => { e.preventDefault(); toggleInventoryItem(item.id); }}
                      >
                        {checked && <Check size={12} className="text-white" />}
                      </div>
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={checked}
                        onChange={() => toggleInventoryItem(item.id)}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-rhozly-on-surface truncate">
                          {item.status} instance · {item.id.slice(0, 8)}
                        </p>
                        {breadcrumb && (
                          <p className="text-[11px] text-rhozly-on-surface-variant truncate">
                            {breadcrumb}
                          </p>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Cap occurrences */}
          <div>
            <label
              className="flex items-center gap-3 cursor-pointer"
              data-testid="generate-cap-toggle"
            >
              <input
                type="checkbox"
                checked={capEnabled}
                onChange={(e) => setCapEnabled(e.target.checked)}
                className="w-4 h-4 accent-rhozly-primary"
              />
              <div>
                <p className="text-sm font-semibold text-rhozly-on-surface">
                  Stop after a set number of tasks
                </p>
                <p className="text-[11px] text-rhozly-on-surface-variant">
                  Useful for previewing a schedule before letting it run open-ended.
                </p>
              </div>
            </label>
            {capEnabled && (
              <div className="mt-2 ml-7 flex items-center gap-3">
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={capValue}
                  onChange={(e) => setCapValue(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  data-testid="generate-cap-value"
                  className="w-24 px-3 py-2 rounded-xl border border-rhozly-outline/30 bg-white text-rhozly-on-surface focus:outline-none focus:border-rhozly-primary text-sm"
                />
                <span className="text-xs text-rhozly-on-surface-variant">tasks total</span>
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-2xl bg-red-50 border border-red-100">
              <AlertCircle size={15} className="text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 py-3 rounded-2xl border border-rhozly-outline/20 text-rhozly-on-surface font-bold hover:bg-rhozly-surface transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={saving || !start_date}
              data-testid="generate-tasks-confirm"
              className="flex-[2] inline-flex items-center justify-center gap-2 py-3 rounded-2xl bg-rhozly-primary text-white font-black shadow-lg hover:bg-rhozly-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <CalendarPlus size={16} />}
              {saving ? "Generating…" : "Generate Tasks"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
