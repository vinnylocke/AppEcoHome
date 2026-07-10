// Provider-generic single-valve actuation.
//
// The automation valve-queue drain and the dead-man's-switch backstop both need
// to actuate a valve. Historically both hardcoded the eWeLink API, so a
// `custom_http` (DIY) valve could never be closed by either — the automation
// off-path and the safety backstop both silently no-op'd, leaving the valve
// stuck open (bug-audit-2026-07-10 #1/#2). This is the ONE dispatcher both call,
// so the two paths can't diverge again:
//   • provider has a registered control adapter (custom_http, and any future
//     provider) → actuate through the adapter contract (same code the manual
//     `integrations-adapter-control` path uses).
//   • no adapter (eWeLink and other legacy direct-wired providers) → the
//     caller's eWeLink fallback, unchanged.
//
// eWeLink behaviour is intentionally untouched: `getAdapter("ewelink")` returns
// null today, so eWeLink valves always take the fallback path exactly as before.

import { getAdapter } from "./registry.ts";
import type { ControlCommand, Creds, DeviceRow, ProviderAdapter } from "./contract.ts";

export interface ValveControlResult {
  ok: boolean;
  /** Failure reason for the queue/command row's `error_message`. */
  error?: string;
}

/**
 * Actuate one valve. `fireFallback` is the provider-specific path used when the
 * device's provider has no registered control adapter (i.e. eWeLink today) —
 * it's a lazy thunk so its eWeLink-only setup (region → apiBase, token) only
 * runs on that branch. `getAdapterFn` is injectable for tests.
 */
export async function controlValve(
  provider: string,
  device: DeviceRow,
  command: ControlCommand,
  creds: Creds,
  fireFallback: () => Promise<boolean>,
  getAdapterFn: (p: string) => ProviderAdapter | null = getAdapter,
): Promise<ValveControlResult> {
  const adapter = getAdapterFn(provider);
  if (adapter && typeof adapter.control === "function") {
    try {
      await adapter.control(device, command, creds);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
  const ok = await fireFallback();
  return { ok, error: ok ? undefined : `${provider || "ewelink"} control failed` };
}
