import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Per-user, per-function hourly rate limit backed by the rate_limit_log table.
 * Returns a 429 Response when the limit is exceeded, null when the call is allowed.
 *
 * Note: uses a select-then-upsert pattern. The TOCTOU window is acceptable for
 * pre-release traffic volumes; replace with a PG RPC for strict atomicity later.
 */
export async function enforceRateLimit(
  db: SupabaseClient,
  userId: string,
  fnName: string,
  maxPerHour = 10,
): Promise<Response | null> {
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
