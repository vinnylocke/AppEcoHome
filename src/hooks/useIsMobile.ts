import { Capacitor } from "@capacitor/core";
import { useSyncExternalStore } from "react";

/**
 * Mobile-detection hook. Returns true when:
 *  - the app is running natively (iOS/Android Capacitor wrapper), OR
 *  - the viewport is narrower than 768px (matches Tailwind `md`).
 *
 * Used by App.tsx for routing-level decisions (e.g. focus-mode gating for
 * Garden Walk / the planting calendar). The `/` redirect now targets
 * `/dashboard` on both platforms — the one responsive home — so it no longer
 * branches on this. Single source of truth for routing-level decisions;
 * visual decisions still use Tailwind `md:` utilities for layout.
 */
const MOBILE_MAX_WIDTH = 768;

function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("resize", callback);
  return () => window.removeEventListener("resize", callback);
}

function getSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  return window.innerWidth < MOBILE_MAX_WIDTH;
}

function getServerSnapshot(): boolean {
  return false;
}

export function useIsMobile(): boolean {
  const isNative = Capacitor.isNativePlatform();
  const isNarrow = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return isNative || isNarrow;
}
