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

**Always read the relevant plan document at the start of a session** before making changes to a feature area.

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
| Perenual | Plant species database | Edge Function + browser (`perenualService.ts`) |
| Unsplash | Plant images | Browser (`SmartImage.tsx`) |
| Firebase | Push notifications | Browser (`usePushNotifications.ts`) |

**Never call Gemini or Open-Meteo directly from the browser.** All AI calls go through Supabase Edge Functions.
