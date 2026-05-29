# Bulk Assign Modal

> Place several selected plants into the garden at once — one target area, a quantity per plant, and optional smart planting schedules. The multi-select counterpart to the single-plant Assign flow.

**Route / how to reach it:** No route. Plants tab → **Select** (multi-select) → pick plants → **Assign** in the bottom bar.
**Source files:**
- `src/components/BulkAssignModal.tsx` — the modal
- `src/components/TheShed.tsx` — `handleBulkAssign` (the write)

---

## Quick Summary

When you've selected a handful of plants in the Plants grid, "Assign" opens this modal so you can drop them all into one area in a single step — choosing how many of each, whether they're already planted, and whether Rhozly should draft a planting schedule for each.

---

## Role 1 — Technical Reference

### Component graph
- `BulkAssignModal.tsx` — portal overlay (`z-[80]`), focus-trapped, Escape-to-close.

### Props received

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `plants` | `any[]` | `TheShed` (selected plant rows) | The plants to assign. |
| `locations` | `any[]` | `TheShed` | Location → area options. |
| `homeId` | `string` | `TheShed` | Scope. |
| `aiEnabled` | `boolean` | `TheShed` | Gates the smart-schedules toggle. |
| `isAssigning` | `boolean` | `TheShed` (`actionLoading`) | Disables the confirm while the write runs. |
| `onAssign` | `(data) => void` | `TheShed` → `handleBulkAssign` | Performs the insert + schedules. |
| `onClose` | `() => void` | `TheShed` | Dismiss. |

### State (local)
- `selectedLoc` / `areaId` / `noArea` — the shared target (one area for the batch, or "add to garden" with no area).
- `quantities: Record<plantId, number>` — per-plant count (default 1, clamped 1–99).
- `isPlanted` / `isEstablished` / `plantedDate` / `growthState` — batch-level planted state.
- `smartSchedules` — toggle (only meaningful with a real area + AI).

### Data flow — write paths
On confirm → `onAssign({ areaId, status, isPlanted, isEstablished, plantedDate, growthState, smartSchedules, quantities })`. `TheShed.handleBulkAssign`:
1. Resolves the area context once (or nulls it for "add to garden").
2. Builds one combined `inventory_items` insert — `quantity` rows per plant, sharing the area context + status/date (same per-row shape as the single `handleAssign`).
3. If `smartSchedules` + area + AI: for each plant, invokes `smart-plant-scheduler` (cached in `ai_schedule_cache`), takes the **recommended viable method**, and inserts its phases as `Planting` tasks. Each plant's generation soft-fails independently.
4. `refreshShed()` + exit select mode.

The status→`Planted` insert also fires the DB trigger `run_plant_schedules`, so `plant_schedules`-based tasks are created server-side as usual.

### Edge functions invoked
- `smart-plant-scheduler` — once per plant when the smart-schedules toggle is on. Input: `{ plantName, areaDetails, address, homeId, plantMetadata }`. Cached per `(plant_id, area_id)`.

### Tier gating
- The **smart schedules** toggle only appears when an area is chosen **and** the home is AI-enabled (Sage+). Everything else (area, quantities, planted state) works for every tier.

### Error states
- No location/area chosen and not "add to garden" → confirm disabled.
- Per-plant schedule failure → logged + skipped; the assignment itself still succeeds.

---

## Role 2 — Expert Gardener's Guide

### Why open this screen
You bought a tray of seedlings — six kinds — and want them all in "Raised Bed A" without assigning each one through its own modal. Select them, tap Assign, set how many of each, and you're done. For Marcus it's a time-saver; for Sarah it keeps a big planting day from becoming a chore.

### Every flow on this page
1. **Pick where** — choose a location then an area, or tap "Add to garden" to place them without an area for now.
2. **Set quantities** — each selected plant has a − / number / + stepper.
3. **Planted state** — flag the batch as already planted (with date / established / growth stage) or leave as unplanted stock.
4. **Smart schedules** (Sage+, with an area) — leave on to have Rhozly draft a planting plan for each plant and add the tasks.
5. **Assign** — creates everything and returns you to your Plants.

### Information on display — what every field means
- **Quantity** — how many individual plants of that type to create as instances.
- **Already planted** — if on, the instances are "Planted" (with a date/stage); if off, they're "Unplanted" stock you can place later.
- **Smart planting schedules** — AI drafts the recommended sowing/planting steps per plant for the chosen area.

### Tier-by-tier experience
Sprout/Botanist: area + quantities + planted state. Sage/Evergreen: also the smart-schedules toggle.

### Common mistakes / pitfalls
- Expecting per-plant *method* choice like the single Assign flow — bulk uses each plant's recommended method to stay quick. Use single Assign when you want to pick the method.

### What to do if something looks wrong
- A plant didn't get a schedule? Generation can soft-fail per plant (e.g. no postcode set, or AI quota). Open that plant's instance and assign/schedule it individually.

---

## Related reference files
- [The Shed / Plants](../03-garden-hub/01-the-shed.md) — host + `handleBulkAssign`
- [Plant Assignment Modal](../03-garden-hub/01-the-shed.md) — the single-plant Assign flow (full per-method AI step)
- [Sun Analysis](../99-cross-cutting/28-sun-analysis.md), [Tier Gating](../99-cross-cutting/17-tier-gating.md)

## Code references for ongoing maintenance
- `src/components/BulkAssignModal.tsx`
- `src/components/TheShed.tsx` — `handleBulkAssign`, the bulk action bar
- `supabase/functions/smart-plant-scheduler/index.ts`
