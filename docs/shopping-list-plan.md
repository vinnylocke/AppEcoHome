# Rhozly Shopping List Feature — Implementation Plan

## Overview

This plan details every file, SQL statement, component, data flow, and integration point needed to build the Shopping List feature. It is organised into the sections requested and written to be actionable for a single developer working top-to-bottom.

---

## 1. Database Schema

### Migration file: `supabase/migrations/20260507000000_shopping_lists.sql`

```sql
-- ============================================================
-- SHOPPING LISTS
-- Two tables: shopping_lists (headers) and shopping_list_items (rows)
-- All writes are plain CRUD from the browser via the Supabase client.
-- No Edge Function required.
-- ============================================================

-- 1. shopping_lists ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.shopping_lists (
  id         uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  home_id    uuid        NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  name       text        NOT NULL DEFAULT 'My List',
  status     text        NOT NULL DEFAULT 'active'
               CHECK (status IN ('active', 'completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shopping_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "home_members_can_select_shopping_lists"
  ON public.shopping_lists FOR SELECT TO authenticated
  USING (home_id IN (
    SELECT home_id FROM public.home_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "home_members_can_insert_shopping_lists"
  ON public.shopping_lists FOR INSERT TO authenticated
  WITH CHECK (home_id IN (
    SELECT home_id FROM public.home_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "home_members_can_update_shopping_lists"
  ON public.shopping_lists FOR UPDATE TO authenticated
  USING (home_id IN (
    SELECT home_id FROM public.home_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "home_members_can_delete_shopping_lists"
  ON public.shopping_lists FOR DELETE TO authenticated
  USING (home_id IN (
    SELECT home_id FROM public.home_members WHERE user_id = auth.uid()
  ));

CREATE INDEX IF NOT EXISTS idx_shopping_lists_home_id
  ON public.shopping_lists (home_id, status, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shopping_lists TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shopping_lists TO service_role;


-- 2. shopping_list_items ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.shopping_list_items (
  id              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  list_id         uuid        NOT NULL REFERENCES public.shopping_lists(id) ON DELETE CASCADE,
  home_id         uuid        NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,

  -- Discriminated union: either 'plant' or 'product'
  item_type       text        NOT NULL CHECK (item_type IN ('plant', 'product')),

  -- Shared
  name            text        NOT NULL,
  is_checked      boolean     NOT NULL DEFAULT false,

  -- Plant-only (null for product items)
  perenual_id     integer,
  thumbnail_url   text,
  source          text,          -- 'shed' | 'perenual'
  already_in_shed boolean,       -- true when item came from inventory_items

  -- Product-only (null for plant items)
  category        text,          -- must match a value in SHOPPING_CATEGORIES

  -- Plant Doctor provenance (optional, for both types)
  doctor_session_id text,        -- free-text reference, not a FK

  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shopping_list_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "home_members_can_select_shopping_list_items"
  ON public.shopping_list_items FOR SELECT TO authenticated
  USING (home_id IN (
    SELECT home_id FROM public.home_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "home_members_can_insert_shopping_list_items"
  ON public.shopping_list_items FOR INSERT TO authenticated
  WITH CHECK (home_id IN (
    SELECT home_id FROM public.home_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "home_members_can_update_shopping_list_items"
  ON public.shopping_list_items FOR UPDATE TO authenticated
  USING (home_id IN (
    SELECT home_id FROM public.home_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "home_members_can_delete_shopping_list_items"
  ON public.shopping_list_items FOR DELETE TO authenticated
  USING (home_id IN (
    SELECT home_id FROM public.home_members WHERE user_id = auth.uid()
  ));

CREATE INDEX IF NOT EXISTS idx_shopping_list_items_list_id
  ON public.shopping_list_items (list_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_shopping_list_items_home_id
  ON public.shopping_list_items (home_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shopping_list_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shopping_list_items TO service_role;
```

**RLS intent summary:**
- Both tables are scoped to `home_members` — the same pattern used by every other multi-user table in this codebase.
- All members of a home share the same lists, matching the collaborative gardening model.
- `home_id` is denormalised onto `shopping_list_items` so RLS does not need a join through `shopping_lists` and to allow direct item-level queries by `home_id`.

