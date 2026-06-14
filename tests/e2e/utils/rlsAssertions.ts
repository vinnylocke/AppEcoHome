import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Sign in as a specific worker user (`testN@rhozly.com`) using the
 * PUBLISHABLE key — this is critical for RLS testing. Service-role keys
 * bypass RLS and would invalidate the tests.
 *
 * Pass a 0-based worker index; the email is derived as `test{n+1}@rhozly.com`
 * which matches the per-worker seed convention.
 */
export async function signInAs(workerIndex: number): Promise<SupabaseClient> {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const password = process.env.TEST_USER_PASSWORD ?? "TestPassword123!";

  if (!supabaseUrl || !publishableKey) {
    throw new Error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY");
  }

  const email = `test${workerIndex + 1}@rhozly.com`;
  // Each `signInAs` call gets its own fresh client so multiple-worker tests
  // can coexist without auth-state collisions.
  const supabase = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(`signInAs(${workerIndex}) failed: ${error.message}`);
  }

  return supabase;
}

/** Conventional seed home id for worker N (0-based) — matches the
 *  per-worker substitution in `scripts/seed-test-db.mjs`. */
export function workerHomeId(workerIndex: number): string {
  const w = workerIndex + 1;
  return `0000000${w}-0000-0000-0000-000000000002`;
}

/** Conventional seed user id for worker N (0-based). */
export function workerUserId(workerIndex: number): string {
  const w = workerIndex + 1;
  return `0000000${w}-0000-0000-0000-000000000001`;
}

/** Conventional seed plant id for worker N (0-based, plant n).
 *
 *  The seed substitution in scripts/seed-test-db.mjs replaces `100000{n}`
 *  with `{w+1}00000{n}` where w is the 1-based worker number — so for
 *  workerIndex=0 (test1, w=1) the plant id becomes `2000001..2000006`. */
export function workerPlantId(workerIndex: number, plantN: number): number {
  const prefix = workerIndex + 2; // worker w (1-based) + 1 = workerIndex + 2
  return Number(`${prefix}00000${plantN}`);
}

/** Conventional seed blueprint id for worker N (0-based, blueprint n).
 *  Seed pattern: `00000000-0000-0000-0005-00000000000{n}` (NOTE: 0005,
 *  not 0004 as CLAUDE.md historically said). */
export function workerBlueprintId(workerIndex: number, n: number): string {
  const w = workerIndex + 1;
  return `0000000${w}-0000-0000-0005-00000000000${n}`;
}

/** Conventional seed task id for worker N (0-based, task n).
 *  Seed pattern: `00000000-0000-0000-0006-00000000000{n}`. */
export function workerTaskId(workerIndex: number, n: number): string {
  const w = workerIndex + 1;
  return `0000000${w}-0000-0000-0006-00000000000${n}`;
}
