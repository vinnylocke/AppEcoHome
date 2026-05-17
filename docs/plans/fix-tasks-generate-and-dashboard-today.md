# Plan — Fix generate-tasks window + dashboard "no tasks today"

## Two separate bugs

---

### Bug 1: generate-tasks window too narrow

**Root cause**: `generate-tasks` materialises through the end of the *current UTC week* (Sunday). When run on a Saturday, `daysToSunday = 1`, so `maxDate = tomorrow`. A blueprint with `freq=7` and `lastTask.due_date = May 10` generates only `May 17` — nothing more. A blueprint with `freq=2` generates `May 17, May 19` — then stops. The user expected ~7 days of tasks but got 1–2.

**Fix**: Change `maxDate` from "end of current UTC week" to "today + 7 days". This guarantees at least a full week of tasks regardless of which day the function runs.

```diff
- const dayOfWeek = now.getUTCDay();
- const daysToSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
- const sunday = new Date(now);
- sunday.setUTCDate(now.getUTCDate() + daysToSunday);
- const maxDate = parseSafeDate(sunday.toISOString().split("T")[0]);
+ const sevenDaysAhead = new Date(now);
+ sevenDaysAhead.setUTCDate(now.getUTCDate() + 7);
+ const maxDate = parseSafeDate(sevenDaysAhead.toISOString().split("T")[0]);
```

**File**: `supabase/functions/generate-tasks/index.ts`

---

### Bug 2: Dashboard "no tasks today" — timezone bug in week bounds

**Root cause**: `getLocalWeekBounds()` in `useHomeDashboardStats.ts` calls `sunday.toISOString()` and `todayMidnight.toISOString().slice(0, 10)`, both of which return *UTC* dates. In BST (UTC+1), midnight local = 23:00 UTC the previous day. So:

- `weekStart = "2026-05-16T23:00:00.000Z"` (correct for DB query, but…)
- `today = "2026-05-16T23:00:00.000Z".slice(0, 10) = "2026-05-16"` ← WRONG (actual local date is May 17)

In `home-dashboard-stats`, the day strip iterates from `new Date(weekStart)`:
```javascript
const stripDay = new Date("2026-05-16T23:00:00Z"); // UTC midnight of May 16 23:00
ds = "2026-05-16" // ← First day shown is Saturday May 16 (yesterday)
isToday: "2026-05-16" === "2026-05-16" // ← May 16 marked as "today"
```

Tasks for May 17 (actual today) are physically in the DB but appear in the strip on `ds = "2026-05-17"`, which is rendered as a *future* day. The cell marked "today" (May 16) has 0 tasks because tasks for that UTC day aren't in the week range. **This is why the dashboard shows "no tasks today."**

**Fix**: Return local YYYY-MM-DD date strings from `getLocalWeekBounds` instead of ISO timestamps. Date strings compare correctly with the `due_date` date column in Postgres, and the day strip's UTC iteration becomes exact.

```diff
function getLocalWeekBounds() {
  const now = new Date();
  const dayOfWeek = now.getDay();
+ const localDate = (d: Date) =>
+   `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  
  const sunday = new Date(now);
  sunday.setHours(0, 0, 0, 0);
  sunday.setDate(sunday.getDate() - dayOfWeek);
  
  const saturday = new Date(sunday);
  saturday.setDate(saturday.getDate() + 6);
  saturday.setHours(23, 59, 59, 999);
  
  const todayMidnight = new Date(now);
  todayMidnight.setHours(0, 0, 0, 0);
  
  return {
-   weekStart: sunday.toISOString(),
-   weekEnd: saturday.toISOString(),
-   today: todayMidnight.toISOString().slice(0, 10),
+   weekStart: localDate(sunday),
+   weekEnd: localDate(saturday),
+   today: localDate(todayMidnight),
  };
}
```

**File**: `src/hooks/useHomeDashboardStats.ts`

No changes needed in `home-dashboard-stats` edge function — its day strip and task queries already work correctly when fed date strings.

---

## Files changed
| File | Change |
|------|--------|
| `supabase/functions/generate-tasks/index.ts` | `maxDate` = today + 7 days |
| `src/hooks/useHomeDashboardStats.ts` | Return local date strings from `getLocalWeekBounds` |

## Deploy
`npm run deploy -- --bump 2` (2 files changed)
