# Create a Stripe customer on signup (+ backfill existing accounts)

## Finding
A Stripe customer is **not** created at signup — it's created **lazily at checkout** in `stripe-create-checkout/index.ts` (find-or-create on `user_profiles.stripe_customer_id`). Free-tier users (and anyone whose tier was set manually) never get a customer.

Confirmed on prod (Stripe = "Rhozly sandbox", test mode):
- `vinnylocke@gmail.com` → has `cus_…` (went through checkout)
- `lfuller21@googlemail.com`, `test.rhozly@rhozly.com`, `test.rhozly+sprout@rhozly.com` → **no** customer

## Goals
1. **Backfill** a Stripe customer for the 3 prod accounts that lack one.
2. **On signup**, always create a Stripe customer (every tier, every signup method) — so the flow matches expectation.

## App-reference consulted
- `docs/app-reference/99-cross-cutting/10-edge-functions-catalogue.md`
- billing / Stripe surface refs (to be cited from the index)

## Approach
1. **Shared helper** `supabase/functions/_shared/stripeCustomer.ts` — `ensureStripeCustomer(db, stripe, { uid, email, stripe_customer_id })`: returns existing id, else `stripe.customers.create({ email, metadata: { uid } })` + persists `stripe_customer_id`. Extracted from the exact logic already in `stripe-create-checkout` (which is updated to call it — no behaviour change).

2. **New edge function** `stripe-ensure-customer` (`verify_jwt = false`): reads `{ uid }` from the body, loads that profile with the service-role client, and calls `ensureStripeCustomer`. **Idempotent + bounded**: it only ever creates the one customer that uid is supposed to have (uid must exist; existing id is reused), so it needs no extra secret — the worst a caller can do is trigger the creation we already want.

3. **Signup hook (recommended): DB trigger** `on_user_profile_created` — `AFTER INSERT ON public.user_profiles` → `net.http_post` to `stripe-ensure-customer` with `{ uid: NEW.uid }` (same publishable-key auth pattern the existing device/cron triggers use). True "on signup", server-side, covers email **and** OAuth (Google/Apple), runs before first login. Async/best-effort; the existing lazy-at-checkout path remains the fallback.
   - *Alternative if you'd rather avoid a trigger:* call `stripe-ensure-customer` from the app on first authenticated session when `stripe_customer_id` is null. Simpler, but only fires for users who actually log in.

4. **Backfill** `scripts/backfill-stripe-customers.mjs` — invokes `stripe-ensure-customer` for the 3 accounts (resolved from prod `user_profiles` where `stripe_customer_id IS NULL`). Uses the deployed function so the customers are created with the **app's** Stripe key (same account) + exact shape. Re-runnable (idempotent).

## Files
- `supabase/functions/_shared/stripeCustomer.ts` — new shared helper.
- `supabase/functions/stripe-ensure-customer/index.ts` — new function.
- `supabase/functions/stripe-create-checkout/index.ts` — use the shared helper.
- `supabase/migrations/<ts>_stripe_customer_on_signup.sql` — the AFTER INSERT trigger (apply local first).
- `scripts/backfill-stripe-customers.mjs` — one-off backfill.

## Tests / docs
- **Deno test** for `ensureStripeCustomer` (mock stripe + db: returns existing id; creates + persists when missing).
- Update `10-edge-functions-catalogue.md` (+ the billing reference + `11-cron-jobs.md` note for the trigger).

## Safety
- Stripe is **test mode** (`livemode:false`) — no real charges; customer records only.
- Idempotent everywhere (find-or-create) — safe to re-run; won't duplicate.
- Migration applied locally first, pushed on confirmation.

## Open question
Signup hook: **DB trigger** (recommended, true on-signup) or **app first-session** ensure (simpler)?
