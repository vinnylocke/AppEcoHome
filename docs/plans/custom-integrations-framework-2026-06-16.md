# Custom integrations framework — refreshed plan (2026-06-16)

> Supersedes Phases 2–4 of [`soil-sensor-integration-2026-06-16.md`](./soil-sensor-integration-2026-06-16.md). Phase 1 of that plan (WH52 support) shipped end-to-end (Rhozly OS 23.0003 → 23.0013). This refresh reflects what the Ecowitt + area-sensor work taught us.

## Goal

Let users plug **any** device that can speak HTTP into Rhozly:

- Soil sensors that don't speak Ecowitt or eWeLink (Acurite, Govee, DIY ESP32 + capacitive probe, an Arduino on Wi-Fi, a Home Assistant bridge that exposes anything as a webhook).
- Valves that aren't Sonoff (Rachio, Hunter, GardenZap, anything with an HTTP API).
- Future device families (light sensors, weather stations, leaf wetness, soil pH probes) without a new round of bespoke edge functions per provider.

Side benefit: third parties can ship an adapter as a PR without touching the core app. The current code has eWeLink and Ecowitt hand-wired into seven edge functions; a third provider would have to copy that whole shape today.

## What changed since the original plan

Three things that the WH52 + area-sensor work made obvious:

1. **The Ecowitt parser is already the adapter exemplar.**
   - [`_shared/integrations/ecowittFields.ts`](../../supabase/functions/_shared/integrations/ecowittFields.ts) walks for multiple channel-key spellings, aliases inner field names, uses unit sidecars when present, falls back to heuristics. This isn't a one-off — it's the shape every adapter needs (normalise vendor-specific data into a canonical reading).
   - Phase 2 should **lift this pattern into the contract**, not redesign from scratch. The `ProviderAdapter` interface is essentially what Ecowitt + eWeLink already do — just made explicit and registered in a table.

2. **The 15-min cron pattern is established.**
   - [`integrations-ecowitt-cron-poll`](../../supabase/functions/integrations-ecowitt-cron-poll/index.ts) walks every active integration and polls. Same pattern can serve every adapter without each provider rolling its own cron.
   - The contract should expose `poll(creds, devices)` so the shared cron walks ALL providers, not just Ecowitt.

3. **Area linkage + fan-out is free.**
   - `devices.area_id` (Phase 1 of the area-sensor plan), the `fanout_device_reading_to_area` trigger (Phase 2), and the per-area history charts (Phase 1 + 2) all key off **the moment a reading lands in `device_readings`**. Provider-agnostic.
   - **Any** custom integration that writes a `device_readings` row gets: area history charts, AI/Care-guide consumption (`areas.latest_soil_*` columns), sensor-driven automations (Phase 3).

That last point is the unlock. A custom integration doesn't need to know about areas, automations, or AI — it just writes a normalised reading and everything else just works.

## The contract

`_shared/integrations/contract.ts` (new):

```ts
/** One row per supported provider, looked up by name. */
export interface ProviderAdapter {
  readonly provider: string;            // "ecowitt", "ewelink", "custom_http", ...
  readonly families: DeviceFamily[];    // ["soil_sensor"] for Ecowitt, ["water_valve"] for eWeLink

  /** Describe the connect form for the Devices wizard (Step 3). */
  describeConnectForm(): ConnectFormField[];

  /** Validate creds + discover devices. */
  connect(input: ConnectInput): Promise<ConnectResult>;

  /** Pulled by the shared poll cron (every 15 min) for every active
   *  integration that exposes this method. May be omitted by adapters
   *  that rely solely on push (webhooks). */
  poll?(creds: Creds, devices: DeviceRow[]): Promise<NormalisedReading[]>;

  /** Only for actuator families. Sends a turn_on / turn_off / etc. */
  control?(device: DeviceRow, command: ControlCommand, creds: Creds): Promise<void>;

  /** Normalise an inbound webhook body. The shared
   *  /functions/v1/integrations-webhook-router edge fn dispatches to the
   *  right adapter based on a path segment + integration secret. */
  parseWebhook?(req: Request): Promise<NormalisedReading[]>;
}

/** What the adapter returns to be inserted into device_readings. */
export interface NormalisedReading {
  device_external_id: string;
  recorded_at: string;
  data: SoilReading | ValveReading;
}
```

