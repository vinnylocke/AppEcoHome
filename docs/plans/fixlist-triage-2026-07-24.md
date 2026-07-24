# Fix-List Triage — 12 Investigated Items (2026-07-24)

> Produced from a 12-agent parallel investigation (one agent per item, each reading the
> relevant `docs/app-reference/` + source and root-causing against the running code).
> This is a backlog/scoping doc — each item gets its own `docs/plans/<task>.md` before it is built.

## 1. One-line summary

Twelve investigated items break down to **six low-risk fixes ready to ship now** (three need no owner input at all), **four decision-gated mid-size features/UX changes**, and **two heavier bets** — the `plant_library` Discover swap and the XL nav/IA reorg — with the IA reorg being the only genuinely risky, must-decide-first item in the backlog.

## 2. Prioritised table (recommended sequence)

| # | Item | Category | Effort | Risk | Confidence | Decision? |
|---|------|----------|--------|------|------------|-----------|
| 1 | `watch-phone-realtime` — TaskCalendar has no realtime sub | bug | S | low | high | N |
| 2 | `ai-voice-asterisks` — render markdown in bubbles + strip before TTS | bug | M | low | high | N |
| 3 | `watch-scroll-lag` — unkeyed ScalingLazyColumn + in-composition filters | perf | M | low | medium | N |
| 4 | `ai-chat-history` — history loads OLDEST 50, recent turns vanish | bug | S | low | medium | Y (minor) |
| 5 | `head-gardener-icon` — generic Leaf under-signals "AI manager" | ux | S | low | high | Y |
| 6 | `gardening-experience` — persona reads as a no-op (+ doc drift) | clarity | M | low | high | Y |
| 7 | `journal-note-button` — Capture tile jumps into Journal, no Notes choice | ux | M | low | high | Y |
| 8 | `ailment-back-routing` — swipe-back leaves the tab, not just the modal | bug | M | medium | high | Y |
| 9 | `journal-entry-modal` — per-entry view/edit modal + condensed list | feature | L | low | high | Y |
| 10 | `verdantly-discover` — swap Discover source AI→plant_library + Verdantly | feature | L | medium | high | Y |
| 11 | `regen-guide-counts` — ailment step counts read 0 (text-blob vs array) | bug | L | medium | medium | Y |
| 12 | `ia-reorg` — promote Calendar+Weather(+Routines), regroup Planner/Shopping | ia-decision | XL | high | high | Y |

## 3. Quick wins (no owner decision required — safe to start immediately)

- **#1 `watch-phone-realtime`** — `TaskCalendar.tsx` registers zero realtime callbacks; add `useHomeRealtime("tasks", refetch)` + `useHomeRealtime("task_blueprints", refetch)` mirroring `TaskList.tsx:300-308`. Pipeline is already healthy (tasks published, socket open); also fixes any external writer (other members, crons), not just Wear.
- **#2 `ai-voice-asterisks`** — bubble uses `whitespace-pre-wrap` with no markdown parser (`PlantDoctorChat.tsx:1190-1194`), and raw markdown is fed to TTS. `react-markdown`+`remark-gfm` already installed. Render markdown in bubble; add a `markdownToSpeech` strip at the single `useTextToSpeech.speak()` choke point.
- **#3 `watch-scroll-lag`** — `items()` calls miss `key = { it.id }` (`TasksScreen.kt:278/282/286`), three `.filter{}` passes run in composition, and `pullState.progress` is read top-level → whole-screen recompose per frame. All three are contained Compose fixes in `wear/`.

Trivial-decision quick wins:

- **#4 `ai-chat-history`** — one-character root cause: `.order("created_at", { ascending: true }).limit(50)` returns the OLDEST 50 (`PlantDoctorChat.tsx:438-439`). Flip to `ascending: false` + reverse client-side. DESC index already exists.
- **#5 `head-gardener-icon`** — `Leaf` (`App.tsx:1407`) is the app's generic plant glyph (`icons.ts:30`), signalling botany not oversight. One glyph swap + `HeadGardenerCard.tsx` (3 spots) + register as `IconHeadGardener`.

## 4. Decisions needed before work

