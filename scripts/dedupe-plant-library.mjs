/**
 * Plant Library de-duplication
 *
 * Removes rows whose COMMON NAME and SCIENTIFIC NAME are the same
 * (case-insensitively), keeping the most complete row of each set.
 *
 * Usage:
 *   node scripts/dedupe-plant-library.mjs            → DRY RUN (reports only)
 *   node scripts/dedupe-plant-library.mjs --apply    → actually delete dupes
 *
 * Requires in .env / .env.local:
 *   SUPABASE_PROD_URL=https://<project>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ...
 *
 * Safe by design: no table has a foreign key to plant_library.id, so deleting
 * a duplicate row breaks no constraint (a stale cached plant_library_id just
 * falls back to AI generation). Deletes are independent rows → re-runnable.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

// ── env ──────────────────────────────────────────────────────────────────────
function loadEnvFile(filename) {
  try {
    const content = readFileSync(resolve(process.cwd(), filename), "utf8");
    for (const line of content.split("\n")) {
      const m = line.match(/^([A-Z_a-z][A-Z_a-z0-9]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
    }
  } catch { /* optional */ }
}
loadEnvFile(".env");
loadEnvFile(".env.local");

const SUPABASE_URL = process.env.SUPABASE_PROD_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APPLY = process.argv.includes("--apply");
const DIAGNOSE = process.argv.includes("--diagnose");

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("\n❌  Missing SUPABASE_PROD_URL / SUPABASE_SERVICE_ROLE_KEY in .env\n");
  process.exit(1);
}

const headers = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

const COLS = [
  "id", "common_name", "scientific_name", "valid", "image_url", "thumbnail_url",
  "description", "family", "plant_type", "cycle", "watering", "watering_min_days",
  "watering_max_days", "sunlight", "care_level", "growth_rate", "growth_habit",
  "maintenance", "hardiness_min", "hardiness_max", "pruning_month", "harvest_season",
  "propagation", "attracts", "soil", "flowering_season", "pest_susceptibility",
  "soil_ph_min", "soil_ph_max", "days_to_harvest_min", "days_to_harvest_max", "seeded_at",
].join(",");

// ── helpers ────────────────────────────────────────────────────────────────
// Collapse formatting-only noise so genuine duplicates that differ purely in
// escaping / hybrid-mark / whitespace / case are treated as identical — WITHOUT
// merging botanically distinct names (genus vs species, var., synonyms).
function normText(s) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/\\/g, "")        // stray backslash escapes:  Cox\'s → Cox's
    .replace(/[×✕✗]/g, "x")    // unicode hybrid mark → ascii x:  Nepeta × → Nepeta x
    .replace(/\s+/g, " ")       // collapse whitespace
    .trim();
}

function normCommon(v) {
  return normText(v);
}

/** Scientific name (jsonb array) → order-insensitive, noise-insensitive key. */
function normScientific(v) {
  let arr = [];
  if (Array.isArray(v)) arr = v;
  else if (typeof v === "string" && v.trim()) arr = [v];
  return arr
    .map(normText)
    .filter(Boolean)
    .sort()
    .join("|");
}

function dedupeKey(row) {
  return `${normCommon(row.common_name)}::${normScientific(row.scientific_name)}`;
}

function isFilled(v) {
  if (v == null) return false;
  if (typeof v === "string") return v.trim() !== "";
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v).length > 0;
  if (typeof v === "number") return Number.isFinite(v);
  return !!v;
}

const SCORE_FIELDS = [
  "description", "family", "plant_type", "cycle", "watering", "watering_min_days",
  "watering_max_days", "sunlight", "care_level", "growth_rate", "growth_habit",
  "maintenance", "hardiness_min", "hardiness_max", "pruning_month", "harvest_season",
  "propagation", "attracts", "soil", "flowering_season", "pest_susceptibility",
  "soil_ph_min", "soil_ph_max", "days_to_harvest_min", "days_to_harvest_max",
];

/** Higher = more complete. Verified + imaged rows win; then most filled fields. */
function completeness(row) {
  let s = 0;
  if (row.valid === true) s += 5;
  if (isFilled(row.image_url) || isFilled(row.thumbnail_url)) s += 3;
  for (const f of SCORE_FIELDS) if (isFilled(row[f])) s += 1;
  return s;
}

/** Pick the keeper: highest completeness, tie-break oldest (lowest id). */
function pickKeeper(rows) {
  return rows.slice().sort((a, b) => {
    const d = completeness(b) - completeness(a);
    if (d !== 0) return d;
    return Number(a.id) - Number(b.id);
  })[0];
}

function sci(row) {
  const arr = Array.isArray(row.scientific_name) ? row.scientific_name : [];
  return arr.length ? arr.join(", ") : "(none)";
}

