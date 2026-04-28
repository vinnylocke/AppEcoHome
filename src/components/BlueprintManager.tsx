import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabase";
import {
  Repeat,
  Plus,
  Trash2,
  Loader2,
  CheckSquare,
  Sprout,
  Droplets,
  Scissors,
  Shovel,
  Wheat,
  Grid,
  MapPin,
  FolderKanban,
  Search,
  Filter,
  X,
  Sparkles,
} from "lucide-react";
import toast from "react-hot-toast";

import AddTaskModal from "./AddTaskModal";
import { ConfirmModal } from "./ConfirmModal";
import { TASK_CATEGORIES } from "../constants/taskCategories";
import { scorePlantByPreferences } from "../hooks/useUserPreferences";
import { usePlantDoctor } from "../context/PlantDoctorContext";

interface BlueprintManagerProps {
  homeId: string;
}

export default function BlueprintManager({ homeId }: BlueprintManagerProps) {
  const { preferences } = usePlantDoctor();
  const [blueprints, setBlueprints] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);

  // Builder Modal State
  const [isBuilding, setIsBuilding] = useState(false);
  const [editingBlueprint, setEditingBlueprint] = useState<any | null>(null);

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

  const fetchBlueprints = async () => {
    setLoading(true);
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
        .order("created_at", { ascending: false });

      if (bpError) throw bpError;

      const { data: invData } = await supabase
        .from("inventory_items")
        .select("id, plant_name")
        .eq("home_id", homeId);

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
    } catch (err) {
      toast.error("Failed to load automations.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBlueprints();
  }, [homeId]);

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
      title: "Delete Automation",
      description:
        "Are you sure you want to permanently delete this recurring automation? Future tasks will no longer be generated.",
      confirmText: "Delete Automation",
      onConfirm: async () => {
        const { error } = await supabase
          .from("task_blueprints")
          .delete()
          .eq("id", bp.id);
        if (error) throw error;
        setBlueprints((prev) => prev.filter((b) => b.id !== bp.id));
        toast.success("Automation removed.");
      },
    });
  };

  const getTaskIcon = (type: string) => {
    switch (type) {
      case "Watering":
        return <Droplets size={16} className="text-blue-500" />;
      case "Maintenance":
        return <Scissors size={16} className="text-orange-500" />;
      case "Harvesting":
        return <Wheat size={16} className="text-yellow-500" />;
      case "Planting":
        return <Shovel size={16} className="text-amber-700" />;
      default:
        return <CheckSquare size={16} className="text-gray-500" />;
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

  if (loading)
    return (
      <div className="p-10 flex justify-center">
        <Loader2 className="animate-spin text-rhozly-primary" size={32} />
      </div>
    );

  return (
    <div className="w-full h-full flex flex-col p-4 md:p-8 animate-in fade-in duration-700 pb-32">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-6">
        <div>
          <h2 className="text-4xl font-black font-display text-rhozly-on-surface">
            Automations
          </h2>
          <p className="text-sm font-bold text-rhozly-on-surface/40 uppercase tracking-widest mt-1">
            Manage Recurring Rules
          </p>
        </div>
        <button
          onClick={() => setIsBuilding(true)}
          className="flex items-center justify-center gap-2 bg-rhozly-primary text-white px-6 py-3.5 rounded-2xl font-black shadow-lg hover:scale-105 transition-transform active:scale-95"
        >
          <Plus size={18} strokeWidth={3} /> New Rule
        </button>
      </div>

      {/* 🚀 NEW: Search & Filter Top Bar */}
      {blueprints.length > 0 && (
        <div className="flex flex-col gap-3 mb-6 animate-in slide-in-from-top-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search
                className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
                size={20}
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search automations..."
                className="w-full pl-12 pr-4 py-3.5 bg-white border border-rhozly-outline/10 rounded-2xl font-bold shadow-sm outline-none focus:border-rhozly-primary focus:ring-1 focus:ring-rhozly-primary/20 transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X size={16} />
                </button>
              )}
            </div>
            <button
              onClick={() => setIsFilterOpen(!isFilterOpen)}
              className={`px-5 py-3.5 rounded-2xl font-black shadow-sm transition-all flex items-center justify-center gap-2 border ${isFilterOpen || hasActiveFilters ? "bg-rhozly-primary text-white border-rhozly-primary" : "bg-white text-gray-600 border-rhozly-outline/10 hover:bg-gray-50"}`}
            >
              <Filter size={18} />
              <span className="hidden sm:inline">Filters</span>
              {hasActiveFilters && (
                <span className="bg-white text-rhozly-primary w-5 h-5 rounded-full flex items-center justify-center text-[10px] ml-1">
                  !
                </span>
              )}
            </button>
          </div>

          {/* Filter Drawer */}
          {isFilterOpen && (
            <div className="bg-white p-5 rounded-3xl border border-rhozly-outline/10 shadow-sm animate-in fade-in slide-in-from-top-2">
              <div className="flex justify-between items-center mb-4">
                <h4 className="text-sm font-black text-gray-800">
                  Advanced Filters
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
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">
                    Task Type
                  </label>
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    className="w-full p-3 bg-gray-50 rounded-xl font-bold text-sm border border-transparent focus:border-rhozly-primary outline-none"
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
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">
                    Location
                  </label>
                  <select
                    value={filterLocation}
                    onChange={(e) => setFilterLocation(e.target.value)}
                    className="w-full p-3 bg-gray-50 rounded-xl font-bold text-sm border border-transparent focus:border-rhozly-primary outline-none"
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
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">
                    Area
                  </label>
                  <select
                    value={filterArea}
                    onChange={(e) => setFilterArea(e.target.value)}
                    disabled={filterLocation === "none"}
                    className="w-full p-3 bg-gray-50 rounded-xl font-bold text-sm border border-transparent focus:border-rhozly-primary outline-none disabled:opacity-50"
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
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">
                    Plan
                  </label>
                  <select
                    value={filterPlan}
                    onChange={(e) => setFilterPlan(e.target.value)}
                    className="w-full p-3 bg-gray-50 rounded-xl font-bold text-sm border border-transparent focus:border-rhozly-primary outline-none"
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
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">
                    Plant
                  </label>
                  <select
                    value={filterPlant}
                    onChange={(e) => setFilterPlant(e.target.value)}
                    className="w-full p-3 bg-gray-50 rounded-xl font-bold text-sm border border-transparent focus:border-rhozly-primary outline-none"
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
        <div className="bg-rhozly-surface-lowest border-2 border-dashed border-rhozly-outline/10 rounded-[3rem] p-12 text-center flex flex-col items-center justify-center min-h-[400px]">
          <div className="relative mb-6">
            <div className="absolute inset-0 bg-rhozly-primary/5 rounded-full blur-2xl"></div>
            <Repeat size={64} className="text-rhozly-primary/30 relative" strokeWidth={2} />
          </div>
          <p className="font-black text-2xl text-rhozly-on-surface mb-2">
            No Automations Running
          </p>
          <p className="text-sm font-bold text-rhozly-on-surface/60 mb-6 max-w-md">
            Create custom schedules or use the AI Planner to generate them automatically.
          </p>
          <button
            onClick={() => setIsBuilding(true)}
            className="flex items-center justify-center gap-2 bg-rhozly-primary text-white px-8 py-4 rounded-2xl font-black shadow-lg hover:scale-105 transition-transform active:scale-95"
          >
            <Plus size={20} strokeWidth={3} /> Create Your First Rule
          </button>
        </div>
      ) : filteredBlueprints.length === 0 ? (
        <div className="bg-white border border-rhozly-outline/10 rounded-[3rem] p-12 text-center flex flex-col items-center justify-center py-24 shadow-sm animate-in fade-in">
          <Search size={40} className="text-gray-300 mb-4" />
          <p className="font-black text-xl text-gray-700">No matches found</p>
          <p className="text-sm font-bold text-gray-400 mt-2 max-w-sm">
            Try adjusting your filters or search query to find what you're
            looking for.
          </p>
          <button
            onClick={() => {
              setSearchQuery("");
              clearFilters();
            }}
            className="mt-6 px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl font-black transition-colors"
          >
            Clear All Filters
          </button>
        </div>
      ) : (
        <>
          <div className="sr-only" aria-live="polite" aria-atomic="true">
            Showing {filteredBlueprints.length} automation{filteredBlueprints.length !== 1 ? 's' : ''}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
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
                className="bg-white rounded-3xl p-6 border border-rhozly-outline/10 shadow-sm flex flex-col transition-all hover:border-rhozly-primary/30 hover:shadow-md cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rhozly-primary focus-visible:ring-offset-2"
              >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-gray-50 flex items-center justify-center shrink-0">
                    {getTaskIcon(bp.task_type)}
                  </div>
                  <div>
                    <span className="text-[9px] font-black uppercase tracking-widest bg-gray-100 text-gray-500 px-2 py-0.5 rounded-md mb-1 inline-block">
                      Every {bp.frequency_days} Days
                    </span>
                    <h3 className="font-black text-lg leading-tight text-rhozly-on-surface">
                      {bp.title}
                    </h3>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteClick(bp);
                  }}
                  className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors shrink-0 md:opacity-0 group-hover:opacity-100"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              <div className="flex-1 mb-4">
                {bp.description && (
                  <p className="text-xs font-bold text-gray-500 line-clamp-2">
                    {bp.description}
                  </p>
                )}
              </div>

              <div className="pt-4 border-t border-gray-50 flex flex-wrap gap-2 mt-auto">
                <div
                  className={`text-[10px] font-bold flex items-center gap-1 px-2 py-1 rounded-md ${bp.inventory_item_ids?.length > 0 ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"}`}
                >
                  {bp.inventory_item_ids?.length > 0 ? (
                    <Sprout size={12} />
                  ) : (
                    <Grid size={12} />
                  )}
                  {bp.plantContext}
                </div>
                {scorePlantByPreferences(bp.basePlantName || "", "", preferences) > 0 && (
                  <div className="text-[10px] font-bold flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-50 text-emerald-600">
                    <Sparkles size={10} /> Preference match
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

      {/* 🚀 MODALS */}
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
          onClose={() => {
            setIsBuilding(false);
            setEditingBlueprint(null);
          }}
          onSuccess={() => {
            setIsBuilding(false);
            setEditingBlueprint(null);
            fetchBlueprints();
          }}
        />
      )}
    </div>
  );
}
