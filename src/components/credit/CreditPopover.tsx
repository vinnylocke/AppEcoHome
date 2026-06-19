import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { ExternalLink, FileText, X } from "lucide-react";
import {
  type ImageCredit,
  PROVIDER_LABEL,
  PROVIDER_TINT,
} from "../../lib/imageCredit";

interface Props {
  credit: ImageCredit;
  /** Anchor element (DOM rect) used to position the popover. */
  anchorRect: DOMRect | null;
  onClose: () => void;
}

// ─── CreditPopover ─────────────────────────────────────────────────────
//
// Small portal panel that opens above/below the image credit badge. Shows
// provider, attribution, licence link, and a "view original" link when
// the provider gave us one. Tap outside or Esc to dismiss.

export default function CreditPopover({ credit, anchorRect, onClose }: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const onClick = (e: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  const PANEL_WIDTH = 280;
  const margin = 8;
  let left = 16;
  let top = 16;
  if (anchorRect) {
    const wantedLeft = anchorRect.left + (anchorRect.width / 2) - (PANEL_WIDTH / 2);
    const maxLeft = window.innerWidth - PANEL_WIDTH - margin;
    left = Math.max(margin, Math.min(wantedLeft, maxLeft));
    const belowTop = anchorRect.bottom + margin;
    // Estimate ~140px tall; flip above when not enough room below.
    const aboveTop = anchorRect.top - 140 - margin;
    top = belowTop + 140 + margin < window.innerHeight || aboveTop < margin
      ? belowTop
      : aboveTop;
  }

  return createPortal(
    <div
      ref={wrapperRef}
      role="dialog"
      aria-label="Image credit"
      style={{ top, left, width: PANEL_WIDTH }}
      className="fixed z-[200] bg-white rounded-2xl shadow-xl border border-rhozly-outline/15 p-3 animate-in fade-in zoom-in-95"
      data-testid="image-credit-popover"
      // The popover portals to <body> but is a React child of the trigger
      // button, so React events bubble back to it. Without this, clicking the
      // ✕ (or anything inside) re-fires the trigger's onClick and re-opens the
      // popover — making it impossible to close. Stop clicks here.
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest ${PROVIDER_TINT[credit.provider]}`}
        >
          {PROVIDER_LABEL[credit.provider]}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-md text-rhozly-on-surface/45 hover:bg-rhozly-surface-low"
          aria-label="Close credit"
        >
          <X size={12} />
        </button>
      </div>

      {credit.attribution && (
        <p className="text-xs font-bold text-rhozly-on-surface leading-snug mb-2">
          {credit.attribution}
        </p>
      )}

      {credit.license_name && (
        <p className="text-[11px] font-semibold text-rhozly-on-surface/65 mb-2">
          Licence: {credit.license_url ? (
            <a
              href={credit.license_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-rhozly-primary underline underline-offset-2 hover:opacity-80"
            >
              {credit.license_name}
            </a>
          ) : credit.license_name}
        </p>
      )}

      <div className="flex flex-col gap-1.5 mt-2">
        {credit.source_url && (
          <a
            href={credit.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] font-black text-rhozly-primary hover:opacity-80"
          >
            <ExternalLink size={11} /> View original
          </a>
        )}
        {credit.license_url && !credit.license_name && (
          <a
            href={credit.license_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] font-black text-rhozly-primary hover:opacity-80"
          >
            <FileText size={11} /> Licence terms
          </a>
        )}
        <Link
          to="/credits"
          className="inline-flex items-center gap-1 text-[10px] font-bold text-rhozly-on-surface/55 hover:text-rhozly-primary"
        >
          All image sources →
        </Link>
      </div>
    </div>,
    document.body,
  );
}
