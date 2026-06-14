import { createClient } from "@supabase/supabase-js";

/**
 * Reset the three harvest seed tasks ("Harvest Tomatoes",
 * "Pumpkin Final Harvest", "Strawberry Snooze Test") to their original
 * post-seed state. Used by `harvest-window.spec.ts` and
 * `calendar-window.spec.ts` in `test.beforeEach` because tests in this
 * file MUTATE the same rows (snooze / complete / mark-missed) and we
 * don't want order-dependent failures.
 *
 * Uses the same Supabase client + auth flow as the existing auth fixture
 * so RLS policies for `test{N}@rhozly.com` apply naturally.
 */
export async function resetHarvestSeedState(): Promise<void> {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const password = process.env.TEST_USER_PASSWORD ?? "TestPassword123!";

  const workerIndex = parseInt(process.env.PLAYWRIGHT_WORKER_INDEX ?? "0", 10);
  const email = `test${workerIndex + 1}@rhozly.com`;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY");
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
  if (authError) throw new Error(`Reset signin failed: ${authError.message}`);

  // Worker substitution: seed UUIDs starting with 00000000 become 0000000W
  // where W is the 1-based worker index.
  const w = workerIndex + 1;
  const homeId = `0000000${w}-0000-0000-0000-000000000002`;
  const inventoryItemId = `0000000${w}-0000-0000-0004-000000000001`;

  const today = new Date();
  const ymd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const addDays = (n: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + n);
    return ymd(d);
  };

  // The three target tasks (Wave 20 harvest contract test data).
  const targets = [
    {
      id: `0000000${w}-0000-0000-0006-000000000009`,
      title: "Harvest Tomatoes",
      due_date: ymd(today),
      window_end_date: addDays(7),
      next_check_at: null as string | null,
    },
    {
      id: `0000000${w}-0000-0000-0006-000000000020`,
      title: "Pumpkin Final Harvest",
      due_date: addDays(-9),
      window_end_date: addDays(-2),
      next_check_at: null,
    },
    {
      id: `0000000${w}-0000-0000-0006-000000000021`,
      title: "Strawberry Snooze Test",
      due_date: ymd(today),
      window_end_date: addDays(4),
      next_check_at: addDays(2),
    },
  ];

  for (const t of targets) {
    const { error } = await supabase
      .from("tasks")
      .update({
        status: "Pending",
        due_date: t.due_date,
        window_end_date: t.window_end_date,
        next_check_at: t.next_check_at,
        completed_at: null,
        home_id: homeId,
        type: "Harvesting",
        scope: "home",
        inventory_item_ids: [inventoryItemId],
      })
      .eq("id", t.id);
    if (error) {
      // Row may not exist on a brand-new local DB that hasn't been
      // seeded yet. Don't throw — let the test's own assertion be the
      // canonical signal.
      // eslint-disable-next-line no-console
      console.warn(`[resetHarvestSeedState] ${t.title} (${t.id}): ${error.message}`);
    }
  }
}
