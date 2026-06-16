import React, { useState } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft } from "lucide-react";
import Step1DeviceType from "./wizard/Step1DeviceType";
import Step2Brand from "./wizard/Step2Brand";
import Step3Credentials from "./wizard/Step3Credentials";
import Step4Discovery from "./wizard/Step4Discovery";
import Step5Confirm from "./wizard/Step5Confirm";
import { useFocusTrap } from "../../hooks/useFocusTrap";

interface Props {
  homeId: string;
  onComplete: () => void;
  onClose: () => void;
  initialStep?: number;
  initialState?: Partial<WizardState>;
}

export interface WizardState {
  deviceType: "soil_sensor" | "water_valve" | null;
  /** 2026-06-16 Custom integrations Phase 3 — `custom_http` joins
   *  the brand union. Adapter-aware providers go through the
   *  integrations-adapter-connect dispatcher; legacy providers
   *  (ecowitt, ewelink) still hit their own edge functions. */
  brand: "ecowitt" | "ewelink" | "custom_http" | null;
  credentials: Record<string, string>;
  integrationId: string | null;
  discoveredDevices: DiscoveredDevice[];
  selectedDeviceIds: string[];
  /** Returned by the connect edge function when discovery runs. Lets
   *  the discovery step show the raw response shape if nothing was
   *  found, so the user can paste it back when filing an issue. */
  discoveryDiagnostics?: {
    api_code?: number | null;
    api_msg?: string | null;
    data_keys?: string[];
    gateway_listed?: boolean | null;
  } | null;
  /** 2026-06-16 Custom integrations Phase 3 — set when the adapter
   *  returns setup instructions after `connect()` (e.g. custom_http
   *  surfaces the user's webhook URL + JSON contract). Rendered by a
   *  new pre-discovery wizard step. */
  postConnect?: {
    title: string;
    instructions: string;
    webhookUrl?: string;
    samplePayload?: string;
  } | null;
}

export interface DiscoveredDevice {
  externalDeviceId: string;
  name: string;
  channel?: number;
  model: string;
  isSubDevice?: boolean;
  parentDeviceId?: string | null;
  subDeviceId?: string | null;
}

const STEPS = ["Device Type", "Brand", "Credentials", "Devices", "Confirm"];

export default function ConnectDeviceWizard({ homeId, onComplete, onClose, initialStep, initialState }: Props) {
  const trapRef = useFocusTrap<HTMLDivElement>(true);
  const [step, setStep] = useState(initialStep ?? 0);
  const [state, setState] = useState<WizardState>({
    deviceType: null,
    brand: null,
    credentials: {},
    integrationId: null,
    discoveredDevices: [],
    selectedDeviceIds: [],
    ...initialState,
  });

  const update = (patch: Partial<WizardState>) =>
    setState((prev) => ({ ...prev, ...patch }));

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const stepProps = { homeId, state, update, onNext: next, onBack: back, onComplete };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-label="Connect device wizard"
        className="relative w-[calc(100vw-2rem)] max-w-lg bg-white rounded-3xl shadow-xl max-h-[90vh] overflow-y-auto"
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
            aria-label="Close wizard"
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
    </div>,
    document.body,
  );
}
