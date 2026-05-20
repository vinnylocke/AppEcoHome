# Optimise Tab

> The schedule consolidator — finds duplicates, fragmentation, and frequency mismatches in your Task Schedules, and (Sage/Evergreen) calls the AI Optimiser for subtler suggestions like seasonal adjustments and retire-this-blueprint.

**Route:** Tab inside Blueprint Manager (`/schedule?tab=optimise`)
**Source files:**
- `src/components/OptimiseTab.tsx`
- `src/components/OptimisationProposalCard.tsx`
- `src/components/OptimisationHistory.tsx`
- `src/lib/taskOptimiser.ts` — deterministic analyser
- `src/lib/taskOptimiserAi.ts` — AI analyser

---

## Quick Summary

User picks an area (or "whole home") → "Find Improvements" runs the deterministic optimiser against that area's blueprints. Result: a list of proposals. User reviews, ticks the ones to apply, hits Apply. Sage/Evergreen also gets "AI-Powered Suggestions" which calls Gemini for subtler ideas. Every applied change is logged in `optimisation_history` with a 90-day undo window.

---

## Role 1 — Technical Reference

### Component graph

```
OptimiseTab
├── Explainer header
├── Scope selector (Single area / Whole home)
├── Location → Area dropdowns
├── Action row
│   ├── Find Improvements (deterministic)
│   └── AI-Powered Suggestions (Sage/Evergreen)
├── Proposals list
│   └── OptimisationProposalCard (per proposal)
│       ├── Scenario badge with tooltip
│       ├── Summary + diff
│       ├── Include / Exclude checkbox
│       ├── Per-AI-proposal feedback (👍 / 👎)
│       └── Regenerate button (AI only)
├── Apply Selected button → ConfirmModal
└── OptimisationHistory (collapsible)
```

### Props

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `homeId` | `string` | BlueprintManager | Scope |
| `aiEnabled` | `boolean` | BlueprintManager | Gates AI button |

### Local state

| State | Purpose |
|-------|---------|
| `locations`, `areas`, `dataLoaded` | Lookup data |
| `analyseScope` | "single" / "whole" |
| `selectedLocationId`, `selectedAreaId` | Active filter |
| `proposals`, `aiProposals` | Per-source proposal lists |
| `included` | Set of proposal ids ticked to apply |
| `applying` | Apply in flight |
| `confirmOpen` | Confirm modal |
| `historyKey` | Bumps to force history refresh after apply |
| `lastApplyCount` | Success banner |
| `feedbackMap` | AI proposal feedback state |
| `regenerateOpen`, `regenerateReason` | Regenerate modal |

### Scenarios (`OptimisationProposal.scenario`)

| Scenario | Source | Meaning |
|----------|--------|---------|
| `redundant` | deterministic | Two blueprints do the same thing in the same area |
| `fragmentation` | deterministic | Many small blueprints could merge |
| `two-tier` | deterministic | Two scopes overlap (area-level + plant-level) |
| `pileup` | deterministic | Tasks clustering on the same days |
| `frequency-change` | AI | Suggested cadence tweak |
| `new-blueprint` | AI | Missing recurring care |
| `retire` | AI | Blueprint no longer matches active plants |

### Data flow — read paths

```ts
supabase.from("locations").select("id, name").eq("home_id", homeId);
supabase.from("areas").select("id, name, location_id, locations!inner(home_id)").eq("locations.home_id", homeId);
```

Then per analysis run:

```ts
// Deterministic:
analyseArea(areaId, areaName, blueprints, instanceMap);

// AI:
analyseAreaAi({ areaId, areaName, blueprints, instanceMap, negativeFeedback });
```

`fetchNegativeFeedback()` reads `optimiser_feedback` table to pass past 👎 history to the AI so it doesn't re-suggest rejected ideas.

### Data flow — write paths

#### Apply Selected
- For each proposal in `included`: applies the proposed mutation (create/update/delete blueprints).
- Writes a row to `optimisation_history` with the diff for undo support.

#### Feedback (AI only)
- `optimiser_feedback.insert({ proposal_id, scenario, rating, reason? })`

### Edge functions invoked

- `analyseAreaAi()` calls `optimise-blueprints` (or similar) edge function under the hood.

### Cron / scheduled jobs that affect this surface

None — runs on demand.

### Realtime channels

None — analyses are a snapshot.

### Tier gating

| Feature | Tier |
|---------|------|
| Find Improvements (deterministic) | Every tier |
| AI-Powered Suggestions | Sage / Evergreen |
| Regenerate AI with feedback | Sage / Evergreen |

### Beta gating

