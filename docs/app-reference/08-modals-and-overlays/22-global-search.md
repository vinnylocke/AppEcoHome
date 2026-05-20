# Global Search

> Cmd/Ctrl+K modal that searches across plants, tasks, plans, areas, guides, and ailments in one query. Supports `type:plant tomato` filter syntax. Keeps a recent searches list in localStorage.

**Source file:** `src/components/GlobalSearch.tsx`

---

## Quick Summary

Spotlight-style modal triggered from the header search icon or `Cmd/Ctrl+K`. Live-filters across six entity types as you type. Each result row links to its detail screen (e.g. plants → Plant Edit modal; tasks → Task Modal). Result groups (Plants, Tasks, Plans, Areas, Guides, Ailments) are coloured and labelled. Recent searches persist between sessions.

---

## Role 1 — Technical Reference

### Component graph

```
GlobalSearch (Portal)
├── Header search input
├── Type filter chips (Plants / Tasks / Plans / Areas / Guides / Ailments)
├── Loading state
├── Empty state
└── Result groups
    └── Result row → navigate(path)
```

### Props

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `homeId` | `string \| null` | parent | Scope |

### `ResultRow` shape

```ts
{
  id, label, sub?,
  group: "plants" | "tasks" | "plans" | "areas" | "guides" | "ailments",
  navigate: string,
}
```

### Query parser

`parseQuery("type:plant tomato")` →
```ts
{ group: "plants", keyword: "tomato", raw: "..." }
```

Supports aliases: `plant`/`plants`, `task`/`tasks`, etc.

### Data flow — read paths

Parallel queries across:
- `inventory_items` (filtered by plant_name / identifier)
- `tasks` (title)
- `plans` (name / description)
- `areas` (name)
- `guides` + `community_guides` (title / labels)
- `ailments` (name)

All scoped to `home_id` where applicable.

### Recent searches

```ts
localStorage["rhozly_global_search_recent"] // last N queries
```

### Edge functions invoked

None.

### Cron / scheduled jobs

None.

### Realtime channels

None.

### Tier gating

None.

### Beta gating

None.

### Permissions

- RLS handles per-table scoping; results respect membership.

### Error states

| State | Result |
|-------|--------|
| Empty input | Shows recent searches |
| No results | "No results for X" |
| Per-group fail | Group silently skipped |

### Performance

- Debounced input.
- Parallel queries.
- Result limit per group (5).

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why use Global Search

When you know what you're looking for and don't want to navigate. Type "tomato" → plant + tasks + ailments related to tomatoes all surface. Type "south bed" → area + plants in it.

### Every flow on this modal

#### 1. Type

- Live results stream in. Use arrow keys to focus a result; Enter to navigate.

#### 2. Filter by type

- `type:plant tomato` narrows to plants only.

#### 3. Recent

- Empty input shows recent searches — tap to re-run.

### Tier-by-tier experience

Same for every tier.

### Common mistakes / pitfalls

- **Forgetting the keyboard shortcut.** `Cmd/Ctrl+K` is faster than navigating to a tab.
- **Short queries:** "to" matches a lot — type more for narrower results.

### Recommended workflows

- **Daily:** muscle-memory `Cmd+K → type → Enter` for any cross-cutting lookup.

### What to do if something looks wrong

- **Results stale:** the modal queries fresh; if something just inserted doesn't appear, wait a moment + retry.

---

## Related reference files

- [Header / Top Bar](../09-persistent-ui/01-header.md)
- [Global Quick Add](./23-global-quick-add.md)

## Code references for ongoing maintenance

- `src/components/GlobalSearch.tsx`
- `localStorage["rhozly_global_search_recent"]`
