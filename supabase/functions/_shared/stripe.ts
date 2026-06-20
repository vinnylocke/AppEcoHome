// Central Stripe client factory for edge functions — keeps the SDK version and
// the Deno (fetch + SubtleCrypto) wiring in one place.
//
// The STRIPE_SECRET_KEY secret holds a *restricted* key (rk_…) in the sandbox;
// swap it for a live restricted key when going to production. Never expose it
// to the browser — these functions are the only place it is read.

import Stripe from "https://esm.sh/stripe@18?target=deno";

// Pin the API version explicitly so an SDK bump can't silently change behaviour.
// Typed as `string` then cast, so deno check stays green even if the SDK's
// literal union lags the account's current version.
const API_VERSION: string = "2026-05-27.dahlia";

const SECRET = Deno.env.get("STRIPE_SECRET_KEY") ?? "";

/** Shared Stripe client configured for the Deno runtime (fetch-based HTTP). */
export function stripeClient(): Stripe {
  return new Stripe(SECRET, {
    apiVersion: API_VERSION as Stripe.LatestApiVersion,
    httpClient: Stripe.createFetchHttpClient(),
  });
}

// SubtleCrypto provider required for async webhook signature verification in
// Deno (the sync crypto path Stripe uses by default isn't available here).
export const stripeCryptoProvider = Stripe.createSubtleCryptoProvider();

export { Stripe };
