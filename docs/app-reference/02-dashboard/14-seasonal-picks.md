# Seasonal Picks Card

> "What can I grow right now?" — a weekly card surfacing 4-6 personalised sowing / planting / propagating suggestions calibrated to the user's hemisphere, frost dates, garden quiz preferences, and existing Shed contents. Reads like the inverse of The Library: instead of "show me what I'm looking for", it's "show me what you'd suggest for me this week".

**Routes:**
- `/dashboard` — rendered by the merged home ([Home (Main Dashboard)](./17-home-main.md)) in **Simple density only** (Detailed hides it to stay telemetry-first).
- `/weekly` — mounted as a section on the Weekly Overview page between "Sow this week" and "Ready to harvest" (Wave 21.0005).

> Previously also on `/quick/calendar` (`variant="today"`, removed Wave 21.0004) and `/quick` (`variant="carousel"`, removed Wave 21.0005). Both placements duplicated content; the Today screen now stays tight on "what's happening right now" and the Quick Launcher home now leads with the customisable launcher + walk tile. Personalised picks live on `/weekly` where they pair naturally with the deterministic "Sow this week" chip strip and the rest of the week-ahead context.

**Source files:**
- `src/components/seasonal/SeasonalPicksCard.tsx`
- `src/components/seasonal/SeasonalPickTile.tsx`
- `src/services/seasonalPicksService.ts`

---

## Quick Summary

A weekly card that paints 4-6 picks the user could realistically sow, plant, or propagate this week. Powered by the `seasonal_picks` action on the `plant-doctor` edge function with a deterministic JS fallback for non-AI tiers. Cached per `(home_id, ISO_week)` in `home_seasonal_picks` and pre-warmed by a Monday-morning cron so the first paint is instant.

---

## Role 1 — Technical Reference

### Component graph

```
SeasonalPicksCard (variant: "today" | "dashboard")
├── Header (Sparkles icon · title · "This week" chip)
├── Source label ("Personalised for your garden" | "A few ideas for this week")
├── Manual refresh button (calls fetchSeasonalPicks with forceRegen: true)
└── Tile list
    └── SeasonalPickTile × 4-6
        ├── Hero image (Wikipedia thumbnail — lazy, fallback icon)
        ├── Sow-method chip (Direct / Indoor / Cutting / Division / Transplant)
        ├── Title (common_name + scientific_name italic)
        ├── Reasoning (one sentence, line-clamped to 3)
        └── Footer chips (sow window · harvest window · effort · sun icons)
```

### Props received

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `homeId` | `string` | `home/HomeMain.tsx` / `WeeklyOverviewPage` | Scope |
| `variant` | `"today" \| "dashboard"` | parent | Layout: horizontal scroll (today) vs responsive grid (dashboard) |
| `hideRefresh` | `boolean?` | parent | Hides the refresh button (unused today; reserved for read-only embeds) |

### State (local)

| State | Source | Purpose |
|-------|--------|---------|
| `payload` | `fetchSeasonalPicks` result | Render data |
| `loading` | initial fetch flag | Skeleton row |
| `refreshing` | manual-refresh flag | Spinner on the refresh button |
| `error` | catch | Inline "try again" affordance |
| `loggedRef` | `useRef(false)` | One-shot guard against double-firing `seasonal_picks_loaded` when both Dashboard + Today render together on tablet breakpoints |

`SeasonalPickTile` additionally holds:

| State | Purpose |
|-------|---------|
| `thumb` | Wikipedia thumbnail URL (null while loading, then string or null on miss) |
| `imgErrored` | Switches to fallback icon when the URL 404s |

### Data flow — read paths

#### 1. `fetchSeasonalPicks(homeId, { forceRegen })`

- **What it calls**: `supabase.functions.invoke('plant-doctor', { body: { action: 'seasonal_picks', homeId, forceRegen } })`
- **When it fires**: on card mount; on manual refresh
- **Output shape**:
  ```ts
  {
    week_iso: string;           // "2026-W21"
    source: "ai" | "fallback";
    generated_at: string;       // ISO timestamp
    picks: SeasonalPick[];      // 4-6 entries
    from_cache: boolean;
  }
  ```
- **Auth gate**: standard Supabase function invoke — user JWT propagated. Server-side checks `requireHomeMembership`.
- **Caching**:
  - **Client**: `sessionStorage` keyed `rhozly:seasonalPicks` with `{ homeId, weekIso, payload }`. In-flight dedupe via `Map<homeId, Promise>` so two mounts on the same screen coalesce into one call.
  - **Server**: `home_seasonal_picks` row keyed `(home_id, week_iso)`. The cron pre-warms on Mondays.

#### 2. Wikipedia thumbnail per tile

- **What it calls**: `getPlantWikiInfo(scientific_name)` from `src/lib/wikipedia.ts`
- **When it fires**: each tile's mount
- **Caching**: the wiki helper caches per-query internally for the session.

### Data flow — write paths

