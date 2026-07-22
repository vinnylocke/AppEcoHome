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
  Upload,
  Download,
  Heart,
  AlertTriangle,
  ChevronDown,
} from "lucide-react";
import toast from "react-hot-toast";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { parsePlantList, type ParsedPlant } from "../lib/parsePlantList";
import { saveToShed } from "../lib/saveToShed";
import { favouritePlant } from "../services/favouritesService";
import {
  PLANT_TEMPLATE,
  parseCsv,
  downloadTemplate,
  type ParsedRow,
  type RowIssue,
} from "../lib/uploadTemplates";
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
type Mode = "paste" | "csv";

/**
 * A single review candidate — normalised across BOTH entry paths. Free-text
 * paste produces one with just the four legacy fields; the CSV path carries the
 * full PLANT_TEMPLATE payload plus per-row/per-field issues and a favourite flag.
 */
interface Candidate {
  /** saveToShed skeleton (already `source: "manual"`, plant_metadata, labels). */
  payload: Record<string, unknown>;
  /** Editable common name (surfaced as the primary input). */
  common_name: string;
  /** Optional variety, surfaced as an editable input on the paste path. */
  variety: string | null;
  quantity: number | null;
  notes: string | null;
  favourite: boolean;
  issues: RowIssue[];
  valid: boolean;
  /** How many CSV columns beyond the basics carried a value (compact expander). */
  extraFieldCount: number;
}

const EXAMPLE = `Tomato Sungold x3
Lavender 'Hidcote' (12 plants, from RHS Wisley)
Pak Choi
Rose "Munstead Wood" x2
Calendula - hedging, mixed colours`;

/** Fields that are "basics" (already shown as inputs) — everything else on the
 *  CSV payload counts toward the "N extra fields" expander. */
const BASIC_KEYS = new Set(["common_name", "source", "plant_metadata", "labels"]);

/** Turn a free-text ParsedPlant into the shared Candidate shape. */
function candidateFromParsedPlant(p: ParsedPlant): Candidate {
  const notes: string[] = [];
  if (p.quantity) notes.push(`Bulk import: ${p.quantity} plant${p.quantity === 1 ? "" : "s"}`);
  if (p.notes) notes.push(p.notes);
  return {
    payload: {
      common_name: p.common_name,
      source: "manual",
      plant_metadata: {
        variety: p.variety,
        bulk_import_notes: notes.length > 0 ? notes.join(" — ") : null,
      },
      // `plants.labels` is NOT NULL — empty array when there's no variety label.
      labels: p.variety ? [p.variety.toLowerCase()] : [],
    },
    common_name: p.common_name,
    variety: p.variety,
    quantity: p.quantity,
    notes: p.notes,
    favourite: false,
    issues: [],
    valid: true,
    extraFieldCount: 0,
  };
}

/** Turn a CSV ParsedRow into the shared Candidate shape. */
function candidateFromCsvRow(row: ParsedRow): Candidate {
  const payload = row.payload as Record<string, unknown>;
  const meta = (payload.plant_metadata ?? {}) as Record<string, unknown>;
  const extraFieldCount = Object.keys(payload).filter(
    (k) => !BASIC_KEYS.has(k) && payload[k] != null &&
      !(Array.isArray(payload[k]) && (payload[k] as unknown[]).length === 0),
  ).length;
  return {
    payload,
    common_name: (payload.common_name as string) ?? "",
    variety: (meta.variety as string) ?? null,
    quantity: null,
    notes: null,
    favourite: row.favourite,
    issues: row.issues,
    valid: row.valid,
    extraFieldCount,
  };
}

/**
 * UX review 2026-06-15 item 4.1 — bulk add plants to the Shed.
 *
 * RHO-4 Phase 1 (2026-07-03): a mode toggle adds an "Upload CSV" path alongside
 * the existing free-text "Paste a list". CSV mode parses strictly against
 * PLANT_TEMPLATE (deterministic, tier-free, no Gemini) and both paths feed the
 * SAME review step. The review step gains per-row + per-field error display, a
 * per-row favourite checkbox, and a "Mark all as favourites" toggle. On import
 * each valid row saves via `saveToShed` as `source: "manual"`; rows whose
 * favourite flag is set then call `favouritePlant()` on the new row.
 */
