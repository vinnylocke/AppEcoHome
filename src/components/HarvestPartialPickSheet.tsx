import React, { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, Sprout } from "lucide-react";
import toast from "react-hot-toast";
import { Logger } from "../lib/errorHandler";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { supabase } from "../lib/supabase";
import { insertYieldRecord, validateYieldValue } from "../services/yieldService";
import { buildHarvestYieldRows, type YieldEntryMode } from "../lib/harvestYield";

// ─── Harvest Yield Sheet (partial pick + final harvest) ────────────────────
//
// Berries, beans, courgettes, chillies — most "pick over time" crops can't be
// harvested in one binary action. This sheet captures a yield against the
// linked plant instance(s). Two modes:
//   - "partial" (default): log an interim pick WITHOUT closing the task; the
//     parent then snoozes it for `snoozeDays` (onLogged).
//   - "final": log the yield for a harvest being COMPLETED; on submit/skip the
//     parent finishes completion (onComplete). No snooze.
//
// When the task links to MORE THAN ONE instance the user chooses how to record:
//   - Total (split evenly): one figure split across instances (parts sum to the
//     total, remainder on the last row) — the RHO-21 behaviour.
//   - Per plant: an amount per instance, one row each.
// One yield_records row per instance keeps per-instance history + the
// distinct-instances-harvested stat meaningful. The pure row-building lives in
// src/lib/harvestYield.ts (unit-tested).

interface Props {
  isOpen: boolean;
  onClose: () => void;
  homeId: string;
  /** Linked plant instances the yield is attributed to. At least one. */
  instanceIds: string[];
  taskTitle: string;
  /** Resolved plant common name for the heading (when available). */
  plantName: string | null;
  /** "partial" (default) keeps the task open + snoozes; "final" completes it. */
  mode?: "partial" | "final";
  /** partial only — fired after a successful insert so the parent snoozes. */
  onLogged?: (snoozeDays: number) => void;
  /** final only — fired after rows are written (or Skip) so the parent completes. */
  onComplete?: () => void | Promise<void>;
}

const UNIT_OPTIONS = [
  { value: "g", label: "g" },
  { value: "kg", label: "kg" },
  { value: "oz", label: "oz" },
  { value: "lb", label: "lb" },
  { value: "count", label: "count" },
  { value: "handful", label: "handfuls" },
  { value: "punnet", label: "punnets" },
  { value: "bunch", label: "bunches" },
] as const;

const SNOOZE_OPTIONS = [1, 3, 5, 7];

