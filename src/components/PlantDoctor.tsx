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
  Sun,
  Edit3,
  ScanSearch,
} from "lucide-react";
import { IconDoctor, IconPlantDB, IconPest, IconAI, IconPlant, IconGuides, IconShopping } from "../constants/icons";
import { toast } from "react-hot-toast";
import { requireOnline } from "../lib/requireOnline";
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
import PhotoAnnotationOverlay, { type PhotoAnnotation } from "./PhotoAnnotationOverlay";
import AnalyseResultCard from "./lens/AnalyseResultCard";
import { AnalysisWaitOverlay } from "./lens/AnalysisWaitOverlay";
import { SparkleAccent } from "./ui/SparkleAccent";
import AiFeedback from "./ai/AiFeedback";
import SceneMapResultCard from "./lens/SceneMapResultCard";
import InfoTooltip from "./InfoTooltip";
import { usePersona } from "../hooks/usePersona";
import ImageCredit from "./credit/ImageCredit";

// 🧠 IMPORT THE AI CONTEXT
import { usePlantDoctor } from "../context/PlantDoctorContext";
import { useBetaFeedbackContext } from "../context/BetaFeedbackContext";
import {
  PlantDoctorService,
  type AnalyseResult,
  type DiseaseInfo,
  type VisionResult,
  type SceneMapResult,
  type PhotoInput,
  type PlantOrgan,
  type IdentifyQuota,
} from "../services/plantDoctorService";

// Wave-19 — Plant Doctor accepts up to 5 photos per single-plant action
// (identify / diagnose / pest / analyse). Multi-ID is intentionally
// single-photo. Each entry tracks the source File, an object-URL preview,
// and the optional Pl@ntNet organ tag.
export interface PhotoEntry {
  file: File;
  previewUrl: string;
  organ: PlantOrgan;
}

const MAX_PHOTOS = 5;
const ORGAN_OPTIONS: { value: PlantOrgan; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "leaf", label: "Leaf" },
  { value: "flower", label: "Flower" },
  { value: "fruit", label: "Fruit" },
  { value: "bark", label: "Bark" },
];

interface PlantDoctorProps {
  homeId: string;
  userId?: string;
  aiEnabled: boolean;
  isPremium: boolean;
  perenualEnabled: boolean;
  onTasksAdded?: () => void;
  /**
   * When true (Mobile Quick Access Wave 2), the screen renders in a
   * focused single-purpose mode — hides the header, the Analyse/History
   * tab bar, and the secondary Identify/Diagnose/Pest row. The full
   * `/doctor` route always passes false. `/quick/lens` passes true.
   */
  compact?: boolean;
}


