# Tier-Gating the Non-AI Features — Work Analysis

**Status:** Analysis / planning. No code yet — this maps the work and surfaces the decisions
needed before implementation.

**App-reference files consulted:** [`17-tier-gating.md`](../app-reference/99-cross-cutting/17-tier-gating.md),
[`00-INDEX.md`](../app-reference/00-INDEX.md), `03-garden-hub/05-garden-layout-list.md` +
`06-garden-layout-editor.md` + `07-microclimate-report.md` + `08-sun-tracker-ar.md` +
`09-light-sensor.md` + `10-nursery.md`, `05-tools/05-plant-visualiser.md`, `07-management/*`.
Codebase survey: `src/App.tsx`, `src/constants/tiers.ts`, `supabase/functions/_shared/aiGuard.ts`,
`_shared/rateLimit.ts`.

---

## 1. Goal

Today almost everything that isn't an AI call or a Perenual lookup is **free for every tier** —
Light Sensor, Garden Layout, Sun Tracker AR, Microclimate, Plant Visualiser, Nursery, Garden Walk,
Multiple Homes, ICS export, Community Guides, Shopping. We want the ability to put any of these
behind a tier (e.g. "Light Sensor is Botanist+", "Multiple Homes is Evergreen").

The headline finding: **we cannot do this cleanly today because there is no general tier-gate
mechanism.** Three structural gaps have to be closed first; after that each feature is a one-liner.

---

## 2. How gating works today (and why it doesn't extend)

Gating is driven by **two booleans** on `user_profiles`, threaded out of `App.tsx` as props:

| Flag | Prop names in components | Meaning |
|------|--------------------------|---------|
| `ai_enabled` | `aiEnabled`, `isAiEnabled` | Sage / Evergreen — any Gemini call |
| `enable_perenual` | `isPremium`, `perenualEnabled` | Botanist / Evergreen — Perenual species DB |

The tier string is **derived** from those two flags (`tierIdFromFlags` in `src/constants/tiers.ts`),
not the other way around. Server-side, AI/Perenual functions re-verify the flags via
`guardAiByHome` / `guardPerenualByUser` (`_shared/aiGuard.ts`) plus per-tier rate limits keyed on
`subscription_tier` (`_shared/rateLimit.ts`).

### Gap A — there is no third axis

The only gating signals are "can use AI" and "can use Perenual". A feature like the Light Sensor is
**neither**. There is no flag, capability, or helper that means "this tier includes the Light Sensor".
Gating it today would mean abusing `enable_perenual` (semantically wrong, and it would wrongly
exclude Sage — see Gap B) or hard-coding `subscription_tier === 'x'` checks ad hoc in every component.

### Gap B — the tiers are a lattice, not a ladder

From `tiers.ts`, the four tiers are **not** a straight line:

```
              Evergreen  (ai + perenual)
               /      \
   Sage (ai)            Botanist (perenual)
               \      /
              Sprout  (neither)
```

Sage's feature list is literally *"Everything in Sprout"* + AI — **not** "everything in Botanist".
So `enable_perenual` is **false for Sage**. Consequences:

- A simple numeric "minimum tier ≥ Botanist" comparison is meaningless — Sage isn't "above" Botanist.
- "Gate this to paid users" and "gate this to Botanist specifically" are different questions and need
  different answers per feature.
- ⚠️ **Doc drift found:** `17-tier-gating.md` claims Sage has `enable_perenual = true`. The code
  (`tiers.ts`) says **false**. The code is authoritative. This also means our just-shipped
  search-source preference correctly offers a Sage user only *library + AI* sources (no
  Perenual/Verdantly) — which is consistent with the lattice, but the doc needs fixing.

### Gap C — no reusable paywall UI, and client-only features have no server gate

- **No shared upgrade component.** Every gated feature today rolls its own toast / inline banner /
  locked card ("Upgrade in Account Settings →"). There is no `<UpgradeGate>` / `<UpgradeNudge>`.
- **Client-only features have zero server enforcement.** Light Sensor, Garden Layout, Microclimate,
  ICS export, Shopping, Community Guides, Multiple Homes all write straight to tables via RLS with no
  edge function in the path. A client-only gate hides the UI but is bypassable. (Unlike AI, these
  cost us nothing per use, so client-only gating may be acceptable — a decision below.)

---

## 3. The enabling work (foundation) — required before any feature gate

### 3.1 A capability map keyed on tier (`src/constants/tiers.ts`)

Add an explicit per-tier feature set — explicit (not rank-based) so it respects the lattice:

