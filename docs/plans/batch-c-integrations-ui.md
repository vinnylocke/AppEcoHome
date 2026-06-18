# Plan — Batch C: integrations UI (#6, #8, #2)

Three mostly-client UI items. Only #6 needs a tiny read-only migration (an RPC for
latest-reading-per-device).

## App-reference consulted

- [`07-management/05-integrations-devices.md`](../app-reference/07-management/05-integrations-devices.md)
- [`07-management/06-integrations-automations.md`](../app-reference/07-management/06-integrations-automations.md)
- [`99-cross-cutting/09-data-model-integrations.md`](../app-reference/99-cross-cutting/09-data-model-integrations.md)

## #8 — EC graph (smallest, no migration)

`integrations-readings-query`'s aggregation RPC already returns `soil_ec` and
`ReadingsBucket.soil_ec` exists — the data is already on the chart rows. `SoilChart`
(`HistoryChart.tsx`) renders Moisture + Soil-Temp blocks; **add a third `ChartBlock` for
`soil_ec`**, shown only when any row has a numeric `soil_ec`. Unit label from the
device's `ec_source` (calibrated → "EC (µS/cm)", raw → "EC (raw)"). Pass `ecSource`
into `HistoryChart` from `DeviceDetailModal` (already knows the device).
- Files: `HistoryChart.tsx` (+ `DeviceDetailModal.tsx` to pass `ecSource`).
- Test: Vitest on a tiny pure `hasSeries(rows, key)` helper (EC block hidden when no EC).

## #6 — Device cards: state + metric chips

Show the latest reading inline so users don't open the modal. Soil sensor → moisture %,
soil temp, EC (right unit) chips; valve → on/off state chip.

- **Migration** `…_latest_device_readings.sql`: a `SECURITY INVOKER` SQL function
  `latest_device_readings(p_home_id uuid) RETURNS TABLE(device_id uuid, recorded_at timestamptz, data jsonb)`
  using `DISTINCT ON (device_id) … ORDER BY device_id, recorded_at DESC` joined to
  `devices` (RLS on the underlying tables gates rows). `GRANT EXECUTE … TO authenticated`.
  Read-only; no table changes.
- **`IntegrationsPage`**: after loading devices, `supabase.rpc("latest_device_readings", { p_home_id: homeId })` → a `Map<device_id, { data, recorded_at }>`; pass each device's latest into `DeviceCard`. Valve state from the latest soil/valve reading's `data.state` (valves emit `{state:"on"|"off"}` readings) — fall back to latest `valve_events` only if needed.
- **`DeviceCard`**: render chips. Pure formatter `src/lib/integrations/readingChips.ts` (`buildReadingChips(deviceType, data, ecSource)`) — Vitest-tested (handles missing metrics, EC unit, valve state).
- Files: migration, `IntegrationsPage.tsx`, `DeviceCard.tsx`, `src/lib/integrations/readingChips.ts` (+ test). `Device` interface gains optional `ec_source`/latest if needed.

## #2 — Search / filter

Lists get long. Add a search box to:
- **Devices grid** (`IntegrationsPage`): filter by name / type / area name.
- **Automations list** (`AutomationsSection`): filter by name.
- **Schedule / blueprints** (`BlueprintManager`): filter recurring tasks by title — *if
  contained*; otherwise scope #2 to the two integrations lists this batch and note tasks
  as a fast follow.

Pure, tested filter helpers in `src/lib/` (`filterByText`), reused across surfaces, plus
a small shared `<SearchInput>` (`data-testid`). Client-only.
- Files: `src/lib/textFilter.ts` (+ test), a `SearchInput` component, `IntegrationsPage.tsx`, `AutomationsSection.tsx` (+ `BlueprintManager.tsx` if in scope).

## Tests
- Vitest: `readingChips` (metric/valve/EC formatting), `textFilter` (case-insensitive,
  multi-field), `hasSeries` for the EC block.
- `tsc` + `build` + `test:unit` green; `test:functions` unaffected (no shared logic).

## Docs
- Update `05-integrations-devices.md` (chips, EC graph), `09-data-model-integrations.md`
  (the `latest_device_readings` RPC).

## Deploy
- `supabase migration up` (local) → **confirm** → `db push` → `deploy-app-only`
  (no edge-function code changed) → commit + push. One version bump.

## Risks
- The RPC is `SECURITY INVOKER` so RLS on `device_readings`/`devices` gates access — no
  data leak. If `device_readings` RLS is service-role-only, fall back to a `SECURITY
  DEFINER` function with an explicit `home_members` check (verify RLS first).
- Valve "state" depends on whether valves write `device_readings` with `data.state`;
  if not, use latest `valve_events.event_type`. Confirm during implementation.
