import React, { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, Sprout } from "lucide-react";
import toast from "react-hot-toast";
import { Logger } from "../lib/errorHandler";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { insertYieldRecord, validateYieldValue } from "../services/yieldService";
import { splitYieldEvenly } from "../lib/yieldSplit";

// ─── Harvest Partial Pick Sheet ────────────────────────────────────────────
//
// Berries, beans, courgettes, chillies — most "pick over time" crops can't
// be harvested in a single binary action. This sheet lets the user log a
// yield against the linked plant instance(s) without closing the parent
// harvest task. After insert the parent task snoozes for `snoozeDays` so
// it disappears from Today until the next sensible check.
//
// The entered amount is the TOTAL picked for the task. When the task is linked
// to more than one instance the total is split EVENLY across them (one
// yield_records row per instance carrying total/N, remainder on the last row),
// so every downstream sum equals the entered total — not total × instanceCount
// (RHO-21). Each instance still gets its own row so per-instance history and
// the distinct-instances-harvested stat stay meaningful.

interface Props {
  isOpen: boolean;
  onClose: () => void;
  homeId: string;
  /** Linked plant instances the yield is attributed to. At least one. */
  instanceIds: string[];
  taskTitle: string;
  /** Resolved plant common name for the heading (when available). */
  plantName: string | null;
  /** Fired after a successful insert — parent snoozes the task. */
  onLogged: (snoozeDays: number) => void;
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
  onLogged,
}: Props) {
  const trapRef = useFocusTrap<HTMLDivElement>(isOpen);
  const [value, setValue] = useState<string>("");
  const [unit, setUnit] = useState<string>("g");
  const [notes, setNotes] = useState<string>("");
  const [snoozeDays, setSnoozeDays] = useState<number>(3);
  const [busy, setBusy] = useState(false);

  const validationError = useMemo(() => validateYieldValue(value), [value]);
  const canSubmit = !validationError && !busy && instanceIds.length > 0;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      const numericValue = parseFloat(value);
      // The entered amount is the TOTAL for the task. Split it evenly across
      // the linked instances so the parts sum EXACTLY to the total — one row
      // per instance keeps per-instance history intact (RHO-21).
      const parts = splitYieldEvenly(numericValue, instanceIds.length);
      for (let i = 0; i < instanceIds.length; i++) {
        const part = parts[i] ?? 0;
        // Skip zero-value parts — `yield_records.value` has a CHECK (value > 0);
        // only reached when the total is smaller than can spread across every
        // instance at 0.001 granularity.
        if (part <= 0) continue;
        await insertYieldRecord({
          home_id: homeId,
          instance_id: instanceIds[i],
          value: part,
          unit,
          notes: notes.trim() ? notes.trim() : null,
        });
      }
      toast.success(
        `Logged ${numericValue}${unit === "count" ? " items" : unit} — back in ${snoozeDays} day${snoozeDays === 1 ? "" : "s"}.`,
      );
      onLogged(snoozeDays);
      // Reset for next open.
      setValue("");
      setNotes("");
      onClose();
    } catch (err: any) {
      Logger.error("Partial harvest log failed", err, { homeId, instanceIds }, err.message || "Couldn't log harvest — try again.");
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
        aria-label="Log a partial harvest"
        className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl border border-rhozly-outline/10 flex flex-col max-h-[90dvh] overflow-hidden animate-in slide-in-from-bottom-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-rhozly-outline/10 bg-rhozly-surface-lowest flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-1 flex items-center gap-1.5">
              <Sprout size={11} className="text-rhozly-primary" /> Partial harvest
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
            Log what you picked today. The task stays open so you can come back for the rest.
          </p>

          <div className="grid grid-cols-3 gap-2">
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
                  validationError && value
                    ? "border-red-300 focus:ring-red-200"
                    : "border-transparent focus:ring-rhozly-primary/20"
                } font-bold text-base outline-none focus:ring-2 transition-all`}
              />
            </div>
            <div>
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
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-rhozly-outline/10 bg-rhozly-surface-lowest">
          <button
            type="button"
            data-testid="harvest-partial-submit"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full py-3 bg-rhozly-primary text-white rounded-2xl font-black disabled:bg-rhozly-surface-low disabled:text-rhozly-on-surface/30 hover:opacity-90 transition-opacity min-h-[44px] flex items-center justify-center gap-2"
          >
            {busy ? (
              <>
                <Loader2 size={18} className="animate-spin" /> Logging…
              </>
            ) : (
              "Log pick & come back later"
            )}
          </button>
          {validationError && value && (
            <p className="text-[11px] text-red-600 mt-2 font-semibold">{validationError}</p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