Per-family typed payload shapes (`SoilReading`, `ValveReading`) already exist in [`providerTypes.ts`](../../supabase/functions/_shared/integrations/providerTypes.ts) — we just reuse them.

## Phase plan

### Phase 2 — Adapter contract + registry (M, ~3 days)

Pure architectural extraction. No behaviour change.

| Step | Effort |
|---|---|
| 1. Define `ProviderAdapter` + supporting types in `_shared/integrations/contract.ts`. | 1h |
| 2. Implement `ecowittAdapter` (lifts existing connect/poll/webhook code). | 3h |
| 3. Implement `ewelinkAdapter` (lifts existing connect/control/state code). | 3h |
| 4. Adapter registry in `_shared/integrations/registry.ts`: `getAdapter(name)`, `listAdapters()`. | 1h |
| 5. Replace per-provider edge functions with thin dispatchers (`integrations-connect`, `integrations-poll-cron`, `integrations-control`, `integrations-webhook-router`). Old edge fns stay as thin shims for one release window, then get removed in a follow-up. | 4h |
| 6. UI: the Connect wizard's brand picker iterates `listAdapters()` filtered by device family — no more hand-rolled `BRANDS` constant. | 1h |
| 7. Deno tests: registry lookup, adapter contract conformance, dispatcher routing. | 2h |

**No new tables.** Connection metadata stays in `integrations.metadata` jsonb; per-adapter device metadata stays in `devices.metadata` jsonb. The contract is purely TypeScript.

### Phase 3 — Custom HTTP webhook provider (M, ~2-3 days)

The user-facing piece. Built ON TOP of the Phase 2 contract.

**Connect form fields:**

| Field | Purpose |
|---|---|
| Friendly device name | "Greenhouse soil probe" |
| Device family | Soil sensor / Water valve |
| Display unit (sensors) | Celsius / Fahrenheit for temp (mirrors existing per-device pref) |

**On connect:** the adapter generates a unique webhook URL + secret token (`integrations.metadata.webhook_secret`) and returns them. The user copies + pastes into their device's firmware / hub / script.

**Webhook contract** (documented in `docs/integrations/custom-http-contract.md`):

```http
POST https://<rhozly-host>/functions/v1/integrations-webhook-router/custom_http/<token>
Content-Type: application/json

{
  "schema_version": 1,
  "device_external_id": "greenhouse-probe-1",   // matches the Custom HTTP device you set up
  "recorded_at": "2026-06-16T18:00:00Z",         // optional; defaults to server time
  "soil_temp": 21.4,                              // celsius — temperature unit always C in the payload
  "soil_moisture": 42.1,                          // percent 0-100
  "soil_ec": 1250,                                // µS/cm; can also use ec_source: "raw_adc" for relative-only
  "ec_source": "calibrated_us_cm"
}
```

Family-aware: a `water_valve` payload uses `{ "state": "on" | "off" }`.

**Inside the custom_http adapter:**

- `parseWebhook` validates the secret token from the path + the JSON shape, looks up the device by `device_external_id`, returns the normalised reading. The shared webhook router writes to `device_readings`.
- `poll` is omitted — Custom HTTP is push-only.
- `control` is omitted — Custom HTTP is read-only (we can add a "POST back" pattern in a follow-up if anyone needs valve control via Custom HTTP).
- `connect` returns the URL + secret rendered in a modal so the user can copy them. Includes a "test webhook" button that pings their endpoint with a sample reading (optional, nice-to-have).

**Security model:**

