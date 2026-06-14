import { createClient } from "@supabase/supabase-js";

/**
 * Reset (and optionally pre-seed) the current worker user's `chat_messages`
 * rows. Used by `plant-doctor-chat.spec.ts` in `test.beforeEach` so each
 * test starts with a known conversation state — tests that send messages
 * insert real rows, and a residual conversation would otherwise pollute
 * the next test's history fetch.
 *
 * `presetTurns` is an optional list of pre-seeded turns inserted in order
 * (used by CHAT-010 which asserts the cold-open history fetch).
 *
 * Uses the Supabase service-role key to bypass RLS — there is no DELETE
 * policy on `chat_messages` (the production "Clear conversation" feature
 * has not landed yet), so the publishable-key client can't wipe rows.
 * Service-role mutation is correct for a test-only utility.
 */
export interface ChatPresetTurn {
  role: "user" | "assistant";
  content: string;
}

export async function resetChatHistory(presetTurns: ChatPresetTurn[] = []): Promise<void> {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  // Local Supabase uses SUPABASE_SECRET_KEY (sb_secret_...); legacy/prod
  // setups use SUPABASE_SERVICE_ROLE_KEY (JWT). Accept either.
  const serviceKey =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  const password = process.env.TEST_USER_PASSWORD ?? "TestPassword123!";

  const workerIndex = parseInt(process.env.PLAYWRIGHT_WORKER_INDEX ?? "0", 10);
  const email = `test${workerIndex + 1}@rhozly.com`;

  if (!supabaseUrl || !publishableKey) {
    throw new Error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY");
  }
  if (!serviceKey) {
    // Without the service-role key we can't bypass RLS to delete rows. The
    // chat tests assume per-test isolation and will misbehave silently,
    // so fail loudly here rather than press on.
    throw new Error(
      "chatSeedReset needs SUPABASE_SECRET_KEY (local) or SUPABASE_SERVICE_ROLE_KEY (prod) in the test env to bypass RLS",
    );
  }

  // Resolve the user's id via a regular sign-in (we don't store user UUIDs
  // for the per-worker test users in env).
  const auth = createClient(supabaseUrl, publishableKey);
  const { data: signIn, error: authError } = await auth.auth.signInWithPassword({
    email,
    password,
  });
  if (authError || !signIn.user) {
    throw new Error(`Chat reset signin failed: ${authError?.message}`);
  }

  const w = workerIndex + 1;
  const homeId = `0000000${w}-0000-0000-0000-000000000002`;
  const userId = signIn.user.id;

  // Now switch to the service-role client for the actual mutations.
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: delError } = await admin
    .from("chat_messages")
    .delete()
    .eq("user_id", userId);
  if (delError) {
    throw new Error(`chatSeedReset delete failed: ${delError.message}`);
  }

  if (presetTurns.length === 0) return;

  // Insert preset turns spaced 1s apart so created_at ordering is unambiguous
  // (PostgreSQL clock precision can collapse multiple sub-millisecond inserts
  // into identical timestamps).
  const baseTs = Date.now() - presetTurns.length * 1000;
  const rows = presetTurns.map((turn, i) => ({
    home_id: homeId,
    user_id: userId,
    role: turn.role,
    content: turn.content,
    created_at: new Date(baseTs + i * 1000).toISOString(),
  }));

  const { error: insError } = await admin.from("chat_messages").insert(rows);
  if (insError) {
    throw new Error(`chatSeedReset insert failed: ${insError.message}`);
  }
}
