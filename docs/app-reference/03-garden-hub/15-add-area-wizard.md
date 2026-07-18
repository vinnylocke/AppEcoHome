# Add-Area Wizard

> Create a growing area properly in one flow: name it, describe its conditions (medium,
> texture, pH, water movement, nutrient source, peak light), plant it from the Shed or by
> searching new plants, and — on AI tiers — get an instant suitability review with
> actionable recommendations before the trowel comes out.

**Trigger:** Location Management → a location card's **Add Area** button.
**Source files:**
- `src/components/area/AddAreaWizard.tsx` — the wizard modal
- `src/lib/addAreaWizard.ts` — pure state/validation/commit logic
- `src/services/areaSetupReviewService.ts` — review invoke + error mapping
- `supabase/functions/area-setup-review/index.ts` + `supabase/functions/_shared/areaSetupReview.ts`

---

## Quick Summary

Replaces the old quick-add stub (an instant `{ name: "New Area" }` insert). Three steps:
**bed** (name + `AreaAdvancedFields` + a peak-light input) → **plants** (new instances of Shed
plants with quantities, or `PlantSearchModal` search which also adds to the Shed) → commit →
**AI review** (AI tiers): 0–100 suitability score, per-plant fit, compatibility verdict, and
recommendations (plants → search-and-add; tasks → one-tap `TaskActionButtons` commit;
automation ideas → deep-link). A **"Skip — just create"** escape hatch covers the old
quick-add case with a real name.

---

## Role 1 — Technical Reference

### Component graph

```
AddAreaWizard (portal, z-[120])
├── Step "bed"
│   ├── name input (add-area-name)
│   ├── AreaAdvancedFields (reused — its lux history panel self-hides: no area id yet)
│   └── peak light input (add-area-lux)
├── Step "plants"
│   ├── pending list (add-area-pending) — quantity steppers, remove
│   ├── "Search for a new plant" → PlantSearchModal (z-[130], persists the plants row)
│   └── "From your Shed" grid (add-area-shed-list / add-area-shed-{plantId})
├── COMMIT (add-area-create / add-area-skip)
└── Step "review" (AI tiers; add-area-review)
    ├── score (add-area-score) + headline + summary
    ├── plant_fit rows · compatibility verdict
    ├── recommendations: plants (add-area-rec-plant-N → search modal),
    │   tasks (TaskActionButtons, scoped to the new instance ids),
    │   automations (text + /integrations?tab=automations link)
    └── AiFeedback + Regenerate (add-area-review-regenerate)
```

### Props

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `homeId` | `string` | LocationManager | Scope |
| `location` | `{ id, name }` | The tapped location card | New area's parent |
| `aiEnabled` | `boolean` | App.tsx profile | Gates the review step |
| `isPremium` | `boolean` | App.tsx (`enable_perenual`) | PlantSearchModal gates |
| `onClose` / `onCreated(areaId)` | fns | LocationManager | Close + refresh hierarchy |

### Data flow — read paths

- `plants` (id, common_name, thumbnail_url) by `home_id` — the Shed tab.
- The review (server-side) reads `areas` (env fields + `light_intensity_lux` + `locations.is_outside`),
  `inventory_items` in the area, `plants` care columns (`soil_ph_min/max`, `sunlight`,
  `watering_min/max_days`, `soil_moisture/ec/temp_min/max`, `hardiness_min/max`, cycle,
  `is_toxic_pets`, `attracts`), `homes.hardiness_zone/climate_zone`.

### Data flow — write paths

Commit order (retry-safe — the area id is kept so a partial failure re-runs only what failed):
1. `areas.insert` — name + only the fields the user set (`buildAreaCommit`).
2. `area_lux_readings.insert` when peak light was set (mirrors `AreaLuxReadings`; non-fatal).
3. `inventory_items.insert` — one row per instance (quantity-expanded), `status: "Planted"`,
   `planted_at` today, `growth_state: "Vegetative"`, full area/location context, `identifier`
   in the Shed's `Name #NNNN` convention.
4. `AutomationEngine.applyPlantedAutomations(created, areaId, today)`.

Review-step plant additions (recommendation "Add" / search) insert a single instance the same
way. Nothing else is written before commit **except** `plants` rows created by the search modal
(deliberate — searching adds to the Shed, and a cancelled wizard leaves only a reusable
catalogue row).

### Edge functions invoked

| Function | Purpose |
|----------|---------|
| `area-setup-review` | The AI review — see [Edge Functions Catalogue](../99-cross-cutting/10-edge-functions-catalogue.md). Errors map to distinct UI states: 403 → step hidden anyway (client gate), 429 → "review limit" note, other → retry. |

