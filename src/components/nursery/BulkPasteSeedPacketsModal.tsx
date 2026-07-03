import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  X, Loader2, Sparkles, Package, Trash2, Check, AlertCircle, FileText,
  ChevronRight, Upload, Download, Heart, AlertTriangle,
} from "lucide-react";
import toast from "react-hot-toast";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { supabase } from "../../lib/supabase";
import {
  parseSeedPackets,
  type ParsedSeedPacket,
} from "../../lib/parseSeedPackets";
import { createSeedPacket } from "../../services/nurseryService";
import { favouriteSeedPacket } from "../../services/favouritesService";
import {
  SEED_PACKET_TEMPLATE,
  parseCsv,
  downloadTemplate,
  MAX_DATA_ROWS,
  type ParsedRow,
  type RowIssue,
} from "../../lib/uploadTemplates";
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
type Mode = "paste" | "csv";

const EXAMPLE = `Tomato Sungold (Suttons, sow-by 2028-12, ~30 seeds)
Sunflower Russian Giant (Sainsbury's, opened May 2024)
Beetroot 'Boltardy' / Real Seeds / sow by 2027-09 / ~100 seeds`;

/**
 * A single review candidate — normalised across BOTH entry paths. Free-text /
 * AI paste produces one from a ParsedSeedPacket; the CSV path carries the
 * SEED_PACKET_TEMPLATE payload plus per-row/per-field issues and a favourite
 * flag. `plantName` is the link-by-name string (packet's plant), resolved to a
 * plant_id at save time.
 */
interface Candidate {
  plantName: string;
  variety: string | null;
  vendor: string | null;
  purchased_on: string | null;
  opened_on: string | null;
  sow_by: string | null;
  quantity_remaining: string | null;
  notes: string | null;
  favourite: boolean;
  issues: RowIssue[];
  valid: boolean;
}

/** Turn a free-text/AI ParsedSeedPacket into the shared Candidate shape. */
function candidateFromParsed(p: ParsedSeedPacket): Candidate {
  return {
    plantName: p.common_name,
    variety: p.variety,
    vendor: p.vendor,
    purchased_on: p.purchased_on,
    opened_on: p.opened_on,
    sow_by: p.sow_by,
    quantity_remaining: p.quantity_remaining,
    notes: p.notes,
    favourite: false,
    issues: [],
    valid: true,
  };
}

/** Turn a CSV ParsedRow into the shared Candidate shape. */
function candidateFromCsvRow(row: ParsedRow): Candidate {
  const p = row.payload as Record<string, unknown>;
  const str = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v.trim() : null;
  return {
    plantName: (p.plant_name as string) ?? "",
    variety: str(p.variety),
    vendor: str(p.vendor),
    purchased_on: str(p.purchased_on),
    opened_on: str(p.opened_on),
    sow_by: str(p.sow_by),
    quantity_remaining: str(p.quantity_remaining),
    notes: str(p.notes),
    favourite: row.favourite,
    issues: row.issues,
    valid: row.valid,
  };
}

/**
 * Bulk-add rows arrive as a plant name, not a plant_id. We resolve the name
 * against the home's Shed (case-insensitive exact match); when nothing matches
 * we keep plant_id null and stash the parsed name in a notes provenance line so
 * the user can recover it when they later open the packet to link it — the
 * packets table has no free-text plant-name column. Uploaded packets follow the
 * SAME convention as the existing paste flow.
 */
function buildNotes(candidate: Candidate): string | null {
  const provenance = `Bulk import — plant: "${candidate.plantName}".`;
  if (!candidate.notes?.trim()) return provenance;
  return `${candidate.notes.trim()}\n${provenance}`;
}

/**
 * RHO-4 Phase 3 (FINAL) — bulk add seed packets to The Nursery.
 *
 * A mode toggle offers "Paste a list" (free-text → parse-seed-packets on Sage+,
 * regex fallback otherwise — unchanged) and "Upload CSV" (strict parse against
 * SEED_PACKET_TEMPLATE, deterministic + tier-free). Both feed the SAME review
 * step, which has per-row/per-field error display, editable fields per row, a
 * per-row favourite checkbox and a "Mark all as favourites" toggle. On import
 * each valid row resolves plant_name → plant_id (link-by-name; unmatched → null
 * + notes provenance) then inserts via `createSeedPacket`; rows whose favourite
 * flag is set then call `favouriteSeedPacket()` on the new packet (packets are
 * ungated — always allowed).
 */