```ts
export type Feature =
  | "light_sensor" | "sun_tracker" | "microclimate" | "garden_layout"
  | "garden_layout_3d" | "visualiser" | "nursery" | "garden_walk"
  | "multiple_homes" | "ics_export" | "guide_authoring" | "integrations";

// Explicit sets — a feature can live in any combination of tiers, so "all paid"
// and "Botanist-only" and "Evergreen-only" are all expressible.
export const TIER_FEATURES: Record<TierId, Feature[]> = {
  sprout:    [...FREE_FEATURES],
  botanist:  [...FREE_FEATURES, /* proposed: light_sensor, sun_tracker, ... */],
  sage:      [...FREE_FEATURES, /* proposed: same paid set as botanist + ... */],
  evergreen: [/* everything */],
};

export function hasFeature(tier: TierId | null | undefined, f: Feature): boolean {
  return TIER_FEATURES[tier ?? "sprout"]?.includes(f) ?? false;
}
```

Gate on `subscription_tier` (already loaded in `App.tsx:902`), **not** on the two flags — that keeps
the flags purely for AI/Perenual server gating and avoids breaking `tierIdFromFlags`. **S effort.**

### 3.2 Thread the tier + expose a hook

`App.tsx` already selects `subscription_tier`. Today it's passed to a handful of surfaces
(`GardenerProfile`, `HomeManagement`). We need it available wherever a gate lands. Two options:
- (a) Add a lightweight `EntitlementsContext` / `useEntitlements()` returning
  `{ tier, hasFeature }` (cleanest, avoids prop-drilling). **M effort.**
- (b) Keep prop-threading `subscriptionTier` into each gated surface. **S per surface but repetitive.**

Recommendation: **(a) a context** — it's the thing that makes every subsequent gate a one-liner.

### 3.3 Reusable gate UI (`src/components/shared/`)

- `<UpgradeNudge feature requiredTiers compact? />` — the standard locked-state card / inline banner
  with a CTA to `/gardener` (account tab). Replaces the scattered bespoke messaging.
- `<FeatureGate feature fallback={<UpgradeNudge .../>}>{children}</FeatureGate>` — wraps a feature's
  entry point; renders children if `hasFeature`, else the nudge. **M effort** (one-time build).

### 3.4 (Decision) server enforcement strategy — see §5

---

## 4. Per-feature work table

Effort is **on top of** the §3 foundation (which is the bulk of the work). Once the foundation exists
each row is mostly "wrap the entry point + pick a tier".

| Feature | Entry point | Today | Proposed gate* | Client work | Server work | Effort |
|---------|-------------|-------|----------------|-------------|-------------|--------|
| Light Sensor | `LightSensor.tsx` `/lightsensor` | open | Botanist+ | wrap route in `<FeatureGate>` | none (client-only OK) | S |
| Sun Tracker AR | `SunTrajectoryAR` (modal) | open | Botanist+ | gate launch button | none | S |
| Microclimate Report | `MicroclimateReportModal` | open | Botanist+ | gate launch button | none | S |
| Garden Layout (2D editor) | `GardenLayoutList/Editor` | open | Botanist+ | wrap route | RLS option (§5) | S–M |
| Garden Layout 3D view | layout viewer | open (doc says "soft Sage") | Sage/Evergreen | gate the 3D toggle | none | S |
| Plant Visualiser | `PlantVisualiser` `/visualiser` | open (AI sprite already gated) | Botanist+ | wrap route | none | S |
| The Nursery | `NurseryTab` `/shed?tab=nursery` | open | TBD (free? Botanist+?) | gate the toggle | RLS option | S–M |
| Garden Walk | `GardenWalk` `/walk` | open | TBD (free recommended) | wrap route | none | S |
| Multiple Homes | `HomeManagement` homes tab | open | Evergreen (classic upsell) | gate "add home" + cap count | **needs server cap** (§5) | M |
| Calendar ICS export | `handleExportIcs` (App.tsx:482) | open | Botanist+ | gate the button | none | S |
| Community Guide authoring | `CommunityGuideEditor` | open (reading free) | Botanist+ | gate "write a guide" | RLS on `guides` insert | S–M |
| Shopping Lists | `ShoppingLists` `/shopping` | open | TBD (free? Botanist+?) | wrap route | RLS option | S–M |
| Integrations (Devices/Automations) | `IntegrationsPage` | open (permission-gated) | Evergreen | gate the tab | RLS / edge | M |
| Weekly Overview / Seasonal Picks | pages/cards | base open, AI part gated | leave as-is | — | — | — |

\* **Proposed tiers are placeholders for discussion** — the actual mapping is a pricing/product call
(§6, Q1). "Botanist+" here is shorthand for "all paid tiers" and depends on the lattice answer (Q2).

---

## 5. Server enforcement — three options per feature

For AI/Perenual the server already enforces (edge-fn guards). The newly-gated client-only features
need a decision:

1. **Client-only gate (hide UI).** Cheapest; bypassable by a determined user editing client state.
   Acceptable for features that cost us nothing per use and aren't a hard contractual boundary
   (Light Sensor, Sun Tracker, Microclimate, ICS, Visualiser, Garden Walk).
