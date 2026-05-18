# Plan — Companion Plants: Replace Add-to-Shed with PlantSourcePicker → BulkSearchModal Flow

## Goal

Replace the current direct-insert "Add N to Shed" button in `CompanionPlantsTab` with the same two-step flow the Planner uses:

1. User ticks companion plants → clicks "Add N to Shed"
2. `PlantSourcePicker` opens → searches all 3 providers (AI, Perenual, Verdantly) for each name → user confirms exact variants
3. `BulkSearchModal` opens with those selections pre-loaded → user reviews cart → clicks "Add to Shed"
4. Plants are saved to the Shed (with full care data, schedules, and image proxying)

---

## Files Changed

| File | Change |
|---|---|
| `src/components/CompanionPlantsTab.tsx` | Major: replace direct-insert with PlantSourcePicker + BulkSearchModal flow |
| `src/components/PlantEditModal.tsx` | Add `isPremium?: boolean` prop, pass to CompanionPlantsTab |
| `src/components/TheShed.tsx` | Pass `isPremium={perenualEnabled}` to `<PlantEditModal>` |
| `src/components/InstanceEditModal.tsx` | Add `isPremium?: boolean` prop, pass to CompanionPlantsTab |
| `src/components/AreaDetails.tsx` | Add `perenualEnabled?: boolean` prop, pass to InstanceEditModal |
| `src/components/LocationPage.tsx` | Add `perenualEnabled?: boolean` prop, pass to AreaDetails |
| `src/App.tsx` | Pass `perenualEnabled={profile?.enable_perenual ?? false}` to LocationPage |

No new files. No edge function changes. No migrations.

---

## Implementation

### CompanionPlantsTab.tsx

**New props:**
```ts
interface Props {
  source: string;
  verdantlyId?: string | null;
  plantName: string;
  homeId: string;
  aiEnabled: boolean;
  isPremium: boolean;      // NEW — passed to PlantSourcePicker + BulkSearchModal
  onPlantsAdded?: () => void;
}
```

**New state:**
```ts
const [showSourcePicker, setShowSourcePicker] = useState(false);
const [pickerSelections, setPickerSelections] = useState<{ type: "api" | "ai" | "verdantly"; data: any }[]>([]);
const [showBulkModal, setShowBulkModal] = useState(false);
const [isBulkAdding, setIsBulkAdding] = useState(false);
```

**New imports:**
- `PlantSourcePicker` from `./PlantSourcePicker`
- `BulkSearchModal` from `./BulkSearchModal`
- `PerenualService` from `../lib/perenualService`
- `VerdantlyService` from `../lib/verdantlyService`
- `PlantDoctorService` from `../services/plantDoctorService`
- `derivePlantLabels` from `../lib/plantLabels`
- `buildAutoSeasonalSchedules`, `getHemisphere`, `normalizePeriods` from `../lib/seasonal`
- `searchWikimediaImages`, `searchPixabayImages` from `../lib/wikipedia`

**"Add N to Shed" button handler — replaces current `handleAddToShed`:**
```ts
const handleOpenSourcePicker = () => {
  const names = Array.from(checked)
    .map((k) => allCompanions.get(k))
    .filter(Boolean)
    .map((p) => p!.name);
  if (names.length === 0) return;
  setShowSourcePicker(true);
};
```

**PlantSourcePicker confirm handler:**
```ts
const handleSourcePickerConfirm = (items: { type: "api" | "ai" | "verdantly"; data: any }[]) => {
  setPickerSelections(items);
  setShowSourcePicker(false);
  setShowBulkModal(true);
};
```

**BulkSearchModal `onProceedToBulkAdd` — handles the actual saving:**

Mirrors TheShed's `handleProceedToBulkAdd` logic but without TheShed's queue/status UI:
- For `api` type: `PerenualService.getPlantDetails` → image proxy → supabase insert
- For `verdantly` type: `VerdantlyService.getPlantDetails` → image proxy → supabase insert
- For `ai` type: use `item.preloadedDetails` if present, else `PlantDoctorService.generateCareGuide` → supabase insert
- All types: `derivePlantLabels(fullCareData)` for labels, `buildAutoSeasonalSchedules(...)` for schedules
- Image fallback: `searchWikimediaImages` / `searchPixabayImages` (same as TheShed)
- Duplicate detection: check `home_id + perenual_id` (api) / `home_id + verdantly_id` (verdantly) / `ilike common_name` (ai)
- Sets `isBulkAdding = true` while processing; shows a simple "Adding plants…" overlay
- On complete: toast, uncheck all, call `onPlantsAdded?.()`, close modal

**Manual save handler:**
```ts
const handleManualSave = async (plantData: any) => {
  // Same as TheShed's manual path: insert with source "manual"
};
```

**Render (in the return block, after the existing sections):**
```tsx
{showSourcePicker && (
  <PlantSourcePicker
    plants={Array.from(checked).map((k) => allCompanions.get(k)!.name)}
    isPremium={isPremium}
    isAiEnabled={aiEnabled}
    homeId={homeId}
    onConfirm={handleSourcePickerConfirm}
    onClose={() => setShowSourcePicker(false)}
  />
)}
{showBulkModal && (
  <BulkSearchModal
    homeId={homeId}
    isPremium={isPremium}
    isAiEnabled={aiEnabled}
    initialCartItems={pickerSelections}
    onProceedToBulkAdd={handleBulkAdd}
    onManualSave={handleManualSave}
    onClose={() => setShowBulkModal(false)}
  />
)}
```

Remove: the old `handleAddToShed` function and its `adding` state variable.

---

### Prop threading — `isPremium`

| Component | Change |
|---|---|
| `App.tsx` | `<LocationPage ... perenualEnabled={profile?.enable_perenual ?? false} />` |
| `LocationPage.tsx` | Add `perenualEnabled?: boolean` to props, pass down to `<AreaDetails>` |
| `AreaDetails.tsx` | Add `perenualEnabled?: boolean` to props, pass to `<InstanceEditModal isPremium={perenualEnabled}>` |
| `InstanceEditModal.tsx` | Add `isPremium?: boolean = false` to props, pass to `<CompanionPlantsTab>` |
| `PlantEditModal.tsx` | Add `isPremium?: boolean = false` to props, pass to `<CompanionPlantsTab>` |
| `TheShed.tsx` | `<PlantEditModal ... isPremium={perenualEnabled} />` |

---

## Edge Cases

- **No names selected:** guard already present (checked.size === 0 → button hidden)
- **PlantSourcePicker finds nothing:** picker shows its own "no results" UI; user can still manually add via BulkSearchModal's manual tab
- **BulkSearchModal already-in-shed errors:** handled the same way as TheShed — each item shows an error state in the modal
- **isBulkAdding overlay:** simple centered "Adding plants…" spinner over CompanionPlantsTab while processing so the modal doesn't linger open during saves

---

## Notes

- The save logic (image proxy + schedules + labels) is duplicated from TheShed rather than extracted. This is intentional — the task scope doesn't justify a shared utility, and the code is stable enough to safely duplicate for now.
- `BulkSearchModal`'s `onProceedToBulkAdd` is called once with the final selection list — progress during saves is managed via the `isBulkAdding` state in CompanionPlantsTab, not a queue UI like TheShed uses.
