import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  X,
  Trash2,
  MapPin,
  Loader2,
  Database,
  Sprout,
  Settings2,
  Plus,
  Sparkles,
  History,
  Check,
  Archive,
  ArchiveRestore,
  Wheat,
  ChevronDown,
  ChevronUp,
  ListChecks,
  CheckSquare,
  Edit3,
  Bug,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import toast from "react-hot-toast";
import AreaAdvancedFields from "./AreaAdvancedFields";
import InstanceEditModal from "./InstanceEditModal";
import BulkConfigModal from "./BulkConfigModal";
import { ConfirmModal } from "./ConfirmModal";
import { usePlantDoctor } from "../context/PlantDoctorContext";
import { scorePlantByPreferences } from "../hooks/useUserPreferences";
import { AutomationEngine } from "../lib/automationEngine";
import { PlantDoctorService } from "../services/plantDoctorService";
import LinkAilmentModal from "./LinkAilmentModal";
import { logEvent, EVENT } from "../events/registry";

interface InventoryItem {
  id: string;
  home_id: string;
  plant_id: string;
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
  const { setPageContext, preferences } = usePlantDoctor();
  const navigate = useNavigate();

  const [plants, setPlants] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditingArea, setIsEditingArea] = useState(false);
  const [areaEditData, setAreaEditData] = useState(area);
  const [savingArea, setSavingArea] = useState(false);
  const [isGettingRecs, setIsGettingRecs] = useState(false);
  const [recommendations, setRecommendations] = useState<any[] | null>(null);
  const [selectedRecs, setSelectedRecs] = useState<string[]>([]);
  const [editingInstance, setEditingInstance] = useState<InventoryItem | null>(
    null,
  );
  const [showHistory, setShowHistory] = useState(false);

  // Bulk Edit State
  const [isBulkEditing, setIsBulkEditing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  const [showBulkConfigModal, setShowBulkConfigModal] = useState(false);

  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    type: "delete" | "archive" | "restore";
    item: InventoryItem | null;
  }>({ isOpen: false, type: "delete", item: null });

  const [linkAilmentTarget, setLinkAilmentTarget] = useState<InventoryItem | null>(null);

  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const [fetchError, setFetchError] = useState(false);

  const fetchPlants = async () => {
    setLoading(true);
    setFetchError(false);
    try {
      const { data, error } = await supabase
        .from("inventory_items")
        .select("*")
        .eq("area_id", area.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setPlants(data || []);
    } catch (error: any) {
      setFetchError(true);
      toast.error("Could not load plants.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlants();
  }, [area.id]);

  useEffect(() => {
    setSelectedIds(new Set());
    setIsBulkEditing(false);
  }, [showHistory]);

  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const handleBulkAction = async (action: "archive" | "restore" | "delete") => {
    if (selectedIds.size === 0) return;
    setIsBulkProcessing(true);
    const toastId = toast.loading(`Processing ${selectedIds.size} plants...`);

    try {
      const ids = Array.from(selectedIds);

      const affectedItems = plants.filter((p) => ids.includes(p.id));

      if (action === "delete") {
        await supabase.from("inventory_items").delete().in("id", ids);
        await AutomationEngine.scrubItemsFromAutomations(ids); // 🚀 DELEGATED TO ENGINE
        affectedItems.forEach((p) =>
          logEvent(EVENT.PLANT_INSTANCE_DELETED, { identifier: p.identifier, plant_name: p.plant_name }),
        );
        toast.success("Plants permanently deleted.", { id: toastId });
      } else if (action === "archive" || action === "restore") {
        const newStatus = action === "archive" ? "Archived" : "Unplanted";
        await supabase
          .from("inventory_items")
          .update({ status: newStatus })
          .in("id", ids);

        if (action === "archive") {
          await AutomationEngine.scrubItemsFromAutomations(ids); // 🚀 DELEGATED TO ENGINE
          affectedItems.forEach((p) =>
            logEvent(EVENT.PLANT_INSTANCE_ARCHIVED, { identifier: p.identifier, plant_name: p.plant_name }),
          );
        } else {
          affectedItems.forEach((p) =>
            logEvent(EVENT.PLANT_INSTANCE_RESTORED, { identifier: p.identifier, plant_name: p.plant_name }),
          );
        }

        toast.success(
          action === "archive" ? "Moved to History." : "Restored to Active.",
          { id: toastId },
        );
      }

      setSelectedIds(new Set());
      setIsBulkEditing(false);
      fetchPlants();
      if (onTasksUpdated) onTasksUpdated();
    } catch (e: any) {
      toast.error("Bulk action failed.", { id: toastId });
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const executeBulkConfig = async (payload: any) => {
    setIsBulkProcessing(true);
    const toastId = toast.loading(`Updating ${selectedIds.size} plants...`);
    try {
      const ids = Array.from(selectedIds);
      const selectedItems = plants.filter((p) => selectedIds.has(p.id));

      await supabase.from("inventory_items").update(payload).in("id", ids);

      // 🚀 SMART ROUTING TO THE ENGINE
      if (payload.status === "Planted") {
        const itemsToPlant = selectedItems.filter(
          (p) => p.status !== "Planted",
        );
        itemsToPlant.forEach((p) =>
          logEvent(EVENT.PLANT_INSTANCE_PLANTED, { identifier: p.identifier, plant_name: p.plant_name }),
        );
        if (itemsToPlant.length > 0) {
          const targetAreaId = payload.area_id || area.id;
          const baseDateStr = (
            payload.planted_at || new Date().toISOString()
          ).split("T")[0];
          await AutomationEngine.applyPlantedAutomations(
            itemsToPlant,
            targetAreaId,
            baseDateStr,
          );
        }
      } else if (
        payload.status === "Unplanted" ||
        payload.status === "Archived"
      ) {
        // If a plant is moved back to unplanted, scrub it from any active automations
        await AutomationEngine.scrubItemsFromAutomations(ids);
      }

      toast.success("Plants updated successfully!", { id: toastId });
      setShowBulkConfigModal(false);
      setIsBulkEditing(false);
      setSelectedIds(new Set());
      fetchPlants();
      if (onTasksUpdated) onTasksUpdated();
      if (payload.area_id && payload.area_id !== area.id && onAreaUpdated)
        onAreaUpdated();
    } catch (e) {
      toast.error("Failed to update plants.", { id: toastId });
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const executeConfirmedAction = async () => {
    const { type, item } = confirmState;
    if (!item) return;
    try {
      if (type === "delete") {
        const { error } = await supabase
          .from("inventory_items")
          .delete()
          .eq("id", item.id);
        if (error) throw error;
        await AutomationEngine.scrubItemsFromAutomations([item.id]); // 🚀 DELEGATED TO ENGINE
        logEvent(EVENT.PLANT_INSTANCE_DELETED, { identifier: item.identifier, plant_name: item.plant_name });
        toast.success(`${item.identifier} completely removed from schedules.`);
      } else {
        const newStatus = type === "archive" ? "Archived" : "Unplanted";
        const { error } = await supabase
          .from("inventory_items")
          .update({ status: newStatus })
          .eq("id", item.id);
        if (error) throw error;

        if (type === "archive") {
          await AutomationEngine.scrubItemsFromAutomations([item.id]); // 🚀 DELEGATED TO ENGINE
          logEvent(EVENT.PLANT_INSTANCE_ARCHIVED, { identifier: item.identifier, plant_name: item.plant_name });
        } else {
          logEvent(EVENT.PLANT_INSTANCE_RESTORED, { identifier: item.identifier, plant_name: item.plant_name });
        }

        toast.success(
          type === "archive" ? "Moved to History." : "Restored to Active.",
        );
      }
      setConfirmState({ isOpen: false, type: "delete", item: null });
      fetchPlants();
      if (onTasksUpdated) onTasksUpdated();
    } catch (err: any) {
      toast.error("Action failed: " + err.message);
    }
  };

  const activePlants = plants.filter((p) => p.status !== "Archived");
  const archivedPlants = plants.filter((p) => p.status === "Archived");
  const displayedPlants = showHistory ? archivedPlants : activePlants;

  const groupedPlants = displayedPlants.reduce(
    (acc: Record<string, InventoryItem[]>, plant) => {
      if (!acc[plant.plant_name]) acc[plant.plant_name] = [];
      acc[plant.plant_name].push(plant);
      return acc;
    },
    {},
  );

  const toggleGroup = (name: string) =>
    setExpandedGroups((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
    );

  const getPlantRecommendations = async () => {
    setIsGettingRecs(true);
    setSelectedRecs([]);
    try {
      const data = await PlantDoctorService.recommendPlants({
        homeId,
        isOutside,
        areaData: area,
        currentPlants: activePlants.map((p) => p.plant_name),
      });
      if (data.recommendations) {
        const sorted = [...data.recommendations].sort((a: any, b: any) => {
          const scoreA = scorePlantByPreferences(a.name, a.scientific_name || "", preferences);
          const scoreB = scorePlantByPreferences(b.name, b.scientific_name || "", preferences);
          return scoreB - scoreA;
        });
        setRecommendations(sorted);
        toast.success("AI found some perfect companion matches!");
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

  if (!area) return null;

  return (
    <>
      <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500 pb-32">
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

        {recommendations && recommendations.length > 0 && (
          <div className="bg-rhozly-primary/5 rounded-3xl p-6 border border-rhozly-primary/20 space-y-4 animate-in slide-in-from-top-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h4 className="font-black text-lg text-rhozly-primary flex items-center gap-2">
                  <Sparkles size={20} /> Companion Recommendations
                </h4>
                <p className="text-xs font-bold text-rhozly-primary/60 mt-1">
                  Select multiple plants to import directly to your Shed.
                </p>
              </div>
              <button
                onClick={() => setRecommendations(null)}
                className="text-rhozly-primary/50 hover:text-rhozly-primary bg-white p-1.5 rounded-xl shadow-sm border border-rhozly-primary/10"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {recommendations.map((rec, idx) => {
                const isSelected = selectedRecs.includes(rec.name);
                const prefScore = scorePlantByPreferences(rec.name, rec.scientific_name || "", preferences);
                return (
                  <div
                    key={idx}
                    onClick={() =>
                      setSelectedRecs((prev) =>
                        prev.includes(rec.name)
                          ? prev.filter((n) => n !== rec.name)
                          : [...prev, rec.name],
                      )
                    }
                    className={`bg-white p-5 rounded-2xl border shadow-sm flex flex-col cursor-pointer transition-colors ${isSelected ? "border-rhozly-primary ring-1 ring-rhozly-primary/20 bg-rhozly-primary/5" : "border-rhozly-outline/10 hover:border-rhozly-primary/30"}`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-5 h-5 rounded flex items-center justify-center border transition-colors ${isSelected ? "bg-rhozly-primary border-rhozly-primary text-white" : "border-rhozly-outline/30 bg-white"}`}
                        >
                          {isSelected && <Check size={14} strokeWidth={4} />}
                        </div>
                        <div>
                          <h5 className="font-black text-rhozly-on-surface text-lg leading-tight">
                            {rec.name}
                          </h5>
                          <p className="text-xs font-bold text-rhozly-on-surface/40 italic mt-0.5">
                            {rec.scientific_name}
                          </p>
                          {prefScore > 0 && (
                            <span className="inline-flex items-center gap-1 mt-1 text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                              <Sparkles size={8} /> Matches your taste
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-[9px] font-black uppercase tracking-widest bg-rhozly-surface-low px-2 py-1 rounded-md text-rhozly-on-surface/60 shrink-0">
                        {rec.difficulty}
                      </span>
                    </div>
                    <p className="text-xs font-bold text-rhozly-on-surface/60 leading-relaxed mb-2 flex-1 ml-8">
                      {rec.reason}
                    </p>
                  </div>
                );
              })}
            </div>

            {selectedRecs.length > 0 && (
              <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-rhozly-primary/10">
                <button
                  onClick={() =>
                    navigate("/shed", {
                      state: { autoImport: selectedRecs, source: "ai" },
                    })
                  }
                  className="flex-1 py-4 bg-rhozly-primary text-white rounded-xl font-black shadow-lg flex items-center justify-center gap-2 hover:scale-[1.02] transition-transform"
                >
                  <Sparkles size={18} /> Add with AI Care Plans ({selectedRecs.length})
                </button>
                <button
                  onClick={() =>
                    navigate("/shed", {
                      state: { autoImport: selectedRecs, source: "api" },
                    })
                  }
                  className="flex-1 py-4 bg-white border-2 border-rhozly-primary text-rhozly-primary rounded-xl font-black shadow-lg flex items-center justify-center gap-2 hover:scale-[1.02] transition-transform"
                >
                  <Database size={18} /> Add from Plant Database ({selectedRecs.length})
                </button>
              </div>
            )}
          </div>
        )}

        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-1 mt-4">
            <div className="flex gap-2 bg-rhozly-surface-low p-1.5 rounded-2xl border border-rhozly-outline/5 shrink-0">
              <button
                onClick={() => setShowHistory(false)}
                className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${!showHistory ? "bg-white text-rhozly-on-surface shadow-sm border border-rhozly-outline/10" : "text-rhozly-on-surface/40 hover:text-rhozly-on-surface"}`}
              >
                Active ({activePlants.length})
              </button>
              <button
                onClick={() => setShowHistory(true)}
                className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${showHistory ? "bg-white text-rhozly-primary shadow-sm border border-rhozly-primary/10 flex items-center gap-1" : "text-rhozly-on-surface/40 hover:text-rhozly-on-surface"}`}
              >
                {showHistory && <History size={14} />} History (
                {archivedPlants.length})
              </button>
            </div>

            {displayedPlants.length > 0 && !isBulkEditing && (
              <button
                onClick={() => setIsBulkEditing(true)}
                className="flex items-center justify-center gap-1.5 px-4 py-3 sm:py-2 bg-rhozly-surface-low rounded-xl text-xs font-black uppercase tracking-widest text-rhozly-on-surface/60 hover:text-rhozly-primary hover:bg-rhozly-primary/10 transition-colors"
              >
                <ListChecks size={16} /> Bulk Edit
              </button>
            )}
          </div>

          {loading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-rhozly-primary" />
            </div>
          ) : fetchError ? (
            <div className="py-16 text-center bg-rhozly-surface-lowest rounded-3xl border border-rhozly-outline/30 space-y-4">
              <p className="text-sm font-bold text-rhozly-on-surface/50">Could not load plants.</p>
              <button
                onClick={fetchPlants}
                className="px-5 py-2.5 bg-rhozly-primary text-white rounded-xl text-sm font-black shadow-sm hover:scale-[1.02] transition-transform"
              >
                Retry
              </button>
            </div>
          ) : Object.keys(groupedPlants).length > 0 ? (
            <div
              className={`space-y-3 relative ${isBulkEditing ? "pb-24" : ""}`}
            >
              {Object.entries(groupedPlants).map(([speciesName, instances]) => {
                const isExpanded = expandedGroups.includes(speciesName);
                return (
                  <div
                    key={speciesName}
                    className="bg-white rounded-3xl border border-rhozly-outline/10 shadow-sm overflow-hidden transition-all hover:border-rhozly-primary/20"
                  >
                    <button
                      onClick={() => toggleGroup(speciesName)}
                      className="w-full flex items-center justify-between p-5 bg-white hover:bg-rhozly-surface-lowest transition-colors text-left"
                    >
                      <div className="flex items-center gap-4">
                        <div className="bg-rhozly-primary/5 text-rhozly-primary p-3 rounded-2xl shrink-0">
                          <Sprout className="w-6 h-6" />
                        </div>
                        <div>
                          <h4 className="font-black text-lg text-rhozly-on-surface leading-tight">
                            {speciesName}
                          </h4>
                          <span
                            className={`inline-block mt-1 px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest ${showHistory ? "bg-rhozly-surface-low text-rhozly-on-surface/50" : "bg-emerald-100 text-emerald-700"}`}
                          >
                            {instances.length}{" "}
                            {instances.length === 1 ? "plant" : "plants"}
                          </span>
                        </div>
                      </div>
                      <div className="p-2 text-rhozly-on-surface/40">
                        {isExpanded ? (
                          <ChevronUp size={20} />
                        ) : (
                          <ChevronDown size={20} />
                        )}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-rhozly-outline/5 bg-rhozly-surface-lowest/30 p-2 space-y-2 animate-in slide-in-from-top-2">
                        {instances.map((plant) => {
                          const isSelected = selectedIds.has(plant.id);
                          return (
                            <div
                              key={plant.id}
                              onClick={() => {
                                if (isBulkEditing) toggleSelection(plant.id);
                              }}
                              className={`bg-white rounded-2xl p-4 border flex items-center justify-between shadow-sm transition-colors ${isBulkEditing ? "cursor-pointer" : ""} ${isSelected ? "border-rhozly-primary ring-1 ring-rhozly-primary/20 bg-rhozly-primary/5" : "border-rhozly-outline/10"}`}
                            >
                              <div className="flex items-center gap-3">
                                {isBulkEditing && (
                                  <div
                                    className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${isSelected ? "bg-rhozly-primary border-rhozly-primary text-white" : "border-rhozly-outline/30"}`}
                                  >
                                    {isSelected && (
                                      <Check size={14} strokeWidth={3} />
                                    )}
                                  </div>
                                )}
                                <div>
                                  <h5
                                    className={`font-black text-sm ${isSelected ? "text-rhozly-primary" : "text-rhozly-on-surface"}`}
                                  >
                                    {plant.identifier}
                                  </h5>
                                  <p className="text-[10px] font-bold text-rhozly-on-surface/40 uppercase">
                                    {plant.status}
                                  </p>
                                </div>
                              </div>
                              {!isBulkEditing && (
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setLinkAilmentTarget(plant);
                                    }}
                                    className="min-w-[44px] min-h-[44px] flex items-center justify-center text-orange-500/70 hover:text-orange-600 hover:bg-orange-50 rounded-xl transition-colors"
                                    title="Link Ailment"
                                  >
                                    <Bug className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingInstance(plant);
                                    }}
                                    className="min-w-[44px] min-h-[44px] flex items-center justify-center text-rhozly-primary/60 hover:text-rhozly-primary hover:bg-rhozly-primary/10 rounded-xl transition-colors"
                                  >
                                    <Settings2 className="w-4 h-4" />
                                  </button>
                                  {plant.status === "Archived" ? (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setConfirmState({
                                          isOpen: true,
                                          type: "restore",
                                          item: plant,
                                        });
                                      }}
                                      className="min-w-[44px] min-h-[44px] flex items-center justify-center text-blue-500 hover:bg-blue-50 rounded-xl transition-colors"
                                      title="Restore to Active"
                                    >
                                      <ArchiveRestore className="w-4 h-4" />
                                    </button>
                                  ) : (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setConfirmState({
                                          isOpen: true,
                                          type: "archive",
                                          item: plant,
                                        });
                                      }}
                                      className="min-w-[44px] min-h-[44px] flex items-center justify-center text-orange-500 hover:bg-orange-50 rounded-xl transition-colors"
                                      title="Move to History"
                                    >
                                      <Archive className="w-4 h-4" />
                                    </button>
                                  )}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setConfirmState({
                                        isOpen: true,
                                        type: "delete",
                                        item: plant,
                                      });
                                    }}
                                    className="min-w-[44px] min-h-[44px] flex items-center justify-center text-rhozly-on-surface/30 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                                    title="Delete Forever"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-16 text-center bg-rhozly-surface-lowest rounded-3xl border border-rhozly-outline/30 opacity-50">
              No plants here yet.
            </div>
          )}
        </div>
      </div>

      {/* 🚀 BULK ACTION TOOLBAR (PORTALED) */}
      {typeof document !== "undefined" &&
        createPortal(
          <>
            {isBulkEditing && (
              <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-full max-w-md px-4 z-[90] animate-in slide-in-from-bottom-8">
                <div className="bg-white rounded-3xl shadow-2xl border border-rhozly-outline/20 p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between px-2">
                    <span className="text-sm font-black text-rhozly-on-surface">
                      {selectedIds.size} plants selected
                    </span>
                    <button
                      onClick={() => setIsBulkEditing(false)}
                      className="text-xs font-bold text-rhozly-on-surface/50 hover:text-rhozly-on-surface uppercase tracking-widest"
                    >
                      Cancel
                    </button>
                  </div>

                  <div className="flex gap-2">
                    {!showHistory ? (
                      <>
                        <button
                          onClick={() => setShowBulkConfigModal(true)}
                          disabled={selectedIds.size === 0 || isBulkProcessing}
                          className="flex-[2] py-3 bg-emerald-600 text-white rounded-xl font-black shadow-md hover:bg-emerald-700 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                        >
                          {isBulkProcessing ? (
                            <Loader2 className="animate-spin" size={16} />
                          ) : (
                            <Edit3 size={16} />
                          )}{" "}
                          Configure
                        </button>
                        <button
                          onClick={() => handleBulkAction("archive")}
                          disabled={selectedIds.size === 0 || isBulkProcessing}
                          className="flex-1 py-3 bg-orange-50 text-orange-600 rounded-xl font-black transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 hover:bg-orange-100"
                          title="Archive"
                        >
                          <Archive size={16} />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleBulkAction("restore")}
                        disabled={selectedIds.size === 0 || isBulkProcessing}
                        className="flex-[2] py-3 bg-blue-500 text-white rounded-xl font-black shadow-md hover:bg-blue-600 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                      >
                        {isBulkProcessing ? (
                          <Loader2 className="animate-spin" size={16} />
                        ) : (
                          <ArchiveRestore size={16} />
                        )}{" "}
                        Restore Active
                      </button>
                    )}
                    <button
                      onClick={() => handleBulkAction("delete")}
                      disabled={selectedIds.size === 0 || isBulkProcessing}
                      className="flex-1 py-3 bg-red-50 text-red-600 rounded-xl font-black transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 hover:bg-red-100"
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {showBulkConfigModal && (
              <BulkConfigModal
                homeId={homeId}
                currentAreaId={area.id}
                selectedCount={selectedIds.size}
                isProcessing={isBulkProcessing}
                onClose={() => setShowBulkConfigModal(false)}
                onSave={executeBulkConfig}
              />
            )}

            {/* Keep single confirm modal for the non-bulk actions */}
            {confirmState.isOpen && confirmState.item && (
              <ConfirmModal
                isOpen={confirmState.isOpen}
                isLoading={false}
                onClose={() =>
                  setConfirmState({ isOpen: false, type: "delete", item: null })
                }
                onConfirm={executeConfirmedAction}
                title={
                  confirmState.type === "delete"
                    ? "Delete Plant"
                    : confirmState.type === "archive"
                      ? "Move to History"
                      : "Restore Plant"
                }
                description={
                  confirmState.type === "delete"
                    ? `Delete "${confirmState.item.identifier}" forever?`
                    : confirmState.type === "archive"
                      ? `Archive "${confirmState.item.identifier}"? It will hide from active tasks until restored.`
                      : `Bring "${confirmState.item.identifier}" back to your active list?`
                }
                confirmText={
                  confirmState.type === "delete"
                    ? "Delete Forever"
                    : confirmState.type === "archive"
                      ? "Archive"
                      : "Restore"
                }
                isDestructive={confirmState.type === "delete"}
              />
            )}

            {isEditingArea && (
              <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-rhozly-bg/95 backdrop-blur-md animate-in fade-in zoom-in-95">
                <div className="bg-white w-full max-w-2xl rounded-3xl p-8 shadow-2xl border border-rhozly-outline/10 max-h-[90vh] overflow-y-auto custom-scrollbar">
                  <div className="flex justify-between items-center mb-8">
                    <div>
                      <h3 className="text-3xl font-black">
                        Area Details
                      </h3>
                      <p className="text-xs font-bold text-rhozly-on-surface/40 uppercase tracking-widest mt-1">
                        Refine {area.name}
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
                    <AreaAdvancedFields
                      data={areaEditData}
                      onChange={(fields) =>
                        setAreaEditData({ ...areaEditData, ...fields })
                      }
                    />
                  </div>
                  <button
                    onClick={async () => {
                      setSavingArea(true);
                      await handleUpdateArea();
                      setSavingArea(false);
                    }}
                    disabled={savingArea}
                    className="w-full py-5 mt-10 bg-rhozly-primary text-white rounded-2xl font-black text-lg shadow-xl flex items-center justify-center gap-2"
                  >
                    {savingArea ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <>
                        <Check /> Save Settings
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {editingInstance && (
              <InstanceEditModal
                homeId={homeId}
                instance={editingInstance}
                currentAreaId={area.id}
                onClose={() => setEditingInstance(null)}
                onUpdate={() => {
                  fetchPlants();
                  setEditingInstance(null);
                }}
                onTasksUpdated={onTasksUpdated}
              />
            )}

            {linkAilmentTarget && (
              <LinkAilmentModal
                homeId={homeId}
                plantInstance={{
                  id: linkAilmentTarget.id,
                  home_id: linkAilmentTarget.home_id,
                  location_id: linkAilmentTarget.location_id,
                  area_id: linkAilmentTarget.area_id,
                  plant_name: linkAilmentTarget.plant_name,
                  identifier: linkAilmentTarget.identifier,
                }}
                onClose={() => setLinkAilmentTarget(null)}
                onLinked={() => setLinkAilmentTarget(null)}
              />
            )}
          </>,
          document.body,
        )}
    </>
  );
}

