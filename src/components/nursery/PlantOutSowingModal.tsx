import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  X, ArrowUpRight, Loader2, Check, MapPin, ChevronDown, Sprout,
} from "lucide-react";
import toast from "react-hot-toast";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useCachedShed } from "../../hooks/useCachedShed";
import { Logger } from "../../lib/errorHandler";
import { AutomationEngine } from "../../lib/automationEngine";
import { logEvent, EVENT } from "../../events/registry";
import {
  fetchPlantedOutTotal,
  plantOutSowing,
  type SeedSowing,
} from "../../services/nurseryService";

interface Props {
  homeId: string;
  /** Sowing being planted out — needs id, sown_count, germinated_count. */
  sowing: Pick<SeedSowing, "id" | "sown_count" | "germinated_count">;
  /** Catalogue plant id (from packet.plant_id). Plant Out is disabled
   *  upstream when this is null, but typed defensively. */
  plantId: number;
  /** Used in the header so the user knows what they're planting. */
  packetLabel: string;
  onClose: () => void;
  /** Fires when the row was inserted + sowing status updated. */
  onPlantedOut?: () => void;
}

interface AreaOption {
  id: string;
  name: string;
}

interface LocationOption {
  id: string;
  name: string;
  areas: AreaOption[];
}

const todayIso = () => new Date().toISOString().split("T")[0];

/**
 * Plant Out — the marquee Nursery flow. Pick an area + planted date +
 * quantity, and we create an `inventory_items` row with
 * `from_sowing_id` set + `growth_state="Seedling"`. AutomationEngine's
 * existing `applyPlantedAutomations` then generates care blueprints
 * exactly as it would for any new assignment.
 *
 * Partial plant-outs are supported — the sowing only flips to
 * `planted_out` once the cumulative quantity hits `germinated_count`.
 */
