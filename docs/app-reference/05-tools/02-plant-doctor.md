# Plant Doctor

> The AI vision tool for plants — identify what a plant is, diagnose what's wrong with it, or scan for pests. Photo in → AI analysis → care plan, treatment, or pest workup → optional follow-up actions (save to Shed, create treatment plan, add supplies to shopping).

**Route:** `/doctor`
**Source file:** `src/components/PlantDoctor.tsx` (~1,670 lines)

---

## Quick Summary

Three actions powered by Gemini Vision via `PlantDoctorService`:

| Action | API action | What you get |
|--------|-----------|--------------|
| Identify | `identify_vision` | Plant name(s), scientific name, care snapshot |
| Diagnose | `diagnose` | Diseases possible, treatments, severity, plant-instance link |
| Pest Scan | `identify_pest` | Possible pests, control measures |

Photo capture supports Capacitor camera (mobile native), browser camera, or file upload. Optional plant-instance picker pre-scopes the request. The annotation overlay lets the user circle a specific leaf/area. Each session writes to `plant_doctor_sessions` for the History tab.

---

## Role 1 — Technical Reference

### Component graph

```
PlantDoctor
├── Tab bar (Analyse / History)
├── Analyse tab
│   ├── Photo capture row
│   │   ├── Take Photo (camera)
│   │   ├── Choose from Library
│   │   └── Image preview + annotation overlay
│   ├── (Optional) Plant Instance Picker
│   ├── Action buttons (Identify · Diagnose · Pest Scan)
│   ├── Result panel
│   │   ├── DiagnosisImageGallery (Perenual / Verdantly / Unsplash thumbnails)
│   │   ├── Diagnosis details (per disease)
│   │   ├── Pest details (per pest)
│   │   ├── Confirm value button
│   │   └── Action stack
│   │       ├── Save to My Shed
│   │       ├── Create Treatment Plan
│   │       ├── Add Supplies to Shopping (AddToListSheet)
│   │       └── Open in Care Guide
│   └── Chat link → PlantDoctorChat (sticky)
└── History tab → PlantDoctorHistory
```

### Props

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `homeId` | `string` | App.tsx | Scope |
| `userId` | `string?` | App.tsx | History scoping |
| `aiEnabled` | `boolean` | App.tsx | Gates Identify/Diagnose/Pest |
| `isPremium` | `boolean` | App.tsx | Some premium-only sub-flows |
| `perenualEnabled` | `boolean` | App.tsx | Plant DB lookups |
| `onTasksAdded` | `() => void` | App.tsx | Refresh dashboard after treatment plan |

### Local state (key items)

| State | Purpose |
|-------|---------|
| `activeTab` | "analyse" / "history" |
| `currentSessionId`, `confirmedValue` | Active session + confirmation |
| `imagePreview`, `selectedFile`, `annotations` | Photo + circle/box overlay |
| `isProcessing`, `isFetchingDetails`, `isGeneratingTreatment` | Action-in-flight flags |
| `activeAction` | "identify" / "diagnose" / "pest" / null |
| `myInventory`, `plantSearch`, `isDropdownOpen` | Plant picker |
| `aiResult` | The full `VisionResult` from PlantDoctorService |
| `selectedPlantName`, `selectedPlantScientific` | Confirmed identification |
| `sickPlantName`, `sickInventoryId`, `sickItem` | Diagnose context |
| `selectedPest` | Selected pest from result |

### Data flow — read paths

```ts
// On mount: inventory for picker
supabase.from("inventory_items").select("...").eq("home_id", homeId);

// History via hook
usePlantDoctorSessions(userId);
```

### Photo capture

- **Capacitor (native):** `Camera.getPhoto({ resultType: Uri, source: Camera | Photos })`.
- **Web (camera):** standard `<input type="file" capture="environment">`.
- **Web (library):** standard `<input type="file" accept="image/*">`.

Both buttons surface separately on mobile (no "select source" prompt — direct).

### Action handler

```ts
PlantDoctorService.analyzeImage({
  image: File,
  action: "identify_vision" | "diagnose" | "identify_pest",
  homeId,
  userId,
  plantSearch?,         // for identify
  targetPlant?,         // for diagnose
  inventoryItemId?,     // for diagnose (link result)
  areaId?,              // for diagnose
});
```

