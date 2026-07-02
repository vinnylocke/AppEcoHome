import { assertEquals } from "@std/assert";
import {
  deriveValveState,
  soilBand,
  rankAttention,
  summariseSoilReading,
  MAX_ATTENTION_ITEMS,
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
