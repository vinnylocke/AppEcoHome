/**
 * Rhozly deploy automation
 *
 * Usage:
 *   npm run deploy                          → minor +1
 *   npm run deploy --bump 3                 → minor +3
 *   npm run deploy --bump-major             → major +1, minor = 1
 *   npm run deploy --bump-major --bump 3    → major +1, minor = 3
 *
 * Requires in .env or .env.local:
 *   VITE_SUPABASE_URL=https://your-project.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ...
 *
 * Requires installed:
 *   - Supabase CLI (supabase)
 *   - Vercel CLI (vercel) — logged in and project linked
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

// ---------------------------------------------------------------------------
// Load .env and .env.local into process.env (later file wins)
// ---------------------------------------------------------------------------
function loadEnvFile(filename) {
  try {
    const content = readFileSync(resolve(process.cwd(), filename), "utf8");
    for (const line of content.split("\n")) {
      const match = line.match(/^([A-Z_a-z][A-Z_a-z0-9]*)=(.*)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, "").trim();
      }
    }
  } catch {
    // file is optional
  }
}
loadEnvFile(".env");
loadEnvFile(".env.local"); // .env.local overrides .env

// Use SUPABASE_PROD_URL explicitly — VITE_SUPABASE_URL points to localhost in dev
const SUPABASE_URL        = process.env.SUPABASE_PROD_URL;
const SERVICE_ROLE_KEY    = process.env.SUPABASE_SERVICE_ROLE_KEY;
// npm strips --bump-major from argv and exposes it as npm_config_bump_major=true
const BUMP_MAJOR = process.argv.includes("--bump-major") || process.env.npm_config_bump_major === "true";
const BUMP_COUNT         = (() => {
  // Explicit flag: npm run deploy -- --bump 3
  const idx = process.argv.indexOf("--bump");
  if (idx !== -1) {
    const n = parseInt(process.argv[idx + 1], 10);
    return isNaN(n) || n < 1 ? 1 : n;
  }
  // npm strips --bump N into npm_config_bump=N env var
  if (process.env.npm_config_bump) {
    const n = parseInt(process.env.npm_config_bump, 10);
    if (!isNaN(n) && n >= 1) return n;
  }
  // Positional numeric fallback: npm run deploy --bump 3 (npm strips flag, passes 3 as positional)
  const positional = process.argv.slice(2).find(a => /^\d+$/.test(a));
  if (positional) {
    const n = parseInt(positional, 10);
    return isNaN(n) || n < 1 ? 1 : n;
  }
  return 1;
})();
const MAINTENANCE_MESSAGE = process.argv.slice(2).find(a => !a.startsWith("--") && !/^\d+$/.test(a)) ?? "We're rolling out an update. Back in just a moment!";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function run(cmd) {
  console.log(`\n  $ ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
}

// Retry a command with backoff. Used for the post-migration schema gate:
// after `db push` adds tables, PostgREST's schema cache lags a few seconds
// before the new tables appear in the OpenAPI the checker reads — so a
// migration-carrying deploy would fail the gate on pure timing even though
// the migration succeeded. Retrying absorbs the cache-reload window.
function runWithRetry(cmd, { attempts = 4, delayMs = 8000 } = {}) {
  for (let i = 1; i <= attempts; i++) {
    try {
      console.log(`\n  $ ${cmd}${i > 1 ? `  (attempt ${i}/${attempts})` : ""}`);
      execSync(cmd, { stdio: "inherit" });
      return;
    } catch (err) {
      if (i === attempts) throw err;
      console.log(`     ↻ failed — retrying in ${delayMs / 1000}s (schema cache may still be reloading)...`);
      execSync(process.platform === "win32" ? `powershell -Command "Start-Sleep -Milliseconds ${delayMs}"` : `sleep ${Math.ceil(delayMs / 1000)}`);
    }
  }
}

async function setMaintenance(enabled, message = null) {
  const url = `${SUPABASE_URL}/rest/v1/app_config?key=eq.maintenance_mode`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      apikey:          SERVICE_ROLE_KEY,
      Authorization:   `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type":  "application/json",
      Prefer:          "return=minimal",
    },
    body: JSON.stringify({
      value:      { enabled, message },
      updated_at: new Date().toISOString(),
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to set maintenance mode: ${res.status} ${body}`);
  }
}

/**
 * Read the current DB version and compute the next one — does NOT write
 * anywhere. Lets the caller bake the new version into the bundle (via
 * `writeBuildVersionFile`) BEFORE the DB bump, so the deployed bundle
 * knows its own version and we don't race old bundles into showing
 * release notes for a build they haven't loaded yet.
 */
