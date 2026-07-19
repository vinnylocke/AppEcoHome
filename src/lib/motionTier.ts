export type MotionTier = "high" | "low" | "off";

/**
 * Device-aware motion budget for optional/decorative effects (particle bursts,
 * long stagger cascades, ambient layers). Load-bearing motion (spinners,
 * modal transitions) should NOT consult this — it is only for effects the UI
 * works without.
 *
 * - "off"  — user asked for reduced motion (or no DOM): render final states.
 * - "low"  — weak hardware (≤4GB RAM or ≤4 cores): cap particle counts,
 *            skip ambient layers, collapse stagger delays.
 * - "high" — full effect set.
 */
export function motionTier(): MotionTier {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "off";
  }
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return "off";
  }
  const nav = navigator as Navigator & { deviceMemory?: number };
  const lowMemory = nav.deviceMemory !== undefined && nav.deviceMemory <= 4;
  const lowCores =
    navigator.hardwareConcurrency !== undefined &&
    navigator.hardwareConcurrency <= 4;
  if (lowMemory || lowCores) {
    return "low";
  }
  return "high";
}
