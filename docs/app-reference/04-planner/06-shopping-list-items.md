# Shopping List Items

> The per-list item rows rendered inside an expanded ShoppingListCard. Handles checkbox toggling, thumbnails, badges (In Shed / AI), category labels, quantity, and delete.

**Trigger:** Rendered inside `ShoppingListCard` when a list is expanded.
**Source files:**
- `src/components/shopping/ShoppingListItems.tsx` — the row list
- `src/components/shopping/AddItemSheet.tsx` — the add-item modal (paired surface)
- `src/types/shopping.ts` — TS types

---

## Quick Summary

A simple list rendered from props. Unchecked items first, checked items below (strikethrough). Each row shows a thumbnail (image for plants with `thumbnail_url`, plant icon for plants without, first-letter chip for products), name + quantity, item-type badges (plant/product, In Shed, AI), and a delete button. Permissions gate the checkbox + delete buttons.

The companion `AddItemSheet` is a separate modal (~720 lines) that searches the plant database (Perenual / Verdantly / AI) for plants, or accepts a free-text product name with optional category.

---

## Role 1 — Technical Reference

### Component graph

```
ShoppingListItems
└── ul
    └── li (per item)
        ├── Checkbox (gated by shopping.edit_items)
        ├── Thumbnail / icon
        │   ├── Plant + thumbnail_url → <img>
        │   ├── Plant w/o url → IconPlant chip
        │   └── Product → first-letter chip
        ├── Name + quantity (×N) + line-through if checked
        ├── Badges row
        │   ├── Product category chip
        │   ├── "In Shed" chip (plants)
        │   └── "AI" chip (AI-sourced plants)
        └── Delete button (gated by shopping.delete_items)
```

### Props

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `items` | `ShoppingListItem[]` | ShoppingListCard | Pre-fetched items for this list |
| `onToggle` | `(id, checked) => void` | useShoppingLists hook | Tick / untick |
| `onDelete` | `(id) => void` | useShoppingLists hook | Remove |

### `ShoppingListItem` shape (`src/types/shopping.ts`)

```ts
{
  id: string;
  list_id: string;
  home_id: string;
  item_type: "plant" | "product";
  name: string;
  quantity?: number | null;
  is_checked: boolean;
  category?: string | null;        // product category (e.g. "fertiliser")
  thumbnail_url?: string | null;   // plant photo
  source?: "manual" | "perenual" | "verdantly" | "ai" | null;
  already_in_shed?: boolean;       // set by "Add to Shed"
  created_at: string;
}
```

### Sort order

```ts
const sorted = [
  ...items.filter(i => !i.is_checked),
  ...items.filter(i => i.is_checked),
];
```

Checked items always sink to the bottom — keeps focus on what's left to buy.

### Data flow — read paths

None at this level — items are passed in as a prop. Fetched by `useShoppingLists.fetchItems(listId)` from the parent.

### Data flow — write paths

| Operation | Underlying call |
|-----------|----------------|
| Toggle | `shopping_list_items.update({ is_checked }).eq("id", id)` |
| Delete | `shopping_list_items.delete().eq("id", id)` |

Both flow through the hook's callbacks → realtime channel sync.

### Edge functions invoked (from AddItemSheet)

| Function | Purpose |
|----------|---------|
| `verdantly-search` | Search Verdantly plant database |
| Perenual API (browser) | Search Perenual plant database |
| `gemini-plant-suggest` (or similar) | AI suggest items |

### Cron / scheduled jobs that affect this surface

None.

### Realtime channels

Inherits realtime from the parent — items refetch on `shopping_list_items` channel events.

### Tier gating

| Feature | Tier |
|---------|------|
| Item rows | Every tier |
| Plant search (in AddItemSheet) | Botanist+ |
| AI Suggest | Sage / Evergreen |

### Beta gating

None.

### Permissions

- `shopping.edit_items` — gates the checkbox (disabled + faded if missing).
- `shopping.delete_items` — hides the delete button if missing.

### Error states

