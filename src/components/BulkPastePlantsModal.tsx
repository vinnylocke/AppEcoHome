import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Loader2,
  Sparkles,
  Trash2,
  Check,
  FileText,
  Leaf,
} from "lucide-react";
import toast from "react-hot-toast";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { parsePlantList, type ParsedPlant } from "../lib/parsePlantList";
import { saveToShed } from "../lib/saveToShed";
import { Logger } from "../lib/errorHandler";
import { logEvent, EVENT } from "../events/registry";

interface Props {
  homeId: string;
  /** Sage / Evergreen get the Gemini parser; others fall back to regex. */
  aiEnabled: boolean;
  onClose: () => void;
  onCreated?: (count: number) => void;
}

type Step = "paste" | "review";

const EXAMPLE = `Tomato Sungold x3
Lavender 'Hidcote' (12 plants, from RHS Wisley)
Pak Choi
Rose "Munstead Wood" x2
Calendula - hedging, mixed colours`;

/**
 * UX review 2026-06-15 item 4.1 — bulk paste a plant list into the Shed.
 *
 * Two-step flow (mirrors the Nursery's BulkPasteSeedPacketsModal):
 *
 *   Step 1 — Paste: a multiline textarea. Sage+ runs Gemini for fuzzy
 *   parsing; everyone else uses the regex fallback. Returned candidates
 *   land in the review step.
 *
 *   Step 2 — Review: each candidate row is editable inline. The user
 *   removes ones they don't want and taps Save. Each row goes through
 *   `saveToShed` as a `source: "manual"` plant — assigning to an area
 *   and creating inventory items happens in the Shed UI afterwards.
 */
