// AI Plant Overhaul Wave 5 — freshness banner
// Reworked 2026-07-08 (docs/plans/ai-plant-freshness-and-edit-ux-overhaul.md
// C2): the callout now shows the actual BEFORE → AFTER values (from
// plant_care_revisions.diff_summary) so "verify the changes" is possible,
// and offers two honest actions — "Apply updates" (sync the new values into
// the home fork via revert_ai_plant_fork_in_place) and "Keep mine" (ack
// only). "Mark as reviewed" is retired: it cleared the chip without ever
// changing the user's plant.
//
// The chip's source of truth is always the GLOBAL plant — shallow forks
// resolve via `forked_from_plant_id` in `useAiPlantFreshness`.

import React, { useEffect, useState } from "react";
import { Sparkles, Check, Loader2, ArrowRight, Download } from "lucide-react";
import toast from "react-hot-toast";
import { supabase } from "../../lib/supabase";
import { Logger } from "../../lib/errorHandler";

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

/** Render a diff value in gardener words: arrays joined, booleans Yes/No. */
function formatValue(v: unknown): string {
  if (v == null || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
  return String(v);
}

interface CareUpdateCalloutProps {
  updatedFields: string[];
  /** ISO timestamp of `plants.last_care_generated_at` on the global. */
  lastGeneratedAt?: string | null;
  /** Global catalogue plant id — used to fetch the before→after diff. */
  globalPlantId?: number | null;
  /** The version the user last saw; diffs are shown for revisions after it. */
  seenVersion?: number | null;
  /** "Keep mine" — ack only, the user's data stays as-is. */
  onAcknowledge: () => Promise<void>;
  /** "Apply updates" — sync the catalogue's new values into this plant. */
  onApply?: () => Promise<void>;
}

type DiffEntry = { field: string; before: unknown; after: unknown };

export default function CareUpdateCallout({
  updatedFields,
  lastGeneratedAt,
  globalPlantId,
  seenVersion,
  onAcknowledge,
  onApply,
}: CareUpdateCalloutProps) {
  const [acking, setAcking] = useState(false);
  const [applying, setApplying] = useState(false);
  const [diff, setDiff] = useState<DiffEntry[] | null>(null);

  // Fetch the before→after values from the revision audit trail so the user
  // can actually SEE what changed (F3 — labels alone were unverifiable).
  useEffect(() => {
    if (globalPlantId == null) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("plant_care_revisions")
          .select("version, diff_summary")
          .eq("plant_id", globalPlantId)
          .gt("version", seenVersion ?? 0)
          .order("version", { ascending: true });
        if (error) throw error;
        if (cancelled || !data?.length) return;
        // Merge across revisions: keep the EARLIEST before + the LATEST after.
        const merged: Record<string, { before: unknown; after: unknown }> = {};
        for (const rev of data) {
          const perField = (rev.diff_summary ?? {}) as Record<string, { before: unknown; after: unknown }>;
          for (const [field, d] of Object.entries(perField)) {
            if (!merged[field]) merged[field] = { before: d.before, after: d.after };
            else merged[field].after = d.after;
          }
        }
        setDiff(
          Object.entries(merged)
            .filter(([, d]) => d.after != null) // omission noise never shows
            .map(([field, d]) => ({ field, before: d.before, after: d.after })),
        );
      } catch (err) {
        Logger.error("CareUpdateCallout diff fetch failed", err, { globalPlantId });
      }
    })();
    return () => { cancelled = true; };
  }, [globalPlantId, seenVersion]);

  const rows = diff ?? updatedFields.map((f) => ({ field: f, before: undefined, after: undefined }));
  const count = rows.length;
  const headline = count === 1
    ? "Care guide update — 1 field"
    : `Care guide update — ${count} fields`;

  const handleAck = async () => {
    if (acking || applying) return;
    setAcking(true);
    try {
      await onAcknowledge();
      toast.success("Kept your version — update dismissed");
    } catch {
      toast.error("Couldn't save. Try again.");
    } finally {
      setAcking(false);
    }
  };

  const handleApply = async () => {
    if (acking || applying || !onApply) return;
    setApplying(true);
    try {
      await onApply();
    } catch {
      toast.error("Couldn't apply the update. Try again.");
    } finally {
      setApplying(false);
    }
  };

  const refreshedAgo = lastGeneratedAt ? formatTimeAgo(new Date(lastGeneratedAt)) : null;

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
          <p className="text-[11px] font-bold text-amber-700/80 mt-0.5">
            Rhozly's library refreshed this care guide{refreshedAgo ? ` ${refreshedAgo}` : ""} — review what changed below.
          </p>
          {count > 0 && (
            <ul className="mt-2.5 space-y-1" data-testid="ai-care-diff-rows">
              {rows.map(({ field, before, after }) => (
                <li key={field} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px]">
                  <span className="font-black uppercase tracking-widest text-amber-800 text-[10px]">
                    {humanise(field)}
                  </span>
                  {after !== undefined ? (
                    <span className="font-bold text-amber-900/85 inline-flex items-baseline gap-1.5 min-w-0">
                      <span className="line-through decoration-amber-400 text-amber-700/60">{formatValue(before)}</span>
                      <ArrowRight size={10} className="self-center shrink-0" />
                      <span>{formatValue(after)}</span>
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 mt-3 flex-wrap">
        {onApply && (
          <button
            data-testid="ai-care-apply-updates"
            onClick={handleApply}
            disabled={acking || applying}
            className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[36px] bg-amber-600 text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-amber-700 disabled:opacity-50 transition-colors"
          >
            {applying ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Applying…
              </>
            ) : (
              <>
                <Download size={14} /> Apply updates
              </>
            )}
          </button>
        )}
        <button
          data-testid="ai-care-mark-reviewed"
          onClick={handleAck}
          disabled={acking || applying}
          className={`inline-flex items-center gap-1.5 px-4 py-2 min-h-[36px] text-xs font-black uppercase tracking-widest rounded-xl disabled:opacity-50 transition-colors ${
            onApply
              ? "border border-amber-300 text-amber-800 hover:bg-amber-100"
              : "bg-amber-600 text-white hover:bg-amber-700"
          }`}
        >
          {acking ? (
            <>
              <Loader2 size={14} className="animate-spin" /> Saving…
            </>
          ) : (
            <>
              <Check size={14} /> Keep mine
            </>
          )}
        </button>
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