export default function HarvestPartialPickSheet({
  isOpen,
  onClose,
  homeId,
  instanceIds,
  taskTitle,
  plantName,
  mode = "partial",
  onLogged,
  onComplete,
}: Props) {
  const trapRef = useFocusTrap<HTMLDivElement>(isOpen);
  const isFinal = mode === "final";
  const multi = instanceIds.length > 1;

  const [value, setValue] = useState<string>("");
  const [unit, setUnit] = useState<string>("g");
  const [notes, setNotes] = useState<string>("");
  const [snoozeDays, setSnoozeDays] = useState<number>(3);
  const [busy, setBusy] = useState(false);
  const [entryMode, setEntryMode] = useState<YieldEntryMode>("total");
  const [perPlant, setPerPlant] = useState<Record<string, string>>({});
  const [names, setNames] = useState<Record<string, string>>({});

  // Reset each time the sheet opens for a new task.
  useEffect(() => {
    if (!isOpen) return;
    setValue("");
    setNotes("");
    setPerPlant({});
    setEntryMode("total");
    setSnoozeDays(3);
  }, [isOpen, taskTitle]);

  // Resolve plant names for the per-plant labels (only needed when >1 instance).
  useEffect(() => {
    if (!isOpen || !multi) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from("inventory_items")
          .select("id, plant_name, identifier")
          .in("id", instanceIds);
        if (cancelled) return;
        const map: Record<string, string> = {};
        const seen: Record<string, number> = {};
        for (const id of instanceIds) {
          const row = (data ?? []).find((r: any) => r.id === id) as any;
          const base = row?.plant_name || row?.identifier || "Plant";
          // Disambiguate duplicate names (two "Tomato" instances) with a suffix.
          seen[base] = (seen[base] ?? 0) + 1;
          map[id] = seen[base] > 1 ? `${base} (${seen[base]})` : base;
        }
        // Second pass: if a name only appeared once its "(1)" isn't needed.
        setNames(map);
      } catch {
        // Labels are an enhancement — fall back to "Plant 1/2/…" below.
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, multi, instanceIds]);

  const labelFor = (id: string, i: number) => names[id] ?? `Plant ${i + 1}`;

  // Validation differs by entry mode.
  const totalError = useMemo(() => validateYieldValue(value), [value]);
  const perPlantHasOne = useMemo(
    () => instanceIds.some((id) => (parseFloat(perPlant[id] ?? "") || 0) > 0),
    [perPlant, instanceIds],
  );
  const usingPerPlant = multi && entryMode === "perPlant";
  const canSubmit =
    !busy &&
    instanceIds.length > 0 &&
    (usingPerPlant ? perPlantHasOne : !totalError);

  const writeRows = async () => {
    const rows = buildHarvestYieldRows(
      usingPerPlant
        ? {
            mode: "perPlant",
            instanceIds,
            unit,
            notes,
            perPlant: Object.fromEntries(
              instanceIds.map((id) => [id, parseFloat(perPlant[id] ?? "") || 0]),
            ),
          }
        : { mode: "total", instanceIds, unit, notes, total: parseFloat(value) || 0 },
    );
    for (const row of rows) {
      await insertYieldRecord({ home_id: homeId, ...row });
    }
    return rows;
  };

  const summaryFor = (rows: { value: number }[]) => {
    const total = rows.reduce((a, r) => a + r.value, 0);
    return `${Number(total.toFixed(3))}${unit === "count" ? " items" : unit}`;
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      const rows = await writeRows();
      if (isFinal) {
        toast.success(rows.length ? `Logged ${summaryFor(rows)} — harvest complete.` : "Harvest complete.");
        await onComplete?.();
      } else {
        toast.success(
          `Logged ${summaryFor(rows)} — back in ${snoozeDays} day${snoozeDays === 1 ? "" : "s"}.`,
        );
        onLogged?.(snoozeDays);
      }
      setValue("");
      setNotes("");
      setPerPlant({});
      // In final mode the parent unmounts the sheet as part of completing;
      // calling onClose too would double-fire the continuation.
      if (!isFinal) onClose();
    } catch (err: any) {
      Logger.error("Harvest yield log failed", err, { homeId, instanceIds, mode }, err.message || "Couldn't log harvest — try again.");
    } finally {
      setBusy(false);
    }
  };

  // "final" mode only — complete the harvest without recording a yield.
  const handleSkip = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onComplete?.();
    } catch (err: any) {
      Logger.error("Harvest complete (no yield) failed", err, { homeId, instanceIds }, "Couldn't complete — try again.");
    } finally {
      setBusy(false);
    }
  };

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-6 bg-rhozly-bg/90 backdrop-blur-sm animate-in fade-in">
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-label={isFinal ? "Log your harvest yield" : "Log a partial harvest"}
        className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl border border-rhozly-outline/10 flex flex-col max-h-[90dvh] overflow-hidden animate-in slide-in-from-bottom-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-rhozly-outline/10 bg-rhozly-surface-lowest flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-1 flex items-center gap-1.5">
              <Sprout size={11} className="text-rhozly-primary" /> {isFinal ? "Harvest yield" : "Partial harvest"}
            </p>
            <h2 className="text-lg font-black text-rhozly-on-surface leading-tight truncate">{taskTitle}</h2>
            {plantName && (
              <p className="text-xs font-bold text-rhozly-on-surface/55 italic truncate">{plantName}</p>
            )}
          </div>
          <button
            type="button"
            data-testid="harvest-partial-close"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 p-2 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
          >
            <X size={18} className="text-gray-600" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <p className="text-sm text-rhozly-on-surface/65 leading-snug">
            {isFinal
              ? "Record what you harvested. This closes the task."
              : "Log what you picked today. The task stays open so you can come back for the rest."}
          </p>

          {/* Entry-mode toggle — only when the task links to more than one plant. */}
          {multi && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/45 mb-1.5">
                {instanceIds.length} plants linked
              </p>
              <div className="grid grid-cols-2 gap-2" data-testid="harvest-yield-mode">
                <button
                  type="button"
                  data-testid="harvest-yield-mode-total"
                  onClick={() => setEntryMode("total")}
                  className={`py-2.5 rounded-xl border-2 text-xs font-black transition-colors ${
                    entryMode === "total"
                      ? "bg-rhozly-primary/10 border-rhozly-primary text-rhozly-primary"
                      : "bg-white border-rhozly-outline/15 text-rhozly-on-surface/60 hover:border-rhozly-primary/30"
                  }`}
                >
                  One total, split evenly
                </button>
                <button
                  type="button"
                  data-testid="harvest-yield-mode-perplant"
                  onClick={() => setEntryMode("perPlant")}
                  className={`py-2.5 rounded-xl border-2 text-xs font-black transition-colors ${
                    entryMode === "perPlant"
                      ? "bg-rhozly-primary/10 border-rhozly-primary text-rhozly-primary"
                      : "bg-white border-rhozly-outline/15 text-rhozly-on-surface/60 hover:border-rhozly-primary/30"
                  }`}
                >
                  Amount per plant
                </button>
              </div>
            </div>
          )}

          {/* Unit selector (shared across both entry modes). */}
          <div className="grid grid-cols-3 gap-2">
            {!usingPerPlant && (
              <div className="col-span-2">
                <label htmlFor="partial-value" className="block text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/45 mb-1.5">
                  How much?
                </label>
                <input
                  id="partial-value"
                  data-testid="harvest-partial-value"
                  type="number"
                  min={0}
                  step="any"
                  inputMode="decimal"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="e.g. 250"
                  className={`w-full p-3 rounded-2xl bg-rhozly-surface-low border ${
                    totalError && value
                      ? "border-red-300 focus:ring-red-200"
                      : "border-transparent focus:ring-rhozly-primary/20"
                  } font-bold text-base outline-none focus:ring-2 transition-all`}
                />
              </div>
            )}
            <div className={usingPerPlant ? "col-span-3" : ""}>
              <label htmlFor="partial-unit" className="block text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/45 mb-1.5">
                Unit
              </label>
              <select
                id="partial-unit"
                data-testid="harvest-partial-unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full p-3 rounded-2xl bg-rhozly-surface-low border border-transparent focus:ring-2 focus:ring-rhozly-primary/20 font-bold text-base outline-none transition-all"
              >
                {UNIT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Per-plant inputs. */}
          {usingPerPlant && (
            <div className="space-y-2" data-testid="harvest-yield-perplant-list">
              {instanceIds.map((id, i) => (
                <div key={id} className="flex items-center gap-2">
                  <span className="flex-1 min-w-0 truncate text-sm font-bold text-rhozly-on-surface/75">
                    {labelFor(id, i)}
                  </span>
                  <input
                    data-testid={`harvest-yield-perplant-${id}`}
                    type="number"
                    min={0}
                    step="any"
                    inputMode="decimal"
                    value={perPlant[id] ?? ""}
                    onChange={(e) => setPerPlant((p) => ({ ...p, [id]: e.target.value }))}
                    placeholder="0"
                    className="w-28 p-2.5 rounded-xl bg-rhozly-surface-low border border-transparent focus:ring-2 focus:ring-rhozly-primary/20 font-bold text-base outline-none transition-all text-right"
                  />
                  <span className="w-12 text-xs font-black text-rhozly-on-surface/45">
                    {unit === "count" ? "" : unit}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div>
            <label htmlFor="partial-notes" className="block text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/45 mb-1.5">
              Notes (optional)
            </label>
            <textarea
              id="partial-notes"
              data-testid="harvest-partial-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="First reds today, still mostly green…"
              className="w-full p-3 rounded-2xl bg-rhozly-surface-low border border-transparent focus:ring-2 focus:ring-rhozly-primary/20 font-bold text-sm outline-none transition-all resize-none"
            />
          </div>

          {/* Snooze — partial mode only. */}
          {!isFinal && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/45 mb-1.5">
                Check again in
              </p>
              <div className="grid grid-cols-4 gap-2">
                {SNOOZE_OPTIONS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    data-testid={`harvest-partial-snooze-${d}`}
                    onClick={() => setSnoozeDays(d)}
                    className={`py-2.5 rounded-xl border-2 text-sm font-black transition-colors ${
                      snoozeDays === d
                        ? "bg-rhozly-primary/10 border-rhozly-primary text-rhozly-primary"
                        : "bg-white border-rhozly-outline/15 text-rhozly-on-surface/60 hover:border-rhozly-primary/30"
                    }`}
                  >
                    {d} day{d === 1 ? "" : "s"}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-rhozly-outline/10 bg-rhozly-surface-lowest space-y-2">
          <button
            type="button"
            data-testid={isFinal ? "harvest-yield-complete" : "harvest-partial-submit"}
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full py-3 bg-rhozly-primary text-white rounded-2xl font-black disabled:bg-rhozly-surface-low disabled:text-rhozly-on-surface/30 hover:opacity-90 transition-opacity min-h-[44px] flex items-center justify-center gap-2"
          >
            {busy ? (
              <>
                <Loader2 size={18} className="animate-spin" /> {isFinal ? "Completing…" : "Logging…"}
              </>
            ) : (
              isFinal ? "Log yield & complete" : "Log pick & come back later"
            )}
          </button>
          {isFinal && (
            <button
              type="button"
              data-testid="harvest-yield-skip"
              onClick={handleSkip}
              disabled={busy}
              className="w-full py-2.5 rounded-2xl font-black text-rhozly-on-surface/55 hover:text-rhozly-on-surface hover:bg-rhozly-surface-low transition-colors min-h-[40px] disabled:opacity-40"
            >
              Skip — nothing to log
            </button>
          )}
          {!usingPerPlant && totalError && value && (
            <p className="text-[11px] text-red-600 font-semibold">{totalError}</p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
