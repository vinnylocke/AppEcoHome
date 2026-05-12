/**
 * Thin wrapper around the `ai_response_cache` table.
 *
 * Cache keys are plain strings — callers are responsible for normalising them.
 * Use `cacheKey()` to build a consistent key from parts.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { log } from "./logger.ts";

const MOD = "_shared/aiCache";

/** Build a normalised, DB-safe cache key from one or more string parts. */
export function cacheKey(...parts: string[]): string {
  return parts
    .map((p) => p.toLowerCase().trim().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, ""))
    .join(":")
    .slice(0, 200);
}

/** Return cached payload or null on miss / expiry. */
export async function getCached<T>(
  db: SupabaseClient,
  key: string,
): Promise<T | null> {
  const { data, error } = await db
    .from("ai_response_cache")
    .select("payload")
    .eq("cache_key", key)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error) {
    log(MOD, "read_error", { key, error: error.message });
    return null;
  }

  if (data) {
    log(MOD, "hit", { key });
    return data.payload as T;
  }

  log(MOD, "miss", { key });
  return null;
}

/** Upsert a value into the cache with a TTL expressed in days. */
export async function setCached(
  db: SupabaseClient,
  key: string,
  fnName: string,
  payload: unknown,
  ttlDays: number,
): Promise<void> {
  const expiresAt = new Date(Date.now() + ttlDays * 86_400_000).toISOString();
  const { error } = await db.from("ai_response_cache").upsert(
    { cache_key: key, fn_name: fnName, payload, expires_at: expiresAt },
    { onConflict: "cache_key" },
  );
  if (error) {
    log(MOD, "write_error", { key, error: error.message });
  } else {
    log(MOD, "set", { key, ttlDays });
  }
}
