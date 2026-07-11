// Garden Brain — shared apply/dismiss for care_adjustments.
//
// ONE implementation used by BOTH surfaces that can act on a proposal
// (AdaptiveCareCard and the Daily Brief's inline Apply), so the two can never
// drift. Apply semantics:
//   tighten/stretch          → update the blueprint's frequency_days
//   create_watering_routine  → blueprint + first task + generateBlueprintTasks
//                              (AddTaskModal's recurring flow verbatim)
//   stress_risk              → acknowledge only (no mutation)
// then status='applied' (+applied_by/at) and a logEvent. Dismiss → 'dismissed'
// (the reconciler's 14-day cooldown keys off it).

import { supabase } from "./supabase";
import { Logger } from "./errorHandler";
import { BlueprintService } from "../services/blueprintService";
import { getLocalDateString } from "./dateUtils";
import { logEvent, EVENT } from "../events/registry";

export interface CareAdjustmentRow {
  id: string;
  area_id: string | null;
  blueprint_id: string | null;
  kind: string;
  suggested_frequency_days: number | null;
  evidence: Record<string, unknown> & { headline?: string };
}

export interface ApplyResult {
  ok: boolean;
  /** Gardener-facing toast copy (success) or error hint. */
  message: string;
}

export async function applyCareAdjustment(
  adj: CareAdjustmentRow,
  opts: { homeId: string; currentUserId: string | null },
): Promise<ApplyResult> {
  const { homeId, currentUserId } = opts;

  // Atomically CLAIM the proposal (CAS proposed→applied) BEFORE any side-effect.
  // Apply is reachable from BOTH the dashboard card and the Daily Brief's inline
  // button on the same screen; without this, tapping both (or two members acting
  // at once) ran the create-routine mutation twice → duplicate blueprints + tasks
  // (bug-audit-2026-07-10 #7). Only the caller whose update matches status
  // 'proposed' claims the row; everyone else gets 0 rows and bails.
  const { data: claimed, error: claimErr } = await supabase
    .from("care_adjustments")
    .update({ status: "applied", applied_at: new Date().toISOString(), applied_by: currentUserId })
    .eq("id", adj.id)
    .eq("status", "proposed")
    .select("id");
  if (claimErr) {
    Logger.error("Adaptive care claim failed", claimErr, { id: adj.id });
    return { ok: false, message: "Couldn't apply that change." };
  }
  if (!claimed || claimed.length === 0) {
    return { ok: false, message: "That suggestion has already been handled." };
  }

  try {
    if ((adj.kind === "tighten_watering" || adj.kind === "stretch_watering") && adj.blueprint_id && adj.suggested_frequency_days) {
      const { error } = await supabase
        .from("task_blueprints")
        .update({ frequency_days: adj.suggested_frequency_days })
        .eq("id", adj.blueprint_id);
      if (error) throw error;
    } else if (adj.kind === "create_watering_routine" && adj.area_id && adj.suggested_frequency_days) {
      const todayStr = getLocalDateString(new Date());
      const { data: areaRow } = await supabase.from("areas").select("name, location_id").eq("id", adj.area_id).maybeSingle();
      const { data: planted } = await supabase
        .from("inventory_items").select("id").eq("home_id", homeId).eq("status", "Planted").eq("area_id", adj.area_id);
      const { data: blueprint, error: bpError } = await supabase
        .from("task_blueprints")
        .insert([{
          home_id: homeId,
          title: `Watering — ${areaRow?.name ?? "area"}`,
          description: "Created from Rhozly's soil-sensor analysis (Garden Brain).",
          task_type: "Watering",
          location_id: areaRow?.location_id ?? null,
          area_id: adj.area_id,
          inventory_item_ids: (planted ?? []).map((p) => p.id),
          frequency_days: adj.suggested_frequency_days,
          is_recurring: true,
          start_date: todayStr,
          scope: "home",
          created_by: currentUserId,
        }])
        .select()
        .single();
      if (bpError) throw bpError;
      const { error: tError } = await supabase.from("tasks").insert([{
        home_id: homeId,
        blueprint_id: blueprint.id,
        title: blueprint.title,
        description: blueprint.description,
        type: "Watering",
        due_date: todayStr,
        location_id: areaRow?.location_id ?? null,
        area_id: adj.area_id,
        inventory_item_ids: (planted ?? []).map((p) => p.id),
        status: "Pending",
        scope: "home",
        created_by: currentUserId,
      }]);
      if (tError) throw tError;
      // Fire-and-forget generation of the recurring horizon; the blueprint +
      // first task already exist, so a failure just defers to the daily cron.
      // `.catch` prevents an unhandled rejection escaping the claimed state.
      void BlueprintService.generateBlueprintTasks(blueprint.id, todayStr)
        ?.catch?.((e: unknown) => Logger.error("generateBlueprintTasks failed", e, { id: adj.id }));
    }
    // stress_risk: acknowledge only — the claim above already set 'applied'.

    // The claim already flipped status→applied; nothing more to write here.
    logEvent(EVENT.CARE_ADJUSTMENT_APPLIED, { kind: adj.kind, area_id: adj.area_id, suggested: adj.suggested_frequency_days });
    return {
      ok: true,
      message:
        adj.kind === "create_watering_routine"
          ? "Routine created — we'll check back in a week and show you the result."
          : adj.kind === "stress_risk"
            ? "Noted — keep an eye on that bed this week."
            : "Schedule updated — we'll verify it against the sensor and report back.",
    };
  } catch (err) {
    // The side-effect failed AFTER we claimed the row — revert to 'proposed' so
    // the suggestion isn't lost (marked applied with nothing applied).
    await supabase
      .from("care_adjustments")
      .update({ status: "proposed", applied_at: null, applied_by: null })
      .eq("id", adj.id);
    Logger.error("Adaptive care apply failed", err, { id: adj.id });
    return { ok: false, message: "Couldn't apply that change." };
  }
}

export async function dismissCareAdjustment(
  adj: Pick<CareAdjustmentRow, "id" | "kind" | "area_id">,
): Promise<ApplyResult> {
  try {
    // Stamp WHEN it was dismissed so the reconciler's 14-day cooldown keys off
    // the dismissal moment, not created_at (bug-audit-2026-07-10 #19).
    const { error } = await supabase
      .from("care_adjustments")
      .update({ status: "dismissed", dismissed_at: new Date().toISOString() })
      .eq("id", adj.id);
    if (error) throw error;
    logEvent(EVENT.CARE_ADJUSTMENT_DISMISSED, { kind: adj.kind, area_id: adj.area_id });
    return { ok: true, message: "Dismissed — we won't suggest this again for a couple of weeks." };
  } catch (err) {
    Logger.error("Adaptive care dismiss failed", err, { id: adj.id });
    return { ok: false, message: "Couldn't dismiss that." };
  }
}

/** Fetch a single open adjustment by id (the brief carries only the id). */
export async function fetchCareAdjustment(id: string): Promise<CareAdjustmentRow | null> {
  const { data } = await supabase
    .from("care_adjustments")
    .select("id, area_id, blueprint_id, kind, suggested_frequency_days, evidence, status")
    .eq("id", id)
    .maybeSingle();
  if (!data || (data as { status?: string }).status !== "proposed") return null;
  return data as CareAdjustmentRow;
}
