# Planner Dashboard

> The home for Plans — multi-step garden projects like "Spring Veggie Bed 2026" or "Front Path Makeover". Lists plans grouped by Pending / Completed / Archived, with per-plan counts of tasks and blueprints. Tap a plan → Plan Staging engine.

**Route:** `/planner` (default tab of PlannerHub)
**Source files:**
- `src/components/PlannerHub.tsx` — Planner + Shopping tabs wrapper
- `src/components/PlannerDashboard.tsx` — this view

---

## Quick Summary

A list of `plans` rows for the current home, tabbed by status. Each card shows the plan name, contents preview (X plants · Y tasks · Z notes), status badge, and a kebab menu (Archive / Unarchive / Delete). Plus button at the top opens `NewPlanForm`. Tapping a plan card opens `PlanStaging` — the phase-by-phase execution view.

PlannerHub is the parent wrapper that adds a Shopping Lists tab alongside Planner — the URL `?tab=shopping` switches without re-mounting the page.

---

## Role 1 — Technical Reference

### Component graph

```
PlannerHub
├── Tab bar (Planner / Shopping)
└── Active tab content
    ├── PlannerDashboard (this file)
    └── ShoppingLists

PlannerDashboard
├── Header (title, "What's a Plan?" link, split "New Plan" CTA)
│   └── Create split button (Phase 4.6)
│       ├── Primary "New Plan" (data-testid="planner-new-plan-btn") → NewPlanForm
│       └── Caret (data-testid="planner-create-menu-btn", aria-label="More plan types",
│           aria-haspopup="menu") → create menu (role="menu", data-testid="planner-create-menu")
│           ├── "Reimagine" (data-testid="planner-overhaul-btn") → OverhaulPlanForm — Sage+ pill when locked
│           └── "My Plants" (data-testid="planner-plant-first-btn") → PlantFirstPlanForm — Sage+ pill when locked
├── Tab bar (Active / Completed / Archived) with badges
├── AssistantCard (top of Active tab)
├── Plan list (data-testid="planner-plan-list")
│   └── Plan card (rounded-3xl)
│       ├── Cover (h-40) — one of:
│       │   ├── cover_image_url photo
│       │   ├── overhaul states (Failed / Generating / Pick a concept)
│       │   └── kind-tinted gradient fallback (Phase 4.6):
│       │       ├── plant-first → emerald→teal gradient + Sprout icon
│       │       └── else → brand-primary gradient + IconPlanner
│       ├── Status badge (Draft / In Progress / Completed / Archived)
│       ├── Sun / View-on-Layout quick actions (bottom-left, hover-reveal)
│       ├── Name + description
│       ├── Contents preview (counts)
│       ├── Phase-progress bar (data-testid="plan-phase-progress-{id}", Phase 4.6) —
│       │   suppressed for Completed / Archived and plant-first
│       ├── Card-level inline feedback (saved/error)
│       └── Kebab menu (portal-rendered)
├── NewPlanForm modal (?open=new-plan or primary button)
├── OverhaulPlanForm modal ("Reimagine" — Sage+ photo→AI redesign)
├── PlantFirstPlanForm modal ("My Plants" — Sage+ pick-plants→AI arrange)
├── PlanStaging / PlantFirstPlanView (opened when selectedPlan set)
├── Confirm modal (delete / archive / unarchive)
└── Plan explainer modal ("What's a Plan?")
```

**Create split button (Phase 4.6).** Consolidates what were three competing top-level CTAs into one primary + a dropdown. The whole cluster is gated by `can("plans.create")`. The primary `planner-new-plan-btn` opens the standard `NewPlanForm`; the caret `planner-create-menu-btn` toggles `createMenuOpen`, rendering a `role="menu"` (`planner-create-menu`) with two AI Sage+ modes — **Reimagine** (`planner-overhaul-btn` → `OverhaulPlanForm`) and **My Plants** (`planner-plant-first-btn` → `PlantFirstPlanForm`). Each menu item shows a "Sage+" pill when `!hasOverhaulAccess` (`userTier` is not `sage`/`evergreen`). The three original test IDs are preserved on their triggers so the planner tour and any tests keep resolving.

