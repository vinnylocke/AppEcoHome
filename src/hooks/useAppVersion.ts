import { useEffect, useRef, useState } from "react";
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
}

const POLL_INTERVAL_MS = 60_000;

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

  // 2. Poll the DB version. Initial fetch + visibilitychange refresh +
  //    60s interval while visible. Hidden tabs don't poll.
  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      const next = await fetchDbVersion();
      if (cancelled || !next) return;
      setDb((prev) => {
        if (prev && prev.major === next.major && prev.minor === next.minor) {
          return prev; // same — no re-render
        }
        return next;
      });
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
    // Also refresh on `online` — coming back from no-network catches a
    // deploy that landed while the user was offline.
    window.addEventListener("online", refresh);

    return () => {
      cancelled = true;
      stopInterval();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", refresh);
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
  useEffect(() => {
    if (!updateAvailable || !bundleVersionKey || !dbVersionKey) return;
    const key = `${bundleVersionKey}->${dbVersionKey}`;
    if (lastDispatchedRef.current === key) return;
    lastDispatchedRef.current = key;
    window.dispatchEvent(
      new CustomEvent("pwa-update-available", {
        detail: { reload: () => window.location.reload() },
      }),
    );
  }, [updateAvailable, bundleVersionKey, dbVersionKey]);

  return {
    bundleVersion: bundleVersionKey ? `Rhozly OS ${bundleVersionKey}` : null,
    bundleVersionKey,
    dbVersion: dbVersionKey ? `Rhozly OS ${dbVersionKey}` : null,
    dbVersionKey,
    updateAvailable,
  };
}
