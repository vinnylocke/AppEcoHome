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