---

## 2. New Files to Create

### `src/constants/shoppingCategories.ts`
Hard-coded product category list. Used by the product-item form and as display labels.

```ts
export const SHOPPING_CATEGORIES = [
  "Fertiliser",
  "Pest Control",
  "Tools",
  "Soil & Compost",
  "Pots & Planters",
  "Seeds & Bulbs",
  "Accessories",
] as const;

export type ShoppingCategory = (typeof SHOPPING_CATEGORIES)[number];
```

### `src/types/shopping.ts`
TypeScript interfaces mirroring the Supabase schema.

```ts
export interface ShoppingList {
  id: string;
  home_id: string;
  name: string;
  status: "active" | "completed";
  created_at: string;
  updated_at: string;
  items?: ShoppingListItem[];
}

export interface ShoppingListItem {
  id: string;
  list_id: string;
  home_id: string;
  item_type: "plant" | "product";
  name: string;
  is_checked: boolean;
  perenual_id?: number | null;
  thumbnail_url?: string | null;
  source?: "shed" | "perenual" | null;
  already_in_shed?: boolean | null;
  category?: string | null;
  doctor_session_id?: string | null;
  created_at: string;
}
```

### `src/components/ShoppingLists.tsx`
Top-level page component. Receives `homeId: string`. Owns all network state via `useShoppingLists`. See Section 4.

### `src/components/shopping/ShoppingListCard.tsx`
Renders a single list header card: name, item count, rename/delete controls, Mark Complete / Reopen button.

### `src/components/shopping/ShoppingListItems.tsx`
Renders the expanded item rows: checkbox, thumbnail (plants), category badge (products), strikethrough when checked, delete icon.

### `src/components/shopping/AddItemSheet.tsx`
Bottom sheet portal for adding an item. Two tabs: "Plant" and "Product". Contains the full plant search flow (shed → Perenual → preview → shed offer) and the product free-text + category picker.

### `src/components/shopping/AddToListSheet.tsx`
Lightweight Plant Doctor integration sheet. Shows pre-populated suggested items (checkboxes to include/exclude) + active list picker + confirm.

### `src/hooks/useShoppingLists.ts`
Encapsulates all Supabase CRUD. Returns:
`{ lists, isLoading, createList, renameList, deleteList, markComplete, reopenList, addItem, toggleItem, deleteItem }`

### `supabase/functions/search-plants-ai/index.ts`
New Edge Function. Receives `{ query: string }`, guards with `guardAiByUser`, calls Gemini with a targeted prompt, returns `{ plants: Array<{ name: string; description: string }> }`. Invoked from the browser via `supabase.functions.invoke("search-plants-ai", ...)`. Used only when `ai_enabled = true` and the user has explicitly tapped "Search via AI".

### `tests/e2e/specs/shopping.spec.ts`
Playwright E2E spec.

### `tests/e2e/pages/ShoppingPage.ts`
Playwright Page Object for `/shopping`.

### `supabase/seeds/09_shopping_lists.sql`
E2E seed: two lists (one active, one completed) with items. UUID prefix: `00000000-0000-0000-000e-000000000000`.

---

## 3. Modified Files and What Changes

### `src/App.tsx`
1. Import `ShoppingLists` and `ShoppingCart` from lucide-react.
2. Add `shopping: "/shopping"` to `TAB_URL`.
3. Add nav link: `{ id: "shopping", icon: <ShoppingCart />, label: "Shopping List" }` (after `shed`).
4. Add route — pass both feature flags as props:
```tsx
<Route path="/shopping" element={
  profile?.home_id ? (
    <ShoppingLists
      homeId={profile.home_id}
      aiEnabled={!!profile.ai_enabled}
      perenualEnabled={!!profile.enable_perenual}
    />
  ) : null
} />
```

### `src/context/HomeRealtimeContext.tsx`
Add to `HOME_TABLES`:
```ts
{ table: "shopping_lists",       filter: (id: string) => `home_id=eq.${id}` },
{ table: "shopping_list_items",  filter: (id: string) => `home_id=eq.${id}` },
```

