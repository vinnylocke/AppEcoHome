# Grow Guide Tab

> A new tab on the Plant Edit Modal (Shed plant card) and the Instance Edit Modal showing a comprehensive AI-generated guide for the species. Nine sections — Water, Soil, Sunlight, Propagation, Germination, Pruning, Flowering, Harvesting, Senescence — each with summary + key facts + steps + tips + optional notes. Catalogue-level (one guide per `plants.id`, shared across home members and home boundaries for global rows). Generated once on demand, refreshed every 90 days by a cron + on-demand Refresh button.

**Trigger:** the "Grow Guide" tab on a plant species card (in The Shed) or a plant instance (Garden Layout / Areas → tile tap).
**Source files:**
- `src/components/GrowGuideTab.tsx` — orchestrator
- `src/components/growGuide/GuideSectionCard.tsx` — one collapsible section
- `src/components/growGuide/AddToCalendarSheet.tsx` — sheet hosting the per-instance picker + TaskActionButtons
- `src/lib/scheduleFromSchedulableTask.ts` — pure helper: `SchedulableTask` (months) → `SuggestedTask` (day offsets)
- `src/lib/blueprintDuplicateCheck.ts` — heuristic duplicate detection against existing blueprints
- `src/services/plantDoctorService.ts` — `generateGrowGuide` service method
- `supabase/functions/plant-doctor/index.ts` — `generate_grow_guide` edge fn action
- `supabase/functions/refresh-stale-grow-guides/index.ts` — daily cron
- `supabase/functions/_shared/growGuide.ts` — schema + prompt + diff helpers

---

## Quick Summary

Phase-aware single-page tab:
- **Empty** → "Generate guide" button (Sage+) or upgrade prompt (Sprout/Botanist).
- **Loaded** → 9-section accordion (first auto-expanded). Sections marked `applicable: false` are gracefully hidden — a non-edible ornamental shows no Harvesting block.
- **Stale (>90 days)** → "may be out of date" indicator beside the Updated chip; tap Refresh to regenerate.
- **Generating** → in-line spinner with "Generating guide — this can take 10-15 seconds…".
- **Error** → inline banner with Retry; an in-progress error doesn't lose existing loaded data.

All three plant sources work — `ai` / `manual` / `api` / `verdantly`. Manual plants get a best-effort guide built from name + any user-supplied notes (the empty state shows a small hint).

---

## Role 1 — Technical Reference

### Component graph

```
GrowGuideTab
├── Loading state (Loader2 spinner)
├── Empty state
│   ├── Generate button (Sage+) → PlantDoctorService.generateGrowGuide
│   └── Upgrade prompt (non-AI tiers)
├── Loaded state
│   ├── Header chip (Updated N days ago / may be out of date)
│   ├── Refresh button (Sage+)
│   ├── "Add all N tasks to calendar" bulk button (when totalSchedulable > 0)
│   └── GuideSectionCard × N (filtered to applicable: true)
│       ├── Collapsed header (icon + title + summary preview)
│       └── Expanded body
│           ├── Summary
│           ├── key_facts grid (label + value)
│           ├── Ordered steps (numbered)
│           ├── Tips list
│           ├── Notes (peach-tinted caveat)
│           └── Add-to-calendar button (when schedulable_tasks.length > 0)
│               └── AddToCalendarSheet
│                   ├── Per-instance picker (or home-wide)
│                   ├── Converted SuggestedTask[] via scheduleFromSchedulableTask
│                   └── TaskActionButtons (duplicates pre-unchecked + chipped)
└── Error states (cache-load failure / regenerate failure)
```

### Props

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `plantId` | `number` | parent | FK to `plants.id` |
| `commonName` | `string` | parent | Display name |
| `source` | `"manual" \| "api" \| "ai" \| "verdantly"` | parent | Drives the manual-plant hint copy |
| `homeId` | `string` | parent | Threaded into the edge fn for AI gating |
| `aiEnabled` | `boolean` | parent | Gates Generate + Refresh buttons |

### Data flow — read paths

```ts
// Initial cache check on mount — direct table read, no edge fn.
supabase.from("plant_grow_guides")
  .select("guide_data, last_generated_at, freshness_version")
  .eq("plant_id", plantId)
  .maybeSingle();
```

RLS lets any authenticated user SELECT — grow guides are catalogue facts, not personal data.

### Data flow — write paths

The tab itself doesn't write directly. All writes flow through the `generate_grow_guide` edge fn action which writes with service-role.