export default function BulkPastePlantsModal({
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
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
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
      const { plants, source } = await parsePlantList(text, { homeId, aiEnabled });
      setParseSource(source);
      if (plants.length === 0) {
        setParseError("Couldn't find any plants in that text. Try one plant per line.");
        return;
      }
      setCandidates(plants.map(candidateFromParsedPlant));
      setFileIssues([]);
      setStep("review");
    } catch (err: any) {
      Logger.error("Bulk paste parse failed", err, { homeId });
      setParseError(err?.message ?? "Could not parse the list. Please try again.");
    } finally {
      setParsing(false);
    }
  };

  const handleCsvText = (csvText: string) => {
    setParseError(null);
    const result = parseCsv(csvText, PLANT_TEMPLATE);
    setFileIssues(result.issues.filter((i) => i.rowNumber === 0 || i.field === null && i.rowNumber === 0));
    // File-level errors (empty file, no headers, too many rows) block outright.
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
    // Keep only genuinely file-scoped issues (row 0) for the banner.
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
    } catch (err: any) {
      Logger.error("CSV read failed", err, { homeId });
      setParseError("Could not read that file.");
    } finally {
      setParsing(false);
    }
  };

  const updateCandidate = (idx: number, patch: Partial<Candidate>) => {
    setCandidates((prev) => prev.map((c, i) => {
      if (i !== idx) return c;
      const next = { ...c, ...patch };
      // Keep the payload's common_name in sync with the editable input.
      if (patch.common_name !== undefined) {
        next.payload = { ...next.payload, common_name: patch.common_name };
      }
      return next;
    }));
  };

  const removeCandidate = (idx: number) => {
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
    let succeeded = 0;
    let favourited = 0;
    const failed: string[] = [];
    for (const cand of toSave) {
      try {
        const { row } = await saveToShed(
          { ...cand.payload, common_name: cand.common_name, source: "manual" } as any,
          undefined,
          homeId,
        );
        succeeded += 1;
        // Visibility law (v3 feedback polish): ADDING IS LOVING — every
        // created row gets the ♥, else zero-presence rows vanish from the
        // default grid the moment they're imported. The explicit checkbox
        // still drives the toast count.
        try {
          await favouritePlant(row as any, homeId);
          if (cand.favourite) favourited += 1;
        } catch (favErr) {
          Logger.warn("Bulk import favourite failed", { homeId, favErr });
        }
      } catch (err) {
        Logger.error("Bulk import saveToShed failed", err, { homeId, common_name: cand.common_name });
        failed.push(cand.common_name);
      }
    }
    setSavedCount(succeeded);
    setSaving(false);
    logEvent(EVENT.BULK_PLANT_IMPORT_COMPLETED, {
      attempted: toSave.length,
      succeeded,
      failed: failed.length,
      favourited,
      mode: parseSource === "csv" ? "csv" : "paste",
      source: parseSource,
    });
    if (failed.length === 0) {
      const favNote = favourited > 0 ? ` (${favourited} favourited)` : "";
      toast.success(`Added ${succeeded} plant${succeeded === 1 ? "" : "s"} to your Shed${favNote}`);
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
                Bulk add plants
              </h2>
              <p className="text-[11px] font-bold text-rhozly-on-surface/45 leading-snug">
                {step === "paste"
                  ? mode === "paste"
                    ? "One plant per line — name + optional variety + optional quantity."
                    : "Upload a CSV filled from the template — every field, exact format."
                  : `${validCount} of ${candidates.length} ready to add — edit, favourite or remove before saving.`}
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
              {/* Mode toggle */}
              <div
                data-testid="bulk-add-mode-toggle"
                className="grid grid-cols-2 gap-1 p-1 bg-rhozly-surface-low rounded-2xl"
              >
                <button
                  data-testid="bulk-add-mode-paste"
                  onClick={() => { setMode("paste"); setParseError(null); }}
                  className={`py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-colors ${mode === "paste" ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-on-surface/50"}`}
                >
                  <FileText size={13} className="inline mr-1.5" /> Paste a list
                </button>
                <button
                  data-testid="bulk-add-mode-csv"
                  onClick={() => { setMode("csv"); setParseError(null); }}
                  className={`py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-colors ${mode === "csv" ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-on-surface/50"}`}
                >
                  <Upload size={13} className="inline mr-1.5" /> Upload CSV
                </button>
              </div>

              {mode === "paste" ? (
                <>
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
                </>
              ) : (
                <>
                  <div className="bg-sky-50 border border-sky-200 rounded-2xl px-4 py-3 text-xs font-bold text-sky-900 leading-snug">
                    <p className="font-black uppercase tracking-widest text-[10px] mb-1 text-sky-700">
                      CSV upload — full fields
                    </p>
                    <p>
                      Download the template, fill one row per plant, then upload it here.
                      Only <code className="font-mono">common_name</code> is required; up to {200} rows.
                      Tick the <code className="font-mono">favourite</code> column to save rows to your favourites.
                    </p>
                  </div>

                  <button
                    data-testid="csv-template-download"
                    onClick={() => downloadTemplate(PLANT_TEMPLATE)}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-white border border-rhozly-outline/20 text-rhozly-primary text-sm font-black hover:border-rhozly-primary/30 hover:bg-rhozly-primary/5 transition-colors"
                  >
                    <Download size={16} /> Download template
                  </button>

                  <label
                    htmlFor="csv-file-input"
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
                      id="csv-file-input"
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
                </>
              )}
            </div>
          ) : (
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
                  data-testid="bulk-add-file-issues"
                  className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-[11px] font-bold text-amber-900 leading-snug space-y-1"
                >
                  {fileIssues.map((iss, i) => (
                    <p key={i}>{iss.message}</p>
                  ))}
                </div>
              )}

              {/* Mark all as favourites */}
              {candidates.length > 0 && (
                <label
                  data-testid="bulk-add-favourite-all"
                  className="flex items-center gap-2 text-xs font-black text-rhozly-on-surface/70 cursor-pointer select-none"
                >
                  <input
                    type="checkbox"
                    checked={allFavourited}
                    onChange={toggleAllFavourites}
                    className="w-4 h-4 accent-rhozly-primary"
                  />
                  <Heart size={13} className="text-rose-500" /> Mark all as favourites
                </label>
              )}

              {candidates.length === 0 && (
                <div className="text-center p-8 border-2 border-dashed border-rhozly-outline/15 rounded-3xl bg-rhozly-surface-low/40">
                  <p className="text-sm font-bold text-rhozly-on-surface/50">
                    All rows removed. Go back to add more.
                  </p>
                </div>
              )}

              {candidates.map((c, idx) => {
                const rowErrors = c.issues.filter((i) => i.severity === "error");
                const rowWarnings = c.issues.filter((i) => i.severity === "warning");
                return (
                <div
                  key={idx}
                  data-testid={`bulk-paste-candidate-${idx}`}
                  className={`bg-white border rounded-2xl p-3 space-y-2 ${c.valid ? "border-rhozly-outline/15" : "border-red-300 ring-1 ring-red-200"}`}
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-12 gap-2 items-start">
                      <input
                        data-testid={`bulk-paste-candidate-name-${idx}`}
                        value={c.common_name}
                        onChange={(e) => updateCandidate(idx, { common_name: e.target.value })}
                        placeholder="Common name"
                        className="sm:col-span-6 px-3 py-2 min-h-[40px] bg-rhozly-surface-low rounded-xl text-sm font-bold text-rhozly-on-surface outline-none focus:bg-white focus:ring-2 focus:ring-rhozly-primary/30 border border-transparent focus:border-rhozly-primary/30 transition-all"
                      />
                      <input
                        data-testid={`bulk-paste-candidate-variety-${idx}`}
                        value={c.variety ?? ""}
                        onChange={(e) => updateCandidate(idx, { variety: e.target.value || null })}
                        placeholder="Variety (optional)"
                        className="sm:col-span-4 px-3 py-2 min-h-[40px] bg-rhozly-surface-low rounded-xl text-sm font-bold text-rhozly-on-surface outline-none focus:bg-white focus:ring-2 focus:ring-rhozly-primary/30 border border-transparent focus:border-rhozly-primary/30 transition-all"
                      />
                      <label
                        className="sm:col-span-2 flex items-center justify-center gap-1 px-2 min-h-[40px] bg-rhozly-surface-low rounded-xl cursor-pointer"
                        title="Add to favourites"
                      >
                        <input
                          data-testid={`bulk-paste-candidate-favourite-${idx}`}
                          type="checkbox"
                          checked={c.favourite}
                          onChange={(e) => updateCandidate(idx, { favourite: e.target.checked })}
                          className="w-4 h-4 accent-rose-500"
                          aria-label={`Favourite ${c.common_name || "this plant"}`}
                        />
                        <Heart size={13} className={c.favourite ? "text-rose-500 fill-rose-500" : "text-rhozly-on-surface/40"} />
                      </label>
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

                  {/* Per-field / per-row errors + warnings */}
                  {rowErrors.length > 0 && (
                    <div
                      data-testid={`bulk-paste-candidate-errors-${idx}`}
                      className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-[11px] font-bold text-red-700 leading-snug space-y-0.5"
                    >
                      {rowErrors.map((iss, i) => (
                        <p key={i} className="flex items-start gap-1">
                          <AlertTriangle size={11} className="mt-0.5 shrink-0" /> {iss.message}
                        </p>
                      ))}
                    </div>
                  )}
                  {rowWarnings.length > 0 && (
                    <div className="text-[11px] font-bold text-amber-700 leading-snug space-y-0.5 px-1">
                      {rowWarnings.map((iss, i) => (
                        <p key={i}>· {iss.message}</p>
                      ))}
                    </div>
                  )}

                  {/* Extra-fields expander (CSV rows only). */}
                  {c.extraFieldCount > 0 && (
                    <button
                      data-testid={`bulk-paste-candidate-expand-${idx}`}
                      onClick={() => setExpandedRow(expandedRow === idx ? null : idx)}
                      className="flex items-center gap-1 text-[11px] font-black text-rhozly-on-surface/45 hover:text-rhozly-primary transition-colors"
                    >
                      <ChevronDown size={12} className={`transition-transform ${expandedRow === idx ? "rotate-180" : ""}`} />
                      {c.extraFieldCount} extra field{c.extraFieldCount === 1 ? "" : "s"}
                    </button>
                  )}
                  {expandedRow === idx && c.extraFieldCount > 0 && (
                    <div className="bg-rhozly-surface-low/60 rounded-xl px-3 py-2 text-[11px] font-bold text-rhozly-on-surface/55 leading-snug grid grid-cols-2 gap-x-3 gap-y-0.5">
                      {Object.entries(c.payload)
                        .filter(([k, v]) => !BASIC_KEYS.has(k) && v != null &&
                          !(Array.isArray(v) && v.length === 0))
                        .map(([k, v]) => (
                          <span key={k}>
                            <span className="text-rhozly-on-surface/40">{k}:</span>{" "}
                            {Array.isArray(v) ? v.join(", ") : String(v)}
                          </span>
                        ))}
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-rhozly-outline/10 px-5 py-4 flex items-center justify-between gap-3">
          {step === "paste" ? (
            <>
              <p className="text-[11px] font-bold text-rhozly-on-surface/45">
                {mode === "paste"
                  ? aiEnabled ? "Sage AI parser ready" : "Free regex parser"
                  : "Deterministic CSV — works on every tier"}
              </p>
              {mode === "paste" ? (
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
              ) : (
                <span className="text-[11px] font-bold text-rhozly-on-surface/40">
                  {parsing ? "Reading file…" : "Choose a file to continue"}
                </span>
              )}
            </>
          ) : (
            <>
              <button
                data-testid="bulk-paste-back"
                onClick={() => setStep("paste")}
                className="text-sm font-bold text-rhozly-on-surface/55 hover:text-rhozly-on-surface px-4 py-2 min-h-[44px] rounded-2xl transition"
              >
                ← Back
              </button>
              <button
                data-testid="bulk-paste-save"
                onClick={handleSave}
                disabled={saving || validCount === 0}
                className="inline-flex items-center gap-2 px-5 py-2.5 min-h-[44px] rounded-2xl bg-rhozly-primary text-white text-sm font-black hover:opacity-90 disabled:opacity-40 transition shadow-sm"
              >
                {saving ? (
                  <><Loader2 size={14} className="animate-spin" /> Adding {savedCount} / {validCount}…</>
                ) : (
                  <><Check size={14} /> Add {validCount} plant{validCount === 1 ? "" : "s"} to Shed</>
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