Some AI scenarios may be beta-flagged during rollout.

### Permissions

- `tasks.write` — gates Apply.

### Error states

| State | Result |
|-------|--------|
| Find Improvements fails | Toast + retry |
| AI call fails | Toast; proposal list stays empty |
| Apply partial fail | Toast; some proposals applied (visible in history) |

### Performance

- Deterministic analysis runs in JS — fast even with hundreds of blueprints.
- AI analysis is a single edge function call.
- History tab lazy-fetches via `historyKey` bumps.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why open this tab

After a few months of using Rhozly, you've accumulated 30+ Task Schedules — some you set up manually, some Plan Staging created. They overlap. They drift. Some are firing too often, some not often enough. The Optimise tab is the cleanup pass.

Two flavours:
- **Find Improvements** = deterministic; finds obvious duplicates and consolidations using rules.
- **AI-Powered Suggestions** = uses Rhozly AI to spot subtler problems and propose seasonal adjustments. Costs AI quota.

### Every flow on this tab

#### 1. Pick scope

- Single area (default) — fast, focused.
- Whole home — runs everything.

#### 2. Find Improvements

- Tap → analyser runs → proposals appear.
- Each proposal has a scenario badge (Redundant, Fragmentation, Pileup, Two-tier).
- Read the summary, optionally tick "Include".

#### 3. AI-Powered Suggestions

- Tap → spinner → AI proposals appear, marked with a sparkle.
- Scenarios include Frequency Change, New Blueprint, Retire.

#### 4. Provide feedback on AI proposals

- 👍 = "yes, this is useful" — kept in history.
- 👎 = "no, this isn't relevant" — `optimiser_feedback` table records it; future AI runs avoid similar suggestions.

#### 5. Apply Selected

- Tick proposals → Apply → ConfirmModal → apply.
- Success banner shows how many were applied.
- Every change logged in History with undo for 90 days.

#### 6. Regenerate AI proposals

- Don't like the suggestions? "Regenerate" with a reason ("Make it lower maintenance" / "Ignore winter") → AI re-runs.

#### 7. Optimisation History

- Bottom of the tab. Lists every applied change.
- Each row has an Undo button (90-day window).

### Information on display — what every field means

| Element | Meaning |
|---------|---------|
| Scenario badge | What kind of problem |
| Tooltip text | Plain-English explanation of the scenario |
| Diff | What changes if applied (e.g. "Merge 3 blueprints into 1") |
| Include checkbox | Mark for batch apply |
| AI sparkle | Came from AI |
| Feedback buttons | Train AI; not undo-able |

### Tier-by-tier experience

| Tier | Differences |
|------|-------------|
| Every tier | Find Improvements + history. |
| Sage / Evergreen | + AI Suggestions, Regenerate, feedback training. |

### Common mistakes / pitfalls

- **Applying everything blindly.** Each proposal has a diff for a reason — read first.
- **Ignoring AI sparkle.** AI proposals are often the most useful but also the most opinionated. Read carefully.
- **Hitting Regenerate without a reason.** The reason field is fed to the AI as steering — leave it blank and you get similar suggestions.
- **Forgetting the 90-day undo.** History rows are reversible, but only for 90 days from the apply date.

### Recommended workflows

- **Seasonal pass:** at the start of each season, run Whole Home → Find Improvements → AI Suggestions → review → apply.
- **After plan completion:** when a plan finishes, run on that area — likely have stale blueprints to retire.
- **Drift check:** if your dashboard task count feels off, this tab usually reveals why.

### What to do if something looks wrong

- **No proposals returned:** your schedules are well-organised — celebrate.
- **AI returns same suggestions you previously rejected:** check `optimiser_feedback` table; the negative-feedback signal may not be wired in yet for this scenario.
- **Apply didn't work:** look in History — partial applies are visible there.

---

## Related reference files

- [Blueprint Manager](./07-blueprint-manager.md)
- [Tasks Data Model (cross-cutting)](../99-cross-cutting/04-data-model-tasks.md)
- [AI — Gemini (cross-cutting)](../99-cross-cutting/13-ai-gemini.md)

## Code references for ongoing maintenance

- `src/components/OptimiseTab.tsx` — orchestrator
- `src/components/OptimisationProposalCard.tsx` — per proposal
- `src/components/OptimisationHistory.tsx` — history list
- `src/lib/taskOptimiser.ts` — deterministic analyser
- `src/lib/taskOptimiserAi.ts` — AI analyser + feedback
- `supabase/functions/optimise-blueprints/index.ts` — AI edge function (where applicable)
- `supabase/migrations/*_optimisation_history.sql` — history schema
