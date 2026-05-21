# Plan — Plant Grow Guides

## Goal

A new **Grow Guide** tab on plant species cards (Shed) and plant instance cards (InstanceEditModal) showing comprehensive AI-generated step-by-step content across 9 categories: Water, Soil, Sunlight, Propagation, Germination, Pruning, Flowering, Harvesting, and Senescence. The guide is generated once per species (one Gemini call), cached in a new table, refreshed on a 90-day cron + on-demand. Available to all plant sources (ai / manual / api / verdantly).

## App-reference files consulted

- [99-cross-cutting/03-data-model-plants.md](../app-reference/99-cross-cutting/03-data-model-plants.md) — `plants` table shape, source enum, existing freshness pattern (`last_freshness_check_at`, `freshness_version`)
- [99-cross-cutting/10-edge-functions-catalogue.md](../app-reference/99-cross-cutting/10-edge-functions-catalogue.md) — pattern for the new edge fn action and cron
- [99-cross-cutting/11-cron-jobs.md](../app-reference/99-cross-cutting/11-cron-jobs.md) — `refresh-stale-ai-plants` cron is the template
- [99-cross-cutting/13-ai-gemini.md](../app-reference/99-cross-cutting/13-ai-gemini.md) — `responseSchema` for consistent JSON; `callGeminiCascade` wrapper
- [99-cross-cutting/19-rls-patterns.md](../app-reference/99-cross-cutting/19-rls-patterns.md) — catalogue-level "everyone can read, only service-role writes" pattern
- [99-cross-cutting/17-tier-gating.md](../app-reference/99-cross-cutting/17-tier-gating.md) — Sage+ for AI generation
- [08-modals-and-overlays/06-plant-edit-modal.md](../app-reference/08-modals-and-overlays/06-plant-edit-modal.md) — where the new tab lands (Shed plant card)
- [08-modals-and-overlays/08-instance-edit-modal.md](../app-reference/08-modals-and-overlays/08-instance-edit-modal.md) — same for plant instances

