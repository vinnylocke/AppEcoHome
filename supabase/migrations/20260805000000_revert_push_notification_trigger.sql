-- Revert 20260804000000_push_notification_trigger.sql (2026-06-19).
--
-- That migration added an AFTER INSERT trigger on `notifications` to call
-- `push-webhook`, on the assumption that no such link existed. It turned out a
-- pre-existing **dashboard-configured Database Webhook** ("Trigger Push
-- Notification", via `supabase_functions.http_request`) was already firing
-- push-webhook on every insert — so the added trigger produced DUPLICATE pushes
-- (confirmed: the reporting user received the test notification twice).
--
-- Drop the added trigger + function. The dashboard webhook remains the single
-- delivery mechanism. (The original "no morning push" was therefore not a
-- missing trigger — most likely a one-off delivery/notice issue.)

DROP TRIGGER IF EXISTS push_on_notification_insert ON public.notifications;
DROP FUNCTION IF EXISTS public.notify_push_on_notification();
