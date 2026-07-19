# Plant Lens (formerly Plant Doctor)

> The AI vision tool for plants — point a camera, get a comprehensive analysis (the primary path) or run a single targeted action (identify / diagnose / pest / Multi-ID). Photo in → AI analysis → care plan, treatment, pest workup → optional follow-up actions (save to Shed, generate routines, add supplies to shopping). The **Analyse** path is the recommended default and also produces a list of suggested tasks ready to drop into the user's calendar in one tap.

> **Naming note:** the user-facing name was **Plant Doctor** until Quick Access Wave 17 — the screen heading, the quick-link tile and most user-facing copy now say **Plant Lens** (broader: identify + diagnose + care suggestions, all camera-first). The **route stays `/doctor`** and internal action ids (`identify_vision` / `diagnose` / `identify_pest` / `analyse_comprehensive` / `identify_scene`) are unchanged. The separate floating sticky chat overlay (mounted globally on every page) remains branded **Garden AI** and is documented in [`03-plant-doctor-chat.md`](./03-plant-doctor-chat.md). They share Gemini infrastructure but are distinct surfaces — don't conflate them in copy or in nav.

**Route:** `/doctor`
**Source file:** `src/components/PlantDoctor.tsx` (~1,800 lines)

---

## Quick Summary

**Tier gating (Sprint 3, 2026-06-15):** `identify_vision` is **open to every tier with a sliding-window quota** — Sprout / Botanist users get 5 free identifications per rolling 7-day window. Sage+ users get unlimited everything. Diagnose, Pest, Analyse, and Multi-ID remain Sage+ only. When a free user exhausts their quota, the server returns a `quota_exhausted` marker (still status 200 — easier for the client to inspect than 429) which surfaces an upgrade modal that links to `/gardener`. Quota state rides on every successful identify response so the badge updates without a second request. Quota helper: [`supabase/functions/_shared/identifyQuota.ts`](../../../supabase/functions/_shared/identifyQuota.ts).

Four actions powered by Gemini Vision via `PlantDoctorService`:

