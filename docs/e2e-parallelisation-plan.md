# E2E Test Parallelisation Plan

Two improvements to the E2E suite: per-worker account isolation (enables full
parallel execution) and timeout reduction (removes unnecessary wait padding).

---

## Part 1 — Per-Worker Account Isolation

### Problem

All Playwright workers currently share one Supabase test account
(`test@rhozly.com`) and one dataset. When `workers > 1`, tests in different
spec files mutate the same rows simultaneously — a task marked complete by one
worker breaks a concurrent test that expects it to be pending. This forces
`workers: 1` and a fully serial run.

### Solution

Give each worker its own isolated Supabase account and dataset. Workers never
share rows, so `workers: 4` (or more) becomes safe.

---

### 1.1 — UUID scheme

Current seeds use `00000000-0000-0000-…` as the entity prefix. The first UUID
segment encodes the worker number:

| Worker | Email | UUID first segment |
|--------|-------|--------------------|
| 1 | `test1@rhozly.com` | `00000001-…` |
| 2 | `test2@rhozly.com` | `00000002-…` |
| 3 | `test3@rhozly.com` | `00000003-…` |
| 4 | `test4@rhozly.com` | `00000004-…` |

The seed SQL files themselves are **not changed**. The seed script substitutes
the prefix at runtime before executing each file:

```
00000000-0000-0000-  →  0000000N-0000-0000-
test@rhozly.com      →  testN@rhozly.com
```

So worker 2's home UUID becomes `00000002-0000-0000-0000-000000000002`, its
first location `00000002-0000-0000-0001-000000000001`, etc. All foreign-key
joins remain intact because the prefix is consistent within each worker's
dataset.

---

### 1.2 — Seed script (`scripts/seed-test-db.mjs`)

Add a `--workers N` flag (default `4`). Loop `w = 1..N`, and for each worker
apply the substitution before executing each seed file:

```js
// Pseudocode for the per-worker loop
for (let w = 1; w <= workerCount; w++) {
  for (const file of seedFiles) {
    let sql = readFileSync(file, "utf8");
    sql = sql.replaceAll("00000000-0000-0000-", `0000000${w}-0000-0000-`);
    sql = sql.replaceAll("test@rhozly.com",     `test${w}@rhozly.com`);
    await client.query(sql);
  }
}
```

One run of `npm run test:seed` creates all 4 worker accounts and their full
datasets. The `ON CONFLICT DO NOTHING` / `DO UPDATE` guards in every seed file
make the script idempotent.

Update `package.json`:

```json
"test:seed": "node scripts/seed-test-db.mjs --workers 4"
```

---

### 1.3 — Auth fixture (`tests/e2e/fixtures/auth.ts`)

Playwright automatically sets `PLAYWRIGHT_WORKER_INDEX` (0-based) in each
worker process. Derive the account email from it instead of reading a static
`TEST_USER_EMAIL`:

```ts
// Remove: const email = process.env.TEST_USER_EMAIL;

const workerIndex = parseInt(process.env.PLAYWRIGHT_WORKER_INDEX ?? "0");
const email = `test${workerIndex + 1}@rhozly.com`;
const password = process.env.TEST_USER_PASSWORD ?? "TestPassword123!";
```

Remove the `if (!email)` guard and update the error message (it already
interpolates `${email}` so it self-updates).

---

### 1.4 — Playwright config (`playwright.config.ts`)

```ts
export default defineConfig({
  testDir: "tests/e2e/specs",
  fullyParallel: false,          // tests within a file still run in order
  workers: process.env.CI ? 2 : 4,
  retries: process.env.CI ? 2 : 1,
  // ... rest unchanged
});
```

- `workers: 4` locally — 4 spec files run simultaneously.
- `fullyParallel: false` — preserves intra-file ordering (setup → action →
  assert sequences in shed-crud, area-setup, etc.).
- `retries: 1` locally — catches timing flakiness without noise.

`fullyParallel: true` is a future upgrade once intra-file ordering dependencies
are audited. Spec files with sequential dependencies would need
`test.describe.configure({ mode: 'serial' })`.

---

### 1.5 — `.env.test`

Remove `TEST_USER_EMAIL` (now derived dynamically). Keep `TEST_USER_PASSWORD`:

```bash
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_PUBLISHABLE_KEY=<local anon key>
TEST_USER_PASSWORD=TestPassword123!
```

---

### 1.6 — Documentation

- **TESTING.md §11** — Remove `TEST_USER_EMAIL` from env setup; add note that
  email is derived from `PLAYWRIGHT_WORKER_INDEX`; update seed command example.
- **CLAUDE.md** — Update seed workflow to reference `test1@rhozly.com` –
  `test4@rhozly.com` accounts.

---

### 1.7 — Reset + seed workflow (no change to steps)

```bash
supabase db reset --local && npm run test:seed
npm run test:e2e
```

`npm run test:seed` now creates 4 full isolated datasets in one shot.

---

### 1.8 — Expected outcome

| | Before | After |
|-|--------|-------|
| Workers | 1 | 4 |
| Spec files in parallel | 1 | 4 |
| Estimated suite time | ~8–10 min | ~2–3 min |
| DB contention flakiness | Yes | No |

