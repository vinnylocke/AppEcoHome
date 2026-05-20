# Rhozly — Claude Code Context

## Project Overview

**Rhozly** is a plant care and garden management Progressive Web App (PWA) with a native mobile wrapper via Capacitor. It helps users manage their plants, schedule care tasks, identify plant problems via AI, and get weather-aware gardening insights.

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS
- **Backend:** Supabase (Postgres, Auth, Storage, Edge Functions in Deno/TypeScript)
- **AI:** Gemini via Supabase Edge Functions (`_shared/gemini.ts`)
- **Mobile:** Capacitor (iOS/Android wrapper over the PWA)
- **Routing:** React Router v6 (`BrowserRouter` in `src/App.tsx`)

The app is called **Rhozly** — use this name in all user-facing text and commit messages.

---

## Key Documentation

| Document | Purpose |
|----------|---------|
| [TESTING.md](TESTING.md) | Complete guide to the three-tier testing framework (Vitest / Deno / Playwright) |
| [docs/e2e-test-plan.md](docs/e2e-test-plan.md) | Living E2E test plan — all routes, positive/negative cases, seed references, status tracking |
| [docs/ai-personal-assistant-plan.md](docs/ai-personal-assistant-plan.md) | Build plan for the AI assistant — event logging, pattern engine, notification surface |
| [docs/plant-visualiser-plan.md](docs/plant-visualiser-plan.md) | Build plan for the AR/2D plant visualiser feature |
| [docs/area-scan-plan.md](docs/area-scan-plan.md) | Build plan for the AI-powered area scan feature |
| [docs/routing-migration-plan.md](docs/routing-migration-plan.md) | Plan to migrate from state-based tabs to full React Router |
| [docs/deep-linking-plan.md](docs/deep-linking-plan.md) | Plan for native deep-link handling via Capacitor |
| [docs/shopping-list-plan.md](docs/shopping-list-plan.md) | Build plan for the Shopping List feature — multi-list CRUD, plant/product search, Plant Doctor integration |
| [docs/deployment.md](docs/deployment.md) | **Deployment process** — maintenance mode, Vercel pipeline, rollback procedure |
| [docs/app-reference/00-INDEX.md](docs/app-reference/00-INDEX.md) | **Master app reference** — dual-voice docs (senior dev + expert gardener) for every UI surface, modal, and cross-cutting concern. **Must be kept in sync with every code change.** |
| [docs/app-reference/_template.md](docs/app-reference/_template.md) | The canonical template for new app-reference files. Use it verbatim when adding a new surface. |

**Always read the relevant plan document at the start of a session** before making changes to a feature area.

**Always check [docs/app-reference/](docs/app-reference/) for the surfaces you're touching** — it's the canonical "what does this screen do + why" map. If the surface isn't documented there yet, your task includes creating its reference file (see the mandate below).

---

## Deploying to Production

**Always follow the process in [docs/deployment.md](docs/deployment.md) when asked to deploy.**

The short version — from the project root:

```bash
npm run deploy
```

This sets maintenance mode ON, pushes DB migrations, deploys to Vercel, then turns maintenance OFF automatically. Never deploy by pushing to GitHub alone — the migration + maintenance steps must run first.

If a deploy fails mid-way, run `npm run maintenance:off` to bring the app back online before investigating.

---

## Directory Structure

```
src/
  App.tsx                  # Root — auth guard, layout, nav, routing
  components/              # All UI components (one file per component)
  lib/                     # Pure utility functions (no React, no side effects)
  hooks/                   # React hooks
  services/                # Service objects (plantDoctorService, blueprintService, etc.)
  context/                 # React context providers
  types.ts                 # Shared TypeScript interfaces
  constants/               # Static lookup tables (task categories, etc.)
  events/                  # Event logging registry

supabase/
  functions/
    _shared/               # Shared Deno modules (weatherRules, patterns, gemini, etc.)
    <function-name>/       # Individual edge functions
  migrations/              # SQL migration files

tests/                     # Vitest unit tests + Playwright E2E tests
supabase/tests/            # Deno edge function tests

docs/                      # Feature build plans
```

---

## Critical Conventions

### Always plan before implementing

**Every task — no matter how small — requires a written plan before any code is written.** This includes bug fixes, UI tweaks, improvements, and new features.

**Workflow:**
1. When the user asks for a change, read any relevant existing files first.
2. Write a plan document to `docs/plans/<kebab-case-task-name>.md` covering:
   - What the problem or goal is
   - Which files will change and why
   - The exact approach (what changes, not just "update X")
   - Any risks, edge cases, or alternatives considered
