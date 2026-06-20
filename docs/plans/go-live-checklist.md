# Go-Live Readiness Checklist

What must be true before opening Rhozly to the paying public. Grouped by "real blocker"
vs "already in place" vs "post-launch". Current state: **Stripe is sandbox + admin-gated**;
AI cost/observability is live.

---

## 1. Stripe → LIVE mode (the monetisation blocker) 🔴

Everything billing-related is currently wired to the **sandbox**. None of it charges real
money until these are done. Do them together, then flip the gate (section 2).

### In the Stripe **live** dashboard (toggle off "Test mode")
- [ ] **Create the 4 products + live prices** (Sprout £0, Botanist £2.99, Sage £4.99, Evergreen
      £6.99) — sandbox objects do NOT carry over. Set `metadata.tier` on each price (the webhook
      maps price→tier from it). *(I can create these via the Stripe MCP once you're ready, same as
      the sandbox ones.)*
- [ ] **Create a live restricted key** (`rk_live_…`) with: Customers=Write, Checkout Sessions=Write,
      Subscriptions=Read, Billing Portal=Write.
- [ ] **Add a live webhook endpoint** → `https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/stripe-webhook`,
      events: `customer.subscription.created|updated|deleted`, `checkout.session.completed`,
      `invoice.payment_failed`. Copy the live signing secret (`whsec_…`).
- [ ] **Save the Customer Portal config** in live mode (cancel + switch-plans with the 3 live
      products) — sandbox portal config doesn't carry over.

### In Supabase → Edge Functions → Secrets (swap sandbox → live)
- [ ] `STRIPE_SECRET_KEY` → the live `rk_live_…`
- [ ] `STRIPE_WEBHOOK_SECRET` → the live `whsec_…`
- [ ] `STRIPE_PRICE_BOTANIST` / `_SAGE` / `_EVERGREEN` → the live price IDs
- [ ] (No redeploy needed — functions read secrets at runtime. The `sync-stripe-ai-cost` cron then
      writes cost onto **live** customers automatically.)

### Verify in live (use a real card, refund yourself, or Stripe's live-mode test window)
- [ ] One real checkout → tier flips in `user_profiles` (the webhook).
- [ ] Manage billing opens the live portal; cancel returns to Sprout.

---

## 2. Remove the admin gate on billing 🔴 (code — 1 small change)

The Checkout/portal UI in `GardenerProfile` is gated to `isAdmin` so real users never hit
test-mode checkout. Going live = let everyone see it.

- [ ] In `src/components/GardenerProfile.tsx`, change the admin-gated billing path so **all users**
      get Checkout (the `handleUpdatePlan` admin branch + the "Manage billing" button + the price
      labels currently keyed on `isAdmin`). Ship it in the **same release** as the live secrets.
- [ ] Decide the non-admin tier-switch behaviour: today non-admins still have the legacy free
      instant switch. At go-live, paid tiers should route through Checkout for everyone (remove the
      honour-system path, or keep it only behind an env flag for QA).

---

## 3. Already in place ✅ (verify, don't rebuild)

- **AI cost + observability** — every AI call logs accurate cost; `/admin/ai-calls` shows
  cost/tokens/context/prompt/result; `sync-stripe-ai-cost` mirrors cost-to-serve onto each Stripe
  customer. *(Watch cost-to-serve vs the £2.99/£4.99/£6.99 prices once real traffic flows.)*
- **Tier gating** — enforced client + server (`ai_enabled` / `enable_perenual`, rate limits per tier).
- **Error monitoring** — Sentry wired in edge functions + client.
- **Rate limiting** — per-user/per-tier hourly caps + per-IP caps on unauthenticated endpoints.
- **Maintenance mode + deploy pipeline** — `npm run deploy` (maintenance ON → migrations → functions
  → Vercel → version bump → maintenance OFF); rollback via `npm run maintenance:off`.
- **Feedback loop** — 👍/👎 on chat, AI Area Coach, yield, Plant Doctor diagnosis → admin panel.
- **Prune cron** — nulls AI prompt/result payloads after 30 days (privacy + storage).

---

## 4. Worth a pre-launch pass (not hard blockers)

- [ ] **Pricing sanity** — once a little real AI usage exists, compare per-customer cost-to-serve (on
      the Stripe customer / `/admin/ai-calls`) against the tier prices. Evergreen at £6.99 with full
      AI is the one to watch; raise it or cap quotas if cost-to-serve creeps up.
- [ ] **Legal** — Terms + Privacy links in the Stripe Checkout/Portal config + in-app (you store
      AI prompts for 30 days — mention it).
- [ ] **Quotas at scale** — the per-tier hourly AI limits (`_shared/rateLimit.ts`) are tuned for
      pre-release; sanity-check they're sustainable for paying volume.
- [ ] **Run the E2E suite** against a seeded stack (`npm run test:e2e:fresh`) before the launch deploy.

---

## 5. Post-launch (needs real data — do NOT block launch)

- **Phase 4 — AI re-score**: re-rate features against the rubric using real `ai_usage_log` /
  `ai_feedback` data (see `docs/plans/ai-audit-and-improvement.md`). Meaningless until traffic exists.
- **Remaining feedback surfaces**: wire `AiFeedback` into the Garden Overhaul concept picker +
  generated guides (mechanical — `src/components/planner/OverhaulConceptPicker.tsx`, the guide reader).
- **Watch the funnel**: checkout starts vs completions, churn, which tiers convert.

---

## TL;DR — the only true blockers

1. **Swap Stripe to live** (products/prices, live key, live webhook, live portal, swap 5 secrets).
2. **Drop the `isAdmin` billing gate** + route all paid switches through Checkout.

Everything else is in place or is post-launch. When you're ready, tell me and I'll create the live
Stripe objects via the MCP and make the gate change in one release.
