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

for (let w = 1; w <= workerCount; w++) {
  console.log(`\nSeeding worker ${w} (test${w}@rhozly.com)...`);
  for (const file of files) {
    console.log(`  Applying ${file}...`);
    let sql = readFileSync(`${seedDir}/${file}`, "utf8");
    // Substitute the fixed UUID prefix and email for this worker.
    // Seeds use 00000000-0000-0000- as the entity prefix and test@rhozly.com
    // as the account email. Worker N gets 0000000N-0000-0000- and testN@rhozly.com.
    sql = sql.replaceAll("00000000-0000-0000-", `0000000${w}-0000-0000-`);
    // Restore the GoTrue instance_id (all-zeros UUID) — it must stay 00000000-…-00000000
    // or GoTrue will not recognise the users as belonging to the running instance.
    sql = sql.replaceAll(
      `0000000${w}-0000-0000-0000-000000000000`,
      "00000000-0000-0000-0000-000000000000",
    );
    sql = sql.replaceAll("test@rhozly.com", `test${w}@rhozly.com`);
    // Substitute integer plant PKs (100000{n}) so each worker gets unique IDs.
    // Worker w gets plant IDs {w+1}00000{n}, keeping 1000001-1000006 for the base account.
    for (let n = 1; n <= 6; n++) {
      sql = sql.replaceAll(`100000${n}`, `${w + 1}00000${n}`);
    }
    await client.query(sql);
  }
}

await client.end();
console.log(`\nAll seeds applied for ${workerCount} worker(s).`);
