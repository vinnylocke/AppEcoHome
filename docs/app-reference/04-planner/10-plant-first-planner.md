# Plant-First Planner

> "Plan around my plants." The inverse of the theme/area-first New Plan Form: the gardener picks the plants they want, and AI arranges them across one or more areas — how many areas, which plants companion together (and why), plus prep + maintenance tasks per group. Regenerate with feedback until it's right, Create the plan (`kind='plant-first'`), then "Set up my garden" to materialise it.

**Route / how to reach it:** "My Plants" button on the Planner Dashboard header (`data-testid="planner-plant-first-btn"`, next to "New Plan" and "Reimagine"). Opens the `PlantFirstPlanForm` full-screen modal. A saved plant-first plan opens into `PlantFirstPlanView` (the dashboard routes `plans.kind === 'plant-first'` there instead of `PlanStaging`).
**Source files (entry points):**
- `src/components/planner/PlantFirstPlanForm.tsx` — the 3-step wizard
- `src/components/planner/PlantFirstPlanView.tsx` — read-only multi-area plan view + "Set up my garden"
- `src/services/plantFirstExecution.ts` — materialisation service (`executePlantFirstPlan`)
- `src/lib/plantFirstPlan.ts` — client-side types + `countBlueprintPlants`
- `supabase/functions/generate-plant-first-plan/index.ts` — the AI edge function
- `supabase/functions/_shared/plantFirstBlueprint.ts` — `normalisePlantFirstBlueprint` (output hardening)

---

## Quick Summary

A full-screen wizard in three steps:

1. **Pick your plants** — toggle plants from the home's Shed (de-duped by name) and/or search the library / Perenual / Verdantly / AI via the shared `PlantSearch` in `multiSelect` mode. Selected plants show as removable chips.
2. **Your plan** — optional plan name, optional free-text notes, and an **Areas mode** choice: "Use my areas + suggest new" (default), "Use my existing areas only", or "Design all-new areas".
3. **Review** — the AI's multi-area layout: project overview, per-area cards (existing/new badge, pairing summary, plants with companion notes, maintenance cadence). The gardener can **Regenerate with feedback** (which also persists as preferences) or **Create plan**.

On Generate, the form calls `supabase.functions.invoke("generate-plant-first-plan", …)`. The edge function grounds Gemini with the FULL `buildUserContext` snapshot plus the user's recent `ai_feedback`, honours the chosen `areaMode`, returns `{ blueprint, cover_image_url }`, and logs the whole context/prompt/result + cost to `ai_usage_log`. On Create, the client inserts a `plans` row with `status='Draft'`, `kind='plant-first'`, `ai_blueprint=blueprint`. Opening that plan shows `PlantFirstPlanView`; "Set up my garden" runs `executePlantFirstPlan` to create new areas, add plants to the Shed, and schedule prep + maintenance tasks.

This is a **Sage+** feature — gated client-side and re-verified server-side via `guardAiByUser` + a rate-limit entry.

---

## Role 1 — Technical Reference

### Component graph

```
PlannerDashboard (src/components/PlannerDashboard.tsx)
├── "My Plants" button (planner-plant-first-btn) → setShowPlantFirstModal(true)
├── PlantFirstPlanForm (Portal modal, when showPlantFirstModal)
│   ├── Header (step title + Back + Close)
│   ├── Step 1 — Pick plants
│   │   ├── Selected chips (plant-first-selected)
│   │   ├── "From your Shed" toggle buttons (plant-first-shed-item)
│   │   └── PlantSearch (shared, multiSelect — library / Perenual / Verdantly / AI)
│   ├── Step 2 — Name + notes + area-mode radios (plant-first-areamode-*)
│   ├── Step 3 — Review (per-area cards) + regenerate panel
│   └── Footer (Continue / Generate my plan / Create plan)
└── PlantFirstPlanView (when selectedPlan.kind === 'plant-first')
    ├── Cover image + project overview + chips (area count, plant count, difficulty)
    ├── Per-area cards (plant-first-area-card): pairing summary, plants, maintenance
    └── "Set up my garden from this plan" button (plant-first-setup) → executePlantFirstPlan
```

### Props received

