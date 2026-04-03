import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import {
  Plus,
  Database,
  Edit3,
  MapPin,
  X,
  Archive,
  ArchiveRestore,
  Loader2,
  AlertTriangle,
  Trash2,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { Logger } from "../lib/errorHandler";
import ManualPlantCreation from "./ManualPlantCreation";
import PlantEditModal from "./PlantEditModal";
import PlantAssignmentModal from "./PlantAssignmentModal";

interface Plant {
  id: number;
  common_name: string;
  scientific_name: string[];
  source: "manual" | "api";
  thumbnail_url?: string;
  is_archived: boolean;
  instance_count?: number;
}

export default function TheShed({ homeId }: { homeId: string }) {
  const [plants, setPlants] = useState<Plant[]>([]);
  const [locations, setLocations] = useState<any[]>([]); // 🚀 Structured locations
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [viewTab, setViewTab] = useState<"active" | "archived">("active");
  const [filterSource, setFilterSource] = useState<"all" | "manual" | "api">(
    "all",
  );

  const [isAddingPlant, setIsAddingPlant] = useState(false);
  const [addMethod, setAddMethod] = useState<"manual" | "api" | null>(null);
  const [selectedPlant, setSelectedPlant] = useState<Plant | null>(null);
  const [editingPlant, setEditingPlant] = useState<any | null>(null);

  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    type: "delete" | "archive" | "unarchive";
    plant: Plant | null;
  }>({ isOpen: false, type: "delete", plant: null });

  const fetchData = useCallback(async () => {
    if (!homeId) return;
    setLoading(true);
    try {
      const { data: shedData, error: shedError } = await supabase
        .from("plants")
        .select(`*, inventory_items(id)`)
        .eq("home_id", homeId)
        .order("created_at", { ascending: false });

      if (shedError) throw shedError;

      setPlants(
        (shedData || []).map((p) => ({
          ...p,
          instance_count: p.inventory_items?.length || 0,
        })),
      );

      const { data: locData, error: locError } = await supabase
        .from("locations")
        .select(`id, name, areas ( id, name )`)
        .eq("home_id", homeId);

      if (locError) throw locError;
      if (locData) setLocations(locData);
    } catch (err: any) {
      Logger.error("Shed data fetch failed", err);
      toast.error("Failed to load Shed");
    } finally {
      setLoading(false);
    }
  }, [homeId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const executeArchiveToggle = async () => {
    const plant = confirmState.plant;
    if (!plant) return;
    setActionLoading(true);
    try {
      await supabase
        .from("plants")
        .update({ is_archived: !plant.is_archived })
        .eq("id", plant.id);
      toast.success(
        plant.is_archived ? "Restored to active" : "Moved to archive",
      );
      fetchData();
    } finally {
      setActionLoading(false);
      setConfirmState({ isOpen: false, type: "delete", plant: null });
    }
  };

  const executeDelete = async () => {
    const plant = confirmState.plant;
    if (!plant) return;
    setActionLoading(true);
    try {
      await supabase.from("plants").delete().eq("id", plant.id);
      toast.success(`${plant.common_name} deleted.`);
      setConfirmState({ isOpen: false, type: "delete", plant: null });
      fetchData();
    } finally {
      setActionLoading(false);
    }
  };

  const handleManualSave = async (plantData: any) => {
    setActionLoading(true);
    try {
      const manualId = Math.floor(Date.now() / 1000);
      await supabase
        .from("plants")
        .insert([
          {
            ...plantData,
            id: manualId,
            home_id: homeId,
            source: "manual",
            perenual_id: null,
          },
        ]);
      toast.success(`${plantData.common_name} added to shed!`);
      setIsAddingPlant(false);
      setAddMethod(null);
      fetchData();
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdatePlant = async (updatedData: any) => {
    setActionLoading(true);
    try {
      await supabase
        .from("plants")
        .update(updatedData)
        .eq("id", updatedData.id);
      toast.success(`${updatedData.common_name} updated!`);
      setEditingPlant(null);
      fetchData();
    } finally {
      setActionLoading(false);
    }
  };

  const handleAssign = async (assignmentData: any) => {
    if (!selectedPlant) return;
    setActionLoading(true);
    try {
      const { data: areaData } = await supabase
        .from("areas")
        .select("name, location_id, locations(name)")
        .eq("id", assignmentData.areaId)
        .single();
      if (!areaData) throw new Error("Area not found");

      const locationName = areaData.locations?.name || "Unknown Location";
      const recordsToInsert = Array.from({
        length: assignmentData.quantity,
      }).map(() => ({
        home_id: homeId,
        plant_id: selectedPlant.id,
        plant_name: selectedPlant.common_name,
        status: assignmentData.status,
        location_id: areaData.location_id,
        location_name: locationName,
        area_id: assignmentData.areaId,
        area_name: areaData.name,
        planted_at:
          assignmentData.isPlanted && !assignmentData.isEstablished
            ? assignmentData.plantedDate
            : null,
        is_established: assignmentData.isEstablished,
        growth_state: assignmentData.isPlanted
          ? assignmentData.growthState
          : null,
        identifier: `${selectedPlant.common_name} #${Math.floor(
          Math.random() * 10000,
        )
          .toString()
          .padStart(4, "0")}`,
      }));

      await supabase.from("inventory_items").insert(recordsToInsert);
      toast.success(`Successfully assigned ${assignmentData.quantity} plants!`);
      setSelectedPlant(null);
      fetchData();
    } catch (err: any) {
      toast.error(`Assignment failed: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const filteredPlants = plants.filter((p) => {
    if (viewTab === "active" && p.is_archived) return false;
    if (viewTab === "archived" && !p.is_archived) return false;
    if (filterSource !== "all" && p.source !== filterSource) return false;
    return true;
  });

  if (loading)
    return (
      <div className="h-96 flex items-center justify-center">
        <Loader2 className="animate-spin text-rhozly-primary" size={48} />
      </div>
    );

  return (
    <div className="max-w-7xl mx-auto h-full flex flex-col p-4 md:p-8 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
        <div>
          <h2 className="text-4xl font-black font-display text-rhozly-on-surface">
            The Shed
          </h2>
          <p className="text-sm font-bold text-rhozly-on-surface/40 uppercase tracking-widest mt-1">
            Your Master Plant Library
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="bg-rhozly-surface-low p-1.5 rounded-2xl flex gap-1 border border-rhozly-outline/10">
            {["active", "archived"].map((tab) => (
              <button
                key={tab}
                onClick={() => setViewTab(tab as any)}
                className={`px-6 py-2 rounded-xl text-sm font-black transition-all ${viewTab === tab ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-on-surface/40 hover:text-rhozly-on-surface"}`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
          <select
            value={filterSource}
            onChange={(e) => setFilterSource(e.target.value as any)}
            className="bg-rhozly-surface-lowest border border-rhozly-outline/20 rounded-xl px-4 py-2 text-sm font-bold outline-none cursor-pointer"
          >
            <option value="all">All Sources</option>
            <option value="manual">Manual</option>
            <option value="api">API</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-32">
        {filteredPlants.map((plant) => (
          <div
            key={plant.id}
            onClick={() => {
              if (plant.source === "manual") setEditingPlant(plant);
              else toast("API source plants are read-only", { icon: "🔒" });
            }}
            className="bg-rhozly-surface-lowest rounded-[2.5rem] overflow-hidden border border-rhozly-outline/20 shadow-sm group flex flex-col cursor-pointer hover:border-rhozly-primary/30 transition-all"
          >
            <div className="h-44 relative overflow-hidden bg-rhozly-primary/5">
              <img
                src={
                  plant.thumbnail_url ||
                  "https://images.unsplash.com/photo-1466692476868-aef1dfb1e735?auto=format&fit=crop&w=400"
                }
                alt={plant.common_name}
                className="w-full h-full object-cover"
              />
              <div className="absolute top-4 left-4">
                <span className="bg-white/90 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-black uppercase text-rhozly-primary flex items-center gap-1.5 shadow-sm border border-white/20">
                  <Database size={10} /> {plant.source}
                </span>
              </div>
              <div className="absolute top-4 right-4 flex gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmState({
                      isOpen: true,
                      type: plant.is_archived ? "unarchive" : "archive",
                      plant,
                    });
                  }}
                  className="w-9 h-9 bg-white/90 backdrop-blur-md rounded-xl text-rhozly-on-surface/60 hover:text-orange-600 flex items-center justify-center shadow-md transition-all active:scale-90"
                >
                  {plant.is_archived ? (
                    <ArchiveRestore size={16} />
                  ) : (
                    <Archive size={16} />
                  )}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmState({ isOpen: true, type: "delete", plant });
                  }}
                  className="w-9 h-9 bg-white/90 backdrop-blur-md rounded-xl text-rhozly-on-surface/60 hover:text-red-600 flex items-center justify-center shadow-md transition-all active:scale-90"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
            <div className="p-6">
              <h3 className="text-xl font-black text-rhozly-on-surface leading-tight mb-1">
                {plant.common_name}
              </h3>
              <p className="text-xs font-bold text-rhozly-on-surface/40 italic mb-6 truncate">
                {plant.scientific_name?.[0] || "Unknown Species"}
              </p>
              <div className="mt-auto pt-5 border-t border-rhozly-outline/10 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black text-rhozly-on-surface/30 uppercase tracking-widest">
                    In Home
                  </p>
                  <p className="text-2xl font-black text-rhozly-primary">
                    {plant.instance_count}
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedPlant(plant);
                  }}
                  title="Assign to Area"
                  className="w-12 h-12 rounded-2xl bg-rhozly-primary/10 text-rhozly-primary flex items-center justify-center hover:bg-rhozly-primary hover:text-white transition-all shadow-sm"
                >
                  <MapPin size={22} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={() => setIsAddingPlant(true)}
        className="fixed bottom-10 right-10 w-20 h-20 bg-rhozly-primary text-white rounded-[2rem] shadow-2xl hover:scale-110 transition-all flex items-center justify-center z-40"
      >
        <Plus size={40} strokeWidth={3} />
      </button>

      {confirmState.isOpen && (
        <ConfirmModal
          isOpen={confirmState.isOpen}
          isLoading={actionLoading}
          onClose={() =>
            setConfirmState({ isOpen: false, type: "delete", plant: null })
          }
          onConfirm={
            confirmState.type === "delete"
              ? executeDelete
              : executeArchiveToggle
          }
          title="Confirm Action"
          description="Are you sure you want to proceed?"
          confirmText="Confirm"
          isDestructive={true}
        />
      )}

      {selectedPlant && (
        <PlantAssignmentModal
          plant={selectedPlant}
          locations={locations}
          onAssign={handleAssign}
          onClose={() => setSelectedPlant(null)}
          isAssigning={actionLoading}
        />
      )}

      {isAddingPlant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-rhozly-bg/90 backdrop-blur-xl animate-in zoom-in-95 duration-300">
          <div className="bg-rhozly-surface-lowest w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-[3rem] p-8 shadow-2xl border border-rhozly-outline/20 custom-scrollbar">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h3 className="text-3xl font-black">Add to Shed</h3>
                <p className="text-xs font-bold text-rhozly-on-surface/40 uppercase tracking-widest mt-1">
                  Manual Entry
                </p>
              </div>
              <button
                onClick={() => setIsAddingPlant(false)}
                className="p-3 bg-rhozly-surface-low rounded-2xl hover:scale-110 transition-transform"
              >
                <X size={24} />
              </button>
            </div>
            <ManualPlantCreation
              onSave={handleManualSave}
              onCancel={() => setIsAddingPlant(false)}
              isSaving={actionLoading}
            />
          </div>
        </div>
      )}

      {editingPlant && (
        <PlantEditModal
          plant={editingPlant}
          onSave={handleUpdatePlant}
          onClose={() => setEditingPlant(null)}
          isSaving={actionLoading}
        />
      )}
    </div>
  );
}
