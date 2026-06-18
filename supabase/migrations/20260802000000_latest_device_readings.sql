-- ============================================================
-- latest_device_readings(home_id) — newest reading per device (2026-06-18)
--
-- Powers the live metric/state chips on DeviceCard so users see moisture /
-- temp / EC / valve state without opening the detail modal. Read-only.
--
-- SECURITY INVOKER (default) so the existing device_readings RLS
-- ("home members read readings") gates the rows — the p_home_id arg plus RLS
-- together ensure a caller only ever sees their own homes' readings.
-- ============================================================

CREATE OR REPLACE FUNCTION public.latest_device_readings(p_home_id uuid)
RETURNS TABLE (device_id uuid, recorded_at timestamptz, data jsonb)
LANGUAGE sql
STABLE
AS $$
  SELECT DISTINCT ON (dr.device_id) dr.device_id, dr.recorded_at, dr.data
  FROM public.device_readings dr
  WHERE dr.home_id = p_home_id
  ORDER BY dr.device_id, dr.recorded_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.latest_device_readings(uuid) TO authenticated;
