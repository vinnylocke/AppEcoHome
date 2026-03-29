import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  MapPin,
  Plus,
  Home,
  TreePine,
  Trash2,
  Edit3,
  Check,
  X,
} from "lucide-react";
import type { Location, Area } from "../types";

// UK Postcode Regex: Supports various formats with or without space
const POSTCODE_REGEX = /^([A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2})$/i;

interface Props {
  homeId: string;
}

export const LocationManager: React.FC<Props> = ({ homeId }) => {
  const [locations, setLocations] = useState<(Location & { areas: Area[] })[]>(
    [],
  );
  const [loading, setLoading] = useState(true);

  // State for adding/editing
  const [isAddingLoc, setIsAddingLoc] = useState(false);
  const [newLoc, setNewLoc] = useState({ name: "", address: "" });

  // New: State for adding an area (prevents immediate DB insert)
  const [addingAreaToLoc, setAddingAreaToLoc] = useState<string | null>(null);
  const [newAreaName, setNewAreaName] = useState("");

  const [editLocData, setEditLocData] = useState<{
    id: string;
    name: string;
    address: string;
  } | null>(null);
  const [editAreaData, setEditAreaData] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const fetchHierarchy = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("locations")
      .select("*, areas(*)")
      .eq("home_id", homeId)
      .order("created_at", { ascending: true });

    if (!error && data) setLocations(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchHierarchy();
  }, [homeId]);

  // --- VALIDATION HELPERS ---
  const validateLocation = (name: string, postcode: string) => {
    if (!name.trim()) {
      alert("Location name is required.");
      return false;
    }
    if (!POSTCODE_REGEX.test(postcode.trim())) {
      alert("Please enter a valid UK postcode (e.g., CR3 5ED).");
      return false;
    }
    return true;
  };

  // --- ACTIONS ---
  const handleSaveLocation = async () => {
    if (!validateLocation(newLoc.name, newLoc.address)) return;

    const { error } = await supabase.from("locations").insert([
      {
        name: newLoc.name.trim(),
        address: newLoc.address.trim().toUpperCase(),
        home_id: homeId,
      },
    ]);

    if (!error) {
      setNewLoc({ name: "", address: "" });
      setIsAddingLoc(false);
      fetchHierarchy();
    }
  };

  const handleUpdateLocation = async () => {
    if (
      !editLocData ||
      !validateLocation(editLocData.name, editLocData.address)
    )
      return;

    const { error } = await supabase
      .from("locations")
      .update({
        name: editLocData.name.trim(),
        address: editLocData.address.trim().toUpperCase(),
      })
      .eq("id", editLocData.id);

    if (!error) {
      setEditLocData(null);
      fetchHierarchy();
    }
  };

  const handleCreateArea = async (locationId: string) => {
    if (!newAreaName.trim()) {
      alert("Area name is required.");
      return;
    }

    const { error } = await supabase.from("areas").insert([
      {
        name: newAreaName.trim(),
        location_id: locationId,
        is_outside: false,
      },
    ]);

    if (!error) {
      setNewAreaName("");
      setAddingAreaToLoc(null);
      fetchHierarchy();
    }
  };

  const handleUpdateArea = async (
    id: string,
    name: string,
    is_outside: boolean,
  ) => {
    if (!name.trim()) {
      alert("Area name cannot be empty.");
      return;
    }
    const { error } = await supabase
      .from("areas")
      .update({ name: name.trim(), is_outside })
      .eq("id", id);
    if (!error) {
      setEditAreaData(null);
      fetchHierarchy();
    }
  };

  const handleDelete = async (table: "locations" | "areas", id: string) => {
    if (
      !window.confirm(
        `Are you sure you want to delete this ${table === "locations" ? "location" : "area"}?`,
      )
    )
      return;
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (!error) fetchHierarchy();
  };

  return (
    <div className="space-y-8 pb-24">
      {/* HEADER SECTION */}
      <div className="flex justify-between items-center px-2">
        <div>
          <h2 className="text-2xl font-black text-stone-900 tracking-tight">
            Home Management
          </h2>
          <p className="text-stone-500 text-sm">
            Define your locations and growing areas.
          </p>
        </div>
        {!isAddingLoc && (
          <button
            onClick={() => setIsAddingLoc(true)}
            className="flex items-center gap-2 px-6 py-3 bg-stone-900 text-white rounded-2xl text-sm font-bold hover:bg-stone-800 transition-all shadow-lg"
          >
            <Plus size={18} /> New Location
          </button>
        )}
      </div>

      {/* ADD LOCATION FORM */}
      {isAddingLoc && (
        <div className="bg-emerald-50 p-8 rounded-[40px] border border-emerald-100 animate-in zoom-in-95 duration-200">
          <h4 className="text-sm font-black text-emerald-700 uppercase tracking-widest mb-4">
            Create New Location
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <input
              placeholder="Location Name (Required)"
              className="px-6 py-4 rounded-2xl border-none focus:ring-2 focus:ring-emerald-500 outline-none font-medium"
              value={newLoc.name}
              onChange={(e) => setNewLoc({ ...newLoc, name: e.target.value })}
            />
            <input
              placeholder="Postcode (Required, e.g. CR3 5ED)"
              className="px-6 py-4 rounded-2xl border-none focus:ring-2 focus:ring-emerald-500 outline-none font-medium uppercase"
              value={newLoc.address}
              onChange={(e) =>
                setNewLoc({ ...newLoc, address: e.target.value })
              }
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setIsAddingLoc(false)}
              className="px-6 py-3 text-stone-500 font-bold text-sm"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveLocation}
              className="px-8 py-3 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 transition-all"
            >
              Create Location
            </button>
          </div>
        </div>
      )}

      {/* LOCATIONS LIST */}
      <div className="grid grid-cols-1 gap-8">
        {locations.map((loc) => (
          <div
            key={loc.id}
            className="bg-white rounded-[48px] border border-stone-100 shadow-sm overflow-hidden"
          >
            <div className="p-8 border-b border-stone-50 bg-stone-50/30 flex justify-between items-start">
              <div className="flex-1">
                {editLocData?.id === loc.id ? (
                  <div className="space-y-3 max-w-md animate-in fade-in duration-200">
                    <input
                      className="w-full text-xl font-bold bg-white px-4 py-2 rounded-xl border-2 border-emerald-200 outline-none"
                      value={editLocData.name}
                      onChange={(e) =>
                        setEditLocData({ ...editLocData, name: e.target.value })
                      }
                    />
                    <input
                      className="w-full text-sm bg-white px-4 py-2 rounded-xl border-2 border-emerald-100 outline-none uppercase"
                      value={editLocData.address}
                      onChange={(e) =>
                        setEditLocData({
                          ...editLocData,
                          address: e.target.value,
                        })
                      }
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleUpdateLocation}
                        className="p-2 bg-emerald-500 text-white rounded-lg"
                      >
                        <Check size={16} />
                      </button>
                      <button
                        onClick={() => setEditLocData(null)}
                        className="p-2 bg-stone-200 text-stone-600 rounded-lg"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <h3 className="text-xl font-black text-stone-900 flex items-center gap-3">
                      <div className="p-2 bg-white rounded-xl shadow-sm">
                        <MapPin size={18} className="text-emerald-500" />
                      </div>
                      {loc.name}
                    </h3>
                    <p className="text-stone-400 text-sm mt-2 ml-11 font-bold">
                      {loc.address}
                    </p>
                  </>
                )}
              </div>

              {!editLocData && (
                <div className="flex gap-1">
                  <button
                    onClick={() =>
                      setEditLocData({
                        id: loc.id,
                        name: loc.name,
                        address: loc.address || "",
                      })
                    }
                    className="p-3 text-stone-300 hover:text-stone-900 transition-all"
                  >
                    <Edit3 size={18} />
                  </button>
                  <button
                    onClick={() => handleDelete("locations", loc.id)}
                    className="p-3 text-stone-300 hover:text-red-500 transition-all"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              )}
            </div>

            <div className="p-8">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {loc.areas.map((area) => (
                  <div
                    key={area.id}
                    className="group flex items-center justify-between p-4 bg-stone-50 rounded-3xl border border-transparent hover:border-stone-200 transition-all"
                  >
                    <div className="flex items-center gap-3 flex-1">
                      <div className="relative group/tooltip">
                        <button
                          onClick={() =>
                            handleUpdateArea(
                              area.id,
                              area.name,
                              !area.is_outside,
                            )
                          }
                          className={`p-2 rounded-xl transition-all hover:scale-110 ${area.is_outside ? "bg-orange-100 text-orange-600" : "bg-blue-100 text-blue-600"}`}
                        >
                          {area.is_outside ? (
                            <TreePine size={16} />
                          ) : (
                            <Home size={16} />
                          )}
                        </button>
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/tooltip:block bg-stone-800 text-white text-[10px] font-bold px-2 py-1 rounded shadow-lg whitespace-nowrap z-50">
                          {area.is_outside ? "Outside" : "Inside"} (Click to
                          toggle)
                        </div>
                      </div>

                      {editAreaData?.id === area.id ? (
                        <div className="flex items-center gap-1 flex-1">
                          <input
                            autoFocus
                            className="bg-white px-2 py-1 rounded-lg border border-emerald-300 text-sm font-bold w-full outline-none"
                            value={editAreaData.name}
                            onChange={(e) =>
                              setEditAreaData({
                                ...editAreaData,
                                name: e.target.value,
                              })
                            }
                          />
                          <button
                            onClick={() =>
                              handleUpdateArea(
                                area.id,
                                editAreaData.name,
                                area.is_outside,
                              )
                            }
                            className="text-emerald-500"
                          >
                            <Check size={14} />
                          </button>
                        </div>
                      ) : (
                        <span className="text-sm font-bold text-stone-700">
                          {area.name}
                        </span>
                      )}
                    </div>

                    {!editAreaData && (
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() =>
                            setEditAreaData({ id: area.id, name: area.name })
                          }
                          className="p-1 text-stone-300 hover:text-stone-600"
                        >
                          <Edit3 size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete("areas", area.id)}
                          className="p-1 text-stone-300 hover:text-red-500"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}

                {/* NEW AREA INLINE FORM */}
                {addingAreaToLoc === loc.id ? (
                  <div className="flex items-center gap-2 p-3 bg-emerald-50 rounded-3xl border border-emerald-200 animate-in slide-in-from-left-2">
                    <input
                      autoFocus
                      placeholder="Area name..."
                      className="bg-white px-3 py-1 rounded-xl text-sm font-bold w-full outline-none border-none"
                      value={newAreaName}
                      onChange={(e) => setNewAreaName(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === "Enter" && handleCreateArea(loc.id)
                      }
                    />
                    <button
                      onClick={() => handleCreateArea(loc.id)}
                      className="text-emerald-600 p-1"
                    >
                      <Check size={18} />
                    </button>
                    <button
                      onClick={() => setAddingAreaToLoc(null)}
                      className="text-stone-400 p-1"
                    >
                      <X size={18} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setAddingAreaToLoc(loc.id)}
                    className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-stone-100 rounded-3xl text-stone-400 hover:border-emerald-200 hover:text-emerald-600 transition-all"
                  >
                    <Plus size={16} />
                    <span className="text-xs font-black uppercase tracking-widest">
                      Add Area
                    </span>
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
