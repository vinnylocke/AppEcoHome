/**
 * Backfill Stripe customers for prod accounts that don't have one.
 *
 *   node scripts/backfill-stripe-customers.mjs
 *
 * Calls the deployed `stripe-ensure-customer` function (find-or-create,
 * idempotent) for every `user_profiles` row with `stripe_customer_id IS NULL`,
 * so the customers are created with the APP's Stripe key (same account + shape).
 * Safe to re-run.
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

for (const f of [".env", ".env.local"]) {
  try {
    for (const l of readFileSync(resolve(process.cwd(), f), "utf8").split("\n")) {
      const m = l.match(/^([A-Z_a-z][A-Z_a-z0-9]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
    }
  } catch { /* optional */ }
}

const URL = process.env.SUPABASE_PROD_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error("✖ Missing SUPABASE_PROD_URL / SUPABASE_SERVICE_ROLE_KEY in .env"); process.exit(1); }

const sb = createClient(URL, KEY, { auth: { persistSession: false } });

const { data: missing, error } = await sb
  .from("user_profiles").select("uid, email").is("stripe_customer_id", null);
if (error) { console.error("✖ query failed:", error.message); process.exit(1); }

console.log(`\n${missing.length} account(s) without a Stripe customer:\n`);
for (const p of missing) {
  const res = await fetch(`${URL}/functions/v1/stripe-ensure-customer`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}`, apikey: KEY },
    body: JSON.stringify({ uid: p.uid }),
  });
  const out = await res.json().catch(() => ({}));
  console.log(`  ${p.email ?? "(no email)"} → ${res.status} ${JSON.stringify(out)}`);
}

const { data: after } = await sb
  .from("user_profiles").select("email, stripe_customer_id").order("created_at");
console.log("\nFinal state:");
for (const p of after) console.log(`  ${p.email ?? "(no email)"} → ${p.stripe_customer_id ?? "STILL NONE"}`);
console.log("");
