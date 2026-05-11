import React from "react";
import type { WizardState } from "../ConnectDeviceWizard";

interface Props {
  state: WizardState;
  update: (patch: Partial<WizardState>) => void;
  onNext: () => void;
}

const BRANDS: Record<"soil_sensor" | "water_valve", { id: "ecowitt" | "ewelink"; label: string; subtitle: string }[]> = {
  soil_sensor: [
    { id: "ecowitt", label: "Ecowitt", subtitle: "WH51 wireless soil sensor via Ecowitt gateway" },
  ],
  water_valve: [
    { id: "ewelink", label: "SONOFF eWeLink", subtitle: "Zigbee valve via eWeLink cloud + Zigbee Bridge Pro" },
  ],
};

export default function Step2Brand({ state, update, onNext }: Props) {
  const options = BRANDS[state.deviceType ?? "soil_sensor"] ?? [];

  return (
    <div>
      <h2 className="text-xl font-black text-rhozly-on-surface mb-1">Choose your brand</h2>
      <p className="text-sm text-rhozly-on-surface-variant mb-6">
        Select the manufacturer of your {state.deviceType === "soil_sensor" ? "soil sensor" : "water valve"}.
      </p>

      <div className="space-y-3">
        {options.map((b) => (
          <button
            key={b.id}
            onClick={() => { update({ brand: b.id }); onNext(); }}
            data-testid={`brand-${b.id}`}
            className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-rhozly-outline/20 text-left hover:border-rhozly-primary/40 hover:bg-rhozly-surface transition-all duration-150"
          >
            <div className="w-12 h-12 rounded-2xl bg-rhozly-primary/10 flex items-center justify-center shrink-0">
              <span className="text-rhozly-primary font-black text-sm">{b.label[0]}</span>
            </div>
            <div>
              <p className="font-bold text-rhozly-on-surface">{b.label}</p>
              <p className="text-sm text-rhozly-on-surface-variant mt-0.5">{b.subtitle}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
