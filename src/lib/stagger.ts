import type { CSSProperties } from "react";
import { motionTier, type MotionTier } from "./motionTier";

/**
 * The standard list-entrance classes to pair with {@link staggerStyle}.
 * Apply as `className={STAGGER_ENTRANCE}` on each staggered item.
 */
export const STAGGER_ENTRANCE = "animate-in fade-in slide-in-from-bottom-2";

export interface StaggerOptions {
  /** Delay between consecutive items, in milliseconds. Default 40. */
  stepMs?: number;
  /** Maximum effective index — items beyond it share the final delay. Default 6. */
  cap?: number;
  /**
   * Motion tier to honour. Defaults to `motionTier()` — injectable so tests
   * (and pure callers) can avoid touching `window.matchMedia`.
   */
  tier?: MotionTier;
}

/**
 * Inline style for staggered list entrances.
 *
 * Usage: `style={staggerStyle(i)} className={STAGGER_ENTRANCE}` — cap 6 keeps
 * the total sequence <= 240ms per the design-system stagger budget.
 *
 * Why inline longhands instead of a delay class: our `animate-in` utility uses
 * the `animation:` shorthand, which resets `animation-delay` and
 * `animation-fill-mode` to their initial values; inline style longhands win
 * the cascade over the class shorthand, and `fill-mode: backwards` is what
 * holds delayed items at the keyframe's `from` state instead of flashing
 * visible before their turn.
 *
 * Tier "off" returns `{}` — the element renders in place; the entrance
 * classes are zeroed by the reduced-motion CSS anyway.
 */
export function staggerStyle(index: number, opts: StaggerOptions = {}): CSSProperties {
  const { stepMs = 40, cap = 6, tier = motionTier() } = opts;
  if (tier === "off") {
    return {};
  }
  const clamped = Math.min(Math.max(index, 0), cap);
  return {
    animationDelay: `${clamped * stepMs}ms`,
    animationFillMode: "backwards",
  };
}
