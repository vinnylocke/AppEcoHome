import React, { useState } from "react";
import { toast } from "react-hot-toast";
import { Sprout, Sun, Layers, CalendarClock, Wrench, Loader2, CheckCircle2, MapPin } from "lucide-react";
import type { PlantFirstBlueprint } from "../../lib/plantFirstPlan";
import { countBlueprintPlants } from "../../lib/plantFirstPlan";
import { executePlantFirstPlan } from "../../services/plantFirstExecution";
import { Logger } from "../../lib/errorHandler";

interface Props {
  plan: {
    id: string;
    name: string;
    status: string;
    cover_image_url?: string | null;
    ai_blueprint: PlantFirstBlueprint;
  };
  homeId: string;
  onBack: () => void;
}

/**
 * Read-only view for a `kind='plant-first'` plan: the AI's multi-area layout
 * (which plants group together + why, with prep + maintenance tasks). A single
 * "Set up my garden" action materialises it (areas + Shed + tasks).
 */
export default function PlantFirstPlanView({ plan, homeId, onBack }: Props) {
  const bp = plan.ai_blueprint;
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(plan.status === "In Progress" || plan.status === "Completed");

  const handleSetup = async () => {
    setBusy(true);
    const toastId = toast.loading("Setting up your garden…");
    try {
      const res = await executePlantFirstPlan({ homeId, planId: plan.id, blueprint: bp });
      toast.success(
        `Set up: ${res.areasCreated} new area(s), ${res.plantsAdded} plant(s) to your Shed, ${res.maintenanceBlueprintsAdded} care task(s).`,
        { id: toastId, duration: 4000 },
      );
      setDone(true);
    } catch (err) {
      Logger.error("Plant-first plan setup failed", err, { planId: plan.id });
      toast.error("Couldn't set up the plan. Please try again.", { id: toastId });
    } finally {
      setBusy(false);
    }
  };

  if (!bp?.areas?.length) {
    return (
      <div className="p-6 text-center text-sm font-bold text-rhozly-on-surface/40">
        This plan has no areas yet.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-8 pb-32" data-testid="plant-first-plan-view">
      {plan.cover_image_url && (
        <img src={plan.cover_image_url} alt="" className="w-full h-44 md:h-60 object-cover rounded-3xl mb-5 shadow-inner" />
      )}

      <div className="flex items-start gap-2 mb-1">
        <Sprout className="text-rhozly-primary shrink-0 mt-1" size={20} />
        <h1 className="text-2xl md:text-3xl font-black text-rhozly-on-surface leading-tight">{bp.project_overview.title}</h1>
      </div>
      <p className="text-sm font-bold text-rhozly-on-surface/55 leading-relaxed mb-4">{bp.project_overview.summary}</p>

      <div className="flex flex-wrap gap-2 mb-6 text-[10px] font-black uppercase tracking-widest">
        <span className="flex items-center gap-1 bg-rhozly-primary/10 text-rhozly-primary px-2.5 py-1 rounded-full"><Layers size={11} /> {bp.areas.length} area{bp.areas.length === 1 ? "" : "s"}</span>
        <span className="flex items-center gap-1 bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full"><Sprout size={11} /> {countBlueprintPlants(bp)} plants</span>
        <span className="flex items-center gap-1 bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full">{bp.project_overview.estimated_difficulty}</span>
      </div>

      <div className="space-y-4">
        {bp.areas.map((area, ai) => (
          <div key={ai} className="bg-white border border-rhozly-outline/15 rounded-2xl p-4 shadow-sm" data-testid="plant-first-area-card">
            <div className="flex items-center gap-2 mb-1">
              <MapPin size={15} className="text-rhozly-primary shrink-0" />
              <h2 className="text-base font-black text-rhozly-on-surface">{area.area_name}</h2>
              <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ${area.is_new ? "bg-blue-100 text-blue-700" : "bg-rhozly-surface-low text-rhozly-on-surface/50"}`}>
                {area.is_new ? "New" : "Existing"}
              </span>
            </div>
            {(area.suggested_sunlight || area.suggested_medium) && (
              <p className="flex items-center gap-1.5 text-[11px] font-bold text-rhozly-on-surface/45 mb-2">
                <Sun size={11} /> {[area.suggested_sunlight, area.suggested_medium].filter(Boolean).join(" · ")}
              </p>
            )}
            {area.pairing_summary && (
              <p className="text-xs font-medium text-rhozly-on-surface/70 leading-snug mb-3 bg-rhozly-primary/5 border-l-4 border-rhozly-primary/30 rounded-r-lg px-3 py-2">
                {area.pairing_summary}
              </p>
            )}

            <div className="space-y-1.5 mb-3">
              {area.plants.map((p, pi) => (
                <div key={pi} className="flex items-start gap-2">
                  <Sprout size={13} className="text-emerald-600 shrink-0 mt-0.5" />
                  <p className="text-sm text-rhozly-on-surface/85 leading-snug">
                    <span className="font-black">{p.common_name}</span>
                    <span className="font-bold text-rhozly-on-surface/40"> ×{p.quantity} · {p.role}</span>
                    {p.companion_note && <span className="block text-[11px] font-medium text-rhozly-on-surface/55">{p.companion_note}</span>}
                  </p>
                </div>
              ))}
            </div>

            {area.maintenance_tasks.length > 0 && (
              <div className="pt-2 border-t border-rhozly-outline/10">
                <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-1.5"><Wrench size={11} /> Maintenance</p>
                {area.maintenance_tasks.map((t, ti) => (
                  <p key={ti} className="flex items-center gap-1.5 text-xs font-medium text-rhozly-on-surface/70">
                    <CalendarClock size={11} className="text-rhozly-on-surface/30" /> {t.title} — every {t.frequency_days}d
                  </p>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Set up action */}
      <div className="mt-6">
        {done ? (
          <div className="flex items-center justify-center gap-2 text-sm font-black text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-2xl py-3.5" data-testid="plant-first-setup-done">
            <CheckCircle2 size={16} /> Set up in your garden
          </div>
        ) : (
          <button
            data-testid="plant-first-setup"
            onClick={handleSetup}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 bg-rhozly-primary text-white font-black text-sm py-3.5 rounded-2xl hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Sprout size={16} />}
            {busy ? "Setting up…" : "Set up my garden from this plan"}
          </button>
        )}
        <p className="text-[11px] font-medium text-rhozly-on-surface/40 text-center mt-2 leading-snug">
          Creates any new areas, adds these plants to your Shed, and schedules the prep + maintenance tasks.
        </p>
      </div>
    </div>
  );
}
