import React from "react";
import { cn } from "../../lib/cn";

export interface PhotoGlowProps extends React.HTMLAttributes<HTMLDivElement> {
  /** The same image URL as the photo being wrapped. No glow renders when absent. */
  src?: string | null;
  /** Turn the halo off without unmounting the wrapper. Default true. */
  glow?: boolean;
  /** Extra classes for the blurred halo image (e.g. to tune opacity per surface). */
  glowClassName?: string;
}

/**
 * Ambient photo-derived glow (the YouTube-ambient-mode genre, static, no
 * canvas). Place around a plant photo so the photo's own colours halo behind
 * it — "green leads, colour follows": the garden supplies the colour, the UI
 * just lets it bleed.
 *
 * The blur is STATIC — rasterised once by the compositor, so it's cheap to
 * display — but each instance holds GPU memory for its blurred layer. Use a
 * few per viewport (a hero photo, a featured card), never on every card in a
 * long grid.
 *
 * The parent must NOT need `overflow-hidden` — the halo bleeding past the
 * photo edge is the point. Stacking: the wrapper is `isolate` (position alone
 * does NOT create a stacking context), which guarantees the -z-[1] halo stays
 * contained inside this component instead of escaping behind an opaque
 * ancestor's background and vanishing.
 */
export const PhotoGlow = React.forwardRef<HTMLDivElement, PhotoGlowProps>(function PhotoGlow(
  { src, glow = true, glowClassName, className, children, ...rest },
  ref,
) {
  return (
    <div ref={ref} className={cn("relative isolate", className)} {...rest}>
      {glow && src && (
        <img
          src={src}
          alt=""
          aria-hidden
          loading="lazy"
          draggable={false}
          className={cn(
            "absolute inset-0 -z-[1] h-full w-full scale-110 object-cover opacity-50 blur-2xl saturate-150 pointer-events-none select-none",
            glowClassName,
          )}
        />
      )}
      <div className="relative">{children}</div>
    </div>
  );
});