```ts
PlantDoctorService.generateGrowGuide(plantId, homeId, { forceRegen })
```

The Refresh button passes `forceRegen: true` to skip the edge fn's cache shortcut.

### Edge functions invoked

| Function | Action | When |
|----------|--------|------|
| `plant-doctor` | `generate_grow_guide` | On Generate tap (cache hit returns existing without calling Gemini); on Refresh tap (forceRegen=true, always calls Gemini) |

### Cron / scheduled jobs

| Cron | Effect |
|------|--------|
| `refresh-stale-grow-guides` (daily, 03:30 UTC) | Walks `plant_grow_guides` rows whose `last_freshness_check_at` is NULL or older than 90 days. Re-asks Gemini, runs `diffGrowGuide`, bumps `freshness_version` + writes `updated_fields` only when content changed. Batch capped at 25/run. |

### Realtime channels

None subscribed. The tab refetches only when the user explicitly taps Refresh or remounts.

### Tier gating

| Tier | Generate / Refresh | View existing |
|------|---------------------|----------------|
| Sprout / Botanist | Locked (upgrade prompt) | ✓ (everyone) |
| Sage / Evergreen | ✓ | ✓ |

The cache + cron means non-AI users see whatever a Sage+ user (or the daily cron) has already generated for that species. Catalogue-level — your tier doesn't change the data, only your ability to *create* it.

### Beta gating

None.

### Permissions

None additional. Standard read access via RLS.

### Error states

| State | Result |
|-------|--------|
| Cache-read fails (network/RLS) | Inline error banner + Retry button |
| Generate fails | Inline error banner; if loaded data exists, it stays visible |
| Schema-incompatible cached row | Renders as a loaded guide; per-section render gracefully skips empty fields |
| Gemini hallucinates `applicable: false` for everything | The "no applicable guidance" empty state shows with a Refresh prompt |

### Performance

- Initial mount = one direct Supabase query (~80ms typical). No edge fn cold-start.
- On Generate (cache hit) the edge fn returns the existing row without calling Gemini — ~300-500ms.
- On Generate (cache miss) the edge fn calls Gemini — ~8-15 seconds.
- The Refresh path always calls Gemini.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why open this tab

You've got a plant. The Care Guide tab tells you the at-a-glance basics — watering interval, sunlight needs, flowering season. The Grow Guide goes deeper: how to actually *do* the gardening tasks. Where to take a cutting. When the harvest is ready. What to do with deadheads. When a plant is reaching the end of its life. Stuff you'd normally Google ten different articles for.

The guide is the same for every gardener growing this species — generated once, cached, refreshed every 90 days as horticultural advice evolves.

### Every flow on this tab

#### 1. First visit on a plant with no guide

- **What you see**: "No grow guide yet" + Generate button.
- **What you do**: tap Generate.
- **What happens next**: 10-15 second spinner ("Generating…"), then the 9 sections appear. First section (Water) auto-opens.

#### 2. Returning visit (guide exists)

- **What you see**: the guide. Updated date at the top. Sections collapsed by default; tap to expand.
- **What you do**: read, or tap Refresh if the guide looks stale.

#### 3. Stale guide (>90 days old)

- **What you see**: "may be out of date" text beside the Updated chip.
- **What you do**: tap Refresh.
- **What happens next**: another 10-15 second spinner; sections that changed get tagged in the toast — e.g. "2 sections updated".

#### 4. Non-edible / ornamental plant

- **What you see**: no Harvesting section. The AI recognised it doesn't apply and marked it `applicable: false`. Same for other non-applicable sections.

#### 5. Manual plant

- **What you see**: empty-state hint that manual plants get a best-effort guide. Use Visual Lens to identify the species for sharper data.

#### 6. Add tasks to your calendar (per section)

- **What you see**: when a section has schedulable tasks, an **Add to calendar** button sits at the bottom of the expanded section.
- **What you do**: tap.
- **What happens next**: a sheet rises with each suggested task in the section. If you have the plant in your Shed, a picker lets you attach the tasks to a specific instance (or leave them home-wide). Tasks that look similar to a blueprint you already have are flagged "may already exist" and pre-unchecked. Tap **Add tasks**; everything lands in your calendar with the AI's recommended timing converted into concrete dates for your hemisphere.

#### 7. Bulk-add all schedulable tasks

