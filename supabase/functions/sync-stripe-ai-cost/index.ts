// Daily cron — mirror each user's AI cost-to-serve onto their Stripe Customer
// metadata so it shows on the customer page next to their subscription.
//
// Source of truth is the DB (ai_usage_log); this just pushes a rollup to Stripe
// for the subset of users who have a Stripe customer. The in-app admin view
// covers everyone (incl. free users with no Stripe customer).
//
// Auth: none (verify_jwt = false) — triggered by pg_cron's net.http_post.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { serviceClient } from "../_shared/supabaseClient.ts";
import { stripeClient } from "../_shared/stripe.ts";
import { log, warn } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";

const FN = "sync-stripe-ai-cost";

interface RollupRow {
  user_id: string;
  stripe_customer_id: string;
  cost_30d: number;
  cost_total: number;
  calls_30d: number;
}

serve(async (_req) => {
  try {
    const db = serviceClient();
    const { data, error } = await db.rpc("ai_cost_rollup_for_stripe");
    if (error) throw error;

    const rows = (data ?? []) as RollupRow[];
    const stripe = stripeClient();
    let updated = 0;
    let failed = 0;

    for (const r of rows) {
      if (!r.stripe_customer_id) continue;
      try {
        await stripe.customers.update(r.stripe_customer_id, {
          metadata: {
            ai_cost_usd_30d:   Number(r.cost_30d ?? 0).toFixed(4),
            ai_cost_usd_total: Number(r.cost_total ?? 0).toFixed(4),
            ai_calls_30d:      String(r.calls_30d ?? 0),
            ai_cost_updated_at: new Date().toISOString(),
          },
        });
        updated++;
      } catch (e) {
        failed++;
        warn(FN, "customer_update_failed", { customer: r.stripe_customer_id, message: String(e) });
      }
    }

    log(FN, "done", { customers: rows.length, updated, failed });
    return new Response(JSON.stringify({ ok: true, customers: rows.length, updated, failed }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    await captureException(FN, e);
    log(FN, "error", { message: String(e) });
    return new Response(JSON.stringify({ error: "sync failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
