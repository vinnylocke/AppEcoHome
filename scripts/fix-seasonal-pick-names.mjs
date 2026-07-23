/**
 * One-off cleanup (2026-07-23) of already-stored seasonal picks
 * (home_seasonal_picks), applying the same two fixes now live in the pipeline:
 *   1. Strip propagation methods baked into common_name ("Geranium softwood
 *      cuttings" → "Geranium").
 *   2. Drop plant_library_id links that aren't a genuine name match — a lettuce
 *      cultivar linked to a DIFFERENT cultivar's row ("Daisy Lambert Butterhead"
 *      for "Lollo Rossa"). Nulled links resolve via the AI care path on open.
 *
 * Idempotent + reversible-in-effect (only clears bad data; a Refresh/cron regen
 * repopulates). Dry run by default; pass --apply to write.
 *
 *   node scripts/fix-seasonal-pick-names.mjs           # dry run
 *   node scripts/fix-seasonal-pick-names.mjs --apply
 */
import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnv(f) {
  try {
    for (const line of readFileSync(resolve(process.cwd(), f), "utf8").split("\n")) {
      const m = line.match(/^([A-Z_a-z][A-Z_a-z0-9]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
    }
  } catch {}
}
loadEnv(".env"); loadEnv(".env.local");
const URL = process.env.SUPABASE_PROD_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error("Missing SUPABASE_PROD_URL / SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }
const APPLY = process.argv.includes("--apply");
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

// Mirror of _shared/plantNameMatch.ts (kept small + inline for this node script).
const METHOD_SUFFIXES = [
  "softwood cuttings","hardwood cuttings","semi-ripe cuttings","semi ripe cuttings",
  "greenwood cuttings","root cuttings","stem cuttings","leaf cuttings","basal cuttings",
  "tip cuttings","cuttings","cutting","divisions","division","from seed","from cuttings",
  "seeds","seed","plug plants","plug plant","plugs","layering","offsets","offset","transplants",
];
function stripMethod(name) {
  let out = (name ?? "").trim(), changed = true;
  while (changed && out) {
    changed = false;
    const lower = out.toLowerCase();
    for (const suf of METHOD_SUFFIXES) {
      if (lower.endsWith(" " + suf)) { out = out.slice(0, out.length - suf.length - 1).replace(/[\s,\-–—]+$/, "").trim(); changed = true; break; }
    }
  }
  return out || (name ?? "").trim();
}
const norm = (s) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
function isGenuineMatch(pickName, rowName) {
  const p = norm(pickName), r = norm(rowName);
  if (!p || !r) return false;
  return p === r || (r.length < p.length && p.startsWith(r)); // exact or species the pick extends
}

async function get(qs) {
  const res = await fetch(`${URL}/rest/v1/${qs}`, { headers: H });
  if (!res.ok) throw new Error(`GET ${qs} → ${res.status} ${await res.text()}`);
  return res.json();
}

async function main() {
  const rows = await get("home_seasonal_picks?select=home_id,week_iso,picks");
  // Batch-fetch the common_names of every referenced library id.
  const ids = new Set();
  for (const r of rows) for (const p of r.picks ?? []) if (p?.plant_library_id) ids.add(p.plant_library_id);
  const nameById = new Map();
  if (ids.size) {
    const libs = await get(`plant_library?id=in.(${[...ids].join(",")})&select=id,common_name`);
    for (const l of libs) nameById.set(l.id, l.common_name);
  }

  let strippedNames = 0, droppedLinks = 0;
  const toPatch = [];
  for (const r of rows) {
    let changed = false;
    const next = (r.picks ?? []).map((p) => {
      if (!p) return p;
      const cleaned = stripMethod(p.common_name);
      let libId = p.plant_library_id;
      if (cleaned !== p.common_name) { strippedNames++; changed = true; }
      if (libId != null) {
        const rowName = nameById.get(libId);
        // Row missing (deleted) or a different cultivar → drop the link.
        if (rowName == null || !isGenuineMatch(cleaned, rowName)) { libId = null; droppedLinks++; changed = true; }
      }
      return { ...p, common_name: cleaned, plant_library_id: libId };
    });
    if (changed) toPatch.push({ home_id: r.home_id, week_iso: r.week_iso, picks: next });
  }

  console.log(`\nhome_seasonal_picks rows: ${rows.length}`);
  console.log(`  names with a method stripped: ${strippedNames}`);
  console.log(`  wrong/dangling library links dropped: ${droppedLinks}`);
  console.log(`  rows to update: ${toPatch.length}`);

  if (!APPLY) { console.log("\n(dry run — re-run with --apply to write)\n"); return; }

  let patched = 0;
  for (const p of toPatch) {
    const res = await fetch(`${URL}/rest/v1/home_seasonal_picks?home_id=eq.${p.home_id}&week_iso=eq.${encodeURIComponent(p.week_iso)}`, {
      method: "PATCH", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify({ picks: p.picks }),
    });
    if (res.ok) patched++; else console.error(`  patch failed ${p.home_id}/${p.week_iso}: ${res.status} ${await res.text()}`);
  }
  console.log(`\n✅ Updated ${patched}/${toPatch.length} rows.\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
