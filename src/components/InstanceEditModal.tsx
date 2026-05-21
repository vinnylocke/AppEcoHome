import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Settings2,
  ClipboardList,
  BookOpen,
  Images,
  MapPin,
  Navigation,
  Hash,
  Calendar,
  Info,
  Check,
  Loader2,
  BarChart2,
  Sprout,
} from "lucide-react";
import { IconGrowth, IconPlant, IconPlantDB, IconHarvest, IconLight } from "../constants/icons";
import { supabase } from "../lib/supabase";
import toast from "react-hot-toast";
import { Logger } from "../lib/errorHandler";
import InstanceCareRoutine from "./InstanceCareRoutine";
import PlantJournalTab from "./PlantJournalTab";
import PhotoTimelineTab from "./PhotoTimelineTab";
import ManualPlantCreation from "./ManualPlantCreation";
import PlantGuidesTab from "./PlantGuidesTab";
import GrowGuideTab from "./GrowGuideTab";
import { BookOpenCheck } from "lucide-react";
import YieldTab from "./YieldTab";
import LightTab from "./LightTab";
import InstanceStatsTab from "./InstanceStatsTab";
import CompanionPlantsTab from "./CompanionPlantsTab";
import { getProviderPlantDetails } from "../lib/plantProvider";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { useAiPlantFreshness } from "../hooks/useAiPlantFreshness";
import CareUpdateCallout from "./aiPlants/CareUpdateCallout";

// 🧠 IMPORT THE AI CONTEXT
import { usePlantDoctor } from "../context/PlantDoctorContext";
// 🚀 IMPORT THE ENGINE
import { AutomationEngine } from "../lib/automationEngine";
import { logEvent, EVENT } from "../events/registry";

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
  aiEnabled?: boolean;
  isPremium?: boolean;
}