export default function BulkPasteSeedPacketsModal({
  homeId, aiEnabled, onClose, onCreated,
}: Props) {
  const trapRef = useFocusTrap<HTMLDivElement>(true);
  const [step, setStep] = useState<Step>("paste");
  const [mode, setMode] = useState<Mode>("paste");
  const [text, setText] = useState("");
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parseSource, setParseSource] = useState<"ai" | "local" | "csv" | null>(null);
  const [fileIssues, setFileIssues] = useState<RowIssue[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
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
  const validCount = useMemo(() => candidates.filter((c) => c.valid).length, [candidates]);
  const allFavourited = useMemo(
    () => candidates.length > 0 && candidates.every((c) => c.favourite),
    [candidates],
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
      setCandidates(packets.map(candidateFromParsed));
      setFileIssues([]);
      setStep("review");
    } catch (err) {
      Logger.error("BulkPasteSeedPacketsModal parse failed", err, { homeId });
      setParseError(
        err instanceof Error ? err.message : "Couldn't parse the paste — try again.",
      );
    } finally {
      setParsing(false);
    }
  };

  const handleCsvText = (csvText: string) => {
    setParseError(null);
    const result = parseCsv(csvText, SEED_PACKET_TEMPLATE);
    const blockingFileError = result.issues.find(
      (i) => i.severity === "error" && i.field === null,
    );
    if (result.rows.length === 0 && blockingFileError) {
      setParseError(blockingFileError.message);
      return;
    }
    if (result.rows.length === 0) {
      setParseError("No data rows found. Download the template and try again.");
      return;
    }
    setParseSource("csv");
    setFileIssues(result.issues.filter((i) => i.rowNumber === 0));
    setCandidates(result.rows.map(candidateFromCsvRow));
    setStep("review");
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);
    if (file.size > 200 * 1024) {
      setParseError("That file is too large — split it and import in smaller batches.");
      return;
    }
    setParsing(true);
    try {
      const content = await file.text();
      handleCsvText(content);
    } catch (err) {
      Logger.error("Seed-packet CSV read failed", err, { homeId });
      setParseError("Could not read that file.");
    } finally {
      setParsing(false);
    }
  };

  const patchRow = (idx: number, patch: Partial<Candidate>) => {
    setCandidates((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, ...patch } : row)),
    );
  };

  const removeRow = (idx: number) => {
    setCandidates((prev) => prev.filter((_, i) => i !== idx));
  };

  const toggleAllFavourites = () => {
    const target = !allFavourited;
    setCandidates((prev) => prev.map((c) => ({ ...c, favourite: target })));
  };

  const handleSave = async () => {
    const toSave = candidates.filter((c) => c.valid);
    if (toSave.length === 0) return;
    setSaving(true);

    // Link-by-name: fetch the home's Shed plants once and build a
    // case-insensitive name → id map. Unmatched names stay unlinked (plant_id
    // null) with the name preserved in a notes provenance line (existing
    // convention). Best-effort — a failed fetch just leaves everything unlinked.
    const nameToId = new Map<string, number>();
    try {
      const { data: homePlants } = await supabase
        .from("plants")
        .select("id, common_name")
        .eq("home_id", homeId)
        .eq("is_archived", false);
      for (const p of homePlants ?? []) {
        const key = (p.common_name as string | null)?.trim().toLowerCase();
        if (key && !nameToId.has(key)) nameToId.set(key, p.id as number);
      }
    } catch (err) {
      Logger.warn("Bulk packet link-by-name plant fetch failed", { homeId, err });
    }

    let favourited = 0;
    let succeeded = 0;
    const failed: string[] = [];
    for (const c of toSave) {
      try {
        const nameKey = c.plantName.trim().toLowerCase();
        const plantId = nameKey ? nameToId.get(nameKey) ?? null : null;
        const created = await createSeedPacket({
          home_id: homeId,
          plant_id: plantId,
          variety: c.variety,
          vendor: c.vendor,
          purchased_on: c.purchased_on,
          opened_on: c.opened_on,
          sow_by: c.sow_by,
          quantity_remaining: c.quantity_remaining,
          // When linked, no provenance line is needed (the plant_id carries the
          // identity); when unlinked, preserve the name for later linking.
          notes: plantId != null ? c.notes : buildNotes(c),
        });
        succeeded++;
        if (c.favourite) {
          try {
            await favouriteSeedPacket(
              {
                id: created.id,
                home_id: homeId,
                plant_id: created.plant_id,
                variety: created.variety,
                vendor: created.vendor,
                image_url: created.image_url ?? null,
                plant_common_name: c.plantName.trim() || null,
                sow_by: created.sow_by,
                notes: created.notes,
                quantity_remaining: created.quantity_remaining,
                purchased_on: created.purchased_on,
                opened_on: created.opened_on,
              },
              homeId,
            );
            favourited++;
          } catch (favErr) {
            Logger.warn("Bulk packet import favourite failed", { homeId, favErr });
          }
        }
      } catch (rowErr) {
        Logger.error("Bulk packet import insert failed", rowErr, {
          plantName: c.plantName,
        });
        failed.push(c.plantName || "(unnamed)");
      }
    }

    setSavedCount(succeeded);
    setSaving(false);
    logEvent(EVENT.BULK_PACKET_IMPORT_COMPLETED, {
      attempted: toSave.length,
      succeeded,
      failed: failed.length,
      favourited,
      mode: parseSource === "csv" ? "csv" : "paste",
      source: parseSource,
    });

    if (succeeded > 0) {
      const favNote = favourited > 0 ? ` (${favourited} favourited)` : "";
      toast.success(
        failed.length > 0
          ? `Added ${succeeded} packet${succeeded === 1 ? "" : "s"}${favNote} — ${failed.length} row${failed.length === 1 ? "" : "s"} couldn't be saved.`
          : `Added ${succeeded} packet${succeeded === 1 ? "" : "s"} to your Nursery${favNote}.`,
      );
    } else {
      toast.error("Couldn't save any of the rows — try again.");
    }
    onCreated?.(succeeded);
    if (succeeded > 0) onClose();
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
              {step === "review" ? <Package size={11} /> : mode === "csv" ? <Upload size={11} /> : aiEnabled ? <Sparkles size={11} /> : <FileText size={11} />}
              Bulk add — Step {step === "paste" ? 1 : 2} of 2
            </p>
            <h2 className="font-display font-black text-rhozly-on-surface text-lg leading-tight">
              {step === "paste"
                ? "Add your seed packets"
                : `Review ${candidates.length} packet${candidates.length === 1 ? "" : "s"}`}
            </h2>
            {step === "review" && parseSource && (
              <p className="text-[11px] text-rhozly-on-surface/55 mt-0.5">
                {parseSource === "csv"
                  ? "Imported from CSV. Edit anything that's off; remove anything you don't want."
                  : (
                    <>
                      Parsed by{" "}
                      <span className="font-bold text-rhozly-on-surface/75">
                        {parseSource === "ai" ? "Rhozly AI" : "the strict text parser"}
                      </span>
                      . Edit anything that's off; remove anything you don't want.
                    </>
                  )}
              </p>
            )}
          </div>
          <button
            type="button"
            data-testid="bulk-paste-close"
            onClick={onClose}
            aria-label="Close"
            className="w-10 h-10 rounded-2xl bg-white border border-rhozly-outline/15 text-rhozly-on-surface/60 hover:text-rhozly-primary flex items-center justify-center"
          >
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {step === "paste" && (
            <div className="space-y-3">
              {/* Mode toggle */}
              <div
                data-testid="bulk-paste-mode-toggle"
                className="grid grid-cols-2 gap-1 p-1 bg-rhozly-surface-low rounded-2xl"
              >
                <button
                  type="button"
                  data-testid="bulk-paste-mode-paste"
                  onClick={() => { setMode("paste"); setParseError(null); }}
                  className={`py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-colors ${mode === "paste" ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-on-surface/50"}`}
                >
                  <FileText size={13} className="inline mr-1.5" /> Paste a list
                </button>
                <button
                  type="button"
                  data-testid="bulk-paste-mode-csv"
                  onClick={() => { setMode("csv"); setParseError(null); }}
                  className={`py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-colors ${mode === "csv" ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-on-surface/50"}`}
                >
                  <Upload size={13} className="inline mr-1.5" /> Upload CSV
                </button>
              </div>

              {mode === "paste" ? (
                <PasteStep
                  aiEnabled={aiEnabled}
                  text={text}
                  setText={setText}
                  lineCount={lineCount}
                  parseError={parseError}
                />
              ) : (
                <div className="space-y-3">
                  <div className="bg-sky-50 border border-sky-200 rounded-2xl px-4 py-3 text-xs font-bold text-sky-900 leading-snug">
                    <p className="font-black uppercase tracking-widest text-[10px] mb-1 text-sky-700">
                      CSV upload — full fields
                    </p>
                    <p>
                      Download the template, fill one row per packet, then upload it here.
                      <code className="font-mono"> plant_name</code> is required and links each
                      packet to a plant already in your Shed (unmatched names stay unlinked).
                      Dates accept <code className="font-mono">YYYY-MM-DD</code>,{" "}
                      <code className="font-mono">YYYY-MM</code> or{" "}
                      <code className="font-mono">Month YYYY</code>; up to {MAX_DATA_ROWS} rows.
                      Tick the <code className="font-mono">favourite</code> column to save rows to your favourites.
                    </p>
                  </div>

                  <button
                    type="button"
                    data-testid="csv-template-download"
                    onClick={() => downloadTemplate(SEED_PACKET_TEMPLATE)}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-white border border-rhozly-outline/20 text-rhozly-primary text-sm font-black hover:border-rhozly-primary/30 hover:bg-rhozly-primary/5 transition-colors"
                  >
                    <Download size={16} /> Download template
                  </button>

                  <label
                    htmlFor="seed-packet-csv-file-input"
                    className="block p-6 border-2 border-dashed border-rhozly-outline/20 rounded-2xl text-center cursor-pointer hover:border-rhozly-primary/40 transition-colors"
                  >
                    <Upload size={22} className="mx-auto text-rhozly-on-surface/40" />
                    <p className="mt-2 text-sm font-black text-rhozly-on-surface/70">
                      {csvFileName ?? "Choose a CSV file"}
                    </p>
                    <p className="text-[11px] font-bold text-rhozly-on-surface/40">
                      .csv · comma, semicolon or tab delimited
                    </p>
                    <input
                      id="seed-packet-csv-file-input"
                      data-testid="csv-file-input"
                      type="file"
                      accept=".csv,.tsv,text/csv"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </label>

                  {parseError && (
                    <p data-testid="csv-parse-error" className="text-xs font-bold text-red-600">{parseError}</p>
                  )}
                </div>
              )}
            </div>
          )}
          {step === "review" && (
            <ReviewStep
              candidates={candidates}
              fileIssues={fileIssues}
              parseSource={parseSource}
              allFavourited={allFavourited}
              onToggleAllFavourites={toggleAllFavourites}
              onPatchRow={patchRow}
              onRemoveRow={removeRow}
            />
          )}
        </div>

        <footer className="shrink-0 px-5 py-3 border-t border-rhozly-outline/10 flex items-center justify-between gap-2">
          <button
            type="button"
            data-testid="bulk-paste-back"
            onClick={step === "review" ? () => setStep("paste") : onClose}
            className="px-3 py-2 min-h-[40px] rounded-xl text-rhozly-on-surface/60 hover:text-rhozly-on-surface text-[11px] font-black uppercase tracking-widest"
          >
            {step === "review" ? "Back" : "Cancel"}
          </button>
          {step === "paste" ? (
            mode === "paste" ? (
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
              <span className="text-[11px] font-bold text-rhozly-on-surface/40">
                {parsing ? "Reading file…" : "Choose a file to continue"}
              </span>
            )
          ) : (
            <button
              type="button"
              data-testid="bulk-paste-save"
              onClick={handleSave}
              disabled={validCount === 0 || saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] rounded-xl bg-rhozly-primary text-white text-[11px] font-black uppercase tracking-widest hover:opacity-95 transition disabled:opacity-50"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              {saving
                ? `Adding ${savedCount} / ${validCount}…`
                : `Add ${validCount} packet${validCount === 1 ? "" : "s"}`}
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
  candidates, fileIssues, parseSource, allFavourited,
  onToggleAllFavourites, onPatchRow, onRemoveRow,
}: {
  candidates: Candidate[];
  fileIssues: RowIssue[];
  parseSource: "ai" | "local" | "csv" | null;
  allFavourited: boolean;
  onToggleAllFavourites: () => void;
  onPatchRow: (idx: number, patch: Partial<Candidate>) => void;
  onRemoveRow: (idx: number) => void;
}) {
  if (candidates.length === 0) {
    return (
      <p className="text-sm font-bold text-rhozly-on-surface/55 text-center py-8">
        Nothing left to add — tap Back to add more or Cancel to close.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {parseSource && (
        <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40">
          {parseSource === "ai" ? (
            <><Sparkles size={11} className="inline mr-1 text-rhozly-primary" />Parsed by Rhozly AI</>
          ) : parseSource === "csv" ? (
            <><Upload size={11} className="inline mr-1" />Imported from CSV</>
          ) : (
            <><FileText size={11} className="inline mr-1" />Parsed locally</>
          )}
        </p>
      )}

      {/* File-level warnings (unknown columns, row cap). */}
      {fileIssues.length > 0 && (
        <div
          data-testid="bulk-paste-file-issues"
          className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-[11px] font-bold text-amber-900 leading-snug space-y-1"
        >
          {fileIssues.map((iss, i) => <p key={i}>{iss.message}</p>)}
        </div>
      )}

      {/* Mark all as favourites */}
      <label
        data-testid="bulk-paste-favourite-all"
        className="flex items-center gap-2 text-xs font-black text-rhozly-on-surface/70 cursor-pointer select-none"
      >
        <input
          type="checkbox"
          checked={allFavourited}
          onChange={onToggleAllFavourites}
          className="w-4 h-4 accent-rhozly-primary"
        />
        <Heart size={13} className="text-rose-500" /> Mark all as favourites
      </label>

      <ul className="space-y-2.5">
        {candidates.map((row, i) => {
          const rowErrors = row.issues.filter((iss) => iss.severity === "error");
          const rowWarnings = row.issues.filter((iss) => iss.severity === "warning");
          return (
            <li
              key={i}
              data-testid={`bulk-paste-row-${i}`}
              className={`rounded-2xl bg-white border p-3 space-y-2.5 ${row.valid ? "border-rhozly-outline/15" : "border-red-300 ring-1 ring-red-200"}`}
            >
              <div className="flex items-start gap-2.5">
                <span className="shrink-0 w-9 h-9 rounded-xl bg-rhozly-primary/10 text-rhozly-primary flex items-center justify-center">
                  <Package size={15} />
                </span>
                <div className="flex-1 min-w-0 grid grid-cols-2 gap-2">
                  <InlineField
                    label="Plant"
                    value={row.plantName}
                    onChange={(v) => onPatchRow(i, { plantName: v })}
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
                <div className="shrink-0 flex flex-col items-center gap-1">
                  <label
                    className="w-9 h-9 rounded-xl bg-rhozly-surface-low flex items-center justify-center cursor-pointer"
                    title="Add to favourites"
                  >
                    <input
                      data-testid={`bulk-paste-row-${i}-favourite`}
                      type="checkbox"
                      checked={row.favourite}
                      onChange={(e) => onPatchRow(i, { favourite: e.target.checked })}
                      className="sr-only"
                      aria-label={`Favourite ${row.plantName || "this packet"}`}
                    />
                    <Heart size={15} className={row.favourite ? "text-rose-500 fill-rose-500" : "text-rhozly-on-surface/40"} />
                  </label>
                  <button
                    type="button"
                    data-testid={`bulk-paste-row-${i}-remove`}
                    onClick={() => onRemoveRow(i)}
                    aria-label="Remove this row"
                    className="w-9 h-9 rounded-xl text-rhozly-on-surface/40 hover:text-red-600 hover:bg-red-50 flex items-center justify-center"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {rowErrors.length > 0 && (
                <div
                  data-testid={`bulk-paste-row-${i}-errors`}
                  className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-[11px] font-bold text-red-700 leading-snug space-y-0.5"
                >
                  {rowErrors.map((iss, j) => (
                    <p key={j} className="flex items-start gap-1">
                      <AlertTriangle size={11} className="mt-0.5 shrink-0" /> {iss.message}
                    </p>
                  ))}
                </div>
              )}
              {rowWarnings.length > 0 && (
                <div className="text-[11px] font-bold text-amber-700 leading-snug space-y-0.5 px-1">
                  {rowWarnings.map((iss, j) => <p key={j}>· {iss.message}</p>)}
                </div>
              )}
              {row.notes && (
                <p className="text-[11px] text-rhozly-on-surface/60 italic leading-snug">
                  Note: {row.notes}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
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
