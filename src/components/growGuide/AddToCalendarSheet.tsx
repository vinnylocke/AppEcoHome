import React, { useEffect, useMemo, useState } from "react";
import { X, Loader2, MapPin, ChevronDown, Check, Sprout } from "lucide-react";
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
import {
  findHomePlantForCatalogue,
  saveCataloguePlantToShed,
} from "../../lib/plantCatalogue";
import { TaskActionButtons } from "../TaskActionButtons";
import toast from "react-hot-toast";

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
  /**
   * When supplied, every task / blueprint added here carries this
   * seed_packet_id. Used by the Sowing Calendar tab so completing the
   * resulting task auto-creates a Nursery sowing against the packet.
   */
  seedPacketId?: string;
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
  seedPacketId,
  onClose,
  onSaved,
}: Props) {
  const [instanceOptions, setInstanceOptions] = useState<InventoryItemOption[]>([]);
  const [pickedInstance, setPickedInstance] = useState<string | "home_wide">("home_wide");
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [existingBlueprints, setExistingBlueprints] = useState<BlueprintRow[]>([]);
  /**
   * Whether the user already has this catalogue plant in their Shed
   * (any matching home-scoped `plants` row — direct catalogue id, AI
   * fork via `forked_from_plant_id`, or provider id match for
   * Perenual/Verdantly). null = still loading.
   */
  const [inShed, setInShed] = useState<boolean | null>(null);
  /**
   * Default-checked toggle that, when set, also saves the catalogue
   * plant into the user's Shed before creating the tasks. Only
   * meaningful when `inShed === false`.
   */
  const [alsoAddToShed, setAlsoAddToShed] = useState<boolean>(true);
  /** True while the Save-to-Shed network call is in flight. */
  const [savingPlant, setSavingPlant] = useState(false);
  /**
   * Post-save success state — keeps the sheet open with a checkmark
   * for ~1.5s so the user gets clear visual confirmation in the same
   * place they were tapping. Without this they sometimes don't see
   * the global toast and tap Add again, double-adding tasks.
   */
  const [savedCount, setSavedCount] = useState<number | null>(null);

  // Hydrate inventory items + existing blueprints once when the sheet opens.
  useEffect(() => {
    if (!open) return;
    // Reset every per-open piece of state on a fresh open so a previous
    // save doesn't leave a stale checkmark / picker behind.
    setSavedCount(null);
    setInShed(null);
    setAlsoAddToShed(true);
    setPickedInstance("home_wide");
    let cancelled = false;
    setLoadingMeta(true);

    (async () => {
      try {
        // 1. Resolve the home plant id for this catalogue (if any).
        //    The Library hands us a catalogue plant id; the Shed hands
        //    us a home plant id directly. Either way this returns the
        //    home plant id we should query inventory_items against.
        const homePlantMatch = await findHomePlantForCatalogue(plantId, homeId);
        if (cancelled) return;
        const effectiveHomePlantId = homePlantMatch?.homePlantId ?? null;
        setInShed(!!homePlantMatch);

        // 2. Inventory items for that home plant + existing blueprints
        //    for duplicate detection — in parallel.
        const inventoryQ = effectiveHomePlantId == null
          ? Promise.resolve({ data: [], error: null })
          : supabase
              .from("inventory_items")
              .select("id, plant_name, nickname, area_name")
              .eq("home_id", homeId)
              .eq("plant_id", String(effectiveHomePlantId))
              .neq("status", "Archived");

        const [instancesRes, blueprintsRes] = await Promise.all([
          inventoryQ,
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
        className="relative w-full sm:max-w-lg bg-rhozly-bg rounded-t-3xl sm:rounded-3xl shadow-2xl border border-rhozly-outline/15 flex flex-col max-h-[90vh] overflow-hidden"
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
          ) : inShed === false ? (
            // Plant isn't in the Shed yet — offer to add it alongside
            // the tasks. Default checked because tasks for a plant the
            // user doesn't own are mildly odd otherwise.
            <label
              data-testid="add-to-calendar-also-add-to-shed"
              className="mb-4 flex items-start gap-3 rounded-2xl bg-rhozly-primary/[0.06] border border-rhozly-primary/20 p-3 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={alsoAddToShed}
                onChange={(e) => setAlsoAddToShed(e.target.checked)}
                className="sr-only"
              />
              <div
                className={`shrink-0 w-5 h-5 mt-0.5 rounded flex items-center justify-center border transition-colors ${
                  alsoAddToShed
                    ? "bg-rhozly-primary border-rhozly-primary text-white"
                    : "border-rhozly-outline/40 bg-white"
                }`}
              >
                {alsoAddToShed && <Check size={14} strokeWidth={4} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-rhozly-on-surface flex items-center gap-1.5">
                  <Sprout size={13} className="text-rhozly-primary" />
                  Also add to your Shed
                </p>
                <p className="text-[11px] text-rhozly-on-surface/65 leading-snug mt-0.5">
                  You don't have {plantName} in your Shed yet. Adding it now means the tasks will be linked to a real plant in your garden.
                </p>
              </div>
            </label>
          ) : null}

          {/* Task list + add button (delegates to TaskActionButtons).
              Toast suppressed — we render an in-modal success state
              instead so the user gets clear visual confirmation. */}
          <TaskActionButtons
            tasks={converted}
            homeId={homeId}
            inventoryItemIds={inventoryItemIds}
            seedPacketId={seedPacketId}
            duplicateIndices={duplicateIndices}
            suppressToast
            onBeforeSave={async () => {
              // Save the catalogue plant to the user's Shed first when
              // the toggle is set + the plant isn't already there.
              // Failures here propagate up to TaskActionButtons which
              // aborts the whole save (no tasks land).
              if (alsoAddToShed && inShed === false) {
                setSavingPlant(true);
                try {
                  await saveCataloguePlantToShed(plantId, homeId);
                  toast.success(`${plantName} added to your Shed.`);
                } catch (err) {
                  Logger.error("AddToCalendarSheet save-to-shed failed", err, {
                    plantId,
                  });
                  throw err instanceof Error
                    ? err
                    : new Error("Couldn't save the plant to your Shed.");
                } finally {
                  setSavingPlant(false);
                }
              }
            }}
            onSuccess={(count) => {
              setSavedCount(count);
              onSaved?.();
              // Hold the success state for 1.6s so the user clearly
              // sees the checkmark before the sheet disappears. They
              // were tapping the Add button — keep their attention
              // pinned there.
              window.setTimeout(() => onClose(), 1600);
            }}
          />
        </div>

        {/* Success overlay — covers the sheet body with a centred
            checkmark + count. Stays for the dwell time above. */}
        {savedCount !== null && (
          <div
            data-testid="add-to-calendar-success"
            className="absolute inset-0 bg-white/95 backdrop-blur-sm rounded-t-3xl sm:rounded-3xl flex flex-col items-center justify-center gap-3 z-10 px-6 text-center"
          >
            <div className="w-14 h-14 rounded-full bg-rhozly-primary text-white flex items-center justify-center shadow-lg">
              <Check size={28} strokeWidth={3} />
            </div>
            <p className="font-display font-black text-rhozly-on-surface text-lg">
              {savedCount === 1
                ? "1 task added to your calendar"
                : `${savedCount} tasks added to your calendar`}
            </p>
            {alsoAddToShed && inShed === false && (
              <p className="text-xs font-bold text-rhozly-on-surface/60 leading-snug">
                {plantName} was also added to your Shed.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
