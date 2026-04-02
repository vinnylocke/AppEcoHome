import React, { useEffect, useState } from "react";
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
} from "lucide-react";
import type { Location, Area } from "../types";
import { ConfirmModal } from "./ConfirmModal";
import { Logger } from "../lib/errorHandler";
import toast from "react-hot-toast"; // ✨ NEW: For simple UI validation messages

interface Props {
  homeId: string;
}

// Helper type for our unified delete modal
type DeleteTarget = {
  type: "location" | "area";
  id: string;
  locationId?: string; // Only needed when deleting an area
};

export const LocationManager: React.FC<Props> = ({ homeId }) => {
  const [locations, setLocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Add Location State
  const [isAddingLoc, setIsAddingLoc] = useState(false);
  const [newLoc, setNewLoc] = useState({ name: "", is_outside: false });

  // Custom Modal Delete State
  const [itemToDelete, setItemToDelete] = useState<DeleteTarget | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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
    // ✨ UPGRADED: Clean toast instead of an ugly alert()
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
      Logger.success("Location created successfully!");
      fetchHierarchy();
    } catch (err: any) {
      Logger.error(
        "Failed to save new location",
        err,
        { attemptedName: newLoc.name },
        "Could not create location. Please try again.",
      );
    }
  };

  // --- INLINE UPDATE LOGIC ---
  const handleUpdateLocationDB = async (loc: any) => {
    if (!loc.name.trim()) return;

    const { error } = await supabase
      .from("locations")
      .update({ name: loc.name.trim() })
      .eq("id", loc.id);

    // ✨ UPGRADED: Silently track failures so users don't get ghost data
    if (error) {
      Logger.error("Failed to rename location", error, { locId: loc.id });
      toast.error("Failed to save new name.");
      fetchHierarchy(); // Revert the UI if DB fails
    }
  };

  const handleUpdateAreaDB = async (area: any) => {
    if (!area.name.trim()) return;

    const { error } = await supabase
      .from("areas")
      .update({ name: area.name.trim() })
      .eq("id", area.id);

    // ✨ UPGRADED: Silently track failures
    if (error) {
      Logger.error("Failed to rename area", error, { areaId: area.id });
      toast.error("Failed to save area name.");
      fetchHierarchy(); // Revert the UI if DB fails
    }
  };

  // --- LOCAL STATE UPDATES ---
  const updateLocationNameLocal = (id: string, newName: string) => {
    setLocations(
      locations.map((loc) => (loc.id === id ? { ...loc, name: newName } : loc)),
    );
  };

  const updateAreaNameLocal = (
    locationId: string,
    areaId: string,
    newName: string,
  ) => {
    setLocations(
      locations.map((loc) => {
        if (loc.id === locationId) {
          return {
            ...loc,
            areas: loc.areas.map((a: any) =>
              a.id === areaId ? { ...a, name: newName } : a,
            ),
          };
        }
        return loc;
      }),
    );
  };

  // --- ACTION BUTTON LOGIC ---
  const toggleEnvironment = async (loc: any) => {
    const newIsOutside = !loc.is_outside;
    setLocations(
      locations.map((l) =>
        l.id === loc.id ? { ...l, is_outside: newIsOutside } : l,
      ),
    );

    const { error } = await supabase
      .from("locations")
      .update({ is_outside: newIsOutside })
      .eq("id", loc.id);

    // ✨ UPGRADED: Catch silent database failures
    if (error) {
      Logger.error("Failed to toggle environment", error, { locId: loc.id });
      toast.error("Could not update environment type.");
      fetchHierarchy(); // Revert UI
    }
  };

  const addArea = async (locationId: string) => {
    const { error } = await supabase
      .from("areas")
      .insert([{ name: "New Area", location_id: locationId }]);

    if (error) {
      Logger.error(
        "Failed to add area",
        error,
        { locationId },
        "Could not create a new area.",
      );
    } else {
      Logger.success("New area added!");
      fetchHierarchy();
    }
  };

  // --- NEW UNIFIED DELETE LOGIC ---
  const confirmDelete = async () => {
    if (!itemToDelete) return;

    setIsDeleting(true);
    try {
      const { type, id, locationId } = itemToDelete;

      if (type === "location") {
        // Optimistic UI update
        setLocations(locations.filter((loc) => loc.id !== id));
        // Database delete
        const { error } = await supabase
          .from("locations")
          .delete()
          .eq("id", id);
        if (error) throw error;
      } else if (type === "area" && locationId) {
        // Optimistic UI update
        setLocations(
          locations.map((loc) => {
            if (loc.id === locationId)
              return {
                ...loc,
                areas: loc.areas.filter((a: any) => a.id !== id),
              };
            return loc;
          }),
        );
        // Database delete
        const { error } = await supabase.from("areas").delete().eq("id", id);
        if (error) throw error;
      }

      // ✨ UPGRADED: Beautiful success toast!
      Logger.success(
        `${type === "location" ? "Location" : "Area"} deleted successfully!`,
      );
    } catch (error: any) {
      // ✨ UPGRADED: Replaced alert() with Logger
      Logger.error(
        `Failed to delete ${itemToDelete.type}`,
        error,
        { targetId: itemToDelete.id },
        `Could not delete: ${error.message}`,
      );
      // If it failed, refresh from the server to undo the optimistic UI update
      fetchHierarchy();
    } finally {
      setIsDeleting(false);
      setItemToDelete(null); // Close the modal
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
    <div className="max-w-7xl mx-auto w-full space-y-8 animate-in fade-in duration-500 relative">
      {/* HEADER SECTION */}
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

      {/* ADD LOCATION FORM */}
      {isAddingLoc && (
        <div className="bg-rhozly-primary-container/20 p-8 rounded-3xl border border-rhozly-primary/20 animate-in zoom-in-95 duration-200">
          <h4 className="text-sm font-black text-rhozly-primary uppercase tracking-widest mb-4">
            Create New Location
          </h4>

          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <input
              autoFocus
              placeholder="Location Name (e.g., Lounge, Back Garden)"
              className="flex-1 px-6 py-4 rounded-2xl border-none focus:ring-2 focus:ring-rhozly-primary outline-none font-medium shadow-sm"
              value={newLoc.name}
              onChange={(e) => setNewLoc({ ...newLoc, name: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && handleSaveNewLocation()}
            />

            <button
              onClick={() =>
                setNewLoc({ ...newLoc, is_outside: !newLoc.is_outside })
              }
              className={`px-6 py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-colors shadow-sm whitespace-nowrap ${!newLoc.is_outside ? "bg-blue-50 text-blue-600 hover:bg-blue-100" : "bg-orange-50 text-orange-600 hover:bg-orange-100"}`}
            >
              {!newLoc.is_outside ? (
                <Home className="w-5 h-5" />
              ) : (
                <Sun className="w-5 h-5" />
              )}
              {!newLoc.is_outside
                ? "Inside Environment"
                : "Outside Environment"}
            </button>
          </div>

          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setIsAddingLoc(false)}
              className="px-6 py-3 text-rhozly-on-surface/50 font-bold text-sm hover:bg-black/5 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveNewLocation}
              className="px-8 py-3 bg-rhozly-primary text-white rounded-xl font-bold text-sm hover:bg-rhozly-primary/90 transition-all shadow-sm"
            >
              Save Location
            </button>
          </div>
        </div>
      )}

      {/* LOCATIONS GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {locations.length === 0 && !isAddingLoc ? (
          <div className="col-span-full text-center p-12 bg-rhozly-surface-lowest rounded-3xl border border-rhozly-outline/20">
            <p className="text-rhozly-on-surface/50 font-bold">
              No locations found. Add one to get started.
            </p>
          </div>
        ) : (
          locations.map((loc) => (
            <div
              key={loc.id}
              className="bg-rhozly-surface-lowest rounded-3xl p-6 shadow-sm border border-rhozly-outline/20 transition-all hover:shadow-md"
            >
              {/* Location Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div className="flex-1">
                  <input
                    value={loc.name}
                    onChange={(e) =>
                      updateLocationNameLocal(loc.id, e.target.value)
                    }
                    onBlur={() => handleUpdateLocationDB(loc)}
                    onKeyDown={(e) =>
                      e.key === "Enter" && handleUpdateLocationDB(loc)
                    }
                    className="text-2xl font-black font-display text-rhozly-on-surface bg-transparent border-b-2 border-transparent hover:border-rhozly-outline/30 focus:border-rhozly-primary focus:outline-none w-full transition-colors pb-1"
                    placeholder="Location Name"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => toggleEnvironment(loc)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors ${!loc.is_outside ? "bg-blue-50 text-blue-600 hover:bg-blue-100" : "bg-orange-50 text-orange-600 hover:bg-orange-100"}`}
                  >
                    {!loc.is_outside ? (
                      <Home className="w-4 h-4" />
                    ) : (
                      <Sun className="w-4 h-4" />
                    )}
                    {!loc.is_outside ? "Inside" : "Outside"}
                  </button>
                  <button
                    onClick={() =>
                      setItemToDelete({ type: "location", id: loc.id })
                    }
                    className="p-2 text-rhozly-on-surface/40 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                    title="Delete Location"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Areas List */}
              <div className="bg-rhozly-surface-low rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-xs font-black text-rhozly-on-surface/50 uppercase tracking-widest">
                    Areas ({loc.areas.length})
                  </h4>
                  <button
                    onClick={() => addArea(loc.id)}
                    className="text-xs font-bold text-rhozly-primary bg-rhozly-primary/10 hover:bg-rhozly-primary/20 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Area
                  </button>
                </div>

                <div className="space-y-2">
                  {loc.areas.length === 0 ? (
                    <p className="text-sm font-bold text-rhozly-on-surface/40 text-center py-4">
                      No areas defined yet.
                    </p>
                  ) : (
                    loc.areas.map((area: any) => (
                      <div
                        key={area.id}
                        className="flex items-center gap-3 bg-white p-2 pl-4 rounded-xl border border-rhozly-outline/10 group"
                      >
                        <MapPin className="w-4 h-4 text-rhozly-primary/40" />
                        <input
                          value={area.name}
                          onChange={(e) =>
                            updateAreaNameLocal(loc.id, area.id, e.target.value)
                          }
                          onBlur={() => handleUpdateAreaDB(area)}
                          onKeyDown={(e) =>
                            e.key === "Enter" && handleUpdateAreaDB(area)
                          }
                          className="flex-1 text-sm font-bold text-rhozly-on-surface bg-transparent focus:outline-none"
                          placeholder="Area Name"
                        />
                        <button
                          onClick={() =>
                            setItemToDelete({
                              type: "area",
                              id: area.id,
                              locationId: loc.id,
                            })
                          }
                          className="p-2 text-rhozly-on-surface/30 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* CONFIRM MODAL */}
      <ConfirmModal
        isOpen={itemToDelete !== null}
        isLoading={isDeleting}
        onClose={() => setItemToDelete(null)}
        onConfirm={confirmDelete}
        title={`Delete ${itemToDelete?.type}?`}
        description={
          itemToDelete?.type === "location"
            ? "Are you sure you want to delete this location? This action cannot be undone. All areas inside this location will also be permanently removed."
            : "Are you sure you want to delete this area? This action cannot be undone."
        }
        confirmText="Delete"
        isDestructive={true}
      />
    </div>
  );
};