async function computeNextVersion(bumpMajor = false) {
  const getRes = await fetch(
    `${SUPABASE_URL}/rest/v1/app_config?key=eq.app_version&select=value`,
    { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } }
  );
  const rows = await getRes.json();
  const current = rows?.[0]?.value ?? { major: 1, minor: 0 };

  const newMajor = bumpMajor ? current.major + 1 : current.major;
  const newMinor = bumpMajor ? BUMP_COUNT : current.minor + BUMP_COUNT;

  const versionKey = `${String(newMajor).padStart(2, "0")}.${String(newMinor).padStart(4, "0")}`;
  const newVersion = `Rhozly OS ${versionKey}`;

  return { newMajor, newMinor, versionKey, newVersion };
}

/**
 * Bake the upcoming version into `public/build-version.json` so the
 * Vercel build picks it up and the deployed bundle can compare its own
 * version against the DB version at runtime.
 */
function writeBuildVersionFile(versionKey, newMajor, newMinor) {
  const target = resolve(process.cwd(), "public/build-version.json");
  writeFileSync(
    target,
    JSON.stringify({
      version: versionKey,
      major: newMajor,
      minor: newMinor,
      built_at: new Date().toISOString(),
    }, null, 2) + "\n",
    "utf8",
  );
}

/**
 * Commit the new version to the DB + insert release notes. Runs AFTER
 * Vercel has deployed the new bundle so users can never read a "new" DB
 * version before the matching code is live.
 */
