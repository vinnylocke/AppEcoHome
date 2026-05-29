# Fix — Shed plant-tile light icon should open the plant's Light tab (not the Sun Tracker)

## Problem
Each plant tile in The Shed has a light/sun icon (top-right, `data-testid="plant-card-sun-{id}"`). Tapping it stores the plant in sessionStorage and navigates to the **Sun Tracker** (`/sun-trajectory?mode=garden`). The user expects it to open the **per-plant Light view** — the same as clicking the plant and switching to its **Light** tab — which shows how close the current light reading is to the light that plant needs.

## App-reference files consulted
- `docs/app-reference/03-garden-hub/01-the-shed.md` — the plant tile + its quick actions
- `docs/app-reference/99-cross-cutting/28-sun-analysis.md` — light/lux + Sun Tracker vs the per-plant Light reader

## Current behaviour (code)
`src/components/TheShed.tsx` (~line 1524): the tile button writes `rhozly:sun-tracker-plant` to sessionStorage and `navigate("/sun-trajectory?mode=garden")`.

The per-plant Light experience already exists: clicking a tile calls `setEditingPlant(plant)` → `PlantEditModal`, which has a **Light** tab (`activeTab === "light"` → `<LightTab plantId plantName />`, `PlantEditModal.tsx:803`). `LightTab` loads the plant's sunlight requirement → `getOptimalLuxRange` → `PlantLightReader` (reads the device sensor and shows proximity to the required lux). That is exactly the requested behaviour.

`PlantEditModal` defaults to the Care tab (`useState("care")`, line 155) and has no way to open on a specific tab.

## Fix

1. **`src/components/PlantEditModal.tsx`**
   - Add `initialTab?: string` to `PlantEditModalProps`.
   - `const [activeTab, setActiveTab] = useState(initialTab ?? "care");`

2. **`src/components/TheShed.tsx`**
   - Add `const [editingPlantTab, setEditingPlantTab] = useState<string>("care");`
   - Tile light button: replace the onClick body with `e.stopPropagation(); setEditingPlantTab("light"); setEditingPlant(plant);` — drop the sessionStorage write + sun-trajectory navigation. Re-label: `aria-label={`Check light levels for ${plant.common_name}`}`, `title="Light needs"`. Rename testid `plant-card-sun-{id}` → `plant-card-light-{id}` (no current references). Keep the `Sun` icon (reads as light) — hover stays amber.
   - Normal card open paths (card `onClick`/`onKeyDown` ~1426–1436, and the ~1490 entry): set `setEditingPlantTab("care")` before `setEditingPlant(plant)` so a normal click still opens on Care.
   - Pass `initialTab={editingPlantTab}` to `<PlantEditModal>` (~1916). The modal mounts fresh each open (editingPlant goes null→plant on close/reopen), so `initialTab` is honoured each time.

No change to the Sun Tracker itself, or to the other sun-tracker entry points (Planner, Daily Brief, Tools, PlantEditModal's own light-tab button).

## Tests
- E2E (shed-crud): tap `plant-card-light-{id}` on a seeded plant → `PlantEditModal` opens with the **Light** tab active (`plant-modal-tab-light`). Add a ShedPage helper for the light button + light tab.
- Update the existing "sun" references if any in the Shed page object (none today).

## App-reference docs to update
- `01-the-shed.md` — the tile's light icon now opens the plant's Light tab (was: Sun Tracker).
- `28-sun-analysis.md` — note the Shed tile routes to the per-plant Light reader, not the Sun Tracker.

## Risks
- Low + contained. Only the tile button's target changes; the Light tab + modal are unchanged. The sessionStorage handoff is removed only for this button (other Sun Tracker entry points keep theirs).

## Deploy
Frontend-only (no migration, no edge fn). One deploy when ready.
