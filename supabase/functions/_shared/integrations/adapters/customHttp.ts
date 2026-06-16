/**
 * Custom HTTP adapter (2026-06-16 Phase 3).
 *
 * The "bring your own device" provider. The user picks a friendly
 * name + family (soil_sensor or water_valve), Rhozly generates a
 * unique webhook URL + 256-bit secret, and the user wires their
 * device (DIY ESP32, Arduino on Wi-Fi, Home Assistant bridge,
 * anything) to POST readings to that URL.
 *
 * No polling — push-only by design. `poll()` is omitted from the
 * adapter; the shared cron skips providers without it.
 *
 * No control — `custom_http` is read-only for now. A future PR can
 * add an outbound POST-back pattern when a user has a custom valve
 * to control.
 *
 * Authentication accepts two styles (configured to be permissive
 * because hobbyist firmware varies):
 *   - Path-based: …/integrations-webhook-router/custom_http/<token>
 *   - Header-based: `X-Rhozly-Token: <token>`
 * Header wins when both are present.
 */

import type {
  ConnectFormField,
  ConnectInput,
  ConnectResult,
  NormalisedReading,
  ProviderAdapter,
} from "../contract.ts";
import type {
  EcSource,
  DeviceReadingData,
  SoilReading,
  ValveReading,
} from "../providerTypes.ts";

export const CUSTOM_HTTP_PROVIDER = "custom_http";
export const CUSTOM_HTTP_SCHEMA_VERSION = 1;

/** Documented JSON payload shapes. Exported so the post-connect step
 *  can show the user a worked example. */
export const SOIL_PAYLOAD_EXAMPLE = {
  schema_version: 1,
  device_external_id: "greenhouse-probe-1",
  recorded_at: "2026-06-16T18:00:00Z",
  soil_temp: 21.4,
  soil_moisture: 42.1,
  soil_ec: 1250,
  ec_source: "calibrated_us_cm",
  battery_percent: 87,
} as const;

export const VALVE_PAYLOAD_EXAMPLE = {
  schema_version: 1,
  device_external_id: "garage-tap-valve",
  recorded_at: "2026-06-16T18:00:00Z",
  state: "on",
  battery_percent: 87,
} as const;

interface CustomHttpIntegrationMeta {
  webhook_secret: string;
  family: "soil_sensor" | "water_valve";
  /** Display name set by the user. Used to label the auto-created device. */
  friendly_name: string;
  /** Stable external id used as `devices.external_device_id` so future
   *  webhooks can reference an existing device row. */
  external_device_id: string;
}

/**
 * Cryptographically-strong token. Web Crypto is available in Deno
 * + the Supabase edge runtime. 32 bytes → 64 hex chars.
 */
function generateWebhookSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Slugify a friendly name into a stable `external_device_id`. Lower-
 * case, alphanumerics + hyphens only. Used so the user's webhook can
 * post against a predictable id.
 */
export function slugifyDeviceId(input: string): string {
  const base = input.trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || `device-${Date.now().toString(36)}`;
}

/** Shared 0-100 integer validator for the optional `battery_percent`
 *  field. Returns the validated value, or a string error code, or
 *  `undefined` when the field isn't present. */
function parseBatteryPercent(value: unknown): number | undefined | { error: string } {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { error: "invalid_battery_percent" };
  }
  if (value < 0 || value > 100) {
    return { error: "battery_percent_out_of_range" };
  }
  // Snap to an integer to keep the column type honest (SMALLINT).
  return Math.round(value);
}

/**
 * Validate a soil reading payload. Returns the typed shape on success,
 * or a string error code on failure. Pure — tested separately.
 */
export function parseSoilPayload(
  body: unknown,
): { externalDeviceId: string; recordedAt: string; data: DeviceReadingData } | { error: string } {
  if (!body || typeof body !== "object") return { error: "body_not_object" };
  const b = body as Record<string, unknown>;

  if (typeof b.schema_version === "number" && b.schema_version !== CUSTOM_HTTP_SCHEMA_VERSION) {
    return { error: "unsupported_schema_version" };
  }
  if (typeof b.device_external_id !== "string" || b.device_external_id.trim() === "") {
    return { error: "missing_device_external_id" };
  }

  // soil_moisture must be present + 0..100.
  if (typeof b.soil_moisture !== "number" || !Number.isFinite(b.soil_moisture)) {
    return { error: "missing_or_invalid_soil_moisture" };
  }
  if (b.soil_moisture < 0 || b.soil_moisture > 100) {
    return { error: "soil_moisture_out_of_range" };
  }

  // soil_temp + soil_ec optional but if present must be valid.
  let soilTemp = 0;
  if (b.soil_temp !== undefined) {
    if (typeof b.soil_temp !== "number" || !Number.isFinite(b.soil_temp)) {
      return { error: "invalid_soil_temp" };
    }
    if (b.soil_temp < -50 || b.soil_temp > 80) {
      return { error: "soil_temp_out_of_range" };
    }
    soilTemp = b.soil_temp;
  }
  let soilEc = 0;
  let ecSource: EcSource = "raw_adc";
  if (b.soil_ec !== undefined) {
    if (typeof b.soil_ec !== "number" || !Number.isFinite(b.soil_ec)) {
      return { error: "invalid_soil_ec" };
    }
    if (b.soil_ec < 0 || b.soil_ec > 100000) {
      return { error: "soil_ec_out_of_range" };
    }
    soilEc = b.soil_ec;
    if (b.ec_source !== undefined) {
      if (b.ec_source !== "calibrated_us_cm" && b.ec_source !== "raw_adc") {
        return { error: "invalid_ec_source" };
      }
      ecSource = b.ec_source as EcSource;
    } else {
      // Default to calibrated when an EC value is sent without a unit —
      // matches the WH52 convention.
      ecSource = "calibrated_us_cm";
    }
  }

  const recordedAtRaw = b.recorded_at;
  let recordedAt = new Date().toISOString();
  if (recordedAtRaw !== undefined) {
    if (typeof recordedAtRaw !== "string") return { error: "invalid_recorded_at" };
    const d = new Date(recordedAtRaw);
    if (Number.isNaN(d.getTime())) return { error: "invalid_recorded_at" };
    recordedAt = d.toISOString();
  }

  const battery = parseBatteryPercent(b.battery_percent);
  if (battery && typeof battery === "object" && "error" in battery) return battery;

  const data: SoilReading = {
    soil_moisture: b.soil_moisture,
    soil_temp: soilTemp,
    soil_ec: soilEc,
    ec_source: ecSource,
  };
  if (typeof battery === "number") data.battery_percent = battery;

  return {
    externalDeviceId: b.device_external_id.trim(),
    recordedAt,
    data,
  };
}

