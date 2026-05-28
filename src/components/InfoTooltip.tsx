// Persona-aware InfoTooltip — the canonical jargon-explainer component.
//
// Supports both legacy callers passing a `content` string and new
// callers passing JSX `children`. Existing usages keep working with
// zero migration; new surfaces can pass richer content (links,
// inline emphasis, multi-line explanations) via children.
//
// When the user has declared themselves "experienced" in the welcome
// flow, the trigger renders dimmed (~40% opacity) so it stays
// available without drawing attention. Newcomers (or users who never
// declared a persona) see the full-attention "?" icon.
//
// Set `alwaysShow` to opt a tooltip out of the persona dimming — use
// for critical fields you want everyone to notice (e.g. toxicity
// warnings).

import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HelpCircle, X } from "lucide-react";
import { usePersona } from "../hooks/usePersona";

interface Props {
  /** Legacy API — plain string body of the popover. */
  content?: string;
  /** Modern API — JSX body. Wins over `content` when both supplied. */
  children?: React.ReactNode;
  /** Optional aria-label override. Defaults to "More information". */
  label?: string;
  /** Forces the trigger to render at full attention even when the
   *  caller's persona is "experienced". */
  alwaysShow?: boolean;
  /** Trigger icon size in pixels. Legacy callers use a number; new
   *  callers can stick with the default. */
  size?: number;
  /** Optional className appended to the trigger. */
  className?: string;
  /** Where the popover anchors relative to the trigger. Default "bottom". */
  placement?: "top" | "bottom";
  /** Optional test id passed through to the trigger button. */
  "data-testid"?: string;
  // Legacy props — accepted for backwards compat but ignored. The new
  // popover uses createPortal + auto-positioning, so width/align are
  // managed internally.
  width?: "sm" | "md" | "lg";
  align?: "left" | "center" | "right";
}

export default function InfoTooltip({
  content,
  children,
  label = "More information",
  alwaysShow = false,
  size = 14,
  className = "",
  placement = "bottom",
  "data-testid": testId,
}: Props) {
  const persona = usePersona();
  const dimmed = !alwaysShow && persona === "experienced";

  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const popoverId = useId();

  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  const computePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const top = placement === "bottom"
      ? rect.bottom + 6 + window.scrollY
      : rect.top - 6 + window.scrollY;
    const left = rect.left + window.scrollX;
    setPosition({ top, left });
  }, [placement]);

  useEffect(() => {
    if (!open) return;
    computePosition();
    const onScroll = () => computePosition();
    const onResize = () => computePosition();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, computePosition]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (popoverRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const triggerColour = dimmed
    ? "text-rhozly-on-surface/30 hover:text-rhozly-on-surface/50"
    : "text-rhozly-on-surface/40 hover:text-rhozly-primary";

  const body = children ?? content;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? popoverId : undefined}
        data-testid={testId ?? "info-tooltip-trigger"}
        data-persona-dimmed={dimmed ? "true" : "false"}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
        className={`inline-flex items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-rhozly-primary/30 transition-colors ${triggerColour} ${className}`}
      >
        <HelpCircle size={size} aria-hidden="true" />
      </button>

      {open && position && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popoverRef}
            id={popoverId}
            role="tooltip"
            data-testid="info-tooltip-popover"
            style={{
              position: "absolute",
              top: position.top,
              left: position.left,
              maxWidth: "min(320px, calc(100vw - 32px))",
              transform: placement === "top" ? "translateY(-100%)" : undefined,
            }}
            className="z-[210] bg-white rounded-2xl shadow-2xl border border-rhozly-outline/15 p-4 animate-in fade-in zoom-in-95 duration-150"
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="absolute top-2 right-2 p-1 rounded-lg text-rhozly-on-surface/35 hover:text-rhozly-on-surface hover:bg-rhozly-surface transition-colors"
            >
              <X size={12} />
            </button>
            <div className="text-xs text-rhozly-on-surface/80 leading-relaxed pr-4">
              {body}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
