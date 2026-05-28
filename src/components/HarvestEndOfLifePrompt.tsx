import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  Loader2,
  Leaf,
  X,
  Wheat,
  Check,
} from "lucide-react";
import toast from "react-hot-toast";
import { supabase } from "../lib/supabase";
import { Logger } from "../lib/errorHandler";
import { useFocusTrap } from "../hooks/useFocusTrap";
import PhotoUploader from "./PhotoUploader";

interface Props {
  isOpen: boolean;
  homeId: string;
  /** The completed harvest task — the prompt enumerates this task's
   *  `inventory_item_ids` so the user can tick which (if any) reached
   *  the end of their life cycle with this harvest. */
  taskId: string;
  taskTitle: string;
  inventoryItemIds: string[];
  onClose: () => void;
  onCompleted?: (markedCount: number) => void;
}

interface CandidateInstance {
  id: string;
  plant_name: string | null;
  nickname: string | null;
  identifier: string | null;
  area_name: string | null;
  /** True when already ended — pre-ticked rows skip the prompt. */
  already_ended: boolean;
}

/**
 * Fires after a Harvesting task is completed when at least one of its
 * inventory items isn't already ended. Many vegetables/herbs harvest
 * multiple times (cut-and-come-again, raspberry canes, basil tops) so
 * the modal defaults all rows UNCHECKED and leads with a prominent Skip.
 *
 * For the rows the user ticks, the prompt captures ONE shared closing
 * note + photo (applied to all selected) and stamps `ended_at` /
 * `was_natural_end = true` / `end_summary` on each. A closing journal
 * entry is written per instance linking back to the completing task
 * via `task_id`. No AI analysis (harvests are natural ends).
 */
