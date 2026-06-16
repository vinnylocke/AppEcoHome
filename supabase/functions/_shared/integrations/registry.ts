/**
 * Adapter registry — the single place new providers register their
 * `ProviderAdapter` implementation. The Connect wizard, the shared
 * poll cron, and the webhook router all look up adapters here so
 * adding a new provider doesn't require touching any of those
 * surfaces.
 *
 * 2026-06-16 Phase 2 — first iteration. Only the new `custom_http`
 * adapter is registered today; Ecowitt and eWeLink still ship as
 * direct edge functions. They'll be migrated to adapters in a
 * follow-up — the contract is designed to fit what they already do.
 */

import type { DeviceFamily, ProviderAdapter } from "./contract.ts";
import { customHttpAdapter } from "./adapters/customHttp.ts";

const ADAPTERS: Record<string, ProviderAdapter> = {
  [customHttpAdapter.provider]: customHttpAdapter,
};

/** Look up an adapter by `integrations.provider`. Returns null when
 *  the provider isn't registered (handled gracefully — legacy
 *  ecowitt / ewelink providers go to their existing edge functions). */
export function getAdapter(provider: string): ProviderAdapter | null {
  return ADAPTERS[provider] ?? null;
}

/** All registered adapters. Used by the Connect wizard's brand picker. */
export function listAdapters(): ProviderAdapter[] {
  return Object.values(ADAPTERS);
}

/** All registered adapters that support the given device family. */
export function listAdaptersForFamily(family: DeviceFamily): ProviderAdapter[] {
  return listAdapters().filter((a) => a.families.includes(family));
}