export default function PlantOutSowingModal({
  homeId, sowing, plantId, packetLabel, onClose, onPlantedOut,
}: Props) {
  const trapRef = useFocusTrap<HTMLDivElement>(true);
  const { locations } = useCachedShed(homeId);

  const [alreadyPlanted, setAlreadyPlanted] = useState<number | null>(null);
  const remainingToPlant = useMemo(() => {
    const g = sowing.germinated_count ?? 0;
    if (alreadyPlanted == null) return g;
    return Math.max(0, g - alreadyPlanted);
  }, [sowing.germinated_count, alreadyPlanted]);

  const [locationId, setLocationId] = useState<string>("");
  const [areaId, setAreaId] = useState<string>("");
  const [plantedAt, setPlantedAt] = useState<string>(todayIso());
  const [quantity, setQuantity] = useState<number>(1);
  const [nickname, setNickname] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hydrate the "already planted out" count once so partial-mode UI is honest.
  useEffect(() => {
    let cancelled = false;
    fetchPlantedOutTotal(sowing.id)
      .then((n) => { if (!cancelled) setAlreadyPlanted(n); })
      .catch((err) => {
        Logger.error("PlantOutSowingModal alreadyPlanted fetch failed", err, { sowingId: sowing.id });
        if (!cancelled) setAlreadyPlanted(0);
      });
    return () => { cancelled = true; };
  }, [sowing.id]);

  // Default the quantity to whatever's left to plant once we know it.
  useEffect(() => {
    if (alreadyPlanted != null && remainingToPlant > 0) {
      setQuantity(remainingToPlant);
    }
  }, [alreadyPlanted, remainingToPlant]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = "unset"; };
  }, []);

  const locationOptions: LocationOption[] = useMemo(() => {
    return (locations ?? []).map((l: any) => ({
      id: l.id,
      name: l.name,
      areas: (l.areas ?? []).map((a: any) => ({ id: a.id, name: a.name })),
    }));
  }, [locations]);

  const selectedLocation = locationOptions.find((l) => l.id === locationId);
  const availableAreas = selectedLocation?.areas ?? [];
  const selectedArea = availableAreas.find((a) => a.id === areaId);

  const canSave =
    quantity > 0 &&
    quantity <= remainingToPlant &&
    !!plantedAt &&
    !!locationId &&
    !!areaId &&
    !saving;

  const handleSave = async () => {
    if (!canSave || !selectedLocation || !selectedArea) return;
    setSaving(true);
    setError(null);
    try {
      const result = await plantOutSowing({
        home_id: homeId,
        sowing_id: sowing.id,
        plant_id: plantId,
        location_id: selectedLocation.id,
        location_name: selectedLocation.name,
        area_id: selectedArea.id,
        area_name: selectedArea.name,
        planted_at: plantedAt,
        quantity,
        nickname: nickname.trim() || null,
      });

      // Fire AutomationEngine the same way PlantAssignmentModal does, so
      // the new seedling picks up watering / pruning blueprints anchored
      // to the chosen area.
      const itemForEngine = {
        id: result.inventory_item.id,
        home_id: result.inventory_item.home_id,
        plant_id: result.inventory_item.plant_id,
        area_id: result.inventory_item.area_id,
        quantity: result.inventory_item.quantity,
      };
      try {
        await AutomationEngine.applyPlantedAutomations(
          [itemForEngine],
          selectedArea.id,
          plantedAt,
        );
      } catch (engineErr) {
        // AutomationEngine failures shouldn't block the plant-out
        // itself — the instance is still real, the user can wire
        // schedules later from the Plant Edit modal.
        Logger.error("PlantOut AutomationEngine failed (non-fatal)", engineErr, {
          itemId: result.inventory_item.id,
        });
      }

      logEvent(EVENT.NURSERY_SOWING_PLANTED_OUT, {
        sowing_id: sowing.id,
        quantity,
        sowing_status_after: result.sowing_status,
        remaining_to_plant_out: result.remaining_to_plant_out,
      });

      const phrase =
        quantity === 1 ? "1 seedling" : `${quantity} seedlings`;
      const trail = result.remaining_to_plant_out > 0
        ? ` · ${result.remaining_to_plant_out} still on the bench`
        : "";
      toast.success(
        `${phrase} planted in ${selectedArea.name}${trail}.`,
      );
      onPlantedOut?.();
      onClose();
    } catch (err) {
      Logger.error("PlantOutSowingModal save failed", err, { sowingId: sowing.id });
      setError(err instanceof Error ? err.message : "Couldn't plant out — try again.");
    } finally {
      setSaving(false);
    }
  };

  const noLocations = locationOptions.length === 0;

  return createPortal(
    <div
      data-testid="plant-out-sowing-modal"
      className="fixed inset-0 z-[120] flex items-end sm:items-center sm:justify-center bg-black/40 backdrop-blur-sm animate-in fade-in"
      onClick={onClose}
    >
      <div
        ref={trapRef}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full sm:max-w-md bg-rhozly-bg rounded-t-3xl sm:rounded-3xl shadow-2xl border border-rhozly-outline/15 flex flex-col max-h-[92vh] overflow-hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <header className="shrink-0 px-5 pt-4 pb-3 flex items-start justify-between gap-3 border-b border-rhozly-outline/10">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700 mb-0.5 flex items-center gap-1">
              <ArrowUpRight size={11} />
              Plant out
            </p>
            <h2 className="font-display font-black text-rhozly-on-surface text-base leading-tight truncate">
              {packetLabel}
            </h2>
            <p className="text-[11px] text-rhozly-on-surface/55 mt-0.5">
              {alreadyPlanted == null ? (
                <span className="inline-flex items-center gap-1">
                  <Loader2 size={10} className="animate-spin" />
                  Checking what's left…
                </span>
              ) : remainingToPlant > 0 ? (
                <>
                  <span className="font-bold text-rhozly-on-surface/80">
                    {remainingToPlant}
                  </span>{" "}seedling{remainingToPlant === 1 ? "" : "s"} ready to plant out
                  {alreadyPlanted > 0 && (
                    <span className="text-rhozly-on-surface/45">
                      {" "}· {alreadyPlanted} already in the garden
                    </span>
                  )}
                </>
              ) : (
                <span className="text-rhozly-on-surface/65">
                  All seedlings from this sowing are already planted out.
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-10 h-10 rounded-2xl bg-white border border-rhozly-outline/15 text-rhozly-on-surface/60 hover:text-rhozly-primary flex items-center justify-center"
          >
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {noLocations && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 leading-snug">
              You don't have any locations or areas set up yet. Add a location
              (e.g. "Back Garden") with at least one area before planting out —
              we need somewhere to put the seedlings.
            </div>
          )}

          {/* Location → Area chained dropdowns */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/55 mb-1.5">
                Location
              </label>
              <div className="relative">
                <MapPin size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-rhozly-on-surface/40 pointer-events-none" />
                <select
                  value={locationId}
                  onChange={(e) => {
                    setLocationId(e.target.value);
                    setAreaId("");
                  }}
                  disabled={noLocations}
                  data-testid="plant-out-location"
                  className="w-full appearance-none pl-9 pr-9 py-2.5 min-h-[44px] rounded-xl bg-white border border-rhozly-outline/20 text-sm font-bold text-rhozly-on-surface focus:outline-none focus:border-rhozly-primary/40 focus:ring-2 focus:ring-rhozly-primary/15 disabled:opacity-50"
                >
                  <option value="" disabled>
                    Choose…
                  </option>
                  {locationOptions.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
                <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-rhozly-on-surface/40 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/55 mb-1.5">
                Area
              </label>
              <div className="relative">
                <Sprout size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-rhozly-on-surface/40 pointer-events-none" />
                <select
                  value={areaId}
                  onChange={(e) => setAreaId(e.target.value)}
                  disabled={!selectedLocation}
                  data-testid="plant-out-area"
                  className="w-full appearance-none pl-9 pr-9 py-2.5 min-h-[44px] rounded-xl bg-white border border-rhozly-outline/20 text-sm font-bold text-rhozly-on-surface focus:outline-none focus:border-rhozly-primary/40 focus:ring-2 focus:ring-rhozly-primary/15 disabled:opacity-50"
                >
                  <option value="" disabled>
                    {selectedLocation ? "Choose…" : "Pick a location first"}
                  </option>
                  {availableAreas.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
                <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-rhozly-on-surface/40 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Quantity + planted date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/55 mb-1.5">
                How many?
              </label>
              <input
                type="number"
                min={1}
                max={Math.max(1, remainingToPlant)}
                value={quantity}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  if (!Number.isFinite(next)) return;
                  setQuantity(
                    Math.max(1, Math.min(remainingToPlant || 1, Math.round(next))),
                  );
                }}
                disabled={remainingToPlant === 0 || alreadyPlanted == null}
                data-testid="plant-out-quantity"
                className="w-full px-3 py-2.5 min-h-[44px] rounded-xl bg-white border border-rhozly-outline/20 text-sm font-bold text-rhozly-on-surface focus:outline-none focus:border-rhozly-primary/40 focus:ring-2 focus:ring-rhozly-primary/15 disabled:opacity-50"
              />
              <p className="text-[10px] font-bold text-rhozly-on-surface/45 mt-1">
                Max {remainingToPlant} this round.
              </p>
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/55 mb-1.5">
                Planted on
              </label>
              <input
                type="date"
                value={plantedAt}
                onChange={(e) => setPlantedAt(e.target.value)}
                max={todayIso()}
                data-testid="plant-out-planted-at"
                className="w-full px-3 py-2.5 min-h-[44px] rounded-xl bg-white border border-rhozly-outline/20 text-sm font-bold text-rhozly-on-surface focus:outline-none focus:border-rhozly-primary/40 focus:ring-2 focus:ring-rhozly-primary/15"
              />
            </div>
          </div>

          {/* Nickname */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/55 mb-1.5">
              Nickname <span className="text-rhozly-on-surface/30 normal-case font-bold">(optional)</span>
            </label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="e.g. South-bed tomatoes"
              data-testid="plant-out-nickname"
              className="w-full px-3 py-2.5 min-h-[44px] rounded-xl bg-white border border-rhozly-outline/20 text-sm font-bold text-rhozly-on-surface focus:outline-none focus:border-rhozly-primary/40 focus:ring-2 focus:ring-rhozly-primary/15"
            />
          </div>

          <p className="text-[11px] text-rhozly-on-surface/55 leading-snug">
            The seedlings will land in your Shed with growth state{" "}
            <span className="font-black text-rhozly-on-surface/75">Seedling</span> and care
            schedules will generate automatically — same as any plant assignment.
          </p>

          {error && <p className="text-xs font-bold text-red-600">{error}</p>}
        </div>

        <footer className="shrink-0 px-5 py-3 border-t border-rhozly-outline/10 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 min-h-[40px] rounded-xl text-rhozly-on-surface/60 hover:text-rhozly-on-surface text-[11px] font-black uppercase tracking-widest"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="plant-out-save"
            onClick={handleSave}
            disabled={!canSave}
            className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] rounded-xl bg-rhozly-primary text-white text-[11px] font-black uppercase tracking-widest hover:opacity-95 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
            Plant out
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
