-- Server-side notification preferences.
--
-- Until now `rhozly_notif_prefs` lived purely in localStorage on the
-- client. The Notifications tab showed toggles but the daily push +
-- weekly email crons fan-out to every member regardless. That's been
-- documented as "coming-soon" for several waves; this migration lands
-- the column so the edge functions can finally respect mutes.
--
-- Shape (all booleans default true; new keys = old prefs were on):
--   {
--     "master":         true,
--     "watering":       true,
--     "harvesting":     true,
--     "pruning":        true,
--     "weatherAlerts":  true,
--     "goldenHour":     true,
--     "optimiseDigest": true,
--     "weeklyOverview": true,
--     "betaPrompts":    true,
--     "digestStyle":    "combined"   -- "combined" | "per_home"
--   }
--
-- The edge functions treat missing keys + missing column entirely as
-- "send" — opt-in for the existing user base is via the client writing
-- on next toggle change. New signups get DEFAULT '{}', also "send".

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS notification_prefs jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.user_profiles.notification_prefs IS
  'Server-side mirror of the Notifications tab. Empty object = send everything (back-compat). Categories: master, watering, harvesting, pruning, weatherAlerts, goldenHour, optimiseDigest, weeklyOverview, betaPrompts (booleans). digestStyle: "combined" | "per_home" controls how the weekly email handles multi-home members.';
