import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useLocation } from "react-router-dom";
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
  X,
  MessageSquarePlus,
  Trash2,
  Plus,
} from "lucide-react";
import toast from "react-hot-toast";
import { ConfirmModal } from "./ConfirmModal";
import { saveMemoryEvent } from "../lib/plannerMemory";
import { logEvent, EVENT } from "../events/registry";
import WikiPlantCard from "./WikiPlantCard";
import {
  injectBlueprintTasks,
  activateMaintenanceBlueprints,
} from "../services/planStagingService";

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
  const location = useLocation();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);

  const [localBlueprint, setLocalBlueprint] = useState(plan.ai_blueprint);
  const [localCoverImage, setLocalCoverImage] = useState(plan.cover_image_url);

  const [localStagingState, setLocalStagingState] = useState(
    plan.staging_state || {},
  );

  const [localPlanStatus, setLocalPlanStatus] = useState(plan.status);

  const [isStarted, setIsStarted] = useState(!!localStagingState.has_started);

  const [showRegenModal, setShowRegenModal] = useState(false);
  const [regenFeedback, setRegenFeedback] = useState("");

  const [isAddingPlant, setIsAddingPlant] = useState(false);
  const [newPlantName, setNewPlantName] = useState("");
  const [newPlantQuantity, setNewPlantQuantity] = useState(1);

  const [showSuccessFeedback, setShowSuccessFeedback] = useState(false);

  const isPhase1Done = !!localStagingState.linked_area_id;
  const isPhase2Done = !!localStagingState.plants_linked;
  const isPhase3Done = !!localStagingState.plants_assigned;
  const isPhase4Done =
    localPlanStatus === "In Progress" || localPlanStatus === "Completed";
  const isPhase5Done = !!localStagingState.maintenance_active;

  const [locations, setLocations] = useState<any[]>([]);
  const [areas, setAreas] = useState<any[]>([]);
  const [shedPlants, setShedPlants] = useState<any[]>([]);

  const [areaMode, setAreaMode] = useState<"new" | "existing">("new");
  const [newAreaLocationId, setNewAreaLocationId] = useState<string>("");
  const [filterLocationId, setFilterLocationId] = useState<string>("");
  const [existingAreaId, setExistingAreaId] = useState<string>("");

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

  const [collapsedPhases, setCollapsedPhases] = useState<Record<string, boolean>>({});

  const togglePhaseCollapse = (phase: string) => {
    setCollapsedPhases((prev) => ({ ...prev, [phase]: !prev[phase] }));
  };

  // 🚀 THE FIX: Dependency changed to [plan.id] so it NEVER overwrites local state with a stale cache echo
  useEffect(() => {
    setLocalStagingState(plan.staging_state || {});
    setLocalPlanStatus(plan.status);
    setIsStarted(!!plan.staging_state?.has_started);
    setPlantMapping(plan.staging_state?.plant_mapping || {});
    setLocalBlueprint(plan.ai_blueprint);
    setLocalCoverImage(plan.cover_image_url);
  }, [plan.id]);

  useEffect(() => {
    if (showRegenModal || confirmState || isRegenerating) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [showRegenModal, confirmState, isRegenerating]);

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
    if (
      isPhase1Done &&
      !isPhase2Done &&
      shedPlants.length > 0 &&
      localBlueprint
    ) {
      const newMapping: Record<number, string> = { ...plantMapping };
      let updated = false;
      localBlueprint.plant_manifest?.forEach((plant: any, idx: number) => {
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
    } else if (Object.keys(plantMapping).length === 0 && localBlueprint) {
      const newMapping: Record<number, string> = {};
      localBlueprint.plant_manifest?.forEach(
        (_: any, idx: number) => (newMapping[idx] = "create"),
      );
      setPlantMapping(newMapping);
    }
  }, [isPhase1Done, isPhase2Done, shedPlants, localBlueprint, plantMapping]);


  const saveStagingState = async (newState: any) => {
    const mergedState = { ...localStagingState, ...newState };
    setLocalStagingState(mergedState);
    await supabase
      .from("plans")
      .update({ staging_state: mergedState })
      .eq("id", plan.id);
    onPlanUpdated();
  };

  const updateBlueprintInDB = async (updatedBlueprint: any) => {
    setLocalBlueprint(updatedBlueprint);
    await supabase
      .from("plans")
      .update({ ai_blueprint: updatedBlueprint })
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

  const handleStartProject = async () => {
    await saveStagingState({ has_started: true });
    setIsStarted(true);
    saveMemoryEvent(homeId, plan.id, "accepted_blueprint", { blueprint_title: localBlueprint?.project_overview?.title });
    toast.success("Project Started! Begin Phase 1.");
  };

  const handleRegeneratePlan = async () => {
    if (!regenFeedback.trim())
      return toast.error("Please provide feedback for the AI.");
    setIsRegenerating(true);
    setShowRegenModal(false);
    saveMemoryEvent(homeId, plan.id, "regen_feedback", { feedback_text: regenFeedback });
    const toastId = toast.loading("Consulting the AI Architect...");

    try {
      const { data, error } = await supabase.functions.invoke(
        "generate-landscape-plan",
        {
          body: {
            homeId,
            isRegeneration: true,
            formData: {
              planName: plan.name,
              description: plan.description,
              feedback: regenFeedback,
              previousBlueprint: localBlueprint,
            },
          },
        },
      );

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const { error: updateError } = await supabase
        .from("plans")
        .update({
          ai_blueprint: data.blueprint,
          cover_image_url: data.cover_image_url,
          staging_state: {},
          status: "Draft",
        })
        .eq("id", plan.id);

      if (updateError) throw updateError;

      setLocalBlueprint(data.blueprint);
      setLocalCoverImage(data.cover_image_url);
      setLocalStagingState({});
      setPlantMapping({});
      setIsStarted(false);

      toast.success("Blueprint Regenerated!", { id: toastId });
      setRegenFeedback("");
      onPlanUpdated();
    } catch (err: any) {
      toast.error(err.message || "Failed to regenerate.", { id: toastId });
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleDeletePlant = async (index: number) => {
    const updatedManifest = [...localBlueprint.plant_manifest];
    const deletedPlant = updatedManifest.splice(index, 1)[0];

    const updatedBlueprint = {
      ...localBlueprint,
      plant_manifest: updatedManifest,
    };

    const newMapping: Record<number, string> = {};
    updatedManifest.forEach((_, i) => {
      const oldIndex = i >= index ? i + 1 : i;
      newMapping[i] = plantMapping[oldIndex] || "create";
    });

    const newSelected = selectedForProcurement
      .filter((i) => i !== index)
      .map((i) => (i > index ? i - 1 : i));

    setPlantMapping(newMapping);
    setSelectedForProcurement(newSelected);

    await saveStagingState({ plant_mapping: newMapping });
    await updateBlueprintInDB(updatedBlueprint);
    toast.success(`Removed ${deletedPlant.common_name}`);
  };

  const handleSaveNewPlant = async () => {
    if (!newPlantName.trim()) return toast.error("Plant name is required.");
    if (newPlantQuantity < 1)
      return toast.error("Quantity must be at least 1.");

    const newPlant = {
      common_name: newPlantName,
      scientific_name: "Custom Addition",
      quantity: newPlantQuantity,
      role: "Custom Addition",
      aesthetic_reason: "Manually requested by user.",
      horticultural_reason: "Manually assigned.",
      procurement_advice: "Procure locally or search Shed.",
    };

    const updatedManifest = [...localBlueprint.plant_manifest, newPlant];
    const updatedBlueprint = {
      ...localBlueprint,
      plant_manifest: updatedManifest,
    };

    const newIndex = updatedManifest.length - 1;
    const newMapping = { ...plantMapping, [newIndex]: "create" };

    setPlantMapping(newMapping);
    await saveStagingState({ plant_mapping: newMapping });
    await updateBlueprintInDB(updatedBlueprint);

    setIsAddingPlant(false);
    setNewPlantName("");
    setNewPlantQuantity(1);
    toast.success("Custom plant added to plan!");
  };

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
          localBlueprint.infrastructure_requirements.suggested_sunlight?.toLowerCase() ||
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
            name: localBlueprint.infrastructure_requirements
              .suggested_area_name,
            growing_medium:
              localBlueprint.infrastructure_requirements.suggested_medium,
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
            name: localBlueprint.infrastructure_requirements
              .suggested_area_name,
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

  const handleOpenSearchModal = (sourceType: "api" | "ai") => {
    if (selectedForProcurement.length === 0)
      return toast.error(
        "Please check the boxes next to the plants you want to procure.",
      );
    saveStagingState({ plant_mapping: plantMapping });
    const queueItems = selectedForProcurement.map((idx) => ({
      type: sourceType,
      data: localBlueprint.plant_manifest[idx].common_name,
    }));

    navigate("/shed", {
      state: { autoImport: queueItems.map((q) => q.data), source: sourceType, returnTo: location.pathname + location.search },
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

  const handleBulkAssign = async () => {
    setIsProcessing(true);
    const toastId = toast.loading("Staging plants in the Area...");
    try {
      const itemsToInsert: any[] = [];
      localBlueprint.plant_manifest.forEach((plantDef: any, idx: number) => {
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
      setShowSuccessFeedback(true);
      setTimeout(() => setShowSuccessFeedback(false), 2000);
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

  const handleInjectTasks = async () => {
    setIsProcessing(true);
    const toastId = toast.loading("Injecting preparation and planting tasks...");
    try {
      const targetLocationId = areas.find(
        (a) => a.id === localStagingState.linked_area_id,
      )?.location_id;

      await injectBlueprintTasks({
        homeId,
        planId: plan.id,
        areaId: localStagingState.linked_area_id,
        locationId: targetLocationId,
        preparationTasks: localBlueprint.preparation_tasks,
        plantManifest: localBlueprint.plant_manifest,
        plantMapping: localStagingState.plant_mapping,
      });

      setLocalPlanStatus("In Progress");
      onPlanUpdated();
      setShowSuccessFeedback(true);
      setTimeout(() => setShowSuccessFeedback(false), 2000);
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

  const handleActivateMaintenance = async () => {
    setIsProcessing(true);
    const toastId = toast.loading("Activating recurring blueprints...");
    try {
      const targetLocationId = areas.find(
        (a) => a.id === localStagingState.linked_area_id,
      )?.location_id;

      await activateMaintenanceBlueprints({
        homeId,
        planId: plan.id,
        areaId: localStagingState.linked_area_id,
        locationId: targetLocationId,
        maintenanceTasks: localBlueprint.custom_maintenance_tasks,
      });

      await saveStagingState({ maintenance_active: true });
      setLocalPlanStatus("Completed");
      onPlanUpdated();
      logEvent(EVENT.PLAN_COMPLETED, { plan_id: plan.id, plan_name: plan.name });
      saveMemoryEvent(homeId, plan.id, "completed_plan", {
        blueprint_title: localBlueprint?.project_overview?.title,
      });
      setShowSuccessFeedback(true);
      setTimeout(() => setShowSuccessFeedback(false), 2000);
      toast.success("Project Complete! Maintenance automated.", { id: toastId });
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

  if (!localBlueprint || !localBlueprint.project_overview) {
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

  const optimizedCoverUrl = localCoverImage?.includes(
    "/storage/v1/object/public/",
  )
    ? `${localCoverImage}?width=800&quality=80&format=webp`
    : localCoverImage;

  const getCurrentPhaseId = () => {
    if (!isStarted) return null;
    if (!isPhase1Done) return "phase-1";
    if (!isPhase2Done) return "phase-2";
    if (!isPhase3Done) return "phase-3";
    if (!isPhase4Done) return "phase-4";
    if (!isPhase5Done) return "phase-5";
    return null;
  };

  const currentPhaseId = getCurrentPhaseId();

  return (
    <div className="h-full flex flex-col bg-rhozly-bg animate-in slide-in-from-right-8 duration-500 relative z-40">
      {/* Skip Navigation */}
      {currentPhaseId && (
        <a
          href={`#${currentPhaseId}`}
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-1/2 focus:-translate-x-1/2 focus:z-50 focus:px-6 focus:py-3 focus:bg-rhozly-primary focus:text-white focus:rounded-xl focus:font-black focus:shadow-lg"
        >
          Skip to Current Phase
        </a>
      )}
      {/* Header */}
      <div className="relative h-64 shrink-0 overflow-hidden rounded-b-[3rem] shadow-lg">
        {localCoverImage ? (
          <img
            src={optimizedCoverUrl}
            alt="Cover"
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-rhozly-primary" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
        <button
          onClick={onBack}
          aria-label="Go back to plans list"
          className="absolute top-6 left-6 w-10 h-10 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white hover:bg-white/40 transition-colors z-10"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="absolute bottom-6 left-6 right-6 text-white z-10">
          <h1 className="text-3xl sm:text-4xl font-black font-display leading-tight">
            {localBlueprint.project_overview.title}
          </h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-6 custom-scrollbar pb-24">
        {/* Pre-Start Review Panel */}
        {!isStarted && (
          <section className="bg-white rounded-3xl p-6 sm:p-8 shadow-md border border-rhozly-primary/30 relative overflow-hidden animate-in fade-in">
            <div className="absolute inset-0 bg-rhozly-primary/5 pointer-events-none" />
            <div className="relative z-10">
              <h2 className="text-2xl font-black text-rhozly-on-surface mb-2 flex items-center gap-2">
                <Sparkles className="text-rhozly-primary" /> Review Your
                Blueprint
              </h2>
              <p className="text-sm font-bold text-gray-600 mb-6 leading-relaxed">
                Review the suggested plants, tasks, and maintenance schedule. Accept to begin staging, or give feedback and regenerate.
              </p>

              <div className="flex flex-col sm:flex-row gap-4">
                <button
                  onClick={handleStartProject}
                  className="flex-1 min-h-[44px] py-4 bg-rhozly-primary hover:bg-rhozly-primary/90 text-white rounded-2xl font-black shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 text-lg focus:outline-none focus:ring-2 focus:ring-rhozly-primary focus:ring-offset-2"
                >
                  <CheckCircle2 size={22} /> Accept & Start Staging
                </button>
                <button
                  onClick={() => setShowRegenModal(true)}
                  className="flex-1 min-h-[44px] py-4 bg-white border-2 border-rhozly-primary/20 text-rhozly-primary hover:bg-rhozly-primary/5 rounded-2xl font-black transition-all active:scale-95 flex items-center justify-center gap-2 text-lg focus:outline-none focus:ring-2 focus:ring-rhozly-primary focus:ring-offset-2"
                >
                  <RotateCcw size={22} /> Regenerate Plan
                </button>
              </div>
            </div>
          </section>
        )}

        <div className={`space-y-6 transition-all duration-500 lg:grid lg:grid-cols-2 lg:gap-6 lg:space-y-0`}>
          {/* PHASE 1: INFRASTRUCTURE */}
          <section
            id="phase-1"
            aria-label={`Phase 1: Infrastructure - ${isPhase1Done ? "Completed" : "In Progress"}`}
            className={`bg-white rounded-3xl p-6 shadow-sm border transition-colors ${isPhase1Done ? "border-green-200 bg-green-50/10" : "border-rhozly-outline/10"} ${!isStarted ? "opacity-40 grayscale-[30%] pointer-events-none select-none" : ""}`}
          >
            <div className="flex items-center gap-3 mb-6">
              <div
                aria-current={!isPhase1Done && isStarted ? "step" : undefined}
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isPhase1Done ? "bg-green-100 text-green-600" : "bg-rhozly-primary/10 text-rhozly-primary"}`}
              >
                {isPhase1Done ? (
                  <CheckCircle2 size={20} />
                ) : (
                  <MapIcon size={20} />
                )}
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-black">Phase 1: Infrastructure</h2>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  Environment Setup
                </p>
              </div>
              {isPhase1Done && (
                <button
                  onClick={() => togglePhaseCollapse("phase-1")}
                  className="min-h-[44px] min-w-[44px] px-3 text-xs font-black text-green-700 hover:bg-green-50 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 flex items-center justify-center"
                  aria-expanded={!collapsedPhases["phase-1"]}
                  aria-label={collapsedPhases["phase-1"] ? "Expand Phase 1" : "Collapse Phase 1"}
                >
                  {collapsedPhases["phase-1"] ? "Expand" : "Collapse"}
                </button>
              )}
            </div>

            {!collapsedPhases["phase-1"] && (
              <>
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
                  className="w-full sm:w-auto px-4 py-2 bg-white text-green-700 hover:bg-green-100 border border-green-200 font-black text-xs rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                >
                  <RotateCcw size={14} /> Change Area
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-4 bg-rhozly-primary/5 rounded-2xl border border-rhozly-primary/10 space-y-4">
                  <div className="flex bg-white rounded-xl p-1 shadow-sm border border-rhozly-primary/10">
                    <button
                      onClick={() => setAreaMode("new")}
                      className={`flex-1 min-h-[44px] text-sm font-black rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-rhozly-primary focus:ring-offset-1 ${areaMode === "new" ? "bg-rhozly-primary text-white" : "text-rhozly-primary/60 hover:text-rhozly-primary"}`}
                    >
                      Create New
                    </button>
                    <button
                      onClick={() => setAreaMode("existing")}
                      className={`flex-1 min-h-[44px] text-sm font-black rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-rhozly-primary focus:ring-offset-1 ${areaMode === "existing" ? "bg-rhozly-primary text-white" : "text-rhozly-primary/60 hover:text-rhozly-primary"}`}
                    >
                      Link Existing
                    </button>
                  </div>
                  {areaMode === "new" ? (
                    <>
                      <div className="bg-white p-3 rounded-xl border border-rhozly-primary/10">
                        <p className="text-[10px] text-gray-400 font-black uppercase mb-1">
                          AI Suggestion
                        </p>
                        <p className="text-sm font-bold text-gray-900">
                          {
                            localBlueprint.infrastructure_requirements
                              .suggested_area_name
                          }
                        </p>
                      </div>
                      <div>
                        <label className="text-[10px] font-black uppercase text-rhozly-primary tracking-widest mb-1 block">
                          Put inside Location:
                        </label>
                        <select
                          value={newAreaLocationId}
                          onChange={(e) => setNewAreaLocationId(e.target.value)}
                          className="w-full p-3 bg-white rounded-xl outline-none font-bold border border-rhozly-primary/20 focus:border-rhozly-primary"
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
                        <label className="text-[10px] font-black uppercase text-rhozly-primary tracking-widest mb-1 block">
                          1. Select Location
                        </label>
                        <select
                          value={filterLocationId}
                          onChange={(e) => setFilterLocationId(e.target.value)}
                          className="w-full p-3 bg-white rounded-xl outline-none font-bold border border-rhozly-primary/20 focus:border-rhozly-primary"
                        >
                          {locations.map((loc) => (
                            <option key={loc.id} value={loc.id}>
                              {loc.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-black uppercase text-rhozly-primary tracking-widest mb-1 block">
                          2. Select Area
                        </label>
                        <select
                          value={existingAreaId}
                          onChange={(e) => setExistingAreaId(e.target.value)}
                          disabled={!existingAreaId}
                          className="w-full p-3 bg-white rounded-xl outline-none font-bold border border-rhozly-primary/20 focus:border-rhozly-primary disabled:opacity-50"
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
                    className="w-full px-6 py-3 min-h-[44px] bg-rhozly-primary hover:bg-rhozly-primary/90 text-white font-black rounded-xl transition-colors flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-rhozly-primary focus:ring-offset-2"
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
              </>
            )}
          </section>

          {/* PHASE 2: SOURCING */}
          <section
            id="phase-2"
            aria-label={`Phase 2: The Shed - ${isPhase2Done ? "Completed" : isPhase1Done ? "In Progress" : "Locked"}`}
            className={`bg-white rounded-3xl p-6 shadow-sm border transition-all ${isPhase1Done ? (isPhase2Done ? "border-green-200 bg-green-50/10" : "border-rhozly-outline/10") : "border-gray-100 opacity-50 pointer-events-none"}`}
          >
            <div className="flex items-center gap-3 mb-6">
              <div
                aria-current={isPhase1Done && !isPhase2Done ? "step" : undefined}
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isPhase2Done ? "bg-green-100 text-green-600" : "bg-rhozly-primary/10 text-rhozly-primary"}`}
              >
                {isPhase2Done ? <CheckCircle2 size={20} /> : <Leaf size={20} />}
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-black">Phase 2: The Shed</h2>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  Procurement & Linking
                </p>
              </div>
              {isPhase2Done && (
                <button
                  onClick={() => togglePhaseCollapse("phase-2")}
                  className="min-h-[44px] min-w-[44px] px-3 text-xs font-black text-green-700 hover:bg-green-50 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 flex items-center justify-center"
                  aria-expanded={!collapsedPhases["phase-2"]}
                  aria-label={collapsedPhases["phase-2"] ? "Expand Phase 2" : "Collapse Phase 2"}
                >
                  {collapsedPhases["phase-2"] ? "Expand" : "Collapse"}
                </button>
              )}
            </div>

            {!collapsedPhases["phase-2"] && (
              <>
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
                  className="w-full sm:w-auto px-4 py-2 bg-white text-green-700 hover:bg-green-100 border border-green-200 font-black text-xs rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                >
                  <RotateCcw size={14} /> Amend Sourcing
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-xs font-bold text-gray-500">
                  Tick any plants you need to source, then add them to your Shed.
                </p>

                <div className="space-y-3">
                  {localBlueprint.plant_manifest.map((p: any, idx: number) => (
                    <WikiPlantCard
                      key={idx}
                      plant={p}
                      idx={idx}
                      isStarted={isStarted}
                      isPhase2Done={isPhase2Done}
                      plantMapping={plantMapping}
                      setPlantMapping={setPlantMapping}
                      selectedForProcurement={selectedForProcurement}
                      setSelectedForProcurement={setSelectedForProcurement}
                      handleDeletePlant={handleDeletePlant}
                      shedPlants={shedPlants}
                    />
                  ))}
                </div>

                {!isPhase2Done && (
                  <div className="mt-4">
                    {isAddingPlant ? (
                      <div className="p-4 border border-rhozly-primary/20 rounded-2xl bg-rhozly-primary/5 space-y-3 animate-in fade-in zoom-in-95">
                        <h4 className="font-black text-rhozly-on-surface">
                          Add Custom Plant
                        </h4>
                        <div className="flex flex-col sm:flex-row gap-3">
                          <input
                            type="text"
                            value={newPlantName}
                            onChange={(e) => setNewPlantName(e.target.value)}
                            placeholder="Plant Name (e.g. Rosemary)"
                            className="flex-1 p-3 rounded-xl border border-rhozly-primary/20 outline-none focus:ring-2 focus:ring-rhozly-primary/20 font-bold text-base sm:text-sm"
                            autoFocus
                          />
                          <input
                            type="number"
                            min="1"
                            value={newPlantQuantity}
                            onChange={(e) =>
                              setNewPlantQuantity(parseInt(e.target.value) || 1)
                            }
                            className="w-full sm:w-24 p-3 rounded-xl border border-rhozly-primary/20 outline-none focus:ring-2 focus:ring-rhozly-primary/20 font-bold text-base sm:text-sm"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setIsAddingPlant(false)}
                            className="flex-1 min-h-[44px] py-3 bg-white border border-rhozly-primary/20 text-rhozly-primary rounded-xl font-black transition-colors hover:bg-rhozly-primary/5 focus:outline-none focus:ring-2 focus:ring-rhozly-primary focus:ring-offset-2"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleSaveNewPlant}
                            className="flex-1 min-h-[44px] py-3 bg-rhozly-primary text-white rounded-xl font-black transition-colors hover:bg-rhozly-primary/90 focus:outline-none focus:ring-2 focus:ring-rhozly-primary focus:ring-offset-2"
                          >
                            Save Plant
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setIsAddingPlant(true)}
                        className="w-full min-h-[44px] py-4 border-2 border-dashed border-rhozly-primary/20 text-rhozly-primary rounded-2xl font-black flex items-center justify-center gap-2 hover:bg-rhozly-primary/5 transition-colors focus:outline-none focus:ring-2 focus:ring-rhozly-primary focus:ring-offset-2"
                      >
                        <Plus size={18} /> Add Custom Plant
                      </button>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4 border-t border-gray-100">
                  <button
                    onClick={() => handleOpenSearchModal("api")}
                    className="min-h-[44px] px-4 py-3 bg-rhozly-primary hover:bg-rhozly-primary/90 text-white font-black text-sm rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-rhozly-primary focus:ring-offset-2"
                  >
                    <Sparkles size={16} /> Procure via Perenual
                  </button>
                  <button
                    onClick={() => handleOpenSearchModal("ai")}
                    className="min-h-[44px] px-4 py-3 bg-rhozly-primary-container hover:bg-rhozly-primary text-white font-black text-sm rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-rhozly-primary focus:ring-offset-2"
                  >
                    <Sparkles size={16} /> Procure via AI
                  </button>
                </div>

                <div className="pt-2">
                  <button
                    onClick={handleConfirmPhase2}
                    disabled={isProcessing}
                    className="w-full min-h-[44px] px-4 py-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-black rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                  >
                    {isProcessing ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />} Confirm All Plants Linked
                  </button>
                </div>
              </div>
            )}
              </>
            )}
          </section>

          {/* PHASE 3: STAGING & ASSIGNMENT */}
          <section
            id="phase-3"
            aria-label={`Phase 3: Staging - ${isPhase3Done ? "Completed" : isPhase2Done ? "In Progress" : "Locked"}`}
            className={`bg-white rounded-3xl p-6 shadow-sm border transition-all ${isPhase2Done ? (isPhase3Done ? "border-green-200 bg-green-50/10" : "border-rhozly-outline/10") : "border-gray-100 opacity-50 pointer-events-none"} ${!isStarted ? "opacity-40 grayscale-[30%] pointer-events-none select-none" : ""}`}
          >
            <div className="flex items-center gap-3 mb-6">
              <div
                aria-current={isPhase2Done && !isPhase3Done ? "step" : undefined}
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isPhase3Done ? "bg-green-100 text-green-600" : "bg-rhozly-primary/10 text-rhozly-primary-container"}`}
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
              {isPhase3Done && (
                <button
                  onClick={() => togglePhaseCollapse("phase-3")}
                  className="min-h-[44px] min-w-[44px] px-3 text-xs font-black text-green-700 hover:bg-green-50 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 flex items-center justify-center"
                  aria-expanded={!collapsedPhases["phase-3"]}
                  aria-label={collapsedPhases["phase-3"] ? "Expand Phase 3" : "Collapse Phase 3"}
                >
                  {collapsedPhases["phase-3"] ? "Expand" : "Collapse"}
                </button>
              )}
            </div>

            {!collapsedPhases["phase-3"] && (
              <>
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
                  className="w-full sm:w-auto px-4 py-2 bg-white text-green-700 hover:bg-green-100 border border-green-200 font-black text-xs rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                >
                  <RotateCcw size={14} /> Undo Staging
                </button>
              </div>
            ) : (
              <div className="p-6 border-2 border-dashed border-gray-200 rounded-2xl flex flex-col items-center text-center">
                <p className="font-bold text-gray-500 mb-4">
                  Plants sourced. Ready to move them into the Area?
                </p>
                <button
                  onClick={handleBulkAssign}
                  disabled={isProcessing}
                  className="min-h-[44px] px-6 py-3 bg-rhozly-primary hover:bg-rhozly-primary/90 text-white rounded-xl font-black transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-rhozly-primary focus:ring-offset-2"
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
              </>
            )}
          </section>

          {/* PHASE 4: EXECUTION */}
          <section
            id="phase-4"
            aria-label={`Phase 4: Execution - ${isPhase4Done ? "Completed" : isPhase3Done ? "In Progress" : "Locked"}`}
            className={`bg-white rounded-3xl p-6 shadow-sm border transition-all ${isPhase3Done ? (isPhase4Done ? "border-green-200 bg-green-50/10" : "border-rhozly-outline/10") : "border-gray-100 opacity-50 pointer-events-none"} ${!isStarted ? "opacity-40 grayscale-[30%] pointer-events-none select-none" : ""}`}
          >
            <div className="flex items-center gap-3 mb-6">
              <div
                aria-current={isPhase3Done && !isPhase4Done ? "step" : undefined}
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isPhase4Done ? "bg-green-100 text-green-600" : "bg-rhozly-primary/10 text-rhozly-primary"}`}
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
              {isPhase4Done && (
                <button
                  onClick={() => togglePhaseCollapse("phase-4")}
                  className="min-h-[44px] min-w-[44px] px-3 text-xs font-black text-green-700 hover:bg-green-50 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 flex items-center justify-center"
                  aria-expanded={!collapsedPhases["phase-4"]}
                  aria-label={collapsedPhases["phase-4"] ? "Expand Phase 4" : "Collapse Phase 4"}
                >
                  {collapsedPhases["phase-4"] ? "Expand" : "Collapse"}
                </button>
              )}
              {isPhase3Done && !isPhase4Done && (
                <button
                  onClick={handleInjectTasks}
                  disabled={isProcessing}
                  className="hidden sm:flex min-h-[44px] px-6 py-3 bg-rhozly-primary hover:bg-rhozly-primary/90 text-white font-black rounded-xl transition-all active:scale-95 items-center gap-2 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-rhozly-primary focus:ring-offset-2"
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

            {!collapsedPhases["phase-4"] && (
              <>
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
                  className="w-full sm:w-auto px-4 py-2 bg-white text-green-700 hover:bg-green-100 border border-green-200 font-black text-xs rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                >
                  <RotateCcw size={14} /> Remove Tasks
                </button>
              </div>
            ) : (
              <>
                {localBlueprint.preparation_tasks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                    <div className="w-20 h-20 bg-rhozly-primary/10 rounded-full flex items-center justify-center mb-4">
                      <CalendarPlus size={32} className="text-rhozly-primary" />
                    </div>
                    <h4 className="text-lg font-black text-gray-700 mb-2">
                      No Preparation Tasks
                    </h4>
                    <p className="text-sm font-bold text-gray-500 mb-6 max-w-md">
                      No prep steps needed — go straight to planting!
                    </p>
                    <button
                      onClick={handleInjectTasks}
                      disabled={isProcessing}
                      className="min-h-[44px] px-6 py-3 bg-rhozly-primary hover:bg-rhozly-primary/90 text-white rounded-xl font-black transition-all active:scale-95 flex items-center gap-2 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-rhozly-primary focus:ring-offset-2"
                    >
                      {isProcessing ? (
                        <Loader2 className="animate-spin" size={18} />
                      ) : (
                        <Sparkles size={18} />
                      )}
                      Schedule Planting Tasks
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4 relative before:absolute before:inset-y-0 before:left-[19px] before:w-0.5 before:bg-gray-100">
                    {localBlueprint.preparation_tasks.map((task: any) => (
                      <div
                        key={task.task_index}
                        className="relative flex gap-4 pl-12"
                      >
                        <div className="absolute left-0 w-10 h-10 bg-white border-2 border-rhozly-primary/20 text-rhozly-primary rounded-full flex items-center justify-center font-black text-sm z-10">
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
                          Planting tasks will be automatically scheduled after all prep steps.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
              </>
            )}
          </section>

          {/* PHASE 5: MAINTENANCE */}
          <section
            id="phase-5"
            aria-label={`Phase 5: Maintenance - ${isPhase5Done ? "Completed" : isPhase4Done ? "In Progress" : "Locked"}`}
            className={`lg:col-span-2 bg-white rounded-3xl p-6 shadow-sm border transition-all ${isPhase4Done ? (isPhase5Done ? "border-green-200 bg-green-50/10" : "border-rhozly-outline/10") : "border-gray-100 opacity-50 pointer-events-none"} ${!isStarted ? "opacity-40 grayscale-[30%] pointer-events-none select-none" : ""}`}
          >
            <div className="flex items-center gap-3 mb-6">
              <div
                aria-current={isPhase4Done && !isPhase5Done ? "step" : undefined}
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isPhase5Done ? "bg-green-100 text-green-600" : "bg-rhozly-primary/10 text-rhozly-primary"}`}
              >
                {isPhase5Done ? (
                  <CheckCircle2 size={20} />
                ) : (
                  <Wrench size={20} />
                )}
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-black">Phase 5: Maintenance</h2>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  Long-Term Care
                </p>
              </div>
              {isPhase5Done && (
                <button
                  onClick={() => togglePhaseCollapse("phase-5")}
                  className="min-h-[44px] min-w-[44px] px-3 text-xs font-black text-green-700 hover:bg-green-50 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 flex items-center justify-center"
                  aria-expanded={!collapsedPhases["phase-5"]}
                  aria-label={collapsedPhases["phase-5"] ? "Expand Phase 5" : "Collapse Phase 5"}
                >
                  {collapsedPhases["phase-5"] ? "Expand" : "Collapse"}
                </button>
              )}
            </div>

            {!collapsedPhases["phase-5"] && (
              <>
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
                  className="w-full sm:w-auto px-4 py-2 bg-white text-green-700 hover:bg-green-100 border border-green-200 font-black text-xs rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                >
                  <RotateCcw size={14} /> Deactivate
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                {localBlueprint.custom_maintenance_tasks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                    <div className="w-20 h-20 bg-rhozly-primary/10 rounded-full flex items-center justify-center mb-4">
                      <Wrench size={32} className="text-rhozly-primary" />
                    </div>
                    <h4 className="text-lg font-black text-gray-700 mb-2">
                      No Maintenance Tasks
                    </h4>
                    <p className="text-sm font-bold text-gray-500 mb-6 max-w-md">
                      No custom maintenance tasks — you can complete the project now.
                    </p>
                    <button
                      onClick={handleActivateMaintenance}
                      disabled={!isPhase4Done || isProcessing}
                      className={`min-h-[44px] px-6 py-3 font-black rounded-xl transition-all flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-rhozly-primary focus:ring-offset-2 ${isPhase4Done ? "bg-rhozly-primary hover:bg-rhozly-primary/90 text-white shadow-lg active:scale-95" : "border-2 border-dashed border-gray-200 text-gray-400"}`}
                    >
                      {isProcessing ? (
                        <Loader2 size={20} className="animate-spin" />
                      ) : (
                        <CheckCircle2 size={20} />
                      )}
                      Complete Project
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {localBlueprint.custom_maintenance_tasks.map(
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
                            <span className="px-2 py-1 bg-rhozly-primary/10 text-rhozly-primary text-[10px] font-black uppercase rounded-md">
                              Every {task.frequency_days} Days
                            </span>
                          </div>
                        ),
                      )}
                    </div>
                    <button
                      onClick={handleActivateMaintenance}
                      disabled={!isPhase4Done || isProcessing}
                      className={`w-full min-h-[44px] px-6 py-4 font-black rounded-2xl transition-colors flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-rhozly-primary focus:ring-offset-2 ${isPhase4Done ? "bg-rhozly-primary hover:bg-rhozly-primary/90 text-white shadow-lg active:scale-95" : "border-2 border-dashed border-gray-200 text-gray-400"}`}
                    >
                      {isProcessing ? (
                        <Loader2 size={20} className="animate-spin" />
                      ) : (
                        <CheckCircle2 size={20} />
                      )}{" "}
                      Activate Blueprints & Finish Plan
                    </button>
                  </>
                )}
              </div>
            )}
              </>
            )}
          </section>
        </div>
      </div>

      {/* SUCCESS FEEDBACK ANIMATION */}
      {showSuccessFeedback &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[250] flex items-center justify-center pointer-events-none animate-in fade-in zoom-in-95 duration-300">
            <div className="bg-green-500 text-white rounded-full p-8 shadow-2xl animate-in zoom-in-50 duration-500">
              <CheckCircle2 size={64} className="animate-in zoom-in-95 duration-700" />
            </div>
          </div>,
          document.body,
        )}

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

      {/* REGENERATION FEEDBACK MODAL */}
      {showRegenModal &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 sm:p-6 bg-rhozly-bg/95 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl border border-rhozly-outline/10 animate-in zoom-in-95 duration-200">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-black flex items-center gap-2 text-rhozly-primary">
                  <MessageSquarePlus size={20} /> Refine Blueprint
                </h3>
                <button
                  onClick={() => setShowRegenModal(false)}
                  aria-label="Close regeneration modal"
                  className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
              <p className="text-sm font-bold text-gray-500 mb-4 leading-relaxed">
                Tell the AI Architect what you want changed. For example:{" "}
                <i>"I don't like the tomatoes"</i>, <i>"Make it cheaper"</i>, or{" "}
                <i>"Swap the focal plant for a rose bush."</i>
              </p>
              <textarea
                value={regenFeedback}
                onChange={(e) => setRegenFeedback(e.target.value)}
                placeholder="Your feedback here..."
                rows={4}
                className="w-full p-4 bg-rhozly-surface-low rounded-2xl outline-none font-bold text-base focus:ring-2 focus:ring-rhozly-primary/20 border border-transparent transition-all mb-6 resize-none"
              />
              <div className="flex gap-3">
                <button
                  onClick={() => setShowRegenModal(false)}
                  className="flex-1 py-3 bg-gray-100 text-gray-700 font-black rounded-xl hover:bg-gray-200 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRegeneratePlan}
                  disabled={isRegenerating}
                  className="flex-1 py-3 bg-rhozly-primary text-white font-black rounded-xl flex justify-center items-center gap-2 disabled:opacity-50 hover:bg-rhozly-primary/90 transition-all active:scale-95 focus:outline-none focus:ring-2 focus:ring-rhozly-primary focus:ring-offset-2"
                >
                  {isRegenerating ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <Sparkles size={18} />
                  )}{" "}
                  Regenerate
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* MASSIVE FULL-SCREEN BLOCKING LOADER FOR REGENERATION */}
      {isRegenerating &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-white/90 backdrop-blur-md animate-in fade-in duration-300">
            <Loader2 className="w-16 h-16 text-rhozly-primary animate-spin mb-6" />
            <h2 className="text-2xl font-black font-display text-rhozly-on-surface">
              Consulting AI Architect...
            </h2>
            <p className="text-sm font-bold text-gray-500 mt-2 text-center max-w-xs leading-relaxed">
              Please wait while the AI analyzes your feedback and redraws your
              entire project blueprint.
            </p>
          </div>,
          document.body,
        )}
    </div>
  );
}
