import { useCallback, useEffect, useRef, useState } from "react";
import { readSnapshot, writeSnapshot } from "../lib/snapshotCache";
import { Logger } from "../lib/errorHandler";

/**
 * Instant-paint-then-revalidate read cache for a screen's data (offline-first
 * Phase 2). Paints from the localStorage snapshot immediately (so the screen
 * opens offline with the last-known data), then runs `fetcher` in the
 * background and writes the fresh result back.
 *
 *   const { data, loading, isSyncing, refresh } = useCachedList(
 *     "watchlist", homeId,
 *     async () => (await supabase.from("ailments").select("*").eq("home_id", homeId)).data ?? [],
 *   );
 *
 * - `loading` is true only on a COLD open with no cache (first ever visit).
 *   With a cache hit it's false immediately — the screen paints, and
 *   `isSyncing` covers the silent background refresh.
 * - A background fetch that throws (offline) keeps the cached data and never
 *   flips to an error state — stale-but-visible beats blank.
 *
 * `scope` is usually the home id; pass a stable string. When `scope` is
 * falsy the hook stays idle (no fetch, empty data) so callers don't need to
 * guard every render.
 */
export function useCachedList<T>(
  name: string,
  scope: string | null | undefined,
  fetcher: () => Promise<T>,
  fallback: T,
): {
  data: T;
  loading: boolean;
  isSyncing: boolean;
  error: boolean;
  refresh: () => void;
} {
  const [data, setData] = useState<T>(fallback);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState(false);
  const [tick, setTick] = useState(0);

  // Keep the latest fetcher without making it a fetch dependency (callers
  // often pass an inline arrow that changes identity every render).
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const run = useCallback(async () => {
    if (!scope) {
      setData(fallback);
      setLoading(false);
      return;
    }
    const cached = readSnapshot<T>(name, scope);
    if (cached) {
      setData(cached.data);
      setLoading(false);
      setIsSyncing(true);
    } else {
      setLoading(true);
    }
    try {
      const fresh = await fetcherRef.current();
      setData(fresh);
      setError(false);
      writeSnapshot(name, scope, fresh);
    } catch (err) {
      // Offline / transient: keep whatever we painted from cache. Only show
      // an error when we had nothing cached to fall back to.
      Logger.warn(`useCachedList(${name}) refresh failed — keeping cache`, err);
      if (!cached) setError(true);
    } finally {
      setLoading(false);
      setIsSyncing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, scope, tick]);

  useEffect(() => {
    void run();
  }, [run]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  return { data, loading, isSyncing, error, refresh };
}
