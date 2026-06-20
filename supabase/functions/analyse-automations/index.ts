/**
 * analyse-automations — Pillar B of the automation-intelligence feature.
 *
 * Deterministic. For each active automation it summarises the last 7 days of
 * automation_runs, reads the area's soil_moisture_profiles (Pillar A), runs the
 * pure analyser (_shared/automationSuggestions/analyse.ts), and reconciles the
 * resulting drafts into automation_suggestions (insert new / update existing /
 * dismiss stale). Suggestions are applied one-tap from the UI — never silently.
 *
 * Invoked by the daily `analyse-automations-daily` cron (no body → all) and
 * on-demand with { homeId }. verify_jwt off (cron uses the publishable key).
 *
 * The optional Sage+ AI rewrite of `rationale` → `ai_rationale` is a follow-up.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { serviceClient } from "../_shared/supabaseClient.ts";
import { log, warn } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import { pLimit } from "../_shared/concurrency.ts";
import { FIRED_STATUSES } from "../_shared/runLimit.ts";
import {
  analyseAutomation,
  type AutomationConfig,
  type ProfileLite,
  type RunsSummary,
} from "../_shared/automationSuggestions/analyse.ts";

const FN = "analyse-automations";
const CONCURRENCY = 8;
const RUN_WINDOW_DAYS = 7;
const SUGGESTION_TTL_DAYS = 14;

interface AutoRow {
  id: string;
  home_id: string;
  area_id: string | null;
  run_limit_count: number | null;
  run_limit_window_hours: number | null;
  duration_seconds: number | null;
  weather_mode: string | null;
  sensor_cooldown_minutes: number | null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

serve(async (req) => {
  try {
    const db = serviceClient();
    let body: { homeId?: string } = {};
    try {
      body = await req.json();
    } catch {
      // cron sends '{}' or nothing.
    }

    let q = db
      .from("automations")
      .select("id, home_id, area_id, run_limit_count, run_limit_window_hours, duration_seconds, weather_mode, sensor_cooldown_minutes")
      .eq("is_active", true);
    if (body.homeId) q = q.eq("home_id", body.homeId);
    const { data: autos, error } = await q;
    if (error) throw error;

    const automations = (autos ?? []) as AutoRow[];
    if (automations.length === 0) return json({ automations: 0, suggestions: 0 });

    const sinceIso = new Date(Date.now() - RUN_WINDOW_DAYS * 86_400_000).toISOString();
    const nowIso = new Date().toISOString();
    const expiresAt = new Date(Date.now() + SUGGESTION_TTL_DAYS * 86_400_000).toISOString();
    const limit = pLimit(CONCURRENCY);
    let written = 0;
    let errors = 0;

    await Promise.all(automations.map((a) =>
      limit(async () => {
        try {
          // Runs summary (last 7 days).
          const { data: runRows } = await db
            .from("automation_runs")
            .select("status")
            .eq("automation_id", a.id)
            .gte("triggered_at", sinceIso);
          const rows = runRows ?? [];
          const fired = rows.filter((r) => (FIRED_STATUSES as unknown as string[]).includes(r.status as string)).length;
          const rateLimited = rows.filter((r) => r.status === "skipped_rate_limited").length;
          const runs: RunsSummary = { windowDays: RUN_WINDOW_DAYS, total: rows.length, fired, rateLimited };

          // Area moisture profile (aggregate the area's sensors).
          let profile: ProfileLite | null = null;
          if (a.area_id) {
            const { data: profs } = await db
              .from("soil_moisture_profiles")
              .select("drydown_rate_pct_per_day, retention_class, drydown_by_weather, sample_segments")
              .eq("area_id", a.area_id);
            const rated = (profs ?? []).filter((p) =>
              p.drydown_rate_pct_per_day != null && ((p.sample_segments as number) ?? 0) > 0
            );
            if (rated.length > 0) {
              const avg = rated.reduce((s, p) => s + (p.drydown_rate_pct_per_day as number), 0) / rated.length;
              profile = {
                retentionClass: rated[0].retention_class as ProfileLite["retentionClass"],
                drydownRatePerDay: Math.round(avg * 10) / 10,
                byWeather: (rated[0].drydown_by_weather ?? []) as ProfileLite["byWeather"],
              };
            }
          }

          const cfg: AutomationConfig = {
            runLimitCount: a.run_limit_count,
            runLimitWindowHours: a.run_limit_window_hours ?? 24,
            durationSeconds: a.duration_seconds,
            weatherMode: a.weather_mode,
            sensorCooldownMinutes: a.sensor_cooldown_minutes,
          };
          const drafts = analyseAutomation(cfg, runs, profile);

          // Reconcile against existing ACTIVE suggestions for this automation.
          const { data: existing } = await db
            .from("automation_suggestions")
            .select("id, kind")
            .eq("automation_id", a.id)
            .eq("status", "active");
          const existingByKind = new Map<string, string>();
          for (const e of existing ?? []) existingByKind.set(e.kind as string, e.id as string);
          const newKinds = new Set<string>(drafts.map((d) => d.kind));

          // Dismiss active suggestions whose condition no longer holds.
          const staleIds = (existing ?? [])
            .filter((e) => !newKinds.has(e.kind as string))
            .map((e) => e.id as string);
          if (staleIds.length) {
            await db.from("automation_suggestions")
              .update({ status: "dismissed", updated_at: nowIso })
              .in("id", staleIds);
          }

          for (const d of drafts) {
            const base = {
              automation_id: a.id,
              home_id: a.home_id,
              kind: d.kind,
              field: d.field,
              current_value: d.currentValue,
              proposed_value: d.proposedValue,
              rationale: d.rationale,
              confidence: d.confidence,
              expires_at: expiresAt,
              updated_at: nowIso,
            };
            const existingId = existingByKind.get(d.kind);
            if (existingId) {
              await db.from("automation_suggestions").update(base).eq("id", existingId);
            } else {
              await db.from("automation_suggestions").insert({ ...base, status: "active", created_at: nowIso });
            }
            written += 1;
          }
        } catch (err) {
          errors += 1;
          warn(FN, "automation_failed", { automationId: a.id, error: String(err) });
        }
      })
    ));

    log(FN, "analyse_complete", { automations: automations.length, suggestions: written, errors });
    return json({ automations: automations.length, suggestions: written, errors });
  } catch (err) {
    await captureException(FN, err);
    return json({ error: (err as Error).message }, 500);
  }
});
