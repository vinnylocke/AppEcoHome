/**
 * Offline profile cache (docs/plans/offline-first-usability.md, Phase 0).
 *
 * The keystone of offline usability: on a cold open with no connection the
 * app restored the session but the `user_profiles` fetch failed, and after an
 * 8s timeout the user hit an error screen — nothing else offline mattered.
 * Caching the (small, non-secret) profile row lets boot fall back to it and
 * render the app instead of erroring.
 *
 * Per-user keyed so a shared device never leaks one account's profile to the
 * next; cleared on sign-out alongside the other caches.
 */

const KEY_PREFIX = "rhozly:profile:v1:";

// Mirror of the columns loadProfile selects — non-secret, safe to persist.
export interface CachedProfile {
  uid: string;
  home_id: string | null;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  subscription_tier: string | null;
  ai_enabled: boolean | null;
  enable_perenual: boolean | null;
  is_admin: boolean | null;
  onboarding_state: unknown;
  can_view_audit: boolean | null;
  is_beta: boolean | null;
  persona: "new" | "experienced" | null;
}

function keyFor(userId: string): string {
  return `${KEY_PREFIX}${userId}`;
}

export function writeProfileCache(userId: string, profile: CachedProfile): void {
  if (typeof window === "undefined" || !userId) return;
  try {
    window.localStorage.setItem(keyFor(userId), JSON.stringify(profile));
  } catch {
    /* quota / private mode — ignore */
  }
}

export function readProfileCache(userId: string): CachedProfile | null {
  if (typeof window === "undefined" || !userId) return null;
  try {
    const raw = window.localStorage.getItem(keyFor(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.uid === userId) {
      return parsed as CachedProfile;
    }
    return null;
  } catch {
    return null;
  }
}

/** Drop every cached profile — called on sign-out. */
export function clearAllProfileCaches(): void {
  if (typeof window === "undefined") return;
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(KEY_PREFIX)) toRemove.push(k);
    }
    toRemove.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}
