import { assertEquals } from "@std/assert";
import {
  deriveValveState,
  soilBand,
  rankAttention,
  summariseSoilReading,
  shapeWalkDevices,
  DEFAULT_VALVE_DURATION_SECONDS,
  MAX_ATTENTION_ITEMS,
  type ValveEventRow,
  type ValveQueueRow,
  type WalkDeviceRow,
} from "@shared/homeOverview.ts";

const NOW = Date.parse("2026-07-02T12:00:00Z");
const iso = (offsetMin: number) => new Date(NOW + offsetMin * 60_000).toISOString();

// ─── deriveValveState ────────────────────────────────────────────────────────

Deno.test("HOME-OV-001: valve running while inside the turn_on countdown", () => {
  const s = deriveValveState(
    [{ device_id: "d1", event_type: "turn_on", duration_seconds: 600, fired_at: iso(-5) }],
    [],
    NOW,
  );
  assertEquals(s.state, "running");
  assertEquals(s.runningUntil, iso(5));
});

Deno.test("HOME-OV-002: never claims running past duration_seconds", () => {
  const s = deriveValveState(
    [{ device_id: "d1", event_type: "turn_on", duration_seconds: 600, fired_at: iso(-30) }],
    [],
    NOW,
  );
  assertEquals(s.state, "idle");
  assertEquals(s.runningUntil, null);
  assertEquals(s.lastRunAt, iso(-30));
});

Deno.test("HOME-OV-003: a newer turn_off wins over an in-countdown turn_on", () => {
  const s = deriveValveState(
    [
      { device_id: "d1", event_type: "turn_on", duration_seconds: 600, fired_at: iso(-5) },
      { device_id: "d1", event_type: "turn_off", duration_seconds: null, fired_at: iso(-2) },
    ],
    [],
    NOW,
  );
  assertEquals(s.state, "idle");
});

Deno.test("HOME-OV-004: failed queue entry newer than last event surfaces as failed", () => {
  const s = deriveValveState(
    [{ device_id: "d1", event_type: "turn_on", duration_seconds: 300, fired_at: iso(-120) }],
    [{ device_id: "d1", command: "turn_on", status: "failed", fire_at: iso(-10) }],
    NOW,
  );
  assertEquals(s.state, "failed");
});

Deno.test("HOME-OV-005: nextRunAt is the earliest pending turn_on", () => {
  const s = deriveValveState(
    [],
    [
      { device_id: "d1", command: "turn_on", status: "pending", fire_at: iso(120) },
      { device_id: "d1", command: "turn_on", status: "pending", fire_at: iso(60) },
      { device_id: "d1", command: "turn_off", status: "pending", fire_at: iso(30) },
    ],
    NOW,
  );
  assertEquals(s.nextRunAt, iso(60));
  assertEquals(s.state, "idle");
});

// ─── soilBand ────────────────────────────────────────────────────────────────

Deno.test("HOME-OV-006: soil bands — dry <30, ok 30-70, wet >70", () => {
  assertEquals(soilBand(12), "dry");
  assertEquals(soilBand(30), "ok");
  assertEquals(soilBand(55), "ok");
  assertEquals(soilBand(70), "ok");
  assertEquals(soilBand(84), "wet");
});

// ─── rankAttention ───────────────────────────────────────────────────────────

Deno.test("HOME-OV-007: attention ranking order — overdue > alert > failed automation > battery/soil > harvest", () => {
  const items = rankAttention({
    overdueCount: 3,
    activeAlerts: [{ type: "frost", message: "Frost tonight" }],
    failedAutomations24h: [{ name: "Morning water" }],
    lowBatteryDevices: [{ name: "Bed A sensor", batteryPercent: 12 }],
    drySoilAreas: [{ areaName: "Raised Bed A", moisture: 18 }],
    closingHarvests: [{ title: "Harvest tomatoes", windowEndDate: "2026-07-04" }],
  });
  assertEquals(items.length, MAX_ATTENTION_ITEMS);
  assertEquals(items[0].kind, "overdue_tasks");
  assertEquals(items[1].kind, "weather_alert");
  assertEquals(items[2].kind, "automation_failed");
  assertEquals(items[3].kind, "low_battery");
});

