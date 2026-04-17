import React, { useState, useEffect } from "react";
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
  Archive, // 🚀 NEW ICON
  History, // 🚀 NEW ICON
  Check, // Added Check to fix the missing icon from the original snippet
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { Logger } from "../lib/errorHandler";
import toast from "react-hot-toast";
import { ConfirmModal } from "./ConfirmModal";
import PlantSearchModal from "./PlantSearchModal";
import ManualPlantCreation from "./ManualPlantCreation";
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
  // 🧠 GRAB THE SETTER FROM CONTEXT
  const { setPageContext } = usePlantDoctor();

  const [plants, setPlants] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  if (!area) return null;

  // --- AREA CONFIGURATION STATE ---
  const [isEditingArea, setIsEditingArea] = useState(false);
  const [areaEditData, setAreaEditData] = useState(area);
  const [savingArea, setSavingArea] = useState(false);

  // --- RECOMMENDATION STATES ---
  const [isGettingRecs, setIsGettingRecs] = useState(false);
  const [recommendations, setRecommendations] = useState<any[] | null>(null);
  const [areaTasks, setAreaTasks] = useState<any[]>([]);

  // --- ONE-CLICK WORKFLOW STATES ---
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [draftingPlant, setDraftingPlant] = useState<string | null>(null);
  const [aiGeneratedPlantData, setAiGeneratedPlantData] = useState<any>(null);

  // --- EXISTING STATES ---
  const [editingInstance, setEditingInstance] = useState<InventoryItem | null>(
    null,
  );

  // 🚀 NEW: State to manage the History view toggle
  const [showHistory, setShowHistory] = useState(false);

  // 🚀 UPDATED: Delete state to handle the two-tier archive/delete modal
  const [plantToManage, setPlantToManage] = useState<InventoryItem | null>(
    null,
  );
  const [isManagingItem, setIsManagingItem] = useState(false);

  // --- ADD PLANT WIZARD STATES ---
  const [addFlow, setAddFlow] = useState<
    | "hidden"
    | "choose_source"
    | "create_choose"
    | "shed_select"
    | "search"
    | "manual"
    | "assign"
  >("hidden");
  const [shedPlants, setShedPlants] = useState<any[]>([]);
  const [loadingShed, setLoadingShed] = useState(false);
  const [selectedMasterPlant, setSelectedMasterPlant] = useState<any>(null);
  const [isAssigning, setIsAssigning] = useState(false);
  const [assignForm, setAssignForm] = useState({
    identifier: "",
    status: "Planted",
    growth_state: "Vegetative",
    is_established: false,
    planted_at: new Date().toISOString().split("T")[0],
  });

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
      Logger.error("Failed to fetch plants", error, { areaId: area.id });
      toast.error("Could not load plants.");
    } finally {
      setLoading(false);
    }
  };

  const fetchAreaTasks = async () => {
    try {
      const { data } = await supabase
        .from("tasks")
        .select("title, description, status")
        .eq("area_id", area.id)
        .eq("status", "Pending");
      if (data) setAreaTasks(data);
    } catch (err) {
      console.error("Failed to fetch tasks for context", err);
    }
  };

  const fetchShedPlants = async () => {
    setLoadingShed(true);
    try {
      const { data, error } = await supabase
        .from("plants")
        .select("*")
        .eq("home_id", homeId)
        .order("common_name", { ascending: true });

      if (error) throw error;
      setShedPlants(data || []);
    } catch (error) {
      toast.error("Failed to load Shed inventory.");
    } finally {
      setLoadingShed(false);
    }
  };

  useEffect(() => {
    fetchPlants();
    fetchAreaTasks();
    fetchShedPlants();
  }, [area.id]);

  // 🧠 LIVE AI SYNC: Let the AI know exactly what Area we are looking at and what's growing inside it!
  useEffect(() => {
    if (!area) return;

    setPageContext({
      action: "Viewing Area Details",
      areaDetails: {
        name: area.name,
        isOutside: isOutside,
        sunlight: area.sunlight || "Unknown",
        growingMedium: area.growing_medium || "Unknown",
        pHLevel: area.medium_ph || "Unknown",
      },
      currentPlantsInArea: plants
        .filter((p) => p.status !== "Archived")
        .map((p) => ({
          name: p.plant_name,
          identifier: p.identifier,
          status: p.status,
          growthState: p.growth_state || "Unknown",
        })),
    });

    // Cleanup when leaving the area page
    return () => setPageContext(null);
  }, [area, plants, isOutside, setPageContext]);

  const getPlantRecommendations = async () => {
    setIsGettingRecs(true);
    setRecommendations(null);

    const payload = {
      action: "recommend_plants",
      isOutside,
      areaData: {
        growing_medium: area.growing_medium,
        medium_texture: area.medium_texture,
        medium_ph: area.medium_ph,
        light_intensity_lux: area.light_intensity_lux,
        water_movement: area.water_movement,
        nutrient_source: area.nutrient_source,
      },
      existingPlants: plants
        .filter((p) => p.status !== "Archived")
        .map((p) => ({
          plant_name: p.plant_name,
          status: p.status,
        })),
      tasks: areaTasks,
    };

    try {
      const { data, error } = await supabase.functions.invoke("plant-doctor", {
        body: payload,
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

  const handleAiAutoFill = async (plantName: string) => {
    setDraftingPlant(plantName);
    try {
      const { data, error } = await supabase.functions.invoke("plant-doctor", {
        body: { action: "generate_care_guide", targetPlant: plantName },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setAiGeneratedPlantData(data.plantData);
      setAddFlow("manual");
    } catch (error: any) {
      toast.error("Failed to generate care guide automatically.");
    } finally {
      setDraftingPlant(null);
    }
  };

  const handleUpdateArea = async () => {
    if (!areaEditData.name.trim())
      return toast.error("Area name cannot be empty.");
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

  const startShedSelection = () => {
    setAddFlow("shed_select");
    fetchShedPlants();
  };

  const handleSelectMasterPlant = (plant: any) => {
    setSelectedMasterPlant(plant);
    setAssignForm({ ...assignForm, identifier: plant.common_name });
    setAddFlow("assign");
  };

  const handleAssignSubmit = async () => {
    if (!selectedMasterPlant) return;
    setIsAssigning(true);

    try {
      const { data: areaData } = await supabase
        .from("areas")
        .select("name, location_id, locations(name)")
        .eq("id", assignForm.areaId || area.id)
        .single();
      if (!areaData) throw new Error("Area not found");

      const locationName = areaData.locations?.name || "Unknown Location";
      const payload = {
        home_id: homeId,
        plant_id: selectedMasterPlant.id,
        plant_name: selectedMasterPlant.common_name,
        status: assignForm.status,
        location_id: areaData.location_id,
        location_name: locationName,
        area_id: area.id,
        area_name: areaData.name,
        planted_at:
          assignForm.status === "Planted" && !assignForm.is_established
            ? assignForm.planted_at
            : null,
        is_established: assignForm.is_established,
        growth_state:
          assignForm.status === "Planted" ? assignForm.growth_state : null,
        identifier: assignForm.identifier || selectedMasterPlant.common_name,
      };

      const { error } = await supabase
        .from("inventory_items")
        .insert([payload]);
      if (error) throw error;

      toast.success(`${payload.identifier} added to ${area.name}!`);
      setAddFlow("hidden");
      setSelectedMasterPlant(null);
      fetchPlants();
      if (onTasksUpdated) onTasksUpdated();
    } catch (error: any) {
      toast.error(`Assignment failed: ${error.message}`);
    } finally {
      setIsAssigning(false);
    }
  };

  // 🚀 NEW: Safe Archiving Function with Task Cleanup
  const handleArchiveItem = async () => {
    if (!plantToManage) return;
    setIsManagingItem(true);
    try {
      // 1. Move the plant to History
      const { error: updateError } = await supabase
        .from("inventory_items")
        .update({ status: "Archived" })
        .eq("id", plantToManage.id);

      if (updateError) throw updateError;

      // 2. Destroy all Automations/Blueprints for this specific plant instance
      const { error: bpError } = await supabase
        .from("task_blueprints")
        .delete()
        .eq("inventory_item_id", plantToManage.id);

      if (bpError) throw bpError;

      // 3. Clear any active "Pending" tasks off the calendar (Leaves 'Completed' tasks for history records!)
      const { error: taskError } = await supabase
        .from("tasks")
        .delete()
        .eq("inventory_item_id", plantToManage.id)
        .eq("status", "Pending");

      if (taskError) throw taskError;

      toast.success(`${plantToManage.identifier} moved to History.`);
      // Update local state instead of refetching to feel faster
      setPlants(
        plants.map((p) =>
          p.id === plantToManage.id ? { ...p, status: "Archived" } : p,
        ),
      );
      if (onTasksUpdated) onTasksUpdated();
    } catch (error: any) {
      toast.error("Could not archive plant and clear tasks.");
      Logger.error("Archive Error", error);
    } finally {
      setIsManagingItem(false);
      setPlantToManage(null);
    }
  };

  // 🚀 UPDATED: Permanent Delete Function (Nuclear Option)
  const handlePermanentDelete = async () => {
    if (!plantToManage) return;
    setIsManagingItem(true);
    try {
      const { error } = await supabase
        .from("inventory_items")
        .delete()
        .eq("id", plantToManage.id);

      if (error) throw error;

      toast.success("Plant permanently deleted.");
      setPlants(plants.filter((p) => p.id !== plantToManage.id));
      if (onTasksUpdated) onTasksUpdated();
    } catch (error: any) {
      toast.error("Could not delete plant.");
    } finally {
      setIsManagingItem(false);
      setPlantToManage(null);
    }
  };

  // 🚀 DYNAMIC FILTERING based on the History toggle
  const activePlants = plants.filter((p) => p.status !== "Archived");
  const archivedPlants = plants.filter((p) => p.status === "Archived");
  const displayedPlants = showHistory ? archivedPlants : activePlants;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500 pb-32">
      {/* ... [RECOMMENDATIONS, ADD FLOWS, AND MODALS REMAIN IDENTICAL] ... */}

      {/* 🚀 THE NEW TWO-TIER MANAGEMENT MODAL */}
      {plantToManage && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-rhozly-bg/95 backdrop-blur-md animate-in fade-in zoom-in-95">
          <div className="bg-white w-full max-w-md rounded-[3rem] p-8 shadow-2xl border border-rhozly-outline/10 flex flex-col items-center text-center relative overflow-hidden">
            <button
              onClick={() => setPlantToManage(null)}
              className="absolute top-6 right-6 p-2 bg-gray-100 rounded-full hover:bg-gray-200"
            >
              <X size={20} />
            </button>

            <div className="w-20 h-20 bg-gray-50 text-gray-400 rounded-full flex items-center justify-center mb-6 shadow-inner border border-gray-200">
              <Archive size={40} />
            </div>

            <h3 className="text-2xl font-black leading-tight text-rhozly-on-surface mb-2">
              Manage Plant
            </h3>
            <p className="text-sm font-bold text-rhozly-on-surface/60 mb-8 leading-relaxed">
              What would you like to do with{" "}
              <span className="text-rhozly-primary">
                {plantToManage.identifier}
              </span>
              ?
            </p>

            <div className="flex flex-col gap-3 w-full">
              {plantToManage.status !== "Archived" && (
                <button
                  onClick={handleArchiveItem}
                  disabled={isManagingItem}
                  className="w-full py-4 bg-amber-100 hover:bg-amber-200 text-amber-800 rounded-2xl font-black transition-colors flex items-center justify-center gap-2"
                >
                  {isManagingItem ? (
                    <Loader2 className="animate-spin" size={20} />
                  ) : (
                    <>
                      <History size={20} /> Move to History (Recommended)
                    </>
                  )}
                </button>
              )}

              <button
                onClick={() => {
                  if (
                    window.confirm(
                      "Are you 100% sure? This will delete all history, tasks, and journals associated with this specific plant instance.",
                    )
                  ) {
                    handlePermanentDelete();
                  }
                }}
                disabled={isManagingItem}
                className="w-full py-4 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-2xl font-black transition-colors flex items-center justify-center gap-2"
              >
                {isManagingItem ? (
                  <Loader2 className="animate-spin" size={20} />
                ) : (
                  <>
                    <Trash2 size={20} /> Permanently Delete
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

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
            title="AI Recommendations"
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
            title="Area Configuration"
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

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gradient-to-br from-rhozly-primary to-rhozly-primary-container rounded-3xl p-6 text-white shadow-md">
          <p className="text-xs font-bold text-white/70 uppercase tracking-widest mb-1">
            Total Plants
          </p>
          <p className="text-3xl font-black font-display">
            {activePlants.length}
          </p>
        </div>
        <div className="bg-white rounded-3xl p-6 border border-rhozly-outline/10 shadow-sm">
          <p className="text-xs font-bold text-rhozly-on-surface/50 uppercase tracking-widest mb-1">
            In Ground
          </p>
          <p className="text-3xl font-black font-display text-rhozly-primary">
            {activePlants.filter((p) => p.status === "Planted").length}
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between px-1 mt-4">
          {/* 🚀 THE HISTORY TOGGLE BUTTON */}
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

          {!showHistory && (
            <button
              onClick={() => setAddFlow("choose_source")}
              className="flex items-center gap-1 text-[11px] font-black uppercase tracking-widest bg-rhozly-primary text-white px-4 py-2 rounded-xl hover:scale-105 transition-transform shadow-md"
            >
              <Plus size={14} strokeWidth={3} /> Add Plant
            </button>
          )}
        </div>

        {loading ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-rhozly-primary" />
          </div>
        ) : displayedPlants.length > 0 ? (
          displayedPlants.map((plant) => (
            <div
              key={plant.id}
              className={`bg-white rounded-3xl p-5 border shadow-sm flex items-center justify-between transition-all ${plant.status === "Archived" ? "border-dashed border-gray-300 opacity-70" : "border-rhozly-outline/10 hover:border-rhozly-primary/30"}`}
            >
              <div className="flex items-center gap-4 min-w-0">
                <div
                  className={`${plant.status === "Archived" ? "bg-gray-100 text-gray-400" : "bg-rhozly-primary/5 text-rhozly-primary"} p-3 rounded-2xl hidden sm:block shrink-0`}
                >
                  {plant.status === "Archived" ? (
                    <Archive className="w-6 h-6" />
                  ) : (
                    <Sprout className="w-6 h-6" />
                  )}
                </div>
                <div className="min-w-0">
                  <h4
                    className={`font-black text-lg flex items-center gap-2 truncate ${plant.status === "Archived" ? "text-gray-500" : "text-rhozly-on-surface"}`}
                  >
                    {plant.identifier}
                  </h4>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <span className="text-[10px] font-bold text-rhozly-on-surface/50 border border-rhozly-outline/10 px-2 py-0.5 rounded-md truncate max-w-[120px]">
                      {plant.plant_name}
                    </span>
                    <span
                      className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md 
                        ${
                          plant.status === "Planted"
                            ? "bg-green-50 text-green-600"
                            : plant.status === "Archived"
                              ? "bg-gray-100 text-gray-500"
                              : "bg-blue-50 text-blue-600"
                        }`}
                    >
                      {plant.status}
                    </span>
                    {plant.growth_state && plant.status !== "Archived" && (
                      <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md bg-orange-50 text-orange-600">
                        {plant.growth_state}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0 ml-2">
                <button
                  onClick={() => setEditingInstance(plant)}
                  className="p-3 text-rhozly-primary/60 hover:text-rhozly-primary hover:bg-rhozly-primary/10 rounded-xl transition-all"
                >
                  <Settings2 className="w-5 h-5" />
                </button>

                {/* 🚀 This now opens our new Manage Modal instead of instantly deleting */}
                <button
                  onClick={() => setPlantToManage(plant)}
                  className="p-3 text-rhozly-on-surface/30 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="py-16 text-center bg-rhozly-surface-lowest rounded-3xl border border-rhozly-outline/30">
            <div className="w-20 h-20 bg-rhozly-primary/5 rounded-3xl flex items-center justify-center mx-auto mb-6">
              {showHistory ? (
                <Archive className="w-10 h-10 text-rhozly-primary/30" />
              ) : (
                <Database className="w-10 h-10 text-rhozly-primary/30" />
              )}
            </div>
            <p className="text-rhozly-on-surface/80 font-black text-lg mb-2">
              {showHistory ? "No history here." : "No plants in this area yet."}
            </p>
            {!showHistory && (
              <p className="text-sm text-rhozly-on-surface/50 font-bold max-w-[280px] mx-auto leading-relaxed">
                Click the Add Plant button above to get started!
              </p>
            )}
          </div>
        )}
      </div>

      {/* ... [KEEP THE EXISTING EDITING INSTANCE AND CONFIRM MODAL BLOCKS AT THE BOTTOM] ... */}

      {editingInstance && (
        <InstanceEditModal
          homeId={homeId}
          instance={editingInstance}
          currentAreaId={area.id}
          onClose={() => setEditingInstance(null)}
          onUpdate={(payload) => {
            if (payload.area_id !== area.id) {
              setPlants(plants.filter((p) => p.id !== editingInstance.id));
            } else {
              setPlants(
                plants.map((p) =>
                  p.id === editingInstance.id ? { ...p, ...payload } : p,
                ),
              );
            }
          }}
          onTasksUpdated={onTasksUpdated}
        />
      )}
    </div>
  );
}
