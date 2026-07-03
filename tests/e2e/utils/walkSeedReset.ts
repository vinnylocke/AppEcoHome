import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function adminClient(): { admin: SupabaseClient; w: number } {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error("Missing VITE_SUPABASE_URL in the test env");
  }
  if (!serviceKey) {
    throw new Error(
      "walkSeedReset needs SUPABASE_SECRET_KEY (local) or SUPABASE_SERVICE_ROLE_KEY (prod) in the test env to bypass RLS",
    );
  }

  const workerIndex = parseInt(process.env.PLAYWRIGHT_WORKER_INDEX ?? "0", 10);
  const w = workerIndex + 1;
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { admin, w };
}

/**
 * Set the worker user's persona (RHO-17 Phase 3 §11 — persona copy /
 * density tests). Pass null to restore the seed default (null ⇒ the app
 * treats the user as "new").
 */
export async function setWalkPersona(
  persona: "new" | "experienced" | null,
): Promise<void> {
  const { admin, w } = adminClient();
  const uid = `0000000${w}-0000-0000-0000-000000000001`;
  const { error } = await admin
    .from("user_profiles")
    .update({ persona })
    .eq("uid", uid);
  if (error) {
    throw new Error(`setWalkPersona failed: ${error.message}`);
  }
}

/**
 * Reset the current worker home's Garden Walk state (RHO-17).
 *
 * Deletes ALL `garden_walk_sessions` for the worker home (visits cascade
 * via FK) and restores the walk seed tasks to Pending. Same-day
 * visit/section rows and open sessions otherwise leak across tests —
 * a plant visited in WALK-001 disappears from WALK-010's route, and an
 * abandoned session triggers the resume prompt in an unrelated test.
 *
 * Phase 3 additions: restores the seeded in-window harvest task a test
 * may have snoozed/completed via the in-walk harvest sheets, deletes the
 * yield rows those tests logged against the Tomato instance (the seeded
 * yield fixtures belong to Basil and are untouched), and resets the
 * walker's persona to the seed default (null ⇒ "new").
 *
 * Uses the service-role key (chatSeedReset precedent) — visits have no
 * DELETE policy for regular users.
 */
export async function resetWalkState(): Promise<void> {
  const { admin, w } = adminClient();
  const homeId = `0000000${w}-0000-0000-0000-000000000002`;

  // Sessions cascade-delete their visits.
  const { error: delError } = await admin
    .from("garden_walk_sessions")
    .delete()
    .eq("home_id", homeId);
  if (delError) {
    throw new Error(`walkSeedReset sessions delete failed: ${delError.message}`);
  }

  // Restore the walk seed tasks a previous test may have completed /
  // postponed (mirrors the seed's ON CONFLICT clauses).
  const seedTaskIds = [
    `0000000${w}-0000-0000-0006-000000000014`, // Sweep the Potting Bench (home step)
    `0000000${w}-0000-0000-0006-000000000015`, // Sharpen Your Secateurs (personal)
  ];
  const { error: taskError } = await admin
    .from("tasks")
    .update({ status: "Pending", completed_at: null, completed_by: null })
    .in("id", seedTaskIds);
  if (taskError) {
    throw new Error(`walkSeedReset task reset failed: ${taskError.message}`);
  }

  // Phase 3 — restore the seeded in-window harvest task ("Harvest
  // Tomatoes", due today / window +7d) so the harvest-sheet tests always
  // start from Pending with no snooze.
  const harvestTaskId = `0000000${w}-0000-0000-0006-000000000009`;
  const { error: harvestError } = await admin
    .from("tasks")
    .update({
      status: "Pending",
      next_check_at: null,
      completed_at: null,
      completed_by: null,
    })
    .eq("id", harvestTaskId);
  if (harvestError) {
    throw new Error(`walkSeedReset harvest reset failed: ${harvestError.message}`);
  }

  // Phase 3 — drop yield rows logged against the Tomato instance by the
  // partial-pick test (seeded yield fixtures are Basil-only).
  const tomatoInstanceId = `0000000${w}-0000-0000-0004-000000000001`;
  const { error: yieldError } = await admin
    .from("yield_records")
    .delete()
    .eq("instance_id", tomatoInstanceId);
  if (yieldError) {
    throw new Error(`walkSeedReset yield cleanup failed: ${yieldError.message}`);
  }

  // Phase 3 — persona back to the seed default (null ⇒ "new").
  await setWalkPersona(null);
}
