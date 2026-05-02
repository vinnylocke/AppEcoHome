import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom"; // 🚀 IMPORT THE PORTAL
import { supabase } from "../lib/supabase";
import {
  Home,
  Sun,
  Trash2,
  Plus,
  MapPin,
  Check,
  X,
  Loader2,
  Settings2,
  FlaskConical,
  Zap,
  Layers,
  Droplets,
  Beaker,
} from "lucide-react";
import type { Location, Area } from "../types";
import { ConfirmModal } from "./ConfirmModal";
import { Logger } from "../lib/errorHandler";
import toast from "react-hot-toast";

// 🧠 IMPORT THE AI CONTEXT
import { usePlantDoctor } from "../context/PlantDoctorContext";

interface Props {
  homeId: string;
}

type DeleteTarget = {
  type: "location" | "area";
  id: string;
  locationId?: string;
};

export const LocationManager: React.FC<Props> = ({ homeId }) => {
  // 🧠 GRAB THE SETTER FROM CONTEXT
  const { setPageContext } = usePlantDoctor();

  const [locations, setLocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Add Location State
  const [isAddingLoc, setIsAddingLoc] = useState(false);
  const [newLoc, setNewLoc] = useState({ name: "", is_outside: false });

  // Advanced Area Settings State
  const [editingArea, setEditingArea] = useState<any | null>(null);

  // Custom Modal Delete State
  const [itemToDelete, setItemToDelete] = useState<DeleteTarget | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // 🧠 LIVE AI SYNC: Let the AI know the full layout of the home
  useEffect(() => {
    setPageContext({
      action: editingArea
        ? `Editing metrics for area: ${editingArea.name}`
        : "Managing Garden Layout",
      gardenLayout: locations.map((loc) => ({
        locationName: loc.name,
        isOutside: loc.is_outside,
        areas: loc.areas?.map((a: any) => ({
          name: a.name,
          medium: a.growing_medium,
          ph: a.medium_ph,
          lightLux: a.light_intensity_lux,
        })),
      })),
      currentlyTuningArea: editingArea
        ? {
            name: editingArea.name,
            ph: editingArea.medium_ph,
            lux: editingArea.light_intensity_lux,
            medium: editingArea.growing_medium,
          }
        : null,
    });

    // Cleanup when leaving the management screen
    return () => setPageContext(null);
  }, [locations, editingArea, setPageContext]);

  const fetchHierarchy = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("locations")
      .select("*, areas(*)")
      .eq("home_id", homeId)
      .order("created_at", { ascending: true });

    if (!error && data) {
      const sortedData = data.map((loc) => ({
        ...loc,
        areas: loc.areas.sort((a: any, b: any) => a.id - b.id),
      }));
      setLocations(sortedData);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchHierarchy();
  }, [homeId]);

  // --- ADD NEW LOCATION LOGIC ---
  const handleSaveNewLocation = async () => {
    if (!newLoc.name.trim()) {
      return toast.error("Location name is required.");
    }

    try {
      const { error } = await supabase.from("locations").insert([
        {
          name: newLoc.name.trim(),
          is_outside: newLoc.is_outside,
          home_id: homeId,
        },
      ]);

      if (error) throw error;

      setNewLoc({ name: "", is_outside: false });
      setIsAddingLoc(false);
      toast.success("Location created!");
      fetchHierarchy();
    } catch (err: any) {
      Logger.error("Failed to save new location", err);
      toast.error("Failed to create location.");
    }
  };

  // --- UPDATE LOGIC ---
  const handleUpdateLocationDB = async (loc: any) => {
    if (!loc.name.trim()) return;
    const { error } = await supabase
      .from("locations")
      .update({ name: loc.name.trim() })
      .eq("id", loc.id);

    if (error) {
      Logger.error("Failed to rename location", error);
      toast.error("Failed to rename location.");
      fetchHierarchy();
    } else {
      toast.success("Location renamed.");
    }
  };

  const handleUpdateAreaDB = async (area: any) => {
    if (!area.name.trim()) return;

    const { error } = await supabase
      .from("areas")
      .update({
        name: area.name.trim(),
        growing_medium: area.growing_medium,
        medium_texture: area.medium_texture,
        medium_ph: area.medium_ph,
        light_intensity_lux: area.light_intensity_lux,
        water_movement: area.water_movement,
        nutrient_source: area.nutrient_source,
      })
      .eq("id", area.id);

    if (error) {
      Logger.error("Failed to update area", error);
      toast.error("Failed to save area updates.");
      fetchHierarchy();
    } else {
      setLocations((prevLocations) =>
        prevLocations.map((loc) => ({
          ...loc,
          areas: loc.areas.map((a: any) =>
            a.id === area.id ? { ...area } : a,
          ),
        })),
      );

      toast.success("Area metrics updated!");
    }
  };

  // --- ACTION BUTTON LOGIC ---
  const toggleEnvironment = async (loc: any) => {
    const newIsOutside = !loc.is_outside;
    const { error } = await supabase
      .from("locations")
      .update({ is_outside: newIsOutside })
      .eq("id", loc.id);

    if (error) {
      Logger.error("Failed to toggle environment", error);
      toast.error("Failed to update environment.");
      fetchHierarchy();
    } else {
      setLocations(
        locations.map((l) =>
          l.id === loc.id ? { ...l, is_outside: newIsOutside } : l,
        ),
      );
      toast.success(
        newIsOutside ? "Switched to Outside." : "Switched to Inside.",
      );
    }
  };

  const addArea = async (locationId: string) => {
    const { error } = await supabase
      .from("areas")
      .insert([{ name: "New Area", location_id: locationId }]);

    if (error) {
      Logger.error("Failed to add area", error);
      toast.error("Failed to add area.");
    } else {
      toast.success("New area added!");
      fetchHierarchy();
    }
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    setIsDeleting(true);
    try {
      const { type, id } = itemToDelete;
      const { error } = await supabase
        .from(type === "location" ? "locations" : "areas")
        .delete()
        .eq("id", id);
      if (error) throw error;
      toast.success(`${type.charAt(0).toUpperCase() + type.slice(1)} deleted.`);
      fetchHierarchy();
    } catch (error: any) {
      Logger.error(`Failed to delete ${itemToDelete.type}`, error);
      toast.error(`Failed to delete ${itemToDelete.type}.`);
    } finally {
      setIsDeleting(false);
      setItemToDelete(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="animate-spin text-rhozly-primary w-8 h-8" />
      </div>
    );
  }

  return (
    <>
      <div className="max-w-7xl mx-auto w-full space-y-8 animate-in fade-in duration-500 relative">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-black font-display text-rhozly-on-surface tracking-tight">
              Location Management
            </h2>
            <p className="text-sm font-bold text-rhozly-on-surface/50 mt-1">
              Organize your spaces and growing areas.
            </p>
          </div>
          {!isAddingLoc && (
            <button
              onClick={() => setIsAddingLoc(true)}
              className="flex items-center gap-2 px-6 py-3 bg-rhozly-primary text-white rounded-2xl text-sm font-bold hover:bg-rhozly-primary/90 transition-all shadow-md"
            >
              <Plus size={18} /> New Location
            </button>
          )}
        </div>

        {isAddingLoc && (
          <div className="bg-rhozly-primary-container/20 p-8 rounded-3xl border border-rhozly-primary/20 animate-in zoom-in-95 duration-200">
            <h4 className="text-sm font-black text-rhozly-primary uppercase tracking-widest mb-4">
              Create New Location
            </h4>
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              <input
                autoFocus
                placeholder="Location Name (e.g., Lounge, Back Garden)"
                className="flex-1 px-6 py-4 rounded-2xl border-none outline-none font-medium shadow-sm"
                value={newLoc.name}
                onChange={(e) => setNewLoc({ ...newLoc, name: e.target.value })}
              />
              <button
                onClick={() =>
                  setNewLoc({ ...newLoc, is_outside: !newLoc.is_outside })
                }
                className={`px-6 py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-colors shadow-sm ${!newLoc.is_outside ? "bg-rhozly-primary-container/30 text-rhozly-primary" : "bg-rhozly-secondary-container/40 text-rhozly-secondary"}`}
              >
                {!newLoc.is_outside ? <Home size={20} /> : <Sun size={20} />}
                {!newLoc.is_outside ? "Inside" : "Outside"}
              </button>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setIsAddingLoc(false)}
                className="px-6 py-3 text-rhozly-on-surface/50 font-bold text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveNewLocation}
                className="px-8 py-3 bg-rhozly-primary text-white rounded-2xl font-bold text-sm shadow-sm"
              >
                Save Location
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {locations.map((loc) => (
            <div
              key={loc.id}
              className="bg-rhozly-surface-lowest rounded-3xl p-6 shadow-sm border border-rhozly-outline/20"
            >
              <div className="flex items-center justify-between gap-4 mb-6">
                <input
                  value={loc.name}
                  onChange={(e) =>
                    setLocations(
                      locations.map((l) =>
                        l.id === loc.id ? { ...l, name: e.target.value } : l,
                      ),
                    )
                  }
                  onBlur={() => handleUpdateLocationDB(loc)}
                  className="text-2xl font-black font-display text-rhozly-on-surface bg-transparent border-b-2 border-transparent hover:border-rhozly-outline/30 focus:border-rhozly-primary focus:outline-none w-full transition-colors pb-1"
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleEnvironment(loc)}
                    className={`min-w-[44px] min-h-[44px] px-4 py-2 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 ${!loc.is_outside ? "bg-rhozly-primary-container/30 text-rhozly-primary" : "bg-rhozly-secondary-container/40 text-rhozly-secondary"}`}
                  >
                    {!loc.is_outside ? <Home size={16} /> : <Sun size={16} />}
                  </button>
                  <button
                    onClick={() =>
                      setItemToDelete({ type: "location", id: loc.id })
                    }
                    aria-label={`Delete location: ${loc.name}`}
                    className="min-w-[44px] min-h-[44px] p-2 text-rhozly-on-surface/40 hover:text-rhozly-error rounded-2xl flex items-center justify-center"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>

              <div className="bg-rhozly-surface-low rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-xs font-black text-rhozly-on-surface/50 uppercase tracking-widest">
                    Areas ({loc.areas.length})
                  </h4>
                  <button
                    onClick={() => addArea(loc.id)}
                    className="text-xs font-bold text-rhozly-primary bg-rhozly-primary/10 px-3 py-1.5 rounded-lg flex items-center gap-1.5"
                  >
                    <Plus size={14} /> Add Area
                  </button>
                </div>

                <div className="space-y-2">
                  {loc.areas.map((area: any) => (
                    <div
                      key={area.id}
                      className="flex items-center gap-3 bg-white p-2 pl-4 rounded-xl border border-rhozly-outline/10"
                    >
                      <MapPin className="w-4 h-4 text-rhozly-primary/40" />
                      <input
                        value={area.name}
                        onChange={(e) =>
                          setLocations(
                            locations.map((l) =>
                              l.id === loc.id
                                ? {
                                    ...l,
                                    areas: l.areas.map((a: any) =>
                                      a.id === area.id
                                        ? { ...a, name: e.target.value }
                                        : a,
                                    ),
                                  }
                                : l,
                            ),
                          )
                        }
                        onBlur={() => handleUpdateAreaDB(area)}
                        className="flex-1 text-sm font-bold text-rhozly-on-surface bg-transparent focus:outline-none"
                      />
                      <div className="flex gap-1 transition-opacity">
                        <button
                          onClick={() => setEditingArea(area)}
                          className="min-w-[44px] min-h-[44px] p-2 text-rhozly-primary hover:bg-rhozly-primary/5 rounded-xl flex items-center justify-center"
                          title="Advanced Metrics"
                        >
                          <Settings2 size={16} />
                        </button>
                        <button
                          onClick={() =>
                            setItemToDelete({
                              type: "area",
                              id: area.id,
                              locationId: loc.id,
                            })
                          }
                          className="min-w-[44px] min-h-[44px] p-2 text-rhozly-on-surface/30 hover:text-rhozly-error rounded-xl flex items-center justify-center"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 🚀 THE PORTAL LAYER */}
      {typeof document !== "undefined" &&
        createPortal(
          <>
            {/* ADVANCED AREA SETTINGS MODAL */}
            {editingArea && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-rhozly-bg/90 backdrop-blur-xl animate-in fade-in duration-300">
                <div className="bg-rhozly-surface-lowest w-full max-w-2xl rounded-3xl p-8 shadow-2xl border border-rhozly-outline/20 max-h-[90vh] overflow-y-auto custom-scrollbar">
                  <div className="flex justify-between items-center mb-8">
                    <div>
                      <h3 className="text-2xl font-black text-rhozly-on-surface">
                        Area Metrics
                      </h3>
                      <p className="text-xs font-bold text-rhozly-on-surface/40 uppercase tracking-widest mt-1">
                        Environment: {editingArea.name}
                      </p>
                    </div>
                    <button
                      onClick={() => setEditingArea(null)}
                      className="p-3 bg-rhozly-surface-low rounded-2xl hover:scale-110 transition-transform"
                    >
                      <X size={24} />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* 1. Growing Medium */}
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-[10px] font-black uppercase text-rhozly-on-surface/40 ml-1">
                        <Layers size={14} /> Growing Medium
                      </label>
                      <select
                        value={editingArea.growing_medium || ""}
                        onChange={(e) =>
                          setEditingArea({
                            ...editingArea,
                            growing_medium: e.target.value,
                          })
                        }
                        className="w-full p-4 bg-rhozly-surface-low rounded-2xl font-bold border border-rhozly-outline/10"
                      >
                        <option value="">Select Medium...</option>
                        <option value="Mineral Soil">
                          Mineral Soil (Natural earth)
                        </option>
                        <option value="Soilless Mix">
                          Soilless Mix (Peat/Coco)
                        </option>
                        <option value="Aggregates">
                          Aggregates (Gravel/Clay)
                        </option>
                        <option value="Liquid">Liquid (Hydroponics)</option>
                        <option value="Air/Mist">Air/Mist (Aeroponics)</option>
                      </select>
                    </div>

                    {/* 2. Texture */}
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-[10px] font-black uppercase text-rhozly-on-surface/40 ml-1">
                        <Zap size={14} /> Medium Texture
                      </label>
                      <select
                        value={editingArea.medium_texture || ""}
                        onChange={(e) =>
                          setEditingArea({
                            ...editingArea,
                            medium_texture: e.target.value,
                          })
                        }
                        className="w-full p-4 bg-rhozly-surface-low rounded-2xl font-bold border border-rhozly-outline/10"
                      >
                        <option value="">Select Texture...</option>
                        <option value="Fine">Fine (Silt/Clay)</option>
                        <option value="Medium">Medium (Loam/Mix)</option>
                        <option value="Coarse">Coarse (Gravel/Perlite)</option>
                        <option value="Open">Open (Water/Large Stones)</option>
                      </select>
                    </div>

                    {/* 3. pH Level */}
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-[10px] font-black uppercase text-rhozly-on-surface/40 ml-1">
                        <FlaskConical size={14} /> Medium pH (0.0 - 14.0)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={editingArea.medium_ph || ""}
                        onChange={(e) =>
                          setEditingArea({
                            ...editingArea,
                            medium_ph: e.target.value,
                          })
                        }
                        placeholder="e.g. 6.5"
                        className="w-full p-4 bg-rhozly-surface-low rounded-2xl font-bold border border-rhozly-outline/10"
                      />
                    </div>

                    {/* 4. Lux */}
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-[10px] font-black uppercase text-rhozly-on-surface/40 ml-1">
                        <Sun size={14} /> Peak Light (Lux)
                      </label>
                      <input
                        type="number"
                        value={editingArea.light_intensity_lux || ""}
                        onChange={(e) =>
                          setEditingArea({
                            ...editingArea,
                            light_intensity_lux: e.target.value,
                          })
                        }
                        placeholder="e.g. 5000"
                        className="w-full p-4 bg-rhozly-surface-low rounded-2xl font-bold border border-rhozly-outline/10"
                      />
                    </div>

                    {/* 5. Water Movement */}
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-[10px] font-black uppercase text-rhozly-on-surface/40 ml-1">
                        <Droplets size={14} /> Water Movement
                      </label>
                      <select
                        value={editingArea.water_movement || ""}
                        onChange={(e) =>
                          setEditingArea({
                            ...editingArea,
                            water_movement: e.target.value,
                          })
                        }
                        className="w-full p-4 bg-rhozly-surface-low rounded-2xl font-bold border border-rhozly-outline/10"
                      >
                        <option value="">Select Flow...</option>
                        <option value="Well-Drained">Well-Drained</option>
                        <option value="Low-Drained">Low-Drained (Pools)</option>
                        <option value="Recirculating">
                          Recirculating (Pump)
                        </option>
                        <option value="Static">Static / Deep Water</option>
                      </select>
                    </div>

                    {/* 6. Nutrient Source */}
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-[10px] font-black uppercase text-rhozly-on-surface/40 ml-1">
                        <Beaker size={14} /> Nutrient Source
                      </label>
                      <select
                        value={editingArea.nutrient_source || ""}
                        onChange={(e) =>
                          setEditingArea({
                            ...editingArea,
                            nutrient_source: e.target.value,
                          })
                        }
                        className="w-full p-4 bg-rhozly-surface-low rounded-2xl font-bold border border-rhozly-outline/10"
                      >
                        <option value="">Select Source...</option>
                        <option value="Organic Breakdown">
                          Organic (Compost)
                        </option>
                        <option value="Synthetic">Synthetic / Salts</option>
                        <option value="Biowaste">Biowaste (Fish/Aqua)</option>
                      </select>
                    </div>
                  </div>

                  <div className="mt-10 flex gap-4">
                    <button
                      onClick={() => setEditingArea(null)}
                      className="flex-1 py-4 rounded-2xl font-black text-rhozly-on-surface/40 hover:bg-rhozly-surface-low transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        handleUpdateAreaDB(editingArea);
                        setEditingArea(null);
                      }}
                      className="flex-[2] py-4 bg-rhozly-primary text-white rounded-2xl font-black shadow-lg flex items-center justify-center gap-2"
                    >
                      <Check size={20} /> Save Area Metrics
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>,
          document.body,
        )}

      {/* ConfirmModal internally portals itself, so it's perfectly safe here */}
      <ConfirmModal
        isOpen={itemToDelete !== null}
        isLoading={isDeleting}
        onClose={() => setItemToDelete(null)}
        onConfirm={confirmDelete}
        title={`Delete ${itemToDelete?.type}?`}
        description={
          itemToDelete?.type === "location"
            ? "Permanently remove this location and all its areas?"
            : "Permanently remove this area?"
        }
        confirmText="Delete"
        isDestructive={true}
      />
    </>
  );
};
