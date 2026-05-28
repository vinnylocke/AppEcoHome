import React, { useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Leaf, X } from "lucide-react";
import toast from "react-hot-toast";
import { supabase } from "../lib/supabase";
import { Logger } from "../lib/errorHandler";
import { useFocusTrap } from "../hooks/useFocusTrap";
import PhotoUploader from "./PhotoUploader";
import type { LifecycleAnalysis } from "../types";

interface Props {
  isOpen: boolean;
  instanceId: string;
  homeId: string;
  plantName: string;
  /** True when the user's tier supports AI analysis. */
  aiEnabled: boolean;
  onClose: () => void;
  /** Called after a successful save + (optional) analysis. */
  onCompleted: (result: {
    wasNaturalEnd: boolean;
    analysis: LifecycleAnalysis | null;
  }) => void;
}

/**
 * Lifecycle Complete Modal — the friendly "this plant's journey is over"
 * flow that replaces the cold archive toggle.
 *
 * Captures:
 * - optional final photo (kept as a closing memento on the journal entry)
 * - optional note (`end_summary`)
 * - "this plant reached the end of its natural life" checkbox (default off)
 *
 * On confirm:
 * - Sets `inventory_items.ended_at`, `was_natural_end`, `end_summary`
 * - Sets `inventory_items.status = "Archived"` (preserves existing queries)
 * - Inserts a closing `plant_journals` entry (subject "Lifecycle complete"
 *   or "Lifecycle complete (natural)")
 * - When NOT natural AND AI-enabled, calls `analyse-plant-end-of-life`
 *   and saves the result as a second journal entry — handed back to the
 *   parent for presentation in LifecycleAnalysisModal.
 */
