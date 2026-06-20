# Stripe subscriptions — one product per tier (sandbox-first)

## Goal

Charge for the paid tiers (Botanist / Sage / Evergreen) via Stripe monthly subscriptions; keep
**Sprout free**. Create a Stripe **Product for every tier incl. Sprout** (for catalogue + reporting).
Sync subscription state back into `user_profiles` so the existing tier-gating keeps working. Start in
the **Rhozly sandbox** (`acct_1Tk9i8BRYbu7Kokl`) so we can mock with test cards.

## Approach (from Stripe's implementation planner + best-practices skill)

- **Stripe-hosted Checkout** (`mode: "subscription"`) for sign-up — least code, PCI-safe, redirect flow.
- **Flat-rate Price per plan** (one recurring monthly Price per product). Use Prices (not legacy plans).
- **Freemium**: Sprout is the default when there's no active paid subscription. No trial, no card for free.
- **Hosted Customer Portal** for upgrade / downgrade / cancel / update card (no custom billing UI).
- **Webhook** is the source of truth: it writes tier + flags into `user_profiles`.
- **Default Smart Retries** for failed payments (Dashboard-configured) + handle `invoice.payment_failed`.
- **Never** pass `payment_method_types` (dynamic payment methods). **Restricted API key (RAK)** — see security.

## Current tier model (what we wire into)

- `src/constants/tiers.ts` — `TIERS` (sprout/botanist/sage/evergreen) each with `ai_enabled` +
  `enable_perenual` booleans. `tierIdFromFlags()` derives tier from the two flags.
- `user_profiles` columns `subscription_tier`, `ai_enabled`, `enable_perenual` drive **all** gating
  (client + server). Today `GardenerProfile.confirmSwitchTier()` just updates those directly (free,
  instant). Stripe replaces that for **paid** tiers; the webhook becomes the authoritative writer.

## App-reference consulted

- `99-cross-cutting/17-tier-gating.md` (the gating contract), `19-rls-patterns.md`,
  `01-data-model-home.md` (user_profiles), `10-edge-functions-catalogue.md`, `11-cron-jobs.md`,
  `06-account/01-account-tab.md` (the "switch plan" flow), `13-ai-gemini.md`/quota (tier limits).

## Stripe objects (created via the Stripe MCP in the sandbox)

- 4 **Products**: Sprout, Botanist, Sage, Evergreen.
- **Prices** (monthly, GBP): Botanist / Sage / Evergreen at the amounts you choose; Sprout a **£0**
  recurring price (for catalogue/reporting completeness — not used in Checkout).
- A **price_id → tier** map the webhook + checkout use. Stored as edge-function **env** (e.g.
  `STRIPE_PRICE_BOTANIST/SAGE/EVERGREEN`) so sandbox vs prod IDs differ without code changes.
- **Billing Portal** configuration (Dashboard/API) listing the 3 paid prices as switchable products.

## Database (migration)

Add to `user_profiles` (keyed by `uid`): `stripe_customer_id text`, `stripe_subscription_id text`,
`subscription_status text`, `subscription_period_end timestamptz`. Index `stripe_customer_id`
(webhook lookup). No new grants (existing table). `subscription_tier`/`ai_enabled`/`enable_perenual`
stay the read path — the webhook keeps them current.

## Edge functions (3 new)

| Function | Auth | Job |
|----------|------|-----|
| `stripe-create-checkout` | user JWT | Find-or-create the user's Stripe Customer (store `stripe_customer_id`), create a Checkout Session (`mode: subscription`, `line_items:[{price: tierPriceId}]`, `client_reference_id = uid`, `success_url`/`cancel_url` → `/gardener?tab=account&checkout=...`), return `session.url`. |
| `stripe-portal` | user JWT | Create a Billing Portal session for the user's customer → return `url` (manage/cancel/switch). |
| `stripe-webhook` | **none** (`verify_jwt=false`) | Verify the Stripe signature (`STRIPE_WEBHOOK_SECRET`); on `checkout.session.completed`, `customer.subscription.created/updated/deleted`, `invoice.payment_failed` → map price→tier, update `user_profiles` (tier + `ai_enabled`/`enable_perenual` + stripe ids + status + period_end). Idempotent (event id guard). |

