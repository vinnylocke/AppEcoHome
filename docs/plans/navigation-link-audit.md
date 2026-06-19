# Navigation / link audit — every link lands in the right place

## Goal

Verify that every in-app navigation (links, buttons, cards, tabs, deep links) takes the user to the
**correct destination** — right route, right sub-tab/param, right context — and fix the ones that don't.

## Why it's needed (early signals)

- The routing reference `99-cross-cutting/21-routing.md` is **drifted** from `App.tsx`: `/watchlist`
  is now a redirect to `/shed?tab=watchlist` (doc says it renders AilmentWatchlist); `/planner` is
  `PlannerHub`; live routes `/journal`, `/weekly`, `/notes`, `/ailment-library`, `/credits`,
  `/share/garden-layout/:token` are missing. Where the doc drifted, links may have too.
- ~150 navigation call sites across ~60 `src/` files — easy for a few to point at a renamed/removed
  route or the wrong `?tab=` / `?view=` / `?open=`.

## App-reference consulted

- `99-cross-cutting/21-routing.md` (routing model + URL-state patterns), `23-capacitor.md` (deep
  links), `09-persistent-ui/*` (header/sidebar/nav), `08-modals-and-overlays/23-global-quick-add.md`
  (quick-add deep links), and each surface's own reference for what each link/card *should* do.

## Method

1. **Authoritative route map** — extract from `App.tsx`: every `<Route path>`, every `<Navigate>`
   redirect, and which URL params each destination actually consumes (`?tab` / `?view` / `?open` /
   `?locationId` / `?q`) via its `useSearchParams` reads. This is the source of truth for "valid".
2. **Enumerate every navigation** — `useNavigate()/navigate(...)`, `<Link to>` / `href="/..."`,
   `setSearchParams(...)`, the Capacitor deep-link handler (`appUrlOpen` in `main.tsx`), and
   **notification `data.route`** fields (push/in-app notifications navigate via these).
3. **Cross-check each** for three failure modes:
   - **Dead/typo route** — target path isn't a real route (404 / falls through to `/dashboard`).
   - **Param ignored** — target route doesn't consume the `?tab`/`?view`/`?open` passed (lands on
     the default view, not the intended one).
   - **Wrong target vs intent** — the label/context says one thing, the nav goes elsewhere
     (cross-checked against the surface's app-reference). This is the "pending tasks → wrong place"
     class.
4. **Findings report** — a table in this doc: `file:line · trigger (what the user clicks) · current
   target · issue · expected target`, grouped by surface, severity-tagged.
5. **Fix** the confirmed issues (each is a localised nav-string/param change). Re-verify: `npm run
   build` + targeted Playwright nav specs for the high-traffic flows (dashboard pending-tasks, guide
   links, quick-add deep links, sidebar, notifications).
6. **Sync the docs** — bring `21-routing.md` back in line with the real route table (the drift above).

## Scope

- **In:** in-app router navigation, tab/param navigation, Capacitor deep links, notification route
  targets.
- **Out (unless you want them):** external links (`mailto:`, provider/support/Vercel URLs) — these
  are "does the URL still work", a different check.

## Deliverable shape — your call (see questions)

Two ways to run it:
- **A) Report-then-fix** — I produce the full findings table first, you skim it, then I fix. Safer
  for a big sweep; you see everything before changes land.
- **B) Fix-as-I-go** — I fix the unambiguous ones immediately (dead routes, ignored params, clear
  wrong-targets) and only surface the judgment calls. Faster; you review via the diff + summary.

## Risks / notes

- **Judgment calls:** "right place" is sometimes subjective (which tab should X land on?). Those go
  to you rather than me guessing.
- **Tests are mandatory per change** — I'll add/extend Playwright nav specs for the flows I touch and
  update the e2e-test-plan rows.
- **Size:** this is large; I'll work surface-by-surface (dashboard → shed → planner → guides →
  watchlist → management → account → integrations → quick/mobile → deep links/notifications) so it's
  reviewable in chunks and each chunk stays build-green.

## FINDINGS (audit complete — read-only)

**Decisions applied:** in-app **+** external; report-first; one deploy at the end.

**Headline:** No dead/typo routes — every `navigate()`/`<Link>`/`href`/notification target resolves to
a real route. The real problem is **params that no destination consumes** (so the link lands on the
default view, not the intended one) plus a few **wrong-target** links. External links all check out.

### High — params ignored / wrong surface (Dashboard task tiles + chips)
`/schedule` renders **BlueprintManager**, whose filters are internal `useState("all")` — it reads
**nothing** from the URL. So:

| # | Trigger (file:line) | Current target | Problem | Suggested fix |
|---|---------------------|----------------|---------|---------------|
| 1 | Dashboard "Completed" tile — `HomeDashboard.tsx:133` | `/schedule?filter=completed` | `?filter` ignored; BlueprintManager (routines) has no "completed" concept → lands on unfiltered routines | Point to a completed-tasks view (calendar agenda), or drop the link |
| 2 | Dashboard "Done automatically" tile — `HomeDashboard.tsx:155` | `/schedule?filter=automated` | `?filter` ignored | Either make BlueprintManager read `?filter=automated` (it has the data) or retarget |
| 3 | Dashboard category chips — `HomeDashboard.tsx:171` | `/schedule?category=Pruning` etc. | `?category` ignored → chips don't filter | **Make BlueprintManager read `?category` → set `filterType`** (data already there) — clean fix |
| 4 | Calendar-day deep links — `HomeDashboard.tsx:143,149,224`, `TaskList.tsx:1327`, `WeeklyOverviewPage.tsx:336`, `DailyBriefCard.tsx:139,290` | `/dashboard?view=calendar&date=YYYY-MM-DD` | **TaskCalendar ignores `?date`** (reads only `?open`) → lands on default (today), not the chosen day | **Make TaskCalendar read `?date` and select that day** — unblocks all these |

