# Shopping Lists

> A multi-list shopping tracker for everything you need to buy — plants, tools, supplies, soil amendments. Built so the same flow handles "weekly garden centre run" lists and "this plan's procurement" lists.

**Route:** `/shopping` (Planner Hub tab)
**Source files:**
- `src/components/ShoppingLists.tsx` — the screen
- `src/hooks/useShoppingLists.ts` — CRUD + realtime hook
- `src/components/shopping/ShoppingListCard.tsx` — per-list expanded card
- `src/components/shopping/AddItemSheet.tsx` — add item modal
- `src/types/shopping.ts` — TS types

---

## Quick Summary

A scrollable list of `shopping_lists` rows. Each list expands inline to show its items. Items have `item_type: "plant" | "product"` with different chips. Plant items can be batch-added to the Shed via "Add checked plants". Lists are tabbed into Active / Completed. New lists use a 3-option template picker (Blank, Starter Toolkit, Seasonal Veg Patch). Realtime: changes from other devices sync live.

---

## Role 1 — Technical Reference

### Component graph

```
ShoppingLists
├── Header (icon, title, New List button)
├── Plan suggest banner (if user has active plans)
├── Active lists section
│   └── ShoppingListCard ×N (expanded → items)
│       ├── Item rows (checkbox, name, item_type chip)
│       ├── Add Item button → AddItemSheet
│       ├── Add Checked Plants to Shed
│       ├── Rename / Delete kebab
│       └── Mark Complete button
├── Completed lists collapsible section
├── Template modal (3 options)
└── AddItemSheet (per-list)
```

### Props

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `homeId` | `string` | PlannerHub | Scope |
| `aiEnabled` | `boolean` | PlannerHub | AI suggest gate |
| `perenualEnabled` | `boolean` | PlannerHub | Plant database lookup in AddItemSheet |

### Local state

| State | Purpose |
|-------|---------|
| `expandedId` | Which list is open |
| `addItemListId` | Which list the AddItemSheet is targeting |
| `showTemplateModal`, `isCreatingFromTemplate` | New-list flow |
| `showCompleted` | Toggle for the Completed section |
| `activePlanCount` | Drives the "pull from plans" suggest banner |
| `planSuggestDismissed` (LS) | Hide the suggest banner permanently |

### Data flow — read paths (via `useShoppingLists` hook)

```ts
supabase.from("shopping_lists").select("*").eq("home_id", homeId).order("created_at", desc);
supabase.from("shopping_list_items").select("*").eq("list_id", listId).order("created_at");
```

Plus `supabase.from("plans").select("id", { count: "exact", head: true }).in("status", ["Draft","In Progress"])` for the suggest banner count.

### Realtime channels

- `useHomeRealtime("shopping_lists", fetchLists)` — list-level updates.
- `useHomeRealtime("shopping_list_items", ...)` — re-fetches items for every currently-expanded list.

### Data flow — write paths

| Operation | DB |
|-----------|----|
| Create list | `shopping_lists.insert({ home_id, name, status: "active" })` |
| Rename list | `shopping_lists.update({ name }).eq("id", id)` |
| Delete list | `shopping_lists.delete().eq("id", id)` |
| Mark complete | `shopping_lists.update({ status: "completed", completed_at: now })` |
| Reopen | `shopping_lists.update({ status: "active", completed_at: null })` |
| Add item | `shopping_list_items.insert(...)` |
| Toggle item | `shopping_list_items.update({ is_checked }).eq("id", id)` |
| Delete item | `shopping_list_items.delete().eq("id", id)` |
| Add Checked Plants to Shed | bulk `inventory_items.insert(...)` + bulk `shopping_list_items.update({ already_in_shed: true })` |

### Templates

Hardcoded in `ShoppingLists.tsx`:

| Template | Items |
|----------|-------|
| Blank List | (empty) |
| Starter Toolkit | Hand trowel, watering can, gloves, pruning shears, fertiliser, compost |
| Seasonal Veg Patch | Tomato, Courgette, Lettuce, Basil, Runner beans, Cucumber |

### Edge functions invoked

None directly. (AddItemSheet may call `verdantly-search` or Perenual when searching for plants.)

### Cron / scheduled jobs that affect this surface

None.

### Tier gating

| Feature | Tier |
|---------|------|
| Shopping lists | Every tier |
| Plant search inside AddItemSheet | Botanist+ (perenualEnabled) |
| AI Suggest items | Sage / Evergreen (planned) |

### Beta gating

Plan suggest banner is governed by a beta feedback context.

