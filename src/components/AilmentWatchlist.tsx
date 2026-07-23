import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useSearchPreference } from "../lib/searchPreference";
import { staggerStyle, STAGGER_ENTRANCE } from "../lib/stagger";
import { createPortal } from "react-dom";
import {
  Plus, Search, Loader2, Biohazard, X,
  Edit3, Trash2, ChevronRight, ChevronUp, ChevronDown, ChevronLeft, AlertTriangle,
  CheckCircle2, Info, Square, CheckSquare2, Archive, ArchiveRestore, Lock, Sparkles, Library, FileText,
  ArrowLeft, Binoculars, MoreVertical, ImageOff, Camera,
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
import JudgeImagePrompt from "./JudgeImagePrompt";
import { replaceAilmentImage } from "../lib/ailmentImageOverride";
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
// Aliased — this file has its own local AilmentDetailModal (the WATCHLIST
// row detail); this one is the field-guide detail for search results.
import LibraryAilmentDetailModal from "./ailments/AilmentDetailModal";
import LinkAilmentToPlantModal from "./ailments/LinkAilmentToPlantModal";
import AilmentGardenSection from "./ailments/AilmentGardenSection";
import AilmentDetailBody from "./ailments/AilmentDetailBody";
import { usePersona } from "../hooks/usePersona";
import HubHeader from "./garden/HubHeader";
import { AILMENT_SEVERITY_CLASSES } from "../lib/ailmentPresentation";
import { useGardenPresence } from "../hooks/useGardenPresence";
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
  aiEnabled = false,
}: {
  ailment: Ailment;
  onClose: () => void;
  onDelete: (id: string) => void;
  aiEnabled?: boolean;
}) {
  // Stage F — the tabbed local modal died: this is now a thin shell around
  // the SHARED AilmentDetailBody (one detail surface for library AND
  // home-authored rows). Home rows are richer, so the shell feeds the
  // structured extras (severity-chipped symptoms, scheduled steps, garden
  // section, photo gallery) the plan mandated must survive unification.
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const { setPageContext, setIsOpen: setChatOpen } = usePlantDoctor();
  const persona = usePersona();

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

  // Home type → library kind (invasive_plant is the only rename).
  const kind = ailment.type === "invasive_plant" ? "invasive" : ailment.type;
  const asLibraryShape: LibraryAilment = {
    id: -1, // never used for lookups in this shell
    name: ailment.name,
    kind: kind as LibraryAilment["kind"],
    scientific_name: ailment.scientific_name ?? null,
    aliases: [],
    description: ailment.description ?? null,
    symptoms: [], // rich symptoms supplied separately
    causes: null,
    treatment: null,
    prevention: null,
    severity: null,
    affected_plant_types: [],
    affected_families: [],
    season: [],
    organic_friendly: null,
    image_url: ailment.thumbnail_url ?? null,
    thumbnail_url: ailment.thumbnail_url ?? null,
  };

  const askAi = () => {
    setPageContext({
      action: "Asking about an ailment on the watchlist",
      ailment: {
        name: ailment.name,
        scientific_name: ailment.scientific_name,
        type: ailment.type,
        description: ailment.description,
        symptoms: ailment.symptoms.map((sy) => sy.title),
      },
    });
    setChatOpen(true);
  };

  // Escape closes THIS layer only — never while a child layer (link picker,
  // delete confirm) is stacked on top (review catch: ConfirmModal's own
  // Escape doesn't stopPropagation, so an unguarded listener would cancel
  // the confirm AND dump the user out of the detail in one keypress).
  const childOpenRef = useRef(false);
  childOpenRef.current = linkOpen || showDeleteConfirm;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || childOpenRef.current) return;
      e.preventDefault();
      onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="fixed inset-0 z-[100] bg-rhozly-bg overflow-y-auto custom-scrollbar overscroll-contain animate-in fade-in duration-200"
      data-testid="detail-modal"
    >
      <div
        className="max-w-3xl mx-auto w-full px-4 pb-10"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 8px)" }}
      >
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={onClose}
            aria-label="Close"
            className="inline-flex items-center gap-1.5 text-xs font-black text-rhozly-on-surface-variant can-hover:hover:text-rhozly-on-surface min-h-[44px] active:scale-[0.97] transition"
          >
            <ArrowLeft size={15} /> Back to watchlist
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            disabled={deleting}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center bg-rhozly-surface-low rounded-2xl hover:bg-red-50 hover:text-red-500 transition-colors"
            aria-label="Delete ailment"
          >
            {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
          </button>
        </div>
        <AilmentDetailBody
          ailment={asLibraryShape}
          watching
          watchingBusy={false}
          canWatch={false}
          onWatch={() => {}}
          aiEnabled={aiEnabled}
          onAskAi={askAi}
          isNewGardener={persona !== "experienced"}
          plantNames={[]}
          onLinkToPlant={() => setLinkOpen(true)}
          symptomsRich={ailment.symptoms}
          preventionSteps={ailment.prevention_steps}
          remedySteps={ailment.remedy_steps}
          affectedPlants={ailment.affected_plants}
          gardenSlot={<AilmentGardenSection ailmentId={ailment.id} homeId={ailment.home_id} />}
          heroExtra={
            <MultiImageGallery
              query={`${ailment.name}${ailment.scientific_name ? ` ${ailment.scientific_name}` : ""} ${ailment.type}`}
              label={ailment.name}
              existingImageUrl={ailment.thumbnail_url}
              triggerClassName="absolute -bottom-1 -right-1"
            />
          }
        />
      </div>
      {linkOpen && (
        <LinkAilmentToPlantModal
          homeId={ailment.home_id}
          ailment={ailment}
          onClose={() => setLinkOpen(false)}
        />
      )}
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
  ownedAilments,
  onOpenOwnedAilment,
  ailmentPresence,
  favouriteLibraryIds,
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
  /** Stage 3 — one search: the landing's own search input died, so the
   *  home's watchlist rows surface here first ("On your watchlist"). */
  ownedAilments?: Ailment[];
  /** Tap an owned row → the host closes the overlay + opens its detail. */
  onOpenOwnedAilment?: (a: Ailment) => void;
  /** Hub v3 Stage A — derived presence per home-ailment id. */
  ailmentPresence?: Map<string, "active" | "inactive">;
  /** Personal ♥ layer: ailment_library ids the user has favourited. */
  favouriteLibraryIds?: Set<number>;
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

  // In-flight guard (review catch): the async insert has no unique constraint
  // behind it — a fast double-tap on Watch/Add would insert twice. Busy state
  // disables the CTAs synchronously; the ref backs the re-entry check
  // (state reads inside the handler are stale during the await).
  const [libraryAddBusy, setLibraryAddBusy] = useState<number | null>(null);
  const addingLibraryIdsRef = useRef<Set<number>>(new Set());
  const addFromLibrary = async (lib: LibraryAilment): Promise<Ailment | null> => {
    if (addedLibraryIds.has(lib.id) || addingLibraryIdsRef.current.has(lib.id)) return null;
    addingLibraryIdsRef.current.add(lib.id);
    setLibraryAddBusy(lib.id);
    try {
      const data = await addLibraryAilmentToWatchlist(lib, homeId);
      setAddedLibraryIds((prev) => new Set(prev).add(lib.id));
      onSaved(data as Ailment);
      logEvent(EVENT.AILMENT_ADDED, { ailment_id: (data as Ailment).id, name: lib.name, type: kindToWatchlistType(lib.kind) });
      toast.success(`"${lib.name}" added to watchlist.`);
      return data as Ailment;
    } catch (err: any) {
      Logger.error("Failed to add library ailment", err, { homeId }, err.message || "Add failed.");
      return null;
    } finally {
      addingLibraryIdsRef.current.delete(lib.id);
      setLibraryAddBusy((prev) => (prev === lib.id ? null : prev));
    }
  };

  // Stage E — "Link to a plant" from the field-guide detail. Needs the HOME
  // watchlist row: reuse it when the ailment is already watched, otherwise
  // watch first (the link IS evidence it belongs on the watchlist).
  const [linkTarget, setLinkTarget] = useState<Ailment | null>(null);
  const linkFromDetail = async (lib: LibraryAilment) => {
    const existing = ownedAilments?.find(
      (a) => !a.is_archived && ailmentIdentityKey(a.name) === ailmentIdentityKey(lib.name),
    );
    const target = existing ?? (await addFromLibrary(lib));
    if (target) setLinkTarget(target);
  };

  // Reach a deeper tier with the current search term pre-filled + run.
  const goToDatabases = () => { setPerenualQuery(query); setMode("perenual"); if (query.trim()) searchPerenual(query); };
  const goToAi = () => { setAiQuery(query); setMode("ai"); if (query.trim()) searchWithAI(query); };

  const showSteps = mode === "manual";
  const totalSelected = checkedPerenualIds.size + checkedAiIds.size;

  // Row tap → the shared field-guide detail (plants-parity, Stage 2). The
  // modal stacks at z-[100] over this z-[60] overlay.
  const [detailAilment, setDetailAilment] = useState<LibraryAilment | null>(null);

  // Escape ladder (Stage 2 overlay): field-guide detail owns its own Escape →
  // review steps back to tabs → a deeper search tier returns to library
  // search → a typed query clears → the overlay closes. Never on the Manual
  // form (it would discard typed work — the form has its own Cancel).
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const stepRef = useRef(step);
  stepRef.current = step;
  const queryEscRef = useRef(query);
  queryEscRef.current = query;
  const detailOpenRef = useRef(false);
  detailOpenRef.current = detailAilment !== null;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (detailOpenRef.current) return;
      if (modeRef.current === "manual") return;
      if (stepRef.current === "review") setStep("tabs");
      else if (modeRef.current !== "search") setMode("search");
      else if (queryEscRef.current.trim()) setQuery("");
      else onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    // Full-screen search overlay (hub search-first overhaul Stage 2,
    // 2026-07-21) — the same shell as the Shed's PlantSearchTakeover:
    // `fixed inset-0 z-[60]` covers the app header (z-50) / weather bar / hub
    // tabs, the input is PINNED in the top bar (keyboard-safe — it sat at
    // y=523 under 5 chrome blocks before), and the watchlist grid stays
    // MOUNTED underneath. PORTALED to body — PullToRefresh's scroller keeps a
    // residual transform after a pull, which would trap `fixed` inside the
    // content area (caught live). Every internal testid (ailment-tab-*,
    // ailment-search-*, ailment-library-*) is unchanged. NOT role="dialog"
    // (WL-TKO-001 asserts no aria-modal overlay).
    <div className="fixed inset-0 z-[60] bg-rhozly-bg flex flex-col animate-in fade-in duration-200" data-testid="ailment-add-takeover">
      {/* ── Top bar — the only pinned chrome ─────────────────────────────── */}
      <header
        className="shrink-0 bg-rhozly-bg border-b border-rhozly-outline/10"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="max-w-3xl mx-auto w-full px-3 pt-2 pb-2">
          <div className="flex items-center gap-2">
            <button
              // Step-aware (review catch): "back" goes back ONE level — review
              // returns to the tabs (preserving the cart; closing here would
              // silently discard checked Perenual/AI picks), a deeper search
              // tier returns to library search, and only the base search
              // state closes the overlay (WL-TKO-001's path).
              onClick={() => {
                if (step === "review") setStep("tabs");
                else if (mode !== "search") setMode("search");
                else onClose();
              }}
              data-testid="ailment-add-back"
              aria-label={
                step === "review"
                  ? "Back to search"
                  : mode !== "search"
                    ? "Back to search"
                    : "Back to watchlist"
              }
              className="shrink-0 w-11 h-11 flex items-center justify-center rounded-control text-rhozly-on-surface/70 can-hover:hover:bg-rhozly-surface-low can-hover:hover:text-rhozly-on-surface active:scale-[0.95] transition"
            >
              <ArrowLeft size={20} />
            </button>

            {step === "review" ? (
              <div className="flex-1 min-w-0">
                <p className="text-base font-black text-rhozly-on-surface leading-tight truncate">Review your picks</p>
                <p className="text-3xs font-black uppercase tracking-widest text-rhozly-on-surface/40">
                  {totalSelected} ailment{totalSelected !== 1 ? "s" : ""} ready to add
                </p>
              </div>
            ) : mode === "manual" ? (
              <p className="flex-1 min-w-0 text-base font-black text-rhozly-on-surface px-1 truncate">
                Add an ailment manually
              </p>
            ) : mode === "perenual" ? (
              <p className="flex-1 min-w-0 text-base font-black text-rhozly-on-surface px-1 truncate">
                Plant database search
              </p>
            ) : mode === "ai" ? (
              <p className="flex-1 min-w-0 text-base font-black text-rhozly-on-surface px-1 truncate">
                Rhozly AI search
              </p>
            ) : (
              <div className="relative flex-1 min-w-0">
                <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-rhozly-on-surface/40 pointer-events-none" />
                <input
                  type="search"
                  data-testid="ailment-search-input"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                  enterKeyHint="search"
                  aria-label="Search pests and diseases"
                  placeholder="Search pests & diseases…"
                  className="w-full h-[52px] pl-10 pr-10 rounded-control bg-white border border-rhozly-outline/20 text-base font-bold text-rhozly-on-surface placeholder:text-rhozly-on-surface/40 outline-none focus:border-rhozly-primary/50 [&::-webkit-search-cancel-button]:hidden"
                />
                {libraryLoading ? (
                  <Loader2 size={15} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-rhozly-on-surface/40" />
                ) : query ? (
                  <button
                    type="button"
                    aria-label="Clear search"
                    data-testid="ailment-search-clear"
                    onClick={() => setQuery("")}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-full text-rhozly-on-surface/40 can-hover:hover:text-rhozly-on-surface can-hover:hover:bg-rhozly-surface-low transition"
                  >
                    <X size={16} />
                  </button>
                ) : null}
              </div>
            )}
          </div>

          {/* Utility row — mode tabs + the deep-tier back control */}
          {step === "tabs" && (
            <div className="flex items-center justify-between gap-2 mt-2">
              <div role="tablist" className="flex bg-rhozly-surface-low p-1 rounded-control gap-1">
                <button
                  role="tab"
                  data-testid="ailment-tab-search"
                  aria-selected={mode !== "manual"}
                  onClick={() => setMode("search")}
                  className={`flex items-center justify-center gap-1.5 px-4 py-2 min-h-[40px] pointer-coarse:min-h-11 rounded-[calc(var(--radius-control)-4px)] text-xs font-black transition-all ${mode !== "manual" ? "bg-rhozly-surface-lowest text-rhozly-primary shadow-card" : "text-rhozly-on-surface/40 can-hover:hover:text-rhozly-on-surface"}`}
                >
                  <Search size={14} /> Search
                </button>
                <button
                  role="tab"
                  data-testid="ailment-tab-manual"
                  aria-selected={mode === "manual"}
                  onClick={() => setMode("manual")}
                  className={`flex items-center justify-center gap-1.5 px-4 py-2 min-h-[40px] pointer-coarse:min-h-11 rounded-[calc(var(--radius-control)-4px)] text-xs font-black transition-all ${mode === "manual" ? "bg-rhozly-surface-lowest text-rhozly-primary shadow-card" : "text-rhozly-on-surface/40 can-hover:hover:text-rhozly-on-surface"}`}
                >
                  <Edit3 size={14} /> Manual
                </button>
              </div>
              {mode !== "search" && mode !== "manual" && (
                <button
                  onClick={() => setMode("search")}
                  data-testid="ailment-back-to-search"
                  className="flex items-center gap-1.5 text-xs font-black px-3 py-2 min-h-[40px] pointer-coarse:min-h-11 rounded-full text-rhozly-on-surface/55 can-hover:hover:text-rhozly-primary can-hover:hover:bg-rhozly-primary/5 transition-colors"
                >
                  <ChevronLeft size={14} /> Back to Search
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      {/* ── Body — everything scrolls under the pinned bar ────────────────── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar overscroll-contain">
        <div className="max-w-3xl mx-auto w-full px-4 pt-3 pb-10 space-y-5">

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
                  {/* Idle state — the input lives in the pinned top bar now.
                      Never blank: a gentle prompt + the field-guide entry row. */}
                  {!query.trim() && (
                    <>
                      <p data-testid="ailment-search-prompt" className="text-[12px] font-bold text-rhozly-on-surface/45 px-1 leading-snug">
                        Start typing a pest or disease — e.g. <span className="text-rhozly-primary">"aphids"</span> or <span className="text-rhozly-primary">"blight"</span>.
                      </p>
                    </>
                  )}

                  {/* "In your garden" — your own entries first (Stage 3;
                      absorbs the landing's search input). Stage E: curated-out
                      rows included, badge-sorted so live threats win the
                      4 slots. */}
                  {query.trim().length >= 2 && ownedAilments && (() => {
                    const q = query.trim().toLowerCase();
                    const rank = (a: Ailment) => {
                      const pres = ailmentPresence?.get(a.id);
                      if (pres === "active") return 0;
                      if (pres === "inactive") return 1;
                      return a.is_archived ? 3 : 2;
                    };
                    const owned = ownedAilments
                      .filter((a) => a.name.toLowerCase().includes(q))
                      .sort((a, b) => rank(a) - rank(b))
                      .slice(0, 4);
                    if (owned.length === 0) return null;
                    return (
                      <div data-testid="ailment-owned-section">
                        <p className="text-2xs font-black uppercase tracking-widest text-rhozly-on-surface/40 px-1 mb-1.5">
                          In your garden
                        </p>
                        <ul className="space-y-1.5">
                          {owned.map((a) => {
                            const meta = TYPE_META[a.type as AilmentType];
                            return (
                              <li key={a.id}>
                                <button
                                  type="button"
                                  data-testid={`ailment-owned-${a.id}`}
                                  onClick={() => onOpenOwnedAilment?.(a)}
                                  className="w-full flex items-center gap-3 pl-3 pr-2 py-2.5 min-h-[72px] rounded-2xl bg-rhozly-primary/5 border border-rhozly-primary/15 text-left can-hover:hover:border-rhozly-primary/40 active:scale-[0.99] transition"
                                >
                                  <div className="w-14 h-14 shrink-0 rounded-2xl bg-rhozly-surface-low overflow-hidden flex items-center justify-center text-rhozly-on-surface/25">
                                    {(a as { image_url?: string | null }).image_url ? (
                                      <img src={(a as { image_url?: string | null }).image_url!} alt={a.name} className="w-full h-full object-cover" />
                                    ) : (
                                      meta.icon
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="font-black text-base text-rhozly-on-surface leading-tight truncate">{a.name}</p>
                                    <p className="text-xs font-bold text-rhozly-on-surface/45 truncate flex items-center gap-1.5">
                                      {(() => {
                                        // Hub v3 — ONE pill, Active > Inactive >
                                        // Watching; Stage E adds "Previously"
                                        // for curated-out rows with no presence.
                                        const pres = ailmentPresence?.get(a.id);
                                        const pill = pres === "active"
                                          ? { key: "active", label: "Active", cls: "bg-status-danger-fill text-status-danger-ink border border-status-danger-line" }
                                          : pres === "inactive"
                                            ? { key: "inactive", label: "Inactive", cls: "bg-rhozly-surface-low text-rhozly-on-surface/55 border border-rhozly-outline/15" }
                                            : a.is_archived
                                              ? { key: "previously", label: "Previously", cls: "bg-rhozly-surface-low text-rhozly-on-surface/40 border border-dashed border-rhozly-outline/25" }
                                              : { key: "watching", label: "Watching", cls: "bg-status-watch-fill text-status-watch-ink" };
                                        return (
                                          <span
                                            data-testid={`ailment-owned-presence-${a.id}`}
                                            data-presence={pill.key}
                                            className={`shrink-0 px-1.5 py-0.5 rounded-chip text-2xs font-black ${pill.cls}`}
                                          >
                                            {pill.label}
                                          </span>
                                        );
                                      })()}
                                      <span className="truncate">{meta.label}</span>
                                    </p>
                                  </div>
                                  <ChevronRight size={16} className="shrink-0 text-rhozly-on-surface/30" />
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    );
                  })()}

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
                          const sevLabel = lib.severity ? AILMENT_SEVERITY_CLASSES[lib.severity]?.label : null;
                          return (
                            // Plants-parity row (Stage 2): 72px, 56px thumb, row
                            // BODY opens the field-guide detail; the trailing
                            // button adds/watches. Same split as plant results.
                            <div key={lib.id} data-testid={`ailment-library-result-${lib.id}`} className="border border-rhozly-outline/10 rounded-2xl bg-white flex items-center gap-2 pl-3 pr-2 py-2.5 min-h-[72px]">
                              <button
                                type="button"
                                data-testid={`ailment-library-open-${lib.id}`}
                                onClick={() => setDetailAilment(lib)}
                                className="flex-1 min-w-0 flex items-center gap-3 text-left active:scale-[0.99] transition-transform"
                              >
                                <div className="w-14 h-14 rounded-2xl bg-rhozly-surface-low overflow-hidden shrink-0 flex items-center justify-center text-rhozly-on-surface/20">
                                  {lib.thumbnail_url ? <img src={lib.thumbnail_url} alt={lib.name} className="w-full h-full object-cover" /> : meta.icon}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-black text-base text-rhozly-on-surface leading-tight truncate">{lib.name}</p>
                                  <p className="text-xs font-bold text-rhozly-on-surface/45 truncate flex items-center gap-1">
                                    {favouriteLibraryIds?.has(lib.id) && (
                                      <Binoculars
                                        size={12}
                                        aria-label="On your watchlist"
                                        data-testid={`ailment-library-watch-glyph-${lib.id}`}
                                        className="shrink-0 text-status-watch-ink"
                                      />
                                    )}
                                    <span className="truncate">{meta.label}{sevLabel ? ` · ${sevLabel} severity` : ""} · Library</span>
                                  </p>
                                </div>
                              </button>
                              <button
                                onClick={() => addFromLibrary(lib)}
                                disabled={added || libraryAddBusy === lib.id}
                                data-testid={`ailment-library-add-${lib.id}`}
                                aria-label={added ? `Watching ${lib.name}` : `Watch ${lib.name} in this garden`}
                                className="shrink-0 px-3 py-2 min-h-11 rounded-xl bg-rhozly-primary text-white text-xs font-black flex items-center gap-1 active:scale-[0.95] transition disabled:opacity-60 disabled:bg-rhozly-on-surface/20"
                              >
                                {libraryAddBusy === lib.id ? <Loader2 size={13} className="animate-spin" /> : added ? <><CheckCircle2 size={13} /> Watching</> : <><Plus size={13} /> Add</>}
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}

                  {/* Escalation ladder (Stage 2) — quiet, left-aligned,
                      result-styled rows matching the plant search: never a
                      stack of centered CTAs. Testids unchanged. */}
                  {query.trim() && (
                    <div className="space-y-2 pt-1">
                      <button
                        onClick={goToDatabases}
                        data-testid="ailment-search-databases"
                        className="w-full flex items-center gap-3 px-3 py-2.5 min-h-[56px] rounded-2xl border border-rhozly-outline/15 bg-white text-left can-hover:hover:border-rhozly-primary/30 transition-colors"
                      >
                        <span className="w-9 h-9 shrink-0 rounded-xl bg-rhozly-surface-low flex items-center justify-center text-rhozly-on-surface/50">
                          <IconPlantDB size={16} />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-black text-rhozly-on-surface">Search wider</span>
                          <span className="block text-[11px] font-bold text-rhozly-on-surface/45">Perenual pest &amp; disease database</span>
                        </span>
                      </button>
                      <button
                        onClick={goToAi}
                        data-testid="ailment-search-ai"
                        className="w-full flex items-center gap-3 px-3 py-2.5 min-h-[56px] rounded-2xl border border-amber-200 bg-amber-50/40 text-left can-hover:hover:bg-amber-50 transition-colors"
                      >
                        <span className="w-9 h-9 shrink-0 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600">
                          <IconAI size={16} />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-black text-amber-700">Search with Rhozly AI</span>
                          <span className="block text-[11px] font-bold text-amber-600/70">For unusual or hard-to-spell problems</span>
                        </span>
                      </button>
                      <button
                        onClick={() => setMode("manual")}
                        data-testid="ailment-add-manually"
                        className="w-full flex items-center gap-2 px-3 py-2.5 min-h-[48px] rounded-2xl text-left text-xs font-black text-rhozly-on-surface/55 can-hover:hover:text-rhozly-on-surface can-hover:hover:bg-rhozly-surface transition-colors"
                      >
                        <Edit3 size={13} /> Enter "{query.trim()}" manually
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
                                    // Stage E: the field guide lives HERE now —
                                    // shareable ?detail= on the watchlist tab
                                    // instead of the /ailment-library page.
                                    onClick={(e) => { e.stopPropagation(); navigate(`/shed?tab=watchlist&detail=${r.library_id}`); }}
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

        {/* Footer — shared selection bar (Perenual + AI tabs) */}
        {step === "tabs" && totalSelected > 0 && mode !== "manual" && (
          <div className="sticky bottom-2 py-4 animate-in slide-in-from-bottom-2">
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
          <div className="py-6 pt-4 border-t border-rhozly-outline/10 flex gap-3">
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
          <div className="py-6 pt-4 border-t border-rhozly-outline/10 flex gap-3">
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

      {/* Field-guide detail — plants-parity (row tap), z-[100] over this
          overlay. Watch state + add flow are the row's own (shared). */}
      {detailAilment && (
        <LibraryAilmentDetailModal
          ailment={detailAilment}
          homeId={homeId}
          aiEnabled={aiEnabled}
          watching={
            addedLibraryIds.has(detailAilment.id) ||
            (existingKeys?.has(ailmentIdentityKey(detailAilment.name)) ?? false)
          }
          watchingBusy={libraryAddBusy === detailAilment.id}
          canWatch
          onWatch={() => addFromLibrary(detailAilment)}
          onClose={() => setDetailAilment(null)}
          onLinkToPlant={() => linkFromDetail(detailAilment)}
        />
      )}
      {linkTarget && (
        <LinkAilmentToPlantModal
          homeId={homeId}
          ailment={linkTarget}
          onClose={() => setLinkTarget(null)}
        />
      )}
    </div>,
    document.body,
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
  index = 0,
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
  homeId,
  onImageReplaced,
}: {
  ailment: Ailment;
  affectedCount: number;
  index?: number;
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
  homeId: string;
  onImageReplaced: () => void;
}) {
  const meta = TYPE_META[ailment.type];
  const srcMeta = SOURCE_META[ailment.source] ?? SOURCE_META.manual;
  // Card parity (v3 feedback #2): actions live in the body row + kebab —
  // the plants pattern (Wave 22.0009) — never floating on the photo.
  const [menuOpen, setMenuOpen] = useState(false);

  // Image judge/replace (2026-07-23) — tap the corner → "is this right?". Wrong
  // records the current image in image_rejections (never re-served for this
  // home) and swaps in the next candidate via ailment-image-search, writing
  // both the home ailments row and the per-home override. When the card is
  // icon-only (no image yet), the button reads "Add a photo".
  const [judgeOpen, setJudgeOpen] = useState(false);
  const [judgeBusy, setJudgeBusy] = useState(false);
  const handleJudgeWrong = async () => {
    setJudgeBusy(true);
    try {
      const result = await replaceAilmentImage({
        homeId,
        ailmentId: ailment.id,
        name: ailment.name,
        scientificName: ailment.scientific_name ?? null,
        currentUrl: ailment.thumbnail_url ?? null,
      });
      if (result) {
        toast.success(ailment.thumbnail_url ? "Photo replaced." : "Photo added.");
        onImageReplaced();
      } else {
        toast("No other photos found for this one.", { icon: "🔍" });
      }
    } catch {
      toast.error("Couldn't fetch another photo. Try again.");
    } finally {
      setJudgeBusy(false);
      setJudgeOpen(false);
    }
  };

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      data-testid={`ailment-card-${ailment.id}`}
      style={staggerStyle(index)}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onClick()}
      className={`bg-rhozly-surface-lowest rounded-3xl border border-rhozly-outline/20 shadow-sm group flex flex-col cursor-pointer hover:border-rhozly-primary/30 focus:outline-none focus:ring-2 focus:ring-rhozly-primary focus:ring-offset-2 transition-all ${STAGGER_ENTRANCE}`}
    >
      {/* Image header */}
      <div className="h-44 relative overflow-hidden rounded-t-3xl">
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

        {/* Image judge — top-right corner. stopPropagation so it doesn't open
            the card. "Add a photo" when the card is icon-only. */}
        <button
          type="button"
          data-testid={`judge-image-ailment-${ailment.id}`}
          onClick={(e) => { e.stopPropagation(); setJudgeOpen(true); }}
          aria-label={ailment.thumbnail_url ? "Wrong photo? Replace it" : "Add a photo"}
          title={ailment.thumbnail_url ? "Wrong photo? Replace it" : "Add a photo"}
          className="absolute top-3 right-3 z-10 w-9 h-9 min-w-[36px] min-h-[36px] rounded-full bg-white/90 backdrop-blur shadow-md text-rhozly-on-surface/70 hover:text-rhozly-primary hover:bg-white flex items-center justify-center transition-colors"
        >
          {ailment.thumbnail_url ? <ImageOff size={15} /> : <Camera size={15} />}
        </button>

        {/* Source badge — bottom left (plants-card parity). */}
        <div className="absolute bottom-3 left-3">
          <span className={`bg-white/90 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-black uppercase flex items-center gap-1.5 shadow-sm border border-white/20 ${srcMeta.colour}`}>
            {srcMeta.icon} {srcMeta.label}
          </span>
        </div>

        <JudgeImagePrompt
          open={judgeOpen}
          name={ailment.name}
          busy={judgeBusy}
          wrongLabel={ailment.thumbnail_url ? "Wrong" : "Add a photo"}
          onRight={() => setJudgeOpen(false)}
          onWrong={handleJudgeWrong}
          onClose={() => setJudgeOpen(false)}
          testIdSuffix={`ailment-${ailment.id}`}
        />

        {/* Photos button — bottom right */}
        <MultiImageGallery
          query={`${ailment.name}${ailment.scientific_name ? ` ${ailment.scientific_name}` : ""} ${ailment.type}`}
          label={ailment.name}
          existingImageUrl={ailment.thumbnail_url}
          triggerClassName="absolute bottom-3 right-3"
        />

      </div>

      {/* Body */}
      <div className="p-6">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-xl font-black text-rhozly-on-surface leading-tight mb-1">{ailment.name}</h3>
            {ailment.scientific_name && (
              <p className="text-xs font-bold italic text-rhozly-on-surface/40 truncate">{ailment.scientific_name}</p>
            )}
          </div>
          <div className="shrink-0 flex items-center gap-1">
            {/* Watchlist toggle (binoculars — never a heart on ailments).
                Strict source × tier gating: above-tier sources are view-only. */}
            <button
              data-testid={`watch-ailment-${ailment.id}`}
              onClick={(e) => { e.stopPropagation(); if (!favouriteLocked) onToggleFavourite(); }}
              disabled={favouriteLocked || favouriteBusy}
              aria-pressed={isFavourited}
              aria-label={
                favouriteLocked
                  ? `Adding ${ailment.name} to your watchlist is locked on your plan`
                  : isFavourited
                    ? `Remove ${ailment.name} from your watchlist`
                    : `Add ${ailment.name} to your watchlist`
              }
              title={
                favouriteLocked
                  ? lockedAilmentSourceMessage(ailment.source)
                  : isFavourited
                    ? "Remove from your watchlist"
                    : "Add to your watchlist — follows you across homes"
              }
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all active:scale-90 ${
                favouriteLocked
                  ? "text-rhozly-on-surface/20 cursor-not-allowed"
                  : isFavourited
                    ? "bg-status-watch-fill text-status-watch-ink"
                    : "text-rhozly-on-surface/40 can-hover:hover:text-status-watch-ink can-hover:hover:bg-status-watch-fill"
              }`}
            >
              {favouriteBusy ? (
                <Loader2 size={16} className="animate-spin" />
              ) : favouriteLocked ? (
                <Lock size={16} />
              ) : (
                <Binoculars size={16} />
              )}
            </button>
            {canDelete && (
              <div className="relative">
                <button
                  data-testid={`ailment-card-kebab-${ailment.id}`}
                  onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
                  aria-label="More actions"
                  aria-expanded={menuOpen}
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-rhozly-on-surface/40 can-hover:hover:text-rhozly-on-surface can-hover:hover:bg-rhozly-surface-low transition-colors"
                >
                  <MoreVertical size={16} />
                </button>
                {menuOpen && (
                  <>
                    <button
                      aria-hidden="true"
                      tabIndex={-1}
                      className="fixed inset-0 z-10 cursor-default"
                      onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }}
                    />
                    <div className="absolute right-0 top-11 z-20 w-44 p-1.5 rounded-2xl bg-rhozly-surface-lowest border border-rhozly-outline/15 shadow-overlay">
                      <button
                        onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onArchiveToggle(); }}
                        aria-label={ailment.is_archived ? "Restore ailment" : "Archive ailment"}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-bold text-rhozly-on-surface/75 hover:bg-rhozly-surface-low transition-colors text-left"
                      >
                        {ailment.is_archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
                        {ailment.is_archived ? "Restore" : "Archive"}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onDelete(); }}
                        aria-label="Delete ailment"
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-bold text-status-danger-ink hover:bg-status-danger-fill transition-colors text-left"
                      >
                        <Trash2 size={15} /> Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
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
  const [showAdd, setShowAdd] = useState(false);
  // Hub v3 Stage A — derived presence for search badges.
  const gardenPresence = useGardenPresence(homeId);
  // Hub v3 Stage C — chip flip (same escape hatch as the Shed).
  const legacyFilters =
    typeof localStorage !== "undefined" &&
    localStorage.getItem("rhozly_legacy_shed_filters") === "on";
  const [presenceChip, setPresenceChip] = useState<"all" | "active" | "inactive">("all");
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

  // v3 visibility law: ADDING IS WATCHING. A brand-new home row has no
  // presence, so without the 🔭 it would vanish from the list the moment
  // it's created. Best-effort per row; tier-locked sources just skip.
  // Session-added ids stay visible under All even if the auto-🔭 is skipped
  // (offline / tier-locked) or hasn't refreshed yet (review catch).
  const sessionAddedAilmentIdsRef = useRef<Set<string>>(new Set());
  const autoWatch = async (rows: Ailment[]) => {
    rows.forEach((a) => sessionAddedAilmentIdsRef.current.add(a.id));
    for (const a of rows) {
      if (favouriteKeys.has(ailmentIdentityKey(a.name))) continue;
      try {
        await favouriteAilment(a as any, homeId);
      } catch (err) {
        Logger.warn("Auto-watch on add skipped", { err });
      }
    }
    loadFavourites();
  };

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
        toast.success("Removed from your watchlist.");
      } else {
        const row = await favouriteAilment(ailment as any, homeId);
        setFavourites((prev) => [row, ...prev.filter((f) => f.id !== row.id)]);
        logEvent(EVENT.AILMENT_FAVOURITED, { ailment_library_id: row.ailment_library_id, source: ailment.source });
        toast.success("Added to your watchlist — it follows you across homes.");
      }
      loadFavourites();
    } catch (err: any) {
      loadFavourites(); // roll back optimistic state
      if (String(err?.message ?? "").includes("tier_locked_source")) {
        toast.error(lockedAilmentSourceMessage(ailment.source));
      } else {
        Logger.error("Favourite ailment toggle failed", err, { ailmentId: ailment.id }, "Could not update your watchlist — please try again.");
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

  // ── Hub v3 Stage E — shareable field-guide deep link ──────────────────────
  // /shed?tab=watchlist&detail=<ailment_library.id> — the SAME numeric
  // identity the old /ailment-library?ailment= carried, so Stage F's redirect
  // is a pure param rename. REACTIVE derivation (unlike the one-shot open=
  // pattern): opening PUSHes, closing REPLACE-deletes, so Back closes it.
  const detailId = searchParams.get("detail");
  const [detailLibrary, setDetailLibrary] = useState<LibraryAilment[] | null>(null);
  useEffect(() => {
    if (!detailId || detailLibrary) return;
    let cancelled = false;
    fetchAilmentLibrary()
      .then((rows) => { if (!cancelled) setDetailLibrary(rows); })
      .catch((err) => Logger.warn("Could not load the ailment library for ?detail=", { err }));
    return () => { cancelled = true; };
  }, [detailId, detailLibrary]);
  const detailLibraryAilment = useMemo(
    () =>
      detailId && detailLibrary
        ? detailLibrary.find((r) => String(r.id) === detailId) ?? null
        : null,
    [detailId, detailLibrary],
  );
  // Unknown / stale id → fail soft (drop the param) once the library loaded.
  useEffect(() => {
    if (detailId && detailLibrary && !detailLibraryAilment) {
      setSearchParams((p) => { const n = new URLSearchParams(p); n.delete("detail"); return n; }, { replace: true });
    }
  }, [detailId, detailLibrary, detailLibraryAilment, setSearchParams]);
  const closeDetailParam = () =>
    setSearchParams((p) => { const n = new URLSearchParams(p); n.delete("detail"); return n; }, { replace: true });
  const [detailWatchBusy, setDetailWatchBusy] = useState(false);
  const detailWatching =
    !!detailLibraryAilment &&
    ailments.some(
      (a) => !a.is_archived && ailmentIdentityKey(a.name) === ailmentIdentityKey(detailLibraryAilment.name),
    );
  const watchFromDetailPage = async (): Promise<Ailment | null> => {
    if (!detailLibraryAilment || detailWatchBusy) return null;
    setDetailWatchBusy(true);
    try {
      const data = await addLibraryAilmentToWatchlist(detailLibraryAilment, homeId);
      setAilments((prev) => [data as Ailment, ...prev]);
      autoWatch([data as Ailment]);
      logEvent(EVENT.AILMENT_ADDED, {
        ailment_id: (data as Ailment).id,
        name: detailLibraryAilment.name,
        type: kindToWatchlistType(detailLibraryAilment.kind),
      });
      toast.success(`"${detailLibraryAilment.name}" added to watchlist.`);
      return data as Ailment;
    } catch (err: any) {
      Logger.error("Failed to add library ailment", err, { homeId }, err.message || "Add failed.");
      return null;
    } finally {
      setDetailWatchBusy(false);
    }
  };
  // "Link to a plant" from the page-level detail — reuse the watched home row
  // or watch first (the sighting IS the reason it belongs on the watchlist).
  const [pageLinkTarget, setPageLinkTarget] = useState<Ailment | null>(null);
  const linkFromDetailPage = async () => {
    if (!detailLibraryAilment) return;
    const existing = ailments.find(
      (a) => !a.is_archived && ailmentIdentityKey(a.name) === ailmentIdentityKey(detailLibraryAilment.name),
    );
    const target = existing ?? (await watchFromDetailPage());
    if (target) setPageLinkTarget(target);
  };
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

  // Smart default (owner request 2026-07-23): land on the Active chip when the
  // watchlist actually has active ailments, else stay on All. One-shot — fires
  // once both ailments and presence have loaded; never overrides a manual pick
  // (userChoseChipRef guards the load-window race where a click lands first).
  const didSmartDefaultRef = useRef(false);
  const userChoseChipRef = useRef(false);
  useEffect(() => {
    if (didSmartDefaultRef.current || userChoseChipRef.current || legacyFilters) return;
    if (gardenPresence.loading || ailments.length === 0) return; // wait for both to load
    didSmartDefaultRef.current = true;
    const hasActive = ailments.some((a) => gardenPresence.ailmentPresence.get(a.id) === "active");
    if (hasActive) setPresenceChip("active");
  }, [gardenPresence.loading, gardenPresence.ailmentPresence, ailments, legacyFilters]);

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

  // v3 feedback polish — the owner's visibility law, ailments flavour: a row
  // earns its place by being IN USE (derived presence) or WATCHED (🔭 on the
  // personal watchlist). Zero-presence un-watched rows are search-only (the
  // "Watching" chip died; the merged 🔭 Watchlist chip is the affinity view).
  const isWatched = (a: Ailment) =>
    favouriteKeys.has(ailmentIdentityKey(a.name));
  const displayed = (legacyFilters
    ? tabAilments
    : ailments.filter((a) => {
        const pres = gardenPresence.ailmentPresence.get(a.id);
        if (presenceChip === "active") return pres === "active";
        if (presenceChip === "inactive") return pres === "inactive";
        // All: visible = presence OR 🔭 OR added-this-session.
        return (
          pres != null ||
          (!a.is_archived && (isWatched(a) || sessionAddedAilmentIdsRef.current.has(a.id)))
        );
      })
  ).filter((a) => filter === "all" || a.type === filter);

  const presenceCounts = (() => {
    let active = 0, inactive = 0, watched = 0, hidden = 0;
    for (const a of ailments) {
      const pres = gardenPresence.ailmentPresence.get(a.id);
      if (pres === "active") active++;
      else if (pres === "inactive") inactive++;
      else if (!a.is_archived && (isWatched(a) || sessionAddedAilmentIdsRef.current.has(a.id))) watched++;
      else if (!a.is_archived) hidden++;
    }
    return { active, inactive, hidden, all: active + inactive + watched };
  })();

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

  // The "Search pests & diseases" overlay renders as a SIBLING near the other
  // modals below (Stage 2) — the watchlist grid stays mounted underneath, so
  // closing lands exactly where you left off. The ?open=add-ailment deep link
  // + onSaved contract are unchanged.
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Landing chrome diet (Stage 3) — 8 chrome blocks become HubHeader +
          one chip row. The search input that sat at ~y=738 died into the
          takeover ("On your watchlist" section). */}
      <div className="flex flex-col gap-3">
        <HubHeader
          bleed
          title="Ailments"
          count={counts.all}
          guidance="Pests and diseases you're keeping an eye on — search to look one up or add it."
          menuTestId="watchlist-overflow-menu"
          menuItems={[
            ...(scope === "home" && can("ailments.add")
              ? [{
                  key: "bulk",
                  label: "Add several at once (CSV / paste)",
                  icon: <FileText size={16} />,
                  testId: "watchlist-bulk-add-btn",
                  onSelect: () => setShowBulkAdd(true),
                }]
              : []),
          ]}
          searchPlaceholder="Search pests & diseases…"
          searchTestId="watchlist-add-btn"
          searchAriaLabel="Find an ailment"
          onSearchTap={() => setShowAdd(true)}
        />

        {/* Presence chip row (Hub v3 Stage C) — Active/Inactive derived from
            the ailment_presence view; Watching = curated with no presence.
            The legacy flag falls back to the Stage-3 axis (viewTab/Archived).
            Deep link: /shed?tab=watchlist&scope=favourites */}
        <div
          data-testid="watchlist-scope-toggle"
          role="tablist"
          aria-label="Watchlist scope"
          className="flex flex-wrap items-center gap-2"
        >
          {(legacyFilters
            ? [
                { key: "all", label: `All${counts.all > 0 ? ` · ${counts.all}` : ""}`, testId: "watchlist-scope-home", active: scope === "home" && viewTab === "active", onClick: () => { switchScope("home"); setFilter("all"); setViewTab("active"); } },
                { key: "archived", label: "Archived", testId: "watchlist-chip-archived", active: scope === "home" && viewTab === "archived", onClick: () => { switchScope("home"); setViewTab("archived"); setFilter("all"); } },
              ]
            : [
                { key: "all", label: `All${presenceCounts.all > 0 ? ` · ${presenceCounts.all}` : ""}`, testId: "watchlist-scope-home", active: scope === "home" && presenceChip === "all", onClick: () => { userChoseChipRef.current = true; switchScope("home"); setPresenceChip("all"); } },
                { key: "active", label: `Active${presenceCounts.active > 0 ? ` · ${presenceCounts.active}` : ""}`, testId: "watchlist-chip-active", active: scope === "home" && presenceChip === "active", onClick: () => { userChoseChipRef.current = true; switchScope("home"); setPresenceChip("active"); } },
                { key: "inactive", label: `Inactive${presenceCounts.inactive > 0 ? ` · ${presenceCounts.inactive}` : ""}`, testId: "watchlist-chip-inactive", active: scope === "home" && presenceChip === "inactive", onClick: () => { userChoseChipRef.current = true; switchScope("home"); setPresenceChip("inactive"); } },
                // v3 feedback polish — the "Watching" chip died: visibility is
                // presence OR 🔭, and the merged Watchlist chip (below) IS the
                // affinity view.
              ]
          ).map((chip) => (
            <button
              key={chip.key}
              role="tab"
              aria-selected={chip.active}
              data-testid={chip.testId}
              onClick={chip.onClick}
              className={`px-4 py-2 min-h-[40px] pointer-coarse:min-h-11 rounded-full text-sm font-black transition-colors touch-manipulation ${
                chip.active
                  ? "bg-rhozly-primary text-white"
                  : "bg-rhozly-surface-lowest border border-rhozly-outline/15 text-rhozly-on-surface/60 can-hover:hover:text-rhozly-primary can-hover:hover:border-rhozly-primary/30"
              }`}
            >
              {chip.label}
            </button>
          ))}
          {/* v3 feedback polish — ONE watchlist concept, binoculars only (the
              owner's rule: no hearts on ailments; the stray Heart died). */}
          <button
            role="tab"
            aria-selected={scope === "favourites"}
            data-testid="watchlist-scope-favourites"
            onClick={() => switchScope("favourites")}
            className={`flex items-center gap-1.5 px-4 py-2 min-h-[40px] pointer-coarse:min-h-11 rounded-full text-sm font-black transition-colors touch-manipulation ${
              scope === "favourites"
                ? "bg-status-watch-fill text-status-watch-ink border border-status-watch-line"
                : "bg-rhozly-surface-lowest border border-rhozly-outline/15 text-rhozly-on-surface/60 can-hover:hover:text-status-watch-ink can-hover:hover:border-status-watch-line"
            }`}
          >
            <Binoculars size={13} />
            Watchlist{favourites.length > 0 ? ` · ${favourites.length}` : ""}
          </button>
        </div>

        {/* Type row — the gardener's browse axis, kept as a thin second row
            (WL-024/025 + watchlist-type-* contracts preserved). Not a
            tablist: it combines freely with the presence chips. */}
        {scope === "home" && (
          <div className="flex flex-wrap items-center gap-1.5" aria-label="Ailment type filter">
            {([
              { id: "all", label: "All types" },
              { id: "pest", label: "Pests", icon: <IconPest size={11} /> },
              { id: "disease", label: "Diseases", icon: <Biohazard size={11} /> },
              { id: "invasive_plant", label: "Invasive", icon: <IconPlant size={11} /> },
            ] as { id: AilmentFilter; label: string; icon?: React.ReactNode }[]).map((f) => (
              <button
                key={f.id}
                aria-pressed={filter === f.id}
                data-testid={f.id === "all" ? "watchlist-type-all" : `watchlist-type-${f.id}`}
                onClick={() => setFilter(f.id)}
                className={`flex items-center gap-1 px-3 py-1.5 min-h-[36px] pointer-coarse:min-h-11 rounded-full text-xs font-black transition-colors touch-manipulation ${
                  filter === f.id
                    ? "bg-rhozly-on-surface/80 text-white"
                    : "bg-rhozly-surface-low text-rhozly-on-surface/55 can-hover:hover:text-rhozly-on-surface"
                }`}
              >
                {f.icon}{f.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Favourites scope body — the user's cross-home favourite ailments. */}
      {scope === "favourites" ? (
        <FavouriteAilmentsGrid
          homeId={homeId}
          homeName={homeName}
          homeAilments={ailments}
          favourites={favourites}
          loading={favouritesLoading}
          searchQuery=""
          aiEnabled={aiEnabled}
          perenualEnabled={perenualEnabled}
          onFavouritesChanged={loadFavourites}
          onHomeAilmentsChanged={() => { fetchAilments(); loadFavourites(); }}
        />
      ) : (
      <>
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
        <div data-testid="watchlist-card-grid" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {displayed.map((a, index) => (
            <AilmentCard
              key={a.id}
              ailment={a}
              index={index}
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
              homeId={homeId}
              onImageReplaced={fetchAilments}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          size="lg"
          icon={<AlertTriangle size={32} />}
          title={viewTab === "archived" ? "No archived ailments" : "Your watchlist is empty."}
          body={
            viewTab === "active"
              ? "Not sure what you're dealing with? Use Plant Doctor to photograph and identify problems."
              : "Archived entries will show up here."
          }
          primaryCta={
            viewTab === "active" && can("ailments.add")
              ? { label: "Add your first entry", onClick: () => setShowAdd(true), icon: <Plus size={16} /> }
              : undefined
          }
          secondaryCta={
            viewTab === "active"
              ? { label: "Open Plant Doctor", onClick: () => navigate("/doctor") }
              : undefined
          }
        />
      )}

      {/* Where-did-it-go safety net (visibility law): rows with no presence
          and no 🔭 are search-only — say so quietly instead of vanishing. */}
      {!legacyFilters && presenceChip === "all" && filter === "all" && presenceCounts.hidden > 0 && (
        <button
          type="button"
          data-testid="watchlist-hidden-collection-hint"
          onClick={() => setShowAdd(true)}
          className="mt-2 mx-auto flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold text-rhozly-on-surface/45 can-hover:hover:text-rhozly-primary transition-colors"
        >
          {presenceCounts.hidden} more in your collection — search to find them
        </button>
      )}
      </>
      )}

      {/* Modals — rendered via portal so they escape any parent overflow/z-index */}
      {/* The Find-an-ailment flow — a fixed z-[60] overlay (Stage 2): covers
          the app chrome while the watchlist grid stays mounted underneath. */}
      {showAdd && (
        <AddAilmentModal
          homeId={homeId}
          aiEnabled={aiEnabled}
          onSaved={(a) => { setAilments((prev) => [a, ...prev]); requestFeedback("ailment_add"); autoWatch([a]); }}
          onClose={() => setShowAdd(false)}
          existingKeys={new Set(
            ailments.filter((a) => !a.is_archived).map((a) => ailmentIdentityKey(a.name)).filter(Boolean),
          )}
          ownedAilments={ailments}
          onOpenOwnedAilment={(a) => { setShowAdd(false); setSelectedAilment(a); }}
          ailmentPresence={gardenPresence.ailmentPresence}
          favouriteLibraryIds={new Set(
            favourites.map((f) => f.ailment_library_id).filter((x): x is number => x != null),
          )}
        />
      )}
      {showBulkAdd && (
        <BulkAddAilmentsModal
          homeId={homeId}
          aiEnabled={aiEnabled}
          onClose={() => setShowBulkAdd(false)}
          onCreated={(created) => {
            if (created.length > 0) {
              setAilments((prev) => [...created, ...prev]);
              requestFeedback("ailment_add");
              autoWatch(created);
            }
          }}
        />
      )}
      {selectedAilment && createPortal(
        <AilmentDetailModal
          ailment={selectedAilment}
          onClose={() => setSelectedAilment(null)}
          onDelete={(id) => setAilments((prev) => prev.filter((a) => a.id !== id))}
          aiEnabled={aiEnabled}
        />,
        document.body,
      )}

      {/* Stage E — the shareable ?detail= field-guide host (library identity). */}
      {detailLibraryAilment && (
        <LibraryAilmentDetailModal
          ailment={detailLibraryAilment}
          homeId={homeId}
          aiEnabled={aiEnabled}
          watching={detailWatching}
          watchingBusy={detailWatchBusy}
          canWatch
          onWatch={() => { watchFromDetailPage(); }}
          onClose={closeDetailParam}
          onLinkToPlant={linkFromDetailPage}
        />
      )}
      {pageLinkTarget && (
        <LinkAilmentToPlantModal
          homeId={homeId}
          ailment={pageLinkTarget}
          onClose={() => setPageLinkTarget(null)}
        />
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
