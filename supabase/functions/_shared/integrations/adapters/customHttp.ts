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
  ControlCommand,
  Creds,
  DeviceRow,
  NormalisedReading,
  ProviderAdapter,
} from "../contract.ts";
import type {
  EcSource,
  DeviceReadingData,
  SoilReading,
  ValveReading,
} from "../providerTypes.ts";
import { renderTemplate, type TemplateVars } from "../template.ts";
import { checkControlUrl } from "../urlSafety.ts";

export const CUSTOM_HTTP_PROVIDER = "custom_http";
export const CUSTOM_HTTP_SCHEMA_VERSION = 1;

// ─── Outbound valve control defaults (industry-standard templated request) ──────
export const DEFAULT_CONTROL_METHOD = "POST";
export const DEFAULT_CONTROL_HEADERS = "Content-Type: application/json";
export const DEFAULT_CONTROL_BODY =
  '{"schema_version":1,"command":"{{command}}","duration_seconds":{{duration_seconds}}}';
const ALLOWED_CONTROL_METHODS = ["POST", "PUT", "PATCH", "GET"];
const CONTROL_TIMEOUT_MS = 8000;

/** Parse a `Key: Value` (one per line) header block. Pure + tested.
 *  Rejects CRLF / control chars in the value (header-injection guard). */
export function parseHeaderBlock(
  raw: string,
): { headers: Record<string, string> } | { error: string } {
  const headers: Record<string, string> = {};
  for (const line of (raw ?? "").split("\n")) {
    const trimmed = line.replace(/\r$/, "");
    if (trimmed.trim() === "") continue;
    const idx = trimmed.indexOf(":");
    if (idx <= 0) return { error: "invalid_header_line" };
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!key) return { error: "invalid_header_line" };
    // Value may still contain {{template}} tokens — those are fine; only
    // raw control characters are rejected (the rendered value is
    // re-checked at send time too).
    if (/[\r\n]/.test(value)) return { error: "invalid_header_value" };
    headers[key] = value;
  }
  return { headers };
}

/** True when the header block declares a JSON content type. */
export function isJsonContentType(headers: Record<string, string>): boolean {
  const ct = Object.entries(headers).find(([k]) => k.toLowerCase() === "content-type")?.[1] ?? "";
  return ct.toLowerCase().includes("application/json");
}

