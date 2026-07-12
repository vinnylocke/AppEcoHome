import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { log } from "./logger.ts";

async function hashIp(ip: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function extractIp(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Per-function, per-tier hourly call limits.
// Sprout users are blocked at the AI guard layer before they reach rate limiting,
// but 0 is listed explicitly as a safety net.
const TIER_LIMITS: Record<string, Record<string, number>> = {
  "plant-doctor":                    { sprout: 0, botanist: 10, sage: 25, evergreen: 50 },
  "plant-doctor-ai":                 { sprout: 0, botanist: 5,  sage: 20, evergreen: 40 },
  "generate-landscape-plan":         { sprout: 0, botanist: 3,  sage: 8,  evergreen: 15 },
  "generate-plant-first-plan":       { sprout: 0, botanist: 0,  sage: 8,  evergreen: 15 },
  "scan-area":                       { sprout: 0, botanist: 5,  sage: 10, evergreen: 20 },
  "generate-guide":                  { sprout: 0, botanist: 5,  sage: 10, evergreen: 20 },
  "identify-plant":                  { sprout: 0, botanist: 10, sage: 25, evergreen: 50 },
  "contact-support":                 { sprout: 2, botanist: 5,  sage: 10, evergreen: 20 },
  "app-help":                        { sprout: 20, botanist: 30, sage: 40, evergreen: 60 },
  "generate-ailment-suggestions":    { sprout: 0, botanist: 10, sage: 20, evergreen: 40 },
  "generate-swipe-plants":           { sprout: 0, botanist: 10, sage: 20, evergreen: 40 },
  "predict-yield":                   { sprout: 0, botanist: 5,  sage: 10, evergreen: 20 },
  "smart-plant-scheduler":           { sprout: 0, botanist: 5,  sage: 15, evergreen: 30 },
  "search-plants-ai":                { sprout: 0, botanist: 20, sage: 40, evergreen: 80 },
  // Cached server-side (companion_cache) — only first-time generations count,
  // so the limit just guards against a burst of misses.
  "companion-planting":              { sprout: 0, botanist: 20, sage: 40, evergreen: 80 },
  "visualiser-analyse":              { sprout: 0, botanist: 5,  sage: 10, evergreen: 20 },
  "home-location-details":           { sprout: 0, botanist: 2,  sage: 5,  evergreen: 10 },
  "optimise-area-ai":                { sprout: 0, botanist: 5,  sage: 10, evergreen: 20 },
  "perenual-proxy":                  { sprout: 30, botanist: 60, sage: 100, evergreen: 200 },
  // Garden Overhaul — expensive call (~$0.11 each: vision + 3 Imagen).
  // Sage tier limit is generous enough to experiment, evergreen for power users.
  "generate-garden-overhaul":        { sprout: 0,  botanist: 0,  sage: 3,   evergreen: 8 },
  // Sketch → Layout — one Pro vision call (~$0.02 each). Sage+ only.
  "sketch-to-layout":                { sprout: 0,  botanist: 0,  sage: 10,  evergreen: 25 },
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

  // Per-user override takes priority over everything.
  const { data: overrideRow } = await db
    .from("user_rate_limit_overrides")
    .select("max_per_hour")
    .eq("user_id", userId)
    .eq("function_name", fnName)
    .maybeSingle();

  if (overrideRow !== null) {
    log("_shared/rateLimit", "user_override_applied", { userId, fnName, max: overrideRow.max_per_hour });
    return overrideRow.max_per_hour;
  }

  // Resolve the caller's tier first — both the per-tier system
  // override AND the hardcoded TIER_LIMITS table are keyed by tier.
  const { data: profile } = await db
    .from("user_profiles")
    .select("subscription_tier")
    .eq("uid", userId)
    .maybeSingle();
  const tier = (profile?.subscription_tier as string | null) ?? "sprout";

  // Admin-tunable per-(function, tier) override — set via the
  // system_rate_limit_overrides table. Lets the admin raise/lower
  // limits without a code deploy.
  const { data: sysOverride } = await db
    .from("system_rate_limit_overrides")
    .select("max_per_hour")
    .eq("function_name", fnName)
    .eq("tier", tier)
    .maybeSingle();

  if (sysOverride !== null) {
    log("_shared/rateLimit", "system_override_applied", {
      userId, fnName, tier, max: sysOverride.max_per_hour,
    });
    return sysOverride.max_per_hour;
  }

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
    const retryAfterSec = Math.ceil((windowEnd - Date.now()) / 1000);
    log("_shared/rateLimit", "limit_exceeded", { userId, fnName, currentCount, maxPerHour });
    return new Response(JSON.stringify({
      error: "Rate limit exceeded",
      // ISO timestamp + structured fields so clients can render a specific
      // "try again in N minutes" toast. The rate-limit window is hourly
      // (calls/hour quota), so `quota_per_hour` is more informative than a
      // single cadence. Both manual-refresh-ai-plant and this generic
      // shared limiter now expose `retry_after` in the body.
      retry_after: new Date(windowEnd).toISOString(),
      quota_per_hour: maxPerHour,
      used: currentCount,
    }), {
      status: 429,
      headers: {
        ...CORS,
        "Content-Type": "application/json",
        "Retry-After": String(Math.max(retryAfterSec, 1)),
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

/**
 * Per-IP, per-function hourly rate limit for unauthenticated endpoints.
 * The caller's IP is SHA-256-hashed before storage (never stored raw).
 * Returns a 429 Response when the limit is exceeded, null when allowed.
 */
export async function enforceIpRateLimit(
  db: SupabaseClient,
  req: Request,
  fnName: string,
  maxPerHour: number = 50,
): Promise<Response | null> {
  const ip = extractIp(req);
  const ipHash = await hashIp(ip);

  const windowStart = new Date();
  windowStart.setMinutes(0, 0, 0);
  windowStart.setMilliseconds(0);
  const windowStartIso = windowStart.toISOString();

  const { data: row } = await db
    .from("ip_rate_limit_log")
    .select("id, call_count")
    .eq("ip_hash", ipHash)
    .eq("function_name", fnName)
    .eq("window_start", windowStartIso)
    .maybeSingle();

  const currentCount = row?.call_count ?? 0;

  if (currentCount >= maxPerHour) {
    const windowEnd = windowStart.getTime() + 3_600_000;
    const retryAfterSec = Math.ceil((windowEnd - Date.now()) / 1000);
    log("_shared/rateLimit", "ip_limit_exceeded", { ipHash: ipHash.slice(0, 8), fnName, currentCount, maxPerHour });
    return new Response(JSON.stringify({
      error: "Rate limit exceeded",
      retry_after: new Date(windowEnd).toISOString(),
      quota_per_hour: maxPerHour,
      used: currentCount,
    }), {
      status: 429,
      headers: {
        ...CORS,
        "Content-Type": "application/json",
        "Retry-After": String(Math.max(retryAfterSec, 1)),
      },
    });
  }

  if (row) {
    await db.from("ip_rate_limit_log").update({ call_count: currentCount + 1 }).eq("id", row.id);
  } else {
    await db.from("ip_rate_limit_log").insert({ ip_hash: ipHash, function_name: fnName, window_start: windowStartIso, call_count: 1 });
  }

  return null;
}
