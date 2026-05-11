import React from "react";
import { Thermometer, Droplets, Zap, TrendingUp, TrendingDown, Minus } from "lucide-react";

export interface SoilReading {
  soil_temp: number;
  soil_moisture: number;
  soil_ec: number;
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

  const tiles = [
    {
      label: "Soil Temp",
      value: `${current.soil_temp.toFixed(1)}°C`,
      icon: Thermometer,
      iconClass: "text-orange-500",
      bgClass: "bg-orange-50",
      delta: previous ? current.soil_temp - previous.soil_temp : null,
    },
    {
      label: "Moisture",
      value: `${current.soil_moisture.toFixed(1)}%`,
      icon: Droplets,
      iconClass: "text-blue-500",
      bgClass: "bg-blue-50",
      delta: previous ? current.soil_moisture - previous.soil_moisture : null,
    },
    {
      label: "Conductivity",
      value: `${current.soil_ec.toFixed(0)} µS`,
      icon: Zap,
      iconClass: "text-yellow-500",
      bgClass: "bg-yellow-50",
      delta: previous ? current.soil_ec - previous.soil_ec : null,
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-3">
      {tiles.map((t) => (
        <div key={t.label} className={`rounded-2xl ${t.bgClass} p-4`}>
          <div className={`w-8 h-8 rounded-xl bg-white flex items-center justify-center mb-2`}>
            <t.icon className={t.iconClass} size={16} />
          </div>
          <p className="text-xs font-medium text-rhozly-on-surface-variant mb-1">{t.label}</p>
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