The service uploads the image to `plant-doctor-images` bucket and calls the relevant edge function (`plant-doctor-identify`, `plant-doctor-diagnose`, `plant-doctor-pest`). Returns `VisionResult` (variable schema by action).

### AI Plant Overhaul integration (Wave 2)

When the user picks an AI-sourced plant to add via this screen's flows, the underlying `plant-doctor` edge function action `generate_care_guide` now consults the global AI catalogue (`plants` where `source = 'ai' AND home_id IS NULL`):

- **Catalogue hit** → returns the cached `care_guide_data` + `db_plant_id` + `freshness_version`. No Gemini call. Response includes `fromCatalogue: true`.
- **Catalogue miss** → calls Gemini, then INSERTs a new global row + initial `plant_care_revisions` audit row. Response includes the new `db_plant_id` + `freshness_version: 1` + `fromCatalogue: false`.

This means second-and-later users to add the same species pay zero AI cost. See [AI Plant Catalogue](../99-cross-cutting/33-ai-plant-catalogue.md) (planned, Wave 9) for the full lifecycle.

### Data flow — write paths

#### Session write (initial)
```ts
supabase.from("plant_doctor_sessions").insert({
  user_id, home_id, action,
  image_url, plant_name, scientific_name,
  diagnosis, possible_pests, ...
});
```
- Used by History tab + Chat resume.

#### Save to Shed
- Creates an `inventory_items` row for the identified plant with `source = "ai"`.

#### Create Treatment Plan
- Inserts a `plans` row + appropriate `task_blueprints` for treatment.

#### Confirm value
- `confirmSession(sessionId, value)` → updates `plant_doctor_sessions.confirmed_value` for AI feedback.

### Edge functions invoked

| Function | When |
|----------|------|
| `plant-doctor-identify` | Identify action |
| `plant-doctor-diagnose` | Diagnose action |
| `plant-doctor-pest` | Pest scan |
| `plant-doctor-disease-details` | After diagnosis, drill into a specific disease |
| `plant-doctor-pest-details` | After pest scan, drill into a specific pest |
| `generate-treatment-plan` | Create Treatment Plan flow |

### Cron / scheduled jobs

None — all on-demand.

### Realtime channels

None (Chat uses its own — see [03-plant-doctor-chat.md](./03-plant-doctor-chat.md)).

### Tier gating

| Feature | Tier |
|---------|------|
| Identify / Diagnose / Pest | Sage / Evergreen (gated by `aiEnabled`) — Sprout/Botanist see "AI tier required" lock |
| Plant DB lookups | Botanist+ (`perenualEnabled`) |
| History tab | Every tier (shows past sessions) |

### Beta gating

None.

### Permissions

- `inventory.write` — gates Save to Shed.
- `planner.write` — gates Create Treatment Plan.
- `shopping.create_list` — gates Add to Shopping.

### Error states

| State | Result |
|-------|--------|
| No image | Action buttons disabled |
| AI call fails | Toast with retry; session row not created |
| Photo too large | Service compresses / resizes before upload |
| Permission denied (camera) | Falls back to library |

### Performance

- Single-image upload; compressed by `PlantDoctorService` before send.
- `aiResult` is a single struct; the result panel diff-renders without re-fetching.
- History tab lazy-loads.

### Linked storage buckets

- `plant-doctor-images` — uploaded images, public read.
- `plant-doctor-results` — sometimes cached AI response JSON (transient).

### `setPageContext` integration

On mount, the component calls `setPageContext({ page: "plant-doctor", currentTask, image, plantName })` so the floating Plant Doctor Chat button on other screens has context.

---

## Role 2 — Expert Gardener's Guide

### Why open this tool

This is Rhozly's heaviest AI hitter. Three jobs you couldn't easily do before:

1. **Identify** — "What is this plant?" Snap it, get its name + a care snapshot.
2. **Diagnose** — "What's wrong with this plant?" Snap the affected area, get likely diseases + treatments.
3. **Pest Scan** — "Is there a pest in this photo?" Snap the leaf, get a workup.

For new gardeners, this is where the app earns its keep. For experts, it's a quick second opinion.

### Every flow on this screen

