/** All supported integration providers. Extend this union to add new providers. */
export type Provider = "ecowitt" | "ewelink";

/** All supported device types. Extend to add new hardware categories. */
export type DeviceType = "soil_sensor" | "water_valve";

// ─── Reading shapes ────────────────────────────────────────────────────────────

/**
 * Discriminator for the EC value's calibration state.
 *
 * 2026-06-16 — WH52 support landed here. The WH51 (moisture-only firmware
 * branch we shipped against first) only exposes the raw ADC reading on
 * the EC pin — Ecowitt doesn't publish a conversion, so we stored that
 * raw integer in `soil_ec` and the UI rendered it as "raw ADC". The
 * WH52 multi-parameter sensor reports a calibrated EC value in µS/cm
 * directly. The discriminator lets the UI pick the right unit + tooltip
 * without guessing per device.
 */
export type EcSource = "calibrated_us_cm" | "raw_adc";

export interface SoilReading {
  soil_temp: number;      // °C
  soil_moisture: number;  // %
  soil_ec: number;        // µS/cm when ec_source = "calibrated_us_cm", raw ADC integer when "raw_adc"
  /** Optional discriminator — older readings written before WH52 support
   *  may lack this; treat absent as "raw_adc" for back-compat. */
  ec_source?: EcSource;
}

export interface ValveReading {
  state: "on" | "off";
}

export type DeviceReadingData = SoilReading | ValveReading;

// ─── Device metadata shapes (stored in devices.metadata jsonb) ─────────────────

/**
 * eWeLink valve metadata.
 *
 * use_sub_device controls which API call pattern is used in ewelink-control:
 *   false → command sent directly to direct_device_id
 *   true  → command sent to parent_device_id (the Zigbee Bridge Pro)
 *            with sub_device_id identifying the valve
 *
 * This flag will be confirmed once hardware arrives and set permanently.
 * The control function supports both patterns without any other code changes.
 */
export interface EwelinkDeviceMeta {
  model: string;
  use_sub_device: boolean;
  parent_device_id?: string;  // Bridge Pro device ID (use_sub_device = true)
  sub_device_id?: string;     // Valve's own ID under the bridge
  direct_device_id?: string;  // Used when use_sub_device = false
  // User-configured dead-man's switch default duration in seconds
  default_duration_seconds: number;
}

/** Ecowitt soil sensor model — drives EC unit + UI copy. */
export type EcowittSoilModel = "WH51" | "WH52";

/** Ecowitt soil sensor metadata. */
export interface EcowittDeviceMeta {
  /** Sensor hardware model. WH51 = soil moisture only (EC is raw ADC).
   *  WH52 = multi-parameter (moisture + soil temp + calibrated EC). */
  model: EcowittSoilModel;
  channel: number;       // Sensor channel on the gateway (1–8)
  gateway_mac: string;   // MAC address of the Ecowitt gateway
}

export type DeviceMeta = EwelinkDeviceMeta | EcowittDeviceMeta;

// ─── Aggregated query response shapes (returned by integrations-readings-query) ─

export type AggregatePeriod = "24h" | "7d" | "30d" | "12m" | "all";
export type AggregateLevel  = "raw" | "hourly" | "daily";

export interface ReadingsBucket {
  bucket: string;          // ISO timestamp of the period start
  soil_temp?: number;
  soil_moisture?: number;
  soil_ec?: number;
  state?: "on" | "off";    // For valve: most recent state in bucket
}

export interface ReadingsQueryResponse {
  device_id: string;
  device_type: DeviceType;
  period: AggregatePeriod;
  aggregate: AggregateLevel;
  rows: ReadingsBucket[];
}

// ─── Command parameter shapes ──────────────────────────────────────────────────

export interface ValveCommandParams {
  duration_seconds: number;  // How long to stay on before auto-off
}
