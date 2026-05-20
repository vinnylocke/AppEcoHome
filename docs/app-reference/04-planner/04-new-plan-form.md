# New Plan Form

> 3-step wizard for creating a new Plan. Captures project vision, environment, and preferences/rules; sends the result to the AI architect (`generate-landscape-plan`) which returns a full blueprint (project overview, plant list, maintenance schedule, hero image).

**Trigger:** Plus button on Planner Dashboard, Global Quick Add menu, or `?open=new-plan` URL param.
**Source file:** `src/components/NewPlanForm.tsx`

---

## Quick Summary

A 3-step modal:

1. **The Vision** — plan name, free-text description, aesthetic, timeline.
2. **The Environment** — bed dimensions (W × L × D), sunlight class, growing medium.
3. **Preferences & Rules** — inclusive plants, exclusive plants, wildlife, difficulty, maintenance, considerations.

On submit, the form data is sent to `supabase.functions.invoke("generate-landscape-plan", { body })`. The edge function calls Gemini, returns `{ blueprint, cover_image_url }`. A `plans` row is inserted with `status: "Draft"` and the AI output stashed. `onSuccess()` dismisses the modal and refreshes Planner Dashboard.

Sprout/Botanist tiers see a lock placeholder — the form is gated to AI tiers.

---

## Role 1 — Technical Reference

### Component graph

```
NewPlanForm (Portal modal)
├── Header
│   ├── Title "New Project"
│   ├── Close button
│   └── 3-step progress indicator
├── Step 1: The Vision
│   ├── Plan name *
│   ├── Description *
│   ├── Aesthetic (Natural, Modern, Cottage, Productive…)
│   └── Timeline (Start Immediately / Next Season / Long-term…)
├── Step 2: The Environment
│   ├── Unit (m / ft)
│   ├── Width *, Length *, Depth (optional)
│   ├── Sunlight class dropdown
│   └── Growing medium
├── Step 3: Preferences & Rules
│   ├── Inclusive plants (free text — comma-list)
│   ├── Exclusive plants (free text)
│   ├── Wildlife considerations
│   ├── Difficulty + Maintenance dropdowns
│   ├── Additional considerations
│   └── Generate Plan button
└── (Locked screen for non-AI tiers)
```

### Props

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `homeId` | `string` | PlannerDashboard | Scope |
| `onClose` | `() => void` | PlannerDashboard | Hide modal |
| `onSuccess` | `() => void` | PlannerDashboard | Refresh + close |
| `aiEnabled` | `boolean` | App.tsx (profile flag) | Gates the form |

### Local state

| State | Purpose |
|-------|---------|
| `step` | 1 / 2 / 3 |
| `isGenerating` | Submit in flight |
| `errors` | Per-field validation errors |
| `formData` | The full struct, sent verbatim to the edge function |

### Form fields → AI payload

```ts
{
  planName, description,
  aesthetic, timeline,
  width: "4m", length: "3m", depth: "30cm" | "N/A",  // formatted with unit
  sunlight, medium,
  inclusivePlants, exclusivePlants,
  wildlife, difficulty, maintenance,
  considerations,
}
```

### Data flow — write paths

#### `handleGeneratePlan()`

1. Client-side required-field validation (planName, description, width, length).
2. `supabase.functions.invoke("generate-landscape-plan", { body: { formData, homeId } })`.
3. Edge function returns `{ blueprint, cover_image_url }`.
4. Client inserts `plans` row:

```ts
supabase.from("plans").insert({
  home_id, name: planName, description, status: "Draft",
  ai_blueprint: blueprint, cover_image_url,
});
```

5. `saveInitialPromptMemory(homeId, planId, payloadData)` — saves structured prefs for the AI memory.
6. `logEvent(PLAN_CREATED)`.
7. `onSuccess()`.

### Edge functions invoked

| Function | Purpose |
|----------|---------|
| `generate-landscape-plan` | Gemini blueprint + image |

### Cron / scheduled jobs that affect this surface

None.

### Realtime channels

None.

### Tier gating

- AI tiers (Sage / Evergreen) — full form.
- Non-AI tiers — locked overlay with upgrade CTA. (The form is still useful as a brief — but no AI generation.)

### Beta gating

None.

### Permissions

- `planner.write` — gated.

### Error states