#### 1. Capture a photo

- Two equal buttons on mobile: **Take Photo** (camera) and **Choose from Library**.
- Recommended: bright daylight, close-up, leaf in focus.

#### 2. (Optional) Annotate

- Circle the leaf / spot in the photo. The annotation is sent to AI with the image.
- Useful for "this specific leaf has the spots" — gets a sharper diagnosis.

#### 3. Pick which plant (Diagnose only)

- Optional but recommended — picking a specific plant from your Shed gives the AI context.

#### 4. Run an action

- **Identify** — for unknown plants.
- **Diagnose** — when something looks off.
- **Pest Scan** — when you can see bugs / damage.

#### 5. Read the result

- Identification: plant name, scientific name, care snapshot.
- Diagnosis: list of possible diseases ranked by likelihood, treatments per disease.
- Pest: list of possible pests, control measures.

#### 6. Follow-up actions

- **Save to My Shed** — adds the identified plant to your inventory.
- **Create Treatment Plan** — generates a plan + recurring blueprints to treat the issue.
- **Add Supplies to Shopping** — suggests products (fungicides, gloves, soaps) and adds to a shopping list.
- **Open in Care Guide** — full care guide for the plant.

#### 7. Confirm the value

- "Yes, this is correct" → feeds AI training. Helps the system learn over time.

### Information on display — what every field means

| Field | Meaning |
|-------|---------|
| Plant name | Common name (primary) |
| Scientific name | Latin binomial |
| Care snapshot | Sun, water, soil, hardiness — pulled from Perenual when available |
| Diagnosis | Most-likely disease + severity |
| Possible pests | Ranked list |
| Treatments | Per disease/pest — what to apply, how often |
| Image gallery | Reference photos from Perenual/Verdantly/Unsplash for comparison |

### Tier-by-tier experience

| Tier | Differences |
|------|-------------|
| Sprout / Botanist | Lock overlay on action buttons; History tab still visible. |
| Sage / Evergreen | Full access. |

### Common mistakes / pitfalls

- **Blurry photos.** Stabilise the phone; tap to focus before shooting.
- **Wrong action.** "Diagnose" without a target plant gives generic results; pick a plant.
- **Trusting the first guess.** Diagnosis usually returns multiple possibilities ranked by likelihood — read down the list.
- **Skipping confirmation.** The Confirm button feeds the AI; helps everyone.

### Recommended workflows

- **New plant on the windowsill:** Identify → Save to Shed → done.
- **Sick plant:** Diagnose with plant picked → Create Treatment Plan → tasks fire daily.
- **Bug damage:** Pest Scan → Add Supplies to Shopping → buy treatments → tick off list.

### What to do if something looks wrong

- **AI tier required despite being on Sage:** check `profile.ai_enabled`. May need re-pick tier.
- **Image upload spins forever:** check connectivity. Large images can take 10–20 s on slow networks.
- **No reference images in gallery:** Perenual / Verdantly didn't return results — common for less-common plants.

---

## Related reference files

- [Plant Doctor Chat](./03-plant-doctor-chat.md)
- [Plant Doctor History](./04-plant-doctor-history.md)
- [Photo Annotation Overlay](../08-modals-and-overlays/28-photo-annotation.md)
- [Diagnosis Image Gallery](../08-modals-and-overlays/30-diagnosis-gallery.md)
- [Plant Source Picker](../08-modals-and-overlays/03-plant-source-picker.md)
- [AI — Gemini (cross-cutting)](../99-cross-cutting/13-ai-gemini.md)

## Code references for ongoing maintenance

- `src/components/PlantDoctor.tsx` — orchestrator
- `src/services/plantDoctorService.ts` — API + storage upload
- `src/hooks/usePlantDoctorSessions.ts` — history
- `src/components/PlantInstancePicker.tsx` — pick from Shed
- `src/components/DiagnosisImageGallery.tsx` — reference images
- `src/components/PhotoAnnotationOverlay.tsx` — annotate before send
- `supabase/functions/plant-doctor-identify/index.ts`
- `supabase/functions/plant-doctor-diagnose/index.ts`
- `supabase/functions/plant-doctor-pest/index.ts`
- `supabase/functions/generate-treatment-plan/index.ts`
