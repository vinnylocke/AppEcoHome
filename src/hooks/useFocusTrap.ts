import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(",");

interface FocusTrapOptions {
  /** When true, focuses the first focusable child on activate. Defaults to true. */
  autoFocus?: boolean;
  /** When true, restores focus to the previously focused element on deactivate. Defaults to true. */
  restoreFocus?: boolean;
}

/**
 * Traps Tab focus inside the element returned by the returned ref while `active` is true.
 * On activate: focuses the first focusable child (unless `autoFocus: false`).
 * On deactivate: returns focus to whatever was focused when the trap engaged (unless `restoreFocus: false`).
 *
 * Pass `autoFocus: false` when the caller already manages initial focus (e.g. ConfirmModal
 * focuses the cancel button for destructive actions).
 *
 * Usage:
 *   const trapRef = useFocusTrap<HTMLDivElement>(isModalOpen);
 *   return <div ref={trapRef}> ...modal content... </div>;
 */
export function useFocusTrap<T extends HTMLElement = HTMLDivElement>(
  active: boolean,
  options: FocusTrapOptions = {},
): RefObject<T | null> {
  const { autoFocus = true, restoreFocus = true } = options;
  const containerRef = useRef<T | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;

    let focusTimer = 0;
    if (autoFocus) {
      const focusables = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      const initial = focusables[0] ?? container;
      if (initial === container && !container.hasAttribute("tabindex")) {
        container.setAttribute("tabindex", "-1");
      }
      focusTimer = window.setTimeout(() => initial.focus(), 0);
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const els = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => !el.hasAttribute("disabled") && el.offsetParent !== null);
      if (els.length === 0) {
        e.preventDefault();
        return;
      }
      const first = els[0];
      const last = els[els.length - 1];
      const activeEl = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (activeEl === first || !container.contains(activeEl))) {
        last.focus();
        e.preventDefault();
      } else if (!e.shiftKey && (activeEl === last || !container.contains(activeEl))) {
        first.focus();
        e.preventDefault();
      }
    };

    container.addEventListener("keydown", handleKeyDown);
    return () => {
      if (focusTimer) window.clearTimeout(focusTimer);
      container.removeEventListener("keydown", handleKeyDown);
      if (restoreFocus) {
        const target = previouslyFocusedRef.current;
        if (target && typeof target.focus === "function") {
          target.focus();
        }
      }
    };
  }, [active, autoFocus, restoreFocus]);

  return containerRef;
}
