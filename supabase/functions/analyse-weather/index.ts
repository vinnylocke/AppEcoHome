import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { log, warn, error as logError } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import { deriveClimate } from "../_shared/climateZones.ts";
import { shouldNotify, type NotificationPrefs } from "../_shared/notificationPrefs.ts";
import {
  WEATHER_RULES,
  EMPTY_RESULT,
  type WeatherContext,
  type DailySummary,
  type HourlyPoint,
  type WeatherRuleResult,
} from "../_shared/weatherRules/index.ts";

const FN = "analyse-weather";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json();
    const homeId = body?.record?.home_id;

    log(FN, "request_received", { homeId: homeId ?? null });

    if (!homeId) throw new Error("Missing home_id in request body.");

    // --- Build context ---

    const [
      { data: snapshot },
      { data: locations },
      { data: home },
    ] = await Promise.all([
      supabase.from("weather_snapshots").select("data").eq("home_id", homeId).single(),
      supabase.from("locations").select("id, is_outside").eq("home_id", homeId),
      supabase.from("homes").select("climate_zone, lat, country").eq("id", homeId).maybeSingle(),
    ]);

    if (!snapshot || !locations) throw new Error("Missing snapshot or locations.");

    // Climate zone drives the climate-aware heat threshold (stored value, else derived from latitude).
    const climateZone: string | null = (home?.climate_zone as string | null)
      ?? (typeof home?.lat === "number" ? deriveClimate(home.lat as number).zone : null);
    const country: string | null = (home?.country as string | null) ?? null;

    const outsideLocations = (locations ?? []).filter((l) => l.is_outside);
    const outsideLocationIds = outsideLocations.map((l) => l.id);

    if (outsideLocationIds.length === 0) {
      log(FN, "no_outside_locations", { homeId });
      return new Response(
        JSON.stringify({ success: true, message: "No outside locations." }),
        { headers: corsHeaders },
      );
    }

    // --- Expire stale alerts (>24h past starts_at) for this home's locations ---
    // The rule engine only upserts NEW alerts on (location_id, type); if
    // conditions no longer match, the previous row stays is_active=true
    // forever. This sweeps anything older than 24h so the WeatherAlertBanner
    // doesn't show "high temperature tomorrow" weeks after the fact.
    const staleCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    // Key the sweep on ends_at (coalesced to starts_at for legacy rows) so a
    // multi-day alert (e.g. a Mon–Wed heatwave) stays active until its LAST day.
    const { error: expireErr, count: expiredCount } = await supabase
      .from("weather_alerts")
      .update({ is_active: false }, { count: "exact" })
      .in("location_id", outsideLocationIds)
      .eq("is_active", true)
      .lt("ends_at", staleCutoff);
    if (expireErr) {
      warn(FN, "expire_failed", { error: expireErr.message });
    } else if ((expiredCount ?? 0) > 0) {
      log(FN, "alerts_expired", { count: expiredCount });
    }

    // Check if any tropical plants occupy outdoor areas
    const { data: outsideAreas } = await supabase
      .from("areas")
      .select("id")
      .in("location_id", outsideLocationIds);
    const outsideAreaIds = (outsideAreas ?? []).map((a) => a.id);

    let hasTropicalOutdoor = false;
    if (outsideAreaIds.length > 0) {
      const { data: outdoorInventory } = await supabase
        .from("inventory_items")
        .select("plants(tropical)")
        .eq("home_id", homeId)
        .in("area_id", outsideAreaIds);
      hasTropicalOutdoor = (outdoorInventory ?? []).some(
        (item: any) => item.plants?.tropical === true,
      );
    }

    // --- Parse snapshot into typed structures ---

    const today = new Date().toISOString().split("T")[0];

    const rawDaily = snapshot.data.daily ?? {};
    const daily: DailySummary[] = (rawDaily.time ?? []).map(
      (date: string, i: number) => ({
        date,
        precipMm: rawDaily.precipitation_sum?.[i] ?? 0,
        maxTempC: rawDaily.temperature_2m_max?.[i] ?? 20,
        minTempC: rawDaily.temperature_2m_min?.[i] ?? 10,
        maxWindKph: rawDaily.windspeed_10m_max?.[i] ?? 0,
        wmoCode: rawDaily.weathercode?.[i] ?? 0,
        precipProbability: rawDaily.precipitation_probability_max?.[i] ?? 0,
      }),
    );

    const rawHourly = snapshot.data.hourly ?? {};
    // Only pass the next 48h to rules — filter out yesterday's historical hourly data
    const hourly: HourlyPoint[] = (rawHourly.time ?? [])
      .map((time: string, i: number) => ({
        time,
        tempC: rawHourly.temperature_2m?.[i] ?? 20,
        windKph: rawHourly.wind_speed_10m?.[i] ?? 0,
      }))
      .filter((h: HourlyPoint) => h.time >= today)
      .slice(0, 48);

    const ctx: WeatherContext = {
      homeId,
      today,
      outsideLocationIds,
      hasTropicalOutdoor,
      climateZone,
      country,
      daily,
      hourly,
    };

    log(FN, "context_built", {
      homeId,
      outsideLocations: outsideLocationIds.length,
      hasTropicalOutdoor,
      dailyDays: daily.length,
      hourlyPoints: hourly.length,
    });

    // --- Run all rules ---

    const allResults: WeatherRuleResult[] = WEATHER_RULES.map((rule) => {
      try {
        return rule.evaluate(ctx);
      } catch (err) {
        warn(FN, "rule_error", { rule: rule.id, error: String(err) });
        return EMPTY_RESULT;
      }
    });

    const alerts = allResults.flatMap((r) => r.alerts);
    const taskAutoCompletes = allResults.flatMap((r) => r.taskAutoCompletes);
    const notifications = allResults.flatMap((r) => r.notifications);

    log(FN, "rules_evaluated", {
      homeId,
      alerts: alerts.length,
      taskActions: taskAutoCompletes.length,
      notifications: notifications.length,
    });

    // --- Execute: persist alerts ---

    if (alerts.length > 0) {
      const dbAlerts = alerts.flatMap((alert) =>
        outsideLocationIds.map((locId) => ({
          location_id: locId,
          type: alert.type,
          severity: alert.severity,
          message: alert.message,
          starts_at: alert.starts_at,
          ends_at: alert.endsAt ?? alert.starts_at,
          dates: alert.dates ?? [alert.starts_at.split("T")[0]],
          // Re-activate on re-trigger: without this, a row the stale-out sweep
          // previously set is_active=false stays hidden even when the rule fires
          // again (the upsert would otherwise leave is_active untouched).
          is_active: true,
        }))
      );
      const { error: alertErr } = await supabase
        .from("weather_alerts")
        .upsert(dbAlerts, { onConflict: "location_id, type" });
      if (alertErr) {
        logError(FN, "weather_alerts_upsert_failed", {
          homeId,
          error: alertErr.message,
        });
      }
    }

    // --- Execute: auto-complete tasks ---

    let totalAutoCompleted = 0;
    for (const action of taskAutoCompletes) {
      const { data: tasksToComplete } = await supabase
        .from("tasks")
        .select("id")
        .eq("home_id", homeId)
        .eq("status", "Pending")
        .eq("type", action.taskType)
        .lte("due_date", today)
        .in("location_id", outsideLocationIds);

      if (tasksToComplete?.length) {
        await supabase
          .from("tasks")
          .update({
            status: "Completed",
            completed_at: new Date().toISOString(),
            auto_completed_reason: action.reason,
          })
          .in("id", tasksToComplete.map((t) => t.id));

        totalAutoCompleted += tasksToComplete.length;
        log(FN, "tasks_auto_completed", {
          homeId,
          taskType: action.taskType,
          count: tasksToComplete.length,
        });
      }
    }

    // --- Execute: notifications (dedup within run AND across runs for today) ---

    if (notifications.length > 0) {
      // Fetch notifications already inserted for this home today so we don't
      // re-insert the same weather alert on consecutive syncs. Keyed on
      // type:title (matching the intra-run `seen` set) — every weather rule
      // emits type "weather_alert", so keying on type alone suppressed every
      // DIFFERENT weather event for the rest of the day after the first one.
      const { data: todayNotifs } = await supabase
        .from("notifications")
        .select("type, title")
        .eq("home_id", homeId)
        .gte("created_at", today + "T00:00:00Z");
      const todayKeys = new Set(
        (todayNotifs ?? []).map((n: any) => `${n.type}:${n.title}`),
      );

      const seen = new Set<string>();
      const deduped = notifications.filter((n) => {
        const key = `${n.type}:${n.title}`;
        if (seen.has(key) || todayKeys.has(key)) return false;
        seen.add(key);
        return true;
      });

      if (deduped.length > 0) {
        // Fan out one row PER MEMBER: push-webhook drops any notification
        // row without a user_id, so home-level rows were never delivered
        // as push. Honour each member's weatherAlerts preference.
        const { data: members } = await supabase
          .from("home_members")
          .select("user_id")
          .eq("home_id", homeId);
        const memberIds: string[] = (members ?? []).map((m: any) => m.user_id);

        const { data: profiles } = memberIds.length > 0
          ? await supabase
            .from("user_profiles")
            .select("uid, notification_prefs")
            .in("uid", memberIds)
          : { data: [] };
        const prefsByUid = new Map<string, NotificationPrefs | null>(
          (profiles ?? []).map((p: any) => [p.uid, p.notification_prefs ?? null]),
        );

        const recipients = memberIds.filter((uid) =>
          shouldNotify(prefsByUid.get(uid), "weatherAlerts")
        );
        const rows = recipients.flatMap((uid) =>
          deduped.map((n) => ({ home_id: homeId, user_id: uid, ...n }))
        );

        if (rows.length > 0) {
          const { error: notifErr } = await supabase
            .from("notifications")
            .insert(rows);
          if (notifErr) {
            logError(FN, "notification_insert_failed", {
              homeId,
              error: notifErr.message,
            });
          }
        }
      }
    }

    log(FN, "complete", {
      homeId,
      alerts: alerts.length,
      autoCompleted: totalAutoCompleted,
      notifications: notifications.length,
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: corsHeaders,
    });
  } catch (err: any) {
    logError(FN, "error", { error: err.message });
    await captureException(FN, err);
    return new Response(JSON.stringify({ error: err.message }), {
      headers: corsHeaders,
      status: 500,
    });
  }
});
