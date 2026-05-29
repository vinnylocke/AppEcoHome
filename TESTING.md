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

All numbered test seeds (`supabase/seeds/00_bootstrap.sql` → `08_profile_preferences.sql`) use `ON CONFLICT DO UPDATE` so they are fully idempotent — safe to re-run at any time without wiping the database first.

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

### Unit tests — 330 tests across 22 files

| File | Tests | Functions covered |
|------|-------|-------------------|
| `seasonal.test.ts` | 20 | `getFrequencyDays`, `getHemisphere`, `normalizePeriods`, `getSinglePeriodRange` |
| `dateUtils.test.ts` | 8 | `getLocalDateString`, `formatDisplayDate` |
| `plantScheduleFactory.test.ts` | 17 | `buildAutoSeasonalSchedules` |
| `automationEngine.test.ts` | 17 | `calculateSeasonalDate`, `ailmentTaskType`, `frequencyDays` |
| `taskEngine.test.ts` | 33 | `fetchTasksWithGhosts` (ghost generation, tombstone suppression, completed task filtering) |
| `useHomeRealtime.test.ts` | 6 | `useHomeRealtime` — callback fires on matching table, debounce, multi-subscriber, cleanup |
| `plantLabels.test.ts` | 23 | `derivePlantLabels` — plant_type, cycle variants, watering variants, drought_tolerant, care_level, indoor, edible, tropical, pruning deduplication |
| `yieldService.test.ts` | 10 | `validateYieldValue`, `fetchYieldRecords`, `insertYieldRecord`, `deleteYieldRecord`, `updateExpectedHarvestDate` |
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

### Edge function tests — Deno

| File | Tests | Rule / Pattern |
|------|-------|----------------|
| `heatwave.test.ts` | 6 | Heatwave rule (≥32°C threshold) |
| `frostRisk.test.ts` | 7 | Frost risk rule (tropical vs standard thresholds) |
| `highWind.test.ts` | 6 | High wind rule (≥40 kph) |
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

### E2E tests — 422 tests across 26 files (+ 13 isolation tests)

Tests run across up to 4 parallel workers (`fullyParallel: false` — spec files run in parallel, tests within a file run sequentially).

The `isolation` Playwright project (`npx playwright test --project=isolation` / `npm run test:e2e:isolation`) runs 13 additional data-isolation tests from `data-isolation.spec.ts` using a single worker (`test1@rhozly.com`). These verify that each authenticated user only sees their own home's data.

| File | Tests | Coverage |
|------|-------|----------|
| `auth.spec.ts` | 7 | Sign-in form, validation, toggle sign-up, wrong credentials, forgot password, sign-out |
| `dashboard.spec.ts` | 43 | Dashboard sections, weather card, daily tasks, plant grid, nav links, pull-to-refresh |
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
