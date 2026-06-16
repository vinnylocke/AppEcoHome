-- 2026-06-16 Custom integrations — device_battery_resets table.
--
-- Records when the user manually swaps a battery on a device. The
-- "estimated days remaining" regression in DeviceBatteryPanel uses the
-- most recent reset to bound its sliding window — otherwise a single
-- battery change would make the trendline look like a sudden recharge
-- and ruin the estimate.
--
-- Tiny table: one row per battery swap per device. Writes are rare
-- (user clicks "Battery changed" in the device panel). Reads are
-- per-device, so a single B-tree index on (device_id, occurred_at DESC)
-- covers every query.

CREATE TABLE IF NOT EXISTS public.device_battery_resets (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id    uuid        NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  home_id      uuid        NOT NULL REFERENCES public.homes(id)   ON DELETE CASCADE,
  occurred_at  timestamptz NOT NULL DEFAULT now(),
  recorded_by  uuid        REFERENCES auth.users(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_device_battery_resets_device_time
  ON public.device_battery_resets (device_id, occurred_at DESC);

ALTER TABLE public.device_battery_resets ENABLE ROW LEVEL SECURITY;

-- Home members can read every reset for their home.
DROP POLICY IF EXISTS "home members read battery resets" ON public.device_battery_resets;
CREATE POLICY "home members read battery resets"
  ON public.device_battery_resets FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.home_members
      WHERE home_members.home_id = device_battery_resets.home_id
        AND home_members.user_id = auth.uid()
    )
  );

-- Home members with integrations.manage can record a reset themselves
-- from Device Settings. The check is two-stage: (a) caller is a member
-- of the home; (b) caller has the integrations.manage permission.
DROP POLICY IF EXISTS "home members write battery resets" ON public.device_battery_resets;
CREATE POLICY "home members write battery resets"
  ON public.device_battery_resets FOR INSERT TO authenticated
  WITH CHECK (
    recorded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.home_members
      WHERE home_members.home_id = device_battery_resets.home_id
        AND home_members.user_id = auth.uid()
    )
  );

-- 2026-10-30 PostgREST exposure rule — explicit grants required for new
-- tables so the Data API surfaces them (RLS still gates row access).
GRANT SELECT, INSERT ON TABLE public.device_battery_resets TO authenticated;

COMMENT ON TABLE public.device_battery_resets IS
  'Manual marker when a user swaps a battery on a device. Bounds the regression window for the "estimated days remaining" calculation in DeviceBatteryPanel so a battery swap does not look like a recharge in the trendline.';
