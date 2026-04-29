import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { log, warn, error as logError } from "../_shared/logger.ts";
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
    ] = await Promise.all([
      supabase.from("weather_snapshots").select("data").eq("home_id", homeId).single(),
      supabase.from("locations").select("id, is_outside").eq("home_id", homeId),
    ]);

    if (!snapshot || !locations) throw new Error("Missing snapshot or locations.");

    const outsideLocations = (locations ?? []).filter((l) => l.is_outside);
    const outsideLocationIds = outsideLocations.map((l) => l.id);

    if (outsideLocationIds.length === 0) {
      log(FN, "no_outside_locations", { homeId });
      return new Response(
        JSON.stringify({ success: true, message: "No outside locations." }),
        { headers: corsHeaders },
      );
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
        }))
      );
      await supabase
        .from("weather_alerts")
        .upsert(dbAlerts, { onConflict: "location_id, type" });
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

    // --- Execute: notifications (dedup by title within this run) ---

    if (notifications.length > 0) {
      const seen = new Set<string>();
      const deduped = notifications.filter((n) => {
        const key = `${n.type}:${n.title}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      await supabase.from("notifications").insert(
        deduped.map((n) => ({ home_id: homeId, ...n })),
      );
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
    return new Response(JSON.stringify({ error: err.message }), {
      headers: corsHeaders,
      status: 500,
    });
  }
});
