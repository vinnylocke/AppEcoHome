# Rhozly Testing Framework

A three-tier automated testing framework for the Rhozly app (React 19 + Supabase). Each tier targets a different layer of the stack with the most appropriate tooling. No application source code was modified to add this infrastructure.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Directory Structure](#2-directory-structure)
3. [Running the Tests](#3-running-the-tests)
4. [Viewing Results](#4-viewing-results)
5. [Tier 1 — Unit Tests (Vitest)](#5-tier-1--unit-tests-vitest)
6. [Tier 2 — Edge Function Tests (Deno)](#6-tier-2--edge-function-tests-deno)
7. [Tier 3 — E2E Tests (Playwright)](#7-tier-3--e2e-tests-playwright)
8. [Fixture & Factory System](#8-fixture--factory-system)
9. [Mocking Strategies](#9-mocking-strategies)
10. [Extending the Framework](#10-extending-the-framework)
11. [Environment Setup](#11-environment-setup)
12. [Current Test Inventory](#12-current-test-inventory)
13. [Test Reporting — JUnit, Allure & Jira](#13-test-reporting--junit-allure--jira)

---

## 1. Architecture Overview

| Tier | Tool | What it tests | Location |
|------|------|---------------|----------|
| Unit | **Vitest** | Pure TypeScript utilities in `src/lib/` and `src/hooks/` | `tests/unit/` |
| Functions | **Deno built-in runner** | Supabase Edge Function shared logic in `_shared/` | `supabase/tests/` |
| E2E | **Playwright** | Full user journeys in a real browser against the running app | `tests/e2e/` |

**Key principles:**
- Application source files are never modified for testing purposes.
- All paid/external APIs (Gemini, Open-Meteo, Unsplash) are mocked — they are never called during tests.
- Fixtures use factory functions, not static JSON. Every factory accepts a `Partial<T>` override so tests only specify what matters.
- Each tier is independently runnable and independently reportable.

---

## 2. Directory Structure

```
/
├── vitest.config.ts              # Unit test runner config
├── playwright.config.ts          # E2E runner config
├── TESTING.md                    # This document
│
├── tests/
│   ├── unit/
│   │   ├── lib/                  # One test file per source module
│   │   │   ├── seasonal.test.ts
│   │   │   ├── dateUtils.test.ts
│   │   │   ├── plantScheduleFactory.test.ts
│   │   │   ├── automationEngine.test.ts
│   │   │   └── taskEngine.test.ts
│   │   └── fixtures/             # Typed factory functions for unit tests
│   │       ├── users.ts          # makeHome(), makeUserProfile(), makeLocation(), makeArea()
│   │       ├── plants.ts         # makePlantSpecies(), makeInventoryItem()
│   │       ├── tasks.ts          # makeTask(), makeTaskBlueprint()
│   │       └── weather.ts        # makeDailySummary(), hotDay(), rainyDay(), etc.
│   │
│   └── e2e/
│       ├── specs/                # Test files — one per feature area
│       │   ├── auth.spec.ts
│       │   ├── home-setup-create.spec.ts
│       │   ├── home-setup-join.spec.ts
│       │   ├── welcome-modal.spec.ts
│       │   ├── shed-discovery.spec.ts
│       │   ├── plant-edit-assignment.spec.ts
│       │   ├── instance-edit-tabs.spec.ts
│       │   ├── harvest-window.spec.ts
│       │   ├── calendar-window.spec.ts
│       │   ├── plant-doctor-chat.spec.ts
│       │   ├── members-permissions.spec.ts
│       │   ├── rls-isolation-db.spec.ts
│       │   ├── schedule-validation.spec.ts
│       │   ├── shopping-edge-cases.spec.ts
│       │   ├── planner-restore.spec.ts
│       │   ├── dashboard.spec.ts
│       │   ├── plants.spec.ts
│       │   ├── shed-crud.spec.ts
│       │   ├── tasks.spec.ts
│       │   ├── schedule.spec.ts
│       │   ├── weather.spec.ts
│       │   ├── plant-doctor.spec.ts
│       │   ├── planner.spec.ts
│       │   ├── area-setup.spec.ts
│       │   ├── garden-profile.spec.ts
│       │   ├── guides.spec.ts
│       │   ├── community-guides.spec.ts
│       │   ├── help-center-docs.spec.ts
│       │   ├── watchlist.spec.ts
│       │   ├── layout.spec.ts
│       │   ├── lightsensor.spec.ts
│       │   ├── visualiser.spec.ts
│       │   ├── yield.spec.ts
│       │   ├── lighttab.spec.ts
│       │   ├── statstab.spec.ts
│       │   ├── security-auth.spec.ts
│       │   ├── security-xss.spec.ts
│       │   ├── security-storage.spec.ts
│       │   └── shopping.spec.ts
│       ├── pages/                # Page Object Models
│       │   ├── AuthPage.ts
│       │   ├── DashboardPage.ts
│       │   ├── ShedPage.ts
│       │   ├── TaskListPage.ts
│       │   ├── PlantDoctorPage.ts
│       │   ├── PlannerPage.ts
│       │   ├── LocationManagementPage.ts
│       │   ├── GardenProfilePage.ts
│       │   ├── GuidesPage.ts
│       │   ├── WatchlistPage.ts
│       │   ├── SchedulePage.ts
│       │   ├── LightSensorPage.ts
│       │   ├── VisualiserPage.ts
│       │   ├── YieldPage.ts
│       │   ├── LightTabPage.ts
│       │   ├── InstanceStatsTabPage.ts
│       │   └── ShoppingPage.ts
│       └── fixtures/
│           ├── auth.ts           # authenticatedPage Playwright fixture
│           └── api-mocks.ts      # mockEdgeFunction() + canned AI responses
│
└── supabase/
    └── tests/
        ├── deno.json             # Deno import map (@std/assert, @shared/ alias)
        ├── setup_test.ts         # Placeholder — keeps "no tests found" error away
        ├── rls_isolation.test.ts # Tier A — 16 cross-tenant RLS isolation tests
        ├── edge_function_auth.test.ts # Tier B — 7 edge function auth/rate-limit tests
        ├── fixtures/
        │   ├── weatherContext.ts # makeWeatherContext() + mutators
        │   ├── patternData.ts    # makeUserEvent(), makePatternHit(), sequence builders
        │   └── mockDb.ts         # makeMockDb() — chainable Supabase query mock
        ├── weather-rules/
        │   ├── heatwave.test.ts
        │   ├── frostRisk.test.ts
        │   ├── highWind.test.ts
        │   ├── rainAutoComplete.test.ts
        │   └── waterlogging.test.ts
        └── patterns/
            ├── consecutivePostponements.test.ts
            ├── neglectedPlant.test.ts
            ├── highPostponeRate.test.ts
            └── blueprintPostponeRate.test.ts
```

---

## 3. Running the Tests

### Prerequisites

- **Node.js** — install dependencies with `npm install`
- **Deno** — required for the functions tier only. Install via PowerShell:
  ```powershell
  irm https://deno.land/install.ps1 | iex
  ```
  Binary lands at `%USERPROFILE%\.deno\bin\deno.exe`.
- **Playwright browsers** — first-time setup only:
  ```bash
  npx playwright install chromium
  ```
- **E2E environment variables** — required for authenticated E2E tests (see [Environment Setup](#11-environment-setup)).

### npm Scripts

| Command | What it does |
|---------|-------------|
| `npm run test:unit` | Run all Vitest unit tests once (CI mode) |
| `npm run test:unit:watch` | Run Vitest in watch mode (development) |
| `npm run test:unit:coverage` | Run unit tests and generate a coverage report |
| `npm run test:functions` | Run all Deno edge function tests |
| `npm run test:e2e` | Run all Playwright E2E tests (headless) |
| `npm run test:e2e:fresh` | Seed all 4 workers, then run all Playwright E2E tests — use at the start of every test cycle |
| `npm run test:e2e:ui` | Open the Playwright interactive UI |
| `npm run test:all` | Run all three tiers sequentially |
| `npm run test:seed` | (Re-)apply all numbered test seeds to local Supabase — idempotent, safe to run any time |

### Running a single file or test

```bash
# Unit — run one file
npx vitest run tests/unit/lib/seasonal.test.ts

# Unit — run tests matching a name pattern
npx vitest run --reporter=verbose -t "getFrequencyDays"

# Functions — run one directory
%USERPROFILE%\.deno\bin\deno.exe test --allow-env --allow-net --config supabase/tests/deno.json supabase/tests/weather-rules/

# E2E — run one spec file
npx playwright test tests/e2e/specs/auth.spec.ts

# E2E — run tests matching a name pattern
npx playwright test --grep "sign-in form"

# E2E — run in headed mode (see the browser)
npx playwright test --headed
```

---

## 4. Viewing Results

### Unit tests (Vitest)

Results are printed to the terminal. For a detailed per-test breakdown add `--reporter=verbose`:

```bash
npx vitest run --reporter=verbose
```

For an HTML coverage report:

```bash
npm run test:unit:coverage
# Report written to: coverage/index.html
```

Open `coverage/index.html` in a browser to see line-by-line coverage for every file in `src/lib/` and `src/hooks/`.

### Edge function tests (Deno)

Results are printed directly to the terminal. Deno's built-in reporter shows pass/fail with timing for each `Deno.test()` call.

### E2E tests (Playwright)

**Terminal output** — pass/fail summary with timings after each run.

**HTML report** — automatically generated after every run:

```bash
# After any test:e2e run, open the report:
npx playwright show-report
```

The HTML report shows:
- Per-test pass/fail status with screenshots on failure
- Full trace files (step-by-step browser actions) when a test retries
- Network activity log

**Interactive UI mode** — the best tool for writing and debugging tests:

```bash
npm run test:e2e:ui
```

This opens a browser-based GUI where you can:
- Run individual tests with a click
- See a live preview of each step
- Inspect DOM elements and use the locator picker to find selectors
- Time-travel through test steps with the trace viewer

---

## 5. Tier 1 — Unit Tests (Vitest)

### What is tested here

Pure TypeScript functions in `src/lib/` that have no side effects, no DOM access, and no network calls. If a function uses the Supabase client, it is mocked (see [Mocking Strategies](#9-mocking-strategies)).

### Test file conventions

- One test file per source module, mirroring the `src/lib/` layout.
- File name: `<moduleName>.test.ts`
- Use `describe` blocks to group related scenarios; `test` for individual assertions.
- Each test is self-contained — no shared state between tests.

### Example — adding a test for a new pure function

Say you add `src/lib/myUtil.ts` with a function `formatLabel(input: string): string`.

1. Create `tests/unit/lib/myUtil.test.ts`:

```typescript
import { describe, test, expect } from "vitest";
import { formatLabel } from "../../../src/lib/myUtil";

describe("formatLabel", () => {
  test("capitalises first letter", () => {
    expect(formatLabel("hello")).toBe("Hello");
  });

  test("returns empty string for empty input", () => {
    expect(formatLabel("")).toBe("");
  });
});
```

2. Run `npm run test:unit` — it is picked up automatically.

### Example — testing a function that uses the Supabase client

```typescript
import { describe, test, expect, vi } from "vitest";

// Mock the module before importing anything that uses it
vi.mock("../../../src/lib/supabase", () => ({
  supabase: { from: vi.fn() },
}));

import { myFunctionThatQueriesDb } from "../../../src/lib/myModule";
import { supabase } from "../../../src/lib/supabase";

test("returns data from the database", async () => {
  vi.mocked(supabase.from).mockReturnValue({
    select: () => ({ eq: () => Promise.resolve({ data: [{ id: "1" }], error: null }) }),
  } as any);

  const result = await myFunctionThatQueriesDb("home-1");
  expect(result).toHaveLength(1);
});
```

For a more complete chainable mock pattern, see the `makeChain()` helper in `tests/unit/lib/taskEngine.test.ts`.

---

## 6. Tier 2 — Edge Function Tests (Deno)

### What is tested here

Shared TypeScript modules in `supabase/functions/_shared/` — specifically weather rules and pattern detectors. These modules are imported directly by Deno; no Supabase connection or network call is needed.

### The `@shared/` import alias

The `deno.json` import map resolves `@shared/` to `../functions/_shared/`, so tests use:

```typescript
import { WEATHER_RULES } from "@shared/weatherRules/index.ts";
import blueprintPostponeRate from "@shared/patterns/blueprintPostponeRate.ts";
```

**Important:** Always import weather rules via the `WEATHER_RULES` barrel array, not by importing individual rule files directly. Direct imports create a circular dependency that triggers a Temporal Dead Zone error at runtime:

```typescript
// CORRECT
import { WEATHER_RULES } from "@shared/weatherRules/index.ts";
const heatwave = WEATHER_RULES.find((r) => r.id === "heatwave")!;

// WRONG — causes TDZ error
import heatwave from "@shared/weatherRules/heatwave.ts";
```

### Adding a weather rule test

1. Create `supabase/tests/weather-rules/myRule.test.ts`:

```typescript
import { assertEquals } from "@std/assert";
import { WEATHER_RULES } from "@shared/weatherRules/index.ts";
import { makeWeatherContext, makeDailySummary } from "../fixtures/weatherContext.ts";

const myRule = WEATHER_RULES.find((r) => r.id === "my-rule")!;

Deno.test("my-rule — triggers when threshold is exceeded", () => {
  const ctx = makeWeatherContext({
    daily: [
      makeDailySummary({ date: "2026-05-01", maxTempC: 99 }),
    ],
  });
  const result = myRule.evaluate(ctx);
  assertEquals(result.notifications.length, 1);
});
```

2. Run `npm run test:functions` — picked up automatically.

### Adding a pattern detector test

Pattern detectors are async and query Supabase, so they need the mock database:

```typescript
import { assertEquals } from "@std/assert";
import myPattern from "@shared/patterns/myPattern.ts";
import { makeMockDb } from "../fixtures/mockDb.ts";
import { makeUserEvent } from "../fixtures/patternData.ts";

Deno.test("myPattern — triggers when condition is met", async () => {
  const db = makeMockDb({
    user_events: [
      makeUserEvent({ user_id: "user-1", event_type: "my_event" }),
    ],
  });
  const hits = await myPattern.detect("user-1", "home-1", db as any);
  assertEquals(hits.length, 1);
});
```

### `makeWeatherContext()` default values

The context factory sets `today = "2026-05-01"`. The `daily` array in the default context has:
- `daily[0]` = yesterday (`2026-04-30`) — used for yesterday-based rules like `rainAutoComplete`
- `daily[1]` = today (`2026-05-01`) — used as the trigger day for most rules

Use the convenience mutators to build common scenarios without specifying every field:

```typescript
const ctx = makeWeatherContext()
  .withHotDay()      // sets today to 35°C
  .withFrostNight()  // sets tonight low to -2°C
  .withHeavyRain()   // sets today precipMm=10
  .withHighWind();   // sets today maxWindKph=50
```

### `makeMockDb()` behaviour

The mock database is a chainable PromiseLike builder. Every filter method (`select`, `eq`, `in`, `gte`, etc.) returns `this`, so any chain resolves to `{ data: tableRows, error: null }`.

```typescript
const db = makeMockDb({
  user_events: [/* rows */],
  tasks: [/* rows */],
  task_blueprints: [/* rows */],
});
// db.from("user_events").select("*").eq("user_id", x).gte("created_at", y)
// → { data: [/* all rows you passed */], error: null }
```

Note: the mock does **not** filter rows by the chained `.eq()` / `.gte()` calls — it always returns all rows for that table. Pattern detectors are designed to do their own filtering in JS after the query, so this works correctly in practice.

---

## 7. Tier 3 — E2E Tests (Playwright)

### What is tested here

Full user journeys through the browser against the running dev server and a real (local) Supabase instance. Tests cover navigation, rendering, form interactions, and API-driven flows.

### Two kinds of tests

**Unauthenticated tests** — use the base `test` from `@playwright/test`. These test the auth page itself and any route that doesn't require a session.

**Authenticated tests** — use the extended `test` from `tests/e2e/fixtures/auth.ts`. The `authenticatedPage` fixture signs in via the Supabase API (no UI interaction), injects the session into the browser's localStorage, and reloads the page — so tests start already logged in.

```typescript
// Unauthenticated
import { test, expect } from "@playwright/test";

// Authenticated — import from the auth fixture
import { test, expect } from "../fixtures/auth";

test("some feature", async ({ authenticatedPage }) => {
  await authenticatedPage.goto("/shed");
  // ...
});
```

### Page Object Model pattern

Every page or major component has a Page Object Model in `tests/e2e/pages/`. A POM centralises locators so they only need to change in one place when the UI changes.

**Structure of a POM:**

```typescript
import type { Page, Locator } from "@playwright/test";

export class MyPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly submitButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: "My Page" });
    this.submitButton = page.getByRole("button", { name: "Submit" });
  }

  async goto() {
    await this.page.goto("/my-page");
  }
}
```

**Using a POM in a test:**

```typescript
import { test, expect } from "../fixtures/auth";
import { MyPage } from "../pages/MyPage";

test("page loads correctly", async ({ authenticatedPage }) => {
  const myPage = new MyPage(authenticatedPage);
  await myPage.goto();
  await expect(myPage.heading).toBeVisible();
});
```

### Selector conventions

Prefer these locator strategies in order of resilience:
1. `getByRole("button", { name: "..." })` — semantic, survives CSS refactors
2. `getByText("...")` — good for headings and static copy
3. `getByLabel("...")` / `getByPlaceholder("...")` — for form inputs
4. `getByRole("heading", { name: "..." })` — for page titles
5. CSS class or `locator("...")` — last resort, fragile

Avoid selecting by class names (they change often in Tailwind projects).

### Mocking edge functions in E2E

The `mockEdgeFunction` helper in `tests/e2e/fixtures/api-mocks.ts` intercepts browser-level fetch calls to a Supabase edge function and returns a canned response.

```typescript
import { mockEdgeFunction, MOCK_PLANT_DOCTOR_IDENTIFY } from "../fixtures/api-mocks";

test("identify flow returns AI result", async ({ authenticatedPage }) => {
  // Set up interception BEFORE navigating
  await mockEdgeFunction(authenticatedPage, "plant-doctor", MOCK_PLANT_DOCTOR_IDENTIFY);

  await authenticatedPage.goto("/doctor");
  // ... rest of test
});
```

**Limitation:** Gemini and Open-Meteo are called server-side from Deno Edge Functions. `page.route()` intercepts browser-level requests only. To test those code paths, use Tier 2 (Deno unit tests for the rule/pattern logic) instead.

---

## 8. Fixture & Factory System

### Unit test fixtures (`tests/unit/fixtures/`)

All factories accept `Partial<T>` overrides and use sequential counters for IDs (not random UUIDs), which produces readable test output like `home-1`, `plant-2`, `task-3`.

```typescript
import { makeTask, makeTaskBlueprint } from "../../fixtures/tasks";
import { makeHome } from "../../fixtures/users";

const home = makeHome({ country: "Australia" }); // home-1
const blueprint = makeTaskBlueprint({ frequency_days: 14 }); // bp-1
const task = makeTask({ blueprint_id: blueprint.id, status: "Completed" }); // task-1
```

Available factories:

| Factory | Returns |
|---------|---------|
| `makeHome(overrides?)` | Home row |
| `makeUserProfile(overrides?)` | UserProfile row |
| `makeHomeMember(overrides?)` | HomeMember row |
| `makeLocation(overrides?)` | Location row |
| `makeArea(overrides?)` | Area row |
| `makePlantSpecies(overrides?)` | Plant (species) row |
| `makeInventoryItem(overrides?)` | InventoryItem row |
| `makeTask(overrides?)` | Task row |
| `makeTaskBlueprint(overrides?)` | TaskBlueprint row |
| `makeDailySummary(overrides?)` | Daily weather summary |
| `makeHourlyPoint(overrides?)` | Hourly weather point |
| `makeWeatherSnapshot(overrides?)` | Full 7-day + 48-hour snapshot |
| `hotDay(date)` | Daily summary: maxTempC=38 |
| `coldDay(date)` | Daily summary: minTempC=-3 |
| `rainyDay(date)` | Daily summary: precipMm=15 |
| `windyDay(date)` | Daily summary: maxWindKph=65 |

### Deno fixtures (`supabase/tests/fixtures/`)

```typescript
import { makeWeatherContext, makeDailySummary } from "../fixtures/weatherContext.ts";
import { makePatternHit, makeUserEvent, makePostponementRun } from "../fixtures/patternData.ts";
import { makeMockDb } from "../fixtures/mockDb.ts";
```

| Factory | Returns |
|---------|---------|
| `makeWeatherContext(overrides?)` | Full `WeatherContext` (today="2026-05-01") |
| `makeDailySummary(overrides?)` | Single day's weather summary |
| `makePatternHit(overrides?)` | PatternHit object |
| `makeUserEvent(overrides?)` | UserEvent row |
| `makePostponementRun(itemId, count)` | Array of N consecutive postponements |
| `makeInterruptedPostponements(itemId)` | Postponements with a gap (no streak) |
| `makeNeglectedItemEvents(itemId, daysSince)` | Events for neglected-plant scenario |
| `makeMockDb(tables)` | Chainable Supabase query mock |

---

## 9. Mocking Strategies

### Vitest: mocking the Supabase client

For unit tests that import modules which use the Supabase client, mock the entire module at the top of the file before any imports:

```typescript
vi.mock("../../../src/lib/supabase", () => ({
  supabase: { from: vi.fn() },
}));

import { supabase } from "../../../src/lib/supabase";
```

Then configure per-test with `vi.mocked()`:

```typescript
beforeEach(() => {
  vi.mocked(supabase.from).mockReturnValue(makeChain([]));
});
```

The `makeChain(data)` helper used in `taskEngine.test.ts` returns a chainable object where every filter method returns `this`, and the chain is PromiseLike (awaitable via `.then()`). Copy this pattern for new tests that mock DB calls.

### Vitest: mocking other side effects

```typescript
// Mock a named export from a module
vi.mock("../../../src/lib/errorHandler", () => ({
  Logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
```

### Deno: `makeMockDb()` call-order queues

When a function calls `supabase.from("tasks")` multiple times with different expected results, configure the mock with the `makeMockDb` tables — but note the mock returns all rows for a table regardless of filters. Design your test data so the rows themselves distinguish the calls if needed, or use sequential call-order logic as shown in `taskEngine.test.ts`.

### Playwright: `page.route()` for edge functions

```typescript
await mockEdgeFunction(page, "function-name", { /* response body */ });
```

This must be called before `page.goto()` or the page action that triggers the request.

---

## 10. Extending the Framework

### Adding a new unit test file

1. Create `tests/unit/lib/<moduleName>.test.ts`.
2. Import the function under test using a relative path from the test file.
3. Mock `src/lib/supabase` (and `src/lib/errorHandler`) if the module imports them.
4. Run `npm run test:unit` — it is discovered automatically.

**No config changes needed.** The glob `tests/unit/**/*.test.ts` in `vitest.config.ts` picks up all new files.

### Adding a new Deno test file

1. Create `supabase/tests/weather-rules/<rule>.test.ts` or `supabase/tests/patterns/<pattern>.test.ts`.
2. Import via `@shared/` alias (e.g., `@shared/weatherRules/index.ts`).
3. Use `makeMockDb`, `makeWeatherContext`, `makeUserEvent` from the fixtures.
4. Run `npm run test:functions` — discovered automatically.

**No config changes needed.**

### Adding a new E2E Page Object Model

1. Create `tests/e2e/pages/<PageName>.ts`.
2. Extend the POM class pattern: declare `Locator` properties in the constructor, add a `goto()` method and any action methods.
3. Import and use it in spec files.

### Adding a new E2E spec file

1. Create `tests/e2e/specs/<feature>.spec.ts`.
2. Choose the right `test` import:
   - **Unauthenticated:** `import { test, expect } from "@playwright/test";`
   - **Authenticated:** `import { test, expect } from "../fixtures/auth";` (use `authenticatedPage`)
3. Write descriptive `test.describe` and `test` blocks.
4. Run `npm run test:e2e` — discovered automatically.

**No config changes needed.** The glob `tests/e2e/specs/` in `playwright.config.ts` picks up all new files.

### Adding a new fixture factory

**Unit test fixture** — add to the appropriate file in `tests/unit/fixtures/` and export. Counter-based IDs are handled by the existing `uid(prefix)` helper in each file.

**Deno fixture** — add to `supabase/tests/fixtures/weatherContext.ts` or `patternData.ts` and re-export. Remember to use `.ts` extensions on all Deno imports.

---

## 11. Environment Setup

### Unit tests and Deno tests

No environment variables required. These tiers run completely offline.

### E2E tests — authenticated tests only

The 7 unauthenticated auth form tests run without any env vars. All other E2E tests use the `authenticatedPage` fixture, which signs in as the dedicated test account.

The `.env.test` file in the project root is already configured for local development:

```bash
# .env.test — targets local Supabase (never commit)
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_PUBLISHABLE_KEY=<local anon key>
TEST_USER_PASSWORD=TestPassword123!
# Optional — required for realtime.spec.ts (Section 15). Run `supabase status` to get the key.
SUPABASE_SERVICE_ROLE_KEY=<local service role key>
```

E2E tests run with up to 4 parallel workers, each using its own isolated Supabase account:

| Playwright worker index | Account |
|------------------------|---------|
| 0 | `test1@rhozly.com` |
| 1 | `test2@rhozly.com` |
| 2 | `test3@rhozly.com` |
| 3 | `test4@rhozly.com` |

The account email is derived automatically inside `tests/e2e/fixtures/auth.ts` from `PLAYWRIGHT_WORKER_INDEX` — you do not need to set `TEST_USER_EMAIL`. Each worker account has its own UUID-prefixed dataset so workers never share rows.

### Local DB setup — seeding the test accounts

All numbered test seeds (`supabase/seeds/00_bootstrap.sql` → `14_head_gardener.sql`, including `13_integrations.sql` — the ecowitt integration + soil sensor + water valve telemetry backing the Home dashboard chips) use `ON CONFLICT DO UPDATE` so they are fully idempotent — safe to re-run at any time without wiping the database first. The canonical per-file contents table lives in [docs/e2e-test-plan/01-seeded-fixtures.md](docs/e2e-test-plan/01-seeded-fixtures.md).

**When to do what:**

| Situation | Command |
|-----------|---------|
| Start of any test cycle (recommended default) | `npm run test:e2e:fresh` — seeds all 4 workers then runs tests |
| Quick re-run during active development | `npm run test:e2e` — skips seeding, assumes data is already clean |
| Seed data looks wrong or a test contaminated the DB | `npm run test:seed` to restore seed state without touching migrations |
| A new migration needs to be applied locally | `supabase db reset --local && npm run test:seed` |
| Setting up from scratch / first time | `supabase db reset --local && npm run test:seed` |

**`npm run test:seed`** — runs `scripts/seed-test-db.mjs --workers 4`, applying all numbered seeds for each worker (4 by default). Each worker gets a distinct UUID prefix (`0000000N-0000-0000-`) and matching email (`testN@rhozly.com`). Because all seeds are idempotent, this is always safe to run.

**`supabase db reset --local`** — re-applies all migrations from scratch and restores `supabase/seed.sql` (your personal dev account). Only needed when you have a new migration to apply locally. Does **not** load the numbered test seeds — always follow it with `npm run test:seed`.

**Full reset + seed workflow (only when migrations changed):**

```bash
supabase db reset --local && npm run test:seed
npm run test:e2e
```

**Personal dev data (`supabase/seed.sql`) vs test data (`supabase/seeds/`):**

`seed.sql` is a dump of your personal local account and is restored on every `db reset`. It belongs to a different user ID than `test@rhozly.com`, so RLS ensures the two accounts never see each other's data. You do not need to delete your personal home, locations, or areas — they are invisible to the test suite.

### Dev server

The `playwright.config.ts` is configured with `webServer.reuseExistingServer: true` for non-CI environments. If you already have `npm run dev` running, Playwright will use it. Otherwise it starts one automatically.

---

## 12. Current Test Inventory

### Unit tests — 1,404 tests across 127 files

> Counts from `npm run test:unit` (authoritative). The table below inventories the core `src/lib/` suites.

| File | Tests | Functions covered |
|------|-------|-------------------|
| `seasonal.test.ts` | 34 | `getFrequencyDays`, `getHemisphere` (lat-authoritative + expanded SH country list), `normalizePeriods`, `getSinglePeriodRange` (SH +6-month shift for explicit months, month ranges) |
| `dateUtils.test.ts` | 8 | `getLocalDateString`, `formatDisplayDate` |
| `plantScheduleFactory.test.ts` | 17 | `buildAutoSeasonalSchedules` |
| `automationEngine.test.ts` | 17 | `calculateSeasonalDate`, `ailmentTaskType`, `frequencyDays` |
| `taskEngine.test.ts` | 41 | `fetchTasksWithGhosts` (ghost generation, tombstone suppression, completed task filtering, `paused_until` semantics — pre-pause occurrences suppressed permanently, post-pause occurrences emit during the pause) |
| `gardenWalk.test.ts` | 47 | `composeAndOrderWalk` (banding, indoor filter, same-day dedupe, cap) + RHO-18 instance grouping (same-plant same-area collapse into one card, different-area separate, manual-name grouping, group band = most-urgent member, summed counts, distinct-nickname collapse, cap counts groups) + RHO-18 route (task keyed to a non-representative member resolves to the group step) + RHO-17 `composeWalkRoute` (home→location→area→plant ordering, empty-section omission, most-specific task assignment incl. multi-plant/personal/ghost/fallbacks, section done vs skipped filtering, unassigned section, attention preview, `MAX_PLANTS_PER_WALK`) + `sectionForStep`, `isWalkableTask` + Phase 2 telemetry (device → most-specific-step assignment with area/location/home fallbacks, device-only sections stay alive, multi-sensor areas, `areas.latest_soil_*` → `latest` strip, deviceless input keeps Phase 1 behaviour) + Phase 3 weaving (`derivePlanPhase` PlanStaging parity incl. plant-first, home watchlist digest with link counts + archived exclusion, per-area ailment context via itemAreas, In-Progress plan digests + area banners + `openTaskCount`, enrichment-never-forces-a-section rule) |
| `taskActions.test.ts` | 16 | RHO-17 shared task mutation core — `completeTask`/`skipTask`/`postponeTask` ghost vs physical vs blueprint payload parity with TaskList, `unique_blueprint_date` 23505 → UPDATE fallback, event logging, `materialiseGhost` select passthrough, `snoozeHarvestTask` (today+days, window_end_date cap, ghost materialise-first, ≥1-day floor) |
| `scheduleFromSchedulableTask.test.ts` | 28 | `scheduleFromSchedulableTask` — month-window → blueprint dates, incl. wrap-around windows (Nov–Jan) |
| `useHomeRealtime.test.ts` | 6 | `useHomeRealtime` — callback fires on matching table, debounce, multi-subscriber, cleanup |
| `plantLabels.test.ts` | 23 | `derivePlantLabels` — plant_type, cycle variants, watering variants, drought_tolerant, care_level, indoor, edible, tropical, pruning deduplication |
| `yieldService.test.ts` | 10 | `validateYieldValue`, `fetchYieldRecords`, `insertYieldRecord`, `deleteYieldRecord`, `updateExpectedHarvestDate` |
| `yieldSplit.test.ts` | 7 | RHO-21 `splitYieldEvenly` — even split, remainder on last row summing to total, 3dp rounding, guards, one-part-per-instance |
| `harvestYield.test.ts` | 6 | `buildHarvestYieldRows` — total-split vs per-plant rows, sum==total, zero/blank skip, notes trim/null |
| `todaySummary.test.ts` | 5 | RHO-20 `buildTodaySummary` — done from server bucket, pending from client count, skipped/postponed passthrough, null-bucket in-flight, negative clamp |
| `locationTaskCounts.test.ts` | 10 | `buildLocationTaskCounts` — remaining-today per location; all-completed → 0 (completed-ghost double-count regression), un-acted → one ghost per due blueprint, partial completion, Skipped/Completed suppress-but-don't-count, standalone completed ignored, per-location 0 seeding, freq-alignment, harvest-window counts once, paused/future/ended excluded |
| `plantNames.test.ts` | 8 | `normalizePlantName` (crab apple = crabapple = Crab-Apple, punctuation/digits, nullish) + `formatOtherNames` (string[]/jsonb-string/comma/null shapes, dedupe vs common+scientific spacing-insensitively) — plant-search "other names" + intuitive matching |
| `sensorRequirements.test.ts` | 7 | Plant Soil Requirements — `formatSensorRange` (band + em-dash), `buildSensorRequirementRows` (units, partial/empty), `hasAnySensorRange` / `hasAllSensorRanges` |
| `taskOverdue.test.ts` | 44 | `isTaskOverdue`/window helpers + RHO-19 `lateCompletionDueDate` (late vs on-time, window-aware deadline, UTC-slice guard) + `completedLocalDate` |
| `plantLightUtils.test.ts` | 16 | `getOptimalLuxRange` — full sun/partial/shade mapping, union of ranges, empty/unknown returns null; `getLightFitness` — all 5 ratings, boundary values, color/bgColor presence |
| `achievements.test.ts` | 13 | `computeUnlocked` — early_adopter always on, per-threshold unlocks for growing/tasks/AI/planning/health/explorer, progress function bounds, all defs have unique keys |
| `verdantlyUtils.test.ts` | 12 | `VERDANTLY_WATERING_DAYS` mapping, `VERDANTLY_SUNLIGHT_MAP` mapping, `getProviderLabel` source dispatch |
| `plantProvider.test.ts` | 10 | `searchAllProviders` merge/fallback, `getProviderPlantDetails` provider dispatch, config-gate |
| `taskOptimiser.test.ts` | 12 | `analyseArea` — all 4 scenarios (fragmentation, redundant, two-tier, pileup), non-optimisable categories, cross-area isolation; `canUndoSession` — recent/old sessions, reversed flag, edited blueprint |
| `taskOptimiserAi.test.ts` | 9 | `analyseAreaAi` — correct edge function invocation, empty proposals, error propagation, optional body fields; `fetchNegativeFeedback` — field mapping, empty result, DB error, missing snapshot fields |
| `garden.test.ts` | 18 | `sunFit` (parse preferences, match/adjacent/mismatch, summary), `plantTokens` (stable hash colour, initial, grid layout, max), `microclimate` (frost risk classification, wind shelter from walls/greenhouse, low-fence ignore), `companionPlants` (beneficial pairs, harmful pairs, neutrals, group precedence) |
| `useAiPlantFreshness.test.ts` | 7 | Wave 5 — resolves globals vs shallow forks vs deep forks, ack semantics target global plant_id, empty input, missing parent (RLS/deleted) returns null |
| `UpdatedChip.test.ts` | 6 | Wave 5 — renders nothing for count≤0, singular vs plural label, button when onClick provided, span otherwise, fires onClick |
| `aiPlantOverrides.test.ts` | 12 | Wave 6 — `diffOverriddenFields` (no-change, scalar, array, sort/case-insensitive, null/empty equivalence, ignores non-overridable fields) + `mergeOverriddenFields` (union, dedup, null/empty handling) |
| `SourceChip.test.ts` | 5 | Wave 6 — renders nothing for non-AI, catalogue variant when overrides empty/null, custom variant when overrides non-empty |
| `valveControl.test.ts` | 4 | `valveControlMode` — eWeLink → live, custom_http+controllable → custom, otherwise read-only |
| `payloadTemplate.test.ts` | 6 | Custom valve control preview — `{{var}}` render (+ unknown-var throw, parity with Deno), `buildControlPreview` ok / template-error / non-JSON-body cases |
| `areaInsight.test.ts` | 6 | AI Area Coach presentation helpers — `metricLabel`, `statusMeta` (good/low/high/unknown styling), `compatibilityMeta` (well/minor/poor verdict label + tone), `formatAnalysedLabel` (just-now/m/h/d/date windows) |
| `pickerFilter.test.ts` | 13 | Automation builder task/sensor picker filter — `shouldShowPickerSearch` (>6 threshold + custom), `filterPickerItems` (empty query, case-insensitive title/name match, **always keeps a selected item**, no-match empty) |
| `ailmentMapping.test.ts` | 4 | Ailment library → watchlist mapping — `kindToWatchlistType` (disorder→disease), `severityToWatchlist` (4→3 levels), `mapLibraryToWatchlistPayload` (scalars/symptoms/steps, omits absent steps, image fallback) |
| `stripMarkdownImages.test.ts` | 5 | Chat image sanitiser — strips `![alt](url)` + reference images, keeps normal links/text, collapses whitespace |
| `automationTemplates.test.ts` | 3 | Builder templates — unique ids, each builds a named tree + actions; Smart watering = (moisture<30 AND not rain) OR moisture<18; scheduled-skip-rain shape |
| `conditionTree.test.ts` | 10 | Unified automation builder — `newLeaf`/`newGroup` defaults, `summariseNode`/`summariseTree` (sensor count, negate "not", time weekdays/every-day, AND join, empty AND/OR, null) |
| `chatAutoRead.test.ts` | 9 | Chat auto-read decision — `reduceAutoRead` primes the existing tail on open (no speak), speaks only newly-arrived replies, dedupes re-renders, re-primes on reopen / history reload, skips welcome / off / loading |
| `plantFirstPlan.test.ts` | 2 | Plant-first planner client helper — `countBlueprintPlants` (sums plants across all area groups; null / undefined / no-areas → 0) |
| `gardenBrief.test.ts` | 10 | Head Gardener brief helpers — `goalLabel`/`styleLabel`/`timeLabel`/… (id→label + fallback), `isBriefEmpty`/`isBriefConfirmed`, `summariseBrief`, `normaliseDraft` (drops invented ids, de-dupes, caps goals/styles, total on garbage) |
| `managerReport.test.ts` | 5 | Head Gardener report helpers — `sortSections` (severity desc, stable, non-mutating), `severityTone` (label+classes), `isReportEmpty` |
| `weatherDates.test.ts` | 8 | `formatDateRange` — Today/Tomorrow, far-out "23 May", consecutive run "Mon–Wed", two-day "&", disjoint comma list, dedupe/sort, "+N" cap |
| `heatThreshold.test.ts` | 3 | `heatThresholdForClimate` client mirror — UK 25°C override (any zone), zone map for the rest, default 28 (used by the Garden Intelligence weather panel) |
| `dataSources.test.ts` | 5 | Credits & Sources data (`DATA_SOURCES`) — required fields, known categories, unique ids, every category non-empty, covers the key external sources |
| `weatherAlertDismissal.test.ts` | 7 | App-wide weather-alert dismissal — `todayLocal`, `isDismissedToday` (per-type, reappears next day), `dismiss`/`undismiss` (immutable), `parseDismissed` (drops legacy id-array, keeps valid map, total on junk) |
| `uploadTemplates/csv.test.ts` · `registry.test.ts` · `parse.test.ts` · `template.test.ts` | 85 | RHO-4 bulk CSV upload registry (Phases 1–3). **csv:** RFC-4180 tokenizer (quoted commas/newlines/doubled quotes), CRLF, BOM strip, smart-quote normalisation, delimiter sniffing (`,`/`;`/tab, header-row only), serialiser round-trip + BOM. **registry:** PLANT_TEMPLATE ↔ ManualPlantCreation `cleanPayload` parity guard (headers pinned, `thumbnail_url` excluded, favourite is a non-column bool), `buildPayload` → `saveToShed` skeleton (variety/quantity/notes folded into `plant_metadata`, labels default `[]`, scratch keys stripped); **AILMENT_TEMPLATE ↔ manual insert-payload parity** (columns = insert keys minus home_id/source/perenual_id/thumbnail, `type` required + CHECK-validated, `description` defaults `''`), `title [severity]` symptom-cell → AilmentSymptom objects, step-title → full AilmentStep with defaults + order; **SEED_PACKET_TEMPLATE ↔ createSeedPacket parity** (columns = insert keys minus home_id/plant_id/image_url + `plant_name` link key, `plant_name` required, modal-owned keys never on payload, `sow_by` rounds up / purchased/opened round down), favourite non-column bool on all three. **parse:** required/enum/int-range/cross-field (watering min≤max)/bool/favourite parsing, `;` multi-value cells, symptoms/steps kinds, **flexible dates** (`parseFlexibleDate` + `date` FieldSpec `datePartial`: full ISO verbatim, `YYYY-MM`/`Month YYYY` round up vs down, leap-year end-of-month, bare-year up-only, garbage → null; through the parser on SEED_PACKET_TEMPLATE), EXAMPLE-row skip, 200-row cap, formula-prefix hardening. **template:** BOM+header build, round-trip zero-error, example-row validity (all three templates) |
| `parseAilmentList.test.ts` | 11 | RHO-4 Phase 2 Watchlist paste regex fallback — `parseAilmentListLocal` (bare name / dash / colon / parenthesised detail → symptom titles, one-per-line, 200-row cap) + `classifyAilmentType` (pest/invasive/disease keyword classification) |
| `careAdjustments.test.ts` | 8 | Garden Brain shared apply/dismiss lib (`src/lib/careAdjustments.ts`, used by AdaptiveCareCard + the Daily Brief inline Apply) — tighten/stretch → blueprint `frequency_days` update then `status='applied'` + event; blueprint failure aborts (no status write); `create_watering_routine` → blueprint + first task + `generateBlueprintTasks`; `stress_risk` acknowledge-only; dismiss → `status='dismissed'` + event; `fetchCareAdjustment` returns the row only while `proposed` |
| `favouriteIdentity.test.ts` | 50 | Cross-home favourites pure helpers — **Plants (Phase 1):** `canonicalPlantRefId` (manual/api own id, AI→global parent, orphan fallback, non-AI provenance ignored), `isSourceLockedForTier` (full source×tier matrix), `lockedSourceMessage`, `shouldForkOnEdit` (copy-on-write decision), `buildFavouriteSnapshot` (whitelist cap, null-skip, falsy-keep), `buildForkRow` (re-source manual, drop provider ids, provenance via canonical id, strip bookkeeping). **Ailments (Phase 2):** `isAilmentSourceLockedForTier` (perenual/ai/library matrix), `lockedAilmentSourceMessage`, `ailmentIdentityKey` (name_key mirror — lowercase/trim/collapse-ws), `buildAilmentSnapshot` (whitelist cap). **Seed packets (Phase 3):** `packetIdentityKey` (variety\|plant composite, casing/spacing stability, missing parts), `buildPacketSnapshot` (variety-reference whitelist — never live stock/sowings) |

### Edge function tests — Deno (929 tests across 85 files)

| File | Tests | Rule / Pattern |
|------|-------|----------------|
| `luxBand.test.ts` | 6 | `_shared/luxBand.ts` — `luxBand` band boundaries (<10k low / 10–25k moderate / 25–45k bright / ≥45k full sun) + `luxBandLabel` rendering and null/invalid handling (AI grounding from `areas.light_intensity_lux`) |
| `stripeTiers.test.ts` | 7 | Stripe billing — `isValidTier`, `tierToFlags` (mirrors `src/constants/tiers.ts`), `PAID_TIERS`, `priceIdForTier`/`tierFromPriceId` (env mapping), `tierFromMetadata`, `statusGrantsAccess` |
| `heatwave.test.ts` | 8 | Heatwave rule — climate-aware threshold (`heatThresholdForClimate`) incl. UK 25°C override, full-window scan, 3-consecutive-day "heatwave" grouping + `dates` |
| `frostRisk.test.ts` | 9 | Frost risk rule (tropical vs standard thresholds) + imminent-hourly + forward daily-min frost nights + `dates` |
| `highWind.test.ts` | 6 | High wind rule (≥40 kph) — full-window scan + grouped `dates` |
| `weatherHelpers.test.ts` | 3 | `maxConsecutiveDays` (longest consecutive-day run) + `heatThresholdForClimate` (climate→°C map, case-insensitive, default 28, UK 25°C country override) |
| `rainAutoComplete.test.ts` | 6 | Rain auto-complete rule (≥5mm) |
| `waterlogging.test.ts` | 6 | Waterlogging rule (5 consecutive rainy days) |
| `consecutivePostponements.test.ts` | 7 | Consecutive postponements pattern |
| `neglectedPlant.test.ts` | 6 | Neglected plant pattern |
| `highPostponeRate.test.ts` | 7 | High postpone rate pattern (>50%, min 4 events) |
| `blueprintPostponeRate.test.ts` | 6 | Blueprint postpone rate (ghost + physical task IDs) |
| `purgeSpeciesCache.test.ts` | 5 | `purgeStaleSpeciesCache` — empty result, delete count, referenced plants preserved, custom TTL, error propagation |
| `aiUsage.test.ts` | 7 | `logAiUsage` — cost calculation per model (flash-lite, pro, flash-preview, unknown), full field mapping to `ai_usage_log`, null homeId/userId/action passthrough |
| `yield/predictYield.test.ts` | 6 | `buildYieldPrompt` — includes plant name, planted date, harvest date, no-history text, past yields, weather summary |
| `rls_isolation.test.ts` | 16 | Cross-tenant RLS — tasks, inventory, locations, plans, blueprints, ailments, weather_alerts, community_guides, home_members, yield_records, user_profiles |
| `edge_function_auth.test.ts` | 7 | Edge function auth — plant-doctor/contact-support/scan-area/generate-guide/image-proxy reject missing/invalid JWT; scan-area 400 on missing homeId |
| `aiPlantCatalogue.test.ts` | 22 | Wave 2 of AI Plant Overhaul — `normaliseScientificKey`, `parseMatchString`, `diffCareGuide` |
| `refreshStaleAiPlants.test.ts` | 5 | Wave 4 of AI Plant Overhaul — changed/unchanged paths, empty batch, mid-batch crash isolation, batch-size cap |
| `sceneJson.test.ts` | 6 | Multi-ID — `parseSceneJson` tolerant parse (clean JSON, code fence, prose preamble, truncated-array salvage, unrecoverable → empty, null/empty input) |
| `controlTemplate.test.ts` | 12 | Custom valve control — `renderTemplate` ({{var}} subst, unknown-var throw, no eval), `templateVarsUsed`, `checkControlUrl` (https + private/loopback/metadata host block) |
| `customHttpControl.test.ts` | 13 | `customHttpAdapter.control()` (no-url / http / non-2xx / template error; renders body+headers; stubbed `fetch`) + `connect()` control-config storage + validation; `parseHeaderBlock` / `isJsonContentType` |
| `plantCareRangeGen.test.ts` | 6 | Plant care-range generator — `CARE_RANGE_SCHEMA` requires all six fields (lowercase types; regression guard for the partial-fill bug), `buildPlantCareRangePrompt`, `parseCareRangeResponse` (plain/fenced/null/non-finite) |
| `areaAnalysisPrompt.test.ts` | 19 | AI Area Coach — `buildAreaAnalysisPrompt` (area/readings/plants/automations, **stored care ranges authoritative**, **condition-tree summary**, scheduled-vs-moisture trigger + linked tasks, raw-ADC label, persona branch, empties, **per-plant + compatibility ask**), `AREA_ANALYSIS_SCHEMA` (plant_analysis + compatibility fields), `parseAreaInsight` (valid/fenced/garbage, **carries + tolerates-absent plant_analysis/compatibility**), `shouldRegenerate` (force / no-readings / cache-empty / newer-reading) |
| `hybridWeatherEvaluator.test.ts` | 12 | Hybrid weather watering — `computeRainWindow` (hourly mm sum + window end, daily fallback, out-of-window), `evaluateHybrid` (off/skip/defer, critical-low, heat override, hold while deferred, forecast-underdelivered, max-defers cap, **five showers → one deferral**) |
| `extractJson.test.ts` | 6 | Tolerant AI JSON extraction — clean object, strips ```json / bare fences, prose preamble+suffix, array payload, throws on empty/garbage (fixes Plant Doctor "invalid JSON" on fenced model output) |
| `ailmentVerifyPrompt.test.ts` | 5 | Ailment Library verifier — `buildAilmentVerifyPrompt` (entry + safety rule), `applyVerifyResult` (matched→valid; amended writes allowed fields + drops bad severity/empty→pass), `parseVerify` |
| `ailmentSeedPrompt.test.ts` | 9 | Ailment Library seeder contract — `buildAilmentSeedPrompt` (count + exclusions), schema shape, `ailmentRowToColumnShape` (map/trim/defaults, reject bad name/kind, coerce arrays + drop bad severity), `parseAilmentBatch` (clean / truncated-salvage / garbage) |
| `parseAilmentList.test.ts` | 9 | RHO-4 Phase 2 `parse-ailment-list` shared helper (`_shared/ailmentListParse.ts`) — `buildAilmentParsePrompt` (embeds paste + lists types), schema requires name+type, `normaliseAilmentType` (canonical / invasive-weed aliases / disease default), `normaliseAilments` (clean map, drop nameless, coerce bad type, garbage→empty, 200 cap) |
| `conditionTree.test.ts` | 12 | Unified automations engine — `evaluateTree` (AND/OR/NOT, nesting, empty groups), `isWithinSchedule` (weekday/time window, timezone shift, overnight wrap, all-day/empty), `evalSensorLeaf` (agg modes), `evalWeatherLeaf` (rain/heat), `summariseTree`, `shouldFire` (**repeat-while-true + cooldown floor**) |
| `notificationTiming.test.ts` | 5 | Notification timing — `localMinutesOfDay` (tz-aware), `isReminderDue` (at/just-past/before, non-aligned next-tick, malformed→08:00), `isNearSunset` (30–75 min pre-sunset window) |
| `automationCandidates.test.ts` | 7 | Hybrid engine candidate selection — `treeHasTimeTrigger` (time/date/weather vs sensor/task), `treeHasSensorTrigger`, `treeAffectedByDevice` (explicit sensor id, area-scoped via leaf area + automation-area fallback, nested groups, non-sensor never matches) |
| `automationWindow.test.ts` | 11 | Home default run-window — `treeHasOwnSchedule` (time/date_range at any depth), `isWithinWindow` (daytime, HH:MM:SS form, overnight wrap, zero-length always, tz shift), `defaultWindowOpen` (disabled bypass, own-schedule bypass, sensor-only gated to window) |
| `plantImageVet.test.ts` | 10 | Chat gallery AI vetting — `selectConfidentImages` (threshold keep/drop, legitimately drops all, **fails open** on length-mismatch / missing scores, NaN fails, default threshold) + `parseScores` (valid / stringified-coerce / bad-shape→null / NaN) |
| `plantFirstBlueprint.test.ts` | 6 | Plant-first planner output hardening — `normalisePlantFirstBlueprint`: caps areas (max 6), drops plant-less areas, clamps quantities (1–99) + `frequency_days` (1–365), coerces missing fields, derives `is_new` from `existing_area_id` |
| `automationClaim.test.ts` | 3 | Automation firing race guard — `applyEdgeClaimFilter` keys the optimistic-CAS claim on the exact `last_fired_at` read (`IS NULL` when never fired, `eq` otherwise; never an unconditional update), so concurrent cron/event invocations can't double-fire the same rising edge |
| `automationReceipt.test.ts` | 7 | Automation Receipt — `buildReceipt` outcome messages (ran with valves/tasks, notify-only, rate-limited with limit/next/nudge, failed, partial, skipped-weather, window labels + fallback name) |
| `valveControl.test.ts` | 6 | Provider-generic valve dispatch (`_shared/integrations/valveControl.ts`, VC-001..006) — adapter providers (custom_http) actuate via the adapter contract and never touch the eWeLink fallback; non-adapter providers (eWeLink) take the fallback; adapter throw → `{ok:false, error}`; **real-registry invariants**: eWeLink has no adapter so eWeLink valves keep the fallback path unchanged, custom_http dispatches to its adapter (guards the stuck-open fix, bug-audit-2026-07-10 #1/#2) |
| `valveQueue.test.ts` | 7 | Shared `drainValveQueue` — empty queue no-op (beyond the stale-claim sweep), stale `firing` rows swept (turn_off retries / turn_on dead-letters), `{ runId }` scopes the query to that run, successful `turn_on` marks `fired` + logs a `valve_event`, failed `turn_on` marks `failed` (no event), claim-lock lost-claim skip, countdown uses the action's `valve_duration_seconds`. Guards the fix where the auto path now drains inline so the "ran" receipt isn't sent ~5 min before the valve opens |
| `gapAnalysis.test.ts` | 12 | Head Gardener goal-gap engine — `analyseGaps` (year-round-colour bare-season detection case-insensitive, grow-your-own no-edibles + harvest-gap, attract-wildlife, low-maintenance overload, family-safe toxic flags, multi-goal accumulation, full-coverage → no gap) |
| `managerLog.test.ts` | 6 | Head Gardener continuity log — `gapKey`/`gapTitle`, `diffGapLog` (opens new gaps, closes gone gaps, simultaneous open+close, ignores null target_id, no-op) |
| `geminiParts.test.ts` | 6 | `joinPartsText` — joins all Gemini `content.parts` text (multi-part concatenation, ignores non-text/functionCall parts, empty/non-array → ""); guards the multi-part-truncation bug that emptied the Head Gardener report + cut off the insights summary |
| `dashboardStats.test.ts` | 20 | `home-dashboard-stats` count helpers (`_shared/dashboardStats.ts`) — RHO-14 tasks-this-week (prior-week overdue counted, week-scoped total/pending, snooze/harvest-window aware, completedThisWeek), RHO-15 day strip (prior-week overdue → Sunday, harvest window spans in-week days, per-day overdue+pending), RHO-16 harvests-due subject-keyed dedup (3-plant task→3, same plant once, unlinked→1, recurring blueprint once, linked+unlinked distinct, Completed/Skipped excluded, pre-week window overlap), plus DASH-STATS-028..031 regressions (tz-local `completed_at` bucketing, no Sunday double-count for straddling closed windows, window tasks "late" only after window end) |
| `adaptiveCare.test.ts` | 14 | Garden Brain Phase 1 rules (`_shared/adaptiveCare.ts`, AC-001..014) — target band from plant ranges, confidence/segment/reading-day gates, tighten/stretch anti-oscillation thresholds (1.25×/0.6×, deliberately non-adjacent), 14-day dismissal cooldown, `create_watering_routine` only when nothing waters the bed, verification `verified_good/mixed` maths |
| `dailyBrief.test.ts` | 15 | Garden Brain Phase 2 brief assembly (`_shared/dailyBrief.ts`, DB-001..015) — scoring-table ranking (overdue > care > photo_flag > weather > window > automation > insight > battery), MAX_ITEMS cap, route+reason on every item, good-news gating (`verified_mixed` never celebrated), deterministic summary, `prependBriefToDigest` first-sentence-only + absent-brief-unchanged; Phase 3: photo_flag rank/shape, care `apply_care_adjustment` action only when the proposal has an id, `open_photo_actions` payload, absent photoFlags safe |
| `scanJournalPhotos.test.ts` | 17 | Garden Brain Phase 3 photo scan (`_shared/scanJournalPhotos.ts`, SJP-001..031) — `selectPhotos` predicate (plant-linked, has image, never observed, 14-day window, oldest-first, 10-cap), `validateObservation` closed-vocabulary contract (unknown kinds dropped, ≤2 actions, due_in_days clamp 0–14, create_task requires task_type+title, check_for_ailment requires suspected, text caps 160/200/80, status always `proposed`, unusable core → null), `shouldApplyStage` (≥0.8 + differs), responseSchema enum pinning, prompt content |
| `homeOverview.test.ts` | 16 | `home-overview` pure helpers (`_shared/homeOverview.ts`, HOME-OV-001..016) — `deriveValveState` (running inside the turn_on countdown, never past `duration_seconds`, newer turn_off wins, failed-queue-newer-than-last-event → failed, `nextRunAt` = earliest pending turn_on), `soilBand` (<30 dry / >70 wet), `rankAttention` (overdue > alert > failed automation > battery/soil > harvest; max 4; empty when calm), `summariseSoilReading` (null-safe, `readingAgeMin`, battery falls back to the reading payload), RHO-17 Phase 2 `shapeWalkDevices` (unassigned/location/area assignments + name-sorted, multi-sensor areas, valve state + control metadata with duration fallback, stale reading ages, unknown device types dropped) |

### E2E tests — 530 tests across 35 files (+ 13 isolation tests)

> `ailment-library.spec.ts` (Section 24) covers the browse shell (heading, search, kind filter chips) + the "Browse the ailment library" navigation from the Watchlist. Shell-only (the seeded e2e DB has no `ailment_library` rows → grid empty state).

> `automations.spec.ts` (Section 23) + `pages/AutomationsPage.ts` cover the unified condition builder: opening it, applying the Smart watering template (name + summary), the template chips, the **default run-window card** (AUTO-004: visible, pre-filled 08:00–20:00, save persists across reload — restores the default for idempotency), and the **task-due leaf picker** (AUTO-005: renders a picker; when >6 recurring tasks the search narrows the chips). Builder tests are non-persisting (cancel, no save); AUTO-004 writes to `homes` but restores the default.

Tests run across up to 4 parallel workers (`fullyParallel: false` — spec files run in parallel, tests within a file run sequentially).

The `isolation` Playwright project (`npx playwright test --project=isolation` / `npm run test:e2e:isolation`) runs 13 additional data-isolation tests from `data-isolation.spec.ts` using a single worker (`test1@rhozly.com`). These verify that each authenticated user only sees their own home's data.

| File | Tests | Coverage |
|------|-------|----------|
| `auth.spec.ts` | 17 | Sign-in form + validation (AUTH-001–010), sign-up name + 8-char password validation (AUTH-020–023), forgot password + email confirmation (AUTH-030–031), OAuth buttons (AUTH-040), session persists across reload (AUTH-050) |
| `home-setup-join.spec.ts` | 14 | Join Existing Home flow (R2-001–014): tile routing, empty/whitespace/invalid UUID rejection, RLS-safe generic error banner, successful join PATCH, paste trimming, no sync-weather on join, error clears on retry, focus/disabled states |
| `home-setup-create.spec.ts` | 9 | Create New Home flow (R1-001–009): tile routing, required-fields, hemisphere chip, postcode uppercase, successful create RPC + sync-weather, RPC failure banner, in-flight disabled, sync-weather resilience |
| `welcome-modal.spec.ts` | 9 | First-run WelcomeModal (R3-001–009): trigger conditions, 5-slide navigation, back disabled on slide 0, dot jumps, persona aria-pressed, Skip/Start Quiz PATCH bodies, focus trap |
| `shed-discovery.spec.ts` | 7 | Shed discovery (SHED-DSC-001–007): tab routing (`/shed?tab=watchlist`), nursery view toggle, scientific-name search, default A-Z sort, source filter narrows/restores, credit badge popover |
| `plant-edit-assignment.spec.ts` | 5 | Plant Edit save validation (PE-001), Plant Assignment quantity stepper min-clamp + free increment + add-to-garden CTA (PA-001/002/003), Bulk Assign modal lists per-plant qty inputs (BA-001) |
| `instance-edit-tabs.spec.ts` | 3 | InstanceEditModal tab content: Journal add+persist (IE-001), Routine list renders blueprints (IE-002), Yield log records new harvest (IE-003) |
| `favourites.spec.ts` | 18 | Cross-home favourites. **Phase 1 — plants (FAV-001..006):** `?scope=favourites` deep link + seeded fixtures + hint banner, heart toggle from Home tab, seeded Tomato pre-filled + "In this home" dedupe, "Add to this home" copies a tombstone into the home, Sprout tier-lock disables hearts on api/ai plants, home-switch persistence via W1's second home (skipped on W2–W4). **Phase 2 — watchlist ailments (FAV-WL-001..006):** `?tab=watchlist&scope=favourites` deep link + Aphid/Rose Rust fixtures + hint banner, heart toggle from Home tab, Aphid dedupe "In this home", "Add to this home" copies Rose Rust, Sprout tier-lock on a seeded perenual ailment, home-switch add-state recompute via W1's Slugs favourite (skipped on W2–W4). **Phase 3 — nursery seed packets (FAV-NU-001..006):** component-state scope pill (no URL param) + Cherokee Purple/Sensation Mix fixtures + hint banner, heart toggle from Home tab, Cherokee Purple dedupe "In this home", "Add to this home" recreates the Sensation Mix packet, packets UNGATED (forced-Sprout heart still enabled — no source), home-switch persistence via W1's Cavolo Nero favourite (skipped on W2–W4) |
| `harvest-window.spec.ts` | 9 | Wave 20 TaskModal harvest contract (HRV-001–009): in-window 4-button footer + green pill, Harvested → status flip, Not yet 3/5/7 popover, snooze flow completes, Picked some enabled when linked, window-closed footer + amber pill, Mark missed transitions out of Pending |
| `calendar-window.spec.ts` | 5 | Calendar visualisations of the harvest contract (CAL-001–005): today's amber highlight when in window, snoozed task hidden from original due_date, dot moves to next_check_at, agenda hides snoozed on today, agenda reveals snoozed on next_check_at |
| `plant-doctor-chat.spec.ts` | 6 | Garden AI chat regression net (CHAT-001/002/003/006/009/010): FAB opens panel, send + AI reply via mocked agent-chat, no-duplicate-on-reload (22.0023), add_plant_to_shed tool-confirm card on cucumber prompt (22.0023 mandatory rule), context chip hidden on dashboard, cold-open history loads from chat_messages |
| `members-permissions.spec.ts` | 4 | Members tab — owner-only home (MEM-001/002/005/006): self-row visible with "(you)", copy join code writes home UUID to clipboard, owner role select absent for self, remove/configure buttons absent for self |
| `rls-isolation-db.spec.ts` | 6 | DB-level cross-home RLS sweep (RLS-001..006): SELECT tasks/plants/chat denied; INSERT task / UPDATE plant / DELETE blueprint cross-home denied. **Caught a critical RLS bypass on `plants`** — see migration `20260614000000_drop_plants_public_access_bypass.sql` |
| `schedule-validation.spec.ts` | 5 | BlueprintManager gaps (SCH-V-001..005): frequency min=1 UI guard, filter location/area cascade (enabled real-loc, disabled when location=none), pause toggle visible + reveals 7d/14d/30d options |
| `schedule-optimise.spec.ts` | 11 | Optimise / Suggestions tab (SCH-029..039): tab render, area selector, "All good!" empty state, fragmentation proposals on the Greenhouse seed pair, include/exclude toggle, Apply + history row, Undo, AI button gate via `ai_enabled`, mocked AI proposals + thumbs feedback + Regenerate modal |
| `nursery-lifecycle.spec.ts` | 26 | The Nursery — Section 25 (NURSERY-001..052): browse + Plants/Nursery toggle, empty state, Add Packet via Shed-pick + free-text paths, Log Sowing, Observe Germination (75% rate), Discard, full + partial Plant Out (creates `inventory_items` row with `from_sowing_id`, fires AutomationEngine non-fatally), Plant Out gated when plant_id null, "From the Nursery" badge on InstanceEditModal, bulk paste (regex + mocked AI + link-by-name), **RHO-4 Phase 3 bulk CSV upload (034..037): mode toggle + template download, review + bad-date row flagged + flexible `sow_by` resolution, CSV import + link-by-name + favourites-on-import, free-text still reaches the shared review step**, AddTaskModal Nursery picker, Care Guide tab pill, Shopping refill banner render + Add + hidden states |
| `shopping-edge-cases.spec.ts` | 4 | Shopping gaps (SHOP-E-001..004): Add Item sheet renders Plant + Product tabs, Product tab fields render, completed section toggle renders (seed completed list), Add-to-Shed surfaces on the seeded checked-plants list |
| `planner-restore.spec.ts` | 3 | Planner Archive/Restore (PLN-R-001..003): seeded archived plan visible on Archived tab, options menu shows Restore + Delete, Restore moves plan from Archived → Pending (Active) |
| `dashboard.spec.ts` | 46 | Dashboard sections, weather card, daily tasks, plant grid, nav links, pull-to-refresh; RHO-13 Total Tasks tile → calendar (DASH-050); RHO-9 Week Ahead card gating (DASH-051/052) |
| `garden-walk.spec.ts` | 17 | Garden Walk `/walk` — RHO-17 hierarchical route (WALK-020 home→location→area order, WALK-021 home-card unassigned+personal task complete, WALK-022 skip-section jump, WALK-024 section note, WALK-025 resume prompt, WALK-026 skipped section reappears on "Walk what's left"), Phase 2 telemetry (WALK-030 sensor chip + valve row from the mocked `home-overview` walk view, WALK-031 valve open-with-preset via mocked `integrations-ewelink-control` + close, WALK-032 manual reading sheet save stamped now), Phase 3 weaving (WALK-040 home watchlist digest from seeds incl. archived exclusion + link counts, WALK-041 In-Progress plan digest + actionable area banner on the staged bed, WALK-042 per-bed ailment context chip, WALK-043 in-window harvest strip → shared `HarvestPartialPickSheet` logs a yield + snoozes the row, WALK-044 experienced persona compacts the copy via `setWalkPersona`), RHO-7/8 return-to-origin (WALK-001) + "Back" label (WALK-002), RHO-6 Snap sheet scroll/focus (WALK-010). Per-test reset via `utils/walkSeedReset.ts` |
| `home-main.spec.ts` | 8 | New Home main dashboard `?view=home` (HOME-001..008, all passing 2026-07-02): default landing + 5-tab switcher, overview grid renders seeded locations/areas, legacy `?view=dashboard` → home, `?view=overview` shows the classic page, default quick-action tiles, density toggle persists `rhozly:home:density`, today's tasks "See all" → calendar; HOME-008 (Phase 2) mocks `home-overview` via `mockEdgeFunction` and asserts the sensor chip, valve chip ("Watering" running state) and `soil_dry` attention card. Page Object: `pages/HomeMainPage.ts`. `DashboardPage.goto()` repointed to `?view=overview` |
| `head-gardener.spec.ts` | 7 | Head Gardener `/manager` (HG-001..007): hub heading + tabs, Overview report (mocked) headline/section/gap, continuity log seeded open item, Brief tab seeded brief, Year Plan tab seeded items, Insights tab embedded feed, Ask tab grounded reply (mocked) |
| `plants.spec.ts` | 4 | Shed page load, search input, nav link, plants-or-empty state |
| `shed-crud.spec.ts` | 30 | Add plant (manual + AI), edit, archive, restore, delete, search/filter, detail drawer |
| `tasks.spec.ts` | 31 | Daily tasks, pending/completed tabs, complete, postpone, ghost task generation, shift-blueprint on postpone |
| `schedule.spec.ts` | 26 | Blueprint list, create blueprint, edit, archive, restore, delete, frequency options |
| `weather.spec.ts` | 11 | Weather card, 7-day forecast, alert banners, Garden Intelligence rule panel |
| `plant-doctor.spec.ts` | 13 | Page structure, upload dropzone, image upload flow, mocked AI identify/diagnose results |
| `planner.spec.ts` | 24 | Plan list, create plan, status tabs, plan detail, add stage, task lifecycle; Phase 2 Select All / Deselect All |
| `area-setup.spec.ts` | 21 | Location management, create location, create area, assign plant, delete flows |
| `garden-profile.spec.ts` | 16 | Garden Profile heading, quiz/completion state, option toggling, Next/Back, progress bar |
| `guides.spec.ts` | 25 | Guide list, search/filter by level, open guide detail, breadcrumb navigation; Guides tab in PlantEditModal (GDE-021–025) |
| `watchlist.spec.ts` | 29 | Ailment list, type filters, add manual/AI, detail modal tabs, archive/restore/delete |
| `layout.spec.ts` | 9 | Nav bar visibility, active route highlighting, responsive layout |
| `lightsensor.spec.ts` | 13 | Light sensor page load, readings display, permission flow |
| `visualiser.spec.ts` | 11 | Plant visualiser page load, canvas/overlay rendering |
| `realtime.spec.ts` | 4 | Supabase Realtime subscriptions — area count update, task list update, blueprint list update, weather snapshot update (requires `SUPABASE_SERVICE_ROLE_KEY`, self-skipping otherwise) |
| `yield.spec.ts` | 20 | Yield tab UI (YLD-001–010): log yield, unit options, history ordering, validation, seeded records, delete, human-readable date, journal entry; AI predictor (YLD-011–020): predict button, harvest date pre-fill, loading state, mocked prediction card, confidence badge, reasoning, tips, re-predict, error toast |
| `lighttab.spec.ts` | 8 | Light tab (LGT-001–006): tab visible, optimal range card, Get Reading button, sensor overlay, lux element, back button; Shed plant modal (LGT-007–008): Light tab on PlantEditModal, no-data card for plant with null sunlight |
| `statstab.spec.ts` | 7 | Stats tab (STT-001–007): tab visible, plant info shows planted date, yield count ≥ 1, pruning count ≥ 1, ailment row visible, task total visible, Tomato empty states |
| `data-isolation.spec.ts` | 13 | **Isolation project only** — cross-home data isolation for plants, ailments, plans, blueprints, locations, tasks, inventory items |
| `community-guides.spec.ts` | 17 | Tab visibility, guide display, reader view, star toggle, comment, publish guide, draft isolation |
| `help-center-docs.spec.ts` | 5 | Help Center → Documentation drawer (HCD-001–005): Dashboard doc reader opens, embedded `/doc-images/*.webp` screenshots load (not broken), raw `📸 Screenshot:` callouts stripped, click-to-expand lightbox opens + closes via Esc / close button |
| `security-auth.spec.ts` | 8 | AUTH-001–008: unauthenticated routes redirect to /auth, sign-out invalidates session, post-logout DB query returns 0 rows |
| `security-xss.spec.ts` | 7 | XSS-001–007: XSS payloads in task title, guide title, guide comment, guide body, location name, plan name — `window.__xss` stays undefined |
| `security-storage.spec.ts` | 6 | STG-001–006: cross-home area-scan read blocked, alien community-guides upload blocked, alien file delete, SVG MIME rejected, oversized upload rejected, area-scans bucket is private |
| `shopping.spec.ts` | 28 | Shopping list CRUD, plant/product search (AI + Verdantly + Perenual), shed offer, add purchased plants to shed |
| `companion-plants.spec.ts` | 7 | Companion Plants tab (CPT-001–007): tab visible in shed plant modal, Beneficial/Harmful/Neutral sections, Neutral collapsed by default, Add to Shed button on checkbox, ai_required upgrade message |
| `garden-layout.spec.ts` | 15 | Garden Layout (GLB-001–016): list page + blank-canvas wizard, desktop toolbar single-row, Draw/Edit/Look mode rename, 2D/3D + zoom + settings buttons, sectioned shape rail (Beds/Structures/Hardscape/Features), mobile two-row toolbar + floating bubble, properties tabs (Style/Size/Link) |

> **Seed note — timezone resilience:** `03_tasks_blueprints.sql` includes a "Daily Garden Check" blueprint (`freq=1`, `start_date = CURRENT_DATE - 1 day`). This ensures at least one ghost task is always visible on any date regardless of UTC/local timezone offset. Ghost task E2E tests anchor to this blueprint so they don't become flaky near midnight UTC on UTC+N machines.
>
> **Seed files:** 13 seed files apply in order: `00_bootstrap`, `01_locations_areas`, `02_plants_shed`, `03_tasks_blueprints`, `04_weather`, `05_planner`, `06_ailments_watchlist`, `07_guides`, `08_profile_preferences`, `09_stats`, `10_lux_readings`, `11_community_guides`, `12_shopping_lists`. `11_community_guides.sql` seeds 2 published community guides (UUIDs `0000000N-0000-0000-0010-000000000001/2`) with stars and comments. `12_shopping_lists.sql` seeds 2 shopping lists with 6 items and pre-completes Phase 1 of "Summer Veg Plan" for planner Phase 2 tests.

> **RLS / edge function tests (Deno):** The integration tests in `rls_isolation.test.ts` and `edge_function_auth.test.ts` connect to the local Supabase instance and require both worker accounts to be seeded (`npm run test:seed`). They are skipped automatically if `VITE_SUPABASE_PUBLISHABLE_KEY` is not in the environment. The `npm run test:functions` command now includes `--env=.env.test` to load these vars automatically.

---

## 13. Test Reporting — JUnit, Allure & Jira

Every tier emits **JUnit XML** — the universal format any Jira test-management app (AgileTest, Qase, Xray, Zephyr…) or report tool consumes — and those are rolled up into a single **Allure report**.

### JUnit XML output

| Tier | Reporter | Output |
|------|----------|--------|
| Unit (Vitest) | `junit` reporter (in `vitest.config.ts`) | `test-results/junit/vitest.xml` |
| Functions (Deno) | `--reporter=junit` (orchestrator redirects stdout) | `test-results/junit/deno.xml` |
| E2E (Playwright) | `junit` reporter (in `playwright.config.ts`) | `test-results/junit/playwright.xml` |

`test-results/` is git-ignored. Point any **Jira test app** at `test-results/junit/*.xml` (or download the `junit-results` artifact from the CI run) to import every test + result into Jira.

### Unified Allure report (local)

```bash
npm run test:report        # runs Vitest + Deno, builds ./allure-report
npm run test:report:e2e    # also runs Playwright (needs local Supabase + dev server)
npm run report:open        # opens the report in a browser
```

Each suite is best-effort: a failing suite is captured in the report rather than aborting it. Requires a JRE (Allure runs on Java; the repo ships `allure-commandline`).

### CI → GitHub Pages

`.github/workflows/tests.yml` runs the suites, builds the Allure report (with **run-to-run history**), publishes it to **GitHub Pages**, and uploads the JUnit XML as a `junit-results` artifact. On every push to `main` the live report updates.

- **One-time setup:** repo **Settings → Pages → Source = "GitHub Actions"**.
- **Vitest** runs with no secrets. The pure **Deno** tests run in CI when the `INTEGRATION_ENCRYPTION_KEY` **Actions** secret is set (the workflow auto-enables Deno when it's present). The few integration tests that need a local Supabase (`rls_isolation`, `edge_function_auth`) self-skip in CI — their `VITE_SUPABASE_PUBLISHABLE_KEY` is intentionally not provided, so they don't fail for want of a local DB.
- **Playwright E2E** needs a seeded Supabase + the dev server, so it's run locally (`npm run test:report:e2e`) rather than in CI for now.

### Wiring a Jira test app

The JUnit XML is the integration point — install **AgileTest** (free tier), **Qase**, or similar on the company-managed Jira project, then add a CI step that POSTs `test-results/junit/*.xml` to its REST import endpoint. The repo's JUnit output already matches what those apps expect.
