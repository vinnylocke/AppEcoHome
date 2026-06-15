# Sprint 3 — tier-gating overhaul

Source: [docs/plans/ux-review-action-analysis-2026-06-15.md](./ux-review-action-analysis-2026-06-15.md), items 3.1 + 1.1.

## Items

| # | Item | Difficulty | Schema work |
|---|---|---|---|
| 3.1 | **Free Plant Doctor identify-only** — 5 IDs per rolling 7-day window, no diagnosis | M | None (reuses `ai_usage_log`) |
| 1.1 | **Defer tier selection** — skip Tier Selection on signup; default Sprout; upsell on intent | M | None |

These pair naturally: deferring tier selection only works if "what do I get for free?" has a clear answer, which is what the quota delivers.

---

## Item 3.1 — implementation sketch

**Discovery findings:**
- `plant-doctor` edge function dispatches multiple actions: `identify_vision` (cheapest, single plant ID), `identify_scene` (multi-plant), `diagnose` (pest/disease), `identify_pest`. We free `identify_vision` only.
- `ai_usage_log` already records every AI call with `user_id`, `function_name`, `action`, `created_at`. **No new table needed** — a rolling 7-day count query is enough.
- `guardAiByHome` returns 403 when `user_profiles.ai_enabled = false`. We need to bypass that for `identify_vision`.

**Touched files:**

| Layer | File | Change |
|---|---|---|
| Server | `supabase/functions/_shared/identifyQuota.ts` *(new)* | Helper: `getIdentifyQuota(db, userId) -> { used, limit, remaining, resetsAt }` |
| Server | `supabase/functions/plant-doctor/index.ts` | For `identify_vision`: skip `guardAiByHome`, call `getIdentifyQuota` first, return 429 with `{ error: "quota_exhausted", quota: {...} }` when used >= 5 |
| Server | `supabase/functions/plant-doctor/index.ts` | After successful identify_vision, include `quota` in the response so the client can update the badge without a second round-trip |
| Client | `src/components/PlantDoctor.tsx` | Add quota badge to identify CTA when `!aiEnabled`. Add quota-exhausted modal with upgrade CTA |
| Client | `src/events/registry.ts` | New `EVENT.AI_QUOTA_EXCEEDED` |
| Docs | `docs/app-reference/99-cross-cutting/17-tier-gating.md` | Document the identify-only carve-out |
| Docs | `docs/app-reference/05-tools/<plant-doctor>.md` | Document the free badge + paywall flow |
| Tests | `supabase/tests/identifyQuota.test.ts` *(new)* | Deno tests for the quota helper (used count, sliding window, edge cases) |
| Tests | `tests/unit/components/PlantDoctorQuotaBadge.test.tsx` *(new)* | Component test for the quota badge |

**Quota algorithm:**

```ts
// supabase/functions/_shared/identifyQuota.ts
export const IDENTIFY_FREE_LIMIT = 5;
export const IDENTIFY_WINDOW_DAYS = 7;

export async function getIdentifyQuota(
  db: SupabaseClient,
  userId: string,
): Promise<{ used: number; limit: number; remaining: number; resetsAt: string | null }> {
  const since = new Date(Date.now() - IDENTIFY_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { count } = await db
    .from("ai_usage_log")
    .select("created_at", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("function_name", "plant-doctor")
    .eq("action", "identify_vision")
    .gte("created_at", since);

  const used = count ?? 0;
  const remaining = Math.max(0, IDENTIFY_FREE_LIMIT - used);

  // resetsAt = the moment the oldest in-window call drops off, when remaining = 0
  let resetsAt: string | null = null;
  if (remaining === 0) {
    const { data } = await db
      .from("ai_usage_log")
      .select("created_at")
      .eq("user_id", userId)
      .eq("function_name", "plant-doctor")
      .eq("action", "identify_vision")
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (data?.created_at) {
      const oldest = new Date(data.created_at).getTime();
      resetsAt = new Date(oldest + IDENTIFY_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
    }
  }

  return { used, limit: IDENTIFY_FREE_LIMIT, remaining, resetsAt };
}
```

**Server flow inside plant-doctor:**

```ts
if (action === "identify_vision") {
  if (homeId) {
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("ai_enabled")
      .eq("uid", callerUserId)
      .single();
    if (!profile?.ai_enabled) {
      const quota = await getIdentifyQuota(supabase, callerUserId);
      if (quota.remaining === 0) {
        return new Response(
          JSON.stringify({ error: "quota_exhausted", quota }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      // Stash quota so we can return it in the success payload
      var freeQuotaBefore = quota;
    }
  }
  // ... existing identify_vision flow ...
  const responsePayload = { ...existingShape, quota: freeQuotaBefore ? { ...freeQuotaBefore, remaining: freeQuotaBefore.remaining - 1 } : undefined };
}
```

