# User-reported bug batch — 2026-06-15

Three bugs flagged during live usage. Two of them share a root cause — the dashboard "Today's Tasks" list and the Shed plant-detail "X overdue" counter both ignore the Wave 20+ snooze/window contract that the Calendar already respects.

## App-reference files consulted

- [`docs/app-reference/02-dashboard/01-dashboard-tab.md`](../app-reference/02-dashboard/01-dashboard-tab.md) — Today's Tasks section, the right-column TaskList
- [`docs/app-reference/07-management/05-integrations-devices.md`](../app-reference/07-management/05-integrations-devices.md) — Valve control panel
- [`docs/app-reference/99-cross-cutting/09-data-model-integrations.md`](../app-reference/99-cross-cutting/09-data-model-integrations.md) — `integrations.credentials_encrypted` shape
- [`docs/app-reference/99-cross-cutting/04-data-model-tasks.md`](../app-reference/99-cross-cutting/04-data-model-tasks.md) — `tasks.next_check_at` / `window_end_date` contract (Wave 20)

## Bug summary

| # | Surface | Bug | Severity |
|---|---|---|---|
| 1 | Integrations → valve panel | "Edge Function returned a non-2xx status: eWeLink error: access token expired" — no refresh attempted | Blocks every valve interaction once token expires |
| 2 | Dashboard → Today's Tasks | "Not yet → 3 days" on a harvest task doesn't remove it from today's list; calendar + agenda are fine | Daily friction; user keeps seeing the snoozed task |
| 3 | Shed → plant detail (e.g. Strawberries) | "1 overdue task" counter includes tasks already postponed / snoozed past their original due date | Misleading at-a-glance summary |

---

## Bug 1 — eWeLink access token expired (no refresh)

### What I found