Deno.test("HOME-OV-008: attention row is empty when nothing needs attention", () => {
  const items = rankAttention({
    overdueCount: 0,
    activeAlerts: [],
    failedAutomations24h: [],
    lowBatteryDevices: [],
    drySoilAreas: [],
    closingHarvests: [],
  });
  assertEquals(items, []);
});

// ─── summariseSoilReading ────────────────────────────────────────────────────

Deno.test("HOME-OV-009: soil reading summary is null-safe and computes age", () => {
  const s = summariseSoilReading(
    { soil_moisture: 42.5, soil_temp: 18.2, soil_ec: 1.1 },
    iso(-90),
    55,
    NOW,
  );
  assertEquals(s.moisture, 42.5);
  assertEquals(s.tempC, 18.2);
  assertEquals(s.ec, 1.1);
  assertEquals(s.batteryPercent, 55);
  assertEquals(s.readingAgeMin, 90);

  const empty = summariseSoilReading(null, null, null, NOW);
  assertEquals(empty.moisture, null);
  assertEquals(empty.readingAgeMin, null);
});

Deno.test("HOME-OV-010: battery falls back to the reading payload when the device column is null", () => {
  const s = summariseSoilReading({ soil_moisture: 40, battery_percent: 33 }, iso(0), null, NOW);
  assertEquals(s.batteryPercent, 33);
});

// ─── shapeWalkDevices (RHO-17 Phase 2 — Garden Walk view) ────────────────────

function mkDevice(over: Partial<WalkDeviceRow> & { id: string }): WalkDeviceRow {
  return {
    id: over.id,
    name: over.name ?? `Device ${over.id}`,
    device_type: over.device_type ?? "soil_sensor",
    area_id: over.area_id ?? null,
    location_id: over.location_id ?? null,
    battery_percent: over.battery_percent ?? null,
    provider: over.provider ?? null,
    metadata: over.metadata ?? null,
  };
}

const NO_EVENTS = new Map<string, ValveEventRow[]>();
const NO_QUEUE = new Map<string, ValveQueueRow[]>();
const NO_READINGS = new Map<
  string,
  { data: Record<string, unknown> | null; recorded_at: string | null }
>();

Deno.test("HOME-OV-011: walk devices keep unassigned, location-level and area-level assignments", () => {
  const shaped = shapeWalkDevices(
    [
      mkDevice({ id: "d-home", name: "Shed sensor" }),
      mkDevice({ id: "d-loc", name: "Front tap valve", device_type: "water_valve", location_id: "loc-1" }),
      mkDevice({ id: "d-area", name: "Bed A probe", area_id: "area-1", location_id: "loc-1" }),
    ],
    NO_READINGS,
    NO_EVENTS,
    NO_QUEUE,
    NOW,
  );
  assertEquals(shaped.length, 3);
  const byId = new Map(shaped.map((d) => [d.id, d]));
  assertEquals(byId.get("d-home")?.areaId, null);
  assertEquals(byId.get("d-home")?.locationId, null);
  assertEquals(byId.get("d-loc")?.locationId, "loc-1");
  assertEquals(byId.get("d-loc")?.areaId, null);
  assertEquals(byId.get("d-area")?.areaId, "area-1");
  // Stable name order for a deterministic walk render.
  assertEquals(shaped.map((d) => d.name), ["Bed A probe", "Front tap valve", "Shed sensor"]);
});

Deno.test("HOME-OV-012: multiple sensors in one area all appear (grid view only shows the first)", () => {
  const readings = new Map([
    ["s1", { data: { soil_moisture: 22 }, recorded_at: iso(-10) }],
    ["s2", { data: { soil_moisture: 61 }, recorded_at: iso(-30) }],
  ]);
  const shaped = shapeWalkDevices(
    [
      mkDevice({ id: "s1", name: "A probe", area_id: "area-1", battery_percent: 80 }),
      mkDevice({ id: "s2", name: "B probe", area_id: "area-1", battery_percent: 40 }),
    ],
    readings,
    NO_EVENTS,
    NO_QUEUE,
    NOW,
  );
  assertEquals(shaped.length, 2);
  assertEquals(shaped[0].sensor?.moisture, 22);
  assertEquals(shaped[0].sensor?.readingAgeMin, 10);
  assertEquals(shaped[1].sensor?.moisture, 61);
  assertEquals(shaped[1].sensor?.readingAgeMin, 30);
  assertEquals(shaped[0].valve, null);
});

