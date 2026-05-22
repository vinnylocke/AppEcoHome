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
├── Header (title, "What's a Plan?" link, New Plan button)
├── Tab bar (Pending / Completed / Archived) with badges
├── AssistantCard (top of Pending tab)
├── Plan list
│   └── Plan card
│       ├── Status badge (Draft / In Progress / Completed / Archived)
│       ├── Name + description
│       ├── Contents preview (counts)
│       ├── Card-level inline feedback (saved/error)
│       └── Kebab menu (portal-rendered)
├── NewPlanForm modal (?open=new-plan or button)
├── PlanStaging modal (opened when selectedPlan set)
├── Confirm modal (delete / archive / unarchive)
└── Plan explainer modal ("What's a Plan?")
```

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
| `selectedPlan` | Drills into PlanStaging when set |
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
| Planner | Every tier |
| AssistantCard | Sage / Evergreen (rendered but conditionally hides) |

### Beta gating

None.

### Permissions

- `planner.write` — gates the New Plan button + kebab actions for viewers.

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

#### 3. New plan

- Plus button → `NewPlanForm`.
- Wizard captures name, description, optional template.

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
