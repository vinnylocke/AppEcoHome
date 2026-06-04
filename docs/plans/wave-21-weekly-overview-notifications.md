# Plan — Wave 21: Weekly Overview + Notification Bundle

## Context

Vinny wants three notification additions, plus a substantial new surface:

1. **Golden Hour notification** — already a toggle in the Notifications tab, marked "coming soon". Needs wiring.
2. **Weekly Optimise Digest notification** — already a toggle in the Notifications tab, marked "coming soon". Needs wiring.
3. **Weekly Overview page + notification** — brand new. A single page that shows the week ahead: task counts, weather events, what to sow, harvest/prune windows opening, maintenance, pollen forecast, pest/disease risk, plus tips. Generated weekly, notification fires when the new overview is ready.

The infrastructure to lean on:
- [`supabase/functions/daily-batch-notifications/index.ts`](supabase/functions/daily-batch-notifications/index.ts) — existing per-user notification builder.
- [`supabase/functions/weekly-digest/index.ts`](supabase/functions/weekly-digest/index.ts) — existing weekly EMAIL digest (separate from in-app notifications). Useful prior art for week-window logic.
- [`supabase/functions/optimise-area-ai/index.ts`](supabase/functions/optimise-area-ai/index.ts) — AI-driven schedule optimisation; feeds the Optimise Digest.
- [`src/lib/sunProjection.ts`](src/lib/sunProjection.ts) — sunset / sunrise math for Golden Hour.
- [`docs/app-reference/99-cross-cutting/12-notifications.md`](docs/app-reference/99-cross-cutting/12-notifications.md) — channels (in-app toast / browser Notification / Firebase push).
- [`src/components/GardenerProfile.tsx`](src/components/GardenerProfile.tsx) — the prefs flag for each category lives here.

Notification prefs (LS-backed today, not yet server-side):
```ts
goldenHour: false      // OFF by default
optimiseDigest: false  // OFF by default
```

There's no weekly overview pref yet — Wave 21.A adds it.

## App-reference files consulted

- [docs/app-reference/99-cross-cutting/12-notifications.md](docs/app-reference/99-cross-cutting/12-notifications.md) — channels + permissions + cron
- [docs/app-reference/06-account/02-notifications-tab.md](docs/app-reference/06-account/02-notifications-tab.md) — pref UI
- [docs/app-reference/99-cross-cutting/11-cron-jobs.md](docs/app-reference/99-cross-cutting/11-cron-jobs.md) — existing cron list
- [docs/app-reference/99-cross-cutting/27-weather.md](docs/app-reference/99-cross-cutting/27-weather.md) — weather snapshot shape + Open-Meteo fields
- [docs/app-reference/99-cross-cutting/28-sun-analysis.md](docs/app-reference/99-cross-cutting/28-sun-analysis.md) — sunset/sunrise

## Recommended phasing

Five distinct waves so each ships cleanly. **Wave 21.A is the foundation** — the others can be ordered however you want, but the digest cron + notification wiring patterns from A make B/C/D/E much smaller.

### Wave 21.A — Weekly Overview foundation (biggest piece)

**Schema** — new table `weekly_overviews`:
```sql
CREATE TABLE public.weekly_overviews (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id      uuid NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  week_start   date NOT NULL,           -- Monday of the week
  generated_at timestamptz NOT NULL DEFAULT now(),
  payload      jsonb NOT NULL,          -- shape below
  UNIQUE (home_id, week_start)
);
```

Payload shape:
```jsonc
{
  "task_counts": { "Watering": 7, "Harvesting": 3, "Pruning": 1, "Maintenance": 2, "Planting": 0 },
  "weather_events": [
    { "kind": "frost",     "date": "2026-06-08", "severity": "warning", "note": "Min 1°C overnight" },
    { "kind": "heavy_rain","date": "2026-06-10", "severity": "info",    "note": "12mm over 6h" }
  ],
  "sow_this_week":     [ { "plant_name": "Lettuce 'Little Gem'", "why": "Mid-spring sowing window opens" } ],
  "harvest_this_week": [ { "inventory_item_id": "...", "plant_name": "Strawberries", "reason": "Window opens 8 Jun" } ],
  "prune_this_week":   [ { "inventory_item_id": "...", "plant_name": "Lavender",     "reason": "Late-spring shape prune" } ],
  "maintenance_count": 2,
  "tips": [
    "Mulch tomato beds before the warm spell to lock moisture in.",
    "Tip overwintered onions now if you spot bolting risk."
  ]
}
```