### Cron / scheduled jobs

None.

### Realtime channels

None (LocationManager refreshes via `onCreated` → `fetchHierarchy`).

### Tier gating

Review step renders only when `aiEnabled` (profile `ai_enabled`); the edge function re-verifies
via `guardAiByHome` (RHO-10 convention) + `enforceRateLimit`.

### Beta gating

None.

### Permissions

The Add Area button is gated by `areas.create` (unchanged); instance inserts ride the standard
home-member RLS.

### Error states

| State | Result |
|-------|--------|
| Blank name / bad pH / bad lux | Toast; step blocked (`validateBed`) |
| Commit partial failure | Area kept; toast explains; Create re-runs only the failed inserts |
| Review 429 | "Review limit" note — area + plants are already saved |
| Review unparseable / error | Retry button; data already saved |

### Performance

- Shed list is a single narrow select; review is one on-demand Gemini call (no cache table).

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why open this

Setting up a bed is the moment you know the most about it — you've just dug it, tested it,
sited it. The wizard captures that knowledge once, puts plants in straight away, and (on AI
plans) tells you honestly whether the combination will thrive **before** you commit a season
to it.

### Every flow

1. **Describe the bed** — name it, then record what you know: medium, texture, pH, drainage,
   feeding, peak light. Skip anything you haven't measured; you can fill it in later from Area
   details (or on a Garden Walk). In a hurry? **Skip — just create** makes the area with only
   a name.
2. **Plant it** — tap plants from your Shed (use the +/- steppers for quantities), or search
   for something new; a searched plant lands in your Shed *and* the bed's list in one motion.
3. **Create** — the area, the plantings and any planting-triggered automations all happen
   together.
4. **The AI review** (Sage/Evergreen) — a score out of 100 with the reasoning: how each plant
   fits *your* recorded conditions, whether the plants suit each other, and what to do about
   it — companions to add, care tasks to schedule (one tap), automation ideas.

### Information on display — what every field means

| Element | Meaning |
|---------|---------|
| Score | 85+ thriving · 60–84 workable with adjustments · below 60 real mismatches |
| Plant fit rows | Per-plant verdict against your recorded pH/light/drainage |
| Growing together | Whether the plants suit sharing one bed |
| Suggested care | Tasks tailored to this setup — tap to add to your schedule |
| Automation ideas | Watering/sensor ideas — set up from Integrations when you have hardware |

### Tier-by-tier experience

| Tier | Experience |
|------|-----------|
| Sprout / Botanist | Steps 1–2; the wizard closes after creation |
| Sage / Evergreen | Full flow including the review |

### Common mistakes / pitfalls

- **Guessing the pH.** A wrong pH skews the whole review — leave it blank until you've tested.
- **Treating the score as a verdict on your gardening.** It scores the *match*, not you; a low
  score with clear fixes is the wizard doing its job.
- **Expecting automations to be created.** They're ideas — real automations need your devices,
  set up from Integrations.

### Recommended workflows

- Test soil → run the wizard → act on the review's task suggestions the same day.
- Score below 60? Read the per-plant fit notes first — often one plant is the mismatch, and
  swapping it (the review suggests with what) lifts the whole bed.

### What to do if something looks wrong

- **Review didn't load:** your area and plants are saved regardless — retry, or later from
  Area details' AI Coach once readings exist.
- **"Review limit" message:** rate limit — everything is saved; try again later.
- **A plant shows "unknown" fit:** it has no care data on file yet — the nightly care-ranges
  cron usually fills this within a day.

---

## Related reference files

- [Location Manager](./03-location-manager.md)
- [Area Details](./04-area-details.md)
- [The Shed — Plant Search](../05-tools/01-plant-search.md)
- [AI — Gemini (cross-cutting)](../99-cross-cutting/13-ai-gemini.md)
- [Tier Gating](../99-cross-cutting/17-tier-gating.md)

## Code references for ongoing maintenance

- `src/components/area/AddAreaWizard.tsx` — wizard modal
- `src/lib/addAreaWizard.ts` — validation / pending list / commit payload (Vitest)
- `src/services/areaSetupReviewService.ts` — invoke + error mapping
- `supabase/functions/area-setup-review/index.ts` — the review function
- `supabase/functions/_shared/areaSetupReview.ts` — prompt + schema + parser (Deno-tested)
- `src/components/AreaAdvancedFields.tsx`, `src/components/PlantSearchModal.tsx`,
  `src/components/TaskActionButtons.tsx` — reused building blocks
