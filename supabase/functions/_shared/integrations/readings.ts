import type { DeviceReadingData } from "./providerTypes.ts";

interface InsertReadingParams {
  db: ReturnType<typeof import("https://esm.sh/@supabase/supabase-js@2").createClient>;
  deviceId: string;
  homeId: string;
  data: DeviceReadingData;
  recordedAt?: Date;
}

/**
 * Insert a reading for a device and update the device's last_seen_at timestamp.
 * Both operations run in the same round-trip (no transaction needed — last_seen_at
 * is informational and a partial failure leaves the reading intact).
 */
export async function insertReading({
  db,
  deviceId,
  homeId,
  data,
  recordedAt,
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

  // Best-effort — don't throw if this fails
  await db
    .from("devices")
    .update({ last_seen_at: ts })
    .eq("id", deviceId);
}
