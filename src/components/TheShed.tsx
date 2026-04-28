import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../lib/supabase";
import {
  getFrequencyDays,
  getHemisphere,
  normalizePeriods,
} from "../lib/seasonal";
import { buildAutoSeasonalSchedules } from "../lib/plantScheduleFactory";
import {
  Plus,
  Database,
  MapPin,
  X,
  Archive,
  ArchiveRestore,
  Loader2,
  Trash2,
  Edit3,
  Search,
  Sparkles,
  ListPlus,
  CheckSquare2,
  Clock,
  AlertCircle,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { Logger } from "../lib/errorHandler";
import ManualPlantCreation from "./ManualPlantCreation";
import PlantEditModal from "./PlantEditModal";
import PlantAssignmentModal from "./PlantAssignmentModal";
import BulkSearchModal from "./BulkSearchModal";
import { PerenualService } from "../lib/perenualService";
import { useLocation, useSearchParams, useNavigate } from "react-router-dom";
import { usePlantDoctor } from "../context/PlantDoctorContext";
import SmartImage from "./SmartImage";
import { useCachedShed } from "../hooks/useCachedShed";
import { scorePlantByPreferences } from "../hooks/useUserPreferences";
import { PlantDoctorService } from "../services/plantDoctorService";

interface Plant {
  id: number;
  common_name: string;
  scientific_name: string[];
  source: "manual" | "api";
  thumbnail_url?: string;
  is_archived: boolean;
  instance_count?: number;
}

type QueueItem = {
  id: string;
  name: string;
  source: "api" | "ai";
  status: "pending" | "processing" | "success" | "error";
  data: any;
  errorMsg?: string;
};

// --- Helpers for Master Plant Creation ---

export default function TheShed({ homeId }: { homeId: string }) {
  const { setPageContext, preferences } = usePlantDoctor();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const handledDeepLink = useRef("");

  // 🚀 SWR CACHE HOOK IMPLEMENTATION
  const {
    plants,
    locations,
    isInitialLoading: loading,
    isBackgroundSyncing,
    mutate: refreshShed, // Renamed to refreshShed for clarity in action handlers
  } = useCachedShed(homeId);

  const [actionLoading, setActionLoading] = useState(false);

  const [viewTab, setViewTab] = useState<"active" | "archived">("active");
  const [filterSource, setFilterSource] = useState<"all" | "manual" | "api">(
    "all",
  );
  const [sortMode, setSortMode] = useState<"alphabetical" | "preference">("alphabetical");
  const [searchQuery, setSearchQuery] = useState("");
  const [isPremium, setIsPremium] = useState(false);

  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [isAddingManual, setIsAddingManual] = useState(false);

  const [showBulkSearch, setShowBulkSearch] = useState(false);
  const [initialSearchTerm, setInitialSearchTerm] = useState("");
  const [initialCartItems, setInitialCartItems] = useState<any[]>([]);

  const [bulkQueue, setBulkQueue] = useState<QueueItem[]>([]);
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);

  const [selectedPlant, setSelectedPlant] = useState<Plant | null>(null);
  const [editingPlant, setEditingPlant] = useState<any | null>(null);

  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    type: "delete" | "archive" | "unarchive";
    plant: Plant | null;
  }>({ isOpen: false, type: "delete", plant: null });

  const gridRef = useRef<HTMLDivElement>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);

  useEffect(() => {
    setPageContext({
      action: isBulkProcessing
        ? "Processing Plant Imports"
        : "Browsing Master Plant Library",
      shedContext: {
        viewMode: viewTab,
        activeSearch: searchQuery || "None",
        totalLibraryCount: plants.length,
        visibleCount: plants.filter(
          (p) => p.is_archived === (viewTab === "archived"),
        ).length,
      },
    });
    return () => setPageContext(null);
  }, [
    viewTab,
    filterSource,
    searchQuery,
    plants,
    isBulkProcessing,
    setPageContext,
  ]);

  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const { data, error } = await supabase
            .from("user_profiles")
            .select("enable_perenual")
            .eq("uid", user.id)
            .single();
          if (!error && data) setIsPremium(!!data.enable_perenual);
        }
      } catch (err) {
        Logger.error("Failed to fetch user premium status", err);
      }
    };
    fetchUserProfile();
  }, []);

  const savePlantToDB = async (skeleton: any, fullCareData?: any) => {
    const manualId =
      Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 1000);
    skeleton.id = manualId;
    skeleton.home_id = homeId;

    const { data: savedPlant, error } = await supabase
      .from("plants")
      .insert([skeleton])
      .select()
      .single();
    if (error) throw error;

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
      harvestPeriods: normalizePeriods(
        fullCareData?.harvest_season || skeleton.harvest_season,
      ),
      pruningPeriods: normalizePeriods(
        fullCareData?.pruning_month || skeleton.pruning_month,
      ),
      wateringMinDays:
        fullCareData?.watering_min_days || skeleton?.watering_min_days || 3,
      wateringMaxDays:
        fullCareData?.watering_max_days || skeleton?.watering_max_days || 14,
    });

    if (newSchedules.length > 0)
      await supabase.from("plant_schedules").insert(newSchedules);
    return savedPlant;
  };

  const handleProceedToBulkAdd = async (selectedItems: any[]) => {
    setShowBulkSearch(false);
    if (!selectedItems.length) return;

    const newQueue: QueueItem[] = selectedItems.map((item) => {
      const isApi = item.type === "api";
      const realData = item.data;
      return {
        id: isApi
          ? typeof realData === "string"
            ? realData
            : String(realData.id)
          : realData,
        name: isApi
          ? typeof realData === "string"
            ? realData
            : realData.common_name
          : realData,
        source: item.type,
        status: "pending",
        data: realData,
      };
    });

    setBulkQueue(newQueue);
    setIsBulkProcessing(true);

    for (let i = 0; i < newQueue.length; i++) {
      const item = newQueue[i];
      setBulkQueue((prev) =>
        prev.map((q) =>
          q.id === item.id ? { ...q, status: "processing" } : q,
        ),
      );

      try {
        if (item.source === "api") {
          let pId, details, defaultImage;
          if (typeof item.data === "string") {
            const searchRes = await PerenualService.searchPlants(item.data);
            if (!searchRes || searchRes.length === 0)
              throw new Error("No exact match found in API");
            const topMatch = searchRes[0];
            pId = String(topMatch.id);
            defaultImage = topMatch.default_image;
            details = await PerenualService.getPlantDetails(topMatch.id);
          } else {
            pId = String(item.data.id);
            defaultImage = item.data.default_image;
            details = await PerenualService.getPlantDetails(item.data.id);
          }

          const { data: existing } = await supabase
            .from("plants")
            .select("id")
            .eq("home_id", homeId)
            .eq("perenual_id", pId)
            .maybeSingle();
          if (existing) throw new Error("Already in Shed");

          let imageUrl =
            details.image_url ||
            details.thumbnail_url ||
            defaultImage?.original_url ||
            defaultImage?.regular_url ||
            defaultImage?.thumbnail ||
            "";
          if (imageUrl.includes("upgrade_access")) imageUrl = "";
          if (imageUrl) {
            const { data: proxyData, error: proxyError } =
              await supabase.functions.invoke("image-proxy", {
                body: { imageUrl, plantName: details.common_name },
              });
            if (!proxyError && proxyData?.publicUrl)
              imageUrl = proxyData.publicUrl.includes("kong:8000")
                ? proxyData.publicUrl.replace(
                    "http://kong:8000",
                    "http://127.0.0.1:54321",
                  )
                : proxyData.publicUrl;
          }

          await savePlantToDB(
            {
              common_name: details.common_name,
              scientific_name: details.scientific_name,
              thumbnail_url: imageUrl,
              source: "api",
              perenual_id: pId,
            },
            details,
          );
        } else {
          const cleanName =
            typeof item.data === "string"
              ? item.data.split("(")[0].trim()
              : item.data.common_name;
          const aiData = await PlantDoctorService.generateCareGuide(cleanName);
          if (!aiData) throw new Error("AI failed to generate data");

          const extracted = aiData.plantData ? aiData.plantData : aiData;
          if (!extracted.common_name) extracted.common_name = cleanName;

          let imageUrl = extracted.thumbnail_url || "";
          if (imageUrl.includes("kong:8000"))
            imageUrl = imageUrl.replace(
              "http://kong:8000",
              "http://127.0.0.1:54321",
            );
          extracted.thumbnail_url = imageUrl;

          await savePlantToDB(
            { ...extracted, source: "manual", perenual_id: null },
            extracted,
          );
        }
        setBulkQueue((prev) =>
          prev.map((q) => (q.id === item.id ? { ...q, status: "success" } : q)),
        );
      } catch (err: any) {
        let errorMsg = err.message || "Failed";
        if (
          errorMsg.includes("Unexpected token") ||
          errorMsg.includes("Please Upg")
        ) {
          errorMsg = "Perenual API limit reached (Premium required).";
          toast.error(`Could not import ${item.name}: API limit reached.`);
        }
        setBulkQueue((prev) =>
          prev.map((q) =>
            q.id === item.id
              ? { ...q, status: "error", errorMsg: errorMsg }
              : q,
          ),
        );
      }
    }
    setIsBulkProcessing(false);
    refreshShed(); // 🚀 BACKGROUND SYNC
  };

  useEffect(() => {
    if (location.state && location.state.autoImport) {
      const { autoImport, source } = location.state;
      window.history.replaceState({}, document.title, location.pathname);
      const queueItems = autoImport.map((name: string) => ({
        type: source,
        data: name,
      }));
      setInitialCartItems(queueItems);
      setShowBulkSearch(true);
    }
  }, [location.state, location.pathname]);

  useEffect(() => {
    const currentUrl = location.pathname + location.search;
    if (handledDeepLink.current === currentUrl) return;

    if (location.pathname.includes("/shed/add/search")) {
      handledDeepLink.current = currentUrl;
      const query = searchParams.get("query") || "";
      setInitialSearchTerm(query);
      setShowBulkSearch(true);
    } else if (location.pathname.includes("/shed/add/manual")) {
      handledDeepLink.current = currentUrl;
      setIsAddingManual(true);
    }
  }, [location.pathname, location.search, searchParams]);

  const handleCloseModals = () => {
    setIsAddingManual(false);
    setShowBulkSearch(false);
    setInitialSearchTerm("");
    setInitialCartItems([]);
    handledDeepLink.current = "";
    navigate("/shed", { replace: true });
  };

  const executeArchiveToggle = async () => {
    const plant = confirmState.plant;
    if (!plant) return;
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from("plants")
        .update({ is_archived: !plant.is_archived })
        .eq("id", plant.id);
      if (error) throw error;
      toast.success(
        plant.is_archived ? "Restored to active" : "Moved to archive",
      );
      refreshShed(); // 🚀 BACKGROUND SYNC
    } catch (err: any) {
      toast.error(`Failed to update status: ${err.message}`);
    } finally {
      setActionLoading(false);
      setConfirmState({ isOpen: false, type: "delete", plant: null });
    }
  };

  const executeDelete = async () => {
    const plant = confirmState.plant;
    if (!plant) return;
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from("plants")
        .delete()
        .eq("id", plant.id);
      if (error) throw error;
      toast.success(`${plant.common_name} deleted.`);
      setConfirmState({ isOpen: false, type: "delete", plant: null });
      refreshShed(); // 🚀 BACKGROUND SYNC
    } catch (err: any) {
      toast.error(`Failed to delete: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleManualSave = async (plantData: any) => {
    setActionLoading(true);
    try {
      await savePlantToDB(
        { ...plantData, source: "manual", perenual_id: null },
        plantData,
      );
      toast.success(`${plantData.common_name} added to shed!`);
      handleCloseModals();
      refreshShed(); // 🚀 BACKGROUND SYNC
    } catch (err: any) {
      toast.error(`Failed to save: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdatePlant = async (updatedData: any) => {
    setActionLoading(true);
    try {
      const { instance_count, inventory_items, ...cleanPayload } = updatedData;
      const { error } = await supabase
        .from("plants")
        .update(cleanPayload)
        .eq("id", cleanPayload.id);
      if (error) throw error;
      toast.success(`${cleanPayload.common_name} updated!`);
      setEditingPlant(updatedData);
      refreshShed(); // 🚀 BACKGROUND SYNC
    } catch (err: any) {
      toast.error(`Update failed: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleAssign = async (assignmentData: any) => {
    if (!selectedPlant) return;
    setActionLoading(true);
    try {
      const { data: areaData, error: areaError } = await supabase
        .from("areas")
        .select("name, location_id, locations(name)")
        .eq("id", assignmentData.areaId)
        .single();
      if (areaError) throw areaError;

      const recordsToInsert = Array.from({
        length: assignmentData.quantity,
      }).map(() => ({
        home_id: homeId,
        plant_id: selectedPlant.id,
        plant_name: selectedPlant.common_name,
        status: assignmentData.status,
        location_id: areaData.location_id,
        location_name: areaData.locations?.name || "Unknown Location",
        area_id: assignmentData.areaId,
        area_name: areaData.name,
        planted_at:
          assignmentData.isPlanted && !assignmentData.isEstablished
            ? assignmentData.plantedDate
            : null,
        is_established: assignmentData.isEstablished,
        growth_state: assignmentData.isPlanted
          ? assignmentData.growthState
          : null,
        identifier: `${selectedPlant.common_name} #${Math.floor(
          Math.random() * 10000,
        )
          .toString()
          .padStart(4, "0")}`,
      }));

      const { data: insertedItems, error: insertError } = await supabase
        .from("inventory_items")
        .insert(recordsToInsert)
        .select();
      if (insertError) throw insertError;

      const newInventoryIds = insertedItems.map((item: any) => item.id);

      if (
        assignmentData.smartSchedules &&
        assignmentData.smartSchedules.length > 0 &&
        insertedItems
      ) {
        const tasksToInsert: any[] = [];
        assignmentData.smartSchedules.forEach((schedule: any) => {
          schedule.phases.forEach((phase: any) => {
            const formattedSteps = phase.steps
              .map((s: string, i: number) => `${i + 1}. ${s}`)
              .join("\n");
            tasksToInsert.push({
              home_id: homeId,
              location_id: areaData.location_id,
              area_id: assignmentData.areaId,
              inventory_item_ids: newInventoryIds,
              type: "Planting",
              title: `${phase.phase_name} (${selectedPlant.common_name} x${assignmentData.quantity})`,
              description: `Method: ${schedule.method}\nPhase: ${phase.phase_name}\n\nInstructions:\n${formattedSteps}\n\nReasoning:\n${schedule.reasoning}`,
              due_date: phase.recommended_date,
              status: "Pending",
            });
          });
        });
        await supabase.from("tasks").insert(tasksToInsert);
      }

      toast.success(`Successfully assigned ${assignmentData.quantity} plants!`);
      refreshShed(); // 🚀 BACKGROUND SYNC
      setSelectedPlant(null);

      return insertedItems;
    } catch (err: any) {
      toast.error(`Assignment failed: ${err.message}`);
      return null;
    } finally {
      setActionLoading(false);
    }
  };

  const filteredPlants = useMemo(() => {
    const base = plants.filter((p) => {
      if (viewTab === "active" && p.is_archived) return false;
      if (viewTab === "archived" && !p.is_archived) return false;
      if (filterSource !== "all" && p.source !== filterSource) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesCommon = p.common_name.toLowerCase().includes(query);
        const matchesScientific = p.scientific_name?.some((name) =>
          name.toLowerCase().includes(query),
        );
        if (!matchesCommon && !matchesScientific) return false;
      }
      return true;
    });

    if (sortMode === "preference" && preferences.length > 0) {
      return [...base].sort((a, b) => {
        const scoreA = scorePlantByPreferences(a.common_name || "", a.scientific_name?.[0] || "", preferences);
        const scoreB = scorePlantByPreferences(b.common_name || "", b.scientific_name?.[0] || "", preferences);
        return scoreB - scoreA;
      });
    }
    return base;
  }, [plants, viewTab, filterSource, searchQuery, sortMode, preferences]);

  const handleGridKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (filteredPlants.length === 0) return;
      const cols = window.innerWidth >= 1280 ? 4 : window.innerWidth >= 1024 ? 3 : window.innerWidth >= 640 ? 2 : 1;
      const maxIndex = filteredPlants.length - 1;
      let newIndex = focusedIndex;

      switch (e.key) {
        case "ArrowRight":
          e.preventDefault();
          newIndex = Math.min(focusedIndex + 1, maxIndex);
          break;
        case "ArrowLeft":
          e.preventDefault();
          newIndex = Math.max(focusedIndex - 1, 0);
          break;
        case "ArrowDown":
          e.preventDefault();
          newIndex = Math.min(focusedIndex + cols, maxIndex);
          break;
        case "ArrowUp":
          e.preventDefault();
          newIndex = Math.max(focusedIndex - cols, 0);
          break;
        case "Home":
          e.preventDefault();
          newIndex = 0;
          break;
        case "End":
          e.preventDefault();
          newIndex = maxIndex;
          break;
        default:
          return;
      }

      setFocusedIndex(newIndex);
      const cards = gridRef.current?.querySelectorAll("[data-plant-card]");
      if (cards && cards[newIndex]) {
        (cards[newIndex] as HTMLElement).focus();
      }
    },
    [filteredPlants.length, focusedIndex]
  );

  useEffect(() => {
    setFocusedIndex(0);
  }, [filteredPlants.length]);

  if (loading)
    return (
      <div className="max-w-7xl mx-auto h-full flex flex-col p-4 md:p-8">
        <div className="flex items-center gap-4 mb-10">
          <div className="h-10 w-48 bg-rhozly-surface-low rounded-xl animate-pulse" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-32">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="bg-rhozly-surface-lowest rounded-[2.5rem] overflow-hidden border border-rhozly-outline/20 shadow-sm animate-pulse"
            >
              <div className="h-44 bg-rhozly-surface-low" />
              <div className="p-6 space-y-3">
                <div className="h-6 bg-rhozly-surface-low rounded-lg w-3/4" />
                <div className="h-4 bg-rhozly-surface-low rounded-lg w-1/2" />
                <div className="pt-5 border-t border-rhozly-outline/10 flex items-center justify-between">
                  <div className="h-10 bg-rhozly-surface-low rounded-lg w-16" />
                  <div className="h-12 bg-rhozly-surface-low rounded-2xl w-24" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );

  return (
    <>
      <div className="max-w-7xl mx-auto h-full flex flex-col p-4 md:p-8 animate-in fade-in duration-700 relative">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 mb-10">
          <div>
            <div className="flex items-center gap-4">
              <h2 className="text-4xl font-black font-display text-rhozly-on-surface">
                The Shed
              </h2>
              {/* 🚀 SILENT SYNC INDICATOR */}
              {isBackgroundSyncing && (
                <Loader2
                  className="animate-spin text-rhozly-on-surface/20"
                  size={20}
                />
              )}
              <div className="relative ml-auto xl:ml-0">
                <button
                  onClick={() => setIsAddMenuOpen(!isAddMenuOpen)}
                  aria-label={isAddMenuOpen ? "Close add menu" : "Open add menu"}
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-sm border ${isAddMenuOpen ? "bg-white text-rhozly-primary border-rhozly-primary rotate-45" : "bg-rhozly-primary text-white border-transparent hover:scale-110 active:scale-95"}`}
                >
                  <Plus size={20} strokeWidth={3} />
                </button>
                {isAddMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setIsAddMenuOpen(false)}
                    />
                    <div className="absolute top-full left-0 mt-3 w-64 bg-white rounded-2xl shadow-2xl border border-rhozly-outline/10 p-2 z-50 animate-in fade-in slide-in-from-top-2 origin-top-left">
                      <button
                        onClick={() => {
                          setShowBulkSearch(true);
                          setIsAddMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-rhozly-primary/5 transition-colors text-left"
                      >
                        <ListPlus size={18} className="text-rhozly-primary" />
                        <span className="text-sm font-black text-rhozly-on-surface">
                          Search & Import
                        </span>
                      </button>
                      <button
                        onClick={() => {
                          setIsAddingManual(true);
                          setIsAddMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-rhozly-primary/5 transition-colors text-left"
                      >
                        <Edit3
                          size={18}
                          className="text-rhozly-on-surface/60"
                        />
                        <span className="text-sm font-black text-rhozly-on-surface">
                          Manual Entry
                        </span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
            <p className="text-sm font-bold text-rhozly-on-surface/40 uppercase tracking-widest mt-1">
              Your Master Plant Library
            </p>
          </div>
          <div className="flex flex-col gap-4">
            <div className="relative flex items-center">
              <Search
                className="absolute left-4 text-rhozly-on-surface/40"
                size={16}
              />
              <input
                type="text"
                placeholder="Search plants..."
                aria-label="Search your plant library"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-10 py-3 bg-rhozly-surface-lowest border border-rhozly-outline/20 rounded-2xl text-sm font-bold outline-none focus:border-rhozly-primary transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  aria-label="Clear search"
                  className="absolute right-4 text-rhozly-on-surface/40 hover:text-rhozly-on-surface"
                >
                  <X size={16} />
                </button>
              )}
            </div>
            <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3">
              <div className="bg-rhozly-surface-low p-1.5 rounded-2xl flex gap-1 border border-rhozly-outline/10">
                {["active", "archived"].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setViewTab(tab as any)}
                    className={`flex-1 sm:flex-none px-6 py-2 rounded-xl text-sm font-black transition-all ${viewTab === tab ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-on-surface/40 hover:text-rhozly-on-surface"}`}
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>
              <select
                value={filterSource}
                onChange={(e) => setFilterSource(e.target.value as any)}
                aria-label="Filter by source"
                className="bg-rhozly-surface-lowest border border-rhozly-outline/20 rounded-xl px-4 py-3 text-sm font-bold outline-none cursor-pointer"
              >
                <option value="all">All Sources</option>
                <option value="manual">Manual</option>
                <option value="api">API / AI</option>
              </select>
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as any)}
                aria-label="Sort plants"
                className="bg-rhozly-surface-lowest border border-rhozly-outline/20 rounded-xl px-4 py-3 text-sm font-bold outline-none cursor-pointer"
              >
                <option value="alphabetical">A – Z</option>
                <option value="preference">Best Match</option>
              </select>
            </div>
          </div>
        </div>

        <div
          ref={gridRef}
          onKeyDown={handleGridKeyDown}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-32"
        >
          {filteredPlants.length === 0 ? (
            <div className="col-span-full min-h-[400px] flex flex-col items-center justify-center text-rhozly-on-surface/40 py-16">
              <div className="relative mb-6">
                <div className="absolute inset-0 bg-rhozly-primary/5 blur-3xl rounded-full" />
                <Search size={64} className="relative opacity-30" strokeWidth={1.5} />
              </div>
              <h3 className="text-2xl font-black text-rhozly-on-surface/60 mb-2">
                {searchQuery ? "No matches found" : "No plants here"}
              </h3>
              <p className="text-sm font-bold text-rhozly-on-surface/40 max-w-xs text-center">
                {searchQuery
                  ? `Try adjusting your search term or filters`
                  : `Add plants to your library to get started`}
              </p>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="mt-6 px-6 py-3 bg-rhozly-primary text-white rounded-xl font-bold hover:scale-105 transition-transform"
                >
                  Clear Search
                </button>
              )}
            </div>
          ) : (
            filteredPlants.map((plant, index) => (
              <div
                key={plant.id}
                data-plant-card
                tabIndex={index === focusedIndex ? 0 : -1}
                onClick={() => setEditingPlant(plant)}
                onFocus={() => setFocusedIndex(index)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setEditingPlant(plant);
                  }
                }}
                role="button"
                aria-label={`View details for ${plant.common_name}`}
                className="bg-rhozly-surface-lowest rounded-[2.5rem] overflow-hidden border border-rhozly-outline/20 shadow-sm group flex flex-col cursor-pointer hover:border-rhozly-primary/30 focus:outline-none focus:ring-2 focus:ring-rhozly-primary focus:ring-offset-2 transition-all"
              >
                <div className="h-44 relative overflow-hidden bg-rhozly-primary/5">
                  <SmartImage
                    src={
                      plant.thumbnail_url ||
                      "https://images.unsplash.com/photo-1466692476868-aef1dfb1e735?auto=format&fit=crop&w=400"
                    }
                    alt={plant.common_name}
                    loading="lazy" // 🚀 STOPS IMAGE BOTTLENECKING
                    decoding="async" // 🚀 STOPS MAIN THREAD FREEZING
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-4 left-4">
                    <span className="bg-white/90 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-black uppercase text-rhozly-primary flex items-center gap-1.5 shadow-sm border border-white/20">
                      <Database size={10} /> {plant.source}
                    </span>
                  </div>
                  <div className="absolute top-4 right-4 flex gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmState({
                          isOpen: true,
                          type: plant.is_archived ? "unarchive" : "archive",
                          plant,
                        });
                      }}
                      aria-label={plant.is_archived ? `Restore ${plant.common_name}` : `Archive ${plant.common_name}`}
                      className="w-9 h-9 bg-white/90 backdrop-blur-md rounded-xl text-rhozly-on-surface/60 hover:text-orange-600 flex items-center justify-center shadow-md transition-all active:scale-90"
                    >
                      {plant.is_archived ? (
                        <ArchiveRestore size={16} />
                      ) : (
                        <Archive size={16} />
                      )}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmState({
                          isOpen: true,
                          type: "delete",
                          plant,
                        });
                      }}
                      aria-label={`Delete ${plant.common_name}`}
                      className="w-9 h-9 bg-white/90 backdrop-blur-md rounded-xl text-rhozly-on-surface/60 hover:text-red-600 flex items-center justify-center shadow-md transition-all active:scale-90"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <div className="p-6">
                  <h3 className="text-xl font-black text-rhozly-on-surface leading-tight mb-1">
                    {plant.common_name}
                  </h3>
                  <p className="text-xs font-bold text-rhozly-on-surface/40 italic truncate">
                    {plant.scientific_name?.[0] || "Unknown Species"}
                  </p>
                  {scorePlantByPreferences(plant.common_name || "", plant.scientific_name?.[0] || "", preferences) > 0 && (
                    <span className="inline-flex items-center gap-1 mt-2 mb-2 text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                      <Sparkles size={9} /> Matches your taste
                    </span>
                  )}
                  <div className="mt-auto pt-5 border-t border-rhozly-outline/10 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-black text-rhozly-on-surface/30 uppercase tracking-widest">
                        In Home
                      </p>
                      <p className="text-2xl font-black text-rhozly-primary">
                        {plant.instance_count}
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedPlant(plant);
                      }}
                      className="h-12 px-5 rounded-2xl bg-rhozly-primary/10 text-rhozly-primary flex items-center justify-center gap-2 hover:bg-rhozly-primary hover:text-white transition-all shadow-sm"
                    >
                      <MapPin size={18} />
                      <span className="text-[10px] font-black uppercase tracking-widest">
                        Assign
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {typeof document !== "undefined" &&
        createPortal(
          <>
            {bulkQueue.length > 0 && (
              <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-rhozly-bg/95 backdrop-blur-xl animate-in zoom-in-95">
                <div className="bg-rhozly-surface-lowest w-full max-w-md rounded-[3rem] p-8 shadow-2xl border border-rhozly-outline/20 flex flex-col max-h-[85vh]">
                  <div className="flex justify-between items-start mb-8">
                    <div>
                      <h3 className="text-3xl font-black">Importing Plants</h3>
                      <p className="text-[10px] font-black text-rhozly-on-surface/40 uppercase tracking-widest mt-1">
                        {isBulkProcessing
                          ? "Processing your queue..."
                          : "Import Complete!"}
                      </p>
                    </div>
                    {!isBulkProcessing && (
                      <button
                        onClick={() => setBulkQueue([])}
                        className="p-3 bg-rhozly-surface-low rounded-2xl hover:scale-110 transition-transform"
                      >
                        <X size={24} />
                      </button>
                    )}
                  </div>
                  <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-2">
                    {bulkQueue.map((item) => (
                      <div
                        key={item.id}
                        className={`flex items-center justify-between p-4 bg-white border rounded-2xl shadow-sm transition-all ${item.status === "processing" ? "border-rhozly-primary ring-1 ring-rhozly-primary/20" : "border-rhozly-outline/10"}`}
                      >
                        <div className="flex items-center gap-4">
                          <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${item.status === "pending" ? "bg-gray-100 text-gray-400" : item.status === "processing" ? "bg-rhozly-primary/10 text-rhozly-primary" : item.status === "success" ? "bg-green-100 text-green-500" : "bg-red-100 text-red-500"}`}
                          >
                            {item.status === "pending" && <Clock size={18} />}
                            {item.status === "processing" && (
                              <Loader2 size={18} className="animate-spin" />
                            )}
                            {item.status === "success" && (
                              <CheckSquare2 size={18} />
                            )}
                            {item.status === "error" && (
                              <AlertCircle size={18} />
                            )}
                          </div>
                          <div>
                            <p className="font-bold text-base text-rhozly-on-surface leading-tight">
                              {item.name}
                            </p>
                            {item.errorMsg ? (
                              <p className="text-[10px] text-red-500 font-bold uppercase tracking-widest mt-1">
                                {item.errorMsg}
                              </p>
                            ) : (
                              <p className="text-[10px] text-rhozly-on-surface/40 font-black uppercase tracking-widest mt-1">
                                {item.source === "api"
                                  ? "Perenual Database"
                                  : "AI Generated"}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {!isBulkProcessing && (
                    <button
                      onClick={() => setBulkQueue([])}
                      className="mt-8 w-full py-4 bg-rhozly-primary text-white rounded-2xl font-black shadow-xl hover:scale-105 transition-transform"
                    >
                      Return to Shed
                    </button>
                  )}
                </div>
              </div>
            )}

            {confirmState.isOpen && confirmState.plant && (
              <ConfirmModal
                isOpen={confirmState.isOpen}
                isLoading={actionLoading}
                onClose={() =>
                  setConfirmState({
                    isOpen: false,
                    type: "delete",
                    plant: null,
                  })
                }
                onConfirm={
                  confirmState.type === "delete"
                    ? executeDelete
                    : executeArchiveToggle
                }
                title={
                  confirmState.type === "delete"
                    ? "Delete Plant"
                    : confirmState.type === "archive"
                      ? "Archive Plant"
                      : "Restore Plant"
                }
                description={
                  confirmState.type === "delete"
                    ? `Permanently delete ${confirmState.plant.common_name}?`
                    : confirmState.type === "archive"
                      ? `Archive ${confirmState.plant.common_name}?`
                      : `Restore ${confirmState.plant.common_name}?`
                }
                confirmText={
                  confirmState.type === "delete"
                    ? "Delete"
                    : confirmState.type === "archive"
                      ? "Archive"
                      : "Restore"
                }
                isDestructive={confirmState.type === "delete"}
              />
            )}
            {selectedPlant && (
              <PlantAssignmentModal
                plant={selectedPlant}
                locations={locations}
                onAssign={handleAssign}
                onClose={() => setSelectedPlant(null)}
                isAssigning={actionLoading}
                homeId={homeId}
              />
            )}
            {isAddingManual && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-rhozly-bg/90 backdrop-blur-xl animate-in zoom-in-95 duration-300">
                <div className="bg-rhozly-surface-lowest w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-[3rem] p-6 shadow-2xl border border-rhozly-outline/20 custom-scrollbar">
                  <div className="flex justify-between items-center mb-8">
                    <div>
                      <h3 className="text-3xl font-black">Manual Entry</h3>
                      <p className="text-xs font-bold text-rhozly-on-surface/40 uppercase tracking-widest mt-1">
                        Add to Shed
                      </p>
                    </div>
                    <button
                      onClick={handleCloseModals}
                      className="p-3 bg-rhozly-surface-low rounded-2xl hover:scale-110 transition-transform"
                    >
                      <X size={24} />
                    </button>
                  </div>
                  <ManualPlantCreation
                    onSave={handleManualSave}
                    onCancel={handleCloseModals}
                    isSaving={actionLoading}
                  />
                </div>
              </div>
            )}
            {showBulkSearch && (
              <BulkSearchModal
                homeId={homeId}
                isPremium={isPremium}
                initialSearchTerm={initialSearchTerm}
                initialCartItems={initialCartItems}
                onClose={handleCloseModals}
                onProceedToBulkAdd={handleProceedToBulkAdd}
              />
            )}
            {editingPlant && (
              <PlantEditModal
                homeId={homeId}
                plant={editingPlant}
                onSave={handleUpdatePlant}
                onClose={() => setEditingPlant(null)}
                isSaving={actionLoading}
              />
            )}
          </>,
          document.body,
        )}
    </>
  );
}

function ConfirmModal({
  isOpen,
  isLoading,
  onClose,
  onConfirm,
  title,
  description,
  confirmText,
  isDestructive,
}: any) {
  const modalRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
      if (e.key === "Tab") {
        const modal = modalRef.current;
        if (!modal) return;

        const focusableElements = modal.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement?.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement?.focus();
          }
        }
      }
    };

    cancelButtonRef.current?.focus();
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        aria-describedby="confirm-modal-description"
        className="bg-white p-6 rounded-3xl w-full max-w-sm"
      >
        <h3 id="confirm-modal-title" className="font-black text-lg mb-2">
          {title}
        </h3>
        <p id="confirm-modal-description" className="text-sm font-bold text-gray-500 mb-6">
          {description}
        </p>
        <div className="flex gap-3">
          <button
            ref={cancelButtonRef}
            onClick={onClose}
            className="flex-1 py-3 rounded-xl font-bold bg-gray-100 hover:bg-gray-200"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={`flex-1 py-3 rounded-xl font-bold text-white ${isDestructive ? "bg-red-500 hover:bg-red-600" : "bg-rhozly-primary"}`}
          >
            {isLoading ? (
              <Loader2 className="animate-spin mx-auto" size={18} />
            ) : (
              confirmText
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