(Pollen + pest/disease risk are deliberately deferred to D/E — the keys can be added later without a schema change since payload is jsonb.)

**New edge function: `supabase/functions/generate-weekly-overviews/index.ts`** — cron-driven, runs every Sunday at 06:00 UTC. For each `homes` row:
1. Window = next Monday to next Sunday (the week ahead).
2. Task counts: query `tasks` filtered to Pending + due_date in the window + window_end_date intersecting the window for harvest tasks. Group by `type`.
3. Weather events: pull the next 7 days from `weather_snapshots` (already maintained by `fetch-weather` cron) and apply the existing weather rules (`_shared/weatherRules`) to extract frost / heatwave / heavy_rain / strong_wind / waterlogging.
4. Sow / harvest / prune lists: rely on existing seasonal helpers in `src/lib/seasonal.ts` / `_shared` + the plant inventory.
5. Tips: small Gemini call grounded by the same context (deferred to 21.D if the user wants AI tips later — for the foundation we can ship 3 deterministic seasonal tips).
6. Upsert `weekly_overviews(home_id, week_start)` so re-running the cron mid-week refreshes the row.

**New route + page: `/weekly`** rendered by a new `WeeklyOverviewPage` component:
- Header: "Your week · 8 Jun – 14 Jun" + a small `Last updated 06:14 BST` line.
- Section cards in order:
  1. Tasks (chips per type with counts)
  2. Weather (icon row per day + alert chips)
  3. Sow this week (tiles)
  4. Ready to harvest (tiles)
  5. Ready to prune (tiles)
  6. Maintenance (count + link)
  7. Tips (bulleted)
- Empty state per section ("Nothing to sow this week — your shed is fully potted").
- "Re-generate" admin button (Sage+) that fires the edge fn for this home only — useful for QA + late-arriving plants.

**Notification dispatch** — Wave 21.A also wires Push + browser delivery:
- Cron writes a row into `notifications` with `type: "weekly_overview"` and a deep-link to `/weekly`.
- `usePushNotifications` already pushes new `notifications` rows out; no client change needed.

**Pref toggle** — new `weeklyOverview` key in `NotificationPrefs`, default `true`. Wired immediately.

**Tests** — Vitest for the page's empty-state rendering + the helper that computes task counts. Deno test for the weather-event extraction step.

**Docs** — new app-reference file `docs/app-reference/02-dashboard/15-weekly-overview.md`; add to INDEX; cron entry in `99-cross-cutting/11-cron-jobs.md`.

**Release notes label**: New.

---

### Wave 21.B — Golden Hour notification

Tiny compared to A. Already has a pref toggle.

**Cron**: extend `daily-batch-notifications` (it runs once daily) to also compute today's sunset for each home (using its lat/lng via the existing sun helper) and write a separate `golden_hour` notification with the time. Fires in the morning so the user has heads-up.

Notification body: *"Golden hour begins at 7:42pm — soft light for plant photos, deadheading, and watering."*

Skipped when:
- Pref `goldenHour: false`.
- The home doesn't have a lat/lng yet.
- Sunset is < 2 hours from now (the user already missed the morning window).

Flip the `wired: false` flag to `true` in `GardenerProfile.tsx`.

**Tests**: Deno unit on the sunset-time formatter; integration check that the cron skips disabled prefs.

**Release notes label**: New.

---

### Wave 21.C — Weekly Optimise Digest notification

Already has a pref toggle + the underlying `optimise-area-ai` edge function.

