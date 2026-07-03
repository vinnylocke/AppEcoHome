// Pure aggregation helpers for the `home-overview` edge function
// (docs/plans/new-home-dashboard.md §4 — Phase 2). Extracted so valve-state
// derivation, soil banding and attention ranking are unit-testable in Deno
// without a live database (see supabase/tests/homeOverview.test.ts).

export interface ValveEventRow {
  device_id: string;
  event_type: "turn_on" | "turn_off";
  duration_seconds: number | null;
  fired_at: string;
}

export interface ValveQueueRow {
  device_id: string;
  command: string;
  status: string;
  fire_at: string;
}

export interface ValveState {
  state: "running" | "idle" | "failed";
  /** ISO — only while running (fired_at + duration). */
  runningUntil: string | null;
  lastRunAt: string | null;
  /** ISO — earliest pending turn_on in the queue. */
  nextRunAt: string | null;
}

/**
 * Derive a valve's display state from its newest events + pending queue.
 * "Running" requires a turn_on that (a) has no NEWER turn_off and (b) whose
 * countdown hasn't expired — never claim running past duration_seconds (the
 * device countdown is authoritative; same rule family as the dead-man's
 * switch). A failed queue row newer than the last event surfaces as
 * "failed" so the gardener sees the zone didn't water.
 */
export function deriveValveState(
  events: ValveEventRow[],
  queueRows: ValveQueueRow[],
  nowMs: number,
): ValveState {
  const sorted = [...events].sort(
    (a, b) => Date.parse(b.fired_at) - Date.parse(a.fired_at),
  );
  const last = sorted[0] ?? null;

  let state: ValveState["state"] = "idle";
  let runningUntil: string | null = null;

  if (last && last.event_type === "turn_on") {
    const firedMs = Date.parse(last.fired_at);
    const durationMs = (last.duration_seconds ?? 0) * 1000;
    const untilMs = firedMs + durationMs;
    if (durationMs > 0 && untilMs > nowMs) {
      state = "running";
      runningUntil = new Date(untilMs).toISOString();
    }
  }

  const lastRunAt =
    sorted.find((e) => e.event_type === "turn_on")?.fired_at ?? null;

  // A failed queue entry newer than the last successful event means the
  // most recent intent didn't reach the device.
  if (state !== "running") {
    const lastEventMs = last ? Date.parse(last.fired_at) : 0;
    const failedNewer = queueRows.some(
      (q) => q.status === "failed" && Date.parse(q.fire_at) > lastEventMs,
    );
    if (failedNewer) state = "failed";
  }

  const nextRunAt =
    queueRows
      .filter((q) => q.status === "pending" && q.command === "turn_on")
      .map((q) => q.fire_at)
      .sort()[0] ?? null;

  return { state, runningUntil, lastRunAt, nextRunAt };
}

export type SoilBand = "dry" | "ok" | "wet";

/**
 * Plain-language soil moisture banding for simple mode. Bands follow the
 * common capacitive-sensor guidance the automation templates use:
 * below 30% = dry, above 70% = wet.
 */
export function soilBand(moisturePercent: number): SoilBand {
  if (moisturePercent < 30) return "dry";
  if (moisturePercent > 70) return "wet";
  return "ok";
}

export interface AttentionItem {
  kind:
    | "overdue_tasks"
    | "weather_alert"
    | "automation_failed"
    | "low_battery"
    | "soil_dry"
    | "harvest_closing";
  title: string;
  body: string;
  /** Client route to act on the item. */
  route: string;
  /** Lower = more urgent; used for the ranked cut to MAX_ATTENTION_ITEMS. */
  rank: number;
}

export const MAX_ATTENTION_ITEMS = 4;

export interface AttentionInputs {
  overdueCount: number;
  activeAlerts: Array<{ type: string; message: string }>;
  failedAutomations24h: Array<{ name: string | null }>;
  lowBatteryDevices: Array<{ name: string; batteryPercent: number }>;
  drySoilAreas: Array<{ areaName: string; moisture: number }>;
  closingHarvests: Array<{ title: string; windowEndDate: string }>;
}

/**
 * Rank "needs attention" items (plan §3.2): overdue → weather alert →
 * failed automation → low battery / dry soil → closing harvest window.
 * Returns at most MAX_ATTENTION_ITEMS, most urgent first.
 */
