# Tools Hub

> A grouped tile launcher for every Rhozly tool — plus a Connect Hardware CTA and pre-baked multi-step workflows for common jobs.

**Route:** `/tools`
**Source file:** `src/components/ToolsHub.tsx`

---

## Quick Summary

Four sections of tool tiles (Plan & Design, Measure & Track, Review & Plan Ahead, Diagnose & Learn) plus a dedicated Connect Hardware card (links to Integrations) plus three Workflow recipes (Plan a new bed / A plant looks unwell / Just bought a new plant). Every tile is a navigate-on-tap shortcut.

Pure layout — no fetches, no state, no auth gating. Tools that themselves require AI tiers paywall on the destination, not here.

---

## Role 1 — Technical Reference

### Component graph

```
ToolsHub
├── Heading + subtitle
├── Tool groups
│   ├── Plan & Design (Garden Layout, Plant Visualiser)
│   ├── Measure & Track (Light Sensor, Sun Tracker)
│   ├── Review & Plan Ahead (Garden Reports, Weekly Overview — 2026-07-23 IA reorg)
│   └── Diagnose & Learn (Plant Doctor, Guides — the Ailments tile was removed 2026-07-22)
├── Connect Hardware card → /integrations
└── Workflows (3 multi-step recipes)
```

### Static data (lives in this file)

#### `GROUPS`

```ts
[
  { id: "plan",     label: "Plan & Design",      tools: [{ id: "garden-layout",   path: "/garden-layout"  }, { id: "plant-visualiser", path: "/visualiser" }] },
  { id: "measure",  label: "Measure & Track",    tools: [{ id: "light-sensor",    path: "/lightsensor"    }, { id: "sun-tracker",      path: "/sun-trajectory" }] },
  { id: "review",   label: "Review & Plan Ahead", tools: [{ id: "garden-reports", path: "/reports"        }, { id: "weekly-overview", path: "/weekly" }] },
  { id: "diagnose", label: "Diagnose & Learn",    tools: [{ id: "plant-doctor",   path: "/doctor"         }, { id: "guides",          path: "/guides" }] }, // the ailment-library tile was removed 2026-07-22 — the Garden Hub's Ailments tab is the one ailment surface
]
```

**2026-07-23 IA reorg — new "Review & Plan Ahead" group** (`data-testid="tools-group-review"`): Garden Reports moved here from "Measure & Track" (it's a review of the past, not a live measurement — `tools-hub-garden-reports`), and Weekly Overview finally got a tile (`tools-hub-weekly-overview`) — the `/weekly` route was already in the [sidebar's Tools `matchPaths`](../09-persistent-ui/02-sidebar.md) but previously had no tile here, only reachable via the dashboard Week Ahead card + the Sunday push. Both tiles are ungated at the tile level; the `/weekly` route itself adapts its content to `aiEnabled` internally (AI-grounded tips for Sage+, deterministic content below). The Diagnose & Learn tool's `id` is `plant-doctor` (`data-testid="tools-hub-plant-doctor"`) — not `garden-ai`.

#### `WORKFLOWS`

```ts
[
  { id: "new-bed",     label: "Plan a new bed",            steps: [...4 steps...] },
  { id: "sick-plant",  label: "A plant looks unwell",      steps: [...3 steps...] },
  { id: "first-plant", label: "Just bought a new plant",   steps: [...4 steps...] },
]
```

### Data flow

None. Pure React + react-router navigation.

### Edge functions invoked

None.

### Cron / scheduled jobs

None.

### Realtime channels

None.

### Tier gating

None at this surface — every tile is visible to every tier. Destination screens enforce their own gating.

### Beta gating

None.

### Permissions

None at this surface — destinations enforce.

### Error states

None.

### Performance

Pure render — zero network.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why open this screen

When you don't know what tool you need yet but have a problem to solve, this is the navigator. The grouping (Plan / Measure / Review / Diagnose) maps to gardener intent. The Workflows section bundles tools into step-by-step recipes for jobs that span multiple screens.

### Every flow on this screen

#### 1. Tap a tool tile

- Navigates to the tool. That's it.

#### 2. Workflow recipes

- Each workflow is a numbered list of steps with deep links.
- Tap any step to jump straight into it.
- No state persisted between steps — it's a checklist for *you*, not the app.

#### 3. Connect Hardware

- Highlighted sky-tinted card linking to Integrations.
- Promoted because the integration step is the highest-impact + least-discovered upgrade for serious gardeners. It's a deliberate exception to the grouped-tile pattern — a first-run-style CTA outside the four `GROUPS`, not itself a group.

### Information on display — what every field means

| Element | Meaning |
|---------|---------|
| Group header | Intent category (Plan / Measure / Review / Diagnose) |
| Tool tile | Icon + name + one-line description |
| Workflow card | Pre-baked multi-step recipe |

### Tier-by-tier experience

| Tier | Differences |
|------|-------------|
| Every tier | Same Hub. Tier-gated tools (Plant Doctor, advanced Visualiser) paywall on the destination screen, not here. |

### New user vs returning user

- **New user:** the Workflows section is the most useful — "Just bought a new plant" walks them through Shed → Sun Tracker → Light Sensor → Schedule in one tap-by-tap flow.
- **Returning user:** direct tile taps are faster.

### Common mistakes / pitfalls

- **Looking for the Schedule tool here.** Schedule isn't a "tool" — it's primary navigation. Sidebar.
- **Expecting workflows to track progress.** They're navigational shortcuts, not state machines. Each step is independent.

### Recommended workflows

- **First visit:** scan the groups to understand the toolset.
- **Repeat visits:** muscle memory wins — most users go straight to the sidebar after week one.

### What to do if something looks wrong

- **Tile navigation broken:** check the route exists in `App.tsx`. The static config in this file must match `/<route>`.
- **Workflow step 404s:** the deep-link path may have changed in routing. Update `WORKFLOWS` constant.

---

## Related reference files

- [Garden Layout List](../03-garden-hub/05-garden-layout-list.md)
- [Plant Visualiser](./05-plant-visualiser.md)
- [Light Sensor](../03-garden-hub/09-light-sensor.md)
- [Sun Tracker AR](../03-garden-hub/08-sun-tracker-ar.md)
- [Garden Reports](./11-garden-reports.md)
- [Weekly Overview Page](../02-dashboard/15-weekly-overview.md)
- [Plant Doctor](./02-plant-doctor.md)
- [Guides List](./07-guides-list.md)
- [Integrations — Devices Tab](../07-management/05-integrations-devices.md)
- [Sidebar Navigation](../09-persistent-ui/02-sidebar.md) — Tools `matchPaths` include `/reports` and `/weekly`

## Code references for ongoing maintenance

- `src/components/ToolsHub.tsx` — entire screen (single file)
- `src/constants/icons.tsx` — icon components


> **Removed (2026-07-22):** the "Ailments" tile is gone — since Hub v3 the Garden Hub's Ailments tab IS the field guide, so the Tools copy was a pure nav duplicate. The "Something looks wrong" workflow card still deep-links to the Watchlist as a guided step.
