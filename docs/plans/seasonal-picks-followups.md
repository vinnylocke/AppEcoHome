# Plan — Seasonal Picks + Quick Access follow-ups

Five user-reported issues from after the Nursery + Seasonal Picks rollout.

## Issues

### 1. "What to grow this week" missing from Quick Access menu

The user wants the seasonal picks card visible on `/quick`. Right now it only renders on `/dashboard` and `/quick/calendar`. The Quick Access home is intentionally fixed-height (`h-full overflow-hidden`) — we'll add the `today` variant (horizontal scroll) between the WalkStartTile and the "Open full dashboard" footer button, and switch the main wrapper from `overflow-hidden` to `overflow-y-auto` so on shorter devices the card is still reachable.

**Files**: `src/components/QuickAccessHome.tsx`.

### 2. Back navigation from Library → Quick Access menu instead of the originating Dashboard

Reproducible: on `/dashboard`, tap a seasonal pick → lands on `/library/plant/:id` (after PlantPreview's replace) → tap Back → lands on `/quick` not `/dashboard`. The cause: `SeasonalPickTile` always uses `navigate("/library/plant/preview", { state })`. The first hop pushes that URL, then `PlantPreview` does `navigate('/library/plant/:id', { replace: true })`. Browser back from the replaced entry should land on the prior history entry, which **should** be `/dashboard` — but isn't, because tracking back through the URL change happens via React Router state, and somewhere the focus-mode shell or the auto-redirect logic in `App.tsx` is reverting non-focus-mode routes to `/quick` on mobile.

Need to actually investigate. Likely fixes:
- Have `SeasonalPickTile` pass an explicit `from` field in `location.state` so PlantPreview's back button knows where to go.
- OR ensure PlantPreview's `navigate(..., { replace: true })` doesn't kill the back stack.

**Files** to read first: `src/App.tsx` routing block, `src/components/library/PlantPreview.tsx`. Likely fix: pass `state.from` and use a custom back handler in PlantPreview when it's set; otherwise leave the existing default.

### 3. "Rocket" pick shows a SpaceX rocket image

`SeasonalPickTile` calls `getPlantWikiInfo(scientific_name || common_name)`. For salad rocket the scientific name is "Eruca vesicaria" — that should disambiguate. Bug hypotheses:
- The AI didn't emit a scientific name (or emitted "Eruca sativa" which Wikipedia redirects oddly).
- The fallback chain inside `getPlantWikiInfo` already tries `common_name` separately and picks the bigger image (the space rocket page).

**Fix**: harden `SeasonalPickTile` to always pass a "plant-disambiguated" query — when only common_name is available, append " plant" so Wikipedia favours the botanical hit. Also short-circuit on a few known ambiguous common names (Rocket → "Eruca vesicaria", Mint → "Mentha", etc.) via a small lookup. Cleanest is the "plant" suffix though — broadly safe.

**Files**: `src/components/seasonal/SeasonalPickTile.tsx`.

### 4. Slow loads + possibly different picks each open — cache audit

Per the user: *"seems to always take a while to load and it may get different results on each load"*.

State of the cache today:
- **Server cache**: `home_seasonal_picks` keyed by `(home_id, week_iso)`. Written by `generateSeasonalPicksForHome` on cache miss, returned on hit. The edge fn uses the service-role client so RLS doesn't block writes.
- **Client cache**: `sessionStorage` keyed by `homeId` + check against current ISO week. Survives a tab refresh; dies on browser-close.
- **Cron pre-warm**: Mondays 04:00 UTC.

What could explain the symptoms:
- **Slow first-of-session load**: sessionStorage is empty on a new tab. The edge fn hit should be fast (server cache HIT), but the round-trip + Wikipedia thumbnails per tile easily total 1-2s. Promoting to **localStorage** would survive across browser closes, dropping the first-load wait to ~0ms for the entire week.
- **Different picks each open**: would only happen if the server cache row is missing or being overwritten. We're confident writes work (service-role client), so this likely a misread by the user. We'll log explicitly so we can confirm.

**Fixes**:
- Promote the client cache from `sessionStorage` → `localStorage` with a `(homeId, weekIso)`-keyed entry. Same TTL semantics (current ISO week).
- Add a one-line log in `fetchSeasonalPicks` indicating cache source (`local`, `server`, or `regen`) so we can verify in dev tools.

**Files**: `src/services/seasonalPicksService.ts`.

### 5. App "fails to load tasks/data" on cold open, gets into a funk

Vague — I want to confirm the symptom before making changes. Suspicions:
- Auth-state race: data fetches fire before `profile.home_id` settles, then never retry. App.tsx has a `fetchDashboardData` that runs on profile changes; if it 500s once it may not retry until a user-action triggers it.
- Pull-to-refresh path isn't wired on the surfaces that "fail to load tasks".

**This wave: scope to investigation only.** I'll read App.tsx + the dashboard data loader, document the race I suspect, and propose a fix in a follow-up if I confirm. Not making a defensive change without a confirmed repro.

## Sequencing

1. Issue 4 — service-cache localStorage promotion (cheap, immediate UX win).
2. Issue 3 — Wikipedia disambiguation fix in SeasonalPickTile (tiny).
3. Issue 1 — Mount SeasonalPicksCard on QuickAccessHome (small UI change).
4. Issue 2 — investigate routing, fix back-stack with `state.from` if needed.
5. Issue 5 — read-only investigation; report findings.
6. Typecheck + tests + deploy.

## App-reference touches

- [docs/app-reference/02-dashboard/09-quick-access-home.md](../app-reference/02-dashboard/09-quick-access-home.md) — note the seasonal-picks mount.
- [docs/app-reference/02-dashboard/14-seasonal-picks.md](../app-reference/02-dashboard/14-seasonal-picks.md) — update the routes list + caching section.
