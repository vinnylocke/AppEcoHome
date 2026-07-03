import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Loader2,
  Sparkles,
  Trash2,
  Check,
  FileText,
  Biohazard,
  Upload,
  Download,
  Heart,
  AlertTriangle,
  ChevronDown,
} from "lucide-react";
import toast from "react-hot-toast";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { supabase } from "../lib/supabase";
import {
  parseAilmentList,
  type ParsedAilment,
  type AilmentListType,
} from "../lib/parseAilmentList";
import { favouriteAilment } from "../services/favouritesService";
import {
  AILMENT_TEMPLATE,
  parseCsv,
  downloadTemplate,
  type ParsedRow,
  type RowIssue,
} from "../lib/uploadTemplates";
import { Logger } from "../lib/errorHandler";
import { logEvent, EVENT } from "../events/registry";
import type { Ailment } from "./AilmentWatchlist";

interface Props {
  homeId: string;
  /** Sage / Evergreen get the Gemini parser; others fall back to regex. */
  aiEnabled: boolean;
  onClose: () => void;
  /** Called with the freshly-inserted ailment rows so the grid updates. */
  onCreated?: (ailments: Ailment[]) => void;
}

type Step = "paste" | "review";
type Mode = "paste" | "csv";

const AILMENT_TYPES: { value: AilmentListType; label: string }[] = [
  { value: "pest", label: "Pest" },
  { value: "disease", label: "Disease" },
  { value: "invasive_plant", label: "Invasive Plant" },
];

/**
 * A single review candidate — normalised across BOTH entry paths. Free-text /
 * AI paste produces one from a ParsedAilment; the CSV path carries the full
 * AILMENT_TEMPLATE payload plus per-row/per-field issues and a favourite flag.
 */
interface Candidate {
  /** ailments insert skeleton (source: "manual", jsonb arrays) — home_id added on save. */
  payload: Record<string, unknown>;
  /** Editable name (surfaced as the primary input). */
  name: string;
  /** Editable type (surfaced as a select). */
  type: AilmentListType;
  favourite: boolean;
  issues: RowIssue[];
  valid: boolean;
  /** How many symptom + step entries this row carries (compact expander). */
  extraFieldCount: number;
}

const EXAMPLE = `Aphids - sticky leaves, curled shoots
Powdery mildew (white dusty coating)
Slugs and snails
Japanese knotweed
Black spot: yellowing, leaf drop`;

/** Count symptoms + prevention + remedy entries on an ailment payload. */
function countExtras(payload: Record<string, unknown>): number {
  const len = (v: unknown) => (Array.isArray(v) ? v.length : 0);
  return len(payload.symptoms) + len(payload.prevention_steps) + len(payload.remedy_steps) +
    len(payload.affected_plants);
}

/** Turn a free-text/AI ParsedAilment into the shared Candidate shape. */
function candidateFromParsed(a: ParsedAilment): Candidate {
  const symptoms = a.symptoms.map((title) => ({
    id: crypto.randomUUID(),
    title,
    description: "",
    severity: "mild" as const,
    location: "",
  }));
  const payload: Record<string, unknown> = {
    name: a.name,
    type: a.type,
    scientific_name: null,
    description: a.notes ?? "",
    symptoms,
    affected_plants: [],
    prevention_steps: [],
    remedy_steps: [],
    source: "manual",
    perenual_id: null,
    thumbnail_url: null,
  };
  return {
    payload,
    name: a.name,
    type: a.type,
    favourite: false,
    issues: [],
    valid: true,
    extraFieldCount: countExtras(payload),
  };
}

/** Turn a CSV ParsedRow into the shared Candidate shape. */
function candidateFromCsvRow(row: ParsedRow): Candidate {
  const payload = row.payload as Record<string, unknown>;
  return {
    payload,
    name: (payload.name as string) ?? "",
    type: (payload.type as AilmentListType) ?? "disease",
    favourite: row.favourite,
    issues: row.issues,
    valid: row.valid,
    extraFieldCount: countExtras(payload),
  };
}

/**
 * RHO-4 Phase 2 — bulk add ailments to the Watchlist.
 *
 * A mode toggle offers "Paste a list" (free-text → parse-ailment-list on Sage+,
 * regex fallback otherwise) and "Upload CSV" (strict parse against
 * AILMENT_TEMPLATE, deterministic + tier-free). Both feed the SAME review step,
 * which has per-row/per-field error display, an editable name + type per row, a
 * per-row favourite checkbox, and a "Mark all as favourites" toggle. On import
 * each valid row inserts as `source: "manual"`; rows whose favourite flag is set
 * then call `favouriteAilment()` on the new row.
 */