**A. `#12 ia-reorg` — lock the target IA (biggest, gates all code).** The proposal's mental model diverges from the wiring: Shopping and Routines are *already* tabs inside PlannerHub; Calendar and Weather are *already* grouped as Dashboard `?view=` sub-tabs. Confirm:
1. **Section A name (Planner + Shopping):** the word "Tools" is already taken by ToolsHub (`/tools` tile launcher). Pick — (i) rename the grouping "Plan"/"Planning", leave ToolsHub as-is *(recommended)*; (ii) fold Planner+Shopping into ToolsHub as tabs (heavier); (iii) a different word.
2. **Section B name + route (Calendar + Weather + Routines):** e.g. "Calendar"/"Schedule"/"Diary" at `/calendar`?
3. **Does Routines *leave* Planner** entirely for Section B, or appear in both?
4. **Standalone `/schedule`** (renders same BlueprintManager): become the Section-B tab, redirect into it, or stay?
5. **Mobile Deck has only 5 slots** (Home/Plants/Capture/Tasks/More) — do the new sections get Deck slots (something must give) or live in the Shelf/More only?

**B. `#5 head-gardener-icon` — which glyph?** All present in lucide 1.7.0. Options: (1) **UserRoundCog** — manager/steward persona, most literal *(recommended)*; (2) **Compass** — guidance / brief-as-north-star; (3) **Telescope** — oversight + looking ahead. Avoid Brain (clashes with Garden Brain feature), Crown (reads as upsell), Sparkles (already IconAI).

**C. `#6 gardening-experience` — how to make persona legible?** Honest finding: the "Gardening experience" toggle (`user_profiles.persona`) is real but **purely cosmetic/tonal** — it changes inline-tip density, tooltip dimming, AI voice, and one home-layout default (often overridden by a localStorage preset). It gates/filters/unlocks nothing. A *separate* 4-level quiz "experience" answer does effectively nothing. Options: (A) keep it, add a "what this changes" explainer to the PersonaSetting card; (B) unify the two controls into one lever; (C) rename to "Detail level / How much guidance do you want?". **Recommend A+C**; fix the drifted `05-garden-quiz.md` + `10-garden-profile.md` docs regardless.

**D. `#7 journal-note-button` — Capture "Journal note" interaction pattern?** (A) **Chooser sub-sheet** — one tile → in-sheet "New journal entry" vs "Add note" *(recommended)*; (B) two tiles (breaks the balanced 2×2 grid → 5 tiles); (C) plain landing on `/journal` (least code, one extra tap). A and B both require a new `?open=add-note` handler in `NotesPage.tsx` (none exists today); C needs no handler.

**E. `#10 verdantly-discover` — "instead of AI, use our internal library" scope?** (Q1) AI branch: (a) fully **replace** AI with `plant_library` — orphans `generate-swipe-plants` and loses its owned-plant/rotation/light/preference grounding; or (b) library as **primary/free** source, keep AI as optional secondary for higher tiers *(recommended)*. (Q2) If (a), do we still exclude owned/disliked/rotation-avoided plants (that logic lives server-side today)? (Q3) Verdantly for everyone, or behind the existing `enable_perenual` gate (Sage+/Evergreen only)? Note: `plant_library` is free for all tiers — this fix also **unbreaks Sprout's currently error-only Discover tab**.

