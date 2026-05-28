# Crop Rotation Engine

## Goal

Per-area crop rotation intelligence — show what's been grown in each area over the last 3 seasons, flag families that have been repeated, and recommend what families to grow next year. The same intelligence is fed into AI surfaces (`generate-swipe-plants`, `generate-garden-overhaul`, etc.) so plant suggestions inherently respect rotation rules.

Two visible outcomes:

1. **AreaDetails gets a "Crop rotation" card** — compact season-by-season family timeline + a "What to grow next" recommendation with avoid/prefer chips.
2. **AI prompts everywhere** that already include `buildGardenContext` automatically gain a rotation block per area, so when someone asks "what should I plant in the South Bed?" the AI knows you grew tomatoes there last year and won't suggest tomatoes again.

## Investigation summary

- `plants.family` and `plant_library.family` both already exist (text columns). Real-world data is patchy — the AI populates them when known but many rows are NULL. Plan handles NULL gracefully by excluding from recommendations but still listing in history.
- `inventory_items` already carries the data we need: `area_id`, `plant_id`, `planted_at`, `ended_at` (newly added), `created_at`, `status`. Look back over the last 3 calendar years per area.
- `inventory_items.area_id` is `text` (legacy), but it's a string UUID in practice — the helper coerces uniformly.
- `gardenContext.ts` is the load-bearing AI context module — used by Garden Overhaul today and the natural place to inject rotation history per area.
- `generate-swipe-plants` doesn't currently see garden context; it only sees owned plant names. Adding rotation context here is the highest-leverage AI improvement.
- Indoor areas (`areas.is_outside = false`) — rotation rules don't really apply. The card hides; the AI block skips.
- No new table needed.

## App-reference files consulted

- [`docs/app-reference/99-cross-cutting/03-data-model-plants.md`](docs/app-reference/99-cross-cutting/03-data-model-plants.md)
- [`docs/app-reference/03-garden-hub/04-area-details.md`](docs/app-reference/03-garden-hub/04-area-details.md) — placement for the new card
- [`docs/app-reference/99-cross-cutting/13-ai-gemini.md`](docs/app-reference/99-cross-cutting/13-ai-gemini.md) — how garden context flows into prompts
- [`docs/app-reference/99-cross-cutting/29-seasonality.md`](docs/app-reference/99-cross-cutting/29-seasonality.md) — hemisphere-aware season boundaries

## Sensible-default decisions (revised)

