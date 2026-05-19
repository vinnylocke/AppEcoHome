import { useCallback, useEffect, useState } from "react";

const LS_KEY = "rhozly_high_contrast";
const HTML_CLASS = "high-contrast";

function readInitial(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(LS_KEY) === "1";
  } catch {
    return false;
  }
}

function applyClass(enabled: boolean) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (enabled) root.classList.add(HTML_CLASS);
  else root.classList.remove(HTML_CLASS);
}

/**
 * High-contrast mode toggle backed by localStorage. Adds/removes the
 * `.high-contrast` class on <html>; CSS in index.css overrides low-opacity
 * text colours with solid tones when the class is present.
 */
export function useHighContrast(): [boolean, (next: boolean) => void] {
  const [enabled, setEnabled] = useState<boolean>(readInitial);

  useEffect(() => {
    applyClass(enabled);
  }, [enabled]);

  const update = useCallback((next: boolean) => {
    try {
      localStorage.setItem(LS_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
    setEnabled(next);
  }, []);

  return [enabled, update];
}

/**
 * Applies the persisted high-contrast preference to <html> as early as possible.
 * Call once from the app root so the class is on the document before any paint.
 */
export function bootstrapHighContrast() {
  applyClass(readInitial());
}
