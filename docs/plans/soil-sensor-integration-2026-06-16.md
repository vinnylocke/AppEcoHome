# Soil sensor + universal integration framework

> **Trigger:** WH52 soil sensor arriving 2026-06-16. This is the moment Phase A of [item 7.3](./ux-review-action-analysis-2026-06-15.md#73-modular-open-source-integration-contract-new--2026-06-15) (modular open-source integration contract) becomes worth shipping.

## Discovery findings — what already exists

The Ecowitt integration is **already 80% built** for the WH51:

| Layer | File | What it does today |
|---|---|---|
| Migration | various | `integrations`, `devices`, `soil_readings`, `valve_events`, `automations` tables already shipped. Device-type union supports `soil_sensor` + `water_valve`. |
| Edge fn | [`integrations-ecowitt-connect`](../../supabase/functions/integrations-ecowitt-connect/index.ts) | Verifies credentials against `api.ecowitt.net/api/v3`, registers the webhook callback, discovers channels via `device/real_time?call_back=soilwetness`. Hardcoded model = `WH51`. |
| Edge fn | [`integrations-ecowitt-poll`](../../supabase/functions/integrations-ecowitt-poll/index.ts) | Manual / cron fallback that reads `chData.soilmoisture.value`, `chData.soiltempc.value`, `chData.soilad.value`. |
| Edge fn | [`integrations-ecowitt-webhook`](../../supabase/functions/integrations-ecowitt-webhook/index.ts) | Public POST endpoint. Parses `soilmoisture{N}`, `soiltemp{N}f`, `soilad{N}` (raw ADC). Validates a `PASSKEY` token. Stores EC as the **raw ADC value**, not calibrated µS/cm. |
| Shared types | [`_shared/integrations/providerTypes.ts`](../../supabase/functions/_shared/integrations/providerTypes.ts) | `Provider` union + per-provider device metadata. eWeLink covers valves, Ecowitt covers soil. |

**Gaps for WH52:**

1. `soil_ec` is stored as a raw ADC integer. WH52 reports calibrated EC in µS/cm — the schema is fine but the webhook handler needs to know which field carries the calibrated value vs the raw ADC.
2. `EcowittDeviceMeta.model` is hardcoded to `"WH51"` at connect time. WH52 detection has to come from somewhere — either the `device/real_time` response or the webhook payload's field shape.
3. Soil temperature is currently rounded to 0.1°C — fine for both models.
4. No UI surface explains "EC is raw ADC" vs "EC is µS/cm" — a viewer might compare two devices and be confused.

**Gaps for a universal framework:**

- No shared **adapter interface**. Each provider re-implements connect / poll / read / control by hand.
- No **adapter registry** — `Provider` is a hand-written TypeScript union. Adding a new provider means editing 5+ files.
- No **custom HTTP webhook** provider for users with niche hardware.

---

## Proposed split

### Phase 1 — WH52 sensor support (S, ships in 1 PR)

Goal: when your WH52 lands and posts its first webhook, the readings appear in the Integrations Readings UI with **calibrated EC in µS/cm**, **soil temperature**, **soil moisture**, and the device tile says "WH52" not "WH51".

Touched files:

| File | Change |
|---|---|
| `supabase/functions/integrations-ecowitt-connect/index.ts` | Detect WH52 channels by looking for `soilcond{N}` / `tf_ch{N}` / `WH52`-shaped responses from the real_time endpoint. Store `model: "WH51" \| "WH52"` in metadata. |
| `supabase/functions/integrations-ecowitt-webhook/index.ts` | Read **all** candidate EC fields in order of preference: `soilcond{N}` (calibrated µS/cm WH52) → `soilrh{N}` (relative humidity proxy on some firmwares) → `soilad{N}` (raw ADC, WH51 only). Store the calibrated value as `soil_ec` when available; surface a `ec_source: "calibrated" \| "raw_adc"` flag in the raw_payload so the UI can render the right unit. |
| `supabase/functions/integrations-ecowitt-poll/index.ts` | Mirror the same field-priority chain. |
| `_shared/integrations/providerTypes.ts` | Extend `SoilReading` with optional `ec_source` discriminator. Extend `EcowittDeviceMeta` with `model: "WH51" \| "WH52"`. |
| Migration | None — `raw_payload jsonb` already carries arbitrary fields. EC unit can be derived at render time. |
| `src/components/integrations/...` (reading tiles) | Show `µS/cm` for calibrated WH52, `raw ADC (uncalibrated)` for WH51. Tooltip explains the difference. |
| Docs | Update `docs/app-reference/07-management/05-integrations-devices.md` + `07-integrations-readings.md` to mention WH52. |

**One-off step when sensor arrives:** the webhook handler logs the full incoming payload at info level for unknown channel patterns. We use that to confirm the WH52 field names match my guess (`soilcond{N}` is my best guess; could be `cond{N}`, `tf_ch{N}_cond`, etc.). If the guess is wrong, the fix is a one-line field-name change.

---

### Phase 2 — Universal integration framework (M, 2-3 days)

Goal: the contract from item 7.3 becomes real code — refactor existing eWeLink + Ecowitt into adapters that implement a stable interface. No behaviour change; pure architectural extraction.

#### The contract

`supabase/functions/_shared/integrations/contract.ts` (new):

```ts
export interface ProviderAdapter {
  readonly provider: string;             // "ecowitt", "ewelink", "custom-http"
  readonly families: DeviceType[];       // ["soil_sensor"] for Ecowitt
  // Hand the user a typed shape describing what the connect form needs
  // (e.g. Ecowitt: [applicationKey, apiKey, gatewayMac]).
  describeConnectForm(): ConnectFormField[];
  // Connect: validate creds + discover devices.
  connect(input: ConnectInput): Promise<ConnectResult>;
  // Poll: pull the latest readings on demand (cron fallback when webhook
  // hasn't fired in N minutes).
  poll?(device: DeviceRow, creds: Creds): Promise<DeviceReadingData>;
  // Control: only for actuator families (valve). Soil sensors omit.
  control?(device: DeviceRow, command: ControlCommand, creds: Creds): Promise<void>;
  // Webhook: a normaliser the public webhook endpoint calls to convert
  // an incoming HTTP body into one or more (device, reading) pairs.
  parseWebhook?(req: Request): Promise<NormalisedWebhookReading[]>;
}
```

#### Refactor

| Step | Effort |
|---|---|
| 1. Define `ProviderAdapter` interface + the supporting input/output types in `contract.ts`. | 1h |
| 2. Lift eWeLink connect / poll / state / control into `_shared/integrations/adapters/ewelink.ts` implementing `ProviderAdapter`. | 4h |
| 3. Lift Ecowitt connect / poll / webhook into `_shared/integrations/adapters/ecowitt.ts`. | 3h |
| 4. Replace the per-provider edge functions with thin dispatchers: each edge fn loads the right adapter from the registry and delegates. | 2h |
| 5. Update `Provider` union to be derived from the registry rather than hand-written. | 1h |

#### Adapter registry

`_shared/integrations/registry.ts`:

```ts
const ADAPTERS: Record<string, ProviderAdapter> = {
  ecowitt: ecowittAdapter,
  ewelink: ewelinkAdapter,
};
export function getAdapter(provider: string): ProviderAdapter | null {
  return ADAPTERS[provider] ?? null;
}
export function listAdapters(): ProviderAdapter[] { return Object.values(ADAPTERS); }
```

The Integrations Hub UI iterates `listAdapters()` to render the "Add integration" picker — no hardcoded provider list anymore.

---

### Phase 3 — Custom HTTP webhook provider (M, 2-3 days)

Goal: a power-user / community-contributor can wire **any** sensor to Rhozly by:
1. Adding a "Custom HTTP" integration in the UI.
2. Defining a friendly device name + family (`soil_sensor` or `water_valve`).
3. Getting a unique webhook URL (`/functions/v1/integrations-custom-webhook?token=<secret>`).
4. Configuring their device's firmware / a small adapter script to POST a JSON body in the documented shape.

The documented shape mirrors `SoilReading` / `ValveReading`:

```json
{
  "device_external_id": "my-soil-sensor-1",
  "recorded_at": "2026-06-16T12:00:00Z",
  "soil_temp": 18.4,
  "soil_moisture": 42.1,
  "soil_ec": 0.85
}
```

Touched files:

| File | Change |
|---|---|
| `supabase/functions/integrations-custom-webhook/index.ts` (new) | Public POST. Validates `?token=` against `integrations.credentials_encrypted.webhook_secret`. Reads JSON body. Resolves `device_external_id` → `devices.id`. Inserts. |
| `_shared/integrations/adapters/customHttp.ts` (new) | Connect = generate webhook URL + secret. No poll, no control. parseWebhook = identity validation. |
| `src/components/integrations/AddCustomDeviceForm.tsx` (new) | Form: friendly name + family. On save, opens a modal showing the webhook URL + JSON shape + sample `curl`. Copy-to-clipboard. |
| Docs | New `docs/integrations/CONTRIBUTING.md` with the JSON contract + examples. PR template asking adapter authors to ship: tests + a doc page + a working sample. |

#### Phase 3 risks

- **Security:** any leaked token = anyone can write garbage readings to a device. Mitigation: webhook tokens are revocable; insertion logs the source IP for audit.
- **Schema drift:** if we change `SoilReading` later, every custom integration breaks. Mitigation: explicit `schema_version` in the JSON body; old versions stay supported for at least 1 year.
- **Spam:** rate-limit per token (e.g. 1 insert per 30s) since most sensors poll every 5+ min anyway.

---

### Phase 4 (later, optional) — open-source extraction

Per item 7.3 Phase E. Defer until we have 3+ working adapters. No work here yet.

---

## App-reference files touched (Phase 1)

- [`docs/app-reference/07-management/05-integrations-devices.md`](../app-reference/07-management/05-integrations-devices.md) — note WH52 support, EC unit difference
- [`docs/app-reference/07-management/07-integrations-readings.md`](../app-reference/07-management/07-integrations-readings.md) — same
- [`docs/app-reference/99-cross-cutting/09-data-model-integrations.md`](../app-reference/99-cross-cutting/09-data-model-integrations.md) — note `ec_source` discriminator
- [`docs/app-reference/99-cross-cutting/10-edge-functions-catalogue.md`](../app-reference/99-cross-cutting/10-edge-functions-catalogue.md) — already lists ecowitt-connect/poll/webhook; just refresh wording

## Suggested order

**Strong recommendation: Phase 1 today, Phase 2 + 3 after the sensor data flow is proven.**

1. **Now:** ship Phase 1 (WH52 support) so the sensor *just works* on arrival. ~2-3 hours.
2. **Tomorrow / day after:** validate readings flow end-to-end. Note exact WH52 field names from the first real webhook payload — confirm or correct my guess about `soilcond{N}`.
3. **Once Phase 1 is stable:** ship Phase 2 (extraction to adapter contract). No behaviour change, but architecturally clean.
4. **Then:** Phase 3 (custom HTTP webhook) — the moment your second non-Ecowitt non-eWeLink device shows up, this becomes the natural fit.

## Open questions for you

1. **Field names for WH52:** the existing webhook handler logs unknown fields at info level. Once your sensor posts its first reading, can you grab the Supabase function logs and share the raw payload? That confirms `soilcond` vs whatever Ecowitt actually uses.
2. **Phase ordering:** any reason to interleave Phase 2 with Phase 1, or is "ship 1, prove it, then 2" the right shape?
3. **Custom HTTP token model:** are you OK with one webhook URL per Custom integration (1 token per provider connection), or do you want per-device tokens (more secure but more setup)?