**`PlantFirstPlanForm`**

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `homeId` | `string` | PlannerDashboard | Scope for Shed load, edge fn, insert |
| `userTier` | `string \| null` | PlannerDashboard (`userTier` state) | Drives the `gates` (external search + AI create) |
| `isOpen` | `boolean` | PlannerDashboard (`showPlantFirstModal`) | Mount/visibility; resets wizard state on open |
| `onClose` | `() => void` | PlannerDashboard | Hide modal |
| `onCreated` | `(planRow) => void` | PlannerDashboard | Close, refetch plans, open the new plan in `PlantFirstPlanView` |

**`PlantFirstPlanView`**

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `plan` | `{ id, name, status, cover_image_url?, ai_blueprint }` | PlannerDashboard (`selectedPlan`) | The saved plant-first plan |
| `homeId` | `string` | PlannerDashboard | Scope for materialisation |
| `onBack` | `() => void` | PlannerDashboard | Clear selection + refetch |

### State (local)

`PlantFirstPlanForm`:

| State | Holds | Written by |
|-------|-------|-----------|
| `step` | 1 / 2 / 3 | Continue / Back / Generate success |
| `shed` | `{ id, name }[]` de-duped Shed plants | Mount effect (loads `inventory_items`) |
| `selected` | `PfpSelectedPlant[]` | Shed toggles + search toggles |
| `planName`, `notes` | Step-2 inputs | Inputs |
| `areaMode` | `"existing_plus_new" \| "existing" \| "new"` | Area-mode radios (default `existing_plus_new`) |
| `blueprint` | `PlantFirstBlueprint \| null` | Edge fn response |
| `coverUrl` | `string \| null` | Edge fn response |
| `generating`, `creating` | In-flight flags | generate() / create() |
| `showRegen`, `regenFeedback` | Regenerate panel | Step-3 regenerate UI |

`PlantFirstPlanView`: `busy` (setup in flight), `done` (true when `plan.status` is `In Progress`/`Completed`, or after a successful setup).

### Data flow — read paths

**Shed load (mount).** `supabase.from("inventory_items").select("id, plant_name").eq("home_id", homeId)` — de-duped by lower-cased `plant_name` into the `shed` chip list. RLS: home-scoped (`inventory_items` policies). No caching beyond component state.

**Plant search.** Delegated to the shared `PlantSearch` (`multiSelect`) — covers in-app library, Perenual, Verdantly, and AI per the `gates` object. External providers gated on `botanist/sage/evergreen`; see [Plant Providers](../99-cross-cutting/25-plant-providers.md).

### Data flow — write paths

**Generate / Regenerate (`generate(regen)`).**
- **Triggered by:** "Generate my plan" (step 2) or "Regenerate" (step 3 feedback panel).
- **Calls:** `supabase.functions.invoke("generate-plant-first-plan", { body })`.
- **Input shape:**
  ```ts
  {
    homeId: string,
    plants: { name, scientific_name|null, source, inventory_item_id|null }[],
    notes: string,
    areaMode: "existing" | "existing_plus_new" | "new",
    // regenerate only:
    isRegeneration?: true, feedback?: string, previousBlueprint?: PlantFirstBlueprint
  }
  ```
- **Output shape:** `{ blueprint: PlantFirstBlueprint, cover_image_url: string }`.
- **Side effects (server):** logs to `ai_usage_log`; mines `notes` (or rejection `feedback`) into `planner_preferences`. No DB writes to `plans` yet.
- **Optimistic UI:** none — toast `loading → success/error`; on success sets `blueprint` + advances to step 3.

**Create (`create()`).**
- **Triggered by:** "Create plan" (step 3).
- **Input shape:**
  ```ts
  supabase.from("plans").insert({
    home_id, name: planName || blueprint.project_overview.title,
    description: blueprint.project_overview.summary,
    status: "Draft", kind: "plant-first",
    ai_blueprint: blueprint, cover_image_url: coverUrl,
  }).select("*").single()
  ```
- **Side effects:** inserts one `plans` row. `onCreated(planRow)` closes the modal, refetches, and opens the plan in `PlantFirstPlanView`.
- **Offline behaviour:** none (not queued).
- **Error path:** toast on failure (`Logger.error` + `toast.error`).