// ── fetch all rows (paginated) ────────────────────────────────────────────
async function fetchAll() {
  const PAGE = 1000;
  let offset = 0;
  const rows = [];
  for (;;) {
    const url = `${SUPABASE_URL}/rest/v1/plant_library?select=${COLS}&order=id.asc&limit=${PAGE}&offset=${offset}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`fetch failed: ${res.status} ${await res.text()}`);
    const batch = await res.json();
    rows.push(...batch);
    if (batch.length < PAGE) break;
    offset += PAGE;
  }
  return rows;
}

async function deleteIds(ids) {
  const CHUNK = 100;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const batch = ids.slice(i, i + CHUNK);
    const url = `${SUPABASE_URL}/rest/v1/plant_library?id=in.(${batch.join(",")})`;
    const res = await fetch(url, { method: "DELETE", headers: { ...headers, Prefer: "return=minimal" } });
    if (!res.ok) throw new Error(`delete failed: ${res.status} ${await res.text()}`);
    process.stdout.write(`   deleted ${Math.min(i + CHUNK, ids.length)}/${ids.length}\r`);
  }
  process.stdout.write("\n");
}

// ── diagnose ───────────────────────────────────────────────────────────────
// Groups by COMMON NAME alone to reveal what actually differs between rows the
// user perceives as duplicates (usually a differing / empty scientific name).
function runDiagnose(rows) {
  const byCommon = new Map();
  for (const row of rows) {
    const key = normCommon(row.common_name);
    if (!byCommon.has(key)) byCommon.set(key, []);
    byCommon.get(key).push(row);
  }
  const multi = [...byCommon.values()].filter((g) => g.length > 1);
  const totalExtra = multi.reduce((n, g) => n + (g.length - 1), 0);

  // How many of those multi-common groups also share the SAME scientific name?
  let sameSciGroups = 0;
  let diffSciGroups = 0;
  for (const g of multi) {
    const sciKeys = new Set(g.map((r) => normScientific(r.scientific_name)));
    if (sciKeys.size === 1) sameSciGroups++; else diffSciGroups++;
  }

  console.log(`  ── DIAGNOSE (grouped by common name, case-insensitive) ──────────────`);
  console.log(`  Distinct common names: ${byCommon.size}`);
  console.log(`  Common names with >1 row: ${multi.length}  (extra rows: ${totalExtra})`);
  console.log(`    ↳ of those, sets where every scientific name matches too: ${sameSciGroups}`);
  console.log(`    ↳ sets where the scientific name differs across rows:      ${diffSciGroups}\n`);

  const SAMPLE = 30;
  console.log(`  ── Sample (first ${Math.min(SAMPLE, multi.length)} multi-row common names) ──`);
  for (const g of multi.slice(0, SAMPLE)) {
    console.log(`\n  "${g[0].common_name}"  (${g.length} rows)`);
    for (const r of g) {
      console.log(`    #${r.id}  common="${r.common_name}"  scientific=${JSON.stringify(r.scientific_name)}  valid=${r.valid}`);
    }
  }
  console.log("");
}

// ── main ─────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🌿 Plant Library dedupe — ${APPLY ? "APPLY (will delete)" : "DRY RUN (no changes)"}\n`);
  console.log("  Fetching plant_library…");
  const rows = await fetchAll();
  console.log(`  ${rows.length} rows scanned.\n`);

  if (DIAGNOSE) {
    runDiagnose(rows);
    return;
  }

  const groups = new Map();
  for (const row of rows) {
    const key = dedupeKey(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const dupeGroups = [...groups.values()].filter((g) => g.length > 1);
  const toDelete = [];
  for (const group of dupeGroups) {
    const keeper = pickKeeper(group);
    for (const row of group) if (row.id !== keeper.id) toDelete.push({ row, keeper });
  }

  console.log(`  Duplicate sets (same common + scientific name, case-insensitive): ${dupeGroups.length}`);
  console.log(`  Rows that would be removed: ${toDelete.length}`);
  console.log(`  Rows remaining after dedupe: ${rows.length - toDelete.length}\n`);

  if (dupeGroups.length > 0) {
    const SAMPLE = 25;
    console.log(`  ── Sample (first ${Math.min(SAMPLE, dupeGroups.length)} sets) ─────────────────────────────`);
    for (const group of dupeGroups.slice(0, SAMPLE)) {
      const keeper = pickKeeper(group);
      console.log(`\n  KEEP   #${keeper.id}  "${keeper.common_name}"  [${sci(keeper)}]  (score ${completeness(keeper)}${keeper.valid === true ? ", verified" : ""})`);
      for (const row of group) {
        if (row.id === keeper.id) continue;
        console.log(`  delete #${row.id}  "${row.common_name}"  [${sci(row)}]  (score ${completeness(row)}${row.valid === true ? ", verified" : ""})`);
      }
    }
    console.log("");
  }

  if (!APPLY) {
    console.log("  Dry run only — no rows deleted. Re-run with --apply to delete.\n");
    return;
  }

  if (toDelete.length === 0) {
    console.log("  Nothing to delete.\n");
    return;
  }

  console.log(`  Deleting ${toDelete.length} duplicate rows…`);
  await deleteIds(toDelete.map((d) => d.row.id));
  console.log(`\n✅  Removed ${toDelete.length} duplicates. ${rows.length - toDelete.length} rows remain.\n`);
}

main().catch((err) => {
  console.error(`\n❌  ${err.message}\n`);
  process.exit(1);
});
