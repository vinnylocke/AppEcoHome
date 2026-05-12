import React, { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
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
  Loader2,
  ChevronDown,
  ChevronLeft,
  Lock,
  CheckCircle2,
  ClipboardList,
  ListPlus,
  Syringe,
  CalendarPlus,
  Globe,
  BrainCircuit,
  ShieldCheck,
} from "lucide-react";
import { IconDoctor, IconPlantDB, IconPest, IconAI, IconPlant, IconGuides, IconShopping } from "../constants/icons";
import { toast } from "react-hot-toast";
import { Logger } from "../lib/errorHandler";
import { supabase } from "../lib/supabase";
import { EVENT, logEvent } from "../events/registry";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";

import DiagnosisImageGallery from "./DiagnosisImageGallery";
import PlantInstancePicker from "./PlantInstancePicker";
import AddToListSheet, { type SuggestedItem } from "./shopping/AddToListSheet";
import type { ShoppingList } from "../types/shopping";
import PlantDoctorHistory from "./PlantDoctorHistory";
import { usePlantDoctorSessions } from "../hooks/usePlantDoctorSessions";

// 🧠 IMPORT THE AI CONTEXT
import { usePlantDoctor } from "../context/PlantDoctorContext";
import {
  PlantDoctorService,
  type DiseaseInfo,
  type VisionResult,
} from "../services/plantDoctorService";

interface PlantDoctorProps {
  homeId: string;
  userId?: string;
  aiEnabled: boolean;
  isPremium: boolean;
  perenualEnabled: boolean;
  onTasksAdded?: () => void;
}


