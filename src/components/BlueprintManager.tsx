import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { supabase } from "../lib/supabase";
import {
  Repeat,
  Plus,
  Trash2,
  CheckSquare,
  Droplets,
  Shovel,
  Grid,
  MapPin,
  FolderKanban,
  Search,
  Filter,
  X,
  Pause,
  Play,
} from "lucide-react";
import { IconGrowth, IconPrune, IconHarvest, IconAI } from "../constants/icons";
import toast from "react-hot-toast";
import { logEvent, EVENT } from "../events/registry";
import { usePermissions } from "../context/HomePermissionsContext";
import { useBetaFeedbackContext } from "../context/BetaFeedbackContext";
import { useSearchParams } from "react-router-dom";
import InfoTooltip from "./InfoTooltip";
import EmptyState from "./shared/EmptyState";

import AddTaskModal from "./AddTaskModal";
import { ConfirmModal } from "./ConfirmModal";
import OptimiseTab from "./OptimiseTab";
import { TASK_CATEGORIES } from "../constants/taskCategories";
import { scorePlantByPreferences } from "../hooks/useUserPreferences";
import { usePlantDoctor } from "../context/PlantDoctorContext";
import { useHomeRealtime } from "../hooks/useHomeRealtime";
import { Logger } from "../lib/errorHandler";
import { getLocalDateString } from "../lib/taskEngine";
import { projectAnnualWindows } from "../lib/windowTasks";

interface BlueprintManagerProps {
  homeId: string;
  aiEnabled?: boolean;
  /** When rendered embedded (e.g. inside the Planner's Routines tab, B12), skip
   *  the URL deep-link consumption below — otherwise it strips the host's own
   *  `?tab=` param (PlannerHub uses `?tab=routines`), bouncing the tab back. */
  embedded?: boolean;
}