**Card cover states.** The `h-40` cover resolves in priority order: a `cover_image_url` photo → overhaul-specific states (Failed / Generating overhaul… / Pick a concept) → a **kind-tinted gradient fallback** (Phase 4.6). The fallback replaces the old flat-grey `IconPlanner`: `plant-first` plans render an emerald→teal gradient with a `Sprout` icon; every other kind renders a brand-primary gradient with `IconPlanner`, so a photoless plan still reads as a designed thing.

**Phase-progress bar (Phase 4.6).** `planPhaseProgress(plan)` computes how many of PlanStaging's 5 phases are done (linked area · plants linked · plants assigned · status In Progress/Completed · maintenance active) — it mirrors `PlanStaging.tsx`'s per-phase predicates and must be kept in sync with them. It returns `null` for `plant-first` plans (which use `PlantFirstPlanView`, not staging), so the card suppresses the bar. The bar (`plan-phase-progress-{id}`) is also suppressed for Completed/Archived plans; otherwise it shows "Phase N of 5 · X/5 done" over a fill bar.

**Radius.** Cards and skeletons normalised `rounded-[2.5rem]` → `rounded-3xl` (Phase 4.6, 3 sites).

### Props

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `homeId` | `string` | App.tsx | Scope |
| `aiEnabled` | `boolean` | App.tsx (profile flag) | AssistantCard gating |

### Local state

| State | Purpose |
|-------|---------|
| `plans`, `planCounts` | DB rows + per-plan tasks/blueprints counts |
| `loading`, `fetchError` | Initial fetch state |
| `activeTab` | "Pending" / "Completed" / "Archived" |
| `showNewPlanModal`, `showPlanExplainer` | Modal visibility |
| `showOverhaulModal`, `showPlantFirstModal` | The two AI Sage+ create-mode modals (Reimagine / My Plants) |
| `createMenuOpen` | Split-button caret dropdown open/closed (Phase 4.6) |
| `userTier` | Subscription tier — `hasOverhaulAccess = "sage" \| "evergreen"` drives the Sage+ pills |
| `selectedPlan` | Drills into PlanStaging (or PlantFirstPlanView for `kind='plant-first'`) when set |
| `openMenuId` | Per-card kebab portal anchor |
| `confirmState` | Active confirm modal (type + plan) |
| `isProcessingAction` | Action in flight |
| `deleteAssociatedTasks` | Checkbox in delete confirm |
| `cardStatus` | Per-card success/error inline feedback |

### Data flow — read paths

Triple parallel fetch:

```ts
Promise.all([
  supabase.from("plans").select("*").eq("home_id", homeId).order("created_at", desc),
  supabase.from("tasks").select("plan_id").eq("home_id", homeId).not("plan_id", "is", null),
  supabase.from("task_blueprints").select("plan_id").eq("home_id", homeId).not("plan_id", "is", null),
]);
```

Tasks + blueprints results are reduced into `planCounts: Record<plan_id, { tasks, blueprints }>`.

### Realtime channels

`useHomeRealtime("plans", fetchPlans)` — re-fetches when any `plans` row changes for this home (multi-user / multi-device sync).

### Data flow — write paths

#### Delete plan
- If `deleteAssociatedTasks` is true: delete all `tasks` and `task_blueprints` with this `plan_id`.
- Else: NULL the `plan_id` on those rows.
- Delete the `plans` row.
- `logEvent(EVENT.PLAN_DELETED, ...)`.

#### Archive / Unarchive
```ts
supabase.from("plans").update({ status: type === "archive" ? "Archived" : "Draft" }).eq("id", plan.id);
```
- `logEvent(EVENT.PLAN_ARCHIVED / PLAN_RESTORED)`.
- Per-card inline `success` feedback for 3 s.

### URL state