| State | Result |
|-------|--------|
| Toggle fails | Item state reverts on next realtime refresh; no inline error |
| Delete fails | Toast (handled in parent hook) |
| Empty list | "No items yet — tap '+ Add Item' to get started" |

### Performance

- Pure render. No fetches at this level.
- Thumbnail uses native `<img>` — browser lazy-loading.

### Linked storage buckets

- Plant thumbnails come from Perenual / Verdantly / Unsplash URLs — not Rhozly storage.

---

## Role 2 — Expert Gardener's Guide

### Why look at item rows

Each row is one thing you need to buy. The visual cues — thumbnail, badges, quantity, line-through — let you scan the list at the garden centre and tick things off without thinking.

### Every flow on a row

#### 1. Tick / untick

- Checkbox flips state. Item moves to the bottom of the list.
- Strikethrough applies. Useful for tracking what's left without deleting the row.

#### 2. Spot "In Shed" plants

- A green "In Shed" chip means you've already promoted this row to your inventory via the parent card's "Add to Shed" button.
- Useful when re-using an old list to plan again — you can see what you previously procured.

#### 3. AI-sourced plants

- A violet "AI" chip flags plants that came from Rhozly AI suggestions rather than the plant database.
- Means you should still verify availability before going to the garden centre — AI may suggest cultivars your local nursery doesn't stock.

#### 4. Quantity

- `×3` next to the name. Only shows if set (defaults to undefined).

#### 5. Delete

- Trash icon → removes immediately (no confirm at row level).

### Information on display — what every field means

| Element | Meaning |
|---------|---------|
| Checkbox | Bought / not yet |
| Thumbnail | Plant photo or category letter chip |
| Name | What it is |
| Quantity | How many (or how much) |
| Type badge | Plant 🌱 / Product 📦 implied by thumbnail |
| Category chip | Product subcategory (fertiliser, tool, etc.) |
| In Shed chip | Promoted to inventory |
| AI chip | Sourced from AI |
| Line-through | Checked off |

### Tier-by-tier experience

Row rendering is identical for every tier. The Add Item flow is what differs.

### Common mistakes / pitfalls

- **Deleting instead of ticking.** Deleting loses the history. Tick to keep a record of what you bought.
- **Quantity left at default.** "3" sounds easy but "3 tomato plants" vs "3 trays of tomato plants" matters. Specify in name or use the qty field.
- **Treating "In Shed" as "bought".** They're related but separate — "checked" = bought; "In Shed" = promoted to inventory. You can be checked without being in Shed if you bought outside the Add-to-Shed flow.

### Recommended workflows

- **At the garden centre:** open the list, tick as you put things in the trolley.
- **At home after shopping:** the parent card's "Add Checked Plants to Shed" promotes ticked plant rows into your inventory — saves re-typing.
- **Re-using a list seasonally:** uncheck everything to "reset" rather than deleting + re-creating.

### What to do if something looks wrong

- **Ticked item didn't sync:** wait for realtime refresh. If still wrong, manual untick + re-tick.
- **Thumbnail broken:** the upstream image URL (Perenual / Verdantly) may have expired. Re-add the item.
- **Can't tick anything:** you lack `shopping.edit_items` permission. Ask the home owner to upgrade your role.

---

## Related reference files

- [Shopping Lists](./05-shopping-lists.md)
- [The Shed](../03-garden-hub/01-the-shed.md) — destination for promoted plants
- [Add Item Sheet (modal)](../08-modals-and-overlays/03-plant-source-picker.md)
- [Plant Providers (cross-cutting)](../99-cross-cutting/25-plant-providers.md)

## Code references for ongoing maintenance

- `src/components/shopping/ShoppingListItems.tsx` — row list
- `src/components/shopping/ShoppingListCard.tsx` — parent card
- `src/components/shopping/AddItemSheet.tsx` — add-item modal
- `src/types/shopping.ts` — TS types
- `src/hooks/useShoppingLists.ts` — toggle/delete callbacks
- `supabase/migrations/*_shopping_list_items.sql` — schema
