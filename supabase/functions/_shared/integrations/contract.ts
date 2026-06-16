/**
 * ProviderAdapter contract — the shape every integration provider
 * implements. New providers add an entry to the registry and the
 * Connect wizard + cron pollers + webhook router pick them up
 * automatically without per-provider edge function plumbing.
 *
 * 2026-06-16 Phase 2 — initial definition. The Ecowitt and eWeLink
 * providers were hand-wired into seven edge functions before this
 * landed; they will be migrated to adapters in a follow-up. The
 * `custom_http` provider is the first formal implementation of this
 * contract (Phase 3).
 */

import type {
  DeviceType,
  DeviceReadingData,
  SoilReading,
  ValveReading,
} from "./providerTypes.ts";

/** Re-export device family names for clarity at adapter call sites. */
export type DeviceFamily = DeviceType;

/**
 * Field descriptor for the Connect wizard's credentials step. The UI
 * iterates the array returned by `describeConnectForm()` and renders
 * one input per descriptor — labels, placeholders, validation, all
 * driven by the adapter.
 *
 * Field types intentionally narrow so the UI doesn't have to handle
 * provider-specific quirks. New types can be added when a provider
 * genuinely needs them.
 */
export interface ConnectFormField {
  /** Stable id used as the key in `ConnectInput.fields`. */
  id: string;
  label: string;
  placeholder?: string;
  helper?: string;
  kind: "text" | "password" | "mac";
  required: boolean;
}

/** Free-form credentials map keyed by `ConnectFormField.id`. */
export type Creds = Record<string, string>;

export interface ConnectInput {
  homeId: string;
  /** User-supplied form values keyed by `ConnectFormField.id`. */
  fields: Creds;
}

export interface DiscoveredDevice {
  /** Stable identifier owned by the provider. Used as the unique key
   *  in `devices.external_device_id`. */
  externalDeviceId: string;
  name: string;
  family: DeviceFamily;
  /** Provider-specific metadata to seed `devices.metadata` jsonb on save. */
  metadata: Record<string, unknown>;
}

export interface ConnectResult {
  /** Credentials to encrypt + persist on `integrations.credentials_encrypted`. */
  credsToStore: Creds;
  /** Optional provider-specific metadata to persist on
   *  `integrations.metadata`. The webhook router reads this. */
  integrationMetadata?: Record<string, unknown>;
  /** Devices discovered on the account. */
  devices: DiscoveredDevice[];
  /** Optional pieces returned for the post-connect wizard step. Used
   *  by adapters that need to surface setup instructions (e.g. the
   *  custom_http adapter returns the webhook URL + sample payload). */
  postConnect?: {
    title: string;
    instructions: string;
    webhookUrl?: string;
    samplePayload?: string;
  };
}

/** Row shape used by control + poll methods — narrow projection of
 *  the `devices` table. Adapters MUST NOT mutate. */
export interface DeviceRow {
  id: string;
  external_device_id: string;
  device_type: DeviceFamily;
  metadata: Record<string, unknown>;
  /** Foreign key — the area this device feeds, if linked. */
  area_id: string | null;
}

export interface NormalisedReading {
  externalDeviceId: string;
  recordedAt: string;
  data: DeviceReadingData;
}

/** Family-specific control commands. Adapters reject unsupported
 *  commands for their family. */
export type ControlCommand =
  | { kind: "valve_open"; duration_seconds: number }
  | { kind: "valve_close" };

/**
 * The full adapter contract. `connect` is required; `poll`, `control`,
 * `parseWebhook` are optional per the families the adapter supports
 * (soil-sensor-only adapters omit `control`; push-only adapters omit
 * `poll`; cron-only adapters omit `parseWebhook`).
 */
export interface ProviderAdapter {
  readonly provider: string;
  readonly families: ReadonlyArray<DeviceFamily>;
  /** Display name shown in the Connect wizard brand picker. */
  readonly displayName: string;
  /** One-line description shown alongside the display name. */
  readonly description: string;

  describeConnectForm(): ConnectFormField[];

  connect(input: ConnectInput): Promise<ConnectResult>;

  /** Called by the shared poll cron every 15 min for every active
   *  integration. Omitted by push-only providers (e.g. custom_http
   *  whose readings only arrive via webhook). */
  poll?(creds: Creds, devices: DeviceRow[]): Promise<NormalisedReading[]>;

  /** Only for actuator families. Throws on unsupported command. */
  control?(device: DeviceRow, command: ControlCommand, creds: Creds): Promise<void>;

  /** Parse + validate an inbound webhook body. The shared webhook
   *  router calls this after authenticating the request and looking
   *  up the integration. */
  parseWebhook?(req: Request, integrationMetadata: Record<string, unknown>): Promise<NormalisedReading[]>;
}

// Convenience type guards.
export function isSoilReading(data: DeviceReadingData): data is SoilReading {
  return typeof (data as SoilReading).soil_moisture === "number";
}
export function isValveReading(data: DeviceReadingData): data is ValveReading {
  return (data as ValveReading).state === "on" || (data as ValveReading).state === "off";
}
