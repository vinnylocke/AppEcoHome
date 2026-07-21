import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useSearchPreference } from "../lib/searchPreference";
import { createPortal } from "react-dom";
import {
  Plus, Search, Loader2, Biohazard, X,
  Edit3, Trash2, ChevronRight, ChevronUp, ChevronDown, ChevronLeft, AlertTriangle,
  CheckCircle2, Info, Square, CheckSquare2, Archive, ArchiveRestore, Lock, Sparkles, Library, Heart, FileText,
  Binoculars,
} from "lucide-react";
import { IconPest, IconPlant, IconPlantDB, IconAI } from "../constants/icons";
import { toast } from "react-hot-toast";
import { Logger } from "../lib/errorHandler";
import { readSnapshot, writeSnapshot } from "../lib/snapshotCache";
import { supabase } from "../lib/supabase";
import { PerenualService } from "../lib/perenualService";
import {
  fetchAilmentLibrary, filterAilmentLibrary, addLibraryAilmentToWatchlist,
  persistAiAilmentToLibrary, kindToWatchlistType, type LibraryAilment,
} from "../services/ailmentLibraryService";
import SmartImage from "./SmartImage";
import MultiImageGallery from "./MultiImageGallery";
import { ConfirmModal } from "./ConfirmModal";
import { logEvent, EVENT } from "../events/registry";
import { useHomeRealtime } from "../hooks/useHomeRealtime";
import { usePermissions } from "../context/HomePermissionsContext";
import { usePlantDoctor } from "../context/PlantDoctorContext";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useBetaFeedbackContext } from "../context/BetaFeedbackContext";
import EmptyState from "./shared/EmptyState";
import FavouriteAilmentsGrid from "./favourites/FavouriteAilmentsGrid";
import BulkAddAilmentsModal from "./BulkAddAilmentsModal";
import {
  isAilmentSourceLockedForTier,
  lockedAilmentSourceMessage,
  ailmentIdentityKey,
} from "../lib/favouriteIdentity";
import {
  listFavouriteAilments,
  favouriteAilment,
  unfavouriteAilment,
} from "../services/favouritesService";
import type { FavouriteAilment } from "../types";

// ─── Types ───────────────────────────────────────────────────────────────────

export type AilmentType = "invasive_plant" | "pest" | "disease";

export interface AilmentSymptom {
  id: string;
  title: string;
  description: string;
  severity: "mild" | "moderate" | "severe";
  location: string;
}

export interface AilmentStep {
  id: string;
  step_order: number;
  title: string;
  description: string;
  task_type: "inspect" | "spray" | "prune" | "remove" | "water" | "fertilize" | "other";
  frequency_type: "once" | "daily" | "every_n_days" | "weekly" | "monthly";
  frequency_every_n_days?: number;
  duration_minutes?: number;
  product?: string;
  notes?: string;
}

