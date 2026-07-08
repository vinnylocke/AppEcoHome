import { lazy, type ComponentType } from "react";

/**
 * `React.lazy` with import retries (offline-first Phase 2).
 *
 * A code-split route chunk can transiently fail to load — the service worker
 * may still be settling, or a navigation preload raced the precache lookup.
 * Plain `lazy(() => import(...))` surfaces that first failure straight to the
 * error boundary ("Something went wrong"). This wrapper retries the import a
 * few times with a short backoff, which resolves the transient case from the
 * SW precache (the chunk IS cached — it just wasn't served on the first try).
 *
 * We do NOT force a page reload here — `main.tsx`'s chunk-error handler owns
 * the online-only stale-chunk reload, and reloading offline lands on a blank
 * screen. If every retry fails (genuinely uncached offline), the rejection
 * propagates to the route error boundary as before — no worse than today,
 * and the far more common transient miss now recovers.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  attempts = 3,
  delayMs = 350,
) {
  return lazy(async () => {
    let lastErr: unknown;
    for (let i = 0; i < attempts; i++) {
      try {
        return await factory();
      } catch (err) {
        lastErr = err;
        // Backoff before retrying — gives the SW a beat to serve from cache.
        await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
      }
    }
    throw lastErr;
  });
}
