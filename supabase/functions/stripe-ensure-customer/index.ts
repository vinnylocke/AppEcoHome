// Find-or-create a Stripe Customer for a user, idempotently.
//
// Called by the on-signup DB trigger (`on_user_profile_created_ensure_stripe`)
// with `{ uid }` so every new user gets a customer regardless of tier or signup
// method — and reused by the one-off backfill. `verify_jwt = false`; uses the
// service-role client. Idempotent + bounded: it only ever creates the single
// customer that uid is meant to have (uid must exist; an existing id is reused),
// so the worst any caller can do is trigger the creation we already want.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { serviceClient } from "../_shared/supabaseClient.ts";
import { stripeClient } from "../_shared/stripe.ts";
import { ensureStripeCustomer } from "../_shared/stripeCustomer.ts";
import { log, error as logError } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";

const FN = "stripe-ensure-customer";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const body = await req.json().catch(() => ({})) as { uid?: unknown };
    const uid = typeof body.uid === "string" ? body.uid : null;
    if (!uid) return json({ error: "uid required" }, 400);

    const db = serviceClient();
    const { data: profile } = await db
      .from("user_profiles")
      .select("uid, email, stripe_customer_id")
      .eq("uid", uid)
      .maybeSingle();

    if (!profile) return json({ error: "profile not found" }, 404);
    if (profile.stripe_customer_id) {
      return json({ customer: profile.stripe_customer_id, created: false });
    }

    const customer = await ensureStripeCustomer(db, stripeClient(), {
      uid: profile.uid as string,
      email: (profile.email as string | null) ?? null,
      stripe_customer_id: null,
    });
    log(FN, "ensured", { uid, customer });
    return json({ customer, created: true });
  } catch (err) {
    logError(FN, "fatal", { message: err instanceof Error ? err.message : String(err) });
    await captureException(FN, err);
    return json({ error: "internal error" }, 500);
  }
});
