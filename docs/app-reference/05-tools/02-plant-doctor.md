# Plant Doctor

> The AI vision tool for plants — point a camera, get a comprehensive analysis (the primary path) or run a single targeted action (identify / diagnose / pest). Photo in → AI analysis → care plan, treatment, pest workup → optional follow-up actions (save to Shed, generate task schedule, add supplies to shopping). The new **Analyse** path is the recommended default and also produces a list of suggested tasks ready to drop into the user's calendar in one tap.

**Route:** `/doctor`
**Source file:** `src/components/PlantDoctor.tsx` (~1,800 lines)

---

## Quick Summary

Four actions powered by Gemini Vision via `PlantDoctorService`:

| Action | API action | What you get |
|--------|-----------|--------------|
| **Analyse** ✨ (primary) | `analyse_comprehensive` | Identification + health + sunlight check + pruning + propagation + edibility/ripeness + (optional) disease + (optional) pest + `suggested_tasks[]` ready for `TaskActionButtons` |
| Identify | `identify_vision` | Plant name(s), scientific name, care snapshot |
| Diagnose | `diagnose` | Diseases possible, treatments, severity, plant-instance link |
| Pest Scan | `identify_pest` | Possible pests, control measures |

The `plant-doctor` edge function also exposes **two non-screen actions** consumed by the [Localized Task Calendar](../02-dashboard/10-localized-task-calendar.md):

