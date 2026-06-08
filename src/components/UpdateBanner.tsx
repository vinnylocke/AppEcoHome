import React, { useEffect, useRef, useState } from "react";

const COUNTDOWN_SECONDS = 3;

/**
 * SW-aware reload. Prefers `skipWaiting` + `controllerchange` so a
 * newly-installed waiting worker activates BEFORE we navigate — without
 * this, a plain `window.location.reload()` can land back on the old SW
 * (the waiting worker doesn't activate until every client unloads) and
 * the user has to close + re-open the app to see the new bundle.
 *
 * Falls back to `window.location.reload()` after a 1.5s timeout in case
 * `controllerchange` never fires (no SW, or the new worker activated
 * silently while we weren't looking).
 */
async function reloadWithSwActivation() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    window.location.reload();
    return;
  }
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg?.waiting) {
      window.location.reload();
      return;
    }
    const fallback = window.setTimeout(() => window.location.reload(), 1500);
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      () => {
        clearTimeout(fallback);
        window.location.reload();
      },
      { once: true },
    );
    reg.waiting.postMessage({ type: "SKIP_WAITING" });
  } catch {
    window.location.reload();
  }
}

/**
 * Mandatory "Updating Rhozly OS…" banner with a short non-cancellable
 * countdown. Updates are non-negotiable — when a new bundle is available
 * the user is given a few seconds of "we're about to reload" feedback,
 * then the reload fires automatically.
 *
 * Trigger: any `pwa-update-available` event on the window. Two paths
 * dispatch this event:
 *   1. The service worker's `onNeedRefresh` callback (`src/main.tsx`).
 *      Detail provides `reload` — workbox's `updateSW(true)` path.
 *   2. `useAppVersion` when polling spots a `bundleVersion < dbVersion`
 *      mismatch (catches the case where the SW is asleep). Detail is
 *      empty — banner uses its own SW-aware reload.
 *
 * We prefer the detail.reload if it's provided (the SW path knows about
 * itself best), and fall back to `reloadWithSwActivation()` otherwise.
 */
export default function UpdateBanner() {
  const [visible, setVisible] = useState(false);
  const [reloadFn, setReloadFn] = useState<(() => void) | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);

  // Tracks whether we've already captured a reload fn. The first
  // dispatch with a non-null detail.reload wins — typically the SW
  // path. If only the empty-detail (polling) dispatch fires, reloadFn
  // stays null and the countdown handler uses the SW-aware fallback.
  const reloadFnLocked = useRef(false);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ reload?: () => void }>).detail;
      if (!reloadFnLocked.current && typeof detail?.reload === "function") {
        setReloadFn(() => detail.reload!);
        reloadFnLocked.current = true;
      }
      setVisible(true);
      setCountdown((prev) => prev ?? COUNTDOWN_SECONDS);
    };
    window.addEventListener("pwa-update-available", handler);
    return () => window.removeEventListener("pwa-update-available", handler);
  }, []);

  // Countdown timer — ticks every second. At 0 we fire the reload fn,
  // or fall back to the SW-aware reload when no fn was provided.
  useEffect(() => {
    if (!visible || countdown == null) return;
    if (countdown <= 0) {
      if (reloadFn) reloadFn();
      else void reloadWithSwActivation();
      return;
    }
    const id = window.setTimeout(() => {
      setCountdown((c) => (c == null ? null : c - 1));
    }, 1000);
    return () => clearTimeout(id);
  }, [visible, countdown, reloadFn]);

  if (!visible) return null;

  const progressPct =
    countdown != null
      ? Math.max(0, Math.min(100, ((COUNTDOWN_SECONDS - countdown) / COUNTDOWN_SECONDS) * 100))
      : 100;

  return (
    <div
      data-testid="update-banner"
      role="status"
      aria-live="polite"
      className="fixed bottom-6 left-4 right-4 z-[100] flex flex-col gap-2 px-4 pt-3 pb-3 rounded-2xl bg-rhozly-primary text-white shadow-2xl animate-in slide-in-from-bottom-4 duration-300 sm:left-auto sm:right-6 sm:w-96"
    >
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black leading-tight">Updating Rhozly OS…</p>
          <p className="text-xs text-white/65 font-medium mt-0.5">
            {countdown != null && countdown > 0
              ? `Applying the latest version in ${countdown}s.`
              : "Applying the latest version…"}
          </p>
        </div>
      </div>
      <div
        data-testid="update-banner-progress"
        className="relative h-1 w-full rounded-full bg-white/15 overflow-hidden"
      >
        <div
          className="absolute inset-y-0 left-0 bg-white/70 transition-[width] duration-1000 ease-linear"
          style={{ width: `${progressPct}%` }}
        />
      </div>
    </div>
  );
}
