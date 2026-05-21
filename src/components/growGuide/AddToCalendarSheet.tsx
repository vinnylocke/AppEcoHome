import React, { useEffect, useMemo, useState } from "react";
import { X, Loader2, MapPin, ChevronDown } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Logger } from "../../lib/errorHandler";
import {
  scheduleFromSchedulableTasks,
  type SchedulableTask,
} from "../../lib/scheduleFromSchedulableTask";
import {
  findLikelyDuplicates,
  type BlueprintRow,
} from "../../lib/blueprintDuplicateCheck";
import { TaskActionButtons } from "../TaskActionButtons";

interface InventoryItemOption {
  id: string;
  label: string;        // "Roma · Back bed"
  areaName: string | null;
}

interface Props {
  open: boolean;
  homeId: string;
  plantId: number;        // catalogue plants.id — used to match the user's instances
  plantName: string;
  schedulableTasks: SchedulableTask[];
  /**
   * Optional title shown above the task list. Defaults to "Add to calendar".
   * Per-section openings pass e.g. "Add pruning tasks".
   */
  heading?: string;
  onClose: () => void;
  onSaved?: () => void;
}

/**
 * Bottom-sheet (mobile) / centred modal (desktop) that converts the
 * grow guide's `schedulable_tasks` into ready-to-save `SuggestedTask`s
 * and hosts a `<TaskActionButtons>` for the actual add.
 *
 * Adds two things on top of the bare TaskActionButtons flow:
 *   1. Per-instance picker — user can attach the tasks to specific
 *      inventory items of this plant (or leave home-wide).
 *   2. Duplicate detection — flags tasks that look similar to an
 *      existing blueprint and pre-unchecks them.
 */
export default function AddToCalendarSheet({
  open,
  homeId,
  plantId,
  plantName,
  schedulableTasks,
  heading,
  onClose,
  onSaved,
}: Props) {
  const [instanceOptions, setInstanceOptions] = useState<InventoryItemOption[]>([]);
  const [pickedInstance, setPickedInstance] = useState<string | "home_wide">("home_wide");
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [existingBlueprints, setExistingBlueprints] = useState<BlueprintRow[]>([]);

  // Hydrate inventory items + existing blueprints once when the sheet opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingMeta(true);

    (async () => {
      try {
        const [instancesRes, blueprintsRes] = await Promise.all([
          // inventory_items.plant_id is text (holds the integer catalogue id
          // as a string). The Library / Shed insert paths convert before
          // writing, so matching string-on-string here is correct.
          supabase
            .from("inventory_items")
            .select("id, plant_name, nickname, area_name")
            .eq("home_id", homeId)
            .eq("plant_id", String(plantId))
            .neq("status", "Archived"),
          supabase
            .from("task_blueprints")
            .select("id, title, task_type, frequency_days, is_recurring")
            .eq("home_id", homeId),
        ]);

        if (cancelled) return;

        if (instancesRes.error) {
          Logger.error("AddToCalendarSheet instances fetch failed", instancesRes.error, { plantId });
        } else {
          const opts: InventoryItemOption[] = (instancesRes.data ?? []).map((row: any) => ({
            id: row.id,
            label: [row.nickname?.trim() || row.plant_name || plantName, row.area_name]
              .filter(Boolean)
              .join(" · "),
            areaName: row.area_name ?? null,
          }));
          setInstanceOptions(opts);
        }

        if (blueprintsRes.error) {
          Logger.error("AddToCalendarSheet blueprints fetch failed", blueprintsRes.error, { homeId });
        } else {
          setExistingBlueprints((blueprintsRes.data ?? []) as BlueprintRow[]);
        }
      } finally {
        if (!cancelled) setLoadingMeta(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, homeId, plantId, plantName]);

  const converted = useMemo(
    () => scheduleFromSchedulableTasks(schedulableTasks),
    [schedulableTasks],
  );

  const duplicateIndices = useMemo(() => {
    const idxs = findLikelyDuplicates(converted, existingBlueprints);
    return Array.from(idxs);
  }, [converted, existingBlueprints]);

  const inventoryItemIds = useMemo(() => {
    if (pickedInstance === "home_wide") return undefined;
    return [pickedInstance];
  }, [pickedInstance]);

  if (!open) return null;

  return (
    <div
      data-testid="add-to-calendar-sheet"
      className="fixed inset-0 z-[100] flex items-end sm:items-center sm:justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg bg-rhozly-bg rounded-t-3xl sm:rounded-3xl shadow-2xl border border-rhozly-outline/15 flex flex-col max-h-[90vh]"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {/* Header */}
        <header className="shrink-0 px-5 pt-4 pb-3 flex items-start justify-between gap-3 border-b border-rhozly-outline/10">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-primary mb-0.5">
              {heading ?? "Add to calendar"}
            </p>
            <h2
              data-testid="add-to-calendar-plant"
              className="font-display font-black text-rhozly-on-surface text-lg leading-tight truncate"
            >
              {plantName}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-10 h-10 rounded-2xl bg-white border border-rhozly-outline/15 text-rhozly-on-surface/60 hover:text-rhozly-primary flex items-center justify-center"
          >
            <X size={18} />
          </button>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Per-instance picker — only shown if the plant has instances */}
          {loadingMeta ? (
            <div className="flex items-center gap-2 text-xs font-bold text-rhozly-on-surface/55 mb-4">
              <Loader2 size={14} className="animate-spin" />
              Checking your Shed…
            </div>
          ) : instanceOptions.length > 0 ? (
            <div className="mb-4">
              <label className="block text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/55 mb-1.5">
                Attach to
              </label>
              <div className="relative">
                <MapPin
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-rhozly-on-surface/40 pointer-events-none"
                />
                <select
                  data-testid="add-to-calendar-instance"
                  value={pickedInstance}
                  onChange={(e) => setPickedInstance(e.target.value as string)}
                  className="w-full appearance-none pl-9 pr-9 py-2.5 min-h-[44px] rounded-2xl bg-white border border-rhozly-outline/20 text-sm font-bold text-rhozly-on-surface focus:outline-none focus:border-rhozly-primary/40 focus:ring-2 focus:ring-rhozly-primary/15"
                >
                  <option value="home_wide">Home-wide (no specific plant)</option>
                  {instanceOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={14}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-rhozly-on-surface/40 pointer-events-none"
                />
              </div>
              <p className="text-[11px] text-rhozly-on-surface/50 mt-1.5 leading-snug">
                Home-wide tasks live on your calendar without a specific plant link — useful when you haven't decided where this one will go yet.
              </p>
            </div>
          ) : null}

          {/* Task list + add button (delegates to TaskActionButtons) */}
          <TaskActionButtons
            tasks={converted}
            homeId={homeId}
            inventoryItemIds={inventoryItemIds}
            duplicateIndices={duplicateIndices}
            onSuccess={() => {
              onSaved?.();
              onClose();
            }}
          />
        </div>
      </div>
    </div>
  );
}
