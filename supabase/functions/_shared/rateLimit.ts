import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { log } from "./logger.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Per-function, per-tier hourly call limits.
// Sprout users are blocked at the AI guard layer before they reach rate limiting,
// but 0 is listed explicitly as a safety net.
const TIER_LIMITS: Record<string, Record<string, number>> = {
  "plant-doctor":            { sprout: 0, botanist: 10, sage: 25, evergreen: 50 },
  "plant-doctor-ai":         { sprout: 0, botanist: 5,  sage: 20, evergreen: 40 },
  "generate-landscape-plan": { sprout: 0, botanist: 3,  sage: 8,  evergreen: 15 },
  "scan-area":               { sprout: 0, botanist: 5,  sage: 10, evergreen: 20 },
  "generate-guide":          { sprout: 0, botanist: 5,  sage: 10, evergreen: 20 },
  "identify-plant":          { sprout: 0, botanist: 10, sage: 25, evergreen: 50 },
  "contact-support":         { sprout: 2, botanist: 5,  sage: 10, evergreen: 20 },
};
const DEFAULT_TIER_LIMITS: Record<string, number> = {
  sprout: 0, botanist: 10, sage: 20, evergreen: 40,
};

async function resolveMax(
  db: SupabaseClient,
  userId: string,
  fnName: string,
  override?: number,
): Promise<number> {
  if (override !== undefined) return override;

  const { data } = await db
    .from("user_profiles")
    .select("subscription_tier")
    .eq("uid", userId)
    .maybeSingle();

  const tier = (data?.subscription_tier as string | null) ?? "sprout";
  const limits = TIER_LIMITS[fnName] ?? DEFAULT_TIER_LIMITS;
  const max = limits[tier] ?? DEFAULT_TIER_LIMITS[tier] ?? 10;

  log("_shared/rateLimit", "tier_resolved", { userId, fnName, tier, max });
  return max;
}

/**
 * Per-user, per-function hourly rate limit backed by the rate_limit_log table.
 * Limits are automatically derived from the user's subscription_tier unless
 * overrideMax is supplied (useful for tests).
 *
 * Returns a 429 Response when the limit is exceeded, null when the call is allowed.
 *
 * Note: uses a select-then-upsert pattern. The TOCTOU window is acceptable for
 * pre-release traffic volumes; replace with a PG RPC for strict atomicity later.
 */
export async function enforceRateLimit(
  db: SupabaseClient,
  userId: string,
  fnName: string,
  overrideMax?: number,
): Promise<Response | null> {
  const maxPerHour = await resolveMax(db, userId, fnName, overrideMax);

  const windowStart = new Date();
  windowStart.setMinutes(0, 0, 0);
  windowStart.setMilliseconds(0);
  const windowStartIso = windowStart.toISOString();

  const { data: row } = await db
    .from("rate_limit_log")
    .select("id, call_count")
    .eq("user_id", userId)
    .eq("function_name", fnName)
    .eq("window_start", windowStartIso)
    .maybeSingle();

  const currentCount = row?.call_count ?? 0;

  if (currentCount >= maxPerHour) {
    const windowEnd = windowStart.getTime() + 3_600_000;
    const retryAfter = Math.ceil((windowEnd - Date.now()) / 1000);
    log("_shared/rateLimit", "limit_exceeded", { userId, fnName, currentCount, maxPerHour });
    return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
      status: 429,
      headers: {
        ...CORS,
        "Content-Type": "application/json",
        "Retry-After": String(Math.max(retryAfter, 1)),
      },
    });
  }

  if (row) {
    await db
      .from("rate_limit_log")
      .update({ call_count: currentCount + 1 })
      .eq("id", row.id);
  } else {
    await db.from("rate_limit_log").insert({
      user_id: userId,
      function_name: fnName,
      window_start: windowStartIso,
      call_count: 1,
    });
  }

  return null;
}
