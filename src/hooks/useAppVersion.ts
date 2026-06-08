import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { supabase } from "../lib/supabase";
import { Logger } from "../lib/errorHandler";

interface VersionPair {
  major: number;
  minor: number;
}

/**
 * Result of `useAppVersion()`.
 *
 *   - `bundleVersion` is THIS running bundle's version, read from
 *     `/build-version.json` (written by `scripts/deploy.mjs` before
 *     the Vercel build). Null while the fetch is in flight; defaults
 *     to "00.0000" when running locally with no build stamp.
 *   - `dbVersion` is the latest deployed version, read from the
 *     `app_config.app_version` row. Polled on `visibilitychange` and
 *     every 60 seconds while the tab is visible so we don't miss a
 *     deploy that lands with the tab already open.
 *   - `updateAvailable` is true iff the DB version is ahead of the bundle.
 *
 * Whenever a poll discovers a new mismatch (i.e. `updateAvailable` flips
 * from false to true), the hook also dispatches the same
 * `pwa-update-available` event the service worker fires. That gives the
 * `UpdateBanner` a reliable trigger even when the SW is asleep on iOS
 * Safari / similar quirky PWA hosts.
 */
export interface AppVersionState {
  bundleVersion: string | null;     // "Rhozly OS 01.0048" — null until fetched
  bundleVersionKey: string | null;  // "01.0048" — null until fetched
  dbVersion: string | null;         // "Rhozly OS 01.0048" — null until fetched
  dbVersionKey: string | null;      // "01.0048" — null until fetched
  updateAvailable: boolean;         // true when dbVersion > bundleVersion
  /**
   * Force a fresh DB version fetch + service-worker update check. Used by
   * the "Check for update" affordance in the profile dropdown when the
   * user wants to bypass the polling cadence and confirm whether a new
   * version is waiting.
   *
   * Returns the latest comparison so the caller can render a toast
   * ("Update available" vs "You're on the latest").
   */
  refresh: () => Promise<{
    updateAvailable: boolean;
    bundleVersionKey: string | null;
    dbVersionKey: string | null;
  }>;
}

const POLL_INTERVAL_MS = 30_000;

function formatKey(v: VersionPair): string {
  return `${String(v.major).padStart(2, "0")}.${String(v.minor).padStart(4, "0")}`;
}

function compareVersions(a: VersionPair, b: VersionPair): number {
  if (a.major !== b.major) return a.major - b.major;
  return a.minor - b.minor;
}

async function fetchDbVersion(): Promise<VersionPair | null> {
  try {
    const { data, error } = await supabase
      .from("app_config")
      .select("value")
      .eq("key", "app_version")
      .maybeSingle();
    if (error) throw error;
    if (data?.value?.major != null) {
      return {
        major: Number(data.value.major),
        minor: Number(data.value.minor),
      };
    }
    return null;
  } catch (err) {
    Logger.error("useAppVersion: DB version fetch failed (will retry)", err);
    return null;
  }
}