Shared `_shared/stripeTiers.ts` — price↔tier map + `tierToFlags(tier)` (reuse `tierIdFromFlags`).

## Frontend (GardenerProfile "Your Plan")

- Paid tier select → call `stripe-create-checkout` → redirect to Checkout (replaces the instant
  `confirmSwitchTier` DB write for paid tiers).
- "Manage billing" / cancel / downgrade → call `stripe-portal` → redirect to the portal.
- Sprout (free): no checkout — it's the default after a paid sub is cancelled (portal handles it; the
  webhook flips them back to Sprout on `subscription.deleted`).
- `success_url` lands on `/gardener?tab=account&checkout=success` → toast + refetch profile.
- Keep the existing direct-switch path **only for admins** (test/QA override), so you can still flip
  tiers without paying in non-Stripe scenarios.

## Security (per the skill)

- Recommend a **Restricted API Key (RAK, `rk_`)** scoped to Checkout/Customers/Subscriptions/Billing
  Portal/Webhooks — not the raw `sk_`. Held as the `STRIPE_SECRET_KEY` **Supabase edge-function
  secret** (set via Dashboard, like `GOOGLE_CLOUD_API_KEY`). `STRIPE_WEBHOOK_SECRET` likewise.
- Browser needs **no** Stripe key (hosted Checkout is a redirect). No secret ever client-side.

## Sandbox testing

- Create products/prices in the sandbox via MCP. Card `4242 4242 4242 4242`.
- Webhook: register the deployed `stripe-webhook` URL as a sandbox endpoint (or `stripe listen`
  forwarding for local). Verify tier flips in `user_profiles` after a test checkout.

## Tests + docs

- Deno unit tests for the pure price↔tier mapping (`_shared/stripeTiers.ts`).
- New app-reference `06-account/<n>-billing.md`; update `17-tier-gating.md` (Stripe now the writer for
  paid tiers), `10-edge-functions-catalogue.md` (+3 functions), `01-account-tab.md` (plan flow).

## Decisions (confirmed)

1. **Prices (monthly, GBP):** Botanist **£2.99**, Sage **£4.99**, Evergreen **£6.99**. Sprout **£0**.
   (Revised from £2/£5/£10 — see "Price revision" below.)
2. **Free users:** no Stripe subscription — Sprout = "no active paid sub". The Sprout product exists
   only for catalogue/reporting.
3. **Key:** restricted key (`rk_`) held as a Supabase secret.
4. **Sandbox only** for now — **do not touch Stripe production.** Functions deploy to prod Supabase
   but use **sandbox** Stripe keys.

## Sandbox-safe rollout (so prod users aren't exposed to test-mode checkout)