[`supabase/functions/integrations-ewelink-state/index.ts:99`](../../supabase/functions/integrations-ewelink-state/index.ts#L99) reads `accessToken` from `credentials_encrypted` and uses it directly. If the eWeLink API responds with `error !== 0` (line 119), the function returns a 502 with the upstream `msg` — which is what surfaces as "eWeLink error: access token expired" in the Valve Control Panel (thanks to Bug 5 fix from the prior batch that wired `extractEdgeError`).

The connect flow at [`integrations-ewelink-connect/index.ts:96-129`](../../supabase/functions/integrations-ewelink-connect/index.ts#L96-L129) **does** store the `refreshToken` alongside the access token:

```ts
const accessToken:  string = tokenJson.data?.accessToken  ?? "";
const refreshToken: string = tokenJson.data?.refreshToken ?? "";
...
const encrypted = await encryptCredentials({ accessToken, refreshToken });
```

So the refresh token is already in the DB — it's just never used.

eWeLink's refresh endpoint per their v2 docs: `POST /v2/user/refresh` with body `{ rt: refreshToken }`. Response shape: `{ error: 0, data: { at: newAccessToken, rt: newRefreshToken } }`.

### Fix

Add a `refreshAccessToken` helper to [`_shared/integrations/ewelinkAuth.ts`](../../supabase/functions/_shared/integrations/ewelinkAuth.ts) and a "401-retry" wrapper that:
1. Calls the eWeLink API with the current access token.
2. If the response surfaces an "access token expired" error (eWeLink error codes 401 / 402 / specific msg substrings), call `/v2/user/refresh` with the stored refresh token.
3. Re-encrypt + persist the new pair to `integrations.credentials_encrypted` so subsequent calls use the fresh token.
4. Retry the original request once with the new access token.
5. If refresh ALSO fails (e.g. refresh token expired — typically 30 days), return a clear error to the client like "eWeLink session has expired — please reconnect in Integrations" so the user knows to re-OAuth instead of seeing a cryptic edge-function message.

Apply the wrapper to both:
- `integrations-ewelink-state` (read valve state)
- `integrations-ewelink-control` (open / close valve)

### Files I'll change

| File | Change |
|---|---|
| `supabase/functions/_shared/integrations/ewelinkAuth.ts` | Add `refreshAccessToken(appId, appSecret, refreshToken, apiBase)` + `withTokenRefresh(db, integrationId, appId, appSecret, apiBase, fn)` helper |
| `supabase/functions/integrations-ewelink-state/index.ts` | Wrap the fetch in `withTokenRefresh`; surface "please reconnect" message on terminal failure |
| `supabase/functions/integrations-ewelink-control/index.ts` | Same wrapper applied |

### Risks

- Race condition if two requests refresh concurrently — both write to `credentials_encrypted`, last write wins (token IDs are equivalent). Acceptable for the valve panel (single user, sequential).
- The eWeLink refresh endpoint hostname differs by region — must thread `apiBase` through the helper.
- Refresh tokens themselves expire (~30 days per eWeLink docs). We can't auto-recover from that; the user has to re-OAuth. Surface that distinction in the error message.

---

## Bug 2 — Dashboard Today's Tasks ignores `next_check_at` snooze on harvest

### What I found

[`HomeDashboard.tsx:423`](../../src/components/HomeDashboard.tsx#L423) renders `<TaskList homeId={homeId} />` with no `dateStr` override → it defaults to today.

[`TaskList.tsx:154-186`](../../src/components/TaskList.tsx#L154-L186) calls `TaskEngine.fetchTasksWithGhosts` and applies a `filterAndSort` that filters by area / location / type — but **not** by `next_check_at` or `window_end_date`.

[`taskEngine.ts:316-324`](../../src/lib/taskEngine.ts#L316-L324) explicitly documents that snooze suppression is the consumer's job:

> "Consumers that need to suppress snoozed tasks from a task-action view (the dashboard's "1 overdue" counter, the home-nav badge, the today-focus card) filter on `next_check_at` themselves so the badge counts stay clean."

The Calendar gets this right at [`TaskCalendar.tsx:193-205`](../../src/components/TaskCalendar.tsx#L193-L205):

```ts
if (t.window_end_date && t.due_date) {
  const effectiveStart =
    t.next_check_at && t.next_check_at > t.due_date
      ? t.next_check_at
      : t.due_date;
  return effectiveStart <= dateStr && dateStr <= t.window_end_date;
}
// Non-window task: a future next_check_at means we hide it
if (t.next_check_at && t.next_check_at > dateStr) return false;
return t.due_date === dateStr;
```

`TaskList` needs the same gate when rendering for a specific `dateStr` (today in the dashboard case).

### Fix

In `TaskList.tsx`'s `filterAndSort`, add (before the existing area/location/type filters):

```ts
// Wave 20+ snooze / window gate — mirrors TaskCalendar so the
// dashboard's Today list, the home badge counter, and the agenda
// all agree on whether a task is "due today".
next = next.filter((t) => {
  // Skipped/Completed tasks aren't user-actionable in this view.
  if (t.status === "Skipped") return false;
  // Harvest-window task: visible from effective-start through window end.
  if (t.window_end_date && t.due_date) {
    const effectiveStart =
      t.next_check_at && t.next_check_at > t.due_date
        ? t.next_check_at
        : t.due_date;
    return effectiveStart <= dateStr && dateStr <= t.window_end_date;
  }
  // Non-window task with a future snooze: hide until the snooze date.
  if (t.next_check_at && t.next_check_at > dateStr) return false;
  // Standard case: include if due ≤ today (covers overdue from prior days).
  return t.due_date <= dateStr;
});
```

The `t.due_date <= dateStr` shape mirrors the engine's `includeOverdue` semantic so genuine overdue tasks still appear (just snoozed ones don't).

### Files I'll change

| File | Change |
|---|---|
| `src/components/TaskList.tsx` | Add the snooze/window gate inside `filterAndSort` |

### Risks

- The same `TaskList` is used by other surfaces (e.g. `/tasks`, location-scoped task views). Adding the snooze gate means snoozed tasks won't appear *anywhere* on a date that's before `next_check_at`. That's the intended behaviour per the engine's own comment — but I'll grep the call sites to confirm none rely on seeing snoozed tasks on the current date.

---

## Bug 3 — Shed plant detail "1 overdue task" counts snoozed/in-window tasks

### What I found

[`PlantEditModal.tsx:386-415`](../../src/components/PlantEditModal.tsx#L386-L415):

```ts
const { data: tasks } = await supabase
  .from("tasks")
  .select("id, due_date")
  .overlaps("inventory_item_ids", instanceIds)
  .neq("status", "Completed")
  .neq("status", "Skipped");

const overdueTasks = tasks.filter((t) => t.due_date < todayStr).length;
```

This selects `id, due_date` only — `next_check_at` and `window_end_date` aren't even in the SELECT, so they can't be respected. Any task whose `due_date < today` is counted as "overdue", which is wrong for:

- A harvest task whose `due_date` is in the past but `window_end_date` is still in the future and the task is still "in window".
- A task the user already snoozed forward (`next_check_at > today`).

The user's strawberries case fits this exactly — past harvest tasks that were "Not yet"'d into the future stay in this overdue count.

### Fix

Update the SELECT + filter to mirror the calendar logic:

```ts
const { data: tasks } = await supabase
  .from("tasks")
  .select("id, due_date, window_end_date, next_check_at, status")
  .overlaps("inventory_item_ids", instanceIds)
  .neq("status", "Completed")
  .neq("status", "Skipped");

const overdueTasks = (tasks ?? []).filter((t) => {
  // Harvest still inside its window — not overdue, just "ready".
  if (t.window_end_date && t.due_date) {
    const effectiveStart =
      t.next_check_at && t.next_check_at > t.due_date
        ? t.next_check_at
        : t.due_date;
    return t.window_end_date < todayStr && effectiveStart < todayStr;
  }
  // Snoozed task — its effective due date is next_check_at.
  if (t.next_check_at && t.next_check_at >= todayStr) return false;
  return t.due_date < todayStr;
}).length;
```

### Files I'll change

| File | Change |
|---|---|
| `src/components/PlantEditModal.tsx` | Extend the tasks SELECT + replace the overdue filter with the snooze/window-aware version |

### Risks

- Low. The query is read-only and only feeds the at-a-glance strip.

---

## Cross-cutting test coverage

| Test | Tier | Why |
|---|---|---|
| `tests/unit/lib/taskSnoozeFilter.test.ts` (new, small) | Vitest | Extract the snooze/window-aware filter into a tiny `lib/taskFilters.ts` helper and unit-test the four cases (non-window past due, non-window snoozed, window in-progress, window expired). Both `TaskList` and `PlantEditModal` then call this helper — single source of truth, parity with calendar guaranteed. |
| `tests/e2e/specs/calendar-window.spec.ts` | Playwright (existing) | Already covers calendar-side snooze behaviour. Will rerun to confirm no regression. |
| E2E for dashboard snooze-hides-today (Section 02) | Playwright (new — small) | Add one row asserting that a harvest task with `next_check_at > today` is NOT visible in the Dashboard's Today's Tasks list. |

The shared filter helper is the right call here — having two places copy the calendar's exact logic invites drift the moment Wave 23 changes the snooze contract.

---

## Out of scope (deferred)

- Auto-detecting expired eWeLink refresh tokens proactively (cron) — for now we surface the "please reconnect" message reactively.
- Today Focus Card on the dashboard. The engine comment lists it as another consumer that "filters on next_check_at themselves" — worth a follow-up check, but the user didn't flag it.
- Home nav badge counter. Same theme — covered by the shared helper if it adopts it.

## Acceptance

- All three bugs fixed in their respective files.
- `npx tsc --noEmit` + `npm run build` clean.
- New Vitest passes; existing E2E `calendar-window.spec.ts` still green.
- New E2E row asserting dashboard hides snoozed-forward harvest passes.
- One commit per bug (3 commits) OR one combined commit — happy with either, default to one combined commit so the shared filter helper lands atomically.
- Release notes entry covering all three.

## App-reference files to update

- [`docs/app-reference/02-dashboard/01-dashboard-tab.md`](../app-reference/02-dashboard/01-dashboard-tab.md) — note that the Today's Tasks list now uses the shared snooze/window filter
- [`docs/app-reference/07-management/05-integrations-devices.md`](../app-reference/07-management/05-integrations-devices.md) — mention the eWeLink token-refresh contract
- [`docs/app-reference/03-garden-hub/`] plant detail file (whichever covers PlantEditModal's glance strip) — note that the overdue count honours snooze/window
