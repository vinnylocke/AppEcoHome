# Fix: device push not firing for notifications (missing INSERT trigger)

**Feedback:** *"I'm not getting pending task notifications — pretty sure I have 1 today and didn't get a notification."*

## Diagnosis (confirmed against production, 2026-06-19)

Read-only check of the reporting user's prod account showed **everything works except the final delivery hop**:

| Check | Result |
|-------|--------|
| `daily-batch-notifications` cron ran | ✅ `daily_batch` "🌿 Good Morning!" row created today 08:00 UTC (visible in the in-app bell) |
| Task qualifies | ✅ "Summer Watering" (Watering, due today), not snoozed |
| Prefs | ✅ `master:true`, `watering:true` — nothing muted |
| Device token | ✅ 1 Android token in `user_devices`, last used today |

A **manual invoke of `push-webhook`** for the user returned `{success:true, count:1}` and the **test push arrived on the device** — so the function, Firebase creds, and token are all healthy.

**Root cause:** the `notifications` INSERT → `push-webhook` **Database Webhook is not firing on production**. There is **no migration** wiring it (it was dashboard-configured and is missing/disabled), so the in-app row is created but the device push is never sent. This affects **every** push type (daily reminders, golden hour, weekly overview, automations), not just task reminders.

## App-reference consulted

- [99-cross-cutting/12-notifications.md](../app-reference/99-cross-cutting/12-notifications.md) — three channels; "insert into notifications triggers our push webhook" (the webhook this plan codifies).
- [99-cross-cutting/10-edge-functions-catalogue.md](../app-reference/99-cross-cutting/10-edge-functions-catalogue.md) — `push-webhook` entry.
- [99-cross-cutting/11-cron-jobs.md](../app-reference/99-cross-cutting/11-cron-jobs.md) — the `net.http_post` + publishable-key pattern the existing crons use.

## Approach — codify the webhook as a SQL trigger (no secret, no redeploy)

A version-controlled `AFTER INSERT` trigger on `public.notifications` that calls `push-webhook` via `pg_net`, mirroring the body shape the function expects (`{ record: <row> }`) and the **established auth pattern**: pass the **publishable (anon) key** as `Authorization: Bearer …`. That key is public (already embedded in 5+ existing cron migrations and the client bundle) and is proven to satisfy `verify_jwt = true` functions (pattern-scan, weekly-digest, etc. are called exactly this way). So:

- **No secret in git** (publishable key only).
- **No change to `push-webhook`** (stays `verify_jwt = true`, code untouched).
- **DB-only** — ships via `supabase db push`; no Vercel build, no edge-function redeploy.

```sql
CREATE OR REPLACE FUNCTION public.notify_push_on_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  -- Fire-and-forget; never let a push hiccup block the in-app notification insert.
  BEGIN
    PERFORM net.http_post(
      url     := 'https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/push-webhook',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer sb_publishable_HDBdrlKd8HMPHto0E6i5QA_nbIPe-3K'
      ),
      body    := jsonb_build_object('record', to_jsonb(NEW))
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'push fan-out failed for notification %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS push_on_notification_insert ON public.notifications;
CREATE TRIGGER push_on_notification_insert
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.notify_push_on_notification();
```

`push-webhook` reads `payload.record.{id,user_id,title,body,data}`; `to_jsonb(NEW)` supplies all of them.

## Files changing

| File | Change |
|------|--------|
| `supabase/migrations/<ts>_push_notification_trigger.sql` | New — trigger fn + trigger (above). |

## Verification

1. `supabase migration up` locally (applies trigger; safe — additive).
2. After `supabase db push` to prod: insert one test `notifications` row for the reporting user (or wait for the 08:00 batch) and confirm the device push arrives. (Re-running today's batch won't re-fire — the `alreadySent` guard — so a direct test-row insert is the immediate check.)
3. The existing `supabase/tests/notificationFilters.test.ts` still covers the *which-tasks* logic; the trigger itself is SQL (not covered by the TS/Deno tiers — verified manually as above).

## Risks / edge cases

- **Duplicate pushes** if a (broken) dashboard webhook still exists and later starts working. Current state is zero pushes, so no duplication today; if duplicates appear after deploy, delete the stale dashboard webhook. Note in the notifications reference.
- **Local inserts hit the prod URL** (hardcoded prod ref, same as every existing cron migration). Acceptable + consistent; local rarely inserts notifications.
- **Batch inserts** (daily-batch inserts one row per member) fire one `net.http_post` each — intended, async via pg_net.

## App-reference to update

- [99-cross-cutting/12-notifications.md](../app-reference/99-cross-cutting/12-notifications.md) — document the codified `push_on_notification_insert` trigger as the delivery mechanism (replacing the implicit "dashboard webhook" assumption); add the duplicate-webhook note.
- [99-cross-cutting/10-edge-functions-catalogue.md](../app-reference/99-cross-cutting/10-edge-functions-catalogue.md) — `push-webhook` "invoked by" = the notifications-insert trigger.

## OUTCOME (2026-06-19) — reverted; diagnosis was partly wrong

After deploying the trigger (`20260804000000`) and inserting a test notification row, the reporting user received the push **twice**. A `supabase db dump` of prod revealed a **pre-existing dashboard Database Webhook** `"Trigger Push Notification"` (via `supabase_functions.http_request`) already firing `push-webhook` on every `notifications` insert. So the trigger was **not missing** — the added trigger merely duplicated the existing one.

**Resolution:** reverted the added trigger + function (`20260805000000`); the dashboard webhook remains the single delivery mechanism. The original "no morning push" was therefore most likely a one-off delivery/notice issue, not a missing trigger.

**Lasting value of this investigation:** the previously-undocumented dashboard webhook is now documented in [Notifications](../app-reference/99-cross-cutting/12-notifications.md) + [Edge Functions Catalogue](../app-reference/99-cross-cutting/10-edge-functions-catalogue.md), including the fragility that it's **not in version control** (deleting it in the dashboard silently kills all push). The manual `push-webhook` invoke is recorded there as a delivery test.

**Lesson:** before codifying an assumed-missing webhook/trigger, dump the remote schema first (`supabase db dump --schema public`) to check what already exists.

## Out of scope (separate follow-up)

The once-daily **08:00 UTC** batch is the only reminder source — no real-time/at-due-time push and no second daily pass. Worth a later enhancement (per-user reminder time, or notify at the task's due time), but not required to fix the reported "no push at all" bug.
