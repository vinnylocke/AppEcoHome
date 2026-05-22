import { supabase } from "../lib/supabase";

export interface PlantLibraryStats {
  total: number;
  unverified: number;
  matched: number;
  amended: number;
  /** Total verified = matched + amended. Convenience. */
  verified: number;
}

export interface PlantLibraryRun {
  id: string;
  kind: "seed" | "verify";
  triggered_by: string | null;
  count_requested: number;
  count_inserted: number;
  count_skipped: number;
  count_matched: number;
  count_amended: number;
  count_failed: number;
  started_at: string;
  finished_at: string | null;
  status: "running" | "succeeded" | "failed" | "partial";
  error_message: string | null;
}

/**
 * Read the running totals for the admin stats strip. Four cheap COUNT(*)
 * queries — Postgres planner picks up `plant_library_valid_idx` /
 * `plant_library_unverified_idx` for the partial-index branches.
 */
export async function fetchPlantLibraryStats(): Promise<PlantLibraryStats> {
  const [
    totalResult,
    unverifiedResult,
    matchedResult,
    amendedResult,
  ] = await Promise.all([
    supabase
      .from("plant_library")
      .select("id", { count: "exact", head: true }),
    supabase
      .from("plant_library")
      .select("id", { count: "exact", head: true })
      .is("verified_at", null),
    supabase
      .from("plant_library")
      .select("id", { count: "exact", head: true })
      .eq("valid", true),
    supabase
      .from("plant_library")
      .select("id", { count: "exact", head: true })
      .eq("valid", false),
  ]);

  const total = totalResult.count ?? 0;
  const unverified = unverifiedResult.count ?? 0;
  const matched = matchedResult.count ?? 0;
  const amended = amendedResult.count ?? 0;
  return {
    total,
    unverified,
    matched,
    amended,
    verified: matched + amended,
  };
}

export interface StuckPlantRow {
  id: number;
  common_name: string;
  scientific_name: string[];
  verification_attempts: number;
  verification_error: string | null;
  valid: boolean | null;
  verified_at: string | null;
  seeded_at: string;
}

/**
 * Rows the verifier has tried + failed on at least once. Used by the
 * admin "stuck rows" panel — surfaces the actual error so we can see
 * what's broken without diving into the DB.
 */
export async function fetchStuckVerifications(
  limit = 25,
): Promise<StuckPlantRow[]> {
  const { data, error } = await supabase
    .from("plant_library")
    .select(
      "id, common_name, scientific_name, verification_attempts, verification_error, valid, verified_at, seeded_at",
    )
    .gt("verification_attempts", 0)
    .order("verification_attempts", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as StuckPlantRow[];
}

/**
 * 3 minutes of heartbeat silence is enough to call a run dead. Real
 * batches take 2-5 seconds; even a worst-case Gemini cascade (12
 * retries) tops out around 90 seconds. So 180 seconds is well past
 * any legitimate batch and gets us a quick auto-resolve without
 * false-positive risk.
 */
const STALE_RUN_CUTOFF_MS = 3 * 60 * 1000;

/**
 * Mark stale-running rows as failed. A run is considered stale when
 * its last_heartbeat_at (or started_at, when the heartbeat was never
 * stamped) is older than the cutoff — by that point the background
 * task has either finished cleanly or been killed by Supabase.
 *
 * Returns the count of rows updated so the admin UI can show a toast.
 */
export async function sweepStalePlantLibraryRuns(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_RUN_CUTOFF_MS).toISOString();
  const reason =
    "abandoned — no heartbeat for 3+ minutes (background task likely timed out or was killed)";
  const { data, error } = await supabase
    .from("plant_library_runs")
    .update({
      status: "failed",
      error_message: reason,
      finished_at: new Date().toISOString(),
    })
    .eq("status", "running")
    .or(`last_heartbeat_at.lt.${cutoff},last_heartbeat_at.is.null`)
    .lt("started_at", cutoff)
    .select("id");
  if (error) throw error;
  return data?.length ?? 0;
}

/**
 * Last N runs in started_at-desc order. RLS scopes to admins; the call
 * just returns [] for non-admin users.
 */
export async function fetchRecentPlantLibraryRuns(
  limit = 20,
): Promise<PlantLibraryRun[]> {
  const { data, error } = await supabase
    .from("plant_library_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as PlantLibraryRun[];
}

/**
 * Manually mark a `running` run as failed. The actual edge function
 * background work might still be in flight for a few more seconds,
 * but its next progress update will hit a row that's already in the
 * terminal state and effectively become a no-op. Uses the admin
 * UPDATE policy on `plant_library_runs`.
 */
export async function markRunAsFailed(runId: string): Promise<void> {
  const { error } = await supabase
    .from("plant_library_runs")
    .update({
      status: "failed",
      error_message: "manually stopped by admin",
      finished_at: new Date().toISOString(),
    })
    .eq("id", runId)
    .eq("status", "running"); // safety — never overwrite a terminal status
  if (error) throw error;
}

/**
 * Trigger a seed run. Fire-and-forget — the edge fn returns `run_id`
 * after creating the run row; the actual work continues in the
 * background. Returns the run_id so the caller can show optimistic
 * progress.
 */
export async function triggerSeedRun(
  count: number,
  triggeredBy: string,
): Promise<{ run_id: string }> {
  const { data, error } = await supabase.functions.invoke("seed-plant-library", {
    body: { count, triggered_by: triggeredBy },
  });
  if (error) throw error;
  const runId = (data as { run_id?: string })?.run_id;
  if (!runId) throw new Error("seed-plant-library returned no run_id");
  return { run_id: runId };
}

/**
 * Trigger a verify run on whatever's still unverified.
 */
export async function triggerVerifyRun(
  count: number,
  triggeredBy: string,
): Promise<{ run_id: string }> {
  const { data, error } = await supabase.functions.invoke("verify-plant-library", {
    body: { count, triggered_by: triggeredBy },
  });
  if (error) throw error;
  const runId = (data as { run_id?: string })?.run_id;
  if (!runId) throw new Error("verify-plant-library returned no run_id");
  return { run_id: runId };
}
