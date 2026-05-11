import React, { useState } from "react";
import { X, ChevronLeft } from "lucide-react";
import Step1DeviceType from "./wizard/Step1DeviceType";
import Step2Brand from "./wizard/Step2Brand";
import Step3Credentials from "./wizard/Step3Credentials";
import Step4Discovery from "./wizard/Step4Discovery";
import Step5Confirm from "./wizard/Step5Confirm";

interface Props {
  homeId: string;
  onComplete: () => void;
  onClose: () => void;
}

export interface WizardState {
  deviceType: "soil_sensor" | "water_valve" | null;
  brand: "ecowitt" | "ewelink" | null;
  credentials: Record<string, string>;
  integrationId: string | null;
  discoveredDevices: DiscoveredDevice[];
  selectedDeviceIds: string[];
}

export interface DiscoveredDevice {
  externalDeviceId: string;
  name: string;
  channel?: number;
  model: string;
}

const STEPS = ["Device Type", "Brand", "Credentials", "Devices", "Confirm"];

export default function ConnectDeviceWizard({ homeId, onComplete, onClose }: Props) {
  const [step, setStep] = useState(0);
  const [state, setState] = useState<WizardState>({
    deviceType: null,
    brand: null,
    credentials: {},
    integrationId: null,
    discoveredDevices: [],
    selectedDeviceIds: [],
  });

  const update = (patch: Partial<WizardState>) =>
    setState((prev) => ({ ...prev, ...patch }));

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const stepProps = { homeId, state, update, onNext: next, onBack: back, onComplete };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-xl max-h-[90vh] overflow-y-auto"
        data-testid="connect-device-wizard"
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-rhozly-outline/10 px-6 py-4 flex items-center gap-3 rounded-t-3xl">
          {step > 0 && (
            <button onClick={back} className="p-1 -ml-1 text-rhozly-on-surface-variant hover:text-rhozly-on-surface">
              <ChevronLeft size={22} />
            </button>
          )}
          <div className="flex-1">
            <p className="text-xs text-rhozly-on-surface-variant font-medium">
              Step {step + 1} of {STEPS.length} — {STEPS[step]}
            </p>
            {/* Progress bar */}
            <div className="mt-2 h-1 bg-rhozly-outline/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-rhozly-primary rounded-full transition-all duration-300"
                style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
              />
            </div>
          </div>
          <button
            onClick={onClose}
            data-testid="wizard-close"
            className="p-1 text-rhozly-on-surface-variant hover:text-rhozly-on-surface"
          >
            <X size={20} />
          </button>
        </div>

        {/* Step content */}
        <div className="px-6 py-6">
          {step === 0 && <Step1DeviceType {...stepProps} />}
          {step === 1 && <Step2Brand {...stepProps} />}
          {step === 2 && <Step3Credentials {...stepProps} />}
          {step === 3 && <Step4Discovery {...stepProps} />}
          {step === 4 && <Step5Confirm {...stepProps} />}
        </div>
      </div>
    </div>
  );
}