**New cron: `supabase/functions/weekly-optimise-digest/index.ts`** — runs Sunday 07:00 UTC (after the overview at 06:00 UTC so the two notifications don't land at the same minute). For each home:
1. Skip when pref `optimiseDigest: false`.
2. Run the existing optimise engine against every active area.
3. Bundle the top 3 proposals per home into a single `weekly_optimise_digest` notification with a deep-link to the Optimise tab.

Notification body: *"Three schedule improvements found this week — tap to review."* (or "No improvements this week — your schedules look tight.")

**Tests**: integration test that the cron honours the pref.

**Release notes label**: New.

---

### Wave 21.D — AI tips + pest/disease risk module (extension of A)

Adds two more sections to the weekly overview payload + page:
- **AI tips** (3–5 items) — small Gemini call grounded by the home's `area_climate` + current plant inventory + the week's weather + seasonal context. Cached on the weekly overview row.
- **Pest / disease risk** — server-side combinator using:
  - Weather conditions (humidity > X + temp range Y → blight risk for nightshades, etc.).
  - Current inventory (only flag risks for plants the user actually grows).
  - Local seasonal pressure (e.g. "slug pressure high after the rain Wednesday").

Each risk is a row: `{ plant_name, risk_kind, level: "low" | "elevated" | "high", note, action }` — render as a sub-section of the overview.

Tier-gate the AI tips to Sage+ (uses Gemini quota). Risk module is free for everyone (rule-based).

**Release notes label**: Improved.

---

### Wave 21.E — Pollen forecast (extension of A)

Adds a pollen section to the overview:
- Source: Open-Meteo's [Air Quality API](https://open-meteo.com/en/docs/air-quality-api) includes grass/birch/ragweed pollen counts.
- Add a daily `pollen_snapshot` fetch to the existing `fetch-weather` cron (or a sibling cron) keyed on home_id.
- Surface "Pollen this week: Grass HIGH Tue-Fri" in the overview.

Tier-gate: free (read-only data from Open-Meteo).

**Release notes label**: Improved.

---

## Files changed (summary across waves)

| Wave | New | Modified |
|------|-----|----------|
| A | `supabase/functions/generate-weekly-overviews/index.ts`, `src/components/WeeklyOverviewPage.tsx`, migration `weekly_overviews` table, `docs/app-reference/02-dashboard/15-weekly-overview.md`, Vitest for the helper | `src/App.tsx` (route), `src/components/GardenerProfile.tsx` (new pref + flip flags), `docs/app-reference/99-cross-cutting/11-cron-jobs.md`, `docs/app-reference/99-cross-cutting/12-notifications.md`, INDEX |
| B | – | `supabase/functions/daily-batch-notifications/index.ts`, `GardenerProfile.tsx` (`wired: true`) |
| C | `supabase/functions/weekly-optimise-digest/index.ts` | `GardenerProfile.tsx` (`wired: true`), notifications ref, cron ref |
| D | – | `generate-weekly-overviews` (add tips + risk), `WeeklyOverviewPage.tsx`, app-ref |
| E | possibly `fetch-pollen` sibling cron | `generate-weekly-overviews` (consume pollen), page, app-ref |

## Risks / tradeoffs

- **AI quota** for tips — bounded to once-per-week-per-home, so manageable. Gate to Sage+.
- **Weekly overview accuracy** depends on harvest blueprints having `end_date` set. The post-Wave-20 backfill covered this, but if a user creates a fresh harvest blueprint without an end_date, the "ready to harvest" section will miss it. The cron can log this as a soft warning.
- **Pollen API** is per-region; need to confirm Open-Meteo coverage for non-EU/US users.
- **Notification overload** — three new categories on top of dailies could feel noisy. Each is opt-in and the prefs UI already groups them; default Weekly Overview ON, Golden Hour OFF, Optimise Digest OFF (the latter two were already OFF in the "coming soon" state and that feels right).

## Plan-doc discipline

Each wave gets its own implementation plan doc when we actually start it, citing this overview as the parent. That keeps individual plans small enough to review quickly.

## Open questions for Vinny

1. **Order of waves?** Recommended: A → B → C → D → E. A is the biggest investment but the other four lean on its plumbing. Happy to do B + C first if you want quick "fill the coming-soon gap" wins.
2. **AI tips on the foundation (Wave A) or defer to D?** Recommended: defer. A keeps it deterministic + tested; D adds the AI later.
3. **Pollen + pest/disease risk** — must-have for the first ship of the overview, or can they wait?
4. **Weekly overview default ON?** I've assumed yes (default `weeklyOverview: true`). If you'd rather have it opt-in like Golden Hour, flag it.
5. **Notification time** — Sunday 06:00 UTC for both the overview generation and the push is the obvious slot. Want a different cadence (e.g. Sunday 6pm so users plan over Sunday evening)?
