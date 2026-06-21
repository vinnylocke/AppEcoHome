import React from "react";
import { Info } from "lucide-react";

const DEFAULT_TEXT =
  "Images are a guide and may not match exactly — AI-generated and web photos can vary, while " +
  "images from our plant databases (Perenual, Verdantly) are verified for the species.";

/**
 * A soft note that non-database images are illustrative. Photos from our plant
 * APIs (Perenual / Verdantly) are verified for the species; AI-generated and
 * web-sourced images are a guide and may not exactly match the plant or search.
 * Shown wherever a user browses plant images (search results, detail views).
 *
 * Pass `text` to override the copy for contexts with different image sources —
 * e.g. the chat gallery, whose photos come from the web (Wikipedia / Unsplash /
 * Pixabay) rather than our verified plant databases.
 */
export default function ImageDisclaimer({
  className = "",
  text = DEFAULT_TEXT,
}: {
  className?: string;
  text?: string;
}) {
  return (
    <p
      data-testid="image-disclaimer"
      className={`flex items-start gap-1.5 text-[11px] font-medium text-rhozly-on-surface/45 ${className}`}
    >
      <Info size={12} className="shrink-0 mt-0.5" />
      <span>{text}</span>
    </p>
  );
}