- **What you see**: when the guide has tasks across multiple sections, a single **Add all N tasks to calendar** button at the top of the section list.
- **What you do**: tap.
- **What happens next**: the same sheet but pre-filled with every schedulable task across every applicable section. Useful when you want to set up the full year of care for a plant in one go (Marcus's workflow).

### Information on display — what every field means

| Element | Meaning |
|---------|---------|
| Section header icon + title | Identifies the category (water / soil / sunlight / propagation / germination / pruning / flowering / harvesting / senescence) |
| Summary line under each header | 1-2 sentence overview of that aspect |
| Key facts grid (when present) | Concrete label/value pairs — e.g. "Frequency: every 3-4 days" |
| Numbered steps (when present) | Ordered how-to instructions — propagation, germination, pruning, harvesting typically have these |
| Tips (when present) | Bullet pitfalls and microclimate tweaks |
| Notes (peach-tinted block) | Caveat — region-specific advice or a "your mileage may vary" disclaimer |
| Updated N days ago | When the guide was last regenerated (cron OR manual Refresh) |
| "may be out of date" | Guide is older than 90 days; daily cron will catch it on its next pass |

### Tier-by-tier experience

| Tier | What you can do |
|------|------------------|
| Sprout / Botanist | View any existing guide for free. Cannot generate one — see an upgrade prompt on the empty state. |
| Sage / Evergreen | Full access — generate, refresh, view. |

### Common mistakes / pitfalls

- **Treating the guide as authoritative.** It's AI-generated; cross-check critical advice with a horticultural reference for prize-winning crops.
- **Refreshing constantly.** The daily cron keeps it fresh on the 90-day window; manual Refresh is for when you suspect the existing content is wrong.
- **Looking for region-specific advice on a global plant.** Guides are calibrated to a default Northern hemisphere. Southern hemisphere users see the same content with seasonal terms (e.g. "late spring") — read those terms relative to your hemisphere.

### Recommended workflows

- **Adding a new species to your Shed** → open the plant card → Grow Guide → Generate. Now you have a permanent reference for the season.
- **Troubleshooting a struggling plant** → open the species's Grow Guide and re-read the Water, Soil, and Sunlight sections; check against your area's conditions.
- **End-of-season planning** → check the Harvesting and Senescence sections to decide whether to compost or save seeds.

### What to do if something looks wrong

- **"No grow guide yet" on a plant that's been in the Shed for months** → tap Generate. The guide didn't auto-populate.
- **Section copy contradicts a trusted reference** → tap Refresh. If still wrong on the next regen, the prompt may need tuning — flag it for the maintainer.
- **Generate button is locked** → your tier doesn't include AI features. Upgrade to Sage or Evergreen.

---

## Related reference files

- [Plant Edit Modal](./06-plant-edit-modal.md) — parent surface (Shed plant card)
- [Instance Edit Modal](./08-instance-edit-modal.md) — parent surface (plant instance)
- [Plant Guides Tab](./10-plant-journal-tab.md) — sibling tab (community-written user guides, NOT the same thing as Grow Guide)
- [Data Model — Plants](../99-cross-cutting/03-data-model-plants.md) — `plant_grow_guides` table reference
- [Edge Functions Catalogue](../99-cross-cutting/10-edge-functions-catalogue.md) — `generate_grow_guide` + `refresh-stale-grow-guides`
- [Cron Jobs](../99-cross-cutting/11-cron-jobs.md) — daily refresh cron
- [AI — Gemini](../99-cross-cutting/13-ai-gemini.md) — `responseSchema` pattern

## Code references for ongoing maintenance

- `src/components/GrowGuideTab.tsx` — orchestrator with empty / loaded / stale / generating / error states
- `src/components/growGuide/GuideSectionCard.tsx` — one collapsible section, handles the optional-field branches
- `src/services/plantDoctorService.ts:generateGrowGuide` — service-layer wrapper
- `supabase/functions/plant-doctor/index.ts` — `generate_grow_guide` action handler
- `supabase/functions/refresh-stale-grow-guides/index.ts` — daily cron entry point
- `supabase/functions/_shared/growGuide.ts` — schema + prompt + diff
- `supabase/functions/_shared/refreshStaleGrowGuides.ts` — batch processor helper
- `supabase/migrations/20260624000000_plant_grow_guides.sql` — table + RLS
- `tests/unit/components/GuideSectionCard.test.ts` + `GrowGuideTab.test.ts` — Vitest coverage
- `supabase/tests/growGuide.test.ts` — Deno tests for the shared helpers
