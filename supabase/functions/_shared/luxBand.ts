/**
 * Translate a measured light intensity (`areas.light_intensity_lux`)
 * into a horticultural sunlight band for AI grounding lines.
 *
 * Bands:
 *   < 10,000 lux   → "low"
 *   10,000–24,999  → "moderate"
 *   25,000–44,999  → "bright"
 *   ≥ 45,000       → "full sun"
 *
 * Single shared source — every AI context builder that grounds on
 * area sunlight imports from here (no per-function copies).
 */

export type LuxBand = "low" | "moderate" | "bright" | "full sun";

export function luxBand(lux: number): LuxBand {
  if (lux < 10_000) return "low";
  if (lux < 25_000) return "moderate";
  if (lux < 45_000) return "bright";
  return "full sun";
}

/**
 * Render the grounding label, e.g. "bright (35000 lux measured)".
 * Returns null when no valid reading exists — callers skip the line.
 */
export function luxBandLabel(lux: number | null | undefined): string | null {
  if (lux == null || typeof lux !== "number" || !Number.isFinite(lux) || lux < 0) {
    return null;
  }
  return `${luxBand(lux)} (${Math.round(lux)} lux measured)`;
}
