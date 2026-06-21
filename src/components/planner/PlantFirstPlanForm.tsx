import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../../lib/supabase";
import { toast } from "react-hot-toast";
import { X, ArrowLeft, Loader2, Sprout, Check, RefreshCw } from "lucide-react";
import PlantSearch from "../shared/PlantSearch";
import PlantDetailModal from "../PlantDetailModal";
import { selectionToProviderResult, type PlantSelection } from "../../lib/unifiedPlantSearch";
import type { ProviderSearchResult } from "../../lib/verdantlyUtils";
import type { AreaMode, PfpSelectedPlant, PlantFirstBlueprint } from "../../lib/plantFirstPlan";
import { Logger } from "../../lib/errorHandler";

interface Props {
  homeId: string;
  userTier: string | null;
  isOpen: boolean;
  onClose: () => void;
  onCreated: (planRow: any) => void;
}

const AREA_MODES: { value: AreaMode; label: string; desc: string }[] = [
  { value: "existing_plus_new", label: "Use my areas + suggest new", desc: "Fit my existing areas where they work, propose new ones for the rest." },
  { value: "existing", label: "Use my existing areas only", desc: "Spread the plants across the areas I already have." },
  { value: "new", label: "Design all-new areas", desc: "Plan the areas from scratch based on the plants." },
];

// Selection identity = common name + scientific name, so two near-duplicate
// results (same common name, different species) are distinct picks rather than
// toggling together.
const selKey = (name: string, sci?: string | null) =>
  `${name.trim().toLowerCase()}|${(sci ?? "").trim().toLowerCase()}`;
const keyOfSel = (s: PfpSelectedPlant) => selKey(s.name, s.scientific_name);

/**
 * Plant-first planner wizard: the user picks plants (Shed + search), chooses how
 * to handle areas, then AI arranges them into a multi-area plan they can review,
 * regenerate with feedback, and save (kind='plant-first').
 */
