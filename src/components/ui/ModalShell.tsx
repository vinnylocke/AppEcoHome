import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { cn } from "../../lib/cn";
import { Z } from "./zIndex";

// Stack of currently-open shells, oldest first. Escape must only close the
// TOPMOST shell — without this, one keypress would dispatch to every mounted
// shell's document listener and collapse the whole stack at once.
const openShellStack: symbol[] = [];

export type ModalShellSize = "sm" | "md" | "lg";

export interface ModalShellProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Dialog semantics for the panel. Use "alertdialog" for confirm-style interruptions. */
  role?: "dialog" | "alertdialog";
  /** id of the heading element inside `children` that titles the dialog. */
  "aria-labelledby"?: string;
  /** Accessible name when there is no visible heading to point `aria-labelledby` at. */
  "aria-label"?: string;
  /** Panel width cap: sm = max-w-sm, md = max-w-md, lg = max-w-2xl. */
  size?: ModalShellSize;
  /** Bottom-sheet presentation on small screens (centered dialog from `sm:` up). */
  sheet?: boolean;
  /** Right-anchored, full-height side drawer (a tray). Overrides `sheet`/`size`. */
  drawer?: boolean;
  /** Stacking level — pass a `Z` constant from ./zIndex. */
  z?: number;
  /** Close when the dimmed backdrop itself is clicked. */
  closeOnOverlay?: boolean;
  /** Focus the first focusable child on open (passed to useFocusTrap). */
  autoFocus?: boolean;
  /** Extra classes for the PANEL (not the overlay). */
  className?: string;
  "data-testid"?: string;
}

const SIZE_CLASSES: Record<ModalShellSize, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-2xl",
};

/**
 * The house modal shell — ConfirmModal's overlay/panel contract extracted so
 * every new dialog gets the same portal, backdrop, focus trap, Escape-to-close,
 * and entrance motion for free. Compose your own header/body/footer as
 * `children`; ModalShell owns only the chrome.
 *
 * The overlay's literal classes `fixed inset-0 justify-center items-center`
 * are load-bearing: the global scroll-lock CSS in src/index.css is
 * `body:has(.fixed.inset-0.justify-center.items-center)` and matches on
 * exactly those class names — never rename or drop them.
 *
 * Sheet mode pins to the bottom via `self-end` on the PANEL while the
 * container keeps `items-center` — deliberate, so the scroll-lock `:has()`
 * selector still matches; do not move positioning to the container.
 *
 * Focus restore on close is handled by useFocusTrap's `restoreFocus` default.
 */
export const ModalShell: React.FC<ModalShellProps> = ({
  isOpen,
  onClose,
  children,
  role = "dialog",
  "aria-labelledby": ariaLabelledBy,
  "aria-label": ariaLabel,
  size = "md",
  sheet = false,
  drawer = false,
  z = Z.modal,
  closeOnOverlay = true,
  autoFocus = true,
  className,
  "data-testid": dataTestId,
}) => {
  const trapRef = useFocusTrap<HTMLDivElement>(isOpen, { autoFocus });
  const shellIdRef = useRef<symbol | null>(null);
  // Overlay clicks only close when the press ALSO started on the overlay —
  // a `click` fires on the common ancestor of mousedown+mouseup, so without
  // this a text-selection drag that ends on the backdrop would close the
  // dialog mid-edit.
  const pressStartedOnOverlayRef = useRef(false);

  useEffect(() => {
    if (!isOpen) return;

    const shellId = Symbol("modal-shell");
    shellIdRef.current = shellId;
    openShellStack.push(shellId);

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (openShellStack[openShellStack.length - 1] !== shellId) return;
      onClose();
    };

    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("keydown", handleEscape);
      const idx = openShellStack.indexOf(shellId);
      if (idx !== -1) openShellStack.splice(idx, 1);
    };
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 flex justify-center items-center p-4 bg-rhozly-bg/80 backdrop-blur-sm animate-in fade-in duration-200"
      style={{ zIndex: z }}
      onMouseDown={(e) => {
        pressStartedOnOverlayRef.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && pressStartedOnOverlayRef.current && closeOnOverlay) {
          onClose();
        }
      }}
    >
      <div
        ref={trapRef}
        role={role}
        aria-modal="true"
        aria-labelledby={ariaLabelledBy}
        aria-label={ariaLabel}
        data-testid={dataTestId}
        className={cn(
          "bg-rhozly-surface-lowest border border-rhozly-outline/20 shadow-overlay w-full overflow-y-auto animate-in duration-200",
          // Drawer: a right-anchored, full-height tray. The negative margins
          // cancel the overlay's p-4 so it touches the top/bottom/right edges;
          // `self-stretch` overrides the container's items-center; it slides in
          // from the right instead of zooming. Keeps the load-bearing overlay
          // classes (justify-center items-center) intact for the scroll-lock.
          drawer
            ? "self-stretch ml-auto -my-4 -mr-4 min-h-full max-h-none max-w-md rounded-l-card rounded-r-none slide-in-from-right"
            : cn(
                "max-h-[85dvh] rounded-card zoom-in-95",
                SIZE_CLASSES[size],
                sheet &&
                  "self-end sm:self-center rounded-b-none rounded-t-card sm:rounded-card sm:rounded-b-card slide-in-from-bottom-4",
              ),
          className,
        )}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
};