- **Manual refresh** → calls the edge fn with `forceRegen: true`, which bypasses both the client and server cache and upserts a fresh row.
- **Tap a tile** → `navigate('/library/plant/preview', { state: { result: synthResult } })` — the library's instant-preview path handles the rest (catalogue ensure, URL settle, Save to Shed, Care Guide, etc.). No DB write happens from the card itself.

### Edge functions invoked

| Function | When | Input | Output |
|----------|------|-------|--------|
| `plant-doctor` (action `seasonal_picks`) | Card mount + manual refresh | `{ action, homeId, forceRegen }` | `SeasonalPicksResponse` above |

The action delegates to the shared `_shared/seasonalPicksHandler.ts` `generateSeasonalPicksForHome()` orchestrator so the on-demand path and the cron path use byte-identical logic.

### Cron / scheduled jobs that affect this surface

| Cron | Effect |
|------|--------|
| `refresh-seasonal-picks-weekly` (Mondays 04:00 UTC) | Pre-warms `home_seasonal_picks` for every home whose current-week row is missing. Batch size from `STALE_SEASONAL_BATCH_SIZE` (default 25). System-level AI attribution. |

### Realtime channels

None. The card refetches only on mount + manual refresh.

### Tier gating

| Tier | What they see |
|------|---------------|
| Sprout | Deterministic fallback picks from the JS table. No AI reasoning — templated reasoning lines. Manual refresh still works but always returns the same fallback shape. |
| Botanist | Same as Sprout. |
| Sage | AI-personalised picks with frost-aware reasoning, Shed-aware succession suggestions, dislikes honoured. Manual refresh re-runs the Gemini call. |
| Evergreen | Same as Sage. |