/** Validate a valve state payload. Pure. */
export function parseValvePayload(
  body: unknown,
): { externalDeviceId: string; recordedAt: string; data: DeviceReadingData } | { error: string } {
  if (!body || typeof body !== "object") return { error: "body_not_object" };
  const b = body as Record<string, unknown>;

  if (typeof b.schema_version === "number" && b.schema_version !== CUSTOM_HTTP_SCHEMA_VERSION) {
    return { error: "unsupported_schema_version" };
  }
  if (typeof b.device_external_id !== "string" || b.device_external_id.trim() === "") {
    return { error: "missing_device_external_id" };
  }
  if (b.state !== "on" && b.state !== "off") {
    return { error: "invalid_state" };
  }

  let recordedAt = new Date().toISOString();
  if (b.recorded_at !== undefined) {
    if (typeof b.recorded_at !== "string") return { error: "invalid_recorded_at" };
    const d = new Date(b.recorded_at as string);
    if (Number.isNaN(d.getTime())) return { error: "invalid_recorded_at" };
    recordedAt = d.toISOString();
  }

  const battery = parseBatteryPercent(b.battery_percent);
  if (battery && typeof battery === "object" && "error" in battery) return battery;

  const data: ValveReading = { state: b.state };
  if (typeof battery === "number") data.battery_percent = battery;

  return {
    externalDeviceId: b.device_external_id.trim(),
    recordedAt,
    data,
  };
}

export const customHttpAdapter: ProviderAdapter = {
  provider: CUSTOM_HTTP_PROVIDER,
  families: ["soil_sensor", "water_valve"] as const,
  displayName: "Custom (HTTP webhook)",
  description: "Bring your own device — DIY ESP32, Home Assistant, anything that can POST JSON.",

  describeConnectForm(): ConnectFormField[] {
    return [
      {
        id: "friendly_name",
        label: "Device name",
        placeholder: "Greenhouse soil probe",
        helper: "Used as the device label inside Rhozly.",
        kind: "text",
        required: true,
      },
      {
        id: "family",
        label: "Device family",
        placeholder: "soil_sensor or water_valve",
        helper: "soil_sensor for moisture / temp / EC. water_valve for on/off devices.",
        kind: "text",
        required: true,
      },
    ];
  },

  async connect(input: ConnectInput): Promise<ConnectResult> {
    const friendlyName = input.fields.friendly_name?.trim();
    const familyRaw = input.fields.family?.trim().toLowerCase();
    if (!friendlyName) throw new Error("missing_friendly_name");
    if (familyRaw !== "soil_sensor" && familyRaw !== "water_valve") {
      throw new Error("invalid_family");
    }
    const family = familyRaw as "soil_sensor" | "water_valve";

    const webhookSecret = generateWebhookSecret();
    const externalDeviceId = slugifyDeviceId(friendlyName);

    const meta: CustomHttpIntegrationMeta = {
      webhook_secret: webhookSecret,
      family,
      friendly_name: friendlyName,
      external_device_id: externalDeviceId,
    };

    const example = family === "soil_sensor" ? SOIL_PAYLOAD_EXAMPLE : VALVE_PAYLOAD_EXAMPLE;
    const exampleStr = JSON.stringify(
      { ...example, device_external_id: externalDeviceId },
      null,
      2,
    );

    return {
      // No upstream credentials to store — secret lives on the integration metadata.
      credsToStore: {},
      integrationMetadata: meta as unknown as Record<string, unknown>,
      devices: [
        {
          externalDeviceId,
          name: friendlyName,
          family,
          metadata: family === "soil_sensor"
            ? { source: "custom_http" }
            : { source: "custom_http", default_duration_seconds: 1800 },
        },
      ],
      postConnect: {
        title: "Point your device at this URL",
        instructions:
          "Configure your device (or DIY firmware) to POST a JSON body in the documented shape to this URL whenever it has a new reading. The webhook secret is per-integration and can be rotated from Device Settings.",
        // The caller fills in the host portion. We stamp the suffix.
        webhookUrl: `__BASE__/functions/v1/integrations-webhook-router/custom_http/${webhookSecret}`,
        samplePayload: exampleStr,
      },
    };
  },

  async parseWebhook(req: Request, integrationMetadata: Record<string, unknown>): Promise<NormalisedReading[]> {
    const family = (integrationMetadata as Partial<CustomHttpIntegrationMeta>).family ?? "soil_sensor";
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      throw new Error("invalid_json");
    }
    const parsed = family === "water_valve"
      ? parseValvePayload(body)
      : parseSoilPayload(body);
    if ("error" in parsed) {
      throw new Error(parsed.error);
    }
    return [
      {
        externalDeviceId: parsed.externalDeviceId,
        recordedAt: parsed.recordedAt,
        data: parsed.data,
      },
    ];
  },
};
