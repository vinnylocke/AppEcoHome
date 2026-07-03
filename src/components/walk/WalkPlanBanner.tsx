import React, { useState } from "react";
import { CheckCircle2, ClipboardList, ExternalLink, Loader2, Wrench } from "lucide-react";
import toast from "react-hot-toast";
import { supabase } from "../../lib/supabase";
import { Logger } from "../../lib/errorHandler";
import { logEvent, EVENT } from "../../events/registry";
import { saveMemoryEvent } from "../../lib/plannerMemory";
import { activateMaintenanceBlueprints } from "../../services/planStagingService";
import { normaliseOverhaulBlueprint } from "../../lib/overhaulBlueprintAdapter";
import { usePersona } from "../../hooks/usePersona";
import type { WalkPlanDigest } from "../../lib/gardenWalk";

// RHO-17 Phase 3 (approved answer 3) — In-Progress plans woven into the
// walk, ACTIONABLE rather than read-only:
//
//   • The plan's own open tasks already render as WalkTaskRow rows on
//     their steps (they carry area_id / plan_id), so per-step completion
//     rides the shared src/lib/taskActions.ts path — nothing new here.
//   • The ONE staging mutation that lifts cleanly out of PlanStaging is
//     Phase 5 "Activate maintenance": it is a pure service call
//     (planStagingService.activateMaintenanceBlueprints) + a
//     staging_state merge, with no picker UI. The banner exposes it when
//     phase 5 is the current phase, mirroring
//     PlanStaging.handleActivateMaintenance write-for-write (blueprints
//     insert → plans.status='Completed' → staging_state.maintenance_active
//     → PLAN_COMPLETED event → planner memory).
//   • Phases 1–3 need the full staging UI (area pickers, plant mapping,
//     procurement) and phase 4 can't be current on an In-Progress plan
//     (status In Progress ⇒ phase 4 done) — those deep-link out via
//     "Open plan" instead of being re-implemented here.

interface Props {
  homeId: string;
  plan: WalkPlanDigest;
  variant: "home" | "area";
  /** The area step's location id — needed by activateMaintenanceBlueprints. */
  areaLocationId?: string | null;
  /** Navigate to the Planner ("Open plan"). */
  onOpenPlanner: () => void;
}

export default function WalkPlanBanner({
  homeId,
  plan,
  variant,
  areaLocationId,
  onOpenPlanner,
}: Props) {
  const persona = usePersona();
  const isNew = persona !== "experienced";
  const [activating, setActivating] = useState(false);
  const [activated, setActivated] = useState(false);

  const phaseLine =
    plan.phase !== null
      ? `Phase ${plan.phase} of 5 · ${plan.phaseLabel}`
      : plan.kind === "plant-first"
      ? "Plant-first plan"
      : "All phases complete";

  // Mirrors PlanStaging.handleActivateMaintenance — reuse, never
  // reimplement. The blueprint is fetched lazily (it's heavy jsonb the
  // route deliberately doesn't carry).
  const handleActivateMaintenance = async () => {
    if (activating || !plan.linkedAreaId) return;
    setActivating(true);
    const toastId = toast.loading("Activating recurring blueprints...");
    try {
      const { data, error } = await supabase
        .from("plans")
        .select("ai_blueprint, staging_state, kind")
        .eq("id", plan.id)
        .single();
      if (error) throw error;

      const blueprint =
        data?.kind === "overhaul"
          ? normaliseOverhaulBlueprint(data.ai_blueprint)
          : data?.ai_blueprint;

      await activateMaintenanceBlueprints({
        homeId,
        planId: plan.id,
        areaId: plan.linkedAreaId,
        locationId: areaLocationId ?? undefined,
        maintenanceTasks: blueprint?.custom_maintenance_tasks ?? [],
      });

      // Same staging_state merge PlanStaging.saveStagingState performs.
      const mergedState = {
        ...(data?.staging_state ?? {}),
        maintenance_active: true,
      };
      const { error: stateError } = await supabase
        .from("plans")
        .update({ staging_state: mergedState })
        .eq("id", plan.id);
      if (stateError) throw stateError;

      logEvent(EVENT.PLAN_COMPLETED, { plan_id: plan.id, plan_name: plan.name });
      saveMemoryEvent(homeId, plan.id, "completed_plan", {
        blueprint_title: blueprint?.project_overview?.title,
      });

      setActivated(true);
      toast.success("Project complete! Maintenance automated.", { id: toastId });
    } catch (err: unknown) {
      Logger.error("WalkPlanBanner activate maintenance failed", err, {
        homeId,
        planId: plan.id,
      });
      toast.error("Couldn't activate maintenance — try again.", { id: toastId });
    } finally {
      setActivating(false);
    }
  };

  return (
    <div
      data-testid={`walk-plan-banner-${plan.id}`}
      data-variant={variant}
      className="rounded-2xl bg-white border border-rhozly-primary/20 p-3"
    >
      <div className="flex items-start gap-2">
        <span className="shrink-0 w-8 h-8 rounded-xl bg-rhozly-primary/10 text-rhozly-primary flex items-center justify-center">
          <ClipboardList size={15} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-rhozly-on-surface leading-snug truncate">
            {variant === "area" ? `Part of ${plan.name}` : plan.name}
          </p>
          <p
            data-testid={`walk-plan-phase-${plan.id}`}
            className="text-[10px] font-black uppercase tracking-widest text-rhozly-primary/80 mt-0.5"
          >
            {phaseLine}
          </p>
          {!activated && (
            <p className="text-[11px] font-bold text-rhozly-on-surface/50 leading-snug mt-0.5">
              {plan.openTaskCount > 0
                ? `${plan.nextAction} · ${plan.openTaskCount} of its ${
                    plan.openTaskCount === 1 ? "task is" : "tasks are"
                  } on today's walk`
                : plan.nextAction}
            </p>
          )}
          {activated && (
            <p
              data-testid={`walk-plan-completed-${plan.id}`}
              className="text-[11px] font-bold text-emerald-700 leading-snug mt-0.5 inline-flex items-center gap-1"
            >
              <CheckCircle2 size={12} />
              Project complete — maintenance automated.
            </p>
          )}
        </div>
      </div>

      {variant === "area" && (
        <div className="mt-2 flex items-center gap-2">
          {plan.canActivateMaintenance && !activated && (
            <button
              type="button"
              data-testid={`walk-plan-activate-${plan.id}`}
              onClick={() => void handleActivateMaintenance()}
              disabled={activating}
              className="flex-1 min-h-[40px] rounded-xl bg-rhozly-primary text-white text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {activating ? (
                <Loader2 className="animate-spin" size={13} />
              ) : (
                <Wrench size={13} />
              )}
              Activate maintenance
            </button>
          )}
          <button
            type="button"
            data-testid={`walk-plan-open-${plan.id}`}
            onClick={onOpenPlanner}
            className="flex-1 min-h-[40px] rounded-xl bg-white border border-rhozly-outline/15 text-rhozly-on-surface/70 text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 hover:border-rhozly-primary/30"
          >
            <ExternalLink size={13} />
            Open plan
          </button>
        </div>
      )}
      {variant === "area" && isNew && plan.openTaskCount > 0 && !activated && (
        <p
          data-testid={`walk-plan-guidance-${plan.id}`}
          className="mt-2 text-[11px] font-bold text-rhozly-on-surface/45 leading-snug"
        >
          The plan's tasks appear in the list below — ticking them off here
          moves the project forward, same as from the Planner.
        </p>
      )}
    </div>
  );
}
