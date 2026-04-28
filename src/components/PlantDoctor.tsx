import React, { useState, useRef, useEffect } from "react";
import {
  getHemisphere,
  normalizePeriods,
} from "../lib/seasonal";
import { buildAutoSeasonalSchedules } from "../lib/plantScheduleFactory";
import {
  Camera as CameraIcon,
  Upload,
  X,
  Search,
  Activity,
  Stethoscope,
  Loader2,
  ChevronDown,
  ChevronLeft,
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
import DiagnosisImageGallery from "./DiagnosisImageGallery";
import PlantInstancePicker from "./PlantInstancePicker";

// 🧠 IMPORT THE AI CONTEXT
import { usePlantDoctor } from "../context/PlantDoctorContext";
import {
  PlantDoctorService,
  type DiseaseInfo,
} from "../services/plantDoctorService";

interface PlantDoctorProps {
  homeId: string;
  aiEnabled: boolean;
  isPremium: boolean;
  perenualEnabled: boolean;
  onTasksAdded?: () => void;
}


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
  const [treatmentApplied, setTreatmentApplied] = useState(false);

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

      // inventory_items stores plant_name, area_name, location_name as denormalized
      // text columns — no FK joins needed or available.
      const { data, error } = await supabase
        .from("inventory_items")
        .select(`id, plant_id, plant_name, location_id, location_name, area_id, area_name`)
        .eq("home_id", homeId)
        .eq("status", "Planted");

      if (error) {
        toast.error("Could not load your shed — please refresh and try again.");
        return;
      }
      if (!data) return;

      // Map flat columns to the nested shape PlantInstancePicker and the rest of
      // this component expect (plants.common_name, areas.name, areas.locations.name).
      const enriched = data.map((item: any) => ({
        ...item,
        plants: { common_name: item.plant_name ?? null },
        areas: item.area_name
          ? { name: item.area_name, locations: item.location_name ? { name: item.location_name } : null }
          : null,
      }));

      setMyInventory(enriched);
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
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsDropdownOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
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
    setTreatmentApplied(false);
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
      const sickPlantName = sickInventoryId
        ? myInventory.find((i) => i.id === sickInventoryId)?.plants?.common_name
        : undefined;
      const data = await PlantDoctorService.analyzeImage({
        homeId,
        imageBase64: base64Data,
        mimeType: "image/jpeg",
        action: action === "identify" ? "identify_vision" : "diagnose",
        plantSearch,
        targetPlant: action === "diagnose" ? (sickPlantName ?? undefined) : undefined,
      });

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
      const data = await PlantDoctorService.fetchDiseaseDetails({
        type,
        diseaseName: selectedDisease,
        notes: aiResult?.notes,
      });

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
      const data = await PlantDoctorService.generateCareGuide(selectedPlantName, homeId);

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
      const data = await PlantDoctorService.generateRemedialPlan({
        homeId,
        diagnosisContext: contextToUse,
        targetPlant: plantName,
      });

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

      const newSchedules = buildAutoSeasonalSchedules({
        plantId: savedPlant.id,
        homeId,
        hemisphere,
        harvestPeriods: normalizePeriods(plantData.harvest_season),
        pruningPeriods: normalizePeriods(plantData.pruning_month),
        wateringMinDays: plantData.watering_min_days || 3,
        wateringMaxDays: plantData.watering_max_days || 14,
      });

      if (newSchedules.length > 0) {
        await supabase.from("plant_schedules").insert(newSchedules);
      }

      toast.success("Plant added to your shed with automations!");
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
      const selectedItem = myInventory.find((item) => item.id === sickInventoryId);
      if (!selectedItem) throw new Error("Plant instance not found.");

      await PlantDoctorService.applyTreatmentPlan({
        homeId,
        sickInventoryId,
        selectedItem,
        remedialSchedules: aiResult.remedial_schedules,
        selectedDisease,
        notes: aiResult.notes,
        imageFile: saveToJournal ? selectedFile : null,
      });

      toast.success("Treatment scheduled! Tasks have been added to your to-do list.");
      setTreatmentApplied(true);
      setTimeout(() => {
        setTreatmentApplied(false);
        clearImage();
        if (onTasksAdded) onTasksAdded();
      }, 2200);
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
              className="w-11 h-11 flex items-center justify-center hover:bg-rhozly-surface-low rounded-xl"
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
                  className="absolute top-4 right-4 w-11 h-11 bg-white/90 backdrop-blur-sm rounded-xl text-rhozly-on-surface/60 hover:text-red-500 hover:bg-white flex items-center justify-center shadow-sm transition-colors disabled:opacity-50"
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
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-black text-rhozly-on-surface">
                          Save {selectedPlantName}
                        </h3>
                        <button
                          onClick={() => setSelectedPlantName(null)}
                          className="flex items-center gap-1 text-xs font-black text-rhozly-on-surface/40 hover:text-rhozly-primary transition-colors"
                        >
                          <ChevronLeft size={14} /> Change
                        </button>
                      </div>
                      <DiagnosisImageGallery
                        query={`${selectedPlantName} plant`}
                        label={selectedPlantName}
                      />
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
                      <div className="bg-rhozly-primary-container/10 border border-rhozly-primary-container/30 rounded-3xl p-6 shadow-sm animate-in zoom-in-95">
                        <h3 className="font-black text-rhozly-on-surface mb-4 flex items-center gap-2">
                          <Activity size={20} /> Which condition fits best?
                        </h3>
                        <div className="space-y-2">
                          {aiResult.possible_diseases.map((name, i) => (
                            <button
                              key={i}
                              onClick={() => setSelectedDisease(name)}
                              className="w-full text-left p-4 bg-white rounded-2xl border border-rhozly-primary-container/20 font-bold hover:border-rhozly-primary-container/50 hover:bg-rhozly-primary-container/10 transition-all text-rhozly-on-surface"
                            >
                              {name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                  {activeAction === "diagnose" && selectedDisease && (
                    <DiagnosisImageGallery
                      query={`${selectedDisease} plant disease`}
                      label={selectedDisease}
                    />
                  )}

                  {activeAction === "diagnose" &&
                    selectedDisease &&
                    !aiResult.diseaseInfo &&
                    !aiResult.remedial_schedules && (
                      <div className="bg-rhozly-primary-container/10 border border-rhozly-primary-container/30 rounded-3xl p-6 shadow-sm animate-in zoom-in-95">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Activity className="text-rhozly-primary" size={20} />
                            <h3 className="font-black text-lg text-rhozly-on-surface">
                              Detected: {selectedDisease}
                            </h3>
                          </div>
                          <button
                            onClick={() => {
                              setSelectedDisease(null);
                              setAiResult((prev) =>
                                prev ? { ...prev, diseaseInfo: undefined, remedial_schedules: undefined } : null,
                              );
                            }}
                            className="flex items-center gap-1 text-xs font-black text-rhozly-on-surface/40 hover:text-rhozly-on-surface transition-colors"
                          >
                            <ChevronLeft size={14} /> Change
                          </button>
                        </div>
                        <p className="text-sm font-bold text-rhozly-on-surface/70 mb-4">
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
                            className={`flex-1 flex items-center justify-center gap-2 py-4 border rounded-xl font-black shadow-sm transition-colors disabled:opacity-50 ${perenualEnabled ? "bg-white border-rhozly-primary-container/20 text-rhozly-primary hover:bg-rhozly-primary-container/10" : "bg-gray-50 border-gray-200 text-gray-400"}`}
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
                            className="flex-1 flex items-center justify-center gap-2 py-4 bg-rhozly-primary text-white rounded-xl font-black shadow-sm hover:bg-rhozly-primary-container transition-colors disabled:opacity-50"
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
                        {aiResult.diseaseInfo && selectedDisease && (
                          <div className="flex items-center justify-between mb-4">
                            <p className="text-xs font-black text-rhozly-primary uppercase tracking-widest flex items-center gap-1">
                              <Activity size={12} /> {selectedDisease}
                            </p>
                            <button
                              onClick={() => {
                                setSelectedDisease(null);
                                setAiResult((prev) =>
                                  prev ? { ...prev, diseaseInfo: undefined, remedial_schedules: undefined } : null,
                                );
                              }}
                              className="flex items-center gap-1 text-xs font-black text-rhozly-on-surface/40 hover:text-rhozly-primary transition-colors"
                            >
                              <ChevronLeft size={14} /> Change condition
                            </button>
                          </div>
                        )}
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
                          <PlantInstancePicker
                            items={myInventory}
                            selectedId={sickInventoryId}
                            onSelect={setSickInventoryId}
                            placeholder="Select a specific planted item from your shed..."
                          />

                          <button
                            onClick={generateTreatmentPlan}
                            disabled={!sickInventoryId || isGeneratingTreatment}
                            className="w-full py-5 bg-rhozly-primary text-white rounded-xl font-black text-lg shadow-lg hover:bg-rhozly-primary-container transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
                      <div className="bg-rhozly-primary-container/5 border border-rhozly-primary-container/20 rounded-3xl p-6 shadow-sm animate-in zoom-in-95">
                        <div className="flex items-center gap-2 mb-2 text-rhozly-primary">
                          <Syringe size={20} />
                          <h3 className="font-black text-lg">
                            Proposed Treatment Plan
                          </h3>
                        </div>

                        <div className="space-y-2 mb-6 mt-4">
                          {aiResult.remedial_schedules.map((schedule, idx) => (
                            <div
                              key={idx}
                              className="bg-white p-3 rounded-xl border border-rhozly-primary-container/10 flex items-start gap-3"
                            >
                              <ClipboardList
                                className="text-rhozly-tertiary shrink-0 mt-0.5"
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
                                  <span className="inline-block mt-1 text-[9px] font-black uppercase tracking-widest text-rhozly-primary bg-rhozly-primary-container/10 px-2 py-0.5 rounded-md">
                                    Every {schedule.frequency_days} Days
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>

                        <label className="flex items-center gap-3 p-4 mb-6 bg-white rounded-2xl border border-rhozly-outline/10 cursor-pointer hover:border-rhozly-primary-container/30 transition-colors shadow-sm">
                          <input
                            type="checkbox"
                            checked={saveToJournal}
                            onChange={(e) => setSaveToJournal(e.target.checked)}
                            className="w-5 h-5 accent-rhozly-primary"
                          />
                          <div>
                            <p className="font-black text-sm flex items-center gap-1">
                              <BookOpen size={14} className="text-rhozly-tertiary" />{" "}
                              Add to Plant Journal?
                            </p>
                            <p className="text-[10px] font-bold text-rhozly-on-surface/50 mt-0.5">
                              This will attach the photo, diagnosis, and
                              treatment plan to the plant's history.
                            </p>
                          </div>
                        </label>

                        {treatmentApplied ? (
                          <div className="w-full py-4 bg-rhozly-primary/10 border border-rhozly-primary/30 text-rhozly-primary rounded-xl font-black shadow-sm flex items-center justify-center gap-2 animate-in zoom-in-95">
                            <CheckCircle2 size={20} />
                            Treatment scheduled — tasks added to your list!
                          </div>
                        ) : (
                          <button
                            onClick={handleApplyTreatment}
                            disabled={isApplyingTreatment}
                            className="w-full py-4 bg-rhozly-primary text-white rounded-xl font-black shadow-md hover:bg-rhozly-primary-container transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
                        )}
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
