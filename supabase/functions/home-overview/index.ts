// home-overview — one-call aggregate for the Home dashboard's Garden
// Overview grid + attention row (docs/plans/new-home-dashboard.md §4,
// Phase 2). Returns per-location/area plant counts, latest soil-sensor
// summaries, valve state, per-area task load, and the ranked "needs
// attention" list. Pure aggregation logic lives in _shared/homeOverview.ts
// (Deno-tested); this file is fetch + group + shape.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { requireAuth } from "../_shared/requireAuth.ts";
import { log } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import {
  deriveValveState,
  rankAttention,
  shapeWalkDevices,
  soilBand,
  summariseSoilReading,
  type ValveEventRow,
  type ValveQueueRow,
  type WalkDeviceRow,
} from "../_shared/homeOverview.ts";

const FN = "home-overview";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const db = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
    const authResult = await requireAuth(req, db);
    if (authResult instanceof Response) return authResult;
    const userId = authResult.user.id;

    // `view: "walk"` (RHO-17 Phase 2) appends a flat per-device `devices[]`
    // array for the Garden Walk. The default (no view) response is
    // unchanged — HOME-008 E2E mocks depend on its exact shape.
    const { homeId, today, view } = await req.json();
    if (!homeId || !today) return json({ error: "homeId and today required" }, 400);

    const { data: membership } = await db
      .from("home_members")
      .select("role")
      .eq("home_id", homeId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!membership) return json({ error: "not_a_member" }, 403);

    const nowMs = Date.now();
    const dayAgoIso = new Date(nowMs - 24 * 60 * 60 * 1000).toISOString();
    const closingCutoff = new Date(Date.parse(`${today}T00:00:00Z`) + 3 * 86_400_000)
      .toISOString()
      .split("T")[0];

    // ── Parallel reads (all home-bounded — no fleet scans) ────────────────
    const [
      locationsRes,
      itemsRes,
      devicesRes,
      readingsRes,
      openTasksRes,
      alertsRes,
      failedRunsRes,
    ] = await Promise.all([
      // NOTE: no `hazard` column exists on locations (LocationTile's
      // site.hazard read is schema drift — always undefined via the `*`
      // select). Naming it here 400'd the whole query in production and,
      // unchecked, silently blanked every telemetry chip.
      db
        .from("locations")
        .select("id, name, is_outside, areas ( id, name )")
        .eq("home_id", homeId),
      db
        .from("inventory_items")
        .select("id, status, growth_state, plant_name, area_id, location_id")
        .eq("home_id", homeId),
      // `provider` + `metadata` are only consumed by the walk view's
      // device payload; selecting them unconditionally doesn't change the
      // default response (shaping below never echoes them).
      db
        .from("devices")
        .select("id, name, device_type, area_id, location_id, battery_percent, is_active, provider, metadata")
        .eq("home_id", homeId)
        .eq("is_active", true),
      db.rpc("latest_device_readings", { p_home_id: homeId }),
      db
        .from("tasks")
        .select("id, title, due_date, next_check_at, window_end_date, area_id, location_id, type")
        .eq("home_id", homeId)
        .eq("status", "Pending")
        .or(`due_date.lte.${closingCutoff},window_end_date.gte.${today}`),
      // weather_alerts is LOCATION-scoped (no home_id column) — filter
      // through the locations join. Caught by Sentry RHOZLY-3P.
      db
        .from("weather_alerts")
        .select("type, message, is_active, locations!inner(home_id)")
        .eq("locations.home_id", homeId)
        .eq("is_active", true)
        .order("starts_at", { ascending: false })
        .limit(5),
      db
        .from("automation_runs")
        .select("id, automations ( name )")
        .eq("home_id", homeId)
        .eq("status", "failed")
        .gte("triggered_at", dayAgoIso)
        .limit(5),
    ]);

    // Fail LOUDLY on any read error: the client soft-fails by design, so a
    // silent partial result here renders as "no chips" with zero signal —
    // which is exactly how the hazard-column bug shipped.
    const failures = [
      ["locations", locationsRes.error],
      ["inventory_items", itemsRes.error],
      ["devices", devicesRes.error],
      ["latest_device_readings", readingsRes.error],
      ["tasks", openTasksRes.error],
      ["weather_alerts", alertsRes.error],
      ["automation_runs", failedRunsRes.error],
    ].filter(([, e]) => e);
    if (failures.length > 0) {
      throw new Error(
        `home-overview reads failed: ${failures.map(([n, e]) => `${n}: ${(e as { message?: string }).message}`).join(" | ")}`,
      );
    }

    const locations = locationsRes.data ?? [];
    const items = itemsRes.data ?? [];
    const devices = devicesRes.data ?? [];
    const readings = (readingsRes.data ?? []) as Array<{
      device_id: string;
      recorded_at: string;
      data: Record<string, unknown>;
    }>;
    const openTasks = (openTasksRes.data ?? []) as Array<{
      id: string;
      title: string;
      due_date: string | null;
      next_check_at: string | null;
      window_end_date: string | null;
      area_id: string | null;
      location_id: string | null;
      type: string | null;
    }>;

    // ── Valve history + queue (only when the home has valves) ────────────
    const valveIds = devices.filter((d) => d.device_type === "water_valve").map((d) => d.id);
    let valveEvents: ValveEventRow[] = [];
    let valveQueue: ValveQueueRow[] = [];
    if (valveIds.length > 0) {
      const [eventsRes, queueRes] = await Promise.all([
        db
          .from("valve_events")
          .select("device_id, event_type, duration_seconds, fired_at")
          .in("device_id", valveIds)
          .order("fired_at", { ascending: false })
          .limit(200),
        db
          .from("automation_valve_queue")
          .select("device_id, command, status, fire_at")
          .in("device_id", valveIds)
          .in("status", ["pending", "failed"])
          .gte("fire_at", dayAgoIso),
      ]);
      if (eventsRes.error) throw new Error(`valve_events read failed: ${eventsRes.error.message}`);
      if (queueRes.error) throw new Error(`automation_valve_queue read failed: ${queueRes.error.message}`);
      valveEvents = (eventsRes.data ?? []) as ValveEventRow[];
      valveQueue = (queueRes.data ?? []) as ValveQueueRow[];
    }

    const readingByDevice = new Map(readings.map((r) => [r.device_id, r]));
    const eventsByDevice = new Map<string, ValveEventRow[]>();
    for (const e of valveEvents) {
      (eventsByDevice.get(e.device_id) ?? eventsByDevice.set(e.device_id, []).get(e.device_id)!)
        .push(e);
    }
    const queueByDevice = new Map<string, ValveQueueRow[]>();
    for (const q of valveQueue) {
      (queueByDevice.get(q.device_id) ?? queueByDevice.set(q.device_id, []).get(q.device_id)!)
        .push(q);
    }

    // ── Task splits: due-today / overdue (snooze + harvest-window aware) ──
    const isSnoozed = (t: { next_check_at: string | null }) =>
      !!t.next_check_at && t.next_check_at.split("T")[0] > today;
    const isOverdue = (t: (typeof openTasks)[number]) => {
      if (isSnoozed(t)) return false;
      if (t.window_end_date) return t.window_end_date < today;
      return !!t.due_date && t.due_date < today;
    };
    const isDueToday = (t: (typeof openTasks)[number]) => {
      if (isSnoozed(t)) return false;
      if (t.window_end_date && t.due_date) {
        return t.due_date <= today && today <= t.window_end_date;
      }
      return t.due_date === today;
    };
    const overdueCount = openTasks.filter(isOverdue).length;
    const tasksTodayByArea = new Map<string, number>();
    const tasksTodayByLocation = new Map<string, number>();
    for (const t of openTasks) {
      if (!isDueToday(t) && !isOverdue(t)) continue;
      if (t.area_id) tasksTodayByArea.set(t.area_id, (tasksTodayByArea.get(t.area_id) ?? 0) + 1);
      if (t.location_id) {
        tasksTodayByLocation.set(t.location_id, (tasksTodayByLocation.get(t.location_id) ?? 0) + 1);
      }
    }

    // ── Shape the grid payload ────────────────────────────────────────────
    const drySoilAreas: Array<{ areaName: string; moisture: number }> = [];

    const shapedLocations = locations.map((loc: any) => {
      const areas = (loc.areas ?? []).map((area: { id: string; name: string }) => {
        const areaItems = items.filter((i) => i.area_id === area.id);
        const byGrowthState: Record<string, number> = {};
        let unplanted = 0;
        for (const i of areaItems) {
          if (i.status !== "Planted") unplanted += 1;
          else {
            const k = i.growth_state ?? "Growing";
            byGrowthState[k] = (byGrowthState[k] ?? 0) + 1;
          }
        }

        const sensorDevice = devices.find(
          (d) => d.device_type === "soil_sensor" && d.area_id === area.id,
        );
        const sensorReading = sensorDevice ? readingByDevice.get(sensorDevice.id) : undefined;
        const sensor = sensorDevice
          ? summariseSoilReading(
            sensorReading?.data ?? null,
            sensorReading?.recorded_at ?? null,
            (sensorDevice.battery_percent as number | null) ?? null,
            nowMs,
          )
          : null;
        if (
          sensor?.moisture != null &&
          soilBand(sensor.moisture) === "dry" &&
          (sensor.readingAgeMin ?? Infinity) <= 24 * 60
        ) {
          drySoilAreas.push({ areaName: area.name, moisture: sensor.moisture });
        }

        const valveDevice = devices.find(
          (d) => d.device_type === "water_valve" && d.area_id === area.id,
        );
        const valve = valveDevice
          ? deriveValveState(
            eventsByDevice.get(valveDevice.id) ?? [],
            queueByDevice.get(valveDevice.id) ?? [],
            nowMs,
          )
          : null;

        return {
          id: area.id,
          name: area.name,
          plants: { total: areaItems.length, byGrowthState, unplanted },
          sensor,
          valve,
          tasksToday: tasksTodayByArea.get(area.id) ?? 0,
        };
      });

      return {
        id: loc.id,
        name: loc.name,
        is_outside: loc.is_outside,
        hazard: null,
        tasksToday: tasksTodayByLocation.get(loc.id) ?? 0,
        areas,
      };
    });

    // ── Attention row ─────────────────────────────────────────────────────
    const attention = rankAttention({
      overdueCount,
      activeAlerts: (alertsRes.data ?? []).map((a: any) => ({
        type: a.type,
        message: a.message,
      })),
      failedAutomations24h: (failedRunsRes.data ?? []).map((r: any) => ({
        name: r.automations?.name ?? null,
      })),
      lowBatteryDevices: devices
        .filter((d) => typeof d.battery_percent === "number" && d.battery_percent < 25)
        .map((d) => ({ name: d.name, batteryPercent: d.battery_percent as number })),
      drySoilAreas,
      closingHarvests: openTasks
        .filter(
          (t) =>
            !!t.window_end_date &&
            t.window_end_date >= today &&
            t.window_end_date <= closingCutoff &&
            !isSnoozed(t),
        )
        .map((t) => ({ title: t.title, windowEndDate: t.window_end_date! })),
    });

    // ── Walk view (RHO-17 Phase 2): flat per-device payload ───────────────
    if (view === "walk") {
      const walkDevices = shapeWalkDevices(
        devices as WalkDeviceRow[],
        readingByDevice,
        eventsByDevice,
        queueByDevice,
        nowMs,
      );
      log(FN, "done (walk)", {
        homeId,
        locations: shapedLocations.length,
        attention: attention.length,
        devices: walkDevices.length,
      });
      return json({ locations: shapedLocations, attention, devices: walkDevices });
    }

    log(FN, "done", { homeId, locations: shapedLocations.length, attention: attention.length });
    return json({ locations: shapedLocations, attention });
  } catch (err) {
    console.error(`[${FN}] unhandled error`, err);
    await captureException(FN, err);
    return json({ error: "internal_error" }, 500);
  }
});