async function commitVersionAndReleaseNotes(newMajor, newMinor, versionKey, newVersion) {
  const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/app_config?key=eq.app_version`, {
    method: "PATCH",
    headers: {
      apikey:          SERVICE_ROLE_KEY,
      Authorization:   `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type":  "application/json",
      Prefer:          "return=minimal",
    },
    body: JSON.stringify({ value: { major: newMajor, minor: newMinor }, updated_at: new Date().toISOString() }),
  });
  if (!patchRes.ok) throw new Error(`Failed to bump version: ${await patchRes.text()}`);

  // Insert release notes if any were written
  let sections = [];
  try {
    sections = JSON.parse(readFileSync(resolve(process.cwd(), "release-notes.json"), "utf8"));
  } catch { /* missing file = empty */ }

  if (!sections.length) {
    console.warn("     ⚠️  release-notes.json is empty — deploying without release notes.");
  } else {
    const notesRes = await fetch(`${SUPABASE_URL}/rest/v1/release_notes`, {
      method: "POST",
      headers: {
        apikey:          SERVICE_ROLE_KEY,
        Authorization:   `Bearer ${SERVICE_ROLE_KEY}`,
        "Content-Type":  "application/json",
        Prefer:          "return=minimal",
      },
      body: JSON.stringify({ version: versionKey, major: newMajor, minor: newMinor, sections }),
    });
    if (!notesRes.ok) throw new Error(`Failed to insert release notes: ${await notesRes.text()}`);
    console.log(`     📝 Release notes saved for ${newVersion}`);

    // Reset file to blank template for next deploy
    writeFileSync(resolve(process.cwd(), "release-notes.json"), "[]\n", "utf8");
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function deploy() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error("\n❌  Missing environment variables.");
    console.error("    Add these to .env:");
    console.error("      SUPABASE_PROD_URL=https://yiuuzlfhtsxbspdyibam.supabase.co");
    console.error("      SUPABASE_SERVICE_ROLE_KEY=eyJ...\n");
    process.exit(1);
  }

  console.log("\n🌿 Rhozly deploy — starting\n");

  // Step 0: pre-flight gates — BEFORE maintenance goes on, so a failure
  // never strands the app in maintenance mode. Both gates exist because
  // bugs shipped without them: a missing React import crashed /walk
  // (RHOZLY-3Q — plain `tsc --noEmit` on the root solution-style tsconfig
  // checks nothing), and phantom column names 400'd queries silently
  // (RHOZLY-3P).
  console.log("🧪  [0/6] Pre-flight: typecheck + schema column check...");
  run("npm run typecheck");
  // The schema check validates against PROD, but this very deploy may be
  // the one carrying the migrations that add the columns the code uses
  // (chicken-and-egg — bit the RHO-17 deploy). Push migrations FIRST,
  // then gate: db push is additive/idempotent and safe before
  // maintenance, and a failed gate still aborts before maintenance goes
  // on or any code ships.
  run("supabase db push --include-all");
  // Retry the gate: PostgREST's schema cache takes a few seconds to expose
  // freshly-migrated tables in its OpenAPI, so a first check right after the
  // push can false-fail on cache lag alone.
  runWithRetry("node scripts/check-schema-columns.mjs");

  // Step 1: maintenance ON
  console.log("🔧  [1/3] Turning maintenance mode ON...");
  await setMaintenance(true, MAINTENANCE_MESSAGE);
  console.log(`     Users will see: "${MAINTENANCE_MESSAGE}"`);

  try {
    // Step 2: push DB migrations. Normally a no-op — step 0 already
    // pushed them ahead of the schema gate — kept as a belt-and-braces
    // re-run in case anything landed between the gate and here.
    console.log("\n📦  [2/6] Pushing database migrations...");
    run("supabase db push --include-all");

    // Step 3: compute the upcoming version + bake it into public/build-version.json
    // BEFORE Vercel builds. This is what stops the "release notes show
    // before the new bundle lands" race — the running bundle knows its
    // own version, and the DB version isn't bumped until after Vercel
    // has the new bundle live.
    console.log("\n🔢  [3/6] Computing next app version + baking into build...");
    const { newMajor, newMinor, versionKey, newVersion } = await computeNextVersion(BUMP_MAJOR);
    writeBuildVersionFile(versionKey, newMajor, newMinor);
    console.log(`     → ${newVersion}  (public/build-version.json updated)`);

    // Step 4: deploy edge functions
    // Flags explained:
    //   --use-api     bundles functions server-side (skips local Docker)
    //   --yes         answers yes to interactive prompts the CLI added in
    //                 v2.104+, otherwise the deploy hangs forever waiting
    //                 for a TTY confirmation that never arrives.
    //   verify_jwt    NOT touched here — per-function settings live in
    //                 supabase/config.toml and the CLI respects them.
    console.log("\n⚡  [4/6] Deploying edge functions...");
    run("supabase functions deploy --use-api --yes");

    // Step 5: deploy to Vercel (blocks until live)
    console.log("\n🚀  [5/6] Deploying to Vercel...");
    run("vercel --prod");

    // Step 6: NOW commit the DB version + release notes. The new bundle
    // is live; existing users can compare their (still-old) cached
    // bundle's build-version.json against the new DB version and see
    // the UpdateBanner first, then release notes after they've actually
    // reloaded onto the new bundle.
    console.log("\n📝  [6/6] Committing app version + release notes...");
    await commitVersionAndReleaseNotes(newMajor, newMinor, versionKey, newVersion);

    // All done — turn maintenance OFF
    console.log("\n✅  Deployment successful.");
    console.log("🌿  Turning maintenance mode OFF...");
    await setMaintenance(false);
    console.log(
      "    Active users will get an automatic reload with the new version.\n",
    );
  } catch (err) {
    console.error(`\n❌  Deployment failed: ${err.message}`);
    console.error("\n⚠️   Maintenance mode is still ON.");
    console.error(
      "    Fix the issue, then run:  node scripts/clear-maintenance.mjs\n",
    );
    process.exit(1);
  }
}

deploy();
