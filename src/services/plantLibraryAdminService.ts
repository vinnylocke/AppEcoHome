import { supabase } from "../lib/supabase";

export interface PlantLibraryStats {
  total: number;
  unverified: number;
  matched: number;
  amended: number;
  /** Total verified = matched + amended. Convenience. */
  verified: number;
}

export interface PlantLibraryRunModelUsage {
  prompt_tokens: number;
  candidates_tokens: number;
  cached_tokens: number;
  thoughts_tokens: number;
  cost_usd: number;
  call_count: number;
}

export interface PlantLibraryRun {
  id: string;
  kind: "seed" | "verify" | "batch";
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
  total_cached_tokens: number;
  total_thoughts_tokens: number;
  total_tokens: number;
  total_cost_usd: number | string;
  /** Per-model token + cost breakdown. Empty `{}` on pre-12.0058 rows. */
  model_usage: Record<string, PlantLibraryRunModelUsage>;
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

export interface FailedSeedInsert {
  run_id: string;
  common_name: string;
  scientific_name: string | null;
  error: string;
  at: string;
}

/**
 * Per-row insert failures from the seeder, flattened across recent
 * runs that have any entries in `failed_inserts`. Sorted newest
 * first; capped at `limit` for the admin panel.
 */
export async function fetchFailedSeedInserts(
  limit = 50,
): Promise<FailedSeedInsert[]> {
  // Pull recent runs with at least one failure recorded (partial
  // index keeps the scan tight), then flatten the JSON client-side.
  const { data, error } = await supabase
    .from("plant_library_runs")
    .select("id, failed_inserts")
    .gt("failed_inserts", "[]")
    .order("started_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  const rows = (data ?? []) as Array<{
    id: string;
    failed_inserts: Array<{
      common_name?: string;
      scientific_name?: string | null;
      error?: string;
      at?: string;
    }> | null;
  }>;
  const flat: FailedSeedInsert[] = [];
  for (const r of rows) {
    if (!Array.isArray(r.failed_inserts)) continue;
    for (const fail of r.failed_inserts) {
      flat.push({
        run_id: r.id,
        common_name: fail.common_name ?? "(unknown)",
        scientific_name: fail.scientific_name ?? null,
        error: fail.error ?? "(no error message)",
        at: fail.at ?? "",
      });
    }
  }
  flat.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return flat.slice(0, limit);
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

// ─── Repeat-with-interval schedules ──────────────────────────────────

export interface PlantLibraryRunSchedule {
  id: string;
  kind: "seed" | "verify" | "batch";
  created_by: string | null;
  count_per_run: number;
  total_runs: number;
  runs_completed: number;
  interval_minutes: number;
  next_run_at: string;
  status: "active" | "completed" | "cancelled" | "failed";
  created_at: string;
  last_triggered_at: string | null;
  last_error: string | null;
}

/**
 * Create a new repeat-with-interval schedule. The first run fires on
 * the next tick of `tick_plant_library_schedules` (≤60s from now).
 */
export async function createPlantLibrarySchedule(input: {
  kind: "seed" | "verify" | "batch";
  countPerRun: number;
  totalRuns: number;
  intervalMinutes: number;
}): Promise<PlantLibraryRunSchedule> {
  const { data, error } = await supabase
    .from("plant_library_run_schedules")
    .insert({
      kind: input.kind,
      count_per_run: input.countPerRun,
      total_runs: input.totalRuns,
      interval_minutes: input.intervalMinutes,
      // next_run_at defaults to now() — first fire on next minute tick.
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as PlantLibraryRunSchedule;
}

/**
 * Cancel an active schedule. The next tick skips cancelled rows; any
 * in-flight invocation it already dispatched still completes (we
 * can't unwind those — they have their own `plant_library_runs` row
 * and the seed function's internal stop-button machinery handles
 * mid-run cancellation if needed).
 */
export async function cancelPlantLibrarySchedule(id: string): Promise<void> {
  const { error } = await supabase
    .from("plant_library_run_schedules")
    .update({ status: "cancelled" })
    .eq("id", id);
  if (error) throw error;
}

/**
 * Read all schedules that aren't done yet — active ones drive the
 * admin panel; completed/cancelled rows roll off the list.
 */
export async function fetchActivePlantLibrarySchedules(): Promise<PlantLibraryRunSchedule[]> {
  const { data, error } = await supabase
    .from("plant_library_run_schedules")
    .select("*")
    .eq("status", "active")
    .order("next_run_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as PlantLibraryRunSchedule[];
}

// ─── Batch API submissions ───────────────────────────────────────────

export interface PlantLibraryBatch {
  id: string;
  kind: "seed";
  triggered_by: string | null;
  count_requested: number;
  candidate_names: string[];
  model: string;
  gemini_batch_name: string | null;
  status: "submitting" | "pending" | "running" | "succeeded" | "failed" | "processed" | "cancelled";
  submitted_at: string;
  last_polled_at: string | null;
  completed_at: string | null;
  processed_at: string | null;
  result_run_id: string | null;
  estimated_cost_usd: number | string | null;
  error_message: string | null;
}

/**
 * Submit a one-shot batch. The edge fn inserts a `submitting` row
 * and returns immediately with the batch_id + upfront cost
 * estimate; the slow gather-from-sources + submit-to-Gemini work
 * runs in the background via EdgeRuntime.waitUntil. The row's
 * status flips to `pending` (with the gemini_batch_name) once the
 * background work completes — typically 30-90s for big counts.
 *
 * Watch the row in the Pending batches panel for the transition.
 */
export async function submitPlantLibraryBatch(
  count: number,
  triggeredBy: string,
): Promise<{
  batch_id: string;
  estimated_cost_usd: number;
  status: "submitting";
}> {
  const { data, error } = await supabase.functions.invoke(
    "submit-plant-library-batch",
    { body: { count, triggered_by: triggeredBy } },
  );
  if (error) throw error;
  return data as {
    batch_id: string;
    estimated_cost_usd: number;
    status: "submitting";
  };
}

/**
 * Manually poll Gemini for the current state of one batch and
 * return its raw `JOB_STATE_*` string verbatim. Same code path the
 * 5-min cron runs — this just runs it for one batch instead of the
 * whole non-terminal set. The DB row is updated with the live
 * status as a side-effect (last_polled_at + status), so calling
 * this also serves as a "force re-poll now" shortcut.
 *
 * Useful for the per-row "Check status" button: even when nothing
 * has changed since the last cron tick, you get an immediate
 * confirmation that Gemini still thinks the job is in flight.
 */
export async function inspectPlantLibraryBatch(
  batchId: string,
): Promise<{
  batch_id: string;
  gemini_batch_name: string | null;
  /** Verbatim from Gemini, e.g. "JOB_STATE_PENDING". Null when the
   *  row never made it past submit OR Gemini's status call failed. */
  raw_state: string | null;
  /** Our mapped status (pending / running / succeeded / processed /
   *  failed / cancelled). What the panel chip renders. */
  mapped_status: string;
  last_polled_at: string | null;
  error: string | null;
}> {
  const { data, error } = await supabase.functions.invoke(
    "poll-plant-library-batches",
    { body: { batch_id: batchId } },
  );
  if (error) throw error;
  return data as Awaited<ReturnType<typeof inspectPlantLibraryBatch>>;
}

/**
 * Re-run the processing path for an already-processed batch.
 * Useful when the first-attempt parser landed zero rows (e.g.
 * Gemini changed the response shape under us) — Gemini retains
 * inline results for 48h, so a fresh fetch + parse rescues the
 * data without paying for the AI work again.
 *
 * Steps:
 *   1. If the batch row points at a `plant_library_runs` that
 *      ended up with zero inserts, delete that empty run row so
 *      it doesn't sit in Recent Runs as noise.
 *   2. Reset the batch row to `status='succeeded'` (with
 *      result_run_id + processed_at cleared) so the poll path
 *      treats it as ready-to-process.
 *   3. Immediately invoke the poll fn for this single batch so
 *      processing happens now instead of waiting up to 5 min.
 */
export async function reprocessPlantLibraryBatch(id: string): Promise<{
  batch_id: string;
  raw_state: string | null;
  mapped_status: string;
}> {
  // Step 1 — fetch the current row so we know if there's an empty run to clean up.
  const { data: row, error: fetchErr } = await supabase
    .from("plant_library_batches")
    .select("result_run_id")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) throw fetchErr;

  if (row?.result_run_id) {
    // Only delete the prior run row if it was actually empty —
    // safety against blowing away a partial success.
    const { data: oldRun } = await supabase
      .from("plant_library_runs")
      .select("count_inserted, count_skipped, count_failed")
      .eq("id", row.result_run_id)
      .maybeSingle();
    if (oldRun && oldRun.count_inserted === 0 && oldRun.count_failed === 0) {
      await supabase
        .from("plant_library_runs")
        .delete()
        .eq("id", row.result_run_id);
    }
  }

  // Step 2 — reset the batch row so it looks like a freshly-SUCCEEDED batch.
  const { error: resetErr } = await supabase
    .from("plant_library_batches")
    .update({
      status: "succeeded",
      result_run_id: null,
      processed_at: null,
      error_message: null,
    })
    .eq("id", id);
  if (resetErr) throw resetErr;

  // Step 3 — kick off processing now via the inspect path (which
  // calls pollOne, which routes 'succeeded' rows through
  // processSucceededBatch).
  return await inspectPlantLibraryBatch(id);
}

/**
 * Mark a batch row cancelled. The poll cron will see the new
 * status next tick and skip it. Doesn't talk to Gemini — in-flight
 * batches may still complete and be billed; cancelling locally
 * just means we won't process the results when they arrive.
 */
export async function cancelPlantLibraryBatch(id: string): Promise<void> {
  const { error } = await supabase
    .from("plant_library_batches")
    .update({ status: "cancelled" })
    .eq("id", id);
  if (error) throw error;
}

/**
 * Read batches that are still in flight OR finished recently. Active
 * statuses always included (`submitting` / `pending` / `running` /
 * `succeeded`-but-not-yet-processed); terminal statuses
 * (`failed` / `processed` / `cancelled`) included only when within
 * the trailing window (default 24h) so the admin can see what
 * happened on their last visit without browsing the DB.
 *
 * Most-recent first.
 */
export async function fetchActivePlantLibraryBatches(
  opts: { terminalHours?: number } = {},
): Promise<PlantLibraryBatch[]> {
  const hours = opts.terminalHours ?? 24;
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  // OR-clause expressed via PostgREST: any non-terminal status OR
  // (terminal status AND submitted_at >= cutoff). PostgREST's `or`
  // syntax takes a comma-joined list of predicates.
  const { data, error } = await supabase
    .from("plant_library_batches")
    .select("*")
    .or(
      `status.in.(submitting,pending,running,succeeded),and(status.in.(failed,processed,cancelled),submitted_at.gte.${cutoff})`,
    )
    .order("submitted_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PlantLibraryBatch[];
}

/**
 * Estimate the upfront cost of a synchronous OR batch seed run
 * based on the median $/plant across recent successful runs.
 * Returns 0 when there's no history — the caller should show a
 * fallback "depends on Gemini usage" hint in that case.
 *
 * Mirrors the server-side estimator in `submit-plant-library-batch`
 * so the number the admin sees in the UI matches what gets
 * stamped onto the batch row on submission.
 */
export async function estimatePlantLibrarySeedCost(
  count: number,
  opts: { batch: boolean },
): Promise<number> {
  const { data: recent } = await supabase
    .from("plant_library_runs")
    .select("count_inserted, total_cost_usd")
    .eq("kind", "seed")
    .in("status", ["succeeded", "partial"])
    .gt("count_inserted", 0)
    .order("started_at", { ascending: false })
    .limit(5);
  if (!recent || recent.length === 0) return 0;
  const ratios = recent
    .map((r) => {
      const cost = Number(r.total_cost_usd ?? 0);
      return r.count_inserted > 0 ? cost / r.count_inserted : 0;
    })
    .filter((x) => x > 0)
    .sort((a, b) => a - b);
  if (ratios.length === 0) return 0;
  const median = ratios[Math.floor(ratios.length / 2)];
  return median * count * (opts.batch ? 0.5 : 1);
}
