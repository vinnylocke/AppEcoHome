import { supabase } from "./supabase";
import { Logger } from "./errorHandler";
import {
  DEFAULT_QUICK_LAUNCHER_PINS,
  QUICK_LAUNCHER_BY_ID,
  QUICK_LAUNCHER_MAX,
  QUICK_LAUNCHER_MIN,
} from "./quickLauncherCatalogue";

/**
 * Read / write the user's pinned Quick Launcher destinations.
 *
 * localStorage is the source-of-truth for the first paint on /quick —
 * a synchronous read keeps the launcher rendering in under a frame.
 * `user_profiles.quick_launcher_pins` is the cross-device sync layer
 * and is read on mount + overwritten on save. Same local-first +
 * revalidate pattern the dashboard cache uses.
 */

const LOCAL_KEY = "rhozly_quick_launcher_v1";

export interface QuickLauncherPrefs {
  pinned: string[];
}

/**
 * Normalises any user-supplied id list:
 *   - drops duplicates (preserves first occurrence)
 *   - drops ids that aren't in the catalogue
 *   - trims to QUICK_LAUNCHER_MAX
 *   - falls back to defaults if the result is below QUICK_LAUNCHER_MIN
 */
export function sanitisePins(input: unknown): string[] {
  if (!Array.isArray(input)) return [...DEFAULT_QUICK_LAUNCHER_PINS];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    if (seen.has(raw)) continue;
    if (!QUICK_LAUNCHER_BY_ID[raw]) continue;
    seen.add(raw);
    out.push(raw);
    if (out.length >= QUICK_LAUNCHER_MAX) break;
  }
  if (out.length < QUICK_LAUNCHER_MIN) return [...DEFAULT_QUICK_LAUNCHER_PINS];
  return out;
}

/**
 * True when the user has an explicitly saved pin preference on this device
 * (readLocalPins can't distinguish "never customised" from "customised to
 * exactly the defaults" — it returns the default set for both). The Home
 * dashboard's quick-actions row uses this to decide whether persona-aware
 * defaults may apply.
 */
export function hasStoredPins(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(LOCAL_KEY) !== null;
  } catch {
    return false;
  }
}

export function readLocalPins(): string[] {
  if (typeof window === "undefined") return [...DEFAULT_QUICK_LAUNCHER_PINS];
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    if (!raw) return [...DEFAULT_QUICK_LAUNCHER_PINS];
    const parsed = JSON.parse(raw) as { pinned?: unknown } | null;
    return sanitisePins(parsed?.pinned);
  } catch (err) {
    Logger.error("quickLauncherPrefs: local read failed — clearing", err);
    try {
      window.localStorage.removeItem(LOCAL_KEY);
    } catch {
      /* private mode etc. — swallow */
    }
    return [...DEFAULT_QUICK_LAUNCHER_PINS];
  }
}

export function writeLocalPins(pins: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      LOCAL_KEY,
      JSON.stringify({ pinned: sanitisePins(pins) }),
    );
  } catch (err) {
    Logger.error("quickLauncherPrefs: local write failed", err);
  }
}

export function clearLocalPins(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LOCAL_KEY);
  } catch {
    /* swallow */
  }
}

/**
 * Reads `user_profiles.quick_launcher_pins` for the active user. NULL
 * column → returns null (caller should treat as "use defaults"). Any
 * other error → null + log.
 */
export async function fetchRemotePins(userId: string): Promise<string[] | null> {
  try {
    const { data, error } = await supabase
      .from("user_profiles")
      .select("quick_launcher_pins")
      .eq("uid", userId)
      .maybeSingle();
    if (error) {
      Logger.error("quickLauncherPrefs: remote read failed", error);
      return null;
    }
    const raw = (data as { quick_launcher_pins?: { pinned?: unknown } } | null)
      ?.quick_launcher_pins;
    if (!raw) return null;
    return sanitisePins(raw.pinned);
  } catch (err) {
    Logger.error("quickLauncherPrefs: remote read threw", err);
    return null;
  }
}

/**
 * Writes the canonical sanitised pin list to BOTH stores. localStorage
 * always succeeds (we swallow its errors). The Supabase write returns
 * the error so callers can toast on a remote failure while the local
 * change persists.
 */
export async function saveRemotePins(
  userId: string,
  pins: string[],
): Promise<{ error: Error | null }> {
  const sanitised = sanitisePins(pins);
  writeLocalPins(sanitised);
  try {
    const { error } = await supabase
      .from("user_profiles")
      .update({ quick_launcher_pins: { pinned: sanitised } })
      .eq("uid", userId);
    if (error) {
      Logger.error("quickLauncherPrefs: remote write failed", error);
      return { error: new Error(error.message) };
    }
    return { error: null };
  } catch (err) {
    Logger.error("quickLauncherPrefs: remote write threw", err);
    return { error: err instanceof Error ? err : new Error(String(err)) };
  }
}
