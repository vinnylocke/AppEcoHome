/**
 * Rhozly deploy automation
 *
 * Usage:
 *   node scripts/deploy.mjs
 *   node scripts/deploy.mjs "Deploying new plant features, back in ~2 mins!"
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
import { readFileSync } from "fs";
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
const MAINTENANCE_MESSAGE = process.argv[2] ?? "We're rolling out an update. Back in just a moment!";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function run(cmd) {
  console.log(`\n  $ ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
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

  // Step 1: maintenance ON
  console.log("🔧  [1/3] Turning maintenance mode ON...");
  await setMaintenance(true, MAINTENANCE_MESSAGE);
  console.log(`     Users will see: "${MAINTENANCE_MESSAGE}"`);

  try {
    // Step 2: push DB migrations
    console.log("\n📦  [2/4] Pushing database migrations...");
    run("supabase db push");

    // Step 3: deploy all edge functions so they stay in sync with the frontend
    console.log("\n⚡  [3/4] Deploying edge functions...");
    run("supabase functions deploy");

    // Step 4: deploy to Vercel (blocks until live)
    console.log("\n🚀  [4/4] Deploying to Vercel...");
    run("vercel --prod");

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
