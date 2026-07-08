/**
 * One-time backfill: seed user_plant_ack for every home-scoped shallow AI
 * fork whose home members have no ack row (docs/plans/ai-plant-freshness-
 * and-edit-ux-overhaul.md, fix A4).
 *
 * Why: a missing ack row reads as "seen version 0" and the freshness chip
 * fires forever. The pending "updates" this hides are the June-12 cron's
 * schema-omission noise (false→null diffs) — a clean slate beats a wall of
 * false warnings; real future updates flow through the fixed differ + the
 * review-and-apply callout.
 *
 * Idempotent (upsert, keeps the max of existing/current version).
 *
 *   node scripts/backfill-plant-acks.mjs           # dry run
 *   node scripts/backfill-plant-acks.mjs --apply   # write
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const APPLY = process.argv.includes("--apply");
const key = readFileSync(".env", "utf8").match(/SUPABASE_SERVICE_ROLE_KEY=([^\r\n]+)/)?.[1];
if (!key) { console.error("SUPABASE_SERVICE_ROLE_KEY not found in .env"); process.exit(1); }
const sb = createClient("https://yiuuzlfhtsxbspdyibam.supabase.co", key);

// 1. Every home-scoped shallow fork (chip-eligible rows).
const { data: forks, error: fErr } = await sb.from("plants")
  .select("id, home_id, forked_from_plant_id, overridden_fields")
  .eq("source", "ai")
  .not("home_id", "is", null)
  .not("forked_from_plant_id", "is", null);
if (fErr) { console.error(fErr.message); process.exit(1); }
const shallow = (forks ?? []).filter((f) => (f.overridden_fields ?? []).length === 0);

// 2. Global versions for their parents.
const globalIds = [...new Set(shallow.map((f) => f.forked_from_plant_id))];
const { data: globals } = await sb.from("plants")
  .select("id, freshness_version").in("id", globalIds);
const versionByGlobal = new Map((globals ?? []).map((g) => [g.id, g.freshness_version ?? 1]));

// 3. Members of each home → (user, global) pairs.
const homeIds = [...new Set(shallow.map((f) => f.home_id))];
const { data: members } = await sb.from("home_members")
  .select("user_id, home_id").in("home_id", homeIds);
const membersByHome = new Map();
for (const m of members ?? []) {
  (membersByHome.get(m.home_id) ?? membersByHome.set(m.home_id, []).get(m.home_id)).push(m.user_id);
}

const pairs = new Map(); // `${user}:${global}` → version
for (const f of shallow) {
  const v = versionByGlobal.get(f.forked_from_plant_id) ?? 1;
  for (const u of membersByHome.get(f.home_id) ?? []) {
    const k = `${u}:${f.forked_from_plant_id}`;
    pairs.set(k, Math.max(pairs.get(k) ?? 0, v));
  }
}

// 4. Skip pairs already acked at >= current version.
const { data: existing } = await sb.from("user_plant_ack")
  .select("user_id, plant_id, seen_freshness_version").in("plant_id", globalIds);
for (const a of existing ?? []) {
  const k = `${a.user_id}:${a.plant_id}`;
  if (pairs.has(k) && (a.seen_freshness_version ?? 0) >= pairs.get(k)) pairs.delete(k);
}

const rows = [...pairs.entries()].map(([k, v]) => {
  const [user_id, plant_id] = k.split(":");
  return { user_id, plant_id: Number(plant_id), seen_freshness_version: v, acked_at: new Date().toISOString() };
});

console.log(`shallow forks: ${shallow.length} | globals: ${globalIds.length} | acks to write: ${rows.length}${APPLY ? "" : " (dry run — pass --apply)"}`);
if (APPLY && rows.length) {
  const { error } = await sb.from("user_plant_ack").upsert(rows, { onConflict: "user_id,plant_id" });
  console.log(error ? "FAILED: " + error.message : "backfilled " + rows.length + " ack rows");
}
process.exit(0);
