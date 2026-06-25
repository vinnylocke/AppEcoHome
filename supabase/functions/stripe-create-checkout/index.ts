// Creates a Stripe Checkout Session (mode: subscription) for a paid tier and
// returns its hosted URL. The browser redirects there; the resulting
// subscription is synced back into user_profiles by the stripe-webhook function.
//
// Auth: requires a logged-in user (verify_jwt = true + requireAuth).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { serviceClient } from "../_shared/supabaseClient.ts";
import { requireAuth } from "../_shared/requireAuth.ts";
import { stripeClient } from "../_shared/stripe.ts";
import { ensureStripeCustomer } from "../_shared/stripeCustomer.ts";
import { isValidTier, priceIdForTier } from "../_shared/stripeTiers.ts";
import { log } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";

const FN = "stripe-create-checkout";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const db = serviceClient();
    // serviceClient() is supabase-js@2.49.4; requireAuth pins @2.39.3 — the clients
    // are wire-compatible, so bridge the version-pinned SupabaseClient types.
    const auth = await requireAuth(req, db as unknown as Parameters<typeof requireAuth>[1]);
    if (auth instanceof Response) return auth;
    const userId = auth.user.id;

    const body = await req.json().catch(() => ({}));
    const tier = (body as { tier?: unknown })?.tier;
    if (!isValidTier(tier) || tier === "sprout") {
      return json({ error: "A paid tier (botanist, sage or evergreen) is required." }, 400);
    }

    const priceId = priceIdForTier(tier);
    if (!priceId) return json({ error: `No Stripe price configured for ${tier}.` }, 500);

    const { data: profile } = await db
      .from("user_profiles")
      .select("uid, email, stripe_customer_id")
      .eq("uid", userId)
      .maybeSingle();

    const stripe = stripeClient();

    // Find-or-create the Stripe Customer and persist it so future checkouts +
    // the billing portal reuse the same customer (shared with the on-signup path).
    const customerId = await ensureStripeCustomer(db, stripe, {
      uid: userId,
      email: profile?.email ?? null,
      stripe_customer_id: profile?.stripe_customer_id ?? null,
    });

    // Already subscribed? Send them to the billing portal to change plans rather
    // than stacking a second subscription (which would double-bill).
    const active = await stripe.subscriptions.list({ customer: customerId, status: "active", limit: 1 });
    if (active.data.length > 0) {
      log(FN, "already_subscribed", { userId, customerId });
      return json({ portal: true });
    }

    const origin = req.headers.get("origin") ?? Deno.env.get("APP_URL") ?? "https://rhozly.com";

    // No payment_method_types — let Stripe pick eligible methods dynamically.
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: userId,
      subscription_data: { metadata: { uid: userId, tier } },
      allow_promotion_codes: true,
      success_url: `${origin}/gardener?tab=account&checkout=success&tier=${tier}`,
      cancel_url: `${origin}/gardener?tab=account&checkout=cancelled`,
    });

    log(FN, "checkout_created", { userId, tier, customerId });
    return json({ url: session.url });
  } catch (e) {
    await captureException(FN, e);
    log(FN, "error", { message: String(e) });
    return json({ error: "Could not start checkout. Please try again." }, 500);
  }
});