- Secret token is per-integration, 256-bit, generated server-side. Stored in `integrations.metadata.webhook_secret`.
- Path-based: `…/integrations-webhook-router/custom_http/<token>`. We grep for the token in the path, look up the integration. If no match, 404. No information leak.
- Optional per-IP rate limit: 1 inbound POST per device per 30s (most sensors push every 5+ min anyway).
- Tokens can be revoked from Device Settings → "Rotate webhook URL" — generates a new one and invalidates the old.

**UI surfaces:**

| Surface | Change |
|---|---|
| Connect wizard (Step 2 brand picker) | Adds "Custom (HTTP)" alongside Ecowitt / SONOFF eWeLink |
| Connect wizard (Step 3 credentials) | Replaced by a friendly-name + family form |
| Connect wizard (Step 4 discovery) | Skipped — discovery is "the user knows what they connected" |
| Connect wizard (new Step 5) | Webhook URL + JSON contract + copy buttons + sample `curl` |
| DeviceSettingsModal | "Rotate webhook URL" action for Custom HTTP integrations |
| New docs page `/help/custom-http` (in-app) | Full contract docs with working examples (curl, Python, ESP32 Arduino sketch) |

### Phase 4 — Contributor onboarding (deferred — wait for demand)

Per the original plan: only worth doing when at least 3 working adapters exist (current state: 2 — Ecowitt, eWeLink — plus Custom HTTP after Phase 3 = 3). Triggers Phase 4 naturally.

**What it ships:**

- `docs/integrations/CONTRIBUTING.md` — adapter template + worked example (the Custom HTTP adapter as the canonical example).
- PR template for new adapters asking authors to ship: schema-aware reading types (if a new family), tests, family registration in `providerTypes.ts`, an entry in the Connect wizard brand picker, and a doc page.
- (Optional, Phase 5) Open-source extraction of `_shared/integrations/` into its own repo. Doc only — no code change yet.

---

## Recommendation on shape

**Ship Phase 2 alone first, then Phase 3 as a separate PR.** Same reasoning as the area-sensor plan — Phase 2 is pure refactor (lifts existing code behind a contract, no user-visible change), and Phase 3 is the new feature (Custom HTTP provider). Splitting keeps the diffs reviewable.

**Phase 2 risk:** the new dispatcher edge functions must produce bit-identical behaviour to today's `integrations-ecowitt-*` + `integrations-ewelink-*`. Mitigation: keep the old edge fns running side-by-side for one release window. The new dispatchers route by adapter name; the old fns still work. Once Phase 2 is in prod for a week with no regressions, the next PR removes the old fns.

**Phase 3 risk:** webhook abuse. A leaked token = anyone can write garbage readings. Mitigation: 256-bit tokens, easy rotation in Device Settings, per-IP rate limit, audit log of all inbound webhooks (timestamp + IP + payload sample) accessible from Device Settings.

## Tests

- **Phase 2:** Deno tests for the registry (lookup, listing, unknown provider). Adapter conformance tests (every registered adapter implements the required contract surface for its family). Dispatcher tests (correct routing).
- **Phase 3:** Deno tests for the webhook router (valid token + valid payload → reading written; invalid token → 404; malformed payload → 400; replay attack → idempotent on same `recorded_at`). E2E test in `tests/e2e/specs/integrations.spec.ts` for the Custom HTTP create flow.

## Open questions

1. **Phase 2 first, then Phase 3?** My recommendation. Or do you want Phase 3 (Custom HTTP) sooner, with the refactor following as a clean-up?
2. **Webhook authentication style** — path-based token (simpler — `/webhook/<token>`) vs header-based (`X-Rhozly-Token` header — more standard but trickier to test from firmware that only does GET/POST without custom headers)? Default is path-based.
3. **Adapter discovery for the Connect wizard brand list** — read at build time from a static export list, or query an `adapters` view at runtime (lets us toggle providers without a deploy)? Default is build-time static (simpler, faster, no DB round-trip on the wizard).