| Action | API action | What you get |
|--------|-----------|--------------|
| **Analyse** ✨ (primary) | `analyse_comprehensive` | Identification + health + sunlight check + pruning + propagation + edibility/ripeness + (optional) disease + (optional) pest + `suggested_tasks[]` ready for `TaskActionButtons` |
| Identify | `identify_vision` | Plant name(s), scientific name, care snapshot |
| Diagnose | `diagnose` | Diseases possible, treatments, severity, plant-instance link |
| Pest Scan | `identify_pest` | Possible pests, control measures |
| **Multi-ID** | `identify_scene` | One photo of **several** plants → a bounding box per detected plant (overlaid on the image) + a mapping listing each box's ranked candidate identities with a confidence weight. Each run writes a single **"Group ID" history session** (`action: "scene"`, `results.regions`); per plant the user can **select + confirm** an identity (updates the session's `results.confirmed[regionIndex]` in place — kept in History, shown in the drill-down), tap a candidate for **library-first/AI info** (pills + description + **See full care** → `PlantDetailModal`), and **check plants to add to the Shed** (their confirmed identity, resolved library-first then AI via `saveToShed`). |

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
├── Analyse tab — panel sheds its card chrome below md (max-md:p-0 / bg-transparent /
│   │             border-0 / shadow-none) so the capture surface reads near-full-bleed
│   │             on phones; the classic card panel returns from md up (Phase 4.4)
│   ├── Step progress (Upload → Analyse → Results)
│   ├── Camera-first upload zone (no photo yet — min-h-[60vh] on phones, sm:min-h-[400px])
│   │   ├── Camera glyph circle (replaced the Upload glyph, Phase 4.4)
│   │   ├── "Upload or take a photo" heading (e2e contract — don't rename)
│   │   ├── Open Camera — leading gradient hero (bg-brand-gradient-soft)
│   │   ├── Upload File — secondary (white + hairline border; e2e contract name)
│   │   └── Persona-aware photo tip (inline sentence vs `?` tooltip)
│   ├── Image frame (photo chosen — max-h-[55vh] mobile, 400px at xl)
│   │   ├── PhotoAnnotationOverlay (preview + circle/box annotations)
│   │   ├── AnalysisWaitOverlay (while isProcessing — staged AI-wait, Phase 4.4)
│   │   └── Remove-photo button
│   ├── Annotation controls + multi-photo strip (Wave 19)
│   ├── (Optional) Plant Instance Picker
│   ├── Action buttons
│   │   ├── ✨ Analyse (primary, full-width gradient hero — the only loud element)
│   │   └── Identify · Diagnose · Pest · Multi-ID (unified neutral grid, colored
│   │       icons via status tokens; hidden in compact — Phase 4.4)
│   ├── Result panel
│   │   ├── AnalyseResultCard (when activeAction === "analyse")
│   │   │   ├── Identification (always open) — SparkleAccent on the common name
│   │   │   ├── Health & Light (always open) — health pill + sunlight check
│   │   │   ├── Pruning (collapsible)
│   │   │   ├── Propagation & Cuttings (collapsible)
│   │   │   ├── Edibility & Ripeness (only when is_edible)
│   │   │   ├── Disease (open by default, red accent — only when present)
│   │   │   ├── Pest (open by default, red accent — only when present)
│   │   │   └── TaskActionButtons (chat's existing task-commit UI — drop-in)
│   │   ├── SceneMapResultCard (when activeAction === "scene") — box overlay + weighted mapping
│   │   │   ├── per region: select+confirm · ⓘ info (PlantInfoPanel) + See full care (PlantDetailModal) · check
│   │   │   └── sticky "Add N to Shed" → ensureCataloguePlantFromSearchResult → saveToShed
│   │   ├── Doctor's Notes card (identify / diagnose / pest) — SparkleAccent on the heading
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
| `aiEnabled` | `boolean` | App.tsx | `false` → the free-identify gate card replaces the action grid (Sprint 3 quota model — see Tier gating); `true` → full action grid |
| `isPremium` | `boolean` | App.tsx | Some premium-only sub-flows |
| `perenualEnabled` | `boolean` | App.tsx | Plant DB lookups |
| `onTasksAdded` | `() => void` | App.tsx | Refresh dashboard after treatment plan |
| `compact` | `boolean?` | `/quick/lens` only | Mobile Quick Access Wave 2 — hides header, Analyse/History tab bar, and the secondary Identify/Diagnose/Pest action row. Keeps photo capture, plant picker, Analyse hero, and result card. Default `false`. |

### Local state (key items)

| State | Purpose |
|-------|---------|
| `activeTab` | "analyse" / "history" |
| `currentSessionId`, `confirmedValue` | Active session + confirmation |
| `photos: PhotoEntry[]` | Multi-photo strip (Wave 19) — `selectedFile` / `imagePreview` derive from `photos[0]` |
| `imagePreview`, `selectedFile`, `annotations`, `annotatingPhoto` | Photo + circle/box overlay + annotate-mode toggle |
| `isProcessing`, `isFetchingDetails`, `isGeneratingTreatment` | Action-in-flight flags — `isProcessing` also mounts `AnalysisWaitOverlay` over the image frame (Phase 4.4) |
| `activeAction` | `"identify" \| "diagnose" \| "pest" \| "analyse" \| "scene" \| null` — drives result-panel branching AND selects the wait overlay's stage script |
| `myInventory`, `plantSearch`, `isDropdownOpen` | Plant picker |
| `aiResult` / `analyseResult` / `sceneResult` | `VisionResult` (identify/diagnose/pest) / `AnalyseResult` / `SceneMapResult` per action family |
| `identifyQuota`, `quotaExhaustedModal` | Sprint-3 free-identify quota state (badge counter + exhaustion upgrade modal) |
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

### Photo capture (camera-first, Phase 4.4)

Below `md` the analyse panel sheds its card chrome (`max-md:p-0 max-md:bg-transparent max-md:backdrop-blur-none max-md:border-0 max-md:shadow-none`) so the capture surface reads near-full-bleed inside the shell padding; from `md` up the classic card panel returns. The empty-state upload zone (`data-testid="doctor-upload-zone"`) fills `min-h-[60vh]` on phones (`sm:min-h-[400px]` from `sm` up) with a **camera** glyph in the circle (the Upload glyph was replaced in this pass) and two buttons — stacked full-width on phones, side-by-side from `sm`:

- **Open Camera** — the leading hero: `bg-brand-gradient-soft` gradient, `shadow-raised`, spring press (`active:scale-[0.97]`). Calls `handleNativeCamera` → Capacitor `Camera.getPhoto({ resultType: Base64, source: Camera })` (native camera on iOS/Android; Capacitor's browser fallback on web). Permission denied → toast "Camera access denied — please enable it in your device settings"; any other camera failure → toast suggesting upload instead. No silent fallback to the library.
- **Upload File** — secondary (white + hairline border). Opens the hidden `<input type="file" accept="image/*" multiple>` shared with the multi-photo strip's "+" affordance.

The heading copy **"Upload or take a photo"** and the **"Upload File"** button name are load-bearing for e2e (`PlantDoctorPage.uploadDropzone` / `.uploadFileButton`) — don't rename either without updating the Page Object.

Once a photo is chosen, the image frame caps at `max-h-[55vh]` on mobile (`400px` at `xl`) with the annotation overlay, the staged wait overlay (below) and the remove-photo button layered inside it.

### Staged AI-wait overlay (Phase 4.4)

While `isProcessing` is true, `src/components/lens/AnalysisWaitOverlay.tsx` mounts over the image frame (`data-testid="doctor-wait-overlay"`, `aria-live="polite"`): a blurred, scaled copy of the user's own photo (`scale-110 blur-md`) under a deep-green scrim (`bg-rhozly-deep/60`), a spinner, a stage line, and a "Usually 5–15 seconds" footer. Stage copy advances every **2.4 s** and **holds on the last stage**; the parent unmounts the overlay the instant the response settles — it is purely cosmetic and can never delay results (success **or** error, so the failure toast is never hidden behind it).

Stages per action (keyed off `activeAction`; unknown/null falls back to the `analyse` script):

| Action | Stages |
|--------|--------|
| `identify` | Reading your photo… → Matching with Pl@ntNet… → Cross-checking with Rhozly AI… |
| `diagnose` | Reading your photo… → Examining the symptoms… → Consulting Rhozly AI… |
| `pest` | Reading your photo… → Looking for the culprit… → Consulting Rhozly AI… |
| `analyse` | Reading your photo… → Identifying the plant… → Checking health, pruning & harvest… → Writing up the findings… |
| `scene` | Reading your photo… → Mapping every plant in view… |

The copy deliberately mirrors the **real** pipeline — identify runs Pl@ntNet first with a Gemini cross-check (see [Pl@ntNet (cross-cutting)](../99-cross-cutting/38-plantnet.md)); diagnose / pest / scene are Gemini-only; analyse identifies first and then runs the full section sweep — no invented steps. It also deliberately avoids the words "analyze" and "error": the DOC-010 e2e assertion matches those strings when looking for the failure toast, and the overlay must never satisfy it.

### Action buttons (Phase 4.4 unified treatment)

The ✨ Analyse hero keeps its full-width gradient (`from-rhozly-primary to-rhozly-primary/80`) and remains **the only loud element** on the panel. The four secondary actions were previously four different pastel tints (emerald/amber/rose/sky); they now share ONE neutral treatment — `bg-rhozly-surface-lowest` + hairline `border-rhozly-outline/15`, press language (`active:scale-[0.97] active:duration-100`, `touch-manipulation`) — with meaning carried by **colored icons via status tokens**:

| Button (label / sub) | testid | Icon token |
|--------|--------|-----------|
| Identify / Plant | `doctor-btn-identify` | `text-status-success-ink` |
| Diagnose / Health | `doctor-btn-diagnose` | `text-status-weather-ink` |
| Identify / Pest | `doctor-btn-pest` | `text-status-watch-ink` |
| Multi-ID / Many plants | `doctor-btn-multi-id` | `text-status-sensor-ink` |

The pressed / in-flight state (`activeAction === action`) is solid primary (`bg-rhozly-primary text-white shadow-md`). Labels, testids and disabled semantics are unchanged from before the redesign — e2e targets the accessible names ("Identify Plant", "Diagnose Health"). The grid stays hidden in `compact` mode.

### Multi-photo strip (Wave 19)

Every single-plant action (`identify` / `diagnose` / `pest` / `analyse`) accepts **up to 5 photos** per run. Multi-ID stays single-photo by design — its premise is one overview shot with several plants. The strip lives below the annotation row in `PlantDoctor.tsx` and writes the `photos: PhotoEntry[]` state. Single-photo callers see no UX change: the strip collapses to one thumbnail.

- Each thumbnail has a remove button and an organ chip (`Auto` / `Leaf` / `Flower` / `Fruit` / `Bark`). Tapping the chip cycles values — Pl@ntNet uses these per-image to improve accuracy.
- The "+ Add another photo" affordance reuses the existing file input so capture buttons remain mobile-friendly.
- `selectedFile` / `imagePreview` continue to derive from `photos[0]` so the bulk of the JSX (annotation overlay, preview area, history mounting) stayed untouched.
- Multi-ID warns if the user has >1 photo and uses only the first.

### Pl@ntNet primary identifier (Wave 19)

`identify_vision` and the ID step of `analyse_comprehensive` now route through Pl@ntNet first. See [Pl@ntNet (cross-cutting)](../99-cross-cutting/38-plantnet.md) for the full contract. Quick recap:

- **score ≥ 0.4** → trust Pl@ntNet. `identify_vision`'s `possible_names` is synthesised from Pl@ntNet's top matches. **Wave 21.0010 update:** Gemini now runs in parallel and its top 3 candidates surface under a new `ai_alternatives` field, which the UI renders as an "Also from Rhozly AI" tile group below the Pl@ntNet tiles — so users can compare the LLM's independent guess against Pl@ntNet's confident match. `analyse_comprehensive` runs Gemini for everything else and feeds the confirmed species into the prompt as before.
- **0.15 ≤ score < 0.4** → cross-check. Both run; the response includes `identification_source: "plantnet+ai_confirmed"` or `"plantnet_vs_ai_disagreement"` and an `ai_suggested_name` chip when they differ. `ai_alternatives` is unused here because `possible_names` already carries Gemini's data.
- **score < 0.15** or rejected → AI fallback (today's behaviour).

The response includes `plantnet: { best_match, top_matches, identification_source, ai_suggested_name, remaining_requests }` which the result cards render as a provenance pill (`Pl@ntNet` / `Pl@ntNet + AI agreed` / `Pl@ntNet (AI disagreed)` / `AI only`).

Missing `PLANTNET_API_KEY` → silent AI-only fallback with a warn-level log. Pl@ntNet errors (auth, quota, network) → also silent fallback so the user always gets *some* result.

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

The five vision-heavy actions (`identify_vision`, `diagnose`, `identify_pest`, `analyse_comprehensive`, `identify_scene`) opt into a dedicated **Pro-first cascade** instead of the default Flash cascade:

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
| `identify_scene` | **Multi-ID** button — detects every distinct plant and returns `regions[{ box_2d:[ymin,xmin,ymax,xmax] (0–1000), candidates:[{ name, scientific_name, confidence }] }]`. Uses the Pro-first cascade at temperature 0.2 with **`maxOutputTokens: 8192`** (the Pro thinking models spend most of the default 2048 on reasoning, truncating the JSON otherwise). The response is parsed via `_shared/sceneJson.ts::parseSceneJson` — tolerant of a prose preamble / code fence / mid-array truncation (salvages complete regions, never throws). Server-side it then drops malformed/empty regions, clamps confidence, sorts candidates, caps at 12. The function itself writes no session (logged via `logAiUsage`); the **client** writes one **"Group ID" `scene` session** per run (`results.regions`) and updates `results.confirmed` in place as the user confirms plants. |
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
| Identify (`identify_vision`) | **Every tier** (Sprint 3 quota model — see Quick Summary). Sprout / Botanist get 5 free identifications per rolling 7-day window: with `aiEnabled === false` the action grid is replaced by the free-identify gate card (`plant-doctor-ai-gate`) containing an enabled `doctor-btn-identify-free` button and a `doctor-quota-badge` used/remaining counter. Server-side quota via `_shared/identifyQuota.ts`; exhaustion returns a `quota_exhausted` marker → upgrade modal. |
| Diagnose / Pest / Analyse / Multi-ID | Sage / Evergreen (gated by `aiEnabled`). For free tiers these buttons are **not rendered at all** — an upgrade card (`doctor-upgrade-link` → `/gardener`) stands in. All rate-limited via the shared `enforceRateLimit`. |
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
| AI call fails | The wait overlay unmounts with `isProcessing` the instant the call settles, so the error toast is never hidden behind it. Toast with retry; session row not created |
| Non-image file selected | Skipped at selection with toast "Skipped <name> — not an image." (asserted by DOC-013) |
| Photo too large | Files > 10 MB are skipped at selection ("Skipped <name> — over 10MB."); accepted images are compressed / resized by the service before upload |
| Permission denied (camera) | Toast "Camera access denied — please enable it in your device settings"; any other camera failure toasts a prompt to upload instead |

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
5. **Multi-ID** — "What are all these plants?" Snap one photo containing several plants; the AI draws a box around each plant on the image and lists, per box, its best-guess identities with a confidence weighting. Best for a mixed bed, a nursery shelf, or a friend's border you want to make sense of in one shot. Identification-only — it doesn't add anything to your garden.

For new gardeners, **Analyse** is where the app earns its keep — one tap, one full answer. For experts, the targeted actions are a faster path when you already know what you're checking for, and **Multi-ID** turns "what's all this?" into a single labelled photo.

### Every flow on this screen

#### 1. Capture a photo

- On your phone the screen is camera-first: the capture zone fills most of the display, with **Open Camera** as the big green gradient button and **Upload File** just beneath it. On a laptop or tablet the classic panel layout returns and the two buttons sit side by side.
- Recommended: bright daylight, close-up, leaf in focus. If you're newer to gardening the photo tip is written out under the buttons; experienced gardeners get a small `?` to tap instead.

#### 2. (Optional) Annotate

- Circle the leaf / spot in the photo. The annotation is sent to AI with the image.
- Useful for "this specific leaf has the spots" — gets a sharper diagnosis.

#### 3. Pick which plant (Diagnose only)

- Optional but recommended — picking a specific plant from your Shed gives the AI context.

#### 4. Run an action

- **Analyse** ✨ — when you want the full picture (default choice for most users). It's the big gradient button, deliberately the only loud one on the panel.
- **Identify** — for unknown plants where you only need a name.
- **Diagnose** — when something looks off on a known plant.
- **Pest Scan** — when you can see bugs / damage.
- The four smaller actions all share the same quiet look now — the coloured icon tells you which is which (green = identify, amber = diagnose, rose = pest, sky blue = Multi-ID).
- **While the AI works** (usually 5–15 seconds) your own photo blurs behind a deep-green veil and a short line of progress copy steps through what's genuinely happening — "Matching with Pl@ntNet…", "Checking health, pruning & harvest…" and so on, depending on which action you chose. It's honest, not theatre: each line matches a real step in the pipeline, and the veil vanishes the instant the result lands.

#### 5. Read the result

- **Analyse**: scrollable card with all sections. Identification + Health open by default; Pruning, Propagation, Edibility/Disease/Pest sections expand on tap. The identified plant's name arrives with a little sparkle of twinkling stars — that's Rhozly's signature for "an AI just told you this", and you'll only ever see it once per screen. A pre-checked **Suggested Tasks** block sits at the bottom — review, deselect anything you don't want, and one tap commits them to your calendar.
- Identify / Diagnose / Pest: the write-up appears under a sparkling **Doctor's Notes** heading — same signature, same meaning.
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
| Sprout / Botanist | **Identify is free** — 5 identifications per rolling 7-day window, via a green "Free for everyone" card with a live used/remaining counter (it tells you when a slot frees up). Diagnose, Pest Scan, Analyse and Multi-ID don't appear at all — an upgrade card with a "See plans" link stands in their place. History tab still visible. |
| Sage / Evergreen | Full access — unlimited identifications plus all four AI actions. |

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

- **Seeing the free-identify / upgrade cards despite being on Sage:** check `profile.ai_enabled`. May need re-pick tier.
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
- [Pl@ntNet (cross-cutting)](../99-cross-cutting/38-plantnet.md) — the real identify pipeline the wait-overlay copy mirrors
- [Design System (cross-cutting)](../99-cross-cutting/40-design-system.md) — SparkleAccent, status tokens, brand gradient, press language

## Code references for ongoing maintenance

- `src/components/PlantDoctor.tsx` — orchestrator
- `src/components/lens/AnalysisWaitOverlay.tsx` — staged AI-wait overlay (Phase 4.4): blurred copy of the user's photo + per-action honest stage copy while `isProcessing`
- `src/components/ui/SparkleAccent.tsx` — the design-system AI signature (Doctor's Notes heading + the AnalyseResultCard common-name reveal)
- `src/components/lens/AnalyseResultCard.tsx` — comprehensive analysis result rendering (Mobile Quick Access Wave 1)
- `src/components/lens/SceneMapResultCard.tsx` — Multi-ID result: box overlay + weighted candidate mapping (two-way highlight), per-region select+confirm, ⓘ info + See full care, check + Add-to-Shed
- `src/lib/sceneMap.ts` — pure box→percent / validation / top-candidate helpers (unit-tested in `tests/unit/lib/sceneMap.test.ts`)
- `src/lib/plantInfoResolver.ts` — shared library→provider→AI resolver (also used by CompanionPlantsTab; unit-tested in `tests/unit/lib/plantInfoResolver.test.ts`)
- `src/lib/saveToShed.ts` — shed insert used by the Multi-ID add path
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
