# 31. Integrations — Devices & Automations

**Spec files:** `tests/e2e/specs/automations.spec.ts` (builder + defaults card; see [TESTING.md § Current Test Inventory](../../TESTING.md#12-current-test-inventory))
**Page Objects:** `tests/e2e/pages/AutomationsPage.ts`
**Seeds:** `13_integrations.sql` — Ecowitt integration, soil sensor on Raised Bed A, water valve on South Border (turn_on event 2h ago)

> Created 2026-07-16 while fixing the valve-failure visibility bugs — the automations spec
> predates this file and its rows are inventoried in TESTING.md § E2E notes (AUTO-004/005).
> This file is the go-forward home for integrations E2E rows.

## Automations — run history & valve state (2026-07-16)

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| INTG-001 | 🔲 | Run history renders a `failed` run with its `error_message` (`run-valve-error` testid) after a drain-failed `turn_on` | seeded `automation_runs` + failed queue row | 🔲 Planned |
| INTG-002 | 🔲 | Run history renders `partial` when one of two valves in a run failed | seeded rows | 🔲 Planned |
| INTG-003 | 🔲 | Valve panel: `unknown` state renders "—" and **Turn Off stays enabled** (force-close allowed) | `integrations-ewelink-state` mock (no switch param) | 🔲 Planned |

> **Unit coverage (in place of live-provider E2E):** run-status correction — `supabase/tests/valveQueue.test.ts`
> (failed turn_on → run `failed` + `error_message`; sibling fired → `partial`; happy path untouched; stale-sweep
> dead-letter marks runs). Device targeting + unknown state — `supabase/tests/ewelinkDevice.test.ts`
> (`resolveTargetDeviceId` matrix) and `supabase/tests/integrations/ewelink.test.ts` (missing switch → `unknown`,
> never a phantom "off"). Real eWeLink I/O cannot run in E2E.
