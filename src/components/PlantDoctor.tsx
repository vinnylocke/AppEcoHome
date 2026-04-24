import React, { useState, useRef, useEffect } from "react";
import {
  Camera as CameraIcon,
  Upload,
  X,
  Search,
  Activity,
  Stethoscope,
  Loader2,
  ChevronDown,
  Sparkles,
  Lock,
  Database,
  Edit3,
  CheckCircle2,
  ClipboardList,
  Syringe,
  CalendarPlus,
  Globe,
  BrainCircuit,
  BookOpen,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { Logger } from "../lib/errorHandler";
import { supabase } from "../lib/supabase";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";

import ManualPlantCreation from "./ManualPlantCreation";
import PlantSearchModal from "./PlantSearchModal";

// 🧠 IMPORT THE AI CONTEXT
import { usePlantDoctor } from "../context/PlantDoctorContext";

interface PlantDoctorProps {
  homeId: string;
  aiEnabled: boolean;
  isPremium: boolean;
  perenualEnabled: boolean;
  onTasksAdded?: () => void;
}

interface DiseaseInfo {
  description: string;
  solution: string;
  source: string;
}

// 🚀 SEASONAL AUTOMATION PARSERS
const getHemisphere = (country?: string, timezone?: string) => {
  const southernCountries = [
    "australia",
    "new zealand",
    "brazil",
    "south africa",
    "argentina",
    "chile",
    "peru",
  ];
  const searchString = `${country || ""} ${timezone || ""}`.toLowerCase();
  if (southernCountries.some((c) => searchString.includes(c)))
    return "southern";
  return "northern";
};

const normalizePeriods = (input: any): string[] => {
  if (!input) return [];
  if (Array.isArray(input)) return input.flatMap((i) => normalizePeriods(i));
  if (typeof input === "string") {
    return input
      .split(/,|\band\b|&/i)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
};

const getSinglePeriodRange = (
  period: string,
  hemisphere: "northern" | "southern",
) => {
  const p = period.toLowerCase();
  if (p.includes("jan")) return { start: "01-01", end: "01-31" };
  if (p.includes("feb")) return { start: "02-01", end: "02-28" };
  if (p.includes("mar")) return { start: "03-01", end: "03-31" };
  if (p.includes("apr")) return { start: "04-01", end: "04-30" };
  if (p.includes("may")) return { start: "05-01", end: "05-31" };
  if (p.includes("jun")) return { start: "06-01", end: "06-30" };
  if (p.includes("jul")) return { start: "07-01", end: "07-31" };
  if (p.includes("aug")) return { start: "08-01", end: "08-31" };
  if (p.includes("sep")) return { start: "09-01", end: "09-30" };
  if (p.includes("oct")) return { start: "10-01", end: "10-31" };
  if (p.includes("nov")) return { start: "11-01", end: "11-30" };
  if (p.includes("dec")) return { start: "12-01", end: "12-31" };
  if (p.includes("spring"))
    return hemisphere === "northern"
      ? { start: "03-01", end: "05-31" }
      : { start: "09-01", end: "11-30" };
  if (p.includes("summer"))
    return hemisphere === "northern"
      ? { start: "06-01", end: "08-31" }
      : { start: "12-01", end: "02-28" };
  if (p.includes("fall") || p.includes("autumn"))
    return hemisphere === "northern"
      ? { start: "09-01", end: "11-30" }
      : { start: "03-01", end: "05-31" };
  if (p.includes("winter"))
    return hemisphere === "northern"
      ? { start: "12-01", end: "02-28" }
      : { start: "06-01", end: "08-31" };
  return { start: "01-01", end: "12-31" };
};

export default function PlantDoctor({
  homeId,
  aiEnabled,
  isPremium,
  perenualEnabled,
  onTasksAdded,
}: PlantDoctorProps) {
  const { setPageContext } = usePlantDoctor();

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [isGeneratingGuide, setIsGeneratingGuide] = useState(false);
  const [isFetchingDetails, setIsFetchingDetails] = useState(false);
  const [isGeneratingTreatment, setIsGeneratingTreatment] = useState(false);
  const [activeAction, setActiveAction] = useState<
    "identify" | "diagnose" | null
  >(null);

  const [myInventory, setMyInventory] = useState<any[]>([]);
  const [plantSearch, setPlantSearch] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const [aiResult, setAiResult] = useState<{
    notes?: string;
    possible_names?: string[];
    possible_diseases?: string[] | null;
    diseaseInfo?: DiseaseInfo;
    plantData?: any;
    remedial_schedules?: any[];
  } | null>(null);

  const [selectedPlantName, setSelectedPlantName] = useState<string | null>(
    null,
  );
  const [selectedDisease, setSelectedDisease] = useState<string | null>(null);
  const [sickInventoryId, setSickInventoryId] = useState<string | null>(null);
  const [isApplyingTreatment, setIsApplyingTreatment] = useState(false);

  const [saveToJournal, setSaveToJournal] = useState(true);

  const [showManualAdd, setShowManualAdd] = useState(false);
  const [showPerenualSearch, setShowPerenualSearch] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPageContext({
      action: "Using Vision AI Identification/Diagnosis",
      visionSession: {
        hasImage: !!imagePreview,
        currentTask: activeAction || "Waiting for upload",
        isAnalyzing: isProcessing,
        results: aiResult
          ? {
              notes: aiResult.notes,
              suggestedPlants: aiResult.possible_names,
              suggestedDiseases: aiResult.possible_diseases,
              currentDiagnosis: aiResult.diseaseInfo,
            }
          : null,
        userSelections: {
          plantChosen: selectedPlantName,
          diseaseChosen: selectedDisease,
          targetInventoryItem: myInventory.find((i) => i.id === sickInventoryId)
            ?.plants?.common_name,
        },
      },
    });

    return () => setPageContext(null);
  }, [
    imagePreview,
    activeAction,
    isProcessing,
    aiResult,
    selectedPlantName,
    selectedDisease,
    sickInventoryId,
    myInventory,
    setPageContext,
  ]);

  useEffect(() => {
    const fetchInventory = async () => {
      if (!homeId) return;
      const { data } = await supabase
        .from("inventory_items")
        .select(`id, plant_id, location_id, area_id, plants ( common_name )`)
        .eq("home_id", homeId)
        .eq("status", "Planted");
      if (data) setMyInventory(data);
    };
    fetchInventory();
  }, [homeId]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      )
        setIsDropdownOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleNativeCamera = async () => {
    try {
      const photo = await Camera.getPhoto({
        quality: 80,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: CameraSource.Camera,
      });

      if (photo.base64String) {
        const base64Data = `data:image/${photo.format};base64,${photo.base64String}`;
        const res = await fetch(base64Data);
        const blob = await res.blob();
        const file = new File(
          [blob],
          `camera_photo_${Date.now()}.${photo.format}`,
          { type: `image/${photo.format}` },
        );

        setImagePreview(URL.createObjectURL(file));
        setSelectedFile(file);
        setAiResult(null);
        setSelectedPlantName(null);
        setSelectedDisease(null);
        setSickInventoryId(null);
        setSaveToJournal(true);
      }
    } catch (error) {
      console.log("User cancelled camera or it failed", error);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!file.type.startsWith("image/"))
        return toast.error("Invalid file type.");
      if (file.size > 10 * 1024 * 1024)
        return toast.error("Image must be under 10MB.");

      setImagePreview(URL.createObjectURL(file));
      setSelectedFile(file);
      setAiResult(null);
      setSelectedPlantName(null);
      setSelectedDisease(null);
      setSickInventoryId(null);
      setSaveToJournal(true);
    } catch (error) {
      toast.error("Failed to load image.");
    }
  };

  const clearImage = () => {
    setImagePreview(null);
    setSelectedFile(null);
    setPlantSearch("");
    setActiveAction(null);
    setAiResult(null);
    setSelectedPlantName(null);
    setSelectedDisease(null);
    setSickInventoryId(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const compressImage = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 800;
        const scaleSize = MAX_WIDTH / img.width;
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scaleSize;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject("Could not get canvas context");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.7).split(",")[1]);
      };
      img.onerror = reject;
    });
  };

  const handleAiAction = async (action: "identify" | "diagnose") => {
    if (!aiEnabled) return toast.error("AI features are disabled.");
    if (!selectedFile) return toast.error("Upload an image first.");

    setIsProcessing(true);
    setActiveAction(action);
    setAiResult(null);
    setSelectedPlantName(null);
    setSelectedDisease(null);
    setSickInventoryId(null);

    try {
      const base64Data = await compressImage(selectedFile);
      const { data, error } = await supabase.functions.invoke("plant-doctor", {
        body: {
          imageBase64: base64Data,
          mimeType: "image/jpeg",
          action: action === "identify" ? "identify_vision" : "diagnose",
          plantSearch,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setAiResult(data);
      toast.success(
        `Successfully ${action === "identify" ? "identified" : "diagnosed"}!`,
      );
    } catch (error: any) {
      toast.error(error.message || "Failed to analyze plant.");
    } finally {
      setIsProcessing(false);
    }
  };

  const fetchDetailedInfo = async (type: "api" | "ai") => {
    if (!selectedDisease) return;
    setIsFetchingDetails(true);
    try {
      const { data, error } = await supabase.functions.invoke("plant-doctor", {
        body: {
          action:
            type === "api" ? "fetch_perenual_disease" : "get_ai_disease_info",
          diseaseName: selectedDisease,
          notes: aiResult?.notes,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data?.notFound) {
        toast.error(
          `"${selectedDisease}" was not found in the global database. Try AI Feedback!`,
        );
        return;
      }

      setAiResult((prev) => ({ ...prev, diseaseInfo: data.diseaseInfo }));
      toast.success("Detailed report loaded.");
    } catch (err: any) {
      toast.error(err.message || "Failed to fetch details.");
    } finally {
      setIsFetchingDetails(false);
    }
  };

  const generateManualCareGuide = async () => {
    if (!selectedPlantName) return;
    setIsGeneratingGuide(true);
    try {
      const { data, error } = await supabase.functions.invoke("plant-doctor", {
        body: { action: "generate_care_guide", targetPlant: selectedPlantName },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setAiResult((prev) => ({ ...prev, plantData: data.plantData }));
      setShowManualAdd(true);
    } catch (error: any) {
      toast.error("Failed to generate care guide automatically.");
    } finally {
      setIsGeneratingGuide(false);
    }
  };

  const generateTreatmentPlan = async () => {
    if (!sickInventoryId) return toast.error("Please select a patient first.");
    const selectedItem = myInventory.find(
      (item) => item.id === sickInventoryId,
    );
    const plantName = selectedItem?.plants?.common_name || "Unknown Plant";

    const contextToUse = aiResult?.diseaseInfo
      ? aiResult.diseaseInfo.solution
      : aiResult?.notes;
    if (!contextToUse) return;

    setIsGeneratingTreatment(true);
    try {
      const { data, error } = await supabase.functions.invoke("plant-doctor", {
        body: {
          action: "generate_remedial_plan",
          diagnosisContext: contextToUse,
          targetPlant: plantName,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setAiResult((prev) => ({
        ...prev,
        remedial_schedules: data.remedial_schedules,
      }));
      toast.success("Treatment plan generated!");
    } catch (error: any) {
      toast.error("Failed to generate treatment plan.");
    } finally {
      setIsGeneratingTreatment(false);
    }
  };

  const handleSaveManualPlant = async (plantData: any) => {
    setIsProcessing(true);
    try {
      const manualId =
        Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 1000);
      const skeleton = {
        ...plantData,
        id: manualId,
        home_id: homeId,
        source: "manual",
      };

      const { data: savedPlant, error: saveError } = await supabase
        .from("plants")
        .insert([skeleton])
        .select()
        .single();
      if (saveError) throw saveError;

      const { data: homeData } = await supabase
        .from("homes")
        .select("country, timezone")
        .eq("id", homeId)
        .single();

      const hemisphere = getHemisphere(homeData?.country, homeData?.timezone);
      const newSchedules: any[] = [];

      const harvestPeriods = normalizePeriods(plantData.harvest_season);
      harvestPeriods.forEach((period) => {
        const { start, end } = getSinglePeriodRange(period, hemisphere);
        const niceTitle = period.charAt(0).toUpperCase() + period.slice(1);
        newSchedules.push({
          home_id: homeId,
          plant_id: savedPlant.id,
          title: `${niceTitle} Harvest`,
          description: `Auto-generated from Care Guide`,
          task_type: "Harvesting",
          trigger_event: "Planted",
          start_reference: `Seasonal:${start}:${niceTitle} Harvest Start`,
          start_offset_days: 0,
          end_reference: `Seasonal:${end}:${niceTitle} Harvest End`,
          end_offset_days: 0,
          frequency_days: 1,
          is_recurring: true,
          is_auto_generated: true,
        });
      });

      const pruningPeriods = normalizePeriods(plantData.pruning_month);
      pruningPeriods.forEach((period) => {
        const { start, end } = getSinglePeriodRange(period, hemisphere);
        const niceTitle = period.charAt(0).toUpperCase() + period.slice(1);
        newSchedules.push({
          home_id: homeId,
          plant_id: savedPlant.id,
          title: `${niceTitle} Pruning`,
          description: `Auto-generated from Care Guide`,
          task_type: "Maintenance",
          trigger_event: "Planted",
          start_reference: `Seasonal:${start}:${niceTitle} Pruning Start`,
          start_offset_days: 0,
          end_reference: `Seasonal:${end}:${niceTitle} Pruning End`,
          end_offset_days: 0,
          frequency_days: 1,
          is_recurring: true,
          is_auto_generated: true,
        });
      });

      const minWatering = plantData.watering_min_days || 3;
      const maxWatering = plantData.watering_max_days || 14;
      const avgWatering = Math.max(
        1,
        Math.round((minWatering + maxWatering) / 2),
      );

      const summerDates = getSinglePeriodRange("summer", hemisphere);
      const winterDates = getSinglePeriodRange("winter", hemisphere);
      const springDates = getSinglePeriodRange("spring", hemisphere);
      const fallDates = getSinglePeriodRange("fall", hemisphere);

      newSchedules.push(
        {
          home_id: homeId,
          plant_id: savedPlant.id,
          title: `Summer Watering`,
          description: `Auto-generated high-frequency watering`,
          task_type: "Watering",
          trigger_event: "Planted",
          start_reference: `Seasonal:${summerDates.start}:Summer Start`,
          start_offset_days: 0,
          end_reference: `Seasonal:${summerDates.end}:Summer End`,
          end_offset_days: 0,
          frequency_days: minWatering,
          is_recurring: true,
          is_auto_generated: true,
        },
        {
          home_id: homeId,
          plant_id: savedPlant.id,
          title: `Winter Watering`,
          description: `Auto-generated low-frequency watering`,
          task_type: "Watering",
          trigger_event: "Planted",
          start_reference: `Seasonal:${winterDates.start}:Winter Start`,
          start_offset_days: 0,
          end_reference: `Seasonal:${winterDates.end}:Winter End`,
          end_offset_days: 0,
          frequency_days: maxWatering,
          is_recurring: true,
          is_auto_generated: true,
        },
        {
          home_id: homeId,
          plant_id: savedPlant.id,
          title: `Spring Watering`,
          description: `Auto-generated moderate watering`,
          task_type: "Watering",
          trigger_event: "Planted",
          start_reference: `Seasonal:${springDates.start}:Spring Start`,
          start_offset_days: 0,
          end_reference: `Seasonal:${springDates.end}:Spring End`,
          end_offset_days: 0,
          frequency_days: avgWatering,
          is_recurring: true,
          is_auto_generated: true,
        },
        {
          home_id: homeId,
          plant_id: savedPlant.id,
          title: `Autumn Watering`,
          description: `Auto-generated moderate watering`,
          task_type: "Watering",
          trigger_event: "Planted",
          start_reference: `Seasonal:${fallDates.start}:Autumn Start`,
          start_offset_days: 0,
          end_reference: `Seasonal:${fallDates.end}:Autumn End`,
          end_offset_days: 0,
          frequency_days: avgWatering,
          is_recurring: true,
          is_auto_generated: true,
        },
      );

      if (newSchedules.length > 0) {
        await supabase.from("plant_schedules").insert(newSchedules);
      }

      toast.success("Plant added to The Shed with Automations!");
      setShowManualAdd(false);
      clearImage();
    } catch (error: any) {
      toast.error("Failed to save plant.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApplyTreatment = async () => {
    if (!sickInventoryId || !aiResult?.remedial_schedules)
      return toast.error("Please select a plant instance first.");
    setIsApplyingTreatment(true);

    try {
      const selectedItem = myInventory.find(
        (item) => item.id === sickInventoryId,
      );
      if (!selectedItem) throw new Error("Plant instance not found.");

      const recurringSchedules = aiResult.remedial_schedules.filter(
        (s) => s.is_recurring,
      );
      const oneOffTasks = aiResult.remedial_schedules.filter(
        (s) => !s.is_recurring,
      );

      const today = new Date();
      const todayStr = today.toISOString().split("T")[0];

      if (recurringSchedules.length > 0) {
        const blueprintsToInsert = recurringSchedules.map((schedule) => {
          const endDate = new Date(today);
          endDate.setDate(endDate.getDate() + (schedule.end_offset_days || 28));
          return {
            home_id: homeId,
            inventory_item_ids: [sickInventoryId], // 🚀 FIXED: Array Wrapping
            location_id: selectedItem.location_id,
            area_id: selectedItem.area_id,
            title: schedule.title,
            description: schedule.description,
            task_type: schedule.task_type,
            frequency_days: schedule.frequency_days,
            is_recurring: true,
            start_date: todayStr,
            end_date: endDate.toISOString().split("T")[0],
            priority: "High",
          };
        });

        // 🚀 FIXED: .select() the data to create the first tasks instantly
        const { data: createdBps, error: blueprintError } = await supabase
          .from("task_blueprints")
          .insert(blueprintsToInsert)
          .select();

        if (blueprintError) throw blueprintError;

        if (createdBps) {
          const initialTasks = createdBps.map((bp) => ({
            home_id: homeId,
            blueprint_id: bp.id,
            title: bp.title,
            description: bp.description,
            type: bp.task_type,
            location_id: bp.location_id,
            area_id: bp.area_id,
            inventory_item_ids: bp.inventory_item_ids,
            due_date: bp.start_date,
            status: "Pending",
          }));
          await supabase.from("tasks").insert(initialTasks);
        }
      }

      if (oneOffTasks.length > 0) {
        const tasksToInsert = oneOffTasks.map((task) => ({
          home_id: homeId,
          inventory_item_ids: [sickInventoryId], // 🚀 FIXED: Array Wrapping
          location_id: selectedItem.location_id,
          area_id: selectedItem.area_id,
          title: `URGENT: ${task.title}`,
          description: task.description,
          type: task.task_type,
          due_date: todayStr,
          status: "Pending",
        }));
        const { error: taskError } = await supabase
          .from("tasks")
          .insert(tasksToInsert);
        if (taskError) throw taskError;
      }

      if (saveToJournal && selectedFile) {
        let uploadedImageUrl = null;
        const fileExt = selectedFile.name.split(".").pop() || "jpg";
        const fileName = `diagnosis-${sickInventoryId}-${Date.now()}.${fileExt}`;
        const filePath = `plant-photos/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from("plant-images")
          .upload(filePath, selectedFile);

        if (!uploadError) {
          const {
            data: { publicUrl },
          } = supabase.storage.from("plant-images").getPublicUrl(filePath);
          uploadedImageUrl = publicUrl;
        }

        let journalBody = `🩺 Initial Diagnosis:\n${aiResult.notes}\n\n`;
        if (selectedDisease)
          journalBody += `🦠 Suspected Condition: ${selectedDisease}\n\n`;
        journalBody += `💊 Applied Treatment Plan:\n`;
        aiResult.remedial_schedules.forEach((task) => {
          journalBody += `- ${task.title}\n`;
        });

        const { error: journalError } = await supabase
          .from("plant_journals")
          .insert([
            {
              home_id: homeId,
              inventory_item_id: sickInventoryId,
              subject: `Diagnostic Report: ${selectedDisease || "General Checkup"}`,
              description: journalBody,
              image_url: uploadedImageUrl,
            },
          ]);

        if (journalError)
          console.error("Failed to save journal:", journalError);
        else toast.success("Saved to Plant Journal!");
      }

      toast.success(
        "Treatment scheduled! Tasks have been added to your to-do list.",
      );
      clearImage();
      setTimeout(() => {
        if (onTasksAdded) onTasksAdded();
      }, 600);
    } catch (error: any) {
      Logger.error("Failed to apply treatment plan", error);
      toast.error("Failed to schedule treatment.");
    } finally {
      setIsApplyingTreatment(false);
    }
  };

  const filteredInventory = myInventory.filter((p) =>
    p.plants?.common_name?.toLowerCase().includes(plantSearch.toLowerCase()),
  );

  if (showManualAdd && aiResult?.plantData) {
    return (
      <div className="max-w-4xl mx-auto h-full animate-in fade-in slide-in-from-bottom-4">
        <div className="bg-white rounded-[2.5rem] p-6 shadow-sm border border-rhozly-outline/10 h-full overflow-y-auto">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-black">
              Verify Details for {selectedPlantName}
            </h2>
            <button
              onClick={() => setShowManualAdd(false)}
              className="p-2 hover:bg-rhozly-surface-low rounded-xl"
            >
              <X size={24} />
            </button>
          </div>
          <ManualPlantCreation
            initialData={aiResult.plantData}
            onSave={handleSaveManualPlant}
            onCancel={() => setShowManualAdd(false)}
            isSaving={isProcessing}
          />
        </div>
      </div>
    );
  }

  const isUIBusy =
    isProcessing ||
    isGeneratingGuide ||
    isFetchingDetails ||
    isGeneratingTreatment ||
    isApplyingTreatment;

  return (
    <>
      {showPerenualSearch && selectedPlantName && (
        <PlantSearchModal
          homeId={homeId}
          isPremium={isPremium}
          initialSearchTerm={selectedPlantName}
          onClose={() => setShowPerenualSearch(false)}
          onSuccess={() => {
            setShowPerenualSearch(false);
            clearImage();
          }}
        />
      )}

      <div className="max-w-4xl mx-auto h-full flex flex-col relative animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="mb-6 px-2">
          <h2 className="text-2xl sm:text-3xl font-black font-display text-rhozly-on-surface tracking-tight flex items-center gap-3">
            <Stethoscope className="w-8 h-8 text-rhozly-primary" />
            Plant Doctor
          </h2>
          <p className="text-xs sm:text-sm font-bold text-rhozly-on-surface/40 uppercase tracking-widest mt-1">
            AI-Powered Identification & Diagnosis
          </p>
        </div>

        <div className="bg-rhozly-surface-lowest/80 backdrop-blur-md rounded-[2.5rem] p-6 md:p-8 border border-rhozly-outline/10 shadow-sm flex-1">
          {!imagePreview ? (
            <div className="flex flex-col items-center justify-center p-8 sm:p-12 border-2 border-dashed border-rhozly-primary/30 rounded-3xl bg-rhozly-primary/5 hover:bg-rhozly-primary/10 transition-colors h-full min-h-[400px]">
              <div className="w-20 h-20 bg-white shadow-sm text-rhozly-primary rounded-full flex items-center justify-center mb-6">
                <Upload className="w-10 h-10 opacity-80" />
              </div>
              <h3 className="text-xl font-black font-display text-rhozly-on-surface mb-2 text-center">
                Upload or take a photo
              </h3>
              <p className="text-sm font-bold text-rhozly-on-surface/50 text-center max-w-sm mb-8">
                Snap a clear picture of the plant, leaf, or affected area for
                the AI to analyze.
              </p>
              <div className="flex flex-wrap justify-center gap-4 w-full sm:w-auto">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3.5 bg-white border border-rhozly-outline/10 rounded-2xl shadow-sm text-rhozly-on-surface font-bold hover:bg-rhozly-primary/5 transition-colors"
                >
                  <Upload className="w-5 h-5 text-rhozly-primary" /> Upload File
                </button>
                <button
                  onClick={handleNativeCamera}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3.5 bg-rhozly-primary rounded-2xl shadow-md text-white font-bold hover:bg-rhozly-primary-container transition-colors"
                >
                  <CameraIcon className="w-5 h-5" /> Open Camera
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6 animate-in zoom-in-95 duration-300">
              <div className="relative rounded-[2rem] overflow-hidden border border-rhozly-outline/20 bg-rhozly-on-surface/5 flex justify-center max-h-[400px] shadow-inner">
                <img
                  src={imagePreview}
                  alt="Plant preview"
                  className="object-contain w-full h-full"
                />
                <button
                  onClick={clearImage}
                  disabled={isUIBusy}
                  className="absolute top-4 right-4 w-10 h-10 bg-white/90 backdrop-blur-sm rounded-xl text-rhozly-on-surface/60 hover:text-red-500 hover:bg-white flex items-center justify-center shadow-sm transition-colors disabled:opacity-50"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  onClick={() => handleAiAction("identify")}
                  disabled={isUIBusy || !aiEnabled}
                  className={`flex items-center justify-center gap-3 p-4 rounded-2xl font-black text-lg transition-all group ${activeAction === "identify" ? "bg-rhozly-primary text-white shadow-md scale-[1.02]" : "bg-white text-rhozly-primary border border-rhozly-primary/20 hover:bg-rhozly-primary/10 hover:border-rhozly-primary/40 disabled:opacity-50"}`}
                >
                  {isProcessing && activeAction === "identify" ? (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  ) : (
                    <Search className="w-6 h-6 group-hover:scale-110" />
                  )}{" "}
                  Identify Plant
                </button>
                <button
                  onClick={() => handleAiAction("diagnose")}
                  disabled={isUIBusy || !aiEnabled}
                  className={`flex items-center justify-center gap-3 p-4 rounded-2xl font-black text-lg transition-all group ${activeAction === "diagnose" ? "bg-rhozly-primary text-white shadow-md scale-[1.02]" : "bg-rhozly-primary text-white hover:bg-rhozly-primary-container disabled:opacity-50"}`}
                >
                  {isProcessing && activeAction === "diagnose" ? (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  ) : (
                    <Activity className="w-6 h-6 group-hover:scale-110" />
                  )}{" "}
                  Diagnose Health
                </button>
              </div>

              {aiResult && (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-4">
                  <div className="bg-white border border-rhozly-primary/20 rounded-3xl p-6 shadow-sm">
                    <div className="flex items-center gap-2 mb-3">
                      <Sparkles className="w-5 h-5 text-rhozly-primary" />
                      <h3 className="font-black text-lg text-rhozly-on-surface">
                        Doctor's Notes
                      </h3>
                    </div>
                    <div className="text-rhozly-on-surface/80 font-medium leading-relaxed whitespace-pre-wrap">
                      {aiResult.notes}
                    </div>
                  </div>

                  {aiResult.possible_names &&
                    aiResult.possible_names.length > 0 &&
                    !selectedPlantName &&
                    activeAction === "identify" && (
                      <div className="bg-rhozly-surface-low border border-rhozly-outline/10 rounded-3xl p-6 shadow-sm animate-in fade-in">
                        <h3 className="font-black text-rhozly-on-surface mb-4 flex items-center gap-2">
                          <CheckCircle2
                            className="text-rhozly-primary"
                            size={20}
                          />{" "}
                          Which of these looks correct?
                        </h3>
                        <div className="space-y-2">
                          {aiResult.possible_names.map((name, i) => (
                            <button
                              key={i}
                              onClick={() => setSelectedPlantName(name)}
                              className="w-full text-left p-4 bg-white rounded-2xl border border-rhozly-outline/10 font-bold hover:border-rhozly-primary/40 hover:bg-rhozly-primary/5 transition-all text-rhozly-on-surface"
                            >
                              {name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                  {selectedPlantName && activeAction === "identify" && (
                    <div className="bg-rhozly-primary/5 border border-rhozly-primary/20 rounded-3xl p-6 shadow-sm animate-in zoom-in-95">
                      <h3 className="font-black text-rhozly-on-surface mb-2">
                        Save {selectedPlantName}
                      </h3>
                      <div className="flex flex-col sm:flex-row gap-3 mt-4">
                        <button
                          onClick={() =>
                            perenualEnabled
                              ? setShowPerenualSearch(true)
                              : toast.error(
                                  "Perenual API access is required. Please enable it in your profile settings.",
                                )
                          }
                          disabled={isUIBusy}
                          className={`flex-1 flex items-center justify-center gap-2 py-4 px-4 border rounded-xl font-black shadow-sm transition-colors disabled:opacity-50 ${perenualEnabled ? "bg-white border-rhozly-outline/20 text-rhozly-primary hover:bg-rhozly-primary/5" : "bg-gray-50 border-gray-200 text-gray-400"}`}
                        >
                          {!perenualEnabled ? (
                            <Lock size={18} />
                          ) : (
                            <Database size={18} />
                          )}
                          Search Global API
                        </button>

                        <button
                          onClick={generateManualCareGuide}
                          disabled={isUIBusy}
                          className="flex-1 flex items-center justify-center gap-2 py-4 px-4 bg-rhozly-primary text-white rounded-xl font-black shadow-sm hover:bg-rhozly-primary-container transition-colors disabled:opacity-50"
                        >
                          {isGeneratingGuide ? (
                            <>
                              <Loader2 size={18} className="animate-spin" />{" "}
                              Drafting...
                            </>
                          ) : (
                            <>
                              <Edit3 size={18} /> AI Auto-Fill Form
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {activeAction === "diagnose" &&
                    aiResult.possible_diseases &&
                    aiResult.possible_diseases.length > 0 &&
                    !selectedDisease && (
                      <div className="bg-amber-500/10 border border-amber-500/30 rounded-3xl p-6 shadow-sm animate-in zoom-in-95">
                        <h3 className="font-black text-amber-900 mb-4 flex items-center gap-2">
                          <Activity size={20} /> Which condition fits best?
                        </h3>
                        <div className="space-y-2">
                          {aiResult.possible_diseases.map((name, i) => (
                            <button
                              key={i}
                              onClick={() => setSelectedDisease(name)}
                              className="w-full text-left p-4 bg-white rounded-2xl border border-amber-500/20 font-bold hover:border-amber-500/50 hover:bg-amber-50 transition-all text-amber-900"
                            >
                              {name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                  {activeAction === "diagnose" &&
                    selectedDisease &&
                    !aiResult.diseaseInfo &&
                    !aiResult.remedial_schedules && (
                      <div className="bg-amber-500/10 border border-amber-500/30 rounded-3xl p-6 shadow-sm animate-in zoom-in-95">
                        <div className="flex items-center gap-2 mb-2">
                          <Activity className="text-amber-600" size={20} />
                          <h3 className="font-black text-lg text-amber-900">
                            Detected: {selectedDisease}
                          </h3>
                        </div>
                        <p className="text-sm font-bold text-amber-800/70 mb-4">
                          How would you like to build your treatment plan?
                        </p>

                        <div className="flex flex-col sm:flex-row gap-3">
                          <button
                            onClick={() =>
                              perenualEnabled
                                ? fetchDetailedInfo("api")
                                : toast.error(
                                    "Perenual API access is required. Please enable it in your profile settings.",
                                  )
                            }
                            disabled={isUIBusy}
                            className={`flex-1 flex items-center justify-center gap-2 py-4 border rounded-xl font-black shadow-sm transition-colors disabled:opacity-50 ${perenualEnabled ? "bg-white border-amber-500/20 text-amber-700 hover:bg-amber-50" : "bg-gray-50 border-gray-200 text-gray-400"}`}
                          >
                            {isFetchingDetails && perenualEnabled ? (
                              <Loader2 size={18} className="animate-spin" />
                            ) : !perenualEnabled ? (
                              <Lock size={18} />
                            ) : (
                              <Globe size={18} />
                            )}
                            Search Global API
                          </button>

                          <button
                            onClick={() => fetchDetailedInfo("ai")}
                            disabled={isUIBusy}
                            className="flex-1 flex items-center justify-center gap-2 py-4 bg-amber-500 text-white rounded-xl font-black shadow-sm hover:bg-amber-600 transition-colors disabled:opacity-50"
                          >
                            {isFetchingDetails && !perenualEnabled ? (
                              <Loader2 size={18} className="animate-spin" />
                            ) : (
                              <BrainCircuit size={18} />
                            )}{" "}
                            Get AI Feedback
                          </button>
                        </div>
                      </div>
                    )}

                  {activeAction === "diagnose" &&
                    (aiResult.diseaseInfo ||
                      ((!aiResult.possible_diseases ||
                        aiResult.possible_diseases.length === 0) &&
                        aiResult.notes)) &&
                    !aiResult.remedial_schedules && (
                      <div className="bg-white border border-rhozly-outline/10 rounded-3xl p-6 shadow-sm animate-in zoom-in-95">
                        {aiResult.diseaseInfo && (
                          <div className="mb-6 space-y-4">
                            <div>
                              <h4 className="font-black text-sm text-rhozly-primary mb-1 uppercase tracking-widest flex items-center gap-2">
                                {aiResult.diseaseInfo.source === "api" ? (
                                  <Globe size={14} />
                                ) : (
                                  <BrainCircuit size={14} />
                                )}
                                Description (
                                {aiResult.diseaseInfo.source.toUpperCase()})
                              </h4>
                              <p className="text-sm text-rhozly-on-surface/80">
                                {aiResult.diseaseInfo.description}
                              </p>
                            </div>
                            <div>
                              <h4 className="font-black text-sm text-rhozly-primary mb-1 uppercase tracking-widest flex items-center gap-2">
                                <Stethoscope size={14} /> Recommended Solution
                              </h4>
                              <p className="text-sm text-rhozly-on-surface/80">
                                {aiResult.diseaseInfo.solution}
                              </p>
                            </div>
                          </div>
                        )}

                        <div className="space-y-3 pt-4 border-t border-rhozly-outline/10">
                          <label className="block text-xs font-black text-rhozly-primary/60 uppercase tracking-widest">
                            Select Patient to Treat
                          </label>
                          <select
                            value={sickInventoryId || ""}
                            onChange={(e) => setSickInventoryId(e.target.value)}
                            disabled={isUIBusy || myInventory.length === 0}
                            className="w-full p-4 bg-rhozly-surface-low rounded-xl border border-transparent focus:border-rhozly-primary font-bold text-sm outline-none transition-colors disabled:opacity-50"
                          >
                            <option value="">
                              Select a specific planted item from your shed...
                            </option>
                            {myInventory.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.plants?.common_name
                                  ? `${item.plants.common_name} (ID: ${item.id.slice(0, 4)})`
                                  : "Unknown Plant"}
                              </option>
                            ))}
                          </select>

                          <button
                            onClick={generateTreatmentPlan}
                            disabled={!sickInventoryId || isGeneratingTreatment}
                            className="w-full py-4 bg-rhozly-primary text-white rounded-xl font-black shadow-md hover:bg-rhozly-primary-container transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                          >
                            {isGeneratingTreatment ? (
                              <>
                                <Loader2 size={18} className="animate-spin" />{" "}
                                Drafting Plan...
                              </>
                            ) : (
                              <>
                                <CalendarPlus size={18} /> Generate Treatment
                                Plan
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    )}

                  {aiResult.remedial_schedules &&
                    aiResult.remedial_schedules.length > 0 &&
                    activeAction === "diagnose" && (
                      <div className="bg-amber-500/5 border border-amber-500/20 rounded-3xl p-6 shadow-sm animate-in zoom-in-95">
                        <div className="flex items-center gap-2 mb-2 text-amber-600">
                          <Syringe size={20} />
                          <h3 className="font-black text-lg">
                            Proposed Treatment Plan
                          </h3>
                        </div>

                        <div className="space-y-2 mb-6 mt-4">
                          {aiResult.remedial_schedules.map((schedule, idx) => (
                            <div
                              key={idx}
                              className="bg-white p-3 rounded-xl border border-amber-500/10 flex items-start gap-3"
                            >
                              <ClipboardList
                                className="text-amber-500 shrink-0 mt-0.5"
                                size={16}
                              />
                              <div>
                                <p className="font-bold text-sm text-rhozly-on-surface leading-tight">
                                  {schedule.title}
                                </p>
                                <p className="text-xs text-rhozly-on-surface/60 font-medium">
                                  {schedule.description}
                                </p>
                                {schedule.is_recurring && (
                                  <span className="inline-block mt-1 text-[9px] font-black uppercase tracking-widest text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md">
                                    Every {schedule.frequency_days} Days
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>

                        <label className="flex items-center gap-3 p-4 mb-6 bg-white rounded-2xl border border-rhozly-outline/10 cursor-pointer hover:border-amber-500/30 transition-colors shadow-sm">
                          <input
                            type="checkbox"
                            checked={saveToJournal}
                            onChange={(e) => setSaveToJournal(e.target.checked)}
                            className="w-5 h-5 accent-amber-500"
                          />
                          <div>
                            <p className="font-black text-sm flex items-center gap-1">
                              <BookOpen size={14} className="text-amber-500" />{" "}
                              Add to Plant Journal?
                            </p>
                            <p className="text-[10px] font-bold text-rhozly-on-surface/50 mt-0.5">
                              This will attach the photo, diagnosis, and
                              treatment plan to the plant's history.
                            </p>
                          </div>
                        </label>

                        <button
                          onClick={handleApplyTreatment}
                          disabled={isApplyingTreatment}
                          className="w-full py-4 bg-amber-500 text-white rounded-xl font-black shadow-md hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                          {isApplyingTreatment ? (
                            <>
                              <Loader2 size={18} className="animate-spin" />{" "}
                              Scheduling...
                            </>
                          ) : (
                            "Approve & Add to Tasks"
                          )}
                        </button>
                      </div>
                    )}
                </div>
              )}

              {!aiResult && (
                <div
                  className="pt-4 border-t border-rhozly-outline/10 relative"
                  ref={dropdownRef}
                >
                  <label className="block text-[10px] font-black text-rhozly-on-surface/40 uppercase tracking-widest mb-2 ml-2">
                    Context: What do you think this is? (Optional)
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={plantSearch}
                      disabled={isUIBusy || !aiEnabled}
                      onChange={(e) => {
                        setPlantSearch(e.target.value);
                        setIsDropdownOpen(true);
                      }}
                      onFocus={() => setIsDropdownOpen(true)}
                      className="w-full bg-white border border-rhozly-outline/20 rounded-2xl px-5 py-4 text-rhozly-on-surface font-bold focus:outline-none focus:ring-2 focus:ring-rhozly-primary/30 focus:border-rhozly-primary/50 transition-all disabled:opacity-50 disabled:bg-rhozly-surface-low pr-12"
                      placeholder="Type a name or select from your shed..."
                    />
                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-rhozly-on-surface/30" />
                  </div>
                  {isDropdownOpen &&
                    (myInventory.length > 0 || plantSearch) && (
                      <div className="absolute z-10 w-full mt-2 bg-white border border-rhozly-outline/10 rounded-2xl shadow-xl max-h-60 overflow-y-auto overflow-x-hidden p-2">
                        {filteredInventory.length > 0 ? (
                          filteredInventory.map((item) => (
                            <button
                              key={item.id}
                              onClick={() => {
                                setPlantSearch(item.plants?.common_name || "");
                                setIsDropdownOpen(false);
                              }}
                              className="w-full text-left px-4 py-3 hover:bg-rhozly-primary/5 rounded-xl text-sm font-bold text-rhozly-on-surface transition-colors"
                            >
                              {item.plants?.common_name}
                            </button>
                          ))
                        ) : (
                          <div className="px-4 py-3 text-sm font-bold text-rhozly-on-surface/50">
                            Press 'Identify' and let the AI tell you!
                          </div>
                        )}
                      </div>
                    )}
                </div>
              )}
            </div>
          )}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileChange}
          />
        </div>
      </div>
    </>
  );
}
