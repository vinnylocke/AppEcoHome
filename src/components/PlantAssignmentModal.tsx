import React, { useState } from "react";
import {
  X,
  MapPin,
  Hash,
  Sprout,
  Calendar,
  Check,
  Loader2,
  Info,
  Navigation,
} from "lucide-react";

interface PlantAssignmentModalProps {
  plant: any;
  locations: any[]; // 🚀 Changed from availableAreas to structured locations
  onAssign: (data: any) => void;
  onClose: () => void;
  isAssigning: boolean;
}

const GROWTH_STATES = [
  "Germination",
  "Seedling",
  "Vegetative",
  "Budding/Pre-Flowering",
  "Flowering/Bloom",
  "Fruiting/Pollination",
  "Ripening/Maturity",
  "Senescence",
];

export default function PlantAssignmentModal({
  plant,
  locations,
  onAssign,
  onClose,
  isAssigning,
}: PlantAssignmentModalProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedLoc, setSelectedLoc] = useState(""); // 🚀 New State for Location Filter

  const [formData, setFormData] = useState({
    areaId: "",
    quantity: 1,
    isPlanted: false,
    plantedDate: new Date().toISOString().split("T")[0],
    isEstablished: false,
    growthState: "Vegetative",
  });

  // 🚀 Dynamically get areas based on the selected location
  const availableAreas = selectedLoc
    ? locations.find((l) => l.id === selectedLoc)?.areas || []
    : [];

  const handleNext = () => {
    if (!formData.areaId) return;
    setStep(2);
  };

  const handleSubmit = () => {
    onAssign({
      ...formData,
      status: formData.isPlanted ? "Planted" : "In Shed",
    });
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-rhozly-bg/95 backdrop-blur-xl animate-in fade-in duration-300">
      <div className="bg-rhozly-surface-lowest w-full max-w-lg rounded-[3rem] p-8 shadow-2xl border border-rhozly-outline/20 relative overflow-hidden">
        <div className="flex justify-between items-start mb-8 relative z-10">
          <div>
            <h3 className="text-3xl font-black text-rhozly-on-surface">
              Assign Plant
            </h3>
            <p className="text-sm font-bold text-rhozly-primary uppercase tracking-widest mt-1">
              {plant.common_name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-3 bg-rhozly-surface-low rounded-2xl hover:scale-110 transition-transform"
          >
            <X size={24} />
          </button>
        </div>

        {/* STEP 1: Location & Quantity */}
        {step === 1 && (
          <div className="space-y-6 animate-in slide-in-from-right-4 relative z-10">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* 🚀 NEW: Location Dropdown */}
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-[10px] font-black uppercase text-rhozly-on-surface/40 ml-1">
                  <MapPin size={14} /> 1. Location
                </label>
                <select
                  value={selectedLoc}
                  onChange={(e) => {
                    setSelectedLoc(e.target.value);
                    setFormData({ ...formData, areaId: "" }); // Reset area when location changes
                  }}
                  className="w-full p-4 bg-rhozly-surface-low rounded-2xl font-bold border border-transparent focus:border-rhozly-primary outline-none cursor-pointer text-sm"
                >
                  <option value="">Select location...</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* 🚀 UPDATED: Area Dropdown (Filtered) */}
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-[10px] font-black uppercase text-rhozly-on-surface/40 ml-1">
                  <Navigation size={14} /> 2. Area *
                </label>
                <select
                  value={formData.areaId}
                  onChange={(e) =>
                    setFormData({ ...formData, areaId: e.target.value })
                  }
                  disabled={!selectedLoc}
                  className="w-full p-4 bg-rhozly-surface-low rounded-2xl font-bold border border-transparent focus:border-rhozly-primary outline-none disabled:opacity-50 cursor-pointer text-sm"
                >
                  <option value="">
                    {selectedLoc ? "Select area..." : "Select location first"}
                  </option>
                  {availableAreas.map((area: any) => (
                    <option key={area.id} value={area.id}>
                      {area.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-3">
              <label className="flex items-center gap-2 text-[10px] font-black uppercase text-rhozly-on-surface/40 ml-1">
                <Hash size={14} /> Quantity
              </label>
              <div className="flex items-center justify-between bg-rhozly-surface-low p-2 rounded-2xl">
                <button
                  onClick={() =>
                    setFormData((p) => ({
                      ...p,
                      quantity: Math.max(1, p.quantity - 1),
                    }))
                  }
                  className="w-14 h-14 bg-white rounded-xl shadow-sm font-black text-2xl hover:bg-rhozly-primary hover:text-white transition-colors"
                >
                  -
                </button>
                <span className="text-3xl font-black font-display">
                  {formData.quantity}
                </span>
                <button
                  onClick={() =>
                    setFormData((p) => ({ ...p, quantity: p.quantity + 1 }))
                  }
                  className="w-14 h-14 bg-white rounded-xl shadow-sm font-black text-2xl hover:bg-rhozly-primary hover:text-white transition-colors"
                >
                  +
                </button>
              </div>
              <p className="text-[10px] font-bold text-center text-rhozly-on-surface/40">
                This will create {formData.quantity} individual plant records.
              </p>
            </div>

            <button
              onClick={handleNext}
              disabled={!formData.areaId}
              className="w-full py-5 mt-4 bg-rhozly-primary text-white rounded-2xl font-black text-lg shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-[1.02] active:scale-95"
            >
              Next: Planting Details
            </button>
          </div>
        )}

        {/* STEP 2: Planting Status (Unchanged) */}
        {step === 2 && (
          <div className="space-y-6 animate-in slide-in-from-right-4 relative z-10">
            <div className="p-1 bg-rhozly-surface-low rounded-2xl flex">
              <button
                onClick={() => setFormData({ ...formData, isPlanted: false })}
                className={`flex-1 py-3 rounded-xl font-black text-sm transition-all ${!formData.isPlanted ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-on-surface/40 hover:text-rhozly-on-surface"}`}
              >
                In Pots / Unplanted
              </button>
              <button
                onClick={() => setFormData({ ...formData, isPlanted: true })}
                className={`flex-1 py-3 rounded-xl font-black text-sm transition-all ${formData.isPlanted ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-on-surface/40 hover:text-rhozly-on-surface"}`}
              >
                Planted in Ground
              </button>
            </div>

            {formData.isPlanted && (
              <div className="space-y-6 p-6 bg-rhozly-surface-low rounded-3xl animate-in zoom-in-95 border border-rhozly-outline/5">
                <div className="space-y-3">
                  <label className="flex items-center justify-between text-[10px] font-black uppercase text-rhozly-on-surface/60">
                    <div className="flex items-center gap-2">
                      <Calendar size={14} /> Date Planted
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer bg-white px-3 py-1.5 rounded-lg border border-rhozly-outline/10">
                      <input
                        type="checkbox"
                        checked={formData.isEstablished}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            isEstablished: e.target.checked,
                          })
                        }
                        className="accent-rhozly-primary"
                      />
                      <span className="text-[9px] tracking-widest text-rhozly-primary">
                        Already Established?
                      </span>
                    </label>
                  </label>
                  {!formData.isEstablished ? (
                    <input
                      type="date"
                      value={formData.plantedDate}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          plantedDate: e.target.value,
                        })
                      }
                      className="w-full p-4 bg-white rounded-xl font-bold border border-transparent focus:border-rhozly-primary outline-none"
                    />
                  ) : (
                    <div className="w-full p-4 bg-white/50 rounded-xl border border-dashed border-rhozly-outline/20 text-center opacity-60">
                      <p className="text-xs font-bold flex items-center justify-center gap-2">
                        <Info size={14} /> Date unknown (Established)
                      </p>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <label className="flex items-center gap-2 text-[10px] font-black uppercase text-rhozly-on-surface/40 ml-1">
                    <Sprout size={14} /> Current Growth State
                  </label>
                  <select
                    value={formData.growthState}
                    onChange={(e) =>
                      setFormData({ ...formData, growthState: e.target.value })
                    }
                    className="w-full p-4 bg-white rounded-xl font-bold border border-transparent focus:border-rhozly-primary outline-none cursor-pointer text-sm"
                  >
                    {GROWTH_STATES.map((state) => (
                      <option key={state} value={state}>
                        {state}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <div className="flex gap-4 pt-4">
              <button
                onClick={() => setStep(1)}
                className="px-6 py-5 rounded-2xl font-black text-rhozly-on-surface/40 hover:bg-rhozly-surface-low transition-all"
              >
                Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={isAssigning}
                className="flex-1 py-5 bg-rhozly-primary text-white rounded-2xl font-black text-lg shadow-xl shadow-rhozly-primary/20 flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
              >
                {isAssigning ? (
                  <Loader2 className="animate-spin" size={24} />
                ) : (
                  <>
                    <Check size={24} /> Confirm Assignment
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
