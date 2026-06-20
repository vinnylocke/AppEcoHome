# AI Insights Overhaul — Plan

**Status:** Plan / awaiting approval. No code yet.

**App-reference consulted:** [`02-dashboard/06-assistant-card.md`](../app-reference/02-dashboard/06-assistant-card.md),
[`99-cross-cutting/26-pattern-engine.md`](../app-reference/99-cross-cutting/26-pattern-engine.md),
[`13-ai-gemini.md`](../app-reference/99-cross-cutting/13-ai-gemini.md),
[`17-tier-gating.md`](../app-reference/99-cross-cutting/17-tier-gating.md), plus a full code inventory
(see §2). New refs to read while building: `02-dashboard/14-seasonal-picks.md`,
`02-dashboard/15-weekly-overview.md`, `03-garden-hub/04-area-details.md`,
`04-planner/08-optimise-tab.md`, `21-routing.md`, `30-onboarding-state.md` (persona).

---

## 1. Goal (the five asks)

1. **Improve** every existing AI insight, especially for the two gardener **personas** (`new` / `experienced`).
2. **Fill gaps** — add insights to app areas that have none, persona-aware.
3. **Tier-gate** all AI insights to **Evergreen** for now, via the modular `FEATURE_GATES` knob (easily amendable).
4. **AI Insights page** — one place showing every insight, each linking to where it came from.
5. **AI summary at the top** of that page — a quick overview of everything.

---

## 2. Current AI-insight inventory (what exists)

| Surface | Stored in | Generator | Rendered by | Persona-aware? | Gated today |
|---------|-----------|-----------|-------------|:---:|---|
| Pattern insights | `user_insights` | `pattern-scan` + `pattern-evaluate` | `AssistantCard` | ❌ | by data-absence (Sage+); my new `soil_drydown_watering` is deterministic so can reach lower tiers |
| AI Area Coach | `area_ai_insights` | `area-sensor-analysis` | `AreaAiAnalysisPanel` | ✅ (only one) | `ai_enabled` |
| Automation tuning | `automation_suggestions` | `analyse-automations` | `AutomationSuggestions` | ❌ (AI prose Sage+) | open; AI prose Sage+ |
| Moisture behaviour | `soil_moisture_profiles` | `compute-soil-profiles` (det.) | `MoistureBehaviourCard` | ❌ | open (deterministic) |
| Seasonal picks | `home_seasonal_picks` | `refresh-seasonal-picks` | `SeasonalPicksCard` | ❌ | AI for Sage+, fallback else |
| Weekly overview tips | `weekly_overviews` | `generate-weekly-overviews` | `WeeklyOverviewPage` | ❌ | AI tips Sage+, det. else |
| Optimise proposals | (in-call, not stored) | `optimise-area-ai` | `OptimiseTab` | ❌ | `ai_enabled` |
| Garden overhaul | `plan_overhaul_*` | `generate-garden-overhaul` | overhaul UI | ❌ | `ai_enabled` |
| Daily brief | computed | — | `DailyBriefCard` | ❌ | open (not AI) |

**Key takeaways:** persona is wired but used in **exactly one** surface; insights live in **5+ tables** with
different shapes; only some carry a deep link; tier-gating is inconsistent.

---

## 3. Part 1 — Improve existing insights (persona-first)

### 3.1 Thread persona everywhere
`user_profiles.persona` (`new`/`experienced`) is read in onboarding but only used by `area-sensor-analysis`.
Extract the existing `personaInstruction()` (from `areaAnalysisPrompt.ts`) into a shared
`_shared/persona.ts` and feed it into **every** AI insight prompt:
- `pattern-evaluate` (insight wording), `refresh-seasonal-picks` (AI picks reasons),
  `generate-weekly-overviews` (tips), `analyse-automations` (the Sage+ rewrite), the new summary (§6).
