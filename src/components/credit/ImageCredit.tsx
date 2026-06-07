import React, { useRef, useState } from "react";
import { Info } from "lucide-react";
import {
  type ImageCredit as ImageCreditModel,
  PROVIDER_LABEL,
  PROVIDER_TINT,
  coerceImageCredit,
  isKnownCredit,
} from "../../lib/imageCredit";
import CreditPopover from "./CreditPopover";

interface Props {
  /** Raw value from the DB / API. Accepts the unified shape OR null/undefined
   *  for legacy rows — the badge then dims and links to /credits. */
  credit: ImageCreditModel | null | undefined | unknown;
  /**
   *  - overlay  → tiny absolutely-positioned pill, bottom-right of an image
   *  - inline   → small italic line below an image (no popover trigger if anchor needed)
   *  - badge-only → just the icon, no provider label
   */
  variant?: "overlay" | "inline" | "badge-only";
  className?: string;
}

// ─── ImageCredit ───────────────────────────────────────────────────────
//
// The user-facing licence / attribution badge for every image in the
// app. Wraps a tap to open <CreditPopover>. Designed so that even when
// the credit is null/unknown, the badge stays present and routes to
// /credits as the umbrella attribution surface.

export default function ImageCredit({
  credit,
  variant = "overlay",
  className,
}: Props) {
  const normalised = coerceImageCredit(credit) ?? { provider: "unknown" as const };
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const open = !!anchorRect;

  const labelText = PROVIDER_LABEL[normalised.provider];
  const tintClass = PROVIDER_TINT[normalised.provider];
  const dimWhenUnknown = !isKnownCredit(normalised) ? "opacity-80" : "";

  const onClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!triggerRef.current) return;
    setAnchorRect(triggerRef.current.getBoundingClientRect());
  };

  if (variant === "inline") {
    return (
      <button
        ref={triggerRef}
        type="button"
        onClick={onClick}
        aria-label={`Image source: ${labelText}`}
        className={`inline-flex items-center gap-1 text-[10px] font-bold ${tintClass} px-1.5 py-0.5 rounded-md ${dimWhenUnknown} hover:opacity-95 ${className ?? ""}`}
        data-testid="image-credit-inline"
      >
        <Info size={10} />
        <span>via {labelText}</span>
        {open && <CreditPopover credit={normalised} anchorRect={anchorRect} onClose={() => setAnchorRect(null)} />}
      </button>
    );
  }

  if (variant === "badge-only") {
    return (
      <button
        ref={triggerRef}
        type="button"
        onClick={onClick}
        aria-label={`Image source: ${labelText}`}
        title={`Image source: ${labelText}`}
        className={`inline-flex items-center justify-center w-5 h-5 rounded-full ${tintClass} ${dimWhenUnknown} ring-1 ring-white/40 hover:scale-105 transition-transform ${className ?? ""}`}
        data-testid="image-credit-badge"
      >
        <Info size={10} />
        {open && <CreditPopover credit={normalised} anchorRect={anchorRect} onClose={() => setAnchorRect(null)} />}
      </button>
    );
  }

  // overlay — default
  return (
    <button
      ref={triggerRef}
      type="button"
      onClick={onClick}
      aria-label={`Image source: ${labelText}`}
      className={`absolute z-10 bottom-1.5 right-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest ${tintClass} ${dimWhenUnknown} ring-1 ring-white/40 backdrop-blur-sm hover:opacity-95 transition-opacity ${className ?? ""}`}
      data-testid="image-credit-overlay"
    >
      <Info size={9} />
      <span>{labelText}</span>
      {open && <CreditPopover credit={normalised} anchorRect={anchorRect} onClose={() => setAnchorRect(null)} />}
    </button>
  );
}
