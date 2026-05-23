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
  total_prompt_tokens: number;
  total_candidates_tokens: number;
  total_tokens: number;
  total_cost_usd: number | string;
}

export interface PlantLibraryUsageTotals {
  total_runs: number;
  total_tokens: number;
  total_cost_usd: number;
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
 * Cumulative AI usage across every plant_library_runs row. PostgREST
 * doesn't expose a SUM aggregate over `.select()`, so we fetch all
 * runs' totals and reduce client-side. Cheap because the columns are
 * small ints; even with thousands of runs this is a few KB.
 */
export async function fetchPlantLibraryUsageTotals(): Promise<PlantLibraryUsageTotals> {
  const { data, error } = await supabase
    .from("plant_library_runs")
    .select("total_tokens, total_cost_usd");
  if (error) throw error;
  const rows = (data ?? []) as Array<{
    total_tokens: number;
    total_cost_usd: number | string;
  }>;
  const totalTokens = rows.reduce((sum, r) => sum + (r.total_tokens ?? 0), 0);
  const totalCost = rows.reduce(
    (sum, r) => sum + Number(r.total_cost_usd ?? 0),
    0,
  );
  return {
    total_runs: rows.length,
    total_tokens: totalTokens,
    total_cost_usd: totalCost,
  };
}

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
 * Full row shape returned by the search query. Maps directly onto
 * `ManualPlantCreation`'s `initialData` prop — no transform needed.
 */
export interface PlantLibraryRow {
  id: number;
  common_name: string;
  scientific_name: string[];
  other_names: string[] | null;
  family: string | null;
  plant_type: string | null;
  cycle: string | null;
  image_url: string | null;
  thumbnail_url: string | null;
  watering: string | null;
  watering_min_days: number | null;
  watering_max_days: number | null;
  sunlight: string[] | null;
  care_level: string | null;
  hardiness_min: string | null;
  hardiness_max: string | null;
  growth_rate: string | null;
  growth_habit: string | null;
  maintenance: string | null;
  is_edible: boolean | null;
  is_toxic_pets: boolean | null;
  is_toxic_humans: boolean | null;
  edible_leaf: boolean | null;
  cuisine: boolean | null;
  medicinal: boolean | null;
  thorny: boolean | null;
  attracts: string[] | null;
  origin: string[] | null;
  description: string | null;
  drought_tolerant: boolean | null;
  salt_tolerant: boolean | null;
  flowers: boolean | null;
  flowering_season: string[] | null;
  fruits: boolean | null;
  harvest_season: string[] | null;
  indoor: boolean | null;
  invasive: boolean | null;
  leaf: boolean | null;
  seeds: boolean | null;
  tropical: boolean | null;
  pest_susceptibility: string[] | null;
  propagation: string[] | null;
  pruning_count: Record<string, unknown> | null;
  pruning_month: string[] | null;
  soil: string[] | null;
  soil_ph_min: number | null;
  soil_ph_max: number | null;
  days_to_harvest_min: number | null;
  days_to_harvest_max: number | null;
  dimensions: Record<string, unknown> | null;
  planting_instructions: unknown | null;
  valid: boolean | null;
  sources: Array<{ url: string; title?: string; source: string; licence?: string; accessed_at?: string }> | null;
  seeded_at: string;
  verified_at: string | null;
  verification_attempts: number;
  verification_error: string | null;
}

export interface PlantLibrarySearchResult {
  rows: PlantLibraryRow[];
  /** Total matching rows across all pages (from PostgREST `count: 'exact'`). */
  total: number;
  page: number;
  pageSize: number;
}

export const PLANT_LIBRARY_SEARCH_PAGE_SIZE = 10;

/**
 * Search the plant_library by free-text. Matches `common_name` and
 * `scientific_name` via the generated `search_text` column (lowercased
 * concatenation). Paginated server-side at 10 rows per page.
 *
 * Empty query returns the most-recently-seeded rows so the search tab
 * shows something useful on first load.
 */
export async function searchPlantLibrary(
  query: string,
  page: number,
  pageSize = PLANT_LIBRARY_SEARCH_PAGE_SIZE,
): Promise<PlantLibrarySearchResult> {
  const safePage = Math.max(1, Math.floor(page));
  const from = (safePage - 1) * pageSize;
  const to = from + pageSize - 1;
  const trimmed = query.trim().toLowerCase();

  let builder = supabase
    .from("plant_library")
    .select("*", { count: "exact" })
    .order("common_name", { ascending: true })
    .range(from, to);

  if (trimmed.length > 0) {
    // Escape ILIKE wildcards in the user input so a stray `%` or `_`
    // doesn't broaden the match unexpectedly.
    const escaped = trimmed.replace(/[%_]/g, "\\$&");
    builder = builder.ilike("search_text", `%${escaped}%`);
  } else {
    // Empty query → most-recently-seeded first (more interesting than
    // alphabetical when the admin opens the tab cold).
    builder = supabase
      .from("plant_library")
      .select("*", { count: "exact" })
      .order("seeded_at", { ascending: false })
      .range(from, to);
  }

  const { data, count, error } = await builder;
  if (error) throw error;
  return {
    rows: (data ?? []) as PlantLibraryRow[],
    total: count ?? 0,
    page: safePage,
    pageSize,
  };
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