- **New** = warm, plain-English, reassuring, always ends with "what to do now". **Experienced** = concise,
  technical, numbers-forward, no hand-holding. (The dual-voice we've been applying by hand, made systemic.)

### 3.2 Make every insight concrete + actionable
- Carry **evidence** like the automation suggestions now do (the data behind the "why").
- Add a **deep link** to every insight so it's actionable. `user_insights` needs an `action_path` (+ label)
  column; the pattern detectors set it (e.g. a `neglected_plant` insight → `/shed?plant=<id>`).
- Add a lightweight **severity/priority** so the feed + summary can rank.

### 3.3 Quality
- Dedup across surfaces (don't say "south bed dry" in both the pattern card and the area coach).
- Respect the "don't nag" rule already established (e.g. soil_drydown stays quiet when an automation covers it).

## 4. Part 2 — Fill the gaps (new insights, persona-aware)

Proposed new insight detectors/sources for areas that have none today. All reuse the pattern-engine
pipeline where possible (a detector + a `_shared/templates.ts` entry + the deterministic branch), so they
land on the feed automatically:

| Gap area | Proposed insight | Source data | Link |
|----------|------------------|-------------|------|
| **The Shed / plants** | "Tomato hasn't been logged as watered in 12 days" / "ready to harvest" / "outgrowing its pot (planted N days)" | inventory + events + grow guide | `/shed?plant=` |
| **Watchlist / pests** | "Aphid risk rising — warm + your roses are susceptible this month" | weather + ailments + season | `/watchlist` |
| **Planner / plans** | "Your Summer Veg plan has been mid-phase for 3 weeks — Phase 2 is ready" | plans + staging state | `/planner?plan=` |
| **Light / sun** | "This bed gets ~3h sun but your tomatoes want 6h+" | lux/sun analysis + plant needs | area detail |
| **Harvest** | "Courgettes are likely ready this week" | planted date + grow guide window | `/shed?plant=` |
| **Weather-forward** | "Frost Tuesday night — protect the tender plants in the front bed" | forecast + tender plants | `/dashboard?view=weather` |

Each is persona-aware (beginner gets the "what to do"; expert gets the data). Exact set + priority is a
decision (§9, Q4) — I'll propose this lot and you pick.

## 5. Part 3 — Tier-gate all AI insights → Evergreen (amendable)

Add a single modular gate, mirroring the `FEATURE_GATES` pattern we already shipped:

```ts
// src/constants/tierFeatures.ts
ai_insights: ["evergreen"],   // ← flip this one line to open to Sage+, PAID, etc.
```

- **Client (display):** every insight-rendering surface + the new page checks
  `useEntitlements().hasFeature("ai_insights")`. AI insight cards hide / show an upgrade nudge for
  non-Evergreen. (Deterministic fallbacks — seasonal fallback, deterministic weekly summary, the moisture
  card — stay for lower tiers unless you say otherwise; see Q1.)
- **Server (generation, cost control):** a parallel `_shared/insightTiers.ts` allow-list (kept in sync with
  `FEATURE_GATES.ai_insights`, documented like `HOURLY_RATE_LIMITS` mirrors `rateLimit.ts`) that the
  AI-insight generators check against the home's `subscription_tier` — so we don't spend Gemini on tiers
  that can't see the result. Flipping the gate updates both.
- **Easily amendable:** one array in each place; default Evergreen.

> Note the tension: today AI insights effectively need `ai_enabled` (Sage+). Moving them to **Evergreen
> only** makes them a top-tier perk — a Sage user keeps Plant Doctor etc. but **loses** the insight cards.
> That's the stated intent; confirming in Q1.

## 6. Part 4 + 5 — The unified AI Insights page (+ summary)

### 6.1 Route + nav
New lazy route `/insights` in `src/App.tsx` + a sidebar/nav entry (Sparkles icon), gated to `ai_insights`.

### 6.2 A normalized insight model
A shared shape so every source renders the same way:
```ts
interface FeedInsight {
  id: string; source: "pattern"|"area"|"automation"|"seasonal"|"weekly"|"shed"|"watchlist"|...;
  category: "watering"|"pests"|"growth"|"planning"|"weather"|...;
  title: string; body: string; severity: number; createdAt: string;
  link?: string;            // deep link to the source surface
  status?: "active"|"dismissed"|"applied";
}
```

### 6.3 The feed + summary edge function
A new **`insights-feed`** function (Evergreen-gated, cached) that:
1. Gathers the stored insight sources for the user/home (`user_insights`, `area_ai_insights`,
   `automation_suggestions`, `home_seasonal_picks` tips, `weekly_overviews` tips, new gap detectors).
2. Normalizes them into `FeedInsight[]`, ranked by severity + recency.
3. Generates a **persona-aware AI summary** (Gemini) — 2–3 sentences: "3 things want attention this week:
   your south bed is drying fast, your Summer Veg plan is ready for Phase 2, frost is coming Tuesday."
   Cached (re-summarise only when the underlying set changes; `logAiUsage`).
4. Returns `{ summary, insights }`.

### 6.4 The page UI (`AiInsightsPage`)
- **Top:** the AI summary card (the quick overview) + an "everything's quiet" empty state.
- **Body:** grouped/filterable insight cards (by category), each with a **deep link** ("Take me there")
  + dismiss/act, reusing the AssistantCard visual language.
- Reuses `<FeatureGate feature="ai_insights">` so the whole page is one gate.

## 7. Architecture summary

- `_shared/persona.ts` — shared persona prompt instruction (Part 1).
- `_shared/insightTiers.ts` — server allow-list mirroring `FEATURE_GATES.ai_insights` (Part 3).
- `user_insights` migration — add `action_path`, `action_label`, `severity` (Part 1/2).
- New pattern detectors for the gaps (Part 2) + `_shared/templates.ts` entries.
- `insights-feed` edge function + cache table/jsonb (Part 4/5).
- `AiInsightsPage` + `/insights` route + nav + `ai_insights` in `FEATURE_GATES` (Part 3/4).
- A normalized `FeedInsight` mapper in `src/lib/`.

## 8. Phasing

1. **P1 — Foundations:** `ai_insights` gate (Evergreen) + `_shared/persona.ts` + thread persona into the
   existing prompts + `user_insights` action_path/severity migration. *(Improves + gates what exists.)*
2. **P2 — The page:** `insights-feed` function (aggregator + AI summary) + `AiInsightsPage` + route + nav.
3. **P3 — Gap-fill:** the new detectors/insights (Part 2), landing on the feed automatically.

## 9. Decisions (confirmed 2026-06-20)

- **Q1 — Gate scope → WHOLE insights experience to Evergreen.** The new page **and** the existing insight
  cards (incl. the deterministic ones — moisture card, seasonal, weekly summary, automation suggestions)
  are gated to Evergreen via `FEATURE_GATES.ai_insights`. Clean "insights = Evergreen" story. (Removes some
  things Sprout/Botanist/Sage see today — accepted.)
- **Q2 — Generation → gate server-side too.** AI-insight generators check the home tier against a server
  allow-list (`_shared/insightTiers.ts`) mirroring `FEATURE_GATES.ai_insights`, so we don't spend Gemini on
  tiers that can't see the result.
- **Q3 — Summary cadence → on page open, cached** until the underlying insight set changes (no extra cron).
- **Q4 — Gaps → all four:** Plants/Shed, Watchlist/pests, Planner/plans, Weather + light/sun.

**Implication:** `ai_insights` defaults to `["evergreen"]`; flipping that one array (client) + its mirror
(server) changes the whole thing. Every insight surface + the new page sits behind `<FeatureGate
feature="ai_insights">`; generators behind the server allow-list.

## 10. App-reference files to update when built

`17-tier-gating.md` (new `ai_insights` gate), `26-pattern-engine.md` (new detectors + action_path),
`13-ai-gemini.md` (persona threading + `insights-feed`/`summarise` calls),
`10-edge-functions-catalogue.md` (`insights-feed`), `06-assistant-card.md` (relationship to the new page),
`21-routing.md` (`/insights`), the new-surface reference for `AiInsightsPage` (from `_template.md`), the
`00-INDEX.md` row, and each surface's "Tier gating" section as gates flip. Plus the
[feature-access-guide](../feature-access-guide.md).
