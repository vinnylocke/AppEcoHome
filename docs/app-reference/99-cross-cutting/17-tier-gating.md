# Tier Gating — Sprout / Botanist / Sage / Evergreen

> Four subscription tiers gate features. Two flags on `user_profiles` drive gating: `ai_enabled` (Sage / Evergreen) and `enable_perenual` (Botanist+). The tier itself is stored in `subscription_tier`.

---

## Quick Summary

| Tier | `ai_enabled` | `enable_perenual` | Highlights |
|------|-------------|--------------------|------------|
| Sprout (free) | false | false | Manual everything + **5 free Plant Doctor identifications per rolling 7-day window** (Sprint 3, 2026-06-15). No diagnosis. No Perenual. |
| Botanist | false | true | + Perenual plant database. Same free identify quota as Sprout. |
| Sage | true | false | + AI Plant Doctor (identify + diagnose + pest + Multi-ID, all unlimited) + Chat + photo-to-task + AI optimise + **Add-Area wizard setup review** (2026-07-18 — client-gated on `aiEnabled`, server `guardAiByHome`). **No Perenual** — the species DB is a Botanist / Evergreen perk (tiers are a lattice, not a ladder). |
| Evergreen | true | true | Same flags as Sage; reserved for future exclusives (Visualiser AI, advanced AI) |

