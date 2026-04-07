import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import {
  Plus,
  Database,
  MapPin,
  X,
  Archive,
  ArchiveRestore,
  Loader2,
  Trash2,
  Edit3,
  Search, // 🚀 NEW: Added Search Icon
} from "lucide-react";
import { toast } from "react-hot-toast";
import { Logger } from "../lib/errorHandler";
import ManualPlantCreation from "./ManualPlantCreation";
import PlantEditModal from "./PlantEditModal";
import PlantAssignmentModal from "./PlantAssignmentModal";
import PlantSearchModal from "./PlantSearchModal";

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
  const [locations, setLocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // View & Filter States
  const [viewTab, setViewTab] = useState<"active" | "archived">("active");
  const [filterSource, setFilterSource] = useState<"all" | "manual" | "api">(
    "all",
  );
  const [searchQuery, setSearchQuery] = useState(""); // 🚀 NEW: Search state

  const [isPremium, setIsPremium] = useState(false);

  // Modal & Menu States
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [isAddingManual, setIsAddingManual] = useState(false);
  const [isSearchingApi, setIsSearchingApi] = useState(false);

  const [selectedPlant, setSelectedPlant] = useState<Plant | null>(null);
  const [editingPlant, setEditingPlant] = useState<any | null>(null);

  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    type: "delete" | "archive" | "unarchive";
    plant: Plant | null;
  }>({ isOpen: false, type: "delete", plant: null });

  const fetchUserProfile = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data, error } = await supabase
          .from("user_profiles")
          .select("enable_perenual")
          .eq("uid", user.id)
          .single();

        if (error) {
          console.error("Supabase Error fetching profile:", error);
          return;
        }

        if (data) setIsPremium(!!data.enable_perenual);
      }
    } catch (err) {
      Logger.error("Failed to fetch user premium status", err);
    }
  };

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
    fetchUserProfile();
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
      await supabase.from("plants").insert([
        {
          ...plantData,
          id: manualId,
          home_id: homeId,
          source: "manual",
          perenual_id: null,
        },
      ]);
      toast.success(`${plantData.common_name} added to shed!`);
      setIsAddingManual(false);
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

  // 🚀 UPDATED: Includes the real-time search filtering!
  const filteredPlants = plants.filter((p) => {
    // 1. Check Tabs
    if (viewTab === "active" && p.is_archived) return false;
    if (viewTab === "archived" && !p.is_archived) return false;

    // 2. Check Source Filter
    if (filterSource !== "all" && p.source !== filterSource) return false;

    // 3. Check Text Search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const matchesCommon = p.common_name.toLowerCase().includes(query);
      const matchesScientific = p.scientific_name?.some((name) =>
        name.toLowerCase().includes(query),
      );
      if (!matchesCommon && !matchesScientific) return false;
    }

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
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 mb-10">
        <div>
          <h2 className="text-4xl font-black font-display text-rhozly-on-surface">
            The Shed
          </h2>
          <p className="text-sm font-bold text-rhozly-on-surface/40 uppercase tracking-widest mt-1">
            Your Master Plant Library
          </p>
        </div>

        {/* 🚀 NEW: Added Search Bar to the Controls Area */}
        <div className="flex flex-col md:flex-row flex-wrap items-stretch md:items-center gap-4">
          <div className="relative flex-1 md:flex-none flex items-center min-w-[200px]">
            <Search
              className="absolute left-4 text-rhozly-on-surface/40"
              size={16}
            />
            <input
              type="text"
              placeholder="Search plants..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-10 py-3 bg-rhozly-surface-lowest border border-rhozly-outline/20 rounded-2xl text-sm font-bold outline-none focus:border-rhozly-primary transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-4 text-rhozly-on-surface/40 hover:text-rhozly-on-surface transition-colors"
              >
                <X size={16} />
              </button>
            )}
          </div>

          <div className="bg-rhozly-surface-low p-1.5 rounded-2xl flex gap-1 border border-rhozly-outline/10">
            {["active", "archived"].map((tab) => (
              <button
                key={tab}
                onClick={() => setViewTab(tab as any)}
                className={`flex-1 md:flex-none px-6 py-2 rounded-xl text-sm font-black transition-all ${viewTab === tab ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-on-surface/40 hover:text-rhozly-on-surface"}`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          <select
            value={filterSource}
            onChange={(e) => setFilterSource(e.target.value as any)}
            className="bg-rhozly-surface-lowest border border-rhozly-outline/20 rounded-xl px-4 py-3 text-sm font-bold outline-none cursor-pointer"
          >
            <option value="all">All Sources</option>
            <option value="manual">Manual</option>
            <option value="api">API</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-32">
        {filteredPlants.length === 0 ? (
          <div className="col-span-full h-40 flex flex-col items-center justify-center text-rhozly-on-surface/40">
            <Search size={40} className="mb-4 opacity-50" />
            <p className="font-black">No plants found</p>
            {searchQuery && (
              <p className="text-sm font-bold mt-1">
                Try a different search term.
              </p>
            )}
          </div>
        ) : (
          filteredPlants.map((plant) => (
            <div
              key={plant.id}
              onClick={() => setEditingPlant(plant)}
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
                    className="h-12 px-5 rounded-2xl bg-rhozly-primary/10 text-rhozly-primary flex items-center justify-center gap-2 hover:bg-rhozly-primary hover:text-white transition-all shadow-sm"
                  >
                    <MapPin size={18} />
                    <span className="text-[10px] font-black uppercase tracking-widest">
                      Assign
                    </span>
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* FAB AND MENUS */}
      <div className="fixed bottom-10 right-10 z-40 flex flex-col items-end gap-4">
        {isAddMenuOpen && (
          <div className="flex flex-col gap-3 animate-in slide-in-from-bottom-2 fade-in">
            <button
              onClick={() => {
                setIsAddingManual(true);
                setIsAddMenuOpen(false);
              }}
              className="flex items-center gap-3 bg-white text-rhozly-on-surface px-6 py-4 rounded-[2rem] shadow-2xl font-black border border-rhozly-outline/10 hover:border-rhozly-primary/30 hover:text-rhozly-primary transition-all active:scale-95"
            >
              <Edit3 size={20} /> Manual Entry
            </button>
            <button
              onClick={() => {
                setIsSearchingApi(true);
                setIsAddMenuOpen(false);
              }}
              className="flex items-center gap-3 bg-white text-rhozly-on-surface px-6 py-4 rounded-[2rem] shadow-2xl font-black border border-rhozly-outline/10 hover:border-rhozly-primary/30 hover:text-rhozly-primary transition-all active:scale-95"
            >
              <Database size={20} className="text-rhozly-primary" /> Search
              Database
              <span className="bg-amber-100 text-amber-700 text-[10px] uppercase px-2 py-1 rounded-lg ml-1 border border-amber-200">
                Pro
              </span>
            </button>
          </div>
        )}
        <button
          onClick={() => setIsAddMenuOpen(!isAddMenuOpen)}
          className={`w-20 h-20 bg-rhozly-primary text-white rounded-[2.5rem] shadow-2xl hover:scale-110 transition-all flex items-center justify-center ${isAddMenuOpen ? "rotate-45 bg-rhozly-surface-lowest text-rhozly-on-surface border-2 border-rhozly-outline/20 shadow-none" : ""}`}
        >
          <Plus size={40} strokeWidth={3} />
        </button>
      </div>

      {/* MODALS BELOW */}
      {confirmState.isOpen && confirmState.plant && (
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
          title={
            confirmState.type === "delete"
              ? "Delete Plant"
              : confirmState.type === "archive"
                ? "Archive Plant"
                : "Restore Plant"
          }
          description={
            confirmState.type === "delete"
              ? `Are you sure you want to permanently delete ${confirmState.plant.common_name}? This cannot be undone.`
              : confirmState.type === "archive"
                ? `Move ${confirmState.plant.common_name} to your archive? It will be hidden from your active shed.`
                : `Restore ${confirmState.plant.common_name} to your active shed?`
          }
          confirmText={
            confirmState.type === "delete"
              ? "Delete"
              : confirmState.type === "archive"
                ? "Archive"
                : "Restore"
          }
          isDestructive={confirmState.type === "delete"}
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

      {isAddingManual && (
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
                onClick={() => setIsAddingManual(false)}
                className="p-3 bg-rhozly-surface-low rounded-2xl hover:scale-110 transition-transform"
              >
                <X size={24} />
              </button>
            </div>
            <ManualPlantCreation
              onSave={handleManualSave}
              onCancel={() => setIsAddingManual(false)}
              isSaving={actionLoading}
            />
          </div>
        </div>
      )}

      {isSearchingApi && (
        <PlantSearchModal
          homeId={homeId}
          isPremium={isPremium}
          onClose={() => setIsSearchingApi(false)}
          onSuccess={() => {
            setIsSearchingApi(false);
            fetchData();
          }}
        />
      )}

      {editingPlant && (
        <PlantEditModal
          homeId={homeId}
          plant={editingPlant}
          onSave={handleUpdatePlant}
          onClose={() => setEditingPlant(null)}
          isSaving={actionLoading}
        />
      )}
    </div>
  );
}

// Dummy ConfirmModal
function ConfirmModal({
  isOpen,
  isLoading,
  onClose,
  onConfirm,
  title,
  description,
  confirmText,
  isDestructive,
}: any) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white p-6 rounded-3xl w-full max-w-sm">
        <h3 className="font-black text-lg mb-2">{title}</h3>
        <p className="text-sm font-bold text-gray-500 mb-6">{description}</p>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl font-bold bg-gray-100 hover:bg-gray-200"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={`flex-1 py-3 rounded-xl font-bold text-white ${isDestructive ? "bg-red-500 hover:bg-red-600" : "bg-rhozly-primary"}`}
          >
            {isLoading ? (
              <Loader2 className="animate-spin mx-auto" size={18} />
            ) : (
              confirmText
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
