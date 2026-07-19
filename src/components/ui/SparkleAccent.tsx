import React, { useState } from "react";
import { cn } from "../../lib/cn";

export interface SparkleAccentProps {
  children: React.ReactNode;
  /** Turn the stars off (e.g. while the AI result is still loading). Default true. */
  enabled?: boolean;
  className?: string;
}

interface StarSpec {
  top: string;
  left: string;
  size: number;
  colorClass: string;
  delayMs: number;
}

const STAR_COLORS = [
  "text-rhozly-primary-container",
  "text-rhozly-tertiary",
  "text-rhozly-primary-container",
];

function randomStars(): StarSpec[] {
  return STAR_COLORS.map((colorClass, i) => ({
    top: `${Math.random() * 80 - 20}%`,
    left: `${Math.random() * 106 - 6}%`,
    size: Math.round(Math.random() * 5 + 8),
    colorClass,
    delayMs: i * 600,
  }));
}

/**
 * The AI signature (brand: warm Linear-style sparkle text). Wraps a word or
 * short phrase and scatters three four-point stars around it, twinkling on a
 * staggered loop via `animate-sparkle`.
 *
 * Use at most ONE per screen, and only on genuine AI moments — the label of an
 * AI-generated insight, the "thinking" headline, the reveal of a Gemini result.
 * Sprinkling it on ordinary text dilutes the signal.
 *
 * Star positions are randomized once per mount (useState initializer) so
 * re-renders don't reshuffle them. Under reduced motion the stars are hidden
 * outright (`motion-reduce:hidden`) — the global reduced-motion CSS only
 * near-zeroes animation durations, which would otherwise leave three static
 * stars at the SVG's un-animated base state (visible), not invisible.
 */
export function SparkleAccent({ children, enabled = true, className }: SparkleAccentProps) {
  const [stars] = useState(randomStars);

  return (
    <span className={cn("relative inline-block", className)}>
      {children}
      {enabled &&
        stars.map((star, i) => (
          <svg
            key={i}
            aria-hidden
            viewBox="0 0 24 24"
            fill="currentColor"
            className={cn(
              "absolute animate-sparkle pointer-events-none motion-reduce:hidden",
              star.colorClass,
            )}
            style={{
              top: star.top,
              left: star.left,
              width: star.size,
              height: star.size,
              animationDelay: `${star.delayMs}ms`,
            }}
          >
            <path d="M12 0 L14.5 9.5 L24 12 L14.5 14.5 L12 24 L9.5 14.5 L0 12 L9.5 9.5 Z" />
          </svg>
        ))}
    </span>
  );
}