| Decision | Choice |
|---|---|
| Schema changes | **None.** `plants.family` exists, `inventory_items.area_id` exists, `inventory_items.ended_at` exists (just added). Pure compute on the existing graph. |
| Family scope (display) | **No filter.** Use whatever `plants.family` says. There are 400+ flowering plant families — we'd never enumerate them all and shouldn't try. Every family the user has grown shows up in the timeline. |
| Family rotation rules | **A targeted 12-family rules map** (`src/lib/rotationFamilies.ts`) for the well-known edible rotation groups: Solanaceae, Brassicaceae, Fabaceae, Alliaceae, Cucurbitaceae, Apiaceae, Asteraceae, Amaranthaceae, Lamiaceae, Poaceae, Polygonaceae, Chenopodiaceae. **This is only used to drive the avoid/prefer recommendation — not to filter what shows in the history.** Families outside the map appear in the timeline with no avoid/prefer recommendation issued for them. |
| Lookback (display) | **Unlimited.** Show every year we have data for. The user can scroll back as far as they planted. |
| Lookback (recommendation rule) | The biological "avoid" rule uses **last 3 calendar years** because that's how long most pathogens stay in soil — this is a biology constant, not a UI choice. The user sees the full timeline regardless. |
| What counts as "grown in season X" | Any `inventory_items` row whose plant_id resolves to a family AND `(planted_at OR ended_at OR created_at)` falls within calendar year X. Both archived and live plants count — last year's harvest is still last year's family. |
| Season granularity | **Calendar year.** Annuals overlap years messily but the user's mental model is "what did I have here last year". Multi-year perennials show up in every season they were active. |
| Indoor areas | **Hide the card** on `areas.is_outside === false`. Skip the rotation block in the AI prompt for those areas. |
| Persona-aware copy | Show both common name and Latin family side by side ("Tomato family · Solanaceae"). New gardener gets an InfoTooltip explaining why rotation matters; expert sees the same data without the explainer. |
| Recommendation logic | "Avoid X" = family is in the rules map AND grown 2+ of last 3 years OR grown in the most recent year for families with `avoidYears >= 2`. "Prefer Y" = partner families from the avoided families' partner lists, minus anything currently in the avoid list. |
| Behaviour with no data | First-year areas show an empty state ("First time here? Anything goes — Rhozly will start tracking rotation once you plant something."). |
| AreaDetails placement | **A new collapsible "Insights" panel** between metadata and the plant list. Default *expanded* when there's an active avoid recommendation, *collapsed* otherwise. Slot designed to host future per-area intelligence (companion suggestions, pest pressure, yield insights). State persisted to localStorage per area. |
| Reason strings (free / Botanist) | **Hard-coded** in the rules map — predictable, fast, no AI quota burn ("Adds nitrogen for next year's heavy feeders"). |
| Reason strings (Sage / Evergreen) | **Gemini-generated** per actual garden context ("Your tomatoes did well here last year, but the brassicas need the nitrogen the peas would leave behind"). Same edge call powers Layer B's plant suggestions. |
| AI prompt injection (Layer A — context) | Extend `_shared/gardenContext.ts` + wire directly into `generate-swipe-plants`, `generate-tasks`, `smart-plant-scheduler`, and Plant Doctor when the surface is area-scoped. Cheap, broad coverage. |
| AI active suggestion (Layer B — new feature) | New **"Suggest plants for next season"** CTA on the rotation card → new edge fn `suggest-rotation-plants` → returns 5–8 plant suggestions with `reason` + `schedulable_tasks[]`. Routes into the existing AddToCalendarSheet so the user can generate planting tasks from the suggestion. Tier-gated to AI users. |
| Caching | None at the data layer. Per-area history is a single `inventory_items` query with a `plants` join — fast under the existing indexes. The AreaRotationCard memoises against `inventory_items` for the home. |
| Tier gating | **Display + context-injection: free.** **Layer B (active suggestion) + Gemini-generated reason strings: Sage / Evergreen + `ai_enabled = true`.** |

## Architecture

### Pure helpers (browser + edge fn share the family map)

```
src/lib/rotationFamilies.ts          ← family map (12 known families)
src/lib/rotationEngine.ts            ← classify + roll up + recommend (browser)
supabase/functions/_shared/rotationFamilies.ts  ← same map, duplicated server-side
supabase/functions/_shared/rotationContext.ts   ← server-side equivalent for AI prompts
```

The `rotationFamilies.ts` content is kept in sync between client and edge fn by being functionally identical. A unit test (Deno + Vitest) reads both and asserts the family keys match.

### Public API — `src/lib/rotationEngine.ts`

```ts
export interface AreaRotationHistory {
  areaId: string;
  seasons: Array<{
    year: number;
    families: Array<{ family: string; commonName: string; plantNames: string[] }>;
  }>;
}

export interface RotationRecommendation {
  /** Families to avoid this year + the reason. */
  avoid: Array<{ family: string; commonName: string; reason: string }>;
  /** Families to consider next — partners of the avoided + neutral options. */
  prefer: Array<{ family: string; commonName: string; reason: string }>;
}

export function buildAreaRotationHistory(
  rows: InventoryItemForRotation[],
  /** Calendar year the recommendation is for. Defaults to current year. */
  targetYear?: number,
  /** Lookback in years. Defaults to 3. */
  lookback?: number,
): AreaRotationHistory;

export function recommendRotation(
  history: AreaRotationHistory,
): RotationRecommendation;

export function getRotationGroupForFamily(
  family: string | null,
): RotationGroup | null;
```

### UI — `src/components/AreaRotationCard.tsx`

