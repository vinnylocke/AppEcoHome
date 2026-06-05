# Plan — Fix missing "Sow this week" section on /weekly

## Context

User: "when I click the week ahead I can't see the what to sow section."

Diagnosed (verified via REST API):
1. The deterministic "Sow this week" chip strip in `WeeklyOverviewPage` only renders when `payload.sow_this_week.length > 0`. That array has been empty on every overview row in prod since Wave 21.
2. Root cause: [`generate-weekly-overviews/index.ts:430-439`](../../supabase/functions/generate-weekly-overviews/index.ts#L430-L439) queries `public.sowing_calendar` — but **that table doesn't exist in prod**. The query throws "Could not find the table 'public.sowing_calendar' in the schema cache" and the surrounding `try/catch` swallows it silently. The section has been dead from day one.
3. The Wave 21.0005 SeasonalPicksCard I just added to `/weekly` does render in its place, but its title reads "What you could grow this week" — not visually identifiable as the sow section.

## App-reference files consulted

- [`docs/app-reference/02-dashboard/15-weekly-overview.md`](../app-reference/02-dashboard/15-weekly-overview.md) — page section list (currently lists "Sow this week" as one of 9 sections)
- [`docs/app-reference/02-dashboard/14-seasonal-picks.md`](../app-reference/02-dashboard/14-seasonal-picks.md) — SeasonalPicksCard variants + titles
- [`docs/app-reference/99-cross-cutting/03-data-model-plants.md`](../app-reference/99-cross-cutting/03-data-model-plants.md) — confirms `sowing_calendar` is not part of the data model (was never migrated)

## Approach

Two-part cleanup + one tiny rename. No new feature.

### 1. Drop the dead deterministic Sow section

**Edge function** ([`supabase/functions/generate-weekly-overviews/index.ts`](../../supabase/functions/generate-weekly-overviews/index.ts)):
- Remove the `sowing` variable + `sowing_calendar` query block (lines ~427-439)
- Remove `sow_this_week` from the payload object emit
- Old rows with `sow_this_week: []` are harmless; new rows simply won't have the field

**Page** ([`src/components/WeeklyOverviewPage.tsx`](../../src/components/WeeklyOverviewPage.tsx)):
- Drop the `<Section icon={Sprout} title="Sow this week">` block (~lines 290-304)
- Drop `sow_this_week` from the payload TypeScript interface

### 2. Rename SeasonalPicksCard's dashboard-variant title

In [`src/components/seasonal/SeasonalPicksCard.tsx`](../../src/components/seasonal/SeasonalPicksCard.tsx) the title resolver at lines 342-346:
```ts
{isCarousel
  ? "Grow this week"
  : variant === "today"
    ? "This week's sowing picks"
    : "What you could grow this week"}
```

Change the `dashboard` branch to **"Sow & grow this week"**. Three reasons:
- Surfaces "Sow" so users scanning for the sow section find it
- Keeps "grow" because the card covers sowing + planting-out + propagating, not just sowing
- Applies on both `/dashboard` and `/weekly` (same variant), and that's the right title for both — desktop dashboard users were equally entitled to a clearer name

### 3. Update SeasonalPicksCard so the WeeklyOverviewPage placement reads as the canonical "sow" section

No extra wrapping — the card already has its own chrome. Just the rename.

## Files modified

| File | Change |
|------|--------|
| [`supabase/functions/generate-weekly-overviews/index.ts`](../../supabase/functions/generate-weekly-overviews/index.ts) | Drop `sowing_calendar` query + `sow_this_week` payload field |
| [`src/components/WeeklyOverviewPage.tsx`](../../src/components/WeeklyOverviewPage.tsx) | Drop the deterministic Sow Section + the `sow_this_week` interface field |
| [`src/components/seasonal/SeasonalPicksCard.tsx`](../../src/components/seasonal/SeasonalPicksCard.tsx) | Rename dashboard-variant title to "Sow & grow this week" |
| [`docs/app-reference/02-dashboard/15-weekly-overview.md`](../app-reference/02-dashboard/15-weekly-overview.md) | Remove "Sow this week (tiles)" from section list; note SeasonalPicksCard is the sow surface |
| [`docs/app-reference/02-dashboard/14-seasonal-picks.md`](../app-reference/02-dashboard/14-seasonal-picks.md) | Update dashboard variant title in the title-resolver table |

## Tests

- No backend schema change, no migration, no cron schedule change.
- Vitest: not strictly needed (string rename + dead-code removal).
- E2E (docs only): no test rows referenced "Sow this week" — nothing to update.

## Deploy

- One function deploy (`generate-weekly-overviews`).
- One Vercel deploy (page + card title).
- Standard minor bump → 21.0006.

## Risks

- **Backwards compat:** old `weekly_overviews` rows still have `sow_this_week: []` in the payload. Dropping the field from the TS interface + render path means existing rows just get the field ignored. Zero rollback risk.
- **Rename impact on Dashboard:** users seeing the SeasonalPicksCard on `/dashboard` will see the new title too. Net positive — "Sow & grow this week" is clearer than the prior wording.
- **No data loss anywhere.**
