// Builds the compact "latest reading" chips shown on a DeviceCard so users can
// glance moisture / temp / EC (soil sensors) or open/closed (valves) without
// opening the detail modal. Pure + tested. Driven by the latest device_readings
// `data` jsonb (see latest_device_readings RPC).

export type ChipTone = "moisture" | "temp" | "ec" | "state-on" | "state-off";
export interface ReadingChip {
  label: string;
  tone: ChipTone;
}

export function buildReadingChips(
  deviceType: "soil_sensor" | "water_valve",
  data: Record<string, unknown> | null | undefined,
  ecSource?: "calibrated_us_cm" | "raw_adc" | null,
): ReadingChip[] {
  if (!data) return [];
  const chips: ReadingChip[] = [];

  if (deviceType === "water_valve") {
    const state = data.state;
    if (state === "on" || state === "off") {
      chips.push({ label: state === "on" ? "Open" : "Closed", tone: state === "on" ? "state-on" : "state-off" });
    }
    return chips;
  }

  // Soil sensor
  const m = data.soil_moisture;
  if (typeof m === "number" && Number.isFinite(m)) chips.push({ label: `${Math.round(m)}%`, tone: "moisture" });

  const t = data.soil_temp;
  if (typeof t === "number" && Number.isFinite(t)) chips.push({ label: `${t.toFixed(1)}°C`, tone: "temp" });

  const ec = data.soil_ec;
  if (typeof ec === "number" && Number.isFinite(ec)) {
    const src = (typeof data.ec_source === "string" ? data.ec_source : ecSource) ?? null;
    const unit = src === "calibrated_us_cm" ? " µS/cm" : "";
    chips.push({ label: `EC ${ec}${unit}`, tone: "ec" });
  }

  return chips;
}
