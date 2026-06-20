// Stripe webhook → the single source of truth that syncs subscription state into
// user_profiles. Verifies the Stripe signature, then on subscription / checkout /
// payment events maps the price → tier and writes subscription_tier + the
// ai_enabled / enable_perenual flags (which drive all tier-gating) plus the
// Stripe ids + status.
//
// Auth: none (verify_jwt = false). The Stripe signature IS the authentication.
// Idempotent: every handler sets absolute state from the current subscription,
// so duplicate deliveries are harmless.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { serviceClient } from "../_shared/supabaseClient.ts";
import { stripeClient, stripeCryptoProvider, Stripe } from "../_shared/stripe.ts";
import {
  type TierId,
  resolveSubscriptionTier,
  tierToFlags,
  statusGrantsAccess,
} from "../_shared/stripeTiers.ts";
import { log, warn } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";

const FN = "stripe-webhook";
const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";

// deno-lint-ignore no-explicit-any
type SupabaseDb = any;

serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const sig = req.headers.get("stripe-signature");
  const payload = await req.text();
  if (!sig) return new Response("Missing stripe-signature", { status: 400 });

  const stripe = stripeClient();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      payload,
      sig,
      WEBHOOK_SECRET,
      undefined,
      stripeCryptoProvider,
    );
  } catch (e) {
    warn(FN, "signature_verification_failed", { message: String(e) });
    return new Response(`Webhook signature verification failed: ${e}`, { status: 400 });
  }

  const db = serviceClient();
  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        await applySubscription(db, stripe, event.data.object as Stripe.Subscription);
        break;
      }
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "subscription" && session.subscription) {
          const sub = await stripe.subscriptions.retrieve(String(session.subscription));
          await applySubscription(db, stripe, sub);
        }
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        // deno-lint-ignore no-explicit-any
        const subId = (invoice as any).subscription;
        if (subId) {
          const sub = await stripe.subscriptions.retrieve(String(subId));
          await applySubscription(db, stripe, sub);
        }
        break;
      }
      default:
        // Unhandled event types are acknowledged so Stripe stops retrying them.
        break;
    }
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    await captureException(FN, e, { eventType: event.type });
    log(FN, "handler_error", { eventType: event.type, message: String(e) });
    // 500 → Stripe retries; the handler is idempotent so retries are safe.
    return new Response("Webhook handler error", { status: 500 });
  }
});

async function applySubscription(
  db: SupabaseDb,
  stripe: Stripe,
  sub: Stripe.Subscription,
): Promise<void> {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const price = sub.items.data[0]?.price;

  // Derive the tier from the live PRICE first — sub.metadata.tier is stamped at
  // checkout and goes stale after a portal-initiated plan change.
  const tier: TierId | null = resolveSubscriptionTier({
    priceMetadata: price?.metadata,
    priceId: price?.id,
    subscriptionMetadata: sub.metadata,
  });

  const grants = statusGrantsAccess(sub.status);
  const effectiveTier: TierId = grants && tier ? tier : "sprout";
  const flags = tierToFlags(effectiveTier);

  // current_period_end moved to item-level in newer API versions — read defensively.
  // deno-lint-ignore no-explicit-any
  const periodEndUnix: number | undefined =
    (sub as any).current_period_end ?? (sub.items.data[0] as any)?.current_period_end;
  const periodEnd =
    grants && periodEndUnix ? new Date(periodEndUnix * 1000).toISOString() : null;

  const patch = {
    subscription_tier: flags.subscription_tier,
    ai_enabled: flags.ai_enabled,
    enable_perenual: flags.enable_perenual,
    stripe_customer_id: customerId,
    stripe_subscription_id: grants ? sub.id : null,
    subscription_status: sub.status,
    subscription_period_end: periodEnd,
  };

  // Prefer the uid we stamped on the subscription; fall back to the customer id.
  const uid = typeof sub.metadata?.uid === "string" ? sub.metadata.uid : null;
  const filterCol = uid ? "uid" : "stripe_customer_id";
  const filterVal = uid ?? customerId;

  const { error, count } = await db
    .from("user_profiles")
    .update(patch, { count: "exact" })
    .eq(filterCol, filterVal);

  if (error) throw error;
  if (!count) {
    // No row matched — the customer/uid isn't linked to a profile yet. Surface it
    // rather than silently dropping the subscription state.
    warn(FN, "no_profile_matched", { filterCol, filterVal, customerId, subId: sub.id });
  } else {
    log(FN, "subscription_applied", {
      uid, customerId, subId: sub.id, status: sub.status, tier: effectiveTier,
    });
  }
}
