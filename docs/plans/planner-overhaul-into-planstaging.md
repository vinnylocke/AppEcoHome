# Planner — Overhaul plans through PlanStaging (full 5-phase engine)

## Goal

Make Garden Overhaul plans flow through the same 5-phase staging engine as standard "designed" plans, so users get the same Confirm → Infrastructure → Staging → Execution → Maintenance lifecycle, with the same calendar-injection + task-linking behaviour. Phase 1's pre-start review becomes a **concept picker** (3 AI-transformed photos + regenerate-with-feedback), and the chosen concept's image promotes to the plan's `cover_image_url` so phases 2–5 render with the after-image.

Also fix two mobile bugs the user flagged on the main planner screen.

---

## App-reference files consulted

> CLAUDE.md says I must list these. None of the app-reference files exist yet for Garden Overhaul (it was built in this branch and the doc hasn't been written), but I read the related ones:

- `docs/app-reference/00-INDEX.md` — to find the planner entry. Planner reference files are not yet authored either.
- `docs/app-reference/99-cross-cutting/04-data-model-tasks.md` — to confirm how `tasks` + `task_blueprints` link to a plan via `plan_id` (this is what makes "tasks linked to the plan" work across both kinds).
- `docs/app-reference/99-cross-cutting/05-data-model-plans.md` — to confirm `plans.kind` already exists and the `staging_state jsonb` column is kind-agnostic.

**Drift flagged:** the Planner surface and the Garden Overhaul flow are not yet documented in `docs/app-reference/`. This plan's follow-up commit will add stubs to the index but full reference files are out of scope for this task — flagging so the index gains TODO rows.

---

## What problem this solves

**Today** — overhaul plans get a bespoke `OverhaulResultView` that:
- Shows the concept picker + blueprint + feedback as one scrollable page
- Does **not** flow into the planner's 5-phase engine
- Has no Phase 1 (area link), no Phase 2 (shed sourcing), no Phase 3 (staging inventory), no Phase 4 (calendar tasks), no Phase 5 (recurring blueprints)
- Tasks from the overhaul blueprint are never injected into the user's calendar
- The user can't link plants to their shed or auto-create them

**After** — overhaul plans go through the exact same 5-phase workflow as designed plans, with phase-1 (Pre-Start Review) swapped for a concept picker. Everything downstream is identical: same area link/create, same shed sourcing/auto-import, same staging, same calendar injection, same recurring maintenance blueprints.

---

## Backward compatibility (the user's explicit question)

**Existing overhaul plans will continue to work without regeneration** because:

1. The plan row already has `kind = 'overhaul'` and a populated `ai_blueprint` (with `plant_list` / `prep_steps` / `maintenance_schedule`)
2. `plan_overhaul_concepts` rows already exist and are selectable
3. The new shape-normalisation adapter (see "Blueprint shape mismatch" below) is applied on read in PlanStaging — it transforms the overhaul blueprint into the designed shape so phases 2–5 work transparently
4. `staging_state` is kind-agnostic — the existing `{}` empty object on old overhaul plans means they correctly start at Phase 1
5. The selected concept (if one was already picked) automatically becomes the cover image

If the user *wants* to redo it, the regenerate-with-feedback option is still available in Phase 1's pre-start review.

---

## Blueprint shape mismatch (the load-bearing problem)

PlanStaging assumes the designed-plan blueprint shape:
```ts
{
  project_overview: { title, summary },
  infrastructure_requirements: {
    suggested_area_name, suggested_medium, suggested_sunlight
  },
  plant_manifest: [
    { common_name, scientific_name, quantity, role,
      aesthetic_reason, horticultural_reason, procurement_advice }
  ],
  preparation_tasks: [
    { task_index, title, description, depends_on_index }
  ],
  custom_maintenance_tasks: [
    { title, description, frequency_days }
  ]
}
```

The overhaul edge fn produces:
```ts
{
  project_overview: { title, summary, difficulty, maintenance, timeline },
  // NO infrastructure_requirements
  plant_list: [
    { common_name, scientific_name, role, quantity, spacing_cm, notes }
  ],
  prep_steps: [ "string", "string", … ],  // array of strings!
  maintenance_schedule: [
    { task, frequency, best_months, detail }  // frequency is a STRING like "weekly"
  ]
}
```

### Solution — normalise on read

Add a small adapter `normaliseOverhaulBlueprint(blueprint)` in `src/lib/overhaulBlueprintAdapter.ts` that:

1. **plant_manifest** ← `plant_list` mapped to `{common_name, scientific_name, quantity (default 1), role, aesthetic_reason: notes, horticultural_reason: "", procurement_advice: "Procure locally or search Shed."}`

2. **preparation_tasks** ← `prep_steps` mapped to `{task_index: idx, title: <derived from string>, description: <full string>, depends_on_index: idx > 0 ? idx-1 : null}`
   - Title is the first sentence or first 60 chars; description is the full step.
   - `depends_on_index` makes prep tasks sequential.

3. **custom_maintenance_tasks** ← `maintenance_schedule` mapped to `{title: task, description: <"detail" or "frequency string">, frequency_days: <parse from frequency string>}`
   - Frequency parser: "daily" → 1, "weekly" → 7, "twice a week" → 3, "every 2 weeks" → 14, "monthly" → 30, "every X months" → X*30, "annually"/"yearly" → 365, falls back to 30 if unparseable.

4. **infrastructure_requirements** ← synthesised:
   - `suggested_area_name`: `project_overview.title` or `"Overhauled Garden"`
   - `suggested_medium`: derived from the photo_analysis or defaulted to `"Garden Soil"` (we don't have great info here; safe default)
   - `suggested_sunlight`: defaulted to `"part shade"` if absent (the AI didn't currently asked, but this can be improved later)

PlanStaging gets the normalised blueprint into `localBlueprint` and runs unchanged for phases 2–5.

A unit test in `tests/unit/lib/overhaulBlueprintAdapter.test.ts` covers the parser fallbacks and the field renames.

---

## Implementation plan

### File-by-file

| File | Change |
|---|---|
| `src/lib/overhaulBlueprintAdapter.ts` | **NEW** — `normaliseOverhaulBlueprint(blueprint, photoAnalysis?)` adapter + `parseFrequencyDays(text)` helper. |
| `tests/unit/lib/overhaulBlueprintAdapter.test.ts` | **NEW** — Vitest unit tests covering the shape mapping + frequency parsing. |
| `src/components/PlanStaging.tsx` | Branch on `plan.kind`: (a) normalise blueprint on mount for overhaul plans, (b) replace Pre-Start Review with a concept picker for overhaul, (c) regenerate path calls `generate-garden-overhaul` instead of `generate-landscape-plan`. |
| `src/components/planner/OverhaulConceptPicker.tsx` | **NEW** — Carved-out concept picker (the AI-generated concepts grid + select + zoom). Used by PlanStaging Phase 1 pre-start. Polls every 4s while concepts are generating. |
| `src/components/PlannerDashboard.tsx` | (a) Remove the `if (plan.kind === "overhaul")` branch in the card-click handler — both kinds go through PlanStaging now. (b) Remove the `overhaulResultPlanId` in-place render branch. (c) When `OverhaulPlanForm` submits, route to `setSelectedPlan(plan)` after refetching. (d) Mobile bug: header buttons overflow — restructure into a wrapping grid on mobile. (e) Mobile bug: plan-tile Sun + View-on-Layout buttons overlap the kebab menu — move them down below the kebab on mobile (they currently absolute-position into the same top-right slot). |
| `src/components/planner/OverhaulResultView.tsx` | **DELETE** — fully subsumed by PlanStaging + OverhaulConceptPicker. |
| `src/services/gardenOverhaulService.ts` | No changes — `selectOverhaulConcept` already auto-updates the plan's `cover_image_url`, which is what we want. |

### PlanStaging adaptation detail

```ts
// inside PlanStaging.tsx, just after the imports:
import { normaliseOverhaulBlueprint } from "../lib/overhaulBlueprintAdapter";
import OverhaulConceptPicker from "./planner/OverhaulConceptPicker";

// Detect kind:
const isOverhaul = plan.kind === "overhaul";

// When loading the blueprint:
const rawBlueprint = plan.ai_blueprint;
const blueprintToUse = isOverhaul && rawBlueprint
  ? normaliseOverhaulBlueprint(rawBlueprint)
  : rawBlueprint;

// State init uses blueprintToUse instead of plan.ai_blueprint:
const [localBlueprint, setLocalBlueprint] = useState(blueprintToUse);
// (and the [plan.id] effect also runs through the adapter)
```

**Pre-Start Review section:**

```tsx
{!isStarted && (
  <section …>
    {isOverhaul ? (
      <>
        <h2>Pick your favourite concept</h2>
        <OverhaulConceptPicker
          planId={plan.id}
          userId={currentUserId}
          originalPhotoUrl={…}
        />
        <button onClick={handleStartProject} disabled={!hasSelectedConcept}>
          Accept Selected Concept & Start Staging
        </button>
        <button onClick={() => setShowRegenModal(true)}>
          Regenerate with feedback
        </button>
      </>
    ) : (
      // existing designed-plan Accept + Regenerate buttons
    )}
  </section>
)}
```

The "Accept Selected Concept" button is disabled until the user has picked a concept (we read `plan_overhaul_concepts` for `selected_by_user = true`).

When user picks a concept, the existing `selectOverhaulConcept` service mutates the plan's `cover_image_url` (it already does — confirmed in the service). PlanStaging's `[plan.id]` effect doesn't re-fire on cover image change, so we'll add a small `useEffect([…])` to refetch the cover URL after concept selection.

**Regenerate-with-feedback adaptation:**

```ts
const handleRegeneratePlan = async () => {
  // …
  const fn = isOverhaul ? "generate-garden-overhaul" : "generate-landscape-plan";
  const body = isOverhaul
    ? {
        // For regeneration, re-use the original photo + add the
        // feedback into "wants" so the AI iterates on the request.
        homeId,
        // We need to fetch the original photo URL from
        // plan_overhaul_inputs and re-encode for the edge fn, OR
        // make the edge fn accept a planId + isRegeneration flag.
        regeneratePlanId: plan.id,
        feedback: regenFeedback,
      }
    : {
        homeId,
        isRegeneration: true,
        formData: { /* existing */ },
      };
  // …
};
```

**Edge function regenerate support** — the simplest path: pass `regeneratePlanId` + `feedback`. The edge fn fetches `plan_overhaul_inputs` for that planId (already-uploaded photo URL via signed URL → re-download → re-encode base64), merges `feedback` into `wants`, runs the same pipeline, and:
- Deletes existing `plan_overhaul_concepts` rows for that planId
- Resets the plan's `staging_state = '{}'`, `status = 'Draft'`, `cover_image_url = null`
- Re-runs the vision + Imagen pipeline, populating new concepts

This is a meaningful edge-fn change. For simplicity in *this* task, I'll add **client-side regeneration**: it re-submits the form with the cached input data (likes/dislikes/wants + feedback merged) by calling `generate-garden-overhaul` directly with the photo re-fetched from the signed URL. If the signed URL has expired (>7d), we surface a clear error: "Original photo expired — upload a new photo".

### PlannerDashboard mobile bug fixes

**Bug 1 — Header buttons overflow on phone:**

Current layout: `flex items-center gap-2 w-full md:w-auto` with three buttons (What's a Plan + Overhaul + New Plan). On <375px (small phones), the buttons wrap awkwardly or overflow because each has fixed padding.

Fix: Restructure to a CSS grid on mobile:
```tsx
<div className="grid grid-cols-2 md:flex md:items-center gap-2 w-full md:w-auto">
  <button className="md:col-span-1 col-span-2 …">What's a Plan?</button>  {/* full row on mobile */}
  <button className="…">Overhaul</button>
  <button className="…">New Plan</button>
</div>
```

This puts "What's a Plan?" on its own row on mobile, and Overhaul + New Plan side by side. Desktop stays untouched.

**Bug 2 — Plan tile button congestion:**

Currently the Sun + View-on-Layout buttons sit `absolute top-2 right-2` in their own div, AND the kebab menu sits `absolute top-2 right-2` in another div — so they layer on top of each other (only the kebab is visible because it's after in the DOM and z-20 > z-10 implicit on the Sun group). On hover, the Sun group becomes opacity-100 and overlaps the kebab.

Fix: Move the Sun + View-on-Layout group to a different position — bottom of the cover image, with proper spacing from the status badge. They're action buttons relevant to the plan view, so they pair naturally with the status badge anyway.

```tsx
{/* Move Sun + Layout buttons to bottom-left of the cover */}
<div className="absolute bottom-2 left-2 z-20 flex gap-1.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
  …Sun + View-on-Layout buttons
</div>
```

This way the top-right is exclusively the kebab menu (no overlap) and the bottom-left is the secondary actions (mirroring the status badge at top-left).

---

## Risks & edge cases

- **Frequency parsing** — overhaul AI might emit freeform strings like "fortnightly" or "every other week" that the parser doesn't recognise. Fallback is 30 days. Acceptable for v1 — user can edit blueprint via existing PlanStaging editing affordances if they care.
- **Phase 1 infrastructure for overhaul** — the user said "phase 1 it's about linking it to an area or creating a new one". This is exactly what PlanStaging's Phase 1 already does. The synthesised `infrastructure_requirements.suggested_area_name` defaults to the plan title, which feels right.
- **prep_steps is strings, not objects** — adapter splits into title (first sentence) + description (full text). Sometimes prep_steps will be very short ("Clear the bed.") — title becomes the same as description, harmless.
- **Existing overhaul plan with selected concept already → cover image** — confirmed safe; the `cover_image_url` is set by `selectOverhaulConcept` on the plan row; PlanStaging reads it.
- **Existing overhaul plan with NO concept selected yet** — Pre-Start Review shows concept picker, user picks, then Accept. Works.
- **OverhaulPlanForm submit** — currently routes to `setOverhaulResultPlanId`; needs to route to `setSelectedPlan(plan)` after `fetchPlans()` so the new plan opens in PlanStaging directly.
- **Regenerate path** — uses the cached signed URL from `plan_overhaul_inputs.original_photo_url`. If expired (>7d), surface a clear error. This is acceptable v1; long-term we may want to keep the photo private but unsigned with a longer-lived URL.

---

## App-reference files to update afterwards

Per CLAUDE.md "App-reference documentation is mandatory":

- `docs/app-reference/00-INDEX.md` — add stub rows (marked `[ ]`) for:
  - Planner Dashboard surface
  - Plan Staging surface
  - Garden Overhaul flow (modal + staging integration)
- *Full new reference files for those surfaces are out of scope for this task* — they'd each take significant time and aren't directly the user's request. Flagging in the index so it shows up as TODO.

---

## Testing

Per CLAUDE.md "Tests are mandatory":

- **New unit tests** — `tests/unit/lib/overhaulBlueprintAdapter.test.ts` covering:
  - Field renames (plant_list → plant_manifest)
  - String prep_steps → object preparation_tasks with sequential deps
  - Frequency string parsing (daily/weekly/monthly/fortnightly/freeform)
  - Infrastructure synthesis (title fallback)
- **Existing E2E** — Playwright planner specs should still pass for designed plans. No new overhaul E2E in this task — would need seeded concepts + photo upload, which the seed framework doesn't model yet.
- **Manual smoke test** — open existing overhaul plan in dev, verify normalised blueprint renders Phases 1–5 correctly.

---

## Steps

1. Write `src/lib/overhaulBlueprintAdapter.ts` + Vitest tests.
2. Write `src/components/planner/OverhaulConceptPicker.tsx` (extract from OverhaulResultView).
3. Modify `src/components/PlanStaging.tsx`:
   - Import adapter + ConceptPicker
   - Branch Pre-Start Review on `isOverhaul`
   - Branch regenerate handler on `isOverhaul`
4. Modify `src/components/PlannerDashboard.tsx`:
   - Remove overhaul-result branch
   - Route overhaul-form submit through `setSelectedPlan`
   - Mobile header grid restructure
   - Move plan-tile secondary buttons to bottom-left
5. Add edge fn `regeneratePlanId` support (extends existing `generate-garden-overhaul`).
6. Delete `src/components/planner/OverhaulResultView.tsx`.
7. Update `docs/app-reference/00-INDEX.md` with planner TODO rows.
8. `npx tsc --noEmit` clean.
9. `npm run test:unit` clean.
10. Deploy via `npm run deploy --bump 1` (incremental — not a major because it's a refinement, not a brand-new feature).

---
