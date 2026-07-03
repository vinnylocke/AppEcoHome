import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../lib/supabase";
import { isTaskOverdueToday, isTaskVisibleOnDate } from "../lib/taskFilters";
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
  RefreshCw,
  LayoutGrid,
  Sun,
  Square as SquareIcon,
  FileText,
  Library,
  Heart,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { Logger } from "../lib/errorHandler";
import ManualPlantCreation from "./ManualPlantCreation";
import PlantEditModal from "./PlantEditModal";
import PlantAssignmentModal from "./PlantAssignmentModal";
import BulkAssignModal from "./BulkAssignModal";
import BulkSearchModal from "./BulkSearchModal";
import BulkPastePlantsModal from "./BulkPastePlantsModal";
import PlantSourcePicker from "./PlantSourcePicker";
import { PerenualService } from "../lib/perenualService";
import { VerdantlyService } from "../lib/verdantlyService";
import { useLocation, useSearchParams, useNavigate } from "react-router-dom";
import { usePlantDoctor } from "../context/PlantDoctorContext";
import SmartImage from "./SmartImage";
import MultiImageGallery from "./MultiImageGallery";
import { useCachedShed } from "../hooks/useCachedShed";
import { useAiPlantFreshness } from "../hooks/useAiPlantFreshness";
import UpdatedChip from "./aiPlants/UpdatedChip";
import { scorePlantByPreferences } from "../hooks/useUserPreferences";
import { PlantDoctorService } from "../services/plantDoctorService";
import { logEvent, EVENT } from "../events/registry";
import { derivePlantLabels } from "../lib/plantLabels";
import { saveToShed as saveToShedLib } from "../lib/saveToShed";
import { recordSignal } from "../onboarding/signals";
import { usePermissions } from "../context/HomePermissionsContext";
import { useBetaFeedbackContext } from "../context/BetaFeedbackContext";
import { searchWikimediaImages, searchPixabayImages } from "../lib/wikipedia";
import NurseryTab from "./nursery/NurseryTab";
import FavouritePlantsGrid from "./favourites/FavouritePlantsGrid";
import {
  buildForkRow,
  canonicalPlantRefId,
  isSourceLockedForTier,
  lockedSourceMessage,
} from "../lib/favouriteIdentity";
import {
  favouritePlant,
  forkPlantForHomeEdit,
  listFavouritePlants,
  unfavouritePlantByRef,
} from "../services/favouritesService";
import type { FavouritePlant } from "../types";
import InfoTooltip from "./InfoTooltip";
import EmptyState from "./shared/EmptyState";
import AssistantCard from "./AssistantCard";
import { getLocalDateString } from "../lib/taskEngine";

async function fetchFirstAvailableImage(plantName: string): Promise<string> {
  const [wiki, pixabay] = await Promise.all([
    searchWikimediaImages(plantName).catch(() => []),
    searchPixabayImages(plantName).catch(() => []),
  ]);
  return wiki[0]?.thumbUrl || pixabay[0]?.thumbUrl || "";
}

interface Plant {
  id: number;
  common_name: string;
  scientific_name: string[];
  source: "manual" | "api" | "ai" | "verdantly";
  thumbnail_url?: string;
  is_archived: boolean;
  instance_count?: number;
  plant_metadata?: Record<string, any> | null;
}

type QueueItem = {
  id: string;
  name: string;
  source: "api" | "ai" | "verdantly";
  status: "pending" | "processing" | "success" | "error";
  data: any;
  errorMsg?: string;
};

// --- Helpers for Master Plant Creation ---

