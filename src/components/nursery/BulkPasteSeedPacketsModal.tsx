import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  X, Loader2, Sparkles, Package, Trash2, Check, AlertCircle, FileText,
  ChevronRight,
} from "lucide-react";
import toast from "react-hot-toast";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import {
  parseSeedPackets,
  type ParsedSeedPacket,
} from "../../lib/parseSeedPackets";
import { createSeedPacket } from "../../services/nurseryService";
import { Logger } from "../../lib/errorHandler";
import { logEvent, EVENT } from "../../events/registry";

interface Props {
  homeId: string;
  /** Sage / Evergreen get the Gemini parser; others fall back to regex. */
  aiEnabled: boolean;
  onClose: () => void;
  onCreated?: (count: number) => void;
}

type Step = "paste" | "review";

const EXAMPLE = `Tomato Sungold (Suttons, sow-by 2028-12, ~30 seeds)
Sunflower Russian Giant (Sainsbury's, opened May 2024)
Beetroot 'Boltardy' / Real Seeds / sow by 2027-09 / ~100 seeds`;

/**
 * Two-step bulk add flow for The Nursery.
 *
 *   Step 1 — Paste: a multiline textarea. Sage+ runs Gemini for fuzzy
 *   parsing; everyone else uses the strict regex fallback. Returned
 *   candidates land in the review step.
 *
 *   Step 2 — Review: each candidate row is editable inline. The user
 *   removes ones they don't want and taps Save. We batch-insert via
 *   `createSeedPacket` per row (serial — keeps RLS + uniqueness checks
 *   straightforward and lets us partial-succeed when one row trips
 *   validation).
 *
 * NOTE: bulk-paste rows are inserted with `plant_id = null` since the
 * paste doesn't carry a Library/Shed link. Users can edit individual
 * packets later to attach the catalogue plant (required before they can
 * Plant Out, which is the only flow that hard-needs `plant_id`).
 */
