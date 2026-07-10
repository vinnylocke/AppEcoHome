// Garden Brain Phase 1 — nightly adaptive-care reconcile.
//
// Runs daily at 03:45 (30–45 min after compute-soil-profiles) or on-demand
// with { homeId }. Per eligible home (owner tier sage/evergreen), per area
// with a soil profile: evaluate the pure adaptiveCare rules, then
//   • upsert proposals (refresh open ones, supersede stale ones),
//   • verify applied adjustments ≥7 days old against post-change readings,
//   • send ONE notification per home when a NEW actionable proposal appears
//     (tighten / stress_risk / create_watering_routine — never stretch or
//     in_range), honouring the `adaptiveCare` notification pref.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { log, warn, error as logError } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import { shouldNotify, type NotificationPrefs } from "../_shared/notificationPrefs.ts";
import {
  evaluateArea,
  verifyAdjustment,
  targetBand,
  type AreaInput,
  type CareProposal,
  type MoistureReading,
  type SoilProfileRow,
} from "../_shared/adaptiveCare.ts";

const FN = "garden-brain-reconcile";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ACTIONABLE = new Set(["tighten_watering", "stress_risk", "create_watering_routine"]);
const ELIGIBLE_TIERS = new Set(["sage", "evergreen"]);

function readingsFromRows(rows: Array<{ recorded_at: string; data: Record<string, unknown> }>): MoistureReading[] {
  return rows
    .filter((r) => typeof r.data?.soil_moisture === "number")
    .map((r) => ({ recorded_at: r.recorded_at, soil_moisture: r.data.soil_moisture as number }));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const body = await req.json().catch(() => ({}));
    const onlyHomeId: string | null = body?.homeId ?? null;
    const todayIso = new Date().toISOString();
    const sinceIso = new Date(Date.now() - 14 * 86_400_000).toISOString();

    // ── Eligible homes: those with soil profiles (area-mapped). ──────────────
    let profQ = db
      .from("soil_moisture_profiles")
      .select("device_id, home_id, area_id, drydown_rate_pct_per_day, retention_class, drydown_by_weather, watering_response, sample_segments, confidence")
      .not("area_id", "is", null);
    if (onlyHomeId) profQ = profQ.eq("home_id", onlyHomeId);
    const { data: profiles, error: profErr } = await profQ;
    if (profErr) throw profErr;
    const byHome = new Map<string, SoilProfileRow[] & { home_id?: string }>();
    for (const p of (profiles ?? []) as Array<SoilProfileRow & { home_id: string }>) {
      const arr = byHome.get(p.home_id) ?? [];
      arr.push(p);
      byHome.set(p.home_id, arr as SoilProfileRow[]);
    }

    let homesProcessed = 0, proposalsUpserted = 0, superseded = 0, verified = 0, notified = 0;

    for (const [homeId, homeProfiles] of byHome) {
      // ── Tier gate: home owner's subscription tier. ──────────────────────────
      const { data: owner } = await db
        .from("home_members").select("user_id").eq("home_id", homeId).eq("role", "owner").limit(1).maybeSingle();
      if (!owner) continue;
      const { data: ownerProfile } = await db
        .from("user_profiles").select("subscription_tier").eq("uid", owner.user_id).maybeSingle();
      if (!ELIGIBLE_TIERS.has(ownerProfile?.subscription_tier ?? "")) continue;
      homesProcessed += 1;

      const areaIds = [...new Set(homeProfiles.map((p) => p.area_id).filter(Boolean))] as string[];

      const [
        { data: areas },
        { data: instances },
        { data: blueprints },
        { data: valveActions },
        { data: recentAdj },
        { data: snapshot },
      ] = await Promise.all([
        db.from("areas").select("id, name").in("id", areaIds),
        db.from("inventory_items").select("id, area_id, plant_id, plants(soil_moisture_min, soil_moisture_max)")
          .eq("home_id", homeId).eq("status", "Planted").in("area_id", areaIds),
        db.from("task_blueprints").select("id, area_id, frequency_days, paused_until")
          .eq("home_id", homeId).eq("task_type", "Watering").eq("is_recurring", true).eq("is_archived", false)
          .in("area_id", areaIds),
        // Valve coverage: active automations with a valve_open action on a device in these areas.
        db.from("automation_actions")
          .select("action_kind, target_device_id, devices!inner(area_id), automations!inner(is_active)")
          .eq("action_kind", "valve_open")
          .eq("automations.is_active", true)
          .in("devices.area_id", areaIds),
        db.from("care_adjustments").select("id, area_id, kind, status, created_at, applied_at, evidence, blueprint_id")
          .eq("home_id", homeId)
          .gte("created_at", new Date(Date.now() - 45 * 86_400_000).toISOString()),
        db.from("weather_snapshots").select("data").eq("home_id", homeId).maybeSingle(),
      ]);

      const areaName = new Map((areas ?? []).map((a: { id: string; name: string | null }) => [a.id, a.name ?? "area"]));
      const rawDaily = snapshot?.data?.daily ?? {};
      const todayStr = todayIso.split("T")[0];
      const forecastMaxC: number[] = ((rawDaily.time ?? []) as string[])
        .map((d: string, i: number) => ({ d, t: rawDaily.temperature_2m_max?.[i] ?? 15 }))
        .filter((x) => x.d >= todayStr).slice(0, 7).map((x) => x.t);

      const automationAreaIds = new Set(
        ((valveActions ?? []) as Array<{ devices: { area_id: string | null } }>)
          .map((v) => v.devices?.area_id).filter(Boolean) as string[],
      );

      const newActionables: CareProposal[] = [];

      for (const profile of homeProfiles) {
        const areaId = profile.area_id!;
        const { data: readingRows } = await db
          .from("device_readings").select("recorded_at, data")
          .eq("device_id", profile.device_id).gte("recorded_at", sinceIso)
          .order("recorded_at", { ascending: true });

        const areaInstances = (instances ?? []).filter((i: { area_id: string | null }) => i.area_id === areaId);
        if (areaInstances.length === 0) continue; // no planted plants — nothing to care for

        const bp = (blueprints ?? []).find((b: { area_id: string | null; paused_until: string | null }) =>
          b.area_id === areaId && (!b.paused_until || String(b.paused_until).split("T")[0] <= todayStr));

        const input: AreaInput = {
          areaId,
          areaName: areaName.get(areaId) ?? "area",
          profile,
          readings: readingsFromRows((readingRows ?? []) as Array<{ recorded_at: string; data: Record<string, unknown> }>),
          plantRanges: areaInstances.map((i: { plants?: { soil_moisture_min: number | null; soil_moisture_max: number | null } | null }) => ({
            soil_moisture_min: i.plants?.soil_moisture_min ?? null,
            soil_moisture_max: i.plants?.soil_moisture_max ?? null,
          })),
          coverage: {
            blueprint: bp ? { id: bp.id, frequency_days: bp.frequency_days } : null,
            hasWateringAutomation: automationAreaIds.has(areaId),
          },
          recent: ((recentAdj ?? []) as Array<{ area_id: string | null; kind: string; status: string; created_at: string }>)
            .filter((r) => r.area_id === areaId),
          forecastMaxC,
        };

        const proposals = evaluateArea(input, todayIso);
        const emittedKinds = new Set(proposals.map((p) => p.kind));

        // Supersede open proposals this run no longer supports.
        const openForArea = ((recentAdj ?? []) as Array<{ id: string; area_id: string | null; kind: string; status: string }>)
          .filter((r) => r.area_id === areaId && r.status === "proposed" && !emittedKinds.has(r.kind as CareProposal["kind"]));
        for (const stale of openForArea) {
          const { error } = await db.from("care_adjustments").update({ status: "superseded" }).eq("id", stale.id);
          if (!error) superseded += 1;
        }

        for (const p of proposals) {
          const existing = ((recentAdj ?? []) as Array<{ id: string; area_id: string | null; kind: string; status: string }>)
            .find((r) => r.area_id === areaId && r.kind === p.kind && r.status === "proposed");
          const row = {
            home_id: homeId,
            area_id: p.areaId,
            blueprint_id: p.blueprintId,
            kind: p.kind,
            current_frequency_days: p.currentFrequencyDays,
            suggested_frequency_days: p.suggestedFrequencyDays,
            evidence: { ...p.evidence, headline: p.headline, detail: p.detail },
          };
          if (existing) {
            const { error } = await db.from("care_adjustments").update(row).eq("id", existing.id);
            if (!error) proposalsUpserted += 1;
          } else {
            const { error } = await db.from("care_adjustments").insert(row);
            if (!error) {
              proposalsUpserted += 1;
              if (ACTIONABLE.has(p.kind)) newActionables.push(p);
            } else {
              warn(FN, "proposal_insert_failed", { homeId, kind: p.kind, error: error.message });
            }
          }
        }
      }

      // ── Verification pass: applied ≥7 days ago. ─────────────────────────────
      const applied = ((recentAdj ?? []) as Array<{ id: string; area_id: string | null; kind: string; status: string; applied_at: string | null; evidence: Record<string, unknown> }>)
        .filter((r) => r.status === "applied" && r.applied_at
          && Date.parse(r.applied_at) <= Date.now() - 7 * 86_400_000);
      for (const adj of applied) {
        const profile = homeProfiles.find((p) => p.area_id === adj.area_id);
        if (!profile || !adj.area_id) continue;
        const { data: postRows } = await db
          .from("device_readings").select("recorded_at, data")
          .eq("device_id", profile.device_id).gte("recorded_at", adj.applied_at!)
          .order("recorded_at", { ascending: true });
        const areaInstances = (instances ?? []).filter((i: { area_id: string | null }) => i.area_id === adj.area_id);
        const band = targetBand(areaInstances.map((i: { plants?: { soil_moisture_min: number | null; soil_moisture_max: number | null } | null }) => ({
          soil_moisture_min: i.plants?.soil_moisture_min ?? null,
          soil_moisture_max: i.plants?.soil_moisture_max ?? null,
        })));
        const preStats = (adj.evidence?.stats ?? {}) as { pctTimeBelowFloor?: number };
        const result = verifyAdjustment(
          readingsFromRows((postRows ?? []) as Array<{ recorded_at: string; data: Record<string, unknown> }>),
          band,
          preStats.pctTimeBelowFloor ?? 0,
        );
        if (!result) continue; // not enough post-change data yet
        const { error } = await db.from("care_adjustments").update({
          status: result.verdict,
          verified_at: todayIso,
          verification: result.verification,
        }).eq("id", adj.id);
        if (!error) verified += 1;
      }

      // ── One notification per home for NEW actionable proposals. ─────────────
      if (newActionables.length > 0) {
        const { data: members } = await db.from("home_members").select("user_id").eq("home_id", homeId);
        const memberIds: string[] = (members ?? []).map((m: { user_id: string }) => m.user_id);
        const { data: profilesRows } = memberIds.length
          ? await db.from("user_profiles").select("uid, notification_prefs").in("uid", memberIds)
          : { data: [] };
        const prefsByUid = new Map<string, NotificationPrefs | null>(
          (profilesRows ?? []).map((p: { uid: string; notification_prefs: NotificationPrefs | null }) => [p.uid, p.notification_prefs ?? null]),
        );
        const recipients = memberIds.filter((uid) => shouldNotify(prefsByUid.get(uid), "adaptiveCare"));
        if (recipients.length > 0) {
          const first = newActionables[0];
          const title = "Your garden's watering could be smarter 💧";
          const bodyText = newActionables.length === 1
            ? (first.evidence.headline as string ?? first.headline)
            : `${first.headline} — and ${newActionables.length - 1} more suggestion${newActionables.length > 2 ? "s" : ""}.`;
          const rows = recipients.map((uid) => ({
            home_id: homeId, user_id: uid, type: "adaptive_care",
            title, body: bodyText, data: { route: "/dashboard" }, is_read: false,
          }));
          const { error } = await db.from("notifications").insert(rows);
          if (!error) notified += recipients.length;
        }
      }
    }

    log(FN, "complete", { homesProcessed, proposalsUpserted, superseded, verified, notified });
    return new Response(JSON.stringify({ success: true, homesProcessed, proposalsUpserted, superseded, verified, notified }), {
      headers: corsHeaders,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logError(FN, "error", { error: message });
    await captureException(FN, err);
    return new Response(JSON.stringify({ error: message }), { headers: corsHeaders, status: 500 });
  }
});