**F. `#11 regen-guide-counts` — fix scope (the two asks are separable).** (A) **Fix the count/shape mismatch** so aphids reads ~6 treatments/preventions not 0-1 — either (A1) a text→steps splitter at read/map time, or (A2) change `ailment_library` to store step arrays + backfill migration; and/or (B) build the requested admin **"Regenerate guide"** control (doesn't exist for plants or ailments today). **Critical caveat:** adding Regenerate (B) *without* (A) still shows wrong counts — a regenerate re-produces the same flat-text blob. Treat as data-shape bug first, feature second.

**Minor / defaultable decisions** (proceed on the recommendation unless the owner objects):
- **#4 `ai-chat-history`:** (A) fetch newest 50 *(recommended default)* vs (B) + a "Load earlier" keyset-pagination affordance.
- **#8 `ailment-back-routing`:** mechanism = mirror the in-file `?detail=` URL-param pattern via a new `?owned=<uuid>` param *(recommended)* vs a novel pushState/popstate shim; scope = fix owned-card modal + its search-takeover twin, don't yet generalise to all pure-state modals.
- **#9 `journal-entry-modal`:** row interaction = **tap-row → read-only View, Edit button inside** *(recommended)* vs two explicit View+Edit buttons per row; Notes parity (make tap = View not immediate edit); whether `PlantJournalTab` is in scope.

## 5. Bigger / riskier items

**#12 `ia-reorg` (XL, high risk)** — the only high-risk item. Cross-cuts the entire nav system: one `navLinks` array feeds sidebar + Shelf; the Deck is a *parallel* 5-slot list; `TAB_URL` binds ids→routes; Dashboard `?view=` persistence (`rhozly_dashboard_view`) + `matchPaths` + redirect routes. **~14 in-app deep-link callers** of `/dashboard?view=calendar|weather` must be repointed atomically or they misroute. Do **not** code until the IA is written down (decision A). Then ship as **two independent slices**, each of which alone declutters the dashboard: Slice 1 = promote Calendar+Weather(+Routines) to a new top-level tabbed section, delete the 3-pill switcher + `?view=` branches/persistence, codemod the 14 callers; Slice 2 = rename the Planner grouping to avoid the ToolsHub "Tools" collision. Wear OS companion is unaffected (talks to edge fns, not web routes). Update `layout.spec.ts` NAV-* + page objects in the same task.

**#10 `verdantly-discover` (L, medium)** — needs a **new authenticated-granted RPC** returning random full `plant_library` rows (the existing `plant_library_random_avoid_sample` is service-role-only and returns keys, not rows). Verdantly can't reuse Perenual's "empty query + random page" trick — `verdantly-search`'s `search` action requires a non-empty query; only `filter` browses. Risk is the grounding loss if AI is fully replaced (Q1a). No test coverage exists for this deck today — must add Vitest/Deno/Playwright per repo rules.

**#11 `regen-guide-counts` (L, medium)** — shape mismatch between generator (flat text columns) and reader (jsonb array `.length`). Dependency: `AutomationEngine.createTreatmentBlueprints` consumes remedy steps, so under-counted steps also **degrade auto-generated treatment schedules**, not just the displayed count. Option A2 (schema change) interacts with `user_favourite_ailments` snapshots + `ailment_image_overrides` keyed off the same rows.

**#9 `journal-entry-modal` (L, low risk)** — feature, but low-risk because the data layer already exists: `useGlobalJournal.update()` is defined and wired to nothing. Journal has never had a per-entry detail modal; Notes has an edit-only modal with no read-only view. Must render Auto entries read-only-cleanly and not disturb the `unique(task_id)` invariant. Fixes `10-plant-journal-tab.md` edit-flow doc drift in the same task.

## 6. Recommended order of attack

1. **`watch-phone-realtime`** — smallest real bug, no decision, purely additive; ship first.
2. **`ai-voice-asterisks`** — no decision, deps already installed; pairs with the AI-chat theme.
3. **`ai-chat-history`** — one-line query flip; **group with #2 as the "Garden AI polish" batch** (same component/surface, default to newest-50).
4. **`watch-scroll-lag`** — no decision; **group with #1 as the "Wear pass"**, ship both Wear fixes together and verify on-device once.
5. **`head-gardener-icon`** — trivial once the glyph is picked; cosmetic, zero system risk.
6. **`gardening-experience`** — mostly copy + doc-drift fix; low risk, high clarity payoff; do once A/C confirmed.
7. **`ailment-back-routing`** — proven `?detail=` pattern already in-file to mirror; medium risk (Escape/back must share one close path).
8. **`journal-note-button`** → **`journal-entry-modal`** — **do these two as one journal workstream**: the Capture-tile chooser adds the `?open=add-note` handler that the note-view/edit work also benefits from; same components, same app-reference docs (`11-global-journal.md`, `14-notes.md`).
9. **`verdantly-discover`** — L feature; needs the new RPC; unblocks Sprout's broken Discover tab once Q1–Q3 answered.
10. **`regen-guide-counts`** — L data-shape bug; do the shape fix (A) before/without the optional Regenerate feature (B).
11. **`ia-reorg`** — last. XL, high risk, most decisions; ship as two slices only after the target IA is written down and the earlier dashboard/nav-touching items are stable.

## 7. Dependencies / cross-item notes

- **Two "Garden AI" items share one component** (`PlantDoctorChat.tsx`): `#4 ai-chat-history` (loadHistory read) and `#2 ai-voice-asterisks` (bubble render + TTS). Batch them to touch the file once. Both also flag doc drift in `05-tools/03-plant-doctor-chat.md` (the "Start Fresh" button is local-only, contrary to the doc).
- **Two Journal items share the Capture→Journal→Notes wiring:** `#7` adds the `?open=add-note` deep-link handler to `NotesPage.tsx`; `#9` builds the view/edit modals on the same hub. Sequence #7→#9. Both edit `11-global-journal.md` + `14-notes.md`.
- **Two Wear items are independent of edge functions** (`#1`, `#3`) but both benefit from being verified on-device in one pass. `#1`'s realtime gap is *not* Wear-specific — it also affects other household members and the `generate-tasks`/`analyse-weather` crons writing to `tasks`.
- **`#8 ailment-back-routing` and `#12 ia-reorg` both touch routing/history semantics** — land `#8` well before `#12` so its param contract is settled, or coordinate them.
- **`#11 regen-guide-counts` has a hidden functional dependency:** under-counted steps degrade `AutomationEngine`-generated treatment blueprints, so it is more than a cosmetic count.
- **`#6`, `#8`, `#9`, `#11` all carry app-reference doc drift** that must be corrected in-task per the CLAUDE.md doc mandate.

## 8. Decisions locked (owner, 2026-07-24)

| # | Decision |
|---|----------|
| #5 head-gardener-icon | **Compass** glyph (guidance / north-star). Swap `Leaf` → `Compass` in `App.tsx:1407` + `HeadGardenerCard.tsx` (3 spots); register `IconHeadGardener`. |
| #6 gardening-experience | **Rename + explainer.** Rename the persona control to **"Detail level — how much guidance do you want?"** and add a short "what this changes" note. Behaviour stays tonal/cosmetic (no new gating). Fix drifted `05-garden-quiz.md` + `10-garden-profile.md` docs. |
| #7 journal-note-button | **Chooser sub-sheet.** One Capture tile → in-sheet choice "New journal entry" (`/journal?open=add-entry`) vs "Add note" (`/journal?tab=notes&open=add-note`). Add a new `?open=add-note` mount-effect to `NotesPage.tsx`. |
| #11 regen-guide-counts | **Both.** (A) Fix the count/shape bug (text→steps splitter in `mapLibraryToWatchlistPayload` + `libraryRowToFavouriteInput` + render split steps in `AilmentDetailBody`) so aphids reads ~6, **and** (B) build the admin-only "Regenerate guide" control (plant + ailment). Shape fix is mandatory regardless — Regenerate alone reproduces the flat blob. |
| #10 verdantly-discover | **Library-first, AI optional.** `plant_library` becomes the primary/free Discover source for all tiers (unbreaks Sprout); keep AI (`generate-swipe-plants`) as an optional richer source for higher tiers. **Keep the exclusions** (owned/disliked/rotation-avoided) — port that filtering to the library query (needs a new authenticated RPC returning random full `plant_library` rows). **Verdantly behind the existing `enable_perenual` gate** (Sage+/Evergreen). |
| #12 ia-reorg | New top-level **"Calendar"** section at **`/calendar`** with tabs **Calendar · Weather · Routines**. Calendar + Weather move OFF the Dashboard (`?view=` pills + persistence deleted, ~14 deep-link callers codemodded). **Routines leaves Planner** for the Calendar section. Old **`/schedule` redirects** → `/calendar?tab=routines`. Planner + Shopping grouping **renamed "Plan"** (ToolsHub `/tools` stays as-is). New sections live in **More/Shelf** — mobile Deck stays Home/Plants/Capture/Tasks/More. Ship as two independent slices (Slice 1 = Calendar section + Dashboard declutter; Slice 2 = Plan rename). |

**Minor items — proceeding on the recommended default unless the owner objects:**
- **#4 ai-chat-history:** fetch **newest 50** (`ascending:false` + reverse); older stays in DB. (No "load earlier" affordance for now.)
- **#8 ailment-back-routing:** mirror the in-file `?detail=` pattern via a new **`?owned=<uuid>`** URL param so swipe-back just closes the modal; fix the owned-card modal + its search-takeover twin (don't generalise to all modals yet).
- **#9 journal-entry-modal:** **tap row → read-only View**, with an **Edit** button inside the detail modal; condense the list to title + key info; apply the same View-not-immediate-edit treatment to Notes.
