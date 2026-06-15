# Weekly email duplicates + snooze-aware notifications + email UX

Three user-reported issues from live usage — one email-pipeline bug, two UX improvements on the same email, and a third bug that's the same Wave 20 snooze contract gap I fixed for the dashboard last week, just on the server-side push notification pipeline this time.

## App-reference files consulted

- [`docs/app-reference/99-cross-cutting/11-cron-jobs.md`](../app-reference/99-cross-cutting/11-cron-jobs.md) — confirms `weekly-digest` cron is the single source of the Monday email
- [`docs/app-reference/99-cross-cutting/12-notifications.md`](../app-reference/99-cross-cutting/12-notifications.md) — confirms `daily-batch-notifications` is the push pipeline; documented pseudocode is "fetch today's pending tasks" with no snooze awareness
- [`docs/app-reference/02-dashboard/01-dashboard-tab.md`](../app-reference/02-dashboard/01-dashboard-tab.md) — Today's Tasks contract (the dashboard-side snooze handling we fixed in 22.0040)
- [`docs/app-reference/06-account/02-notifications-tab.md`](../app-reference/06-account/02-notifications-tab.md) — the toggles a user can flip to opt out of categories

---

## Bug 1 — Weekly email arrives twice

### Root cause

[`supabase/functions/weekly-digest/index.ts:234-348`](../../supabase/functions/weekly-digest/index.ts#L234-L348) — the function structure is:

```
for each home in homes:
  for each member of that home:
    send email
```

A user who is a member of TWO homes (e.g. their own home + a shared family home, or two homes they set up while testing) gets the email **once per home**. The email goes to the same `member.email` address with the same subject `🌿 Your week in the garden — {DATE}`, so it looks like a duplicate even though it's technically two distinct emails about two distinct homes.

There's no recipient-level dedup. The cron schedule (`'0 8 * * 1'` Monday 8am UTC) only fires once per week — verified by reading both [`20260510100000_weekly_digest_cron.sql`](../../supabase/migrations/20260510100000_weekly_digest_cron.sql) and [`20260608134343_cron_extend_all_pg_net_timeouts.sql`](../../supabase/migrations/20260608134343_cron_extend_all_pg_net_timeouts.sql). `cron.schedule()` by name UPSERTS so the migrations re-applying don't create duplicate cron rows. Pg_net is fire-and-forget — no retries.

### Fix

Pivot the loop. Build a `recipientsByEmail` map first, then send one email per recipient that lists every home they're a member of in a single message.

```ts
// Pseudo:
const recipientsByEmail = new Map<string, {
  displayName: string;
  homes: Array<{ name: string; forecast, alerts, tasks }>;
}>();

for (home of homes) {
  const { members, forecast, alerts, tasks } = await collectHomeData(home);
  for (const member of members) {
    const existing = recipientsByEmail.get(member.email);
    if (existing) {
      existing.homes.push({ name: home.name, forecast, alerts, tasks });
    } else {
      recipientsByEmail.set(member.email, {
        displayName: member.display_name ?? member.email.split("@")[0],
        homes: [{ name: home.name, forecast, alerts, tasks }],
      });
    }
  }
}

for (const [email, payload] of recipientsByEmail) {
  await sendEmail({ to: email, subject, html: buildEmail(payload) });
}
```

For 99% of users, `payload.homes.length === 1` and the email looks like today. For the multi-home case the template gets a small per-home section divider with the home's name + its own weather/alerts/tasks.

### Risks

- A user who explicitly wants TWO emails (because the homes are very different, e.g. allotment + house) will see one combined email instead. Small UX preference change — acceptable.

---

## Bug 2 — Email UX (weather doesn't fit, no task links)

### What's wrong

**Weather strip** ([`weekly-digest/index.ts:167-179`](../../supabase/functions/weekly-digest/index.ts#L167-L179)):

```html
<div style="overflow-x:auto;">
  <table ...>
    <tr>${weatherRows}</tr>  <!-- 7 cells of min-width:64px each -->
  </table>
</div>
```

7 cells × 64px = 448px minimum width. Most email clients render at ~320–400px (especially mobile Gmail/Apple Mail), and `overflow-x:auto` doesn't actually scroll in email clients — they just clip. Result: user sees 3-5 days, the rest gets cut.

**Tasks list** ([`weekly-digest/index.ts:124-141`](../../supabase/functions/weekly-digest/index.ts#L124-L141)):

```html
<div ...>
  <span ...>${formatDate(due_date)}</span>
  <span ...>${task.title}</span>
</div>
```

Tasks are plain `<span>`s — nothing clickable. To act on a task the user has to open the app and find it manually.

### Fix

**Weather strip** — switch from a 7-column horizontal table to a 7-row vertical compact strip:

```
☀️  Mon 15 Jun        22° / 12°
🌧️  Tue 16 Jun        18° / 10°
🌤️  Wed 17 Jun        20° / 11°
...
```

One row per day, full-width (~520px container), readable on mobile. Trades horizontal density for vertical density — every day is now visible.

**Tasks list** — wrap each task in an `<a>` linking to the Calendar agenda for that day:

```html
<a href="${SITE_URL}/dashboard?view=calendar&date=${due_date}" style="...">
  <span ...>${formatDate(due_date)}</span>
  <span ...>${task.title} →</span>
</a>
```

The Calendar agenda surface already supports `?date=YYYY-MM-DD` to land on a specific day — verified by `TaskCalendar.tsx` URL-param effect. So clicking a task lands the user on the right day with the task visible in the agenda.

While I'm in the template, also add a small "View week →" link near the weather strip pointing at `/weekly` (the in-app weekly overview surface).

### Risks

- Vertical weather strip is slightly taller than the current grid (7 rows vs 1). Worth it because right now it doesn't render at all on mobile.
- Tracking-pixel-shy email clients might strip query parameters. Modern clients (Gmail, Apple Mail, Outlook) all preserve them.

---

## Bug 3 — Snoozed harvest task still triggered a notification

### Root cause

Same root cause as 22.0040/22.0043 but on the server-side push pipeline.

[`supabase/functions/daily-batch-notifications/index.ts:30`](../../supabase/functions/daily-batch-notifications/index.ts#L30):

```ts
supabase
  .from("tasks")
  .select("id, home_id, title")           // ← no next_check_at, no window_end_date
  .eq("status", "Pending")
  .lte("due_date", today),                // ← only looks at the original due_date
```

A harvest task the user snoozed with "Not yet → N days" keeps `status = 'Pending'` and keeps its original `due_date`; the snooze moves `next_check_at` forward. This query sees `due_date <= today` and fires the notification anyway.

### Fix

Match the client-side `lib/taskFilters.ts` contract — exclude tasks whose effective due date (snooze-aware) is in the future:

```ts
.select("id, home_id, title, due_date, next_check_at, window_end_date, type")
.eq("status", "Pending")
.lte("due_date", today)
.or(`next_check_at.is.null,next_check_at.lte.${today}`)
```

Plus an in-memory pass after the query to also drop harvest tasks whose `window_end_date < today` (window closed without the user actioning it — would currently re-notify forever):

```ts
const actionableTasks = (pendingTasks ?? []).filter((t: any) => {
  // Harvest window task: only notify while inside the window.
  if (t.window_end_date && t.due_date) {
    const effectiveStart = t.next_check_at && t.next_check_at > t.due_date
      ? t.next_check_at
      : t.due_date;
    return effectiveStart <= today && today <= t.window_end_date;
  }
  // Non-window: snooze already handled by the SQL `.or`, just include.
  return true;
});
```

Mirrors `src/lib/taskFilters.ts` `isTaskVisibleOnDate` exactly — the server-side reasoning and the client-side reasoning agree.

### Risks

- Low. The query change is additive (excludes rows that shouldn't have been notified).
- I'll add a Deno test (under `supabase/tests/`) that exercises the filter shape with seed task fixtures so the contract is regression-protected.

---

## Files I'll change

| File | Change |
|---|---|
| `supabase/functions/weekly-digest/index.ts` | Pivot recipient loop + new multi-home email template (one email per recipient, sections per home) + vertical weather strip + clickable task links |
| `supabase/functions/daily-batch-notifications/index.ts` | Add `next_check_at` + `window_end_date` to SELECT; add SQL `.or` clause; add in-memory harvest-window filter |
| `supabase/tests/dailyBatchNotificationsFilter.test.ts` (new) | Deno test covering the snooze + window filter contract (mirror of `tests/unit/lib/taskFilters.test.ts`) |
| `docs/app-reference/99-cross-cutting/12-notifications.md` | Update the `daily-batch-notifications` pseudocode to reflect the snooze/window awareness |
| `docs/app-reference/99-cross-cutting/11-cron-jobs.md` | Note the recipient-level dedup behaviour of `weekly-digest` |

## Test coverage

| Tier | Test |
|---|---|
| Deno (new) | `dailyBatchNotificationsFilter.test.ts` — 6 cases mirroring the Vitest cases for `taskFilters.ts` |
| Vitest | No new tests — existing `taskFilters.test.ts` already covers the client-side contract |
| Playwright | Not adding — the email/push surface is server-side and the integration test would require a Resend mock + push delivery mock for marginal value |

## Acceptance

- `npm run test:functions` (Deno) clean with new test passing
- `npm run build` clean
- One commit per bug, OR one combined commit — happy with either
- Deploy via `npm run deploy` (edge functions get pushed automatically)
- Release notes entry covering all three

## Out of scope

- Adding a per-user "send me one email per home / send me one combined email" preference — sticking with the combined-email behaviour for everyone for now. Can be added later if anyone complains.
- Push-pipeline opt-in respect for per-category mute flags — that's a separate concern documented in [`06-account/02-notifications-tab.md`](../app-reference/06-account/02-notifications-tab.md) and the current code does already check it for non-harvest cases. The snooze filter is orthogonal.
- Surfacing the snooze fix into `weekly-digest` — the digest already only shows the next week's pending tasks (`due_date >= monday && <= sunday`), so a task snoozed past the week boundary doesn't appear. Snooze cases _within_ the week do leak through and should also be filtered. I'll do this in the same `weekly-digest` change since I'm in there anyway.

## App-reference files to update

- [`docs/app-reference/99-cross-cutting/12-notifications.md`](../app-reference/99-cross-cutting/12-notifications.md) — snooze-awareness on the daily-batch pseudocode + recipient dedup note on weekly-digest
- [`docs/app-reference/99-cross-cutting/11-cron-jobs.md`](../app-reference/99-cross-cutting/11-cron-jobs.md) — same notes referenced in the cron table

Reply **"go ahead"** and I'll ship all three. Or split (e.g. snooze fix is the most urgent — it's a daily push annoyance — and the weekly email changes can wait if you'd rather see the snooze fix today).