export default function PlantDoctor({
  homeId,
  userId,
  aiEnabled,
  isPremium,
  perenualEnabled,
  onTasksAdded,
}: PlantDoctorProps) {
  const { setPageContext } = usePlantDoctor();
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<"analyse" | "history">("analyse");
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [confirmedValue, setConfirmedValue] = useState<string | null>(null);
  const { sessions, isLoading: historyLoading, load: loadHistory, confirmSession } =
    usePlantDoctorSessions(userId ?? null);

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [isFetchingDetails, setIsFetchingDetails] = useState(false);
  const [isGeneratingTreatment, setIsGeneratingTreatment] = useState(false);
  const [activeAction, setActiveAction] = useState<
    "identify" | "diagnose" | "pest" | null
  >(null);

  const [myInventory, setMyInventory] = useState<any[]>([]);
  const [plantSearch, setPlantSearch] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const [aiResult, setAiResult] = useState<VisionResult | null>(null);

  const [selectedPlantName, setSelectedPlantName] = useState<string | null>(null);
  const [selectedPlantScientific, setSelectedPlantScientific] = useState<string | null>(null);
  const [selectedDisease, setSelectedDisease] = useState<string | null>(null);
  const [selectedPest, setSelectedPest] = useState<string | null>(null);
  const [isFetchingPestDetails, setIsFetchingPestDetails] = useState(false);
  const [sickInventoryId, setSickInventoryId] = useState<string | null>(null);
  const [isApplyingTreatment, setIsApplyingTreatment] = useState(false);
  const [treatmentApplied, setTreatmentApplied] = useState(false);
  const [showAddToList, setShowAddToList] = useState(false);
  const [addToListItems, setAddToListItems] = useState<SuggestedItem[]>([]);
  const [addToListActiveLists, setAddToListActiveLists] = useState<ShoppingList[]>([]);

  const [saveToJournal, setSaveToJournal] = useState(true);
  const [deviceLocation, setDeviceLocation] = useState<{ lat: number; lng: number } | null>(null);

  const [inventoryError, setInventoryError] = useState(false);
  const [inventoryRetryTick, setInventoryRetryTick] = useState(0);
  const [sessionSaveError, setSessionSaveError] = useState(false);

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
              suggestedPlants: aiResult.possible_names?.map((n) => n.name),
              suggestedDiseases: aiResult.possible_diseases?.map((d) => d.name),
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
      setInventoryError(false);

      // inventory_items stores plant_name, area_name, location_name as denormalized
      // text columns — no FK joins needed or available.
      const { data, error } = await supabase
        .from("inventory_items")
        .select(`id, plant_id, plant_name, location_id, location_name, area_id, area_name`)
        .eq("home_id", homeId)
        .eq("status", "Planted");

      if (error) {
        Logger.error("Failed to fetch inventory", error, { homeId });
        setInventoryError(true);
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
  }, [homeId, inventoryRetryTick]);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setDeviceLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { timeout: 5000, maximumAge: 300_000 },
    );
  }, []);

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
        setSelectedPlantScientific(null);
        setSelectedDisease(null);
        setSickInventoryId(null);
        setSaveToJournal(true);
      }
    } catch (error: any) {
      const msg: string = error?.message ?? "";
      if (
        msg.toLowerCase().includes("denied") ||
        msg.toLowerCase().includes("permission") ||
        msg.toLowerCase().includes("notallowed")
      ) {
        toast.error("Camera access denied — please enable it in your device settings");
      } else {
        toast.error("Camera unavailable — please try uploading a photo instead");
      }
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
      setSelectedPlantScientific(null);
      setSelectedDisease(null);
      setSickInventoryId(null);
      setSaveToJournal(true);
    } catch (error: any) {
      Logger.error("Failed to load image file", error, {}, "Failed to load image.");
    }
  };

  const clearImage = () => {
    setImagePreview(null);
    setSelectedFile(null);
    setPlantSearch("");
    setActiveAction(null);
    setAiResult(null);
    setSelectedPlantName(null);
    setSelectedPlantScientific(null);
    setSelectedDisease(null);
    setSelectedPest(null);
    setSickInventoryId(null);
    setTreatmentApplied(false);
    setCurrentSessionId(null);
    setConfirmedValue(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const saveSession = async (
    action: "identify" | "diagnose" | "pest",
    result: typeof aiResult,
    base64: string,
  ) => {
    if (!userId || !result) return;
    setSessionSaveError(false);
    try {
      const sessionId = crypto.randomUUID();
      const path = `${userId}/${sessionId}.jpg`;
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "image/jpeg" });
      await supabase.storage.from("doctor-sessions").upload(path, blob);
      const { data } = await supabase
        .from("plant_doctor_sessions")
        .insert({
          user_id: userId,
          home_id: homeId,
          action,
          image_path: path,
          results: {
            notes: result.notes,
            possible_names: result.possible_names,
            possible_diseases: result.possible_diseases,
            possible_pests: result.possible_pests,
          },
        })
        .select("id")
        .single();
      if (data) setCurrentSessionId(data.id);
    } catch (err) {
      setSessionSaveError(true);
      Logger.error("Failed to save doctor session", err, { action }, "Session could not be saved — results won't appear in History.");
    }
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
        if (!ctx) return reject(new Error("Could not get canvas context"));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.7).split(",")[1]);
      };
      img.onerror = reject;
    });
  };

  const openAddToListSheet = async (items: SuggestedItem[]) => {
    try {
      const { data, error } = await supabase
        .from("shopping_lists")
        .select("id, name, status, home_id, created_at, updated_at")
        .eq("home_id", homeId)
        .eq("status", "active")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setAddToListActiveLists(data ?? []);
    } catch {
      setAddToListActiveLists([]);
      toast.error("Could not load shopping lists.");
    }
    setAddToListItems(items);
    setShowAddToList(true);
  };

  const handleAddToListConfirm = async (listId: string, items: SuggestedItem[]) => {
    try {
      for (const item of items) {
        const { error } = await supabase.from("shopping_list_items").insert({
          list_id: listId,
          home_id: homeId,
          item_type: item.item_type,
          name: item.name,
          is_checked: false,
          category: item.category ?? null,
          doctor_session_id: "plant-doctor",
        });
        if (error) throw error;
      }
    } catch {
      toast.error("Some items could not be added to the list.");
    }
  };

  const handleCreateAndAddToList = async (listName: string, items: SuggestedItem[]) => {
    try {
      const { data: newList, error } = await supabase
        .from("shopping_lists")
        .insert({ home_id: homeId, name: listName })
        .select()
        .single();
      if (error) throw error;
      if (newList) await handleAddToListConfirm(newList.id, items);
    } catch {
      toast.error("Could not create shopping list.");
    }
  };

  const handleAiAction = async (action: "identify" | "diagnose" | "pest") => {
    if (!aiEnabled) return toast.error("AI features are disabled.");
    if (!selectedFile) return toast.error("Upload an image first.");

    setIsProcessing(true);
    setActiveAction(action);
    setAiResult(null);
    setSelectedPlantName(null);
    setSelectedPlantScientific(null);
    setSelectedDisease(null);
    setSelectedPest(null);
    setSickInventoryId(null);

    try {
      const base64Data = await compressImage(selectedFile);
      const sickPlantName = sickInventoryId
        ? myInventory.find((i) => i.id === sickInventoryId)?.plants?.common_name
        : undefined;
      const apiAction = action === "identify" ? "identify_vision" : action === "diagnose" ? "diagnose" : "identify_pest";
      const sickItem = sickInventoryId ? myInventory.find((i) => i.id === sickInventoryId) : null;
      const data = await PlantDoctorService.analyzeImage({
        homeId,
        imageBase64: base64Data,
        mimeType: "image/jpeg",
        action: apiAction,
        plantSearch: action !== "pest" ? plantSearch : undefined,
        targetPlant: action === "diagnose" ? (sickPlantName ?? undefined) : undefined,
        inventoryItemId: action === "diagnose" ? (sickInventoryId ?? undefined) : undefined,
        areaId: action === "diagnose" ? (sickItem?.area_id ?? undefined) : undefined,
        deviceLat: deviceLocation?.lat,
        deviceLng: deviceLocation?.lng,
      });

      setAiResult(data);
      saveSession(action, data, base64Data); // fire-and-forget
      if (action === "identify") {
        logEvent(EVENT.AI_IDENTIFY, { plant_name: data?.possible_names?.[0]?.name ?? null });
      } else if (action === "diagnose") {
        logEvent(EVENT.AI_DIAGNOSE, { diagnosis: data?.possible_diseases?.[0]?.name ?? null });
      } else {
        logEvent(EVENT.AI_IDENTIFY, { pest_name: data?.possible_pests?.[0]?.name ?? null });
      }
      toast.success(action === "diagnose" ? "Diagnosis complete!" : "Identification complete!");
    } catch (error: any) {
      Logger.error("Plant AI analysis failed", error, { homeId, action }, error.message || "Failed to analyze plant.");
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
      Logger.error("Failed to fetch disease details", err, { diseaseName: selectedDisease, type }, "Could not load disease details — please try again.");
    } finally {
      setIsFetchingDetails(false);
    }
  };

  const fetchPestDetails = async () => {
    if (!selectedPest) return;
    setIsFetchingPestDetails(true);
    try {
      const data = await PlantDoctorService.fetchPestDetails({
        pestName: selectedPest,
        notes: aiResult?.notes,
      });
      setAiResult((prev) => ({ ...prev, pestInfo: data.pestInfo }));
      toast.success("Pest details loaded.");
    } catch (err: any) {
      Logger.error("Failed to fetch pest details", err, { pestName: selectedPest }, "Could not load pest details — please try again.");
    } finally {
      setIsFetchingPestDetails(false);
    }
  };

  const generateTreatmentPlan = async () => {
    if (!sickInventoryId) return toast.error("Please select a patient first.");
    const selectedItem = myInventory.find(
      (item) => item.id === sickInventoryId,
    );
    const plantName = selectedItem?.plants?.common_name || "Unknown Plant";

    const contextToUse = aiResult?.pestInfo
      ? `${aiResult.pestInfo.treatment} Prevention: ${aiResult.pestInfo.prevention}`
      : aiResult?.diseaseInfo
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
      Logger.error("Failed to generate treatment plan", error, { homeId, sickInventoryId, selectedDisease }, "Failed to generate treatment plan.");
    } finally {
      setIsGeneratingTreatment(false);
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

      toast.success("Approved — tasks added to your schedule.");
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

  const isUIBusy =
    isProcessing ||
    isFetchingDetails ||
    isFetchingPestDetails ||
    isGeneratingTreatment ||
    isApplyingTreatment;

  return (
    <>
      <div className="h-full flex flex-col relative animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="mb-4 px-2 flex items-end justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black font-display text-rhozly-on-surface tracking-tight flex items-center gap-3">
              <IconDoctor className="w-8 h-8 text-rhozly-primary" />
              Plant Doctor
            </h1>
            <p className="text-xs sm:text-sm font-bold text-rhozly-on-surface/40 uppercase tracking-widest mt-1">
              AI-Powered Identification & Diagnosis
            </p>
          </div>
          <div className="flex gap-1 bg-rhozly-surface-low rounded-2xl p-1 shrink-0">
            {(["analyse", "history"] as const).map((tab) => (
              <button
                key={tab}
                data-testid={`doctor-tab-${tab}`}
                onClick={() => setActiveTab(tab)}
                className={`px-4 min-h-[44px] rounded-xl text-xs font-black uppercase tracking-widest transition-colors ${
                  activeTab === tab
                    ? "bg-white shadow-sm text-rhozly-primary"
                    : "text-rhozly-on-surface/40 hover:text-rhozly-on-surface"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {activeTab === "history" ? (
          <div className="bg-rhozly-surface-lowest/80 backdrop-blur-md rounded-3xl p-6 md:p-8 border border-rhozly-outline/10 shadow-sm flex-1 overflow-y-auto">
            <PlantDoctorHistory
              sessions={sessions}
              isLoading={historyLoading}
              onLoad={loadHistory}
            />
          </div>
        ) : null}

        <div className={`bg-rhozly-surface-lowest/80 backdrop-blur-md rounded-3xl p-6 md:p-8 border border-rhozly-outline/10 shadow-sm flex-1 ${activeTab !== "analyse" ? "hidden" : ""}`}>
          {/* Step progress */}
          <div className="flex items-center gap-2 mb-6">
            {[
              { n: 1, label: "Upload" },
              { n: 2, label: "Analyse" },
              { n: 3, label: "Results" },
            ].map((step, i) => {
              const done = step.n === 1 ? !!imagePreview : step.n === 2 ? !!aiResult : !!aiResult;
              const active = step.n === 1 ? !imagePreview : step.n === 2 ? !!imagePreview && !aiResult : !!aiResult;
              return (
                <React.Fragment key={step.n}>
                  <div className="flex items-center gap-1.5">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black transition-colors ${active ? "bg-rhozly-primary text-white" : done ? "bg-rhozly-primary/20 text-rhozly-primary" : "bg-rhozly-surface-low text-rhozly-on-surface/30"}`}>
                      {step.n}
                    </span>
                    <span className={`hidden sm:inline text-xs font-black uppercase tracking-widest transition-colors ${active ? "text-rhozly-primary" : done ? "text-rhozly-on-surface/50" : "text-rhozly-on-surface/25"}`}>
                      {step.label}
                    </span>
                  </div>
                  {i < 2 && <div className="flex-1 h-px bg-rhozly-outline/20" />}
                </React.Fragment>
              );
            })}
          </div>
          {sessionSaveError && (
            <div className="flex items-center justify-between px-4 py-3 mb-4 rounded-2xl bg-amber-50 border border-amber-200">
              <p className="text-xs font-bold text-amber-700">Session not saved — results won't appear in History.</p>
              <button
                onClick={() => setSessionSaveError(false)}
                className="ml-3 shrink-0 text-amber-500 hover:text-amber-700 transition-colors"
                aria-label="Dismiss"
              >
                <X size={14} />
              </button>
            </div>
          )}
          {!imagePreview ? (
            <div data-testid="doctor-upload-zone" className="flex flex-col items-center justify-center p-8 sm:p-12 border-2 border-dashed border-rhozly-primary/30 rounded-3xl bg-rhozly-primary/5 hover:bg-rhozly-primary/10 transition-colors h-full min-h-[400px]">
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
            <div className="animate-in zoom-in-95 duration-300 xl:grid xl:grid-cols-[2fr_3fr] xl:gap-6 xl:items-start">
              {/* Left: image (sticky on xl) */}
              <div className="mb-6 xl:mb-0 xl:sticky xl:top-4">
                <div className="relative rounded-3xl overflow-hidden border border-rhozly-outline/20 bg-rhozly-on-surface/5 flex justify-center max-h-[400px] shadow-inner">
                  <img
                    src={imagePreview}
                    alt="Plant preview"
                    className="object-contain w-full h-full"
                  />
                  <button
                    onClick={clearImage}
                    disabled={isUIBusy}
                    className="absolute top-4 right-4 w-12 h-12 bg-white/90 backdrop-blur-sm rounded-2xl text-rhozly-on-surface/60 hover:text-red-500 hover:bg-white flex items-center justify-center shadow-sm transition-colors disabled:opacity-50"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Right: analysis + results */}
              <div className="space-y-6">

              {!aiEnabled ? (
                <div data-testid="plant-doctor-ai-gate" className="bg-rhozly-surface rounded-3xl border border-rhozly-outline/20 p-6 text-center">
                  <div className="w-10 h-10 bg-rhozly-on-surface/5 rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <Lock size={18} className="text-rhozly-on-surface/30" />
                  </div>
                  <p className="font-black text-rhozly-on-surface text-sm mb-1">AI Tier Required</p>
                  <p className="text-xs font-bold text-rhozly-on-surface/50 leading-relaxed">
                    Upgrade to AI tier to unlock plant identification and diagnosis.
                  </p>
                </div>
              ) : (
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-2">Select analysis type</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                <button
                  onClick={() => handleAiAction("identify")}
                  disabled={isUIBusy}
                  data-testid="doctor-btn-identify"
                  className={`flex flex-col items-center justify-center gap-1.5 p-3 sm:p-4 min-h-[44px] rounded-2xl font-black text-xs sm:text-sm transition-all group ${activeAction === "identify" ? "bg-rhozly-primary text-white shadow-md scale-[1.02]" : "bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300 disabled:opacity-50"}`}
                >
                  {isProcessing && activeAction === "identify" ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Search className="w-5 h-5 group-hover:scale-110 transition-transform" />
                  )}
                  <span>Identify</span>
                  <span className="text-[10px] opacity-60 font-bold normal-case tracking-normal">Plant</span>
                </button>
                <button
                  onClick={() => handleAiAction("diagnose")}
                  disabled={isUIBusy}
                  data-testid="doctor-btn-diagnose"
                  className={`flex flex-col items-center justify-center gap-1.5 p-3 sm:p-4 min-h-[44px] rounded-2xl font-black text-xs sm:text-sm transition-all group ${activeAction === "diagnose" ? "bg-amber-500 text-white shadow-md scale-[1.02]" : "bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 hover:border-amber-300 disabled:opacity-50"}`}
                >
                  {isProcessing && activeAction === "diagnose" ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Activity className="w-5 h-5 group-hover:scale-110 transition-transform" />
                  )}
                  <span>Diagnose</span>
                  <span className="text-[10px] opacity-60 font-bold normal-case tracking-normal">Health</span>
                </button>
                <button
                  onClick={() => handleAiAction("pest")}
                  disabled={isUIBusy}
                  data-testid="doctor-btn-pest"
                  className={`flex flex-col items-center justify-center gap-1.5 p-3 sm:p-4 min-h-[44px] rounded-2xl font-black text-xs sm:text-sm transition-all group ${activeAction === "pest" ? "bg-rose-600 text-white shadow-md scale-[1.02]" : "bg-rose-50 text-rose-800 border border-rose-200 hover:bg-rose-100 hover:border-rose-300 disabled:opacity-50"}`}
                >
                  {isProcessing && activeAction === "pest" ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <IconPest className="w-5 h-5 group-hover:scale-110 transition-transform" />
                  )}
                  <span>Identify</span>
                  <span className="text-[10px] opacity-60 font-bold normal-case tracking-normal">Pest</span>
                </button>
              </div>
              </div>
              )}

              {aiResult && (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-4">
                  <div className="bg-white border border-rhozly-primary/20 rounded-3xl p-6 shadow-sm">
                    <div className="flex items-center gap-2 mb-3">
                      <IconAI className="w-5 h-5 text-rhozly-primary" />
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
                          {aiResult.possible_names.map((item, i) => (
                            <button
                              key={i}
                              onClick={() => {
                                setSelectedPlantName(item.name);
                                setSelectedPlantScientific(item.scientific_name ?? null);
                              }}
                              className="w-full text-left p-4 bg-white rounded-2xl border border-rhozly-outline/10 font-bold hover:border-rhozly-primary/40 hover:bg-rhozly-primary/5 transition-all text-rhozly-on-surface"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <div>{item.name}</div>
                                  {item.scientific_name && (
                                    <div className="text-xs font-medium text-rhozly-on-surface/40 italic mt-0.5">{item.scientific_name}</div>
                                  )}
                                </div>
                                <span className={`shrink-0 text-[10px] font-black px-2 py-0.5 rounded-full ${item.confidence >= 80 ? "bg-emerald-50 text-emerald-700" : item.confidence >= 60 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"}`}>
                                  {item.confidence}%
                                </span>
                              </div>
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
                        {confirmedValue ? (
                          <span className="flex items-center gap-1 text-xs font-black text-rhozly-primary bg-rhozly-primary/10 px-2 py-1 rounded-lg">
                            <CheckCircle2 size={12} /> Confirmed
                          </span>
                        ) : (
                          <button
                            onClick={() => { setSelectedPlantName(null); setSelectedPlantScientific(null); }}
                            className="flex items-center gap-1 text-xs font-black text-rhozly-on-surface/40 hover:text-rhozly-primary transition-colors min-h-[44px] px-2"
                          >
                            <ChevronLeft size={14} /> Change
                          </button>
                        )}
                      </div>
                      <DiagnosisImageGallery
                        query={`${selectedPlantName} plant`}
                        label={selectedPlantName}
                      />
                      <div className="mt-4">
                        <button
                          data-testid="doctor-add-to-shed"
                          onClick={() => navigate("/shed", {
                            state: {
                              autoImport: [selectedPlantName],
                              returnTo: location.pathname + location.search,
                            },
                          })}
                          disabled={isUIBusy}
                          className="w-full flex items-center justify-center gap-2 py-4 px-4 bg-rhozly-primary text-white rounded-2xl font-black shadow-sm hover:bg-rhozly-primary-container transition-colors disabled:opacity-50"
                        >
                          <ListPlus size={18} /> Add to Shed
                        </button>
                      </div>
                      <div className="border-t border-rhozly-outline/10 pt-3 mt-1 space-y-2">
                        {currentSessionId && !confirmedValue && (
                          <button
                            data-testid="doctor-confirm-identification"
                            onClick={() => {
                              setConfirmedValue(selectedPlantName);
                              confirmSession(currentSessionId, selectedPlantName!);
                            }}
                            className="w-full flex items-center justify-center gap-2 py-3.5 bg-rhozly-primary text-white rounded-2xl font-black text-sm hover:bg-rhozly-primary/90 transition-colors"
                          >
                            <CheckCircle2 size={16} /> Confirm identification
                          </button>
                        )}
                        <button
                          data-testid="doctor-add-plant-to-list"
                          onClick={() => openAddToListSheet([{ name: selectedPlantName, item_type: "plant" }])}
                          className="w-full flex items-center justify-center gap-2 py-3.5 border border-rhozly-primary/20 rounded-2xl font-black text-sm text-rhozly-primary hover:bg-rhozly-primary/5 transition-colors"
                        >
                          <IconShopping size={16} /> Add to Shopping List
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
                          {aiResult.possible_diseases.map((item, i) => (
                            <button
                              key={i}
                              onClick={() => setSelectedDisease(item.name)}
                              className="w-full text-left p-4 bg-white rounded-2xl border border-rhozly-primary-container/20 font-bold hover:border-rhozly-primary-container/50 hover:bg-rhozly-primary-container/10 transition-all text-rhozly-on-surface flex items-center justify-between gap-3"
                            >
                              <span>{item.name}</span>
                              <span className={`shrink-0 text-[10px] font-black px-2 py-0.5 rounded-full ${item.confidence >= 80 ? "bg-emerald-50 text-emerald-700" : item.confidence >= 60 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"}`}>
                                {item.confidence}%
                              </span>
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

                  {aiResult.possible_pests &&
                    aiResult.possible_pests.length > 0 &&
                    !selectedPest &&
                    activeAction === "pest" && (
                      <div className="bg-rhozly-surface-low border border-rhozly-outline/15 rounded-3xl p-6 shadow-sm animate-in zoom-in-95">
                        <h3 className="font-black text-rhozly-on-surface mb-4 flex items-center gap-2">
                          <IconPest size={20} className="text-rhozly-primary" /> What do you see?
                        </h3>
                        <div className="space-y-2">
                          {aiResult.possible_pests.map((item, i) => (
                            <button
                              key={i}
                              onClick={() => setSelectedPest(item.name)}
                              className="w-full text-left p-4 bg-white rounded-2xl border border-rhozly-outline/15 font-bold hover:border-rhozly-primary/40 hover:bg-rhozly-primary/5 transition-all text-rhozly-on-surface flex items-center justify-between gap-3"
                            >
                              <span>{item.name}</span>
                              <span className={`shrink-0 text-[10px] font-black px-2 py-0.5 rounded-full ${item.confidence >= 80 ? "bg-emerald-50 text-emerald-700" : item.confidence >= 60 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"}`}>
                                {item.confidence}%
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                  {activeAction === "pest" && selectedPest && (
                    <DiagnosisImageGallery
                      query={`${selectedPest} garden pest insect`}
                      label={selectedPest}
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
                          {confirmedValue ? (
                            <span className="flex items-center gap-1 text-xs font-black text-rhozly-primary bg-rhozly-primary/10 px-2 py-1 rounded-lg">
                              <CheckCircle2 size={12} /> Confirmed
                            </span>
                          ) : (
                            <button
                              onClick={() => {
                                setSelectedDisease(null);
                                setAiResult((prev) =>
                                  prev ? { ...prev, diseaseInfo: undefined, remedial_schedules: undefined } : null,
                                );
                              }}
                              className="flex items-center gap-1 text-xs font-black text-rhozly-on-surface/40 hover:text-rhozly-on-surface transition-colors min-h-[44px] px-2"
                            >
                              <ChevronLeft size={14} /> Change
                            </button>
                          )}
                        </div>
                        <p className="text-sm font-bold text-rhozly-on-surface/70 mb-4">
                          How would you like to build your treatment plan?
                        </p>

                        <div className="flex flex-col sm:flex-row gap-3">
                          {!perenualEnabled ? (
                            <div data-testid="perenual-disease-gate" className="flex-1 bg-rhozly-surface rounded-3xl border border-rhozly-outline/20 p-4 flex items-center justify-center gap-3">
                              <div className="w-8 h-8 bg-rhozly-on-surface/5 rounded-xl flex items-center justify-center shrink-0">
                                <Lock size={16} className="text-rhozly-on-surface/30" />
                              </div>
                              <div className="text-left">
                                <p className="font-black text-rhozly-on-surface text-sm">Perenual Access Required</p>
                                <p className="text-xs font-bold text-rhozly-on-surface/50">Enable Perenual in profile settings.</p>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => fetchDetailedInfo("api")}
                              disabled={isUIBusy}
                              className="flex-1 flex items-center justify-center gap-2 py-4 border rounded-2xl font-black shadow-sm transition-colors disabled:opacity-50 bg-white border-rhozly-primary-container/20 text-rhozly-primary hover:bg-rhozly-primary-container/10"
                            >
                              {isFetchingDetails ? (
                                <Loader2 size={18} className="animate-spin" />
                              ) : (
                                <Globe size={18} />
                              )}
                              Search Global API
                            </button>
                          )}

                          <button
                            onClick={() => fetchDetailedInfo("ai")}
                            disabled={isUIBusy}
                            className="flex-1 flex items-center justify-center gap-2 py-4 bg-rhozly-primary text-white rounded-2xl font-black shadow-sm hover:bg-rhozly-primary-container transition-colors disabled:opacity-50"
                          >
                            {isFetchingDetails && !perenualEnabled ? (
                              <Loader2 size={18} className="animate-spin" />
                            ) : (
                              <BrainCircuit size={18} />
                            )}{" "}
                            Get AI Feedback
                          </button>
                        </div>
                        {currentSessionId && !confirmedValue && (
                          <button
                            data-testid="doctor-confirm-diagnosis"
                            onClick={() => {
                              setConfirmedValue(selectedDisease);
                              confirmSession(currentSessionId, selectedDisease!);
                            }}
                            className="w-full flex items-center justify-center gap-2 py-3.5 mt-3 bg-rhozly-primary text-white rounded-2xl font-black text-sm hover:bg-rhozly-primary/90 transition-colors"
                          >
                            <CheckCircle2 size={16} /> Confirm diagnosis
                          </button>
                        )}
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
                            {confirmedValue ? (
                              <span className="flex items-center gap-1 text-xs font-black text-rhozly-primary bg-rhozly-primary/10 px-2 py-1 rounded-lg">
                                <CheckCircle2 size={12} /> Confirmed
                              </span>
                            ) : (
                              <button
                                onClick={() => {
                                  setSelectedDisease(null);
                                  setAiResult((prev) =>
                                    prev ? { ...prev, diseaseInfo: undefined, remedial_schedules: undefined } : null,
                                  );
                                }}
                                className="flex items-center gap-1 text-xs font-black text-rhozly-on-surface/40 hover:text-rhozly-primary transition-colors min-h-[44px] px-2"
                              >
                                <ChevronLeft size={14} /> Change condition
                              </button>
                            )}
                          </div>
                        )}
                        {aiResult.diseaseInfo && (
                          <div className="mb-6 lg:grid lg:grid-cols-2 lg:gap-4 space-y-4 lg:space-y-0">
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
                                <IconDoctor size={14} /> Recommended Solution
                              </h4>
                              <p className="text-sm text-rhozly-on-surface/80">
                                {aiResult.diseaseInfo.solution}
                              </p>
                            </div>
                          </div>
                        )}

                        <div className="space-y-3 pt-4 border-t border-rhozly-outline/10">
                          {currentSessionId && !confirmedValue && selectedDisease && (
                            <button
                              data-testid="doctor-confirm-diagnosis"
                              onClick={() => {
                                setConfirmedValue(selectedDisease);
                                confirmSession(currentSessionId, selectedDisease);
                              }}
                              className="w-full flex items-center justify-center gap-2 py-3.5 bg-rhozly-primary text-white rounded-2xl font-black text-sm hover:bg-rhozly-primary/90 transition-colors"
                            >
                              <CheckCircle2 size={16} /> Confirm diagnosis
                            </button>
                          )}
                          {inventoryError && (
                            <div className="flex items-center justify-between px-4 py-3 rounded-2xl bg-red-50 border border-red-200">
                              <p className="text-xs font-bold text-red-600">Could not load shed — patient picker unavailable.</p>
                              <button
                                onClick={() => setInventoryRetryTick(t => t + 1)}
                                className="text-xs font-black text-rhozly-primary hover:underline ml-3 shrink-0"
                              >
                                Retry
                              </button>
                            </div>
                          )}
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
                            className="w-full py-5 bg-rhozly-primary text-white rounded-2xl font-black text-lg shadow-lg hover:bg-rhozly-primary-container transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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

                  {activeAction === "pest" &&
                    selectedPest &&
                    aiResult.is_pest === false && (
                      <div className="bg-rhozly-surface-low border border-rhozly-outline/15 rounded-3xl p-6 shadow-sm animate-in zoom-in-95">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-rhozly-tertiary/10 rounded-2xl flex items-center justify-center">
                              <CheckCircle2 size={20} className="text-rhozly-tertiary" />
                            </div>
                            <div>
                              <h3 className="font-black text-rhozly-on-surface">Beneficial Insect!</h3>
                              <p className="text-xs font-bold text-rhozly-tertiary">{selectedPest}</p>
                            </div>
                          </div>
                          {confirmedValue ? (
                            <span className="flex items-center gap-1 text-xs font-black text-rhozly-primary bg-rhozly-primary/10 px-2 py-1 rounded-lg">
                              <CheckCircle2 size={12} /> Confirmed
                            </span>
                          ) : (
                            <button
                              onClick={() => setSelectedPest(null)}
                              className="flex items-center gap-1 text-xs font-black text-rhozly-on-surface/40 hover:text-rhozly-primary transition-colors min-h-[44px] px-2"
                            >
                              <ChevronLeft size={14} /> Change
                            </button>
                          )}
                        </div>
                        {aiResult.notes && (
                          <p className="text-sm font-medium text-rhozly-on-surface/70 leading-relaxed mb-3">
                            {aiResult.notes}
                          </p>
                        )}
                        <p className="text-xs font-bold text-rhozly-on-surface/70 bg-rhozly-tertiary/10 rounded-xl p-3">
                          This is a beneficial insect — great for your garden! No treatment needed. Consider encouraging more.
                        </p>
                        {currentSessionId && !confirmedValue && (
                          <button
                            data-testid="doctor-confirm-pest"
                            onClick={() => {
                              setConfirmedValue(selectedPest);
                              confirmSession(currentSessionId, selectedPest!);
                            }}
                            className="w-full mt-3 flex items-center justify-center gap-2 py-3.5 bg-rhozly-primary text-white rounded-2xl font-black text-sm hover:bg-rhozly-primary/90 transition-colors"
                          >
                            <CheckCircle2 size={16} /> Confirm identification
                          </button>
                        )}
                      </div>
                    )}

                  {activeAction === "pest" &&
                    selectedPest &&
                    aiResult.is_pest !== false &&
                    !aiResult.pestInfo &&
                    !aiResult.remedial_schedules && (
                      <div className="bg-rhozly-surface-low border border-rhozly-outline/15 rounded-3xl p-6 shadow-sm animate-in zoom-in-95">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <IconPest size={20} className="text-rhozly-primary" />
                            <h3 className="font-black text-lg text-rhozly-on-surface">{selectedPest}</h3>
                            {aiResult.pest_severity && (
                              <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${
                                aiResult.pest_severity === "High"
                                  ? "bg-red-100 text-red-700"
                                  : aiResult.pest_severity === "Medium"
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-yellow-100 text-yellow-700"
                              }`}>
                                {aiResult.pest_severity} risk
                              </span>
                            )}
                          </div>
                          {confirmedValue ? (
                            <span className="flex items-center gap-1 text-xs font-black text-rhozly-primary bg-rhozly-primary/10 px-2 py-1 rounded-lg shrink-0">
                              <CheckCircle2 size={12} /> Confirmed
                            </span>
                          ) : (
                            <button
                              onClick={() => setSelectedPest(null)}
                              className="flex items-center gap-1 text-xs font-black text-rhozly-on-surface/40 hover:text-rhozly-on-surface transition-colors shrink-0"
                            >
                              <ChevronLeft size={14} /> Change
                            </button>
                          )}
                        </div>
                        <p className="text-sm font-bold text-rhozly-on-surface/70 mb-4">
                          Get detailed information to build a treatment and prevention plan.
                        </p>
                        <button
                          onClick={fetchPestDetails}
                          disabled={isUIBusy}
                          className="w-full flex items-center justify-center gap-2 py-4 bg-rhozly-primary text-white rounded-2xl font-black shadow-sm hover:bg-rhozly-primary-container transition-colors disabled:opacity-50"
                        >
                          {isFetchingPestDetails ? (
                            <Loader2 size={18} className="animate-spin" />
                          ) : (
                            <BrainCircuit size={18} />
                          )}
                          Get pest details
                        </button>
                        {currentSessionId && !confirmedValue && (
                          <button
                            data-testid="doctor-confirm-pest"
                            onClick={() => {
                              setConfirmedValue(selectedPest);
                              confirmSession(currentSessionId, selectedPest!);
                            }}
                            className="w-full mt-2 flex items-center justify-center gap-2 py-3.5 bg-rhozly-primary text-white rounded-2xl font-black text-sm hover:bg-rhozly-primary/90 transition-colors"
                          >
                            <CheckCircle2 size={16} /> Confirm identification
                          </button>
                        )}
                      </div>
                    )}

                  {activeAction === "pest" &&
                    selectedPest &&
                    aiResult.pestInfo &&
                    !aiResult.remedial_schedules && (
                      <div className="bg-white border border-rhozly-outline/10 rounded-3xl p-6 shadow-sm animate-in zoom-in-95">
                        <div className="flex items-center justify-between mb-4">
                          <p className="text-xs font-black text-rhozly-primary uppercase tracking-widest flex items-center gap-1">
                            <IconPest size={12} /> {selectedPest}
                          </p>
                          {confirmedValue ? (
                            <span className="flex items-center gap-1 text-xs font-black text-rhozly-primary bg-rhozly-primary/10 px-2 py-1 rounded-lg">
                              <CheckCircle2 size={12} /> Confirmed
                            </span>
                          ) : (
                            <button
                              onClick={() => {
                                setSelectedPest(null);
                                setAiResult((prev) =>
                                  prev ? { ...prev, pestInfo: undefined, remedial_schedules: undefined } : null,
                                );
                              }}
                              className="flex items-center gap-1 text-xs font-black text-rhozly-on-surface/40 hover:text-rhozly-primary transition-colors min-h-[44px] px-2"
                            >
                              <ChevronLeft size={14} /> Change
                            </button>
                          )}
                        </div>
                        <div className="mb-6 lg:grid lg:grid-cols-2 lg:gap-4 space-y-4 lg:space-y-0">
                          <div>
                            <h4 className="font-black text-sm text-rhozly-primary mb-1 uppercase tracking-widest flex items-center gap-2">
                              <BrainCircuit size={14} /> About this pest
                            </h4>
                            <p className="text-sm text-rhozly-on-surface/80">{aiResult.pestInfo.description}</p>
                          </div>
                          <div>
                            <h4 className="font-black text-sm text-rhozly-primary mb-1 uppercase tracking-widest flex items-center gap-2">
                              <IconPlant size={14} /> Affected plants
                            </h4>
                            <p className="text-sm text-rhozly-on-surface/80">{aiResult.pestInfo.affected_plants}</p>
                          </div>
                          <div>
                            <h4 className="font-black text-sm text-rhozly-primary mb-1 uppercase tracking-widest flex items-center gap-2">
                              <IconDoctor size={14} /> Treatment
                            </h4>
                            <p className="text-sm text-rhozly-on-surface/80">{aiResult.pestInfo.treatment}</p>
                          </div>
                          <div>
                            <h4 className="font-black text-sm text-rhozly-primary mb-1 uppercase tracking-widest flex items-center gap-2">
                              <ShieldCheck size={14} /> Prevention
                            </h4>
                            <p className="text-sm text-rhozly-on-surface/80">{aiResult.pestInfo.prevention}</p>
                          </div>
                        </div>
                        <div className="space-y-3 pt-4 border-t border-rhozly-outline/10">
                          {currentSessionId && !confirmedValue && (
                            <button
                              data-testid="doctor-confirm-pest"
                              onClick={() => {
                                setConfirmedValue(selectedPest);
                                confirmSession(currentSessionId, selectedPest!);
                              }}
                              className="w-full flex items-center justify-center gap-2 py-3.5 bg-rhozly-primary text-white rounded-2xl font-black text-sm hover:bg-rhozly-primary/90 transition-colors"
                            >
                              <CheckCircle2 size={16} /> Confirm identification
                            </button>
                          )}
                          {inventoryError && (
                            <div className="flex items-center justify-between px-4 py-3 rounded-2xl bg-red-50 border border-red-200">
                              <p className="text-xs font-bold text-red-600">Could not load shed — patient picker unavailable.</p>
                              <button
                                onClick={() => setInventoryRetryTick(t => t + 1)}
                                className="text-xs font-black text-rhozly-primary hover:underline ml-3 shrink-0"
                              >
                                Retry
                              </button>
                            </div>
                          )}
                          <label className="block text-xs font-black text-rhozly-primary/60 uppercase tracking-widest">
                            Select Patient
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
                            className="w-full py-5 bg-rhozly-primary text-white rounded-2xl font-black text-lg shadow-lg hover:bg-rhozly-primary-container transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                          >
                            {isGeneratingTreatment ? (
                              <><Loader2 size={18} className="animate-spin" /> Drafting Plan...</>
                            ) : (
                              <><CalendarPlus size={18} /> Generate Treatment Plan</>
                            )}
                          </button>
                        </div>
                      </div>
                    )}

                  {aiResult.remedial_schedules &&
                    aiResult.remedial_schedules.length > 0 &&
                    (activeAction === "diagnose" || activeAction === "pest") && (
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
                              className="bg-rhozly-surface-lowest p-3 rounded-xl border border-rhozly-primary-container/10 flex items-start gap-3"
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
                              <IconGuides size={14} className="text-rhozly-tertiary" />{" "}
                              Add to Plant Journal?
                            </p>
                            <p className="text-[10px] font-bold text-rhozly-on-surface/50 mt-0.5">
                              This will attach the photo, diagnosis, and
                              treatment plan to the plant's history.
                            </p>
                          </div>
                        </label>

                        {treatmentApplied ? (
                          <div className="w-full py-4 bg-rhozly-primary/10 border border-rhozly-primary/30 text-rhozly-primary rounded-2xl font-black shadow-sm flex items-center justify-center gap-2 animate-in zoom-in-95">
                            <CheckCircle2 size={20} />
                            Approved — tasks added to your schedule!
                          </div>
                        ) : (
                          <button
                            onClick={handleApplyTreatment}
                            disabled={isApplyingTreatment}
                            className="w-full py-4 bg-rhozly-primary text-white rounded-2xl font-black shadow-md hover:bg-rhozly-primary-container transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
                        <div className="border-t border-rhozly-outline/10 pt-3 mt-1">
                          <button
                            data-testid="doctor-add-treatment-to-list"
                            onClick={() => {
                              const items: SuggestedItem[] = [];
                              const condition = selectedDisease || selectedPest;
                              if (condition) {
                                items.push({ name: `Treatment for ${condition}`, item_type: "product", category: "Pest Control" });
                              }
                              for (const s of aiResult?.remedial_schedules ?? []) {
                                if (s.product) items.push({ name: s.product, item_type: "product", category: "Pest Control" });
                              }
                              if (items.length) openAddToListSheet(items);
                            }}
                            className="w-full flex items-center justify-center gap-2 py-3.5 border border-rhozly-primary/20 rounded-2xl font-black text-sm text-rhozly-primary hover:bg-rhozly-primary/5 transition-colors"
                          >
                            <IconShopping size={16} /> Add treatments to Shopping List
                          </button>
                        </div>
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
                              className="w-full text-left px-4 min-h-[44px] flex items-center hover:bg-rhozly-primary/5 rounded-xl text-sm font-bold text-rhozly-on-surface transition-colors"
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
      {showAddToList && addToListItems.length > 0 && (
        <AddToListSheet
          homeId={homeId}
          suggestedItems={addToListItems}
          activeLists={addToListActiveLists}
          onClose={() => setShowAddToList(false)}
          onConfirm={handleAddToListConfirm}
          onCreateAndConfirm={handleCreateAndAddToList}
        />
      )}
    </>
  );
}