export default function BlueprintManager({ homeId, aiEnabled = false, embedded = false }: BlueprintManagerProps) {
  const { preferences } = usePlantDoctor();
  const { can } = usePermissions();
  const { requestFeedback } = useBetaFeedbackContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const openHandled = useRef(false);
  const [activeTab, setActiveTab] = useState<"blueprints" | "optimise">("blueprints");
  const [blueprints, setBlueprints] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [retryTick, setRetryTick] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  // Builder Modal State
  const [isBuilding, setIsBuilding] = useState(false);
  const [editingBlueprint, setEditingBlueprint] = useState<any | null>(null);

  // Pause menu state
  const [pauseMenuId, setPauseMenuId] = useState<string | null>(null);
  const [savingPauseId, setSavingPauseId] = useState<string | null>(null);

  const setBlueprintPaused = async (blueprintId: string, pausedUntil: string | null) => {
    setSavingPauseId(blueprintId);
    try {
      const { error } = await supabase
        .from("task_blueprints")
        .update({ paused_until: pausedUntil })
        .eq("id", blueprintId);
      if (error) throw error;
      setBlueprints((prev) =>
        prev.map((b) => (b.id === blueprintId ? { ...b, paused_until: pausedUntil } : b)),
      );
      toast.success(pausedUntil ? "Schedule paused." : "Schedule resumed.");
    } catch (err: any) {
      Logger.error("Failed to update blueprint pause state", err, { blueprintId }, "Could not update pause state.");
    } finally {
      setSavingPauseId(null);
      setPauseMenuId(null);
    }
  };

  // Universal Confirmation State
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    confirmText: string;
    onConfirm: () => Promise<void>;
  } | null>(null);

  // 🚀 NEW: Search & Filter States
  const [searchQuery, setSearchQuery] = useState("");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filterType, setFilterType] = useState("all");
  const [filterLocation, setFilterLocation] = useState("all");
  const [filterArea, setFilterArea] = useState("all");
  const [filterPlan, setFilterPlan] = useState("all");
  const [filterPlant, setFilterPlant] = useState("all");

  // 🚀 NEW: Dynamic Options Extracted from DB
  const [filterOptions, setFilterOptions] = useState({
    locations: [] as { id: string; name: string }[],
    areas: [] as { id: string; name: string; location_id: string }[],
    plans: [] as { id: string; name: string }[],
    plants: [] as string[],
  });

  useEffect(() => {
    // Embedded (Planner Routines tab, B12): don't consume/strip URL params — the
    // ?open/?category/?tab deep-links target the standalone /schedule route, and
    // stripping them would clobber the host PlannerHub's own ?tab=routines.
    if (embedded) return;
    if (openHandled.current) return;
    const open = searchParams.get("open");
    const category = searchParams.get("category");
    const tab = searchParams.get("tab");
    if (open || category || tab) {
      openHandled.current = true;
      if (open === "add-task") setIsBuilding(true);
      // ?category=Pruning|Harvesting|… filters the routines list by task type
      // (dashboard category chips). ?tab=optimise opens the Optimise tab
      // (weekly optimise-digest notification).
      if (category) setFilterType(category);
      if (tab === "optimise" || tab === "blueprints") setActiveTab(tab);
      setSearchParams((p) => { const n = new URLSearchParams(p); n.delete("open"); n.delete("category"); n.delete("tab"); return n; }, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Generation guard (stale responses from a previous home must not land)
  // + first-load tracking so realtime refreshes don't flash the skeleton.
  const fetchGen = useRef(0);
  const hasLoadedRef = useRef(false);
  useEffect(() => {
    hasLoadedRef.current = false;
  }, [homeId]);

  const fetchBlueprints = useCallback(async () => {
    const gen = ++fetchGen.current;
    // Skeleton only on the initial load: flipping the whole list to
    // skeletons on every realtime event made the page flash whenever any
    // member touched a blueprint.
    if (!hasLoadedRef.current) setLoading(true);
    setFetchError(false);
    try {
      const { data: bpData, error: bpError } = await supabase
        .from("task_blueprints")
        .select(
          `
          *,
          locations (name),
          areas (name),
          plans (name, ai_blueprint)
        `,
        )
        .eq("home_id", homeId)
        .eq("is_archived", false)
        .order("created_at", { ascending: false });

      if (bpError) throw bpError;

      const { data: invData } = await supabase
        .from("inventory_items")
        .select("id, plant_name")
        .eq("home_id", homeId);

      if (gen !== fetchGen.current) return;

      const invMap = (invData || []).reduce(
        (acc, item) => {
          acc[item.id] = item.plant_name;
          return acc;
        },
        {} as Record<string, string>,
      );

      const locMap = new Map();
      const areaMap = new Map();
      const planMap = new Map();
      const plantSet = new Set<string>();

      const enrichedBlueprints = (bpData || []).map((bp) => {
        let plantNames = "General Task";
        let basePlantName = "";

        if (bp.inventory_item_ids && bp.inventory_item_ids.length > 0) {
          basePlantName = invMap[bp.inventory_item_ids[0]] || "Unknown Plant";
          plantNames = basePlantName;
          plantSet.add(basePlantName);
          if (bp.inventory_item_ids.length > 1) {
            plantNames += ` (x${bp.inventory_item_ids.length})`;
          }
        }

        // Build Dynamic Filter Options
        if (bp.location_id && bp.locations)
          locMap.set(bp.location_id, bp.locations.name);
        if (bp.area_id && bp.areas)
          areaMap.set(bp.area_id, {
            id: bp.area_id,
            name: bp.areas.name,
            location_id: bp.location_id,
          });
        if (bp.plan_id && bp.plans) {
          const pName =
            bp.plans.name ||
            bp.plans.ai_blueprint?.project_overview?.title ||
            "Untitled Plan";
          planMap.set(bp.plan_id, pName);
        }

        return { ...bp, plantContext: plantNames, basePlantName };
      });

      setFilterOptions({
        locations: Array.from(locMap.entries()).map(([id, name]) => ({
          id,
          name,
        })),
        areas: Array.from(areaMap.values()),
        plans: Array.from(planMap.entries()).map(([id, name]) => ({
          id,
          name,
        })),
        plants: Array.from(plantSet).sort(),
      });

      setBlueprints(enrichedBlueprints);
      hasLoadedRef.current = true;
    } catch (err: any) {
      if (gen === fetchGen.current) setFetchError(true);
    } finally {
      if (gen === fetchGen.current) setLoading(false);
    }
  }, [homeId, retryTick]);

  useEffect(() => {
    fetchBlueprints();
  }, [fetchBlueprints]);

  useHomeRealtime("task_blueprints", fetchBlueprints);

  // 🚀 CASCADE AREA FILTER: If Location is selected, filter available areas
  useEffect(() => {
    if (filterLocation !== "all" && filterLocation !== "none") {
      const matchingArea = filterOptions.areas.find((a) => a.id === filterArea);
      if (matchingArea && matchingArea.location_id !== filterLocation) {
        setFilterArea("all");
      }
    }
  }, [filterLocation, filterOptions.areas]);

  const executeConfirmAction = async () => {
    if (!confirmState) return;
    setIsDeleting(true);
    try {
      await confirmState.onConfirm();
    } catch (err: any) {
      toast.error(err.message || "Action failed.");
    } finally {
      setIsDeleting(false);
      setConfirmState(null);
    }
  };

  const handleDeleteClick = (bp: any) => {
    setConfirmState({
      isOpen: true,
      title: "Delete Routine",
      description:
        "Are you sure you want to permanently delete this routine? Future tasks will no longer be generated.",
      confirmText: "Delete",
      onConfirm: async () => {
        const { error } = await supabase
          .from("task_blueprints")
          .delete()
          .eq("id", bp.id);
        if (error) throw error;
        logEvent(EVENT.BLUEPRINT_DELETED, { blueprint_id: bp.id, title: bp.title });
        setBlueprints((prev) => prev.filter((b) => b.id !== bp.id));
        toast.success("Routine removed.");
      },
    });
  };

  // Phase 4.5 — one style record per task type so a wall of routines is
  // scannable by care type at a distance: the icon colour (unchanged hues),
  // its tile tint, the card's left accent bar, and the dot-track fill all
  // key off the same family.
  // accentHex drives the card's left-border accent via inline style (a real
  // border follows the rounded corners, so the card needs NO overflow-hidden —
  // which would otherwise clip the pause-duration dropdown on short cards).
  const TASK_TYPE_STYLE: Record<
    string,
    { iconClass: string; tileClass: string; accentHex: string; dotClass: string }
  > = {
    Watering:    { iconClass: "text-blue-500",   tileClass: "bg-blue-50",   accentHex: "#3b82f6", dotClass: "bg-blue-500" },
    Maintenance: { iconClass: "text-orange-500", tileClass: "bg-orange-50", accentHex: "#f97316", dotClass: "bg-orange-500" },
    Pruning:     { iconClass: "text-lime-600",   tileClass: "bg-lime-50",   accentHex: "#65a30d", dotClass: "bg-lime-600" },
    Harvesting:  { iconClass: "text-yellow-500", tileClass: "bg-yellow-50", accentHex: "#eab308", dotClass: "bg-yellow-500" },
    Planting:    { iconClass: "text-amber-700",  tileClass: "bg-amber-50",  accentHex: "#b45309", dotClass: "bg-amber-700" },
  };
  const DEFAULT_TYPE_STYLE = {
    iconClass: "text-rhozly-on-surface/50",
    tileClass: "bg-rhozly-surface-lowest",
    accentHex: "rgba(26,28,27,0.2)",
    dotClass: "bg-rhozly-on-surface/40",
  };
  const taskTypeStyle = (type: string) => TASK_TYPE_STYLE[type] ?? DEFAULT_TYPE_STYLE;

  const getTaskIcon = (type: string) => {
    const { iconClass } = taskTypeStyle(type);
    switch (type) {
      case "Watering":
        return <Droplets size={16} className={iconClass} />;
      case "Maintenance":
        return <IconPrune size={16} className={iconClass} />;
      case "Pruning":
        return <IconPrune size={16} className={iconClass} />;
      case "Harvesting":
        return <IconHarvest size={16} className={iconClass} />;
      case "Planting":
        return <Shovel size={16} className={iconClass} />;
      default:
        return <CheckSquare size={16} className={iconClass} />;
    }
  };

  // 🚀 NEW: Filter Execution Logic
  const filteredBlueprints = useMemo(() => {
    const filtered = blueprints.filter((bp) => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesTitle = bp.title.toLowerCase().includes(query);
        const matchesDesc =
          bp.description && bp.description.toLowerCase().includes(query);
        if (!matchesTitle && !matchesDesc) return false;
      }
      if (filterType !== "all" && bp.task_type !== filterType) return false;
      if (filterLocation === "none" && bp.location_id) return false;
      if (filterLocation !== "all" && filterLocation !== "none" && bp.location_id !== filterLocation) return false;
      if (filterArea === "none" && bp.area_id) return false;
      if (filterArea !== "all" && filterArea !== "none" && bp.area_id !== filterArea) return false;
      if (filterPlan === "none" && bp.plan_id) return false;
      if (filterPlan !== "all" && filterPlan !== "none" && bp.plan_id !== filterPlan) return false;
      if (filterPlant === "none" && bp.basePlantName) return false;
      if (filterPlant !== "all" && filterPlant !== "none" && bp.basePlantName !== filterPlant) return false;
      return true;
    });

    if (!preferences.length) return filtered;
    return [...filtered].sort((a, b) => {
      const scoreA = scorePlantByPreferences(a.basePlantName || "", "", preferences);
      const scoreB = scorePlantByPreferences(b.basePlantName || "", "", preferences);
      return scoreB - scoreA;
    });
  }, [blueprints, searchQuery, filterType, filterLocation, filterArea, filterPlan, filterPlant, preferences]);

  const hasActiveFilters =
    filterType !== "all" ||
    filterLocation !== "all" ||
    filterArea !== "all" ||
    filterPlan !== "all" ||
    filterPlant !== "all";

  // Phase 4.5 — the Filters badge shows a REAL count, not a "!" marker.
  const activeFilterCount =
    (filterType !== "all" ? 1 : 0) +
    (filterLocation !== "all" ? 1 : 0) +
    (filterArea !== "all" ? 1 : 0) +
    (filterPlan !== "all" ? 1 : 0) +
    (filterPlant !== "all" ? 1 : 0);

  const clearFilters = () => {
    setFilterType("all");
    setFilterLocation("all");
    setFilterArea("all");
    setFilterPlan("all");
    setFilterPlant("all");
  };

  const availableAreasDropdown =
    filterLocation !== "all" && filterLocation !== "none"
      ? filterOptions.areas.filter((a) => a.location_id === filterLocation)
      : filterOptions.areas;

  if (loading && activeTab === "blueprints")
    return (
      <div className="w-full h-full flex flex-col p-4 md:p-8 pb-32">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-6">
          <div>
            <div className="h-10 w-44 rounded-2xl bg-rhozly-surface-low animate-pulse mb-2" />
            <div className="h-3 w-56 rounded-lg bg-rhozly-surface-low animate-pulse" />
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-white rounded-3xl p-6 border border-rhozly-outline/10 shadow-sm flex flex-col gap-4 animate-pulse">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-rhozly-surface-low shrink-0" />
                  <div className="flex flex-col gap-1.5">
                    <div className="h-3 w-24 rounded-md bg-rhozly-surface-low" />
                    <div className="h-5 w-36 rounded-lg bg-rhozly-surface-low" />
                  </div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-rhozly-surface-low shrink-0" />
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="h-3 w-full rounded-md bg-rhozly-surface-low" />
                <div className="h-3 w-3/4 rounded-md bg-rhozly-surface-low" />
              </div>
              <div className="pt-4 border-t border-rhozly-outline/10 flex gap-2 mt-auto">
                <div className="h-5 w-20 rounded-md bg-rhozly-surface-low" />
                <div className="h-5 w-24 rounded-md bg-rhozly-surface-low" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );

  if (fetchError && activeTab === "blueprints")
    return (
      <div className="p-10 flex flex-col items-center justify-center gap-4 text-center">
        <p className="font-black text-lg text-rhozly-on-surface">Could not load Routines</p>
        <p className="text-sm font-bold text-rhozly-on-surface/50">Check your connection and try again.</p>
        <button
          onClick={() => setRetryTick((t) => t + 1)}
          className="px-6 py-3 bg-rhozly-primary text-white rounded-2xl font-black shadow-sm hover:scale-105 transition-transform active:scale-95"
        >
          Retry
        </button>
      </div>
    );

  return (
    <div className="w-full h-full flex flex-col p-4 md:p-8 animate-in fade-in duration-700 pb-32">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-4">
        <div>
          <h1 data-testid="schedule-heading" className="text-4xl font-black font-display text-rhozly-on-surface flex items-center gap-3">
            Routines
            {blueprints.length > 0 && activeTab === "blueprints" && (
              <span className="text-base font-black bg-rhozly-primary/10 text-rhozly-primary px-2.5 py-1 rounded-xl">
                {blueprints.length}
              </span>
            )}
          </h1>
          <p className="text-sm font-bold text-rhozly-on-surface/40 mt-1">
            Set up recurring care once — Rhozly handles the rest. Watering every 4 days, pruning every 3 weeks, on autopilot.
          </p>
        </div>
        {can("tasks.create_home") && activeTab === "blueprints" && (
          <button
            data-testid="blueprint-new-btn"
            onClick={() => setIsBuilding(true)}
            className="flex items-center justify-center gap-2 bg-rhozly-primary text-white px-6 py-3.5 rounded-2xl font-black shadow-lg hover:scale-105 transition-transform active:scale-95"
          >
            <Plus size={18} strokeWidth={3} /> New Routine
          </button>
        )}
      </div>

      {/* Tab bar */}
      <div className="overflow-x-auto mb-6 -mx-1">
        <div className="flex gap-1 px-1 min-w-max bg-rhozly-surface-low rounded-2xl p-1">
          <button
            data-testid="tab-blueprints"
            onClick={() => setActiveTab("blueprints")}
            className={`shrink-0 px-5 py-2 rounded-xl text-sm font-bold transition-colors ${activeTab === "blueprints" ? "bg-white text-rhozly-on-surface shadow-sm" : "text-rhozly-on-surface-variant hover:text-rhozly-on-surface"}`}
          >
            Routines
          </button>
          <button
            data-testid="tab-optimise"
            onClick={() => setActiveTab("optimise")}
            className={`shrink-0 px-5 py-2 rounded-xl text-sm font-bold transition-colors ${activeTab === "optimise" ? "bg-white text-rhozly-on-surface shadow-sm" : "text-rhozly-on-surface-variant hover:text-rhozly-on-surface"}`}
          >
            Suggestions
          </button>
        </div>
      </div>

      {activeTab === "optimise" && <OptimiseTab homeId={homeId} aiEnabled={aiEnabled} />}

      {activeTab === "blueprints" && <>

      {/* Search & Filter Top Bar */}
      {blueprints.length > 0 && (
        <div className="flex flex-col gap-3 mb-6 animate-in slide-in-from-top-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search
                className="absolute left-4 top-1/2 -translate-y-1/2 text-rhozly-on-surface/40"
                size={20}
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search routines..."
                aria-label="Search routines"
                className="w-full pl-12 pr-4 py-3.5 bg-white border border-rhozly-outline/10 rounded-2xl font-bold shadow-sm outline-none focus:border-rhozly-primary focus:ring-1 focus:ring-rhozly-primary/20 transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-rhozly-on-surface/40 hover:text-rhozly-on-surface/70 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl"
                >
                  <X size={16} />
                </button>
              )}
            </div>
            <button
              onClick={() => setIsFilterOpen(!isFilterOpen)}
              className={`px-5 py-3.5 rounded-2xl font-black shadow-sm transition-all flex items-center justify-center gap-2 border ${isFilterOpen || hasActiveFilters ? "bg-rhozly-primary text-white border-rhozly-primary" : "bg-white text-rhozly-on-surface/60 border-rhozly-outline/10 hover:bg-rhozly-surface-low"}`}
            >
              <Filter size={18} />
              <span className="hidden sm:inline">Filters</span>
              {hasActiveFilters && (
                <span className="bg-white text-rhozly-primary min-w-[20px] h-5 px-1 rounded-full flex items-center justify-center text-[10px] font-black ml-1">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>

          {/* Filter Drawer */}
          {isFilterOpen && (
            <div className="bg-white p-5 rounded-3xl border border-rhozly-outline/10 shadow-sm animate-in fade-in slide-in-from-top-2">
              <div className="flex justify-between items-center mb-4">
                <h4 className="text-sm font-black text-gray-800">
                  Filters
                </h4>
                {hasActiveFilters && (
                  <button
                    onClick={clearFilters}
                    className="text-[10px] font-black uppercase tracking-widest text-rhozly-primary hover:underline"
                  >
                    Clear All
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 ml-1">
                    Task Type
                  </label>
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    className="w-full p-3 bg-rhozly-surface-lowest rounded-xl font-bold text-sm border border-transparent focus:border-rhozly-primary outline-none"
                  >
                    <option value="all">All Types</option>
                    {TASK_CATEGORIES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 ml-1">
                    Location
                  </label>
                  <select
                    data-testid="schedule-filter-location"
                    value={filterLocation}
                    onChange={(e) => setFilterLocation(e.target.value)}
                    className="w-full p-3 bg-rhozly-surface-lowest rounded-xl font-bold text-sm border border-transparent focus:border-rhozly-primary outline-none"
                  >
                    <option value="all">All Locations</option>
                    <option value="none">Unassigned (None)</option>
                    {filterOptions.locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 ml-1">
                    Area
                  </label>
                  <select
                    data-testid="schedule-filter-area"
                    value={filterArea}
                    onChange={(e) => setFilterArea(e.target.value)}
                    disabled={filterLocation === "none"}
                    className="w-full p-3 bg-rhozly-surface-lowest rounded-xl font-bold text-sm border border-transparent focus:border-rhozly-primary outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="all">All Areas</option>
                    <option value="none">Unassigned (None)</option>
                    {availableAreasDropdown.map((a: any) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 ml-1">
                    Plan
                  </label>
                  <select
                    value={filterPlan}
                    onChange={(e) => setFilterPlan(e.target.value)}
                    className="w-full p-3 bg-rhozly-surface-lowest rounded-xl font-bold text-sm border border-transparent focus:border-rhozly-primary outline-none"
                  >
                    <option value="all">All Plans</option>
                    <option value="none">Unassigned (None)</option>
                    {filterOptions.plans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 ml-1">
                    Plant
                  </label>
                  <select
                    value={filterPlant}
                    onChange={(e) => setFilterPlant(e.target.value)}
                    className="w-full p-3 bg-rhozly-surface-lowest rounded-xl font-bold text-sm border border-transparent focus:border-rhozly-primary outline-none"
                  >
                    <option value="all">All Plants</option>
                    <option value="none">Unassigned (None)</option>
                    {filterOptions.plants.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {blueprints.length === 0 ? (
        <EmptyState
          size="lg"
          icon={<Repeat size={36} />}
          title="No routines yet"
          body="Create routines yourself or use Smart Routines on a plant to generate them automatically."
          primaryCta={
            can("tasks.create_home")
              ? {
                  label: "Create your first routine",
                  onClick: () => setIsBuilding(true),
                  icon: <Plus size={16} />,
                }
              : undefined
          }
        />
      ) : filteredBlueprints.length === 0 ? (
        <EmptyState
          size="lg"
          icon={<Search size={32} />}
          title="No matches found"
          body="Try adjusting your filters or search query."
          primaryCta={{
            label: "Clear all filters",
            onClick: () => { setSearchQuery(""); clearFilters(); },
          }}
        />
      ) : (
        <>
          <div className="sr-only" aria-live="polite" aria-atomic="true">
            Showing {filteredBlueprints.length} automation{filteredBlueprints.length !== 1 ? 's' : ''}
          </div>
          {(searchQuery || hasActiveFilters) && (
            <p className="text-xs font-black text-rhozly-on-surface/50 uppercase tracking-widest mb-4" aria-hidden="true">
              {filteredBlueprints.length} result{filteredBlueprints.length !== 1 ? 's' : ''} found
            </p>
          )}
          <div data-testid="blueprint-list" className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredBlueprints.map((bp) => (
              <div
                key={bp.id}
                onClick={() => setEditingBlueprint(bp)}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setEditingBlueprint(bp);
                  }
                }}
                // Phase 4.5 — the left accent is a 6px border (follows the
                // rounded corners; inline color beats the hover border shorthand
                // for the left side only). NO overflow-hidden — it would clip
                // the pause dropdown on short cards.
                style={{ borderLeftColor: taskTypeStyle(bp.task_type).accentHex }}
                className="relative bg-white rounded-3xl p-6 border border-l-[6px] border-rhozly-outline/10 shadow-sm flex flex-col transition-all hover:border-rhozly-primary/30 hover:shadow-md cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rhozly-primary focus-visible:ring-offset-2"
              >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-2xl ${taskTypeStyle(bp.task_type).tileClass} flex items-center justify-center shrink-0`}>
                    {getTaskIcon(bp.task_type)}
                  </div>
                  <div>
                    <span className="text-[9px] font-black uppercase tracking-widest bg-rhozly-surface-low text-rhozly-on-surface/50 px-2 py-0.5 rounded-md mb-1 inline-block">
                      Every {bp.frequency_days} Days
                    </span>
                    <h3 className="font-black text-lg leading-tight text-rhozly-on-surface">
                      {bp.title}
                    </h3>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {/* Pause / resume control */}
                  <div className="relative">
                    {(() => {
                      const pausedMs = bp.paused_until ? new Date(bp.paused_until).getTime() : null;
                      const isPaused = pausedMs !== null && pausedMs > Date.now();
                      return (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isPaused) {
                              setBlueprintPaused(bp.id, null);
                            } else {
                              setPauseMenuId(pauseMenuId === bp.id ? null : bp.id);
                            }
                          }}
                          disabled={savingPauseId === bp.id}
                          aria-label={isPaused ? `Resume ${bp.title}` : `Pause ${bp.title}`}
                          className={`min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl transition-colors disabled:opacity-50 ${
                            isPaused
                              ? "text-amber-600 bg-amber-50 hover:bg-amber-100"
                              : /* Phase 4.5 — always visible: hover-revealed
                                   controls are invisible to touch users. */
                                "text-rhozly-on-surface/35 can-hover:hover:text-rhozly-primary can-hover:hover:bg-rhozly-primary/5 active:bg-rhozly-primary/10"
                          }`}
                          data-testid={`blueprint-${bp.id}-pause-toggle`}
                        >
                          {isPaused ? <Play size={16} /> : <Pause size={16} />}
                        </button>
                      );
                    })()}
                    {pauseMenuId === bp.id && (
                      <div
                        className="absolute right-0 mt-2 w-52 bg-white rounded-2xl shadow-xl border border-rhozly-outline/10 z-20 overflow-hidden animate-in fade-in zoom-in-95"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <p className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40">Pause for…</p>
                        {[
                          { label: "1 week", days: 7 },
                          { label: "2 weeks", days: 14 },
                          { label: "1 month", days: 30 },
                        ].map(({ label, days }) => (
                          <button
                            key={label}
                            onClick={() => {
                              const until = new Date();
                              until.setDate(until.getDate() + days);
                              setBlueprintPaused(bp.id, until.toISOString());
                            }}
                            className="w-full px-4 py-2.5 text-left text-sm font-bold text-rhozly-on-surface hover:bg-rhozly-surface-low transition-colors"
                            data-testid={`blueprint-${bp.id}-pause-${days}d`}
                          >
                            {label}
                          </button>
                        ))}
                        <button
                          onClick={() => setPauseMenuId(null)}
                          className="w-full px-4 py-2.5 text-left text-xs font-bold text-rhozly-on-surface/40 hover:bg-rhozly-surface-low transition-colors border-t border-rhozly-outline/10"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteClick(bp);
                    }}
                    aria-label={`Delete ${bp.title}`}
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center text-rhozly-on-surface/35 can-hover:hover:text-red-500 can-hover:hover:bg-red-50 active:bg-red-50 rounded-xl transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <div className="flex-1 mb-4">
                {(() => {
                  const pausedMs = bp.paused_until ? new Date(bp.paused_until).getTime() : null;
                  const isPaused = pausedMs !== null && pausedMs > Date.now();
                  if (!isPaused) return null;
                  return (
                    <div className="mb-2 flex items-center gap-1.5 text-[10px] font-black text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-md w-fit uppercase tracking-widest">
                      <Pause size={10} />
                      Paused until {new Date(bp.paused_until).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </div>
                  );
                })()}
                {bp.description && (
                  <p className="text-xs font-bold text-rhozly-on-surface/50 line-clamp-2">
                    {bp.description}
                  </p>
                )}
                {/* Phase 4.5 — next occurrence + a 30-day dot track (the
                    schedule rhythm IS this card's core information; it was a
                    10px text footnote). Occurrence days fill in the type's
                    accent hue; today is ringed; per-dot titles carry dates. */}
                {(() => {
                  if (!bp.frequency_days || bp.frequency_days <= 0) return null;
                  const todayStr = getLocalDateString(new Date());
                  // Track B — for an 'annual' blueprint the stored start/end are
                  // last year's template; roll to the current/next occurrence so
                  // the preview reflects this year's window, not the expired one.
                  let anchorStr = (bp.start_date || bp.created_at || new Date().toISOString()).split("T")[0];
                  let effEndStr: string | null = bp.end_date ?? null;
                  const recursAnnually =
                    bp.recurrence_kind === "annual" || bp.recurrence_kind === "lifecycle_capped";
                  if (recursAnnually && bp.start_date && bp.end_date) {
                    const dayMsLocal = 24 * 60 * 60 * 1000;
                    const horizon = new Date(new Date(todayStr).getTime() + 550 * dayMsLocal)
                      .toISOString().split("T")[0];
                    const win = projectAnnualWindows(
                      bp.start_date, bp.end_date, todayStr, horizon, todayStr, { recursUntil: bp.recurs_until },
                    ).find((w) => w.end >= todayStr);
                    if (!win) return null; // past the lifecycle cap — nothing upcoming
                    anchorStr = win.start;
                    effEndStr = win.end;
                  }
                  const anchorMs = new Date(anchorStr).getTime();
                  const todayMs = new Date(todayStr).getTime();
                  const endMs = effEndStr ? new Date(effEndStr).getTime() : null;
                  const dayMs = 24 * 60 * 60 * 1000;

                  // Find the first occurrence >= today
                  let cursor = anchorMs;
                  if (cursor < todayMs) {
                    const diffDays = Math.floor((todayMs - cursor) / dayMs);
                    const skips = Math.floor(diffDays / bp.frequency_days);
                    cursor = anchorMs + (skips + 1) * bp.frequency_days * dayMs;
                  }

                  // Occurrence day-offsets within the next 30 days. Offsets are
                  // computed from UTC-midnight-aligned instants (exact integers);
                  // labels come from a LOCAL base by offset, so the displayed
                  // dates are correct for negative-UTC-offset (Americas) users.
                  const labelBase = new Date();
                  labelBase.setHours(12, 0, 0, 0);
                  const labelFor = (offset: number) =>
                    new Date(labelBase.getTime() + offset * dayMs).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
                  const occurrenceOffsets = new Set<number>();
                  let firstOffset: number | null = null;
                  for (let c = cursor; (!endMs || c <= endMs) && c < todayMs + 30 * dayMs; c += bp.frequency_days * dayMs) {
                    const offset = Math.round((c - todayMs) / dayMs);
                    occurrenceOffsets.add(offset);
                    if (firstOffset === null) firstOffset = offset;
                  }
                  if (firstOffset === null) return null;
                  const firstUpcoming = labelFor(firstOffset);
                  const { dotClass } = taskTypeStyle(bp.task_type);
                  return (
                    <div className="mt-2 space-y-1.5">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-rhozly-on-surface/45">
                        <span className="uppercase tracking-widest text-rhozly-on-surface/35">Next:</span>
                        <span className="font-black text-rhozly-on-surface/70">{firstUpcoming}</span>
                      </div>
                      <div
                        data-testid={`blueprint-${bp.id}-dot-track`}
                        aria-label={`Occurrences over the next 30 days for ${bp.title}`}
                        className="flex items-center gap-[3px]"
                      >
                        {Array.from({ length: 30 }, (_, i) => {
                          const due = occurrenceOffsets.has(i);
                          const date = labelFor(i);
                          return (
                            <span
                              key={i}
                              title={due ? `${date} — due` : date}
                              className={`rounded-full ${
                                due
                                  ? `w-1.5 h-3 ${dotClass}`
                                  : "w-1 h-1.5 bg-rhozly-outline/25"
                              } ${i === 0 ? "ring-1 ring-rhozly-primary/40 ring-offset-1" : ""}`}
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div className="pt-4 border-t border-rhozly-outline/10 flex flex-wrap gap-2 mt-auto">
                <div
                  className={`text-[10px] font-bold flex items-center gap-1 px-2 py-1 rounded-md ${bp.inventory_item_ids?.length > 0 ? "bg-emerald-50 text-emerald-700" : "bg-rhozly-surface-low text-rhozly-on-surface/60"}`}
                >
                  {bp.inventory_item_ids?.length > 0 ? (
                    <IconGrowth size={12} />
                  ) : (
                    <Grid size={12} />
                  )}
                  {bp.plantContext}
                </div>
                {scorePlantByPreferences(bp.basePlantName || "", "", preferences) > 0 && (
                  <div className="text-[10px] font-bold flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-50 text-emerald-600">
                    <IconAI size={10} /> Preference match
                  </div>
                )}
                {(bp.locations?.name || bp.areas?.name) && (
                  <div className="text-[10px] font-bold flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 text-blue-700">
                    <MapPin size={12} /> {bp.locations?.name || "No Location"}{" "}
                    {bp.areas?.name && `• ${bp.areas?.name}`}
                  </div>
                )}
                {bp.plans && (
                  <div className="text-[10px] font-bold flex items-center gap-1 px-2 py-1 rounded-md bg-purple-50 text-purple-700 w-full sm:w-auto">
                    <FolderKanban size={12} className="shrink-0" />{" "}
                    <span className="truncate">
                      {bp.plans.name ||
                        bp.plans.ai_blueprint?.project_overview?.title ||
                        "Untitled Plan"}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
          </div>
        </>
      )}

      </>}

      {/* MODALS */}
      {confirmState && (
        <ConfirmModal
          isOpen={confirmState.isOpen}
          isLoading={isDeleting}
          onClose={() => setConfirmState(null)}
          onConfirm={executeConfirmAction}
          title={confirmState.title}
          description={confirmState.description}
          confirmText={confirmState.confirmText}
          isDestructive={true}
        />
      )}

      {(isBuilding || editingBlueprint) && (
        <AddTaskModal
          homeId={homeId}
          isBlueprintMode={true}
          existingBlueprint={editingBlueprint}
          aiEnabled={aiEnabled}
          onClose={() => {
            setIsBuilding(false);
            setEditingBlueprint(null);
          }}
          onSuccess={() => {
            const isNew = !editingBlueprint;
            setIsBuilding(false);
            setEditingBlueprint(null);
            toast.success("Routine saved");
            if (isNew) requestFeedback("blueprint_create");
            fetchBlueprints();
          }}
        />
      )}
    </div>
  );
}
