import React from "react";
import { Thermometer, Droplets } from "lucide-react";
import type { WizardState } from "../ConnectDeviceWizard";

interface Props {
  state: WizardState;
  update: (patch: Partial<WizardState>) => void;
  onNext: () => void;
}

const TYPES = [
  {
    id: "soil_sensor" as const,
    label: "Soil Sensor",
    description: "Monitor soil temperature, moisture, and conductivity",
    icon: Thermometer,
    iconClass: "text-amber-600",
    bgClass: "bg-amber-100",
  },
  {
    id: "water_valve" as const,
    label: "Water Valve",
    description: "Remote-controlled irrigation valve with auto-off safety timer",
    icon: Droplets,
    iconClass: "text-blue-600",
    bgClass: "bg-blue-100",
  },
];

export default function Step1DeviceType({ state, update, onNext }: Props) {
  return (
    <div>
      <h2 className="text-xl font-black text-rhozly-on-surface mb-1">What are you connecting?</h2>
      <p className="text-sm text-rhozly-on-surface-variant mb-6">Choose the type of device you want to add.</p>

      <div className="space-y-3">
        {TYPES.map((t) => (
          <button
            key={t.id}
            onClick={() => { update({ deviceType: t.id, brand: null }); onNext(); }}
            data-testid={`device-type-${t.id}`}
            className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all duration-150 ${
              state.deviceType === t.id
                ? "border-rhozly-primary bg-rhozly-primary/5"
                : "border-rhozly-outline/20 hover:border-rhozly-primary/40 hover:bg-rhozly-surface"
            }`}
          >
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${t.bgClass}`}>
              <t.icon className={t.iconClass} size={24} />
            </div>
            <div>
              <p className="font-bold text-rhozly-on-surface">{t.label}</p>
              <p className="text-sm text-rhozly-on-surface-variant mt-0.5">{t.description}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
