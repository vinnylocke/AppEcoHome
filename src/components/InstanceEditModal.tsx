import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Settings2,
  ClipboardList,
  BookOpen,
  MapPin,
  Navigation,
  Hash,
  Calendar,
  Info,
  Check,
  Loader2,
  Sprout,
  Leaf,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import toast from "react-hot-toast";
import InstanceCareRoutine from "./InstanceCareRoutine";
import PlantJournalTab from "./PlantJournalTab";
import ManualPlantCreation from "./ManualPlantCreation";
import { PerenualService } from "../lib/perenualService";

// 🧠 IMPORT THE AI CONTEXT
import { usePlantDoctor } from "../context/PlantDoctorContext";
// 🚀 IMPORT THE ENGINE
import { AutomationEngine } from "../lib/automationEngine";

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

interface InstanceEditModalProps {
  homeId: string;
  instance: any;
  currentAreaId: string;
  onClose: () => void;
  onUpdate: (payload: any) => void;
  onTasksUpdated?: () => void;
}

export default function InstanceEditModal({
  homeId,
  instance,
  currentAreaId,
  onClose,
  onUpdate,
  onTasksUpdated,
}: InstanceEditModalProps) {
  const { setPageContext } = usePlantDoctor();

  const [activeTab, setActiveTab] = useState<
    "details" | "routine" | "journal" | "care_guide"
  >("details");
  const [savingInstance, setSavingInstance] = useState(false);
  const [locations, setLocations] = useState<any[]>([]);

  const [careGuideData, setCareGuideData] = useState<any>(null);
  const [loadingCareGuide, setLoadingCareGuide] = useState(false);

  const [editForm, setEditForm] = useState({
    identifier: instance.identifier || instance.plant_name,
    location_id: instance.location_id,
    area_id: instance.area_id,
    status: instance.status,
    growth_state: instance.growth_state || "Vegetative",
    is_established: instance.is_established,
    planted_at: instance.planted_at
      ? instance.planted_at.split("T")[0]
      : new Date().toISOString().split("T")[0],
  });

  useEffect(() => {
    setPageContext({
      action: "Managing Plant Instance",
      activeTab: activeTab,
      plantIdentity: {
        nickname: instance.identifier,
        species: instance.plant_name,
        currentStatus: editForm.status,
        growthState: editForm.growth_state,
        isEstablished: editForm.is_established,
      },
      careGuideContext: activeTab === "care_guide" ? careGuideData : null,
      locationContext: {
        locationId: editForm.location_id,
        areaId: editForm.area_id,
      },
    });

    return () => setPageContext(null);
  }, [activeTab, editForm, careGuideData, instance, setPageContext]);

  useEffect(() => {
    const fetchLocations = async () => {
      const { data } = await supabase
        .from("locations")
        .select("id, name, areas(id, name)")
        .eq("home_id", homeId);
      if (data) setLocations(data);
    };
    fetchLocations();
  }, [homeId]);

  useEffect(() => {
    if (activeTab === "care_guide" && !careGuideData) {
      const fetchCareGuide = async () => {
        setLoadingCareGuide(true);
        try {
          const { data: plantRecord, error } = await supabase
            .from("plants")
            .select("*")
            .eq("id", instance.plant_id)
            .single();

          if (error) throw error;

          if (plantRecord.source === "api" && plantRecord.perenual_id) {
            const apiData = await PerenualService.getPlantDetails(
              plantRecord.perenual_id,
            );
            setCareGuideData({ ...plantRecord, ...apiData });
          } else {
            setCareGuideData(plantRecord);
          }
        } catch (err) {
          console.error("Failed to load care guide", err);
          toast.error("Failed to load master care guide.");
        } finally {
          setLoadingCareGuide(false);
        }
      };

      fetchCareGuide();
    }
  }, [activeTab, instance.plant_id, careGuideData]);

  const handleUpdateInstance = async () => {
    setSavingInstance(true);
    try {
      const loc = locations.find((l) => l.id === editForm.location_id);
      const areaObj = loc?.areas.find((a: any) => a.id === editForm.area_id);

      const payload = {
        identifier: editForm.identifier,
        location_id: editForm.location_id,
        location_name: loc?.name,
        area_id: editForm.area_id,
        area_name: areaObj?.name,
        status: editForm.status,
        growth_state:
          editForm.status === "Planted" ? editForm.growth_state : null,
        is_established:
          editForm.status === "Planted" ? editForm.is_established : false,
        planted_at:
          editForm.status === "Planted" && !editForm.is_established
            ? editForm.planted_at
            : null,
      };

      const { error } = await supabase
        .from("inventory_items")
        .update(payload)
        .eq("id", instance.id);

      if (error) throw error;

      // 🚀 NEW: WIRED TO AUTOMATION ENGINE
      const wasPlanted = instance.status === "Planted";
      const isNowPlanted = payload.status === "Planted";

      if (isNowPlanted && !wasPlanted) {
        // Just planted! Let the Engine generate/append its blueprints.
        const baseDateStr = payload.is_established
          ? new Date().toISOString().split("T")[0]
          : payload.planted_at || new Date().toISOString().split("T")[0];

        const updatedItem = { ...instance, ...payload };
        await AutomationEngine.applyPlantedAutomations(
          [updatedItem],
          updatedItem.area_id,
          baseDateStr,
        );
      } else if (!isNowPlanted && wasPlanted) {
        // Changed from Planted to Unplanted/Archived. Scrub the tasks!
        await AutomationEngine.scrubItemsFromAutomations([instance.id]);
      }

      // 🚀 SMART SYNC (INVENTORY -> TASK): Check for pending Planting tasks
      if (payload.status === "Planted") {
        const { data: relatedTasks } = await supabase
          .from("tasks")
          .select("id, inventory_item_ids")
          .eq("type", "Planting")
          .eq("status", "Pending")
          .contains("inventory_item_ids", [instance.id]);

        if (relatedTasks && relatedTasks.length > 0) {
          for (const task of relatedTasks) {
            const { data: plantsInTask } = await supabase
              .from("inventory_items")
              .select("id, status")
              .in("id", task.inventory_item_ids);

            const allPlanted = plantsInTask?.every(
              (p) =>
                p.status === "Planted" ||
                p.status === "Archived" ||
                p.id === instance.id,
            );

            if (allPlanted) {
              await supabase
                .from("tasks")
                .update({
                  status: "Completed",
                  completed_at: new Date().toISOString(),
                })
                .eq("id", task.id);

              toast.success(
                "All plants in the group are planted. Task auto-completed!",
              );
            }
          }
        }
      }

      toast.success("Plant instance updated!");
      onUpdate(payload);
      if (onTasksUpdated) onTasksUpdated(); // Refresh parent view if tasks changed!
    } catch (error: any) {
      toast.error("Could not update plant.");
    } finally {
      setSavingInstance(false);
    }
  };

  const availableAreas = editForm.location_id
    ? locations.find((l) => l.id === editForm.location_id)?.areas || []
    : [];

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-rhozly-bg/95 backdrop-blur-xl animate-in fade-in duration-300">
      <div className="bg-rhozly-surface-lowest w-full max-w-2xl max-h-[90vh] overflow-y-auto custom-scrollbar rounded-3xl p-8 shadow-2xl border border-rhozly-outline/20 relative">
        <div className="flex justify-between items-start mb-6 relative z-10">
          <div>
            <h3 className="text-3xl font-black text-rhozly-on-surface">
              {instance.identifier}
            </h3>
            <p className="text-sm font-bold text-rhozly-primary uppercase tracking-widest mt-1">
              {instance.plant_name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-3 bg-rhozly-surface-low rounded-2xl hover:scale-110 transition-transform shrink-0"
          >
            <X size={24} />
          </button>
        </div>

        <div className="flex bg-rhozly-surface-low p-1 rounded-2xl mb-8 flex-wrap gap-1">
          <button
            onClick={() => setActiveTab("details")}
            className={`flex-1 min-w-[80px] py-3 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 transition-all ${activeTab === "details" ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-on-surface/40 hover:text-rhozly-on-surface"}`}
          >
            <Settings2 size={14} /> Details
          </button>

          <button
            onClick={() => setActiveTab("care_guide")}
            className={`flex-1 min-w-[80px] py-3 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 transition-all ${activeTab === "care_guide" ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-on-surface/40 hover:text-rhozly-on-surface"}`}
          >
            <Leaf size={14} /> Care Guide
          </button>

          <button
            onClick={() => setActiveTab("routine")}
            className={`flex-1 min-w-[80px] py-3 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 transition-all ${activeTab === "routine" ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-on-surface/40 hover:text-rhozly-on-surface"}`}
          >
            <ClipboardList size={14} /> Routines
          </button>

          <button
            onClick={() => setActiveTab("journal")}
            className={`flex-1 min-w-[80px] py-3 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 transition-all ${activeTab === "journal" ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-on-surface/40 hover:text-rhozly-on-surface"}`}
          >
            <BookOpen size={14} /> Journal
          </button>
        </div>

        {activeTab === "details" && (
          <div className="space-y-6 animate-in slide-in-from-left-4">
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-[10px] font-black uppercase text-rhozly-on-surface/40 ml-1">
                <Hash size={14} /> Unique Identifier / Nickname
              </label>
              <input
                type="text"
                value={editForm.identifier}
                onChange={(e) =>
                  setEditForm({ ...editForm, identifier: e.target.value })
                }
                className="w-full p-4 bg-rhozly-surface-low rounded-2xl font-black border border-transparent focus:border-rhozly-primary outline-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-[10px] font-black uppercase text-rhozly-on-surface/40 ml-1">
                  <MapPin size={14} /> Location
                </label>
                <select
                  value={editForm.location_id}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      location_id: e.target.value,
                      area_id: "",
                    })
                  }
                  className="w-full p-4 bg-rhozly-surface-low rounded-2xl font-bold border border-transparent focus:border-rhozly-primary outline-none cursor-pointer text-sm"
                >
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-[10px] font-black uppercase text-rhozly-on-surface/40 ml-1">
                  <Navigation size={14} /> Area
                </label>
                <select
                  value={editForm.area_id}
                  onChange={(e) =>
                    setEditForm({ ...editForm, area_id: e.target.value })
                  }
                  className={`w-full p-4 bg-rhozly-surface-low rounded-2xl font-bold border focus:border-rhozly-primary outline-none cursor-pointer text-sm ${!editForm.area_id ? "border-red-400/60" : "border-transparent"}`}
                >
                  <option value="" disabled>
                    Select Area...
                  </option>
                  {availableAreas.map((area: any) => (
                    <option key={area.id} value={area.id}>
                      {area.name}
                    </option>
                  ))}
                </select>
                {!editForm.area_id && (
                  <p className="text-xs font-bold text-red-400 ml-1 flex items-center gap-1">
                    <Info size={12} /> An area is required before saving.
                  </p>
                )}
              </div>
            </div>

            <hr className="border-rhozly-outline/10" />

            <div className="p-1 bg-rhozly-surface-low rounded-2xl flex">
              <button
                onClick={() =>
                  setEditForm({ ...editForm, status: "Unplanted" })
                }
                className={`flex-1 py-3 rounded-xl font-black text-sm transition-all ${editForm.status === "Unplanted" ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-on-surface/40 hover:text-rhozly-on-surface"}`}
              >
                Unplanted
              </button>
              <button
                onClick={() => setEditForm({ ...editForm, status: "Planted" })}
                className={`flex-1 py-3 rounded-xl font-black text-sm transition-all ${editForm.status === "Planted" ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-on-surface/40 hover:text-rhozly-on-surface"}`}
              >
                Planted
              </button>
              <button
                onClick={() => setEditForm({ ...editForm, status: "Archived" })}
                className={`flex-1 py-3 rounded-xl font-black text-sm transition-all ${editForm.status === "Archived" ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-on-surface/40 hover:text-rhozly-on-surface"}`}
              >
                Archived
              </button>
            </div>

            {editForm.status === "Planted" && (
              <div className="space-y-6 p-6 bg-rhozly-surface-low rounded-3xl animate-in zoom-in-95 border border-rhozly-outline/5">
                <div className="space-y-3">
                  <label className="flex items-center justify-between text-[10px] font-black uppercase text-rhozly-on-surface/60">
                    <div className="flex items-center gap-2">
                      <Calendar size={14} /> Date Planted
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer bg-white px-3 py-1.5 rounded-lg border border-rhozly-outline/10">
                      <input
                        type="checkbox"
                        checked={editForm.is_established}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            is_established: e.target.checked,
                          })
                        }
                        className="accent-rhozly-primary"
                      />
                      <span className="text-[9px] tracking-widest text-rhozly-primary">
                        Already Established?
                      </span>
                    </label>
                  </label>
                  {!editForm.is_established ? (
                    <input
                      type="date"
                      value={editForm.planted_at}
                      onChange={(e) =>
                        setEditForm({ ...editForm, planted_at: e.target.value })
                      }
                      className="w-full p-4 bg-white rounded-2xl font-bold border border-transparent focus:border-rhozly-primary outline-none"
                    />
                  ) : (
                    <div className="w-full p-4 bg-white/50 rounded-2xl border border-dashed border-rhozly-outline/20 text-center opacity-60">
                      <p className="text-xs font-bold flex items-center justify-center gap-2">
                        <Info size={14} /> Date unknown
                      </p>
                    </div>
                  )}
                </div>
                <div className="space-y-3">
                  <label className="flex items-center gap-2 text-[10px] font-black uppercase text-rhozly-on-surface/40 ml-1">
                    <Sprout size={14} /> Current Growth State
                  </label>
                  <select
                    value={editForm.growth_state}
                    onChange={(e) =>
                      setEditForm({ ...editForm, growth_state: e.target.value })
                    }
                    className="w-full p-4 bg-white rounded-2xl font-bold border border-transparent focus:border-rhozly-primary outline-none cursor-pointer text-sm"
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

            <button
              onClick={handleUpdateInstance}
              disabled={savingInstance || !editForm.area_id}
              className="w-full py-5 mt-4 bg-rhozly-primary text-white rounded-2xl font-black text-lg shadow-xl shadow-rhozly-primary/20 flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
            >
              {savingInstance ? (
                <Loader2 className="animate-spin" size={24} />
              ) : (
                <>
                  <Check size={24} /> Save Updates
                </>
              )}
            </button>
          </div>
        )}

        {activeTab === "care_guide" && (
          <div className="animate-in slide-in-from-right-4">
            {loadingCareGuide ? (
              <div className="flex flex-col items-center justify-center py-16 opacity-50">
                <Loader2
                  className="animate-spin text-rhozly-primary mb-4"
                  size={32}
                />
                <p className="text-sm font-bold text-rhozly-on-surface">
                  Fetching Master Care Guide...
                </p>
              </div>
            ) : careGuideData ? (
              <div>
                <ManualPlantCreation
                  initialData={careGuideData}
                  isReadOnly={true}
                />
              </div>
            ) : (
              <div className="text-center p-8 border-2 border-dashed border-rhozly-outline/20 rounded-3xl opacity-50">
                <Info className="mx-auto mb-2" size={24} />
                <p className="font-bold text-sm">Care guide not available.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === "routine" && (
          <div className="animate-in slide-in-from-right-4">
            <InstanceCareRoutine
              inventoryItemId={instance.id}
              homeId={homeId}
              locationId={instance.location_id}
              areaId={instance.area_id}
              onRoutineUpdated={onTasksUpdated}
            />
          </div>
        )}

        {activeTab === "journal" && (
          <div className="animate-in slide-in-from-right-4">
            <PlantJournalTab inventoryItemId={instance.id} homeId={homeId} />
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
