import React, { useState, useEffect } from "react";
import {
  X,
  Leaf,
  Trash2,
  MapPin,
  Loader2,
  Database,
  Sprout,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { Logger } from "../lib/errorHandler";
import toast from "react-hot-toast";
import { ConfirmModal } from "./ConfirmModal";

interface InventoryItem {
  id: string;
  plant_name: string;
  status: string;
  growth_state: string | null;
  identifier: string;
  is_established: boolean;
}

interface AreaDetailsProps {
  area: { id: string; name: string };
  onClose: () => void;
}

export default function AreaDetails({ area, onClose }: AreaDetailsProps) {
  const [plants, setPlants] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Delete Plant State
  const [plantToDelete, setPlantToDelete] = useState<InventoryItem | null>(
    null,
  );
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchPlants = async () => {
    setLoading(true);
    try {
      // 🚀 UPDATED: Now fetches from the inventory_items table
      const { data, error } = await supabase
        .from("inventory_items")
        .select("*")
        .eq("area_id", area.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setPlants(data || []);
    } catch (error: any) {
      Logger.error("Failed to fetch plants", error, { areaId: area.id });
      toast.error("Could not load plants.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlants();
  }, [area.id]);

  const handleConfirmDelete = async () => {
    if (!plantToDelete) return;
    setIsDeleting(true);
    try {
      // 🚀 UPDATED: We delete the inventory instance, NOT the master plant in the Shed
      const { error } = await supabase
        .from("inventory_items")
        .delete()
        .eq("id", plantToDelete.id);

      if (error) throw error;

      toast.success("Plant removed from area.");
      setPlants(plants.filter((p) => p.id !== plantToDelete.id)); // Optimistic update
    } catch (error: any) {
      Logger.error("Failed to delete plant instance", error, {
        plantId: plantToDelete.id,
      });
      toast.error("Could not remove plant.");
    } finally {
      setIsDeleting(false);
      setPlantToDelete(null);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
      {/* Area Header */}
      <div className="flex items-center justify-between bg-rhozly-surface-lowest rounded-3xl p-6 border border-rhozly-outline/30 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="bg-rhozly-primary/10 p-3 rounded-2xl">
            <MapPin className="w-6 h-6 text-rhozly-primary" />
          </div>
          <div>
            <h3 className="text-2xl font-black font-display text-rhozly-on-surface tracking-tight">
              {area.name}
            </h3>
            <p className="text-sm font-bold text-rhozly-on-surface/40 uppercase tracking-widest mt-1">
              {plants.length} Plants in this area
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-3 text-rhozly-on-surface/40 hover:text-rhozly-on-surface hover:bg-rhozly-surface-low rounded-2xl transition-all border border-rhozly-outline/10"
          title="Back to Areas"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Plants List */}
        <div className="lg:col-span-8 space-y-6">
          <div className="flex items-center justify-between px-1">
            <h3 className="font-display font-black text-rhozly-on-surface/60 uppercase tracking-widest text-sm">
              Area Inventory
            </h3>
          </div>

          {loading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-rhozly-primary" />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {plants.length > 0 ? (
                plants.map((plant) => (
                  <div
                    key={plant.id}
                    className="bg-white rounded-3xl p-5 border border-rhozly-outline/10 shadow-sm flex items-center justify-between group hover:border-rhozly-primary/30 transition-all"
                  >
                    <div className="flex items-center gap-4">
                      <div className="bg-rhozly-primary/5 p-3 rounded-2xl group-hover:bg-rhozly-primary/10 transition-colors">
                        <Sprout className="w-5 h-5 text-rhozly-primary" />
                      </div>
                      <div>
                        <h4 className="font-bold text-rhozly-on-surface flex items-center gap-2">
                          {plant.plant_name}
                        </h4>
                        <div className="flex flex-wrap gap-2 mt-2">
                          <span className="text-[9px] px-2 py-0.5 bg-rhozly-surface-low rounded-md font-bold text-rhozly-on-surface/50 border border-rhozly-outline/10">
                            {plant.identifier}
                          </span>
                          <span
                            className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md ${plant.status === "Planted" ? "bg-green-50 text-green-600" : "bg-blue-50 text-blue-600"}`}
                          >
                            {plant.status}
                          </span>
                          {plant.growth_state && (
                            <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md bg-orange-50 text-orange-600">
                              {plant.growth_state}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => setPlantToDelete(plant)}
                      className="p-2 text-rhozly-on-surface/20 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              ) : (
                <div className="col-span-full py-12 text-center bg-rhozly-surface-lowest rounded-3xl border border-rhozly-outline/30">
                  <div className="w-16 h-16 bg-rhozly-primary/5 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Database className="w-8 h-8 text-rhozly-primary/20" />
                  </div>
                  <p className="text-rhozly-on-surface/60 font-bold mb-2">
                    No plants in this area yet.
                  </p>
                  <p className="text-xs text-rhozly-on-surface/40 font-bold max-w-[250px] mx-auto leading-relaxed">
                    Head over to{" "}
                    <span className="text-rhozly-primary">The Shed</span> to
                    assign plants from your master library to this location.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Info Column */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-gradient-to-br from-rhozly-primary to-rhozly-primary-container rounded-3xl p-6 text-white shadow-md">
            <h4 className="text-lg font-black font-display mb-4">Area Stats</h4>
            <div className="space-y-4">
              <div className="flex justify-between items-center border-b border-white/10 pb-3">
                <span className="text-sm font-bold text-white/70">
                  Total Instances
                </span>
                <span className="text-xl font-black font-display">
                  {plants.length}
                </span>
              </div>
              <div className="flex justify-between items-center border-b border-white/10 pb-3">
                <span className="text-sm font-bold text-white/70">
                  Planted in Ground
                </span>
                <span className="text-xl font-black font-display">
                  {plants.filter((p) => p.status === "Planted").length}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CONFIRM DELETE MODAL */}
      <ConfirmModal
        isOpen={plantToDelete !== null}
        isLoading={isDeleting}
        onClose={() => setPlantToDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Remove Plant Instance"
        description={`Are you sure you want to remove "${plantToDelete?.identifier}" from this area? (This will not delete the master plant from your Shed).`}
        confirmText="Remove"
        isDestructive={true}
      />
    </div>
  );
}
