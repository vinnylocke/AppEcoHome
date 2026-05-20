// AI Plant Overhaul Wave 5 — yellow freshness banner
//
// Shown above the care-guide form in PlantEditModal and InstanceEditModal
// when the user's `seen_freshness_version` is behind the catalogue's
// current `freshness_version`. Lists the changed fields with friendly
// labels and offers a "Mark as reviewed" action that upserts
// `user_plant_ack`.
//
// The chip's source of truth is always the GLOBAL plant — shallow forks
// resolve via `forked_from_plant_id` in `useAiPlantFreshness`.

import React, { useState } from "react";
import { Sparkles, Check, Loader2 } from "lucide-react";
import toast from "react-hot-toast";

// Friendly labels for `plants.updated_care_fields` entries (snake-case from
// the AI care guide schema). Unmapped entries fall back to humanised raw.
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
  thumbnail_url:      "Image",
};

function humanise(field: string): string {
  return FIELD_LABELS[field] ?? field.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

interface CareUpdateCalloutProps {
  updatedFields: string[];
  /** ISO timestamp of `plants.last_care_generated_at` on the global. */
  lastGeneratedAt?: string | null;
  onAcknowledge: () => Promise<void>;
  /** Optional secondary CTA — wire to scroll/expand the diff in the parent. */
  onViewChanges?: () => void;
}

export default function CareUpdateCallout({
  updatedFields,
  lastGeneratedAt,
  onAcknowledge,
  onViewChanges,
}: CareUpdateCalloutProps) {
  const [acking, setAcking] = useState(false);
  const count = updatedFields.length;
  const headline =
    count === 0
      ? "Care guide updated"
      : count === 1
        ? "Care guide updated — 1 field changed"
        : `Care guide updated — ${count} fields changed`;

  const handleAck = async () => {
    if (acking) return;
    setAcking(true);
    try {
      await onAcknowledge();
      toast.success("Marked as reviewed");
    } catch {
      toast.error("Couldn't mark as reviewed. Try again.");
    } finally {
      setAcking(false);
    }
  };

  const refreshedAgo = lastGeneratedAt
    ? formatTimeAgo(new Date(lastGeneratedAt))
    : null;

  return (
    <div
      data-testid="ai-care-update-callout"
      className="bg-amber-50 border border-amber-300 rounded-2xl p-4 mb-4 shadow-sm animate-in fade-in slide-in-from-top-1"
      role="status"
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700">
          <Sparkles size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-amber-900">{headline}</p>
          {refreshedAgo && (
            <p className="text-[11px] font-bold text-amber-700/80 mt-0.5">
              Care guide refreshed {refreshedAgo}
            </p>
          )}
          {count > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {updatedFields.map((field) => (
                <li
                  key={field}
                  className="text-[10px] font-black uppercase tracking-widest bg-white border border-amber-200 text-amber-800 px-2 py-0.5 rounded-md"
                >
                  {humanise(field)}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 mt-3 flex-wrap">
        <button
          data-testid="ai-care-mark-reviewed"
          onClick={handleAck}
          disabled={acking}
          className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[36px] bg-amber-600 text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-amber-700 disabled:opacity-50 transition-colors"
        >
          {acking ? (
            <>
              <Loader2 size={14} className="animate-spin" /> Saving…
            </>
          ) : (
            <>
              <Check size={14} /> Mark as reviewed
            </>
          )}
        </button>
        {onViewChanges && count > 0 && (
          <button
            data-testid="ai-care-view-changes"
            onClick={onViewChanges}
            className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[36px] border border-amber-300 text-amber-800 text-xs font-black uppercase tracking-widest rounded-xl hover:bg-amber-100 transition-colors"
          >
            View changes
          </button>
        )}
      </div>
    </div>
  );
}

function formatTimeAgo(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months === 1) return "a month ago";
  return `${months} months ago`;
}
