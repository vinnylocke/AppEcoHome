import { useSyncExternalStore } from "react";

/**
 * Live connectivity state (offline-first Phase 0/1).
 *
 * `useSyncExternalStore` on the window online/offline events — reading
 * `navigator.onLine` during render freezes the value until an unrelated
 * re-render, which is the bug that stranded the queued-actions badge.
 *
 * Note: `navigator.onLine === true` only means the device has a network
 * interface, not that the internet is reachable. It's reliable for the
 * OFFLINE case (false = definitely offline), which is what gating and the
 * banner care about.
 */
function subscribe(cb: () => void): () => void {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true, // SSR / no-navigator: assume online
  );
}

/**
 * Imperative check for event handlers (not hook-bound). Returns true when the
 * device is definitely offline. Pairs with `requireOnline` for gating.
 */
export function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}