| Element | Purpose |
|---|---|
| Header | "Crop rotation" + persona-aware InfoTooltip ("Why rotate? Different families take different nutrients from the soil and host different pests…") |
| Year timeline | Three columns (or rows on mobile) — most recent year first. Each shows the families grown there with plant names beneath. |
| Recommendation banner | "Avoid Solanaceae this year — you grew it 2 of the last 3 years." When there's nothing to avoid: "Looking good — anything will fit here this year." |
| Avoid chips | Red-toned pills with common name + Latin family. |
| Prefer chips | Green-toned pills with common name + Latin family + one-line reason ("Adds nitrogen for next year's heavy feeders"). |
| Empty state | "First time here? Anything goes — Rhozly will start tracking rotation once you plant something." |

Embedded inside `AreaDetails.tsx` — slot after the existing area metadata, before the plant list.

### AI injection — `_shared/gardenContext.ts`

The existing `GardenContextSnapshot.areas` array gets a new optional `rotation` field per area:

```ts
interface AreaSnapshotPlus {
  // …existing fields…
  rotation?: {
    history_3y: Array<{ year: number; families: string[] }>;
    avoid: string[];
    prefer: string[];
  };
}
```

Rendered in the prompt block as:

```
Area: South Bed (outside)
  pH:6.5 medium:loam drainage:well-drained
  Rotation history: 2026 Solanaceae · 2025 Asteraceae · 2024 Solanaceae
  Avoid this year: Solanaceae (grown 2 of last 3 years)
  Prefer this year: Brassicaceae, Fabaceae, Alliaceae
```

### Wiring `generate-swipe-plants`

The fn currently `select`s `inventory_items + areas` only. Extend to also join `plants(family)` and the helper rolls up rotation per area. Append a `ROTATION CONTEXT` block to the system prompt instructing the AI to avoid the listed families when suggesting plants.

### Layer B — `suggest-rotation-plants` edge function

| Aspect | Detail |
|---|---|
| Auth | `requireAuth` + `guardAiByUser` |
| Tier | Sage / Evergreen + `ai_enabled = true` |
| Input | `{ areaId: string }` |
| Server-side gather | The area + the area's rotation history (last 3 years) + the home's climate + areas + persona |
| Gemini prompt | Structured: "Suggest 5–8 plants for this area for next season. Avoid families listed in `avoid`. Prefer families in `prefer`. Include `reason` per suggestion. For each, include a `schedulable_tasks` array compatible with the AddToCalendarSheet shape." |
| Output | `{ suggestions: Array<{ plant_name, scientific_name?, family?, reason, schedulable_tasks: SchedulableTask[] }>, generated_reasons: Record<family, string> }` |
| Used by | The "Suggest plants for next season" CTA on the rotation card. Clicking a suggestion opens AddToCalendarSheet with the schedulable_tasks pre-filled. |
| Audit logging | `logAiUsage` so it appears on the Audit Page. |

## Files

### New

| File | Purpose |
|---|---|
| `src/lib/rotationFamilies.ts` | The 12-family **rules** map (browser side). Names what to avoid + partner families + hard-coded reasons. |
| `src/lib/rotationEngine.ts` | History rollup + recommendation pure functions. |
| `src/components/AreaInsightsPanel.tsx` | Collapsible Insights container slotted into AreaDetails. Hosts the rotation card today + future per-area intelligence. |
| `src/components/AreaRotationCard.tsx` | The rotation card inside the Insights panel. |
| `supabase/functions/_shared/rotationFamilies.ts` | Same family rules map, server side. Tested for parity with the browser version. |
| `supabase/functions/_shared/rotationContext.ts` | Server-side rollup using the same logic. Used by gardenContext + every other AI surface that takes garden context. |
| `supabase/functions/suggest-rotation-plants/index.ts` | New edge fn for Layer B — generates 5–8 plant suggestions with reasoning + schedulable_tasks. |
| `supabase/functions/suggest-rotation-plants/prompt.ts` | Pure prompt builder, testable. |
| `tests/unit/lib/rotationEngine.test.ts` | Vitest — classification + recommendation logic. |
| `tests/unit/lib/rotationFamilies.test.ts` | Vitest — family normalisation + lookup. |
| `supabase/tests/rotationContext.test.ts` | Deno — server helper + parity check that client + server family maps share the same keys. |
| `supabase/tests/suggestRotationPlants.test.ts` | Deno — prompt builder tests. |