The card itself doesn't gate — the server decides which path runs based on the caller's `subscription_tier` (or the home's tier mix when invoked from the cron with `callerUserId = null`).

### Beta gating

None.

### Permissions / role-based UI

None — every home member sees the same card.

### Error states

| State | Result |
|-------|--------|
| Fetch fails (network / 5xx) | Inline error card with `Try again` button. Tap → re-runs `fetchSeasonalPicks` |
| Picks array empty | Card returns `null` — nothing rendered. Defensive — should never happen given the fallback table always emits ≥4 |
| Wikipedia thumb 404 | Tile shows the `Carrot` (edible) or `Flower2` (ornamental) lucide icon as fallback |
| Tap a tile but the catalogue ensure 5xx's | PlantPreview surfaces its own toast — the card doesn't see it |

### Performance notes

- **Tiles lazy-load images** (`loading="lazy"`).
- **In-flight dedupe** at the service level so two mounts coalesce.
- **SessionStorage cache** means Dashboard ↔ Today navigation is instant — no re-call.
- **Wikipedia thumb cache** lives inside `getPlantWikiInfo` (per-query, session lifetime).
- **No tile-side network calls beyond the thumb** — the tap-through hands off to PlantPreview which owns its own loading state.

### Linked storage buckets

None directly. Wikipedia thumbs are remote URLs; the catalogue path uses `plant-doctor-images` and `instance-photos` once the user lands on PlantPreview / Plant Edit Modal.

---

## Role 2 — Expert Gardener's Guide

### Why open / look at this card

This is the answer to "I want to grow something — what's actually plantable this weekend?" For Sarah, that's the most useful question Rhozly can answer when she opens the app on a Saturday morning. For Marcus, it's a Monday-evening prompt: "given my Shed, my last frost, and what I sowed last week, what's the right next move?"

The card also reframes the app for new gardeners. The Library is "search for plants you've heard of"; this card is "tell me what to start with". When Sarah's Shed is empty and she doesn't yet know what to want, this surface gives her three real, plantable picks instead of a search box.

### Every flow on this card

#### 1. Glance at the picks

- 4-6 tiles, each headed by an image + a sow-method chip ("Direct sow", "Indoor start", "Cutting", etc.).
- Reasoning sentence under the name explains *why this week* — calibrated to your hemisphere and frost date when the AI path runs.

#### 2. Tap a pick

- Opens the standard `PlantPreview` screen at `/library/plant/preview` with an instant placeholder hero. The full Care Guide loads in the background — by the time you look at the tabs, the data is there.
- From there: Save to Shed, view the Grow Guide, view Companions, view Light. All the existing flows.

#### 3. Manual refresh (Sage+)

- The small circular refresh button in the card header re-runs the picks with `forceRegen: true`. Useful on a Sunday when your weekly plan shifted and you want a fresh look.
- Costs one Gemini call. The cached row is overwritten with the new picks.

### Information on display — what every field means

| Element | Meaning |
|---------|---------|
| Hero image | Wikipedia thumbnail for the species. Falls back to a carrot / flower icon if the lookup misses. |
| Sow-method chip (top-left of image) | How to actually plant it. Direct = outdoors, Indoor = on a sill, Cutting / Division = propagation, Transplant = move an established start. |
| Common name | The English plant name + variety in quotes when present (e.g. "Tomato 'Sungold'"). |
| Scientific name | Italic, binomial. Best-effort even for fallback picks. |
| Reasoning | One sentence tying the pick to your context. AI picks reference your frost date or Shed; fallback picks reference the current month. |
| "Sow {window}" chip | The bracketing window this week — e.g. "Sow Apr 15 – May 6". |
| "Harvest {date}" chip (edibles only) | Estimated start of harvest. Ornamentals: chip omitted. |
| Effort chip | Easy / Moderate / Advanced — matches the difficulty signal in the prompt. |
| Sun icons | Up to two sun-tolerance positions the plant thrives in. Sun, cloud-sun, cloud, trees = full sun → full shade. |
| Source label ("Personalised for your garden" / "A few ideas for this week") | First reflects AI tier output, second reflects fallback tier output. |
| "This week" chip in the header | Always shows; reminds you the picks roll over weekly. |

### Tier-by-tier experience

| Tier | Differences |
|------|-------------|
| Sprout | Deterministic picks. Reasoning is templated ("Direct-sow this April for cut-and-come-again leaves."). Refresh still works but produces the same shape. |
| Botanist | Same as Sprout. |
| Sage | AI-personalised picks. Reasoning references your frost date, your Shed, your dislikes. Refresh uses Gemini. |
| Evergreen | Same as Sage. |

### New user vs returning user vs power user

- **Brand new user (empty Shed)** — the card is their "where do I start?" answer. They see 4-6 easy picks for the current month; tapping any opens the full plant preview where they can hit Save to Shed.
- **Returning user (small Shed)** — picks adjust to the current week and to what's already in the Shed. Ornamentals already grown are deduped; edibles get succession-sow suggestions.
- **Power user (50+ plants)** — the AI path summarises the Shed to common-name + scientific-name only (capped at 50 in the prompt) so the context stays small. Marcus's picks tend to include cuttings + late-window succession sows.

### Beta user experience

No difference.

### Common mistakes / pitfalls

- **Treating it as a calendar.** It's a *this-week* card, not a year-round planting calendar. Use the Library / Grow Guide tab for full-year plant-by-plant scheduling.
- **Assuming the fallback knows your frost.** On Sprout / Botanist tiers, the picks are calibrated to your hemisphere but not to your specific frost dates. Upgrade to Sage if you want frost-aware reasoning.
- **Not noticing the dedupe.** If the same ornamental shows up in your Shed already, you won't see it here. That's by design — but if you're hoping to "buy more of X", do it through the Library.

### Recommended workflows

- **Saturday morning plant-something nudge:** open Today → glance at the picks → tap one that fits the weather → Save to Shed → done.
- **Monday weekly plan:** open Dashboard → scan the grid → tap a couple → schedule any sow tasks from the Grow Guide tab.
- **Sage+ Sunday refresh:** if your plan shifted, tap the refresh button to get a new set of 4-6 picks for the same week.

### What to do if something looks wrong

- **Card stuck on the loader** — likely a slow Gemini call on first warm. Wait ~10s; if it still hangs, the error state will render with `Try again`.
- **Picks feel generic for your climate** — your `home_climate` row may be missing frost dates. Set them in Climate Settings (Account → Climate) so future picks can lean on them.
- **All picks are dupes of your Shed** — the dedupe only runs on ornamentals; edibles intentionally include succession suggestions for what you grow. If that bothers you, hit refresh — the AI tries to vary the slate.

---

## Related reference files

- [Home (Main Dashboard)](./17-home-main.md) — renders this card in Simple density
- [Localized Task Calendar](./10-localized-task-calendar.md)
- [The Library](./12-the-library.md)
- [Garden Quiz](../01-onboarding/05-garden-quiz.md)
- [Climate Settings](../07-management/04-climate-settings.md)
- [Seasonality (cross-cutting)](../99-cross-cutting/29-seasonality.md)
- [AI — Gemini (cross-cutting)](../99-cross-cutting/13-ai-gemini.md)
- [Edge Functions Catalogue](../99-cross-cutting/10-edge-functions-catalogue.md)
- [Cron Jobs](../99-cross-cutting/11-cron-jobs.md)

## Code references for ongoing maintenance

- `src/components/seasonal/SeasonalPicksCard.tsx` — card shell + variants
- `src/components/seasonal/SeasonalPickTile.tsx` — one tile + tap → PlantPreview
- `src/services/seasonalPicksService.ts` — invoke wrapper + sessionStorage cache
- `supabase/functions/_shared/seasonalPicks.ts` — Gemini schema + prompt + ISO week + normaliser
- `supabase/functions/_shared/seasonalPicksFallback.ts` — deterministic Sprout/Botanist picker
- `supabase/functions/_shared/seasonalPicksHandler.ts` — shared orchestrator
- `supabase/functions/plant-doctor/index.ts` — `seasonal_picks` action
- `supabase/functions/refresh-seasonal-picks/index.ts` — weekly cron edge fn
- `supabase/migrations/20260624000300_home_seasonal_picks.sql` — table + RLS
- `supabase/migrations/20260624000400_refresh_seasonal_picks_cron.sql` — pg_cron schedule