(Note: the devs already hit this class — `HomeDashboard:139-143` comment shows "Overdue" was moved off
`/schedule?filter=overdue` to the calendar — but `?date` itself still isn't consumed.)

### Medium
| # | Trigger | Current target | Problem | Suggested fix |
|---|---------|----------------|---------|---------------|
| 5 | Optimise-digest notification — `weekly-optimise-digest/index.ts:155` | `/schedule?tab=optimise` | BlueprintManager ignores `?tab` → lands on unfiltered routines, not the Optimise view | Make BlueprintManager honour `?tab=optimise` (if that view exists) or retarget the notification |
| 6 | "Customise quick launcher" — `QuickAccessHome.tsx:242` | `/gardener?section=quick-launcher` | GardenerProfile reads `?tab`, not `?section` → lands on Account default | Have GardenerProfile read `?section` (scroll/open it) or use the existing `?tab` |
| 7 | App Help "Account" topics — `appHelp.ts:320,326,332` (`account-name`, `account-plan`, `account-ai-usage`) | `/profile` | These are about the **Gardener Profile (Account)** (the summaries say so) but `/profile` is the **Garden Quiz** | Change route to `/gardener?tab=account` |

### Low / informational
| # | Trigger | Note |
|---|---------|------|
| 8 | `DiagnosisImageGallery.tsx:142`, `CreditPopover.tsx:131` | `href="/credits"` does a **full page reload** — should be `<Link to="/credits">` for client-side nav |
| 9 | `GardenShapeProperties.tsx:548` (`/watchlist`), App-Help `/watchlist`+`/shopping` topics, `ShoppingLists.tsx:265` | Rely on redirect routes — functional but inconsistent; could target `/shed?tab=watchlist` / `/planner?tab=shopping` directly |

### Verified OK
- All `navigate()` targets resolve to real routes (no dead/typo routes).
- `/shed?tab=watchlist|senescence` + `?plant` (GardenHub reads `?tab`, SenescenceTab reads `?plant`); `/shed?open=add-plant&query=` (TheShed); `/dashboard?view=…&locationId=&areaId=&instanceId=`; `/planner?tab=&open=new-plan`; `/guides?tab=&open=new-guide&q=`; `/sun-trajectory?mode=`; `/ailment-library?ailment=` — **all consumed correctly**.
- Redirects `/watchlist`, `/shopping`, `/help`, `*`→`/dashboard` — correct.
- External links — Unsplash/Pixabay attribution, `mailto:privacy@rhozly.com`, `ai.google.dev` pricing, eWeLink OAuth `window.open` — all correct/live.
- Notification routes `/schedule`, `/dashboard`, `/weekly`, `/integrations` — valid (only `/schedule?tab=optimise` is finding #5).

### Coverage / caveats
- Method: cross-checked every nav target string against the route map + read each destination's
  `searchParams.get(...)` to confirm param consumption. High confidence on findings 1–9.
- Not exhaustively click-tested on-device; a handful of deeply-nested modal links would benefit from a
  Playwright pass, which I'll add alongside the fixes.
- The routing doc `21-routing.md` is itself stale (separate doc-sync task, included in the fix phase).

## RESOLUTION (shipped)

| # | Fix | Where |
|---|-----|-------|
| 1,2 | "Completed" / "Done automatically" tiles → calendar agenda (`?date=today`) | `HomeDashboard.tsx` |
| 3 | BlueprintManager now reads `?category` → sets the task-type filter (chips work) | `BlueprintManager.tsx` |
| 4 | TaskCalendar now reads `?date` → selects that day (all calendar-day links land right) | `TaskCalendar.tsx` |
| 5 | BlueprintManager now reads `?tab=optimise` → opens the Optimise tab (digest notification) | `BlueprintManager.tsx` |
| 6 | GardenerProfile reads `?section=quick-launcher` → Account tab + scrolls to the picker | `GardenerProfile.tsx` |
| 7 | App-Help Account topics → `/gardener?tab=account` (were `/profile`, the quiz) | `appHelp.ts` |
| — | Routing reference re-synced to the real route table | `21-routing.md` |

**#8 + #9 — also done (follow-up):**
- **#8** `/credits` links now use `<Link>` (client-side nav, no full reload) in `CreditPopover` +
  `DiagnosisImageGallery`. The `ImageCredit` unit test now renders under a `MemoryRouter` (the
  component legitimately needs a Router ancestor).
- **#9** redirect-reliant links now target directly: `GardenShapeProperties` "Open Watchlist" →
  `/shed?tab=watchlist`; App-Help `/watchlist`→`/shed?tab=watchlist` and `/shopping`→`/planner?tab=shopping`.

**Tests added:** `tests/unit/data/appHelp.test.ts` (runnable — guards **every** help deep-link
resolves to a real route + #7); `tests/e2e/specs/navigation-deeplinks.spec.ts` (NAV-001..004 — tile
retarget + param consumption; run pending local stack). Build ✅, unit ✅ 1016/1016.

## Open questions

1. **External links in scope**, or in-app navigation only? (Recommend in-app only first.)
2. **Report-then-fix (A) or fix-as-I-go (B)?** (Recommend A for a sweep this size — you see the full
   picture before fixes.)
3. **One big deploy at the end, or per-chunk?** (Recommend one deploy once the whole sweep + tests
   are green.)