export default function InstanceEditModal({
  homeId,
  instance,
  currentAreaId,
  onClose,
  onUpdate,
  onTasksUpdated,
  aiEnabled = false,
  isPremium = false,
}: InstanceEditModalProps) {
  const { setPageContext } = usePlantDoctor();
  const trapRef = useFocusTrap<HTMLDivElement>(true);

  const [activeTab, setActiveTab] = useState<
    "details" | "routine" | "journal" | "photos" | "care_guide" | "grow_guide" | "guides" | "yield" | "light" | "stats" | "companions"
  >("details");

  // Cover image — pinned via the Photo Timeline tab. Refetched when the user
  // switches tabs so a freshly-pinned cover surfaces without a hard reload.
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    supabase
      .from("inventory_items")
      .select("cover_image_url")
      .eq("id", instance.id)
      .maybeSingle()
      .then(({ data }) => { if (!cancelled) setCoverImageUrl(data?.cover_image_url ?? null); });
    return () => { cancelled = true; };
  }, [instance.id, activeTab]);
  const [savingInstance, setSavingInstance] = useState(false);
  const [locations, setLocations] = useState<any[]>([]);

  const [careGuideData, setCareGuideData] = useState<any>(null);
  const [loadingCareGuide, setLoadingCareGuide] = useState(false);
  const [companionPlantRecord, setCompanionPlantRecord] = useState<any>(null);

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

          if (
            (plantRecord.source === "api" && plantRecord.perenual_id) ||
            (plantRecord.source === "verdantly" && plantRecord.verdantly_id)
          ) {
            const apiData = await getProviderPlantDetails({
              source: plantRecord.source,
              perenual_id: plantRecord.perenual_id ? Number(plantRecord.perenual_id) : null,
              verdantly_id: plantRecord.verdantly_id ?? null,
            });
            setCareGuideData({ ...plantRecord, ...apiData });
          } else {
            setCareGuideData(plantRecord);
          }
        } catch (err) {
          Logger.error("Failed to load care guide", err, {}, "Failed to load master care guide.");
        } finally {
          setLoadingCareGuide(false);
        }
      };

      fetchCareGuide();
    }
  }, [activeTab, instance.plant_id, careGuideData]);

  useEffect(() => {
    if (activeTab === "companions" && !companionPlantRecord) {
      supabase
        .from("plants")
        .select("id, common_name, source, verdantly_id, perenual_id")
        .eq("id", instance.plant_id)
        .single()
        .then(({ data }) => { if (data) setCompanionPlantRecord(data); });
    }
  }, [activeTab, instance.plant_id, companionPlantRecord]);

  const handleUpdateInstance = async () => {
    setSavingInstance(true);
    try {
      const loc = locations.find((l) => l.id === editForm.location_id);
      const areaObj = loc?.areas.find((a: any) => a.id === editForm.area_id);

      // Both location and area are optional. The user might be saving
      // an unassigned-but-planted instance ("in the garden, area
      // unknown") or moving an already-placed instance back to
      // unassigned. If EITHER picker is empty, null out BOTH so we
      // never end up in a weird intermediate "location set, no area"
      // state that the rest of the app doesn't expect.
      const hasFullPlacement = !!editForm.location_id && !!editForm.area_id && !!loc && !!areaObj;

      const payload = {
        identifier: editForm.identifier,
        location_id: hasFullPlacement ? editForm.location_id : null,
        location_name: hasFullPlacement ? loc.name : null,
        area_id: hasFullPlacement ? editForm.area_id : null,
        area_name: hasFullPlacement ? areaObj.name : null,
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
      const wasAreaAssigned = !!instance.area_id;
      const isNowAreaAssigned = !!payload.area_id;

      if (isNowPlanted && !wasPlanted) {
        logEvent(EVENT.PLANT_INSTANCE_PLANTED, { identifier: instance.identifier, plant_name: instance.plant_name });
        // Just planted! Let the Engine generate/append its blueprints.
        // `applyPlantedAutomations` short-circuits gracefully if the
        // area_id is null (unassigned-but-planted) — schedules will
        // attach later when the user places the plant.
        const baseDateStr = payload.is_established
          ? new Date().toISOString().split("T")[0]
          : payload.planted_at || new Date().toISOString().split("T")[0];

        const updatedItem = { ...instance, ...payload };
        await AutomationEngine.applyPlantedAutomations(
          [updatedItem],
          updatedItem.area_id,
          baseDateStr,
        );
      } else if (isNowPlanted && wasPlanted && !wasAreaAssigned && isNowAreaAssigned) {
        // Same Planted status but moved from unassigned → assigned.
        // Pick up the area-anchored automations now that we have an
        // area to attach to.
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
      <div ref={trapRef} role="dialog" aria-modal="true" aria-label="Edit plant instance" className="bg-rhozly-surface-lowest w-full max-w-2xl max-h-[90vh] overflow-y-auto custom-scrollbar rounded-3xl p-8 shadow-2xl border border-rhozly-outline/20 relative">
        {/* Cover photo strip — only shown when the user has pinned a cover via
            the Photos tab. Gives the modal a visual anchor for this instance. */}
        {coverImageUrl && (
          <div className="-mx-8 -mt-8 mb-6 h-40 sm:h-48 relative overflow-hidden rounded-t-3xl" data-testid="instance-cover-hero">
            <img
              src={coverImageUrl}
              alt={`${instance.identifier} cover photo`}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-rhozly-surface-lowest via-rhozly-surface-lowest/30 to-transparent" />
          </div>
        )}
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
            aria-label="Close"
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
            <IconPlant size={14} /> Care Guide
          </button>

          <button
            onClick={() => setActiveTab("routine")}
            className={`flex-1 min-w-[80px] py-3 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 transition-all ${activeTab === "routine" ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-on-surface/40 hover:text-rhozly-on-surface"}`}
          >
            <ClipboardList size={14} /> Routines
          </button>

          <button
            data-testid="instance-modal-tab-journal"
            onClick={() => setActiveTab("journal")}
            className={`flex-1 min-w-[80px] py-3 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 transition-all ${activeTab === "journal" ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-on-surface/40 hover:text-rhozly-on-surface"}`}
          >
            <BookOpen size={14} /> Journal
          </button>

          <button
            data-testid="instance-modal-tab-photos"
            onClick={() => setActiveTab("photos")}
            className={`flex-1 min-w-[80px] py-3 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 transition-all ${activeTab === "photos" ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-on-surface/40 hover:text-rhozly-on-surface"}`}
          >
            <Images size={14} /> Photos
          </button>

          <button
            data-testid="instance-modal-tab-grow-guide"
            onClick={() => setActiveTab("grow_guide")}
            className={`flex-1 min-w-[80px] py-3 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 transition-all ${activeTab === "grow_guide" ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-on-surface/40 hover:text-rhozly-on-surface"}`}
          >
            <BookOpenCheck size={14} /> Grow Guide
          </button>

          <button
            data-testid="instance-modal-tab-guides"
            onClick={() => setActiveTab("guides")}
            className={`flex-1 min-w-[80px] py-3 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 transition-all ${activeTab === "guides" ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-on-surface/40 hover:text-rhozly-on-surface"}`}
          >
            <IconPlantDB size={14} /> Community
          </button>

          <button
            data-testid="instance-modal-tab-yield"
            onClick={() => setActiveTab("yield")}
            className={`flex-1 min-w-[80px] py-3 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 transition-all ${activeTab === "yield" ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-on-surface/40 hover:text-rhozly-on-surface"}`}
          >
            <IconHarvest size={14} /> Yield
          </button>

          <button
            data-testid="instance-modal-tab-light"
            onClick={() => setActiveTab("light")}
            className={`flex-1 min-w-[80px] py-3 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 transition-all ${activeTab === "light" ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-on-surface/40 hover:text-rhozly-on-surface"}`}
          >
            <IconLight size={14} /> Light
          </button>

          <button
            data-testid="instance-modal-tab-stats"
            onClick={() => setActiveTab("stats")}
            className={`flex-1 min-w-[80px] py-3 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 transition-all ${activeTab === "stats" ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-on-surface/40 hover:text-rhozly-on-surface"}`}
          >
            <BarChart2 size={14} /> Stats
          </button>

          <button
            data-testid="instance-modal-tab-companions"
            onClick={() => setActiveTab("companions")}
            className={`flex-1 min-w-[80px] py-3 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 transition-all ${activeTab === "companions" ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-on-surface/40 hover:text-rhozly-on-surface"}`}
          >
            <Sprout size={14} /> Companions
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
                  value={editForm.location_id ?? ""}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      location_id: e.target.value,
                      area_id: "",
                    })
                  }
                  className="w-full p-4 bg-rhozly-surface-low rounded-2xl font-bold border border-transparent focus:border-rhozly-primary outline-none cursor-pointer text-sm"
                >
                  <option value="">Not placed yet</option>
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
                  value={editForm.area_id ?? ""}
                  onChange={(e) =>
                    setEditForm({ ...editForm, area_id: e.target.value })
                  }
                  disabled={!editForm.location_id}
                  className="w-full p-4 bg-rhozly-surface-low rounded-2xl font-bold border border-transparent focus:border-rhozly-primary outline-none cursor-pointer text-sm disabled:opacity-50"
                >
                  <option value="">
                    {editForm.location_id ? "Select Area..." : "Pick a location first"}
                  </option>
                  {availableAreas.map((area: any) => (
                    <option key={area.id} value={area.id}>
                      {area.name}
                    </option>
                  ))}
                </select>
                {!editForm.area_id && (
                  <p className="text-xs font-bold text-rhozly-on-surface/50 ml-1 flex items-center gap-1">
                    <Info size={12} />
                    {editForm.location_id
                      ? "Pick an area or leave both blank — the instance stays \"in the garden\"."
                      : "Just in your garden — pick a location + area to place it."}
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
                    <IconGrowth size={14} /> Current Growth State
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
              disabled={savingInstance}
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
                <InstanceCareFreshnessSection plantRecord={careGuideData} />
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

        {activeTab === "photos" && (
          <div className="animate-in slide-in-from-right-4">
            <PhotoTimelineTab inventoryItemId={instance.id} />
          </div>
        )}

        {activeTab === "grow_guide" && (
          <div className="animate-in slide-in-from-right-4">
            <GrowGuideTab
              plantId={instance.plant_id}
              commonName={instance.plant_name}
              source={(instance.plants?.source ?? "ai") as "manual" | "api" | "ai" | "verdantly"}
              homeId={homeId}
              aiEnabled={aiEnabled}
            />
          </div>
        )}

        {activeTab === "guides" && (
          <div className="animate-in slide-in-from-right-4">
            <PlantGuidesTab
              plantId={instance.plant_id}
              commonName={instance.plant_name}
            />
          </div>
        )}

        {activeTab === "yield" && (
          <div className="animate-in slide-in-from-right-4">
            <YieldTab
              instanceId={instance.id}
              homeId={homeId}
              plantedAt={instance.planted_at ?? null}
              aiEnabled={aiEnabled}
              instance={instance}
            />
          </div>
        )}

        {activeTab === "light" && (
          <div className="animate-in slide-in-from-right-4">
            <LightTab
              plantId={instance.plant_id ?? null}
              plantName={instance.plant_name}
              areaId={instance.area_id ?? null}
              homeId={homeId}
              areaName={instance.area_name ?? null}
            />
          </div>
        )}

        {activeTab === "stats" && (
          <div className="animate-in slide-in-from-right-4">
            <InstanceStatsTab instance={instance} />
          </div>
        )}

        {activeTab === "companions" && (
          <div className="animate-in slide-in-from-right-4">
            {companionPlantRecord ? (
              <CompanionPlantsTab
                source={companionPlantRecord.source}
                verdantlyId={companionPlantRecord.verdantly_id ?? null}
                plantName={companionPlantRecord.common_name ?? instance.plant_name}
                homeId={homeId}
                aiEnabled={aiEnabled}
                isPremium={isPremium}
              />
            ) : (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="animate-spin text-rhozly-on-surface/30" size={24} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Wave 5 — Inline subcomponent that runs `useAiPlantFreshness` only when the
// Care Guide tab is open + a plant record is loaded. Keeps the hook out of
// the parent's render tree when the user isn't on this tab.
// ──────────────────────────────────────────────────────────────────────────

function InstanceCareFreshnessSection({ plantRecord }: { plantRecord: any }) {
  const { byPlantId } = useAiPlantFreshness(
    plantRecord?.source === "ai"
      ? [
          {
            id: plantRecord.id as number,
            source: plantRecord.source,
            home_id: plantRecord.home_id ?? null,
            forked_from_plant_id: plantRecord.forked_from_plant_id ?? null,
            overridden_fields: plantRecord.overridden_fields ?? null,
          },
        ]
      : [],
  );
  const fresh = plantRecord?.source === "ai" ? byPlantId[plantRecord.id] : null;
  if (!fresh?.has_update) return null;
  return (
    <CareUpdateCallout
      updatedFields={fresh.updated_care_fields}
      lastGeneratedAt={fresh.last_care_generated_at}
      onAcknowledge={fresh.acknowledge}
    />
  );
}