/** Sample variable map used to validate templates at connect time. */
function sampleVars(externalDeviceId: string, friendlyName: string): TemplateVars {
  return {
    command: "turn_on",
    state: "on",
    duration_seconds: 1800,
    duration_minutes: 30,
    device_external_id: externalDeviceId,
    device_name: friendlyName,
  };
}

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
      // ── Water-valve control (optional) — the wizard only shows these
      //    for the water_valve family. A valve with no control_url stays
      //    read-only. ──────────────────────────────────────────────────
      {
        id: "control_url",
        label: "Control URL (water valves only)",
        placeholder: "https://your-device.example.com/valve",
        helper: "Public HTTPS endpoint Rhozly POSTs on/off commands to (your device or a vendor/relay API). Leave blank for a read-only valve. Rhozly runs in the cloud, so a LAN address won't be reachable.",
        kind: "text",
        required: false,
      },
      {
        id: "control_method",
        label: "HTTP method",
        kind: "text",
        required: false,
        defaultValue: DEFAULT_CONTROL_METHOD,
      },
      {
        id: "control_headers",
        label: "Request headers",
        helper: "One `Key: Value` per line. Add auth here, e.g. `Authorization: Bearer …` or `X-API-Key: …`.",
        kind: "textarea",
        required: false,
        defaultValue: DEFAULT_CONTROL_HEADERS,
      },
      {
        id: "control_body",
        label: "Request body template",
        helper: "Variables: {{command}} (turn_on/turn_off), {{state}} (on/off), {{duration_seconds}}, {{duration_minutes}}, {{device_external_id}}, {{device_name}}.",
        kind: "textarea",
        required: false,
        defaultValue: DEFAULT_CONTROL_BODY,
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

    // ── Optional outbound control config (water valves) ──────────────────────
    const controlCreds: Creds = {};
    let controllable = false;
    const controlUrl = (input.fields.control_url ?? "").trim();
    if (family === "water_valve" && controlUrl) {
      const urlCheck = checkControlUrl(controlUrl);
      if (!urlCheck.ok) throw new Error(urlCheck.error ?? "invalid_control_url");

      const method = (input.fields.control_method ?? DEFAULT_CONTROL_METHOD).trim().toUpperCase()
        || DEFAULT_CONTROL_METHOD;
      if (!ALLOWED_CONTROL_METHODS.includes(method)) throw new Error("invalid_control_method");

      const headersRaw = input.fields.control_headers ?? DEFAULT_CONTROL_HEADERS;
      const parsedHeaders = parseHeaderBlock(headersRaw);
      if ("error" in parsedHeaders) throw new Error(parsedHeaders.error);

      const bodyRaw = input.fields.control_body ?? DEFAULT_CONTROL_BODY;
      const sample = sampleVars(externalDeviceId, friendlyName);
      // Templates must render (no unknown placeholders)…
      let renderedBody: string;
      try {
        renderedBody = renderTemplate(bodyRaw, sample);
        for (const v of Object.values(parsedHeaders.headers)) renderTemplate(v, sample);
      } catch (err) {
        throw new Error(err instanceof Error ? err.message : "invalid_template");
      }
      // …and the body must be valid JSON when the headers declare JSON.
      if (isJsonContentType(parsedHeaders.headers)) {
        try { JSON.parse(renderedBody); } catch { throw new Error("control_body_not_json"); }
      }

      controlCreds.control_url = controlUrl;
      controlCreds.control_method = method;
      controlCreds.control_headers = headersRaw;
      controlCreds.control_body = bodyRaw;
      controllable = true;
    }

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
      // The webhook secret lives on integration metadata; outbound valve
      // control config (url + headers + body template, possibly carrying an
      // API key) is sensitive → stored in the encrypted credentials blob.
      credsToStore: controlCreds,
      integrationMetadata: meta as unknown as Record<string, unknown>,
      devices: [
        {
          externalDeviceId,
          name: friendlyName,
          family,
          metadata: family === "soil_sensor"
            ? { source: "custom_http" }
            : { source: "custom_http", default_duration_seconds: 1800, controllable },
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

  async control(device: DeviceRow, command: ControlCommand, creds: Creds): Promise<void> {
    const controlUrl = (creds.control_url ?? "").trim();
    if (!controlUrl) throw new Error("valve_not_controllable");
    const urlCheck = checkControlUrl(controlUrl);
    if (!urlCheck.ok) throw new Error(urlCheck.error ?? "invalid_control_url");

    const method = (creds.control_method || DEFAULT_CONTROL_METHOD).toUpperCase();
    const parsedHeaders = parseHeaderBlock(creds.control_headers || DEFAULT_CONTROL_HEADERS);
    if ("error" in parsedHeaders) throw new Error(parsedHeaders.error);
    const bodyTemplate = creds.control_body || DEFAULT_CONTROL_BODY;

    const isOpen = command.kind === "valve_open";
    const durationSeconds = isOpen ? command.duration_seconds : 0;
    const vars: TemplateVars = {
      command: isOpen ? "turn_on" : "turn_off",
      state: isOpen ? "on" : "off",
      duration_seconds: durationSeconds,
      duration_minutes: Math.round(durationSeconds / 60),
      device_external_id: device.external_device_id,
      device_name: device.name,
    };

    // Render headers; re-guard against CRLF in the rendered value.
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsedHeaders.headers)) {
      const rendered = renderTemplate(v, vars);
      if (/[\r\n]/.test(rendered)) throw new Error("invalid_header_value");
      headers[k] = rendered;
    }

    let body: string | undefined;
    if (method !== "GET") {
      body = renderTemplate(bodyTemplate, vars);
      if (isJsonContentType(parsedHeaders.headers)) {
        try { JSON.parse(body); } catch { throw new Error("control_body_not_json"); }
      }
    }

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), CONTROL_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(controlUrl, { method, headers, body, signal: ac.signal });
    } catch (err) {
      throw new Error(
        `control_request_unreachable: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      let snippet = "";
      try { snippet = (await res.text()).slice(0, 200); } catch { /* ignore */ }
      throw new Error(`control_request_failed: ${res.status}${snippet ? ` ${snippet}` : ""}`);
    }
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
