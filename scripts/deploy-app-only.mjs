/**
 * Rhozly app-only deploy (escape hatch)
 *
 * Identical to `npm run deploy` EXCEPT it skips:
 *   - `supabase db push`               (use only when there are NO new migrations)
 *   - `supabase functions deploy`      (use only when no edge function changed,
 *                                       or the changed functions were already
 *                                       deployed individually)
 *
 * Why this exists: the bulk `functions deploy --use-api` fetches deno.land/std
 * for ~80 functions and intermittently fails on a transient CDN timeout,
 * aborting the whole deploy even when only client code changed. This ships the
 * Vercel app + version/release-notes bookkeeping without touching functions.
 *
 * Usage mirrors deploy.mjs:  node scripts/deploy-app-only.mjs --bump 1
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

function loadEnvFile(filename) {
  try {
    const content = readFileSync(resolve(process.cwd(), filename), "utf8");
    for (const line of content.split("\n")) {
      const match = line.match(/^([A-Z_a-z][A-Z_a-z0-9]*)=(.*)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, "").trim();
      }
    }
  } catch { /* optional */ }
}
loadEnvFile(".env");
loadEnvFile(".env.local");

const SUPABASE_URL     = process.env.SUPABASE_PROD_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUMP_MAJOR = process.argv.includes("--bump-major") || process.env.npm_config_bump_major === "true";
const BUMP_COUNT = (() => {
  const idx = process.argv.indexOf("--bump");
  if (idx !== -1) {
    const n = parseInt(process.argv[idx + 1], 10);
    return isNaN(n) || n < 1 ? 1 : n;
  }
  const positional = process.argv.slice(2).find(a => /^\d+$/.test(a));
  if (positional) {
    const n = parseInt(positional, 10);
    return isNaN(n) || n < 1 ? 1 : n;
  }
  return 1;
})();
const MAINTENANCE_MESSAGE = "We're rolling out an update. Back in just a moment!";

function run(cmd) {
  console.log(`\n  $ ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
}

async function setMaintenance(enabled, message = null) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/app_config?key=eq.maintenance_mode`, {
    method: "PATCH",
    headers: {
      apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json", Prefer: "return=minimal",
    },
    body: JSON.stringify({ value: { enabled, message }, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`Failed to set maintenance mode: ${res.status} ${await res.text()}`);
}

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
  return { newMajor, newMinor, versionKey, newVersion: `Rhozly OS ${versionKey}` };
}

function writeBuildVersionFile(versionKey, newMajor, newMinor) {
  writeFileSync(
    resolve(process.cwd(), "public/build-version.json"),
    JSON.stringify({ version: versionKey, major: newMajor, minor: newMinor, built_at: new Date().toISOString() }, null, 2) + "\n",
    "utf8",
  );
}

async function commitVersionAndReleaseNotes(newMajor, newMinor, versionKey, newVersion) {
  const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/app_config?key=eq.app_version`, {
    method: "PATCH",
    headers: {
      apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json", Prefer: "return=minimal",
    },
    body: JSON.stringify({ value: { major: newMajor, minor: newMinor }, updated_at: new Date().toISOString() }),
  });
  if (!patchRes.ok) throw new Error(`Failed to bump version: ${await patchRes.text()}`);

  let sections = [];
  try { sections = JSON.parse(readFileSync(resolve(process.cwd(), "release-notes.json"), "utf8")); } catch { /* empty */ }

  if (!sections.length) {
    console.warn("     ⚠️  release-notes.json is empty — deploying without release notes.");
  } else {
    const notesRes = await fetch(`${SUPABASE_URL}/rest/v1/release_notes`, {
      method: "POST",
      headers: {
        apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json", Prefer: "return=minimal",
      },
      body: JSON.stringify({ version: versionKey, major: newMajor, minor: newMinor, sections }),
    });
    if (!notesRes.ok) throw new Error(`Failed to insert release notes: ${await notesRes.text()}`);
    console.log(`     📝 Release notes saved for ${newVersion}`);
    writeFileSync(resolve(process.cwd(), "release-notes.json"), "[]\n", "utf8");
  }
}

async function deploy() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error("\n❌  Missing SUPABASE_PROD_URL / SUPABASE_SERVICE_ROLE_KEY in .env\n");
    process.exit(1);
  }

  console.log("\n🌿 Rhozly APP-ONLY deploy — starting (skips db push + functions deploy)\n");

  console.log("🔧  [1/4] Turning maintenance mode ON...");
  await setMaintenance(true, MAINTENANCE_MESSAGE);

  try {
    console.log("\n🔢  [2/4] Computing next app version + baking into build...");
    const { newMajor, newMinor, versionKey, newVersion } = await computeNextVersion(BUMP_MAJOR);
    writeBuildVersionFile(versionKey, newMajor, newMinor);
    console.log(`     → ${newVersion}  (public/build-version.json updated)`);

    console.log("\n🚀  [3/4] Deploying to Vercel...");
    run("vercel --prod");

    console.log("\n📝  [4/4] Committing app version + release notes...");
    await commitVersionAndReleaseNotes(newMajor, newMinor, versionKey, newVersion);

    console.log("\n✅  App deploy successful.");
    console.log("🌿  Turning maintenance mode OFF...");
    await setMaintenance(false);
    console.log("    Active users will get an automatic reload with the new version.\n");
  } catch (err) {
    console.error(`\n❌  Deployment failed: ${err.message}`);
    console.error("\n⚠️   Maintenance mode is still ON.");
    console.error("    Fix the issue, then run:  node scripts/clear-maintenance.mjs\n");
    process.exit(1);
  }
}

deploy();
