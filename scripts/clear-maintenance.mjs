/**
 * Emergency maintenance mode kill-switch.
 * Run this if a deploy fails and users are stuck on the maintenance screen.
 *
 * Usage:  node scripts/clear-maintenance.mjs
 */

import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnvFile(filename) {
  try {
    const content = readFileSync(resolve(process.cwd(), filename), "utf8");
    for (const line of content.split("\n")) {
      const match = line.match(/^([A-Z_a-z][A-Z_a-z0-9]*)=(.*)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {}
}
loadEnvFile(".env");
loadEnvFile(".env.local");

const SUPABASE_URL     = process.env.SUPABASE_PROD_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("❌  Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const res = await fetch(`${SUPABASE_URL}/rest/v1/app_config?key=eq.maintenance_mode`, {
  method: "PATCH",
  headers: {
    apikey:         SERVICE_ROLE_KEY,
    Authorization:  `Bearer ${SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    Prefer:         "return=minimal",
  },
  body: JSON.stringify({
    value:      { enabled: false, message: null },
    updated_at: new Date().toISOString(),
  }),
});

if (res.ok) {
  console.log("✅  Maintenance mode is OFF. Users will reload automatically.");
} else {
  console.error(`❌  Failed: ${res.status} ${await res.text()}`);
  process.exit(1);
}
