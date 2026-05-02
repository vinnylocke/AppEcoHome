import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Plus, Search, Loader2, Bug, Leaf, Biohazard, X, Sparkles,
  Database, Edit3, Trash2, ChevronRight, ChevronUp, ChevronLeft, AlertTriangle,
  CheckCircle2, Info, Square, CheckSquare2, Archive, ArchiveRestore,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { supabase } from "../lib/supabase";
import { PerenualService } from "../lib/perenualService";
import SmartImage from "./SmartImage";
import { ConfirmModal } from "./ConfirmModal";
import { logEvent, EVENT } from "../events/registry";

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
  source: "manual" | "perenual" | "ai";
  perenual_id?: number;
  thumbnail_url?: string;
  is_archived: boolean;
  created_at: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TYPE_META: Record<AilmentType, { label: string; icon: React.ReactNode; colour: string }> = {
  invasive_plant: { label: "Invasive Plant", icon: <Leaf size={14} />, colour: "bg-orange-100 text-orange-700" },
  pest:           { label: "Pest",           icon: <Bug size={14} />,       colour: "bg-red-100 text-red-700" },
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
              className="text-rhozly-on-surface/30 hover:text-red-500 transition-colors"
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
    setDeleting(true);
    const { error } = await supabase.from("ailments").delete().eq("id", ailment.id);
    if (error) {
      toast.error("Could not delete ailment.");
      setDeleting(false);
    } else {
      onDelete(ailment.id);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-rhozly-bg/95 backdrop-blur-xl animate-in fade-in duration-300">
      <div data-testid="detail-modal" className="bg-rhozly-surface-lowest rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl border border-rhozly-outline/20">
        {/* Header */}
        <div className="flex items-start justify-between p-6 pb-4">
          <div className="flex items-start gap-4">
            {ailment.thumbnail_url ? (
              <SmartImage
                src={ailment.thumbnail_url}
                alt={ailment.name}
                className="w-16 h-16 rounded-2xl object-cover bg-rhozly-surface-low shrink-0"
              />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-rhozly-surface-low flex items-center justify-center shrink-0">
                {meta.icon}
              </div>
            )}
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
              className="p-3 bg-rhozly-surface-low rounded-2xl hover:bg-red-50 hover:text-red-500 transition-colors"
              aria-label="Delete ailment"
            >
              {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
            </button>
            <button
              onClick={onClose}
              className="p-3 bg-rhozly-surface-low rounded-2xl hover:scale-110 transition-transform"
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

type CreationMode = "manual" | "perenual" | "ai";

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
  onSaved,
  onClose,
}: {
  homeId: string;
  onSaved: (ailment: Ailment) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<CreationMode>("manual");
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

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
  type AIResult = { cartId: string; data: Omit<Ailment, "id" | "created_at"> };
  const [aiResults, setAiResults] = useState<AIResult[]>([]);
  const [checkedAiIds, setCheckedAiIds] = useState<Set<string>>(new Set());
  const [aiPreviewCache, setAiPreviewCache] = useState<Record<string, { loading: boolean; image?: string }>>({});
  const [expandedAiId, setExpandedAiId] = useState<string | null>(null);

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

    const tryWiki = async (term: string) => {
      try {
        const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(term)}`);
        if (!res.ok) return null;
        const data = await res.json();
        if (data.type === "disambiguation" || !data.extract) return null;
        return data;
      } catch { return null; }
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
        desc: data?.extract || "No encyclopedia entry found.",
      },
    }));
  };

  const handleExpandResult = (r: any) => {
    const id = r.id as number;
    if (expandedResultId === id) { setExpandedResultId(null); return; }
    setExpandedResultId(id);
    fetchWikiPreview(id, r.common_name, extractScientificName(r.scientific_name));
  };

  const searchPerenual = async () => {
    if (!perenualQuery.trim()) return;
    setPerenualLoading(true);
    setPerenualError(null);
    try {
      const results = await PerenualService.searchPestDisease(perenualQuery);
      setPerenualResults(results);
      if (results.length === 0) setPerenualError("No results found. Try a different search term.");
    } catch (err: any) {
      setPerenualError(err.message || "Perenual search failed.");
    } finally {
      setPerenualLoading(false);
    }
  };

  const searchWithAI = async () => {
    if (!aiQuery.trim()) { toast.error("Enter a search query."); return; }
    setAiSearchLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data: funcData, error } = await supabase.functions.invoke("generate-ailment-suggestions", {
        body: { query: aiQuery },
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
      if (results.length === 0) toast.error("No results found. Try a different search.");
    } catch (err: any) {
      toast.error(err.message || "AI search failed.");
    } finally {
      setAiSearchLoading(false);
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Name is required."); return; }
    if (!form.description.trim()) { toast.error("Description is required."); return; }
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
      toast.error(err.message || "Save failed.");
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
      (data as Ailment[]).forEach((a) => onSaved(a));
      (data as Ailment[]).forEach((a) => logEvent(EVENT.AILMENT_ADDED, { ailment_id: a.id, name: a.name, type: a.type }));
      toast.success(`Added ${data.length} ailment${data.length !== 1 ? "s" : ""} to watchlist.`);
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const showSteps = mode === "manual";
  const totalSelected = checkedPerenualIds.size + checkedAiIds.size;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-rhozly-bg/95 backdrop-blur-xl animate-in fade-in duration-300">
      <div className="bg-rhozly-surface-lowest rounded-3xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl border border-rhozly-outline/20">
        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-4">
          <div>
            <h3 className="font-black text-2xl text-rhozly-on-surface">Add to Watchlist</h3>
            <p className="text-sm font-bold text-rhozly-primary uppercase tracking-widest mt-1">Ailment Watchlist</p>
          </div>
          <button onClick={onClose} className="p-3 bg-rhozly-surface-low rounded-2xl hover:scale-110 transition-transform">
            <X size={20} />
          </button>
        </div>

        {/* Mode Picker — hidden during review */}
        {step === "tabs" && (
          <div className="flex bg-rhozly-surface-low p-1 rounded-2xl mx-6 mb-4 flex-wrap gap-1">
            {(["manual", "perenual", "ai"] as CreationMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 min-w-[80px] py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 ${
                  mode === m
                    ? m === "ai"
                      ? "bg-white text-amber-500 shadow-sm"
                      : "bg-white text-rhozly-primary shadow-sm"
                    : "text-rhozly-on-surface/40 hover:text-rhozly-on-surface"
                }`}
              >
                {m === "manual" && <Edit3 size={12} />}
                {m === "perenual" && <Database size={12} />}
                {m === "ai" && <Sparkles size={12} />}
                {m === "manual" ? "Manual" : m === "perenual" ? "Perenual" : "AI"}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6 space-y-5">

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
                          {built.prevention_steps.length} prev · {built.remedy_steps.length} rem
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => setCheckedPerenualIds((prev) => { const n = new Set(prev); n.delete(r.id); return n; })}
                      className="p-2 text-rhozly-on-surface/30 hover:text-red-500 transition-colors"
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
                  <div key={r.cartId} className="bg-white border border-rhozly-outline/10 rounded-2xl p-4 flex items-center gap-3 shadow-sm">
                    <div className="w-12 h-12 rounded-xl bg-amber-50 overflow-hidden shrink-0 flex items-center justify-center text-amber-300">
                      <Sparkles size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-sm text-rhozly-on-surface truncate">{r.data.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`inline-flex items-center gap-0.5 text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full ${meta.colour}`}>
                          {meta.icon} {meta.label}
                        </span>
                        <span className="text-[9px] font-black text-amber-500">AI</span>
                        <span className="text-[9px] font-black text-rhozly-on-surface/30">
                          {(r.data.prevention_steps || []).length} prev · {(r.data.remedy_steps || []).length} rem
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => setCheckedAiIds((prev) => { const n = new Set(prev); n.delete(r.cartId); return n; })}
                      className="p-2 text-rhozly-on-surface/30 hover:text-red-500 transition-colors"
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
                      onClick={searchPerenual}
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
                                className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl transition-colors"
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
                                  <Bug size={16} />
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
                              <div className="border-t border-rhozly-outline/5 bg-amber-50/50 p-4 animate-in slide-in-from-top-2">
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
                  <div className="flex gap-2">
                    <input
                      value={aiQuery}
                      onChange={(e) => setAiQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && searchWithAI()}
                      placeholder="e.g. rose pests, black spot, aphids…"
                      className="flex-1 p-4 bg-white rounded-2xl font-black text-sm border border-rhozly-outline/10 focus:border-amber-500 outline-none"
                    />
                    <button
                      onClick={searchWithAI}
                      disabled={aiSearchLoading || !aiQuery.trim()}
                      className="min-w-[52px] min-h-[52px] px-5 rounded-2xl bg-amber-500 text-white font-black text-sm flex items-center justify-center gap-2 hover:scale-[1.02] transition-transform disabled:opacity-60"
                      aria-label="Search with AI"
                    >
                      {aiSearchLoading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                    </button>
                  </div>

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
                                className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl transition-colors"
                                aria-label={isChecked ? "Deselect" : "Select"}
                              >
                                {isChecked
                                  ? <CheckSquare2 size={20} className="text-amber-500" />
                                  : <Square size={20} className="text-rhozly-on-surface/30" />}
                              </button>
                              <div className="w-12 h-12 rounded-xl bg-amber-50 overflow-hidden shrink-0 flex items-center justify-center text-amber-300">
                                {preview?.image ? (
                                  <img src={preview.image} alt={r.data.name} className="w-full h-full object-cover" />
                                ) : preview?.loading ? (
                                  <Loader2 size={16} className="animate-spin text-amber-400" />
                                ) : (
                                  <Sparkles size={18} />
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
                              <div className="border-t border-rhozly-outline/5 bg-amber-50/40 p-4 animate-in slide-in-from-top-2">
                                <div className="flex gap-3 items-start">
                                  {preview?.image && (
                                    <img src={preview.image} alt={r.data.name} className="w-20 h-20 rounded-xl object-cover shadow-sm shrink-0" />
                                  )}
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
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="ailment-name" className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 block mb-2">Name *</label>
                      <input
                        id="ailment-name"
                        value={form.name}
                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                        className="w-full p-4 bg-rhozly-surface-low rounded-2xl font-black text-sm border border-transparent focus:border-rhozly-primary outline-none"
                      />
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
                      onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                      rows={3}
                      className="w-full p-4 bg-rhozly-surface-low rounded-2xl font-black text-sm border border-transparent focus:border-rhozly-primary outline-none resize-none"
                    />
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
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-black uppercase tracking-widest text-rhozly-on-surface/50">Symptoms</h4>
                        <button
                          type="button"
                          onClick={() => setForm((f) => ({ ...f, symptoms: [...f.symptoms, newSymptom()] }))}
                          className="flex items-center gap-1 text-xs font-black text-rhozly-primary hover:underline"
                        >
                          <Plus size={12} /> Add
                        </button>
                      </div>
                      {form.symptoms.map((s, idx) => (
                        <div key={s.id} className="bg-rhozly-surface-lowest rounded-2xl p-3 border border-rhozly-outline/10 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black uppercase text-rhozly-on-surface/40">Symptom {idx + 1}</span>
                            <button
                              type="button"
                              onClick={() => setForm((f) => ({ ...f, symptoms: f.symptoms.filter((_, i) => i !== idx) }))}
                              className="text-rhozly-on-surface/30 hover:text-red-500"
                            >
                              <X size={12} />
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

                  <StepBuilder
                    label="Solutions"
                    steps={form.prevention_steps}
                    onChange={(steps) => setForm((f) => ({ ...f, prevention_steps: steps }))}
                  />
                  <StepBuilder
                    label="Remedy Steps"
                    steps={form.remedy_steps}
                    onChange={(steps) => setForm((f) => ({ ...f, remedy_steps: steps }))}
                  />
                </>
              )}
            </>
          )}
        </div>

        {/* Footer — shared selection bar (Perenual + AI tabs) */}
        {step === "tabs" && totalSelected > 0 && mode !== "manual" && (
          <div className="shrink-0 p-4 border-t border-rhozly-outline/10 animate-in slide-in-from-bottom-2">
            <div className="bg-rhozly-surface-lowest shadow-2xl border border-rhozly-outline/20 rounded-2xl p-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-black text-rhozly-on-surface">{totalSelected} Selected</p>
                <p className="text-[10px] font-bold uppercase tracking-widest text-rhozly-on-surface/40">
                  {checkedPerenualIds.size > 0 && checkedAiIds.size > 0
                    ? `${checkedPerenualIds.size} Perenual · ${checkedAiIds.size} AI`
                    : checkedPerenualIds.size > 0
                    ? "from Perenual"
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
          <div className="p-6 pt-4 border-t border-rhozly-outline/10 flex gap-3">
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
              {saving ? "Adding…" : `Add ${totalSelected} Ailment${totalSelected !== 1 ? "s" : ""}`}
            </button>
          </div>
        )}

        {/* Footer — Manual form */}
        {showSteps && (
          <div className="p-6 pt-4 border-t border-rhozly-outline/10 flex gap-3">
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
  perenual: { icon: <Database size={10} />, label: "Perenual", colour: "text-rhozly-primary" },
  ai:       { icon: <Sparkles size={10} />, label: "AI",       colour: "text-amber-500" },
  manual:   { icon: <Edit3 size={10} />,    label: "Manual",   colour: "text-rhozly-on-surface/60" },
};

const TYPE_OVERLAY: Record<AilmentType, string> = {
  pest:           "text-red-600",
  disease:        "text-purple-600",
  invasive_plant: "text-orange-600",
};

const TYPE_BG: Record<AilmentType, string> = {
  pest:           "bg-red-50",
  disease:        "bg-purple-50",
  invasive_plant: "bg-orange-50",
};

const TYPE_ICON_COLOUR: Record<AilmentType, string> = {
  pest:           "text-red-200",
  disease:        "text-purple-200",
  invasive_plant: "text-orange-200",
};

// ─── Ailment Card ─────────────────────────────────────────────────────────────

function AilmentCard({
  ailment,
  onClick,
  onArchiveToggle,
  onDelete,
}: {
  ailment: Ailment;
  onClick: () => void;
  onArchiveToggle: () => void;
  onDelete: () => void;
}) {
  const meta = TYPE_META[ailment.type];
  const srcMeta = SOURCE_META[ailment.source] ?? SOURCE_META.manual;

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onClick()}
      className="bg-rhozly-surface-lowest rounded-[2.5rem] overflow-hidden border border-rhozly-outline/20 shadow-sm group flex flex-col cursor-pointer hover:border-rhozly-primary/30 focus:outline-none focus:ring-2 focus:ring-rhozly-primary focus:ring-offset-2 transition-all"
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
              {ailment.type === "pest" ? <Bug size={72} /> :
               ailment.type === "disease" ? <Biohazard size={72} /> : <Leaf size={72} />}
            </span>
          </div>
        )}

        {/* Source badge — top left */}
        <div className="absolute top-4 left-4">
          <span className={`bg-white/90 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-black uppercase flex items-center gap-1.5 shadow-sm border border-white/20 ${srcMeta.colour}`}>
            {srcMeta.icon} {srcMeta.label}
          </span>
        </div>

        {/* Archive + Delete buttons — top right */}
        <div className="absolute top-4 right-4 flex gap-2">
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
        </div>
      </div>

      {/* Body */}
      <div className="p-6">
        <h3 className="text-xl font-black text-rhozly-on-surface leading-tight mb-1">{ailment.name}</h3>
        {ailment.scientific_name && (
          <p className="text-xs font-bold italic text-rhozly-on-surface/40 truncate">{ailment.scientific_name}</p>
        )}
        <p className="text-xs text-rhozly-on-surface/60 line-clamp-2 leading-relaxed mt-2">{ailment.description}</p>
        <div className="mt-auto pt-5 border-t border-rhozly-outline/10 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black text-rhozly-on-surface/30 uppercase tracking-widest">Steps</p>
            <p className="text-2xl font-black text-rhozly-primary">
              {(ailment.prevention_steps?.length ?? 0) + (ailment.remedy_steps?.length ?? 0)}
            </p>
          </div>
          <span className={`inline-flex items-center gap-1 text-[9px] font-black uppercase px-2 py-1 rounded-full ${meta.colour}`}>
            {meta.icon} {meta.label}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export type AilmentFilter = "all" | AilmentType;

export default function AilmentWatchlist({ homeId }: { homeId: string }) {
  const [ailments, setAilments] = useState<Ailment[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewTab, setViewTab] = useState<"active" | "archived">("active");
  const [filter, setFilter] = useState<AilmentFilter>("all");
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [selectedAilment, setSelectedAilment] = useState<Ailment | null>(null);
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    type: "delete" | "archive" | "unarchive";
    ailment: Ailment | null;
  }>({ isOpen: false, type: "delete", ailment: null });

  const fetchAilments = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("ailments")
      .select("*")
      .eq("home_id", homeId)
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Could not load watchlist.");
    } else {
      setAilments((data || []) as Ailment[]);
    }
    setLoading(false);
  }, [homeId]);

  useEffect(() => { fetchAilments(); }, [fetchAilments]);

  const handleConfirmAction = async () => {
    const { ailment, type } = confirmState;
    if (!ailment) return;
    if (type === "delete") {
      const { error } = await supabase.from("ailments").delete().eq("id", ailment.id);
      if (error) throw error;
      logEvent(EVENT.AILMENT_DELETED, { ailment_id: ailment.id, name: ailment.name, type: ailment.type });
      setAilments((prev) => prev.filter((a) => a.id !== ailment.id));
      if (selectedAilment?.id === ailment.id) setSelectedAilment(null);
    } else {
      const archived = type === "archive";
      const { error } = await supabase.from("ailments").update({ is_archived: archived }).eq("id", ailment.id);
      if (error) throw error;
      logEvent(
        archived ? EVENT.AILMENT_ARCHIVED : EVENT.AILMENT_RESTORED,
        { ailment_id: ailment.id, name: ailment.name, type: ailment.type },
      );
      setAilments((prev) => prev.map((a) => a.id === ailment.id ? { ...a, is_archived: archived } : a));
    }
    setConfirmState((s) => ({ ...s, isOpen: false }));
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-black text-3xl text-rhozly-on-surface tracking-tight">Watchlist</h1>
          <p className="text-sm font-bold text-rhozly-on-surface/40 mt-1">Invasive plants, pests &amp; diseases</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-5 py-3 bg-rhozly-primary text-white rounded-2xl font-black text-sm shadow-lg hover:scale-[1.02] transition-transform"
        >
          <Plus size={18} /> Add
        </button>
      </div>

      {/* Active / Archived tabs + type filters */}
      <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3">
        <div className="bg-rhozly-surface-low p-1.5 rounded-2xl flex gap-1 border border-rhozly-outline/10">
          {(["active", "archived"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setViewTab(tab)}
              className={`flex-1 sm:flex-none px-6 py-2 rounded-xl text-sm font-black transition-all ${viewTab === tab ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-on-surface/40 hover:text-rhozly-on-surface"}`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        <div className="flex gap-1.5 bg-rhozly-surface-low p-1.5 rounded-2xl border border-rhozly-outline/5 overflow-x-auto flex-1">
          {([
            { id: "all", label: "All" },
            { id: "invasive_plant", label: "Invasive", icon: <Leaf size={12} /> },
            { id: "pest", label: "Pests", icon: <Bug size={12} /> },
            { id: "disease", label: "Diseases", icon: <Biohazard size={12} /> },
          ] as { id: AilmentFilter; label: string; icon?: React.ReactNode }[]).map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black whitespace-nowrap transition-all ${filter === f.id ? "bg-white text-rhozly-primary shadow-sm border border-rhozly-outline/10" : "text-rhozly-on-surface/40 hover:text-rhozly-on-surface"}`}
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
          className="w-full pl-11 pr-4 py-3 rounded-2xl border border-rhozly-outline/20 bg-white font-bold text-sm focus:outline-none focus:ring-2 focus:ring-rhozly-primary/30"
        />
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-rhozly-primary" />
        </div>
      ) : displayed.length > 0 ? (
        <div data-testid="watchlist-card-grid" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayed.map((a) => (
            <AilmentCard
              key={a.id}
              ailment={a}
              onClick={() => setSelectedAilment(a)}
              onArchiveToggle={() => setConfirmState({ isOpen: true, type: a.is_archived ? "unarchive" : "archive", ailment: a })}
              onDelete={() => setConfirmState({ isOpen: true, type: "delete", ailment: a })}
            />
          ))}
        </div>
      ) : (
        <div className="py-20 text-center bg-rhozly-surface-lowest rounded-3xl border border-rhozly-outline/20">
          <AlertTriangle size={36} className="mx-auto mb-3 text-rhozly-on-surface/20" />
          <p className="font-black text-rhozly-on-surface/40">
            {search
              ? "No matching ailments."
              : viewTab === "archived"
              ? "No archived ailments."
              : "Your watchlist is empty."}
          </p>
          {!search && viewTab === "active" && (
            <button
              onClick={() => setShowAdd(true)}
              className="mt-4 px-5 py-2.5 bg-rhozly-primary text-white rounded-2xl text-sm font-black hover:scale-[1.02] transition-transform"
            >
              Add your first entry
            </button>
          )}
        </div>
      )}

      {/* Modals — rendered via portal so they escape any parent overflow/z-index */}
      {showAdd && createPortal(
        <AddAilmentModal
          homeId={homeId}
          onSaved={(a) => setAilments((prev) => [a, ...prev])}
          onClose={() => setShowAdd(false)}
        />,
        document.body,
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
