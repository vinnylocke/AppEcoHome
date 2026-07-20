# Homepage redesign — "Two Postures of Home" (The Porch / The Workbench)

**Status:** Plan — awaiting approval. No application code written.
**User brief:** redesign the homepage using the Hyperplexed craft direction; responsive for PC *and* phone (one page, not forks); show *relevant* information; a great, easy, eye-catching welcome; use the two gardening personas to decide what it contains — "at the moment there's just too much on that page."

---

## 1. The problem, with receipts

Grounded via live screenshots (390px + 1600px, seeded Evergreen account) + a 3-agent code audit of `App.tsx`'s dashboard branch, `HomeMain.tsx`, and every block component:

- **Redundancy is the disease.** The overdue count can render in up to **7 places** on one detailed-density page (sidebar badge, hero headline, hero chip, AttentionRow, Garden Brain brief, Snapshot tile, TaskList). A weather alert in up to **6**. Today's task count in 5–6. On the live desktop viewport: "47 overdue" ×4, heat alert ×3.
- **Chrome shouts before content speaks.** The phone's first viewport = static "Pull to refresh" hint → weather banner → full-width 4-tab switcher → "SYNCED JUST NOW" pill → promo card. Garden content starts ~2 screens down. Total stack: up to 14 HomeMain blocks + 5 chrome layers.
- **Three separate AI voices co-render** (GardenBrainBriefCard, HeadGardenerCard, AssistantCard), and care-adjustment proposals can appear twice (brief item + AdaptiveCareCard — same `applyCareAdjustment` lib).
- **Personas are underused.** `user_profiles.persona` (`'new' | 'experienced' | null`, null⇒new on the client) only nudges defaults (density, quick-action pins, tooltip dimming, AI tone). It never shapes *composition* — which is exactly the lever the user asked for.
- **Latent defects found (fix in-passing):** (a) `DailyBriefCard.tsx:111` and `GardenBrainBriefCard.tsx:168` **both** use `data-testid="daily-brief-card"` and both mount in detailed density — selector collision; (b) `PersonaSetting` never calls `notifyPersonaChanged` — profile flips don't propagate until reload; (c) e2e seeds never reset `persona`, so a crashed walk spec leaks `'experienced'` into later specs.

## 2. App-reference consulted

`02-dashboard/17-home-main.md`, `05-daily-brief-card.md`, `06-assistant-card.md`, `14-seasonal-picks.md`, `16-head-gardener.md`; `01-onboarding/05-garden-quiz.md`, `06-getting-started-checklist.md`, `07-notification-opt-in.md`, `08-pwa-install.md`; `99-cross-cutting/40-design-system.md`, `39-garden-brain.md`, `27-weather.md`, `30-onboarding-state.md`, `21-routing.md`; `docs/DESIGN.md`; plus source end-to-end for every block listed above.

## 3. The direction — Two Postures on the Garden Table

Three independent design proposals (single-hero subtraction / persona bento / persona postures) were scored by a judge on declutter power, 5-second readability, persona fit, responsive quality, on-brand eye-catch, and build risk. Winner: **posture split on preset mechanics**.

**One responsive `HomeMain`, two declarative presets** selected by persona (user-overridable):

- 🪴 **The Porch** (persona `new`/`null`): a warm guided welcome. Huge editorial greeting whose **sentence IS the summary** ("Good morning, Vinny — 3 tasks left before this afternoon's rain"), **one Next Best Action card** (no counts), the garden as **photos**, a gentle today list, learning strip (Seasonal Picks + guides). Almost no numbers.
- 🛠️ **The Workbench** (persona `experienced`): an operations console. Compact hero with a **tabular console line** ("12 today · 3 overdue · 24° clear · golden hour 19:42", each segment deep-linking), an Attention inbox (telemetry/harvest kinds only), the garden grid with sensor/valve chips, task throughput, **The Brief** (one merged AI voice), Week Ahead, collapsed Snapshot. Almost no hand-holding.