The edge functions live in the single (prod) Supabase project but are wired to **sandbox** Stripe.
To avoid real users hitting test-mode Checkout, the new billing UI in GardenerProfile is **gated to
`isAdmin`** during this phase (you can test it end-to-end; everyone else keeps today's tier-switch).
Going live later = (a) swap the Supabase secret to the **live** restricted key + live price IDs,
(b) point a **live** webhook endpoint at the function, (c) remove the admin gate. No code rewrite.

## Env / secrets (you set these in Supabase → Edge Functions → Secrets)

`STRIPE_SECRET_KEY` (sandbox `rk_`), `STRIPE_WEBHOOK_SECRET` (sandbox endpoint signing secret),
`STRIPE_PRICE_BOTANIST` / `STRIPE_PRICE_SAGE` / `STRIPE_PRICE_EVERGREEN` (sandbox price IDs I create).
`APP_URL` for success/cancel redirects (or derive from request origin).

## Created sandbox objects (Rhozly sandbox `acct_1Tk9i8BRYbu7Kokl`, livemode=false)

| Tier | Product | Price (monthly GBP) | Secret to set |
|------|---------|---------------------|---------------|
| Sprout | `prod_UjkHAGrHoBXZRp` | `price_1TkGngBRYbu7KoklRp8cdPsC` (£0) | — (not used in checkout) |
| Botanist | `prod_UjkHrOPlTc6A3s` | `price_1TkGniBRYbu7KoklrAIO9ZkF` (£2) | `STRIPE_PRICE_BOTANIST` |
| Sage | `prod_UjkHB78is97GJz` | `price_1TkGnjBRYbu7KoklB5QIF31L` (£5) | `STRIPE_PRICE_SAGE` |
| Evergreen | `prod_UjkH4GGzFq4PFf` | `price_1TkGnkBRYbu7KoklB1xfxC1Q` (£10) | `STRIPE_PRICE_EVERGREEN` |

Each product + price carries `metadata.tier` so the webhook can map back to a tier even without env.

### Price revision (£2.99 / £4.99 / £6.99)

Stripe prices are immutable, so new Prices were created on the same products:

| Tier | New Price (monthly GBP) | Secret |
|------|-------------------------|--------|
| Botanist | `price_1TkIekBRYbu7Kokl3lwsHsce` (£2.99) | `STRIPE_PRICE_BOTANIST` |
| Sage | `price_1TkIelBRYbu7KoklQVybX7lF` (£4.99) | `STRIPE_PRICE_SAGE` |
| Evergreen | `price_1TkIelBRYbu7Kokl6Jwb6EcB` (£6.99) | `STRIPE_PRICE_EVERGREEN` |

The old £2/£5/£10 prices still exist (immutable). Repoint the three secrets + the
billing portal's "switch plans" products at the new ids, then optionally archive the
old prices. The webhook maps any price → tier via `price.metadata.tier`, so it keeps
working through the switch.

## Status — BUILT ✅ (sandbox, pre-deploy)

Implemented + verified locally:
- Stripe sandbox: 4 products + 4 prices created (table above).
- Migration `20260811000000_stripe_subscriptions.sql` — applied locally ✅.
- `_shared/stripeTiers.ts` + `_shared/stripe.ts`; functions `stripe-create-checkout`, `stripe-portal`,
  `stripe-webhook` (+ `config.toml` verify_jwt). Deno check ✅ clean.
- GardenerProfile "Your Plan": admin-gated Checkout/Portal + price labels + `?checkout=` return handler.
- Tests: `supabase/tests/stripeTiers.test.ts` (7). Gates green — **build ✅**, unit ✅ 1016/1016,
  Deno ✅ 627/627.
- Docs: `06-account/01-account-tab.md`, `99-cross-cutting/10-edge-functions-catalogue.md` +
  `17-tier-gating.md`, TESTING.md inventory, `docs/e2e-test-plan/12-profile.md` (GP-012).

### Remaining (needs the user + a deploy)
1. **Stripe sandbox Dashboard:** create a **restricted key** (scopes: Customers=Write, Checkout
   Sessions=Write, Subscriptions=Read, Billing Portal=Write) → `rk_…`. Create a **webhook endpoint**
   → URL `https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/stripe-webhook`, events
   `customer.subscription.created|updated|deleted`, `checkout.session.completed`,
   `invoice.payment_failed` → copy the signing secret `whsec_…`.
2. **Supabase → Edge Functions → Secrets:** set `STRIPE_SECRET_KEY=rk_…`, `STRIPE_WEBHOOK_SECRET=whsec_…`,
   `STRIPE_PRICE_BOTANIST=price_1TkGniBRYbu7KoklrAIO9ZkF`, `STRIPE_PRICE_SAGE=price_1TkGnjBRYbu7KoklB5QIF31L`,
   `STRIPE_PRICE_EVERGREEN=price_1TkGnkBRYbu7KoklB1xfxC1Q`.
3. **Deploy** (`npm run deploy`) — pushes the migration + deploys the 3 functions + Vercel.
4. **Test** as admin: `/gardener?tab=account` → pick Botanist → Subscribe → card `4242 4242 4242 4242` →
   confirm the tier flips (webhook → `user_profiles`). No user-facing release note yet (admin-only).
