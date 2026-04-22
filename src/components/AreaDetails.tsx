import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom"; // 🚀 Teleportation active
import {
  X,
  Trash2,
  MapPin,
  Loader2,
  Database,
  Sprout,
  Settings2,
  Plus,
  Globe,
  PenTool,
  Sparkles,
  BrainCircuit,
  Search,
  Archive,
  History,
  Check,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { Logger } from "../lib/errorHandler";
import toast from "react-hot-toast";
import { ConfirmModal } from "./ConfirmModal";
import AreaAdvancedFields from "./AreaAdvancedFields";
import InstanceEditModal from "./InstanceEditModal";

// 🧠 IMPORT THE AI CONTEXT
import { usePlantDoctor } from "../context/PlantDoctorContext";

interface InventoryItem {
  id: string;
  home_id: string;
  plant_name: string;
  status: string;
  growth_state: string | null;
  identifier: string;
  is_established: boolean;
  location_id: string;
  area_id: string;
  planted_at: string | null;
}

interface AreaDetailsProps {
  homeId: string;
  area: any;
  onClose: () => void;
  isOutside: boolean;
  onTasksUpdated?: () => void;
  onAreaUpdated?: () => void;
}

export default function AreaDetails({
  homeId,
  area,
  onClose,
  isOutside,
  onTasksUpdated,
  onAreaUpdated,
}: AreaDetailsProps) {
  const { setPageContext } = usePlantDoctor();

  const [plants, setPlants] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  // --- AREA CONFIGURATION STATE ---
  const [isEditingArea, setIsEditingArea] = useState(false);
  const [areaEditData, setAreaEditData] = useState(area);
  const [savingArea, setSavingArea] = useState(false);

  // --- RECOMMENDATION STATES ---
  const [isGettingRecs, setIsGettingRecs] = useState(false);
  const [recommendations, setRecommendations] = useState<any[] | null>(null);
  const [areaTasks, setAreaTasks] = useState<any[]>([]);

  // --- MODAL STATES ---
  const [editingInstance, setEditingInstance] = useState<InventoryItem | null>(
    null,
  );
  const [showHistory, setShowHistory] = useState(false);
  const [plantToManage, setPlantToManage] = useState<InventoryItem | null>(
    null,
  );
  const [isManagingItem, setIsManagingItem] = useState(false);

  // --- ADD FLOW ---
  const [addFlow, setAddFlow] = useState<"hidden" | "choose_source">("hidden");

  const fetchPlants = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("inventory_items")
        .select("*")
        .eq("area_id", area.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setPlants(data || []);
    } catch (error: any) {
      toast.error("Could not load plants.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlants();
  }, [area.id]);

  // 🧠 LIVE AI SYNC
  useEffect(() => {
    if (!area) return;
    setPageContext({
      action: "Viewing Area Details",
      areaDetails: {
        name: area.name,
        isOutside: isOutside,
        sunlight: area.sunlight || "Unknown",
        growingMedium: area.growing_medium || "Unknown",
      },
      currentPlantsInArea: plants
        .filter((p) => p.status !== "Archived")
        .map((p) => ({ name: p.plant_name, status: p.status })),
    });
    return () => setPageContext(null);
  }, [area, plants, isOutside, setPageContext]);

  const getPlantRecommendations = async () => {
    setIsGettingRecs(true);
    try {
      const { data, error } = await supabase.functions.invoke("plant-doctor", {
        body: { action: "recommend_plants", isOutside, areaData: area },
      });
      if (error) throw error;
      if (data.recommendations) {
        setRecommendations(data.recommendations);
        toast.success("AI found some perfect matches!");
      }
    } catch (err: any) {
      toast.error("Could not generate recommendations.");
    } finally {
      setIsGettingRecs(false);
    }
  };

  const handleUpdateArea = async () => {
    if (!areaEditData.name.trim()) return toast.error("Area name required.");
    setSavingArea(true);
    try {
      const { inventory_items, ...updatePayload } = areaEditData;
      const { error } = await supabase
        .from("areas")
        .update(updatePayload)
        .eq("id", area.id);
      if (error) throw error;
      toast.success("Area configuration saved!");
      setIsEditingArea(false);
      if (onAreaUpdated) onAreaUpdated();
    } catch (error: any) {
      toast.error("Failed to save changes.");
    } finally {
      setSavingArea(false);
    }
  };

  const handleArchiveItem = async () => {
    if (!plantToManage) return;
    setIsManagingItem(true);
    try {
      await supabase
        .from("inventory_items")
        .update({ status: "Archived" })
        .eq("id", plantToManage.id);
      await supabase
        .from("tasks")
        .delete()
        .eq("inventory_item_id", plantToManage.id)
        .eq("status", "Pending");
      toast.success(`${plantToManage.identifier} moved to History.`);
      setPlants(
        plants.map((p) =>
          p.id === plantToManage.id ? { ...p, status: "Archived" } : p,
        ),
      );
      if (onTasksUpdated) onTasksUpdated();
    } catch (error: any) {
      toast.error("Archive failed.");
    } finally {
      setIsManagingItem(false);
      setPlantToManage(null);
    }
  };

  const activePlants = plants.filter((p) => p.status !== "Archived");
  const archivedPlants = plants.filter((p) => p.status === "Archived");
  const displayedPlants = showHistory ? archivedPlants : activePlants;

  if (!area) return null;

  return (
    <>
      <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500 pb-32">
        {/* HEADER BAR */}
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
                Area Details
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={getPlantRecommendations}
              disabled={isGettingRecs}
              className="p-3 text-rhozly-primary hover:bg-rhozly-primary/5 rounded-2xl transition-all border border-rhozly-primary/10 bg-white shadow-sm"
            >
              {isGettingRecs ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : (
                <Sparkles className="w-6 h-6" />
              )}
            </button>
            <button
              onClick={() => setIsEditingArea(true)}
              className="p-3 text-rhozly-on-surface/40 hover:text-rhozly-primary hover:bg-rhozly-primary/5 rounded-2xl transition-all border border-rhozly-outline/10"
            >
              <Settings2 className="w-6 h-6" />
            </button>
            <button
              onClick={onClose}
              className="p-3 text-rhozly-on-surface/40 hover:text-rhozly-on-surface hover:bg-rhozly-surface-low rounded-2xl transition-all border border-rhozly-outline/10"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* PLANT LIST */}
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1 mt-4">
            <div className="flex gap-2 bg-rhozly-surface-low p-1.5 rounded-2xl border border-rhozly-outline/5">
              <button
                onClick={() => setShowHistory(false)}
                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${!showHistory ? "bg-white text-rhozly-on-surface shadow-sm" : "text-rhozly-on-surface/40 hover:text-rhozly-on-surface"}`}
              >
                Active
              </button>
              <button
                onClick={() => setShowHistory(true)}
                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${showHistory ? "bg-white text-rhozly-primary shadow-sm flex items-center gap-1" : "text-rhozly-on-surface/40 hover:text-rhozly-on-surface"}`}
              >
                {showHistory && <History size={12} />} History
              </button>
            </div>
          </div>

          {loading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-rhozly-primary" />
            </div>
          ) : displayedPlants.length > 0 ? (
            displayedPlants.map((plant) => (
              <div
                key={plant.id}
                className="bg-white rounded-3xl p-5 border shadow-sm flex items-center justify-between transition-all border-rhozly-outline/10 hover:border-rhozly-primary/30"
              >
                <div className="flex items-center gap-4">
                  <div className="bg-rhozly-primary/5 text-rhozly-primary p-3 rounded-2xl">
                    <Sprout className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-black text-lg text-rhozly-on-surface">
                      {plant.identifier}
                    </h4>
                    <p className="text-[10px] font-bold text-rhozly-on-surface/50">
                      {plant.plant_name}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setEditingInstance(plant)}
                    className="p-3 text-rhozly-primary/60 hover:text-rhozly-primary rounded-xl"
                  >
                    <Settings2 className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => setPlantToManage(plant)}
                    className="p-3 text-rhozly-on-surface/30 hover:text-red-500 rounded-xl"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="py-16 text-center bg-rhozly-surface-lowest rounded-3xl border border-rhozly-outline/30 opacity-50">
              No plants here yet.
            </div>
          )}
        </div>
      </div>

      {/* 🚀 THE PORTAL LAYER: Escaping the trap */}
      {typeof document !== "undefined" &&
        createPortal(
          <>
            {/* 1. AREA CONFIGURATION MODAL (THE FIX!) */}
            {isEditingArea && (
              <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-rhozly-bg/95 backdrop-blur-md animate-in fade-in zoom-in-95">
                <div className="bg-white w-full max-w-2xl rounded-[3rem] p-8 shadow-2xl border border-rhozly-outline/10 max-h-[90vh] overflow-y-auto custom-scrollbar">
                  <div className="flex justify-between items-center mb-8">
                    <div>
                      <h3 className="text-3xl font-black">
                        Area Configuration
                      </h3>
                      <p className="text-xs font-bold text-rhozly-on-surface/40 uppercase tracking-widest mt-1">
                        Refine metrics for {area.name}
                      </p>
                    </div>
                    <button
                      onClick={() => setIsEditingArea(false)}
                      className="p-3 bg-rhozly-surface-low rounded-2xl hover:scale-110 transition-transform"
                    >
                      <X size={24} />
                    </button>
                  </div>

                  <div className="space-y-8">
                    <div className="space-y-3">
                      <label className="text-[10px] font-black uppercase text-rhozly-on-surface/40 ml-1">
                        Area Name
                      </label>
                      <input
                        type="text"
                        value={areaEditData.name}
                        onChange={(e) =>
                          setAreaEditData({
                            ...areaEditData,
                            name: e.target.value,
                          })
                        }
                        className="w-full p-4 bg-rhozly-surface-low rounded-2xl font-black border border-transparent focus:border-rhozly-primary outline-none"
                      />
                    </div>
                    {/* Reusing your Advanced Fields Component */}
                    <AreaAdvancedFields
                      data={areaEditData}
                      onChange={(fields) =>
                        setAreaEditData({ ...areaEditData, ...fields })
                      }
                    />
                  </div>

                  <button
                    onClick={handleUpdateArea}
                    disabled={savingArea}
                    className="w-full py-5 mt-10 bg-rhozly-primary text-white rounded-2xl font-black text-lg shadow-xl flex items-center justify-center gap-2"
                  >
                    {savingArea ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <>
                        <Check /> Save Area Settings
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* 2. MANAGE PLANT MODAL */}
            {plantToManage && (
              <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-rhozly-bg/95 backdrop-blur-md animate-in fade-in zoom-in-95">
                <div className="bg-white w-full max-w-md rounded-[3rem] p-8 shadow-2xl border border-rhozly-outline/10 flex flex-col items-center text-center relative overflow-hidden">
                  <button
                    onClick={() => setPlantToManage(null)}
                    className="absolute top-6 right-6 p-2 bg-gray-100 rounded-full"
                  >
                    <X size={20} />
                  </button>
                  <div className="w-20 h-20 bg-gray-50 text-gray-400 rounded-full flex items-center justify-center mb-6">
                    <Archive size={40} />
                  </div>
                  <h3 className="text-2xl font-black">Manage Plant</h3>
                  <p className="text-sm font-bold text-rhozly-on-surface/60 mb-8">
                    What would you like to do with {plantToManage.identifier}?
                  </p>
                  <div className="flex flex-col gap-3 w-full">
                    <button
                      onClick={handleArchiveItem}
                      disabled={isManagingItem}
                      className="w-full py-4 bg-amber-100 text-amber-800 rounded-2xl font-black flex items-center justify-center gap-2"
                    >
                      {isManagingItem ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <>
                          <History size={20} /> Move to History
                        </>
                      )}
                    </button>
                    <button
                      onClick={() =>
                        window.confirm("Delete entirely?") &&
                        handleArchiveItem()
                      }
                      className="w-full py-4 bg-red-50 text-red-600 rounded-2xl font-black"
                    >
                      Permanently Delete
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 3. INSTANCE EDIT MODAL */}
            {editingInstance && (
              <InstanceEditModal
                homeId={homeId}
                instance={editingInstance}
                currentAreaId={area.id}
                onClose={() => setEditingInstance(null)}
                onUpdate={(payload) => {
                  setPlants(
                    plants.map((p) =>
                      p.id === editingInstance.id ? { ...p, ...payload } : p,
                    ),
                  );
                  setEditingInstance(null);
                }}
                onTasksUpdated={onTasksUpdated}
              />
            )}
          </>,
          document.body,
        )}
    </>
  );
}
