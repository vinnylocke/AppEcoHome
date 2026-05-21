# Plan — "What can I grow right now?"

## Goal

Surface 3–6 personalised "you could sow / plant / propagate this week" suggestions on the user's Today / Dashboard screen. Powered by:

- their **home's location** (lat/lng/hemisphere/timezone/country),
- their **frost dates** (already cached in `home_climate`),
- their **garden quiz preferences** (edible focus, sun exposure, time commitment, dislikes),
- the **current ISO week** (so the picks roll over weekly, not daily),
- the **plants already in their Shed** (to dedupe and surface succession-sow ideas for things they grow),
- their **tier** (Sprout sees Perenual-only picks; Sage+ gets AI-personalised reasoning).

Reads like the inverse of The Library — instead of "show me what I'm looking for", it's "show me what you'd suggest for me right now".

## User-facing flows

1. **Card on the Today screen** (`/quick/calendar`) and on the desktop Dashboard. Title: *"This week's sowing picks"*. Subtitle: *"Three things you could plant this weekend in {home name}."* A horizontal scroll of suggestion cards.
2. **Each card** shows:
   - Plant common + scientific name.
   - One-line **reasoning** ("Best sown indoors now — ready to transplant after the last frost on May 12").
   - **Sow method** chip (Direct sow / Indoor start / Cutting / Division).
   - Optional **estimated harvest window** for edibles ("Harvest from late June").
   - **Effort band** (Easy / Moderate / Advanced) read from the quiz.
   - A thumbnail (Wikipedia / Pixabay via `plant-image-search`).
3. **Tap a card** → opens the existing PlantPreview at `/library/plant/preview` (same instant-open flow), with the search result pre-populated. From there: Save to Shed / view Grow Guide / view Companions — all existing.
4. **Tap "Add to my Shopping List"** on a card → adds a seed-packet row to the user's active shopping list (or starts a new one).
5. **Refresh button** on the card header (Sage+ only) → regenerate this week's picks. Rate-limited to one regen per ISO week.

## App-reference docs consulted

