import { assert, assertEquals } from "@std/assert";
import {
  parseSoilPayload,
  parseValvePayload,
  slugifyDeviceId,
} from "@shared/integrations/adapters/customHttp.ts";
import { extractAuth } from "@shared/integrations/webhookAuth.ts";

// 2026-06-16 Custom integrations Phase 3 — tests for the custom_http
// adapter's payload validators + the webhook router's auth extractor.

// ── slugifyDeviceId ─────────────────────────────────────────────────────────

Deno.test("slugifyDeviceId — happy path", () => {
  assertEquals(slugifyDeviceId("Greenhouse Soil Probe"), "greenhouse-soil-probe");
});

Deno.test("slugifyDeviceId — collapses runs of separators", () => {
  assertEquals(slugifyDeviceId("Plot  12 // West"), "plot-12-west");
});

Deno.test("slugifyDeviceId — strips leading/trailing separators", () => {
  assertEquals(slugifyDeviceId("---weird-name---"), "weird-name");
});

Deno.test("slugifyDeviceId — empty / whitespace input falls back to a stable id", () => {
  const out = slugifyDeviceId("   ");
  assert(out.startsWith("device-"));
});

Deno.test("slugifyDeviceId — caps length", () => {
  const out = slugifyDeviceId("a".repeat(200));
  assert(out.length <= 60);
});

// ── parseSoilPayload ───────────────────────────────────────────────────────

const BASE_SOIL = {
  schema_version: 1,
  device_external_id: "probe-1",
  soil_moisture: 42,
};

Deno.test("parseSoilPayload — minimal valid payload (moisture only)", () => {
  const out = parseSoilPayload(BASE_SOIL);
  assert(!("error" in out));
  if ("error" in out) return;
  assertEquals(out.externalDeviceId, "probe-1");
  const data = out.data as { soil_moisture: number; soil_temp: number; soil_ec: number };
  assertEquals(data.soil_moisture, 42);
  assertEquals(data.soil_temp, 0);
  assertEquals(data.soil_ec, 0);
});

Deno.test("parseSoilPayload — full payload with EC defaults to calibrated", () => {
  const out = parseSoilPayload({ ...BASE_SOIL, soil_temp: 20, soil_ec: 1200 });
  assert(!("error" in out));
  if ("error" in out) return;
  const data = out.data as { ec_source: string };
  assertEquals(data.ec_source, "calibrated_us_cm");
});

Deno.test("parseSoilPayload — explicit ec_source = raw_adc", () => {
  const out = parseSoilPayload({ ...BASE_SOIL, soil_ec: 850, ec_source: "raw_adc" });
  assert(!("error" in out));
  if ("error" in out) return;
  const data = out.data as { ec_source: string };
  assertEquals(data.ec_source, "raw_adc");
});

Deno.test("parseSoilPayload — moisture out of range rejected", () => {
  const out = parseSoilPayload({ ...BASE_SOIL, soil_moisture: 150 });
  assert("error" in out);
  if ("error" in out) {
    assertEquals(out.error, "soil_moisture_out_of_range");
  }
});

Deno.test("parseSoilPayload — temp out of range rejected", () => {
  const out = parseSoilPayload({ ...BASE_SOIL, soil_temp: 200 });
  assert("error" in out);
  if ("error" in out) {
    assertEquals(out.error, "soil_temp_out_of_range");
  }
});

Deno.test("parseSoilPayload — missing device_external_id rejected", () => {
  const out = parseSoilPayload({ schema_version: 1, soil_moisture: 50 });
  assert("error" in out);
  if ("error" in out) {
    assertEquals(out.error, "missing_device_external_id");
  }
});

Deno.test("parseSoilPayload — unsupported schema_version rejected", () => {
  const out = parseSoilPayload({ ...BASE_SOIL, schema_version: 99 });
  assert("error" in out);
  if ("error" in out) {
    assertEquals(out.error, "unsupported_schema_version");
  }
});

Deno.test("parseSoilPayload — invalid recorded_at rejected", () => {
  const out = parseSoilPayload({ ...BASE_SOIL, recorded_at: "not a date" });
  assert("error" in out);
  if ("error" in out) {
    assertEquals(out.error, "invalid_recorded_at");
  }
});

Deno.test("parseSoilPayload — non-object body rejected", () => {
  const out = parseSoilPayload("nope");
  assert("error" in out);
});

// ── parseValvePayload ───────────────────────────────────────────────────────

Deno.test("parseValvePayload — state on", () => {
  const out = parseValvePayload({ device_external_id: "valve-1", state: "on" });
  assert(!("error" in out));
  if ("error" in out) return;
  const data = out.data as { state: string };
  assertEquals(data.state, "on");
});

Deno.test("parseValvePayload — invalid state rejected", () => {
  const out = parseValvePayload({ device_external_id: "valve-1", state: "maybe" });
  assert("error" in out);
});

