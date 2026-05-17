import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// ── Config ────────────────────────────────────────────────────────────────────

const REDIRECT_URL = "https://rhozly.com/";
const DELAY_MS = 300; // stay within Supabase rate limits
const DRY_RUN = process.argv.includes("--dry-run");

// ── Load env ──────────────────────────────────────────────────────────────────

function loadEnv() {
  const envPath = resolve(root, ".env");
  if (!existsSync(envPath)) throw new Error(".env file not found");
  const raw = readFileSync(envPath, "utf8");
  const vars = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    vars[key] = val;
  }
  return vars;
}

const env = loadEnv();
const supabaseUrl = env["VITE_SUPABASE_URL"]?.replace(/\s/g, "");
const serviceKey = env["SUPABASE_SERVICE_ROLE_KEY"]?.replace(/\s/g, "");

// For local dev the URL points to 127.0.0.1 — override to production if present
const prodUrl = "https://yiuuzlfhtsxbspdyibam.supabase.co";

if (!supabaseUrl || !serviceKey) {
  console.error("❌  Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

// Always invite against production, not local
const effectiveUrl = supabaseUrl.includes("127.0.0.1") ? prodUrl : supabaseUrl;
const supabase = createClient(effectiveUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Load email list ───────────────────────────────────────────────────────────

const listPath = resolve(root, "beta-invites.txt");
if (!existsSync(listPath)) {
  console.error("❌  beta-invites.txt not found in project root");
  console.error("    Create it with one email per line. Lines starting with # are ignored.");
  process.exit(1);
}

const emails = readFileSync(listPath, "utf8")
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"));

if (emails.length === 0) {
  console.log("⚠️  No emails found in beta-invites.txt — nothing to do.");
  process.exit(0);
}

// ── Run ───────────────────────────────────────────────────────────────────────

console.log(`\n🌿  Rhozly beta invites${DRY_RUN ? " (DRY RUN — no emails will be sent)" : ""}`);
console.log(`    ${emails.length} email${emails.length === 1 ? "" : "s"} to process\n`);

let sent = 0;
let skipped = 0;
let failed = 0;

for (const email of emails) {
  if (DRY_RUN) {
    console.log(`    ✉️  ${email}`);
    sent++;
    continue;
  }

  const { error } = await supabase.auth.admin.inviteUserByEmail(email, {
    redirectTo: REDIRECT_URL,
  });

  if (error) {
    // 422 "User already registered" — not an error we care about
    if (error.message?.toLowerCase().includes("already")) {
      console.log(`  ⏭  ${email} — already registered, skipped`);
      skipped++;
    } else {
      console.log(`  ✗  ${email} — ${error.message}`);
      failed++;
    }
  } else {
    console.log(`  ✓  ${email}`);
    sent++;
  }

  await new Promise((r) => setTimeout(r, DELAY_MS));
}

console.log(`\n    Done. Sent: ${sent}  Skipped: ${skipped}  Failed: ${failed}\n`);
if (failed > 0) process.exit(1);