export default function BulkPasteSeedPacketsModal({
  homeId, aiEnabled, onClose, onCreated,
}: Props) {
  const trapRef = useFocusTrap<HTMLDivElement>(true);
  const [step, setStep] = useState<Step>("paste");
  const [text, setText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parseSource, setParseSource] = useState<"ai" | "local" | null>(null);
  const [candidates, setCandidates] = useState<ParsedSeedPacket[]>([]);
  const [saving, setSaving] = useState(false);

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
      const { packets, source } = await parseSeedPackets(text, {
        homeId,
        aiEnabled,
      });
      setParseSource(source);
      if (packets.length === 0) {
        setParseError(
          aiEnabled
            ? "We couldn't extract anything from that paste. Try one packet per line."
            : "Couldn't match any lines. Try the format \"Tomato Sungold (Suttons, sow-by 2028-12, ~30 seeds)\".",
        );
        return;
      }
      setCandidates(packets);
      setStep("review");
    } catch (err) {
      Logger.error("BulkPasteSeedPacketsModal parse failed", err, { homeId });
      setParseError(
        err instanceof Error
          ? err.message
          : "Couldn't parse the paste — try again.",
      );
    } finally {
      setParsing(false);
    }
  };

  const handleSave = async () => {
    if (candidates.length === 0) return;
    setSaving(true);
    let succeeded = 0;
    let failed = 0;
    try {
      for (const c of candidates) {
        try {
          await createSeedPacket({
            home_id: homeId,
            plant_id: null,
            variety: c.variety,
            vendor: c.vendor,
            purchased_on: c.purchased_on,
            opened_on: c.opened_on,
            sow_by: c.sow_by,
            quantity_remaining: c.quantity_remaining,
            notes: buildNotes(c),
          });
          logEvent(EVENT.NURSERY_PACKET_ADDED, {
            via: "bulk-paste",
            source: parseSource ?? "local",
          });
          succeeded++;
        } catch (rowErr) {
          Logger.error("Bulk paste row insert failed", rowErr, {
            common_name: c.common_name,
          });
          failed++;
        }
      }
      if (succeeded > 0) {
        toast.success(
          failed > 0
            ? `Added ${succeeded} packet${succeeded === 1 ? "" : "s"} — ${failed} row${failed === 1 ? "" : "s"} couldn't be saved.`
            : `Added ${succeeded} packet${succeeded === 1 ? "" : "s"} to your Nursery.`,
        );
      } else {
        toast.error("Couldn't save any of the rows — try again.");
      }
      onCreated?.(succeeded);
      if (succeeded > 0) onClose();
    } finally {
      setSaving(false);
    }
  };

  const removeRow = (idx: number) => {
    setCandidates((prev) => prev.filter((_, i) => i !== idx));
  };

  const patchRow = (idx: number, patch: Partial<ParsedSeedPacket>) => {
    setCandidates((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, ...patch } : row)),
    );
  };

  return createPortal(
    <div
      data-testid="bulk-paste-seed-packets-modal"
      className="fixed inset-0 z-[120] flex items-end sm:items-center sm:justify-center bg-black/40 backdrop-blur-sm animate-in fade-in"
      onClick={onClose}
    >
      <div
        ref={trapRef}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full sm:max-w-2xl bg-rhozly-bg rounded-t-3xl sm:rounded-3xl shadow-2xl border border-rhozly-outline/15 flex flex-col max-h-[92vh] overflow-hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <header className="shrink-0 px-5 pt-4 pb-3 flex items-start justify-between gap-3 border-b border-rhozly-outline/10">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-primary mb-0.5 flex items-center gap-1">
              {aiEnabled && step === "paste" ? <Sparkles size={11} /> : <FileText size={11} />}
              Bulk add — Step {step === "paste" ? 1 : 2} of 2
            </p>
            <h2 className="font-display font-black text-rhozly-on-surface text-lg leading-tight">
              {step === "paste" ? "Paste your packet list" : `Review ${candidates.length} packet${candidates.length === 1 ? "" : "s"}`}
            </h2>
            {step === "review" && parseSource && (
              <p className="text-[11px] text-rhozly-on-surface/55 mt-0.5">
                Parsed by{" "}
                <span className="font-bold text-rhozly-on-surface/75">
                  {parseSource === "ai" ? "Rhozly AI" : "the strict text parser"}
                </span>
                . Edit anything that's off; remove anything you don't want.
              </p>
            )}
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

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {step === "paste" && (
            <PasteStep
              aiEnabled={aiEnabled}
              text={text}
              setText={setText}
              lineCount={lineCount}
              parseError={parseError}
            />
          )}
          {step === "review" && (
            <ReviewStep
              candidates={candidates}
              onPatchRow={patchRow}
              onRemoveRow={removeRow}
            />
          )}
        </div>

        <footer className="shrink-0 px-5 py-3 border-t border-rhozly-outline/10 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={step === "review" ? () => setStep("paste") : onClose}
            className="px-3 py-2 min-h-[40px] rounded-xl text-rhozly-on-surface/60 hover:text-rhozly-on-surface text-[11px] font-black uppercase tracking-widest"
          >
            {step === "review" ? "Back" : "Cancel"}
          </button>
          {step === "paste" ? (
            <button
              type="button"
              data-testid="bulk-paste-parse"
              onClick={handleParse}
              disabled={!text.trim() || parsing}
              className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] rounded-xl bg-rhozly-primary text-white text-[11px] font-black uppercase tracking-widest hover:opacity-95 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {parsing ? <Loader2 size={13} className="animate-spin" /> : <ChevronRight size={13} />}
              {parsing
                ? "Parsing…"
                : aiEnabled
                  ? "Parse with AI"
                  : `Parse ${lineCount} line${lineCount === 1 ? "" : "s"}`}
            </button>
          ) : (
            <button
              type="button"
              data-testid="bulk-paste-save"
              onClick={handleSave}
              disabled={candidates.length === 0 || saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] rounded-xl bg-rhozly-primary text-white text-[11px] font-black uppercase tracking-widest hover:opacity-95 transition disabled:opacity-50"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              Add {candidates.length} packet{candidates.length === 1 ? "" : "s"}
            </button>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  );
}

// ── Steps ─────────────────────────────────────────────────────────────────

function PasteStep({
  aiEnabled, text, setText, lineCount, parseError,
}: {
  aiEnabled: boolean;
  text: string;
  setText: (v: string) => void;
  lineCount: number;
  parseError: string | null;
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-rhozly-on-surface/65 leading-snug">
        Paste one packet per line. {aiEnabled ? (
          <>
            We'll use AI to pull out the variety, vendor, sow-by, opened-on
            and notes — your wording doesn't have to be perfect.
          </>
        ) : (
          <>
            We'll match each line against the format:{" "}
            <span className="font-mono font-bold text-rhozly-on-surface/85">
              Tomato Sungold (Suttons, sow-by 2028-12, ~30 seeds)
            </span>
          </>
        )}
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={EXAMPLE}
        rows={9}
        data-testid="bulk-paste-textarea"
        className="w-full p-3 rounded-2xl bg-white border border-rhozly-outline/20 text-sm font-mono text-rhozly-on-surface focus:outline-none focus:border-rhozly-primary/40 focus:ring-2 focus:ring-rhozly-primary/15 resize-none min-h-[200px]"
      />

      <div className="flex items-center justify-between text-[11px] font-bold text-rhozly-on-surface/55">
        <span>{lineCount} line{lineCount === 1 ? "" : "s"} ready</span>
        {!aiEnabled && (
          <span className="text-amber-700">
            Sage gets AI parsing — supports much looser formats.
          </span>
        )}
      </div>

      {parseError && (
        <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
          <AlertCircle size={13} className="shrink-0 mt-0.5" />
          <span>{parseError}</span>
        </div>
      )}
    </div>
  );
}

