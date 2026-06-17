/**
 * How Rhozly actuates a given water valve, by provider.
 *
 *  - "ewelink"  → live state + control via the eWeLink edge functions.
 *  - "custom"   → custom_http valve with a control endpoint configured →
 *                 control via the generic `integrations-adapter-control`
 *                 dispatcher; state read from `device_readings`.
 *  - "readonly" → no control path (custom valve without a control URL, or
 *                 any other provider) → show reported state only.
 *
 * Single source of truth so the valve panel never hard-codes a provider.
 */
export type ValveControlMode = "ewelink" | "custom" | "readonly";

export function valveControlMode(provider: string, controllable: boolean): ValveControlMode {
  if (provider === "ewelink") return "ewelink";
  if (controllable) return "custom";
  return "readonly";
}
