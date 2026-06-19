-- Fire device push when a notification row is created (2026-06-19).
--
-- Diagnosis: the in-app `notifications` rows were being created by
-- `daily-batch-notifications` (and others), but the device push never arrived.
-- The `notifications` INSERT → `push-webhook` link was a dashboard-configured
-- Database Webhook that is missing/disabled on prod and was never codified, so
-- it could (and did) silently vanish. This trigger version-controls that link.
--
-- Auth: we pass the PUBLISHABLE (anon) key as the Bearer token — it's public
-- (already embedded in the existing cron migrations + the client bundle) and is
-- accepted by `verify_jwt = true` functions, so `push-webhook` needs no change
-- and no secret lands in git. `push-webhook` reads `payload.record.{id,user_id,
-- title,body,data}`, all supplied by `to_jsonb(NEW)`.

CREATE OR REPLACE FUNCTION public.notify_push_on_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Fire-and-forget via pg_net. Never let a push hiccup roll back the in-app
  -- notification insert — the bell must always win.
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
