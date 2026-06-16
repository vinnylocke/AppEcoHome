import type { DeviceReadingData } from "./providerTypes.ts";

interface InsertReadingParams {
  db: ReturnType<typeof import("https://esm.sh/@supabase/supabase-js@2").createClient>;
  deviceId: string;
  homeId: string;
  data: DeviceReadingData;
  recordedAt?: Date;
  /**
   * Explicit battery override. If omitted, the helper looks at
   * `data.battery_percent` instead. Either way, when a valid 0-100
   * integer is present, the helper also refreshes
   * `devices.battery_percent` + `devices.battery_reported_at` so
   * `BatteryPip` + `DeviceBatteryPanel` don't have to scan reading
   * history on every render.
   */
  batteryPercent?: number | null;
}

function normaliseBatteryPercent(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < 0 || value > 100) return null;
  return Math.round(value);
}

/**
 * Insert a reading for a device and update the device's last_seen_at +
 * battery_* columns. Best-effort on the device-row updates — a partial
 * failure leaves the reading row intact and the caller doesn't need to
 * care (we only throw on the reading insert itself).
 *
 * Battery dual-write:
 *   - The reading row carries battery inside `data.battery_percent`
 *     (this provides the time-series for the decay sparkline).
 *   - The devices row carries the "latest known" value + timestamp so
 *     the pip on DeviceCard renders without a per-card query.
 * Adapters and provider sync functions just put `battery_percent` in
 * the `data` object; this helper handles the rest.
 */
export async function insertReading({
  db,
  deviceId,
  homeId,
  data,
  recordedAt,
  batteryPercent,
}: InsertReadingParams): Promise<void> {
  const ts = (recordedAt ?? new Date()).toISOString();

  const { error: readingError } = await db.from("device_readings").insert({
    device_id: deviceId,
    home_id: homeId,
    recorded_at: ts,
    data,
  });

  if (readingError) {
    throw new Error(`Failed to insert reading: ${readingError.message}`);
  }

  const explicit = batteryPercent === null
    ? null
    : batteryPercent === undefined
      ? null
      : normaliseBatteryPercent(batteryPercent);
  const fromData = normaliseBatteryPercent((data as { battery_percent?: unknown }).battery_percent);
  const battery = explicit ?? fromData;

  const updates: Record<string, unknown> = { last_seen_at: ts };
  if (battery !== null) {
    updates.battery_percent = battery;
    updates.battery_reported_at = ts;
  }

  // Best-effort — don't throw if this fails, but DO log the error so
  // silent failures (e.g. battery columns missing on prod after a
  // partial migration) are visible in the log stream rather than
  // making the pip stay stubbornly null with no breadcrumb.
  const { error: updateErr } = await db
    .from("devices")
    .update(updates)
    .eq("id", deviceId);
  if (updateErr) {
    console.warn(
      `insertReading: devices update failed for device=${deviceId} battery=${battery} columns=${JSON.stringify(Object.keys(updates))} :: ${updateErr.message}`,
    );
  }
}
