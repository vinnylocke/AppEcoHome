import React, { useState, useEffect } from "react";
import {
  Package,
  Plus,
  MapPin,
  Calendar,
  ArrowRight,
  Loader2,
  X,
  Trash2,
  Search,
  Info,
  RefreshCw,
  Sun,
  Droplets,
  Shovel,
  Wheat,
} from "lucide-react";
import { InventoryItem, Plant, Location, GardenTask } from "../types";
import { supabase } from "../lib/supabase";
import { motion, AnimatePresence } from "motion/react";
import { getPlantDisplayName } from "../utils/plantUtils";
import {
  generatePlantingSchedule,
  generateCareGuide,
  getCommonNames,
} from "../services/gemini";
import {
  searchPlantsDirect,
  searchPlantsByCommonName,
  searchPlantsCombined,
} from "../services/plantService";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface InventoryManagerProps {
  userId: string;
  homeId: string;
  inventory: InventoryItem[];
  plants: Plant[];
  locations: Location[];
  onViewPlantedInstance: (instance: InventoryItem) => void;
  onSelectShedItem: (item: InventoryItem) => void;
}

export const InventoryManager: React.FC<InventoryManagerProps> = ({
  userId,
  homeId,
  inventory,
  plants,
  locations,
  onViewPlantedInstance,
  onSelectShedItem,
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [modalTab, setModalTab] = useState<"search" | "inventory">("inventory");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Partial<Plant>[]>([]);
  const [selectedPlant, setSelectedPlant] = useState<Partial<Plant> | null>(
    null,
  );
  const [identifier, setIdentifier] = useState("");
  const [plantingItem, setPlantingItem] = useState<InventoryItem | null>(null);
  const [locationId, setLocationId] = useState("");
  const [areaId, setAreaId] = useState("");
  const [environment, setEnvironment] = useState<"Indoors" | "Outdoors">(
    "Outdoors",
  );
  const [isEstablished, setIsEstablished] = useState(false);
  const [plantedAt, setPlantedAt] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isNamingPlant, setIsNamingPlant] = useState(false);
  const [namingPlantData, setNamingPlantData] = useState<Partial<Plant> | null>(
    null,
  );
  const [commonNames, setCommonNames] = useState<string[]>([]);
  const [selectedDisplayName, setSelectedDisplayName] = useState<string>("");
  const [customDisplayName, setCustomDisplayName] = useState<string>("");
  const [isUpdatingCare, setIsUpdatingCare] = useState(false);
  const [viewingPlant, setViewingPlant] = useState<Plant | null>(null);
  const [hasSearchedExternal, setHasSearchedExternal] = useState(false);
  const [directResults, setDirectResults] = useState<Partial<Plant>[]>([]);
  const [aiResults, setAiResults] = useState<Partial<Plant>[]>([]);
  const [searchTab, setSearchTab] = useState<"direct" | "ai">("direct");
  const [expandedPlantId, setExpandedPlantId] = useState<string | null>(null);
  const [selectedShedItem, setSelectedShedItem] =
    useState<InventoryItem | null>(null);
  const [commonNamesMap, setCommonNamesMap] = useState<
    Record<string, string[]>
  >({});
  const [plantDetailsMap, setPlantDetailsMap] = useState<
    Record<string, Partial<Plant>>
  >({});
  const [fetchingCommonNames, setFetchingCommonNames] = useState<string | null>(
    null,
  );
  const [fetchingPlantDetails, setFetchingPlantDetails] = useState<
    string | null
  >(null);

  const shedItems = inventory.filter((item) => item.status === "In Shed");

  // Initialize search results with all plants when opening the search tab
  useEffect(() => {
    if (
      isAdding &&
      modalTab === "search" &&
      !searchQuery &&
      !hasSearchedExternal
    ) {
      setSearchResults(plants);
    }
  }, [isAdding, modalTab, plants, searchQuery, hasSearchedExternal]);

  const handleSearch = async (type: "direct" | "common" | "local") => {
    const query = searchQuery.trim();

    if (type === "local") {
      setHasSearchedExternal(false);
      setDirectResults([]);
      setAiResults([]);
      if (!query) {
        setSearchResults(plants);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const results = plants.filter(
          (p) =>
            p.name.toLowerCase().includes(query.toLowerCase()) ||
            p.scientificName?.toLowerCase().includes(query.toLowerCase()),
        );
        setSearchResults(results);
        if (results.length === 0) {
          setError("No matching plants found in your library.");
        }
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!query) {
      setError("Please enter a plant name to search.");
      return;
    }

    setLoading(true);
    setError(null);
    setHasSearchedExternal(true);
    setExpandedPlantId(null);
    if (type === "common") {
      setLoading(true);
      setError(null);
      setHasSearchedExternal(true);
      try {
        // This function automatically tries Plantbook first,
        // then falls back to Gemini if no results are found.
        const results = await searchPlantsCombined(query);

        setSearchResults(results);
        setAiResults(results);
        setSearchTab("ai");

        if (results.length === 0) {
          setError("No results found. Try a different name.");
        }
      } catch (err) {
        console.error("Search Error:", err);
        setError("Failed to search. Please try again.");
      } finally {
        setLoading(false);
      }
      return;
    }
  };

  const handleGenerateWithAI = async () => {
    const query = searchQuery.trim();
    if (!query) return;
    setLoading(true);
    setError(null);
    try {
      const result = await generateCareGuide(query);
      if (result && result.name) {
        setCommonNames([result.name]);
        setNamingPlantData(result);
        setIsNamingPlant(true);
      } else {
        setError("Could not generate information for this plant.");
      }
    } catch (err) {
      console.error("AI Generation Error:", err);
      setError("Failed to generate plant information.");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPlantForNaming = async (plant: Partial<Plant>) => {
    setLoading(true);
    try {
      const names = await getCommonNames(
        plant.scientificName || plant.name || "",
      );
      setCommonNames(names);
      setNamingPlantData(plant);
      setIsNamingPlant(true);
    } catch (err) {
      console.error("Selection Error:", err);
      setError("Failed to fetch common names.");
    } finally {
      setLoading(false);
    }
  };

  const handleExpandPlant = async (
    e: React.MouseEvent,
    plant: Partial<Plant>,
  ) => {
    e.stopPropagation();
    const plantId = plant.id || plant.scientificName || plant.name || "";
    if (expandedPlantId === plantId) {
      setExpandedPlantId(null);
      return;
    }

    setExpandedPlantId(plantId);
    if (!commonNamesMap[plantId] || !plantDetailsMap[plantId]) {
      setFetchingCommonNames(plantId);
      setFetchingPlantDetails(plantId);
      try {
        const [names, details] = await Promise.all([
          getCommonNames(plant.scientificName || plant.name || ""),
          generateCareGuide(plant.name || ""),
        ]);
        setCommonNamesMap((prev) => ({ ...prev, [plantId]: names }));
        setPlantDetailsMap((prev) => ({ ...prev, [plantId]: details }));
      } catch (err) {
        console.error("Failed to fetch plant details:", err);
      } finally {
        setFetchingCommonNames(null);
        setFetchingPlantDetails(null);
      }
    }
  };

  const handleUpdateCareGuide = async () => {
    if (!viewingPlant) return;
    setIsUpdatingCare(true);
    try {
      const newGuide = await generateCareGuide(viewingPlant.name);
      if (newGuide.careGuide) {
        const { error: updateError } = await supabase
          .from("plants")
          .update({
            care_guide: newGuide.careGuide,
            scientific_name:
              newGuide.scientificName || viewingPlant.scientificName,
          })
          .eq("id", viewingPlant.id);

        if (updateError) throw updateError;

        setViewingPlant({
          ...viewingPlant,
          careGuide: newGuide.careGuide,
          scientificName:
            newGuide.scientificName || viewingPlant.scientificName,
        });
      }
    } catch (err) {
      console.error("Error updating care guide:", err);
    } finally {
      setIsUpdatingCare(false);
    }
  };

  const handleDeletePlant = async (e: React.MouseEvent, plantId: string) => {
    e.stopPropagation();
    setLoading(true);
    try {
      // 1. Delete the plant definition
      const { error: deletePlantError } = await supabase
        .from("plants")
        .delete()
        .eq("id", plantId);

      if (deletePlantError) throw deletePlantError;

      // 2. Find and delete all inventory items for this plant type for this home
      const { data: invItems, error: fetchInvError } = await supabase
        .from("inventory_items")
        .select("id")
        .eq("plant_id", plantId)
        .eq("home_id", homeId);

      if (fetchInvError) throw fetchInvError;

      const itemIds = invItems.map((d) => d.id);

      if (itemIds.length > 0) {
        const { error: deleteInvError } = await supabase
          .from("inventory_items")
          .delete()
          .in("id", itemIds);

        if (deleteInvError) throw deleteInvError;

        // 3. Delete all tasks associated with these items
        const { error: deleteTasksError } = await supabase
          .from("tasks")
          .delete()
          .in("inventory_item_id", itemIds);

        if (deleteTasksError) throw deleteTasksError;
      }

      setSearchResults((prev) => prev.filter((p) => p.id !== plantId));
    } catch (err: any) {
      console.error("Delete Error:", err);
      setError(err.message || "Failed to delete plant and its instances.");
    } finally {
      setLoading(false);
    }
  };

  const handleAddItem = async (plant: Plant) => {
    setLoading(true);
    try {
      const { error: insertError } = await supabase
        .from("inventory_items")
        .insert([
          {
            plant_id: plant.id,
            plant_name: plant.name,
            status: "In Shed",
            home_id: homeId,
          },
        ]);

      if (insertError) throw insertError;

      setModalTab("inventory");
      setSearchQuery("");
      setSearchResults([]);
    } catch (error: any) {
      console.error("Error adding item:", error);
      setError(error.message || "Failed to add item to shed.");
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveItem = async (itemId: string) => {
    setLoading(true);
    try {
      // 1. Delete the inventory item
      const { error: deleteItemError } = await supabase
        .from("inventory_items")
        .delete()
        .eq("id", itemId);

      if (deleteItemError) throw deleteItemError;

      // 2. Delete associated tasks
      const { error: deleteTasksError } = await supabase
        .from("tasks")
        .delete()
        .eq("inventory_item_id", itemId);

      if (deleteTasksError) throw deleteTasksError;
    } catch (error: any) {
      console.error("Error removing item:", error);
      setError(error.message || "Failed to remove item.");
    } finally {
      setLoading(false);
    }
  };

  const handlePlantNow = async () => {
    if (loading || !plantingItem || !locationId) return;
    setLoading(true);
    try {
      const selectedLoc = locations.find((l) => l.id === locationId);
      const selectedArea = selectedLoc?.areas?.find((a) => a.id === areaId);

      if (!selectedArea) {
        throw new Error("Please select an area for planting.");
      }

      const derivedEnvironment =
        selectedArea.type === "inside" ? "Indoors" : "Outdoors";

      let plantedAtISO = null;
      if (!isEstablished) {
        if (!plantedAt) {
          throw new Error("Date planted is required.");
        }
        plantedAtISO = new Date(plantedAt).toISOString();
      }

      let maxNum = 0;
      inventory
        .filter((i) => i.plantId === plantingItem.plantId)
        .forEach((item) => {
          if (item.plantCode) {
            const match = item.plantCode.match(/\d+/);
            if (match) {
              const num = parseInt(match[0], 10);
              if (num > maxNum) maxNum = num;
            }
          }
        });

      const newPlantCode = (maxNum + 1).toString().padStart(4, "0");

      // Create a new item instead of updating
      const newPlantedItemData = {
        plant_id: plantingItem.plantId,
        plant_name: plantingItem.plantName,
        plant_code: newPlantCode,
        status: "Planted",
        location_id: locationId,
        location_name: selectedLoc?.name || "Unknown Location",
        area_id: selectedArea.id,
        area_name: selectedArea.name,
        environment: derivedEnvironment,
        is_established: isEstablished,
        home_id: homeId,
        ...(plantedAtISO && { planted_at: plantedAtISO }),
        ...(identifier.trim() && { identifier: identifier.trim() }),
      };

      const { data: newPlantedItem, error: insertError } = await supabase
        .from("inventory_items")
        .insert([newPlantedItemData])
        .select()
        .single();

      if (insertError) throw insertError;

      const displayName = getPlantDisplayName({
        ...plantingItem,
        plantCode: newPlantCode,
        identifier: identifier.trim(),
      });

      const plant = plants.find((p) => p.id === plantingItem.plantId);

      try {
        const schedule = await generatePlantingSchedule(
          displayName,
          isEstablished,
          derivedEnvironment,
          plant?.careGuide,
          new Date().toLocaleDateString(),
        );

        // Deduplicate tasks by type and day
        const seenTasks = new Set<string>();
        const tasksToInsert = [];

        for (const task of schedule) {
          const daysFromNow = Math.floor(task.daysFromNow || 0);
          // Normalize task type to match GardenTask['type']
          let taskType: GardenTask["type"] = "Watering";
          const rawType = (task.type || "Watering").toLowerCase();
          if (rawType.includes("feed")) taskType = "Feeding";
          else if (rawType.includes("prun")) taskType = "Pruning";
          else if (rawType.includes("harvest")) taskType = "Harvesting";
          else taskType = "Watering";

          const taskKey = `${taskType}-${daysFromNow}`;

          if (seenTasks.has(taskKey)) continue;
          seenTasks.add(taskKey);

          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + daysFromNow);
          dueDate.setHours(9, 0, 0, 0); // Set to a consistent time (9 AM)

          tasksToInsert.push({
            title: task.title || `${taskType} ${displayName}`,
            description:
              task.description || `Scheduled ${taskType} for ${displayName}`,
            status: "Pending",
            due_date: dueDate.toISOString(),
            type: taskType,
            plant_id: plantingItem.plantId,
            inventory_item_id: newPlantedItem.id,
            home_id: homeId,
          });
        }

        if (tasksToInsert.length > 0) {
          const { error: tasksError } = await supabase
            .from("tasks")
            .insert(tasksToInsert);

          if (tasksError) throw tasksError;
        }
      } catch (err) {
        console.error("Failed to generate schedule from Gemini:", err);
        // Fallback to a basic initial task if Gemini fails and it's not established
        if (!isEstablished) {
          const dueDate = new Date();
          dueDate.setHours(9, 0, 0, 0);

          await supabase.from("tasks").insert([
            {
              title: `Water ${displayName}`,
              description: `Initial watering for newly planted ${displayName}`,
              status: "Pending",
              due_date: dueDate.toISOString(),
              type: "Watering",
              plant_id: plantingItem.plantId,
              inventory_item_id: newPlantedItem.id,
              home_id: homeId,
            },
          ]);
        }
      }

      setPlantingItem(null);
      setLocationId("");
    } catch (error: any) {
      console.error("Error planting item:", error);
      setError(error.message || "Failed to plant item.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-3xl shadow-sm border border-stone-100">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center">
            <Package size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-stone-900">The Shed</h2>
            <p className="text-xs text-stone-500">
              Inventory of seeds and young plants
            </p>
          </div>
        </div>
        <button
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 font-bold text-sm"
        >
          <Plus size={18} />
          Add to Shed
        </button>
      </div>

      <div className="flex flex-col gap-3">
        {shedItems.length === 0 ? (
          <div className="py-8 text-center bg-stone-50 rounded-2xl border border-stone-100">
            <p className="text-sm text-stone-400">
              Your shed is empty. Add some seeds!
            </p>
          </div>
        ) : (
          shedItems.map((item) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="p-4 bg-stone-50 border border-stone-100 rounded-2xl flex items-center justify-between group"
            >
              <div className="flex flex-col">
                <button
                  onClick={() => onSelectShedItem(item)}
                  className="text-sm font-bold text-stone-900 hover:text-emerald-600 transition-colors text-left"
                >
                  {getPlantDisplayName(item)}
                </button>
                <span className="text-[10px] text-stone-400 uppercase tracking-widest">
                  Added {new Date(item.createdAt).toLocaleDateString()}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleRemoveItem(item.id)}
                  className="p-2 text-stone-400 hover:text-red-600 transition-all"
                  title="Remove from shed"
                >
                  <Trash2 size={16} />
                </button>
                <button
                  onClick={() => setPlantingItem(item)}
                  className="px-4 py-2 bg-white text-emerald-600 text-xs font-bold rounded-xl border border-emerald-100 hover:bg-emerald-600 hover:text-white transition-all flex items-center gap-2 shadow-sm"
                >
                  Plant
                  <ArrowRight size={14} />
                </button>
              </div>
            </motion.div>
          ))
        )}
      </div>

      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white w-full max-w-lg p-8 rounded-3xl shadow-2xl overflow-y-auto max-h-[90vh]"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center">
                    {modalTab === "search" ? (
                      <Search size={24} />
                    ) : (
                      <Package size={24} />
                    )}
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-stone-900">
                      {modalTab === "search" ? "Add to Shed" : "Current Shed"}
                    </h3>
                    <p className="text-xs text-stone-500">
                      {modalTab === "search"
                        ? "Search library or use AI to find plants"
                        : "Manage items currently in your shed"}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setIsAdding(false);
                    setSearchQuery("");
                    setHasSearchedExternal(false);
                  }}
                  className="p-2 hover:bg-stone-100 rounded-full"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex items-center gap-2 mb-6 p-1 bg-stone-100 rounded-2xl">
                <button
                  onClick={() => setModalTab("search")}
                  className={cn(
                    "flex-1 py-2 text-xs font-bold rounded-xl transition-all",
                    modalTab === "search"
                      ? "bg-white text-emerald-600 shadow-sm"
                      : "text-stone-500 hover:text-stone-700",
                  )}
                >
                  Add New
                </button>
                <button
                  onClick={() => setModalTab("inventory")}
                  className={cn(
                    "flex-1 py-2 text-xs font-bold rounded-xl transition-all",
                    modalTab === "inventory"
                      ? "bg-white text-emerald-600 shadow-sm"
                      : "text-stone-500 hover:text-stone-700",
                  )}
                >
                  In Shed ({shedItems.length})
                </button>
              </div>

              {modalTab === "search" ? (
                <div className="flex flex-col gap-4">
                  <div className="relative">
                    <Search
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
                      size={18}
                    />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        if (!e.target.value && !hasSearchedExternal) {
                          setSearchResults(plants);
                        }
                      }}
                      placeholder="Search plants (e.g., Tomato, Lavender)..."
                      className="w-full pl-10 pr-4 py-3 bg-stone-50 border border-stone-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handleSearch("local")}
                      disabled={loading}
                      className="px-4 py-3 bg-stone-100 text-stone-600 rounded-xl font-bold hover:bg-stone-200 disabled:opacity-50 transition-all text-sm flex items-center justify-center gap-2"
                    >
                      <Search size={16} />
                      Search My Library
                    </button>
                    <button
                      onClick={() => handleSearch("common")}
                      disabled={loading || !searchQuery}
                      className="px-4 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2 text-sm"
                    >
                      {loading ? (
                        <Loader2 className="animate-spin" size={18} />
                      ) : (
                        <RefreshCw size={18} />
                      )}
                      AI Search
                    </button>
                  </div>

                  {error && (
                    <div className="p-3 bg-red-50 text-red-600 rounded-xl text-xs">
                      {error}
                    </div>
                  )}

                  {hasSearchedExternal &&
                    (directResults.length > 0 || aiResults.length > 0) && (
                      <div className="flex items-center gap-2 p-1 bg-stone-100 rounded-2xl">
                        <button
                          onClick={() => {
                            setSearchTab("direct");
                            setSearchResults(directResults);
                          }}
                          className={cn(
                            "flex-1 py-2 text-[10px] font-bold rounded-xl transition-all uppercase tracking-wider",
                            searchTab === "direct"
                              ? "bg-white text-emerald-600 shadow-sm"
                              : "text-stone-500 hover:text-stone-700",
                          )}
                        >
                          Direct Search ({directResults.length})
                        </button>
                        <button
                          onClick={() => {
                            setSearchTab("ai");
                            setSearchResults(aiResults);
                          }}
                          className={cn(
                            "flex-1 py-2 text-[10px] font-bold rounded-xl transition-all uppercase tracking-wider",
                            searchTab === "ai"
                              ? "bg-white text-emerald-600 shadow-sm"
                              : "text-stone-500 hover:text-stone-700",
                          )}
                        >
                          AI Scientific ({aiResults.length})
                        </button>
                      </div>
                    )}

                  {searchResults.length > 0 && (
                    <div className="space-y-2 max-h-64 overflow-y-auto p-1">
                      <h4 className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-2">
                        {hasSearchedExternal
                          ? searchTab === "direct"
                            ? "Direct Results"
                            : "AI-Assisted Results"
                          : "Plant Library"}
                      </h4>
                      {searchResults.map((plant, idx) => {
                        const plantId =
                          plant.id || plant.scientificName || plant.name || "";
                        const isExpanded = expandedPlantId === plantId;

                        return (
                          <div
                            key={idx}
                            className="group relative flex flex-col gap-2"
                          >
                            <div className="w-full p-4 text-left bg-stone-50 border border-stone-100 rounded-2xl hover:border-emerald-200 transition-all">
                              <div className="flex items-center justify-between">
                                <div
                                  className="flex-1 cursor-pointer"
                                  onClick={() =>
                                    handleSelectPlantForNaming(plant)
                                  }
                                >
                                  <span className="text-sm font-bold text-stone-900 group-hover:text-emerald-700">
                                    {plant.name}
                                  </span>
                                  {plant.scientificName && (
                                    <p className="text-[10px] text-stone-400 italic">
                                      {plant.scientificName}
                                    </p>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  {plant.id && (
                                    <button
                                      onClick={(e) =>
                                        handleDeletePlant(e, plant.id!)
                                      }
                                      className="p-2 text-stone-300 hover:text-red-600 transition-all"
                                      title="Delete from library"
                                    >
                                      <Trash2 size={16} />
                                    </button>
                                  )}
                                  <button
                                    onClick={(e) => handleExpandPlant(e, plant)}
                                    className={cn(
                                      "p-2 rounded-lg transition-all",
                                      isExpanded
                                        ? "bg-emerald-100 text-emerald-600"
                                        : "text-stone-300 hover:text-emerald-500",
                                    )}
                                  >
                                    <Plus
                                      size={16}
                                      className={cn(
                                        "transition-transform",
                                        isExpanded && "rotate-45",
                                      )}
                                    />
                                  </button>
                                </div>
                              </div>

                              <AnimatePresence>
                                {isExpanded && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden"
                                  >
                                    <div className="pt-4 mt-4 border-t border-stone-100">
                                      <h5 className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">
                                        Common Names
                                      </h5>
                                      {fetchingCommonNames === plantId ? (
                                        <div className="flex items-center gap-2 text-stone-400 text-xs py-2">
                                          <Loader2
                                            size={12}
                                            className="animate-spin"
                                          />
                                          <span>Fetching common names...</span>
                                        </div>
                                      ) : commonNamesMap[plantId] &&
                                        commonNamesMap[plantId].length > 0 ? (
                                        <div className="flex flex-wrap gap-1.5">
                                          {commonNamesMap[plantId].map(
                                            (name) => (
                                              <button
                                                key={name}
                                                onClick={() => {
                                                  setNamingPlantData({
                                                    ...plant,
                                                    name,
                                                  });
                                                  setCommonNames(
                                                    commonNamesMap[plantId],
                                                  );
                                                  setSelectedDisplayName(name);
                                                  setIsNamingPlant(true);
                                                }}
                                                className="px-2 py-1 bg-white border border-stone-100 rounded-lg text-[10px] text-stone-600 hover:border-emerald-300 hover:text-emerald-600 transition-all"
                                              >
                                                {name}
                                              </button>
                                            ),
                                          )}
                                        </div>
                                      ) : (
                                        <p className="text-[10px] text-stone-400 italic">
                                          No common names found.
                                        </p>
                                      )}

                                      {plantDetailsMap[plantId] &&
                                        plantDetailsMap[plantId].careGuide && (
                                          <div className="mt-4 p-3 bg-stone-100/50 rounded-xl border border-stone-100">
                                            <h5 className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">
                                              Care Guide
                                            </h5>
                                            <div className="grid grid-cols-2 gap-2">
                                              <div className="flex items-center gap-2">
                                                <Sun
                                                  size={12}
                                                  className="text-amber-500"
                                                />
                                                <span className="text-[10px] text-stone-600">
                                                  {
                                                    plantDetailsMap[plantId]
                                                      .careGuide!.sun
                                                  }
                                                </span>
                                              </div>
                                              <div className="flex items-center gap-2">
                                                <Droplets
                                                  size={12}
                                                  className="text-blue-500"
                                                />
                                                <span className="text-[10px] text-stone-600">
                                                  {
                                                    plantDetailsMap[plantId]
                                                      .careGuide!.water
                                                  }
                                                </span>
                                              </div>
                                              <div className="flex items-center gap-2">
                                                <Shovel
                                                  size={12}
                                                  className="text-stone-500"
                                                />
                                                <span className="text-[10px] text-stone-600">
                                                  {
                                                    plantDetailsMap[plantId]
                                                      .careGuide!.soil
                                                  }
                                                </span>
                                              </div>
                                              <div className="flex items-center gap-2">
                                                <Calendar
                                                  size={12}
                                                  className="text-emerald-500"
                                                />
                                                <span className="text-[10px] text-stone-600">
                                                  {
                                                    plantDetailsMap[plantId]
                                                      .careGuide!.plantingMonth
                                                  }
                                                </span>
                                              </div>
                                            </div>
                                          </div>
                                        )}

                                      <button
                                        onClick={() =>
                                          handleSelectPlantForNaming(plant)
                                        }
                                        className="w-full mt-4 py-2 bg-emerald-600 text-white rounded-xl text-[10px] font-bold hover:bg-emerald-700 transition-all"
                                      >
                                        Select this Plant
                                      </button>
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          </div>
                        );
                      })}
                      {hasSearchedExternal && (
                        <button
                          onClick={() => {
                            setHasSearchedExternal(false);
                            setSearchQuery("");
                            setSearchResults(plants);
                            setDirectResults([]);
                            setAiResults([]);
                          }}
                          className="w-full py-3 bg-stone-100 text-stone-600 rounded-xl text-xs font-bold hover:bg-stone-200 transition-all"
                        >
                          Back to My Library
                        </button>
                      )}
                    </div>
                  )}

                  {searchQuery && searchResults.length === 0 && !loading && (
                    <button
                      onClick={handleGenerateWithAI}
                      className="w-full py-4 bg-indigo-50 text-indigo-600 rounded-2xl text-sm font-bold hover:bg-indigo-100 transition-all flex items-center justify-center gap-2"
                    >
                      <RefreshCw size={18} />
                      Generate Care Guide with AI
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-3 max-h-[60vh] overflow-y-auto p-1">
                  {shedItems.length === 0 ? (
                    <div className="py-12 text-center bg-stone-50 rounded-2xl border border-stone-100">
                      <Package
                        size={48}
                        className="mx-auto text-stone-200 mb-4"
                      />
                      <p className="text-sm text-stone-400">
                        Your shed is empty.
                      </p>
                      <button
                        onClick={() => setModalTab("search")}
                        className="mt-4 text-emerald-600 font-bold text-sm hover:underline"
                      >
                        Add your first plant
                      </button>
                    </div>
                  ) : (
                    shedItems.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => {
                          setSelectedShedItem(item);
                          setModalTab("search");
                        }}
                        className="p-4 bg-stone-50 border border-stone-100 rounded-2xl flex items-center justify-between group cursor-pointer hover:border-emerald-200 transition-all"
                      >
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-stone-900">
                            {getPlantDisplayName(item)}
                          </span>
                          <span className="text-[10px] text-stone-400 uppercase tracking-widest">
                            Added{" "}
                            {new Date(item.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveItem(item.id);
                          }}
                          className="p-2 text-stone-400 hover:text-red-600 transition-all"
                          title="Remove from shed"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isNamingPlant && namingPlantData && (
          <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white w-full max-w-md p-8 rounded-3xl shadow-2xl"
            >
              <h3 className="text-xl font-bold text-stone-900 mb-4">
                Name your {namingPlantData.name}
              </h3>
              <p className="text-sm text-stone-500 mb-6">
                Select a common name or enter your own to add it to your shed.
              </p>

              <div className="space-y-2 mb-6 max-h-48 overflow-y-auto p-1">
                {commonNames.map((name) => (
                  <button
                    key={name}
                    onClick={() => setSelectedDisplayName(name)}
                    className={`w-full p-3 text-left rounded-xl border transition-all ${selectedDisplayName === name ? "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500" : "border-stone-100 hover:border-emerald-200"}`}
                  >
                    <span className="text-sm font-medium">{name}</span>
                  </button>
                ))}
                <div className="pt-2">
                  <input
                    type="text"
                    value={customDisplayName}
                    onChange={(e) => {
                      setCustomDisplayName(e.target.value);
                      setSelectedDisplayName("");
                    }}
                    placeholder="Or enter custom name..."
                    className="w-full p-3 border border-stone-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    const displayName =
                      selectedDisplayName ||
                      customDisplayName ||
                      namingPlantData.name ||
                      "Plant";
                    const finalName = `${displayName} (${namingPlantData.scientificName || namingPlantData.name})`;

                    setLoading(true);
                    try {
                      // Check if a plant with this exact name already exists in our library
                      const { data: existingPlants, error: fetchError } =
                        await supabase
                          .from("plants")
                          .select("*")
                          .eq("name", finalName);

                      if (fetchError) throw fetchError;

                      let plantToUse: Plant;

                      if (existingPlants && existingPlants.length > 0) {
                        const p = existingPlants[0];
                        plantToUse = {
                          id: p.id,
                          name: p.name,
                          scientificName: p.scientific_name,
                          careGuide: p.care_guide,
                          isGlobal: p.is_global,
                        } as Plant;
                      } else {
                        // Create new plant entry
                        const plantId = Math.random().toString(36).substr(2, 9);
                        const newPlant = {
                          id: plantId,
                          name: finalName,
                          scientific_name: namingPlantData.scientificName,
                          care_guide: namingPlantData.careGuide,
                          is_global: true,
                        };
                        const { error: insertError } = await supabase
                          .from("plants")
                          .insert(newPlant);

                        if (insertError) throw insertError;

                        plantToUse = {
                          id: plantId,
                          name: finalName,
                          scientificName: namingPlantData.scientificName,
                          careGuide: namingPlantData.careGuide,
                          isGlobal: true,
                        } as Plant;
                      }

                      // Now add to shed
                      await handleAddItem(plantToUse);

                      setIsNamingPlant(false);
                      setNamingPlantData(null);
                      setCommonNames([]);
                      setSelectedDisplayName("");
                      setCustomDisplayName("");
                    } catch (err) {
                      console.error("Error adding plant:", err);
                      setError("Failed to add plant to shed.");
                    } finally {
                      setLoading(false);
                    }
                  }}
                  disabled={
                    (!selectedDisplayName && !customDisplayName) || loading
                  }
                  className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <Loader2 className="animate-spin" size={18} />
                  ) : (
                    "Add to Shed"
                  )}
                </button>
                <button
                  onClick={() => setIsNamingPlant(false)}
                  className="px-6 py-3 bg-stone-100 text-stone-600 rounded-xl font-semibold hover:bg-stone-200 transition-all"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {viewingPlant && (
          <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white w-full max-w-lg p-8 rounded-3xl shadow-2xl overflow-y-auto max-h-[90vh]"
            >
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-2xl font-bold text-stone-900">
                    {viewingPlant.name}
                  </h3>
                  {viewingPlant.scientificName && (
                    <p className="text-sm text-stone-400 italic">
                      {viewingPlant.scientificName}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleUpdateCareGuide}
                    disabled={isUpdatingCare}
                    className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-xl text-xs font-bold hover:bg-emerald-100 transition-all disabled:opacity-50"
                  >
                    {isUpdatingCare ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <RefreshCw size={14} />
                    )}
                    Update AI
                  </button>
                  <button
                    onClick={() => setViewingPlant(null)}
                    className="p-2 hover:bg-stone-100 rounded-full"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                <div className="p-4 bg-amber-50 rounded-2xl flex flex-col gap-2">
                  <Sun className="text-amber-500" size={20} />
                  <span className="text-xs font-bold text-amber-900 uppercase tracking-wider">
                    Sun
                  </span>
                  <p className="text-sm text-amber-800">
                    {viewingPlant.careGuide.sun}
                  </p>
                </div>
                <div className="p-4 bg-blue-50 rounded-2xl flex flex-col gap-2">
                  <Droplets className="text-blue-500" size={20} />
                  <span className="text-xs font-bold text-blue-900 uppercase tracking-wider">
                    Water
                  </span>
                  <p className="text-sm text-blue-800">
                    {viewingPlant.careGuide.water}
                  </p>
                </div>
                <div className="p-4 bg-stone-100 rounded-2xl flex flex-col gap-2">
                  <Shovel className="text-stone-500" size={20} />
                  <span className="text-xs font-bold text-stone-900 uppercase tracking-wider">
                    Soil
                  </span>
                  <p className="text-sm text-stone-800">
                    {viewingPlant.careGuide.soil}
                  </p>
                </div>
                <div className="p-4 bg-emerald-50 rounded-2xl flex flex-col gap-2">
                  <Calendar className="text-emerald-500" size={20} />
                  <span className="text-xs font-bold text-emerald-900 uppercase tracking-wider">
                    Planting
                  </span>
                  <p className="text-sm text-emerald-800">
                    {viewingPlant.careGuide.plantingMonth}
                  </p>
                </div>
                {viewingPlant.careGuide.harvestMonth && (
                  <div className="p-4 bg-orange-50 rounded-2xl flex flex-col gap-2 col-span-2 sm:col-span-4">
                    <Wheat className="text-orange-500" size={20} />
                    <span className="text-xs font-bold text-orange-900 uppercase tracking-wider">
                      Harvesting
                    </span>
                    <p className="text-sm text-orange-800">
                      {viewingPlant.careGuide.harvestMonth}
                    </p>
                  </div>
                )}
              </div>

              <button
                onClick={() => setViewingPlant(null)}
                className="w-full py-4 bg-stone-900 text-white rounded-xl font-semibold hover:bg-stone-800 transition-all"
              >
                Close Guide
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {plantingItem && (
          <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white w-full max-w-md p-8 rounded-3xl shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-stone-900">
                  Planting {getPlantDisplayName(plantingItem)}
                </h3>
                <button
                  onClick={() => setPlantingItem(null)}
                  className="p-2 hover:bg-stone-100 rounded-full"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-stone-600 uppercase tracking-wider ml-1">
                    Identifier (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., #1, Front, Left"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    className="w-full p-3 bg-stone-50 border border-stone-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-stone-600 uppercase tracking-wider ml-1">
                    Location Profile
                  </label>
                  <select
                    value={locationId}
                    onChange={(e) => {
                      setLocationId(e.target.value);
                      setAreaId(""); // Reset area when location changes
                    }}
                    className="w-full p-3 bg-stone-50 border border-stone-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
                  >
                    <option value="">Select location...</option>
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name}
                      </option>
                    ))}
                  </select>
                </div>

                {locationId && (
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-stone-600 uppercase tracking-wider ml-1">
                      Area
                    </label>
                    {locations.find((l) => l.id === locationId)?.areas &&
                    locations.find((l) => l.id === locationId)!.areas!.length >
                      0 ? (
                      <select
                        value={areaId}
                        onChange={(e) => setAreaId(e.target.value)}
                        className="w-full p-3 bg-stone-50 border border-stone-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
                      >
                        <option value="">Select area...</option>
                        {locations
                          .find((l) => l.id === locationId)
                          ?.areas?.map((area) => (
                            <option key={area.id} value={area.id}>
                              {area.name} (
                              {area.type === "inside" ? "Indoors" : "Outdoors"})
                            </option>
                          ))}
                      </select>
                    ) : (
                      <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-700 flex items-center gap-2">
                        <Info size={14} />
                        Please add areas to this location in the Location
                        Manager first.
                      </div>
                    )}
                  </div>
                )}

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-stone-600 uppercase tracking-wider ml-1">
                    Date Planted
                  </label>
                  <div className="flex items-center gap-3 mb-2">
                    <label className="flex items-center gap-2 text-sm text-stone-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isEstablished}
                        onChange={(e) => setIsEstablished(e.target.checked)}
                        className="rounded text-emerald-600 focus:ring-emerald-500"
                      />
                      Already Established
                    </label>
                  </div>
                  {!isEstablished && (
                    <input
                      type="date"
                      value={plantedAt}
                      onChange={(e) => setPlantedAt(e.target.value)}
                      className="w-full p-3 bg-stone-50 border border-stone-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
                    />
                  )}
                </div>

                <button
                  onClick={handlePlantNow}
                  disabled={!locationId || !areaId || loading}
                  className="w-full py-4 bg-emerald-600 text-white rounded-xl font-semibold shadow-lg shadow-emerald-200 hover:bg-emerald-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <Loader2 className="animate-spin" size={20} />
                  ) : (
                    "Confirm Planting"
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
