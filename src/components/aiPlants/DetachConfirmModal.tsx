// AI Plant Overhaul Wave 6 — DetachConfirmModal
//
// Shown when a user is about to save edits to a catalogue-tracking AI plant.
// Warns that saving will stop automatic catalogue updates for this plant in
// this home. They can reset later from the same modal to rejoin.

import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Sparkles, X } from "lucide-react";

interface DetachConfirmModalProps {
  changedFields: string[];
  onCancel: () => void;
  onConfirm: () => void;
  isSaving?: boolean;
}

export default function DetachConfirmModal({
  changedFields,
  onCancel,
  onConfirm,
  isSaving = false,
}: DetachConfirmModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Auto-focus the cancel button so accidental Enter doesn't confirm.
  useEffect(() => {
    const cancelBtn = dialogRef.current?.querySelector<HTMLButtonElement>(
      "[data-testid='ai-detach-cancel']",
    );
    cancelBtn?.focus();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onCancel]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-rhozly-bg/95 backdrop-blur-xl animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="detach-confirm-heading"
    >
      <div
        ref={dialogRef}
        data-testid="ai-detach-confirm-modal"
        className="bg-rhozly-surface-lowest w-full max-w-md rounded-3xl shadow-2xl border border-rhozly-outline/20 overflow-hidden"
      >
        <div className="p-6 pb-4 flex justify-between items-start border-b border-rhozly-outline/10">
          <div className="flex items-start gap-3">
            <div className="shrink-0 w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700">
              <Sparkles size={20} />
            </div>
            <div>
              <h3 id="detach-confirm-heading" className="text-lg font-black text-rhozly-on-surface">
                Save your edits?
              </h3>
              <p className="text-[10px] font-black text-rhozly-on-surface/40 uppercase tracking-widest mt-0.5">
                This stops automatic catalogue updates
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            aria-label="Close"
            className="p-2 bg-rhozly-surface-low rounded-xl text-rhozly-on-surface/50 hover:text-rhozly-on-surface transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 text-sm font-bold text-rhozly-on-surface/80 space-y-3">
          <p>
            Rhozly periodically refreshes AI plant care guides with the latest
            information. If you save these edits, your home will keep the values
            you set and won't receive future catalogue updates for this plant.
          </p>
          <p>
            You can <span className="font-black">reset</span> later to rejoin
            the auto-updating catalogue (your edits would be lost).
          </p>
          {changedFields.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl px-3 py-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-800 mb-1">
                Fields you've changed
              </p>
              <ul className="flex flex-wrap gap-1.5">
                {changedFields.map((field) => (
                  <li
                    key={field}
                    className="text-[10px] font-black uppercase tracking-widest bg-white border border-amber-200 text-amber-800 px-2 py-0.5 rounded-md"
                  >
                    {humanise(field)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="p-4 flex items-center justify-end gap-2 border-t border-rhozly-outline/10 bg-rhozly-surface-low/30">
          <button
            data-testid="ai-detach-cancel"
            onClick={onCancel}
            disabled={isSaving}
            className="px-4 py-2 min-h-[36px] border border-rhozly-outline/30 text-rhozly-on-surface text-xs font-black uppercase tracking-widest rounded-xl hover:bg-rhozly-surface-low disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            data-testid="ai-detach-confirm"
            onClick={onConfirm}
            disabled={isSaving}
            className="px-4 py-2 min-h-[36px] bg-amber-600 text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-amber-700 disabled:opacity-50 transition-colors"
          >
            {isSaving ? "Saving…" : "Save my edits"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// Friendly labels — duplicated from CareUpdateCallout to keep this component
// self-contained. Single-source-of-truth lives in
// `src/lib/aiPlantOverrides.ts` if this ever grows.
const FIELD_LABELS: Record<string, string> = {
  common_name:        "Plant name",
  scientific_name:    "Scientific name",
  description:        "Description",
  plant_type:         "Plant type",
  cycle:              "Life cycle",
  care_level:         "Care level",
  growth_rate:        "Growth rate",
  maintenance:        "Maintenance",
  watering_min_days:  "Watering — min days",
  watering_max_days:  "Watering — max days",
  sunlight:           "Sunlight",
  flowering_season:   "Flowering season",
  harvest_season:     "Harvest season",
  pruning_month:      "Pruning months",
  propagation:        "Propagation",
  attracts:           "Attracts",
  is_toxic_pets:      "Toxic to pets",
  is_toxic_humans:    "Toxic to humans",
  indoor:             "Suitable indoors",
  is_edible:          "Edible",
  drought_tolerant:   "Drought tolerant",
  tropical:           "Tropical",
  medicinal:          "Medicinal",
  cuisine:            "Culinary use",
};

function humanise(field: string): string {
  return FIELD_LABELS[field] ?? field.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}
