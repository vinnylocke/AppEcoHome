import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_QUICK_LAUNCHER_PINS,
  QUICK_LAUNCHER_MAX,
  QUICK_LAUNCHER_MIN,
} from "../lib/quickLauncherCatalogue";
import {
  fetchRemotePins,
  readLocalPins,
  sanitisePins,
  saveRemotePins,
  writeLocalPins,
} from "../lib/quickLauncherPrefs";

interface UseQuickLauncherPinsResult {
  /** Current pin order. Always at least 1 id, at most QUICK_LAUNCHER_MAX. */
  pins: string[];
  /** True while the initial remote revalidation is in flight. */
  isRevalidating: boolean;
  /** Save a new pin order. Updates localStorage immediately + Supabase async. */
  save: (next: string[]) => Promise<{ error: Error | null }>;
  /** Restore the catalogue's default pins. */
  resetToDefaults: () => Promise<{ error: Error | null }>;
}

/**
 * Local-first hook for the Quick Launcher pins.
 *
 *   1. Synchronous read from localStorage on mount → instant paint.
 *   2. Background `fetchRemotePins` against Supabase; if the remote
 *      value differs from the local one, overwrite + re-render.
 *   3. `save()` writes both stores; localStorage always wins on remote
 *      failure so the user's choice persists locally.
 */
export function useQuickLauncherPins(
  userId: string | null,
): UseQuickLauncherPinsResult {
  const [pins, setPins] = useState<string[]>(() => readLocalPins());
  const [isRevalidating, setIsRevalidating] = useState<boolean>(!!userId);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!userId) {
      setIsRevalidating(false);
      return;
    }
    let cancelled = false;
    setIsRevalidating(true);
    (async () => {
      const remote = await fetchRemotePins(userId);
      if (cancelled || !mountedRef.current) return;
      if (remote) {
        const local = readLocalPins();
        const sameOrder =
          remote.length === local.length &&
          remote.every((id, i) => id === local[i]);
        if (!sameOrder) {
          writeLocalPins(remote);
          setPins(remote);
        }
      }
      setIsRevalidating(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const save = useCallback(
    async (next: string[]) => {
      const sanitised = sanitisePins(next);
      setPins(sanitised);
      writeLocalPins(sanitised);
      if (!userId) return { error: null };
      return saveRemotePins(userId, sanitised);
    },
    [userId],
  );

  const resetToDefaults = useCallback(
    () => save([...DEFAULT_QUICK_LAUNCHER_PINS]),
    [save],
  );

  return { pins, isRevalidating, save, resetToDefaults };
}

export { QUICK_LAUNCHER_MIN, QUICK_LAUNCHER_MAX };