| Action | What it returns | Tier gate |
|--------|----------------|-----------|
| `lookup_frost_dates` | Cached frost dates for the home (writes `home_climate` on first miss). One Gemini call per home per 6-month TTL. | Open to all tiers |
| `plant_when_to_plant` | Per-plant planting guidance (earliest/latest outdoor dates, indoor-start, spacing, depth, tips), anchored to the home's frost dates. | Sage+ only |

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
│   ├── Action buttons
│   │   ├── ✨ Analyse (primary, full-width hero)
│   │   └── Identify · Diagnose · Pest Scan (secondary row)
│   ├── Result panel
│   │   ├── AnalyseResultCard (when activeAction === "analyse")
│   │   │   ├── Identification (always open)
│   │   │   ├── Health & Light (always open) — health pill + sunlight check
│   │   │   ├── Pruning (collapsible)
│   │   │   ├── Propagation & Cuttings (collapsible)
│   │   │   ├── Edibility & Ripeness (only when is_edible)
│   │   │   ├── Disease (open by default, red accent — only when present)
│   │   │   ├── Pest (open by default, red accent — only when present)
│   │   │   └── TaskActionButtons (chat's existing task-commit UI — drop-in)
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
| `aiEnabled` | `boolean` | App.tsx | Gates Identify/Diagnose/Pest/Analyse |
| `isPremium` | `boolean` | App.tsx | Some premium-only sub-flows |
| `perenualEnabled` | `boolean` | App.tsx | Plant DB lookups |
| `onTasksAdded` | `() => void` | App.tsx | Refresh dashboard after treatment plan |
| `compact` | `boolean?` | `/quick/lens` only | Mobile Quick Access Wave 2 — hides header, Analyse/History tab bar, and the secondary Identify/Diagnose/Pest action row. Keeps photo capture, plant picker, Analyse hero, and result card. Default `false`. |

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
// identify / diagnose / pest (legacy)
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

// Analyse (Mobile Quick Access Wave 1)
PlantDoctorService.analyseComprehensive({
  homeId,
  imageBase64,
  mimeType,
  targetPlant?,         // optional grounding
  inventoryItemId?,     // optional — enriches env context
  areaId?,              // optional — enriches env context
  deviceLat?, deviceLng?,
});
// → AnalyseResult: identification, health, pruning, propagation, edibility?, disease?, pest?, suggested_tasks[]
```

All actions route through the single `plant-doctor` edge function (action-discriminated). The service uploads the image to `plant-doctor-images` bucket. Returns `VisionResult` for legacy actions, `AnalyseResult` for `analyse_comprehensive`. The `analyse_comprehensive` action emits `suggested_tasks` in the same shape the chat already produces, so the result card drops `<TaskActionButtons />` straight in — no new task-writing path.

### Vision-cascade model selection

The four vision-heavy actions (`identify_vision`, `diagnose`, `identify_pest`, `analyse_comprehensive`) opt into a dedicated **Pro-first cascade** instead of the default Flash cascade:

```
1. gemini-2.5-pro          ($1.25 / $10.00 per 1M)  ← primary
2. gemini-3.1-pro-preview  ($2.00 / $12.00)         ← fallback
3. gemini-3-flash-preview  ($0.50 / $3.00)          ← Flash safety net
4. gemini-2.5-flash        ($0.30 / $2.50)          ← last resort
```

Defined as `VISION_DIAGNOSIS_MODELS` in `_shared/gemini.ts`. Passed as `models:` to `callGeminiCascade` for those four actions only — every other plant-doctor action stays on the default Flash cascade. Trades ~20× cost per call (still cents) for noticeably better visual reasoning. Pro models actually "look at" the image with more care, which matters when hallucinated symptoms damage user trust.

### Anti-hallucination (diagnose + identify_pest)

Both `diagnose` and `identify_pest` actions use a **two-stage reasoning prompt** + **temperature 0.2** + **server-side confidence floor (50)** + the **Pro-first cascade above** to keep the model honest about visible evidence:

- **Stage 1 — Visible features inventory.** The prompt instructs the model to first enumerate every literally-visible symptom (or insect body part) in the photo. Empty inventory → empty result is a valid answer.
- **Stage 2 — Diagnose from evidence.** The model may ONLY diagnose conditions whose required visible symptoms appeared in Stage 1. Species susceptibility + regional climate REFINE probability of candidates whose evidence is present; they do NOT justify diagnosing conditions whose evidence isn't visible.
- **Temperature 0.2** instead of the cascade default (0.7) — conservative, consistent answers preferred over creative guesses.
- **Confidence floor 50** filters `possible_diseases` / `possible_pests` server-side before the response leaves the function. If filtering empties the list, severity gets downgraded to `"Healthy"` (diagnose) or `is_pest`/`pest_severity` get nulled (pest) so the UI never shows "Medium severity" or "Harmful pest" without a named condition.

The defaults are tunable inline constants (`DIAGNOSE_CONFIDENCE_FLOOR` / `PEST_CONFIDENCE_FLOOR`) — lower them if a real subtle symptom is getting filtered too often.

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

All actions go through the single `plant-doctor` edge function, discriminated by the `action` field in the request body:

| Action value | When |
|----------|------|
| `analyse_comprehensive` | ✨ Analyse button (Mobile Quick Access Wave 1) — one Gemini call returns the full structured analysis + `suggested_tasks` |
| `identify_vision` | Identify button |
| `diagnose` | Diagnose button |
| `identify_pest` | Pest Scan button |
| `lookup_frost_dates` | Mobile Quick Access Wave 3 — cached frost-date lookup (open to all tiers). Reads/writes `home_climate`. |
| `plant_when_to_plant` | Mobile Quick Access Wave 3 — per-plant planting guidance anchored to the home's frost dates. Sage+ only. |
| `get_ai_disease_info` | After diagnosis, drill into a specific disease (AI) |
| `fetch_perenual_disease` | After diagnosis, drill into a specific disease (Perenual lookup) |
| `generate_remedial_plan` | Used by the legacy "Create Treatment Plan" flow |
| `generate_care_guide` | Save to Shed → care guide generation |

The shared `_shared/visionEnvContext.ts::buildEnvBlock` helper provides environmental enrichment (area, lux, companions, recent tasks, weather) for `diagnose` and `analyse_comprehensive`. Both Sage+ tier-gated and rate-limited.

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

This is Rhozly's heaviest AI hitter. Four jobs you couldn't easily do before:

1. **Analyse** ✨ — "Tell me everything about this plant." Snap it once, get identification, health & light read, pruning method, propagation technique, edibility & ripeness check, plus optional disease and pest sections if anything's wrong — and a pre-checked list of tasks ready to add to your calendar in one tap. **The recommended default for most users**, especially the in-the-garden moment when you don't know what you're looking at.
2. **Identify** — "What is this plant?" Snap it, get its name + a care snapshot. Best when you already know it's healthy and you just need a name.
3. **Diagnose** — "What's wrong with this plant?" Snap the affected area, get likely diseases + treatments. Best when you have a known plant that looks unwell.
4. **Pest Scan** — "Is there a pest in this photo?" Snap the leaf, get a workup. Best when you can see insects or damage.

For new gardeners, **Analyse** is where the app earns its keep — one tap, one full answer. For experts, the three targeted actions are a faster path when you already know what you're checking for.

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

- **Analyse** ✨ — when you want the full picture (default choice for most users).
- **Identify** — for unknown plants where you only need a name.
- **Diagnose** — when something looks off on a known plant.
- **Pest Scan** — when you can see bugs / damage.

#### 5. Read the result

- **Analyse**: scrollable card with all sections. Identification + Health open by default; Pruning, Propagation, Edibility/Disease/Pest sections expand on tap. A pre-checked **Suggested Tasks** block sits at the bottom — review, deselect anything you don't want, and one tap commits them to your calendar.
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

- **In the garden, unknown plant, "tell me everything":** Analyse → review pre-checked tasks → tap to add. One-tap result; the rich one.
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
- `src/components/lens/AnalyseResultCard.tsx` — comprehensive analysis result rendering (Mobile Quick Access Wave 1)
- `src/components/TaskActionButtons.tsx` — shared task-commit UI (writes `task_blueprints` / `tasks` / `task_dependencies`). Consumed by both PlantDoctorChat and AnalyseResultCard.
- `src/services/plantDoctorService.ts` — API + storage upload; defines `AnalyseResult` type + `analyseComprehensive` method
- `src/hooks/usePlantDoctorSessions.ts` — history
- `src/components/PlantInstancePicker.tsx` — pick from Shed
- `src/components/DiagnosisImageGallery.tsx` — reference images
- `src/components/PhotoAnnotationOverlay.tsx` — annotate before send
- `supabase/functions/plant-doctor/index.ts` — all action handlers (identify_vision / diagnose / identify_pest / analyse_comprehensive / etc.)
- `supabase/functions/_shared/visionEnvContext.ts` — `buildEnvBlock` helper shared by diagnose + analyse_comprehensive
- `supabase/tests/visionEnvContext.test.ts` — Deno tests for the env-block helper
- `tests/unit/components/AnalyseResultCard.test.ts` — Vitest tests for the result card rendering