**Client flow inside PlantDoctor.tsx:**
- Add a small `<QuotaBadge used={x} limit={5} resetsAt={iso} />` rendered above / next to the Identify CTA when `!aiEnabled`.
- On 429 response, open an upgrade modal: "You've used your 5 free IDs this week — upgrade to Sage for unlimited identifications + AI diagnosis." Modal links to `/gardener?tab=subscription`.
- On successful response with `quota` in body, update the badge optimistically.

**Cost estimate:** Gemini 2.5 Flash identify call ≈ 1500 in + 200 out tokens ≈ £0.0008 per call. Heavy free user (5/wk × 4 = 20/mo) ≈ £0.016/user/mo. Conversion lift dominates the unit economics.

---

## Item 1.1 — implementation sketch

**Touched files:**

| Layer | File | Change |
|---|---|---|
| Client | `src/App.tsx` | After Auth + HomeSetup, if `subscription_tier IS NULL` → write `'sprout'` + skip TierSelection. Skip-render of `<TierSelection>` when `dashboardLoaded` and no tier set |
| Client | `src/App.tsx` | New permanent "Upgrade Rhozly" entry in the user dropdown (link to `/gardener?tab=subscription`) — actually already exists via TierSelection screen, just need to make sure it's reachable post-signup |
| Client | `src/components/GardenerProfile.tsx` | Make sure the subscription tab can show the upgrade picker (probably already does — verify) |
| Client | `src/components/TierUpgradePrompt.tsx` *(new — optional)* | Shared "Upgrade for this feature" component used by every AI-gated surface. Saves duplicating the same prompt across 5 places |
| Audit | Across PlantDoctor / OptimiseTab / YieldPredictor / CompanionPlantsTab / GardenLayoutEditor Microclimate Report | Make sure each gated surface uses the new shared upsell prompt (or has an OK existing one) |
| Docs | `docs/app-reference/01-onboarding/04-tier-selection.md` | Note that the screen is no longer shown automatically — only reachable via dropdown / upsell |
| Docs | `docs/app-reference/99-cross-cutting/17-tier-gating.md` | Document the "default to sprout, upsell on intent" model |

**Migration concern:** existing users already have a `subscription_tier` set. This change only affects new signups + users with `subscription_tier IS NULL`.

---

## Suggested shape

Two natural shapes:

**Option A — single PR (Sprint 3, recommended):**
- 3.1 + 1.1 land together.
- Pros: the value proposition for the deferred tier selection is the free quota; shipping them together makes the "why are we deferring this?" obvious in the release notes.
- Cons: bigger blast radius — if either breaks, both have to be rolled back.

**Option B — split into 3a then 3b:**
- 3a: ship 3.1 alone. Free quota goes live, existing tier selection flow unchanged.
- 3b: ship 1.1 a few days later, once 3a is stable in production.
- Pros: lower per-PR risk, faster feedback on the quota infra in isolation.
- Cons: in-between state where new users still hit Tier Selection but Plant Doctor is partially free — slightly confusing release notes.

## Risks

- **3.1 quota query performance.** `ai_usage_log` has high write volume. Need an index on `(user_id, function_name, action, created_at)` if one doesn't already exist. Check before shipping.
- **3.1 abuse vector.** A new signup can chain 5 free IDs → make a second account → 5 more. Mitigation: existing per-user rate limit already covers the worst burst case; email verification gate can be added later if abuse becomes real.
- **1.1 silent tier downgrade.** Default-to-sprout on signup is fine for net-new users, but if any existing flow assumed `subscription_tier IS NULL` meant "still onboarding", that breaks. Need to audit `IS NULL` checks across the codebase before flipping the default.
- **1.1 ai_enabled coupling.** The free identify carve-out depends on `ai_enabled = false` being the meaningful gate. After 1.1, every fresh Sprout user has `ai_enabled = false` by default — that matches today's behaviour, so no extra change needed.

## Tests

- 3.1 — Deno unit tests for `getIdentifyQuota` (sliding window, edge of 7-day cutoff, count = 0, count = limit, count > limit).
- 3.1 — Component test for the quota badge rendering states (full, low, exhausted).
- 3.1 — E2E test (Playwright) — happy path: free user identifies a plant, badge decrements from 5 → 4.
- 1.1 — E2E test that a new user lands on the dashboard without hitting Tier Selection.
- 1.1 — E2E test that the upgrade prompt links to the tier picker.
