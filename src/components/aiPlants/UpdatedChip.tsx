// AI Plant Overhaul Wave 5 — small "Updated" pill
//
// Appears on Shed cards + inside the freshness callout in the edit modals
// whenever a global AI plant's catalogue version is ahead of the user's ack.
// Renders nothing when count = 0 so callers can drop it inline.

import React from "react";
import { Sparkles } from "lucide-react";

interface UpdatedChipProps {
  count: number;
  onClick?: (e: React.MouseEvent) => void;
  /** Tighter variant for card overlays. Default: standard. */
  size?: "sm" | "md";
  className?: string;
}

export default function UpdatedChip({
  count,
  onClick,
  size = "md",
  className = "",
}: UpdatedChipProps) {
  if (count <= 0) return null;

  const sizeClasses =
    size === "sm"
      ? "text-[9px] px-1.5 py-0.5 gap-0.5"
      : "text-[10px] px-2 py-1 gap-1";

  const label = count === 1 ? "1 field updated" : `${count} fields updated`;

  const Component = onClick ? "button" : "span";

  return (
    <Component
      data-testid="ai-updated-chip"
      onClick={onClick}
      className={`inline-flex items-center ${sizeClasses} font-black uppercase tracking-widest rounded-full bg-amber-100 text-amber-700 border border-amber-200 ${onClick ? "hover:bg-amber-200 transition-colors cursor-pointer" : ""} ${className}`}
      aria-label={label}
    >
      <Sparkles size={size === "sm" ? 9 : 11} />
      {label}
    </Component>
  );
}