Source files studied:
- [supabase/functions/refresh-stale-ai-plants/index.ts](../../supabase/functions/refresh-stale-ai-plants/index.ts) — template for the new cron
- [supabase/functions/_shared/refreshStaleAiPlants.ts](../../supabase/functions/_shared/refreshStaleAiPlants.ts) — shared cron logic + diff helper pattern
- [supabase/functions/_shared/aiPlantCatalogue.ts](../../supabase/functions/_shared/aiPlantCatalogue.ts) — `diffCareGuide` (we'll write a sibling `diffGrowGuide`)
- [supabase/functions/plant-doctor/index.ts](../../supabase/functions/plant-doctor/index.ts) — pattern for new `generate_grow_guide` action
- [src/components/PlantEditModal.tsx](../../src/components/PlantEditModal.tsx) — tabs array; add a new `grow_guide` entry between `care` and `guides`
- [src/components/InstanceEditModal.tsx](../../src/components/InstanceEditModal.tsx) — `activeTab` union; same insertion
- [src/components/PlantGuidesTab.tsx](../../src/components/PlantGuidesTab.tsx) — existing community-guides tab; **not modified**, just sibling to the new one

## Locked decisions

| Question | Decision |
|---|---|
| Tab name | **"Grow Guide"** — new tab between existing "Care Guide" and "Guides" (community). Naming hierarchy: Care Guide = at-a-glance snapshot, Grow Guide = deep AI how-to, Guides = community user-written. |
| Refresh strategy | Cron + on-demand (90-day stale check via new cron, plus a "Refresh" button on the tab) |
| Manual plants | Generate from name + any user-supplied notes (best-effort) |
| Generation shape | Single Gemini call returning the full envelope |
| Tab placement | Both Shed plant card AND Instance Edit modal |
| Storage | New `plant_grow_guides` table (1:1 with `plants.id`) — separable from `plants.care_guide_data` so we can iterate independently |
| Generation gating | Sage+ AI tier required for the Generate/Refresh button; viewing existing guides open to all tiers |
| Modularity | JSON envelope with `schema_version` + `sections[]` so future categories slot in without migrations |

## Architecture

### New table — `plant_grow_guides`

```sql
CREATE TABLE public.plant_grow_guides (
  -- 1:1 with plants. PK = plant_id (no surrogate key needed).
  plant_id                int  PRIMARY KEY REFERENCES public.plants(id) ON DELETE CASCADE,

  -- The whole guide envelope (sections + per-section content).
  -- Shape enforced server-side via Gemini responseSchema; see GROW_GUIDE_SCHEMA below.
  guide_data              jsonb NOT NULL,

  -- Freshness tracking — mirrors the AI care guide pattern.
  schema_version          int  NOT NULL DEFAULT 1,
  freshness_version       int  NOT NULL DEFAULT 1,
  last_generated_at       timestamptz NOT NULL DEFAULT now(),
  last_freshness_check_at timestamptz,           -- NULL → eligible for next cron run
  updated_fields          jsonb,                  -- list of section categories that changed in the last regen

  -- Standard audit
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- Cron's scan index — find guides needing a refresh, NULL first.
CREATE INDEX plant_grow_guides_stale_idx
  ON public.plant_grow_guides (last_freshness_check_at NULLS FIRST);

-- Update trigger to keep updated_at current
CREATE OR REPLACE FUNCTION public.touch_plant_grow_guides_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER plant_grow_guides_set_updated_at
  BEFORE UPDATE ON public.plant_grow_guides
  FOR EACH ROW EXECUTE FUNCTION public.touch_plant_grow_guides_updated_at();
```

### RLS

Grow guides are **catalogue-level facts**, same trust model as Perenual data: any authenticated user can SELECT, only service-role + SECURITY DEFINER paths can write.

```sql
ALTER TABLE public.plant_grow_guides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read grow guides"
  ON public.plant_grow_guides FOR SELECT
  TO authenticated
  USING (true);

-- No INSERT / UPDATE / DELETE policy → blocks all client writes.
-- The edge fn (service-role) is the only writer.
```

### `guide_data` JSON shape (enforced via Gemini `responseSchema`)

```ts
interface PlantGrowGuide {
  schema_version: 1;
  generated_at: string;          // ISO timestamp
  // Always 9 sections returned (one per category). Each opts in via `applicable`.
  sections: GuideSection[];
}

type GuideCategory =
  | "water" | "soil" | "sunlight" | "propagation" | "germination"
  | "pruning" | "flowering" | "harvesting" | "senescence";

interface GuideSection {
  category: GuideCategory;
  applicable: boolean;            // false → UI hides section ENTIRELY (e.g. harvesting for an ornamental)
  title: string;                  // Display heading, e.g. "Watering"
  summary: string;                // 1-2 sentence overview
  key_facts: { label: string; value: string }[];  // ["Frequency: every 3-4 days", "Method: water at soil level"]
  steps: { step: number; title: string; detail: string }[];   // ordered how-to; empty array if not applicable
  tips: string[];                 // 0-4 bullet tips
  notes: string | null;           // optional caveat (region-specific, seasonal, etc.)
}
```

All five optional content fields (`key_facts`/`steps`/`tips`/`notes`) become **empty arrays / null** when not relevant — keeps Gemini's response shape consistent. The UI renders only what's populated.

### New edge function action: `generate_grow_guide`

Added to `supabase/functions/plant-doctor/index.ts` as a new `action === "generate_grow_guide"` branch. Mirrors `generate_care_guide`'s shape but with the `GROW_GUIDE_SCHEMA` `responseSchema`. Args:

```ts
{
  action: "generate_grow_guide",
  plantId: number,         // catalogue plant.id
  homeId?: string,         // for AI-gate check
  forceRegen?: boolean,    // bypass cache and regenerate from scratch
}
```

Flow:
1. `requireAuth` + Sage+ tier check (`guardAiByHome`) + rate limit
2. Load `plants` row by `plantId` (need `common_name`, `scientific_name`, `source`, `data` for any user-supplied notes)
3. If `forceRegen !== true`, check existing `plant_grow_guides` row — return early on cache hit
4. Build prompt with:
   - Plant common + scientific name + source
   - Manual plant notes from `plants.data` if `source = 'manual'`
   - Home hemisphere + current date (from `homes` row via existing helper)
   - Strict per-category instructions (see Prompt section)
5. `callGeminiCascade(prompt, GROW_GUIDE_SCHEMA)` → parsed envelope
6. Upsert into `plant_grow_guides`:
   - First time: INSERT
   - Existing: diff against current via new `diffGrowGuide` helper (sibling to `diffCareGuide`); bump `freshness_version` if any section changed
7. Update `last_generated_at`, `last_freshness_check_at`, `updated_fields`
8. Return the full envelope to the client

### New shared module — `_shared/growGuide.ts`

Mirrors `_shared/aiPlantCatalogue.ts`:
- Export `GROW_GUIDE_SCHEMA` (the Gemini responseSchema constant)
- Export `diffGrowGuide(old, new): string[]` → returns list of `category` strings that meaningfully changed
- Export `buildGrowGuidePrompt({ commonName, scientificName, source, manualNotes, hemisphere, currentDate })` → builds the structured prompt

This keeps the cron, the manual-refresh path, and the on-demand edge fn all in sync.

### New cron — `refresh-stale-grow-guides`

Mirrors `refresh-stale-ai-plants` exactly:
- Daily fire (03:30 UTC — half-hour offset from the existing AI plant cron so they don't fight for Gemini capacity)
- Walks `plant_grow_guides WHERE last_freshness_check_at IS NULL OR < now() - 90 days`
- Filter: only guides whose parent `plants.home_id IS NULL` (globals only) — same logic as the AI plant cron; home-scoped forks own their guides forever
- Batch capped at `STALE_GUIDE_BATCH_SIZE` env (default 25)
- Per-plant try/catch with Sentry capture
- Idempotent via `last_freshness_check_at`
- System-attributed `ai_usage_log` (user_id NULL, home_id NULL)
- On change: bumps `freshness_version`, sets `updated_fields = [changed category list]`

### New client surface — `<GrowGuideTab />`

`src/components/GrowGuideTab.tsx`. Props:

```ts
interface Props {
  plantId: number;
  commonName: string;
  source: "manual" | "api" | "ai" | "verdantly";
  homeId: string;
  aiEnabled: boolean;       // gates the Generate/Refresh button
}
```

States:
- **Loading** (first read): spinner + "Loading guide…"
- **Empty** (no row): "No grow guide yet" + Generate button (Sage+) or "Upgrade to AI tier to generate" (non-AI)
- **Loaded fresh**: collapsible sections (per category, default first section open), "Generated 5 days ago" footer
- **Loaded stale** (>90 days since `last_generated_at`): same as loaded + a small "Refresh" affordance with "Last refreshed: 95 days ago"
- **Generating**: spinner overlay with "Generating guide — this can take 10-15 seconds…"
- **Error**: inline error banner + Retry button

### Section rendering helpers

A `<GuideSectionCard />` sub-component renders one section:
- Header: icon + title + collapse chevron
- Body (when expanded):
  - Summary paragraph
  - Key facts → 2-col grid of label/value chips
  - Steps → ordered list with step number + title + detail
  - Tips → bullet list
  - Notes → italic caveat at bottom

Icons (from lucide-react):
- water → `Droplets`
- soil → `Mountain`
- sunlight → `Sun`
- propagation → `Scissors`
- germination → `Sprout`
- pruning → `Scissors`  (used for prop too — visually distinct via context + label)
- flowering → `Flower2`
- harvesting → `Wheat`
- senescence → `Hourglass`

Sections marked `applicable: false` render **nothing** — no header, no placeholder, no "not applicable" label. Just gracefully absent.

### New service-layer method

In `src/services/plantDoctorService.ts`:

```ts
generateGrowGuide(plantId: number, homeId: string, opts?: { forceRegen?: boolean }): Promise<PlantGrowGuide>
```

Wraps `supabase.functions.invoke("plant-doctor", { body: { action: "generate_grow_guide", plantId, homeId, ...opts }})`.

## Prompt structure

Built by `buildGrowGuidePrompt` in `_shared/growGuide.ts`. Key principles:

```
You are an expert horticulturalist writing a comprehensive grow guide
for "{commonName}" (scientific name: {scientificName}).

Source: {source}.
{If manual: "User notes about this plant: {manualNotes}".}

Location context:
  Hemisphere: {hemisphere}
  Current date: {currentDate}

You MUST return a JSON envelope with EXACTLY these 9 sections, in this
order, one for each category:
  water, soil, sunlight, propagation, germination, pruning, flowering,
  harvesting, senescence.

For EACH section:
  - `category`: the exact category slug above
  - `applicable`: true ONLY if this concept applies to this plant. Set false for:
      * harvesting on purely ornamental species
      * propagation/germination if it's commercially propagated only (rare bulbs etc)
      * senescence on truly perennial species without a notable decline phase
  - `title`: short heading (e.g. "Watering")
  - `summary`: 1-2 sentences. Action-oriented, not encyclopaedic.
  - `key_facts`: 2-5 label/value pairs. Concrete numbers preferred.
      e.g. water: [{label: "Frequency", value: "Every 3-4 days in summer"},
                   {label: "Method", value: "Water at soil level, avoid leaves"}]
  - `steps`: ordered how-to ONLY for action sections (propagation, germination,
      pruning, harvesting). Empty array `[]` for purely informational sections
      (water, soil, sunlight, flowering, senescence).
  - `tips`: 0-4 short bullets — common pitfalls, microclimate adjustments, etc.
  - `notes`: optional one-line caveat. null when nothing useful to add.

CRITICAL:
  - Calibrate timing references to {hemisphere}. "Late spring" means
    March-May for Southern, September-November for Northern.
  - Use Celsius for temperature, mm for rainfall, cm for spacing/depth.
  - For "applicable: false" sections, still return ALL the other fields
    but with empty/null content. Schema is uniform.
  - No emoji. No HTML.
```

The `responseSchema` enforces structure; the prompt steers content.

## File touch list

### New files

| File | Purpose |
|---|---|
| `supabase/migrations/<ts>_plant_grow_guides.sql` | Table, indexes, RLS, updated_at trigger |
| `supabase/functions/_shared/growGuide.ts` | `GROW_GUIDE_SCHEMA`, `diffGrowGuide`, `buildGrowGuidePrompt` |
| `supabase/functions/refresh-stale-grow-guides/index.ts` | Daily cron entry point |
| `supabase/functions/refresh-stale-grow-guides/deno.json` | Deno config |
| `src/components/GrowGuideTab.tsx` | The new tab UI |
| `src/components/growGuide/GuideSectionCard.tsx` | One collapsible section |
| `src/services/plantDoctorService.ts` (edit) | `generateGrowGuide` method |
| `src/components/PlantEditModal.tsx` (edit) | Add `grow_guide` tab to `tabs` array; new render branch |
| `src/components/InstanceEditModal.tsx` (edit) | Same — extend `activeTab` union, add tab + branch |
| `supabase/functions/plant-doctor/index.ts` (edit) | New `generate_grow_guide` action handler |
| `supabase/tests/growGuide.test.ts` | Deno tests for `diffGrowGuide` + `buildGrowGuidePrompt` shape |
| `tests/unit/components/GrowGuideTab.test.ts` | Render states (empty / loading / loaded / error) |

### App-reference updates (per CLAUDE.md mandate)

| File | Update |
|---|---|
| `docs/app-reference/08-modals-and-overlays/06-plant-edit-modal.md` | Document the new `Grow Guide` tab |
| `docs/app-reference/08-modals-and-overlays/08-instance-edit-modal.md` | Same |
| `docs/app-reference/99-cross-cutting/03-data-model-plants.md` | Add `plant_grow_guides` table reference |
| `docs/app-reference/99-cross-cutting/10-edge-functions-catalogue.md` | Add `generate_grow_guide` action + `refresh-stale-grow-guides` cron function |
| `docs/app-reference/99-cross-cutting/11-cron-jobs.md` | Add the new daily cron |
| `docs/app-reference/99-cross-cutting/13-ai-gemini.md` | Reference the new schema + prompt pattern |
| `docs/app-reference/99-cross-cutting/19-rls-patterns.md` | Add the "authenticated SELECT only, service-role writes" pattern (already implicit, but now reified) |
| `docs/app-reference/00-INDEX.md` | New reference file |
| **NEW** `docs/app-reference/08-modals-and-overlays/35-grow-guide-tab.md` | Dual-voice ref for the new tab |

## Data-safety audit

| Change | Risk |
|---|---|
| New `plant_grow_guides` table | None — additive. No existing rows touched. |
| New edge fn action `generate_grow_guide` | None — additive. Existing actions unaffected. |
| New cron `refresh-stale-grow-guides` | None — only reads + writes the new table. AI cost capped at 25 calls/day. |
| `PlantEditModal` tabs array gets a new entry | None — additive insertion; existing tabs unchanged. |
| `InstanceEditModal` activeTab union gets a new value | None — additive. |
| New service-layer method | None — additive. |

## Tests

| Tier | What |
|---|---|
| Deno | `diffGrowGuide` — same envelope returns empty diff; one section changed → returns [category]; multiple changes → returns multiple |
| Deno | `buildGrowGuidePrompt` — hemisphere threading, manual-notes injection, source-aware copy |
| Deno | `refresh-stale-grow-guides` happy path — picks up NULL-checked rows, runs Gemini, writes new freshness check timestamp |
| Vitest | `GrowGuideTab` — empty state shows Generate button; loaded state shows sections; non-AI tier shows upgrade prompt; non-applicable sections hidden |
| Vitest | `GuideSectionCard` — collapse/expand; renders steps + tips + key_facts + notes |

## Implementation order

1. **Migration** — `plant_grow_guides` table + RLS + trigger + index. Apply locally, then push to remote.
2. **`_shared/growGuide.ts`** — schema constant + diff helper + prompt builder. Deno tests for these helpers.
3. **`generate_grow_guide` action** in `plant-doctor/index.ts` — wires schema + prompt + DB upsert.
4. **`refresh-stale-grow-guides` cron edge fn** — copy `refresh-stale-ai-plants`, swap schemas + tables.
5. **Service-layer method** `PlantDoctorService.generateGrowGuide`.
6. **`<GuideSectionCard />`** — pure presentation; Vitest covers all the optional-field branches.
7. **`<GrowGuideTab />`** — empty / loading / loaded / error states. Vitest covers all four.
8. **Wire into `PlantEditModal`** — add `{ id: "grow_guide", label: "Grow Guide", icon: BookOpen2 }` between `care` and `guides` in the `tabs` array; new render branch.
9. **Wire into `InstanceEditModal`** — extend the `activeTab` union; add the same tab + branch.
10. **App-reference docs** — create new file + update the 8 existing files.
11. **Manual test plan**:
    - Open a Shed AI plant with no grow guide → see Generate button → tap → see the 9 sections render
    - Open a manual plant → see Generate button → tap → guide generated using the manual notes
    - Open a Perenual plant → same flow; guide generated using common + scientific name
    - Open a non-edible ornamental → harvesting section is gracefully absent
    - Re-open the same plant after generation → guide loads from cache instantly
    - Tap Refresh → forces regeneration
    - Non-AI tier user → sees an upgrade prompt instead of Generate
    - Open a plant on Instance Edit modal → same tab + same content
12. **Cron schedule registration** — manually add `refresh-stale-grow-guides` to Supabase Dashboard → Cron Jobs (daily 03:30 UTC). Note in deployment docs.
13. **Commit with `[skip ci]`** and `npm run deploy`.

## What this wave doesn't do

- **No per-instance overrides.** The guide is catalogue-level. If a user wants to record "I water this specific one differently", that's the Journal feature, not Grow Guide.
- **No image generation.** Sections are text-only. Could add a section image (Wikipedia / Pixabay) in a follow-up wave if needed.
- **No section-by-section regeneration.** Full guide regenerated each time. If Gemini gets one section wrong, you regenerate everything.
- **No region-specific multi-guide.** One guide per plant, calibrated to the requesting home's hemisphere. A UK user and an Australian user looking at the same global plant see the same guide (NH-biased by default; AU users would benefit from a future per-hemisphere variant).
- **No mobile-specific UI variant.** Same tab on every device.

## Open questions

None — all locked in the earlier conversation.