### `src/components/PlantDoctor.tsx`
Two additions:
1. Import `AddToListSheet` + `ShoppingCart` icon. Add `showAddToList` boolean state and `addToListItems` state.
2. After identify results: "Add to Shopping List" button → sets `addToListItems` from `selectedPlantName`.
3. After diagnose results: "Add treatments to Shopping List" button → calls `deriveShoppingItemsFromDiagnosis(aiResult, selectedDisease)`.
4. Render `<AddToListSheet>` portal at bottom of JSX when `showAddToList`.

### `docs/e2e-test-plan.md`
Add Shopping List section with all routes, positive/negative cases, and seed references.

### `CLAUDE.md`
Add `/shopping` to the Routes table.

---

## 4. Component Breakdown

### `ShoppingLists.tsx` (page root)

Props: `{ homeId: string; aiEnabled: boolean; perenualEnabled: boolean }`

State: `selectedListId`, `showAddItem`, `isCreating`

```
<div class="max-w-3xl mx-auto">
  <PageHeading />          ← "Shopping Lists" + "New List" button
  <ActiveListsSection />   ← maps active lists to ShoppingListCard
  <CompletedSection />     ← collapsible, maps completed lists
</div>
<AddItemSheet />           ← portal, renders when showAddItem
```

`aiEnabled` and `perenualEnabled` are threaded through to `AddItemSheet` — they do not affect any other sub-component.

### `ShoppingListCard.tsx`

- Header: list name (click to expand), item count badge, kebab menu (Rename / Delete / Mark Complete or Reopen)
- Rename: inline `<input>` with Save/Cancel — no modal
- Expanded body: `<ShoppingListItems>`
- Footer (expanded): "+ Add Item" button

### `ShoppingListItems.tsx`

Each row:
- Checkbox (`accent-rhozly-primary`)
- Plant: `SmartImage` thumbnail + name + "In Shed" badge if `already_in_shed`
- Product: category badge + name
- Strikethrough when `is_checked`
- Trash icon on hover

Sort: unchecked first (creation order), checked after (creation order).

### `AddItemSheet.tsx`

Props include `aiEnabled: boolean` and `perenualEnabled: boolean` (threaded from page root).

Internal states: `"idle" | "searching" | "shed_results" | "fallback_choice" | "perenual_searching" | "ai_searching" | "perenual_results" | "ai_results" | "preview" | "shed_offer" | "no_results"`

Plant tab: shed query always runs on user input (debounced 400 ms). External search only triggers after user explicitly chooses a fallback method. See Section 5.

Product tab: text input + `<select>` from `SHOPPING_CATEGORIES`.

### `AddToListSheet.tsx`

1. Suggested items list with checkboxes to include/exclude
2. Active list picker (scroll + "Create new" option)
3. Confirm button

---

## 5. Plant Search Flow

The shed is always searched first. External search (Perenual or AI) is user-triggered, not automatic — and the available fallback methods depend entirely on the user's feature flags (`aiEnabled`, `perenualEnabled`).

### State machine

```
IDLE
  └─ user types (debounced 400 ms)
       ↓
SEARCHING (shed only — always)
  └─ query inventory_items WHERE home_id=X AND plant_name ILIKE '%q%'
       ↓
SHED_RESULTS
  ├─ "In Your Shed" section
  │   └─ tap "+ Add" → insert (source='shed', already_in_shed=true) → done
  │
  └─ below shed results, show fallback row based on flags:
       ├─ both enabled  → two buttons: [Search Perenual] [Search via AI]
       ├─ perenual only → one button:  [Search Perenual]
       ├─ ai only       → one button:  [Search via AI]
       └─ neither       → small text:  "No additional search methods available"
            ↓ (user taps a button)

── Perenual path ──────────────────────────────────────────────────────────────
PERENUAL_SEARCHING
  └─ perenualService.searchPlants(query)
       ↓
PERENUAL_RESULTS
  └─ list of Perenual species (thumbnail + name + scientific name)
       └─ tap row → PREVIEW
              ↓
         perenualService.getPlantDetails(id)
         Show: thumbnail, name, cycle, watering, sunlight
         [Add to list] → insert (source='perenual', already_in_shed=false) → SHED_OFFER
         [Back]
              ↓
         SHED_OFFER (inline, not a modal)
         "Want to add [name] to your Shed too?"
         [Add to Shed] → insert to inventory_items → close sheet
         [Skip]        → close sheet

── AI path ────────────────────────────────────────────────────────────────────
AI_SEARCHING
  └─ supabase.functions.invoke("search-plants-ai", { body: { query } })
       ↓
AI_RESULTS
  └─ list of AI-suggested plant names (name + brief description, no thumbnail)
       └─ tap row → insert (source='ai', already_in_shed=false) → SHED_OFFER
              ↓ same SHED_OFFER flow as Perenual path
```

