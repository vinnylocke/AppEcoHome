import { createClient } from "@supabase/supabase-js";

/**
 * Add-Area wizard E2E hygiene. The wizard test creates a real area +
 * inventory rows named with the `E2E Wizard Bed` prefix; this util wipes
 * them (service key — same rationale as chatSeedReset: test-only, local
 * DB, bypasses RLS so leftovers from crashed runs can't accumulate).
 */

const PREFIX = "E2E Wizard Bed";

/** The worker's seeded home id (per the CLAUDE.md UUID convention:
 *  worker N uses the 0000000{N+1} prefix). Scoping every delete to it
 *  stops a parallel worker's in-flight bed from being wiped. */
function workerHomeId(): string {
  const workerIndex = parseInt(process.env.PLAYWRIGHT_WORKER_INDEX ?? "0", 10);
  return `0000000${workerIndex + 1}-0000-0000-0000-000000000002`;
}

function serviceDb() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Missing VITE_SUPABASE_URL / SUPABASE_SECRET_KEY for wizard cleanup");
  }
  return createClient(supabaseUrl, serviceKey);
}

export async function cleanupWizardAreas(): Promise<void> {
  const db = serviceDb();
  const homeId = workerHomeId();
  await db.from("inventory_items").delete().eq("home_id", homeId).like("area_name", `${PREFIX}%`);
  const areaIds =
    (await db.from("areas").select("id, locations!inner(home_id)").like("name", `${PREFIX}%`).eq("locations.home_id", homeId))
      .data?.map((a) => a.id) ?? [];
  if (areaIds.length > 0) {
    await db.from("area_lux_readings").delete().in("area_id", areaIds);
    await db.from("areas").delete().in("id", areaIds);
  }
}

/** Count the instances the wizard created for a given area name. */
export async function countWizardInstances(areaName: string): Promise<number> {
  const db = serviceDb();
  const { count } = await db
    .from("inventory_items")
    .select("id", { count: "exact", head: true })
    .eq("area_name", areaName);
  return count ?? 0;
}
