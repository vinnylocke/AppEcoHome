// AI Plant Overhaul Wave 6 — source-state chip for AI plants
//
// Shows whether an AI plant is currently following the auto-updating
// catalogue or has been customised. Renders nothing for non-AI plants
// (the existing source badges in TheShed already cover Perenual / Verdantly
// / manual).
//
// State is derived from `overridden_fields`:
//   - null / empty array         → "AI · Auto-updating catalogue" (amber)
//   - non-empty array            → "AI · Custom (your edits)" (purple)

import React from "react";
import { Sparkles, Edit3 } from "lucide-react";

interface SourceChipProps {
  source: string | null | undefined;
  overriddenFields: string[] | null | undefined;
  className?: string;
}

export default function SourceChip({
  source,
  overriddenFields,
  className = "",
}: SourceChipProps) {
  if (source !== "ai") return null;

  const isCustom = Array.isArray(overriddenFields) && overriddenFields.length > 0;

  if (isCustom) {
    return (
      <span
        data-testid="ai-source-chip-custom"
        className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-full bg-purple-100 text-purple-700 border border-purple-200 ${className}`}
      >
        <Edit3 size={10} />
        AI · Custom
      </span>
    );
  }

  return (
    <span
      data-testid="ai-source-chip-catalogue"
      className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-full bg-amber-100 text-amber-700 border border-amber-200 ${className}`}
    >
      <Sparkles size={10} />
      AI · Auto-updating catalogue
    </span>
  );
}
