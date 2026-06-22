# Tier Gating — Sprout / Botanist / Sage / Evergreen

> Four subscription tiers gate features. Two flags on `user_profiles` drive gating: `ai_enabled` (Sage / Evergreen) and `enable_perenual` (Botanist+). The tier itself is stored in `subscription_tier`.

---

## Quick Summary

| Tier | `ai_enabled` | `enable_perenual` | Highlights |
|------|-------------|--------------------|------------|
| Sprout (free) | false | false | Manual everything + **5 free Plant Doctor identifications per rolling 7-day window** (Sprint 3, 2026-06-15). No diagnosis. No Perenual. |
| Botanist | false | true | + Perenual plant database. Same free identify quota as Sprout. |
| Sage | true | false | + AI Plant Doctor (identify + diagnose + pest + Multi-ID, all unlimited) + Chat + photo-to-task + AI optimise. **No Perenual** — the species DB is a Botanist / Evergreen perk (tiers are a lattice, not a ladder). |
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
  { id: "sage",      name: "Sage",      ai_enabled: true,  enable_perenual: true,  ... },
  { id: "evergreen", name: "Evergreen", ai_enabled: true,  enable_perenual: true,  ... },
]
```

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
| Plant Doctor Chat | `ai_enabled` |
| AI Assistant Card | `ai_enabled` |
| New Plan Form (AI blueprint) | `ai_enabled` |
| Garden Overhaul (photo redesign) | `ai_enabled` (Sage+) |
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
(`src/components/shared/`). **Wired (all open):** `light_sensor` (LightSensor), `garden_layout`
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
- Edge functions re-verify (`if (!profile.ai_enabled) return 403`).

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
