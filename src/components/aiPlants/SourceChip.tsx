// AI plant source-state chip
//
// Shows whether an AI plant is auto-updating (default) or has been edited
// by the user (purple). Renders nothing for non-AI plants (the existing
// source badges in TheShed already cover Perenual / Verdantly / manual).
//
// State is derived from `overridden_fields`:
//   - null / empty array → "AI"        (amber, auto-updating care guide)
//   - non-empty array    → "AI · Edited" (purple, user has customised)

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
        title="You've edited this plant — its care guide no longer auto-updates"
        className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-full bg-purple-100 text-purple-700 border border-purple-200 ${className}`}
      >
        <Edit3 size={10} />
        AI · Edited
      </span>
    );
  }

  return (
    <span
      data-testid="ai-source-chip-catalogue"
      title="Care guide refreshes automatically when new info is available"
      className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-full bg-amber-100 text-amber-700 border border-amber-200 ${className}`}
    >
      <Sparkles size={10} />
      AI
    </span>
  );
}