export default function BulkPastePlantsModal({
  homeId, aiEnabled, onClose, onCreated,
}: Props) {
  const trapRef = useFocusTrap<HTMLDivElement>(true);
  const [step, setStep] = useState<Step>("paste");
  const [text, setText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parseSource, setParseSource] = useState<"ai" | "local" | null>(null);
  const [candidates, setCandidates] = useState<ParsedPlant[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = "unset"; };
  }, []);

  const lineCount = useMemo(
    () => text.split("\n").filter((l) => l.trim().length > 0).length,
    [text],
  );

  const handleParse = async () => {
    if (!text.trim()) return;
    setParsing(true);
    setParseError(null);
    try {
      const { plants, source } = await parsePlantList(text, { homeId, aiEnabled });
      setParseSource(source);
      if (plants.length === 0) {
        setParseError("Couldn't find any plants in that text. Try one plant per line.");
        return;
      }
      setCandidates(plants);
      setStep("review");
    } catch (err: any) {
      Logger.error("Bulk paste parse failed", err, { homeId });
      setParseError(err?.message ?? "Could not parse the list. Please try again.");
    } finally {
      setParsing(false);
    }
  };

  const updateCandidate = (idx: number, patch: Partial<ParsedPlant>) => {
    setCandidates((prev) => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  };

  const removeCandidate = (idx: number) => {
    setCandidates((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    if (candidates.length === 0) return;
    setSaving(true);
    let succeeded = 0;
    const failed: string[] = [];
    for (const plant of candidates) {
      try {
        const notes: string[] = [];
        if (plant.quantity) notes.push(`Bulk import: ${plant.quantity} plant${plant.quantity === 1 ? "" : "s"}`);
        if (plant.notes) notes.push(plant.notes);
        await saveToShed(
          {
            common_name: plant.common_name,
            source: "manual",
            // For bulk-paste rows we have minimal metadata; the user can
            // enrich each entry from the Shed afterwards (set image,
            // pick a variety, link to the catalogue via "edit").
            plant_metadata: {
              variety: plant.variety,
              bulk_import_notes: notes.length > 0 ? notes.join(" — ") : null,
            },
            labels: plant.variety ? [plant.variety.toLowerCase()] : null,
          },
          undefined,
          homeId,
        );
        succeeded += 1;
      } catch (err) {
        Logger.error("Bulk paste saveToShed failed", err, { homeId, common_name: plant.common_name });
        failed.push(plant.common_name);
      }
    }
    setSavedCount(succeeded);
    setSaving(false);
    logEvent(EVENT.BULK_PLANT_IMPORT_COMPLETED, {
      attempted: candidates.length,
      succeeded,
      failed: failed.length,
      source: parseSource,
    });
    if (failed.length === 0) {
      toast.success(`Added ${succeeded} plant${succeeded === 1 ? "" : "s"} to your Shed`);
      onCreated?.(succeeded);
      onClose();
    } else {
      toast.error(`Added ${succeeded}, but ${failed.length} failed (${failed.slice(0, 2).join(", ")}${failed.length > 2 ? "…" : ""}). Try again or add those manually.`);
      onCreated?.(succeeded);
    }
  };

  return createPortal(
    <div
      data-testid="bulk-paste-plants-modal"
      className="fixed inset-0 z-[120] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-paste-title"
        onClick={(e) => e.stopPropagation()}
        className="bg-rhozly-bg rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl border border-rhozly-outline/10 overflow-hidden animate-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-rhozly-outline/10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="shrink-0 w-9 h-9 rounded-2xl bg-rhozly-primary/10 text-rhozly-primary flex items-center justify-center">
              <Leaf size={16} />
            </div>
            <div className="min-w-0">
              <h2 id="bulk-paste-title" className="font-display font-black text-lg text-rhozly-on-surface truncate">
                Bulk paste plants
              </h2>
              <p className="text-[11px] font-bold text-rhozly-on-surface/45 leading-snug">
                {step === "paste"
                  ? "One plant per line — name + optional variety + optional quantity."
                  : `${candidates.length} plant${candidates.length === 1 ? "" : "s"} ready to add — edit or remove before saving.`}
              </p>
            </div>
          </div>
          <button
            data-testid="bulk-paste-close"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 p-2 rounded-xl text-rhozly-on-surface/40 hover:text-rhozly-on-surface hover:bg-rhozly-surface-low transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {step === "paste" ? (
            <div className="space-y-4">
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 text-xs font-bold text-emerald-900 leading-snug">
                <p className="font-black uppercase tracking-widest text-[10px] mb-1 text-emerald-700">
                  How to format
                </p>
                <p>
                  One plant per line. Accepted shapes:{" "}
                  <code className="font-mono text-emerald-800">Tomato Sungold</code>,{" "}
                  <code className="font-mono text-emerald-800">Lavender 'Hidcote'</code>,{" "}
                  <code className="font-mono text-emerald-800">Pak Choi (12 plants, summer)</code>,{" "}
                  <code className="font-mono text-emerald-800">Rose "Munstead" x3</code>.
                </p>
                {!aiEnabled && (
                  <p className="mt-2 text-emerald-800/80">
                    <Sparkles size={11} className="inline mr-1" />
                    Upgrade to Sage for fuzzy AI parsing — handles messier lists.
                  </p>
                )}
              </div>

              <textarea
                data-testid="bulk-paste-textarea"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={EXAMPLE}
                rows={10}
                className="w-full p-4 bg-white rounded-2xl border border-rhozly-outline/15 text-sm font-bold text-rhozly-on-surface outline-none focus:border-rhozly-primary transition-colors resize-none font-mono leading-relaxed"
              />

              <div className="flex items-center justify-between gap-3 text-xs font-bold text-rhozly-on-surface/50">
                <span>{lineCount} non-empty line{lineCount === 1 ? "" : "s"}</span>
                {parseError && (
                  <span className="text-red-600">{parseError}</span>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {parseSource && (
                <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40">
                  {parseSource === "ai" ? (
                    <><Sparkles size={11} className="inline mr-1 text-rhozly-primary" />Parsed by Rhozly AI</>
                  ) : (
                    <><FileText size={11} className="inline mr-1" />Parsed locally</>
                  )}
                </p>
              )}

              {candidates.length === 0 && (
                <div className="text-center p-8 border-2 border-dashed border-rhozly-outline/15 rounded-3xl bg-rhozly-surface-low/40">
                  <p className="text-sm font-bold text-rhozly-on-surface/50">
                    All rows removed. Go back to add more.
                  </p>
                </div>
              )}

              {candidates.map((c, idx) => (
                <div
                  key={idx}
                  data-testid={`bulk-paste-candidate-${idx}`}
                  className="bg-white border border-rhozly-outline/15 rounded-2xl p-3 flex items-start gap-2"
                >
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-12 gap-2 items-start">
                    <input
                      data-testid={`bulk-paste-candidate-name-${idx}`}
                      value={c.common_name}
                      onChange={(e) => updateCandidate(idx, { common_name: e.target.value })}
                      placeholder="Common name"
                      className="sm:col-span-5 px-3 py-2 min-h-[40px] bg-rhozly-surface-low rounded-xl text-sm font-bold text-rhozly-on-surface outline-none focus:bg-white focus:ring-2 focus:ring-rhozly-primary/30 border border-transparent focus:border-rhozly-primary/30 transition-all"
                    />
                    <input
                      data-testid={`bulk-paste-candidate-variety-${idx}`}
                      value={c.variety ?? ""}
                      onChange={(e) => updateCandidate(idx, { variety: e.target.value || null })}
                      placeholder="Variety (optional)"
                      className="sm:col-span-4 px-3 py-2 min-h-[40px] bg-rhozly-surface-low rounded-xl text-sm font-bold text-rhozly-on-surface outline-none focus:bg-white focus:ring-2 focus:ring-rhozly-primary/30 border border-transparent focus:border-rhozly-primary/30 transition-all"
                    />
                    <input
                      data-testid={`bulk-paste-candidate-quantity-${idx}`}
                      type="number"
                      value={c.quantity ?? ""}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        updateCandidate(idx, { quantity: Number.isFinite(n) && n > 0 ? n : null });
                      }}
                      placeholder="Qty"
                      min={1}
                      max={999}
                      className="sm:col-span-3 px-3 py-2 min-h-[40px] bg-rhozly-surface-low rounded-xl text-sm font-bold text-rhozly-on-surface outline-none focus:bg-white focus:ring-2 focus:ring-rhozly-primary/30 border border-transparent focus:border-rhozly-primary/30 transition-all"
                    />
                    {c.notes && (
                      <p className="sm:col-span-12 text-[11px] font-bold text-rhozly-on-surface/40 leading-snug">
                        {c.notes}
                      </p>
                    )}
                  </div>
                  <button
                    data-testid={`bulk-paste-candidate-remove-${idx}`}
                    onClick={() => removeCandidate(idx)}
                    aria-label="Remove this row"
                    className="shrink-0 p-2 rounded-xl text-rhozly-on-surface/40 hover:text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-rhozly-outline/10 px-5 py-4 flex items-center justify-between gap-3">
          {step === "paste" ? (
            <>
              <p className="text-[11px] font-bold text-rhozly-on-surface/45">
                {aiEnabled ? "Sage AI parser ready" : "Free regex parser"} — both produce the same review step.
              </p>
              <button
                data-testid="bulk-paste-parse"
                onClick={handleParse}
                disabled={parsing || !text.trim()}
                className="inline-flex items-center gap-2 px-5 py-2.5 min-h-[44px] rounded-2xl bg-rhozly-primary text-white text-sm font-black hover:opacity-90 disabled:opacity-40 transition shadow-sm"
              >
                {parsing ? (
                  <><Loader2 size={14} className="animate-spin" /> Parsing…</>
                ) : (
                  <>Parse list →</>
                )}
              </button>
            </>
          ) : (
            <>
              <button
                data-testid="bulk-paste-back"
                onClick={() => setStep("paste")}
                className="text-sm font-bold text-rhozly-on-surface/55 hover:text-rhozly-on-surface px-4 py-2 min-h-[44px] rounded-2xl transition"
              >
                ← Back to paste
              </button>
              <button
                data-testid="bulk-paste-save"
                onClick={handleSave}
                disabled={saving || candidates.length === 0}
                className="inline-flex items-center gap-2 px-5 py-2.5 min-h-[44px] rounded-2xl bg-rhozly-primary text-white text-sm font-black hover:opacity-90 disabled:opacity-40 transition shadow-sm"
              >
                {saving ? (
                  <><Loader2 size={14} className="animate-spin" /> Adding {savedCount} / {candidates.length}…</>
                ) : (
                  <><Check size={14} /> Add {candidates.length} plant{candidates.length === 1 ? "" : "s"} to Shed</>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