export default function PlantFirstPlanForm({ homeId, userTier, isOpen, onClose, onCreated }: Props) {
  const [step, setStep] = useState(1);
  const [shed, setShed] = useState<{ id: string; name: string }[]>([]);
  const [selected, setSelected] = useState<PfpSelectedPlant[]>([]);
  const [planName, setPlanName] = useState("");
  const [notes, setNotes] = useState("");
  const [areaMode, setAreaMode] = useState<AreaMode>("existing_plus_new");
  const [blueprint, setBlueprint] = useState<PlantFirstBlueprint | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [showRegen, setShowRegen] = useState(false);
  const [regenFeedback, setRegenFeedback] = useState("");
  const [creating, setCreating] = useState(false);
  const [detailResult, setDetailResult] = useState<ProviderSearchResult | null>(null);

  const tier = (userTier ?? "").toLowerCase();
  const gates = {
    canSearchExternal: ["botanist", "sage", "evergreen"].includes(tier),
    canCreateWithAI: ["sage", "evergreen"].includes(tier),
  };

  useEffect(() => {
    if (!isOpen) return;
    // Reset wizard state on open.
    setStep(1); setSelected([]); setPlanName(""); setNotes("");
    setAreaMode("existing_plus_new"); setBlueprint(null); setCoverUrl(null);
    setShowRegen(false); setRegenFeedback("");
    // Load the home's Shed, de-duped by plant name.
    supabase.from("inventory_items").select("id, plant_name").eq("home_id", homeId).then(({ data }) => {
      const seen = new Map<string, { id: string; name: string }>();
      for (const r of data ?? []) {
        const n = ((r.plant_name as string) ?? "").trim();
        const k = n.toLowerCase();
        if (n && !seen.has(k)) seen.set(k, { id: r.id as string, name: n });
      }
      setShed([...seen.values()]);
    });
  }, [isOpen, homeId]);

  if (!isOpen) return null;

  const isSelKey = (k: string) => selected.some((s) => keyOfSel(s) === k);
  const removeByKey = (k: string) => setSelected((prev) => prev.filter((s) => keyOfSel(s) !== k));
  const toggleShed = (item: { id: string; name: string }) => {
    const k = selKey(item.name);
    setSelected((prev) => isSelKey(k)
      ? prev.filter((s) => keyOfSel(s) !== k)
      : [...prev, { name: item.name, source: "shed", inventory_item_id: item.id }]);
  };
  const toggleSearch = (sel: PlantSelection) => {
    const k = selKey(sel.common_name, sel.scientific_name);
    setSelected((prev) => isSelKey(k)
      ? prev.filter((s) => keyOfSel(s) !== k)
      : [...prev, { name: sel.common_name, scientific_name: sel.scientific_name ?? null, source: sel.source }]);
  };

  const generate = async (regen = false) => {
    setGenerating(true);
    const toastId = toast.loading(regen ? "Regenerating your plan…" : "Designing your plan…");
    try {
      const { data, error } = await supabase.functions.invoke("generate-plant-first-plan", {
        body: {
          homeId,
          plants: selected.map((s) => ({
            name: s.name, scientific_name: s.scientific_name ?? null, source: s.source, inventory_item_id: s.inventory_item_id ?? null,
          })),
          notes,
          areaMode,
          ...(regen ? { isRegeneration: true, feedback: regenFeedback, previousBlueprint: blueprint } : {}),
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setBlueprint(data.blueprint);
      setCoverUrl(data.cover_image_url ?? null);
      setShowRegen(false); setRegenFeedback(""); setStep(3);
      toast.success(regen ? "Plan updated!" : "Plan ready!", { id: toastId });
    } catch (err: any) {
      Logger.error("plant-first generate failed", err, {});
      toast.error(err?.message || "Couldn't generate the plan.", { id: toastId });
    } finally {
      setGenerating(false);
    }
  };

  const create = async () => {
    if (!blueprint) return;
    setCreating(true);
    const toastId = toast.loading("Saving your plan…");
    try {
      const { data: newPlan, error } = await supabase.from("plans").insert({
        home_id: homeId,
        name: planName.trim() || blueprint.project_overview.title,
        description: blueprint.project_overview.summary,
        status: "Draft",
        kind: "plant-first",
        ai_blueprint: blueprint,
        cover_image_url: coverUrl,
      }).select("*").single();
      if (error) throw error;
      toast.success("Plan created!", { id: toastId });
      onCreated(newPlan);
    } catch (err: any) {
      Logger.error("plant-first create failed", err, {});
      toast.error(err?.message || "Couldn't save the plan.", { id: toastId });
    } finally {
      setCreating(false);
    }
  };

  const inputCls = "w-full text-sm font-medium text-rhozly-on-surface bg-white rounded-xl px-3 py-2.5 border border-rhozly-outline/20 outline-none focus:ring-2 focus:ring-rhozly-primary/30";

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-rhozly-bg flex flex-col animate-in fade-in duration-200" data-testid="plant-first-form">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-rhozly-outline/10 shrink-0">
        <div className="flex items-center gap-2">
          {step > 1 && (
            <button onClick={() => setStep(step - 1)} className="p-1.5 rounded-lg hover:bg-rhozly-surface" aria-label="Back">
              <ArrowLeft size={18} />
            </button>
          )}
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-primary">Plan around my plants</p>
            <h2 className="text-base font-black text-rhozly-on-surface">
              {step === 1 ? "Pick your plants" : step === 2 ? "Your plan" : "Review"}
            </h2>
          </div>
        </div>
        <button onClick={onClose} className="p-2 rounded-xl hover:bg-rhozly-surface" aria-label="Close" data-testid="plant-first-close">
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {/* STEP 1 — pick plants */}
        {step === 1 && (
          <div className="space-y-5 max-w-2xl mx-auto">
            {selected.length > 0 && (
              <div className="flex flex-wrap gap-1.5" data-testid="plant-first-selected">
                {selected.map((s) => (
                  <span key={keyOfSel(s)} className="flex items-center gap-1 bg-rhozly-primary/10 text-rhozly-primary text-xs font-black px-2.5 py-1 rounded-full">
                    {s.name}
                    {s.scientific_name && <span className="font-medium italic opacity-60">· {s.scientific_name}</span>}
                    <button onClick={() => removeByKey(keyOfSel(s))} aria-label={`Remove ${s.name}`}><X size={11} /></button>
                  </span>
                ))}
              </div>
            )}
            {shed.length > 0 && (
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-2">From your Shed</p>
                <div className="flex flex-wrap gap-1.5">
                  {shed.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => toggleShed(item)}
                      data-testid="plant-first-shed-item"
                      className={`flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-xl border transition-colors ${isSelKey(selKey(item.name)) ? "bg-rhozly-primary text-white border-rhozly-primary" : "bg-white border-rhozly-outline/20 text-rhozly-on-surface/70 hover:border-rhozly-primary/40"}`}
                    >
                      {isSelKey(selKey(item.name)) && <Check size={12} />} {item.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-2">Search for plants</p>
              <PlantSearch
                homeId={homeId}
                gates={gates}
                multiSelect
                isSelected={(sel) => isSelKey(selKey(sel.common_name, sel.scientific_name))}
                onSelect={toggleSearch}
                allowPreview
                onViewDetails={(sel) => setDetailResult(selectionToProviderResult(sel))}
                placeholder="Search library, databases or AI…"
              />
            </div>
          </div>
        )}

        {/* STEP 2 — name + notes + area mode */}
        {step === 2 && (
          <div className="space-y-5 max-w-xl mx-auto">
            <div>
              <label className="text-xs font-black text-rhozly-on-surface/60 block mb-1.5">Plan name (optional)</label>
              <input value={planName} onChange={(e) => setPlanName(e.target.value)} placeholder="e.g. Summer veg patch" className={inputCls} data-testid="plant-first-name" />
            </div>
            <div>
              <label className="text-xs font-black text-rhozly-on-surface/60 block mb-1.5">Anything to keep in mind? (optional)</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. a sunny patio and a shady corner; low maintenance" rows={3} className={inputCls} data-testid="plant-first-notes" />
            </div>
            <div>
              <p className="text-xs font-black text-rhozly-on-surface/60 mb-2">How should we handle areas?</p>
              <div className="space-y-2">
                {AREA_MODES.map((m) => (
                  <button
                    key={m.value}
                    onClick={() => setAreaMode(m.value)}
                    data-testid={`plant-first-areamode-${m.value}`}
                    className={`w-full text-left p-3 rounded-2xl border-2 transition-colors ${areaMode === m.value ? "border-rhozly-primary bg-rhozly-primary/5" : "border-rhozly-outline/15 bg-white hover:border-rhozly-primary/40"}`}
                  >
                    <p className="text-sm font-black text-rhozly-on-surface">{m.label}</p>
                    <p className="text-xs font-medium text-rhozly-on-surface/55">{m.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* STEP 3 — review + regenerate */}
        {step === 3 && blueprint && (
          <div className="space-y-4 max-w-2xl mx-auto">
            <div className="bg-rhozly-primary/5 rounded-2xl p-4">
              <h3 className="text-lg font-black text-rhozly-on-surface">{blueprint.project_overview.title}</h3>
              <p className="text-sm font-medium text-rhozly-on-surface/60">{blueprint.project_overview.summary}</p>
            </div>
            {blueprint.areas.map((area, ai) => (
              <div key={ai} className="bg-white border border-rhozly-outline/15 rounded-2xl p-4" data-testid="plant-first-review-area">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-black text-rhozly-on-surface">{area.area_name}</h4>
                  <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ${area.is_new ? "bg-blue-100 text-blue-700" : "bg-rhozly-surface-low text-rhozly-on-surface/50"}`}>
                    {area.is_new ? "New" : "Existing"}
                  </span>
                </div>
                {area.pairing_summary && <p className="text-xs text-rhozly-on-surface/65 mb-2 leading-snug">{area.pairing_summary}</p>}
                {area.plants.map((p, pi) => (
                  <p key={pi} className="text-sm text-rhozly-on-surface/80 leading-snug">
                    <span className="font-black">{p.common_name}</span> ×{p.quantity}
                    {p.companion_note && <span className="text-rhozly-on-surface/50"> — {p.companion_note}</span>}
                  </p>
                ))}
                {area.maintenance_tasks.length > 0 && (
                  <p className="text-[11px] text-rhozly-on-surface/45 mt-2">
                    Maintenance: {area.maintenance_tasks.map((t) => `${t.title} (every ${t.frequency_days}d)`).join(", ")}
                  </p>
                )}
              </div>
            ))}

            {!showRegen ? (
              <button onClick={() => setShowRegen(true)} className="flex items-center gap-1.5 text-xs font-black text-rhozly-primary" data-testid="plant-first-regen-open">
                <RefreshCw size={13} /> Not quite right? Regenerate with feedback
              </button>
            ) : (
              <div className="bg-rhozly-surface-low rounded-2xl p-3 space-y-2">
                <textarea value={regenFeedback} onChange={(e) => setRegenFeedback(e.target.value)} placeholder="What would you change? e.g. too many in one bed, keep the herbs together" rows={2} className={inputCls} data-testid="plant-first-regen-feedback" />
                <div className="flex items-center gap-2">
                  <button disabled={generating || !regenFeedback.trim()} onClick={() => generate(true)} className="flex items-center gap-1.5 text-xs font-black bg-rhozly-primary text-white px-3 py-2 rounded-xl disabled:opacity-50" data-testid="plant-first-regenerate">
                    {generating ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Regenerate
                  </button>
                  <button onClick={() => setShowRegen(false)} className="text-xs font-black text-rhozly-on-surface/50 px-3 py-2">Cancel</button>
                </div>
                <p className="text-[10px] text-rhozly-on-surface/40">Your feedback also tunes future plans.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-rhozly-outline/10 p-4 shrink-0">
        <div className="max-w-2xl mx-auto">
          {step === 1 && (
            <button disabled={selected.length === 0} onClick={() => setStep(2)} className="w-full bg-rhozly-primary text-white font-black text-sm py-3.5 rounded-2xl disabled:opacity-50" data-testid="plant-first-continue">
              Continue{selected.length > 0 ? ` (${selected.length})` : ""}
            </button>
          )}
          {step === 2 && (
            <button disabled={generating} onClick={() => generate(false)} className="w-full flex items-center justify-center gap-2 bg-rhozly-primary text-white font-black text-sm py-3.5 rounded-2xl disabled:opacity-60" data-testid="plant-first-generate">
              {generating ? <Loader2 size={16} className="animate-spin" /> : <Sprout size={16} />}
              {generating ? "Designing…" : "Generate my plan"}
            </button>
          )}
          {step === 3 && (
            <button disabled={creating} onClick={create} className="w-full flex items-center justify-center gap-2 bg-rhozly-primary text-white font-black text-sm py-3.5 rounded-2xl disabled:opacity-60" data-testid="plant-first-create">
              {creating ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              {creating ? "Saving…" : "Create plan"}
            </button>
          )}
        </div>
      </div>

      {detailResult && (
        <PlantDetailModal
          result={detailResult}
          homeId={homeId}
          aiEnabled={gates.canCreateWithAI}
          isPremium={gates.canCreateWithAI}
          onClose={() => setDetailResult(null)}
        />
      )}
    </div>,
    document.body,
  );
}