**Mechanism (no forked trees):** `src/lib/personaPresets.ts` — `effectivePersona()` (null⇒new) + `HOME_PRESETS: Record<Persona, HomePreset>` (`{sectionOrder, hiddenSections, sectionVariants, quickPins, snapshotOpen}`), rendered by one `SECTION_REGISTRY` loop in HomeMain. Phone = `grid-cols-1` in preset order; desktop = `grid-cols-12` with col-span asymmetry (Porch: centered max-w editorial column + asymmetric photo bento; Workbench: the existing studio split). Mirrors the proven `quickLauncherCatalogue`/`resolvePins` pattern. Stats stay on the **single** `useHomeDashboardStats` mount, passed down.

**One-owner fact map** (the declutter core): overdue → nav badge + hero + TaskList only · weather alert → **global WeatherAlertBanner only** (kept as the sole, dismissible, severity-tinted owner; the hero *sentence* may lead with frost/severe clauses — escalation, not ownership) · today count → hero + TaskList · week → Week card · deep stats → Snapshot behind its toggle · greeting → hero.

**What dies or moves:** `DailyBriefCard` deleted (sun line → hero micro-line; ask-AI + Plan-day → hero; Zone/Microclimate chips → `/home-management` with their testids; testid collision resolved by deletion) · static pull-to-refresh hint deleted · sync pill renders **only when stale >5min/failed** · the three AI cards merge into **The Brief** (`garden-brain-brief`; narrative + care proposals w/ Apply + one Estate-report row + one insight row; `AdaptiveCareCard` survives only as the no-brief fallback; max ONE upgrade teaser page-wide) · Garden Walk banner → featured wide tile in Quick Actions · status-strip pending/skipped/postponed chips die (Calendar owns the breakdown) · Week Ahead count chips stripped (keeps sow/harvest/prune) · promo slot moves **below the hero** (cascade + testids unchanged; notif card auto-expires after ~3 impressions; no promo tiles on the Workbench — one quiet line instead) · 4-tab switcher slims to half-height icon+label pills (SegmentedTabs sliding marker; `dashboard-view-switcher` kept).

**Hero craft (the eye-catcher, from the vetted shortlist):** `text-4xl` display greeting vs 10px/700 micro-labels (type contrast as THE eye-catcher) · unit-tested `src/lib/heroSentence.ts` with a strict clause ladder (frost > severe alert > overdue > rain > tasks > praise) · ≤2 chips that never restate a sentence number · sun micro-line (60s interval, visibility-paused, tabular-nums) · static time/frost-adaptive hero wash · one-shot staggered entrance across sections (cap 6×40ms) · one PhotoGlow max (Porch garden lead cell, user photos only, never stock).

**Craft budgets as PR review gates:** ≤1 gradient surface, ≤1 backdrop-blur, ≤1 PhotoGlow, ≤1 SparkleAccent, ≤1 live element, zero looping animation, compositor-only + motionTier throughout.

## 4. Guard-rails

- **Tour:** all six `dashboard_tour` anchors (`dashboard-view-switcher`, `home-status-strip`, `home-garden-section`, `home-quick-actions`, `seasonal-picks-card`, `home-todays-tasks`) must exist in the **Porch** preset (the tour audience always lands there). flowRegistry step reorder + switcher screenshot re-capture in the same PR that moves things.
- **Tests:** seeds set `persona = NULL` explicitly (kills inter-spec leakage); specs force composition via a new `rhozly:home:preset` localStorage override (legacy `rhozly:home:density` `detailed` aliases → Workbench so ~8 existing specs keep passing); unit-test preset/sentence permutations; e2e asserts per-section testids, not page shape.
- **The Brief is the riskiest merge** → isolated as its own stage with a no-`daily_briefs`-row fallback spec + server prompt change (`synthesize-garden-brief` stops restating raw counts) + Deno test.

## 5. Staged build order (each stage ships + verifies independently)

