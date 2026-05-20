import pg from "pg";
import { readFileSync, readdirSync } from "fs";

// Parse --workers N flag (default 4)
const workerArg = process.argv.indexOf("--workers");
const workerCount = workerArg !== -1 ? parseInt(process.argv[workerArg + 1], 10) : 4;

if (isNaN(workerCount) || workerCount < 1) {
  console.error("Usage: node seed-test-db.mjs [--workers N]");
  process.exit(1);
}

const client = new pg.Client("postgresql://postgres:postgres@localhost:54322/postgres");
await client.connect();

const seedDir = "supabase/seeds";
const files = readdirSync(seedDir)
  .filter((f) => /^\d{2}.*\.sql$/.test(f))
  .sort();

// Wave 7 (D7) — three-pass orchestration so cross-worker references work even
// when run from a fresh DB:
//
//   Pass 1: 00_bootstrap.sql for every worker → ensures all auth.users and
//           homes exist before any other seed runs.
//   Pass 2: regular seeds (01 through 13, EXCLUDING 09) per worker.
//   Pass 3: 09_cross_home_markers.sql once, untouched (it hardcodes W2's UUID).
//           Runs after W2's regular seeds so its FKs into W2's locations /
//           etc. all resolve.
//
// Without this split, 09_cross_home_markers.sql would FK-violate either
// because (a) W2's bootstrap hadn't run yet (the W1-pass case the previous
// implementation hit) or (b) W2's location seed hadn't run yet (the case
// the naive two-pass version still hit).
//
// Substitutions per worker w:
//   - UUID prefix:  00000000-0000-0000- → 0000000w-0000-0000-
//                   (except the GoTrue instance_id all-zeros UUID, which is
//                   restored after substitution)
//   - email:        test@rhozly.com    → testw@rhozly.com
//   - plant ids:    100000{n} (n=1..6) → {w+1}00000{n} (base account uses 1*)
//   - Wave 5/6 forks: 1000011 / 1000013 → {w+1}00011 / {w+1}00013

function substituteForWorker(rawSql, w) {
  let sql = rawSql;
  sql = sql.replaceAll("00000000-0000-0000-", `0000000${w}-0000-0000-`);
  // Restore the GoTrue instance_id (all-zeros UUID) — it must stay
  // 00000000-…-00000000 or GoTrue will not recognise the users as belonging
  // to the running instance.
  sql = sql.replaceAll(
    `0000000${w}-0000-0000-0000-000000000000`,
    "00000000-0000-0000-0000-000000000000",
  );
  sql = sql.replaceAll("test@rhozly.com", `test${w}@rhozly.com`);
  for (let n = 1; n <= 6; n++) {
    sql = sql.replaceAll(`100000${n}`, `${w + 1}00000${n}`);
  }
  // Wave 5 + 6 — AI freshness seed (13_ai_freshness.sql) uses:
  //   1000010 — Cherry Tomato global (shared across workers)
  //   1000011 — Cherry Tomato per-home shallow fork (per-worker)
  //   1000012 — Lavender global (shared across workers)
  //   1000013 — Lavender per-home CUSTOM fork (per-worker)
  sql = sql.replaceAll("1000011", `${w + 1}00011`);
  sql = sql.replaceAll("1000013", `${w + 1}00013`);
  return sql;
}

const bootstrapFile = files.find((f) => f.startsWith("00_"));
const crossHomeFile = files.find((f) => f.startsWith("09_cross_home_markers"));
const regularFiles = files.filter(
  (f) => f !== bootstrapFile && f !== crossHomeFile,
);

if (!bootstrapFile) {
  console.error("No 00_bootstrap.sql seed found in supabase/seeds/");
  process.exit(1);
}

console.log(`\nPass 1 — bootstrapping ${workerCount} worker(s)...`);
const bootstrapRaw = readFileSync(`${seedDir}/${bootstrapFile}`, "utf8");
for (let w = 1; w <= workerCount; w++) {
  console.log(`  ${bootstrapFile} for worker ${w} (test${w}@rhozly.com)`);
  await client.query(substituteForWorker(bootstrapRaw, w));
}

console.log(`\nPass 2 — applying regular seeds per worker...`);
for (let w = 1; w <= workerCount; w++) {
  console.log(`\nSeeding worker ${w} (test${w}@rhozly.com)...`);
  for (const file of regularFiles) {
    console.log(`  Applying ${file}...`);
    const raw = readFileSync(`${seedDir}/${file}`, "utf8");
    await client.query(substituteForWorker(raw, w));
  }
}

// Cross-home markers run untouched (the file hardcodes W2's UUIDs and is
// intentionally not substituted). Only meaningful when --workers >= 2.
if (crossHomeFile && workerCount >= 2) {
  console.log(`\nPass 3 — cross-home isolation markers (W2 only)...`);
  console.log(`  Applying ${crossHomeFile}...`);
  const raw = readFileSync(`${seedDir}/${crossHomeFile}`, "utf8");
  await client.query(raw);
} else if (crossHomeFile) {
  console.log(`\nSkipping ${crossHomeFile} — requires --workers >= 2.`);
}

await client.end();
console.log(`\nAll seeds applied for ${workerCount} worker(s).`);
