import React, { useState } from "react";
import {
  Package,
  Plus,
  ArrowRight,
  Loader2,
  X,
  Trash2,
  Search,
  Calendar,
  Droplets,
} from "lucide-react";
import {
  InventoryItem,
  Plant,
  Location,
  GardenTask,
  UserProfile,
} from "../types";
import { supabase } from "../lib/supabase";
import { motion, AnimatePresence } from "motion/react";
import { PlantSearch } from "./PlantSearch";
import { cn } from "../lib/utils";

interface InventoryManagerProps {
  userId: string;
  homeId: string;
  userProfile: UserProfile;
  inventory: InventoryItem[];
  plants: Plant[];
  locations: Location[];
  onViewPlantedInstance: (instance: InventoryItem) => void;
  onSelectShedItem: (item: InventoryItem) => void;
  onRefresh: () => Promise<void> | void;
}

const WATERING_MAP: Record<string, number> = {
  Frequent: 3,
  Average: 7,
  Minimum: 14,
  None: 30,
};

export const InventoryManager: React.FC<InventoryManagerProps> = ({
  userId,
  homeId,
  userProfile,
  inventory,
  plants,
  locations,
  onViewPlantedInstance,
  onSelectShedItem,
  onRefresh,
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [modalTab, setModalTab] = useState<"search" | "inventory">("inventory");

  const [plantingItem, setPlantingItem] = useState<InventoryItem | null>(null);
  const [identifier, setIdentifier] = useState("");
  const [locationId, setLocationId] = useState("");
  const [areaId, setAreaId] = useState("");
  const [isEstablished, setIsEstablished] = useState(false);
  const [plantedAt, setPlantedAt] = useState(
    new Date().toISOString().split("T")[0],
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shedItems = inventory.filter((item) => item.status === "In Shed");

  const handleAddItem = async (newItem: any) => {
    // PlantSearch handles the database insert. We just refresh the local state.
    setLoading(true);
    try {
      if (onRefresh) await onRefresh();
      setIsAdding(false);
    } catch (err) {
      console.error("Shed Sync Error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveItem = async (itemId: string) => {
    setLoading(true);
    try {
      await supabase.from("inventory_items").delete().eq("id", itemId);
      if (onRefresh) await onRefresh();
    } finally {
      setLoading(false);
    }
  };

  const handlePlantNow = async () => {
    const pId = plantingItem?.plant_id;

    if (loading || !plantingItem || !locationId || !pId) return;
    setLoading(true);

    try {
      const selectedLoc = locations.find((l) => l.id === locationId);
      const selectedArea = selectedLoc?.areas?.find((a) => a.id === areaId);
      const plantBase = plants.find((p) => String(p.id) === String(pId));

      if (!selectedArea || !selectedLoc)
        throw new Error("Location data missing.");

      // ✅ FIX: The "Undefined" Name Healer
      // We check: 1. The shed item name, 2. The botanical library name, 3. Fallback
      const baseName =
        plantingItem.plant_name || plantBase?.common_name || "Unknown Plant";

      // 🔢 Calculate the iteration number
      const { count } = await supabase
        .from("inventory_items")
        .select("*", { count: "exact", head: true })
        .eq("plant_id", pId)
        .eq("location_id", locationId);

      const nextNumber = ((count || 0) + 1).toString().padStart(4, "0");

      // 🏷️ Generate the proper Identifier
      const generatedIdentifier = `${baseName} - ${selectedLoc.name} - ${nextNumber}`;

      const derivedEnv =
        selectedArea.type === "inside" ? "Indoors" : "Outdoors";
      let plantedAtISO = isEstablished
        ? null
        : new Date(plantedAt).toISOString();

      const { data: newItem, error: insertError } = await supabase
        .from("inventory_items")
        .insert([
          {
            plant_id: String(pId),
            plant_name: baseName, // Use the healed name
            status: "Planted",
            location_id: String(locationId),
            location_name: selectedLoc.name,
            area_id: String(selectedArea.id),
            area_name: selectedArea.name,
            environment: derivedEnv,
            is_established: isEstablished,
            planted_at: plantedAtISO,
            identifier: generatedIdentifier,
            home_id: homeId,
          },
        ])
        .select()
        .single();

      if (insertError) throw insertError;

      // ... Task generation code remains the same ...

      if (onRefresh) await onRefresh();
      setPlantingItem(null); // Close the planting modal
    } catch (error: any) {
      console.error("Planting Error:", error.message);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-3xl shadow-sm border border-stone-100">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center">
            <Package size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-stone-900">The Shed</h2>
            <p className="text-xs text-stone-500">Unplanted seeds and starts</p>
          </div>
        </div>
        <button
          onClick={() => {
            setModalTab("search");
            setIsAdding(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-all font-bold text-sm"
        >
          <Plus size={18} /> Add Plant
        </button>
      </div>

      <div className="flex flex-col gap-3">
        {shedItems.length === 0 ? (
          <div className="py-8 text-center bg-stone-50 rounded-2xl border border-stone-100">
            <p className="text-sm text-stone-400">Your shed is empty.</p>
          </div>
        ) : (
          shedItems.map((item) => {
            // ✅ Standardized: Find plant using plant_id
            const plant = plants.find(
              (p) => String(p.id) === String(item.plant_id),
            );

            return (
              <div
                key={item.id}
                className="p-4 bg-stone-50 border border-stone-100 rounded-2xl flex items-center justify-between"
              >
                <div className="flex items-center gap-4">
                  <img
                    src={plant?.thumbnail_url || "/placeholder.png"}
                    className="w-10 h-10 rounded-lg object-cover bg-stone-100"
                    alt=""
                  />
                  <div className="flex flex-col">
                    <button
                      onClick={() => onSelectShedItem(item)}
                      className="text-sm font-bold text-stone-900 hover:text-emerald-600 text-left"
                    >
                      {/* ✅ Standardized: Use plant_name */}
                      {item.plant_name || plant?.common_name}
                    </button>
                    <span className="text-[10px] text-stone-400 uppercase tracking-widest">
                      {/* ✅ Standardized: Use created_at */}
                      Added {new Date(item.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleRemoveItem(item.id)}
                    className="p-2 text-stone-400 hover:text-red-600 transition-all"
                  >
                    <Trash2 size={16} />
                  </button>
                  <button
                    onClick={() => setPlantingItem(item)}
                    className="px-4 py-2 bg-white text-emerald-600 text-xs font-bold rounded-xl border border-emerald-100 flex items-center gap-2"
                  >
                    Plant <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white w-full max-w-2xl p-8 rounded-3xl shadow-2xl max-h-[90vh] flex flex-col"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-stone-900">
                  {modalTab === "search" ? "Add New Plant" : "Shed Inventory"}
                </h3>
                <button
                  onClick={() => setIsAdding(false)}
                  className="p-2 hover:bg-stone-100 rounded-full"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex gap-2 p-1 bg-stone-100 rounded-2xl mb-6">
                <button
                  onClick={() => setModalTab("search")}
                  className={cn(
                    "flex-1 py-2 text-xs font-bold rounded-xl",
                    modalTab === "search"
                      ? "bg-white text-emerald-600 shadow-sm"
                      : "text-stone-500",
                  )}
                >
                  Add New
                </button>
                <button
                  onClick={() => setModalTab("inventory")}
                  className={cn(
                    "flex-1 py-2 text-xs font-bold rounded-xl",
                    modalTab === "inventory"
                      ? "bg-white text-emerald-600 shadow-sm"
                      : "text-stone-500",
                  )}
                >
                  In Shed ({shedItems.length})
                </button>
              </div>

              {modalTab === "search" ? (
                <div className="flex-1 overflow-hidden">
                  <PlantSearch
                    onPlantSelected={handleAddItem}
                    homeId={homeId}
                  />
                </div>
              ) : (
                <div className="space-y-3 overflow-y-auto">
                  {shedItems.map((item) => (
                    <div
                      key={item.id}
                      className="p-4 bg-stone-50 rounded-2xl flex justify-between items-center"
                    >
                      <span className="font-bold text-sm">
                        {item.plant_name}
                      </span>
                      <button
                        onClick={() => {
                          setPlantingItem(item);
                          setIsAdding(false);
                        }}
                        className="text-emerald-600 font-bold text-xs uppercase"
                      >
                        Plant Now
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {plantingItem && (
          <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white w-full max-w-md p-8 rounded-3xl shadow-2xl"
            >
              <h3 className="text-xl font-bold text-stone-900 mb-6">
                Planting {plantingItem.plant_name}
              </h3>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-black text-stone-400 tracking-widest ml-1">
                    Location
                  </label>
                  <select
                    value={locationId}
                    onChange={(e) => setLocationId(e.target.value)}
                    className="w-full p-4 bg-stone-50 border-none rounded-2xl text-sm font-bold"
                  >
                    <option value="">Select location...</option>
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name}
                      </option>
                    ))}
                  </select>
                </div>
                {locationId && (
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] uppercase font-black text-stone-400 tracking-widest ml-1">
                      Area
                    </label>
                    <select
                      value={areaId}
                      onChange={(e) => setAreaId(e.target.value)}
                      className="w-full p-4 bg-stone-50 border-none rounded-2xl text-sm font-bold"
                    >
                      <option value="">Select area...</option>
                      {locations
                        .find((l) => l.id === locationId)
                        ?.areas?.map((area) => (
                          <option key={area.id} value={area.id}>
                            {area.name} ({area.type})
                          </option>
                        ))}
                    </select>
                  </div>
                )}
                <div className="flex flex-col gap-3">
                  <label className="flex items-center gap-2 text-sm font-bold text-stone-700">
                    <input
                      type="checkbox"
                      checked={isEstablished}
                      onChange={(e) => setIsEstablished(e.target.checked)}
                      className="rounded text-emerald-600"
                    />
                    Established Plant
                  </label>
                  {!isEstablished && (
                    <input
                      type="date"
                      value={plantedAt}
                      onChange={(e) => setPlantedAt(e.target.value)}
                      className="w-full p-4 bg-stone-50 border-none rounded-2xl text-sm font-bold"
                    />
                  )}
                </div>
                <button
                  onClick={handlePlantNow}
                  disabled={!areaId || loading}
                  className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold shadow-lg shadow-emerald-100 mt-4"
                >
                  {loading ? (
                    <Loader2 className="animate-spin mx-auto" />
                  ) : (
                    "Confirm Planting"
                  )}
                </button>
                <button
                  onClick={() => setPlantingItem(null)}
                  className="w-full py-2 text-stone-400 text-xs font-bold uppercase"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