### `search-plants-ai` Edge Function

New file: `supabase/functions/search-plants-ai/index.ts`

- Called from browser via `supabase.functions.invoke()` (CORS-safe, auth enforced).
- Guards: calls `guardAiByUser(db, userId)` from `_shared/aiGuard.ts` — returns 403 if `ai_enabled` is false.
- Prompt to Gemini: given a search query, return up to 8 matching plant names with a one-sentence description each, as a JSON array `[{ name, description }]`.
- No image — AI plant results show a generic leaf icon in the UI.
- Response shape: `{ plants: Array<{ name: string; description: string }> }`

This function is intentionally lightweight — it does not return watering schedules or full care data. Its only job is name discovery. The shed-offer flow after adding an AI result follows the same pattern as Perenual.

### UI states summary

| State | Shed section | Fallback section |
|-------|-------------|-----------------|
| `idle` | Empty input | — |
| `searching` | Spinner | — |
| `shed_results` | Results list | Fallback buttons (flag-dependent) |
| `perenual_searching` | Results (frozen) | Loading spinner |
| `perenual_results` | Results | Perenual list below |
| `ai_searching` | Results (frozen) | Loading spinner |
| `ai_results` | Results | AI list below |
| `preview` | Hidden | Plant detail card |
| `shed_offer` | Hidden | Inline offer prompt |
| `no_results` | "Nothing in your shed" | Fallback buttons |

If shed returns zero results, the fallback buttons are still shown (the shed section shows an empty state message instead). The user can still trigger Perenual or AI search even when the shed is empty.

If an external search fails: inline error below its section; shed results remain interactive.

---

## 6. Plant Doctor Integration

### Identify flow

After `selectedPlantName` is set, add below the existing action buttons:

```tsx
<button
  data-testid="doctor-add-plant-to-list"
  onClick={() => {
    setAddToListItems([{ name: selectedPlantName, item_type: "plant" }]);
    setShowAddToList(true);
  }}
>
  <ShoppingCart size={16} /> Add to Shopping List
</button>
```

### Diagnose flow

After the treatment approval block, add:

```tsx
<button
  data-testid="doctor-add-treatment-to-list"
  onClick={() => {
    const items = deriveShoppingItemsFromDiagnosis(aiResult, selectedDisease);
    setAddToListItems(items);
    setShowAddToList(true);
  }}
>
  <ShoppingCart size={16} /> Add treatments to Shopping List
</button>
```

### `deriveShoppingItemsFromDiagnosis` helper

```ts
function deriveShoppingItemsFromDiagnosis(
  aiResult: VisionResult | null,
  selectedDisease: string | null,
): Array<{ name: string; item_type: "plant" | "product"; category?: string }> {
  const items: Array<{ name: string; item_type: "product"; category: string }> = [];
  if (selectedDisease) {
    items.push({ name: `Treatment for ${selectedDisease}`, item_type: "product", category: "Pest Control" });
  }
  if (aiResult?.remedial_schedules) {
    for (const schedule of aiResult.remedial_schedules) {
      if (schedule.product) {
        items.push({ name: schedule.product, item_type: "product", category: "Pest Control" });
      }
    }
  }
  return items;
}
```

### `AddToListSheet` placement

Render at bottom of `PlantDoctor.tsx` JSX, only when `showAddToList && addToListItems.length > 0`. Fetch `activeLists` lazily inside the button's `onClick` (one-off Supabase query) before setting `showAddToList = true`.

