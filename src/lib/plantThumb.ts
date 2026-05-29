import { supabase } from "./supabase";

// Perenual's free tier returns this placeholder path instead of a real photo.
const PLACEHOLDER_MARKERS = ["upgrade_access"];

/**
 * Is `url` a usable plant image we can show directly? Rejects empty values,
 * Perenual's `upgrade_access` paywall placeholder, and obvious non-strings.
 * Type-guards to `string` so callers can narrow.
 */
export function isUsablePlantImageUrl(url: string | null | undefined): url is string {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  return !PLACEHOLDER_MARKERS.some((m) => trimmed.includes(m));
}

function normaliseName(name: string): string {
  return name.trim().toLowerCase();
}

// Session-level dedupe: one promise per plant name, so multiple result rows /
// re-renders for the same plant share a single edge-fn call. The server-side
// `plant_image_cache` (90-day, write-through) handles cross-session reuse.
const inflight = new Map<string, Promise<string | null>>();

/**
 * Resolve one thumbnail URL for a plant by name via the shared
 * `plant-image-search` edge function (its `count:1` hot path → `plant_image_cache`).
 * Returns null when nothing usable is found. Never throws.
 */
export function resolvePlantThumbUrl(name: string): Promise<string | null> {
  const key = normaliseName(name);
  if (!key) return Promise.resolve(null);
  const existing = inflight.get(key);
  if (existing) return existing;

  const p = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke("plant-image-search", {
        body: { query: name.trim(), count: 1 },
      });
      if (error) return null;
      const url = data?.images?.[0]?.thumb_url ?? null;
      return isUsablePlantImageUrl(url) ? url : null;
    } catch {
      return null;
    }
  })();
  inflight.set(key, p);
  return p;
}