- [docs/app-reference/02-dashboard/01-dashboard-tab.md](../app-reference/02-dashboard/01-dashboard-tab.md) — where the desktop card slots in.
- [docs/app-reference/02-dashboard/10-localized-task-calendar.md](../app-reference/02-dashboard/10-localized-task-calendar.md) — where the mobile card slots in (today's screen).
- [docs/app-reference/02-dashboard/12-the-library.md](../app-reference/02-dashboard/12-the-library.md) — instant-open preview flow we reuse.
- [docs/app-reference/01-onboarding/05-garden-quiz.md](../app-reference/01-onboarding/05-garden-quiz.md) — quiz prefs structure (effort, edible focus, dislikes).
- [docs/app-reference/07-management/04-climate-settings.md](../app-reference/07-management/04-climate-settings.md) — frost dates source.
- [docs/app-reference/99-cross-cutting/29-seasonality.md](../app-reference/99-cross-cutting/29-seasonality.md) — hemisphere logic.
- [docs/app-reference/99-cross-cutting/13-ai-gemini.md](../app-reference/99-cross-cutting/13-ai-gemini.md) — Gemini call patterns + caching.
- [docs/app-reference/99-cross-cutting/11-cron-jobs.md](../app-reference/99-cross-cutting/11-cron-jobs.md) — weekly refresh cron lands here.
- [docs/app-reference/99-cross-cutting/17-tier-gating.md](../app-reference/99-cross-cutting/17-tier-gating.md) — Sprout vs Sage gating.

## Data model

New table `home_seasonal_picks`:

```sql
CREATE TABLE public.home_seasonal_picks (
  home_id       uuid REFERENCES public.homes(id) ON DELETE CASCADE,
  week_iso      text NOT NULL,             -- "2026-W19"
  generated_at  timestamptz NOT NULL DEFAULT now(),
  source        text NOT NULL DEFAULT 'ai', -- 'ai' | 'fallback'
  picks         jsonb NOT NULL,             -- array of SeasonalPick objects
  PRIMARY KEY (home_id, week_iso)
);
```

`picks` is an array of:

```ts
interface SeasonalPick {
  common_name: string;
  scientific_name: string;
  sow_method: "direct" | "indoor" | "cutting" | "division" | "transplant";
  sow_window_start: string;   // ISO date
  sow_window_end:   string;
  harvest_window?: { start: string; end: string } | null;
  reasoning: string;          // 1 sentence
  effort: "easy" | "moderate" | "advanced";
  sun: ("full_sun" | "part_sun" | "part_shade" | "full_shade")[];
  edible: boolean;
  plant_id?: number | null;   // catalogue id, if matched
}
```

RLS: home members read; service-role writes only (the edge fn writes during refresh).

## Edge functions

**New action on `plant-doctor`:** `seasonal_picks`.

Input:
```ts
{
  action: "seasonal_picks";
  homeId: string;
  forceRegen?: boolean;
}
```

Behaviour:
1. **Cache read** — look up `home_seasonal_picks` for `(homeId, current_week_iso)`. If present and `!forceRegen`, return it. No Gemini call.
2. **Build context** — query:
   - `homes` row → lat/lng/country/timezone/hemisphere
   - `home_climate` → frost dates
   - `user_preferences` → quiz answers (edible focus / effort / dislikes / sun availability)
   - `plants` filtered by home_id → existing Shed contents (common_name + scientific_name only)
3. **Gemini prompt** (Sage+) — pass all the context, ask for 4–6 picks for this week, schema-constrained.
4. **Cache write** — upsert the row.
5. **Image lookup (async)** — fire-and-forget `plant-image-search` per pick name so subsequent reads have thumbnails. Cache hits in `species_cache`.

Schema for Gemini response (`SEASONAL_PICKS_SCHEMA` in `_shared/seasonalPicks.ts`):
```ts
{
  type: "OBJECT",
  properties: {
    picks: { type: "ARRAY", items: { ... shape above ... } },
  },
  required: ["picks"],
}
```

**Sprout / Botanist fallback:** when no AI tier, run a deterministic JS picker that consults a small built-in table of common UK garden plants × month, intersected with the user's hemisphere. Stored in `_shared/seasonalPicksFallback.ts`. No Gemini, no cost.

## Cron / scheduling

**New cron** `refresh-seasonal-picks-weekly` — Mondays 04:00 UTC.

- Walks every home with at least one login in the last 30 days (a "warm" home).
- For each: calls the `seasonal_picks` action with `forceRegen: false`, which lazily generates only when the current week's row is missing.
- Batch size: `STALE_SEASONAL_BATCH_SIZE` env (default 25).
- AI usage attribution: system-level (`user_id = NULL`, `home_id = NULL` on `ai_usage_log`).

Why pre-warm on Monday? So the Today screen on Monday morning paints from a warm cache, not a 10-second Gemini wait.

## Surfaces and where they slot

| Surface | Slot | Layout |
|---|---|---|
| `/quick/calendar` (Localized Task Calendar) | New tile **above** the daily-tasks list, **below** the rain advice. | Horizontal scroll, three cards visible on a phone, swipe for more. |
| `/dashboard` | New card on the dashboard column, **after** the Daily Brief and **before** Today's Tasks. | Full-width grid, 3-up on desktop / 2-up on tablet. |
| New `/quick/grow-now` route (optional) | A deep-dive view if the user taps "See all" on the card. | Full grid + filter chips (Edible / Ornamental / Indoor / Outdoor). |

The card is **hidden** when:
- The home has no `home_climate.last_frost_iso` set (the AI needs frost context). Card shows a CTA: *"Set your frost dates to unlock weekly picks."*
- The user is on the Quick Capture / Visual Lens screen (focus mode — don't interrupt).

## Files to add

| File | Purpose |
|---|---|
| `supabase/migrations/<ts>_home_seasonal_picks.sql` | Table + RLS |
| `supabase/functions/_shared/seasonalPicks.ts` | Gemini schema + prompt builder + types |
| `supabase/functions/_shared/seasonalPicksFallback.ts` | Sprout/Botanist deterministic picker |
| `supabase/functions/refresh-seasonal-picks/index.ts` | Weekly cron entry point |
| `src/components/seasonal/SeasonalPicksCard.tsx` | The dashboard / today card |
| `src/components/seasonal/SeasonalPickTile.tsx` | One pick (inside the card) |
| `src/services/seasonalPicksService.ts` | Client-side wrapper + sessionStorage cache |
| `docs/app-reference/02-dashboard/13-seasonal-picks.md` | New surface doc |

## Files to modify

| File | Change |
|---|---|
| `supabase/functions/plant-doctor/index.ts` | New `seasonal_picks` action handler |
| `src/components/HomeDashboard.tsx` | Mount `<SeasonalPicksCard>` |
| `src/components/quick/LocalizedTaskCalendar.tsx` | Mount card above the daily list |
| `docs/app-reference/99-cross-cutting/10-edge-functions-catalogue.md` | Add `seasonal_picks` row |
| `docs/app-reference/99-cross-cutting/11-cron-jobs.md` | Add `refresh-seasonal-picks-weekly` row |
| `docs/app-reference/00-INDEX.md` | Add the new surface doc |

## Use cases — Sarah (amateur)

**Saturday morning in mid-April**

Sarah opens the app over breakfast. The Today screen shows her usual cards plus a new one:

> *🌱 Three things you could plant this weekend*
> *— It's early spring in Bristol. Frost risk drops mid-May.*

She swipes through three tiles:

- **Lettuce 'Lollo Rossa'** — *"Direct-sow now for cut-and-come-again leaves from late May. Quick win — great for kids."*
- **Sunflower 'Russian Giant'** — *"Direct-sow in a sunny spot. Big visible growth within 4 weeks."*
- **Tomato 'Sungold'** — *"Start indoors on a sunny windowsill. Transplant outside after May 12 (your last-frost date)."*

She taps Sungold → PlantPreview opens with the full Grow Guide, Companions, Light. She hits Save → it's in her Shed. The "Add seed packet to shopping list" button adds Sungold to her current list — she'll grab one at the garden centre tomorrow.

The card is also her gentle weekly nudge. Without it she'd forget that May is the busy month.

## Use cases — Marcus (expert)

**Monday evening planning session**

Marcus opens the app to plan the week. The Today screen shows the seasonal picks tile, but his framing is slightly different:

> *🌱 Five planting windows this week*
> *— Mid-spring, post-frost. Succession picks included.*

His tiles include:

- **Beetroot 'Boltardy'** — *"Direct-sow your next row — your March 28 sowing germinated well, time to layer another."* (Recognises he already grows beetroot from his Shed)
- **Sweet pea 'Cupani'** — *"Direct-sow against the trellis you built last year. Two weeks ahead of last year's sow date to push earlier flowers."*
- **Geranium softwood cuttings** — *"Your zonal geraniums are at the right stage for cuttings — take 3–4 from each plant to overwinter as backups."*
- **Brassicas — Calabrese** — *"Indoor-start broccoli now for transplant in 6 weeks. Your last year's harvest was June 14 — this would aim for late June again."*
- **Carrot 'Autumn King'** — *"Late-spring sow window opens — direct-sow for autumn harvest."*

He taps Beetroot → opens the preview → notices the Companions tab suggests onions nearby. Adds a sow task for Wednesday. Adds a row to his current week's shopping list with new beetroot seed (his stock from 2024 is past its sow-by).

The Refresh button lets him regenerate the picks on a Sunday if his weekly plan changed.

## Edge cases / risks

- **Cold start home** — homes with no frost data show the CTA to set them. We do NOT bug Gemini for picks if frost data is missing; the picks would be too generic.
- **Tropical / Mediterranean climates** — the AI prompt threads `country` and `lat/lng` so picks are climate-correct. The fallback table is UK-skewed; tropical users get a thinner fallback but the AI tier covers them well.
- **Heavily-stocked Shed** — Marcus has 80 plants. The prompt summarises his Shed to common_name + family list (not full details) to stay under context limit.
- **Quiz-incomplete users** — the prompt threads what's available and notes "user hasn't completed the garden quiz; pick safe defaults".
- **AI quota** — one Gemini call per home per week is ~100 tokens prompt + ~600 tokens output. Cheap.

## Tier gating

| Tier | What they see |
|---|---|
| Sprout | Deterministic fallback picks from the JS table. No personalised reasoning. Refresh disabled. |
| Botanist | Same as Sprout. The card is enabled but uses fallback. |
| Sage | AI-personalised picks with reasoning, Shed context, and succession-sow suggestions. Manual refresh once per week. |
| Evergreen | Same as Sage. |

## Out of scope (v1)

- **In-line "Add seed packet" without leaving the card** — for v1 the Save flow goes through PlantPreview. Direct-add is a follow-up.
- **Pruning / dead-heading picks** — limited to sowing / planting / propagating for v1.
- **Push notifications** when the card refreshes — opt-in / out of scope.
- **Per-area picks** — single home-wide list for v1.

## Sequencing

1. Migration + RLS.
2. Shared schema/prompt module + fallback table.
3. `seasonal_picks` edge fn action + tests.
4. Cron entry point + registration migration.
5. Service + Card component.
6. Mount on Dashboard + Today screen.
7. App-reference docs (new surface + cron + edge fn updates).
8. E2E spec: card renders → tap pick → preview opens → Save lands in Shed.
9. Release notes + deploy.