---

## 7. Implementation Order

| Step | What | Result |
|------|------|--------|
| 1 | DB migration | Tables + RLS in local DB |
| 2 | Constants + types | `shoppingCategories.ts`, `types/shopping.ts` |
| 3 | `useShoppingLists` hook + realtime context update | CRUD layer ready |
| 4 | Page + sub-components (no AddItemSheet) + route + nav | `/shopping` renders; lists CRUD works |
| 5 | `AddItemSheet` — product tab only | Products can be added |
| 6 | `AddItemSheet` — plant tab + shed search | Shed plants can be added |
| 7 | `AddItemSheet` — Perenual fallback (flag-gated) + preview + shed offer | Perenual search works |
| 8 | `search-plants-ai` Edge Function | AI plant search backend ready |
| 9 | `AddItemSheet` — AI fallback (flag-gated) | AI plant search works |
| 10 | Completed lists section | Collapsible completed section |
| 11 | `AddToListSheet` + Plant Doctor integration | Doctor can add to lists |
| 12 | E2E seeds + Playwright spec + Page Object | Tests pass |
| 13 | Vitest unit tests | `deriveShoppingItemsFromDiagnosis` + hook tested |

---

## 8. `data-testid` Attributes

| Element | `data-testid` |
|---------|---------------|
| "New List" button | `shopping-new-list-btn` |
| List card | `shopping-list-card-{list.id}` |
| List name | `shopping-list-name-{list.id}` |
| Rename input | `shopping-rename-input` |
| Save rename | `shopping-rename-save` |
| Cancel rename | `shopping-rename-cancel` |
| Mark Complete | `shopping-mark-complete-{list.id}` |
| Reopen | `shopping-reopen-{list.id}` |
| Delete list | `shopping-delete-list-{list.id}` |
| Add Item button | `shopping-add-item-btn-{list.id}` |
| AddItemSheet overlay | `shopping-add-item-sheet` |
| Plant tab | `shopping-tab-plant` |
| Product tab | `shopping-tab-product` |
| Plant search input | `shopping-plant-search-input` |
| "Search Perenual" fallback button | `shopping-fallback-perenual` |
| "Search via AI" fallback button | `shopping-fallback-ai` |
| Plant result row (Perenual) | `shopping-perenual-result-{index}` |
| Plant result row (AI) | `shopping-ai-result-{index}` |
| Add plant confirm | `shopping-add-plant-confirm` |
| Add to Shed yes | `shopping-add-to-shed-yes` |
| Skip shed offer | `shopping-add-to-shed-skip` |
| Product name input | `shopping-product-name-input` |
| Product category select | `shopping-product-category-select` |
| Add product confirm | `shopping-add-product-confirm` |
| Item row | `shopping-item-{item.id}` |
| Item checkbox | `shopping-item-checkbox-{item.id}` |
| Item delete | `shopping-item-delete-{item.id}` |
| Completed section toggle | `shopping-completed-section-toggle` |
| AddToListSheet overlay | `shopping-add-to-list-sheet` |
| List picker option | `shopping-list-pick-{list.id}` |
| "Create new list" option | `shopping-list-pick-new` |
| Confirm add to list | `shopping-add-to-list-confirm` |
| Doctor add plant | `doctor-add-plant-to-list` |
| Doctor add treatment | `doctor-add-treatment-to-list` |

---

## Architectural Notes

**No AI calls for products.** User types a free-text product name and picks a category from the hard-coded list. Avoids costly Gemini calls for every search.

**Perenual from browser.** Explicitly allowed per CLAUDE.md. No Edge Function needed.

**`already_in_shed` is a snapshot.** Records whether the plant was in the shed at add-time, not a live FK. Drives a UI badge only.

**No optimistic updates.** Consistent with all other components in the codebase.

**`AddToListSheet` fetches lists lazily.** Triggered only when user taps the button in Plant Doctor, not on mount.

**Sort order for items.** Client-side sort: unchecked first (creation order), then checked (creation order). No DB-level `ORDER BY` change needed.