### Permissions

- `shopping.create_list` — gates New List.
- `shopping.write` — gates Add Item / Toggle / Delete.

### Error states

| State | Result |
|-------|--------|
| Fetch fails | `fetchError = true` shown in card |
| Create fails | Toast |
| Toggle fails | Toast; item state reverts on next realtime refetch |
| Add-to-Shed fails | Toast "Could not add plants to shed" |

### Performance

- Realtime keeps every device in sync.
- Items only fetched when a list is expanded.
- Hooks memoised with `useCallback` to avoid re-creating realtime subscriptions.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why open this screen

Gardening is full of "I'll get that next time I'm at the garden centre" thoughts. This screen turns those into actual shopping lists. Plants you need, tools you've broken, supplies you've run low on — all in one place, syncing across your devices, and crucially: when you buy the plants, you can tick them off and have them magically appear in your Shed inventory.

### Every flow on this screen

#### 1. New list (with template)

- "New List" → template picker: Blank / Starter Toolkit / Seasonal Veg Patch.
- Pick → list created (with template items if applicable).
- List auto-expands.

#### 2. Expand / collapse

- Tap a list to expand its items inline.
- Items lazy-load on first expand.

#### 3. Add an item

- Plus button inside an expanded list → AddItemSheet.
- Search the plant database (Botanist+) or type a custom name.
- Item type: plant or product (for the chip).

#### 4. Tick off items

- Checkbox per item. Persists immediately.
- Beta users prompted for feedback after first check (`requestFeedback("shopping_item_check")`).

#### 5. Add checked plants to Shed

- After ticking your plants on the list, hit "Add to Shed" → bulk-inserts `inventory_items` with `status: "In Shed"`.
- The items get `already_in_shed = true` so you don't duplicate.

#### 6. Mark complete

- Once everything is bought, "Mark Complete" → list moves to the Completed section.

#### 7. Reopen / Delete

- Completed list kebab → Reopen if you missed something, or Delete if no longer needed.

#### 8. Plan suggest banner

- If you have active plans, a banner suggests pulling items from a plan into a shopping list — quick procurement.

### Information on display — what every field means

| Field | Meaning |
|-------|---------|
| List title | Free-text |
| List status | `active` / `completed` |
| Item name | Free-text |
| Item type chip | 🌱 Plant vs 📦 Product |
| Already-in-shed indicator | Item has been promoted to the Shed |

### Tier-by-tier experience

| Tier | Differences |
|------|-------------|
| Sprout | Lists + manual add. |
| Botanist+ | Plant search inside AddItemSheet. |
| Sage / Evergreen | AI Suggest items (planned). |

### Common mistakes / pitfalls

- **Treating "Mark complete" as "Delete".** Completed lists stick around as a history — useful for "I ran out of fertiliser in May" patterns.
- **Adding plants but never promoting them.** The Add-to-Shed flow is the bridge. Without it, your Shed never gains the plants you bought.
- **Multiple lists for the same trip.** It's fine, but consolidating into one "March Garden Centre" list is usually cleaner.

### Recommended workflows

- **Weekly:** browse Shed → identify what's missing → add to "This Week" list.
- **Per plan:** when starting Plan Staging, generate a list from the blueprint's plants (via plan suggest).
- **Seasonal:** before each season, run Starter Toolkit template and tick off what you already own.

### What to do if something looks wrong

- **List didn't sync between devices:** check realtime — pull-to-refresh.
- **Item disappeared:** another device may have deleted it. Check Completed section.
- **Add-to-Shed didn't work:** check toast; usually RLS for viewers.

---

## Related reference files

- [Shopping List Items](./06-shopping-list-items.md)
- [Planner Dashboard](./01-planner-dashboard.md)
- [Plan Staging](./02-plan-staging.md) — plan-driven procurement
- [The Shed](../03-garden-hub/01-the-shed.md) — destination for promoted plants
- [Add Item Sheet (modal)](../08-modals-and-overlays/03-plant-source-picker.md)

## Code references for ongoing maintenance

- `src/components/ShoppingLists.tsx` — screen
- `src/hooks/useShoppingLists.ts` — CRUD + realtime
- `src/components/shopping/ShoppingListCard.tsx` — per-list card
- `src/components/shopping/AddItemSheet.tsx` — add item modal
- `src/types/shopping.ts` — TS types
- `supabase/migrations/*_shopping_lists.sql` — schema
- `src/events/registry.ts` — `SHOPPING_LIST_CREATED / SHOPPING_ITEM_ADDED`
