import { assert, assertEquals, assertRejects } from "@std/assert";
import {
  customHttpAdapter,
  isJsonContentType,
  parseHeaderBlock,
} from "@shared/integrations/adapters/customHttp.ts";
import type { ControlCommand, DeviceRow } from "@shared/integrations/contract.ts";

const VALVE: DeviceRow = {
  id: "dev-1",
  external_device_id: "garage-tap",
  name: "Garage tap",
  device_type: "water_valve",
  metadata: {},
  area_id: null,
};

const OPEN: ControlCommand = { kind: "valve_open", duration_seconds: 600 };
const CLOSE: ControlCommand = { kind: "valve_close" };

const creds = (over: Record<string, string> = {}) => ({
  control_url: "https://valve.example.com/control",
  control_method: "POST",
  control_headers: "Content-Type: application/json",
  control_body: '{"command":"{{command}}","duration_seconds":{{duration_seconds}}}',
  ...over,
});

/** Run `fn` with `fetch` stubbed; returns the captured request + restores fetch. */
async function withFetch(
  responder: (url: string, init: RequestInit) => Response | Promise<Response>,
  fn: () => Promise<void>,
): Promise<{ url: string; init: RequestInit } | null> {
  const original = globalThis.fetch;
  let captured: { url: string; init: RequestInit } | null = null;
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    captured = { url: String(input), init: init ?? {} };
    return Promise.resolve(responder(String(input), init ?? {}));
  }) as typeof fetch;
  try {
    await fn();
  } finally {
    globalThis.fetch = original;
  }
  return captured;
}

// ── helpers ─────────────────────────────────────────────────────────────────

Deno.test("parseHeaderBlock — parses Key: Value lines", () => {
  const r = parseHeaderBlock("Content-Type: application/json\nX-API-Key: abc");
  assert(!("error" in r));
  if (!("error" in r)) {
    assertEquals(r.headers["Content-Type"], "application/json");
    assertEquals(r.headers["X-API-Key"], "abc");
  }
});

Deno.test("parseHeaderBlock — rejects a malformed line", () => {
  const r = parseHeaderBlock("no-colon-here");
  assert("error" in r);
});

Deno.test("isJsonContentType — case-insensitive", () => {
  assert(isJsonContentType({ "content-type": "application/json; charset=utf-8" }));
  assert(!isJsonContentType({ "Content-Type": "text/plain" }));
});

// ── control() ───────────────────────────────────────────────────────────────

Deno.test("control — rejects a valve with no control_url", async () => {
  await assertRejects(
    () => customHttpAdapter.control!(VALVE, OPEN, {}),
    Error,
    "valve_not_controllable",
  );
});

Deno.test("control — rejects an http (non-https) url", async () => {
  await assertRejects(
    () => customHttpAdapter.control!(VALVE, OPEN, creds({ control_url: "http://valve.example.com" })),
    Error,
    "url_must_be_https",
  );
});

Deno.test("control — POSTs the rendered body + headers on valve_open", async () => {
  const captured = await withFetch(
    () => new Response("ok", { status: 200 }),
    async () => { await customHttpAdapter.control!(VALVE, OPEN, creds({ control_headers: "Content-Type: application/json\nX-API-Key: secret-123" })); },
  );
  assert(captured);
  assertEquals(captured!.url, "https://valve.example.com/control");
  assertEquals(captured!.init.method, "POST");
  const hdrs = captured!.init.headers as Record<string, string>;
  assertEquals(hdrs["X-API-Key"], "secret-123");
  assertEquals(captured!.init.body, '{"command":"turn_on","duration_seconds":600}');
});

Deno.test("control — valve_close sends turn_off with duration 0", async () => {
  const captured = await withFetch(
    () => new Response(null, { status: 204 }),
    async () => { await customHttpAdapter.control!(VALVE, CLOSE, creds()); },
  );
  assertEquals(captured!.init.body, '{"command":"turn_off","duration_seconds":0}');
});

Deno.test("control — surfaces a non-2xx response", async () => {
  await withFetch(
    () => new Response("nope", { status: 503 }),
    async () => {
      await assertRejects(
        () => customHttpAdapter.control!(VALVE, OPEN, creds()),
        Error,
        "control_request_failed: 503",
      );
    },
  );
});

Deno.test("control — passes redirect:manual so a redirect can't bypass the SSRF host check (bug-audit-2026-07-10 #9)", async () => {
  const captured = await withFetch(
    () => new Response("ok", { status: 200 }),
    async () => { await customHttpAdapter.control!(VALVE, OPEN, creds()); },
  );
  assertEquals(captured!.init.redirect, "manual");
});

Deno.test("control — a redirect response is treated as a failure, not followed", async () => {
  await withFetch(
    // With redirect:manual the runtime yields an opaque redirect (status 0 /
    // !ok); a 3xx here likewise fails the !res.ok check rather than chasing the
    // Location to an internal address.
    () => new Response(null, { status: 302, headers: { Location: "http://169.254.169.254/latest/meta-data/" } }),
    async () => {
      await assertRejects(
        () => customHttpAdapter.control!(VALVE, OPEN, creds()),
        Error,
        "control_request_failed",
      );
    },
  );
});

Deno.test("control — rejects an unknown template variable", async () => {
  await assertRejects(
    () => customHttpAdapter.control!(VALVE, OPEN, creds({ control_body: '{"d":{{durtion}}}' })),
    Error,
    "unknown_template_variable: durtion",
  );
});

// ── connect() control config ─────────────────────────────────────────────────

Deno.test("connect — stores control creds + marks the valve controllable", async () => {
  const res = await customHttpAdapter.connect({
    homeId: "home-1",
    fields: {
      friendly_name: "Garage tap",
      family: "water_valve",
      control_url: "https://valve.example.com/control",
    },
  });
  assertEquals(res.credsToStore.control_url, "https://valve.example.com/control");
  assert((res.devices[0].metadata as { controllable?: boolean }).controllable === true);
});

Deno.test("connect — a valve with no control_url stays read-only", async () => {
  const res = await customHttpAdapter.connect({
    homeId: "home-1",
    fields: { friendly_name: "Garage tap", family: "water_valve" },
  });
  assertEquals(Object.keys(res.credsToStore).length, 0);
  assert((res.devices[0].metadata as { controllable?: boolean }).controllable !== true);
});

Deno.test("connect — rejects a non-https control url", async () => {
  await assertRejects(
    () => customHttpAdapter.connect({
      homeId: "home-1",
      fields: { friendly_name: "v", family: "water_valve", control_url: "http://valve.example.com" },
    }),
    Error,
    "url_must_be_https",
  );
});

Deno.test("connect — rejects a non-JSON body under a JSON content type", async () => {
  await assertRejects(
    () => customHttpAdapter.connect({
      homeId: "home-1",
      fields: {
        friendly_name: "v",
        family: "water_valve",
        control_url: "https://valve.example.com",
        control_body: "command={{command}}",
      },
    }),
    Error,
    "control_body_not_json",
  );
});
