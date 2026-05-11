import React from "react";
import { Thermometer, Droplets, CheckSquare, Square } from "lucide-react";
import type { WizardState } from "../ConnectDeviceWizard";

interface Props {
  state: WizardState;
  update: (patch: Partial<WizardState>) => void;
  onNext: () => void;
}

export default function Step4Discovery({ state, update, onNext }: Props) {
  const { discoveredDevices, selectedDeviceIds } = state;

  const toggle = (id: string) => {
    const has = selectedDeviceIds.includes(id);
    update({ selectedDeviceIds: has ? selectedDeviceIds.filter((x) => x !== id) : [...selectedDeviceIds, id] });
  };

  const toggleAll = () => {
    if (selectedDeviceIds.length === discoveredDevices.length) {
      update({ selectedDeviceIds: [] });
    } else {
      update({ selectedDeviceIds: discoveredDevices.map((d) => d.externalDeviceId) });
    }
  };

  const isSoil = state.deviceType === "soil_sensor";

  return (
    <div>
      <h2 className="text-xl font-black text-rhozly-on-surface mb-1">Discovered devices</h2>
      <p className="text-sm text-rhozly-on-surface-variant mb-6">
        {discoveredDevices.length === 0
          ? "No devices were found on this account. Check your credentials and that the gateway is online."
          : "Select the devices you want to add to Rhozly."}
      </p>

      {discoveredDevices.length > 1 && (
        <button
          onClick={toggleAll}
          className="flex items-center gap-2 text-sm font-semibold text-rhozly-primary mb-4"
        >
          {selectedDeviceIds.length === discoveredDevices.length ? <CheckSquare size={16} /> : <Square size={16} />}
          {selectedDeviceIds.length === discoveredDevices.length ? "Deselect all" : "Select all"}
        </button>
      )}

      {discoveredDevices.length === 0 ? (
        <div className="py-8 text-center text-rhozly-on-surface-variant text-sm">
          No devices found on this account.
        </div>
      ) : (
        <div className="space-y-2 mb-6">
          {discoveredDevices.map((d) => {
            const selected = selectedDeviceIds.includes(d.externalDeviceId);
            return (
              <button
                key={d.externalDeviceId}
                onClick={() => toggle(d.externalDeviceId)}
                data-testid={`discover-${d.externalDeviceId}`}
                className={`w-full flex items-center gap-3 p-4 rounded-2xl border-2 text-left transition-all ${
                  selected
                    ? "border-rhozly-primary bg-rhozly-primary/5"
                    : "border-rhozly-outline/20 hover:border-rhozly-primary/30"
                }`}
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isSoil ? "bg-amber-100" : "bg-blue-100"}`}>
                  {isSoil ? <Thermometer className="text-amber-600" size={18} /> : <Droplets className="text-blue-600" size={18} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-rhozly-on-surface text-sm">{d.name}</p>
                  <p className="text-xs text-rhozly-on-surface-variant">{d.model}{d.channel ? ` · Channel ${d.channel}` : ""}</p>
                </div>
                {selected ? (
                  <CheckSquare className="text-rhozly-primary shrink-0" size={20} />
                ) : (
                  <Square className="text-rhozly-on-surface-variant/40 shrink-0" size={20} />
                )}
              </button>
            );
          })}
        </div>
      )}

      <button
        onClick={onNext}
        disabled={selectedDeviceIds.length === 0 && discoveredDevices.length > 0}
        data-testid="discovery-next"
        className="w-full py-3.5 rounded-2xl bg-rhozly-primary text-white font-bold hover:bg-rhozly-primary/90 disabled:opacity-40 transition-colors"
      >
        {discoveredDevices.length === 0 ? "Skip" : `Add ${selectedDeviceIds.length} device${selectedDeviceIds.length !== 1 ? "s" : ""}`}
      </button>
    </div>
  );
}