### Modified

| File | Change |
|---|---|
| `src/components/AreaDetails.tsx` | Render `<AreaInsightsPanel>` between existing metadata block and the plant list. Skip when `area.is_outside === false`. |
| `supabase/functions/_shared/gardenContext.ts` | Extend `existing_plants` query to include `plant_id` + family. Add per-area rotation lookup. Render the rotation lines into the prompt block. |
| `supabase/functions/generate-swipe-plants/index.ts` | Append a `ROTATION CONTEXT` block to the system prompt. |
| `supabase/functions/generate-tasks/index.ts` | Inject area-scoped rotation context when generating planting tasks. |
| `supabase/functions/smart-plant-scheduler/index.ts` | Inject area-scoped rotation context. |
| `supabase/functions/plant-doctor/index.ts` (the conversational handler) | When the request carries an area context, include the rotation block. |
| `docs/app-reference/03-garden-hub/04-area-details.md` | New "Insights panel + Crop rotation" section. |
| `docs/app-reference/99-cross-cutting/03-data-model-plants.md` | Cross-reference the rotation engine. |
| `docs/app-reference/99-cross-cutting/10-edge-functions-catalogue.md` | Add `suggest-rotation-plants`. |
| `docs/app-reference/99-cross-cutting/13-ai-gemini.md` | Note the rotation block in the prompt format. |

## Steps (sequenced)

### Phase 1 — Core engine + display

1. **`rotationFamilies.ts`** (client + server) — the rules map. Tests for normalisation.
2. **`rotationEngine.ts`** + Vitest tests — pure functions for rollup + recommendation.
3. **`AreaInsightsPanel.tsx`** + **`AreaRotationCard.tsx`** — UI with collapsible state persisted to localStorage.
4. **Wire into `AreaDetails.tsx`**.

### Phase 2 — AI context injection (Layer A)

5. **Server-side `rotationFamilies.ts` + `rotationContext.ts`** + Deno tests (including parity assertion).
6. **Extend `gardenContext.ts`** — per-area rotation lines.
7. **Wire `generate-swipe-plants`** + **`generate-tasks`** + **`smart-plant-scheduler`** + **plant-doctor** to include the rotation block when context is area-scoped.

### Phase 3 — AI active suggestions (Layer B)

8. **`suggest-rotation-plants` edge fn** + prompt builder + Deno tests.
9. **"Suggest plants for next season" CTA** on the rotation card → opens a sheet that lists Gemini's suggestions with `Add to calendar` per suggestion → routes through the existing AddToCalendarSheet so generated tasks land normally.
10. **AI-tier-gated Gemini reason strings** on the AreaRotationCard for users with `ai_enabled = true` (replaces the hard-coded reasons inline).

### Wrap-up

11. **App-reference docs** — 4 updates.
12. **Vitest + Deno pass.** Typecheck clean.
13. **Deploy.** No DB push needed (no schema changes).

## Confirmed decisions (from review)

1. **Family scope** — no enumerated list; use whatever `plants.family` says. The 12-family map is just the **rotation rules** map, not a display filter.
2. **Lookback** — unlimited on display. The "avoid grown 2+ of last 3 years" rule is a biology fact, not a UI cap.
3. **AI surfaces** — Layer A context injection into `gardenContext`, `generate-swipe-plants`, `generate-tasks`, `smart-plant-scheduler`, plant-doctor. PLUS Layer B's new `suggest-rotation-plants` edge fn powering an active "Suggest plants for next season" CTA with task generation via AddToCalendarSheet.
4. **Placement** — new collapsible **AreaInsightsPanel** on AreaDetails as a slot for future per-area intelligence. Default expanded when there's an active "avoid" recommendation, collapsed otherwise. State persisted to localStorage per area.
5. **Reason strings** — hard-coded for Sprout / Botanist (predictable, no AI burn). Gemini-generated for Sage / Evergreen (tailored to actual garden context).

Ready to implement in the order above.
