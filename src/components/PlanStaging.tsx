import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import {
  ArrowLeft,
  CalendarPlus,
  CheckCircle2,
  Hammer,
  Leaf,
  Loader2,
  Map as MapIcon,
  ShieldAlert,
  Sparkles,
  Wrench,
  Package,
  RotateCcw,
} from "lucide-react";
import toast from "react-hot-toast";
import { ConfirmModal } from "./ConfirmModal";

interface PlanStagingProps {
  plan: any;
  homeId: string;
  onBack: () => void;
  onPlanUpdated: () => void;
}

export default function PlanStaging({
  plan,
  homeId,
  onBack,
  onPlanUpdated,
}: PlanStagingProps) {
  const navigate = useNavigate();
  const [isProcessing, setIsProcessing] = useState(false);
  const blueprint = plan.ai_blueprint;

  const [localStagingState, setLocalStagingState] = useState(
    plan.staging_state || {},
  );

  const [localPlanStatus, setLocalPlanStatus] = useState(plan.status);

  const isPhase1Done = !!localStagingState.linked_area_id;
  const isPhase2Done = !!localStagingState.plants_linked;
  const isPhase3Done = !!localStagingState.plants_assigned;
  const isPhase4Done =
    localPlanStatus === "In Progress" || localPlanStatus === "Completed";
  const isPhase5Done = !!localStagingState.maintenance_active;

  // Data State
  const [locations, setLocations] = useState<any[]>([]);
  const [areas, setAreas] = useState<any[]>([]);
  const [shedPlants, setShedPlants] = useState<any[]>([]);

  // Phase 1 UI State
  const [areaMode, setAreaMode] = useState<"new" | "existing">("new");
  const [newAreaLocationId, setNewAreaLocationId] = useState<string>("");
  const [filterLocationId, setFilterLocationId] = useState<string>("");
  const [existingAreaId, setExistingAreaId] = useState<string>("");

  // Phase 2 UI State
  const [plantMapping, setPlantMapping] = useState<Record<number, string>>(
    localStagingState.plant_mapping || {},
  );
  const [selectedForProcurement, setSelectedForProcurement] = useState<
    number[]
  >([]);

  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    confirmText: string;
    onConfirm: () => Promise<void>;
  } | null>(null);

  const fetchData = useCallback(async () => {
    const { data: locData } = await supabase
      .from("locations")
      .select("id, name")
      .eq("home_id", homeId);
    const { data: areaData } = await supabase
      .from("areas")
      .select("id, name, location_id, locations!inner(home_id)")
      .eq("locations.home_id", homeId);
    const { data: shedData } = await supabase
      .from("plants")
      .select("id, common_name")
      .eq("home_id", homeId);

    if (locData) {
      setLocations(locData);
      if (locData.length > 0) {
        setNewAreaLocationId(locData[0].id);
        setFilterLocationId(locData[0].id);
      }
    }
    if (areaData) setAreas(areaData);
    if (shedData) setShedPlants(shedData);
  }, [homeId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const filtered = areas.filter((a) => a.location_id === filterLocationId);
    if (filtered.length > 0) setExistingAreaId(filtered[0].id);
    else setExistingAreaId("");
  }, [filterLocationId, areas]);

  useEffect(() => {
    if (isPhase1Done && !isPhase2Done && shedPlants.length > 0) {
      const newMapping: Record<number, string> = { ...plantMapping };
      let updated = false;
      blueprint.plant_manifest.forEach((plant: any, idx: number) => {
        if (newMapping[idx] === "create" || !newMapping[idx]) {
          const match = shedPlants.find((p) =>
            p.common_name
              .toLowerCase()
              .includes(plant.common_name.toLowerCase()),
          );
          if (match) {
            newMapping[idx] = match.id.toString();
            updated = true;
          } else if (!newMapping[idx]) {
            newMapping[idx] = "create";
            updated = true;
          }
        }
      });
      if (updated) setPlantMapping(newMapping);
    } else if (Object.keys(plantMapping).length === 0) {
      const newMapping: Record<number, string> = {};
      blueprint.plant_manifest.forEach(
        (_: any, idx: number) => (newMapping[idx] = "create"),
      );
      setPlantMapping(newMapping);
    }
  }, [isPhase1Done, isPhase2Done, shedPlants, blueprint, plantMapping]);

  const saveStagingState = async (newState: any) => {
    const mergedState = { ...localStagingState, ...newState };
    setLocalStagingState(mergedState);
    await supabase
      .from("plans")
      .update({ staging_state: mergedState })
      .eq("id", plan.id);
    onPlanUpdated();
  };

  const executeConfirmAction = async () => {
    if (!confirmState) return;
    setIsProcessing(true);
    try {
      await confirmState.onConfirm();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Action failed.");
    } finally {
      setIsProcessing(false);
      setConfirmState(null);
    }
  };

  const wipeTasksAndBlueprints = async () => {
    await supabase.from("tasks").delete().eq("plan_id", plan.id);
    await supabase.from("task_blueprints").delete().eq("plan_id", plan.id);
    await supabase.from("plans").update({ status: "Draft" }).eq("id", plan.id);
    setLocalPlanStatus("Draft");
    onPlanUpdated();
  };

  const wipeStagedInventory = async () => {
    if (localStagingState.linked_area_id) {
      await supabase
        .from("inventory_items")
        .delete()
        .eq("area_id", localStagingState.linked_area_id)
        .eq("status", "Unplanted");
    }
  };

  // --- PHASE 1: INFRASTRUCTURE ---
  const handleConfirmArea = async () => {
    setIsProcessing(true);
    const toastId = toast.loading("Securing infrastructure...");
    try {
      let finalAreaId = "";
      if (areaMode === "new") {
        if (!newAreaLocationId)
          throw new Error("Please select a parent location.");
        let targetLux = null;
        const aiSun =
          blueprint.infrastructure_requirements.suggested_sunlight?.toLowerCase() ||
          "";
        if (aiSun.includes("full sun")) targetLux = 50000;
        else if (aiSun.includes("part shade") || aiSun.includes("partial"))
          targetLux = 25000;
        else if (aiSun.includes("full shade") || aiSun.includes("shade"))
          targetLux = 5000;

        const { data: newArea, error: createError } = await supabase
          .from("areas")
          .insert({
            location_id: newAreaLocationId,
            name: blueprint.infrastructure_requirements.suggested_area_name,
            growing_medium:
              blueprint.infrastructure_requirements.suggested_medium,
            light_intensity_lux: targetLux,
          })
          .select("id")
          .single();

        if (createError) throw createError;
        finalAreaId = newArea.id;

        setAreas((prev) => [
          ...prev,
          {
            id: newArea.id,
            name: blueprint.infrastructure_requirements.suggested_area_name,
            location_id: newAreaLocationId,
          },
        ]);
      } else {
        if (!existingAreaId)
          throw new Error("Please select an existing area to link.");
        finalAreaId = existingAreaId;
      }
      await saveStagingState({ linked_area_id: finalAreaId });
      toast.success("Area confirmed!", { id: toastId });
    } catch (err: any) {
      toast.error(err.message || "Failed to secure area.", { id: toastId });
      setLocalStagingState(plan.staging_state || {});
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEditArea = async () => {
    if (isPhase4Done) {
      setConfirmState({
        isOpen: true,
        title: "Change Area & Reset Plan",
        description:
          "Tasks are already injected! Changing the area will wipe all tasks and reset staging progress. Are you sure you want to proceed?",
        confirmText: "Reset & Change Area",
        onConfirm: async () => {
          await wipeTasksAndBlueprints();
          await wipeStagedInventory();
          await saveStagingState({
            linked_area_id: null,
            plants_linked: false,
            plants_assigned: false,
            plant_mapping: {},
            maintenance_active: false,
          });
        },
      });
    } else {
      await saveStagingState({
        linked_area_id: null,
        plants_linked: false,
        plants_assigned: false,
        plant_mapping: {},
        maintenance_active: false,
      });
    }
  };

  // --- PHASE 2: SOURCING ---
  const handleOpenSearchModal = (sourceType: "api" | "ai") => {
    if (selectedForProcurement.length === 0)
      return toast.error(
        "Please check the boxes next to the plants you want to procure.",
      );
    saveStagingState({ plant_mapping: plantMapping });
    const queueItems = selectedForProcurement.map((idx) => ({
      type: sourceType,
      data: blueprint.plant_manifest[idx].common_name,
    }));

    // Redirects to shed with autoImport payload
    navigate("/shed", {
      state: { autoImport: queueItems.map((q) => q.data), source: sourceType },
    });
  };

  const handleConfirmPhase2 = async () => {
    const unlinked = Object.values(plantMapping).some((v) => v === "create");
    if (unlinked)
      return toast.error(
        "Please procure or manually link all plants before proceeding.",
      );
    await saveStagingState({
      plants_linked: true,
      plant_mapping: plantMapping,
    });
    toast.success("Shed Sourcing Complete!");
  };

  const handleEditSourcing = async () => {
    if (isPhase4Done) {
      setConfirmState({
        isOpen: true,
        title: "Amend Sourcing & Reset Plan",
        description:
          "Tasks are already injected! Amending your plants will wipe all scheduled tasks and staged inventory. Are you sure?",
        confirmText: "Reset Progress",
        onConfirm: async () => {
          await wipeTasksAndBlueprints();
          await wipeStagedInventory();
          await saveStagingState({
            plants_linked: false,
            plants_assigned: false,
            maintenance_active: false,
          });
        },
      });
    } else if (isPhase3Done) {
      setConfirmState({
        isOpen: true,
        title: "Amend Sourcing",
        description:
          "This will remove the staged (unplanted) inventory from your Area. Are you sure?",
        confirmText: "Amend Sourcing",
        onConfirm: async () => {
          await wipeStagedInventory();
          await saveStagingState({
            plants_linked: false,
            plants_assigned: false,
            maintenance_active: false,
          });
        },
      });
    } else {
      await saveStagingState({
        plants_linked: false,
        plants_assigned: false,
        maintenance_active: false,
      });
    }
  };

  // --- PHASE 3: BULK ASSIGNMENT ---
  const handleBulkAssign = async () => {
    setIsProcessing(true);
    const toastId = toast.loading("Staging plants in the Area...");
    try {
      const itemsToInsert: any[] = [];
      blueprint.plant_manifest.forEach((plantDef: any, idx: number) => {
        const plantId = localStagingState.plant_mapping[idx];
        const actualPlant = shedPlants.find((p) => p.id.toString() === plantId);

        const targetLocationId = areas.find(
          (a) => a.id === localStagingState.linked_area_id,
        )?.location_id;

        for (let i = 0; i < plantDef.quantity; i++) {
          itemsToInsert.push({
            home_id: homeId,
            location_id: targetLocationId,
            area_id: localStagingState.linked_area_id,
            plant_id: parseInt(plantId, 10),
            plant_name: actualPlant?.common_name || plantDef.common_name,
            status: "Unplanted",
          });
        }
      });
      if (itemsToInsert.length > 0) {
        const { error } = await supabase
          .from("inventory_items")
          .insert(itemsToInsert);
        if (error) throw error;
      }
      await saveStagingState({ plants_assigned: true });
      toast.success("Inventory staged successfully!", { id: toastId });
    } catch (err: any) {
      toast.error(err.message || "Failed to stage inventory.", { id: toastId });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUndoStaging = async () => {
    if (isPhase4Done) {
      setConfirmState({
        isOpen: true,
        title: "Undo Staging & Wipe Tasks",
        description:
          "Tasks are already injected! Undoing staging will wipe all scheduled tasks. Are you sure?",
        confirmText: "Undo Staging",
        onConfirm: async () => {
          await wipeTasksAndBlueprints();
          await wipeStagedInventory();
          await saveStagingState({
            plants_assigned: false,
            maintenance_active: false,
          });
          toast.success("Staging undone and tasks removed.");
        },
      });
    } else {
      setConfirmState({
        isOpen: true,
        title: "Undo Staging",
        description:
          "This will remove the staged (unplanted) items from the Area. Are you sure?",
        confirmText: "Undo Staging",
        onConfirm: async () => {
          await wipeStagedInventory();
          await saveStagingState({
            plants_assigned: false,
            maintenance_active: false,
          });
          toast.success("Staging undone.");
        },
      });
    }
  };

  // --- PHASE 4: EXECUTION TASKS ---
  const handleInjectTasks = async () => {
    setIsProcessing(true);
    const toastId = toast.loading(
      "Injecting preparation and planting tasks...",
    );
    try {
      const today = new Date();
      const idMap = new Map<number, string>();
      const targetLocationId = areas.find(
        (a) => a.id === localStagingState.linked_area_id,
      )?.location_id;

      for (const task of blueprint.preparation_tasks) {
        const targetDate = new Date(today);
        targetDate.setDate(targetDate.getDate() + task.task_index);
        const { data, error } = await supabase
          .from("tasks")
          .insert({
            home_id: homeId,
            plan_id: plan.id,
            location_id: targetLocationId,
            area_id: localStagingState.linked_area_id,
            title: task.title,
            description: task.description,
            type: "Maintenance",
            due_date: targetDate.toISOString().split("T")[0],
            status: "Pending",
          })
          .select("id")
          .single();
        if (error) throw error;
        idMap.set(task.task_index, data.id);
      }

      const dependenciesToInsert = [];
      for (const task of blueprint.preparation_tasks) {
        if (
          task.depends_on_index !== null &&
          idMap.has(task.depends_on_index)
        ) {
          dependenciesToInsert.push({
            task_id: idMap.get(task.task_index),
            depends_on_task_id: idMap.get(task.depends_on_index),
          });
        }
      }
      if (dependenciesToInsert.length > 0)
        await supabase.from("task_dependencies").insert(dependenciesToInsert);

      const lastPrepTaskIndex =
        blueprint.preparation_tasks.length > 0
          ? Math.max(
              ...blueprint.preparation_tasks.map((t: any) => t.task_index),
            )
          : -1;
      const lastPrepTaskId =
        lastPrepTaskIndex >= 0 ? idMap.get(lastPrepTaskIndex) : null;

      const { data: stagedItems } = await supabase
        .from("inventory_items")
        .select("id, plant_id")
        .eq("area_id", localStagingState.linked_area_id)
        .eq("status", "Unplanted");

      const plantingTasks = blueprint.plant_manifest.map(
        (plantDef: any, idx: number) => {
          const targetDate = new Date(today);
          targetDate.setDate(targetDate.getDate() + lastPrepTaskIndex + 1);

          const plantIdStr = localStagingState.plant_mapping[idx];
          const matchingInventoryIds = stagedItems
            ? stagedItems
                .filter((item) => item.plant_id.toString() === plantIdStr)
                .map((item) => item.id)
            : [];

          return {
            home_id: homeId,
            plan_id: plan.id,
            location_id: targetLocationId,
            area_id: localStagingState.linked_area_id,
            title: `Plant ${plantDef.common_name} (x${plantDef.quantity})`,
            description: `Role: ${plantDef.role}\nAdvice: ${plantDef.procurement_advice}`,
            type: "Planting",
            due_date: targetDate.toISOString().split("T")[0],
            status: "Pending",
            inventory_item_ids: matchingInventoryIds,
          };
        },
      );

      if (plantingTasks.length > 0) {
        const { data: pTasks, error: pError } = await supabase
          .from("tasks")
          .insert(plantingTasks)
          .select("id");
        if (pError) throw pError;
        if (lastPrepTaskId && pTasks) {
          const pDeps = pTasks.map((pt: any) => ({
            task_id: pt.id,
            depends_on_task_id: lastPrepTaskId,
          }));
          await supabase.from("task_dependencies").insert(pDeps);
        }
      }

      await supabase
        .from("plans")
        .update({ status: "In Progress" })
        .eq("id", plan.id);
      setLocalPlanStatus("In Progress");
      onPlanUpdated();
      toast.success("Tasks scheduled and linked!", { id: toastId });
    } catch (err) {
      toast.error("Failed to inject tasks.", { id: toastId });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUndoTasks = async () => {
    setConfirmState({
      isOpen: true,
      title: "Remove Scheduled Tasks",
      description:
        "This will delete all scheduled tasks from your calendar. Are you sure?",
      confirmText: "Remove Tasks",
      onConfirm: async () => {
        await wipeTasksAndBlueprints();
        await saveStagingState({ maintenance_active: false });
        toast.success("Execution tasks rolled back.");
      },
    });
  };

  // --- PHASE 5: MAINTENANCE ---
  const handleActivateMaintenance = async () => {
    setIsProcessing(true);
    const toastId = toast.loading("Activating recurring blueprints...");
    try {
      const targetLocationId = areas.find(
        (a) => a.id === localStagingState.linked_area_id,
      )?.location_id;

      const blueprintsToInsert = blueprint.custom_maintenance_tasks.map(
        (task: any) => ({
          home_id: homeId,
          plan_id: plan.id,
          location_id: targetLocationId,
          area_id: localStagingState.linked_area_id,
          title: task.title,
          description: task.description,
          task_type: "Maintenance",
          frequency_days: task.frequency_days,
          is_recurring: true,
          is_auto_generated: true,
          // 🚀 FIXED: Added Start Date so they actually render!
          start_date: new Date().toISOString().split("T")[0],
        }),
      );

      if (blueprintsToInsert.length > 0) {
        const { error } = await supabase
          .from("task_blueprints")
          .insert(blueprintsToInsert);
        if (error) throw error;
      }

      await saveStagingState({ maintenance_active: true });
      await supabase
        .from("plans")
        .update({ status: "Completed" })
        .eq("id", plan.id);

      setLocalPlanStatus("Completed");
      onPlanUpdated();

      toast.success("Project Complete! Maintenance automated.", {
        id: toastId,
      });
    } catch (err) {
      toast.error("Failed to activate blueprints.", { id: toastId });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUndoMaintenance = async () => {
    setConfirmState({
      isOpen: true,
      title: "Deactivate Maintenance",
      description:
        "This will deactivate and remove the recurring maintenance blueprints. Are you sure?",
      confirmText: "Deactivate",
      onConfirm: async () => {
        await supabase.from("task_blueprints").delete().eq("plan_id", plan.id);
        await supabase
          .from("plans")
          .update({ status: "In Progress" })
          .eq("id", plan.id);

        setLocalPlanStatus("In Progress");
        await saveStagingState({ maintenance_active: false });
        toast.success("Maintenance deactivated.");
      },
    });
  };

  if (!blueprint || !blueprint.project_overview) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center animate-in fade-in">
        <ShieldAlert size={48} className="text-red-500 mb-4" />
        <h2 className="text-xl font-black mb-2">Corrupted Blueprint</h2>
        <button
          onClick={onBack}
          className="px-6 py-3 bg-gray-100 rounded-xl font-black"
        >
          Go Back
        </button>
      </div>
    );
  }

  const linkedAreaName =
    areas.find((a) => a.id === localStagingState.linked_area_id)?.name ||
    "Unknown Area";

  return (
    <div className="h-full flex flex-col bg-rhozly-bg animate-in slide-in-from-right-8 duration-500 relative z-40">
      {/* Header */}
      <div className="relative h-64 shrink-0 overflow-hidden rounded-b-[3rem] shadow-lg">
        {plan.cover_image_url ? (
          <img
            src={plan.cover_image_url}
            alt="Cover"
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-rhozly-primary" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
        <button
          onClick={onBack}
          className="absolute top-6 left-6 w-10 h-10 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white hover:bg-white/40 transition-colors z-10"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="absolute bottom-6 left-6 right-6 text-white z-10">
          <h1 className="text-3xl sm:text-4xl font-black font-display leading-tight">
            {blueprint.project_overview.title}
          </h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-6 custom-scrollbar pb-24">
        {/* PHASE 1: INFRASTRUCTURE */}
        <section
          className={`bg-white rounded-[2rem] p-6 shadow-sm border transition-colors ${isPhase1Done ? "border-green-200 bg-green-50/10" : "border-rhozly-outline/10"}`}
        >
          <div className="flex items-center gap-3 mb-6">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isPhase1Done ? "bg-green-100 text-green-600" : "bg-blue-50 text-blue-500"}`}
            >
              {isPhase1Done ? (
                <CheckCircle2 size={20} />
              ) : (
                <MapIcon size={20} />
              )}
            </div>
            <div>
              <h2 className="text-xl font-black">Phase 1: Infrastructure</h2>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                Environment Setup
              </p>
            </div>
          </div>

          {isPhase1Done ? (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 bg-green-50 rounded-2xl border border-green-100">
              <div className="flex items-center gap-3 text-green-800">
                <CheckCircle2 size={20} className="shrink-0" />
                <div>
                  <p className="font-bold text-sm">
                    Successfully linked to project.
                  </p>
                  <p className="text-xs font-black opacity-60 mt-1">
                    {linkedAreaName}
                  </p>
                </div>
              </div>
              <button
                onClick={handleEditArea}
                disabled={isProcessing}
                className="w-full sm:w-auto px-4 py-2 bg-white text-green-700 hover:bg-green-100 border border-green-200 font-black text-xs rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <RotateCcw size={14} /> Change Area
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-4 bg-blue-50/50 rounded-2xl border border-blue-100 space-y-4">
                <div className="flex bg-white rounded-xl p-1 shadow-sm border border-blue-100">
                  <button
                    onClick={() => setAreaMode("new")}
                    className={`flex-1 py-2 text-sm font-black rounded-lg transition-colors ${areaMode === "new" ? "bg-blue-500 text-white" : "text-blue-500/60 hover:text-blue-500"}`}
                  >
                    Create New
                  </button>
                  <button
                    onClick={() => setAreaMode("existing")}
                    className={`flex-1 py-2 text-sm font-black rounded-lg transition-colors ${areaMode === "existing" ? "bg-blue-500 text-white" : "text-blue-500/60 hover:text-blue-500"}`}
                  >
                    Link Existing
                  </button>
                </div>
                {areaMode === "new" ? (
                  <>
                    <div className="bg-white p-3 rounded-xl border border-blue-100">
                      <p className="text-[10px] text-gray-400 font-black uppercase mb-1">
                        AI Suggestion
                      </p>
                      <p className="text-sm font-bold text-gray-900">
                        {
                          blueprint.infrastructure_requirements
                            .suggested_area_name
                        }
                      </p>
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase text-blue-800 tracking-widest mb-1 block">
                        Put inside Location:
                      </label>
                      <select
                        value={newAreaLocationId}
                        onChange={(e) => setNewAreaLocationId(e.target.value)}
                        className="w-full p-3 bg-white rounded-xl outline-none font-bold border border-blue-200 focus:border-blue-500"
                      >
                        {locations.map((loc) => (
                          <option key={loc.id} value={loc.id}>
                            {loc.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-black uppercase text-blue-800 tracking-widest mb-1 block">
                        1. Select Location
                      </label>
                      <select
                        value={filterLocationId}
                        onChange={(e) => setFilterLocationId(e.target.value)}
                        className="w-full p-3 bg-white rounded-xl outline-none font-bold border border-blue-200 focus:border-blue-500"
                      >
                        {locations.map((loc) => (
                          <option key={loc.id} value={loc.id}>
                            {loc.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase text-blue-800 tracking-widest mb-1 block">
                        2. Select Area
                      </label>
                      <select
                        value={existingAreaId}
                        onChange={(e) => setExistingAreaId(e.target.value)}
                        disabled={!existingAreaId}
                        className="w-full p-3 bg-white rounded-xl outline-none font-bold border border-blue-200 focus:border-blue-500 disabled:opacity-50"
                      >
                        {areas
                          .filter((a) => a.location_id === filterLocationId)
                          .map((area) => (
                            <option key={area.id} value={area.id}>
                              {area.name}
                            </option>
                          ))}
                        {!existingAreaId && <option>No areas found</option>}
                      </select>
                    </div>
                  </div>
                )}
                <button
                  onClick={handleConfirmArea}
                  disabled={isProcessing}
                  className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  {isProcessing ? (
                    <Loader2 className="animate-spin" size={18} />
                  ) : (
                    <Hammer size={18} />
                  )}
                  {areaMode === "new"
                    ? "Build & Link Area"
                    : "Link Existing Area"}
                </button>
              </div>
            </div>
          )}
        </section>

        {/* PHASE 2: SOURCING */}
        <section
          className={`bg-white rounded-[2rem] p-6 shadow-sm border transition-all ${isPhase1Done ? (isPhase2Done ? "border-green-200 bg-green-50/10" : "border-rhozly-outline/10") : "border-gray-100 opacity-50 pointer-events-none"}`}
        >
          <div className="flex items-center gap-3 mb-6">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isPhase2Done ? "bg-green-100 text-green-600" : "bg-emerald-50 text-emerald-600"}`}
            >
              {isPhase2Done ? <CheckCircle2 size={20} /> : <Leaf size={20} />}
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-black">Phase 2: The Shed</h2>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                Procurement & Linking
              </p>
            </div>
          </div>

          {isPhase2Done ? (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 bg-green-50 rounded-2xl border border-green-100">
              <div className="flex items-center gap-3 text-green-800">
                <CheckCircle2 size={20} className="shrink-0" />
                <p className="font-bold text-sm">
                  All plants successfully sourced and linked.
                </p>
              </div>
              <button
                onClick={handleEditSourcing}
                disabled={isProcessing}
                className="w-full sm:w-auto px-4 py-2 bg-white text-green-700 hover:bg-green-100 border border-green-200 font-black text-xs rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <RotateCcw size={14} /> Amend Sourcing
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-xs font-bold text-gray-500">
                Check the box next to any plants you need to procure. Then, add
                them to your Shed via the Perenual Database or AI.
              </p>

              <div className="space-y-3">
                {blueprint.plant_manifest.map((plant: any, idx: number) => {
                  const isCreate =
                    plantMapping[idx] === "create" || !plantMapping[idx];
                  return (
                    <div
                      key={idx}
                      className="p-4 border border-emerald-100 rounded-2xl flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center bg-emerald-50/30"
                    >
                      <div className="flex items-center gap-3 flex-1">
                        {isCreate && (
                          <input
                            type="checkbox"
                            checked={selectedForProcurement.includes(idx)}
                            onChange={(e) => {
                              if (e.target.checked)
                                setSelectedForProcurement([
                                  ...selectedForProcurement,
                                  idx,
                                ]);
                              else
                                setSelectedForProcurement(
                                  selectedForProcurement.filter(
                                    (i) => i !== idx,
                                  ),
                                );
                            }}
                            className="w-5 h-5 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                          />
                        )}
                        <div>
                          <h3 className="font-black text-gray-900 leading-tight">
                            {plant.common_name} (x{plant.quantity})
                          </h3>
                          <p className="text-[10px] font-bold text-gray-400 mb-1">
                            {plant.scientific_name}
                          </p>
                          <p className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md inline-block">
                            {plant.procurement_advice}
                          </p>
                        </div>
                      </div>

                      <div className="w-full sm:w-64 shrink-0">
                        <select
                          value={plantMapping[idx] || "create"}
                          onChange={(e) => {
                            const val = e.target.value;
                            setPlantMapping({ ...plantMapping, [idx]: val });
                            if (val !== "create") {
                              setSelectedForProcurement(
                                selectedForProcurement.filter((i) => i !== idx),
                              );
                            }
                          }}
                          className={`w-full p-3 bg-white rounded-xl outline-none font-bold text-sm border focus:ring-2 transition-all ${
                            plantMapping[idx] !== "create"
                              ? "border-emerald-300 ring-emerald-500/20 text-emerald-800"
                              : "border-gray-200 ring-gray-500/20 text-gray-600"
                          }`}
                        >
                          <option value="create">⚠️ Needs Procurement</option>
                          {shedPlants.length > 0 && (
                            <optgroup label="Manually Link to Shed">
                              {shedPlants.map((inv) => (
                                <option key={inv.id} value={inv.id}>
                                  Link: {inv.common_name}
                                </option>
                              ))}
                            </optgroup>
                          )}
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4 border-t border-gray-100">
                <button
                  onClick={() => handleOpenSearchModal("api")}
                  className="px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2"
                >
                  <Database size={16} /> Procure Selected via Perenual
                </button>
                <button
                  onClick={() => handleOpenSearchModal("ai")}
                  className="px-4 py-3 bg-amber-500 hover:bg-amber-600 text-white font-black text-sm rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2"
                >
                  <Sparkles size={16} /> Procure Selected via AI
                </button>
              </div>

              <div className="pt-2">
                <button
                  onClick={handleConfirmPhase2}
                  className="w-full px-4 py-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-black rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  <CheckCircle2 size={18} /> Confirm All Plants Linked
                </button>
              </div>
            </div>
          )}
        </section>

        {/* PHASE 3: STAGING & ASSIGNMENT */}
        <section
          className={`bg-white rounded-[2rem] p-6 shadow-sm border transition-all ${isPhase2Done ? (isPhase3Done ? "border-green-200 bg-green-50/10" : "border-rhozly-outline/10") : "border-gray-100 opacity-50 pointer-events-none"}`}
        >
          <div className="flex items-center gap-3 mb-6">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isPhase3Done ? "bg-green-100 text-green-600" : "bg-purple-50 text-purple-600"}`}
            >
              {isPhase3Done ? (
                <CheckCircle2 size={20} />
              ) : (
                <Package size={20} />
              )}
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-black">Phase 3: Staging</h2>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                Inventory Assignment
              </p>
            </div>
          </div>

          {isPhase3Done ? (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 bg-green-50 rounded-2xl border border-green-100">
              <div className="flex items-center gap-3 text-green-800">
                <CheckCircle2 size={20} className="shrink-0" />
                <p className="font-bold text-sm">
                  Inventory successfully staged.
                </p>
              </div>
              <button
                onClick={handleUndoStaging}
                disabled={isProcessing}
                className="w-full sm:w-auto px-4 py-2 bg-white text-green-700 hover:bg-green-100 border border-green-200 font-black text-xs rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <RotateCcw size={14} /> Undo Staging
              </button>
            </div>
          ) : (
            <div className="p-6 border-2 border-dashed border-gray-200 rounded-2xl flex flex-col items-center text-center">
              <p className="font-bold text-gray-500 mb-4">
                You have procured the plants. Ready to virtually move them into
                the Area?
              </p>
              <button
                onClick={handleBulkAssign}
                disabled={isProcessing}
                className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-black transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isProcessing ? (
                  <Loader2 className="animate-spin" size={18} />
                ) : (
                  <Package size={18} />
                )}{" "}
                Bulk Assign to Area
              </button>
            </div>
          )}
        </section>

        {/* PHASE 4: EXECUTION */}
        <section
          className={`bg-white rounded-[2rem] p-6 shadow-sm border transition-all ${isPhase3Done ? (isPhase4Done ? "border-green-200 bg-green-50/10" : "border-rhozly-outline/10") : "border-gray-100 opacity-50 pointer-events-none"}`}
        >
          <div className="flex items-center gap-3 mb-6">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isPhase4Done ? "bg-green-100 text-green-600" : "bg-orange-50 text-orange-500"}`}
            >
              {isPhase4Done ? (
                <CheckCircle2 size={20} />
              ) : (
                <CalendarPlus size={20} />
              )}
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-black">Phase 4: Execution</h2>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                Prep & Planting Tasks
              </p>
            </div>
            {isPhase3Done && !isPhase4Done && (
              <button
                onClick={handleInjectTasks}
                disabled={isProcessing}
                className="hidden sm:flex px-6 py-3 bg-rhozly-primary hover:bg-rhozly-primary/90 text-white font-black rounded-xl transition-all active:scale-95 items-center gap-2 disabled:opacity-50"
              >
                {isProcessing ? (
                  <Loader2 className="animate-spin" size={18} />
                ) : (
                  <Sparkles size={18} />
                )}{" "}
                Schedule Tasks
              </button>
            )}
          </div>

          {isPhase4Done ? (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 bg-green-50 rounded-2xl border border-green-100">
              <div className="flex items-center gap-3 text-green-800">
                <CheckCircle2 size={20} className="shrink-0" />
                <p className="font-bold text-sm">
                  Tasks injected into calendar.
                </p>
              </div>
              <button
                onClick={handleUndoTasks}
                disabled={isProcessing}
                className="w-full sm:w-auto px-4 py-2 bg-white text-green-700 hover:bg-green-100 border border-green-200 font-black text-xs rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <RotateCcw size={14} /> Remove Tasks
              </button>
            </div>
          ) : (
            <div className="space-y-4 relative before:absolute before:inset-y-0 before:left-[19px] before:w-0.5 before:bg-gray-100">
              {blueprint.preparation_tasks.map((task: any) => (
                <div
                  key={task.task_index}
                  className="relative flex gap-4 pl-12"
                >
                  <div className="absolute left-0 w-10 h-10 bg-white border-2 border-orange-200 text-orange-500 rounded-full flex items-center justify-center font-black text-sm z-10">
                    {task.task_index + 1}
                  </div>
                  <div className="flex-1 bg-gray-50 p-4 rounded-2xl border border-gray-100">
                    <h4 className="font-black text-gray-900 mb-1">
                      {task.title}
                    </h4>
                    <p className="text-sm font-bold text-gray-500">
                      {task.description}
                    </p>
                  </div>
                </div>
              ))}

              <div className="relative flex gap-4 pl-12 mt-6">
                <div className="absolute left-0 w-10 h-10 bg-white border-2 border-rhozly-primary/30 text-rhozly-primary rounded-full flex items-center justify-center font-black z-10">
                  <Leaf size={16} />
                </div>
                <div className="flex-1 bg-rhozly-primary/5 p-4 rounded-2xl border border-rhozly-primary/20">
                  <h4 className="font-black text-rhozly-primary mb-1">
                    Final Step: Planting
                  </h4>
                  <p className="text-sm font-bold text-rhozly-on-surface/60">
                    Dynamic planting tasks for all staged inventory will be
                    automatically scheduled to wait for your preparation steps.
                  </p>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* PHASE 5: MAINTENANCE */}
        <section
          className={`bg-white rounded-[2rem] p-6 shadow-sm border transition-all ${isPhase4Done ? (isPhase5Done ? "border-green-200 bg-green-50/10" : "border-rhozly-outline/10") : "border-gray-100 opacity-50 pointer-events-none"}`}
        >
          <div className="flex items-center gap-3 mb-6">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isPhase5Done ? "bg-green-100 text-green-600" : "bg-teal-50 text-teal-600"}`}
            >
              {isPhase5Done ? <CheckCircle2 size={20} /> : <Wrench size={20} />}
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-black">Phase 5: Maintenance</h2>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                Long-Term Care
              </p>
            </div>
            {!isPhase4Done && (
              <span className="px-3 py-1.5 bg-gray-100 text-gray-500 text-[10px] font-black uppercase tracking-widest rounded-lg">
                Locked
              </span>
            )}
          </div>

          {isPhase5Done ? (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 bg-green-50 rounded-2xl border border-green-100">
              <div className="flex items-center gap-3 text-green-800">
                <CheckCircle2 size={20} className="shrink-0" />
                <p className="font-bold text-sm">
                  Blueprints activated. Project Complete!
                </p>
              </div>
              <button
                onClick={handleUndoMaintenance}
                disabled={isProcessing}
                className="w-full sm:w-auto px-4 py-2 bg-white text-green-700 hover:bg-green-100 border border-green-200 font-black text-xs rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <RotateCcw size={14} /> Deactivate
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {blueprint.custom_maintenance_tasks.map(
                  (task: any, idx: number) => (
                    <div
                      key={idx}
                      className="bg-gray-50 p-4 rounded-2xl border border-gray-100"
                    >
                      <h4 className="font-black text-gray-900 mb-1">
                        {task.title}
                      </h4>
                      <p className="text-xs font-bold text-gray-500 mb-3">
                        {task.description}
                      </p>
                      <span className="px-2 py-1 bg-teal-100 text-teal-700 text-[10px] font-black uppercase rounded-md">
                        Every {task.frequency_days} Days
                      </span>
                    </div>
                  ),
                )}
              </div>
              <button
                onClick={handleActivateMaintenance}
                disabled={!isPhase4Done || isProcessing}
                className={`w-full px-6 py-4 font-black rounded-2xl transition-colors flex items-center justify-center gap-2 ${isPhase4Done ? "bg-teal-600 hover:bg-teal-700 text-white shadow-lg active:scale-95" : "border-2 border-dashed border-gray-200 text-gray-400"}`}
              >
                {isProcessing ? (
                  <Loader2 size={20} className="animate-spin" />
                ) : (
                  <CheckCircle2 size={20} />
                )}{" "}
                Activate Blueprints & Finish Plan
              </button>
            </div>
          )}
        </section>
      </div>

      {/* MODALS */}
      {confirmState && (
        <ConfirmModal
          isOpen={confirmState.isOpen}
          isLoading={isProcessing}
          onClose={() => setConfirmState(null)}
          onConfirm={executeConfirmAction}
          title={confirmState.title}
          description={confirmState.description}
          confirmText={confirmState.confirmText}
          isDestructive={true}
        />
      )}
    </div>
  );
}