- **Stage 0 — persona plumbing, zero visual change:** `personaPresets.ts` (+unit tests), seed persona reset, lift persona into the profile fetch (synchronous first paint — kills the porch-flash race), the `notifyPersonaChanged` one-line fix, preset override key.
- **Stage 1 — hero + chrome:** `heroSentence.ts` (+exhaustive unit tests), HomeStatusStrip → hero (sentence + console variants), slim switcher, conditional sync pill, delete pull hint, promo below hero, tour updates.
- **Stage 2 — cuts and moves (no AI merge):** delete DailyBriefCard w/ fact migration, walk banner → tile, TaskList compact + "Open board", WeekAhead chips, snapshot default-collapsed, AttentionRow route-scoped kind filter.
- **Stage 3 — The Brief merge** (+ server prompt + Deno test + fallback spec). *Correction (2026-07-20, found in implementation): the brief-narrative function is **`generate-daily-brief`** (writes `daily_briefs` via cron; invoked by GardenBrainBriefCard) — earlier references to `synthesize-garden-brief` were a misnomer; that function drafts the manager's one-time Garden Brief and is untouched. The re-prompt + two-way persona collapse landed in `_shared/dailyBrief.ts` (`buildBriefVoicePrompt`, brief-only call site; `_shared/persona.ts`'s three-way semantics preserved for its 8 other consumers).*
- **Stage 4 — posture composition:** SECTION_REGISTRY loop, both presets live, Next Best Action card, desktop grids, PhotoGlow, entrance stagger, full e2e sweep, release notes flagging the two discoverability moves.

## 5b. Known limitations / tracked follow-ups (post-Stage-4 review, 2026-07-20)

Fresh review verdict = ship. Fixed in-task: NextBestAction seasonal CTA now gates on the learn wrapper's child count (was a dead tap when Seasonal Picks self-hid on an empty pick list); TheBrief's tier-coupling assumption documented. Deferred (low/cosmetic, not regressions):

- **`dashboard_tour` anchors are Porch-only** (steps 5 `seasonal-picks-card` + 6 `home-todays-tasks` don't exist on the Workbench, which has no learn section and uses `dashboard-task-list`). Matches the guard-rail (§4 — the tour audience always lands on the Porch as a new user); an *experienced* user who manually replays the tour gets two orphaned Shepherd steps. Not a Stage-4 regression (detailed density lacked `home-todays-tasks` before too). Follow-up: anchor both steps on both-posture-stable testids if replay-in-Workbench ever matters.
- **TheBrief defaults-TRUE ledger** flashes empty "From Rhozly" chrome for ~1 frame (ungated rows) up to the tier-resolution window (gated rows) on a cold load for a data-less Evergreen account, and re-flashes on posture toggle (the card remounts between column and aside). Deliberate trade-off to avoid a flash-*in* for populated cards; child fetches are snapshot-cached so the toggle re-fetch is cheap.
- **Preset variants garden `photos`/`telemetry`, promo `line`, today `throughput`, brief `gentle`/`full` are declared but no-op** — both postures render the existing grid / promoSlot / compact list. The photo-bento + quiet-promo-line are a later slice.

## 6. Decisions

**Resolved in-plan (clear winners):** (a) global WeatherAlertBanner stays the single alert owner everywhere — keeps per-day dismissal, no route special-casing; (b) server `synthesize-garden-brief` adopts the client's two-way persona collapse (null⇒new) in the Stage 3 prompt change — one semantic everywhere.

**CONFIRMED by user (2026-07-20):** (0) **direction approved — build it**; (1) density toggle **becomes the posture override** (same control/testids/key; legacy `detailed` → Workbench); (2) experienced hero = **tabular console line** (each segment deep-linking); (3) the full tabbed TaskList **moves behind "Open board"** on the Workbench (compact list stays on-page; release-noted).

## 7. App-reference files to update (per stage, in-task)

`17-home-main.md` (major rewrite), `05-daily-brief-card.md` (retire/absorb), `06-assistant-card.md` + `16-head-gardener.md` (Brief merge), `14-seasonal-picks.md`, `07-notification-opt-in.md` + `08-pwa-install.md` (slot move/expiry), `39-garden-brain.md` (Brief + prompt change), `27-weather.md` (one-owner), `30-onboarding-state.md` (tour changes), `40-design-system.md` (hero pattern + budgets), new reference for the Next Best Action card; e2e-test-plan §05/§30 + TESTING.md counts.