export default function LifecycleCompleteModal({
  isOpen,
  instanceId,
  homeId,
  plantName,
  aiEnabled,
  onClose,
  onCompleted,
}: Props) {
  const [endSummary, setEndSummary] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [wasNaturalEnd, setWasNaturalEnd] = useState(false);
  const [saving, setSaving] = useState(false);
  const trapRef = useFocusTrap<HTMLDivElement>(isOpen);

  const handleConfirm = async () => {
    setSaving(true);
    const endedAt = new Date().toISOString();
    try {
      // 1) Stamp lifecycle-end columns on the instance.
      const { error: updateErr } = await supabase
        .from("inventory_items")
        .update({
          ended_at: endedAt,
          was_natural_end: wasNaturalEnd,
          end_summary: endSummary.trim() || null,
          status: "Archived",
        })
        .eq("id", instanceId);
      if (updateErr) throw updateErr;

      // 2) Save the closing journal entry (always — natural or not).
      const closingSubject = wasNaturalEnd
        ? "Lifecycle complete (natural)"
        : "Lifecycle complete";
      const closingDescription =
        endSummary.trim() ||
        (wasNaturalEnd
          ? `${plantName} reached the end of its natural life.`
          : `${plantName}'s journey ended.`);
      const { error: journalErr } = await supabase.from("plant_journals").insert({
        home_id: homeId,
        inventory_item_id: instanceId,
        subject: closingSubject,
        description: closingDescription,
        image_url: imageUrl || null,
      });
      if (journalErr) {
        Logger.error("LifecycleCompleteModal: closing entry insert failed", journalErr);
      }

      // 3) Run AI analysis when warranted.
      let analysis: LifecycleAnalysis | null = null;
      if (!wasNaturalEnd && aiEnabled) {
        try {
          const { data, error: fnErr } = await supabase.functions.invoke(
            "analyse-plant-end-of-life",
            {
              body: { instance_id: instanceId },
            },
          );
          if (fnErr) throw fnErr;
          if (data && typeof data === "object") {
            analysis = data as LifecycleAnalysis;
          }
        } catch (err) {
          Logger.error("LifecycleCompleteModal: analysis failed", err);
          // Soft-fail — the closing entry is already saved; user still sees
          // a graceful completion screen.
        }
      }

      onCompleted({ wasNaturalEnd, analysis });
    } catch (err: any) {
      Logger.error("LifecycleCompleteModal: confirm failed", err, { instanceId });
      toast.error(err?.message ?? "Couldn't complete the lifecycle. Try again.");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-rhozly-bg/95 backdrop-blur-xl animate-in fade-in duration-300"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="lifecycle-complete-title"
        className="bg-rhozly-surface-lowest w-full max-w-lg max-h-[90vh] overflow-y-auto custom-scrollbar rounded-3xl shadow-2xl border border-rhozly-outline/20"
      >
        <div className="px-6 py-5 border-b border-rhozly-outline/10 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-2xl bg-rhozly-primary/10 text-rhozly-primary">
              <Leaf size={20} />
            </div>
            <div>
              <h2
                id="lifecycle-complete-title"
                className="text-lg font-black text-rhozly-on-surface"
              >
                {plantName}'s journey
              </h2>
              <p className="text-xs font-bold text-rhozly-on-surface/50 mt-0.5 leading-relaxed">
                Mark this plant's lifecycle as complete. It stays in your records — you can revisit its journal any time.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close"
            className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-rhozly-on-surface/40 hover:bg-rhozly-surface-low hover:text-rhozly-on-surface transition-colors disabled:opacity-50"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-1.5 block">
              A note to close the chapter (optional)
            </label>
            <textarea
              rows={3}
              value={endSummary}
              onChange={(e) => setEndSummary(e.target.value)}
              placeholder="Anything you want to remember about this plant? What grew well? What you learned?"
              data-testid="lifecycle-end-summary"
              className="w-full px-4 py-3 bg-rhozly-surface-low rounded-2xl font-bold text-sm border border-transparent focus:border-rhozly-primary outline-none resize-y"
            />
          </div>

          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-1.5 block">
              Final photo (optional)
            </label>
            <PhotoUploader
              bucket="plant-images"
              pathPrefix={`journal/${homeId}/lifecycle`}
              value={imageUrl || null}
              onChange={(url) => setImageUrl(url ?? "")}
              onUploadStart={() => setUploading(true)}
              onUploadEnd={() => setUploading(false)}
              testIdPrefix="lifecycle-photo"
              label="Add a closing photo"
            />
          </div>

          <label
            className="flex items-start gap-3 p-4 bg-rhozly-surface-low rounded-2xl cursor-pointer"
            data-testid="lifecycle-natural-end-label"
          >
            <input
              type="checkbox"
              checked={wasNaturalEnd}
              onChange={(e) => setWasNaturalEnd(e.target.checked)}
              data-testid="lifecycle-natural-end-checkbox"
              className="mt-0.5 w-5 h-5 rounded accent-rhozly-primary cursor-pointer"
            />
            <div className="flex-1 text-sm">
              <p className="font-black text-rhozly-on-surface">
                This plant reached the end of its natural life
              </p>
              <p className="text-xs font-bold text-rhozly-on-surface/50 mt-0.5 leading-relaxed">
                Tick if it was an annual finishing its season, a successful harvest, or the plant simply reached the end of its natural span. Leave unticked if something went wrong — {aiEnabled ? "Rhozly will look through your journal, tasks, weather, and area details to suggest what might have happened." : "you can review your records to learn from it."}
              </p>
            </div>
          </label>
        </div>

        <div className="px-6 py-4 border-t border-rhozly-outline/10 flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            data-testid="lifecycle-cancel"
            className="px-4 py-2.5 rounded-xl text-sm font-bold text-rhozly-on-surface/60 hover:bg-rhozly-surface-low transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={saving || uploading}
            data-testid="lifecycle-confirm"
            className="flex items-center gap-2 bg-rhozly-primary text-white text-sm font-black px-5 py-2.5 rounded-xl hover:opacity-90 active:scale-95 transition disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                {wasNaturalEnd
                  ? "Closing the chapter…"
                  : aiEnabled
                    ? "Looking back over your records…"
                    : "Closing the chapter…"}
              </>
            ) : (
              <>
                <Leaf size={14} />
                Mark lifecycle complete
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
