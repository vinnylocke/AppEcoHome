/**
 * One-off cleanup (2026-07-22): remove over-generic / garbage rows from the
 * global plant_library — bare categories ("Root vegetable", "Herb", "Vegetable",
 * "Legume", "Tree", …) and junk scientific keys (e.g. "Portal:Trees") that real
 * plants + picks were matching onto by scientific_name_key, inheriting generic
 * data (the "Carrot 'Autumn King' → Root vegetable" bug).
 *
 * RECOVERABLE: the full rows are written to a timestamped backup JSON before
 * deletion, so they can be re-inserted if needed. Also strips the now-dangling
 * plant_library_id from any home_seasonal_picks entry that pointed at a removed
 * row (clicking such a pick already falls through to the AI care path, but this
 * avoids the wasted 404).
 *
 * Usage:
 *   node scripts/quarantine-plant-library-junk.mjs           # dry run (default)
 *   node scripts/quarantine-plant-library-junk.mjs --apply   # execute
 *
 * Requires SUPABASE_PROD_URL + SUPABASE_SERVICE_ROLE_KEY in .env.
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";

function loadEnv(f) {
  try {
    for (const line of readFileSync(resolve(process.cwd(), f), "utf8").split("\n")) {
      const m = line.match(/^([A-Z_a-z][A-Z_a-z0-9]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
    }
  } catch {}
}
loadEnv(".env");
loadEnv(".env.local");

const URL = process.env.SUPABASE_PROD_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error("Missing SUPABASE_PROD_URL / SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }
const APPLY = process.argv.includes("--apply");
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

// Same generic-category list the enrichment guard rejects going forward.
const GENERIC = [
  "Root vegetable", "Root vegetables", "Leafy green", "Leafy greens", "Leafy vegetable",
  "Salad leaf", "Salad green", "Herb", "Herbs", "Vegetable", "Vegetables", "Fruit", "Fruits",
  "Flower", "Flowers", "Legume", "Legumes", "Brassica", "Edible plant", "Tuber", "Grass",
  "Weed", "Shrub", "Tree", "Houseplant", "Succulent", "Cactus", "Fern", "Climber", "Vine",
];

async function get(qs) {
  const res = await fetch(`${URL}/rest/v1/${qs}`, { headers: H });
  if (!res.ok) throw new Error(`GET ${qs} → ${res.status} ${await res.text()}`);
  return res.json();
}

async function main() {
  // 1. Collect target rows (full data) — generic common_names + colon keys.
  const targets = new Map();
  for (const name of GENERIC) {
    for (const r of await get(`plant_library?common_name=ilike.${encodeURIComponent(name)}&select=*`)) targets.set(r.id, r);
  }
  for (const r of await get(`plant_library?scientific_name_key=like.${encodeURIComponent("%:%")}&select=*`)) targets.set(r.id, r);

  const rows = [...targets.values()].sort((a, b) => a.id - b.id);
  const ids = rows.map((r) => r.id);
  console.log(`\nTarget rows to remove: ${rows.length}`);
  for (const r of rows) console.log(`  ${String(r.id).padStart(6)}  common='${r.common_name}'  sci=${JSON.stringify(r.scientific_name)}`);

  if (rows.length === 0) { console.log("Nothing to do."); return; }

  // 2. Find home_seasonal_picks entries referencing these ids (to strip).
  const pickRows = await get("home_seasonal_picks?select=home_id,week_iso,picks");
  const idSet = new Set(ids);
  const toPatch = [];
  for (const pr of pickRows) {
    const picks = Array.isArray(pr.picks) ? pr.picks : [];
    let changed = false;
    const next = picks.map((p) => {
      if (p && idSet.has(p.plant_library_id)) { changed = true; return { ...p, plant_library_id: null }; }
      return p;
    });
    if (changed) toPatch.push({ home_id: pr.home_id, week_iso: pr.week_iso, picks: next });
  }
  console.log(`\nhome_seasonal_picks rows with a dangling link to strip: ${toPatch.length}`);

  if (!APPLY) {
    console.log("\n(dry run — re-run with --apply to execute)\n");
    return;
  }

  // 3. Backup, then delete.
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = resolve(process.cwd(), `scripts/backups/plant-library-junk-${stamp}.json`);
  mkdirSync(dirname(backupPath), { recursive: true });
  writeFileSync(backupPath, JSON.stringify({ removed_at: new Date().toISOString(), rows }, null, 2) + "\n", "utf8");
  console.log(`\nBackup written: ${backupPath}`);

  const delRes = await fetch(`${URL}/rest/v1/plant_library?id=in.(${ids.join(",")})`, {
    method: "DELETE", headers: { ...H, Prefer: "return=representation" },
  });
  if (!delRes.ok) { console.error("DELETE failed:", delRes.status, await delRes.text()); process.exit(1); }
  const deleted = await delRes.json();
  console.log(`Deleted ${deleted.length} plant_library rows.`);

  // 4. Strip dangling pick links.
  let patched = 0;
  for (const p of toPatch) {
    const res = await fetch(`${URL}/rest/v1/home_seasonal_picks?home_id=eq.${p.home_id}&week_iso=eq.${encodeURIComponent(p.week_iso)}`, {
      method: "PATCH", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify({ picks: p.picks }),
    });
    if (res.ok) patched += 1; else console.error(`  patch failed for ${p.home_id}/${p.week_iso}: ${res.status}`);
  }
  console.log(`Stripped dangling links in ${patched}/${toPatch.length} home_seasonal_picks rows.`);
  console.log("\n✅ Done.\n");
}

main().catch((e) => { console.error(e); process.exit(1); });