---

### 1.9 — Risks and mitigations

**Worker index > 9**: the `0000000N` scheme has one digit for the worker
number. If >9 workers are ever needed, change the replacement to a zero-padded
two-digit format (`0000000N` → `000000NN`). No impact at 4 workers.

**Partial seed leaving stale data**: always run `db reset --local` before
`test:seed` to guarantee a clean slate. The idempotency guards prevent
duplicate errors but won't clean up data left by a previous partial run.

**`fullyParallel: true` later**: before enabling it, audit spec files for
intra-file ordering dependencies. Any describe block with a setup test that
later tests depend on needs `test.describe.configure({ mode: 'serial' })`.

---

## Part 2 — Timeout Reduction

### Problem

Every `toBeVisible()` assertion uses `{ timeout: 15000 }` and every
`waitFor({ state: "hidden" })` spinner wait uses `{ timeout: 15000 }`. For a
local Supabase instance, these are 5 seconds of padding per assertion. Across
~100 tests this adds several minutes of worst-case wait time even when
everything is working correctly.

### Audit findings

| Location | Current | Category |
|----------|---------|----------|
| All `toBeVisible({ timeout: 15000 })` in spec files | 15 000 ms | Standard UI render |
| All `waitFor({ state: "hidden", timeout: 15000 })` in page objects | 15 000 ms | Spinner disappear |
| All `waitFor({ state: "hidden", timeout: 15000 })` inline in specs | 15 000 ms | Spinner disappear |
| Plant Doctor AI result assertions (`timeout: 15000`) | 15 000 ms | Mocked edge function |
| Planner AI generation result assertions (`timeout: 15000`) | 15 000 ms | Mocked edge function |
| `waitForTimeout(3000)` — quiz animation wait in dashboard | 3 000 ms | UI animation |
| `waitForTimeout(1500)` — tab/panel transition waits | 1 500 ms | UI transition |

All AI-related tests (Plant Doctor, Planner) use `mockEdgeFunction` /
`page.route()` — responses are intercepted before they leave the browser, so
they resolve in <100 ms. They do not need extended timeouts.

---

### 2.1 — Target timeouts

| Scenario | Current | Target | Rationale |
|----------|---------|--------|-----------|
| Standard UI render (`toBeVisible`) | 15 000 ms | **10 000 ms** | Local Supabase renders in <2 s; 10 s is ample headroom |
| Spinner wait (`waitFor hidden`) | 15 000 ms | **10 000 ms** | Same — data loads in <2 s locally |
| Mocked AI result assertions | 15 000 ms | **10 000 ms** | Mock resolves instantly; 10 s is generous |
| Real AI endpoint calls (future) | — | **30 000 ms** | If any test ever calls a live edge function, tag with `@ai` and use 30 s |
| `waitForTimeout(3000)` quiz animation | 3 000 ms | **1 500 ms** | Animation completes in ~300 ms; 1.5 s is safe |
| `waitForTimeout(1500)` transitions | 1 500 ms | **800 ms** | Tab/panel transitions complete in <300 ms |

---

### 2.2 — Files to update

**Page objects** (`tests/e2e/pages/`) — `waitFor({ state: "hidden", timeout: 15000 })`:
- `DashboardPage.ts`
- `GardenProfilePage.ts`
- `GuidesPage.ts`
- `LightSensorPage.ts`
- `LocationManagementPage.ts`
- `PlannerPage.ts`
- `SchedulePage.ts`
- `ShedPage.ts`
- `TaskListPage.ts`
- `VisualiserPage.ts`
- `WatchlistPage.ts`

**Auth fixture** (`tests/e2e/fixtures/auth.ts`):
- Spinner `waitFor` on line 62: 15000 → 10000

**Spec files** — `toBeVisible({ timeout: 15000 })` and inline spinner waits:
- `area-setup.spec.ts`
- `dashboard.spec.ts` (also `waitForTimeout(3000)` → 1500, `waitForTimeout(1500)` → 800)
- `garden-profile.spec.ts`
- `guides.spec.ts`
- `plant-doctor.spec.ts`
- `planner.spec.ts`
- `schedule.spec.ts` (also `waitForTimeout(1500)` → 800)
- `tasks.spec.ts`

---

### 2.3 — Implementation approach

A global find-and-replace pass in each file:

```
{ timeout: 15000 }  →  { timeout: 10000 }
timeout: 15000       →  timeout: 10000
waitForTimeout(3000) →  waitForTimeout(1500)   (dashboard.spec.ts only)
waitForTimeout(1500) →  waitForTimeout(800)    (dashboard.spec.ts, schedule.spec.ts)
```

No logic changes — purely mechanical substitution.

---

### 2.4 — Expected outcome

With 4 workers (Part 1) + tighter timeouts (Part 2), worst-case suite time on a
healthy local environment drops from ~10 minutes to under 2 minutes.

---

## Implementation order

1. **Part 2 first** (timeout reduction) — mechanical, low risk, immediate payoff
   even before parallelisation is in place.
2. **Part 1** (per-worker accounts) — requires seed script changes, auth
   fixture update, and config change. Do as a single atomic commit.