**Set up (`executePlantFirstPlan`, `src/services/plantFirstExecution.ts`).** Looped per blueprint area:
- Resolves the area: reuse `existing_area_id`, else insert a new `areas` row (name + suggested sunlight/medium) hung off the home's first `locations` row.
- Adds the group's plants to the Shed via `saveToShed` (de-duped by lower-cased `common_name` so re-runs reuse existing `plants` rows; `source='ai'`); inserts `inventory_items` rows (`status='Unplanted'`, quantity clamped 1–99).
- Inserts one-off **prep tasks** into `tasks` (staggered +1 day each, `type='Maintenance'`, `plan_id` set).
- Inserts recurring **maintenance blueprints** into `task_blueprints` (`is_recurring`, `is_auto_generated`, `frequency_days`, `plan_id` set).
- Finally `update plans.status = 'In Progress'`. Idempotency is best-effort (catalogue de-dupe by name; a plant that won't resolve is skipped, never breaks the plan).
- Returns `{ areasCreated, plantsAdded, prepTasksAdded, maintenanceBlueprintsAdded }` for the success toast.

### Edge functions invoked

| Function | When | Input | Output | Downstream |
|----------|------|-------|--------|-----------|
| `generate-plant-first-plan` | Generate / Regenerate | see Input shape above | `{ blueprint, cover_image_url }` | `ai_usage_log` insert; `planner_preferences` upsert; cover image → `guide-images` bucket |

**Edge fn flow (`generate-plant-first-plan`).**
```
POST { homeId, plants[], notes, areaMode, isRegeneration?, feedback?, previousBlueprint? }
  → requireHomeMembership() → guardAiByUser() → enforceRateLimit()
  → buildUserContext(serviceDb, { userId, homeId })   // identity, location, garden, preferences, behaviour, weather
  → buildFeedbackBlock()  // last 20 ai_feedback rows (👍/👎 + comments)
  → existingAreasBlock (area ids + light/medium) — only when areaMode ≠ "new"
  → effectiveMode: "existing" with no areas → falls back to "new"
  → callGeminiCascade(..., { responseSchema: PFP_SCHEMA, temperature: 0.4, maxOutputTokens: 3000 })
  → normalisePlantFirstBlueprint(JSON.parse(rawText))  // _shared/plantFirstBlueprint.ts
  → logAiUsage(serviceDb, { functionName, action: plant_first_plan | regenerate_plant_first_plan, usage, contextBlock, prompt, rawResult })
  → extractPreferencesFromFeedback(notes | feedback) → savePreferences() (planner_preferences)
  → cover image (best-effort, free via image.pollinations.ai → guide-images bucket; Unsplash fallback)
  → 200 { blueprint, cover_image_url }
```

The output schema (`PFP_SCHEMA`) is structured-output-constrained; `normalisePlantFirstBlueprint` then caps areas (max 6), drops plant-less areas, clamps quantities (1–99) and `frequency_days` (1–365), coerces missing fields, and derives `is_new` from whether `existing_area_id` was set.

### Cron / scheduled jobs that affect this surface

None. The materialised `task_blueprints` are subsequently picked up by the normal ghost-task generation (`TaskEngine.fetchTasksWithGhosts`), but no cron is specific to this surface.

### Realtime channels

None directly. After Create / Set up, PlannerDashboard refetches plans; the home realtime subscription that drives the dashboard will reflect downstream task/inventory writes.

### Tier gating

**Sage+ only.** Client gates in two places:
- PlannerDashboard: `hasOverhaulAccess = userTier ∈ {sage, evergreen}` drives the "Sage+" badge on the button.
- `PlantFirstPlanForm.gates`: `canSearchExternal` = `botanist/sage/evergreen` (external plant search), `canCreateWithAI` = `sage/evergreen` (AI generation).

Server re-verifies via `guardAiByUser` (returns 403 for non-AI tiers) plus a per-function rate-limit entry (`enforceRateLimit(supabase, userId, "generate-plant-first-plan")`). Sprout / Botanist cannot generate.

### Beta gating

None.

### Permissions / role-based UI

The "My Plants" button (like "New Plan" / "Reimagine") is wrapped in `can("plans.create")` — members without plan-create permission don't see it. See [RLS Patterns](../99-cross-cutting/19-rls-patterns.md).

### Error states

| State | Result |
|-------|--------|
| No plants selected | "Continue" disabled on step 1 |
| Edge fn error / `data.error` | `toast.error` with the message; stays on current step |
| Tier insufficient (server) | 403 from `guardAiByUser` → toast |
| Rate limit hit | 429 from `enforceRateLimit` → toast |
| Create insert fails | toast; AI blueprint kept in state (user can retry Create) |
| Set up partial failure | individual plants that won't resolve are skipped; the run never throws on a single bad plant; a total failure shows "Couldn't set up the plan." |

### Performance notes

- Single Gemini call per generate/regenerate (`callGeminiCascade`, `maxOutputTokens: 3000`).
- Cover image is best-effort and non-blocking-on-failure (falls back to a fixed Unsplash URL).
- Modal renders via `createPortal`; wizard state fully resets on open.
- `executePlantFirstPlan` issues sequential per-area writes — fine for the ≤6-area cap.

### Linked storage buckets

- `guide-images` — the free pollinations cover image is uploaded here (public URL stored on `plans.cover_image_url`).

---

## Role 2 — Expert Gardener's Guide

### Why open this screen

The standard New Plan Form starts from a *space* — "I have this bed, what should go in it?". The Plant-First Planner starts from the *plants* — "I know I want tomatoes, basil, marigolds, lavender and some strawberries; now tell me how to lay them out." That's how a lot of real gardening decisions actually begin: you fall for a plant at the nursery, or you've got a wishlist, and the hard part is arranging them sensibly.

For **Sarah** (amateur), this removes the paralysis of "which goes with which?" — she picks the plants she likes and gets a tidy multi-area plan that keeps good companions together and warns about clashes, with a watering/feeding cadence she can actually follow.

For **Marcus** (expert), it's a fast companion-planting and bed-allocation pass grounded in his real garden — his areas, their light and medium, his climate and season, and even what he's thumbed up/down on past AI suggestions. He can regenerate with a pointed note ("keep the brassicas away from the strawberries; consolidate to two beds") and it learns from it.

The payoff is the one-tap "Set up my garden": the plan stops being advice and becomes real areas, real Shed entries, and real scheduled tasks.

### Every flow on this page

#### Step 1 — Pick your plants
1. **See** your Shed plants as toggle chips, plus a search box.
2. **Tap** Shed chips to include them; **search** the library / databases / AI and tap results to add. Selected plants appear as removable chips at the top.
3. **Next:** "Continue (N)" enables once you've picked at least one.
4. **Why it matters:** these are the only plants the AI will use — it won't add species you didn't choose.
5. **Beginner:** "pick what you fancy." **Expert:** "assemble the palette; the AI does allocation, not selection."

#### Step 2 — Your plan
1. **Optional name** and **notes** ("a sunny patio and a shady corner; low maintenance").
2. **Areas mode** — the key decision:
   - *Use my areas + suggest new* (default): fit your existing beds where they work, propose new ones only when nothing fits.
   - *Use my existing areas only*: spread everything across beds you already have.
   - *Design all-new areas*: ignore current areas and plan from scratch around the plants.
3. **Generate my plan** kicks off the AI.
4. **Why it matters:** the mode decides whether the plan slots into your current garden or designs a fresh layout.

#### Step 3 — Review
1. **See** the project overview and a card per area: an Existing/New badge, a pairing summary (why these plants are together), each plant with quantity + role + a companion note, and the maintenance cadence.
2. **Regenerate with feedback** — tell it what to change; it re-plans and your note is also saved as a lasting preference.
3. **Create plan** saves it. You land on the plan view.

#### The saved plan view + "Set up my garden"
1. **See** the same multi-area layout as a permanent plan, with cover image and summary chips (area count, plant count, difficulty).
2. **"Set up my garden from this plan"** creates any new areas, adds every plant to your Shed (as Unplanted), and schedules the prep + recurring maintenance tasks. A toast confirms the counts; the button flips to "Set up in your garden".

### Information on display — what every field means

- **Existing / New badge** — whether the area is one of yours (matched by id) or a fresh one the AI proposes (with suggested light + medium).
- **Pairing summary** — the rationale for grouping these plants (light/medium/water match + companion benefits).
- **Plant line** — `Name ×quantity · role`, with a **companion note** explaining its job in the group (e.g. "marigold deters whitefly near the tomatoes").
- **Maintenance: … (every Nd)** — the recurring care cadence in days; these become `task_blueprints` on setup.
- **Difficulty chip** — the AI's overall effort estimate for the plan.
- **Area count / plants count chips** — quick totals for the whole plan.

### Tier-by-tier experience

| Tier | Experience |
|------|-----------|
| Sprout | "My Plants" shows a Sage+ hint; cannot generate. External plant search unavailable. |
| Botanist | Same Sage+ gate on AI generation; external plant search is available (Perenual/Verdantly) but the plan itself can't be generated. |
| Sage / Evergreen | Full flow — pick, generate, regenerate, create, set up. |

### New user vs returning user vs power user

- **Brand new (no plants, no areas):** can still pick plants by search and choose "Design all-new areas" — setup will create the areas off the home's first location. With no existing areas, "Use my existing areas only" automatically falls back to all-new server-side.
- **Returning user:** mixes a few Shed favourites with a couple of searched additions; "Use my areas + suggest new" is the sweet spot.
- **Power user:** leans on regenerate-with-feedback to enforce their own companion rules and bed consolidation; the plan is grounded in their real areas and past feedback, so the suggestions stay on-brand.

### Beta user experience

No beta-only behaviour.

### Common mistakes / pitfalls

- **Expecting it to add plants you didn't pick.** It only arranges your selection — add anything you want considered in step 1.
- **Choosing "existing areas only" with no areas.** It quietly falls back to all-new — that's expected, not a bug.
- **Treating Create as "done".** Create saves the plan; you still need "Set up my garden" to make areas/plants/tasks real.
- **Re-running setup expecting a fresh garden.** Setup is idempotent-ish — plants de-dupe by name, so re-running won't duplicate Shed entries, but it isn't a "redo from scratch".

### Recommended workflows

- **Wishlist → plan:** search-add your wishlist, pick "Use my areas + suggest new", generate, tweak with one regenerate, Create, Set up.
- **Tighten the layout:** if the first pass splits plants across too many beds, regenerate with "consolidate to two beds, keep herbs together" — the note also tunes future plans.
- **Plan before you buy:** generate with all-new areas to see how many beds your wishlist needs before committing.

### What to do if something looks wrong

- **Generation fails:** retry — most failures are transient AI quota issues. If it persists, check your tier reads as Sage/Evergreen.
- **Plan ignored your existing beds:** you were probably in "Design all-new areas" — regenerate in "Use my existing areas only" / "+ suggest new".
- **Setup added fewer plants than expected:** any plant that couldn't be resolved to a catalogue row is skipped (the run continues) — re-add it manually from the Shed if needed.

---

## Related reference files

- [Planner Dashboard](./01-planner-dashboard.md) — host surface, button + plan-card routing
- [New Plan Form](./04-new-plan-form.md) — the theme/area-first counterpart
- [Plan Staging](./02-plan-staging.md) — the `kind='designed'`/`'overhaul'` execution path (plant-first uses its own view instead)
- [Garden Overhaul](./09-garden-overhaul.md) — sibling Sage+ AI planner (photo-based)
- [Companion Plants tab](../08-modals-and-overlays/11-companion-plants-tab.md) — companion pairing logic
- [Data Model — Plans](../99-cross-cutting/05-data-model-plans.md) — `plans.kind` + `ai_blueprint.areas[]` shape
- [AI — Gemini](../99-cross-cutting/13-ai-gemini.md) — `callGeminiCascade`, structured output, `logAiUsage`
- [Tier Gating](../99-cross-cutting/17-tier-gating.md) — Sage+ gate
- [Edge Functions Catalogue](../99-cross-cutting/10-edge-functions-catalogue.md)
- [Plant Providers](../99-cross-cutting/25-plant-providers.md) — the shared `PlantSearch` providers

## Code references for ongoing maintenance

- `src/components/PlannerDashboard.tsx` — "My Plants" button, `showPlantFirstModal`, `kind='plant-first'` routing to `PlantFirstPlanView`
- `src/components/planner/PlantFirstPlanForm.tsx` — the wizard
- `src/components/planner/PlantFirstPlanView.tsx` — read-only view + "Set up my garden"
- `src/services/plantFirstExecution.ts` — `executePlantFirstPlan` (materialisation, reuses `saveToShed`)
- `src/lib/plantFirstPlan.ts` — client types + `countBlueprintPlants` (unit-tested in `tests/unit/lib/plantFirstPlan.test.ts`)
- `supabase/functions/generate-plant-first-plan/index.ts` — edge fn (context grounding, area modes, regeneration, `logAiUsage`, preference mining)
- `supabase/functions/_shared/plantFirstBlueprint.ts` — `normalisePlantFirstBlueprint` (Deno-tested in `supabase/tests/plantFirstBlueprint.test.ts`)
- `supabase/functions/_shared/userContext.ts` — `buildUserContext` / `renderContextBlock`
- `supabase/functions/_shared/preferences.ts` — `extractPreferencesFromFeedback` / `savePreferences`
- `supabase/migrations/20260818000000_plans_kind_plant_first.sql` — `plans.kind += 'plant-first'`
