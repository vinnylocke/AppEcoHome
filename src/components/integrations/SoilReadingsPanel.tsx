import React from "react";
import { Zap, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { IconTemperature, IconWatering } from "../../constants/icons";
import InfoTooltip from "../InfoTooltip";

/** Discriminator for the EC value's calibration state. Mirror of the
 *  server-side `EcSource` in `_shared/integrations/providerTypes.ts`. */
export type EcSource = "calibrated_us_cm" | "raw_adc";

export interface SoilReading {
  soil_temp: number;
  soil_moisture: number;
  soil_ec: number;
  /** Optional — older readings written before 2026-06-16 lack this and
   *  are treated as raw ADC for back-compat (WH51 behaviour). */
  ec_source?: EcSource;
}

interface Props {
  current: SoilReading | null;
  previous: SoilReading | null;
}

export default function SoilReadingsPanel({ current, previous }: Props) {
  if (!current) {
    return (
      <div className="text-center text-sm text-rhozly-on-surface-variant py-6">
        No readings yet — awaiting first sync.
      </div>
    );
  }

  // 2026-06-16 — WH52 support. EC reading meaning depends on sensor model:
  //   calibrated_us_cm — WH52 reports real µS/cm we can render directly.
  //   raw_adc          — WH51 only exposes a raw ADC integer; Ecowitt
  //                      doesn't publish a conversion to µS/cm so we
  //                      surface it as "raw ADC" with a tooltip
  //                      explaining the limitation. Reading rows
  //                      written before this change are treated as raw
  //                      ADC for back-compat.
  const ecSource: EcSource = current.ec_source ?? "raw_adc";
  const ecCalibrated = ecSource === "calibrated_us_cm";
  const ecValue = ecCalibrated
    ? `${current.soil_ec.toFixed(0)} µS/cm`
    : `${current.soil_ec.toFixed(0)}`;
  const ecLabel = ecCalibrated ? "Conductivity" : "Conductivity (raw)";

  const tiles = [
    {
      label: "Soil Temp",
      value: `${current.soil_temp.toFixed(1)}°C`,
      icon: IconTemperature,
      iconClass: "text-orange-500",
      bgClass: "bg-orange-50",
      delta: previous ? current.soil_temp - previous.soil_temp : null,
      tooltip: null as React.ReactNode,
    },
    {
      label: "Moisture",
      value: `${current.soil_moisture.toFixed(1)}%`,
      icon: IconWatering,
      iconClass: "text-blue-500",
      bgClass: "bg-blue-50",
      delta: previous ? current.soil_moisture - previous.soil_moisture : null,
      tooltip: null as React.ReactNode,
    },
    {
      label: ecLabel,
      value: ecValue,
      icon: Zap,
      iconClass: "text-yellow-500",
      bgClass: "bg-yellow-50",
      delta: previous ? current.soil_ec - previous.soil_ec : null,
      tooltip: ecCalibrated
        ? "Soil electrical conductivity in microsiemens per centimetre (µS/cm). Reported by your WH52 multi-parameter sensor."
        : "Raw ADC reading from the WH51 sensor's EC pin. Ecowitt doesn't publish a conversion to µS/cm, so use it as a relative indicator only — higher = more dissolved salts. Upgrade to the WH52 multi-parameter sensor for calibrated µS/cm readings.",
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-3">
      {tiles.map((t) => (
        <div key={t.label} className={`rounded-2xl ${t.bgClass} p-4`}>
          <div className={`w-8 h-8 rounded-xl bg-white flex items-center justify-center mb-2`}>
            <t.icon className={t.iconClass} size={16} />
          </div>
          <p className="text-xs font-medium text-rhozly-on-surface-variant mb-1 inline-flex items-center gap-1">
            {t.label}
            {t.tooltip && (
              <InfoTooltip
                size={11}
                data-testid={`soil-reading-tooltip-${t.label.toLowerCase().replace(/\s+/g, "-")}`}
                content={t.tooltip as string}
              />
            )}
          </p>
          <p className="text-lg font-black text-rhozly-on-surface">{t.value}</p>
          {t.delta !== null && <Trend delta={t.delta} />}
        </div>
      ))}
    </div>
  );
}

function Trend({ delta }: { delta: number }) {
  if (Math.abs(delta) < 0.1) {
    return <span className="flex items-center gap-0.5 text-xs text-rhozly-on-surface-variant mt-1"><Minus size={12} /> Stable</span>;
  }
  const up = delta > 0;
  return (
    <span className={`flex items-center gap-0.5 text-xs mt-1 ${up ? "text-green-600" : "text-red-500"}`}>
      {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      {up ? "+" : ""}{delta.toFixed(1)}
    </span>
  );
}