function ReviewStep({
  candidates, onPatchRow, onRemoveRow,
}: {
  candidates: ParsedSeedPacket[];
  onPatchRow: (idx: number, patch: Partial<ParsedSeedPacket>) => void;
  onRemoveRow: (idx: number) => void;
}) {
  if (candidates.length === 0) {
    return (
      <p className="text-sm font-bold text-rhozly-on-surface/55 text-center py-8">
        Nothing left to add — tap Back to paste again or Cancel to close.
      </p>
    );
  }
  return (
    <ul className="space-y-2.5">
      {candidates.map((row, i) => (
        <li
          key={i}
          data-testid={`bulk-paste-row-${i}`}
          className="rounded-2xl bg-white border border-rhozly-outline/15 p-3 space-y-2.5"
        >
          <div className="flex items-start gap-2.5">
            <span className="shrink-0 w-9 h-9 rounded-xl bg-rhozly-primary/10 text-rhozly-primary flex items-center justify-center">
              <Package size={15} />
            </span>
            <div className="flex-1 min-w-0 grid grid-cols-2 gap-2">
              <InlineField
                label="Plant"
                value={row.common_name}
                onChange={(v) => onPatchRow(i, { common_name: v })}
                testId={`bulk-paste-row-${i}-common-name`}
              />
              <InlineField
                label="Variety"
                value={row.variety ?? ""}
                onChange={(v) => onPatchRow(i, { variety: v || null })}
                testId={`bulk-paste-row-${i}-variety`}
              />
              <InlineField
                label="Vendor"
                value={row.vendor ?? ""}
                onChange={(v) => onPatchRow(i, { vendor: v || null })}
                testId={`bulk-paste-row-${i}-vendor`}
              />
              <InlineField
                label="Quantity"
                value={row.quantity_remaining ?? ""}
                onChange={(v) => onPatchRow(i, { quantity_remaining: v || null })}
                testId={`bulk-paste-row-${i}-qty`}
              />
              <InlineField
                label="Sow by"
                type="date"
                value={row.sow_by ?? ""}
                onChange={(v) => onPatchRow(i, { sow_by: v || null })}
                testId={`bulk-paste-row-${i}-sow-by`}
              />
              <InlineField
                label="Opened"
                type="date"
                value={row.opened_on ?? ""}
                onChange={(v) => onPatchRow(i, { opened_on: v || null })}
                testId={`bulk-paste-row-${i}-opened`}
              />
            </div>
            <button
              type="button"
              data-testid={`bulk-paste-row-${i}-remove`}
              onClick={() => onRemoveRow(i)}
              aria-label="Remove this row"
              className="shrink-0 w-9 h-9 rounded-xl text-rhozly-on-surface/40 hover:text-red-600 hover:bg-red-50 flex items-center justify-center"
            >
              <Trash2 size={14} />
            </button>
          </div>
          {row.notes && (
            <p className="text-[11px] text-rhozly-on-surface/60 italic leading-snug">
              Note: {row.notes}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

function InlineField({
  label, value, onChange, type = "text", testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: "text" | "date";
  testId?: string;
}) {
  return (
    <label className="block">
      <span className="block text-[9px] font-black uppercase tracking-widest text-rhozly-on-surface/50 mb-1">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testId}
        className="w-full px-2.5 py-1.5 min-h-[36px] rounded-lg bg-rhozly-surface-low border border-rhozly-outline/15 text-[12px] font-bold text-rhozly-on-surface focus:outline-none focus:border-rhozly-primary/40 focus:bg-white"
      />
    </label>
  );
}

/**
 * Bulk-paste rows arrive without a plant_id link. We stash the parsed
 * "common name" string into notes so the user can recover it when they
 * later open the packet detail to link it to a catalogue plant — the
 * packets table itself doesn't have a free-text plant-name column.
 */
function buildNotes(candidate: ParsedSeedPacket): string | null {
  const provenance = `Bulk-paste import — plant: "${candidate.common_name}".`;
  if (!candidate.notes?.trim()) return provenance;
  return `${candidate.notes.trim()}\n${provenance}`;
}
