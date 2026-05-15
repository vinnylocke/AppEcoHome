# Plan — Integrations Tabs + Rhozly Theme Fix

## Goal
1. Split the Integrations page into two tabs: **Devices** and **Automations**
2. Remove all hard-coded blue colours from the Automations UI components and replace with Rhozly theme tokens

---

## Tab Structure

Using the same pattern as `GardenHub.tsx` (border-b underline tabs, sticky, `useSearchParams`-backed state).

**`IntegrationsPage.tsx`**
- Add a tab bar below the page header: `Devices | Automations`
- Devices tab: existing device grid content (loading skeletons, error state, EmptyState, DeviceCard grid)
- Automations tab: renders `<AutomationsSection homeId={homeId} />` directly (no wrapper)
- Header buttons adapt per tab:
  - Devices tab: refresh icon + "Connect Device" button (current)
  - Automations tab: neither (AutomationsSection manages its own "New automation" CTA)
- Remove the conditional `{!loading && !error && devices.length > 0 && <AutomationsSection />}` block

---

## Colour Replacements

Theme reference: `rhozly-primary` = dark green (#075737)

| File | Old | New |
|------|-----|-----|
| `AutomationsSection.tsx` | `bg-blue-50`, `text-blue-500`, `bg-blue-500`, `hover:bg-blue-600`, `text-blue-400` | `bg-rhozly-primary/10`, `text-rhozly-primary`, `bg-rhozly-primary`, `hover:bg-rhozly-primary/90`, `text-rhozly-primary/60` |
| `AutomationCard.tsx` | Device chip: `bg-blue-50 text-blue-700` | `bg-rhozly-primary/10 text-rhozly-primary` |
| `AutomationCard.tsx` | `bg-rhozly-primary` on Run Now already correct; Droplets icon: `text-blue-500` | `text-rhozly-primary` |
| `AutomationModal.tsx` | All `bg-blue-500`, `hover:bg-blue-600`, `accent-blue-500`, `text-blue-600` | `bg-rhozly-primary`, `hover:bg-rhozly-primary/90`, `accent-rhozly-primary`, `text-rhozly-primary` |
| `AutomationRunHistory.tsx` | No changes — semantic status colours (green/amber/red/blue-for-weather) are intentional |

**Keep blue intentionally:**
- `skipped_weather` status badge in `AutomationCard` and `AutomationRunHistory` — blue is correct for weather/rain context

---

## Blueprint Picker — Searchable Filter UI

### Problem
The current picker renders every recurring blueprint as a flat list with two checkboxes each. With 20+ blueprints across multiple areas and plans this becomes unmanageable.

### Schema facts
`task_blueprints` has `location_id`, `area_id`, and `plan_id` columns directly. Plant links go through the `inventory_item_ids uuid[]` array → `inventory_items.plant_id` → `plants.name`. Locations, areas, and plants are standard FK-joinable tables.

### New UX

**Expanded fetch:** Fetch blueprints with nested joins:
```
task_blueprints(id, title, location_id, area_id, plan_id,
  locations(id, name),
  areas(id, name),
  plans(id, name),
  inventory_items!inner(id, plant_id, plants(id, name))  ← optional join, nullable
)
```
Blueprints with no inventory items still load; `plants` will be null.

**Filter bar (above the blueprint list):**
1. **Search box** — text input, filters `title` client-side, instant
2. **Location dropdown** — populated from distinct `location_id` values present in the fetched blueprints (not a full home locations query — only shows locations that actually have blueprints). Selecting a location resets area and plant.
3. **Area dropdown** — unlocks once a location is selected; populated from blueprints matching that location. Selecting an area resets plant.
4. **Plant dropdown** — unlocks once an area is selected; populated from unique plants across blueprints matching that location + area. Selecting a plant further narrows the list.
5. **Plan dropdown** — independent of location/area/plant; populated from distinct `plan_id` values in fetched blueprints. Can be combined with any other filter.

**Filtering logic** (all client-side, no extra API calls):
- Apply all active filters with AND logic
- A blueprint passes if: title contains search text AND location matches (if set) AND area matches (if set) AND plant matches (if set) AND plan matches (if set)

**Blueprint list:**
- Shows only filtered results; if nothing matches, show "No tasks match your filters" with a clear-filters link
- Each result shows title + location/area breadcrumb as a subtitle (e.g. "Back Garden › Raised Bed 1") so the user can confirm which task they are picking without needing the filters active
- Controlling / Driven checkboxes unchanged

**"Clear filters" button** appears whenever any filter is active.

### Data shape additions to `AvailableBlueprint`
```typescript
interface AvailableBlueprint {
  id: string;
  title: string;
  locationId: string | null;
  locationName: string | null;
  areaId: string | null;
  areaName: string | null;
  planId: string | null;
  planName: string | null;
  plantId: number | null;
  plantName: string | null;
}
```

---

## Files Changed

| File | Change |
|------|--------|
| `src/components/integrations/IntegrationsPage.tsx` | Add tab bar, split content by active tab, adapt header buttons |
| `src/components/integrations/AutomationsSection.tsx` | Replace blue with rhozly-primary |
| `src/components/integrations/AutomationCard.tsx` | Replace blue chip/icon colours |
| `src/components/integrations/AutomationModal.tsx` | Replace all blue with rhozly-primary; replace flat blueprint list with searchable filter picker |

---

## Risks / Notes
- The callback tab state (OAuth popup) renders before the tab bar — no change needed there
- `AutomationsSection` is already self-contained with its own load/refresh cycle so no data coupling issues when putting it in a tab
- Tab state will use simple `useState` (not URL params) since the Integrations page doesn't need deep-linkable tabs
- The plant join (`inventory_items → plants`) is nullable — blueprints with no linked plants simply show no plant filter option for that row and pass all plant-filter checks when no plant is selected
- Supabase nested joins on array FKs (`inventory_item_ids`) are not supported via the REST API. Instead: after fetching blueprints, do a second query — `inventory_items.select("id, plant_id, plants(id, name)").in("id", allInventoryItemIds)` — and stitch plants onto blueprints client-side