| State | Result |
|-------|--------|
| Missing required field | Inline error + toast |
| Edge function error | Toast with Retry button (re-fires submit) |
| Insert fails after AI succeeds | Toast — but the AI work is lost (no retry-from-blueprint UX) |

### Performance

- Modal uses focus trap (`useFocusTrap`).
- Renders via `createPortal` for stacking outside the page tree.
- Single AI call; toast `loading → success` flow keeps UI responsive.

### Linked storage buckets

- `plan-covers` — `cover_image_url` is written by the edge function into this bucket.

---

## Role 2 — Expert Gardener's Guide

### Why use this form

This is where the AI helps. By answering 3 short pages of questions, you give Gemini enough context to generate a real, opinionated garden design — not a generic plant list, but one tuned to your dimensions, your sun, your wildlife concerns, and your maintenance appetite.

If you skip the AI (lower tier) you can still create a plan from scratch in Plan Staging, but you'll be designing it yourself.

### Every flow on this form

#### Step 1 — The Vision

- **Project name:** what you'll see on the card. "Spring Veg Patch 2026" / "Front Border Refresh".
- **Description:** the AI reads this. Short paragraph of what you want to achieve.
- **Aesthetic:** Natural, Modern, Cottage, Productive, Mediterranean… picks the design vocabulary.
- **Timeline:** how soon you want to start.

#### Step 2 — The Environment

- **Unit:** m or ft (affects all dimensions on this step).
- **Width × Length:** required. Real-world bed dimensions.
- **Depth:** optional — relevant for raised beds.
- **Sunlight:** full sun / part sun / part shade / etc. Use the Sun Tracker to find out if unsure.
- **Growing medium:** Standard Soil / Raised Bed Mix / Containers / Hydroponic.

#### Step 3 — Preferences & Rules

- **Inclusive plants:** "definitely include these" — comma-separated list.
- **Exclusive plants:** "never these" — allergies, dislikes, invasives.
- **Wildlife:** anything to attract or avoid (bees, dogs, deer).
- **Difficulty:** beginner / intermediate / advanced — affects plant choices.
- **Maintenance:** low / medium / high — controls how busy the schedule will be.
- **Considerations:** free-text. Anything else the AI should know.

#### Submit

- AI Architect generates the plan; cover image renders; you land on Planner Dashboard with the new card visible.
- Tap it → Plan Staging walks you through the phases.

### Information on display — what every field means

Already covered above.

### Tier-by-tier experience

| Tier | Differences |
|------|-------------|
| Sprout / Botanist | Locked screen. Upgrade CTA. |
| Sage / Evergreen | Full form. |

### Common mistakes / pitfalls

- **Vague description.** The AI works better with concrete language. "Cosy cottage feel with edible perennials and some herbs along the path" > "I want a garden".
- **Wrong dimensions.** AI plant choices are spaced for the dimensions you gave — overstate and beds end up sparse; understate and they end up crammed.
- **No exclusives.** If you have allergies, list them in exclusives. AI may otherwise suggest something inappropriate.
- **Forgetting to specify wildlife.** Pets in the garden? Mention it — toxic plants get filtered.

### Recommended workflows

- **First plan:** be detailed in step 1 + 3. The AI's quality scales with the brief.
- **Quick iteration:** generate, look at the result, regenerate from Plan Staging with feedback (re-uses your form data + a regen note).

### What to do if something looks wrong

- **AI generation fails:** retry from the toast. Most failures are transient quota issues.
- **Wrong dimensions in the plan:** open the plan, reset to Draft, regenerate with correct numbers in feedback.
- **Locked screen when you're on Sage:** check Account → tier reads correctly. The `aiEnabled` prop is sourced from `user_profiles.ai_enabled`.

---

## Related reference files

- [Planner Dashboard](./01-planner-dashboard.md)
- [Plan Staging](./02-plan-staging.md)
- [Tier Selection](../01-onboarding/04-tier-selection.md)
- [Tier Gating (cross-cutting)](../99-cross-cutting/17-tier-gating.md)
- [AI — Gemini (cross-cutting)](../99-cross-cutting/13-ai-gemini.md)

## Code references for ongoing maintenance

- `src/components/NewPlanForm.tsx` — the wizard
- `supabase/functions/generate-landscape-plan/index.ts` — AI edge function
- `src/lib/plannerMemory.ts` — `saveInitialPromptMemory`
- `src/hooks/useFocusTrap.ts` — focus trap
- `src/events/registry.ts` — `PLAN_CREATED`
