import { assertEquals, assertStringIncludes } from "@std/assert";
import { controlValve } from "@shared/integrations/valveControl.ts";
import type { ControlCommand, DeviceRow, ProviderAdapter } from "@shared/integrations/contract.ts";

const DEVICE: DeviceRow = {
  id: "dev-1",
  external_device_id: "ext-1",
  name: "South Border valve",
  device_type: "water_valve",
  metadata: {},
  area_id: "area-1",
};
const CLOSE: ControlCommand = { kind: "valve_close" };
const OPEN: ControlCommand = { kind: "valve_open", duration_seconds: 900 };

function stubAdapter(control: ProviderAdapter["control"]): ProviderAdapter {
  return { provider: "custom_http", families: ["water_valve"], control } as unknown as ProviderAdapter;
}

// ─── Adapter branch (custom_http and any future provider) ────────────────────

Deno.test("VC-001: a provider with a control adapter dispatches to the adapter, not the fallback", async () => {
  let fallbackCalled = false;
  let controlArgs: { device: DeviceRow; command: ControlCommand } | null = null;
  const adapter = stubAdapter(async (device, command) => { controlArgs = { device, command }; });

  const res = await controlValve(
    "custom_http", DEVICE, OPEN, { control_url: "https://x" },
    () => { fallbackCalled = true; return Promise.resolve(true); },
    () => adapter,
  );

  assertEquals(res.ok, true);
  assertEquals(fallbackCalled, false); // the eWeLink fallback must NOT run for an adapter provider
  assertEquals(controlArgs!.command, OPEN);
  assertEquals(controlArgs!.device.id, "dev-1");
});

Deno.test("VC-002: adapter.control throwing surfaces {ok:false, error} and never touches the fallback", async () => {
  let fallbackCalled = false;
  const adapter = stubAdapter(() => { throw new Error("valve_not_controllable"); });

  const res = await controlValve(
    "custom_http", DEVICE, CLOSE, {},
    () => { fallbackCalled = true; return Promise.resolve(true); },
    () => adapter,
  );

  assertEquals(res.ok, false);
  assertStringIncludes(res.error ?? "", "valve_not_controllable");
  assertEquals(fallbackCalled, false);
});

// ─── Fallback branch (eWeLink / any non-adapter provider) ────────────────────

Deno.test("VC-003: no adapter → the eWeLink fallback runs and its success passes through", async () => {
  let fallbackCalled = false;
  const res = await controlValve(
    "ewelink", DEVICE, CLOSE, { accessToken: "tok" },
    () => { fallbackCalled = true; return Promise.resolve(true); },
    () => null,
  );
  assertEquals(fallbackCalled, true);
  assertEquals(res.ok, true);
});

Deno.test("VC-004: no adapter + fallback failure → {ok:false} with a provider-named error", async () => {
  const res = await controlValve(
    "ewelink", DEVICE, CLOSE, {},
    () => Promise.resolve(false),
    () => null,
  );
  assertEquals(res.ok, false);
  assertStringIncludes(res.error ?? "", "ewelink");
});

// ─── Real registry — the invariants the fix must hold ────────────────────────

Deno.test("VC-005: REAL registry — eWeLink has no adapter, so eWeLink valves keep the fallback path (unchanged behaviour)", async () => {
  let fallbackCalled = false;
  const res = await controlValve(
    "ewelink", DEVICE, CLOSE, { accessToken: "tok" },
    () => { fallbackCalled = true; return Promise.resolve(true); },
    // default getAdapter (real registry)
  );
  assertEquals(fallbackCalled, true);
  assertEquals(res.ok, true);
});

Deno.test("VC-006: REAL registry — a custom_http valve dispatches to its adapter, NOT the eWeLink fallback (the fix)", async () => {
  let fallbackCalled = false;
  // No control_url in creds → the real customHttp adapter throws
  // 'valve_not_controllable'. That the fallback never runs proves custom_http
  // now routes through the adapter contract instead of the eWeLink path.
  const res = await controlValve(
    "custom_http", DEVICE, CLOSE, {},
    () => { fallbackCalled = true; return Promise.resolve(true); },
    // default getAdapter (real registry)
  );
  assertEquals(fallbackCalled, false);
  assertEquals(res.ok, false);
  assertStringIncludes(res.error ?? "", "valve_not_controllable");
});
