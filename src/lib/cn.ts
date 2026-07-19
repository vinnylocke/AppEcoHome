import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// tailwind-merge only knows the stock Tailwind scale, so the custom radius
// tokens (rounded-card/control/chip) would not be recognised as border-radius
// conflicts — a consumer's `rounded-*` override would keep BOTH classes and
// leave the winner to stylesheet emit order. Registering them makes overrides
// deterministic. (shadow-* and text-* custom tokens already merge correctly.)
const RADIUS_TOKENS = ["card", "control", "chip"];
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      rounded: [{ rounded: RADIUS_TOKENS }],
      "rounded-t": [{ "rounded-t": RADIUS_TOKENS }],
      "rounded-b": [{ "rounded-b": RADIUS_TOKENS }],
      "rounded-l": [{ "rounded-l": RADIUS_TOKENS }],
      "rounded-r": [{ "rounded-r": RADIUS_TOKENS }],
    },
  },
});

/**
 * Class-name combiner for the `src/components/ui/` primitive tier: clsx for
 * conditional composition, tailwind-merge so a consumer's `className` can
 * override a primitive's defaults without `!important`.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
