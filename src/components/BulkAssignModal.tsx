import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, MapPin, Loader2, Minus, Plus, Navigation, BrainCircuit } from "lucide-react";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { getLocalDateString } from "../lib/taskEngine";

interface BulkAssignData {
  areaId: string;
  status: string;
  isPlanted: boolean;
  isEstablished: boolean;
  plantedDate: string;
  growthState: string;
  smartSchedules: boolean;
  quantities: Record<number, number>;
}

interface Props {
  plants: any[];
  locations: any[];
  homeId: string;
  aiEnabled?: boolean;
  isAssigning: boolean;
  onAssign: (data: BulkAssignData) => Promise<void> | void;
  onClose: () => void;
}

const GROWTH_STATES = [
  "Germination",
  "Seedling",
  "Vegetative",
  "Budding/Pre-Flowering",
  "Flowering/Bloom",
  "Fruiting/Pollination",
  "Ripening/Maturity",
];

/**
 * Bulk assign — place a chosen quantity of each selected plant into one
 * target area (or "in the garden, area unknown"). Optionally generates a
 * smart planting schedule per plant (applied server-side by the host).
 * The per-plant AI method picker from the single-assign flow is collapsed
 * into one "smart schedules" toggle to keep the bulk action quick.
 */
export default function BulkAssignModal({
  plants,
  locations,
  aiEnabled = false,
  isAssigning,
  onAssign,
  onClose,
}: Props) {
  const trapRef = useFocusTrap<HTMLDivElement>(true);

  const [selectedLoc, setSelectedLoc] = useState("");
  const [areaId, setAreaId] = useState("");
  const [noArea, setNoArea] = useState(false);
  const [isPlanted, setIsPlanted] = useState(false);
  const [isEstablished, setIsEstablished] = useState(false);
  const [plantedDate, setPlantedDate] = useState(getLocalDateString(new Date()));
  const [growthState, setGrowthState] = useState("Vegetative");
  const [smartSchedules, setSmartSchedules] = useState(true);
  const [quantities, setQuantities] = useState<Record<number, number>>(() =>
    Object.fromEntries(plants.map((p) => [p.id, 1])),
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isAssigning) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, isAssigning]);

  const availableAreas = selectedLoc
    ? locations.find((l) => l.id === selectedLoc)?.areas || []
    : [];
  const hasTarget = noArea || !!areaId;
  const totalCount = plants.reduce((acc, p) => acc + (quantities[p.id as number] ?? 1), 0);
  const showSmart = !noArea && !!areaId && aiEnabled;

  const setQty = (id: number, next: number) =>
    setQuantities((q) => ({ ...q, [id]: Math.max(1, Math.min(99, next)) }));

  const handleConfirm = () => {
    if (!hasTarget || isAssigning) return;
    onAssign({
      areaId: noArea ? "" : areaId,
      status: isPlanted ? "Planted" : "Unplanted",
      isPlanted,
      isEstablished,
      plantedDate,
      growthState,
      smartSchedules: showSmart && smartSchedules,
      quantities,
    });
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-rhozly-bg/95 backdrop-blur-xl animate-in fade-in duration-300">
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-label="Assign plants to area"
        data-testid="bulk-assign-modal"
        className="bg-rhozly-surface-lowest w-full max-w-lg max-h-[90vh] overflow-y-auto custom-scrollbar rounded-3xl p-6 sm:p-8 shadow-2xl border border-rhozly-outline/20"
      >
        <div className="flex justify-between items-start mb-6">
          <div>
            <h3 className="text-2xl sm:text-3xl font-black text-rhozly-on-surface">Assign plants</h3>
            <p className="text-sm font-bold text-rhozly-primary uppercase tracking-widest mt-1">
              {plants.length} type{plants.length !== 1 ? "s" : ""} · {totalCount} plant{totalCount !== 1 ? "s" : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-3 bg-rhozly-surface-low rounded-2xl hover:scale-110 transition-transform"
          >
            <X size={22} />
          </button>
        </div>

        {/* Target: location + area, or "add to garden" */}
        <div className="space-y-3 mb-5">
          <label className="flex items-center gap-2 text-[10px] font-black uppercase text-rhozly-on-surface/40">
            <MapPin size={14} /> Where to
          </label>
          {!noArea && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <select
                data-testid="bulk-assign-location"
                value={selectedLoc}
                onChange={(e) => { setSelectedLoc(e.target.value); setAreaId(""); }}
                className="w-full p-3 bg-rhozly-surface-low rounded-2xl font-bold border border-transparent focus:border-rhozly-primary outline-none text-sm"
              >
                <option value="">Select location…</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
              <select
                data-testid="bulk-assign-area"
                value={areaId}
                disabled={!selectedLoc}
                onChange={(e) => setAreaId(e.target.value)}
                className="w-full p-3 bg-rhozly-surface-low rounded-2xl font-bold border border-transparent focus:border-rhozly-primary outline-none text-sm disabled:opacity-50"
              >
                <option value="">Select area…</option>
                {availableAreas.map((a: any) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          )}
          <button
            type="button"
            data-testid="bulk-assign-no-area"
            onClick={() => { setNoArea((v) => !v); setAreaId(""); setSelectedLoc(""); }}
            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl text-xs font-black border transition-colors ${
              noArea
                ? "bg-rhozly-primary text-white border-rhozly-primary"
                : "bg-white text-rhozly-on-surface/70 border-rhozly-outline/20 hover:border-rhozly-primary/30"
            }`}
          >
            <Navigation size={13} /> {noArea ? "Adding to garden (no area)" : "Add to garden — choose an area later"}
          </button>
        </div>

        {/* Per-plant quantities */}
        <div className="space-y-2 mb-5">
          <label className="text-[10px] font-black uppercase text-rhozly-on-surface/40">How many of each</label>
          <ul className="space-y-1.5 max-h-[40vh] overflow-y-auto custom-scrollbar">
            {plants.map((p) => {
              const qty = quantities[p.id as number] ?? 1;
              return (
                <li key={p.id} className="flex items-center gap-3 bg-rhozly-surface-low rounded-2xl p-2.5">
                  <span className="flex-1 min-w-0 font-black text-sm text-rhozly-on-surface truncate">{p.common_name}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      aria-label={`Decrease ${p.common_name}`}
                      onClick={() => setQty(p.id as number, qty - 1)}
                      className="w-8 h-8 pointer-coarse:w-11 pointer-coarse:h-11 rounded-xl bg-white border border-rhozly-outline/20 flex items-center justify-center text-rhozly-on-surface/60 can-hover:hover:text-rhozly-primary disabled:opacity-40"
                      disabled={qty <= 1}
                    >
                      <Minus size={14} />
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={99}
                      value={qty}
                      data-testid={`bulk-assign-qty-${p.id}`}
                      onChange={(e) => setQty(p.id as number, parseInt(e.target.value, 10) || 1)}
                      className="w-12 text-center py-1.5 rounded-xl bg-white border border-rhozly-outline/20 font-black text-sm outline-none focus:border-rhozly-primary"
                    />
                    <button
                      type="button"
                      aria-label={`Increase ${p.common_name}`}
                      onClick={() => setQty(p.id as number, qty + 1)}
                      className="w-8 h-8 pointer-coarse:w-11 pointer-coarse:h-11 rounded-xl bg-white border border-rhozly-outline/20 flex items-center justify-center text-rhozly-on-surface/60 can-hover:hover:text-rhozly-primary"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Planted state */}
        <div className="space-y-3 mb-5">
          <label className="flex items-center justify-between bg-rhozly-surface-low rounded-2xl p-3 cursor-pointer">
            <span className="text-sm font-black text-rhozly-on-surface">Already planted in the ground?</span>
            <input
              type="checkbox"
              checked={isPlanted}
              onChange={(e) => setIsPlanted(e.target.checked)}
              data-testid="bulk-assign-planted"
              className="w-5 h-5 accent-rhozly-primary"
            />
          </label>
          {isPlanted && (
            <div className="space-y-3 pl-1">
              <label className="flex items-center justify-between bg-rhozly-surface-low rounded-2xl p-3 cursor-pointer">
                <span className="text-xs font-bold text-rhozly-on-surface/70">Established (in for 1+ season)</span>
                <input
                  type="checkbox"
                  checked={isEstablished}
                  onChange={(e) => setIsEstablished(e.target.checked)}
                  className="w-5 h-5 accent-rhozly-primary"
                />
              </label>
              {!isEstablished && (
                <input
                  type="date"
                  value={plantedDate}
                  onChange={(e) => setPlantedDate(e.target.value)}
                  className="w-full p-3 bg-rhozly-surface-low rounded-2xl font-bold border border-transparent focus:border-rhozly-primary outline-none text-sm"
                />
              )}
              <select
                value={growthState}
                onChange={(e) => setGrowthState(e.target.value)}
                className="w-full p-3 bg-rhozly-surface-low rounded-2xl font-bold border border-transparent focus:border-rhozly-primary outline-none text-sm"
              >
                {GROWTH_STATES.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Smart schedules */}
        {showSmart && (
          <label className="flex items-start gap-3 bg-rhozly-primary/5 border border-rhozly-primary/15 rounded-2xl p-3 mb-5 cursor-pointer">
            <input
              type="checkbox"
              checked={smartSchedules}
              onChange={(e) => setSmartSchedules(e.target.checked)}
              data-testid="bulk-assign-smart-schedules"
              className="mt-0.5 w-5 h-5 accent-rhozly-primary"
            />
            <span className="flex-1 text-sm">
              <span className="font-black text-rhozly-on-surface flex items-center gap-1.5">
                <BrainCircuit size={14} className="text-rhozly-primary" /> Smart planting schedules
              </span>
              <span className="block text-xs font-bold text-rhozly-on-surface/50 mt-0.5">
                Generate a recommended planting plan for each plant in this area and add the tasks. Uses your AI quota.
              </span>
            </span>
          </label>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={isAssigning}
            className="flex-1 py-3.5 rounded-2xl font-bold bg-rhozly-surface-low hover:bg-rhozly-surface text-rhozly-on-surface disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!hasTarget || isAssigning}
            data-testid="bulk-assign-confirm"
            className="flex-1 py-3.5 rounded-2xl font-black text-white bg-rhozly-primary hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isAssigning ? <Loader2 className="animate-spin" size={18} /> : `Assign ${totalCount} plant${totalCount !== 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