export function rankAttention(inputs: AttentionInputs): AttentionItem[] {
  const items: AttentionItem[] = [];

  if (inputs.overdueCount > 0) {
    items.push({
      kind: "overdue_tasks",
      title: `${inputs.overdueCount} overdue task${inputs.overdueCount === 1 ? "" : "s"}`,
      body: "Catch up before they pile up.",
      route: "/dashboard?view=calendar",
      rank: 0,
    });
  }

  const alert = inputs.activeAlerts[0];
  if (alert) {
    items.push({
      kind: "weather_alert",
      title: "Weather alert",
      body: alert.message,
      route: "/dashboard?view=weather",
      rank: 1,
    });
  }

  const failed = inputs.failedAutomations24h[0];
  if (failed) {
    items.push({
      kind: "automation_failed",
      title: `Automation failed: ${failed.name ?? "unnamed"}`,
      body: "The last run didn't complete — that zone may not have watered.",
      route: "/integrations",
      rank: 2,
    });
  }

  for (const d of inputs.lowBatteryDevices) {
    items.push({
      kind: "low_battery",
      title: `${d.name} battery ${Math.round(d.batteryPercent)}%`,
      body: "Replace or recharge soon to keep readings flowing.",
      route: "/integrations",
      rank: 3,
    });
  }

  for (const a of inputs.drySoilAreas) {
    items.push({
      kind: "soil_dry",
      title: `${a.areaName} is dry (${Math.round(a.moisture)}%)`,
      body: "Soil moisture is below the comfortable band.",
      route: "/dashboard?view=locations",
      rank: 4,
    });
  }

  for (const h of inputs.closingHarvests) {
    items.push({
      kind: "harvest_closing",
      title: `Harvest window closing: ${h.title}`,
      body: `Open until ${h.windowEndDate} — don't miss it.`,
      route: "/dashboard?view=calendar",
      rank: 5,
    });
  }

  return items
    .sort((a, b) => a.rank - b.rank)
    .slice(0, MAX_ATTENTION_ITEMS);
}

export interface SensorSummary {
  moisture: number | null;
  tempC: number | null;
  ec: number | null;
  batteryPercent: number | null;
  readingAgeMin: number | null;
}

// ─── Garden Walk telemetry (RHO-17 Phase 2) ─────────────────────────────────

/** Raw `devices` row shape the walk view works from. `provider` +
 *  `metadata` are only selected for the walk view — they drive the
 *  client-side valve-control mode (eWeLink vs custom vs read-only). */
export interface WalkDeviceRow {
  id: string;
  name: string;
  device_type: string;
  area_id: string | null;
  location_id: string | null;
  battery_percent: number | null;
  provider?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** One flat per-device entry in the `view: "walk"` response. Sensors get
 *  a `sensor` summary; valves get a `valve` state plus the control
 *  metadata the walk's valve rows need (provider / controllable /
 *  default duration — mirrors DeviceDetailModal's ValveControlPanel
 *  props so the walk reuses the exact same control path). */
export interface WalkDevicePayload {
  id: string;
  name: string;
  deviceType: "soil_sensor" | "water_valve";
  areaId: string | null;
  locationId: string | null;
  batteryPercent: number | null;
  sensor: SensorSummary | null;
  valve: ValveState | null;
  provider: string | null;
  controllable: boolean;
  defaultDurationSeconds: number;
}

export const DEFAULT_VALVE_DURATION_SECONDS = 1800;

/**
 * Shape EVERY active device — unassigned (home-level), location-level and
 * area-level, including multiple sensors per area (the dashboard grid
 * only surfaces the first per area) — into the flat `devices[]` array the
 * Garden Walk's section cards consume. Pure: fed the same maps the grid
 * shaping already builds. Sorted by name for a stable walk render.
 */
export function shapeWalkDevices(
  devices: WalkDeviceRow[],
  readingByDevice: Map<
    string,
    { data: Record<string, unknown> | null; recorded_at: string | null }
  >,
  eventsByDevice: Map<string, ValveEventRow[]>,
  queueByDevice: Map<string, ValveQueueRow[]>,
  nowMs: number,
): WalkDevicePayload[] {
  return devices
    .filter(
      (d) => d.device_type === "soil_sensor" || d.device_type === "water_valve",
    )
    .map((d) => {
      const isSensor = d.device_type === "soil_sensor";
      const reading = readingByDevice.get(d.id);
      const meta = (d.metadata ?? {}) as Record<string, unknown>;
      const rawDuration = meta["default_duration_seconds"];
      return {
        id: d.id,
        name: d.name,
        deviceType: d.device_type as "soil_sensor" | "water_valve",
        areaId: d.area_id ?? null,
        locationId: d.location_id ?? null,
        batteryPercent: d.battery_percent ?? null,
        sensor: isSensor
          ? summariseSoilReading(
            reading?.data ?? null,
            reading?.recorded_at ?? null,
            d.battery_percent ?? null,
            nowMs,
          )
          : null,
        valve: isSensor ? null : deriveValveState(
          eventsByDevice.get(d.id) ?? [],
          queueByDevice.get(d.id) ?? [],
          nowMs,
        ),
        provider: d.provider ?? null,
        controllable: meta["controllable"] === true,
        defaultDurationSeconds:
          typeof rawDuration === "number" &&
            Number.isFinite(rawDuration) &&
            rawDuration > 0
            ? rawDuration
            : DEFAULT_VALVE_DURATION_SECONDS,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Summarise a soil sensor's latest reading; null-safe on every field. */
export function summariseSoilReading(
  data: Record<string, unknown> | null,
  recordedAt: string | null,
  batteryPercent: number | null,
  nowMs: number,
): SensorSummary {
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  return {
    moisture: num(data?.["soil_moisture"]),
    tempC: num(data?.["soil_temp"]),
    ec: num(data?.["soil_ec"]),
    batteryPercent: batteryPercent ?? num(data?.["battery_percent"]),
    readingAgeMin: recordedAt
      ? Math.max(0, Math.round((nowMs - Date.parse(recordedAt)) / 60_000))
      : null,
  };
}
