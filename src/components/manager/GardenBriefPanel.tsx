import React, { useCallback, useEffect, useState } from "react";
import { Loader2, Sparkles, Pencil, Check, X, ClipboardList } from "lucide-react";
import { supabase } from "../../lib/supabase";
import {
  GOAL_OPTIONS, STYLE_OPTIONS, TIME_OPTIONS, EXPERIENCE_OPTIONS, BUDGET_OPTIONS,
  type BriefOption,
} from "../../constants/gardenBrief";
import {
  type GardenBrief, normaliseDraft, isBriefEmpty,
  goalLabel, styleLabel, timeLabel, experienceLabel, budgetLabel,
} from "../../lib/gardenBrief";

/** Multi-select chip group. */
function ChipGroup({ options, selected, onToggle, testidPrefix }: {
  options: BriefOption[]; selected: string[]; onToggle: (id: string) => void; testidPrefix: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = selected.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onToggle(o.id)}
            data-testid={`${testidPrefix}-${o.id}`}
            aria-pressed={on}
            className={`px-3 py-1.5 rounded-2xl text-[13px] font-bold transition-colors ${
              on ? "bg-rhozly-primary text-white" : "bg-rhozly-surface text-rhozly-on-surface/60 hover:text-rhozly-on-surface/90"
            }`}
            title={o.hint}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Single-select segmented group (click selected to clear). */
function SegGroup({ options, value, onChange, testidPrefix }: {
  options: BriefOption[]; value: string | null; onChange: (id: string | null) => void; testidPrefix: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(on ? null : o.id)}
            data-testid={`${testidPrefix}-${o.id}`}
            aria-pressed={on}
            className={`px-3 py-1.5 rounded-2xl text-[13px] font-bold transition-colors ${
              on ? "bg-rhozly-primary text-white" : "bg-rhozly-surface text-rhozly-on-surface/60 hover:text-rhozly-on-surface/90"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-black uppercase tracking-widest text-rhozly-on-surface/40">{label}</p>
      {children}
    </div>
  );
}

export default function GardenBriefPanel({ homeId }: { homeId: string }) {
  const [loading, setLoading] = useState(true);
  const [brief, setBrief] = useState<GardenBrief | null>(null);
  const [editing, setEditing] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [goals, setGoals] = useState<string[]>([]);
  const [styles, setStyles] = useState<string[]>([]);
  const [time, setTime] = useState<string | null>(null);
  const [budget, setBudget] = useState<string | null>(null);
  const [experience, setExperience] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [aiSummary, setAiSummary] = useState("");
  const [derivedFrom, setDerivedFrom] = useState<unknown | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("garden_brief").select("*").eq("home_id", homeId).maybeSingle();
    setBrief((data as GardenBrief) ?? null);
    setLoading(false);
  }, [homeId]);

  useEffect(() => { load(); }, [load]);

  const fillForm = (b: Partial<GardenBrief>) => {
    setGoals(b.goals ?? []);
    setStyles(b.styles ?? []);
    setTime(b.time_per_week ?? null);
    setBudget(b.budget_tier ?? null);
    setExperience(b.experience_level ?? null);
    setNotes(b.notes ?? "");
    setAiSummary(b.ai_summary ?? "");
    setDerivedFrom(b.derived_from ?? null);
  };

  const startEdit = () => { if (brief) fillForm(brief); setEditing(true); };
  const startManual = () => { fillForm({}); setEditing(true); };

  const startDraft = async () => {
    setDrafting(true);
    try {
      const { data } = await supabase.functions.invoke("synthesize-garden-brief");
      const d = normaliseDraft((data as { draft?: unknown })?.draft);
      fillForm({
        goals: d.goals, styles: d.styles, time_per_week: d.time_per_week,
        budget_tier: d.budget_tier, experience_level: d.experience_level,
        ai_summary: d.ai_summary, notes: "",
        derived_from: (data as { draft?: { derived_from?: unknown } })?.draft?.derived_from ?? null,
      });
      setEditing(true);
    } catch {
      // Network/AI hiccup — fall back to manual setup so the user is never stuck.
      startManual();
    } finally {
      setDrafting(false);
    }
  };

  const toggle = (setter: React.Dispatch<React.SetStateAction<string[]>>) => (id: string) =>
    setter((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]));

  const save = async () => {
    setSaving(true);
    const nowIso = new Date().toISOString();
    const payload = {
      home_id: homeId,
      goals, styles,
      time_per_week: time, budget_tier: budget, experience_level: experience,
      notes: notes.trim() || null,
      ai_summary: aiSummary.trim() || null,
      derived_from: derivedFrom,
      confirmed_at: nowIso,
      updated_at: nowIso,
    };
    await supabase.from("garden_brief").upsert(payload, { onConflict: "home_id" });
    setSaving(false);
    setEditing(false);
    await load();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-rhozly-on-surface/40">
        <Loader2 size={18} className="animate-spin" /> Loading your brief…
      </div>
    );
  }

  // ── Editor ────────────────────────────────────────────────────────────────
  if (editing) {
    return (
      <div className="space-y-6" data-testid="brief-editor">
        {aiSummary && (
          <div className="rounded-3xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white p-5">
            <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-white/70 mb-1.5">
              <Sparkles size={12} /> Your head gardener's read
            </div>
            <textarea
              data-testid="brief-summary"
              value={aiSummary}
              onChange={(e) => setAiSummary(e.target.value)}
              rows={3}
              className="w-full bg-white/10 rounded-xl p-2.5 text-[15px] font-bold leading-snug placeholder-white/50 resize-none focus:outline-none focus:ring-2 focus:ring-white/40"
            />
          </div>
        )}

        <Field label="What do you want from your garden?">
          <ChipGroup options={GOAL_OPTIONS} selected={goals} onToggle={toggle(setGoals)} testidPrefix="brief-goal" />
        </Field>
        <Field label="Style you lean toward">
          <ChipGroup options={STYLE_OPTIONS} selected={styles} onToggle={toggle(setStyles)} testidPrefix="brief-style" />
        </Field>
        <Field label="Time you can give it">
          <SegGroup options={TIME_OPTIONS} value={time} onChange={setTime} testidPrefix="brief-time" />
        </Field>
        <Field label="Your experience">
          <SegGroup options={EXPERIENCE_OPTIONS} value={experience} onChange={setExperience} testidPrefix="brief-exp" />
        </Field>
        <Field label="Budget (optional)">
          <SegGroup options={BUDGET_OPTIONS} value={budget} onChange={setBudget} testidPrefix="brief-budget" />
        </Field>
        <Field label="Anything else I should know?">
          <textarea
            data-testid="brief-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="e.g. the front bed gets no afternoon sun; I'd love more cut flowers."
            className="w-full rounded-2xl border border-rhozly-outline/15 bg-white p-3 text-[14px] font-medium resize-none focus:outline-none focus:ring-2 focus:ring-rhozly-primary/30"
          />
        </Field>

        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={save}
            disabled={saving}
            data-testid="brief-save"
            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-3 rounded-2xl bg-rhozly-primary text-white text-[14px] font-black disabled:opacity-60"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            Confirm brief
          </button>
          <button
            onClick={() => setEditing(false)}
            data-testid="brief-cancel"
            className="px-4 py-3 rounded-2xl bg-rhozly-surface text-rhozly-on-surface/60 text-[14px] font-black"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    );
  }

  // ── Empty state ───────────────────────────────────────────────────────────
  if (isBriefEmpty(brief)) {
    return (
      <div className="text-center py-12 space-y-4" data-testid="brief-empty">
        <div className="w-12 h-12 mx-auto rounded-2xl bg-rhozly-primary/10 flex items-center justify-center">
          <ClipboardList size={20} className="text-rhozly-primary" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-black text-rhozly-on-surface/80">Tell me what you want from your garden</p>
          <p className="text-xs font-medium text-rhozly-on-surface/45 max-w-xs mx-auto">
            Your brief is what I manage everything toward — your goals, your style, how much time you've got.
          </p>
        </div>
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={startDraft}
            disabled={drafting}
            data-testid="brief-draft-ai"
            className="flex items-center gap-1.5 px-5 py-3 rounded-2xl bg-rhozly-primary text-white text-[14px] font-black disabled:opacity-60"
          >
            {drafting ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {drafting ? "Drafting your brief…" : "Draft my brief for me"}
          </button>
          <button
            onClick={startManual}
            data-testid="brief-setup-manual"
            className="text-[13px] font-bold text-rhozly-on-surface/50 hover:text-rhozly-on-surface/80"
          >
            Set it up myself
          </button>
        </div>
      </div>
    );
  }

  // ── Confirmed card ────────────────────────────────────────────────────────
  return (
    <div className="space-y-4" data-testid="brief-card">
      {brief?.ai_summary && (
        <div className="rounded-3xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white p-5">
          <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-white/70 mb-1.5">
            <Sparkles size={12} /> Your head gardener's read
          </div>
          <p className="text-[15px] font-bold leading-snug">{brief.ai_summary}</p>
        </div>
      )}

      <div className="rounded-3xl border border-rhozly-outline/10 bg-white p-5 space-y-4">
        {brief?.goals?.length ? (
          <div className="space-y-1.5">
            <p className="text-[11px] font-black uppercase tracking-widest text-rhozly-on-surface/40">Goals</p>
            <div className="flex flex-wrap gap-1.5">
              {brief.goals.map((g) => (
                <span key={g} className="px-2.5 py-1 rounded-full bg-rhozly-primary/10 text-rhozly-primary text-[12px] font-bold">
                  {goalLabel(g)}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3 text-[13px]">
          {brief?.styles?.length ? (
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest text-rhozly-on-surface/40">Style</p>
              <p className="font-bold text-rhozly-on-surface/80 mt-0.5">{brief.styles.map(styleLabel).join(", ")}</p>
            </div>
          ) : null}
          {brief?.time_per_week ? (
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest text-rhozly-on-surface/40">Time</p>
              <p className="font-bold text-rhozly-on-surface/80 mt-0.5">{timeLabel(brief.time_per_week)}</p>
            </div>
          ) : null}
          {brief?.experience_level ? (
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest text-rhozly-on-surface/40">Experience</p>
              <p className="font-bold text-rhozly-on-surface/80 mt-0.5">{experienceLabel(brief.experience_level)}</p>
            </div>
          ) : null}
          {brief?.budget_tier ? (
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest text-rhozly-on-surface/40">Budget</p>
              <p className="font-bold text-rhozly-on-surface/80 mt-0.5">{budgetLabel(brief.budget_tier)}</p>
            </div>
          ) : null}
        </div>

        {brief?.notes && (
          <div>
            <p className="text-[11px] font-black uppercase tracking-widest text-rhozly-on-surface/40">Notes</p>
            <p className="text-[13px] font-medium text-rhozly-on-surface/70 mt-0.5 leading-snug">{brief.notes}</p>
          </div>
        )}

        <button
          onClick={startEdit}
          data-testid="brief-edit"
          className="inline-flex items-center gap-1.5 text-[13px] font-black text-rhozly-primary hover:gap-2 transition-all"
        >
          <Pencil size={13} /> Edit my brief
        </button>
      </div>
    </div>
  );
}
