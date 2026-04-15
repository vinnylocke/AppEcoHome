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
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { Logger } from "../lib/errorHandler";
import toast from "react-hot-toast";
import { ConfirmModal } from "./ConfirmModal";
import PlantSearchModal from "./PlantSearchModal";
import ManualPlantCreation from "./ManualPlantCreation";
import AreaAdvancedFields from "./AreaAdvancedFields";
import InstanceEditModal from "./InstanceEditModal"; // 🚀 IMPORT NEW MODAL

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
  const [plantToDelete, setPlantToDelete] = useState<InventoryItem | null>(
    null,
  );
  const [isDeleting, setIsDeleting] = useState(false);

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
      existingPlants: plants.map((p) => ({
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
        .eq("id", assignForm.areaId || area.id) // Fallback to current area if missing
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

  const handleConfirmDelete = async () => {
    if (!plantToDelete) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from("inventory_items")
        .delete()
        .eq("id", plantToDelete.id);
      if (error) throw error;
      toast.success("Plant removed from area.");
      setPlants(plants.filter((p) => p.id !== plantToDelete.id));
    } catch (error: any) {
      toast.error("Could not remove plant.");
    } finally {
      setIsDeleting(false);
      setPlantToDelete(null);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
      {recommendations && addFlow === "hidden" && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-rhozly-bg/95 backdrop-blur-xl animate-in zoom-in-95">
          <div className="bg-rhozly-surface-lowest w-full max-w-2xl max-h-[85vh] overflow-y-auto custom-scrollbar rounded-[3rem] p-8 shadow-2xl border border-rhozly-outline/20">
            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center gap-3">
                <div className="bg-rhozly-primary/10 p-3 rounded-2xl text-rhozly-primary">
                  <BrainCircuit size={28} />
                </div>
                <div>
                  <h3 className="text-2xl font-black">
                    Expert Recommendations
                  </h3>
                  <p className="text-[10px] font-black uppercase text-rhozly-primary tracking-widest">
                    Consultation for {area.name}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setRecommendations(null)}
                className="p-3 bg-rhozly-surface-low rounded-2xl hover:scale-110 transition-transform"
              >
                <X size={24} />
              </button>
            </div>

            <div className="space-y-4 mb-8">
              {recommendations.map((rec, i) => {
                const matchedShedPlant = shedPlants.find(
                  (sp) =>
                    sp.common_name
                      .toLowerCase()
                      .includes(rec.name.toLowerCase()) ||
                    rec.name
                      .toLowerCase()
                      .includes(sp.common_name.toLowerCase()),
                );
                return (
                  <div
                    key={i}
                    className="p-6 bg-white border border-rhozly-outline/10 rounded-[2rem] shadow-sm group hover:border-rhozly-primary/30 transition-all"
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg bg-rhozly-primary/5 text-rhozly-primary">
                          {rec.category}
                        </span>
                      </div>
                      <p className="text-[10px] font-bold text-rhozly-on-surface/30 italic">
                        {rec.scientific_name}
                      </p>
                    </div>
                    <h4 className="text-xl font-black text-rhozly-on-surface mb-2">
                      {rec.name}
                    </h4>
                    <div className="bg-rhozly-surface-low rounded-2xl p-4 border border-rhozly-outline/5 relative">
                      <div className="absolute -top-2 left-4 px-2 bg-white rounded-md border border-rhozly-outline/10">
                        <p className="text-[8px] font-black uppercase tracking-tighter text-rhozly-primary">
                          Doctor's Reasoning
                        </p>
                      </div>
                      <p className="text-sm text-rhozly-on-surface/80 font-medium leading-relaxed italic">
                        "{rec.reason}"
                      </p>
                    </div>
                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {matchedShedPlant && (
                        <button
                          onClick={() =>
                            handleSelectMasterPlant(matchedShedPlant)
                          }
                          className="w-full py-3 bg-green-50 hover:bg-green-100 text-green-700 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 sm:col-span-2"
                        >
                          <Sprout size={14} /> Add From Shed (
                          {matchedShedPlant.common_name})
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setSearchTerm(rec.name);
                          setAddFlow("search");
                        }}
                        className="w-full py-3 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                      >
                        <Globe size={14} /> Global Search
                      </button>
                      <button
                        onClick={() => handleAiAutoFill(rec.name)}
                        disabled={draftingPlant === rec.name}
                        className="w-full py-3 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {draftingPlant === rec.name ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <BrainCircuit size={14} />
                        )}{" "}
                        AI Auto-Fill
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <button
              onClick={() => setRecommendations(null)}
              className="w-full py-5 bg-rhozly-primary text-white rounded-2xl font-black text-lg shadow-xl hover:scale-[1.02] active:scale-95 transition-all"
            >
              Done with Consultation
            </button>
          </div>
        </div>
      )}

      {addFlow === "search" && (
        <div className="fixed inset-0 z-[100]">
          <PlantSearchModal
            homeId={homeId}
            isPremium={true}
            initialSearchTerm={searchTerm}
            onClose={() => {
              setAddFlow("hidden");
              setSearchTerm("");
            }}
            onSuccess={(newMasterPlant) => {
              if (newMasterPlant) handleSelectMasterPlant(newMasterPlant);
              else setAddFlow("hidden");
              setSearchTerm("");
            }}
          />
        </div>
      )}

      {addFlow === "manual" && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-rhozly-bg/95 backdrop-blur-xl">
          <div className="bg-white w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-[2.5rem] p-6 shadow-2xl border border-rhozly-outline/20">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-black">
                {aiGeneratedPlantData
                  ? `Review ${aiGeneratedPlantData.common_name}`
                  : "Create New Plant"}
              </h2>
              <button
                onClick={() => {
                  setAddFlow("hidden");
                  setAiGeneratedPlantData(null);
                }}
                className="p-2 hover:bg-rhozly-surface-low rounded-xl"
              >
                <X size={24} />
              </button>
            </div>
            <ManualPlantCreation
              initialData={aiGeneratedPlantData}
              onCancel={() => {
                setAddFlow("hidden");
                setAiGeneratedPlantData(null);
              }}
              onSave={async (plantData) => {
                try {
                  const { data, error } = await supabase
                    .from("plants")
                    .insert([
                      { ...plantData, home_id: homeId, source: "manual" },
                    ])
                    .select()
                    .single();
                  if (error) throw error;
                  toast.success("Plant added to The Shed!");
                  setAiGeneratedPlantData(null);
                  handleSelectMasterPlant(data);
                } catch (e) {
                  toast.error("Failed to save plant.");
                }
              }}
              isSaving={false}
            />
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

      {isEditingArea && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-rhozly-bg/95 backdrop-blur-xl animate-in fade-in">
          <div className="bg-rhozly-surface-lowest w-full max-w-2xl max-h-[90vh] overflow-y-auto custom-scrollbar rounded-[3rem] p-8 shadow-2xl border border-rhozly-outline/20">
            <div className="flex justify-between items-start mb-8">
              <div>
                <h3 className="text-3xl font-black">Area Configuration</h3>
                <p className="text-[10px] font-black uppercase text-rhozly-primary tracking-widest mt-1">
                  Environment & Medium Settings
                </p>
              </div>
              <button
                onClick={() => setIsEditingArea(false)}
                className="p-2 hover:bg-rhozly-surface-low rounded-xl"
              >
                <X size={20} />
              </button>
            </div>
            <div className="space-y-8">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-rhozly-on-surface/40 ml-1">
                  Area Name
                </label>
                <input
                  type="text"
                  value={areaEditData.name}
                  onChange={(e) =>
                    setAreaEditData({ ...areaEditData, name: e.target.value })
                  }
                  className="w-full p-4 bg-rhozly-surface-low rounded-2xl font-black outline-none border border-transparent focus:border-rhozly-primary"
                />
              </div>
              <hr className="border-rhozly-outline/10" />
              <AreaAdvancedFields
                data={areaEditData}
                onChange={(fields) =>
                  setAreaEditData({ ...areaEditData, ...fields })
                }
              />
              <button
                onClick={handleUpdateArea}
                disabled={savingArea}
                className="w-full py-5 bg-rhozly-primary text-white rounded-2xl font-black text-lg shadow-xl flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
              >
                {savingArea ? (
                  <Loader2 className="animate-spin" size={24} />
                ) : (
                  <>
                    <Check size={24} /> Save Configuration
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gradient-to-br from-rhozly-primary to-rhozly-primary-container rounded-3xl p-6 text-white shadow-md">
          <p className="text-xs font-bold text-white/70 uppercase tracking-widest mb-1">
            Total Plants
          </p>
          <p className="text-3xl font-black font-display">{plants.length}</p>
        </div>
        <div className="bg-white rounded-3xl p-6 border border-rhozly-outline/10 shadow-sm">
          <p className="text-xs font-bold text-rhozly-on-surface/50 uppercase tracking-widest mb-1">
            In Ground
          </p>
          <p className="text-3xl font-black font-display text-rhozly-primary">
            {plants.filter((p) => p.status === "Planted").length}
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between px-1 mt-4">
          <h3 className="font-display font-black text-rhozly-on-surface/60 uppercase tracking-widest text-sm">
            Inventory
          </h3>
          <button
            onClick={() => setAddFlow("choose_source")}
            className="flex items-center gap-1 text-[11px] font-black uppercase tracking-widest bg-rhozly-primary text-white px-4 py-2 rounded-xl hover:scale-105 transition-transform shadow-md"
          >
            <Plus size={14} strokeWidth={3} /> Add Plant
          </button>
        </div>
        {loading ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-rhozly-primary" />
          </div>
        ) : plants.length > 0 ? (
          plants.map((plant) => (
            <div
              key={plant.id}
              className="bg-white rounded-3xl p-5 border border-rhozly-outline/10 shadow-sm flex items-center justify-between hover:border-rhozly-primary/30 transition-all"
            >
              <div className="flex items-center gap-4 min-w-0">
                <div className="bg-rhozly-primary/5 p-3 rounded-2xl hidden sm:block shrink-0">
                  <Sprout className="w-6 h-6 text-rhozly-primary" />
                </div>
                <div className="min-w-0">
                  <h4 className="font-black text-lg text-rhozly-on-surface flex items-center gap-2 truncate">
                    {plant.identifier}
                  </h4>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <span className="text-[10px] font-bold text-rhozly-on-surface/50 border border-rhozly-outline/10 px-2 py-0.5 rounded-md truncate max-w-[120px]">
                      {plant.plant_name}
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
              <div className="flex items-center gap-1 shrink-0 ml-2">
                <button
                  onClick={() => setEditingInstance(plant)}
                  className="p-3 text-rhozly-primary/60 hover:text-rhozly-primary hover:bg-rhozly-primary/10 rounded-xl transition-all"
                >
                  <Settings2 className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setPlantToDelete(plant)}
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
              <Database className="w-10 h-10 text-rhozly-primary/30" />
            </div>
            <p className="text-rhozly-on-surface/80 font-black text-lg mb-2">
              No plants in this area yet.
            </p>
            <p className="text-sm text-rhozly-on-surface/50 font-bold max-w-[280px] mx-auto leading-relaxed">
              Click the Add Plant button above to get started!
            </p>
          </div>
        )}
      </div>

      {addFlow !== "hidden" && addFlow !== "search" && addFlow !== "manual" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-rhozly-bg/95 backdrop-blur-xl animate-in fade-in duration-300">
          <div className="bg-rhozly-surface-lowest w-full max-w-lg rounded-[3rem] p-8 shadow-2xl border border-rhozly-outline/20 relative">
            <div className="flex justify-between items-start mb-8">
              <div>
                <h3 className="text-3xl font-black text-rhozly-on-surface">
                  Add Plant
                </h3>
                <p className="text-sm font-bold text-rhozly-primary uppercase tracking-widest mt-1">
                  {area.name}
                </p>
              </div>
              <button
                onClick={() => setAddFlow("hidden")}
                className="p-3 bg-rhozly-surface-low rounded-2xl hover:scale-110 transition-transform"
              >
                <X size={24} />
              </button>
            </div>

            {addFlow === "choose_source" && (
              <div className="space-y-4 animate-in slide-in-from-right-4">
                <button
                  onClick={startShedSelection}
                  className="w-full p-6 bg-white border border-rhozly-outline/10 rounded-3xl flex items-center gap-5 hover:border-rhozly-primary/40 hover:shadow-md transition-all group"
                >
                  <div className="bg-rhozly-primary/10 p-4 rounded-2xl text-rhozly-primary group-hover:scale-110 transition-transform">
                    <Sprout size={28} />
                  </div>
                  <div className="text-left">
                    <h4 className="text-xl font-black text-rhozly-on-surface">
                      Add from Shed
                    </h4>
                    <p className="text-sm text-rhozly-on-surface/60 font-bold mt-1">
                      Assign an existing plant from your master inventory.
                    </p>
                  </div>
                </button>
                <button
                  onClick={() => setAddFlow("create_choose")}
                  className="w-full p-6 bg-white border border-rhozly-outline/10 rounded-3xl flex items-center gap-5 hover:border-rhozly-primary/40 hover:shadow-md transition-all group"
                >
                  <div className="bg-rhozly-primary/10 p-4 rounded-2xl text-rhozly-primary group-hover:scale-110 transition-transform">
                    <Plus size={28} />
                  </div>
                  <div className="text-left">
                    <h4 className="text-xl font-black text-rhozly-on-surface">
                      Add New Plant
                    </h4>
                    <p className="text-sm text-rhozly-on-surface/60 font-bold mt-1">
                      Create a brand new plant to add to your Shed and this
                      Area.
                    </p>
                  </div>
                </button>
              </div>
            )}

            {addFlow === "create_choose" && (
              <div className="space-y-4 animate-in slide-in-from-right-4">
                <button
                  onClick={() => setAddFlow("search")}
                  className="w-full p-6 bg-white border border-rhozly-outline/10 rounded-3xl flex items-center gap-5 hover:border-rhozly-primary/40 hover:shadow-md transition-all group"
                >
                  <div className="bg-blue-50 p-4 rounded-2xl text-blue-600 group-hover:scale-110 transition-transform">
                    <Globe size={28} />
                  </div>
                  <div className="text-left">
                    <h4 className="text-xl font-black text-rhozly-on-surface">
                      Search Global Database
                    </h4>
                    <p className="text-sm text-rhozly-on-surface/60 font-bold mt-1">
                      Instantly fetch care guides and details from Perenual.
                    </p>
                  </div>
                </button>
                <button
                  onClick={() => setAddFlow("manual")}
                  className="w-full p-6 bg-white border border-rhozly-outline/10 rounded-3xl flex items-center gap-5 hover:border-rhozly-primary/40 hover:shadow-md transition-all group"
                >
                  <div className="bg-amber-50 p-4 rounded-2xl text-amber-600 group-hover:scale-110 transition-transform">
                    <PenTool size={28} />
                  </div>
                  <div className="text-left">
                    <h4 className="text-xl font-black text-rhozly-on-surface">
                      Manual Entry
                    </h4>
                    <p className="text-sm text-rhozly-on-surface/60 font-bold mt-1">
                      Type out the specific plant details yourself.
                    </p>
                  </div>
                </button>
                <button
                  onClick={() => setAddFlow("choose_source")}
                  className="w-full py-4 text-sm font-bold text-rhozly-on-surface/40 hover:text-rhozly-on-surface"
                >
                  ← Back
                </button>
              </div>
            )}

            {addFlow === "shed_select" && (
              <div className="space-y-4 animate-in slide-in-from-right-4 h-full max-h-[60vh] flex flex-col">
                {loadingShed ? (
                  <div className="py-12 flex justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-rhozly-primary" />
                  </div>
                ) : shedPlants.length === 0 ? (
                  <div className="text-center p-6 bg-rhozly-surface-low rounded-2xl">
                    <p className="font-bold text-rhozly-on-surface/60">
                      Your shed is empty!
                    </p>
                  </div>
                ) : (
                  <div className="overflow-y-auto custom-scrollbar pr-2 space-y-2 flex-1">
                    {shedPlants.map((plant) => (
                      <button
                        key={plant.id}
                        onClick={() => handleSelectMasterPlant(plant)}
                        className="w-full text-left p-4 bg-white border border-rhozly-outline/10 rounded-2xl hover:border-rhozly-primary/40 hover:bg-rhozly-primary/5 transition-colors flex justify-between items-center"
                      >
                        <span className="font-bold text-rhozly-on-surface">
                          {plant.common_name}
                        </span>
                        <span
                          className={`text-[9px] font-black uppercase px-2 py-1 rounded-lg ${plant.status === "Archived" ? "bg-gray-100 text-gray-500" : "bg-green-50 text-green-600"}`}
                        >
                          {plant.status}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => setAddFlow("choose_source")}
                  className="w-full py-4 text-sm font-bold text-rhozly-on-surface/40 hover:text-rhozly-on-surface"
                >
                  ← Back
                </button>
              </div>
            )}

            {addFlow === "assign" && selectedMasterPlant && (
              <div className="space-y-6 animate-in slide-in-from-right-4">
                <div className="p-4 bg-rhozly-primary/5 border border-rhozly-primary/20 rounded-2xl">
                  <p className="text-[10px] font-black uppercase text-rhozly-primary tracking-widest mb-1">
                    Selected Plant
                  </p>
                  <p className="font-black text-lg text-rhozly-on-surface">
                    {selectedMasterPlant.common_name}
                  </p>
                </div>
                <div className="space-y-3">
                  <label className="flex items-center gap-2 text-[10px] font-black uppercase text-rhozly-on-surface/40 ml-1">
                    <Hash size={14} /> Unique Identifier / Nickname
                  </label>
                  <input
                    type="text"
                    value={assignForm.identifier}
                    onChange={(e) =>
                      setAssignForm({
                        ...assignForm,
                        identifier: e.target.value,
                      })
                    }
                    className="w-full p-4 bg-rhozly-surface-low rounded-2xl font-black border border-transparent focus:border-rhozly-primary outline-none"
                  />
                </div>
                <div className="p-1 bg-rhozly-surface-low rounded-2xl flex">
                  <button
                    onClick={() =>
                      setAssignForm({ ...assignForm, status: "Unplanted" })
                    }
                    className={`flex-1 py-3 rounded-xl font-black text-sm transition-all ${assignForm.status === "Unplanted" ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-on-surface/40 hover:text-rhozly-on-surface"}`}
                  >
                    Unplanted
                  </button>
                  <button
                    onClick={() =>
                      setAssignForm({ ...assignForm, status: "Planted" })
                    }
                    className={`flex-1 py-3 rounded-xl font-black text-sm transition-all ${assignForm.status === "Planted" ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-on-surface/40 hover:text-rhozly-on-surface"}`}
                  >
                    Planted
                  </button>
                </div>
                {assignForm.status === "Planted" && (
                  <div className="space-y-6 p-6 bg-rhozly-surface-low rounded-3xl animate-in zoom-in-95 border border-rhozly-outline/5">
                    <div className="space-y-3">
                      <label className="flex items-center justify-between text-[10px] font-black uppercase text-rhozly-on-surface/60">
                        <div className="flex items-center gap-2">
                          <Calendar size={14} /> Date Planted
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer bg-white px-3 py-1.5 rounded-lg border border-rhozly-outline/10">
                          <input
                            type="checkbox"
                            checked={assignForm.is_established}
                            onChange={(e) =>
                              setAssignForm({
                                ...assignForm,
                                is_established: e.target.checked,
                              })
                            }
                            className="accent-rhozly-primary"
                          />
                          <span className="text-[9px] tracking-widest text-rhozly-primary">
                            Established?
                          </span>
                        </label>
                      </label>
                      {!assignForm.is_established ? (
                        <input
                          type="date"
                          value={assignForm.planted_at}
                          onChange={(e) =>
                            setAssignForm({
                              ...assignForm,
                              planted_at: e.target.value,
                            })
                          }
                          className="w-full p-4 bg-white rounded-xl font-bold border border-transparent focus:border-rhozly-primary outline-none"
                        />
                      ) : (
                        <div className="w-full p-4 bg-white/50 rounded-xl border border-dashed border-rhozly-outline/20 text-center opacity-60">
                          <p className="text-xs font-bold flex items-center justify-center gap-2">
                            <Info size={14} /> Date unknown
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <button
                  onClick={handleAssignSubmit}
                  disabled={isAssigning}
                  className="w-full py-5 mt-4 bg-rhozly-primary text-white rounded-2xl font-black text-lg shadow-xl flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
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
            )}
          </div>
        </div>
      )}

      {/* 🚀 THE NEW, CLEAN INSTANCE EDIT MODAL! */}
      {editingInstance && (
        <InstanceEditModal
          homeId={homeId}
          instance={editingInstance}
          currentAreaId={area.id}
          onClose={() => setEditingInstance(null)}
          onUpdate={(payload) => {
            // Update the UI locally to match the database changes
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