// ── battery_percent ─────────────────────────────────────────────────────────

Deno.test("parseSoilPayload — battery_percent accepted (integer)", () => {
  const out = parseSoilPayload({ ...BASE_SOIL, battery_percent: 87 });
  assert(!("error" in out));
  if ("error" in out) return;
  const data = out.data as { battery_percent?: number };
  assertEquals(data.battery_percent, 87);
});

Deno.test("parseSoilPayload — battery_percent fractional snapped to integer", () => {
  const out = parseSoilPayload({ ...BASE_SOIL, battery_percent: 73.6 });
  assert(!("error" in out));
  if ("error" in out) return;
  const data = out.data as { battery_percent?: number };
  assertEquals(data.battery_percent, 74);
});

Deno.test("parseSoilPayload — battery_percent boundary 0 + 100 accepted", () => {
  const low = parseSoilPayload({ ...BASE_SOIL, battery_percent: 0 });
  const high = parseSoilPayload({ ...BASE_SOIL, battery_percent: 100 });
  assert(!("error" in low));
  assert(!("error" in high));
});

Deno.test("parseSoilPayload — battery_percent above 100 rejected", () => {
  const out = parseSoilPayload({ ...BASE_SOIL, battery_percent: 150 });
  assert("error" in out);
  if ("error" in out) assertEquals(out.error, "battery_percent_out_of_range");
});

Deno.test("parseSoilPayload — battery_percent negative rejected", () => {
  const out = parseSoilPayload({ ...BASE_SOIL, battery_percent: -1 });
  assert("error" in out);
  if ("error" in out) assertEquals(out.error, "battery_percent_out_of_range");
});

Deno.test("parseSoilPayload — battery_percent non-numeric rejected", () => {
  const out = parseSoilPayload({ ...BASE_SOIL, battery_percent: "full" });
  assert("error" in out);
  if ("error" in out) assertEquals(out.error, "invalid_battery_percent");
});

Deno.test("parseSoilPayload — missing battery_percent is fine (optional)", () => {
  const out = parseSoilPayload(BASE_SOIL);
  assert(!("error" in out));
  if ("error" in out) return;
  const data = out.data as { battery_percent?: number };
  assertEquals(data.battery_percent, undefined);
});

Deno.test("parseValvePayload — battery_percent accepted", () => {
  const out = parseValvePayload({ device_external_id: "valve-1", state: "on", battery_percent: 62 });
  assert(!("error" in out));
  if ("error" in out) return;
  const data = out.data as { battery_percent?: number };
  assertEquals(data.battery_percent, 62);
});

Deno.test("parseValvePayload — battery_percent out of range rejected", () => {
  const out = parseValvePayload({ device_external_id: "valve-1", state: "on", battery_percent: 250 });
  assert("error" in out);
});

// ── extractAuth (webhook router) ─────────────────────────────────────────────

function makeReq(url: string, headers: Record<string, string> = {}): Request {
  return new Request(url, { method: "POST", headers });
}

Deno.test("extractAuth — path-based token", () => {
  const req = makeReq(
    "https://x.supabase.co/functions/v1/integrations-webhook-router/custom_http/abc123",
  );
  const out = extractAuth(req);
  assertEquals(out, { provider: "custom_http", token: "abc123" });
});

Deno.test("extractAuth — query-string token", () => {
  const req = makeReq(
    "https://x.supabase.co/functions/v1/integrations-webhook-router/custom_http?token=qsTok",
  );
  const out = extractAuth(req);
  assertEquals(out, { provider: "custom_http", token: "qsTok" });
});

Deno.test("extractAuth — header token wins over path", () => {
  const req = makeReq(
    "https://x.supabase.co/functions/v1/integrations-webhook-router/custom_http/pathTok",
    { "X-Rhozly-Token": "headerTok" },
  );
  const out = extractAuth(req);
  assertEquals(out, { provider: "custom_http", token: "headerTok" });
});

Deno.test("extractAuth — header token alone", () => {
  const req = makeReq(
    "https://x.supabase.co/functions/v1/integrations-webhook-router/custom_http",
    { "X-Rhozly-Token": "headerTok" },
  );
  const out = extractAuth(req);
  assertEquals(out, { provider: "custom_http", token: "headerTok" });
});

Deno.test("extractAuth — missing token returns null", () => {
  const req = makeReq(
    "https://x.supabase.co/functions/v1/integrations-webhook-router/custom_http",
  );
  const out = extractAuth(req);
  assertEquals(out, null);
});

Deno.test("extractAuth — missing provider returns null", () => {
  const req = makeReq("https://x.supabase.co/functions/v1/integrations-webhook-router");
  const out = extractAuth(req);
  assertEquals(out, null);
});
