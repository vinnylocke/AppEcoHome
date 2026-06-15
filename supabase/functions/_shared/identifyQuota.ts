import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// UX review 2026-06-15 item 3.1 — free Plant Doctor identify-only quota.
//
// Sprout / Botanist users (ai_enabled = false) get a small number of free
// `identify_vision` calls per rolling 7-day window so they can taste the
// Plant Doctor before hitting the Sage paywall. Diagnosis + multi-ID stay
// fully gated.
//
// We piggy-back on the existing `ai_usage_log` table — every Gemini call
// already logs a row with user_id + function_name + action + created_at,
// so a sliding-window count is enough. No new schema.

export const IDENTIFY_FREE_LIMIT = 5;
export const IDENTIFY_WINDOW_DAYS = 7;
export const IDENTIFY_FN = "plant-doctor";
export const IDENTIFY_ACTION = "identify_vision";

export interface IdentifyQuota {
  /** Calls used inside the rolling window. */
  used: number;
  /** Hard limit per window (currently 5). */
  limit: number;
  /** Calls remaining = max(0, limit - used). */
  remaining: number;
  /** ISO timestamp the oldest in-window call will drop off, when remaining = 0. Null otherwise. */
  resetsAt: string | null;
}

/**
 * Compute the sliding-window identify quota for a user.
 *
 * Intentionally returns 0/0/0 + null resetsAt on a DB error rather than
 * throwing — the caller can choose to fail-closed (block) or fail-open
 * (allow). The current caller fails-open: a quota failure should not
 * stop a paying user mid-action.
 */
export async function getIdentifyQuota(
  db: SupabaseClient,
  userId: string,
): Promise<IdentifyQuota> {
  const sinceMs = Date.now() - IDENTIFY_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const sinceIso = new Date(sinceMs).toISOString();

  const { count, error } = await db
    .from("ai_usage_log")
    .select("created_at", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("function_name", IDENTIFY_FN)
    .eq("action", IDENTIFY_ACTION)
    .gte("created_at", sinceIso);

  if (error) {
    return {
      used: 0,
      limit: IDENTIFY_FREE_LIMIT,
      remaining: IDENTIFY_FREE_LIMIT,
      resetsAt: null,
    };
  }

  const used = count ?? 0;
  const remaining = Math.max(0, IDENTIFY_FREE_LIMIT - used);

  let resetsAt: string | null = null;
  if (remaining === 0) {
    const { data } = await db
      .from("ai_usage_log")
      .select("created_at")
      .eq("user_id", userId)
      .eq("function_name", IDENTIFY_FN)
      .eq("action", IDENTIFY_ACTION)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (data?.created_at) {
      const oldestMs = new Date(data.created_at).getTime();
      resetsAt = new Date(
        oldestMs + IDENTIFY_WINDOW_DAYS * 24 * 60 * 60 * 1000,
      ).toISOString();
    }
  }

  return { used, limit: IDENTIFY_FREE_LIMIT, remaining, resetsAt };
}