3. Show the user a summary of the plan and tell them where the file was saved.
4. **Wait for explicit approval** ("yes", "go ahead", "looks good", etc.) before writing any application code.
5. After implementing, leave the plan file in place — it serves as a permanent record of decisions made.

Plans for small tasks can be brief (5–10 lines). Plans for large features should be thorough. The size of the plan should match the size of the task — but the step is never skipped.

Do not combine planning and implementation in the same response. Write the plan, stop, wait.

### Tests are mandatory for all code changes
Every new feature, bug fix, or amendment to existing code **must** include corresponding test coverage:

- **New `src/lib/` utility or hook** → add or update a Vitest unit test in `tests/unit/lib/`
- **New or changed `_shared/` weather rule or pattern detector** → add or update a Deno test in `supabase/tests/`
- **New page, route, or user-facing flow** → add or update a Playwright E2E spec in `tests/e2e/specs/`
- **Changed selectors, headings, or button labels** → update the affected Page Object in `tests/e2e/pages/`

When amending existing behaviour, update the relevant existing test rather than writing a new one unless the change warrants a new case. Never leave tests in a failing state — if a code change breaks a test, fix the test in the same task.

See [TESTING.md](TESTING.md) for the full framework guide, fixture patterns, and how to extend each tier.

### Test documentation is mandatory for all code changes
Every new feature or amendment **must** also update the test documentation:

- **Any feature or flow change** → update the relevant section of [docs/e2e-test-plan.md](docs/e2e-test-plan.md): add new test rows, update Status to ✅ Passing / ❌ Failing, and note any seed or mock dependencies
- **New spec file or Page Object** → add the file to [TESTING.md § Current Test Inventory](TESTING.md#12-current-test-inventory) and update the test counts
- **Changed route, heading, or button label** → update any affected test rows in [docs/e2e-test-plan.md](docs/e2e-test-plan.md)

### App-reference documentation is mandatory for all code changes

[docs/app-reference/](docs/app-reference/) is the master "what does this screen do + why" map. It has **130 files** covering every UI surface, modal, tab, and cross-cutting concern, all written in a **dual-voice format**: Role 1 = senior developer technical breakdown, Role 2 = expert gardener UX framing. Every code change that touches the user experience or the surrounding system **must keep these docs in sync** in the same task — no exceptions.

**When the change requires a doc update:**

- **Touching an existing UI surface** (component, modal, tab) → update its reference file in the relevant folder (`01-onboarding/` through `09-persistent-ui/`).
- **Touching a cross-cutting concern** (data model, edge function, cron, RLS, tier gating, weather rules, sun analysis, deployment) → update the file in `99-cross-cutting/`.
- **Adding a brand-new UI surface** → create a new reference file using [`_template.md`](docs/app-reference/_template.md) verbatim, and add a `- [ ]` row to [`00-INDEX.md`](docs/app-reference/00-INDEX.md) in the right folder section. Tick the `[x]` once the file lands.
- **Renaming a route, label, or button** → update both the affected reference file AND any reference files that cross-link to it.
- **Adding / removing an edge function, cron job, or storage bucket** → update [`10-edge-functions-catalogue.md`](docs/app-reference/99-cross-cutting/10-edge-functions-catalogue.md), [`11-cron-jobs.md`](docs/app-reference/99-cross-cutting/11-cron-jobs.md), and [`07-data-model-media.md`](docs/app-reference/99-cross-cutting/07-data-model-media.md) respectively.
- **Adding a new tier-gated, beta-gated, or permission-gated feature** → update the relevant gating reference (`17-tier-gating.md`, `18-beta-gating.md`, `19-rls-patterns.md`) AND the surface's own Role 1 "Tier gating" / "Beta gating" / "Permissions" section.
- **Deleting a surface or function** → remove its reference file (or mark archived in the index) AND scrub any cross-links that pointed at it.

**Format requirements — never deviate:**

- Every file must have BOTH roles. Skipping Role 2 (gardener) because "it's a small modal" is not acceptable — every surface has a user-facing purpose worth framing.
- Section headings inside each role match the template (`Component graph`, `Data flow — read paths`, `Edge functions invoked`, `Cron / scheduled jobs`, `Realtime channels`, `Tier gating`, `Beta gating`, `Permissions`, `Error states`, `Performance`, `Linked storage buckets` for Role 1; `Why open this`, `Every flow`, `Information on display — what every field means`, `Tier-by-tier experience`, `Common mistakes / pitfalls`, `Recommended workflows`, `What to do if something looks wrong` for Role 2).
- Code references (`src/components/Foo.tsx`, `supabase/functions/bar/index.ts`, etc.) live in the final `Code references for ongoing maintenance` section so future readers know where to look.
- Cross-links to related references go in the `Related reference files` section near the bottom — link liberally; the docs work as a graph.
- Tone: Role 1 is precise + factual; Role 2 is warm + opinionated. Never blur them.

**Plan-document discipline pairs with this:** if your `docs/plans/<task>.md` plan involves a UI / data model / cron / function change, the plan must list which `docs/app-reference/` files it will touch. Reviewing the plan before approval is the moment to catch missing doc updates.

**When the reference drifts from the code**, the reference is wrong, not the code. Update the doc immediately in a follow-up commit; flag it in the index by changing `[x]` back to `[~]` (in progress) if the drift is significant enough that the file needs a rewrite rather than a touch-up.

### Add data-testid attributes to interactive elements
Every new interactive or key DOM element must have a `data-testid` attribute so Playwright tests can target it without coupling to CSS classes or brittle text selectors.

Apply `data-testid` to: buttons (especially actions like save, delete, confirm, cancel), form inputs, modals and dialogs, tabs, and any element that a test needs to find by role + identity.

```tsx
// Good
<button data-testid="archive-plant-confirm">Confirm Archive</button>
<input data-testid="plant-name-input" ... />
<div data-testid="plant-card-tomato" ...>...</div>

// Avoid
<button className="bg-red-500">Confirm Archive</button>  // no testid
```

Existing elements do not need to be retroactively updated unless they are being actively changed in the current task.

### Never modify application code for tests
Tests wrap the app — they never change `src/` or `supabase/functions/` to make themselves easier to write.

### Supabase migrations
**Always apply locally first** before pushing to remote:
```bash
supabase migration up          # apply locally
# verify it works, then:
supabase db push               # push to remote — only on explicit user confirmation
```
Never run `supabase db push` without the user's explicit go-ahead.

### No speculative changes
Only add what the task requires. No extra error handling for impossible cases, no helper abstractions for one-off uses, no backwards-compatibility shims for removed code.

### Ghost tasks
`task_blueprints` are recurring task templates. "Ghost tasks" are virtual task instances generated at runtime by `TaskEngine.fetchTasksWithGhosts()` — they are **not persisted** until the user acts on them. Ghost task IDs follow the format `ghost-{blueprint_id}-{YYYY-MM-DD}`.

### Weather rules & pattern detectors
- Weather rules live in `supabase/functions/_shared/weatherRules/` — each exports a pure `evaluate(ctx: WeatherContext): WeatherRuleResult`
- Pattern detectors live in `supabase/functions/_shared/patterns/` — each exports an async `detect(userId, homeId, db): Promise<PatternHit[]>`
- Always import weather rules via the `WEATHER_RULES` barrel (`_shared/weatherRules/index.ts`), never import individual rule files directly (causes circular import TDZ error)

### Hemisphere-aware logic
All seasonal date calculations in `src/lib/seasonal.ts` must respect `hemisphere: "northern" | "southern"`. Summer for northern = June–August; southern = December–February.

### E2E test seed data (`supabase/seeds/`)

E2E tests run with up to 4 parallel workers, each backed by its own isolated Supabase account (`test1@rhozly.com` – `test4@rhozly.com`, password `TestPassword123!`). The account email is derived automatically from `PLAYWRIGHT_WORKER_INDEX` inside `tests/e2e/fixtures/auth.ts` — no manual env var needed. Each account uses a distinct UUID prefix (`0000000N-0000-0000-`). Seeds are **idempotent** — safe to re-run at any time without errors, even if data already exists.

**Seed files (run in order):**

| File | Contents |
|------|----------|
| `00_bootstrap.sql` | Test auth user, profile, home, home_members |
| `01_locations_areas.sql` | 2 locations, 5 garden areas |
| `02_plants_shed.sql` | 6 plants + 6 inventory items (all statuses) |
| `03_tasks_blueprints.sql` | 8 blueprints + 12 standalone tasks (all types & statuses) |
| `04_weather.sql` | 7-day forecast snapshot + 4 weather alerts |
| `05_planner.sql` | 3 plans (In Progress, Completed, Archived) |
| `06_ailments_watchlist.sql` | 4 ailments (pest, disease, invasive; 1 archived) |
| `07_guides.sql` | 3 guides (Beginner, Intermediate) |
| `08_profile_preferences.sql` | Quiz completion + 5 planner preferences |
| `12_shopping_lists.sql` | 2 shopping lists (1 active, 1 completed) with 6 items; pre-completes Summer Veg Plan Phase 1 |

**Fixed UUID convention** — all seed entities use the same prefixes across files:

| Entity | UUID |
|--------|------|
| Test user | `00000000-0000-0000-0000-000000000001` |
| Test home | `00000000-0000-0000-0000-000000000002` |
| Locations | `00000000-0000-0000-0001-00000000000{n}` |
| Areas | `00000000-0000-0000-0002-00000000000{n}` |
| Plants (integer PK) | `100000{n}` |
| Inventory items | `00000000-0000-0000-0003-00000000000{n}` |
| Blueprints | `00000000-0000-0000-0004-00000000000{n}` |
| Tasks | `00000000-0000-0000-0005-00000000000{n}` |
| Plans | `00000000-0000-0000-0008-00000000000{n}` |
| Ailments | `00000000-0000-0000-0007-00000000000{n}` |
| Guides | `00000000-0000-0000-0009-00000000000{n}` |
| Weather snapshot | `00000000-0000-0000-000a-000000000001` |
| Weather alerts | `00000000-0000-0000-000b-00000000000{n}` |
| Preferences | `00000000-0000-0000-000c-00000000000{n}` |
| Shopping lists | `00000000-0000-0000-0011-00000000000{n}` |
| Shopping list items | `00000000-0000-0000-0012-00000000000{n}` |

**Workflow:**
```bash
# Full reset + seed (wipes DB, re-applies migrations, then seeds all 4 worker accounts)
supabase db reset --local && npm run test:seed

# Seed only (safe to re-run without resetting — all seeds are idempotent)
npm run test:seed           # seeds test1–test4@rhozly.com with --workers 4

# Run E2E tests against seeded local DB
npm run test:e2e
```

**Maintenance rules:**
- When a new feature adds a table or column that E2E tests depend on, update the relevant seed file.
- When a new route or page is added, add test cases to `docs/e2e-test-plan.md` AND seed any required data.
- Task due dates in seeds use `CURRENT_DATE`-relative expressions so they stay valid on any run date.
- Physical tasks in seeds always have `blueprint_id = NULL` to avoid the `unique_blueprint_date` constraint on re-run.
- Seeds are the canonical source of E2E test state — never rely on data created by a previous test run.

---

## Routes

| Path | Component |
|------|-----------|
| `/dashboard` | Dashboard (weather, locations, daily tasks) |
| `/shed` | TheShed (plant inventory) |
| `/schedule` | BlueprintManager (recurring task management) |
| `/planner` | PlannerDashboard |
| `/doctor` | PlantDoctor (AI vision identification/diagnosis) |
| `/profile` | GardenProfile + HabitQuiz |
| `/management` | LocationManager |
| `/watchlist` | AilmentWatchlist |
| `/visualiser` | PlantVisualiser |
| `/lightsensor` | LightSensor |
| `/guides` | GuideList |
| `/shopping` | ShoppingLists |

---

## Testing Quick Reference

```bash
npm run test:unit            # Vitest — src/lib/ pure functions (95 tests)
npm run test:unit:watch      # Vitest watch mode for development
npm run test:unit:coverage   # Vitest + HTML coverage report
npm run test:functions       # Deno — Edge Function shared logic (51 tests)
npm run test:e2e             # Playwright — browser E2E (~306 tests)
npm run test:e2e:fresh       # Seed all 4 workers, then run all E2E tests
npm run test:e2e:ui          # Playwright interactive UI (best for debugging)
npm run test:all             # All three tiers sequentially
```

E2E tests require env vars — see [TESTING.md § Environment Setup](TESTING.md#11-environment-setup).

---

## AI & External APIs

| Service | Used for | Called from |
|---------|----------|-------------|
| Gemini | Plant identification, diagnosis, care guides, planner AI | Supabase Edge Functions only (never from browser) |
| Open-Meteo | Weather data | Supabase Edge Function (`fetch-weather`) |
| Perenual | Plant species database (primary provider); also handles pest/disease search | Edge Function + browser (`perenualService.ts`) |
| Verdantly | Plant species database (second provider) | Supabase Edge Function (`verdantly-search`) |
| Unsplash | Plant images | Browser (`SmartImage.tsx`) |
| Firebase | Push notifications | Browser (`usePushNotifications.ts`) |

**Never call Gemini or Open-Meteo directly from the browser.** All AI calls go through Supabase Edge Functions.

**`plants.source` values:** `'manual' | 'api' | 'ai' | 'verdantly'` — the `plants_source_check` constraint allows all four.