2. **RLS tier check.** Add `subscription_tier`-aware policies on the underlying tables
   (`garden_layouts`, `shopping_lists`, `guides`, `homes`/`home_members`). True enforcement, but
   heavier and must be written carefully (RLS is unforgiving; see `19-rls-patterns.md`).
   Right for genuine limits like **Multiple Homes** (a home cap) and possibly guide authoring.
3. **Edge-function wrapper.** Overkill for pure CRUD; only worth it if we're already routing through a
   function.

Recommendation: **client-only for the cheap visual tools; RLS for Multiple Homes** (where the gate is a
real resource cap) **and guide authoring**. Decide per-feature in Q3.

---

## 6. Decisions (confirmed 2026-06-20)

- **Q1/Q2 — Mapping & philosophy → _ship it open, make it modular._** For now **every** candidate
  feature is gated to **all tiers (including Sprout/free)** so nothing changes for users. The value of
  this work is the *mechanism*: a single per-feature config (`FEATURE_GATES`) where flipping one
  feature from `ALL` to `PAID` / `["evergreen"]` / any tier list gates it instantly. No per-feature
  pricing decision needed yet — the config makes each one a one-line change later.
- **Q3 — Enforcement → client gate + RLS for caps.** Cheap visual tools get a client-side
  `<FeatureGate>` (hide UI). Real resource caps (Multiple Homes, guide authoring) get RLS when/if they
  are actually gated. Since everything ships open, no RLS work is needed in the first increment.
- **Q4 — Existing users → cut off immediately.** When a gate is eventually flipped, it applies to all
  non-entitled users at once (no grandfathering). Nothing to build now — it's the natural behaviour of
  the `FEATURE_GATES` config.

### Approved build approach (increment 1)

1. **`src/constants/tierFeatures.ts`** — `Feature` union, `FEATURE_GATES: Record<Feature, TierId[]>`
   (all default to `ALL` = open), `ALL`/`PAID` helpers, `FEATURE_LABELS`, `tierAllowsFeature(tier, f)`,
   `tiersWithFeature(f)`. **This file is the single knob for all future gating.**
2. **`src/hooks/useEntitlements.ts`** — returns `{ tier, loading, hasFeature(f) }`; reads
   `user_profiles.subscription_tier` (module-cached so it fetches once per session; accepts an optional
   `tierProp` override for surfaces that already hold the live tier, mirroring the AIUsagePanel fix).
3. **`src/components/shared/UpgradeNudge.tsx`** + **`FeatureGate.tsx`** — the reusable locked-state
   card + the wrapper (`allowed ? children : nudge`). While `loading`, render children (everything is
   open, so no flash today).
4. **Wire the two named examples** — Light Sensor + Garden Layout — through `<FeatureGate>` (open), as
   working proof. Remaining surfaces wired in a follow-up once the mechanism is reviewed.
5. Fix the `17-tier-gating.md` Sage `enable_perenual` drift; document the new mechanism.
6. Unit tests for `tierAllowsFeature` / `tiersWithFeature`.

---

## 7. Suggested phasing

1. **Phase 0 — Foundation (§3):** `TIER_FEATURES` + `hasFeature`, `useEntitlements()` context,
   `<FeatureGate>` + `<UpgradeNudge>`. Plus fix the `17-tier-gating.md` Sage drift. *This is ~70% of
   the total effort and unblocks everything.*
2. **Phase 1 — Cheap client-only gates:** Light Sensor, Sun Tracker, Microclimate, Visualiser, ICS,
   3D layout view, Garden Walk. Each is a `<FeatureGate>` wrap once Phase 0 lands.
3. **Phase 2 — Resource caps (RLS):** Multiple Homes (home cap), Garden Layout, guide authoring.
4. **Phase 3 — Integrations** (Evergreen), if desired.

---

## 8. App-reference files to update when implemented

- `99-cross-cutting/17-tier-gating.md` — fix Sage drift now; add the `TIER_FEATURES` mechanism +
  every newly-gated surface to the gated-surfaces table.
- Each gated surface's own file — Role 1 "Tier gating" + Role 2 "Tier-by-tier experience" sections:
  `09-light-sensor.md`, `08-sun-tracker-ar.md`, `07-microclimate-report.md`,
  `05-garden-layout-list.md` + `06-garden-layout-editor.md`, `05-tools/05-plant-visualiser.md`,
  `10-nursery.md`, `13-garden-walk.md`, `07-management/03-multiple-homes.md`, calendar tab, guides.
- New shared components → a new `08-modals-and-overlays/` or `09-persistent-ui/` reference for
  `<UpgradeNudge>` / `<FeatureGate>`.

---

## 9. Bottom line

The per-feature gating is trivial; the real work is **building the missing tier-gate layer once**
(capability map + entitlements context + reusable upgrade UI), plus deciding the product questions in
§6. Estimated foundation: **~1–1.5 days**. Each cheap feature gate after that: **~30–60 min**.
RLS-enforced caps (Multiple Homes etc.): **~half a day each** for careful policy work + tests.
