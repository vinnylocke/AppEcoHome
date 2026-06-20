// Creates a Stripe Billing Portal session so the user can self-manage their
// subscription (upgrade / downgrade / cancel / update card) and returns its URL.
//
// Auth: requires a logged-in user (verify_jwt = true + requireAuth).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { serviceClient } from "../_shared/supabaseClient.ts";
import { requireAuth } from "../_shared/requireAuth.ts";
import { stripeClient } from "../_shared/stripe.ts";
import { log } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";

const FN = "stripe-portal";

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

    const { data: profile } = await db
      .from("user_profiles")
      .select("stripe_customer_id")
      .eq("uid", userId)
      .maybeSingle();

    if (!profile?.stripe_customer_id) {
      return json({ error: "No billing account yet. Subscribe to a paid plan first." }, 400);
    }

    const origin = req.headers.get("origin") ?? Deno.env.get("APP_URL") ?? "https://rhozly.com";

    const stripe = stripeClient();
    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${origin}/gardener?tab=account`,
    });

    log(FN, "portal_created", { userId });
    return json({ url: session.url });
  } catch (e) {
    await captureException(FN, e);
    log(FN, "error", { message: String(e) });
    return json({ error: "Could not open billing portal. Please try again." }, 500);
  }
});
