-- 2026-06-16 Custom integrations — battery level on devices + provider
-- constraint fix.
--
-- Three changes in this migration:
--
-- 1. Widen integrations.provider CHECK to allow 'custom_http'. The
--    original constraint (20260521000000_integrations.sql) only allowed
--    'ecowitt' and 'ewelink'; the Phase 3 deploy added the custom_http
--    adapter but didn't widen the constraint, so the adapter-connect
--    dispatcher would have been rejected by the DB. Fixing that here.
--
-- 2. Add battery_percent + battery_reported_at columns on devices for
--    fast "current state" lookups (powers the battery health pip on
--    DeviceCard without per-card history queries). The webhook router
--    updates these whenever an incoming reading carries a battery_percent
--    field.
--
-- 3. battery_percent also rides inside device_readings.data (the
--    existing jsonb column) so the sparkline + days-remaining helper
--    have a time-series to chart. No schema change needed on
--    device_readings — the family-typed jsonb already carries
--    family-specific fields.

-- ── 1. integrations.provider constraint ──────────────────────────────
ALTER TABLE public.integrations
  DROP CONSTRAINT IF EXISTS integrations_provider_check;

ALTER TABLE public.integrations
  ADD CONSTRAINT integrations_provider_check
  CHECK (provider IN ('ecowitt', 'ewelink', 'custom_http'));

-- ── 2. devices battery columns ───────────────────────────────────────
ALTER TABLE public.devices
  ADD COLUMN IF NOT EXISTS battery_percent SMALLINT NULL
    CHECK (battery_percent IS NULL OR (battery_percent BETWEEN 0 AND 100)),
  ADD COLUMN IF NOT EXISTS battery_reported_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.devices.battery_percent IS
  'Most recent battery percentage reported by the device (0-100). NULL when the device has never reported one or does not have a battery. Updated by integrations-webhook-router on every webhook that carries battery_percent.';

COMMENT ON COLUMN public.devices.battery_reported_at IS
  'When battery_percent was last updated. Used by DeviceBatteryPanel to decide whether to show the pip as "current" or "stale".';