Deno.test("HOME-OV-013: valve devices carry derived state + control metadata; sensors never do", () => {
  const events = new Map<string, ValveEventRow[]>([
    ["v1", [{ device_id: "v1", event_type: "turn_on", duration_seconds: 600, fired_at: iso(-5) }]],
  ]);
  const shaped = shapeWalkDevices(
    [
      mkDevice({
        id: "v1",
        name: "Zone valve",
        device_type: "water_valve",
        area_id: "area-1",
        provider: "ewelink",
        metadata: { default_duration_seconds: 900 },
      }),
      mkDevice({ id: "s1", name: "Probe", area_id: "area-1", provider: "ecowitt" }),
    ],
    NO_READINGS,
    events,
    NO_QUEUE,
    NOW,
  );
  const valve = shaped.find((d) => d.id === "v1")!;
  assertEquals(valve.deviceType, "water_valve");
  assertEquals(valve.valve?.state, "running");
  assertEquals(valve.valve?.runningUntil, iso(5));
  assertEquals(valve.sensor, null);
  assertEquals(valve.provider, "ewelink");
  assertEquals(valve.controllable, false);
  assertEquals(valve.defaultDurationSeconds, 900);
  const sensor = shaped.find((d) => d.id === "s1")!;
  assertEquals(sensor.valve, null);
  assertEquals(sensor.sensor?.moisture, null); // no reading yet — null-safe
});

Deno.test("HOME-OV-014: valve failed state surfaces from the queue; duration falls back to the default", () => {
  const queue = new Map<string, ValveQueueRow[]>([
    ["v1", [{ device_id: "v1", command: "turn_on", status: "failed", fire_at: iso(-10) }]],
  ]);
  const shaped = shapeWalkDevices(
    [
      mkDevice({
        id: "v1",
        name: "Zone valve",
        device_type: "water_valve",
        provider: "custom_http",
        metadata: { controllable: true, default_duration_seconds: "not-a-number" },
      }),
    ],
    NO_READINGS,
    NO_EVENTS,
    queue,
    NOW,
  );
  assertEquals(shaped[0].valve?.state, "failed");
  assertEquals(shaped[0].controllable, true);
  assertEquals(shaped[0].defaultDurationSeconds, DEFAULT_VALVE_DURATION_SECONDS);
});

Deno.test("HOME-OV-015: stale sensor readings report their true age (client greys >24h)", () => {
  const readings = new Map([
    ["s1", { data: { soil_moisture: 44, soil_temp: 12.5 }, recorded_at: iso(-26 * 60) }],
  ]);
  const shaped = shapeWalkDevices(
    [mkDevice({ id: "s1", name: "Old probe", battery_percent: 12 })],
    readings,
    NO_EVENTS,
    NO_QUEUE,
    NOW,
  );
  assertEquals(shaped[0].sensor?.readingAgeMin, 26 * 60);
  assertEquals(shaped[0].sensor?.moisture, 44);
  assertEquals(shaped[0].sensor?.tempC, 12.5);
  assertEquals(shaped[0].sensor?.batteryPercent, 12);
});

Deno.test("HOME-OV-016: unknown device types are dropped from the walk payload", () => {
  const shaped = shapeWalkDevices(
    [
      mkDevice({ id: "d1", name: "Probe" }),
      mkDevice({ id: "d2", name: "Mystery", device_type: "weather_station" }),
    ],
    NO_READINGS,
    NO_EVENTS,
    NO_QUEUE,
    NOW,
  );
  assertEquals(shaped.length, 1);
  assertEquals(shaped[0].id, "d1");
});