**Free Plant Doctor identify carve-out (Sprint 3, 2026-06-15):** `identify_vision` is the only AI action a Sprout / Botanist user can call. It runs against a sliding-window quota (5 per 7 days, no calendar reset — every call's 7-day-old slot drops off as new ones land). Helper: [`supabase/functions/_shared/identifyQuota.ts`](../../../supabase/functions/_shared/identifyQuota.ts). Recorded via the existing `ai_usage_log` table — no new schema. Quota state is returned on every successful identify response so the client can update its badge without a second round-trip.

**Tier defaulting (Sprint 3, 2026-06-15):** New users no longer hit a Tier Selection screen on signup. The App.tsx onboarding flow now auto-assigns `'sprout'` + `ai_enabled = false` + `enable_perenual = false` when a profile lands with `subscription_tier IS NULL`. Upgrade is reachable via the `Upgrade Rhozly` entry in the user dropdown → `/gardener` (Account tab houses the picker).

---

## Role 1 — Technical Reference

### `TIERS` constant

Lives in `src/constants/tiers.ts`:

```ts
[
  { id: "sprout",    name: "Sprout",    ai_enabled: false, enable_perenual: false, ... },
  { id: "botanist",  name: "Botanist",  ai_enabled: false, enable_perenual: true,  ... },
  { id: "sage",      name: "Sage",      ai_enabled: true,  enable_perenual: false, ... },
  { id: "evergreen", name: "Evergreen", ai_enabled: true,  enable_perenual: true,  ... },
]
```

> **Drift fixed 2026-07-03:** this block previously showed Sage as `enable_perenual: true`, contradicting the header table above (correct: Sage has AI, *not* the species database) and the enforced lattice in `src/constants/tiers.ts` + migration `20260514000001`. The lattice is `sprout(–,–) · botanist(–,perenual) · sage(ai,–) · evergreen(ai,perenual)` — tiers are a **lattice, not a ladder**. `scripts/seed-test-account.mjs`'s `TIER_FLAGS` carried the same swap and was corrected in the same change.

### `user_profiles` columns

| Column | Type |
|--------|------|
| `subscription_tier` | text |
| `ai_enabled` | bool |
| `enable_perenual` | bool |

### Tier switch flow

In Account Tab → Switch Tier:

```ts
supabase.from("user_profiles").update({
  subscription_tier: tier.id,
  ai_enabled: tier.ai_enabled,
  enable_perenual: tier.enable_perenual,
}).eq("uid", userId);
```

Then `onTierChange()` lifts flags into App state so the rest of the app re-renders.

**Stripe billing (paid-tier writes — sandbox phase).** The direct write above is the honour-system path kept for non-admins. For **admins**, paid-tier changes go through Stripe-hosted Checkout (`stripe-create-checkout`) + the Billing Portal (`stripe-portal`), and the **`stripe-webhook`** function is the authoritative writer of `subscription_tier` + the two flags (mapping Stripe price → tier via `supabase/functions/_shared/stripeTiers.ts`). The Stripe UI is gated to `isAdmin` while we test against the Stripe **sandbox**; going live = swap the `STRIPE_SECRET_KEY` secret to a live restricted key + live price ids and drop the `isAdmin` gate. Migration `20260811000000_stripe_subscriptions.sql` adds `stripe_customer_id` / `stripe_subscription_id` / `subscription_status` / `subscription_period_end` to `user_profiles`. See [Edge Functions Catalogue](./10-edge-functions-catalogue.md).

### Gated surfaces (non-exhaustive)

| Feature | Gate |
|---------|------|
| Plant Doctor Identify / Diagnose / Pest / Multi-ID | `ai_enabled` |
| Plant Doctor Chat | `ai_enabled` — **all** entry points gated together: the global chat FAB (`<PlantDoctorChat>` mount in `src/App.tsx`, RHO-10) and the dashboard hero's "Ask AI" chip (`HomeStatusStrip` `aiEnabled` prop, RHO-11 — migrated from the deleted `DailyBriefCard` in home redesign Stage 2, same testid `daily-brief-ask-ai`). A non-AI (Sprout) user has no chat entry point at all. Server-side, `agent-chat` re-verifies via `guardAiByUser` on **every** action (including tool confirm/cancel/undo) — the client mount gate is no longer the only enforcement. |
| AI Assistant Card | `ai_enabled` |
| New Plan Form (AI blueprint) | `ai_enabled` |
| Garden Overhaul (photo redesign) | `ai_enabled` (Sage+) |
| Sketch to Layout (drawing → 2D layout) | `ai_enabled` (Sage+) — server: `requireHomeMembership` + `guardAiByHome` + explicit Sage+ + rate limit on `sketch-to-layout` |
| Plant-First Planner ("plan around my plants") | `ai_enabled` (Sage+) — client gate + server `guardAiByUser` + rate limit on `generate-plant-first-plan` |
| Regenerate plan | `ai_enabled` |
| Photo-to-task in AddTaskModal | `ai_enabled` |
| Optimise tab AI proposals | `ai_enabled` |
| AI Area Coach tab (Area Metrics modal) | `ai_enabled` |
| Plant Visualiser AI sprite gen | `ai_enabled` |
| Plant Camera AI analysis | `ai_enabled` |
| Area Scan Modal | `ai_enabled` |
| Microclimate Report AI summary (planned) | `ai_enabled` |
| Perenual tab in BulkSearch | `enable_perenual` |
| Perenual care details fetch | `enable_perenual` |
| Garden Layout 3D view | (Sage/Evergreen — soft gate) |

### Source × tier action matrix — Cross-Home Favourites

**Cross-Home Favourites Phase 1 (2026-07-03).** Acting on a plant (favouriting it, adding a favourite to a home, or copy-on-write editing it) is **strictly gated by the plant's `source` against the actor's entitlement flags** — a plant whose source exceeds your plan is **view-only**: you can *see* it (home-member RLS, not tier) but the ♡, "Add to this home", and "Save as my own copy" controls are disabled with an upsell.

| Plant `source` | Requires | Sprout | Botanist | Sage | Evergreen |
|---|---|---|---|---|---|
| `manual` | — (open) | ✅ | ✅ | ✅ | ✅ |
| `api` / `verdantly` | `enable_perenual` | 🔒 | ✅ | 🔒 | ✅ |
| `ai` (incl. library forks) | `ai_enabled` | 🔒 | 🔒 | ✅ | ✅ |

Because the lattice gives Botanist the species database and Sage the AI (not the other way round), Botanist can act on Perenual/Verdantly favourites but not AI ones, and Sage the inverse — exactly matching the flags.

**Enforcement is client + server:**
- **Client:** `isSourceLockedForTier(source, { aiEnabled, perenualEnabled })` in [`src/lib/favouriteIdentity.ts`](../../../src/lib/favouriteIdentity.ts) (unit-tested) drives the disabled controls + tooltip in `TheShed` / `FavouritePlantsGrid` / `PlantEditModal`.
- **Server:** a `BEFORE INSERT/UPDATE` trigger `enforce_favourite_plant_tier()` on `user_favourite_plants` (migration `20260831000000`) re-derives the source from the referenced `plants` row and raises `tier_locked_source` when the actor's flags don't allow it. Favourites inserts are plain PostgREST writes (no edge function on this path), so the trigger — not `aiGuard` — is the server enforcement point. It exempts service-role/direct-SQL so seeds can plant above-tier favourites for view-only UI coverage.

Favouriting/unfavouriting is otherwise **ungated by permission keys**, and add-to-home is allowed for any home member regardless of `shed.add` (personal + member writes). See [The Shed § cross-home favourites](../03-garden-hub/01-the-shed.md#cross-home-favourites-phase-1--plants) and [Data Model — Plants § user_favourite_plants](./03-data-model-plants.md#cross-home-favourites--user_favourite_plants).

**Cross-Home Favourites Phase 2 (2026-07-03 — Watchlist ailments).** The same strict gate applies to favouriting an ailment and adding a favourite ailment to a home. Ailments use their own source vocabulary — `perenual` where plants say `api`/`verdantly`, plus a first-class `library` source that is **open to every tier** (the seeded ailment library is the free default search source). There is **no** copy-on-write path for ailments (no fork).

| Ailment `source` | Requires | Sprout | Botanist | Sage | Evergreen |
|---|---|---|---|---|---|
| `manual` / `library` | — (open) | ✅ | ✅ | ✅ | ✅ |
| `perenual` | `enable_perenual` | 🔒 | ✅ | 🔒 | ✅ |
| `ai` | `ai_enabled` | 🔒 | 🔒 | ✅ | ✅ |

- **Client:** `isAilmentSourceLockedForTier(source, { aiEnabled, perenualEnabled })` in [`src/lib/favouriteIdentity.ts`](../../../src/lib/favouriteIdentity.ts) (unit-tested) drives the disabled heart + "Add to this home" + tooltip in `AilmentWatchlist` / `FavouriteAilmentsGrid`.
- **Server:** a `BEFORE INSERT/UPDATE OF source` trigger `enforce_favourite_ailment_tier()` on `user_favourite_ailments` (migration `20260901000000`) gates on the favourite's claimed `source` (the home `ailments` row has no library FK, so — unlike plants — it can't re-derive from the referenced row). Raises `tier_locked_source`; exempts service-role/direct-SQL.

See [Watchlist § cross-home favourites](../03-garden-hub/02-watchlist.md#cross-home-favourites-phase-2--ailments) and [Data Model — Ailments § user_favourite_ailments](./06-data-model-ailments.md#cross-home-favourite-ailments--user_favourite_ailments).

**Cross-Home Favourites Phase 3 (2026-07-03 — Nursery seed packets) — UNGATED.** Seed packets are the one favourites surface with **no source × tier gate at all**. `seed_packets` has **no `source` column** (packets are user-created — scanned or manually added), and favouriting / add-to-home make zero AI/API calls, so there is nothing to gate: every tier can heart a packet variety and add a favourite variety into any home they belong to. The favourite stores a variety reference, not AI/API-generated content. Consequently `user_favourite_seed_packets` (migration `20260902000000`) has **no `enforce_favourite_*_tier()` trigger** and there is no client `isSourceLockedForTier` call on any packet control. Add-to-home is open to any home member (personal + member writes, no permission key). See [The Nursery § cross-home favourites](../03-garden-hub/10-nursery.md), [Data Model — Nursery § user_favourite_seed_packets](./33-data-model-nursery.md), and `docs/plans/cross-home-favourites-phase-3-nursery.md`.

### Capability gating for non-AI / non-Perenual features (`FEATURE_GATES`)

The two flags above only express "can use AI" and "can use Perenual". Features that are neither
(Light Sensor, Garden Layout, Microclimate, Visualiser, ICS export, Multiple Homes, …) are gated by a
separate, **modular** capability config — `src/constants/tierFeatures.ts`:

```ts
export const FEATURE_GATES: Record<Feature, TierId[]> = {
  light_sensor: ALL,        // ALL = ["sprout","botanist","sage","evergreen"] → open to everyone
  multiple_homes: ALL,      // gate by editing one line, e.g. ["evergreen"] or PAID
  // …
};
tierAllowsFeature(tier, "light_sensor"); // list membership — lattice-safe
```

**Most features list `ALL`** — the mechanism is in place so any one
feature can be gated by changing its array (no numeric "minimum tier", because Sage ≠ Botanist+).
**Exceptions (gated):** `ai_insights` and `head_gardener` both list `EVERGREEN` (`["evergreen"]`). The
Head Gardener gate (`head_gardener` → `HeadGardenerPage` + the dashboard `HeadGardenerCard`) is mirrored
server-side by `tierAllowsInsights()` in `supabase/functions/_shared/insightTiers.ts`, which all three
Head Gardener edge functions (`synthesize-garden-brief`, `garden-manager-report`, `head-gardener-chat`)
re-check before doing any work.
Consumed by `useEntitlements(tierProp?)` (`src/hooks/useEntitlements.ts`, module-cached tier fetch) and
the reusable `<FeatureGate feature tier? fallback?>` + `<UpgradeNudge feature compact? />`
(`src/components/shared/`). **Loading behaviour:** while entitlements are still resolving, `FeatureGate`
renders children only for features open to sprout (i.e. open to every tier — no flash possible) and
renders **nothing** for gated features until the tier lands. Rendering children during load used to
mount Evergreen surfaces (Head Gardener, Week Ahead) for Sprout users on every cold start — a visible
flash plus their mount-effect fetches. Pass `tier` to skip the loading state entirely.
**Cache invalidation:** `invalidateEntitlements()` (`src/hooks/useEntitlements.ts`) resets the module
cache and re-resolves — called on tier change and sign-out so already-mounted gates pick up the new
tier without a full reload (mounted gates keep showing the last-known tier until the fresh one lands). **`UpgradeNudge` deep-links to the plan picker (RHO-12):** both its
compact button and its full-panel "See plans" CTA `navigate("/gardener?section=plans")`.
`GardenerProfile` reads `?section=plans`, forces the Account tab, scrolls the `#plan-section`
("Your Plan") card into view, then strips the param — mirroring the existing `?section=quick-launcher`
pattern. The effect depends on the section param value (not just mount) so it still fires when a nudge
is tapped while already on `/gardener`. **`FeatureGate` fallback semantics:** omit `fallback` → the full default
`UpgradeNudge` panel; `fallback={null}` → render **nothing**; `fallback={<UpgradeNudge … compact />}`
→ the slim one-line teaser. (Before RHO-2 a `??` bug made `fallback={null}` wrongly render the full
panel — fixed 2026-06-25 to `fallback !== undefined ? fallback : <UpgradeNudge/>`.) **Wired (all open):** `light_sensor` (LightSensor), `garden_layout`
(GardenLayoutList) + `garden_layout_3d` (GardenLayout3D), `sun_tracker` (SunTrajectoryAR),
`microclimate` (MicroclimateReportModal), `visualiser` (PlantVisualiser), `nursery` (NurseryTab),
`garden_walk` (GardenWalk), `shopping` (ShoppingLists), `guide_authoring` (CommunityGuideEditor),
`integrations` (IntegrationsPage), `multiple_homes` (HomeManagement "New Home" button, `fallback={null}`),
`ics_export` (TaskCalendar Export button, `fallback={null}`). Enforcement is **client-side** for cheap
visual tools; real resource caps (Multiple Homes, guide authoring) get RLS when actually gated. When a
gate is flipped it applies to all non-entitled users immediately (no grandfathering). Per-surface
reference files get their Role 1 "Tier gating" one-liner updated when a gate is actually flipped (the
wiring itself is a no-op while everything is open). See
[tier-gating-features-analysis.md](../../plans/tier-gating-features-analysis.md).

### Client + server enforcement

- Client gates the UI (hides / paywall messaging).
- Edge functions re-verify via the `_shared/aiGuard.ts` helpers (`guardAiByHome` / `guardAiByUser`) → 403 `"AI tier required"`.
- **Fail closed:** both aiGuard helpers now treat a *missing* profile row as not entitled (403). Previously `if (profile && !profile.ai_enabled)` silently granted access when the profile lookup returned nothing.
- **`plant-doctor` homeId fallback:** `homeId` is client-controlled and optional for the heavy vision actions (diagnose / identify_pest only need an image). When the request omits `homeId`, the function falls back to `guardAiByUser(callerUserId)` — omitting `homeId` no longer bypasses the tier gate.

### "Honour system" billing

Today, tier selection is self-service with no payment integration. Admin-managed in practice. Payment integration is a roadmap item.

---

## Role 2 — Expert Gardener's Guide

### Why tiers exist

To match the cost of running AI to the users who actually use it. AI calls cost real money; basic use cases don't need them.

### Implications

- Pick the right tier for your usage.
- Switch any time via Account Tab.
- Downgrading isn't destructive — your data persists; only feature access changes.

---

## Related reference files

- [Features & How to Get Them](../../feature-access-guide.md) — the full feature catalogue + access map
- [Tier Selection](../01-onboarding/04-tier-selection.md)
- [Account Tab](../06-account/01-account-tab.md)
- [AI — Gemini](./13-ai-gemini.md)

## Code references for ongoing maintenance

- `src/constants/tiers.ts`
- `src/App.tsx` — passes `aiEnabled` + `perenualEnabled` as props throughout
- Each edge function self-verifies via profile lookup