- `?open=new-plan` — auto-opens the create modal (used by the Quick Add menu **and** the Plant Doctor chat's plan-suggestion CTA).
- Once handled, the search param is removed.
- When `?open=new-plan` fires, the dashboard also checks `sessionStorage` via `plannerPrefill.ts` for a pending hand-off payload (`{ name, description }`). If present, the values are passed into `NewPlanForm` as `initialName` / `initialDescription` and sessionStorage is cleared. This is how the chat hands a "Sunny Veg Patch 2026" plan over to the dashboard without putting long descriptions in the URL.

### Edge functions invoked

None — pure DB CRUD. AI suggestions inside PlanStaging are a different surface.

### Cron / scheduled jobs that affect this surface

| Cron | Effect |
|------|--------|
| `generate-tasks` | If a plan's blueprints fire → task counts update |

### Tier gating

| Feature | Tier |
|---------|------|
| Planner + standard "New Plan" | Every tier |
| Reimagine (Overhaul) create mode | Sage / Evergreen — menu item always visible with a "Sage+" pill when locked; the modal re-verifies access |
| My Plants (plant-first) create mode | Sage / Evergreen — same "Sage+" pill treatment; `generate-plant-first-plan` re-verifies server-side |
| AssistantCard | Sage / Evergreen (rendered but conditionally hides) |

### Beta gating

None.

### Permissions

- `can("plans.create")` — gates the whole create split button (primary "New Plan", the caret, and both Sage+ modes) plus the "Create your first Plan" empty-state CTA. Viewers without it see no create controls. (Kebab archive/delete actions render regardless and rely on RLS to enforce write access.)

### Error states

| State | Result |
|-------|--------|
| Fetch fails | `fetchError = true` → retry banner |
| Action fails | Inline `error` chip on the card for 3 s |
| Delete fails | Toast + leaves card in place |

### Performance

- Single `Promise.all` of 3 queries.
- Realtime subscription cleans up on unmount.
- Kebab menu uses `createPortal` to avoid clipping inside scrollable card.
- Card-level inline feedback expires after 3 s automatically.

### Linked storage buckets

None directly — plans don't carry assets. (Reference photos are in a separate table — see [Plan Reference Photos](./03-plan-reference-photos.md).)

---

## Role 2 — Expert Gardener's Guide

### Why open this screen

A Plan is a multi-step garden project that lives across weeks or seasons — "Spring Vegetable Bed", "Front Garden Refresh", "Strawberry Tower Build". Each plan groups together the tasks, the blueprints (recurring schedules), the reference photos, and notes — so when you sit down to garden for two hours on Saturday, you know what to do next on each project rather than juggling everything in your head.

### Every flow on this screen

#### 1. Browse plans by status

- Three tabs: Pending (Draft + In Progress), Completed, Archived.
- Pending is the default — what you're actively working on.
- Tabs show badges with counts.

#### 2. Open a plan

- Tap a card → PlanStaging modal opens, showing phases / tasks / notes / reference photos.

#### 3. New plan (one primary button + a dropdown for the AI modes)

The top-right is now a single **New Plan** button with a small caret beside it:

- **New Plan** (the primary button) → the standard `NewPlanForm` wizard: name, description, optional AI generation. This is the everyday path and every tier has it.
- **The caret** opens a two-item menu of AI-powered **Sage+** modes:
  - **Reimagine** — photo → AI redesign of a space (Garden Overhaul). Upload a photo of a bed or border and the AI produces concept "after" images plus a redesign blueprint.
  - **My Plants** — pick plants you already own and the AI arranges them into a multi-area plan.
- Both AI modes carry a **Sage+** pill until you're on Sage or Evergreen; opening them on a lower tier routes you to the upgrade flow. Once created, both plans flow into the same phase staging as a regular plan (My Plants opens its own `PlantFirstPlanView`).

#### 3a. Reading a card's phase progress

- On active (Draft / In Progress) plans, a thin **phase-progress bar** sits above the footer showing "Phase N of 5 · X/5 done".
- The five phases mirror the staging flow (link an area → link plants → assign plants → start the work → maintenance running). At a glance it tells you which plans are stalled and which are nearly finished.
- The bar is hidden on Completed and Archived plans (no work left to stage) and on "My Plants" plans (they don't use the 5-phase staging engine).

#### 4. Archive

- Kebab → Archive → confirm.
- The plan moves to the Archived tab but everything inside stays.
- Useful when a project is paused but not abandoned.

#### 5. Unarchive

- Same kebab; brings the plan back to Pending as a Draft.

#### 6. Delete

- Kebab → Delete → confirm modal with a checkbox: "Also delete X tasks and Y blueprints associated with this plan" (defaulted on).
- If you uncheck: tasks survive but lose their plan attribution (they become standalone tasks).

#### 7. "What's a Plan?" link

- Header link → small explainer modal — first-run helper for users new to the concept.

### Information on display — what every field means

| Field | Meaning |
|-------|---------|
| Plan name | Free-text. Anything memorable. |
| Status | Draft (planning), In Progress (executing), Completed (done — kept as reference), Archived (paused / abandoned) |
| Contents preview | "3 plants · 5 tasks · 2 notes" — quick gauge of how much is in the plan |
| Phase-progress bar | "Phase N of 5 · X/5 done" — how far the plan has moved through the 5-phase staging flow. Shown only on Draft / In Progress plans; hidden on Completed, Archived, and "My Plants" plans |
| Cover image | Your uploaded photo if the plan has one; otherwise a **kind-tinted gradient fallback** — emerald with a sprout for "My Plants" plans, brand-green with the planner icon for everything else (so a photoless plan still looks designed, not blank grey) |
| Plan card colour | Status-tinted accent |

### Tier-by-tier experience

| Tier | Differences |
|------|-------------|
| Sprout / Botanist | Full Planner, no AssistantCard. |
| Sage / Evergreen | + AssistantCard with AI plan suggestions. |

### New user vs returning user

- **New user:** typically empty. The Getting Started checklist nudges them to add first plan after their first location.
- **Returning user:** the Pending tab is where most of their attention sits.

### Common mistakes / pitfalls

- **Creating a Plan for every task.** Plans are for multi-step *projects*, not one-off chores. A single "Water tomatoes" task should be a blueprint, not a plan.
- **Forgetting to archive completed plans.** Past plans clutter the list; archive them for cleanliness.
- **Deleting a plan + its tasks by accident.** The delete checkbox defaults to on. Uncheck if you want to keep the tasks.

### Recommended workflows

- **Project start:** create a plan, define phases in PlanStaging, attach reference photos.
- **Weekly review:** open Planner → check Pending → tap each plan → tick off completed phases.
- **Season end:** mark plans Completed; review the Completed tab to learn what worked.

### What to do if something looks wrong

- **Counts don't match:** plan_counts hasn't refetched yet. Pull-to-refresh.
- **Plan still in list after deletion:** check the toast for an error; RLS may have denied if you're a viewer.
- **Archived plans missing:** they live in the Archived tab — switch tabs.

---

## Related reference files

- [Plan Staging](./02-plan-staging.md)
- [Plan Reference Photos](./03-plan-reference-photos.md)
- [New Plan Form](./04-new-plan-form.md)
- [Blueprint Manager](./07-blueprint-manager.md)
- [Optimise Tab](./08-optimise-tab.md)
- [Plans Data Model (cross-cutting)](../99-cross-cutting/05-data-model-plans.md)

## Code references for ongoing maintenance

- `src/components/PlannerHub.tsx` — tabs wrapper
- `src/components/PlannerDashboard.tsx` — list, status tabs, kebab actions
- `src/components/NewPlanForm.tsx` — creation modal
- `src/components/PlanStaging.tsx` — drill-in
- `src/events/registry.ts` — `PLAN_DELETED / PLAN_ARCHIVED / PLAN_RESTORED`
- `src/hooks/useHomeRealtime.ts` — realtime hook
