# Plan — Integrations: RLS Fix, Modal Centering, Device Settings

## Three issues to fix

---

### Issue 1 — RLS error saving/updating devices

**Root cause:** The migration comment explicitly says "All writes go through edge functions using the service role key — no client-side INSERT/UPDATE/DELETE policies needed." But `Step5Confirm.tsx` does `supabase.from("devices").upsert(...)` and `DeviceSettingsModal.tsx` does `supabase.from("devices").update(...)` directly from the browser with the user's auth token. RLS blocks both because there are only SELECT policies.

**Fix:** Add INSERT and UPDATE policies for authenticated home members in a new migration.

```sql
CREATE POLICY "home members insert devices"
  ON devices FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM home_members
      WHERE home_members.home_id = devices.home_id
        AND home_members.user_id = auth.uid()
    )
  );

CREATE POLICY "home members update devices"
  ON devices FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM home_members
      WHERE home_members.home_id = devices.home_id
        AND home_members.user_id = auth.uid()
    )
  );
```

---

### Issue 2 — Wizard modal cut off on mobile

**Root cause:** All three modals (`ConnectDeviceWizard`, `DeviceDetailModal`, `DeviceSettingsModal`) use `items-end sm:items-center` — a bottom sheet on mobile. This gets cut off when the soft keyboard appears (keyboard pushes the sheet up in a broken way).

**Fix:** Change all three to `items-center` on all screen sizes. Round all corners (`rounded-3xl` instead of `rounded-t-3xl sm:rounded-3xl`). Keep `max-h-[90vh] overflow-y-auto`.

---

### Issue 3 — Device settings: location, area, home shutoff

**What's missing from `DeviceSettingsModal`:**
- Location dropdown (fetch `locations` for the home)
- Area dropdown (filtered to the selected location)
- Water valve only: "Whole home shutoff" checkbox — sets `metadata.is_home_shutoff = true` — lets the user flag this valve as the main home water cutoff so they can identify it instantly

No schema changes needed — `location_id`, `area_id` already exist on `devices`; `is_home_shutoff` goes in the existing `metadata` JSONB.

**DeviceSettingsModal changes:**
- On mount, fetch locations (`name, id`) for `device.home_id`
- When location changes, fetch areas (`name, id`) for that location
- Initialise selected location from `device.location_id`, area from `device.area_id`
- For water valves: checkbox "This valve controls the whole home's water supply" → `metadata.is_home_shutoff`
- `save()` includes `location_id` and `area_id` in the update payload

---

## Files changed

| File | Change |
|------|--------|
| `supabase/migrations/<timestamp>_device_rls_writes.sql` | New — INSERT + UPDATE policies |
| `src/components/integrations/ConnectDeviceWizard.tsx` | `items-center` + `rounded-3xl` on all sizes |
| `src/components/integrations/DeviceDetailModal.tsx` | Same modal centering fix |
| `src/components/integrations/DeviceSettingsModal.tsx` | Same centering + location/area/home-shutoff fields |
