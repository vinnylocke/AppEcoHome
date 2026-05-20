# Plan — Mobile Quick Access screen

## Goal

A phone-friendly home screen that surfaces the three things most useful while you're physically in the garden:

1. **Visual Lens** — point/upload a photo → get a comprehensive plant analysis OR run the existing identify / diagnose / pest paths.
2. **Localized Task Calendar** — today's tasks + rain forecast + watering recommendations + a new "when should I plant this?" AI helper that uses local frost dates.
3. **Digital Journal — Quick Capture** — snap a photo + write a note, save to today's journal without picking a plant first. Assign it to a plant/area later from desktop.

The bottom nav and top bar stay so users can still drop into the full app at any time. This is a **shortcut layer**, not a replacement for the existing screens.

## Personas

**Amateur gardener (Rhozly's target user):** "I'm watering, I notice yellow leaves on my tomatoes, I want to take a photo and know what's wrong AND what to do about it — without scrolling through menus." The Visual Lens with the new Analyse button answers this in one tap.

**Expert gardener:** "I'm pruning my apple tree and want to log what I cut + a photo for next year. I'm wearing gloves, I just want to capture, not file." Quick Capture journal answers this — capture now, file later.

Both use the same screen; the layout is task-oriented, not data-oriented.

## App-reference files consulted

- [04-tools/01-plant-doctor.md](../app-reference/04-tools/01-plant-doctor.md) — current Plant Doctor surface (Identify / Diagnose / Pest). Visual Lens reuses its image upload + result rendering primitives.
- [02-dashboard/01-home-dashboard.md](../app-reference/02-dashboard/01-home-dashboard.md) (if it exists; otherwise the index links to HomeDashboard) — current home layout. The mobile quick screen REPLACES this as the default on phone; the desktop version stays as-is.
- [08-modals-and-overlays/10-plant-journal-tab.md](../app-reference/08-modals-and-overlays/10-plant-journal-tab.md) — existing journal flow inside Instance Edit Modal. Quick Capture reuses the photo + save mechanics but with `inventory_item_id` set later.
- [99-cross-cutting/10-edge-functions-catalogue.md](../app-reference/99-cross-cutting/10-edge-functions-catalogue.md) — plant-doctor entry. The new Analyse action lands here.
- [99-cross-cutting/23-capacitor.md](../app-reference/99-cross-cutting/23-capacitor.md) — native detection patterns. Mobile detection uses `Capacitor.isNativePlatform()` + viewport width.
- [99-cross-cutting/27-weather.md](../app-reference/99-cross-cutting/27-weather.md) — `weather_snapshots`. Task Calendar's rain forecast reads from here.
- [99-cross-cutting/29-seasonality.md](../app-reference/99-cross-cutting/29-seasonality.md) — `getHemisphere()`, period ranges. Planting calendar extends this with frost dates.

## Architecture overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Routing                                                                  │
│    /  → on phone (Capacitor native OR viewport < 768px): /quick           │
│      → on desktop: /dashboard (unchanged)                                  │
│    /quick (NEW) — Quick Access home for phone users                       │
│    /quick/lens (NEW) — Visual Lens (extends Plant Doctor)                 │
│    /quick/calendar (NEW) — Localized Task Calendar                        │
│    /quick/journal (NEW) — Quick Capture journal                           │
│    All other routes work the same on both layouts.                        │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│  Bottom nav stays present — adds "Quick" as the leftmost item on phone    │
│  so the user can return from any screen.                                  │
└──────────────────────────────────────────────────────────────────────────┘
```

The 3 quick-access screens are **opinionated mobile wrappers** around existing systems:

| Quick screen | Wraps / reuses |
|---|---|
| Visual Lens | Existing `PlantDoctor.tsx` image upload + `plant-doctor` edge fn. New `Analyse` action added as a 4th button. The existing identify / diagnose / pest paths remain; the new Analyse path produces a combined result in one Gemini call. |
| Task Calendar | Existing `TasksPanel` (today's tasks) + `WeatherForecast` (rain) + new `PlantingCalendar` component (frost-aware planting timing via AI). |
| Quick Capture | Existing `PhotoUploader` + a slim wrapper that writes to `plant_journals` with `inventory_item_id = NULL` (requires schema migration to make the column nullable). The existing `PlantJournalTab` continues to work — `inventory_item_id` is set when the user assigns the entry from desktop. |

## Feature 1 — Visual Lens

### Behaviour

A single-screen tap-to-photo experience with **four** distinct action buttons (instead of the current three):

| Button | What it does | Edge fn action |
|---|---|---|
| Identify | "What plant is this?" | `identify_vision` (existing) |
| Diagnose | "Is something wrong?" | `diagnose` (existing) |
| Pest | "Is this a pest?" | `identify_pest` (existing) |
| **Analyse (NEW)** | "Tell me everything about this plant" | `analyse_comprehensive` (NEW) |

The Analyse button is the headline. It returns a structured payload:

```ts
type AnalyseResult = {
  // Always present
  identification: {
    common_name: string;
    scientific_name: string[];
    confidence: number;
  };
  health: {
    state: "healthy" | "stressed" | "diseased" | "pest_damaged";
    notes: string;
    sunlight_appears_appropriate: boolean | null; // null if unclear from photo
    sunlight_notes: string | null;
  };
  pruning: {
    method: string;       // "tip-pinching" / "selective branch cuts" / …
    where_to_cut: string; // "above the third node down" …
    how_to_cut: string;
    tips: string[];
  };
  propagation: {
    method: string;       // "softwood cuttings" / "division" / …
    when: string;         // "late spring" / "now" — relative to hemisphere
    steps: string[];
  };
  edibility: {
    is_edible: boolean;
    ripeness: "not_yet" | "near_ripe" | "ripe" | "overripe" | null;
    estimated_days_until_ripe: number | null;
    notes: string | null;
  } | null;
  // Conditional branches
  disease: {
    name: string;
    cure_methods: string[];
    prevention_methods: string[];
  } | null;
  pest: {
    name: string;
    removal_methods: string[];
    prevention_methods: string[];
  } | null;
};
```

Server-side, this is **one Gemini call** with a single rich `responseSchema`. We get back the whole picture in one round trip instead of forcing the user to run Identify → then Diagnose → then look up pruning.

Image + location context are sent the same way the existing `diagnose` action does it (`imageBase64`, `mimeType`, optional `homeId` for location-aware seasonal advice).

The Analyse path goes through the existing rate-limit + tier gate. Cost: one Gemini call, comparable to `diagnose` today. Sage+ tiered access.

### File touch list

| File | Change |
|---|---|
| `supabase/functions/plant-doctor/index.ts` | New action `analyse_comprehensive` with the new schema + a comprehensive prompt that asks Gemini for all the fields above. Reuses `requireAuth`, `enforceRateLimit`, `logAiUsage`, the existing image-handling helpers. |
| `src/services/plantDoctorService.ts` | New method `analyseComprehensive(params)` mirroring the shape of `analyzeImage`. |
| `src/components/lens/VisualLens.tsx` (NEW) | The mobile screen — image picker, four action buttons, result card. Imports existing `PhotoUploader` for the picker. |
| `src/components/lens/AnalyseResultCard.tsx` (NEW) | Renders the structured AnalyseResult. Six sections (Identification, Health, Pruning, Propagation, Edibility, then optional Disease + Pest). |
| `src/components/PlantDoctor.tsx` | **Also** gets the new Analyse button on the existing /doctor screen, so desktop users can use it too. The mobile screen and the desktop screen share the same `AnalyseResultCard`. |

### Why not duplicate the Plant Doctor screen?

Tempting alternative: build VisualLens as a fork of PlantDoctor with the new button + mobile styling. Rejected because (a) we'd then maintain two image-picker / camera / result flows, and (b) the user explicitly said "we have a lot of these features already developed which we can reuse most of/expand". The new button drops into both surfaces; the mobile screen is a **layout** around the shared primitives.

## Feature 2 — Localized Task Calendar

### Behaviour

One scrollable mobile screen with three sections, top to bottom:

1. **Today's tasks** — reuses `TasksPanel` in compact mode (just the title + count + tappable rows).
2. **Today's weather** — reuses `WeatherForecast` in compact mode. Adds a "Will I need to water?" tile that synthesises:
   - Total rainfall forecast for today + tomorrow
   - The user's open watering tasks for today
   - A copy snippet: *"Skip watering — 8mm of rain expected by 6pm"* OR *"Water today — only 0.2mm forecast"*.
3. **Planting calendar (NEW)** — a card with:
   - Last-frost-date + first-frost-date for the home's location (read once, cached)
   - A text input: "What do you want to plant?"
   - On submit → calls a new edge fn action `plant_when_to_plant(plantName, homeId)` that returns:
     ```ts
     {
       can_plant_outdoors_now: boolean;
       earliest_outdoor_date: string;     // ISO date
       latest_outdoor_date: string;       // ISO date
       indoor_start_recommended: boolean;
       indoor_start_date: string | null;  // ISO date
       spacing_cm: number;
       depth_cm: number;
       tips: string[];
     }
     ```

### Frost dates — where they come from

**Decision: AI-fetched + cached per home.**

We don't have a frost-dates table or external service. Each home asks Gemini once per season (hemisphere + country + postcode → frost dates + hardiness zone), cached in a new `home_climate` table with a 6-month TTL. If a home's row is stale or missing on first `plant_when_to_plant` call, we transparently refresh in the same edge-fn invocation.

Cost: ~1 Gemini call per home per 6 months. The accuracy upside (postcode-level vs continent-level) clearly wins for an amateur user who's never heard of hardiness zones.

### File touch list

| File | Change |
|---|---|
| `supabase/migrations/<ts>_home_climate.sql` (NEW) | Table `home_climate(home_id PK, last_frost_iso, first_frost_iso, hardiness_zone, last_frost_lookup_at)`. RLS: home members can SELECT; service-role writes. |
| `supabase/functions/plant-doctor/index.ts` | New actions `lookup_frost_dates(homeId)` and `plant_when_to_plant(plantName, homeId)`. Both read/write `home_climate`. |
| `src/components/calendar/LocalizedTaskCalendar.tsx` (NEW) | The mobile screen. Composes TasksPanel + WeatherForecast (compact mode) + new sub-components below. |
| `src/components/calendar/RainWaterAdvice.tsx` (NEW) | "Will I need to water?" tile. |
| `src/components/calendar/PlantingCalendarCard.tsx` (NEW) | Frost dates display + plant-when input + result render. |
| `src/components/TasksPanel.tsx` | Add a `compact` prop. Defaults to false. Mobile screen passes `true`. |
| `src/components/WeatherForecast.tsx` | Add a `compact` prop. Same pattern. |

## Feature 3 — Digital Journal (Quick Capture)

### Behaviour

A capture-first journal mode. Three states:

1. **Capture** (mobile screen default): camera button + text field. One Save button. The entry lands in `plant_journals` with `inventory_item_id = NULL`, `subject = "Quick capture {time}"` (or user-supplied), `description`, `image_url`.
2. **My recent captures** (mobile screen): a list of the last 7 days of unassigned captures (`inventory_item_id IS NULL`). Each row is tappable → opens an assignment sheet.
3. **Assignment** (mobile or desktop): pick a plant from the user's shed → updates `inventory_item_id` on the journal row. Reuses the existing plant picker from `PlantSourcePicker`.

The desktop `PlantJournalTab` continues to work for plants the user opens directly — the new flow is additive.

### Schema change

The current `plant_journals` table has `inventory_item_id` `NOT NULL` (it's the FK + presumably part of the indexes / RLS). We need to make it nullable.

```sql
-- supabase/migrations/<ts>_plant_journals_nullable_inventory.sql

ALTER TABLE public.plant_journals
  ALTER COLUMN inventory_item_id DROP NOT NULL;

-- Update RLS so unassigned entries are still scoped per-home via home_id.
-- The existing policy probably joins through inventory_items; we need to
-- add a fallback when inventory_item_id IS NULL → use home_id directly.
DROP POLICY IF EXISTS "Users can view their plant journals" ON public.plant_journals;
CREATE POLICY "Users can view their plant journals"
  ON public.plant_journals FOR SELECT
  TO authenticated
  USING (
    home_id IN (SELECT home_id FROM public.home_members WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can insert their plant journals" ON public.plant_journals;
CREATE POLICY "Users can insert their plant journals"
  ON public.plant_journals FOR INSERT
  TO authenticated
  WITH CHECK (
    home_id IN (SELECT home_id FROM public.home_members WHERE user_id = auth.uid())
  );
-- Update + delete policies follow the same pattern.
```

**Existing-data safety**: dropping `NOT NULL` is non-destructive — every existing row keeps its non-null value. The RLS rewrite uses the same `home_id` membership check the existing policy uses (just without requiring `inventory_item_id`); existing rows still resolve to the same home_id and stay visible to the same users.

### File touch list

| File | Change |
|---|---|
| `supabase/migrations/<ts>_plant_journals_nullable_inventory.sql` (NEW) | Drop NOT NULL + RLS rewrite. |
| `src/components/journal/QuickCapture.tsx` (NEW) | The mobile capture screen. PhotoUploader + textarea + save. |
| `src/components/journal/RecentCaptures.tsx` (NEW) | List of recent unassigned + assigned entries. |
| `src/components/journal/AssignToPlantSheet.tsx` (NEW) | Bottom-sheet plant picker for assignment. |
| `src/components/PlantJournalTab.tsx` | If `inventory_item_id IS NULL` on a row, it's a draft — but this component is per-instance so it won't see drafts anyway. **No change**. |
| `src/hooks/useUnassignedJournals.ts` (NEW) | Fetches `plant_journals WHERE inventory_item_id IS NULL AND home_id = X` for the recent-captures list. |

## Mobile detection + routing

### Detection

A small new hook:

```ts
// src/hooks/useIsMobile.ts
import { Capacitor } from "@capacitor/core";
import { useEffect, useState } from "react";

export function useIsMobile(): boolean {
  const isNative = Capacitor.isNativePlatform();
  const [isNarrow, setIsNarrow] = useState(() =>
    typeof window !== "undefined" && window.innerWidth < 768,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => setIsNarrow(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return isNative || isNarrow;
}
```

Native capacitor app → always mobile. Web → mobile when viewport is < 768px. Resize listener handles browser dev-tools toggling.

### Routing

```tsx
// src/App.tsx (sketch)
<Route path="/" element={<Navigate to={isMobile ? "/quick" : "/dashboard"} />} />
<Route path="/quick" element={<QuickAccessHome />} />
<Route path="/quick/lens" element={<VisualLens />} />
<Route path="/quick/calendar" element={<LocalizedTaskCalendar />} />
<Route path="/quick/journal" element={<QuickCaptureJournal />} />
```

The `/quick` screen is a simple three-tile grid (image + label) that navigates to each sub-route. Tile size + spacing tuned for one-thumb operation.

### Nav bar

The existing bottom nav stays. On phone, we add a **"Quick"** item as the leftmost icon so users can return to the quick screen from anywhere. The existing "Dashboard" item still works — power users can pin it. On desktop the Quick item is hidden (the desktop hero is the dashboard).

## Reuse map (what we already have)

| Existing | Reused by Quick Access |
|---|---|
| `PhotoUploader` (image picker + camera) | Visual Lens, Quick Capture |
| `PlantDoctorService.analyzeImage()` | Visual Lens (existing buttons) |
| `plant-doctor` edge fn — auth, rate limit, image handling helpers | Visual Lens (new Analyse action) |
| `TasksPanel` | Task Calendar |
| `WeatherForecast` | Task Calendar |
| `plant_journals` table | Quick Capture (with nullable inventory_item_id) |
| `PlantSourcePicker` | Assignment sheet |
| `getHemisphere()`, period ranges (`src/lib/seasonal.ts`) | Planting Calendar (frost dates) |
| `useCachedShed` (plant list for assignment) | Assignment sheet |
| `Capacitor.isNativePlatform()` | Mobile detection |
| Bottom nav (existing) | Adds one item; rest stays |

## What this DOESN'T change

- The full Plant Doctor screen at `/doctor` keeps working with all four buttons (including the new Analyse).
- The Dashboard at `/dashboard` stays the home screen for desktop users.
- The InstanceEditModal Journal tab still works exactly as today.
- All existing journal entries stay attached to their plants (we're only adding the **option** of unassigned).
- Tier gating (Sage+ for AI features) unchanged.

## Wave plan

Build in three slices so each wave is shippable on its own:

### Wave 1 — Visual Lens (~4 days)
- New `analyse_comprehensive` action in plant-doctor (server-side first, with tests).
- `AnalyseResultCard` component.
- Add the Analyse button to the existing `PlantDoctor.tsx` so desktop users get it.
- Skip the new `/quick/lens` route in this wave — let desktop validate the AI quality first.
- Deno tests for the new prompt + schema.
- Deploy → verify on prod with real photos.

### Wave 2 — Quick Access shell + Visual Lens mobile route (~2 days)
- `useIsMobile` hook.
- `/quick` → `QuickAccessHome` three-tile grid.
- `/quick/lens` route reusing the Wave 1 component.
- Bottom nav adds the Quick item on phone only.
- Manual test on a real phone + iOS Capacitor build.

### Wave 3 — Localized Task Calendar (~3 days)
- `home_climate` migration + RLS.
- New edge fn actions `lookup_frost_dates`, `plant_when_to_plant`.
- Compact mode on `TasksPanel` + `WeatherForecast`.
- `LocalizedTaskCalendar` screen.
- `PlantingCalendarCard` with the AI helper.
- Deploy.

### Wave 4 — Quick Capture journal (~3 days)
- Migration: nullable `inventory_item_id` on `plant_journals` + RLS rewrite.
- `QuickCapture` screen + `RecentCaptures` list + `AssignToPlantSheet`.
- `useUnassignedJournals` hook.
- E2E: capture → reload → see in recent captures → assign → confirm appears in plant's journal tab.
- Deploy.

Each wave gets its own plan doc when we start it (per CLAUDE.md). This master plan stays as the architectural overview.

## Tests

| Wave | Tier | What to cover |
|---|---|---|
| 1 | Deno | Analyse prompt + schema (mock Gemini, assert response shape matches the union branches) |
| 1 | Vitest | `AnalyseResultCard` rendering for the various conditional sections |
| 2 | Vitest | `useIsMobile` (mock Capacitor + window) |
| 2 | Playwright | `/quick` routing — desktop redirects to dashboard, phone viewport redirects to /quick |
| 3 | Deno | `lookup_frost_dates` cache behaviour (hit / refresh-after-6mo / miss) |
| 3 | Vitest | `PlantingCalendarCard` with mocked AI response |
| 4 | Vitest | `useUnassignedJournals` |
| 4 | Playwright | Capture → assign → appears in instance modal |

## Data-safety audit (per "don't break existing users")

| Change | Risk to existing data |
|---|---|
| `analyse_comprehensive` action added | None — additive |
| `home_climate` table added | None — net new |
| `lookup_frost_dates` / `plant_when_to_plant` actions added | None — additive |
| Compact mode on TasksPanel / WeatherForecast (new prop, defaults false) | None — existing call sites unaffected |
| `plant_journals.inventory_item_id` drop NOT NULL | **None** — relaxing a constraint can't invalidate existing rows. Every existing row still has its value. |
| `plant_journals` RLS rewrite | The new policy checks `home_id` directly instead of joining through inventory_items. Existing rows still have `home_id` set (it's NOT NULL) so visibility is identical. **Will manually verify against prod data shape during the Wave 4 plan.** |
| New routes / new bottom nav item | None — routing additions, no destructive change |

## Risk register

| Risk | Mitigation |
|---|---|
| Gemini struggles to fill all Analyse fields from a poor-quality photo | Make every conditional branch nullable; if the model returns "unknown" for ripeness, we just hide that section. The schema enforces presence on a known small set (identification + health), everything else is optional. |
| Mobile detection misfires (e.g. wide phone in landscape) | `Capacitor.isNativePlatform()` is the truth on native. On web, viewport < 768 covers ~98% of phones; landscape phones briefly cross the threshold but still get a usable layout (Quick Access tiles work fine on a wide screen). |
| User on phone wants the dashboard | Bottom nav has both Quick AND Dashboard items. Power users can route directly to /dashboard. We don't remove the dashboard, we just default to Quick. |
| Quick Capture entries pile up unassigned | The recent-captures list is the assignment surface — gentle nudge. Could add a count badge on the bottom-nav Journal icon later if it becomes a problem. |
| `home_climate` AI lookup hits the per-hour rate limit on a fresh home | The flow caches aggressively (6-month TTL per home). First call per home + per season costs one Gemini call. Acceptable. |
| The new Analyse path returns wildly different content than diagnose | They serve different jobs — diagnose is "what's wrong", analyse is "tell me everything". Separate prompts, separate schemas. We can iterate on prompt phrasing without affecting diagnose. |

## Files in this plan (summary)

**New files:**
- `src/hooks/useIsMobile.ts`
- `src/hooks/useUnassignedJournals.ts`
- `src/components/lens/VisualLens.tsx`
- `src/components/lens/AnalyseResultCard.tsx`
- `src/components/calendar/LocalizedTaskCalendar.tsx`
- `src/components/calendar/RainWaterAdvice.tsx`
- `src/components/calendar/PlantingCalendarCard.tsx`
- `src/components/journal/QuickCapture.tsx`
- `src/components/journal/RecentCaptures.tsx`
- `src/components/journal/AssignToPlantSheet.tsx`
- `src/components/QuickAccessHome.tsx`
- `supabase/migrations/<ts>_home_climate.sql`
- `supabase/migrations/<ts>_plant_journals_nullable_inventory.sql`

**Edited files:**
- `supabase/functions/plant-doctor/index.ts` (3 new actions)
- `src/services/plantDoctorService.ts` (new methods)
- `src/components/PlantDoctor.tsx` (4th Analyse button + result rendering)
- `src/components/TasksPanel.tsx` (compact prop)
- `src/components/WeatherForecast.tsx` (compact prop)
- `src/App.tsx` (new routes + nav item)

**App-reference files to write/update:**
- New: `docs/app-reference/02-dashboard/04-quick-access-home.md`
- New: `docs/app-reference/04-tools/04-visual-lens.md`
- New: `docs/app-reference/04-tools/05-localized-task-calendar.md`
- New: `docs/app-reference/04-tools/06-quick-capture-journal.md`
- Update: `docs/app-reference/04-tools/01-plant-doctor.md` (add the Analyse action)
- Update: `docs/app-reference/99-cross-cutting/10-edge-functions-catalogue.md` (3 new actions)
- Update: `docs/app-reference/99-cross-cutting/29-seasonality.md` (frost dates)
- Update: `docs/app-reference/00-INDEX.md` (new entries)

## Process

For each wave:

1. Write the wave's own plan doc (`docs/plans/mobile-quick-access-wave-N.md`), brief and focused on that slice.
2. Get user approval on that wave's plan.
3. Build, test, deploy.
4. Re-check this master plan and update if scope shifted.

## Locked decisions

| Question | Decision |
|---|---|
| Frost dates source | **AI-fetched + cached per home** (new `home_climate` table, 6-month TTL). |
| Analyse button placement on desktop `/doctor` | **First in the row, visually highlighted as primary** (slightly larger, coloured accent). Signals "this is the one you probably want." Identify / Diagnose / Pest remain as secondary actions. |
| Recent Captures retention | **Show all unassigned, no cutoff.** The list is the assignment queue — nothing falls off until the user files it. |