export interface Ailment {
  id: string;
  home_id: string;
  name: string;
  scientific_name?: string;
  type: AilmentType;
  description: string;
  symptoms: AilmentSymptom[];
  affected_plants: string[];
  prevention_steps: AilmentStep[];
  remedy_steps: AilmentStep[];
  source: "manual" | "perenual" | "ai" | "library";
  perenual_id?: number;
  thumbnail_url?: string;
  is_archived: boolean;
  created_at: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TYPE_META: Record<AilmentType, { label: string; icon: React.ReactNode; colour: string }> = {
  invasive_plant: { label: "Invasive Plant", icon: <IconPlant size={14} />, colour: "bg-orange-100 text-orange-700" },
  pest:           { label: "Pest",           icon: <IconPest size={14} />,       colour: "bg-red-100 text-red-700" },
  disease:        { label: "Disease",        icon: <Biohazard size={14} />, colour: "bg-purple-100 text-purple-700" },
};

const SEVERITY_COLOUR: Record<string, string> = {
  mild:     "bg-yellow-100 text-yellow-700",
  moderate: "bg-orange-100 text-orange-700",
  severe:   "bg-red-100 text-red-700",
};

const TASK_TYPE_LABELS: Record<string, string> = {
  inspect: "Inspect", spray: "Spray", prune: "Prune", remove: "Remove",
  water: "Water", fertilize: "Fertilize", other: "Other",
};

const FREQ_LABEL: Record<string, string> = {
  once: "Once", daily: "Daily", every_n_days: "Every N days",
  weekly: "Weekly", monthly: "Monthly",
};

function newStep(order: number): AilmentStep {
  return {
    id: crypto.randomUUID(),
    step_order: order,
    title: "",
    description: "",
    task_type: "inspect",
    frequency_type: "once",
  };
}

function newSymptom(): AilmentSymptom {
  return { id: crypto.randomUUID(), title: "", description: "", severity: "mild", location: "" };
}

// ─── Step Builder ─────────────────────────────────────────────────────────────

function StepBuilder({
  steps, onChange, label,
}: {
  steps: AilmentStep[];
  onChange: (steps: AilmentStep[]) => void;
  label: string;
}) {
  const updateStep = (idx: number, patch: Partial<AilmentStep>) => {
    const updated = steps.map((s, i) => (i === idx ? { ...s, ...patch } : s));
    onChange(updated);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-black uppercase tracking-widest text-rhozly-on-surface/50">{label}</h4>
        <button
          type="button"
          onClick={() => onChange([...steps, newStep(steps.length + 1)])}
          className="flex items-center gap-1 text-xs font-black text-rhozly-primary hover:underline"
        >
          <Plus size={12} /> Add step
        </button>
      </div>
      {steps.map((step, idx) => (
        <div key={step.id} className="bg-rhozly-surface-lowest rounded-2xl p-4 border border-rhozly-outline/10 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase text-rhozly-on-surface/40">Step {idx + 1}</span>
            <button
              type="button"
              onClick={() => onChange(steps.filter((_, i) => i !== idx).map((s, i) => ({ ...s, step_order: i + 1 })))}
              className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-rhozly-on-surface/30 hover:text-red-500 transition-colors"
            >
              <X size={14} />
            </button>
          </div>
          <input
            value={step.title}
            onChange={(e) => updateStep(idx, { title: e.target.value })}
            placeholder="Step title *"
            className="w-full p-3 bg-rhozly-surface-low rounded-2xl font-black text-sm border border-transparent focus:border-rhozly-primary outline-none"
          />
          <textarea
            value={step.description}
            onChange={(e) => updateStep(idx, { description: e.target.value })}
            placeholder="Description"
            rows={2}
            className="w-full p-3 bg-rhozly-surface-low rounded-2xl font-black text-sm border border-transparent focus:border-rhozly-primary outline-none resize-none"
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-black uppercase text-rhozly-on-surface/40 block mb-2">Task type</label>
              <select
                value={step.task_type}
                onChange={(e) => updateStep(idx, { task_type: e.target.value as AilmentStep["task_type"] })}
                className="w-full p-3 bg-rhozly-surface-low rounded-2xl font-black text-xs border border-transparent focus:border-rhozly-primary outline-none"
              >
                {Object.entries(TASK_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-rhozly-on-surface/40 block mb-2">Frequency</label>
              <select
                value={step.frequency_type}
                onChange={(e) => updateStep(idx, { frequency_type: e.target.value as AilmentStep["frequency_type"] })}
                className="w-full p-3 bg-rhozly-surface-low rounded-2xl font-black text-xs border border-transparent focus:border-rhozly-primary outline-none"
              >
                {Object.entries(FREQ_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>
          {step.frequency_type === "every_n_days" && (
            <input
              type="number"
              value={step.frequency_every_n_days ?? ""}
              onChange={(e) => updateStep(idx, { frequency_every_n_days: Number(e.target.value) })}
              placeholder="Every N days"
              min={1}
              className="w-full p-3 bg-rhozly-surface-low rounded-2xl font-black text-sm border border-transparent focus:border-rhozly-primary outline-none"
            />
          )}
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              value={step.duration_minutes ?? ""}
              onChange={(e) => updateStep(idx, { duration_minutes: Number(e.target.value) || undefined })}
              placeholder="Duration (mins)"
              min={1}
              className="w-full p-3 bg-rhozly-surface-low rounded-2xl font-black text-sm border border-transparent focus:border-rhozly-primary outline-none"
            />
            <input
              value={step.product ?? ""}
              onChange={(e) => updateStep(idx, { product: e.target.value || undefined })}
              placeholder="Product (optional)"
              className="w-full p-3 bg-rhozly-surface-low rounded-2xl font-black text-sm border border-transparent focus:border-rhozly-primary outline-none"
            />
          </div>
        </div>
      ))}
      {steps.length === 0 && (
        <p className="text-center text-xs font-bold text-rhozly-on-surface/30 py-4 border-2 border-dashed border-rhozly-outline/20 rounded-2xl">
          No steps yet
        </p>
      )}
    </div>
  );
}

// ─── Ailment Detail Modal ─────────────────────────────────────────────────────

function AilmentDetailModal({
  ailment,
  onClose,
  onDelete,
}: {
  ailment: Ailment;
  onClose: () => void;
  onDelete: (id: string) => void;
}) {
  const [tab, setTab] = useState<"info" | "prevention" | "remedy">("info");
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const meta = TYPE_META[ailment.type];

  const executeDelete = async () => {
    setShowDeleteConfirm(false);
    setDeleting(true);
    const { error } = await supabase.from("ailments").delete().eq("id", ailment.id);
    if (error) {
      Logger.error("Failed to delete ailment", error, { ailmentId: ailment.id });
      toast.error("Could not delete ailment — please try again.");
      setDeleting(false);
    } else {
      onClose();
      onDelete(ailment.id);
      toast.success("Removed from watchlist");
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-rhozly-bg/95 backdrop-blur-xl animate-in fade-in duration-300">
      <div data-testid="detail-modal" className="bg-rhozly-surface-lowest rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl border border-rhozly-outline/20">
        {/* Header */}
        <div className="flex items-start justify-between p-6 pb-4">
          <div className="flex items-start gap-4">
            <div className="relative shrink-0">
              {ailment.thumbnail_url ? (
                <SmartImage
                  src={ailment.thumbnail_url}
                  alt={ailment.name}
                  className="w-16 h-16 rounded-2xl object-cover bg-rhozly-surface-low"
                />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-rhozly-surface-low flex items-center justify-center">
                  {meta.icon}
                </div>
              )}
              <MultiImageGallery
                query={`${ailment.name}${ailment.scientific_name ? ` ${ailment.scientific_name}` : ""} ${ailment.type}`}
                label={ailment.name}
                existingImageUrl={ailment.thumbnail_url}
                triggerClassName="absolute -bottom-1 -right-1"
              />
            </div>
            <div>
              <h3 className="font-black text-2xl text-rhozly-on-surface leading-tight">{ailment.name}</h3>
              {ailment.scientific_name && (
                <p className="text-sm font-bold text-rhozly-primary uppercase tracking-widest mt-1">{ailment.scientific_name}</p>
              )}
              <span className={`inline-flex items-center gap-1 mt-1.5 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${meta.colour}`}>
                {meta.icon} {meta.label}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowDeleteConfirm(true)}
              disabled={deleting}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center bg-rhozly-surface-low rounded-2xl hover:bg-red-50 hover:text-red-500 transition-colors"
              aria-label="Delete ailment"
            >
              {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
            </button>
            <button
              onClick={onClose}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center bg-rhozly-surface-low rounded-2xl hover:scale-110 transition-transform"
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex bg-rhozly-surface-low p-1 rounded-2xl mx-6 mt-3 mb-0 flex-wrap gap-1">
          {(["info", "prevention", "remedy"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 min-w-[80px] py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center ${tab === t ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-on-surface/40 hover:text-rhozly-on-surface"}`}
            >
              {t === "info" ? "Info" : t === "prevention" ? `Prevention (${ailment.prevention_steps.length})` : `Remedy (${ailment.remedy_steps.length})`}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {tab === "info" && (
            <>
              <p className="text-sm font-bold text-rhozly-on-surface/70 leading-relaxed">{ailment.description}</p>

              {ailment.affected_plants.length > 0 && (
                <div>
                  <h3 className="text-xs font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-2">Affected Plants</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {ailment.affected_plants.map((p) => (
                      <span key={p} className="px-2.5 py-1 rounded-full text-xs font-black bg-rhozly-surface-low text-rhozly-on-surface/70">{p}</span>
                    ))}
                  </div>
                </div>
              )}

              {ailment.symptoms.length > 0 && (
                <div>
                  <h3 className="text-xs font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-2">Symptoms</h3>
                  <div className="space-y-2">
                    {ailment.symptoms.map((s) => (
                      <div key={s.id} className="bg-rhozly-surface-lowest rounded-2xl p-3 border border-rhozly-outline/10">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-black text-sm text-rhozly-on-surface">{s.title}</span>
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${SEVERITY_COLOUR[s.severity]}`}>{s.severity}</span>
                            <span className="text-[10px] font-bold text-rhozly-on-surface/40">{s.location}</span>
                          </div>
                        </div>
                        <p className="text-xs text-rhozly-on-surface/60 leading-relaxed">{s.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {(tab === "prevention" || tab === "remedy") && (
            <div className="space-y-3">
              {(tab === "prevention" ? ailment.prevention_steps : ailment.remedy_steps).map((step) => (
                <div key={step.id} className="bg-rhozly-surface-lowest rounded-2xl p-4 border border-rhozly-outline/10">
                  <div className="flex items-start justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-rhozly-primary/10 text-rhozly-primary text-[10px] font-black flex items-center justify-center shrink-0">
                        {step.step_order}
                      </span>
                      <span className="font-black text-sm text-rhozly-on-surface">{step.title}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      <span className="text-[10px] font-black bg-rhozly-surface-low px-2 py-0.5 rounded-full text-rhozly-on-surface/60">
                        {TASK_TYPE_LABELS[step.task_type]}
                      </span>
                      <span className="text-[10px] font-black bg-rhozly-surface-low px-2 py-0.5 rounded-full text-rhozly-on-surface/60">
                        {step.frequency_type === "every_n_days"
                          ? `Every ${step.frequency_every_n_days ?? "?"} days`
                          : FREQ_LABEL[step.frequency_type]}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-rhozly-on-surface/60 leading-relaxed ml-8">{step.description}</p>
                  {step.product && (
                    <p className="text-[10px] font-black text-rhozly-primary mt-1 ml-8">Product: {step.product}</p>
                  )}
                  {step.duration_minutes && (
                    <p className="text-[10px] font-bold text-rhozly-on-surface/40 mt-0.5 ml-8">~{step.duration_minutes} min</p>
                  )}
                </div>
              ))}
              {(tab === "prevention" ? ailment.prevention_steps : ailment.remedy_steps).length === 0 && (
                <div className="py-12 text-center text-sm font-bold text-rhozly-on-surface/30">
                  No {tab} steps recorded.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={executeDelete}
        title="Delete Ailment"
        description={`Remove "${ailment.name}" from your watchlist? This cannot be undone.`}
        confirmText="Delete"
        isDestructive
      />
    </div>
  );
}

// ─── Add Ailment Modal ────────────────────────────────────────────────────────

type CreationMode = "search" | "manual" | "perenual" | "ai";

const EMPTY_FORM = {
  name: "",
  scientific_name: "",
  type: "pest" as AilmentType,
  description: "",
  affected_plants_raw: "",
  symptoms: [] as AilmentSymptom[],
  prevention_steps: [] as AilmentStep[],
  remedy_steps: [] as AilmentStep[],
};

function AddAilmentModal({
  homeId,
  aiEnabled,
  onSaved,
  onClose,
  existingKeys,
}: {
  homeId: string;
  aiEnabled: boolean;
  onSaved: (ailment: Ailment) => void;
  onClose: () => void;
  /** Normalized names of the home's non-archived watchlist rows (A3, Stage 1
   *  of the ailment-library overhaul) — library results already being watched
   *  render a "Watching ✓" state instead of an Add button, closing the
   *  duplicate-add pitfall the docs used to warn about. */
  existingKeys?: Set<string>;
}) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<CreationMode>("search");

  // Phase 2 — open in the user's preferred ailment source (Settings) once, on
  // load. The user can still switch tabs; this just sets the starting one.
  const searchPref = useSearchPreference();
  const didInitMode = useRef(false);
  useEffect(() => {
    if (didInitMode.current || searchPref.loading) return;
    didInitMode.current = true;
    if (searchPref.ailmentSource === "perenual") setMode("perenual");
    else if (searchPref.ailmentSource === "ai") setMode("ai");
  }, [searchPref.loading, searchPref.ailmentSource]);

  // Unified tiered search (library → databases → Rhozly AI).
  const [query, setQuery] = useState("");
  const [library, setLibrary] = useState<LibraryAilment[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [addedLibraryIds, setAddedLibraryIds] = useState<Set<number>>(new Set());
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<{ name?: string; description?: string }>({});
  const [symptomsOpen, setSymptomsOpen] = useState(false);
  const [preventionOpen, setPreventionOpen] = useState(false);
  const [remedyOpen, setRemedyOpen] = useState(false);

  // Shared bulk-add step
  const [step, setStep] = useState<"tabs" | "review">("tabs");

  // Perenual state
  const [perenualQuery, setPerenualQuery] = useState("");
  const [perenualResults, setPerenualResults] = useState<any[]>([]);
  const [perenualLoading, setPerenualLoading] = useState(false);
  const [checkedPerenualIds, setCheckedPerenualIds] = useState<Set<number>>(new Set());
  const [expandedResultId, setExpandedResultId] = useState<number | null>(null);
  const [previewCache, setPreviewCache] = useState<Record<number, { loading: boolean; image?: string; desc?: string }>>({});
  const [perenualError, setPerenualError] = useState<string | null>(null);

  // AI state
  const [aiQuery, setAiQuery] = useState("");
  const [aiSearchLoading, setAiSearchLoading] = useState(false);
  type AIResult = { cartId: string; data: Omit<Ailment, "id" | "created_at">; library_id?: number };
  const [aiResults, setAiResults] = useState<AIResult[]>([]);
  const [checkedAiIds, setCheckedAiIds] = useState<Set<string>>(new Set());
  const [aiPreviewCache, setAiPreviewCache] = useState<Record<string, { loading: boolean; image?: string }>>({});
  const [expandedAiId, setExpandedAiId] = useState<string | null>(null);

  // Load the shared ailment library once (tier 1 — searched client-side).
  useEffect(() => {
    let cancelled = false;
    fetchAilmentLibrary()
      .then((rows) => { if (!cancelled) setLibrary(rows); })
      .catch(() => { /* library is a bonus tier — fail soft */ })
      .finally(() => { if (!cancelled) setLibraryLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const libraryMatches = useMemo(() => filterAilmentLibrary(library, query), [library, query]);

  useEffect(() => {
    if (!aiResults.length) return;
    for (const r of aiResults) {
      if (aiPreviewCache[r.cartId] !== undefined) continue;
      setAiPreviewCache((p) => ({ ...p, [r.cartId]: { loading: true } }));
      const tryWiki = async (term: string) => {
        try {
          const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(term)}`);
          if (!res.ok) return null;
          const d = await res.json();
          if (d.type === "disambiguation" || !d.extract) return null;
          return d.thumbnail?.source || d.originalimage?.source || null;
        } catch { return null; }
      };
      (async () => {
        const { name, scientific_name, type } = r.data;
        const img = (scientific_name && await tryWiki(scientific_name))
          || await tryWiki(name)
          || await tryWiki(`${name} ${type === "pest" ? "insect" : "disease"}`)
          || null;
        setAiPreviewCache((p) => ({ ...p, [r.cartId]: { loading: false, image: img || undefined } }));
      })();
    }
  }, [aiResults]);

  // Any Perenual string field can arrive as a plain string or {subtitle, description}
  const safeStr = (val: any): string => {
    if (!val) return "";
    if (typeof val === "string") return val;
    if (Array.isArray(val)) return val.map((v: any) => safeStr(v)).join("\n\n");
    return val.subtitle || val.description || "";
  };

  const extractScientificName = safeStr;

  // Detect ailment type from text keywords
  const detectType = (name: string, descText: string): AilmentType => {
    const t = (name + " " + descText).toLowerCase();
    if (/\bpest\b|insect|aphid|\bmite\b|fly\b|moth\b|beetle|caterpillar|\bworm\b|larvae|slug|snail|whitefly|thrip/.test(t)) return "pest";
    if (/invasive|weed\b/.test(t)) return "invasive_plant";
    return "disease";
  };

  // Parse bullet-pointed text into individual strings
  const parseBullets = (text: string): string[] =>
    text
      .split(/\n/)
      .map((line) => line.replace(/^[•·]\t?\s*/, "").trim())
      .filter((line) => line.length > 8);

  // Classify a solution subtitle into prevention vs remedy
  const classifySolution = (subtitle: string): "prevention" | "remedy" => {
    const s = subtitle.toLowerCase();
    if (/chemical|fungicid|pesticide|spray|biological control/.test(s)) return "remedy";
    return "prevention";
  };

  // Infer task_type from solution subtitle
  const inferTaskType = (subtitle: string): AilmentStep["task_type"] => {
    const s = subtitle.toLowerCase();
    if (/chemical|spray|fungicid/.test(s)) return "spray";
    if (/prune|pruning/.test(s)) return "prune";
    if (/remov|destroy/.test(s)) return "remove";
    if (/inspect|monitor/.test(s)) return "inspect";
    return "other";
  };

  // Parse a Perenual solution array into classified AilmentStep arrays
  const parseSolutions = (solutions: Array<{ subtitle: string; description: string }>) => {
    const prevention: AilmentStep[] = [];
    const remedy: AilmentStep[] = [];
    let prevOrder = 1;
    let remOrder = 1;

    for (const sol of solutions) {
      const bucket = classifySolution(sol.subtitle);
      const taskType = inferTaskType(sol.subtitle);
      const bullets = parseBullets(sol.description);
      const items = bullets.length > 0 ? bullets : [sol.description.trim()];

      for (const text of items) {
        const step: AilmentStep = {
          id: crypto.randomUUID(),
          step_order: bucket === "prevention" ? prevOrder++ : remOrder++,
          title: text.slice(0, 80),
          description: text,
          task_type: taskType,
          frequency_type: /weekly|every week/.test(text.toLowerCase()) ? "weekly"
            : /monthly|every month/.test(text.toLowerCase()) ? "monthly"
            : /daily/.test(text.toLowerCase()) ? "daily"
            : "once",
          notes: sol.subtitle,
        };
        (bucket === "prevention" ? prevention : remedy).push(step);
      }
    }

    return { prevention, remedy };
  };

  const fetchWikiPreview = async (id: number, commonName: string, scientificName: string) => {
    if (previewCache[id]) return;
    setPreviewCache((p) => ({ ...p, [id]: { loading: true } }));

    let networkError = false;
    const tryWiki = async (term: string) => {
      try {
        const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(term)}`);
        if (!res.ok) return null;
        const data = await res.json();
        if (data.type === "disambiguation" || !data.extract) return null;
        return data;
      } catch {
        networkError = true;
        return null;
      }
    };

    const data =
      (scientificName && await tryWiki(scientificName)) ||
      await tryWiki(commonName) ||
      await tryWiki(`${commonName} disease`) ||
      await tryWiki(`${commonName} pest`);

    setPreviewCache((p) => ({
      ...p,
      [id]: {
        loading: false,
        image: data?.thumbnail?.source || data?.originalimage?.source,
        desc: data?.extract || (networkError ? "Could not load encyclopedia data — check your connection." : "No encyclopedia entry found."),
      },
    }));
  };

  const handleExpandResult = (r: any) => {
    const id = r.id as number;
    if (expandedResultId === id) { setExpandedResultId(null); return; }
    setExpandedResultId(id);
    fetchWikiPreview(id, r.common_name, extractScientificName(r.scientific_name));
  };

  const searchPerenual = async (q: string = perenualQuery) => {
    if (!q.trim()) return;
    setPerenualLoading(true);
    setPerenualError(null);
    try {
      const results = await PerenualService.searchPestDisease(q);
      setPerenualResults(results);
      if (results.length === 0) {
        setPerenualError("No results found. Try a different search term.");
      } else {
        toast.success(`${results.length} result${results.length !== 1 ? "s" : ""} found`);
      }
    } catch (err: any) {
      setPerenualError(err.message || "Perenual search failed.");
    } finally {
      setPerenualLoading(false);
    }
  };

  const searchWithAI = async (q: string = aiQuery) => {
    if (!q.trim()) { toast.error("Enter a search query."); return; }
    setAiSearchLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data: funcData, error } = await supabase.functions.invoke("generate-ailment-suggestions", {
        body: { query: q },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (error) throw error;
      const stampIds = (steps: any[]) =>
        (steps || []).map((s: any, i: number) => ({
          ...s,
          id: s.id || crypto.randomUUID(),
          step_order: s.step_order ?? i + 1,
        }));
      const results: AIResult[] = (funcData.results || []).map((ai: any) => ({
        cartId: crypto.randomUUID(),
        library_id: typeof ai.library_id === "number" ? ai.library_id : undefined,
        data: {
          home_id: homeId,
          name: ai.name || "Unknown",
          scientific_name: ai.scientific_name || null,
          type: (ai.type || "disease") as AilmentType,
          description: ai.description || "",
          symptoms: (ai.symptoms || []).map((s: any) => ({ ...s, id: s.id || crypto.randomUUID() })),
          affected_plants: ai.affected_plants || [],
          prevention_steps: stampIds(ai.prevention_steps),
          remedy_steps: stampIds(ai.remedy_steps),
          source: "ai" as const,
          perenual_id: undefined,
          thumbnail_url: undefined,
        },
      }));
      setAiResults(results);
      setCheckedAiIds(new Set());
      setAiPreviewCache({});
      setExpandedAiId(null);
      if (results.length === 0) {
        toast.error("No results found. Try a different search.");
      } else {
        toast.success(`${results.length} suggestion${results.length !== 1 ? "s" : ""} generated`);
      }
    } catch (err: any) {
      Logger.error("AI ailment search failed", err, { homeId, query: aiQuery }, err.message || "AI search failed.");
    } finally {
      setAiSearchLoading(false);
    }
  };

  const handleSave = async () => {
    const errors: { name?: string; description?: string } = {};
    if (!form.name.trim()) errors.name = "Name is required";
    if (!form.description.trim()) errors.description = "Description is required";
    if (Object.keys(errors).length) { setFormErrors(errors); return; }
    setFormErrors({});
    setSaving(true);
    try {
      const payload = {
        home_id: homeId,
        name: form.name.trim(),
        scientific_name: form.scientific_name.trim() || null,
        type: form.type,
        description: form.description.trim(),
        symptoms: form.symptoms,
        affected_plants: form.affected_plants_raw.split(",").map((s) => s.trim()).filter(Boolean),
        prevention_steps: form.prevention_steps,
        remedy_steps: form.remedy_steps,
        source: mode,
        perenual_id: null,
        thumbnail_url: null,
      };
      const { data, error } = await supabase.from("ailments").insert(payload).select().single();
      if (error) throw error;
      toast.success(`"${data.name}" added to watchlist.`);
      onSaved(data as Ailment);
      onClose();
    } catch (err: any) {
      Logger.error("Failed to save ailment", err, { homeId }, err.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const buildAilmentFromPerenual = (item: any) => {
    const wikiDesc = previewCache[item.id]?.desc;
    const descBlocks: Array<{ subtitle: string; description: string }> = Array.isArray(item.description)
      ? item.description
      : item.description ? [{ subtitle: "", description: safeStr(item.description) }] : [];
    const mainDescription = descBlocks[0]?.description || wikiDesc || "";
    const solutionBlocks: Array<{ subtitle: string; description: string }> = Array.isArray(item.solution)
      ? item.solution
      : item.solution ? [{ subtitle: "Solution", description: safeStr(item.solution) }] : [];
    const { prevention, remedy } = parseSolutions(solutionBlocks);
    const thumbnail = Array.isArray(item.images) && item.images.length > 0
      ? item.images[0].thumbnail || item.images[0].small_url || null
      : null;
    return {
      home_id: homeId,
      name: item.common_name || "Unknown",
      scientific_name: safeStr(item.scientific_name) || null,
      type: detectType(item.common_name || "", mainDescription),
      description: mainDescription,
      symptoms: [] as AilmentSymptom[],
      affected_plants: Array.isArray(item.host) ? item.host.map(safeStr).filter(Boolean) : [],
      prevention_steps: prevention,
      remedy_steps: remedy,
      source: "perenual" as const,
      perenual_id: item.id,
      thumbnail_url: thumbnail,
    };
  };

  const fetchWikiImage = async (name: string): Promise<string | null> => {
    try {
      const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name)}`);
      if (!res.ok) return null;
      const d = await res.json();
      if (d.type === "disambiguation") return null;
      return d.thumbnail?.source || d.originalimage?.source || null;
    } catch { return null; }
  };

  const handleBulkSave = async () => {
    setSaving(true);
    try {
      const perenualPayloads = perenualResults
        .filter((r) => checkedPerenualIds.has(r.id))
        .map(buildAilmentFromPerenual);

      // For AI ailments, try to grab a Wikipedia thumbnail before saving
      const aiPayloads = await Promise.all(
        aiResults
          .filter((r) => checkedAiIds.has(r.cartId))
          .map(async (r) => {
            if (!r.data.thumbnail_url && r.data.name) {
              const imgUrl = await fetchWikiImage(r.data.name);
              if (imgUrl) return { ...r.data, thumbnail_url: imgUrl };
            }
            return r.data;
          }),
      );

      const payloads = [...perenualPayloads, ...aiPayloads];
      if (!payloads.length) { toast.error("Nothing selected."); return; }
      const { data, error } = await supabase.from("ailments").insert(payloads).select();
      if (error) throw error;
      // Persist AI-generated ailments to the shared library so future users find
      // them in the library tier (best-effort; never blocks the add).
      aiPayloads.forEach((p) => { void persistAiAilmentToLibrary(p as unknown as Record<string, unknown>); });
      (data as Ailment[]).forEach((a) => onSaved(a));
      (data as Ailment[]).forEach((a) => logEvent(EVENT.AILMENT_ADDED, { ailment_id: a.id, name: a.name, type: a.type }));
      toast.success(`Added ${data.length} ailment${data.length !== 1 ? "s" : ""} to watchlist.`);
      onClose();
    } catch (err: any) {
      Logger.error("Failed to bulk save ailments", err, { homeId }, err.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const addFromLibrary = async (lib: LibraryAilment) => {
    if (addedLibraryIds.has(lib.id)) return;
    try {
      const data = await addLibraryAilmentToWatchlist(lib, homeId);
      setAddedLibraryIds((prev) => new Set(prev).add(lib.id));
      onSaved(data as Ailment);
      logEvent(EVENT.AILMENT_ADDED, { ailment_id: (data as Ailment).id, name: lib.name, type: kindToWatchlistType(lib.kind) });
      toast.success(`"${lib.name}" added to watchlist.`);
    } catch (err: any) {
      Logger.error("Failed to add library ailment", err, { homeId }, err.message || "Add failed.");
    }
  };

  // Reach a deeper tier with the current search term pre-filled + run.
  const goToDatabases = () => { setPerenualQuery(query); setMode("perenual"); if (query.trim()) searchPerenual(query); };
  const goToAi = () => { setAiQuery(query); setMode("ai"); if (query.trim()) searchWithAI(query); };

  const showSteps = mode === "manual";
  const totalSelected = checkedPerenualIds.size + checkedAiIds.size;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-rhozly-bg/95 backdrop-blur-xl animate-in fade-in">
      {/* Frame matches BulkSearchModal ("Find a plant") so the two search
          modals read as one family — same size, header + tab bar. */}
      <div className="bg-rhozly-surface-lowest w-full max-w-3xl h-[85vh] flex flex-col rounded-3xl shadow-2xl border border-rhozly-outline/20 overflow-hidden relative">
        {/* Header */}
        <div className="p-8 pb-4 shrink-0 flex justify-between items-start">
          <div>
            <h3 className="text-3xl font-black flex items-center gap-3">
              <Biohazard className="text-rhozly-primary" /> Add to Watchlist
            </h3>
            <p className="text-[10px] font-black text-rhozly-on-surface/40 uppercase tracking-widest mt-1">
              Search and add pests, diseases &amp; weeds
            </p>
          </div>
          <button onClick={onClose} aria-label="Close modal" className="p-3 bg-rhozly-surface-low rounded-2xl hover:scale-110 transition-transform">
            <X size={24} />
          </button>
        </div>

        {/* Tab bar — Search / Manual, mirroring BulkSearchModal. "Search"
            covers the tiered library → databases → AI flow; deeper tiers keep
            their own "Back to Search" control inside the search panel. */}
        {step === "tabs" && (
          <div className="px-8 shrink-0">
            <div role="tablist" className="flex bg-rhozly-surface-low p-1 rounded-2xl gap-1">
              <button
                role="tab"
                data-testid="ailment-tab-search"
                aria-selected={mode !== "manual"}
                onClick={() => setMode("search")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl text-xs font-black transition-all ${mode !== "manual" ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-on-surface/40 hover:text-rhozly-on-surface"}`}
              >
                <Search size={14} /> Search
              </button>
              <button
                role="tab"
                data-testid="ailment-tab-manual"
                aria-selected={mode === "manual"}
                onClick={() => setMode("manual")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl text-xs font-black transition-all ${mode === "manual" ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-on-surface/40 hover:text-rhozly-on-surface"}`}
              >
                <Edit3 size={14} /> Manual
              </button>
            </div>
          </div>
        )}

        {/* Back-to-search control for the deeper tiers (Perenual / AI). Manual
            is reached via the tab bar, so it doesn't need this. */}
        {step === "tabs" && mode !== "search" && mode !== "manual" && (
          <div className="mx-8 mt-3 mb-1">
            <button
              onClick={() => setMode("search")}
              data-testid="ailment-back-to-search"
              className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-rhozly-on-surface/50 hover:text-rhozly-primary transition-colors"
            >
              <ChevronLeft size={14} /> Back to Search
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-8 py-5 custom-scrollbar space-y-5">

          {/* ── Review step: combined cart ── */}
          {step === "review" && (
            <div className="space-y-3">
              <button
                onClick={() => setStep("tabs")}
                className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-rhozly-on-surface/50 hover:text-rhozly-primary transition-colors"
              >
                <ChevronLeft size={14} /> Back to Search
              </button>
              <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40">
                {totalSelected} ailment{totalSelected !== 1 ? "s" : ""} ready to add
              </p>

              {/* Perenual selections */}
              {perenualResults.filter((r) => checkedPerenualIds.has(r.id)).map((r) => {
                const built = buildAilmentFromPerenual(r);
                const meta = TYPE_META[built.type];
                const thumbnail = Array.isArray(r.images) && r.images.length > 0
                  ? r.images[0].thumbnail || r.images[0].small_url
                  : previewCache[r.id]?.image;
                return (
                  <div key={r.id} className="bg-white border border-rhozly-outline/10 rounded-2xl p-4 flex items-center gap-3 shadow-sm">
                    <div className="w-12 h-12 rounded-xl bg-rhozly-surface-low overflow-hidden shrink-0 flex items-center justify-center text-rhozly-on-surface/20">
                      {thumbnail ? <img src={thumbnail} alt={r.common_name} className="w-full h-full object-cover" /> : meta.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-sm text-rhozly-on-surface truncate">{built.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`inline-flex items-center gap-0.5 text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full ${meta.colour}`}>
                          {meta.icon} {meta.label}
                        </span>
                        <span className="text-[9px] font-black text-rhozly-on-surface/30">Perenual</span>
                        <span className="text-[9px] font-black text-rhozly-on-surface/30">
                          {built.prevention_steps.length} prevention · {built.remedy_steps.length} remedy
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => setCheckedPerenualIds((prev) => { const n = new Set(prev); n.delete(r.id); return n; })}
                      className="p-2 text-rhozly-on-surface/30 hover:text-rhozly-error transition-colors"
                      aria-label="Remove"
                    >
                      <X size={14} />
                    </button>
                  </div>
                );
              })}

              {/* AI selections */}
              {aiResults.filter((r) => checkedAiIds.has(r.cartId)).map((r) => {
                const meta = TYPE_META[r.data.type as AilmentType];
                return (
                  <div key={r.cartId} className="bg-rhozly-surface-lowest border border-rhozly-outline/10 rounded-2xl p-4 flex items-center gap-3 shadow-sm">
                    <div className="w-12 h-12 rounded-xl bg-rhozly-surface-low overflow-hidden shrink-0 flex items-center justify-center text-amber-300">
                      <IconAI size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-sm text-rhozly-on-surface truncate">{r.data.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`inline-flex items-center gap-0.5 text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full ${meta.colour}`}>
                          {meta.icon} {meta.label}
                        </span>
                        <span className="text-[9px] font-black text-amber-500">AI</span>
                        <span className="text-[9px] font-black text-rhozly-on-surface/30">
                          {(r.data.prevention_steps || []).length} prevention · {(r.data.remedy_steps || []).length} remedy
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => setCheckedAiIds((prev) => { const n = new Set(prev); n.delete(r.cartId); return n; })}
                      className="p-2 text-rhozly-on-surface/30 hover:text-rhozly-error transition-colors"
                      aria-label="Remove"
                    >
                      <X size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Tabs content ── */}
          {step === "tabs" && (
            <>
              {/* Tiered search: library → databases → Rhozly AI. Styled to
                  mirror the Shed's "Find a plant" (PlantSearch): a magnifier
                  field, a calm empty state, and the escalation CTAs only once
                  the user has typed. */}
              {mode === "search" && (
                <div className="space-y-3">
                  <div className="relative">
                    <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-rhozly-on-surface/40 pointer-events-none" />
                    <input
                      data-testid="ailment-search-input"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      autoFocus
                      placeholder="Search any pest, disease or weed by name…"
                      className="w-full pl-10 pr-9 py-3 min-h-[48px] rounded-2xl bg-white border border-rhozly-outline/20 text-sm font-bold text-rhozly-on-surface placeholder:text-rhozly-on-surface/40 outline-none focus:border-rhozly-primary/50"
                    />
                    {libraryLoading && (
                      <Loader2 size={15} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-rhozly-on-surface/40" />
                    )}
                  </div>

                  {/* Calm empty prompt — mirrors PlantSearch's empty state. */}
                  {!query.trim() && (
                    <p data-testid="ailment-search-prompt" className="text-[12px] font-bold text-rhozly-on-surface/45 px-1 leading-snug">
                      Start typing a pest or disease — e.g. <span className="text-rhozly-primary">"aphids"</span> or <span className="text-rhozly-primary">"blight"</span>.
                    </p>
                  )}

                  {query.trim() && (
                    <div className="space-y-1.5">
                      {libraryLoading ? (
                        <div className="flex items-center gap-2 py-3 text-rhozly-on-surface/40">
                          <Loader2 size={14} className="animate-spin" /><span className="text-xs font-bold">Loading library…</span>
                        </div>
                      ) : libraryMatches.length === 0 ? (
                        <p className="text-[12px] font-bold text-rhozly-on-surface/45 px-1">Nothing in our library for "{query.trim()}". Try the options below.</p>
                      ) : (
                        libraryMatches.slice(0, 12).map((lib) => {
                          const meta = TYPE_META[kindToWatchlistType(lib.kind)];
                          const added =
                            addedLibraryIds.has(lib.id) ||
                            (existingKeys?.has(ailmentIdentityKey(lib.name)) ?? false);
                          return (
                            <div key={lib.id} data-testid={`ailment-library-result-${lib.id}`} className="border border-rhozly-outline/10 rounded-2xl bg-white flex items-center gap-3 p-3">
                              <div className="w-12 h-12 rounded-xl bg-rhozly-surface-low overflow-hidden shrink-0 flex items-center justify-center text-rhozly-on-surface/20">
                                {lib.thumbnail_url ? <img src={lib.thumbnail_url} alt={lib.name} className="w-full h-full object-cover" /> : meta.icon}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-black text-sm text-rhozly-on-surface truncate">{lib.name}</p>
                                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                  <span className={`inline-flex items-center gap-0.5 text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full ${meta.colour}`}>{meta.icon} {meta.label}</span>
                                  <span className="inline-flex items-center gap-0.5 text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full bg-rhozly-primary/10 text-rhozly-primary"><Library size={10} /> Library</span>
                                </div>
                              </div>
                              <button
                                onClick={() => addFromLibrary(lib)}
                                disabled={added}
                                data-testid={`ailment-library-add-${lib.id}`}
                                className="shrink-0 px-3 py-2 rounded-xl bg-rhozly-primary text-white text-xs font-black flex items-center gap-1 disabled:opacity-60 disabled:bg-rhozly-on-surface/20"
                              >
                                {added ? <><CheckCircle2 size={13} /> Watching</> : <><Plus size={13} /> Add</>}
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}

                  {/* Escalation CTAs — only once the user has typed, mirroring
                      PlantSearch. Subtle bordered buttons (not a loud fill) so
                      the modal reads the same as "Find a plant". */}
                  {query.trim() && (
                    <div className="space-y-2 pt-1">
                      <button
                        onClick={goToDatabases}
                        data-testid="ailment-search-databases"
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl border border-rhozly-outline/20 text-xs font-black text-rhozly-on-surface/70 hover:bg-rhozly-surface hover:text-rhozly-on-surface transition-colors"
                      >
                        <IconPlantDB size={14} /> Search more databases
                      </button>
                      <button
                        onClick={goToAi}
                        data-testid="ailment-search-ai"
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl border border-amber-300 text-xs font-black text-amber-600 hover:bg-amber-50 transition-colors"
                      >
                        <IconAI size={14} /> Search with Rhozly AI
                      </button>
                      <button
                        onClick={() => setMode("manual")}
                        data-testid="ailment-add-manually"
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl text-xs font-black text-rhozly-on-surface/55 hover:text-rhozly-on-surface hover:bg-rhozly-surface transition-colors"
                      >
                        <Edit3 size={13} /> Add "{query.trim()}" manually
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Perenual search */}
              {mode === "perenual" && (
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <input
                      value={perenualQuery}
                      onChange={(e) => setPerenualQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && searchPerenual()}
                      placeholder="Search pests & diseases…"
                      className="flex-1 p-4 bg-rhozly-surface-low rounded-2xl font-black text-sm border border-transparent focus:border-rhozly-primary outline-none"
                    />
                    <button
                      onClick={() => searchPerenual(perenualQuery)}
                      disabled={perenualLoading}
                      className="min-w-[44px] min-h-[44px] px-5 rounded-2xl bg-rhozly-primary text-white font-black text-sm flex items-center justify-center gap-2 hover:scale-[1.02] transition-transform disabled:opacity-60"
                    >
                      {perenualLoading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                    </button>
                  </div>
                  {perenualError && (
                    <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-2xl">
                      <AlertTriangle size={14} className="text-red-500 mt-0.5 shrink-0" />
                      <p className="text-xs font-bold text-red-700 leading-snug">{perenualError}</p>
                    </div>
                  )}
                  {perenualResults.length > 0 && (
                    <div className="space-y-2">
                      {perenualResults.map((r) => {
                        const sciName = extractScientificName(r.scientific_name);
                        const isExpanded = expandedResultId === r.id;
                        const isChecked = checkedPerenualIds.has(r.id);
                        const preview = previewCache[r.id];
                        const apiThumb = Array.isArray(r.images) && r.images.length > 0
                          ? r.images[0].thumbnail || r.images[0].small_url
                          : null;
                        const thumbnail = apiThumb || preview?.image;
                        return (
                          <div
                            key={r.id}
                            className={`border rounded-2xl overflow-hidden transition-all ${isChecked ? "border-rhozly-primary ring-1 ring-rhozly-primary/20 bg-rhozly-primary/5" : "border-rhozly-outline/10 hover:border-rhozly-primary/30 bg-white"}`}
                          >
                            <div className="flex items-center gap-3 p-3">
                              <button
                                onClick={() => setCheckedPerenualIds((prev) => {
                                  const next = new Set(prev);
                                  next.has(r.id) ? next.delete(r.id) : next.add(r.id);
                                  return next;
                                })}
                                className="shrink-0 w-11 h-11 flex items-center justify-center rounded-xl transition-colors"
                                aria-label={isChecked ? "Deselect" : "Select"}
                              >
                                {isChecked
                                  ? <CheckSquare2 size={20} className="text-rhozly-primary" />
                                  : <Square size={20} className="text-rhozly-on-surface/30" />}
                              </button>
                              <div className="w-12 h-12 rounded-xl bg-rhozly-surface-low overflow-hidden shrink-0 flex items-center justify-center text-rhozly-on-surface/20">
                                {thumbnail ? (
                                  <img src={thumbnail} alt={r.common_name} className="w-full h-full object-cover" />
                                ) : (
                                  <IconPest size={16} />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-black text-sm text-rhozly-on-surface truncate">{r.common_name}</p>
                                {sciName && <p className="text-[10px] font-bold italic text-rhozly-on-surface/40 truncate">{sciName}</p>}
                              </div>
                              <button
                                onClick={() => handleExpandResult(r)}
                                className="min-w-[44px] min-h-[44px] flex items-center justify-center text-rhozly-primary/60 hover:text-rhozly-primary hover:bg-rhozly-primary/10 rounded-xl transition-colors shrink-0"
                                aria-label={isExpanded ? "Collapse" : "Preview"}
                              >
                                {isExpanded ? <ChevronUp size={16} /> : <Info size={16} />}
                              </button>
                            </div>
                            {isExpanded && (
                              <div className="border-t border-rhozly-outline/5 bg-rhozly-surface-low/50 p-4 animate-in slide-in-from-top-2">
                                {!preview || preview.loading ? (
                                  <div className="flex items-center justify-center gap-2 py-4 text-rhozly-on-surface/40">
                                    <Loader2 size={14} className="animate-spin" />
                                    <span className="text-xs font-bold">Loading preview…</span>
                                  </div>
                                ) : (
                                  <div className="flex gap-3 items-start">
                                    {preview.image && (
                                      <img src={preview.image} alt={r.common_name} className="w-20 h-20 rounded-xl object-cover shadow-sm shrink-0" />
                                    )}
                                    <p className="text-xs font-semibold text-rhozly-on-surface/70 leading-relaxed">{preview.desc}</p>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* AI search + results */}
              {mode === "ai" && (
                <div className="space-y-4">
                  {!aiEnabled ? (
                    <div data-testid="ailment-ai-gate" className="bg-rhozly-surface rounded-3xl border border-rhozly-outline/20 p-6 text-center">
                      <div className="w-10 h-10 bg-rhozly-on-surface/5 rounded-2xl flex items-center justify-center mx-auto mb-3">
                        <Lock size={18} className="text-rhozly-on-surface/30" />
                      </div>
                      <p className="font-black text-rhozly-on-surface text-sm mb-1">AI subscription required</p>
                      <p className="text-xs font-bold text-rhozly-on-surface/50 leading-relaxed mb-3">
                        This is a Sage+ feature.
                      </p>
                      <button
                        onClick={() => { onClose(); navigate("/gardener"); }}
                        className="text-xs font-black text-rhozly-primary hover:underline"
                      >
                        Upgrade in Account Settings →
                      </button>
                    </div>
                  ) : (
                  <>
                  <div className="flex gap-2">
                    <input
                      value={aiQuery}
                      onChange={(e) => setAiQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && searchWithAI()}
                      placeholder="e.g. rose pests, black spot, aphids…"
                      className="flex-1 p-4 bg-rhozly-surface-lowest rounded-2xl font-black text-sm border border-rhozly-outline/10 focus:border-amber-500 outline-none"
                    />
                    <button
                      onClick={() => searchWithAI(aiQuery)}
                      disabled={aiSearchLoading || !aiQuery.trim()}
                      className="min-w-[52px] min-h-[52px] px-5 rounded-2xl bg-amber-500 text-white font-black text-sm flex items-center justify-center gap-2 hover:scale-[1.02] transition-transform disabled:opacity-60"
                      aria-label="Search with AI"
                    >
                      {aiSearchLoading ? <Loader2 size={16} className="animate-spin" /> : <IconAI size={16} />}
                    </button>
                  </div>
                  <p className="text-[11px] font-bold text-rhozly-on-surface/40 px-1">
                    Tip: avoid including personal details like names or addresses in your search.
                  </p>
                  </>
                  )}

                  {aiSearchLoading && (
                    <div className="flex items-center justify-center gap-2 py-8 text-amber-500/70">
                      <Loader2 size={18} className="animate-spin" />
                      <span className="text-sm font-black">Searching…</span>
                    </div>
                  )}

                  {!aiSearchLoading && aiResults.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[10px] font-black uppercase tracking-widest text-amber-500/70">
                        {aiResults.length} result{aiResults.length !== 1 ? "s" : ""} — tick to select
                      </p>
                      {aiResults.map((r) => {
                        const isChecked = checkedAiIds.has(r.cartId);
                        const meta = TYPE_META[r.data.type as AilmentType];
                        const preview = aiPreviewCache[r.cartId];
                        const isExpanded = expandedAiId === r.cartId;
                        return (
                          <div
                            key={r.cartId}
                            className={`border rounded-2xl overflow-hidden transition-all ${isChecked ? "border-amber-400 ring-1 ring-amber-200 bg-amber-50/30" : "border-rhozly-outline/10 hover:border-amber-300/50 bg-white"}`}
                          >
                            <div className="flex items-center gap-3 p-3">
                              <button
                                onClick={() => setCheckedAiIds((prev) => {
                                  const next = new Set(prev);
                                  next.has(r.cartId) ? next.delete(r.cartId) : next.add(r.cartId);
                                  return next;
                                })}
                                className="shrink-0 w-11 h-11 flex items-center justify-center rounded-xl transition-colors"
                                aria-label={isChecked ? "Deselect" : "Select"}
                              >
                                {isChecked
                                  ? <CheckSquare2 size={20} className="text-amber-500" />
                                  : <Square size={20} className="text-rhozly-on-surface/30" />}
                              </button>
                              <div className="w-12 h-12 rounded-xl bg-rhozly-surface-low overflow-hidden shrink-0 flex items-center justify-center text-amber-300">
                                {preview?.image ? (
                                  <img src={preview.image} alt={r.data.name} className="w-full h-full object-cover" />
                                ) : preview?.loading ? (
                                  <Loader2 size={16} className="animate-spin text-amber-400" />
                                ) : (
                                  <IconAI size={18} />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-black text-sm text-rhozly-on-surface">{r.data.name}</p>
                                {r.data.scientific_name && (
                                  <p className="text-[10px] font-bold italic text-rhozly-on-surface/40 truncate">{r.data.scientific_name}</p>
                                )}
                                <span className={`inline-flex items-center gap-0.5 text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full ${meta.colour}`}>
                                  {meta.icon} {meta.label}
                                </span>
                                {r.library_id && (
                                  <button
                                    type="button"
                                    data-testid={`ailment-result-library-${r.cartId}`}
                                    onClick={(e) => { e.stopPropagation(); navigate(`/ailment-library?ailment=${r.library_id}`); }}
                                    className="ml-1.5 inline-flex items-center gap-0.5 text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full bg-rhozly-primary/10 text-rhozly-primary hover:bg-rhozly-primary/20 transition-colors"
                                  >
                                    <Library size={10} /> In library
                                  </button>
                                )}
                              </div>
                              <button
                                onClick={() => setExpandedAiId(isExpanded ? null : r.cartId)}
                                className="min-w-[44px] min-h-[44px] flex items-center justify-center text-amber-500/60 hover:text-amber-500 hover:bg-amber-50 rounded-xl transition-colors shrink-0"
                                aria-label={isExpanded ? "Collapse" : "Show details"}
                              >
                                {isExpanded ? <ChevronUp size={16} /> : <Info size={16} />}
                              </button>
                            </div>
                            {isExpanded && (
                              <div className="border-t border-rhozly-outline/5 bg-rhozly-surface-low/40 p-4 animate-in slide-in-from-top-2">
                                <div className="flex gap-3 items-start">
                                  {preview?.image ? (
                                    <img src={preview.image} alt={r.data.name} className="w-20 h-20 rounded-xl object-cover shadow-sm shrink-0" />
                                  ) : !preview?.loading ? (
                                    <div className="w-20 h-20 rounded-xl bg-rhozly-surface-low flex items-center justify-center shrink-0 text-rhozly-on-surface/20 border border-rhozly-outline/10">
                                      <IconAI size={18} />
                                    </div>
                                  ) : null}
                                  <p className="text-xs font-semibold text-rhozly-on-surface/70 leading-relaxed">{r.data.description}</p>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Manual form */}
              {showSteps && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="ailment-name" className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 block mb-2">Name *</label>
                      <input
                        id="ailment-name"
                        value={form.name}
                        onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value })); if (formErrors.name) setFormErrors((fe) => ({ ...fe, name: undefined })); }}
                        className={`w-full p-4 bg-rhozly-surface-low rounded-2xl font-black text-sm border outline-none focus:border-rhozly-primary ${formErrors.name ? "border-red-400" : "border-transparent"}`}
                      />
                      {formErrors.name && <p className="text-[10px] font-bold text-red-500 mt-1 ml-1">{formErrors.name}</p>}
                    </div>
                    <div>
                      <label htmlFor="ailment-type" className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 block mb-2">Type *</label>
                      <select
                        id="ailment-type"
                        value={form.type}
                        onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as AilmentType }))}
                        className="w-full p-4 bg-rhozly-surface-low rounded-2xl font-black text-sm border border-transparent focus:border-rhozly-primary outline-none"
                      >
                        <option value="invasive_plant">Invasive Plant</option>
                        <option value="pest">Pest</option>
                        <option value="disease">Disease</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 block mb-2">Scientific name</label>
                    <input
                      value={form.scientific_name}
                      onChange={(e) => setForm((f) => ({ ...f, scientific_name: e.target.value }))}
                      className="w-full p-4 bg-rhozly-surface-low rounded-2xl font-black text-sm border border-transparent focus:border-rhozly-primary outline-none"
                    />
                  </div>

                  <div>
                    <label htmlFor="ailment-description" className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 block mb-2">Description *</label>
                    <textarea
                      id="ailment-description"
                      value={form.description}
                      onChange={(e) => { setForm((f) => ({ ...f, description: e.target.value })); if (formErrors.description) setFormErrors((fe) => ({ ...fe, description: undefined })); }}
                      rows={3}
                      className={`w-full p-4 bg-rhozly-surface-low rounded-2xl font-black text-sm border outline-none focus:border-rhozly-primary resize-none ${formErrors.description ? "border-red-400" : "border-transparent"}`}
                    />
                    {formErrors.description && <p className="text-[10px] font-bold text-red-500 mt-1 ml-1">{formErrors.description}</p>}
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 block mb-2">Affected plants (comma-separated)</label>
                    <input
                      value={form.affected_plants_raw}
                      onChange={(e) => setForm((f) => ({ ...f, affected_plants_raw: e.target.value }))}
                      placeholder="e.g. Roses, Tomatoes, Basil"
                      className="w-full p-4 bg-rhozly-surface-low rounded-2xl font-black text-sm border border-transparent focus:border-rhozly-primary outline-none"
                    />
                  </div>

                  {(form.type === "pest" || form.type === "disease") && (
                    <div className="space-y-3">
                      <button
                        type="button"
                        onClick={() => setSymptomsOpen((v) => !v)}
                        className="w-full flex items-center justify-between px-1 py-2 text-xs font-black uppercase tracking-widest text-rhozly-on-surface/50 hover:text-rhozly-on-surface transition-colors"
                      >
                        <span>Symptoms <span className="font-bold normal-case tracking-normal text-rhozly-on-surface/30">(optional)</span></span>
                        {symptomsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                      {symptomsOpen && (
                      <div className="space-y-3">
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => setForm((f) => ({ ...f, symptoms: [...f.symptoms, newSymptom()] }))}
                          className="flex items-center gap-1 text-xs font-black text-rhozly-primary hover:underline"
                        >
                          <Plus size={12} /> Add symptom
                        </button>
                      </div>
                      {form.symptoms.map((s, idx) => (
                        <div key={s.id} className="bg-rhozly-surface-lowest rounded-2xl p-3 border border-rhozly-outline/10 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black uppercase text-rhozly-on-surface/40">Symptom {idx + 1}</span>
                            <button
                              type="button"
                              onClick={() => setForm((f) => ({ ...f, symptoms: f.symptoms.filter((_, i) => i !== idx) }))}
                              className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-rhozly-on-surface/30 hover:text-red-500 transition-colors"
                              aria-label="Remove symptom"
                            >
                              <X size={14} />
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              value={s.title}
                              onChange={(e) => setForm((f) => ({ ...f, symptoms: f.symptoms.map((sym, i) => i === idx ? { ...sym, title: e.target.value } : sym) }))}
                              placeholder="Title *"
                              className="w-full p-3 bg-rhozly-surface-low rounded-2xl font-black text-sm border border-transparent focus:border-rhozly-primary outline-none"
                            />
                            <input
                              value={s.location}
                              onChange={(e) => setForm((f) => ({ ...f, symptoms: f.symptoms.map((sym, i) => i === idx ? { ...sym, location: e.target.value } : sym) }))}
                              placeholder="Location (e.g. leaves)"
                              className="w-full p-3 bg-rhozly-surface-low rounded-2xl font-black text-sm border border-transparent focus:border-rhozly-primary outline-none"
                            />
                          </div>
                          <textarea
                            value={s.description}
                            onChange={(e) => setForm((f) => ({ ...f, symptoms: f.symptoms.map((sym, i) => i === idx ? { ...sym, description: e.target.value } : sym) }))}
                            placeholder="Description"
                            rows={2}
                            className="w-full p-3 bg-rhozly-surface-low rounded-2xl font-black text-sm border border-transparent focus:border-rhozly-primary outline-none resize-none"
                          />
                          <select
                            value={s.severity}
                            onChange={(e) => setForm((f) => ({ ...f, symptoms: f.symptoms.map((sym, i) => i === idx ? { ...sym, severity: e.target.value as AilmentSymptom["severity"] } : sym) }))}
                            className="w-full p-3 bg-rhozly-surface-low rounded-2xl font-black text-xs border border-transparent focus:border-rhozly-primary outline-none"
                          >
                            <option value="mild">Mild</option>
                            <option value="moderate">Moderate</option>
                            <option value="severe">Severe</option>
                          </select>
                        </div>
                      ))}
                      </div>
                    )}
                    </div>
                  )}

                  <div>
                    <button
                      type="button"
                      onClick={() => setPreventionOpen((v) => !v)}
                      className="w-full flex items-center justify-between px-1 py-2 text-xs font-black uppercase tracking-widest text-rhozly-on-surface/50 hover:text-rhozly-on-surface transition-colors"
                    >
                      <span>Prevention Steps <span className="font-bold normal-case tracking-normal text-rhozly-on-surface/30">(optional)</span></span>
                      {preventionOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                    {preventionOpen && (
                      <StepBuilder
                        label=""
                        steps={form.prevention_steps}
                        onChange={(steps) => setForm((f) => ({ ...f, prevention_steps: steps }))}
                      />
                    )}
                  </div>
                  <div>
                    <button
                      type="button"
                      onClick={() => setRemedyOpen((v) => !v)}
                      className="w-full flex items-center justify-between px-1 py-2 text-xs font-black uppercase tracking-widest text-rhozly-on-surface/50 hover:text-rhozly-on-surface transition-colors"
                    >
                      <span>Remedy Steps <span className="font-bold normal-case tracking-normal text-rhozly-on-surface/30">(optional)</span></span>
                      {remedyOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                    {remedyOpen && (
                      <StepBuilder
                        label=""
                        steps={form.remedy_steps}
                        onChange={(steps) => setForm((f) => ({ ...f, remedy_steps: steps }))}
                      />
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* Footer — shared selection bar (Perenual + AI tabs) */}
        {step === "tabs" && totalSelected > 0 && mode !== "manual" && (
          <div className="shrink-0 px-8 py-4 border-t border-rhozly-outline/10 animate-in slide-in-from-bottom-2">
            <div className="bg-rhozly-surface-lowest shadow-2xl border border-rhozly-outline/20 rounded-2xl p-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-black text-rhozly-on-surface">{totalSelected} Selected</p>
                <p className="text-[10px] font-bold uppercase tracking-widest text-rhozly-on-surface/40">
                  {checkedPerenualIds.size > 0 && checkedAiIds.size > 0
                    ? `${checkedPerenualIds.size} from database · ${checkedAiIds.size} AI`
                    : checkedPerenualIds.size > 0
                    ? "from Plant Database"
                    : "AI generated"}
                </p>
              </div>
              <button
                onClick={() => setStep("review")}
                className="px-6 py-3 bg-rhozly-primary text-white rounded-2xl font-black text-sm flex items-center gap-2 hover:scale-[1.02] transition-transform"
              >
                <ChevronRight size={16} /> Review & Add
              </button>
            </div>
          </div>
        )}

        {/* Footer — review: commit */}
        {step === "review" && (
          <div className="px-8 py-6 pt-4 border-t border-rhozly-outline/10 flex gap-3">
            <button
              onClick={() => setStep("tabs")}
              className="flex-1 py-3.5 rounded-2xl border-2 border-rhozly-outline/20 font-black text-sm text-rhozly-on-surface/60 hover:text-rhozly-on-surface transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleBulkSave}
              disabled={saving || totalSelected === 0}
              className="flex-1 py-3.5 bg-rhozly-primary text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2 hover:scale-[1.02] transition-transform disabled:opacity-60"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              {saving ? `Adding ${totalSelected} ailment${totalSelected !== 1 ? "s" : ""}…` : `Add ${totalSelected} Ailment${totalSelected !== 1 ? "s" : ""}`}
            </button>
          </div>
        )}

        {/* Footer — Manual form */}
        {showSteps && (
          <div className="px-8 py-6 pt-4 border-t border-rhozly-outline/10 flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-3.5 rounded-2xl border-2 border-rhozly-outline/20 font-black text-sm text-rhozly-on-surface/60 hover:text-rhozly-on-surface transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-3.5 bg-rhozly-primary text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2 hover:scale-[1.02] transition-transform disabled:opacity-60"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              {saving ? "Saving…" : "Add to Watchlist"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Source badge helpers ─────────────────────────────────────────────────────

const SOURCE_META: Record<string, { icon: React.ReactNode; label: string; colour: string }> = {
  library:  { icon: <Library size={10} />,  label: "Library",  colour: "text-emerald-600" },
  perenual: { icon: <IconPlantDB size={10} />, label: "Plant Database", colour: "text-rhozly-primary" },
  ai:       { icon: <IconAI size={10} />, label: "AI",       colour: "text-amber-500" },
  manual:   { icon: <Edit3 size={10} />,    label: "Manual",   colour: "text-rhozly-on-surface/60" },
};

const TYPE_OVERLAY: Record<AilmentType, string> = {
  pest:           "text-red-600",
  disease:        "text-purple-600",
  invasive_plant: "text-orange-600",
};

const TYPE_BG: Record<AilmentType, string> = {
  pest:           "bg-rhozly-surface-low",
  disease:        "bg-rhozly-surface-low",
  invasive_plant: "bg-rhozly-surface-low",
};

const TYPE_ICON_COLOUR: Record<AilmentType, string> = {
  pest:           "text-red-200",
  disease:        "text-purple-200",
  invasive_plant: "text-orange-200",
};

// ─── Ailment Card ─────────────────────────────────────────────────────────────

function AilmentCard({
  ailment,
  affectedCount,
  onClick,
  onArchiveToggle,
  onDelete,
  onAskAi,
  onToggleFavourite,
  isFavourited,
  favouriteLocked,
  favouriteBusy,
  canDelete,
  aiEnabled,
}: {
  ailment: Ailment;
  affectedCount: number;
  onClick: () => void;
  onArchiveToggle: () => void;
  onDelete: () => void;
  onAskAi: () => void;
  onToggleFavourite: () => void;
  isFavourited: boolean;
  favouriteLocked: boolean;
  favouriteBusy: boolean;
  canDelete: boolean;
  aiEnabled: boolean;
}) {
  const meta = TYPE_META[ailment.type];
  const srcMeta = SOURCE_META[ailment.source] ?? SOURCE_META.manual;

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onClick()}
      className="bg-rhozly-surface-lowest rounded-3xl overflow-hidden border border-rhozly-outline/20 shadow-sm group flex flex-col cursor-pointer hover:border-rhozly-primary/30 focus:outline-none focus:ring-2 focus:ring-rhozly-primary focus:ring-offset-2 transition-all"
    >
      {/* Image header */}
      <div className="h-44 relative overflow-hidden">
        {ailment.thumbnail_url ? (
          <SmartImage
            src={ailment.thumbnail_url}
            alt={ailment.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className={`w-full h-full flex items-center justify-center ${TYPE_BG[ailment.type]}`}>
            <span className={TYPE_ICON_COLOUR[ailment.type]}>
              {ailment.type === "pest" ? <IconPest size={72} /> :
               ailment.type === "disease" ? <Biohazard size={72} /> : <IconPlant size={72} />}
            </span>
          </div>
        )}

        {/* Source badge — top left */}
        <div className="absolute top-4 left-4">
          <span className={`bg-white/90 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-black uppercase flex items-center gap-1.5 shadow-sm border border-white/20 ${srcMeta.colour}`}>
            {srcMeta.icon} {srcMeta.label}
          </span>
        </div>

        {/* Photos button — bottom left */}
        <MultiImageGallery
          query={`${ailment.name}${ailment.scientific_name ? ` ${ailment.scientific_name}` : ""} ${ailment.type}`}
          label={ailment.name}
          existingImageUrl={ailment.thumbnail_url}
          triggerClassName="absolute bottom-3 left-3"
        />

        {/* Archive + Delete + Favourite buttons — top right */}
        <div className="absolute top-4 right-4 flex gap-2">
          {/* Cross-home favourite heart. Strict source × tier gating: above-tier
              sources are view-only, so the heart is disabled with an upsell
              tooltip. Favouriting is personal — never permission-gated. */}
          <button
            data-testid={`favourite-ailment-${ailment.id}`}
            onClick={(e) => { e.stopPropagation(); if (!favouriteLocked) onToggleFavourite(); }}
            disabled={favouriteLocked || favouriteBusy}
            aria-pressed={isFavourited}
            aria-label={
              favouriteLocked
                ? `Favouriting ${ailment.name} is locked on your plan`
                : isFavourited
                  ? `Remove ${ailment.name} from favourites`
                  : `Save ${ailment.name} to favourites`
            }
            title={
              favouriteLocked
                ? lockedAilmentSourceMessage(ailment.source)
                : isFavourited
                  ? "Remove from favourites"
                  : "Save to favourites — follows you across homes"
            }
            className={`w-11 h-11 bg-white/90 backdrop-blur-md rounded-xl flex items-center justify-center shadow-md transition-all active:scale-90 ${
              favouriteLocked
                ? "text-rhozly-on-surface/20 cursor-not-allowed"
                : isFavourited
                  ? "text-rose-500 hover:bg-rose-50"
                  : "text-rhozly-on-surface/60 hover:text-rose-500"
            }`}
          >
            {favouriteBusy ? (
              <Loader2 size={16} className="animate-spin" />
            ) : favouriteLocked ? (
              <Lock size={16} />
            ) : (
              <Heart size={16} className={isFavourited ? "fill-current" : ""} />
            )}
          </button>
          {canDelete && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); onArchiveToggle(); }}
                aria-label={ailment.is_archived ? "Restore ailment" : "Archive ailment"}
                className="w-11 h-11 bg-white/90 backdrop-blur-md rounded-xl text-rhozly-on-surface/60 hover:text-orange-600 flex items-center justify-center shadow-md transition-all active:scale-90"
              >
                {ailment.is_archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                aria-label="Delete ailment"
                className="w-11 h-11 bg-white/90 backdrop-blur-md rounded-xl text-rhozly-on-surface/60 hover:text-red-600 flex items-center justify-center shadow-md transition-all active:scale-90"
              >
                <Trash2 size={16} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="p-6">
        <h3 className="text-xl font-black text-rhozly-on-surface leading-tight mb-1">{ailment.name}</h3>
        {ailment.scientific_name && (
          <p className="text-xs font-bold italic text-rhozly-on-surface/40 truncate">{ailment.scientific_name}</p>
        )}
        <p className="text-xs text-rhozly-on-surface/60 line-clamp-2 leading-relaxed mt-2">{ailment.description}</p>
        {affectedCount > 0 && (
          <div className="mt-3">
            <span
              data-testid={`ailment-affected-count-${ailment.id}`}
              className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full bg-rose-100 text-rose-700 border border-rose-200"
            >
              <AlertTriangle size={11} />
              {affectedCount} plant{affectedCount !== 1 ? "s" : ""} affected
            </span>
          </div>
        )}
        <div className="mt-auto pt-5 border-t border-rhozly-outline/10 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black text-rhozly-on-surface/30 uppercase tracking-widest">Steps</p>
            <p className="text-lg font-black text-rhozly-primary">
              {(ailment.prevention_steps?.length ?? 0) + (ailment.remedy_steps?.length ?? 0)}
            </p>
          </div>
          <span className={`inline-flex items-center gap-1 text-[9px] font-black uppercase px-2 py-1 rounded-full ${meta.colour}`}>
            {meta.icon} {meta.label}
          </span>
        </div>
        {aiEnabled && (
          <button
            onClick={(e) => { e.stopPropagation(); onAskAi(); }}
            data-testid={`ailment-ask-ai-${ailment.id}`}
            className="mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-rhozly-primary/5 border border-rhozly-primary/20 text-rhozly-primary text-xs font-black hover:bg-rhozly-primary/10 transition-colors"
          >
            <Sparkles size={13} />
            Ask Rhozly AI about this
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export type AilmentFilter = "all" | AilmentType;

export default function AilmentWatchlist({ homeId, aiEnabled = false, perenualEnabled = false }: { homeId: string; aiEnabled?: boolean; perenualEnabled?: boolean }) {
  const { can } = usePermissions();
  const { requestFeedback } = useBetaFeedbackContext();
  const { setIsOpen, setPageContext } = usePlantDoctor();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const openHandled = useRef(false);
  const [ailments, setAilments] = useState<Ailment[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [retryTick, setRetryTick] = useState(0);
  const [viewTab, setViewTab] = useState<"active" | "archived">("active");
  const [filter, setFilter] = useState<AilmentFilter>("all");
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [showBulkAdd, setShowBulkAdd] = useState(false);
  const [selectedAilment, setSelectedAilment] = useState<Ailment | null>(null);

  // ── Cross-home favourites (Phase 2 — ailments) ─────────────────────────────
  // Scope pill: "Home" = today's home-scoped watchlist; "Favourites" = the
  // user's cross-home list. Deep link `/shed?tab=watchlist&scope=favourites` —
  // a NEW param; the existing GardenHub `?tab=` / `?open=` params are untouched.
  const scope: "home" | "favourites" =
    searchParams.get("scope") === "favourites" ? "favourites" : "home";
  const switchScope = (next: "home" | "favourites") => {
    setSearchParams((p) => {
      const n = new URLSearchParams(p);
      if (next === "favourites") n.set("scope", "favourites");
      else n.delete("scope");
      return n;
    }, { replace: true });
  };

  const [favourites, setFavourites] = useState<FavouriteAilment[]>([]);
  const [favouritesLoading, setFavouritesLoading] = useState(true);
  const [homeName, setHomeName] = useState<string | null>(null);
  const [togglingFavouriteKey, setTogglingFavouriteKey] = useState<string | null>(null);

  const loadFavourites = useCallback(async () => {
    try {
      const rows = await listFavouriteAilments();
      setFavourites(rows);
    } catch (err) {
      Logger.warn("Could not load favourite ailments", { err });
    } finally {
      setFavouritesLoading(false);
    }
  }, []);

  useEffect(() => { loadFavourites(); }, [loadFavourites]);

  useEffect(() => {
    if (!homeId) return;
    supabase
      .from("homes")
      .select("name")
      .eq("id", homeId)
      .maybeSingle()
      .then(({ data }) => setHomeName(data?.name ?? null));
  }, [homeId]);

  /** Identity keys of the user's favourite ailments — drives heart fill. */
  const favouriteKeys = useMemo(
    () => new Set(favourites.map((f) => f.identity_key || ailmentIdentityKey(f.name))),
    [favourites],
  );

  const handleToggleFavourite = async (ailment: Ailment) => {
    const key = ailmentIdentityKey(ailment.name);
    if (togglingFavouriteKey === key) return;
    setTogglingFavouriteKey(key);
    const isFavourited = favouriteKeys.has(key);
    try {
      if (isFavourited) {
        setFavourites((prev) => prev.filter((f) => (f.identity_key || ailmentIdentityKey(f.name)) !== key));
        const existing = favourites.find((f) => (f.identity_key || ailmentIdentityKey(f.name)) === key);
        if (existing) await unfavouriteAilment(existing.id);
        logEvent(EVENT.AILMENT_UNFAVOURITED, { ailment_library_id: existing?.ailment_library_id ?? null, source: ailment.source });
        toast.success("Removed from favourites.");
      } else {
        const row = await favouriteAilment(ailment as any, homeId);
        setFavourites((prev) => [row, ...prev.filter((f) => f.id !== row.id)]);
        logEvent(EVENT.AILMENT_FAVOURITED, { ailment_library_id: row.ailment_library_id, source: ailment.source });
        toast.success("Saved to your favourites — it follows you across homes.");
      }
      loadFavourites();
    } catch (err: any) {
      loadFavourites(); // roll back optimistic state
      if (String(err?.message ?? "").includes("tier_locked_source")) {
        toast.error(lockedAilmentSourceMessage(ailment.source));
      } else {
        Logger.error("Favourite ailment toggle failed", err, { ailmentId: ailment.id }, "Could not update favourites — please try again.");
      }
    } finally {
      setTogglingFavouriteKey(null);
    }
  };

  useEffect(() => {
    if (openHandled.current) return;
    if (searchParams.get("open") === "add-ailment") {
      openHandled.current = true;
      setShowAdd(true);
      setSearchParams((p) => { const n = new URLSearchParams(p); n.delete("open"); return n; }, { replace: true });
    }
  }, [searchParams, setSearchParams]);
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    type: "delete" | "archive" | "unarchive";
    ailment: Ailment | null;
  }>({ isOpen: false, type: "delete", ailment: null });

  // Map of ailment_id → number of active plant instances affected
  const [affectedCounts, setAffectedCounts] = useState<Record<string, number>>({});

  const fetchAilments = useCallback(async () => {
    // Offline-first Phase 2: paint the cached watchlist instantly so the
    // screen opens offline; only show the spinner on a cold first visit.
    const cached = homeId ? readSnapshot<Ailment[]>("watchlist", homeId) : null;
    if (cached) {
      setAilments(cached.data);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setFetchError(false);
    const { data, error } = await supabase
      .from("ailments")
      .select("*")
      .eq("home_id", homeId)
      .order("created_at", { ascending: false });
    if (error) {
      Logger.error("Failed to load ailment watchlist", error, { homeId }, "Could not load watchlist.");
      if (!cached) setFetchError(true); // keep cached rows visible offline
    } else {
      setAilments((data || []) as Ailment[]);
      if (homeId) writeSnapshot("watchlist", homeId, (data || []) as Ailment[]);
    }
    setLoading(false);
  }, [homeId, retryTick]);

  const fetchAffectedCounts = useCallback(async () => {
    const { data } = await supabase
      .from("plant_instance_ailments")
      .select("ailment_id")
      .eq("home_id", homeId)
      .eq("status", "active");
    if (!data) return;
    const counts: Record<string, number> = {};
    data.forEach((row: any) => {
      if (!row.ailment_id) return;
      counts[row.ailment_id] = (counts[row.ailment_id] ?? 0) + 1;
    });
    setAffectedCounts(counts);
  }, [homeId]);

  useEffect(() => { fetchAilments(); fetchAffectedCounts(); }, [fetchAilments, fetchAffectedCounts]);
  useHomeRealtime("ailments", fetchAilments);
  useHomeRealtime("plant_instance_ailments", fetchAffectedCounts);

  const handleConfirmAction = async () => {
    const { ailment, type } = confirmState;
    if (!ailment) return;
    try {
      if (type === "delete") {
        const { error } = await supabase.from("ailments").delete().eq("id", ailment.id);
        if (error) throw error;
        logEvent(EVENT.AILMENT_DELETED, { ailment_id: ailment.id, name: ailment.name, type: ailment.type });
        setAilments((prev) => prev.filter((a) => a.id !== ailment.id));
        if (selectedAilment?.id === ailment.id) setSelectedAilment(null);
        toast.success(`"${ailment.name}" deleted`);
      } else {
        const archived = type === "archive";
        setAilments((prev) => prev.map((a) => a.id === ailment.id ? { ...a, is_archived: archived } : a));
        setConfirmState((s) => ({ ...s, isOpen: false }));
        const { error } = await supabase.from("ailments").update({ is_archived: archived }).eq("id", ailment.id);
        if (error) {
          setAilments((prev) => prev.map((a) => a.id === ailment.id ? { ...a, is_archived: !archived } : a));
          throw error;
        }
        logEvent(
          archived ? EVENT.AILMENT_ARCHIVED : EVENT.AILMENT_RESTORED,
          { ailment_id: ailment.id, name: ailment.name, type: ailment.type },
        );
        toast.success(archived ? "Moved to archived" : "Restored to watchlist");
        return;
      }
      setConfirmState((s) => ({ ...s, isOpen: false }));
    } catch (err: any) {
      Logger.error("Confirm action failed", err, { ailmentId: ailment.id, type });
      toast.error(err?.message ?? "Action failed — please try again.");
    }
  };

  // Counts and display scoped to current view tab
  const tabAilments = ailments.filter((a) => viewTab === "active" ? !a.is_archived : a.is_archived);

  const displayed = tabAilments.filter((a) => {
    if (filter !== "all" && a.type !== filter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return a.name.toLowerCase().includes(q) || (a.scientific_name || "").toLowerCase().includes(q);
    }
    return true;
  });

  const counts = {
    all: tabAilments.length,
    invasive_plant: tabAilments.filter((a) => a.type === "invasive_plant").length,
    pest: tabAilments.filter((a) => a.type === "pest").length,
    disease: tabAilments.filter((a) => a.type === "disease").length,
  };

  const confirmMeta = {
    delete:    { title: "Delete Ailment",  desc: `Remove "${confirmState.ailment?.name}" permanently? This cannot be undone.`, confirm: "Delete",   destructive: true  },
    archive:   { title: "Archive Ailment", desc: `Archive "${confirmState.ailment?.name}"? It'll be hidden from your active watchlist.`, confirm: "Archive", destructive: false },
    unarchive: { title: "Restore Ailment", desc: `Move "${confirmState.ailment?.name}" back to your active watchlist?`, confirm: "Restore",  destructive: false },
  };
  const cm = confirmMeta[confirmState.type];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Page header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-black text-3xl text-rhozly-on-surface tracking-tight flex items-center gap-3">
            Ailment Watchlist
            {counts.all > 0 && (
              <span className="text-sm font-black bg-rhozly-primary/10 text-rhozly-primary px-2.5 py-1 rounded-xl">
                {counts.all}
              </span>
            )}
          </h1>
          <p className="text-sm font-bold text-rhozly-on-surface/40 mt-1">Track pests, diseases, and invasive plants</p>
        </div>
        {scope === "home" && can("ailments.add") && (
          // On a phone the CTAs sit on their own row below the title (matching
          // the Shed) so "Find an ailment" no longer runs off the right edge.
          <div className="flex items-center gap-2 shrink-0">
            {/* RHO-4 Phase 2 — bulk add (paste a list or upload a CSV). Subtle
                styling so it doesn't compete with the primary "Add" CTA. */}
            <button
              data-testid="watchlist-bulk-add-btn"
              onClick={() => setShowBulkAdd(true)}
              aria-label="Bulk add ailments"
              title="Paste a list or upload a CSV to add ailments all at once"
              className="flex items-center gap-2 px-4 py-3 bg-white border border-rhozly-outline/20 text-rhozly-primary rounded-2xl font-black text-sm hover:border-rhozly-primary/30 hover:bg-rhozly-primary/5 transition-colors"
            >
              <FileText size={16} /> <span className="hidden sm:inline">Bulk add</span>
            </button>
            <button
              data-testid="watchlist-add-btn"
              onClick={() => setShowAdd(true)}
              aria-label="Find an ailment"
              className="flex items-center gap-2 px-5 py-3 bg-rhozly-primary text-white rounded-2xl font-black text-sm shadow-lg hover:scale-[1.02] transition-transform"
            >
              <Plus size={18} /> Find an ailment
            </button>
          </div>
        )}
      </div>

      {/* Home | Favourites scope pills — "Home" is today's shared, home-scoped
          watchlist; "Favourites" is the user's personal cross-home list.
          Deep link: /shed?tab=watchlist&scope=favourites */}
      <div
        data-testid="watchlist-scope-toggle"
        className="bg-rhozly-surface-low p-1.5 rounded-2xl flex gap-1 border border-rhozly-outline/10 self-start w-fit"
      >
        {(["home", "favourites"] as const).map((s) => (
          <button
            key={s}
            type="button"
            data-testid={`watchlist-scope-${s}`}
            onClick={() => switchScope(s)}
            className={`flex items-center gap-1.5 px-5 py-2 min-h-[40px] rounded-xl text-sm font-black transition-all ${
              scope === s ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-on-surface/40 hover:text-rhozly-on-surface"
            }`}
          >
            {s === "favourites" && (
              <Heart size={13} className={scope === "favourites" ? "fill-current" : ""} />
            )}
            {s === "home" ? "Home" : "Favourites"}
            {s === "favourites" && favourites.length > 0 && (
              <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-rhozly-primary/10 text-rhozly-primary">
                {favourites.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Favourites scope body — the user's cross-home favourite ailments. */}
      {scope === "favourites" ? (
        <FavouriteAilmentsGrid
          homeId={homeId}
          homeName={homeName}
          homeAilments={ailments}
          favourites={favourites}
          loading={favouritesLoading}
          searchQuery={search}
          aiEnabled={aiEnabled}
          perenualEnabled={perenualEnabled}
          onFavouritesChanged={loadFavourites}
          onHomeAilmentsChanged={() => { fetchAilments(); loadFavourites(); }}
        />
      ) : (
      <>
      {/* Active / Archived tabs + type filters */}
      <div className="flex flex-col gap-2">
        <div role="tablist" aria-label="Ailment status" className="flex gap-1 overflow-x-auto bg-rhozly-surface-low p-1.5 rounded-2xl border border-rhozly-outline/10">
          {(["active", "archived"] as const).map((tab) => (
            <button
              key={tab}
              role="tab"
              aria-selected={viewTab === tab}
              onClick={() => setViewTab(tab)}
              className={`shrink-0 whitespace-nowrap px-6 py-2 min-h-[44px] rounded-xl text-sm font-black transition-all ${viewTab === tab ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-on-surface/40 hover:text-rhozly-on-surface"}`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5 overflow-x-auto bg-rhozly-surface-low p-1.5 rounded-2xl border border-rhozly-outline/5">
          {([
            { id: "all", label: "All" },
            { id: "invasive_plant", label: "Invasive", icon: <IconPlant size={12} /> },
            { id: "pest", label: "Pests", icon: <IconPest size={12} /> },
            { id: "disease", label: "Diseases", icon: <Biohazard size={12} /> },
          ] as { id: AilmentFilter; label: string; icon?: React.ReactNode }[]).map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`flex items-center gap-1.5 px-4 py-2 min-h-[44px] rounded-xl text-xs font-black whitespace-nowrap shrink-0 transition-all ${filter === f.id ? "bg-white text-rhozly-primary shadow-sm border border-rhozly-outline/10" : "text-rhozly-on-surface/40 hover:text-rhozly-on-surface"}`}
            >
              {f.icon}{f.label}
              <span className="ml-1 opacity-60">{counts[f.id]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-rhozly-on-surface/30" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ${viewTab} ailments…`}
          className="w-full pl-11 pr-4 py-3.5 min-h-[44px] rounded-2xl border border-rhozly-outline/20 bg-white font-bold text-sm focus:outline-none focus:ring-2 focus:ring-rhozly-primary/30"
        />
      </div>

      {/* Browse the global ailment library (Phase 2; Binoculars = the watch
          metaphor — Stage 1 of the ailment-library overhaul) */}
      <button
        type="button"
        data-testid="browse-ailment-library"
        onClick={() => navigate("/ailment-library")}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-dashed border-rhozly-outline/30 text-sm font-black text-rhozly-on-surface/60 can-hover:hover:border-rhozly-primary/40 can-hover:hover:text-rhozly-primary active:scale-[0.99] transition-colors"
      >
        <Binoculars size={16} /> Browse the ailment library
      </button>

      {/* Grid */}
      {fetchError ? (
        <div className="py-20 text-center bg-rhozly-surface-lowest rounded-3xl border border-rhozly-outline/20">
          <AlertTriangle size={36} className="mx-auto mb-3 text-red-400" />
          <p className="font-black text-rhozly-on-surface/40 mb-4">Could not load watchlist.</p>
          <button
            onClick={() => setRetryTick((t) => t + 1)}
            className="px-5 py-2.5 bg-rhozly-primary text-white rounded-2xl text-sm font-black hover:scale-[1.02] transition-transform"
          >
            Retry
          </button>
        </div>
      ) : loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-rhozly-surface-lowest rounded-3xl overflow-hidden border border-rhozly-outline/10 animate-pulse">
              <div className="h-44 bg-rhozly-surface-low" />
              <div className="p-6 space-y-3">
                <div className="h-5 w-2/3 bg-rhozly-surface-low rounded-full" />
                <div className="h-3 w-full bg-rhozly-surface-low rounded-full" />
                <div className="h-3 w-4/5 bg-rhozly-surface-low rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ) : displayed.length > 0 ? (
        <div data-testid="watchlist-card-grid" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayed.map((a) => (
            <AilmentCard
              key={a.id}
              ailment={a}
              affectedCount={affectedCounts[a.id] ?? 0}
              onClick={() => setSelectedAilment(a)}
              onArchiveToggle={() => setConfirmState({ isOpen: true, type: a.is_archived ? "unarchive" : "archive", ailment: a })}
              onDelete={() => setConfirmState({ isOpen: true, type: "delete", ailment: a })}
              onAskAi={() => {
                setPageContext({
                  action: "Asking about a Watchlist ailment",
                  ailment: {
                    name: a.name,
                    scientific_name: a.scientific_name,
                    type: a.type,
                    description: a.description,
                    symptoms: a.symptoms,
                    affected_plants: a.affected_plants,
                  },
                });
                setIsOpen(true);
              }}
              onToggleFavourite={() => handleToggleFavourite(a)}
              isFavourited={favouriteKeys.has(ailmentIdentityKey(a.name))}
              favouriteLocked={isAilmentSourceLockedForTier(a.source, { aiEnabled, perenualEnabled })}
              favouriteBusy={togglingFavouriteKey === ailmentIdentityKey(a.name)}
              aiEnabled={aiEnabled}
              canDelete={can("ailments.delete")}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          size="lg"
          icon={<AlertTriangle size={32} />}
          title={
            search
              ? "No matching ailments"
              : viewTab === "archived"
                ? "No archived ailments"
                : "Your watchlist is empty"
          }
          body={
            !search && viewTab === "active"
              ? "Not sure what you're dealing with? Use Plant Doctor to photograph and identify problems."
              : search
                ? "Try adjusting your search term."
                : "Archived entries will show up here."
          }
          primaryCta={
            !search && viewTab === "active" && can("ailments.add")
              ? { label: "Add your first entry", onClick: () => setShowAdd(true), icon: <Plus size={16} /> }
              : undefined
          }
          secondaryCta={
            !search && viewTab === "active"
              ? { label: "Open Plant Doctor", onClick: () => navigate("/doctor") }
              : undefined
          }
        />
      )}
      </>
      )}

      {/* Modals — rendered via portal so they escape any parent overflow/z-index */}
      {showAdd && createPortal(
        <AddAilmentModal
          homeId={homeId}
          aiEnabled={aiEnabled}
          onSaved={(a) => { setAilments((prev) => [a, ...prev]); requestFeedback("ailment_add"); }}
          onClose={() => setShowAdd(false)}
          existingKeys={new Set(
            ailments.filter((a) => !a.is_archived).map((a) => ailmentIdentityKey(a.name)).filter(Boolean),
          )}
        />,
        document.body,
      )}
      {showBulkAdd && (
        <BulkAddAilmentsModal
          homeId={homeId}
          aiEnabled={aiEnabled}
          onClose={() => setShowBulkAdd(false)}
          onCreated={(created) => {
            if (created.length > 0) {
              setAilments((prev) => [...created, ...prev]);
              loadFavourites();
              requestFeedback("ailment_add");
            }
          }}
        />
      )}
      {selectedAilment && createPortal(
        <AilmentDetailModal
          ailment={selectedAilment}
          onClose={() => setSelectedAilment(null)}
          onDelete={(id) => setAilments((prev) => prev.filter((a) => a.id !== id))}
        />,
        document.body,
      )}

      <ConfirmModal
        isOpen={confirmState.isOpen}
        onClose={() => setConfirmState((s) => ({ ...s, isOpen: false }))}
        onConfirm={handleConfirmAction}
        title={cm.title}
        description={cm.desc}
        confirmText={cm.confirm}
        isDestructive={cm.destructive}
      />
    </div>
  );
}