export default function BulkAddAilmentsModal({
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
      const { ailments, source } = await parseAilmentList(text, { aiEnabled });
      setParseSource(source);
      if (ailments.length === 0) {
        setParseError("Couldn't find any ailments in that text. Try one per line.");
        return;
      }
      setCandidates(ailments.map(candidateFromParsed));
      setFileIssues([]);
      setStep("review");
    } catch (err: any) {
      Logger.error("Bulk ailment paste parse failed", err, { homeId });
      setParseError(err?.message ?? "Could not parse the list. Please try again.");
    } finally {
      setParsing(false);
    }
  };

  const handleCsvText = (csvText: string) => {
    setParseError(null);
    const result = parseCsv(csvText, AILMENT_TEMPLATE);
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
    } catch (err: any) {
      Logger.error("Ailment CSV read failed", err, { homeId });
      setParseError("Could not read that file.");
    } finally {
      setParsing(false);
    }
  };

  const updateCandidate = (idx: number, patch: Partial<Candidate>) => {
    setCandidates((prev) => prev.map((c, i) => {
      if (i !== idx) return c;
      const next = { ...c, ...patch };
      if (patch.name !== undefined) next.payload = { ...next.payload, name: patch.name };
      if (patch.type !== undefined) next.payload = { ...next.payload, type: patch.type };
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
    const toSave = candidates.filter((c) => c.valid && c.name.trim());
    if (toSave.length === 0) return;
    setSaving(true);
    let favourited = 0;
    const created: Ailment[] = [];
    const failed: string[] = [];
    for (const cand of toSave) {
      try {
        const insert = {
          ...cand.payload,
          home_id: homeId,
          name: cand.name.trim(),
          type: cand.type,
          source: "manual",
        };
        const { data, error } = await supabase
          .from("ailments")
          .insert(insert)
          .select()
          .single();
        if (error) throw error;
        created.push(data as Ailment);
        if (cand.favourite) {
          try {
            await favouriteAilment(data as any, homeId);
            favourited += 1;
          } catch (favErr) {
            Logger.warn("Bulk ailment import favourite failed", { homeId, favErr });
          }
        }
      } catch (err) {
        Logger.error("Bulk ailment import insert failed", err, { homeId, name: cand.name });
        failed.push(cand.name);
      }
    }
    setSavedCount(created.length);
    setSaving(false);
    logEvent(EVENT.BULK_AILMENT_IMPORT_COMPLETED, {
      attempted: toSave.length,
      succeeded: created.length,
      failed: failed.length,
      favourited,
      mode: parseSource === "csv" ? "csv" : "paste",
      source: parseSource,
    });
    onCreated?.(created);
    if (failed.length === 0) {
      const favNote = favourited > 0 ? ` (${favourited} favourited)` : "";
      toast.success(`Added ${created.length} ailment${created.length === 1 ? "" : "s"} to your Watchlist${favNote}`);
      onClose();
    } else {
      toast.error(`Added ${created.length}, but ${failed.length} failed (${failed.slice(0, 2).join(", ")}${failed.length > 2 ? "…" : ""}). Try again or add those manually.`);
    }
  };

  return createPortal(
    <div
      data-testid="bulk-add-ailments-modal"
      className="fixed inset-0 z-[120] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-ailment-title"
        onClick={(e) => e.stopPropagation()}
        className="bg-rhozly-bg rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl border border-rhozly-outline/10 overflow-hidden animate-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-rhozly-outline/10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="shrink-0 w-9 h-9 rounded-2xl bg-rhozly-primary/10 text-rhozly-primary flex items-center justify-center">
              <Biohazard size={16} />
            </div>
            <div className="min-w-0">
              <h2 id="bulk-ailment-title" className="font-display font-black text-lg text-rhozly-on-surface truncate">
                Bulk add ailments
              </h2>
              <p className="text-[11px] font-bold text-rhozly-on-surface/45 leading-snug">
                {step === "paste"
                  ? mode === "paste"
                    ? "One pest / disease / weed per line — name + optional symptoms."
                    : "Upload a CSV filled from the template — every field, exact format."
                  : `${validCount} of ${candidates.length} ready to add — edit, favourite or remove before saving.`}
              </p>
            </div>
          </div>
          <button
            data-testid="bulk-ailment-close"
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
                data-testid="bulk-ailment-mode-toggle"
                className="grid grid-cols-2 gap-1 p-1 bg-rhozly-surface-low rounded-2xl"
              >
                <button
                  data-testid="bulk-ailment-mode-paste"
                  onClick={() => { setMode("paste"); setParseError(null); }}
                  className={`py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-colors ${mode === "paste" ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-on-surface/50"}`}
                >
                  <FileText size={13} className="inline mr-1.5" /> Paste a list
                </button>
                <button
                  data-testid="bulk-ailment-mode-csv"
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
                      One ailment per line. Accepted shapes:{" "}
                      <code className="font-mono text-emerald-800">Aphids</code>,{" "}
                      <code className="font-mono text-emerald-800">Powdery mildew (white coating)</code>,{" "}
                      <code className="font-mono text-emerald-800">Black spot: yellowing, leaf drop</code>.
                      We'll guess the type — you can change it before saving.
                    </p>
                    {!aiEnabled && (
                      <p className="mt-2 text-emerald-800/80">
                        <Sparkles size={11} className="inline mr-1" />
                        Upgrade to Sage for fuzzy AI parsing — handles messier lists.
                      </p>
                    )}
                  </div>

                  <textarea
                    data-testid="bulk-ailment-textarea"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={EXAMPLE}
                    rows={10}
                    className="w-full p-4 bg-white rounded-2xl border border-rhozly-outline/15 text-sm font-bold text-rhozly-on-surface outline-none focus:border-rhozly-primary transition-colors resize-none font-mono leading-relaxed"
                  />

                  <div className="flex items-center justify-between gap-3 text-xs font-bold text-rhozly-on-surface/50">
                    <span>{lineCount} non-empty line{lineCount === 1 ? "" : "s"}</span>
                    {parseError && <span className="text-red-600">{parseError}</span>}
                  </div>
                </>
              ) : (
                <>
                  <div className="bg-sky-50 border border-sky-200 rounded-2xl px-4 py-3 text-xs font-bold text-sky-900 leading-snug">
                    <p className="font-black uppercase tracking-widest text-[10px] mb-1 text-sky-700">
                      CSV upload — full fields
                    </p>
                    <p>
                      Download the template, fill one row per ailment, then upload it here.
                      <code className="font-mono"> name</code> and <code className="font-mono">type</code> are
                      required; up to {200} rows. Symptoms use{" "}
                      <code className="font-mono">title [severity]</code>; steps are titles only.
                      Tick the <code className="font-mono">favourite</code> column to save rows to your favourites.
                    </p>
                  </div>

                  <button
                    data-testid="csv-template-download"
                    onClick={() => downloadTemplate(AILMENT_TEMPLATE)}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-white border border-rhozly-outline/20 text-rhozly-primary text-sm font-black hover:border-rhozly-primary/30 hover:bg-rhozly-primary/5 transition-colors"
                  >
                    <Download size={16} /> Download template
                  </button>

                  <label
                    htmlFor="ailment-csv-file-input"
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
                      id="ailment-csv-file-input"
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
                  data-testid="bulk-ailment-file-issues"
                  className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-[11px] font-bold text-amber-900 leading-snug space-y-1"
                >
                  {fileIssues.map((iss, i) => <p key={i}>{iss.message}</p>)}
                </div>
              )}

              {/* Mark all as favourites */}
              {candidates.length > 0 && (
                <label
                  data-testid="bulk-ailment-favourite-all"
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
                  data-testid={`bulk-ailment-candidate-${idx}`}
                  className={`bg-white border rounded-2xl p-3 space-y-2 ${c.valid ? "border-rhozly-outline/15" : "border-red-300 ring-1 ring-red-200"}`}
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-12 gap-2 items-start">
                      <input
                        data-testid={`bulk-ailment-candidate-name-${idx}`}
                        value={c.name}
                        onChange={(e) => updateCandidate(idx, { name: e.target.value })}
                        placeholder="Name"
                        className="sm:col-span-6 px-3 py-2 min-h-[40px] bg-rhozly-surface-low rounded-xl text-sm font-bold text-rhozly-on-surface outline-none focus:bg-white focus:ring-2 focus:ring-rhozly-primary/30 border border-transparent focus:border-rhozly-primary/30 transition-all"
                      />
                      <select
                        data-testid={`bulk-ailment-candidate-type-${idx}`}
                        value={c.type}
                        onChange={(e) => updateCandidate(idx, { type: e.target.value as AilmentListType })}
                        className="sm:col-span-4 px-3 py-2 min-h-[40px] bg-rhozly-surface-low rounded-xl text-sm font-bold text-rhozly-on-surface outline-none focus:bg-white focus:ring-2 focus:ring-rhozly-primary/30 border border-transparent focus:border-rhozly-primary/30 transition-all"
                      >
                        {AILMENT_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                      <label
                        className="sm:col-span-2 flex items-center justify-center gap-1 px-2 min-h-[40px] bg-rhozly-surface-low rounded-xl cursor-pointer"
                        title="Add to favourites"
                      >
                        <input
                          data-testid={`bulk-ailment-candidate-favourite-${idx}`}
                          type="checkbox"
                          checked={c.favourite}
                          onChange={(e) => updateCandidate(idx, { favourite: e.target.checked })}
                          className="w-4 h-4 accent-rose-500"
                          aria-label={`Favourite ${c.name || "this ailment"}`}
                        />
                        <Heart size={13} className={c.favourite ? "text-rose-500 fill-rose-500" : "text-rhozly-on-surface/40"} />
                      </label>
                    </div>
                    <button
                      data-testid={`bulk-ailment-candidate-remove-${idx}`}
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
                      data-testid={`bulk-ailment-candidate-errors-${idx}`}
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
                      {rowWarnings.map((iss, i) => <p key={i}>· {iss.message}</p>)}
                    </div>
                  )}

                  {/* Extra-fields expander (symptoms + steps). */}
                  {c.extraFieldCount > 0 && (
                    <button
                      data-testid={`bulk-ailment-candidate-expand-${idx}`}
                      onClick={() => setExpandedRow(expandedRow === idx ? null : idx)}
                      className="flex items-center gap-1 text-[11px] font-black text-rhozly-on-surface/45 hover:text-rhozly-primary transition-colors"
                    >
                      <ChevronDown size={12} className={`transition-transform ${expandedRow === idx ? "rotate-180" : ""}`} />
                      {c.extraFieldCount} symptom/step field{c.extraFieldCount === 1 ? "" : "s"}
                    </button>
                  )}
                  {expandedRow === idx && c.extraFieldCount > 0 && (
                    <div className="bg-rhozly-surface-low/60 rounded-xl px-3 py-2 text-[11px] font-bold text-rhozly-on-surface/55 leading-snug space-y-1">
                      {renderSummaryLine("Symptoms", c.payload.symptoms)}
                      {renderSummaryLine("Affected plants", c.payload.affected_plants)}
                      {renderSummaryLine("Prevention", c.payload.prevention_steps)}
                      {renderSummaryLine("Remedy", c.payload.remedy_steps)}
                      <p className="text-rhozly-on-surface/40 italic">Fine-tune steps in the ailment editor after adding.</p>
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
                  data-testid="bulk-ailment-parse"
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
                data-testid="bulk-ailment-back"
                onClick={() => setStep("paste")}
                className="text-sm font-bold text-rhozly-on-surface/55 hover:text-rhozly-on-surface px-4 py-2 min-h-[44px] rounded-2xl transition"
              >
                ← Back
              </button>
              <button
                data-testid="bulk-ailment-save"
                onClick={handleSave}
                disabled={saving || validCount === 0}
                className="inline-flex items-center gap-2 px-5 py-2.5 min-h-[44px] rounded-2xl bg-rhozly-primary text-white text-sm font-black hover:opacity-90 disabled:opacity-40 transition shadow-sm"
              >
                {saving ? (
                  <><Loader2 size={14} className="animate-spin" /> Adding {savedCount} / {validCount}…</>
                ) : (
                  <><Check size={14} /> Add {validCount} ailment{validCount === 1 ? "" : "s"}</>
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

/** Render a compact "Label: a, b, c" line for symptom/step title arrays. */
function renderSummaryLine(label: string, value: unknown): React.ReactNode {
  if (!Array.isArray(value) || value.length === 0) return null;
  const titles = value
    .map((v) => (typeof v === "string" ? v : (v as Record<string, unknown>)?.title))
    .filter((t): t is string => typeof t === "string" && t.length > 0);
  if (titles.length === 0) return null;
  return (
    <p>
      <span className="text-rhozly-on-surface/40">{label}:</span> {titles.join(", ")}
    </p>
  );
}