export function useAppVersion(): AppVersionState {
  const [bundle, setBundle] = useState<VersionPair | null>(null);
  const [db, setDb] = useState<VersionPair | null>(null);
  // Remembers whether we've already dispatched the update event for this
  // particular (bundle, db) mismatch so we don't spam the banner on every
  // poll once it's already visible.
  const lastDispatchedRef = useRef<string | null>(null);

  // 1. Read the bundle's own version from /build-version.json once.
  useEffect(() => {
    let cancelled = false;
    fetch("/build-version.json", { cache: "no-cache" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data && typeof data.major === "number" && typeof data.minor === "number") {
          setBundle({ major: data.major, minor: data.minor });
        } else {
          setBundle({ major: 0, minor: 0 });
        }
      })
      .catch(() => {
        if (!cancelled) setBundle({ major: 0, minor: 0 });
      });
    return () => { cancelled = true; };
  }, []);

  // 2. Poll the DB version. Resume / focus / online / visibilitychange /
  //    pageshow / Capacitor appStateChange all retrigger a fresh check.
  //    30s interval while visible. Hidden tabs don't poll.
  useEffect(() => {
    let cancelled = false;
    let inFlight = false;

    const refresh = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const next = await fetchDbVersion();
        if (cancelled || !next) return;
        setDb((prev) => {
          if (prev && prev.major === next.major && prev.minor === next.minor) {
            return prev; // same — no re-render
          }
          return next;
        });
      } finally {
        inFlight = false;
      }
    };

    // Initial pull.
    refresh();

    let intervalId: number | undefined;
    const startInterval = () => {
      if (intervalId != null) return;
      intervalId = window.setInterval(refresh, POLL_INTERVAL_MS);
    };
    const stopInterval = () => {
      if (intervalId != null) {
        clearInterval(intervalId);
        intervalId = undefined;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        refresh();
        startInterval();
      } else {
        stopInterval();
      }
    };

    if (document.visibilityState === "visible") startInterval();
    document.addEventListener("visibilitychange", onVisibility);
    // Browser foreground events — some platforms (e.g. iOS Safari resuming
    // from BFCache) skip visibilitychange entirely.
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    // Coming back from no-network catches a deploy that landed offline.
    window.addEventListener("online", refresh);

    // Capacitor native shell — `visibilitychange` is unreliable on
    // background-to-foreground transitions; the App API's appStateChange
    // fires whenever the OS swaps us back in.
    let capCleanup: (() => void) | undefined;
    if (Capacitor.isNativePlatform()) {
      import("@capacitor/app")
        .then(({ App }) => {
          if (cancelled) return;
          App.addListener("appStateChange", (state) => {
            if (state.isActive) refresh();
          }).then((handle) => {
            if (cancelled) {
              handle.remove();
              return;
            }
            capCleanup = () => handle.remove();
          });
        })
        .catch((err) => {
          Logger.error("useAppVersion: Capacitor App plugin import failed", err);
        });
    }

    return () => {
      cancelled = true;
      stopInterval();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", refresh);
      window.removeEventListener("online", refresh);
      capCleanup?.();
    };
  }, []);

  const bundleVersionKey = bundle ? formatKey(bundle) : null;
  const dbVersionKey = db ? formatKey(db) : null;
  const updateAvailable =
    bundle != null && db != null && compareVersions(db, bundle) > 0;

  // 3. Dispatch `pwa-update-available` when a mismatch is newly observed,
  //    keyed by the (bundle, db) pair so the same observation doesn't
  //    re-fire on every poll. UpdateBanner's listener is idempotent —
  //    it sets visibility on every event; the dedupe here keeps that
  //    cheap.
  //
  //    NOTE: we deliberately do NOT pass a `reload` fn. UpdateBanner's
  //    own SW-aware reload (skipWaiting + controllerchange + reload) is
  //    the one that actually activates a waiting SW. Passing a naive
  //    `window.location.reload()` here used to win the banner's
  //    first-fn-locked race and reload the page onto the OLD SW —
  //    forcing the user to close and re-open the app.
  useEffect(() => {
    if (!updateAvailable || !bundleVersionKey || !dbVersionKey) return;
    const key = `${bundleVersionKey}->${dbVersionKey}`;
    if (lastDispatchedRef.current === key) return;
    lastDispatchedRef.current = key;
    window.dispatchEvent(new CustomEvent("pwa-update-available", { detail: {} }));
  }, [updateAvailable, bundleVersionKey, dbVersionKey]);

  // Manual "Check for update" path. Triggers the same DB fetch the
  // poller does + a service-worker update probe. We deliberately wait
  // for the SW probe to either install a new worker or confirm there
  // isn't one — without that wait, the DB check often resolves first
  // and we tell the user "you're on the latest version" right before
  // the SW fires `onNeedRefresh` and the banner appears.
  const refresh = async () => {
    let swUpdateQueued = false;
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          await reg.update();
          // `reg.waiting` = a new worker is already installed and waiting
          //   to activate. `reg.installing` = a new worker is being
          //   downloaded/installed right now (likely from the update()
          //   call we just made). Either is a signal that a fresh
          //   bundle is in flight.
          if (reg.waiting) {
            swUpdateQueued = true;
          } else if (reg.installing) {
            // Wait up to 3s for the in-progress install to settle. The
            // user's already in the "Checking…" spinner so the small
            // delay is invisible; the payoff is an accurate toast.
            const installing = reg.installing;
            swUpdateQueued = await new Promise<boolean>((resolve) => {
              const t = setTimeout(() => resolve(false), 3000);
              installing.addEventListener("statechange", () => {
                if (installing.state === "installed") {
                  clearTimeout(t);
                  resolve(true);
                } else if (installing.state === "redundant") {
                  clearTimeout(t);
                  resolve(false);
                }
              });
            });
          }
        }
      } catch (err) {
        Logger.error("useAppVersion: SW update probe failed", err);
      }
    }
    const next = await fetchDbVersion();
    let resolvedDbKey: string | null = dbVersionKey;
    if (next) {
      setDb(next);
      resolvedDbKey = formatKey(next);
    }
    const resolvedBundleKey = bundleVersionKey;
    const dbAhead =
      bundle != null
      && next != null
      && compareVersions(next, bundle) > 0;
    return {
      updateAvailable: dbAhead || swUpdateQueued,
      bundleVersionKey: resolvedBundleKey,
      dbVersionKey: resolvedDbKey,
    };
  };

  return {
    bundleVersion: bundleVersionKey ? `Rhozly OS ${bundleVersionKey}` : null,
    bundleVersionKey,
    dbVersion: dbVersionKey ? `Rhozly OS ${dbVersionKey}` : null,
    dbVersionKey,
    updateAvailable,
    refresh,
  };
}