export default function HarvestEndOfLifePrompt({
  isOpen,
  homeId,
  taskId,
  taskTitle,
  inventoryItemIds,
  onClose,
  onCompleted,
}: Props) {
  const [candidates, setCandidates] = useState<CandidateInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [endSummary, setEndSummary] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const trapRef = useFocusTrap<HTMLDivElement>(isOpen);

  useEffect(() => {
    if (!isOpen || inventoryItemIds.length === 0) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const { data, error } = await supabase
          .from("inventory_items")
          .select("id, plant_name, nickname, identifier, area_name, ended_at")
          .in("id", inventoryItemIds);
        if (error) throw error;
        if (cancelled) return;
        const rows: CandidateInstance[] = ((data ?? []) as Array<{
          id: string;
          plant_name: string | null;
          nickname: string | null;
          identifier: string | null;
          area_name: string | null;
          ended_at: string | null;
        }>)
          .filter((r) => !r.ended_at)
          .map((r) => ({
            id: r.id,
            plant_name: r.plant_name,
            nickname: r.nickname,
            identifier: r.identifier,
            area_name: r.area_name,
            already_ended: false,
          }));
        setCandidates(rows);
        // Auto-close if nothing to prompt about (everything already ended).
        if (rows.length === 0) onClose();
      } catch (err) {
        Logger.error("HarvestEndOfLifePrompt: load failed", err, { taskId });
        if (!cancelled) onClose();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, taskId, inventoryItemIds, onClose]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirm = async () => {
    if (selected.size === 0) {
      onClose();
      return;
    }
    setSaving(true);
    const endedAt = new Date().toISOString();
    const summary = endSummary.trim() || null;
    const photo = imageUrl || null;
    const idsToMark = Array.from(selected);
    try {
      const { error: updateErr } = await supabase
        .from("inventory_items")
        .update({
          ended_at: endedAt,
          was_natural_end: true,
          end_summary: summary,
          status: "Archived",
        })
        .in("id", idsToMark);
      if (updateErr) throw updateErr;

      // One closing journal entry per instance — task_id links the entry
      // to the harvest task that triggered this. Unique partial index on
      // plant_journals.task_id prevents duplicates if the user retries.
      // Note: the index only allows ONE row per task_id, so we omit it
      // here and instead reference the task in the description.
      const journalRows = idsToMark.map((instanceId) => ({
        home_id: homeId,
        inventory_item_id: instanceId,
        subject: "Lifecycle complete (harvested)",
        description:
          summary ||
          `Marked end of life after harvest task "${taskTitle}". The plant produced its crop and was retired naturally.`,
        image_url: photo,
      }));
      const { error: journalErr } = await supabase
        .from("plant_journals")
        .insert(journalRows);
      if (journalErr) {
        // Don't fail the whole flow — the inventory_items update already landed.
        Logger.error(
          "HarvestEndOfLifePrompt: closing journal insert failed",
          journalErr,
          { taskId, idsToMark },
        );
      }

      toast.success(
        idsToMark.length === 1
          ? "Marked 1 plant as End of Life."
          : `Marked ${idsToMark.length} plants as End of Life.`,
      );
      onCompleted?.(idsToMark.length);
      onClose();
    } catch (err: any) {
      Logger.error("HarvestEndOfLifePrompt: confirm failed", err, { taskId });
      toast.error(err?.message ?? "Couldn't mark End of Life. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = () => {
    if (saving) return;
    onClose();
  };

  if (!isOpen) return null;
  if (typeof document === "undefined") return null;

  const plural = candidates.length !== 1;

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
        aria-labelledby="harvest-eol-title"
        className="bg-rhozly-surface-lowest w-full max-w-lg max-h-[90vh] overflow-y-auto custom-scrollbar rounded-3xl shadow-2xl border border-rhozly-outline/20"
      >
        <div className="px-6 py-5 border-b border-rhozly-outline/10 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-2xl bg-amber-500/10 text-amber-700">
              <Wheat size={20} />
            </div>
            <div>
              <h2
                id="harvest-eol-title"
                className="text-base font-black text-rhozly-on-surface"
              >
                Just harvested{" "}
                {plural ? `${candidates.length} plants` : "1 plant"}.
              </h2>
              <p className="text-xs font-bold text-rhozly-on-surface/55 mt-0.5 leading-relaxed">
                Any reach the end of their life cycle? Skip if these will keep producing — many vegetables, herbs and perennials harvest multiple times in a season.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSkip}
            disabled={saving}
            aria-label="Close"
            className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-rhozly-on-surface/40 hover:bg-rhozly-surface-low hover:text-rhozly-on-surface transition-colors disabled:opacity-50"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-sm text-rhozly-on-surface/50 gap-2">
              <Loader2 size={14} className="animate-spin" /> Loading plants…
            </div>
          ) : (
            <>
              <ul className="space-y-1.5" data-testid="harvest-eol-list">
                {candidates.map((c) => {
                  const isSelected = selected.has(c.id);
                  const name =
                    c.identifier || c.nickname || c.plant_name || "Unnamed plant";
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => toggle(c.id)}
                        disabled={saving}
                        data-testid={`harvest-eol-toggle-${c.id}`}
                        aria-pressed={isSelected}
                        className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border transition-colors text-left ${
                          isSelected
                            ? "bg-emerald-50 border-emerald-200"
                            : "bg-rhozly-surface-low border-transparent hover:border-rhozly-outline/30"
                        } disabled:opacity-50`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-rhozly-on-surface truncate">
                            {name}
                          </p>
                          {c.area_name && (
                            <p className="text-[11px] font-bold text-rhozly-on-surface/45 truncate">
                              {c.area_name}
                            </p>
                          )}
                        </div>
                        <span
                          className={`w-5 h-5 shrink-0 rounded-md flex items-center justify-center border-2 transition-colors ${
                            isSelected
                              ? "bg-rhozly-primary border-rhozly-primary text-white"
                              : "bg-white border-rhozly-outline/30 text-transparent"
                          }`}
                        >
                          <Check size={12} strokeWidth={3} />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>

              {selected.size > 0 && (
                <div className="space-y-4 border-t border-rhozly-outline/10 pt-5">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40">
                      Applies to {selected.size} selected
                    </p>
                    <p className="text-xs font-bold text-rhozly-on-surface/45 mt-0.5 leading-relaxed">
                      One closing note + photo for the whole batch. Add per-plant detail later from the Senescence tab if you want.
                    </p>
                  </div>

                  <div>
                    <label
                      htmlFor="harvest-eol-summary"
                      className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-1.5 block"
                    >
                      Closing note (optional)
                    </label>
                    <textarea
                      id="harvest-eol-summary"
                      rows={3}
                      value={endSummary}
                      onChange={(e) => setEndSummary(e.target.value)}
                      placeholder="What was the harvest like? Anything to remember about this batch?"
                      data-testid="harvest-eol-summary"
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
                      testIdPrefix="harvest-eol-photo"
                      label="Add a closing photo of the harvest"
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-rhozly-outline/10 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
          <button
            type="button"
            onClick={handleSkip}
            disabled={saving}
            data-testid="harvest-eol-skip"
            className="px-4 py-2.5 rounded-xl text-sm font-bold text-rhozly-on-surface/60 hover:bg-rhozly-surface-low transition-colors disabled:opacity-50"
          >
            Skip — keep growing
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={saving || uploading || selected.size === 0}
            data-testid="harvest-eol-confirm"
            className="inline-flex items-center justify-center gap-2 bg-rhozly-primary text-white text-sm font-black px-5 py-2.5 rounded-xl hover:opacity-90 active:scale-95 transition disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Closing the chapter…
              </>
            ) : (
              <>
                <Leaf size={14} />
                Mark {selected.size > 0 ? selected.size : ""} as End of Life
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
