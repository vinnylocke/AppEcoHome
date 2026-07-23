# Seasonal picks — fix cron tier resolution + fallback method names

Discovered while verifying the 41.0063 regen. The user is **Evergreen** but has
been served the **deterministic fallback** every week — never the AI picks their
tier entitles them to.

## Root cause

`generateSeasonalPicksForHome` (`_shared/seasonalPicksHandler.ts`) decides AI vs
fallback. AI picks are **Evergreen-only** (`aiTier`). On the **cron** path
(`callerUserId === null`, used by `refresh-seasonal-picks` weekly pre-warm AND the
one-off regen), it resolves the tier with a PostgREST nested embed:

```ts
supabase.from("home_members").select("user_profiles(subscription_tier)")...
```

That query **fails**: `PGRST200 — Could not find a relationship between
'home_members' and 'user_profiles'` (no FK the schema cache can traverse). The code
**swallows the error** (`(members ?? [])`), yields an empty tier list, so
`aiTier = false` → **fallback for every home, every week**.

Evidence: every one of the user's stored picks matches the fallback table verbatim
("Lettuce 'Lollo Rossa'", "Radish 'French Breakfast'", "Carrot 'Autumn King'",
"Beetroot 'Boltardy'", "Geranium softwood cuttings", …). The on-demand path
(`callerUserId` set → `user_profiles` looked up by `uid` directly) works, which is
why tapping Refresh *does* produce AI picks — masking the cron bug.

### Secondary bug — fallback bakes the method into the name
`seasonalPicksFallback.ts` has two entries whose `common_name` includes the
propagation method: `"Geranium softwood cuttings"`, `"Lavender 'Hidcote' cuttings"`.
The fallback path never runs `stripPropagationMethod` (only the AI path does via
`normaliseSeasonalPicks`), so those methods reach the card. This is the "geranium
softwood cuttings" the user originally reported.

## App-reference consulted
- `docs/app-reference/02-dashboard/14-seasonal-picks.md` — pipeline + tier gating.
- `docs/app-reference/99-cross-cutting/17-tier-gating.md` — Evergreen = AI insights.
- `_shared/aiGuard.ts` — the established owner-based tier lookup idiom.

## Fix

### G1 — Correct the cron tier resolution (`seasonalPicksHandler.ts`)
Replace the broken nested embed with the **owner-based two-step** lookup already
used by `guardAiByHome` (consistent, and it's the owner whose subscription pays):

```ts
if (!opts.callerUserId) {
  const { data: owner } = await supabase
    .from("home_members")
    .select("user_id")
    .eq("home_id", opts.homeId)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();
  if (owner?.user_id) {
    const { data: ownerProfile } = await supabase
      .from("user_profiles")
      .select("subscription_tier")
      .eq("uid", owner.user_id)
      .maybeSingle();
    aiTier = (ownerProfile?.subscription_tier ?? "").toLowerCase() === "evergreen";
  }
}
```

The subsequent `guardAiByHome` call (owner `ai_enabled`) still fails-closed on top,
so a mis-resolved tier can never grant AI. Restores AI picks for Evergreen homes on
the weekly cron and the one-off regen.

### G2 — Method-free fallback names (belt + braces)
1. `seasonalPicksFallback.ts`: rename the two entries →
   `"Geranium"` and `"Lavender 'Hidcote'"` (the method already lives in
   `sow_method: "cutting"`).
2. `seasonalPicksHandler.ts`: run `stripPropagationMethod` over **every** pick's
   `common_name` right after generation (both AI and fallback), so no future
   method-laden name from either path can leak. Import from `plantNameMatch.ts`.

## Files
| File | Change |
|---|---|
| `supabase/functions/_shared/seasonalPicksHandler.ts` | G1 owner-based tier lookup; G2 central `stripPropagationMethod` over all picks. |
| `supabase/functions/_shared/seasonalPicksFallback.ts` | G2 rename the 2 method-laden entries to clean names. |
| `supabase/tests/seasonalPicks.test.ts` | Assert `fallbackSeasonalPicks` returns no method-in-name (no "cuttings"), and cultivars are retained. |
| `docs/app-reference/02-dashboard/14-seasonal-picks.md` | Document: AI picks are Evergreen-only; cron resolves the owner's tier (owner-based, two-step); fallback names are method-free. |

## Testing
- Deno: `fallbackSeasonalPicks` name-cleanliness + cultivar-retention (pure, cheap).
- The tier-resolution fix is a query-shape correction with no existing handler-test
  / Gemini-mock harness (building one is out of proportion). Verified **live**: after
  deploy, re-run the regen and confirm `source: "ai"` with grounded (non-templated)
  reasoning. A fresh `code-reviewer` pass on the handler diff covers the logic.

## After deploy — regen (again, correctly)
Delete the current-week row + invoke `refresh-seasonal-picks`; it now resolves
Evergreen → **AI** → varietal, method-free, grounded picks. Verify `source: "ai"`.
The user reloads + taps Refresh to bust their local cache.

## Risk
- Cost: Evergreen homes now get a real Gemini call on the weekly cron (intended for
  the tier; cron already sleeps 750 ms between homes). Sage/Botanist/Sprout unchanged
  (still fallback — picks are Evergreen-only by design).
- Owner-based (vs any-member) matches how AI access is gated everywhere else.
- Bump: `--bump 1` (one user-facing change: "your weekly suggestions are personalised again").
