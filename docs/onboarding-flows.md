# Rhozly Onboarding & User Flows — Developer Guide

This document explains the complete onboarding system end to end: how flows are defined, how the database stores progress, how tours are rendered, and how to add new flows.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [File Map](#2-file-map)
3. [TypeScript Types](#3-typescript-types)
4. [The Flow Registry](#4-the-flow-registry)
5. [The Database Layer](#5-the-database-layer)
6. [Trigger Modes & Auto-Trigger](#6-trigger-modes--auto-trigger)
7. [The Help Center UI](#7-the-help-center-ui)
8. [Tour Rendering (Shepherd.js)](#8-tour-rendering-shepherdjs)
9. [The Spotlight Overlay](#9-the-spotlight-overlay)
10. [Interactive Steps (advanceOn)](#10-interactive-steps-advanceon)
11. [How to Add a New Flow](#11-how-to-add-a-new-flow)
12. [Quick Reference](#12-quick-reference)

---

## 1. System Overview

```
User navigates to a route
        │
        ▼
useAutoTrigger   ──────►  Is there an automatic flow for this route
(hook in HelpCenter)       that hasn't been seen this session and
        │                  isn't completed/dismissed in the DB?
        │ yes
        ▼
launchFlow(flowId)
        │
        ▼
ActiveFlowRunner (mounts)
        │
        ▼
useOnboardingFlow.start()
  └─ Looks up flowDef in flowRegistry
  └─ Calls buildTour() → Shepherd.Tour instance
  └─ tour.start()
        │
        ▼
Shepherd renders tooltip steps
  └─ shepherdAdapter wires: progress dots, spotlight panels, advanceOn listeners
        │
        ▼
User completes or dismisses
        │
        ▼
persistState() writes { [flowId]: "completed" | "dismissed" }
to user_profiles.onboarding_state (Supabase)
        │
        ▼
App state updated → HelpCenter re-renders with new status
```

---

## 2. File Map

```
src/onboarding/
  types.ts              TypeScript interfaces for the whole system
  flowRegistry.ts       The single source of truth for all flows
  shepherdAdapter.ts    Builds a Shepherd.Tour from a FlowDef
  shepherdTheme.css     Visual styling for Shepherd tooltips
  useOnboardingFlow.ts  Hook: start a tour + persist its outcome
  useAutoTrigger.ts     Hook: fire the right flow on route change
  HelpCenter.tsx        Root component — FAB, drawer portal, flow runner
  HelpCenterDrawer.tsx  Slide-in drawer listing all flows

supabase/migrations/
  20260516000000_add_onboarding_state.sql   Adds the JSONB column
```

---

## 3. TypeScript Types

### `OnboardingState`

```ts
type OnboardingState = Record<string, "completed" | "dismissed">
```

A flat map of `flowId → status`. Only flows that have been interacted with appear here; a missing key means "not started". Stored as a JSONB object in Postgres.

Example value in the DB:
```json
{
  "global_welcome": "completed",
  "home_setup_tips": "completed",
  "dashboard_tour": "dismissed",
  "garden_hub_tour": "not-started"
}
```

---

### `FlowDef`

The complete definition of one tour.

```ts
interface FlowDef {
  id: string;           // Unique key, also the key in OnboardingState
  order: number;        // Sort order for auto-trigger priority (lower fires first)
  trigger: "automatic" | "manual-only";
  route: string;        // "/dashboard", "/shed", etc. or "global"
  title: string;        // Shown in the Help Center drawer
  description: string;  // Subtitle in the Help Center drawer
  category: FlowCategory;
  estimated_minutes: number;
  steps: StepDef[];
}
```

**`trigger`**
- `"automatic"` — fires once automatically when the user visits the matching route (if not already completed/dismissed)
- `"manual-only"` — only appears in the Help Center drawer; never auto-fires

**`route`**
- Any React Router pathname: `"/dashboard"`, `"/shed"`, `"/management"`, etc.
- `"global"` — matches every route; used for welcome and setup flows that should fire on first login regardless of where the user lands

**`order`**
- Used when multiple flows are eligible on the same route visit. The lowest-order flow fires first.
- Fractional values (`4.5`, `4.6`) are valid and used to slot new flows between existing ones without renumbering.

---

### `StepDef`

One tooltip card within a flow.

```ts
interface StepDef {
  title: string;
  body: string;
  attachTo: {
    element: string | null;   // CSS selector for the element to point at
    on: "bottom" | "top" | "left" | "right" | null;
  };
  image?: string;             // Optional image path, shown above body text
  advanceOn?: {               // If set, tour advances when user clicks/interacts
    selector: string;         // CSS selector for the interactive element
    event: string;            // DOM event name, almost always "click"
  };
  noSpotlight?: boolean;      // If true, blur panels hidden for this step
}
```

**`attachTo.element`**
Any valid CSS selector. Always prefer `data-testid` attributes:
```
"[data-testid='dashboard-view-switcher']"
"[data-testid='shed-add-plant-btn']"
```
If `null`, the tooltip floats in the centre of the screen (good for intro/outro steps).

**`attachTo.on`**
Where Shepherd places the tooltip relative to the element. Must match `attachTo.element` — if element is `null`, on must also be `null`.

**`advanceOn`**
Makes the step interactive. The tour automatically advances when the specified DOM event fires on the selector — the user doesn't need to click "Skip →". The selector is usually the same as `attachTo.element` but doesn't have to be.

**`noSpotlight`**
Set to `true` for steps that run inside a modal or sheet. Hides the four blur panels so the modal is fully visible. Without this, the panels (z-index 9990) sit above the modal content.

---

### `FlowCategory`

```ts
type FlowCategory =
  | "Getting Started"
  | "Garden"
  | "Planning"
  | "Tools"
  | "Community";
```

Controls which section the flow appears in inside the Help Center drawer.

---

## 4. The Flow Registry

`src/onboarding/flowRegistry.ts` exports a single array:

```ts
export const flowRegistry: FlowDef[] = [ /* all flows */ ];
```

This is the **single source of truth** for every flow in the app. Adding a flow here is all that's needed to make it appear in the Help Center and eligible for auto-trigger. No database changes are required for new flows.

### Current flows (in order)

| `id` | `order` | `trigger` | `route` |
|---|---|---|---|
| `global_welcome` | 1 | automatic | global |
| `home_setup_tips` | 2 | automatic | global |
| `dashboard_tour` | 3 | automatic | /dashboard |
| `garden_hub_tour` | 4 | automatic | /shed |
| `add_manual_plant` | 4.5 | manual-only | /shed |
| `add_location_and_area` | 4.6 | manual-only | /management |
| `weather_insights_tour` | 5 | manual-only | /dashboard |
| `planner_tour` | 6 | automatic | /planner |
| `task_schedule_tour` | 7 | automatic | /schedule |
| `tools_hub_tour` | 8 | automatic | /tools |
| `plant_doctor_tour` | 9 | automatic | /doctor |
| `visualiser_tour` | 10 | automatic | /visualiser |
| `guides_tour` | 11 | automatic | /guides |
| `profile_quiz_tour` | 12 | automatic | /profile |

---

## 5. The Database Layer

### Schema

```sql
-- Migration: supabase/migrations/20260516000000_add_onboarding_state.sql
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS onboarding_state JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_user_profiles_onboarding_state
  ON public.user_profiles USING GIN (onboarding_state);
```

`onboarding_state` lives on `user_profiles` as a JSONB column — a single flat object per user, no separate table needed.

### Why JSONB?

- **No migrations for new flows.** Every new `FlowDef` you add to the registry automatically gets a slot in the JSON object at runtime. You never need to add a column per flow.
- **Cheap reads.** The whole state is fetched once when the user's profile loads and held in React state.
- **Cheap writes.** On tour complete/dismiss, one `UPDATE user_profiles SET onboarding_state = $1` call writes the entire updated object.

### How it's read

`App.tsx` fetches the user profile on login (in `refreshProfile`) and stores the `onboarding_state` object in React state. That state is passed down as a prop to `HelpCenter`.

### How it's written

`useOnboardingFlow.persistState()`:

```ts
const next = { ...onboardingState, [flowId]: value }; // "completed" | "dismissed"
onStateChange(next);                                   // update local state immediately
await supabase
  .from("user_profiles")
  .update({ onboarding_state: next })
  .eq("uid", userId);                                  // persist to DB
```

The local state is updated optimistically so the Help Center status icons reflect the change immediately. If the DB write fails, the local state is stale until the next profile refresh — acceptable for onboarding data.

### Row Level Security

`user_profiles` has RLS enabled. The `onboarding_state` column is owned by the user:
- `SELECT`: only the authenticated user can read their own row
- `UPDATE`: only the authenticated user can update their own row

No special policy is needed for the JSONB column — it inherits the row's policy.

---

## 6. Trigger Modes & Auto-Trigger

### `useAutoTrigger` hook

Located at `src/onboarding/useAutoTrigger.ts`. Called once inside `HelpCenter`.

```ts
useAutoTrigger(onboardingState, launchFlow, !!userId);
```

**What it does on every route change:**

1. After an 800 ms delay (letting route components mount), finds all `automatic` flows for the current pathname (or `"global"`) that:
   - Are not already in `onboardingState` (not completed or dismissed)
   - Have not been triggered this browser session (tracked in `sessionStorage`)
2. Sorts candidates by `order` ascending
3. Fires the first candidate

**Why `onboardingState` is read via a ref:**

The effect only re-runs when `pathname` changes, not when `onboardingState` changes. This means completing a flow does **not** immediately trigger the next one. The next flow waits until the user navigates to a new route. This gives users breathing room between tours.

```ts
// The ref pattern:
const stateRef = useRef(onboardingState);
useEffect(() => { stateRef.current = onboardingState; }, [onboardingState]);

useEffect(() => {
  // reads stateRef.current inside, NOT onboardingState directly
  // dependency array: [pathname, enabled, triggerFlow] — no onboardingState
}, [pathname, enabled, triggerFlow]);
```

**Session storage key:** `rhozly_onboarding_triggered`

Each triggered flow ID is added to this set. On a fresh page load (new browser session), all automatic flows become eligible again — but since completed/dismissed flows are stored in the DB, they won't re-fire for users who've already seen them.

---

## 7. The Help Center UI

### Component tree

```
HelpCenter (src/onboarding/HelpCenter.tsx)
  ├── ActiveFlowRunner           renders while a flow is active; null otherwise
  └── createPortal(document.body)
      ├── FAB button             bottom-right, opens drawer
      ├── Backdrop div           closes drawer on tap
      └── HelpCenterDrawer       slide-in panel
```

### `HelpCenter.tsx`

- Holds `activeFlowId` state (which flow is currently running, or null)
- `launchFlow(flowId)` sets `activeFlowId`
- `ActiveFlowRunner` mounts as a `key={activeFlowId}` component — remounts fresh for each flow
- When `ActiveFlowRunner` finishes, it calls `onDone()` which sets `activeFlowId` back to null
- Calls `useAutoTrigger` to fire automatic flows on route change

### `HelpCenterDrawer.tsx`

Shows three sections:
1. **On this page** — flows whose `route === pathname` (route-specific only, not global)
2. **Category sections** — all other flows grouped by `FlowCategory`, in `CATEGORY_ORDER`
3. **Footer** — completion counter

Each row shows:
- Status icon (✓ completed, clock dismissed, circle not started)
- Title, description, category badge, estimated time
- The entire row is a tappable button (mobile-friendly)

Searching filters by title and description across both sections.

---

## 8. Tour Rendering (Shepherd.js)

### `buildTour()` — `src/onboarding/shepherdAdapter.ts`

Takes a `FlowDef` and returns a configured `Shepherd.Tour` instance.

**For each step, it creates:**

```ts
tour.addStep({
  id: `${flowDef.id}-step-${index}`,
  title: step.title,
  text: `<img .../>  <p>${step.body}</p>`,
  attachTo: step.attachTo.element && step.attachTo.on
    ? { element: step.attachTo.element, on: step.attachTo.on }
    : undefined,
  buttons: [ /* Back, Skip/Next, Done */ ],
  when: { show() { ... }, hide() { ... } }
});
```

**Buttons:**
- First step: spacer (no Back) + Next →
- Middle steps: ← Back + Next →
- Steps with `advanceOn`: ← Back + **Skip →** (signals the expected action is clicking the element)
- Last step: ← Back + Done ✓

**`when.show()`** fires each time a step becomes visible:
1. Injects progress dots into the footer
2. Updates the spotlight (see section 9)
3. Attaches native advanceOn listener (see section 10)

**`when.hide()`** fires when a step is hidden (next/back/cancel):
1. Cleans up the advanceOn listener

**Tour lifecycle events:**
- `"start"` → `createPanels()` — adds the four blur divs to the DOM
- `"complete"` → `removePanels()` + `onComplete()` — persists "completed"
- `"cancel"` → `removePanels()` + `onCancel()` — persists "dismissed"

### CSS theme — `src/onboarding/shepherdTheme.css`

Imported globally in `src/main.tsx`. Overrides Shepherd's default styles with the Rhozly design language:
- Green gradient header (`#075737 → #2a704d`)
- Rounded card (`border-radius: 1.5rem`)
- Custom progress dots (active dot expands to a pill)
- Primary/secondary button styles
- `z-index: 9999` so the tooltip always sits above the blur panels (9990)

---

## 9. The Spotlight Overlay

When a tour is active, four `position: fixed` divs are added to `<body>`:

```
┌─────────────────────────────┐
│        TOP PANEL            │  ← backdrop-filter: blur(4px) brightness(0.82)
├──────┬──────────────┬───────┤
│ LEFT │   SPOTLIGHT  │ RIGHT │  ← target element is in the gap (no blur)
│      │  (no panel)  │       │
├──────┴──────────────┴───────┤
│       BOTTOM PANEL          │
└─────────────────────────────┘
```

Each panel has:
- `backdropFilter: "blur(4px) brightness(0.82)"`
- `pointerEvents: "none"` — clicks pass through to the app
- `transition: "left/top/width/height 0.25s ease"` — animates smoothly between steps

`updateSpotlight(selector)` in `shepherdAdapter.ts`:
1. Queries the target element with `document.querySelector(selector)`
2. Gets its `getBoundingClientRect()`
3. Positions the four panels around it with 14px padding
4. If the element isn't found (not yet in DOM), a single panel covers the whole viewport and a 350ms retry fires to reposition once React has re-rendered

**`noSpotlight: true`** on a step hides all four panels for that step. Use this for any step that runs inside a modal (the panels have z-index 9990 and would appear above modal content at lower z-indices).

---

## 10. Interactive Steps (advanceOn)

Steps with `advanceOn` progress automatically when the user performs a real action in the app.

```ts
// In flowRegistry.ts:
{
  title: "Tap Add",
  body: "Tap the green Add button to open the plant panel.",
  attachTo: { element: "[data-testid='shed-add-plant-btn']", on: "bottom" },
  advanceOn: { selector: "[data-testid='shed-add-plant-btn']", event: "click" },
}
```

**How it works under the hood:**

In `when.show()`, after a 150ms delay (allowing React to finish any pending renders):

```ts
const target = document.querySelector(selector);
target.addEventListener(event, () => tour.next(), { once: true });
```

`{ once: true }` means the listener self-removes after first fire, preventing double-advances. The listener is also cleaned up in `when.hide()` if the user clicks ← Back or Skip → before interacting.

**Timing consideration:** The 150ms delay handles the common case where the previous step's `advanceOn` opens a modal — the modal needs a render cycle before the next step's target element is in the DOM.

**Prerequisites for `advanceOn` to work:**
1. The target element must be in the DOM when the step is shown (or within 150ms)
2. The element must have the correct `data-testid` attribute
3. The click must not be stopped with `e.stopPropagation()` before bubbling to the element

---

## 11. How to Add a New Flow

### Step 1 — Add `data-testid` attributes to any elements you'll point at

```tsx
// In your component:
<button data-testid="my-feature-action-btn" onClick={...}>
  Do the thing
</button>

<div data-testid="my-feature-result-panel">
  ...
</div>
```

Every element referenced in `attachTo.element` or `advanceOn.selector` needs a stable `data-testid`.

### Step 2 — Add the flow to `flowRegistry.ts`

Open `src/onboarding/flowRegistry.ts` and add your `FlowDef` object to the array. Pick an `order` value that slots it correctly between existing flows.

```ts
{
  id: "my_feature_tour",         // unique snake_case string
  order: 8.5,                    // slots between tools_hub_tour (8) and plant_doctor_tour (9)
  trigger: "automatic",          // or "manual-only"
  route: "/my-feature",          // must match the React Router path
  title: "My New Feature",
  description: "One sentence explaining what this tour covers.",
  category: "Tools",             // "Getting Started" | "Garden" | "Planning" | "Tools" | "Community"
  estimated_minutes: 1,
  steps: [
    {
      title: "Welcome to My Feature",
      body: "Here's what this does...",
      attachTo: { element: null, on: null },  // floats in centre
    },
    {
      title: "The main action",
      body: "Tap this button to start.",
      attachTo: { element: "[data-testid='my-feature-action-btn']", on: "bottom" },
      advanceOn: {
        selector: "[data-testid='my-feature-action-btn']",
        event: "click",
      },
    },
    {
      title: "See the result",
      body: "Your result appears here.",
      attachTo: { element: "[data-testid='my-feature-result-panel']", on: "top" },
    },
    {
      title: "You're done!",
      body: "Closing message.",
      attachTo: { element: null, on: null },
    },
  ],
},
```

That's it. No database changes. No component changes. The flow will:
- Appear in the Help Center drawer under the chosen category
- Auto-trigger the first time the user visits `/my-feature` (if `trigger: "automatic"`)
- Track completion in the user's `onboarding_state` JSON

### Step 3 — If the flow runs inside a modal

Add `noSpotlight: true` to every step that runs while a modal is open:

```ts
{
  title: "Choose an option",
  body: "Select this from the modal.",
  attachTo: { element: "[data-testid='modal-option-btn']", on: "bottom" },
  advanceOn: { selector: "[data-testid='modal-option-btn']", event: "click" },
  noSpotlight: true,   // hides blur panels so the modal is fully visible
},
```

### Step 4 — Test your flow

Run the dev server and open the Help Center drawer on the target route. Your new flow appears under its category. Click it to launch. Verify:

- Each `attachTo.element` selector finds its element (the spotlight appears in the right place)
- `advanceOn` steps advance when you click the highlighted element
- The last step marks the flow as completed in the Help Center (✓ icon)
- The flow appears in the correct "On this page" section when on its route

To reset a flow for re-testing, run in the browser console:
```js
// Remove from sessionStorage so it can auto-trigger again
const raw = sessionStorage.getItem('rhozly_onboarding_triggered');
const set = raw ? new Set(JSON.parse(raw)) : new Set();
set.delete('my_feature_tour');
sessionStorage.setItem('rhozly_onboarding_triggered', JSON.stringify([...set]));
```

Or update the DB directly in Supabase Studio:
```sql
UPDATE user_profiles
SET onboarding_state = onboarding_state - 'my_feature_tour'
WHERE uid = 'your-user-id';
```

---

## 12. Quick Reference

### Step skeleton

```ts
{
  title: "Step title",
  body: "Explanation text shown in the card.",
  attachTo: { element: "[data-testid='target']", on: "bottom" },
  // ↑ or: attachTo: { element: null, on: null }  for floating
  image: "/assets/onboarding/my-image.png",   // optional
  advanceOn: { selector: "[data-testid='target']", event: "click" },  // optional
  noSpotlight: true,                           // optional, for modal steps
}
```

### Placement values for `attachTo.on`

| Value | Tooltip appears |
|---|---|
| `"bottom"` | Below the element (most common for buttons/inputs near top of viewport) |
| `"top"` | Above the element (good for elements near bottom of viewport) |
| `"left"` | Left of the element |
| `"right"` | Right of the element |
| `null` | Tooltip floats centre-screen (use when `element` is also `null`) |

### Category display order in the drawer

```
Getting Started → Garden → Planning → Tools → Community
```

### FlowDef field cheat sheet

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | ✓ | Snake_case, globally unique |
| `order` | number | ✓ | Float OK. Lower = fires first |
| `trigger` | "automatic" \| "manual-only" | ✓ | |
| `route` | string | ✓ | React Router path or "global" |
| `title` | string | ✓ | Shown in drawer |
| `description` | string | ✓ | Shown in drawer |
| `category` | FlowCategory | ✓ | Drawer grouping |
| `estimated_minutes` | number | ✓ | Shown in drawer |
| `steps` | StepDef[] | ✓ | Min 1 step |

### StepDef field cheat sheet

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | string | ✓ | Shown in green header |
| `body` | string | ✓ | Shown in white card body |
| `attachTo.element` | string \| null | ✓ | CSS selector or null |
| `attachTo.on` | "bottom"\|"top"\|"left"\|"right"\|null | ✓ | Must be null if element is null |
| `image` | string | — | Asset path, shown above body |
| `advanceOn.selector` | string | — | CSS selector for the interactive element |
| `advanceOn.event` | string | — | DOM event, usually "click" |
| `noSpotlight` | boolean | — | Set true for modal steps |