export default function PlantDoctor({
  homeId,
  userId,
  aiEnabled,
  isPremium,
  perenualEnabled,
  onTasksAdded,
  compact = false,
}: PlantDoctorProps) {
  const { setPageContext } = usePlantDoctor();
  const { requestFeedback } = useBetaFeedbackContext();
  const persona = usePersona();
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<"analyse" | "history">("analyse");
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [confirmedValue, setConfirmedValue] = useState<string | null>(null);
  const { sessions, isLoading: historyLoading, load: loadHistory, confirmSession } =
    usePlantDoctorSessions(userId ?? null);

  // Wave-19: up to 5 photos per ID (except Multi-ID which stays at 1). All
  // existing JSX still references `selectedFile` / `imagePreview` — those are
  // derived from `photos[0]` so the bulk of the component is untouched.
  const [photos, setPhotos] = useState<PhotoEntry[]>([]);
  const selectedFile = photos[0]?.file ?? null;
  const imagePreview = photos[0]?.previewUrl ?? null;
  const [annotations, setAnnotations] = useState<PhotoAnnotation[]>([]);
  const [annotatingPhoto, setAnnotatingPhoto] = useState(false);

  const [isProcessing, setIsProcessing] = useState(false);
  const [isFetchingDetails, setIsFetchingDetails] = useState(false);
  const [isGeneratingTreatment, setIsGeneratingTreatment] = useState(false);
  const [activeAction, setActiveAction] = useState<
    "identify" | "diagnose" | "pest" | "analyse" | "scene" | null
  >(null);

  const [myInventory, setMyInventory] = useState<any[]>([]);
  const [plantSearch, setPlantSearch] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const [aiResult, setAiResult] = useState<VisionResult | null>(null);
  const [analyseResult, setAnalyseResult] = useState<AnalyseResult | null>(null);
  const [sceneResult, setSceneResult] = useState<SceneMapResult | null>(null);
  // Sprint 3 (UX review 2026-06-15 item 3.1) — free-tier identify quota.
  // Populated from the edge function response on every identify_vision call.
  // Null = unlimited (Sage+) or quota not yet known.
  const [identifyQuota, setIdentifyQuota] = useState<IdentifyQuota | null>(null);
  const [quotaExhaustedModal, setQuotaExhaustedModal] = useState<{
    quota: IdentifyQuota;
    message: string;
  } | null>(null);
  // The "Group ID" history session for the current Multi-ID run + the
  // accumulating confirmed map (regionIndex → name) used to update it.
  const sceneSessionIdRef = useRef<string | null>(null);
  const sceneConfirmedRef = useRef<Record<string, string>>({});

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

  // Photo handoff from garden layout — pre-load an image when a URL is stashed in sessionStorage.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = sessionStorage.getItem("rhozly:doctor-image");
    if (!url) return;
    sessionStorage.removeItem("rhozly:doctor-image");
    sessionStorage.removeItem("rhozly:doctor-source");
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error("Image fetch failed");
        const blob = await res.blob();
        if (cancelled) return;
        if (blob.size > 10 * 1024 * 1024) {
          toast.error("Image too large for Plant Doctor");
          return;
        }
        const file = new File([blob], "bed-photo.jpg", { type: blob.type || "image/jpeg" });
        addPhoto(file);
        setAiResult(null);
        toast("Photo loaded — pick an action below");
      } catch (err) {
        Logger.error("Failed to preload Doctor image from layout", err);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // ── Photo strip helpers ────────────────────────────────────────────────
  // `addPhoto` appends to the strip; over the 5-photo cap it shows a
  // toast and drops the extras. `removePhoto` revokes the object URL to
  // avoid memory leaks. The strip is the only thing that writes `photos`;
  // every other read goes through the derived `selectedFile / imagePreview`.

  const addPhoto = React.useCallback(
    (file: File, organ: PlantOrgan = "auto") => {
      setPhotos((prev) => {
        if (prev.length >= MAX_PHOTOS) {
          toast(`You can add up to ${MAX_PHOTOS} photos.`);
          return prev;
        }
        const previewUrl = URL.createObjectURL(file);
        return [...prev, { file, previewUrl, organ }];
      });
    },
    [],
  );

  const removePhoto = React.useCallback((idx: number) => {
    setPhotos((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      const removed = prev[idx];
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return next;
    });
  }, []);

  const setPhotoOrgan = React.useCallback((idx: number, organ: PlantOrgan) => {
    setPhotos((prev) =>
      prev.map((p, i) => (i === idx ? { ...p, organ } : p)),
    );
  }, []);

  // Revoke any remaining object URLs on unmount so HMR + nav don't pile up
  // detached blobs.
  React.useEffect(() => {
    return () => {
      photos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

        addPhoto(file);
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
      // Wave-19.x — accept multiple files in one go. The `multiple`
      // attribute on the input lets the OS picker select several photos
      // at once; we walk them here and add each to the strip in order.
      // `addPhoto` already enforces the 5-photo cap and toasts the
      // overflow, so we don't need to short-circuit early.
      const files = Array.from(e.target.files ?? []);
      if (files.length === 0) return;
      let added = 0;
      for (const file of files) {
        if (!file.type.startsWith("image/")) {
          toast.error(`Skipped ${file.name || "a file"} — not an image.`);
          continue;
        }
        if (file.size > 10 * 1024 * 1024) {
          toast.error(`Skipped ${file.name || "a file"} — over 10MB.`);
          continue;
        }
        addPhoto(file);
        added += 1;
      }
      if (added === 0) return;
      // Reset the input value so picking the same set again triggers
      // change (otherwise the browser dedupes by identity).
      if (e.target) e.target.value = "";
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
    photos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    setPhotos([]);
    setPlantSearch("");
    setActiveAction(null);
    setAiResult(null);
    setAnalyseResult(null);
    setSceneResult(null);
    sceneSessionIdRef.current = null;
    sceneConfirmedRef.current = {};
    setSelectedPlantName(null);
    setSelectedPlantScientific(null);
    setSelectedDisease(null);
    setSelectedPest(null);
    setSickInventoryId(null);
    setTreatmentApplied(false);
    setCurrentSessionId(null);
    setConfirmedValue(null);
    setAnnotations([]);
    setAnnotatingPhoto(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const saveSession = async (
    action: "identify" | "diagnose" | "pest",
    result: typeof aiResult,
    base64Photos: string[],
  ) => {
    if (!userId || !result || base64Photos.length === 0) return;
    setSessionSaveError(false);
    try {
      const sessionId = crypto.randomUUID();
      const paths: string[] = [];
      for (let i = 0; i < base64Photos.length; i++) {
        const path = i === 0
          ? `${userId}/${sessionId}.jpg`
          : `${userId}/${sessionId}_${i}.jpg`;
        const bytes = Uint8Array.from(atob(base64Photos[i]), (c) => c.charCodeAt(0));
        const blob = new Blob([bytes], { type: "image/jpeg" });
        await supabase.storage.from("doctor-sessions").upload(path, blob);
        paths.push(path);
      }
      const { data } = await supabase
        .from("plant_doctor_sessions")
        .insert({
          user_id: userId,
          home_id: homeId,
          action,
          image_path: paths[0],
          image_paths: paths,
          results: {
            notes: result.notes,
            possible_names: result.possible_names,
            possible_diseases: result.possible_diseases,
            possible_pests: result.possible_pests,
          },
          plantnet_result: result.plantnet ?? null,
          annotations,
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
    // Sprint 3 — Identify is free with quota; Diagnose + Pest stay Sage+.
    if (action !== "identify" && !aiEnabled) {
      return toast.error("AI features are disabled.");
    }
    if (photos.length === 0) return toast.error("Upload an image first.");
    if (!requireOnline("Plant Doctor")) return;

    setIsProcessing(true);
    setActiveAction(action);
    setAiResult(null);
    setAnalyseResult(null);
    setSceneResult(null);
    setSelectedPlantName(null);
    setSelectedPlantScientific(null);
    setSelectedDisease(null);
    setSelectedPest(null);
    setSickInventoryId(null);

    try {
      const compressed = await Promise.all(photos.map((p) => compressImage(p.file)));
      const images: PhotoInput[] = compressed.map((base64, i) => ({
        base64,
        mimeType: "image/jpeg",
        organ: photos[i].organ,
      }));
      const sickPlantName = sickInventoryId
        ? myInventory.find((i) => i.id === sickInventoryId)?.plants?.common_name
        : undefined;
      const apiAction = action === "identify" ? "identify_vision" : action === "diagnose" ? "diagnose" : "identify_pest";
      const sickItem = sickInventoryId ? myInventory.find((i) => i.id === sickInventoryId) : null;
      const data = await PlantDoctorService.analyzeImage({
        homeId,
        images,
        action: apiAction,
        plantSearch: action !== "pest" ? plantSearch : undefined,
        targetPlant: action === "diagnose" ? (sickPlantName ?? undefined) : undefined,
        inventoryItemId: action === "diagnose" ? (sickInventoryId ?? undefined) : undefined,
        areaId: action === "diagnose" ? (sickItem?.area_id ?? undefined) : undefined,
        deviceLat: deviceLocation?.lat,
        deviceLng: deviceLocation?.lng,
      });

      // Sprint 3 — server returns 200 with a `quota_exhausted` marker when
      // a free user has used all 5 IDs in the past 7 days. Surface as
      // upgrade modal instead of treating it as a successful identify.
      if ((data as any)?.quota_exhausted === true) {
        const exhausted = data as unknown as { quota: IdentifyQuota; message: string };
        setQuotaExhaustedModal({ quota: exhausted.quota, message: exhausted.message });
        setIdentifyQuota(exhausted.quota);
        logEvent(EVENT.AI_QUOTA_EXCEEDED, { action: "identify_vision" });
        return;
      }

      setAiResult(data);
      // Sprint 3 — update the free-tier quota badge optimistically from
      // the response payload. Null for Sage+ (unlimited).
      if (data?.quota !== undefined) {
        setIdentifyQuota(data.quota ?? null);
      }
      saveSession(action, data, compressed); // fire-and-forget; all photos persisted
      if (action === "identify") {
        logEvent(EVENT.AI_IDENTIFY, { plant_name: data?.possible_names?.[0]?.name ?? null });
      } else if (action === "diagnose") {
        logEvent(EVENT.AI_DIAGNOSE, { diagnosis: data?.possible_diseases?.[0]?.name ?? null });
      } else {
        logEvent(EVENT.AI_IDENTIFY, { pest_name: data?.possible_pests?.[0]?.name ?? null });
      }
      toast.success(action === "diagnose" ? "Diagnosis complete!" : "Identification complete!");
      requestFeedback("doctor_diagnosis", { action });
    } catch (error: any) {
      Logger.error("Plant AI analysis failed", error, { homeId, action }, error.message || "Failed to analyze plant.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMultiId = async () => {
    if (!aiEnabled) return toast.error("AI features are disabled.");
    if (!selectedFile) return toast.error("Upload an image first.");
    if (!requireOnline("Multi-ID")) return;
    // Multi-ID is intentionally single-photo. Note it but proceed with photo 1.
    if (photos.length > 1) {
      toast("Multi-ID uses the first photo only — it's designed to detect every plant in one overview shot.", { duration: 5000 });
    }

    setIsProcessing(true);
    setActiveAction("scene");
    setAiResult(null);
    setAnalyseResult(null);
    setSceneResult(null);
    setSelectedPlantName(null);
    setSelectedPlantScientific(null);
    setSelectedDisease(null);
    setSelectedPest(null);

    sceneSessionIdRef.current = null;
    sceneConfirmedRef.current = {};
    try {
      const base64Data = await compressImage(selectedFile);
      const data = await PlantDoctorService.identifyScene({
        homeId,
        images: [{ base64: base64Data, mimeType: "image/jpeg", organ: photos[0].organ }],
        deviceLat: deviceLocation?.lat,
        deviceLng: deviceLocation?.lng,
      });
      setSceneResult(data);
      logEvent(EVENT.AI_IDENTIFY, { multi_id_regions: data.regions.length });

      // Persist the run as a single "Group ID" history session — kept whether
      // or not the user confirms anything. Confirmations update it in place.
      if (userId && data.regions.length > 0) {
        try {
          const sid = crypto.randomUUID();
          const path = `${userId}/${sid}.jpg`;
          const bytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
          await supabase.storage.from("doctor-sessions").upload(path, new Blob([bytes], { type: "image/jpeg" }));
          const { data: row } = await supabase
            .from("plant_doctor_sessions")
            .insert({
              user_id: userId,
              home_id: homeId,
              action: "scene",
              image_path: path,
              results: { regions: data.regions, notes: data.notes ?? null, confirmed: {} },
            })
            .select("id")
            .single();
          sceneSessionIdRef.current = row?.id ?? null;
        } catch (err) {
          Logger.warn("Multi-ID session write failed", err, { homeId });
        }
      }

      toast.success(
        data.regions.length > 0
          ? `Found ${data.regions.length} plant${data.regions.length === 1 ? "" : "s"}.`
          : "No distinct plants found in that photo.",
      );
    } catch (error: any) {
      Logger.error("Plant Multi-ID failed", error, { homeId }, error.message || "Failed to identify plants.");
    } finally {
      setIsProcessing(false);
    }
  };

  // Confirm a detected plant's identity — updates the run's "Group ID" session
  // in place (results.confirmed: regionIndex → name). Fire-and-forget; the card
  // owns the visual confirmed state. Rebuilds results from the in-memory scene
  // result so no DB read is needed.
  const confirmScenePlant = async (regionIndex: number, confirmedName: string) => {
    if (!userId || !sceneSessionIdRef.current || !sceneResult) return;
    sceneConfirmedRef.current = { ...sceneConfirmedRef.current, [String(regionIndex)]: confirmedName };
    try {
      await supabase
        .from("plant_doctor_sessions")
        .update({
          results: {
            regions: sceneResult.regions,
            notes: sceneResult.notes ?? null,
            confirmed: sceneConfirmedRef.current,
          },
          confirmed_at: new Date().toISOString(),
        })
        .eq("id", sceneSessionIdRef.current)
        .eq("user_id", userId);
    } catch (err) {
      Logger.warn("Multi-ID confirm update failed", err, { homeId });
    }
  };

  const handleAnalyse = async () => {
    if (!aiEnabled) return toast.error("AI features are disabled.");
    if (photos.length === 0) return toast.error("Upload an image first.");
    if (!requireOnline("Plant Doctor")) return;

    setIsProcessing(true);
    setActiveAction("analyse");
    setAiResult(null);
    setAnalyseResult(null);
    setSceneResult(null);
    setSelectedPlantName(null);
    setSelectedPlantScientific(null);
    setSelectedDisease(null);
    setSelectedPest(null);

    try {
      const compressed = await Promise.all(photos.map((p) => compressImage(p.file)));
      const images: PhotoInput[] = compressed.map((base64, i) => ({
        base64,
        mimeType: "image/jpeg",
        organ: photos[i].organ,
      }));
      const sickPlantName = sickInventoryId
        ? myInventory.find((i) => i.id === sickInventoryId)?.plants?.common_name
        : undefined;
      const sickItem = sickInventoryId ? myInventory.find((i) => i.id === sickInventoryId) : null;

      const data = await PlantDoctorService.analyseComprehensive({
        homeId,
        images,
        targetPlant: sickPlantName ?? (plantSearch || undefined),
        inventoryItemId: sickInventoryId ?? undefined,
        areaId: sickItem?.area_id ?? undefined,
        deviceLat: deviceLocation?.lat,
        deviceLng: deviceLocation?.lng,
      });

      setAnalyseResult(data);

      // Persist to history — analyse sessions are first-class alongside identify/diagnose/pest.
      if (userId) {
        setSessionSaveError(false);
        try {
          const sessionId = crypto.randomUUID();
          const paths: string[] = [];
          // Upload all photos so History can show the multi-photo strip.
          for (let i = 0; i < compressed.length; i++) {
            const path = i === 0
              ? `${userId}/${sessionId}.jpg`
              : `${userId}/${sessionId}_${i}.jpg`;
            const bytes = Uint8Array.from(atob(compressed[i]), (c) => c.charCodeAt(0));
            const blob = new Blob([bytes], { type: "image/jpeg" });
            await supabase.storage.from("doctor-sessions").upload(path, blob);
            paths.push(path);
          }
          const { data: sessionRow } = await supabase
            .from("plant_doctor_sessions")
            .insert({
              user_id: userId,
              home_id: homeId,
              action: "analyse",
              image_path: paths[0],
              image_paths: paths,
              results: data,
              plantnet_result: data.plantnet ?? null,
              annotations,
            })
            .select("id")
            .single();
          if (sessionRow) setCurrentSessionId(sessionRow.id);
        } catch (err) {
          setSessionSaveError(true);
          Logger.error("Failed to save analyse session", err, { action: "analyse" }, "Session could not be saved — results won't appear in History.");
        }
      }

      logEvent(EVENT.AI_DIAGNOSE, {
        analyse: true,
        plant_name: data?.identification?.common_name ?? null,
        health_state: data?.health?.state ?? null,
      });
      toast.success("Analysis complete!");
      requestFeedback("doctor_diagnosis", { action: "analyse" });
    } catch (error: any) {
      Logger.error("Comprehensive analysis failed", error, { homeId }, error.message || "Failed to analyse plant.");
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
        {!compact && (
          <div className="mb-4 px-2 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h1 className="text-2xl sm:text-3xl font-black font-display text-rhozly-on-surface tracking-tight flex items-center gap-3">
                <IconDoctor className="w-8 h-8 text-rhozly-primary" />
                Plant Doctor
              </h1>
              <p className="text-xs sm:text-sm font-bold text-rhozly-on-surface/40 uppercase tracking-widest mt-1">
                Take a photo — Rhozly will identify it, spot what's wrong and suggest care tasks
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
        )}

        {!compact && activeTab === "history" ? (
          <div className="bg-rhozly-surface-lowest/80 backdrop-blur-md rounded-3xl p-6 md:p-8 border border-rhozly-outline/10 shadow-sm flex-1 overflow-y-auto">
            <PlantDoctorHistory
              sessions={sessions}
              isLoading={historyLoading}
              onLoad={loadHistory}
            />
          </div>
        ) : null}

        {/* Phase 4.4 — camera-first on mobile: the panel sheds its card
            chrome below md so the capture surface reads near-full-bleed
            inside the shell padding; from md up the classic panel returns. */}
        <div className={`max-md:p-0 max-md:bg-transparent max-md:backdrop-blur-none max-md:border-0 max-md:shadow-none md:bg-rhozly-surface-lowest/80 md:backdrop-blur-md rounded-3xl md:p-8 md:border md:border-rhozly-outline/10 md:shadow-sm flex-1 ${activeTab !== "analyse" ? "hidden" : ""}`}>
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
            // Phase 4.4 — camera-first: on phones the zone fills most of the
            // viewport and Open Camera leads; from sm up the classic layout.
            // The heading copy + "Upload File" name are load-bearing for e2e.
            <div data-testid="doctor-upload-zone" className="flex flex-col items-center justify-center p-6 sm:p-12 border-2 border-dashed border-rhozly-primary/30 rounded-3xl bg-rhozly-primary/5 can-hover:hover:bg-rhozly-primary/10 transition-colors h-full min-h-[60vh] sm:min-h-[400px]">
              <div className="w-20 h-20 bg-white shadow-sm text-rhozly-primary rounded-full flex items-center justify-center mb-6">
                <CameraIcon className="w-10 h-10 opacity-80" aria-hidden />
              </div>
              <h3 className="text-xl font-black font-display text-rhozly-on-surface mb-2 text-center">
                Upload or take a photo
              </h3>
              <p className="text-sm font-bold text-rhozly-on-surface/50 text-center max-w-sm mb-8">
                Snap a clear picture of the plant, leaf, or affected area for
                the AI to analyze.
              </p>
              <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4 w-full sm:w-auto max-w-sm">
                <button
                  onClick={handleNativeCamera}
                  className="flex items-center justify-center gap-2 px-6 py-4 sm:py-3.5 min-h-[52px] bg-brand-gradient-soft rounded-2xl shadow-raised text-white font-black transition-transform duration-200 ease-spring active:scale-[0.97] active:duration-100 touch-manipulation"
                >
                  <CameraIcon className="w-5 h-5" aria-hidden /> Open Camera
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center justify-center gap-2 px-6 py-3.5 min-h-[48px] bg-white border border-rhozly-outline/10 rounded-2xl shadow-sm text-rhozly-on-surface font-bold can-hover:hover:bg-rhozly-primary/5 active:scale-[0.98] transition-all touch-manipulation"
                >
                  <Upload className="w-5 h-5 text-rhozly-primary" aria-hidden /> Upload File
                </button>
              </div>
              {/* Persona-aware tip: newcomers (and unknown persona) see
                  the full sentence inline; experienced gardeners see a
                  small `?` they can tap if they want a reminder.
                  Reinforces that persona capture pays off. */}
              {persona === "experienced" ? (
                <div className="mt-4 flex items-center gap-1.5 text-xs font-bold text-rhozly-on-surface/45">
                  Photo tips
                  <InfoTooltip
                    label="Photo tips"
                    data-testid="doctor-photo-tip-tooltip"
                  >
                    Good light, close up — try to capture the leaf, stem, or the affected area clearly. Avoid shadows on the affected part.
                  </InfoTooltip>
                </div>
              ) : (
                <p className="text-xs font-bold text-rhozly-on-surface/40 text-center mt-4 max-w-xs">
                  Tip: Good light, close up — try to capture the leaf, stem, or the affected area clearly.
                </p>
              )}
            </div>
          ) : (
            <div className="animate-in zoom-in-95 duration-300 xl:grid xl:grid-cols-[2fr_3fr] xl:gap-6 xl:items-start">
              {/* Left: image (sticky on xl) */}
              <div className="mb-6 xl:mb-0 xl:sticky xl:top-4 space-y-2">
                <div className="relative rounded-3xl overflow-hidden border border-rhozly-outline/20 bg-rhozly-on-surface/5 flex justify-center max-h-[55vh] xl:max-h-[400px] shadow-inner">
                  <PhotoAnnotationOverlay
                    src={imagePreview}
                    alt="Plant preview"
                    annotations={annotations}
                    onChange={setAnnotations}
                    editing={annotatingPhoto}
                    maxHeightClass="max-h-[55vh] xl:max-h-[400px]"
                  />
                  {/* Staged AI-wait (Phase 4.4) — blurred copy of the user's
                      own photo + honest pipeline copy while Gemini/Pl@ntNet
                      run. Unmounts the instant the response settles. */}
                  {isProcessing && (
                    <AnalysisWaitOverlay action={activeAction} src={imagePreview} />
                  )}
                  <button
                    onClick={clearImage}
                    disabled={isUIBusy}
                    aria-label="Remove photo"
                    className="absolute top-4 right-4 w-12 h-12 bg-white/90 backdrop-blur-sm rounded-2xl text-rhozly-on-surface/60 hover:text-red-500 hover:bg-white flex items-center justify-center shadow-sm transition-colors disabled:opacity-50 z-10"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Annotation controls */}
                <div className="flex items-center justify-between gap-2 px-1">
                  <button
                    type="button"
                    onClick={() => setAnnotatingPhoto((v) => !v)}
                    aria-pressed={annotatingPhoto}
                    data-testid="doctor-annotate-toggle"
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-colors min-h-[36px] ${
                      annotatingPhoto
                        ? "bg-rhozly-primary text-white shadow-sm"
                        : "bg-rhozly-surface-low text-rhozly-on-surface/70 hover:bg-rhozly-surface"
                    }`}
                  >
                    <Edit3 size={12} />
                    {annotatingPhoto ? "Done marking" : "Mark areas"}
                  </button>
                  <p className="text-[10px] font-bold text-rhozly-on-surface/45 leading-snug text-right max-w-[200px]">
                    {annotatingPhoto
                      ? "Tap the image to drop a numbered marker; tap a marker to label or remove it."
                      : annotations.length > 0
                        ? `${annotations.length} marker${annotations.length === 1 ? "" : "s"} saved with this session.`
                        : "Optional — point out specific areas before you analyse."}
                  </p>
                </div>

                {/* ── Multi-photo strip ─────────────────────────────────── */}
                {/* Up to 5 photos per ID for everything except Multi-ID
                    (which uses the first). Adding extra photos from
                    different angles, or tagged with the right organ,
                    materially improves Pl@ntNet's accuracy. */}
                <div
                  data-testid="doctor-photo-strip"
                  className="flex items-center gap-2 px-1 pt-2 overflow-x-auto"
                >
                  {photos.map((p, i) => {
                    const organMeta = ORGAN_OPTIONS.find((o) => o.value === p.organ);
                    const next: PlantOrgan = (() => {
                      const idx = ORGAN_OPTIONS.findIndex((o) => o.value === p.organ);
                      return ORGAN_OPTIONS[(idx + 1) % ORGAN_OPTIONS.length].value;
                    })();
                    return (
                      <div
                        key={p.previewUrl}
                        data-testid={`doctor-photo-strip-item-${i}`}
                        className="relative shrink-0 flex flex-col items-center gap-1"
                      >
                        <div className="relative w-14 h-14 rounded-xl overflow-hidden border border-rhozly-outline/15 bg-rhozly-surface-low">
                          <img
                            src={p.previewUrl}
                            alt={`Photo ${i + 1}`}
                            className="w-full h-full object-cover"
                          />
                          {i === 0 && (
                            <span
                              className="absolute top-0 left-0 px-1 text-[8px] font-black uppercase tracking-widest bg-rhozly-primary text-white rounded-br-md"
                              title="Main photo — used for the preview and annotation overlay"
                            >
                              1
                            </span>
                          )}
                          <button
                            type="button"
                            data-testid={`doctor-photo-strip-remove-${i}`}
                            onClick={() => removePhoto(i)}
                            disabled={isUIBusy}
                            aria-label={`Remove photo ${i + 1}`}
                            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-white shadow-sm border border-rhozly-outline/15 text-rhozly-on-surface/60 hover:text-red-500 hover:bg-red-50 flex items-center justify-center transition-colors disabled:opacity-40"
                          >
                            <X size={10} />
                          </button>
                        </div>
                        <button
                          type="button"
                          data-testid={`doctor-photo-strip-organ-${i}`}
                          onClick={() => setPhotoOrgan(i, next)}
                          disabled={isUIBusy}
                          title="Tag the organ in this photo — improves identification accuracy"
                          className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded transition-colors disabled:opacity-50 ${
                            p.organ === "auto"
                              ? "text-rhozly-on-surface/40 hover:text-rhozly-on-surface/70"
                              : "bg-rhozly-primary/10 text-rhozly-primary hover:bg-rhozly-primary/20"
                          }`}
                        >
                          {organMeta?.label ?? "Auto"}
                        </button>
                      </div>
                    );
                  })}
                  {photos.length < MAX_PHOTOS && (
                    <button
                      type="button"
                      data-testid="doctor-photo-strip-add"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUIBusy}
                      className="shrink-0 w-14 h-14 rounded-xl border-2 border-dashed border-rhozly-primary/30 bg-rhozly-primary/5 hover:bg-rhozly-primary/10 text-rhozly-primary flex items-center justify-center transition-colors disabled:opacity-40"
                      aria-label="Add another photo"
                      title={`Add another photo (${photos.length}/${MAX_PHOTOS})`}
                    >
                      <span className="text-2xl font-black leading-none">+</span>
                    </button>
                  )}
                </div>
                <p className="text-[10px] font-bold text-rhozly-on-surface/40 leading-snug px-1">
                  {photos.length === 1
                    ? "Adding photos of different angles or organs (leaf, flower, fruit) measurably improves identification accuracy."
                    : photos.length < MAX_PHOTOS
                      ? `${photos.length} of ${MAX_PHOTOS} photos. Multi-ID uses the first photo only.`
                      : `Maximum ${MAX_PHOTOS} photos reached.`}
                </p>
              </div>

              {/* Right: analysis + results */}
              <div className="space-y-6">

              {!aiEnabled ? (
                /* Sprint 3 (UX review 2026-06-15 item 3.1) — free tier gets
                   Identify (with sliding-window quota); Diagnose / Analyse /
                   Multi-ID stay Sage+ gated below. */
                <div data-testid="plant-doctor-ai-gate" className="space-y-3">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-3xl p-5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700 mb-1 inline-flex items-center gap-1.5">
                      Free for everyone
                      <InfoTooltip
                        size={11}
                        data-testid="info-tooltip-free-identify"
                        content="5 free identifications per rolling 7-day window. Every ID drops off 7 days later, so you keep earning new slots. Upgrade to Sage for unlimited IDs + AI diagnosis, pest scan, and Multi-ID."
                      />
                    </p>
                    <p className="font-black text-emerald-900 text-sm mb-1">
                      Identify a plant
                    </p>
                    <p className="text-xs font-bold text-emerald-900/70 leading-snug mb-3">
                      Snap a photo, tap Identify. {identifyQuota
                        ? `${identifyQuota.remaining} of ${identifyQuota.limit} free IDs remaining this week.`
                        : "5 free identifications per rolling 7-day window."}
                    </p>
                    <button
                      data-testid="doctor-btn-identify-free"
                      onClick={() => handleAiAction("identify")}
                      disabled={isUIBusy || photos.length === 0}
                      className={`w-full flex items-center justify-center gap-2 px-5 py-3 min-h-[48px] rounded-2xl text-sm font-black transition-all ${
                        activeAction === "identify"
                          ? "bg-emerald-700 text-white shadow-md"
                          : "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                      }`}
                    >
                      {isProcessing && activeAction === "identify" ? (
                        <><Loader2 size={16} className="animate-spin" /> Identifying…</>
                      ) : (
                        <><Search size={16} /> Identify plant</>
                      )}
                    </button>
                    {identifyQuota && (
                      <div
                        data-testid="doctor-quota-badge"
                        className="mt-3 flex items-center justify-between gap-2 text-[10px] font-black uppercase tracking-widest text-emerald-700"
                      >
                        <span>{identifyQuota.used} / {identifyQuota.limit} used</span>
                        {identifyQuota.resetsAt && identifyQuota.remaining === 0 && (
                          <span className="text-emerald-700/60">
                            Resets {new Date(identifyQuota.resetsAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="bg-rhozly-surface rounded-3xl border border-rhozly-outline/20 p-5">
                    <div className="flex items-start gap-3">
                      <div className="shrink-0 w-9 h-9 rounded-2xl bg-rhozly-on-surface/5 flex items-center justify-center">
                        <Lock size={16} className="text-rhozly-on-surface/40" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-black text-rhozly-on-surface text-sm mb-1">
                          AI Diagnosis, Analyse & Multi-ID
                        </p>
                        <p className="text-xs font-bold text-rhozly-on-surface/55 leading-snug mb-3">
                          Upgrade to Sage for unlimited identifications plus pest, disease, and full plant analysis.
                        </p>
                        <button
                          data-testid="doctor-upgrade-link"
                          onClick={() => navigate("/gardener")}
                          className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] rounded-2xl bg-rhozly-primary text-white text-xs font-black hover:opacity-90 transition"
                        >
                          See plans →
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-2">Select analysis type</p>

                {/* Analyse — primary, full-width hero button */}
                <button
                  onClick={handleAnalyse}
                  disabled={isUIBusy}
                  data-testid="doctor-btn-analyse"
                  className={`w-full flex items-center justify-center gap-3 p-4 min-h-[56px] rounded-2xl font-black text-sm transition-all group mb-3 ${
                    activeAction === "analyse"
                      ? "bg-rhozly-primary text-white shadow-md scale-[1.01]"
                      : "bg-gradient-to-br from-rhozly-primary to-rhozly-primary/80 text-white shadow-md hover:shadow-lg hover:scale-[1.005] disabled:opacity-50"
                  }`}
                >
                  {isProcessing && activeAction === "analyse" ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <IconAI className="w-5 h-5 group-hover:scale-110 transition-transform" />
                  )}
                  <span className="flex flex-col items-start leading-tight">
                    <span>Analyse</span>
                    <span className="text-[10px] opacity-80 font-bold normal-case tracking-normal">
                      Tell me everything — recommended
                    </span>
                  </span>
                </button>

              {/* Phase 4.4 — one neutral treatment (colored ICONS carry the
                  meaning via status tokens); the gradient Analyse hero above
                  stays the only loud element. Labels + testids + disabled
                  semantics unchanged (e2e targets the accessible names). */}
              {!compact && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                  {([
                    {
                      testId: "doctor-btn-identify",
                      onClick: () => handleAiAction("identify"),
                      action: "identify",
                      Icon: Search,
                      iconClass: "text-status-success-ink",
                      label: "Identify",
                      sub: "Plant",
                    },
                    {
                      testId: "doctor-btn-diagnose",
                      onClick: () => handleAiAction("diagnose"),
                      action: "diagnose",
                      Icon: Activity,
                      iconClass: "text-status-weather-ink",
                      label: "Diagnose",
                      sub: "Health",
                    },
                    {
                      testId: "doctor-btn-pest",
                      onClick: () => handleAiAction("pest"),
                      action: "pest",
                      Icon: IconPest,
                      iconClass: "text-status-watch-ink",
                      label: "Identify",
                      sub: "Pest",
                    },
                    {
                      testId: "doctor-btn-multi-id",
                      onClick: handleMultiId,
                      action: "scene",
                      Icon: ScanSearch,
                      iconClass: "text-status-sensor-ink",
                      label: "Multi-ID",
                      sub: "Many plants",
                    },
                  ] as const).map(({ testId, onClick, action, Icon, iconClass, label, sub }) => (
                    <button
                      key={testId}
                      onClick={onClick}
                      disabled={isUIBusy}
                      data-testid={testId}
                      className={`flex flex-col items-center justify-center gap-1.5 p-3 sm:p-4 min-h-[44px] rounded-2xl font-black text-xs sm:text-sm transition-all group touch-manipulation active:scale-[0.97] active:duration-100 ${
                        activeAction === action
                          ? "bg-rhozly-primary text-white shadow-md"
                          : "bg-rhozly-surface-lowest text-rhozly-on-surface/75 border border-rhozly-outline/15 can-hover:hover:border-rhozly-primary/30 can-hover:hover:text-rhozly-on-surface disabled:opacity-50"
                      }`}
                    >
                      {isProcessing && activeAction === action ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Icon
                          className={`w-5 h-5 group-hover:scale-110 transition-transform ${activeAction === action ? "" : iconClass}`}
                        />
                      )}
                      <span>{label}</span>
                      <span className="text-[10px] opacity-60 font-bold normal-case tracking-normal">{sub}</span>
                    </button>
                  ))}
                </div>
              )}
              </div>
              )}

              {activeAction === "analyse" && analyseResult && (
                <div className="animate-in fade-in slide-in-from-top-4">
                  <AnalyseResultCard
                    result={analyseResult}
                    homeId={homeId}
                    onTasksAdded={onTasksAdded}
                  />
                  <div className="mt-3">
                    <AiFeedback functionName="plant-doctor" action="analyse_comprehensive" homeId={homeId} targetKind="diagnosis" />
                  </div>
                </div>
              )}

              {activeAction === "scene" && sceneResult && imagePreview && (
                <div className="animate-in fade-in slide-in-from-top-4">
                  <SceneMapResultCard
                    imageUrl={imagePreview}
                    result={sceneResult}
                    homeId={homeId}
                    aiEnabled={aiEnabled}
                    isPremium={isPremium}
                    onPlantsAdded={onTasksAdded}
                    onConfirm={confirmScenePlant}
                  />
                </div>
              )}

              {activeAction !== "analyse" && activeAction !== "scene" && aiResult && (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-4">
                  <div className="bg-white border border-rhozly-primary/20 rounded-3xl p-6 shadow-sm">
                    <div className="flex items-center gap-2 mb-3">
                      <IconAI className="w-5 h-5 text-rhozly-primary" />
                      <h3 className="font-black text-lg text-rhozly-on-surface">
                        <SparkleAccent>Doctor's Notes</SparkleAccent>
                      </h3>
                    </div>
                    <div className="text-rhozly-on-surface/80 font-medium leading-relaxed whitespace-pre-wrap">
                      {aiResult.notes}
                    </div>
                    <div className="mt-3 pt-3 border-t border-rhozly-outline/10">
                      <AiFeedback functionName="plant-doctor" action={activeAction ?? undefined} homeId={homeId} targetKind="diagnosis" />
                    </div>
                  </div>

                  {aiResult.possible_names &&
                    aiResult.possible_names.length > 0 &&
                    !selectedPlantName &&
                    activeAction === "identify" && (
                      <div className="bg-rhozly-surface-low border border-rhozly-outline/10 rounded-3xl p-6 shadow-sm animate-in fade-in">
                        <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
                          <h3 className="font-black text-rhozly-on-surface flex items-center gap-2">
                            <CheckCircle2
                              className="text-rhozly-primary"
                              size={20}
                            />{" "}
                            Which of these looks correct?
                          </h3>
                          {aiResult.plantnet && (() => {
                            const source = aiResult.plantnet.identification_source;
                            const label =
                              source === "plantnet" ? "Pl@ntNet" :
                              source === "plantnet+ai_confirmed" ? "Pl@ntNet + AI agreed" :
                              source === "plantnet_vs_ai_disagreement" ? "Pl@ntNet (AI disagreed)" :
                              "AI only";
                            const classes =
                              source === "plantnet" || source === "plantnet+ai_confirmed"
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : source === "plantnet_vs_ai_disagreement"
                                  ? "bg-amber-50 text-amber-700 border-amber-200"
                                  : "bg-rhozly-surface text-rhozly-on-surface/60 border-rhozly-outline/20";
                            const best = aiResult.plantnet?.best_match;
                            return (
                              <span
                                data-testid="identify-source"
                                className={`inline-block text-[10px] font-black uppercase tracking-widest border px-2 py-0.5 rounded-md ${classes}`}
                              >
                                {label}{best && ` · ${Math.round(best.score * 100)}%`}
                              </span>
                            );
                          })()}
                        </div>
                        {aiResult.plantnet?.identification_source === "plantnet_vs_ai_disagreement" && aiResult.plantnet.ai_suggested_name && aiResult.plantnet.best_match && (
                          <p className="text-[11px] font-semibold text-amber-700/90 leading-snug mb-3">
                            Pl@ntNet matched as <span className="italic">{aiResult.plantnet.best_match.scientificName}</span>, but Rhozly AI suggested <span className="italic">{aiResult.plantnet.ai_suggested_name}</span>. Compare both against the photo.
                          </p>
                        )}
                        {(() => {
                          // Pl@ntNet truly returned nothing for this photo
                          // (key missing, quota, image rejected as non-plant,
                          // or zero candidates). Show a quiet note so the
                          // user knows it was tried instead of silence.
                          // When Pl@ntNet returned even a low-confidence
                          // guess, we show its tile above (in red %) —
                          // no need for the note as well.
                          if (aiResult.plantnet?.best_match) return null;
                          // Only mention Pl@ntNet at all if the edge
                          // function attached the block (i.e. the call ran).
                          if (!aiResult.plantnet) return null;
                          return (
                            <p className="text-[11px] font-semibold text-rhozly-on-surface/45 leading-snug mb-3 flex items-center gap-1.5">
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-rhozly-on-surface/30" />
                              Pl@ntNet didn't return a match for this photo — the suggestions below are from Rhozly AI.
                            </p>
                          );
                        })()}
                        <div className="space-y-2">
                          {(() => {
                            // Always render the Pl@ntNet best match as its
                            // own tile alongside the AI candidates so the
                            // user can pick it even when Pl@ntNet's
                            // confidence is low or AI agreed. Two tiles
                            // for the same species (one Pl@ntNet, one AI)
                            // is intentional here — the user wants to see
                            // each source's confidence explicitly to
                            // decide which to trust.
                            //
                            // The ONLY suppression is the trust path
                            // (source === "plantnet"), because possible_names
                            // IS already Pl@ntNet's top matches and those
                            // tiles below carry the Pl@ntNet badge — a
                            // separate tile would be a literal duplicate.
                            const pn = aiResult.plantnet?.best_match;
                            const src = aiResult.plantnet?.identification_source;
                            if (!pn) return null;
                            if (src === "plantnet") return null;
                            const pnConfidence = Math.round(pn.score * 100);
                            const pnDisplayName = pn.commonName ?? pn.scientificName;
                            return (
                              <button
                                data-testid="identify-plantnet-tile"
                                onClick={() => {
                                  setSelectedPlantName(pnDisplayName);
                                  setSelectedPlantScientific(pn.scientificName);
                                }}
                                className="w-full text-left p-4 bg-emerald-50/40 rounded-2xl border-2 border-emerald-200/70 hover:border-emerald-400 hover:bg-emerald-50 transition-all text-rhozly-on-surface"
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 mb-0.5">
                                      <span className="text-[9px] font-black uppercase tracking-widest bg-emerald-600 text-white px-1.5 py-0.5 rounded">
                                        Pl@ntNet
                                      </span>
                                    </div>
                                    <div className="font-black text-base sm:text-lg text-rhozly-on-surface leading-tight truncate">
                                      {pnDisplayName}
                                    </div>
                                    <div className="text-sm font-semibold text-rhozly-on-surface/60 italic mt-0.5 truncate">
                                      {pn.scientificName}
                                    </div>
                                  </div>
                                  <span
                                    title="Pl@ntNet's confidence in this match"
                                    className={`shrink-0 text-[10px] font-black px-2 py-0.5 rounded-full ${pnConfidence >= 80 ? "bg-emerald-100 text-emerald-700" : pnConfidence >= 40 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"}`}
                                  >
                                    {pnConfidence}%
                                  </span>
                                </div>
                              </button>
                            );
                          })()}
                          {(() => {
                            // Source the badge label from the identification
                            // path. In the trust path, possible_names IS
                            // Pl@ntNet's data (the edge function
                            // synthesised it from the top matches); calling
                            // those tiles "Rhozly AI" mislabelled the
                            // source and made it look like Pl@ntNet wasn't
                            // running at all.
                            const src = aiResult.plantnet?.identification_source;
                            const isPlantNetSource = src === "plantnet";
                            const badgeLabel = isPlantNetSource ? "Pl@ntNet" : "Rhozly AI";
                            const badgeClass = isPlantNetSource
                              ? "bg-emerald-600 text-white"
                              : "bg-rhozly-primary/10 text-rhozly-primary";
                            const cardClass = isPlantNetSource
                              ? "w-full text-left p-4 bg-emerald-50/40 rounded-2xl border-2 border-emerald-200/70 hover:border-emerald-400 hover:bg-emerald-50 transition-all text-rhozly-on-surface"
                              : "w-full text-left p-4 bg-white rounded-2xl border border-rhozly-outline/10 hover:border-rhozly-primary/40 hover:bg-rhozly-primary/5 transition-all text-rhozly-on-surface";
                            return aiResult.possible_names!.map((item, i) => (
                              <button
                                key={i}
                                onClick={() => {
                                  setSelectedPlantName(item.name);
                                  setSelectedPlantScientific(item.scientific_name ?? null);
                                }}
                                className={cardClass}
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 mb-0.5">
                                      <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ${badgeClass}`}>
                                        {badgeLabel}
                                      </span>
                                    </div>
                                    <div className="font-black text-base sm:text-lg text-rhozly-on-surface leading-tight truncate">
                                      {item.name}
                                    </div>
                                    {item.scientific_name && (
                                      <div className="text-sm font-semibold text-rhozly-on-surface/60 italic mt-0.5 truncate">
                                        {item.scientific_name}
                                      </div>
                                    )}
                                  </div>
                                  <span
                                    title={isPlantNetSource ? "Pl@ntNet's confidence in this match" : "Rhozly AI's confidence in this match"}
                                    className={`shrink-0 text-[10px] font-black px-2 py-0.5 rounded-full ${item.confidence >= 80 ? "bg-emerald-50 text-emerald-700" : item.confidence >= 60 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"}`}
                                  >
                                    {item.confidence}%
                                  </span>
                                </div>
                                {/* Wave 22.0003 — inline credit so users see the data source / licence. */}
                                {(item as any).image_credit && (
                                  <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                                    <ImageCredit credit={(item as any).image_credit} variant="inline" />
                                  </div>
                                )}
                              </button>
                            ));
                          })()}
                          {/* Wave 21.0010 — Also from Rhozly AI. Only renders
                              on the trust path (identification_source = "plantnet")
                              because on the cross-check / ai_fallback paths the
                              main possible_names group is already Gemini's data. */}
                          {aiResult.plantnet?.identification_source === "plantnet"
                            && (aiResult.ai_alternatives?.length ?? 0) > 0 && (
                            <>
                              <div className="flex items-center gap-2 pt-3 mt-1 border-t border-rhozly-outline/10">
                                <span className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/45">
                                  Also from Rhozly AI
                                </span>
                              </div>
                              {aiResult.ai_alternatives!.map((item, i) => (
                                <button
                                  key={`ai-${i}`}
                                  data-testid={`identify-ai-alternative-${i}`}
                                  onClick={() => {
                                    setSelectedPlantName(item.name);
                                    setSelectedPlantScientific(item.scientific_name ?? null);
                                  }}
                                  className="w-full text-left p-4 bg-white rounded-2xl border border-rhozly-outline/10 hover:border-rhozly-primary/40 hover:bg-rhozly-primary/5 transition-all text-rhozly-on-surface"
                                >
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-2 mb-0.5">
                                        <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-rhozly-primary/10 text-rhozly-primary">
                                          Rhozly AI
                                        </span>
                                      </div>
                                      <div className="font-black text-base sm:text-lg text-rhozly-on-surface leading-tight truncate">
                                        {item.name}
                                      </div>
                                      {item.scientific_name && (
                                        <div className="text-sm font-semibold text-rhozly-on-surface/60 italic mt-0.5 truncate">
                                          {item.scientific_name}
                                        </div>
                                      )}
                                    </div>
                                    <span
                                      title="Rhozly AI's confidence in this match"
                                      className={`shrink-0 text-[10px] font-black px-2 py-0.5 rounded-full ${item.confidence >= 80 ? "bg-emerald-50 text-emerald-700" : item.confidence >= 60 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"}`}
                                    >
                                      {item.confidence}%
                                    </span>
                                  </div>
                                  {/* Wave 22.0003 — credit AI-derived identifications so users
                                      can distinguish them from real-photo / curated suggestions. */}
                                  {(item as any).image_credit && (
                                    <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                                      <ImageCredit credit={(item as any).image_credit} variant="inline" />
                                    </div>
                                  )}
                                </button>
                              ))}
                            </>
                          )}
                        </div>
                      </div>
                    )}

                  {selectedPlantName && activeAction === "identify" && (
                    <div className="bg-rhozly-primary/5 border border-rhozly-primary/20 rounded-3xl p-6 shadow-sm animate-in zoom-in-95">
                      <div className="flex items-start justify-between gap-3 mb-4">
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-1">
                            Save
                          </p>
                          <h3 className="font-black text-lg sm:text-xl text-rhozly-on-surface leading-tight truncate">
                            {selectedPlantName}
                          </h3>
                          {selectedPlantScientific && (
                            <p className="text-sm font-semibold text-rhozly-on-surface/60 italic leading-tight truncate mt-0.5">
                              {selectedPlantScientific}
                            </p>
                          )}
                        </div>
                        {confirmedValue ? (
                          <span className="shrink-0 flex items-center gap-1 text-xs font-black text-rhozly-primary bg-rhozly-primary/10 px-2 py-1 rounded-lg">
                            <CheckCircle2 size={12} /> Confirmed
                          </span>
                        ) : (
                          <button
                            onClick={() => { setSelectedPlantName(null); setSelectedPlantScientific(null); }}
                            className="shrink-0 flex items-center gap-1 text-xs font-black text-rhozly-on-surface/40 hover:text-rhozly-primary transition-colors min-h-[44px] px-2"
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
                          onClick={() => {
                            // Route through the Shed's library-first
                            // BulkSearchModal (the same engine the "Find a
                            // plant" button uses) so the user sees plant
                            // library + Verdantly + Perenual results
                            // alongside any AI guide — instead of the
                            // previous autoImport path which opened the
                            // SourcePicker and auto-selected AI by default.
                            // Prefer the Latin name when available because
                            // it gives the most precise library match;
                            // fall back to the common name otherwise.
                            const seed = selectedPlantScientific?.trim() || selectedPlantName || "";
                            // Route via the query-param form that TheShed
                            // handles (see TheShed.tsx — searchParams.get("open")
                            // === "add-plant"). The path-form
                            // `/shed/add/search` is not registered in App.tsx
                            // and falls through to the dashboard redirect.
                            navigate(`/shed?open=add-plant&query=${encodeURIComponent(seed)}`, {
                              state: { returnTo: location.pathname + location.search },
                            });
                          }}
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
                              Search plant database
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
                            Ask Rhozly AI
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
                          {(() => {
                            const sunKeywords = ["leggy", "etiolated", "yellow", "pale", "chlorosis", "sunburn", "scorch", "scorched", "bleached", "sunlight"];
                            const diseaseLower = (selectedDisease ?? "").toLowerCase();
                            const isSunRelated = sunKeywords.some(k => diseaseLower.includes(k));
                            if (!isSunRelated) return null;
                            const patient = sickInventoryId ? myInventory.find((i) => i.id === sickInventoryId) : null;
                            const plantName = patient?.plants?.common_name || patient?.nickname || "this plant";
                            return (
                              <button
                                data-testid="doctor-check-sun"
                                onClick={() => {
                                  if (patient) {
                                    try {
                                      const raw = patient.plants?.sunlight;
                                      const sunlight = Array.isArray(raw) ? (raw[0] ?? null) : (typeof raw === "string" ? raw : null);
                                      sessionStorage.setItem(
                                        "rhozly:sun-tracker-plant",
                                        JSON.stringify({
                                          id: String(patient.id),
                                          name: plantName,
                                          sunlight,
                                          source: "doctor",
                                        }),
                                      );
                                    } catch { /* ignore */ }
                                  }
                                  navigate("/sun-trajectory?mode=garden");
                                }}
                                className="w-full flex items-center justify-center gap-2 py-3 bg-amber-500 text-white rounded-2xl font-black text-sm hover:bg-amber-600 transition-colors shadow-sm"
                              >
                                <Sun size={16} /> Check sun for {plantName}
                              </button>
                            );
                          })()}
                          {selectedDisease && (
                            <button
                              data-testid="doctor-browse-guides"
                              onClick={() => {
                                navigate(`/guides?q=${encodeURIComponent(selectedDisease)}`);
                              }}
                              className="w-full flex items-center justify-center gap-2 py-3 bg-rose-50 text-rose-700 border border-rose-200 rounded-2xl font-black text-sm hover:bg-rose-100 transition-colors"
                            >
                              <IconGuides size={16} /> Read more about {selectedDisease}
                            </button>
                          )}
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
                    Which plant is this? (optional — helps personalise the results)
                  </label>
                  {inventoryError ? (
                    <div className="flex items-center justify-between px-4 py-3 mb-2 rounded-2xl bg-red-50 border border-red-200">
                      <p className="text-xs font-bold text-red-600">Could not load shed — patient picker unavailable.</p>
                      <button
                        onClick={() => setInventoryRetryTick(t => t + 1)}
                        className="text-xs font-black text-rhozly-primary hover:underline ml-3 shrink-0"
                      >
                        Retry
                      </button>
                    </div>
                  ) : (
                    <div className="mb-3">
                      <PlantInstancePicker
                        items={myInventory}
                        selectedId={sickInventoryId}
                        onSelect={setSickInventoryId}
                        placeholder="Select from your shed… (or leave blank)"
                      />
                    </div>
                  )}
                  <label className="block text-[10px] font-black text-rhozly-on-surface/40 uppercase tracking-widest mb-2 ml-2 mt-3">
                    Or type a name to help the AI (optional)
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
            multiple
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
      {quotaExhaustedModal && (
        <div
          data-testid="doctor-quota-exhausted-modal"
          className="fixed inset-0 z-[120] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setQuotaExhaustedModal(null)}
        >
          <div
            className="bg-rhozly-bg rounded-3xl w-full max-w-md shadow-2xl border border-rhozly-outline/10 overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="quota-exhausted-title"
          >
            <div className="p-6">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mb-4">
                <Lock size={20} />
              </div>
              <h3 id="quota-exhausted-title" className="font-display font-black text-xl text-rhozly-on-surface mb-2">
                You've used your free IDs this week
              </h3>
              <p className="text-sm text-rhozly-on-surface/65 leading-relaxed mb-4">
                {quotaExhaustedModal.message}
              </p>
              {quotaExhaustedModal.quota.resetsAt && (
                <p className="text-xs font-bold text-rhozly-on-surface/45 mb-5">
                  Your free identifications reset on{" "}
                  <span className="text-rhozly-on-surface/75">
                    {new Date(quotaExhaustedModal.quota.resetsAt).toLocaleDateString("en-GB", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                    })}
                  </span>
                  .
                </p>
              )}
              <div className="flex flex-col gap-2">
                <button
                  data-testid="quota-exhausted-upgrade"
                  onClick={() => {
                    setQuotaExhaustedModal(null);
                    navigate("/gardener");
                  }}
                  className="bg-rhozly-primary text-white px-5 py-3 min-h-[48px] rounded-2xl text-sm font-black hover:opacity-90 transition shadow-sm"
                >
                  Upgrade to Sage — unlimited IDs + diagnosis
                </button>
                <button
                  data-testid="quota-exhausted-dismiss"
                  onClick={() => setQuotaExhaustedModal(null)}
                  className="text-rhozly-on-surface/55 hover:text-rhozly-on-surface px-5 py-2.5 min-h-[44px] rounded-2xl text-sm font-bold transition"
                >
                  Maybe later
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