export default function TheShed({ homeId, aiEnabled = false, perenualEnabled = false }: { homeId: string; aiEnabled?: boolean; perenualEnabled?: boolean }) {
  const { can } = usePermissions();
  const { setPageContext, setIsOpen, preferences } = usePlantDoctor();
  const { requestFeedback } = useBetaFeedbackContext();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const handledDeepLink = useRef("");

  // 🚀 SWR CACHE HOOK IMPLEMENTATION
  const {
    plants,
    locations,
    isInitialLoading: loading,
    isBackgroundSyncing,
    isError: shedFetchError,
    mutate: refreshShed, // Renamed to refreshShed for clarity in action handlers
    setPlants,
  } = useCachedShed(homeId);

  // Wave 5 — AI catalogue freshness state, keyed by shed plant id. Resolves
  // shallow forks via `forked_from_plant_id` so the chip's source of truth
  // is always the global catalogue row.
  const { byPlantId: freshnessByPlantId } = useAiPlantFreshness(
    plants as Array<{
      id: number;
      source: string | null;
      home_id: string | null;
      forked_from_plant_id: number | null;
      overridden_fields: string[] | null;
    }>,
  );

  const [actionLoading, setActionLoading] = useState(false);
  const [archivingPlantId, setArchivingPlantId] = useState<number | null>(null);

  const [viewTab, setViewTab] = useState<"active" | "archived">("active");
  const [filterSource, setFilterSource] = useState<"all" | "manual" | "api" | "ai">(
    "all",
  );
  const [sortMode, setSortMode] = useState<"alphabetical" | "preference">("alphabetical");
  const [badgeGuideShown, setBadgeGuideShown] = useState(
    () => localStorage.getItem("rhozly_badge_guide_shown") === "true",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [smartFilter, setSmartFilter] = useState<"none" | "unassigned" | "in-plan">("none");
  const [selectMode, setSelectMode] = useState(false);
  const [selectedPlantIds, setSelectedPlantIds] = useState<Set<number>>(new Set());
  const [bulkActionState, setBulkActionState] = useState<"idle" | "archiving" | "deleting">("idle");
  const [bulkDeleteState, setBulkDeleteState] = useState<{ open: boolean; instanceCount: number }>({ open: false, instanceCount: 0 });
  const [showBulkAssign, setShowBulkAssign] = useState(false);
  const [showBulkSearch, setShowBulkSearch] = useState(false);
  // UX review 2026-06-15 item 4.1 — bulk paste a plant list. Different from
  // showBulkSearch (which opens the per-row library/AI search modal).
  const [showBulkPaste, setShowBulkPaste] = useState(false);
  const [planMembership, setPlanMembership] = useState<Set<number>>(new Set());
  const [unassignedPlantIds, setUnassignedPlantIds] = useState<Set<number>>(new Set());
  // Contextual badges per plant — built from active task data + ailments
  const [plantTaskStatus, setPlantTaskStatus] = useState<Map<number, { overdueCount: number; dueTodayCount: number; harvestDue: boolean; ailmentCount: number }>>(new Map());
  const [initialSearchTerm, setInitialSearchTerm] = useState("");
  const [initialCartItems, setInitialCartItems] = useState<any[]>([]);
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [sourcePickerPlants, setSourcePickerPlants] = useState<string[]>([]);

  const [bulkQueue, setBulkQueue] = useState<QueueItem[]>([]);
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);

  const [selectedPlant, setSelectedPlant] = useState<Plant | null>(null);
  const [editingPlant, setEditingPlant] = useState<any | null>(null);
  // Which tab PlantEditModal opens on — "care" for a normal tile tap,
  // "light" when launched from the tile's light icon.
  const [editingPlantTab, setEditingPlantTab] = useState<string>("care");

  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    type: "delete" | "archive" | "unarchive";
    plant: Plant | null;
    inventoryCount?: number;
  }>({ isOpen: false, type: "delete", plant: null });

  const gridRef = useRef<HTMLDivElement>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);
  // Plants / Nursery toggle — defaults to the existing Plants grid; "nursery"
  // swaps the body to the seed-packet list (kept inside The Shed so the user
  // doesn't have to learn a new route).
  const [view, setView] = useState<"plants" | "nursery">("plants");

  // ── Cross-home favourites (Phase 1 — plants) ──────────────────────────────
  // Scope pill: "Home" = today's home-scoped grid; "Favourites" = the user's
  // cross-home list. Deep link `/shed?scope=favourites` — a NEW param; the
  // existing GardenHub `?tab=` / `?open=` / `?query=` params are untouched.
  const scope: "home" | "favourites" =
    searchParams.get("scope") === "favourites" ? "favourites" : "home";
  const switchScope = (next: "home" | "favourites") => {
    setSearchParams((p) => {
      const n = new URLSearchParams(p);
      if (next === "favourites") n.set("scope", "favourites");
      else n.delete("scope");
      return n;
    }, { replace: true });
  };

  const [favourites, setFavourites] = useState<FavouritePlant[]>([]);
  const [favouritesLoading, setFavouritesLoading] = useState(true);
  const [homeName, setHomeName] = useState<string | null>(null);
  const [togglingFavouriteRef, setTogglingFavouriteRef] = useState<number | null>(null);

  const loadFavourites = useCallback(async () => {
    try {
      const rows = await listFavouritePlants();
      setFavourites(rows);
    } catch (err) {
      Logger.warn("Could not load favourites", { err });
    } finally {
      setFavouritesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFavourites();
  }, [loadFavourites]);

  useEffect(() => {
    if (!homeId) return;
    supabase
      .from("homes")
      .select("name")
      .eq("id", homeId)
      .maybeSingle()
      .then(({ data }) => setHomeName(data?.name ?? null));
  }, [homeId]);

  /** Canonical reference ids of the user's favourites — drives heart fill. */
  const favouriteRefIds = useMemo(
    () =>
      new Set(
        favourites.map((f) => f.plant_id).filter((id): id is number => id != null),
      ),
    [favourites],
  );

  const handleToggleFavourite = async (plant: any) => {
    const refId = canonicalPlantRefId(plant);
    if (togglingFavouriteRef === refId) return;
    setTogglingFavouriteRef(refId);
    const isFavourited = favouriteRefIds.has(refId);
    try {
      if (isFavourited) {
        // Optimistic remove.
        setFavourites((prev) => prev.filter((f) => f.plant_id !== refId));
        await unfavouritePlantByRef(refId);
        logEvent(EVENT.PLANT_UNFAVOURITED, { plant_ref_id: refId, source: plant.source });
        toast.success("Removed from favourites.");
      } else {
        const row = await favouritePlant(plant, homeId);
        setFavourites((prev) => [row, ...prev.filter((f) => f.id !== row.id)]);
        logEvent(EVENT.PLANT_FAVOURITED, { plant_ref_id: refId, source: plant.source });
        toast.success("Saved to your favourites — it follows you across homes.");
      }
      loadFavourites();
    } catch (err: any) {
      loadFavourites(); // roll back optimistic state
      if (String(err?.message ?? "").includes("tier_locked_source")) {
        toast.error(lockedSourceMessage(plant.source));
      } else {
        Logger.error("Favourite toggle failed", err, { plantId: plant.id }, "Could not update favourites — please try again.");
      }
    } finally {
      setTogglingFavouriteRef(null);
    }
  };

  // Copy-on-write save from PlantEditModal ("Save as my own copy"): fork to a
  // NEW manual row, re-point this home's usage, delete the replaced original.
  const handleForkPlant = async (payload: any) => {
    if (!editingPlant) return;
    setActionLoading(true);
    try {
      const forkRow = buildForkRow(payload, editingPlant);
      const fork = await forkPlantForHomeEdit(editingPlant.id, forkRow, homeId);
      logEvent(EVENT.PLANT_FORKED_ON_EDIT, {
        original_plant_id: editingPlant.id,
        fork_plant_id: (fork as any).id,
        original_source: editingPlant.source,
      });
      toast.success(`Saved as your own copy of ${payload.common_name}.`);
      setEditingPlant(null);
      setEditingPlantTab("care");
      refreshShed();
      loadFavourites();
    } catch (err: any) {
      Logger.error("Save-as-copy failed", err, { plantId: editingPlant.id }, `Could not save your copy: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

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

  const savePlantToDB = async (skeleton: any, fullCareData?: any) => {
    const { row } = await saveToShedLib(skeleton, fullCareData, homeId);
    return row;
  };

  const handleProceedToBulkAdd = async (selectedItems: any[]) => {
    setShowBulkSearch(false);
    if (!selectedItems.length) return;

    const newQueue: QueueItem[] = selectedItems.map((item) => {
      const isDb = item.type === "api" || item.type === "verdantly";
      const realData = item.data;
      return {
        id: isDb
          ? typeof realData === "string"
            ? realData
            : String(realData.id)
          : realData,   // AI: realData is already the string match identifier
        name: isDb
          ? typeof realData === "string"
            ? realData
            : realData.common_name
          : realData,   // AI: realData is already the string match identifier
        source: item.type,
        status: "pending",
        data: realData,
        preloadedDetails: item.preloadedDetails ?? undefined,
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
        } else if (item.source === "verdantly") {
          const verdantlyId = item.data.verdantly_id ?? String(item.data.id);

          const { data: existing } = await supabase
            .from("plants")
            .select("id")
            .eq("home_id", homeId)
            .eq("verdantly_id", verdantlyId)
            .maybeSingle();
          if (existing) throw new Error("Already in Shed");

          const details = await VerdantlyService.getPlantDetails(verdantlyId);

          let imageUrl = details.image_url || details.thumbnail_url || "";
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
          if (!imageUrl) imageUrl = await fetchFirstAvailableImage(item.data.common_name);

          await savePlantToDB(
            {
              common_name: details.common_name,
              scientific_name: details.scientific_name,
              thumbnail_url: imageUrl,
              source: "verdantly",
              verdantly_id: verdantlyId,
              perenual_id: null,
              plant_metadata: (details as any).plant_metadata ?? null,
            },
            details,
          );
        } else {
          const cleanName =
            typeof item.data === "string"
              ? item.data.split("(")[0].trim()
              : item.data.common_name;

          const { data: existingAi } = await supabase
            .from("plants")
            .select("id")
            .eq("home_id", homeId)
            .ilike("common_name", cleanName)
            .limit(1);
          if (existingAi && existingAi.length > 0) {
            throw new Error(`"${cleanName}" is already in your shed.`);
          }

          let extracted: any;
          if ((item as any).preloadedDetails) {
            const pd = (item as any).preloadedDetails;
            extracted = {
              common_name:     pd.common_name ?? cleanName,
              scientific_name: pd.scientific_name,
              description:     pd.description,
              sunlight:        pd.sunlight,
              watering:        pd.watering,
              watering_min_days: pd.watering_min_days,
              watering_max_days: pd.watering_max_days,
              is_edible:       pd.is_edible,
              is_toxic_pets:   pd.is_toxic_pets,
              is_toxic_humans: pd.is_toxic_humans,
              attracts:        pd.attracts,
              care_level:      pd.care_level,
              cycle:           pd.cycle,
              maintenance:     pd.maintenance,
              growth_rate:     pd.growth_rate,
              flowering_season: pd.flowering_season,
              harvest_season:  pd.harvest_season,
              pruning_month:   pd.pruning_month,
              propagation:     pd.propagation,
              drought_tolerant: pd.drought_tolerant,
              tropical:        pd.tropical,
              indoor:          pd.indoor,
              cuisine:         pd.cuisine,
              medicinal:       pd.medicinal,
              plant_type:      pd.plant_type,
              thumbnail_url:   pd.thumbnail_url,
            };
          } else {
            const aiData = await PlantDoctorService.generateCareGuide(cleanName);
            if (!aiData) throw new Error("AI failed to generate data");
            extracted = aiData.plantData ? aiData.plantData : aiData;
          }
          if (!extracted.common_name) extracted.common_name = cleanName;

          let imageUrl = extracted.thumbnail_url || "";
          if (imageUrl.includes("kong:8000"))
            imageUrl = imageUrl.replace(
              "http://kong:8000",
              "http://127.0.0.1:54321",
            );
          if (!imageUrl) imageUrl = await fetchFirstAvailableImage(cleanName);
          extracted.thumbnail_url = imageUrl;

          // Wave 3 — when the AI care guide came from (or was just written to)
          // the global catalogue, record the parent link on this home-scoped
          // row so later waves can collapse "shallow forks" (no user edits) and
          // repoint inventory at the global plant instead.
          const aiSkeleton: Record<string, unknown> = {
            ...extracted,
            source: "ai",
            perenual_id: null,
          };
          const pd = (item as any).preloadedDetails;
          if (pd?.db_plant_id != null) {
            aiSkeleton.forked_from_plant_id = pd.db_plant_id;
            aiSkeleton.overridden_fields = [];
          }
          await savePlantToDB(aiSkeleton, extracted);
          // Post-Wave-7 hotfix — seed user_plant_ack at the global's current
          // freshness_version so the freshness chip doesn't fire on a
          // just-added plant. Mirrors what fork_ai_plant_for_home does
          // internally; we have to do it client-side because Wave 3 chose to
          // create the home-scoped row directly rather than via the RPC.
          if (pd?.db_plant_id != null) {
            const { data: userData } = await supabase.auth.getUser();
            const callerId = userData?.user?.id;
            if (callerId) {
              await supabase.from("user_plant_ack").upsert(
                {
                  user_id: callerId,
                  plant_id: pd.db_plant_id,
                  seen_freshness_version: pd.freshness_version ?? 1,
                  acked_at: new Date().toISOString(),
                },
                { onConflict: "user_id,plant_id" },
              );
            }
          }
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
          Logger.error("Perenual API limit reached during bulk import", err, { itemName: item.name }, `API limit reached — ${item.name} could not be imported.`);
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
    bulkQueue.filter((q) => q.status === "success").forEach((q) =>
      logEvent(EVENT.PLANT_ADDED, { plant_name: q.name, source: q.source }),
    );
    refreshShed(); // 🚀 BACKGROUND SYNC
    toast.success("Import complete");
  };

  const handleRetryItem = async (itemId: string) => {
    const item = bulkQueue.find((q) => q.id === itemId);
    if (!item) return;

    setBulkQueue((prev) =>
      prev.map((q) => (q.id === itemId ? { ...q, status: "processing", errorMsg: undefined } : q)),
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
      } else if (item.source === "verdantly") {
        const verdantlyId = item.data.verdantly_id ?? String(item.data.id);

        const { data: existing } = await supabase
          .from("plants")
          .select("id")
          .eq("home_id", homeId)
          .eq("verdantly_id", verdantlyId)
          .maybeSingle();
        if (existing) throw new Error("Already in Shed");

        const details = await VerdantlyService.getPlantDetails(verdantlyId);

        let imageUrl = details.image_url || details.thumbnail_url || "";
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
        if (!imageUrl) imageUrl = await fetchFirstAvailableImage(item.data.common_name);

        await savePlantToDB(
          {
            common_name: details.common_name,
            scientific_name: details.scientific_name,
            thumbnail_url: imageUrl,
            source: "verdantly",
            verdantly_id: verdantlyId,
            perenual_id: null,
            plant_metadata: (details as any).plant_metadata ?? null,
          },
          details,
        );
      } else {
        const cleanName =
          typeof item.data === "string"
            ? item.data.split("(")[0].trim()
            : item.data.common_name;

        const { data: existingAi } = await supabase
          .from("plants")
          .select("id")
          .eq("home_id", homeId)
          .ilike("common_name", cleanName)
          .limit(1);
        if (existingAi && existingAi.length > 0) {
          throw new Error(`"${cleanName}" is already in your shed.`);
        }

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
        if (!imageUrl) imageUrl = await fetchFirstAvailableImage(cleanName);
        extracted.thumbnail_url = imageUrl;

        await savePlantToDB(
          { ...extracted, source: "ai", perenual_id: null },
          extracted,
        );
      }

      setBulkQueue((prev) =>
        prev.map((q) => (q.id === itemId ? { ...q, status: "success" } : q)),
      );
      logEvent(EVENT.PLANT_ADDED, { plant_name: item.name, source: item.source });
      refreshShed();
    } catch (err: any) {
      let errorMsg = err.message || "Failed";
      if (
        errorMsg.includes("Unexpected token") ||
        errorMsg.includes("Please Upg")
      ) {
        errorMsg = "Perenual API limit reached (Premium required).";
      }
      setBulkQueue((prev) =>
        prev.map((q) =>
          q.id === itemId ? { ...q, status: "error", errorMsg } : q,
        ),
      );
    }
  };

  useEffect(() => {
    if (location.state && location.state.autoImport) {
      const { autoImport } = location.state;
      window.history.replaceState({}, document.title, location.pathname);
      setSourcePickerPlants(Array.isArray(autoImport) ? autoImport : [autoImport]);
      setShowSourcePicker(true);
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
      setShowBulkSearch(true);
    } else if (searchParams.get("open") === "add-plant") {
      handledDeepLink.current = currentUrl;
      // Optional `?query=` pre-fills the BulkSearchModal — Plant Doctor's
      // "Add to Shed" passes the identified plant name so the user lands
      // directly on the relevant search results.
      const query = searchParams.get("query") || "";
      if (query) setInitialSearchTerm(query);
      setShowBulkSearch(true);
      setSearchParams((p) => {
        const n = new URLSearchParams(p);
        n.delete("open");
        n.delete("query");
        return n;
      }, { replace: true });
    }
  }, [location.pathname, location.search, searchParams, setSearchParams]);

  const handleCloseModals = () => {
    setShowBulkSearch(false);
    setShowSourcePicker(false);
    setInitialSearchTerm("");
    setInitialCartItems([]);
    setSourcePickerPlants([]);
    handledDeepLink.current = "";
    if (location.state?.returnTo) {
      navigate(location.state.returnTo, { replace: true });
    }
  };

  const executeArchiveToggle = async () => {
    const plant = confirmState.plant;
    if (!plant) return;
    const nowArchived = !plant.is_archived;
    setConfirmState({ isOpen: false, type: "delete", plant: null });
    setArchivingPlantId(plant.id);
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from("plants")
        .update({ is_archived: nowArchived })
        .eq("id", plant.id);
      if (error) {
        throw error;
      }
      setPlants((prev) => prev.map((p) => p.id === plant.id ? { ...p, is_archived: nowArchived } : p));
      toast.success(nowArchived ? "Moved to archive" : "Restored to active");
      if (nowArchived) {
        logEvent(EVENT.PLANT_ARCHIVED, { plant_id: plant.id, plant_name: plant.common_name });
      }
      refreshShed();
    } catch (err: any) {
      Logger.error("Failed to update plant archive status", err, {}, "Could not update archive status — please try again.");
    } finally {
      setArchivingPlantId(null);
      setActionLoading(false);
    }
  };

  const openDeleteConfirm = async (plant: Plant) => {
    const { count } = await supabase
      .from("inventory_items")
      .select("id", { count: "exact", head: true })
      .eq("plant_id", plant.id);
    setConfirmState({ isOpen: true, type: "delete", plant, inventoryCount: count ?? 0 });
  };

  // ─── Multi-select helpers ───────────────────────────────────────────────────
  const toggleSelectMode = () => {
    setSelectMode((v) => {
      if (v) setSelectedPlantIds(new Set());
      return !v;
    });
  };

  const togglePlantSelected = (plantId: number) => {
    setSelectedPlantIds((prev) => {
      const next = new Set(prev);
      if (next.has(plantId)) next.delete(plantId);
      else next.add(plantId);
      return next;
    });
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedPlantIds(new Set());
  };

  const handleBulkArchive = async () => {
    if (selectedPlantIds.size === 0) return;
    setBulkActionState("archiving");
    try {
      const ids = Array.from(selectedPlantIds);
      const { error } = await supabase
        .from("plants")
        .update({ is_archived: true })
        .in("id", ids);
      if (error) throw error;
      toast.success(`Archived ${ids.length} plant${ids.length !== 1 ? "s" : ""}`);
      setPlants((prev) => prev.map((p) => ids.includes(p.id as number) ? { ...p, is_archived: true } : p));
      exitSelectMode();
    } catch (err: any) {
      Logger.error("Bulk archive failed", err, { count: selectedPlantIds.size }, "Could not archive — try again.");
    } finally {
      setBulkActionState("idle");
    }
  };

  const handleBulkUnarchive = async () => {
    if (selectedPlantIds.size === 0) return;
    setBulkActionState("archiving");
    try {
      const ids = Array.from(selectedPlantIds);
      const { error } = await supabase
        .from("plants")
        .update({ is_archived: false })
        .in("id", ids);
      if (error) throw error;
      toast.success(`Restored ${ids.length} plant${ids.length !== 1 ? "s" : ""}`);
      setPlants((prev) => prev.map((p) => ids.includes(p.id as number) ? { ...p, is_archived: false } : p));
      exitSelectMode();
    } catch (err: any) {
      Logger.error("Bulk restore failed", err, { count: selectedPlantIds.size }, "Could not restore — try again.");
    } finally {
      setBulkActionState("idle");
    }
  };

  // Count instances across the selected plants, then open the bulk-delete
  // dialog (which offers the Keep-history / Delete-everything choice when
  // any of them have instances).
  const openBulkDeleteConfirm = async () => {
    if (selectedPlantIds.size === 0) return;
    const ids = Array.from(selectedPlantIds);
    const { count } = await supabase
      .from("inventory_items")
      .select("id", { count: "exact", head: true })
      .in("plant_id", ids);
    setBulkDeleteState({ open: true, instanceCount: count ?? 0 });
  };

  const handleBulkDelete = async () => {
    if (selectedPlantIds.size === 0) return;
    setBulkActionState("deleting");
    try {
      const ids = Array.from(selectedPlantIds);
      // Clean up task_blueprints referencing the affected inventory items
      // (uuid[] column, no FK cascade).
      const { data: items } = await supabase
        .from("inventory_items")
        .select("id")
        .in("plant_id", ids);
      const inventoryIds = (items ?? []).map((i: any) => i.id);
      if (inventoryIds.length > 0) {
        await supabase
          .from("task_blueprints")
          .delete()
          .eq("home_id", homeId)
          .overlaps("inventory_item_ids", inventoryIds);
      }
      const { error } = await supabase.from("plants").delete().in("id", ids);
      if (error) throw error;
      toast.success(`Deleted ${ids.length} plant${ids.length !== 1 ? "s" : ""}.`);
      setBulkDeleteState({ open: false, instanceCount: 0 });
      exitSelectMode();
      refreshShed();
    } catch (err: any) {
      Logger.error("Bulk delete failed", err, { count: selectedPlantIds.size }, "Could not delete — try again.");
    } finally {
      setBulkActionState("idle");
    }
  };

  // "Keep the history" for a batch: end every selected plant's still-active
  // instances (→ Senescence) and archive all selected plants. Nothing is
  // deleted; fully restorable. Plants with no instances are simply archived.
  const handleBulkEndOfLifeInstead = async () => {
    if (selectedPlantIds.size === 0) return;
    setBulkActionState("deleting");
    try {
      const ids = Array.from(selectedPlantIds);
      const endedAt = new Date().toISOString();
      const summary = `Retired from your Plants on ${new Date().toLocaleDateString()}.`;
      const { data: ended, error: endErr } = await supabase
        .from("inventory_items")
        .update({
          ended_at: endedAt,
          was_natural_end: null,
          end_summary: summary,
          status: "Archived",
        })
        .in("plant_id", ids)
        .is("ended_at", null)
        .select("id");
      if (endErr) throw endErr;

      const endedIds = (ended ?? []).map((r: any) => r.id);
      if (endedIds.length > 0) {
        await supabase.from("plant_journals").insert(
          endedIds.map((id: string) => ({
            home_id: homeId,
            inventory_item_id: id,
            subject: "Lifecycle complete",
            description: "Retired from your Plants.",
          })),
        );
      }

      const { error: archErr } = await supabase
        .from("plants")
        .update({ is_archived: true })
        .in("id", ids);
      if (archErr) throw archErr;

      toast.success(
        endedIds.length > 0
          ? `Archived ${ids.length} plant${ids.length !== 1 ? "s" : ""}; ${endedIds.length} marked End of Life.`
          : `Archived ${ids.length} plant${ids.length !== 1 ? "s" : ""}.`,
      );
      setBulkDeleteState({ open: false, instanceCount: 0 });
      exitSelectMode();
      refreshShed();
    } catch (err: any) {
      Logger.error("Bulk End-of-Life failed", err, { count: selectedPlantIds.size }, "Could not keep the history — try again.");
    } finally {
      setBulkActionState("idle");
    }
  };

  // Bulk assign — place a chosen quantity of each selected plant into one
  // target area (or "in the garden, area unknown"), optionally generating a
  // smart planting schedule per plant. Reuses the per-row shape from
  // handleAssign; the schedule generation mirrors PlantAssignmentModal.
  const handleBulkAssign = async (data: {
    areaId: string;
    status: string;
    isPlanted: boolean;
    isEstablished: boolean;
    plantedDate: string;
    growthState: string;
    smartSchedules: boolean;
    quantities: Record<number, number>;
  }) => {
    setActionLoading(true);
    try {
      const noArea = !data.areaId;
      let areaContext: {
        location_id: string | null;
        location_name: string | null;
        area_id: string | null;
        area_name: string | null;
      } = { location_id: null, location_name: null, area_id: null, area_name: null };
      let areaDetails: any = null;
      if (!noArea) {
        const { data: areaData, error: areaError } = await supabase
          .from("areas")
          .select("*, locations(name)")
          .eq("id", data.areaId)
          .single();
        if (areaError) throw areaError;
        areaDetails = areaData;
        areaContext = {
          area_id: data.areaId,
          area_name: areaData.name,
          location_id: areaData.location_id,
          location_name: (areaData.locations as any)?.name || "Unknown Location",
        };
      }

      const selectedPlants = plants.filter((p) => selectedPlantIds.has(p.id as number));
      const rows: any[] = [];
      for (const plant of selectedPlants) {
        const qty = Math.max(1, data.quantities[plant.id as number] ?? 1);
        for (let i = 0; i < qty; i++) {
          rows.push({
            home_id: homeId,
            plant_id: plant.id,
            plant_name: plant.common_name,
            status: data.status,
            ...areaContext,
            planted_at: data.isPlanted && !data.isEstablished ? data.plantedDate : null,
            is_established: data.isEstablished,
            growth_state: data.isPlanted ? data.growthState : null,
            identifier: `${plant.common_name} #${Math.floor(Math.random() * 10000).toString().padStart(4, "0")}`,
          });
        }
      }
      if (rows.length === 0) return;

      const { data: inserted, error: insertError } = await supabase
        .from("inventory_items")
        .insert(rows)
        .select("id, plant_id");
      if (insertError) throw insertError;

      // Wave 23.0001 — first plant added unlocks the post-shed walkthrough.
      void recordSignal("first_plant_created");

      const totalTypes = selectedPlants.length;

      // Smart planting schedules — per plant, best-effort. Applies the
      // recommended viable method's phases as Planting tasks.
      let homeAddress: string | null = null;
      if (!noArea && data.smartSchedules && aiEnabled) {
        const { data: homeData } = await supabase.from("homes").select("address").eq("id", homeId).single();
        homeAddress = homeData?.address ?? null;
        if (homeAddress) {
          for (const plant of selectedPlants) {
            try {
              const { data: aiData, error: aiErr } = await supabase.functions.invoke("smart-plant-scheduler", {
                body: {
                  plantName: plant.common_name,
                  areaDetails,
                  address: homeAddress,
                  homeId,
                  plantMetadata: (plant as any).plant_metadata ?? null,
                },
              });
              if (aiErr || !aiData) continue;
              const viable = (aiData.schedules ?? []).filter((s: any) => s.is_viable);
              const chosen = viable[0];
              if (!chosen) continue;
              const invIds = (inserted ?? []).filter((r: any) => r.plant_id === plant.id).map((r: any) => r.id);
              const tasksToInsert = (chosen.phases ?? []).map((phase: any) => ({
                home_id: homeId,
                location_id: areaContext.location_id,
                area_id: areaContext.area_id,
                inventory_item_ids: invIds,
                type: "Planting",
                title: `${phase.phase_name} (${plant.common_name})`,
                description: `Method: ${chosen.method}\nPhase: ${phase.phase_name}\n\nInstructions:\n${(phase.steps ?? []).map((s: string, i: number) => `${i + 1}. ${s}`).join("\n")}\n\nReasoning:\n${chosen.reasoning ?? ""}`,
                due_date: phase.recommended_date,
                status: "Pending",
              }));
              if (tasksToInsert.length > 0) {
                await supabase.from("tasks").insert(tasksToInsert);
              }
            } catch (err) {
              Logger.warn("Bulk assign smart-schedule failed for a plant", { plant: plant.common_name, err });
            }
          }
        }
      }

      toast.success(
        noArea
          ? `${rows.length} plant${rows.length !== 1 ? "s" : ""} added to your garden — place them when ready.`
          : `Assigned ${rows.length} plant${rows.length !== 1 ? "s" : ""} across ${totalTypes} type${totalTypes !== 1 ? "s" : ""}.`,
      );
      setShowBulkAssign(false);
      exitSelectMode();
      refreshShed();
    } catch (err: any) {
      Logger.error("Bulk assign failed", err, { count: selectedPlantIds.size }, "Could not assign — try again.");
    } finally {
      setActionLoading(false);
    }
  };

  const executeDelete = async () => {
    const plant = confirmState.plant;
    if (!plant) return;
    setActionLoading(true);
    try {
      // Fetch inventory item IDs so we can clean up task_blueprints.
      // inventory_item_ids is a uuid[] with no FK constraint, so it won't
      // cascade when inventory_items are deleted.
      const { data: items } = await supabase
        .from("inventory_items")
        .select("id")
        .eq("plant_id", plant.id);
      const inventoryIds = (items ?? []).map((i: any) => i.id);
      if (inventoryIds.length > 0) {
        await supabase
          .from("task_blueprints")
          .delete()
          .eq("home_id", homeId)
          .overlaps("inventory_item_ids", inventoryIds);
      }

      const { error } = await supabase
        .from("plants")
        .delete()
        .eq("id", plant.id);
      if (error) throw error;
      toast.success(`${plant.common_name} deleted.`);
      setConfirmState({ isOpen: false, type: "delete", plant: null });
      refreshShed(); // 🚀 BACKGROUND SYNC
    } catch (err: any) {
      Logger.error("Failed to delete plant from shed", err, {}, "Could not delete plant — please try again.");
    } finally {
      setActionLoading(false);
    }
  };

  // "Keep the history" alternative to delete: mark the plant's still-active
  // instances as End of Life (so they live on in Senescence) and archive the
  // plant species rather than deleting it. We can't delete the plant AND keep
  // the instances — inventory_items.plant_id is ON DELETE CASCADE — so the
  // safe, fully-restorable outcome is archive + end.
  const executeEndOfLifeInstead = async () => {
    const plant = confirmState.plant;
    if (!plant) return;
    setActionLoading(true);
    try {
      const endedAt = new Date().toISOString();
      const summary = `Retired from your Plants on ${new Date().toLocaleDateString()}.`;
      // End only instances that aren't already ended.
      const { data: ended, error: endErr } = await supabase
        .from("inventory_items")
        .update({
          ended_at: endedAt,
          was_natural_end: null,
          end_summary: summary,
          status: "Archived",
        })
        .eq("plant_id", plant.id)
        .is("ended_at", null)
        .select("id");
      if (endErr) throw endErr;

      const endedIds = (ended ?? []).map((r: any) => r.id);
      if (endedIds.length > 0) {
        // Closing journal entries so the history thread is unbroken (best-effort).
        await supabase.from("plant_journals").insert(
          endedIds.map((id: string) => ({
            home_id: homeId,
            inventory_item_id: id,
            subject: "Lifecycle complete",
            description: `${plant.common_name} was retired from your Plants.`,
          })),
        );
      }

      // Archive the plant species rather than deleting it.
      const { error: archErr } = await supabase
        .from("plants")
        .update({ is_archived: true })
        .eq("id", plant.id);
      if (archErr) throw archErr;

      toast.success(
        endedIds.length > 0
          ? `${plant.common_name} archived; ${endedIds.length} plant${endedIds.length !== 1 ? "s" : ""} marked End of Life.`
          : `${plant.common_name} archived.`,
      );
      setConfirmState({ isOpen: false, type: "delete", plant: null });
      refreshShed(); // 🚀 BACKGROUND SYNC
    } catch (err: any) {
      Logger.error("Failed to retire plant instances as End of Life", err, {}, "Could not keep the history — please try again.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleManualSave = async (plantData: any) => {
    setActionLoading(true);
    try {
      const { data: existing } = await supabase
        .from("plants")
        .select("id")
        .eq("home_id", homeId)
        .ilike("common_name", plantData.common_name)
        .limit(1);
      if (existing && existing.length > 0) {
        toast.error(`"${plantData.common_name}" is already in your shed.`);
        setActionLoading(false);
        return;
      }
      await savePlantToDB(
        { ...plantData, source: "manual", perenual_id: null },
        plantData,
      );
      toast.success(`${plantData.common_name} added to shed!`);
      requestFeedback("add_plant", { source: "manual" });
      logEvent(EVENT.PLANT_ADDED, { plant_name: plantData.common_name, source: "manual" });
      handleCloseModals();
      refreshShed(); // 🚀 BACKGROUND SYNC
    } catch (err: any) {
      Logger.error("Failed to save plant to shed", err, {}, "Could not save plant — please check your connection and try again.");
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
        .eq("id", editingPlant!.id);
      if (error) throw error;
      toast.success(`${cleanPayload.common_name} updated!`);
      setEditingPlant((prev: any) => ({ ...prev, ...updatedData }));
      refreshShed(); // 🚀 BACKGROUND SYNC
    } catch (err: any) {
      Logger.error("Failed to update plant in shed", err, {}, `Update failed: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleAssign = async (assignmentData: any) => {
    if (!selectedPlant) return;
    setActionLoading(true);
    try {
      // areaId can be empty/null when the user picks "Add to garden"
      // — an instance "in the garden, area unknown". In that case we
      // skip the area lookup and null out the location/area columns.
      const noArea = !assignmentData.areaId;
      let areaContext: {
        location_id: string | null;
        location_name: string | null;
        area_id: string | null;
        area_name: string | null;
      } = {
        location_id: null,
        location_name: null,
        area_id: null,
        area_name: null,
      };
      if (!noArea) {
        const { data: areaData, error: areaError } = await supabase
          .from("areas")
          .select("name, location_id, locations(name)")
          .eq("id", assignmentData.areaId)
          .single();
        if (areaError) throw areaError;
        areaContext = {
          area_id: assignmentData.areaId,
          area_name: areaData.name,
          location_id: areaData.location_id,
          location_name: (areaData.locations as any)?.name || "Unknown Location",
        };
      }

      const recordsToInsert = Array.from({
        length: assignmentData.quantity,
      }).map(() => ({
        home_id: homeId,
        plant_id: selectedPlant.id,
        plant_name: selectedPlant.common_name,
        status: assignmentData.status,
        ...areaContext,
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

      // Wave 23.0001 — first plant added unlocks the post-shed walkthrough.
      void recordSignal("first_plant_created");

      const newInventoryIds = insertedItems.map((item: any) => item.id);

      // Smart-schedule tasks are area-anchored — only attach them when
      // we actually have an area to anchor against. Unassigned planted
      // instances can pick up schedules later when the user places them
      // (the same automation engine fires on InstanceEditModal's
      // area-changed transition).
      if (
        !noArea &&
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
              location_id: areaContext.location_id,
              area_id: areaContext.area_id,
              inventory_item_ids: newInventoryIds,
              type: "Planting",
              title: `${phase.phase_name} (${selectedPlant.common_name} x${assignmentData.quantity})`,
              description: `Method: ${schedule.method}\nPhase: ${phase.phase_name}\n\nInstructions:\n${formattedSteps}\n\nReasoning:\n${schedule.reasoning}`,
              due_date: phase.recommended_date,
              status: "Pending",
            });
          });
        });
        const { error: taskError } = await supabase.from("tasks").insert(tasksToInsert);
        if (taskError) Logger.warn("Failed to create smart schedule tasks", { taskError });
      }

      toast.success(
        noArea
          ? `${selectedPlant.common_name} added to your garden — assign an area when you place it.`
          : `Successfully assigned ${assignmentData.quantity} plants!`,
      );
      requestFeedback("plant_assign_area");
      refreshShed(); // 🚀 BACKGROUND SYNC
      setSelectedPlant(null);

      return insertedItems;
    } catch (err: any) {
      Logger.error("Failed to assign plant to area", err, {}, `Assignment failed: ${err.message}`);
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
      if (smartFilter === "unassigned" && !unassignedPlantIds.has(p.id as number)) return false;
      if (smartFilter === "in-plan" && !planMembership.has(p.id as number)) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesCommon = p.common_name.toLowerCase().includes(query);
        const matchesScientific = p.scientific_name?.some((name: string) =>
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
  }, [plants, viewTab, filterSource, smartFilter, searchQuery, sortMode, preferences, unassignedPlantIds, planMembership]);

  // Fetch lightweight metadata for the smart-filter chips + per-plant status
  // (unassigned = inventory items without an area · in-plan = plant_id appears
  // on a task linked to a plan · overdue/today/harvest = derived from tasks)
  useEffect(() => {
    if (!homeId) return;
    let cancelled = false;
    (async () => {
      const todayStr = getLocalDateString(new Date());
      const [invRes, planTasksRes, openTasksRes, ailmentsRes] = await Promise.all([
        supabase
          .from("inventory_items")
          .select("id, plant_id, area_id")
          .eq("home_id", homeId)
          .limit(2000),
        // tasks.inventory_item_ids is a uuid[] — a single task can link to
        // multiple instances. Select the array, then explode it on the JS side.
        supabase
          .from("tasks")
          .select("inventory_item_ids, plan_id")
          .eq("home_id", homeId)
          .not("plan_id", "is", null)
          .limit(2000),
        supabase
          .from("tasks")
          .select("inventory_item_ids, due_date, type, status, next_check_at, window_end_date")
          .eq("home_id", homeId)
          .neq("status", "Completed")
          .neq("status", "Skipped")
          // We need anything whose ORIGINAL due_date is today-or-past so the
          // snooze/window classification below can pick the right bucket.
          // (An in-window harvest can have due_date in the past and still be
          // "ready, not overdue".)
          .lte("due_date", todayStr)
          .limit(2000),
        supabase
          .from("plant_instance_ailments")
          .select("plant_instance_id")
          .eq("home_id", homeId)
          .eq("status", "active")
          .limit(2000),
      ]);
      if (cancelled) return;

      // Build lookup: inventory_item_id (uuid) → plant_id (int)
      const itemToPlant = new Map<string, number>();
      const unassigned = new Set<number>();
      (invRes.data ?? []).forEach((row: any) => {
        if (row.plant_id != null) itemToPlant.set(String(row.id), row.plant_id);
        if (!row.area_id && row.plant_id != null) unassigned.add(row.plant_id as number);
      });
      setUnassignedPlantIds(unassigned);

      const inPlan = new Set<number>();
      (planTasksRes.data ?? []).forEach((row: any) => {
        const ids = row.inventory_item_ids as string[] | null;
        if (!ids?.length) return;
        for (const itemId of ids) {
          const pid = itemToPlant.get(String(itemId));
          if (pid != null) inPlan.add(pid);
        }
      });
      setPlanMembership(inPlan);

      // Build per-plant status (overdue / today / harvest due today / ailments)
      const status = new Map<number, { overdueCount: number; dueTodayCount: number; harvestDue: boolean; ailmentCount: number }>();
      const ensure = (pid: number) => {
        let e = status.get(pid);
        if (!e) { e = { overdueCount: 0, dueTodayCount: 0, harvestDue: false, ailmentCount: 0 }; status.set(pid, e); }
        return e;
      };
      (openTasksRes.data ?? []).forEach((row: any) => {
        const ids = row.inventory_item_ids as string[] | null;
        if (!ids?.length) return;
        // Wave 20+ snooze / harvest-window aware. Mirrors PlantEditModal's
        // glance strip + TaskCalendar's dot rendering so the plant tile's
        // chip set lines up with what the user sees everywhere else.
        const overdue = isTaskOverdueToday(row, todayStr);
        const dueToday = !overdue && isTaskVisibleOnDate(row, todayStr);
        const harvestReady =
          row.type === "Harvesting" &&
          isTaskVisibleOnDate(row, todayStr, { includeOverdue: true });
        const seenPlantsForRow = new Set<number>();
        for (const itemId of ids) {
          const pid = itemToPlant.get(String(itemId));
          if (pid == null || seenPlantsForRow.has(pid)) continue;
          seenPlantsForRow.add(pid);
          const entry = ensure(pid);
          if (overdue) entry.overdueCount++;
          else if (dueToday) entry.dueTodayCount++;
          if (harvestReady) entry.harvestDue = true;
        }
      });
      (ailmentsRes.data ?? []).forEach((row: any) => {
        if (!row.plant_instance_id) return;
        const pid = itemToPlant.get(String(row.plant_instance_id));
        if (pid == null) return;
        ensure(pid).ailmentCount++;
      });
      setPlantTaskStatus(status);
    })();
    return () => { cancelled = true; };
  }, [homeId, plants.length]);

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
      <div className="h-full flex flex-col p-4 md:p-8">
        <div className="flex items-center gap-4 mb-10">
          <div className="h-10 w-48 bg-rhozly-surface-low rounded-xl animate-pulse" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-32">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="bg-rhozly-surface-lowest rounded-3xl overflow-hidden border border-rhozly-outline/20 shadow-sm animate-pulse"
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
      <div className="h-full flex flex-col p-4 md:p-8 animate-in fade-in duration-700 relative">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 mb-10">
          <div>
            <div className="flex flex-wrap items-center gap-3 sm:gap-4">
              <div>
                <h1 className="text-3xl sm:text-4xl font-black font-display text-rhozly-on-surface flex items-center gap-3">
                  Plants
                  {plants.filter((p) => !p.is_archived).length > 0 && (
                    <span className="text-base font-black bg-rhozly-primary/10 text-rhozly-primary px-2.5 py-1 rounded-xl">
                      {plants.filter((p) => !p.is_archived).length}
                    </span>
                  )}
                </h1>
                <p className="text-sm font-bold text-rhozly-on-surface/40 mt-1">
                  Your Shed — every plant in your home
                </p>
              </div>
              {/* 🚀 SILENT SYNC INDICATOR */}
              {isBackgroundSyncing && (
                <Loader2
                  className="animate-spin text-rhozly-on-surface/20"
                  size={20}
                />
              )}
              <div className="ml-auto xl:ml-0 flex items-center gap-2">
                {(view !== "plants" || scope === "home") && (
                <button
                  data-testid="shed-select-mode-btn"
                  onClick={toggleSelectMode}
                  aria-label={selectMode ? "Exit multi-select mode" : "Enter multi-select mode"}
                  title={selectMode ? "Exit selection mode" : "Select multiple plants"}
                  className={`flex items-center gap-2 px-4 py-3 rounded-2xl font-black text-sm transition-colors ${
                    selectMode
                      ? "bg-rhozly-primary text-white"
                      : "bg-rhozly-surface text-rhozly-on-surface/80 hover:bg-rhozly-surface-low"
                  }`}
                >
                  <CheckSquare2 size={16} /> <span className="hidden sm:inline">{selectMode ? "Done" : "Select"}</span>
                </button>
                )}
                <button
                  data-testid="shed-open-layout-btn"
                  onClick={() => navigate("/garden-layout")}
                  aria-label="Open garden layout"
                  title="Place plants on a layout"
                  className="flex items-center gap-2 px-4 py-3 bg-rhozly-surface text-rhozly-on-surface/80 rounded-2xl font-black text-sm hover:bg-rhozly-surface-low transition-colors"
                >
                  <LayoutGrid size={16} /> <span className="hidden sm:inline">Layout</span>
                </button>
                {can("shed.add") && (view !== "plants" || scope === "home") && (
                  <>
                    <button
                      data-testid="shed-add-plant-btn"
                      onClick={() => setShowBulkSearch(true)}
                      aria-label="Find a plant"
                      className="flex items-center gap-2 px-4 sm:px-5 py-3 bg-rhozly-primary text-white rounded-2xl font-black text-sm shadow-lg hover:scale-[1.02] transition-transform"
                    >
                      <Plus size={18} /> Find a plant
                    </button>
                    {/* UX review 2026-06-15 item 4.1 — bulk-paste entry next
                        to the primary CTA. Subtle styling so it doesn't
                        compete with "Find a plant" but is discoverable for
                        Sam's "I have a list of 30 plants" persona. */}
                    <button
                      data-testid="shed-bulk-paste-btn"
                      onClick={() => setShowBulkPaste(true)}
                      title="Paste a list or upload a CSV to add plants all at once"
                      className="hidden sm:flex items-center gap-2 px-4 py-3 bg-white border border-rhozly-outline/20 text-rhozly-primary rounded-2xl font-black text-sm hover:border-rhozly-primary/30 hover:bg-rhozly-primary/5 transition-colors"
                    >
                      <FileText size={16} /> Bulk add
                    </button>
                  </>
                )}
              </div>
            </div>
            <p className="text-sm font-bold text-rhozly-on-surface/50 uppercase tracking-widest mt-1">
              <span className="font-black text-rhozly-on-surface/70">{plants.filter(p => !p.is_archived).length}</span> species · <span className="font-black text-rhozly-on-surface/70">{plants.filter(p => !p.is_archived).reduce((acc, p) => acc + (p.instance_count || 0), 0)}</span> plants in your garden
            </p>
            {/* Plants / Nursery toggle — Nursery surfaces seed packets +
                sowings + the plant-out lifecycle. */}
            <div
              data-testid="shed-view-toggle"
              className="inline-flex items-center gap-1 mt-3 p-1 rounded-2xl bg-rhozly-surface-low border border-rhozly-outline/10"
            >
              {(["plants", "nursery"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  data-testid={`shed-view-${option}`}
                  onClick={() => setView(option)}
                  className={`px-4 py-1.5 min-h-[36px] rounded-xl text-[11px] font-black uppercase tracking-widest transition-colors ${
                    view === option
                      ? "bg-white text-rhozly-primary shadow-sm"
                      : "text-rhozly-on-surface/55 hover:text-rhozly-on-surface"
                  }`}
                >
                  {option === "plants" ? "Plants" : "Nursery"}
                </button>
              ))}
            </div>
            {shedFetchError && (
              <div className="flex items-center gap-2 mt-2 px-3 py-2 rounded-xl bg-red-50 border border-red-200 text-xs font-bold text-red-600">
                <AlertCircle size={14} />
                Could not refresh — showing cached data.
                <button onClick={refreshShed} className="underline ml-1 hover:text-red-700 transition-colors">Retry</button>
              </div>
            )}
          </div>
          {view === "plants" && (
          <div className="flex flex-col gap-4 sticky top-0 z-20 bg-rhozly-bg/95 backdrop-blur-sm pt-2 pb-2 -mx-1 px-1 rounded-b-2xl">
            {/* Home | Favourites scope pills — "Home" is today's shared,
                home-scoped grid; "Favourites" is the user's personal
                cross-home list. Deep link: /shed?scope=favourites */}
            <div
              data-testid="shed-scope-toggle"
              className="bg-rhozly-surface-low p-1.5 rounded-2xl flex gap-1 border border-rhozly-outline/10 self-start"
            >
              {(["home", "favourites"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  data-testid={`shed-scope-${s}`}
                  onClick={() => switchScope(s)}
                  className={`flex items-center gap-1.5 px-5 py-2 min-h-[40px] rounded-xl text-sm font-black transition-all ${
                    scope === s
                      ? "bg-white text-rhozly-primary shadow-sm"
                      : "text-rhozly-on-surface/40 hover:text-rhozly-on-surface"
                  }`}
                >
                  {s === "favourites" && (
                    <Heart
                      size={13}
                      className={scope === "favourites" ? "fill-current" : ""}
                    />
                  )}
                  {s === "home" ? "Home" : "Favourites"}
                  {s === "favourites" && favourites.length > 0 && (
                    <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-rhozly-primary/10 text-rhozly-primary">
                      {favourites.length}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <div className="relative flex items-center">
              <Search
                className="absolute left-4 text-rhozly-on-surface/40"
                size={16}
              />
              <input
                type="text"
                placeholder={
                  scope === "favourites"
                    ? "Search your favourites..."
                    : "Search your saved plants..."
                }
                aria-label="Search your saved plants"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-10 py-3 bg-rhozly-surface-lowest border border-rhozly-outline/20 rounded-2xl text-sm font-bold outline-none focus:border-rhozly-primary transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  aria-label="Clear search"
                  className="absolute right-3 p-1.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-rhozly-on-surface/40 hover:text-rhozly-on-surface rounded-lg transition-colors"
                >
                  <X size={16} />
                </button>
              )}
            </div>
            {scope === "home" && (
            <>
            <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3">
              <div className="bg-rhozly-surface-low p-1.5 rounded-2xl flex gap-1 border border-rhozly-outline/10">
                {["active", "archived"].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setViewTab(tab as any)}
                    className={`flex-1 sm:flex-none px-6 py-2 min-h-[44px] rounded-xl text-sm font-black transition-all ${viewTab === tab ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-on-surface/40 hover:text-rhozly-on-surface"}`}
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>
              <select
                value={filterSource}
                onChange={(e) => setFilterSource(e.target.value as any)}
                aria-label="Filter by source"
                className="bg-rhozly-surface-lowest border border-rhozly-outline/20 rounded-xl px-4 py-2.5 min-h-[44px] text-sm font-bold outline-none cursor-pointer"
              >
                <option value="all">All Sources</option>
                <option value="manual">Manual</option>
                <option value="api">Plant Database</option>
                <option value="ai">AI</option>
              </select>
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as any)}
                aria-label="Sort plants"
                className="bg-rhozly-surface-lowest border border-rhozly-outline/20 rounded-xl px-4 py-2.5 min-h-[44px] text-sm font-bold outline-none cursor-pointer"
              >
                <option value="alphabetical">A – Z</option>
                <option value="preference">Best Match (based on your quiz)</option>
              </select>
            </div>
            {/* Smart filter chips — surface plants by status */}
            <div className="flex items-center gap-1.5 flex-wrap" data-testid="shed-smart-filters">
              <span className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mr-1">
                Quick filters:
              </span>
              {([
                { id: "none",       label: "All",         count: null },
                { id: "unassigned", label: "Unassigned",  count: unassignedPlantIds.size },
                { id: "in-plan",    label: "In a plan",   count: planMembership.size },
              ] as const).map((chip) => {
                const active = smartFilter === chip.id;
                const disabled = chip.id !== "none" && chip.count === 0;
                return (
                  <button
                    key={chip.id}
                    data-testid={`shed-filter-${chip.id}`}
                    disabled={disabled}
                    onClick={() => setSmartFilter(chip.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-full text-xs font-black transition-colors ${
                      active
                        ? "bg-rhozly-primary text-white"
                        : disabled
                          ? "bg-rhozly-surface-low text-rhozly-on-surface/25 cursor-not-allowed"
                          : "bg-rhozly-surface-lowest text-rhozly-on-surface/65 border border-rhozly-outline/15 hover:border-rhozly-primary/30 hover:text-rhozly-primary"
                    }`}
                  >
                    {chip.label}
                    {chip.count !== null && chip.count > 0 && (
                      <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${active ? "bg-white/20" : "bg-rhozly-primary/10 text-rhozly-primary"}`}>
                        {chip.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            </>
            )}
          </div>
          )}
        </div>

        {/* Nursery body — read-only Wave 1 packet list. */}
        {view === "nursery" && (
          <NurseryTab
            homeId={homeId}
            aiEnabled={aiEnabled}
            perenualEnabled={perenualEnabled}
          />
        )}

        {/* Favourites scope body — the user's cross-home favourites list. */}
        {view === "plants" && scope === "favourites" && (
          <FavouritePlantsGrid
            homeId={homeId}
            homeName={homeName}
            homePlants={plants as any}
            favourites={favourites}
            loading={favouritesLoading}
            searchQuery={searchQuery}
            aiEnabled={aiEnabled}
            perenualEnabled={perenualEnabled}
            onFavouritesChanged={loadFavourites}
            onHomePlantsChanged={() => {
              refreshShed();
              loadFavourites();
            }}
          />
        )}

        {/* One-time badge guide — shown until dismissed */}
        {view === "plants" && scope === "home" && !badgeGuideShown && (
          <div className="flex items-start gap-3 bg-rhozly-primary/5 border border-rhozly-primary/10 rounded-2xl px-4 py-3 mb-4">
            <div className="flex-1 text-xs font-bold text-rhozly-on-surface/60 leading-snug">
              <span className="font-black text-rhozly-on-surface/80">Where plant info comes from:</span>
              {" "}🌐 <span className="text-rhozly-primary">Perenual</span> — global plant database &nbsp;·&nbsp;
              🌿 <span className="text-emerald-600">Verdantly</span> — curated growing guides &nbsp;·&nbsp;
              ✨ <span className="text-amber-500">AI</span> — identified by Rhozly AI &nbsp;·&nbsp;
              ✏️ <span className="text-rhozly-on-surface/60">Manual</span> — added by you
            </div>
            <button
              data-testid="badge-guide-dismiss"
              onClick={() => { setBadgeGuideShown(true); localStorage.setItem("rhozly_badge_guide_shown", "true"); }}
              className="text-rhozly-on-surface/30 hover:text-rhozly-on-surface/60 transition-colors shrink-0 mt-0.5"
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {view === "plants" && scope === "home" && (
        <>
        {/* AI Assistant — surfaces insights related to the Shed (plant counts,
            care reminders, suitability flags) right where the user is browsing. */}
        <div className="mb-6">
          <AssistantCard contextLabel="Your shed" />
        </div>

        <div
          ref={gridRef}
          onKeyDown={handleGridKeyDown}
          data-testid="shed-plant-list"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-32"
        >
          {filteredPlants.length === 0 ? (
            <div className="col-span-full min-h-[400px] flex items-center justify-center py-8">
              <EmptyState
                size="lg"
                chrome="none"
                icon={<Search size={32} />}
                title={searchQuery ? "No matches found" : "No plants here yet"}
                body={
                  searchQuery
                    ? "Try adjusting your search term or filters."
                    : "Your Shed is where every plant lives — add your first one and Rhozly starts tailoring reminders to it."
                }
                primaryCta={
                  searchQuery
                    ? { label: "Clear search", onClick: () => setSearchQuery("") }
                    : {
                        label: "Add your first plant",
                        onClick: () => setShowBulkSearch(true),
                        "data-testid": "shed-empty-add-cta",
                      }
                }
              />
            </div>
          ) : (
            filteredPlants.map((plant, index) => {
              const isSelected = selectedPlantIds.has(plant.id as number);
              return (
              <div
                key={plant.id}
                data-plant-card
                data-testid={`plant-card-${plant.id}`}
                tabIndex={index === focusedIndex ? 0 : -1}
                onClick={() => {
                  if (selectMode) togglePlantSelected(plant.id as number);
                  else setEditingPlant(plant);
                }}
                onFocus={() => setFocusedIndex(index)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    if (selectMode) togglePlantSelected(plant.id as number);
                    else setEditingPlant(plant);
                  }
                }}
                role="button"
                aria-label={selectMode ? `${isSelected ? "Deselect" : "Select"} ${plant.common_name}` : `View details for ${plant.common_name}`}
                aria-pressed={selectMode ? isSelected : undefined}
                className={`relative bg-rhozly-surface-lowest rounded-3xl overflow-hidden border-2 shadow-sm group flex flex-col cursor-pointer focus:outline-none focus:ring-2 focus:ring-rhozly-primary focus:ring-offset-2 transition-all ${
                  isSelected
                    ? "border-rhozly-primary shadow-md ring-2 ring-rhozly-primary/20"
                    : "border-rhozly-outline/20 hover:border-rhozly-primary/30"
                }`}
              >
                {/* Selection mode overlay — checkbox in top-left */}
                {selectMode && (
                  <div
                    className={`absolute top-3 left-3 z-30 w-9 h-9 rounded-xl flex items-center justify-center shadow-md transition-colors ${
                      isSelected ? "bg-rhozly-primary text-white" : "bg-white/90 text-rhozly-on-surface/40 backdrop-blur-md"
                    }`}
                    aria-hidden="true"
                  >
                    {isSelected ? <CheckSquare2 size={18} /> : <SquareIcon size={18} />}
                  </div>
                )}
                {archivingPlantId === plant.id && (
                  <div className="absolute inset-0 z-20 bg-white/80 rounded-3xl flex items-center justify-center">
                    <Loader2 size={22} className="animate-spin text-rhozly-primary" />
                  </div>
                )}
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
                  <MultiImageGallery
                    query={`${plant.common_name}${plant.scientific_name ? ` ${plant.scientific_name}` : ""} plant`}
                    label={plant.common_name}
                    existingImageUrl={plant.thumbnail_url}
                  />
                  {/* Wave 22.0008 — UpdatedChip (conditional) + source label
                      share one bottom-left flex column so they never overlap
                      each other AND don't crowd the action buttons row at
                      top-right on narrow mobile viewports (the issue 22.0007
                      introduced when it parked the source label at top-left). */}
                  <div className="absolute bottom-3 left-3 z-10 flex flex-col items-start gap-1.5">
                    {(() => {
                      const fresh = freshnessByPlantId[plant.id as number];
                      if (!fresh?.has_update) return null;
                      return (
                        <UpdatedChip
                          count={fresh.updated_care_fields.length}
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingPlant(plant);
                          }}
                          className="shadow-sm"
                        />
                      );
                    })()}
                    {/* A catalogue-forked AI plant (forked_from_plant_id set) came from
                        the seeded Library — badge it "Library", not "AI". */}
                    {(() => {
                      const isLibrary = plant.source === "ai" && plant.forked_from_plant_id != null;
                      return (
                    <span className={`bg-white/90 backdrop-blur-md px-3 py-1 rounded-full text-[11px] font-black uppercase flex items-center gap-1.5 shadow-sm border border-white/20 ${
                      plant.source === "api"       ? "text-rhozly-primary" :
                      plant.source === "verdantly" ? "text-emerald-600" :
                      isLibrary                    ? "text-emerald-600" :
                      plant.source === "ai"        ? "text-amber-500" :
                                                     "text-rhozly-on-surface/60"
                    }`}>
                      {plant.source === "api"       ? <Database size={10} /> :
                       plant.source === "verdantly" ? <Database size={10} /> :
                       isLibrary                    ? <Library size={10} /> :
                       plant.source === "ai"        ? <Sparkles size={10} /> :
                                                      <Edit3 size={10} />}
                      {plant.source === "api" ? "Perenual" : plant.source === "verdantly" ? "Verdantly" : isLibrary ? "Library" : plant.source === "ai" ? "AI" : "Manual"}
                    </span>
                      );
                    })()}
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
                    <span className="inline-flex items-center gap-1 mt-1.5 text-[9px] font-bold text-rhozly-on-surface/40">
                      <Sparkles size={8} className="text-rhozly-primary/70" /> Matches your taste
                    </span>
                  )}
                  {/* Contextual status chips — overdue / due today / harvest ready / ailments */}
                  {(() => {
                    const status = plantTaskStatus.get(plant.id as number);
                    if (!status) return null;
                    const chips: React.ReactNode[] = [];
                    if (status.ailmentCount > 0) {
                      chips.push(
                        <span key="ailments" className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200">
                          ⚠ {status.ailmentCount} ailment{status.ailmentCount !== 1 ? "s" : ""}
                        </span>,
                      );
                    }
                    if (status.harvestDue) {
                      chips.push(
                        <span key="harvest" className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                          🌾 Harvest ready
                        </span>,
                      );
                    }
                    if (status.overdueCount > 0) {
                      chips.push(
                        <span key="overdue" className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200">
                          ⏰ {status.overdueCount} overdue
                        </span>,
                      );
                    }
                    if (status.dueTodayCount > 0 && status.overdueCount === 0) {
                      chips.push(
                        <span key="today" className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 border border-sky-200">
                          {status.dueTodayCount} due today
                        </span>,
                      );
                    }
                    if (chips.length === 0) return null;
                    return (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {chips}
                      </div>
                    );
                  })()}
                  {/* Wave 22.0009 — action buttons moved off the photo into
                      the card body. Ghost-icon style; click handlers and
                      gating identical to the previous photo overlay. */}
                  <div className="mt-3 flex items-center gap-1" data-testid={`plant-card-actions-${plant.id}`}>
                    {/* Cross-home favourite heart. Strict source × tier
                        gating: above-tier sources are view-only, so the
                        heart is disabled with an upsell tooltip. */}
                    {(() => {
                      const refId = canonicalPlantRefId(plant as any);
                      const isFavourited = favouriteRefIds.has(refId);
                      const locked = isSourceLockedForTier(plant.source, {
                        aiEnabled,
                        perenualEnabled,
                      });
                      return (
                        <button
                          data-testid={`favourite-plant-${plant.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!locked) handleToggleFavourite(plant);
                          }}
                          disabled={locked}
                          aria-label={
                            locked
                              ? `Favouriting ${plant.common_name} is locked on your plan`
                              : isFavourited
                                ? `Remove ${plant.common_name} from favourites`
                                : `Save ${plant.common_name} to favourites`
                          }
                          aria-pressed={isFavourited}
                          title={
                            locked
                              ? lockedSourceMessage(plant.source)
                              : isFavourited
                                ? "Remove from favourites"
                                : "Save to favourites — follows you across homes"
                          }
                          className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors active:scale-95 ${
                            locked
                              ? "text-rhozly-on-surface/20 cursor-not-allowed"
                              : isFavourited
                                ? "text-rose-500 hover:bg-rose-50"
                                : "text-rhozly-on-surface/55 hover:bg-rhozly-surface-low hover:text-rose-500"
                          }`}
                        >
                          {togglingFavouriteRef === refId ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <Heart
                              size={16}
                              className={isFavourited ? "fill-current" : ""}
                            />
                          )}
                        </button>
                      );
                    })()}
                    <button
                      data-testid={`plant-card-layout-${plant.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate("/garden-layout");
                      }}
                      aria-label={`View ${plant.common_name} on the garden layout`}
                      title="View on garden layout"
                      className="w-9 h-9 rounded-xl text-rhozly-on-surface/55 hover:bg-rhozly-surface-low hover:text-violet-600 flex items-center justify-center transition-colors active:scale-95"
                    >
                      <LayoutGrid size={16} />
                    </button>
                    <button
                      data-testid={`plant-card-light-${plant.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingPlantTab("light");
                        setEditingPlant(plant);
                      }}
                      aria-label={`Check light levels for ${plant.common_name}`}
                      title="Light needs"
                      className="w-9 h-9 rounded-xl text-rhozly-on-surface/55 hover:bg-rhozly-surface-low hover:text-amber-600 flex items-center justify-center transition-colors active:scale-95"
                    >
                      <Sun size={16} />
                    </button>
                    {aiEnabled && (
                      <button
                        data-testid={`plant-card-ask-ai-${plant.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setPageContext({
                            action: "Asking about a plant in the Shed",
                            plant: {
                              id: plant.id,
                              common_name: plant.common_name,
                              scientific_name: plant.scientific_name?.[0] ?? null,
                              source: plant.source,
                              sunlight: plant.sunlight ?? null,
                              cycle: plant.cycle ?? null,
                              edible: plant.edible ?? null,
                            },
                          });
                          setIsOpen(true);
                        }}
                        aria-label={`Ask Rhozly AI about ${plant.common_name}`}
                        title="Ask Rhozly AI about this plant"
                        className="w-9 h-9 rounded-xl text-rhozly-on-surface/55 hover:bg-rhozly-surface-low hover:text-rhozly-primary flex items-center justify-center transition-colors active:scale-95"
                      >
                        <Sparkles size={16} />
                      </button>
                    )}
                    {can("shed.delete") && (
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
                        title={plant.is_archived ? "Restore" : "Archive"}
                        className="w-9 h-9 rounded-xl text-rhozly-on-surface/55 hover:bg-rhozly-surface-low hover:text-orange-600 flex items-center justify-center transition-colors active:scale-95"
                      >
                        {plant.is_archived ? (
                          <ArchiveRestore size={16} />
                        ) : (
                          <Archive size={16} />
                        )}
                      </button>
                    )}
                    {can("shed.delete") && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openDeleteConfirm(plant);
                        }}
                        aria-label={`Delete ${plant.common_name}`}
                        title="Delete"
                        className="w-9 h-9 rounded-xl text-rhozly-on-surface/55 hover:bg-rhozly-surface-low hover:text-red-600 flex items-center justify-center transition-colors active:scale-95"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                  <div className="mt-auto pt-5 border-t border-rhozly-outline/10 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-black text-rhozly-on-surface/40 uppercase tracking-widest mb-1">
                        Instances
                      </p>
                      <span className="inline-flex items-center justify-center min-w-[2rem] px-2.5 py-0.5 rounded-full bg-rhozly-primary/15 text-rhozly-primary text-xl font-black">
                        {plant.instance_count}
                      </span>
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
              );
            })
          )}
        </div>

        {/* Multi-select bottom action bar */}
        {selectMode && selectedPlantIds.size > 0 && (
          <div
            data-testid="shed-bulk-action-bar"
            className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-rhozly-on-surface/95 text-white rounded-2xl shadow-2xl border border-white/10 backdrop-blur-md flex items-center gap-2 px-3 py-2 animate-in slide-in-from-bottom-4 duration-200"
          >
            <div className="flex items-center gap-2 px-2">
              <CheckSquare2 size={14} className="text-rhozly-primary" />
              <span className="text-xs font-black">
                {selectedPlantIds.size} selected
              </span>
            </div>
            <div className="w-px h-6 bg-white/15" />
            {viewTab === "active" ? (
              <>
                <button
                  data-testid="shed-bulk-assign"
                  onClick={() => setShowBulkAssign(true)}
                  disabled={bulkActionState !== "idle"}
                  className="flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl text-xs font-black hover:bg-white/10 transition-colors disabled:opacity-50"
                >
                  <MapPin size={13} />
                  Assign
                </button>
                <button
                  data-testid="shed-bulk-archive"
                  onClick={handleBulkArchive}
                  disabled={bulkActionState !== "idle"}
                  className="flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl text-xs font-black hover:bg-white/10 transition-colors disabled:opacity-50"
                >
                  {bulkActionState === "archiving" ? <Loader2 size={13} className="animate-spin" /> : <Archive size={13} />}
                  Archive
                </button>
                <button
                  data-testid="shed-bulk-delete"
                  onClick={openBulkDeleteConfirm}
                  disabled={bulkActionState !== "idle"}
                  className="flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl text-xs font-black text-rose-300 hover:bg-rose-500/15 transition-colors disabled:opacity-50"
                >
                  {bulkActionState === "deleting" ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  Delete
                </button>
              </>
            ) : (
              <button
                data-testid="shed-bulk-restore"
                onClick={handleBulkUnarchive}
                disabled={bulkActionState !== "idle"}
                className="flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl text-xs font-black hover:bg-white/10 transition-colors disabled:opacity-50"
              >
                {bulkActionState === "archiving" ? <Loader2 size={13} className="animate-spin" /> : <ArchiveRestore size={13} />}
                Restore
              </button>
            )}
            <button
              data-testid="shed-bulk-cancel"
              onClick={exitSelectMode}
              className="flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl text-xs font-bold text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X size={13} />
              Cancel
            </button>
          </div>
        )}
        </>
        )}
      </div>

      {typeof document !== "undefined" &&
        createPortal(
          <>
            {bulkQueue.length > 0 && (
              <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-rhozly-bg/95 backdrop-blur-xl animate-in zoom-in-95">
                <div className="bg-rhozly-surface-lowest w-full max-w-md rounded-3xl p-8 shadow-2xl border border-rhozly-outline/20 flex flex-col max-h-[85vh]">
                  <div className="flex justify-between items-start mb-8">
                    <div>
                      <h3 className="text-3xl font-black">Importing Plants</h3>
                      <p className="text-[10px] font-black text-rhozly-on-surface/40 uppercase tracking-widest mt-1">
                        {isBulkProcessing
                          ? `${bulkQueue.filter(q => q.status === "success").length} / ${bulkQueue.length} imported…`
                          : "Import Complete!"}
                      </p>
                    </div>
                    {!isBulkProcessing && (
                      <button
                        onClick={() => {
                          const n = bulkQueue.filter((q) => q.status === "success").length;
                          if (n > 0) toast.success(`${n} plant${n !== 1 ? "s" : ""} imported successfully.`);
                          setBulkQueue([]);
                        }}
                        aria-label="Close bulk import"
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
                        className={`flex items-center justify-between p-4 bg-rhozly-surface-lowest border rounded-2xl shadow-sm transition-all ${item.status === "processing" ? "border-rhozly-primary ring-1 ring-rhozly-primary/20" : "border-rhozly-outline/10"}`}
                      >
                        <div className="flex items-center gap-4">
                          <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${item.status === "pending" ? "bg-rhozly-surface-low text-rhozly-on-surface/30" : item.status === "processing" ? "bg-rhozly-primary/10 text-rhozly-primary" : item.status === "success" ? "bg-green-100 text-green-500" : "bg-rhozly-error/10 text-rhozly-error"}`}
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
                                {item.source === "api" ? "Perenual Database" : item.source === "verdantly" ? "Verdantly Database" : "AI Generated"}
                              </p>
                            )}
                          </div>
                        </div>
                        {item.status === "error" && !isBulkProcessing && (
                          <button
                            onClick={() => handleRetryItem(item.id)}
                            aria-label={`Retry importing ${item.name}`}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-50 text-red-500 hover:bg-red-100 text-[10px] font-black uppercase tracking-widest transition-colors shrink-0"
                          >
                            <RefreshCw size={11} />
                            Retry
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  {!isBulkProcessing && (
                    <button
                      onClick={() => {
                        const n = bulkQueue.filter((q) => q.status === "success").length;
                        if (n > 0) toast.success(`${n} plant${n !== 1 ? "s" : ""} imported successfully.`);
                        setBulkQueue([]);
                      }}
                      className="mt-8 w-full py-4 bg-rhozly-primary text-white rounded-2xl font-black shadow-xl hover:scale-105 transition-transform"
                    >
                      Return to Shed
                    </button>
                  )}
                </div>
              </div>
            )}

            {confirmState.isOpen && confirmState.plant && confirmState.type === "delete" && (confirmState.inventoryCount ?? 0) > 0 && (
              <DeleteWithInstancesModal
                plantName={confirmState.plant.common_name}
                count={confirmState.inventoryCount ?? 0}
                isLoading={actionLoading}
                onClose={() => setConfirmState({ isOpen: false, type: "delete", plant: null })}
                onEndOfLife={executeEndOfLifeInstead}
                onDeleteAll={executeDelete}
              />
            )}
            {confirmState.isOpen && confirmState.plant && !(confirmState.type === "delete" && (confirmState.inventoryCount ?? 0) > 0) && (
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
                    ? confirmState.inventoryCount
                      ? `Permanently delete ${confirmState.plant.common_name}? This will also remove ${confirmState.inventoryCount} inventory item${confirmState.inventoryCount > 1 ? "s" : ""}.`
                      : `Permanently delete ${confirmState.plant.common_name}?`
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
                aiEnabled={aiEnabled}
              />
            )}
            {bulkDeleteState.open && (
              <BulkDeleteModal
                count={selectedPlantIds.size}
                instanceCount={bulkDeleteState.instanceCount}
                isLoading={bulkActionState === "deleting"}
                onClose={() => setBulkDeleteState({ open: false, instanceCount: 0 })}
                onEndOfLife={handleBulkEndOfLifeInstead}
                onDeleteAll={handleBulkDelete}
              />
            )}
            {showBulkAssign && (
              <BulkAssignModal
                plants={plants.filter((p) => selectedPlantIds.has(p.id as number))}
                locations={locations}
                homeId={homeId}
                aiEnabled={aiEnabled}
                isAssigning={actionLoading}
                onAssign={handleBulkAssign}
                onClose={() => setShowBulkAssign(false)}
              />
            )}
            {showSourcePicker && sourcePickerPlants.length > 0 && (
              <PlantSourcePicker
                plants={sourcePickerPlants}
                isPremium={perenualEnabled}
                isAiEnabled={aiEnabled}
                homeId={homeId}
                onClose={handleCloseModals}
                onConfirm={(items) => {
                  setShowSourcePicker(false);
                  setSourcePickerPlants([]);
                  setInitialCartItems(items);
                  setShowBulkSearch(true);
                }}
              />
            )}
            {showBulkSearch && (
              <BulkSearchModal
                homeId={homeId}
                isPremium={perenualEnabled}
                isAiEnabled={aiEnabled}
                initialSearchTerm={initialSearchTerm}
                initialCartItems={initialCartItems}
                onClose={handleCloseModals}
                onProceedToBulkAdd={handleProceedToBulkAdd}
                onManualSave={handleManualSave}
              />
            )}
            {showBulkPaste && (
              <BulkPastePlantsModal
                homeId={homeId}
                aiEnabled={aiEnabled}
                onClose={() => setShowBulkPaste(false)}
                onCreated={() => {
                  setShowBulkPaste(false);
                  // The parent listens to realtime changes on `plants`;
                  // no explicit refresh needed.
                }}
              />
            )}
            {editingPlant && (
              <PlantEditModal
                homeId={homeId}
                plant={editingPlant}
                initialTab={editingPlantTab}
                onSave={handleUpdatePlant}
                onForkSave={handleForkPlant}
                onClose={() => { setEditingPlant(null); setEditingPlantTab("care"); }}
                isSaving={actionLoading}
                aiEnabled={aiEnabled}
                isPremium={perenualEnabled}
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
        className="bg-rhozly-surface-lowest p-6 rounded-3xl w-full max-w-sm"
      >
        <h3 id="confirm-modal-title" className="font-black text-lg mb-2">
          {title}
        </h3>
        <p id="confirm-modal-description" className="text-sm font-bold text-rhozly-on-surface/60 mb-6">
          {description}
        </p>
        <div className="flex gap-3">
          <button
            ref={cancelButtonRef}
            onClick={onClose}
            className="flex-1 py-3 rounded-2xl font-bold bg-rhozly-surface-low hover:bg-rhozly-surface text-rhozly-on-surface"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={`flex-1 py-3 rounded-2xl font-bold text-white ${isDestructive ? "bg-rhozly-error hover:opacity-90" : "bg-rhozly-primary"}`}
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

/**
 * Delete dialog shown when a plant still has instances. Offers a choice:
 * keep the garden history by marking the instances End of Life (and
 * archiving the plant), or delete the plant + every instance permanently.
 */
function DeleteWithInstancesModal({
  plantName,
  count,
  isLoading,
  onClose,
  onEndOfLife,
  onDeleteAll,
}: {
  plantName: string;
  count: number;
  isLoading: boolean;
  onClose: () => void;
  onEndOfLife: () => void;
  onDeleteAll: () => void;
}) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const plural = count !== 1;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        data-testid="delete-with-instances-modal"
        className="bg-rhozly-surface-lowest p-6 rounded-3xl w-full max-w-sm"
      >
        <h3 className="font-black text-lg mb-2">Delete {plantName}?</h3>
        <p className="text-sm font-bold text-rhozly-on-surface/60 mb-5">
          {plantName} has {count} plant{plural ? "s" : ""} in your garden. You can keep {plural ? "their" : "its"} history,
          or remove everything permanently.
        </p>
        <div className="space-y-2.5">
          <button
            onClick={onEndOfLife}
            disabled={isLoading}
            data-testid="delete-keep-eol"
            className="w-full py-3 px-4 rounded-2xl font-black text-white bg-rhozly-primary hover:opacity-90 disabled:opacity-60 text-left flex items-center justify-between gap-2"
          >
            <span>
              Keep the history
              <span className="block text-[11px] font-bold text-white/70">
                Mark {plural ? "them" : "it"} End of Life (kept in Senescence) and archive {plantName}.
              </span>
            </span>
            {isLoading && <Loader2 className="animate-spin shrink-0" size={16} />}
          </button>
          <button
            onClick={onDeleteAll}
            disabled={isLoading}
            data-testid="delete-everything"
            className="w-full py-3 px-4 rounded-2xl font-black text-rhozly-error border border-rhozly-error/30 hover:bg-rhozly-error/5 disabled:opacity-60 text-left"
          >
            Delete everything
            <span className="block text-[11px] font-bold text-rhozly-error/70">
              Permanently remove {plantName} and {plural ? "all" : "the"} {count} plant{plural ? "s" : ""}.
            </span>
          </button>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="w-full py-3 rounded-2xl font-bold bg-rhozly-surface-low hover:bg-rhozly-surface text-rhozly-on-surface disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Bulk delete dialog. When the selected plants have instances it offers the
 * same Keep-history / Delete-everything choice as the single-plant flow,
 * applied across the batch; otherwise a plain destructive confirm.
 */
function BulkDeleteModal({
  count,
  instanceCount,
  isLoading,
  onClose,
  onEndOfLife,
  onDeleteAll,
}: {
  count: number;
  instanceCount: number;
  isLoading: boolean;
  onClose: () => void;
  onEndOfLife: () => void;
  onDeleteAll: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const plantsPlural = count !== 1;
  const hasInstances = instanceCount > 0;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        data-testid="bulk-delete-modal"
        className="bg-rhozly-surface-lowest p-6 rounded-3xl w-full max-w-sm"
      >
        <h3 className="font-black text-lg mb-2">
          Delete {count} plant{plantsPlural ? "s" : ""}?
        </h3>
        {hasInstances ? (
          <>
            <p className="text-sm font-bold text-rhozly-on-surface/60 mb-5">
              {plantsPlural ? "These plants have" : "This plant has"} {instanceCount} plant
              {instanceCount !== 1 ? "s" : ""} in your garden. Keep the history, or remove everything permanently.
            </p>
            <div className="space-y-2.5">
              <button
                onClick={onEndOfLife}
                disabled={isLoading}
                data-testid="bulk-delete-keep-eol"
                className="w-full py-3 px-4 rounded-2xl font-black text-white bg-rhozly-primary hover:opacity-90 disabled:opacity-60 text-left flex items-center justify-between gap-2"
              >
                <span>
                  Keep the history
                  <span className="block text-[11px] font-bold text-white/70">
                    Mark their instances End of Life (kept in Senescence) and archive the plant{plantsPlural ? "s" : ""}.
                  </span>
                </span>
                {isLoading && <Loader2 className="animate-spin shrink-0" size={16} />}
              </button>
              <button
                onClick={onDeleteAll}
                disabled={isLoading}
                data-testid="bulk-delete-everything"
                className="w-full py-3 px-4 rounded-2xl font-black text-rhozly-error border border-rhozly-error/30 hover:bg-rhozly-error/5 disabled:opacity-60 text-left"
              >
                Delete everything
                <span className="block text-[11px] font-bold text-rhozly-error/70">
                  Permanently remove the plant{plantsPlural ? "s" : ""} and all {instanceCount} instance
                  {instanceCount !== 1 ? "s" : ""}.
                </span>
              </button>
              <button
                onClick={onClose}
                disabled={isLoading}
                className="w-full py-3 rounded-2xl font-bold bg-rhozly-surface-low hover:bg-rhozly-surface text-rhozly-on-surface disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm font-bold text-rhozly-on-surface/60 mb-6">
              Permanently delete {count} plant{plantsPlural ? "s" : ""}? This can't be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                disabled={isLoading}
                className="flex-1 py-3 rounded-2xl font-bold bg-rhozly-surface-low hover:bg-rhozly-surface text-rhozly-on-surface disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={onDeleteAll}
                disabled={isLoading}
                data-testid="bulk-delete-everything"
                className="flex-1 py-3 rounded-2xl font-bold text-white bg-rhozly-error hover:opacity-90 disabled:opacity-60"
              >
                {isLoading ? <Loader2 className="animate-spin mx-auto" size={18} /> : "Delete"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
