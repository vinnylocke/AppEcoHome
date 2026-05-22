import React, { useEffect, useRef, useState } from "react";
import { RefreshCw, X } from "lucide-react";

const COUNTDOWN_SECONDS = 10;

/**
 * "Update available" banner with an auto-reload countdown.
 *
 * Trigger: any `pwa-update-available` event on the window. Two paths
 * dispatch this event:
 *   1. The service worker's `onNeedRefresh` callback (`src/main.tsx`).
 *   2. `useAppVersion` when polling spots a `bundleVersion < dbVersion`
 *      mismatch (catches the case where the SW is asleep).
 *
 * Behaviour:
 *   - On first event, banner shows with a countdown ("Reloading in 10s").
 *   - When the countdown reaches 0 we call the reload fn.
 *   - **Not now** cancels the countdown but keeps the banner visible
 *     with a manual **Reload now** button so the user can resume on
 *     their schedule.
 *   - **Dismiss (X)** hides the banner entirely for this session — the
 *     poller will re-fire when the underlying version mismatch persists,
 *     so a snoozed banner can resurface later.
 *
 * Duplicate events (e.g. SW + polling firing the same observation) are
 * idempotent — we keep the FIRST reload fn we received so the SW's
 * skipWaiting + controllerchange path is preferred when both fire.
 */
export default function UpdateBanner() {
  const [visible, setVisible] = useState(false);
  const [reloadFn, setReloadFn] = useState<(() => void) | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  /** True after the user taps **Not now** — stops the countdown without
   *  hiding the banner. */
  const [cancelled, setCancelled] = useState(false);

  // Tracks whether we've already captured a reload fn. The SW dispatch
  // is the preferred path (it can SKIP_WAITING + controllerchange + reload
  // cleanly) so we lock in the first fn we receive and ignore subsequent
  // dispatches' reload fns. Subsequent dispatches still re-show the
  // banner if the user dismissed it.
  const reloadFnLocked = useRef(false);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ reload: () => void }>).detail;
      if (!reloadFnLocked.current) {
        setReloadFn(() => detail.reload);
        reloadFnLocked.current = true;
      }
      setVisible(true);
      setCountdown((prev) => prev ?? COUNTDOWN_SECONDS);
    };
    window.addEventListener("pwa-update-available", handler);
    return () => window.removeEventListener("pwa-update-available", handler);
  }, []);

  // Countdown timer — ticks every second while not cancelled. At 0 we
  // fire the reload fn.
  useEffect(() => {
    if (!visible || cancelled || countdown == null) return;
    if (countdown <= 0) {
      reloadFn?.();
      return;
    }
    const id = window.setTimeout(() => {
      setCountdown((c) => (c == null ? null : c - 1));
    }, 1000);
    return () => clearTimeout(id);
  }, [visible, cancelled, countdown, reloadFn]);

  if (!visible) return null;

  const showingCountdown = !cancelled && countdown != null && countdown > 0;
  const progressPct =
    countdown != null
      ? Math.max(0, Math.min(100, ((COUNTDOWN_SECONDS - countdown) / COUNTDOWN_SECONDS) * 100))
      : 0;

  return (
    <div
      data-testid="update-banner"
      className="fixed bottom-6 left-4 right-4 z-[100] flex flex-col gap-2 px-4 pt-3 pb-3 rounded-2xl bg-rhozly-primary text-white shadow-2xl animate-in slide-in-from-bottom-4 duration-300 sm:left-auto sm:right-6 sm:w-96"
    >
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black leading-tight">Update available</p>
          <p className="text-xs text-white/65 font-medium mt-0.5">
            {showingCountdown
              ? `Reloading in ${countdown}s…`
              : "A new version of Rhozly is ready."}
          </p>
        </div>
        {showingCountdown ? (
          <button
            type="button"
            data-testid="update-banner-not-now"
            onClick={() => {
              setCancelled(true);
              setCountdown(null);
            }}
            className="shrink-0 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 active:bg-white/30 transition-colors text-xs font-bold"
          >
            Not now
          </button>
        ) : (
          <button
            data-testid="update-banner-reload"
            onClick={() => reloadFn?.()}
            className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/20 hover:bg-white/30 active:bg-white/40 transition-colors text-sm font-bold"
          >
            <RefreshCw size={13} />
            Reload now
          </button>
        )}
        <button
          data-testid="update-banner-dismiss"
          onClick={() => {
            setVisible(false);
            setCancelled(true);
            setCountdown(null);
          }}
          className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-white/60 hover:text-white hover:bg-white/20 transition-colors"
          aria-label="Dismiss"
        >
          <X size={14} />
        </button>
      </div>
      {showingCountdown && (
        <div
          data-testid="update-banner-progress"
          className="relative h-1 w-full rounded-full bg-white/15 overflow-hidden"
        >
          <div
            className="absolute inset-y-0 left-0 bg-white/70 transition-[width] duration-1000 ease-linear"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      )}
    </div>
  );
}
